"""
================================================================================
EARNINGS ROUTES — F9 Earnings predictor (PR 31)
================================================================================
HTTP surface for ``/earnings-calendar`` — upcoming announcements with
a beat-probability prediction per symbol, plus pre-earnings strategy
recommendations for Elite users.

Tier split (Step 1 §C4):
    * ``earnings_basic``    (Pro)   — calendar + beat probability + thesis text
    * ``earnings_strategy`` (Elite) — full strategy with priced legs

Endpoints:
    GET  /api/earnings/upcoming?days=14         — calendar list (Pro)
    GET  /api/earnings/symbol/{symbol}          — per-symbol detail (Pro)
    GET  /api/earnings/strategy/{symbol}        — full strategy (Elite)
    POST /api/earnings/predict/{symbol}?date=…  — on-demand recompute (Elite)
================================================================================
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..core.database import get_supabase_admin
from ..core.tiers import UserTier
from ..middleware.tier_gate import RequireFeature
from ..ai.earnings import (
    fetch_upcoming_earnings,
    predict_surprise,
    recommend_pre_earnings_strategy,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/earnings", tags=["earnings"])

IST = timezone(timedelta(hours=5, minutes=30))


# ============================================================================
# Pydantic
# ============================================================================


class UpcomingRow(BaseModel):
    symbol: str
    announce_date: str
    beat_prob: Optional[float]
    confidence: Optional[str]
    thesis: Optional[str]          # one-line direction label (Pro)
    direction: Optional[str]       # 'bullish' / 'bearish' / 'non_directional'
    evidence: Dict[str, Any] = {}


# ============================================================================
# Helpers
# ============================================================================


def _direction_and_thesis(beat_prob: Optional[float]) -> tuple[Optional[str], Optional[str]]:
    if beat_prob is None:
        return None, None
    if beat_prob >= 0.70:
        return "bullish", f"{round(beat_prob * 100)}% beat probability — directional long bias"
    if beat_prob <= 0.30:
        return "bearish", f"{round(beat_prob * 100)}% beat probability — directional short bias"
    return (
        "non_directional",
        f"{round(beat_prob * 100)}% beat — uncertain, volatility-expansion setup",
    )


# ============================================================================
# Routes
# ============================================================================


@router.get("/upcoming", response_model=List[UpcomingRow])
async def get_upcoming(
    days: int = Query(14, ge=1, le=60),
    user: UserTier = Depends(RequireFeature("earnings_basic")),
) -> List[UpcomingRow]:
    """Upcoming earnings in the next ``days`` window (Pro).

    Reads ``earnings_predictions`` table — the daily 17:00 IST scheduler
    job hydrates it. When the table is fresh, returns rows ordered by
    announce_date ascending.
    """
    rows = fetch_upcoming_earnings(days=days)
    out: List[UpcomingRow] = []
    for r in rows:
        direction, thesis = _direction_and_thesis(r.beat_prob)
        out.append(UpcomingRow(
            symbol=r.symbol,
            announce_date=r.announce_date,
            beat_prob=r.beat_prob,
            confidence=r.confidence,
            direction=direction,
            thesis=thesis,
            evidence=r.evidence,
        ))
    return out


@router.get("/symbol/{symbol}")
async def get_symbol_detail(
    symbol: str,
    user: UserTier = Depends(RequireFeature("earnings_basic")),
) -> Dict[str, Any]:
    """Per-symbol detail — DB first, falls back to live prediction if missing."""
    sb = get_supabase_admin()
    sym = symbol.upper()
    today = date.today()
    horizon = (today + timedelta(days=60)).isoformat()
    try:
        rows = (
            sb.table("earnings_predictions")
            .select("symbol, announce_date, beat_prob, confidence, evidence, computed_at")
            .eq("symbol", sym)
            .gte("announce_date", today.isoformat())
            .lte("announce_date", horizon)
            .order("announce_date", desc=False)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning("earnings detail DB read failed %s: %s", sym, exc)
        rows = None

    row = (rows.data or [None])[0] if rows else None
    if row is None:
        # PR 52 — no rule-based fallback. Try on-demand inference via the
        # trained model; if the model isn't ready, surface 503 so the UI
        # shows "coming soon".
        try:
            from ..ai.earnings.predictor import ModelNotReadyError
            from ..ai.earnings.calendar import bootstrap_universe_from_yfinance
            hits = bootstrap_universe_from_yfinance([sym], days=60)
            if not hits:
                raise HTTPException(status_code=404, detail="no_upcoming_earnings")
            _, announce = hits[0]
            pred = predict_surprise(sym, announce, supabase_client=sb)
            row = {
                "symbol": pred.symbol,
                "announce_date": pred.announce_date,
                "beat_prob": pred.beat_prob,
                "confidence": pred.confidence,
                "evidence": pred.evidence,
                "computed_at": datetime.utcnow().isoformat(),
            }
        except ModelNotReadyError as exc:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "model_not_ready",
                    "feature": "earnings_predictor",
                    "reason": str(exc),
                },
            )
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("earnings live prediction failed %s: %s", sym, exc)
            raise HTTPException(status_code=404, detail="no_upcoming_earnings")

    direction, thesis = _direction_and_thesis(
        float(row["beat_prob"]) if row.get("beat_prob") is not None else None,
    )
    return {
        **row,
        "direction": direction,
        "thesis": thesis,
    }


@router.get("/strategy/{symbol}")
async def get_strategy(
    symbol: str,
    user: UserTier = Depends(RequireFeature("earnings_strategy")),
) -> Dict[str, Any]:
    """Full pre-earnings strategy with priced legs (Elite)."""
    sb = get_supabase_admin()
    sym = symbol.upper()
    today = date.today()
    horizon = (today + timedelta(days=60)).isoformat()
    try:
        rows = (
            sb.table("earnings_predictions")
            .select("symbol, announce_date, beat_prob, confidence, evidence")
            .eq("symbol", sym)
            .gte("announce_date", today.isoformat())
            .lte("announce_date", horizon)
            .order("announce_date", desc=False)
            .limit(1)
            .execute()
        )
    except Exception:
        rows = None
    row = (rows.data or [None])[0] if rows else None
    if row is None or row.get("beat_prob") is None:
        raise HTTPException(status_code=404, detail="no_prediction_yet")

    announce = date.fromisoformat(str(row["announce_date"]))
    strat = recommend_pre_earnings_strategy(
        sym, announce, float(row["beat_prob"]), include_legs=True,
    )
    return {
        "symbol": sym,
        "announce_date": row["announce_date"],
        "beat_prob": row["beat_prob"],
        "confidence": row.get("confidence"),
        "evidence": row.get("evidence") or {},
        "strategy": asdict(strat),
    }


@router.post("/predict/{symbol}")
async def force_predict(
    symbol: str,
    announce_date: Optional[str] = Query(None, description="YYYY-MM-DD override"),
    user: UserTier = Depends(RequireFeature("earnings_strategy")),
) -> Dict[str, Any]:
    """Recompute prediction + persist. Elite-only — used from admin
    panel or by a user who wants fresh inputs."""
    sym = symbol.upper()
    if announce_date:
        try:
            ad = date.fromisoformat(announce_date)
        except ValueError:
            raise HTTPException(status_code=422, detail="invalid_date")
    else:
        from ..ai.earnings.calendar import bootstrap_universe_from_yfinance
        hits = bootstrap_universe_from_yfinance([sym], days=60)
        if not hits:
            raise HTTPException(status_code=404, detail="no_calendar_hit")
        _, ad = hits[0]

    sb = get_supabase_admin()
    try:
        pred = predict_surprise(sym, ad, supabase_client=sb)
    except Exception as exc:
        from ..ai.earnings.predictor import ModelNotReadyError
        if isinstance(exc, ModelNotReadyError):
            raise HTTPException(
                status_code=503,
                detail={
                    "error": "model_not_ready",
                    "feature": "earnings_predictor",
                    "reason": str(exc),
                },
            )
        raise
    try:
        sb.table("earnings_predictions").upsert({
            "symbol": pred.symbol,
            "announce_date": pred.announce_date,
            "beat_prob": pred.beat_prob,
            "confidence": pred.confidence,
            "evidence": pred.evidence,
            "computed_at": datetime.utcnow().isoformat(),
        }, on_conflict="symbol,announce_date").execute()
    except Exception as exc:
        logger.error("earnings_predictions upsert failed %s: %s", sym, exc)
    return {
        "symbol": pred.symbol,
        "announce_date": pred.announce_date,
        "beat_prob": pred.beat_prob,
        "confidence": pred.confidence,
        "evidence": pred.evidence,
    }


__all__ = ["router"]
