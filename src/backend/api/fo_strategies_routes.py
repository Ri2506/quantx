"""
================================================================================
F&O STRATEGIES ROUTES — F6 Elite (PR 30)
================================================================================
HTTP surface for ``/fo-strategies`` — weekly options strategy
recommendations for index underliers. The AI inputs:

    - Latest VIX TFT forecast  (``vix_forecasts`` table, horizon_days=5)
    - Current HMM market regime (``regime_history`` latest row)
    - Current spot price       (market_data / yfinance fallback)

The recommender (``src/backend/ai/fo/strategies.py``) turns those into
1-2 ranked strategy proposals per symbol, each with priced legs + BS
Greeks + max-profit / max-loss / breakevens / probability of profit.

Endpoints (all gated by ``RequireFeature("fo_strategies")`` = Elite):

    GET  /api/fo-strategies/overview               — recs + VIX + regime
    GET  /api/fo-strategies/recommend/{symbol}     — single-symbol ranked list
    POST /api/fo-strategies/price                  — price a specific strategy
================================================================================
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core.database import get_supabase_admin
from ..core.tiers import UserTier
from ..middleware.tier_gate import RequireFeature
from ..ai.fo import recommend_strategies, price_strategy, StrategyProposal

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/fo-strategies", tags=["fo-strategies"])

SUPPORTED_SYMBOLS = ["NIFTY", "BANKNIFTY", "FINNIFTY"]
IST = timezone(timedelta(hours=5, minutes=30))


# ============================================================================
# Pydantic
# ============================================================================


class PriceRequest(BaseModel):
    strategy: str = Field(..., description="iron_condor / bull_call_spread / bear_put_spread / long_straddle / short_strangle / iron_butterfly")
    symbol: str = Field("NIFTY")
    expiry: Optional[str] = Field(None, description="YYYY-MM-DD; defaults to next weekly")


# ============================================================================
# helpers
# ============================================================================


def _load_latest_vix_forecast() -> Dict[str, Any]:
    """Latest TFT VIX forecast. Returns {} if unavailable."""
    sb = get_supabase_admin()
    try:
        rows = (
            sb.table("vix_forecasts")
            .select("trade_date, horizon_days, tft_p10, tft_p50, tft_p90, direction, computed_at")
            .eq("horizon_days", 5)
            .order("trade_date", desc=True)
            .limit(1)
            .execute()
        )
        if rows.data:
            return rows.data[0]
    except Exception as exc:
        logger.debug("vix_forecasts lookup failed: %s", exc)
    return {}


def _load_latest_regime() -> Dict[str, Any]:
    sb = get_supabase_admin()
    try:
        rows = (
            sb.table("regime_history")
            .select("regime, prob_bull, prob_sideways, prob_bear, vix, nifty_close, as_of")
            .order("as_of", desc=True)
            .limit(1)
            .execute()
        )
        if rows.data:
            return rows.data[0]
    except Exception as exc:
        logger.debug("regime_history lookup failed: %s", exc)
    return {}


def _spot_for(symbol: str, regime_row: Dict[str, Any]) -> float:
    """Best-effort spot. For NIFTY use regime_history.nifty_close as
    fallback; for others try MarketData. Returns 0 if unknown — caller
    must handle."""
    try:
        from ..services.market_data import MarketData
        md = MarketData()
        q = md.get_quote(symbol)
        if q and q.ltp and q.ltp > 0:
            return float(q.ltp)
    except Exception as exc:
        logger.debug("spot lookup failed for %s: %s", symbol, exc)
    if symbol.upper() == "NIFTY" and regime_row.get("nifty_close"):
        return float(regime_row["nifty_close"])
    # Reasonable defaults to avoid zero-divide in BS. Mirrors prices
    # around the time of this PR — only kicks in when live feed is out.
    return {"NIFTY": 22850.0, "BANKNIFTY": 48200.0, "FINNIFTY": 20400.0}.get(symbol.upper(), 1000.0)


def _proposal_to_dict(p: StrategyProposal) -> Dict[str, Any]:
    d = asdict(p)
    # dataclasses serialize legs via asdict too — fine.
    return d


def _pick_vix_direction(fc: Dict[str, Any], current_vix: Optional[float]) -> tuple[str, Optional[float]]:
    """Translate TFT forecast into rising/falling/stable and return
    forecast point estimate too."""
    if not fc:
        return "stable", None
    try:
        p50 = float(fc.get("tft_p50")) if fc.get("tft_p50") is not None else None
    except (TypeError, ValueError):
        p50 = None
    direction = (fc.get("direction") or "").lower()
    if direction in {"rising", "falling", "stable"}:
        return direction, p50
    # Derive from p50 vs current_vix.
    if p50 is None or current_vix is None:
        return "stable", p50
    delta = p50 - current_vix
    if delta > 1.0:
        return "rising", p50
    if delta < -1.0:
        return "falling", p50
    return "stable", p50


# ============================================================================
# routes
# ============================================================================


@router.get("/overview")
async def get_overview(
    user: UserTier = Depends(RequireFeature("fo_strategies")),
) -> Dict[str, Any]:
    """Primary page payload: VIX + regime + per-symbol recommendations."""
    fc = _load_latest_vix_forecast()
    regime_row = _load_latest_regime()
    regime = (regime_row.get("regime") or "sideways").lower()
    current_vix = regime_row.get("vix")
    direction, p50 = _pick_vix_direction(fc, current_vix)

    recs: Dict[str, List[Dict[str, Any]]] = {}
    for sym in SUPPORTED_SYMBOLS:
        spot = _spot_for(sym, regime_row)
        try:
            props = recommend_strategies(
                symbol=sym, spot=spot,
                vix=current_vix if current_vix is not None else (p50 or 15.0),
                vix_direction=direction, regime=regime,
            )
        except Exception as exc:
            logger.exception("recommend_strategies failed for %s: %s", sym, exc)
            props = []
        recs[sym] = [_proposal_to_dict(p) for p in props]

    return {
        "as_of": datetime.now(IST).isoformat(),
        "regime": {
            "name": regime,
            "prob_bull": regime_row.get("prob_bull"),
            "prob_sideways": regime_row.get("prob_sideways"),
            "prob_bear": regime_row.get("prob_bear"),
        } if regime_row else None,
        "vix": {
            "current": current_vix,
            "forecast_p50_5d": p50,
            "direction": direction,
            "p10": fc.get("tft_p10") if fc else None,
            "p90": fc.get("tft_p90") if fc else None,
            "forecast_date": fc.get("trade_date") if fc else None,
        },
        "symbols": SUPPORTED_SYMBOLS,
        "recommendations": recs,
    }


@router.get("/recommend/{symbol}")
async def recommend(
    symbol: str,
    user: UserTier = Depends(RequireFeature("fo_strategies")),
) -> Dict[str, Any]:
    sym = symbol.upper()
    if sym not in SUPPORTED_SYMBOLS:
        raise HTTPException(status_code=400, detail="unsupported_symbol")
    fc = _load_latest_vix_forecast()
    regime_row = _load_latest_regime()
    regime = (regime_row.get("regime") or "sideways").lower()
    current_vix = regime_row.get("vix")
    direction, p50 = _pick_vix_direction(fc, current_vix)
    spot = _spot_for(sym, regime_row)
    props = recommend_strategies(
        symbol=sym, spot=spot,
        vix=current_vix if current_vix is not None else (p50 or 15.0),
        vix_direction=direction, regime=regime,
    )
    return {
        "symbol": sym,
        "spot": round(spot, 2),
        "regime": regime,
        "vix_direction": direction,
        "vix_level": current_vix,
        "recommendations": [_proposal_to_dict(p) for p in props],
    }


@router.post("/price")
async def price(
    body: PriceRequest,
    user: UserTier = Depends(RequireFeature("fo_strategies")),
) -> Dict[str, Any]:
    sym = body.symbol.upper()
    regime_row = _load_latest_regime()
    current_vix = regime_row.get("vix") or 15.0
    expiry = None
    if body.expiry:
        try:
            expiry = date.fromisoformat(body.expiry)
        except ValueError:
            raise HTTPException(status_code=422, detail="invalid_expiry")
    spot = _spot_for(sym, regime_row)
    prop = price_strategy(
        body.strategy, symbol=sym, spot=spot, vix=float(current_vix), expiry=expiry,
    )
    if prop is None:
        raise HTTPException(status_code=400, detail="unknown_strategy")
    return _proposal_to_dict(prop)


__all__ = ["router"]
