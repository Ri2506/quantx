"""
================================================================================
AI PORTFOLIO ROUTES — F5 AI SIP (PR 29)
================================================================================
HTTP surface for ``/ai-portfolio`` — the F5 Elite monthly-rebalanced
quality portfolio. Driven by ``src/backend/ai/portfolio/engine.py``
(PR 12): Qlib quality screen → Black-Litterman optimizer with AI
priors → 6-20 positions, 7% per-asset cap.

The actual rebalance upsert runs from APScheduler every last Sunday of
the month at 00:00 IST (``scheduler.ai_portfolio_monthly_rebalance``).
This router is read-first; the only mutation is toggling
``ai_portfolio_enabled`` so the scheduler knows to include the user.

Endpoints (all gated by ``RequireFeature("ai_sip")`` = Elite):

    GET  /api/ai-portfolio/status       — summary + next rebalance date
    GET  /api/ai-portfolio/holdings     — current allocation + drift
    POST /api/ai-portfolio/toggle       — enable / disable rebalance loop
    GET  /api/ai-portfolio/proposal     — latest computed proposal (cached)
    POST /api/ai-portfolio/rebalance/preview — on-demand recompute (dry-run)
================================================================================
"""

from __future__ import annotations

import calendar
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core.database import get_supabase_admin
from ..core.tiers import UserTier
from ..middleware.tier_gate import RequireFeature

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai-portfolio", tags=["ai-portfolio"])

IST = timezone(timedelta(hours=5, minutes=30))


# ============================================================================
# Pydantic models
# ============================================================================


class HoldingRow(BaseModel):
    symbol: str
    target_weight: float
    current_weight: Optional[float]
    qty: int
    last_rebalanced_at: Optional[str]
    drift_pct: Optional[float]  # (current - target) * 100
    sector: Optional[str] = None  # PR 72 — sector allocation roll-up


class PortfolioStatus(BaseModel):
    enabled: bool
    holdings_count: int
    last_rebalanced_at: Optional[str]
    next_rebalance_at: str
    top_position: Optional[Dict[str, Any]]
    notes: List[str]


class ToggleRequest(BaseModel):
    enabled: bool


class ProposalSummary(BaseModel):
    as_of: str
    n_candidates: int
    n_positions: int
    weights: Dict[str, float]
    forecasts_used: Dict[str, float]
    metrics: Dict[str, Any]
    notes: List[str] = Field(default_factory=list)


# ============================================================================
# Helpers
# ============================================================================


def _next_last_sunday_of_month(today: Optional[date] = None) -> datetime:
    """Next scheduler firing — last Sunday of this month at 00:00 IST,
    or next month's if already past."""
    today = today or datetime.now(IST).date()

    def last_sunday(year: int, month: int) -> date:
        last_day = calendar.monthrange(year, month)[1]
        d = date(year, month, last_day)
        return d - timedelta(days=(d.weekday() - 6) % 7)

    candidate = last_sunday(today.year, today.month)
    if candidate <= today:
        ny, nm = (today.year + 1, 1) if today.month == 12 else (today.year, today.month + 1)
        candidate = last_sunday(ny, nm)
    return datetime.combine(candidate, datetime.min.time()).replace(tzinfo=IST)


def _load_profile(user_id: str) -> Dict[str, Any]:
    sb = get_supabase_admin()
    rows = (
        sb.table("user_profiles")
        .select("id, tier, ai_portfolio_enabled")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not rows.data:
        raise HTTPException(status_code=404, detail="profile_not_found")
    return rows.data[0]


def _load_holdings(user_id: str) -> List[Dict[str, Any]]:
    sb = get_supabase_admin()
    try:
        rows = (
            sb.table("ai_portfolio_holdings")
            .select("symbol, target_weight, current_weight, qty, last_rebalanced_at")
            .eq("user_id", user_id)
            .order("target_weight", desc=True)
            .execute()
        )
        return rows.data or []
    except Exception as exc:
        logger.warning("ai_portfolio_holdings lookup failed user=%s: %s", user_id, exc)
        return []


def _sector_lookup(symbol: str) -> Optional[str]:
    """Lazy import — sector mapping lives in ``ai.sector``. Falls back to
    None on any failure so a missing mapping never breaks the page."""
    try:
        from ..ai.sector import sector_for_symbol
        return sector_for_symbol(symbol)
    except Exception:
        return None


def _to_holding_row(r: Dict[str, Any]) -> HoldingRow:
    tgt = float(r.get("target_weight") or 0.0)
    cur = r.get("current_weight")
    cur_f = float(cur) if cur is not None else None
    drift = round((cur_f - tgt) * 100, 2) if cur_f is not None else None
    sym = r.get("symbol") or ""
    return HoldingRow(
        symbol=sym,
        target_weight=round(tgt, 4),
        current_weight=round(cur_f, 4) if cur_f is not None else None,
        qty=int(r.get("qty") or 0),
        last_rebalanced_at=r.get("last_rebalanced_at"),
        drift_pct=drift,
        sector=_sector_lookup(sym),
    )


# ============================================================================
# Routes
# ============================================================================


@router.get("/status", response_model=PortfolioStatus)
async def get_status(
    user: UserTier = Depends(RequireFeature("ai_sip")),
) -> PortfolioStatus:
    profile = _load_profile(user.user_id)
    holdings = _load_holdings(user.user_id)

    last = None
    top: Optional[Dict[str, Any]] = None
    if holdings:
        last_vals = [h.get("last_rebalanced_at") for h in holdings if h.get("last_rebalanced_at")]
        last = max(last_vals) if last_vals else None
        biggest = max(holdings, key=lambda h: float(h.get("target_weight") or 0.0))
        top = {
            "symbol": biggest.get("symbol"),
            "target_weight": round(float(biggest.get("target_weight") or 0.0), 4),
        }

    notes: List[str] = []
    if not profile.get("ai_portfolio_enabled"):
        notes.append("ai_portfolio_disabled — enable to join the monthly rebalance loop")
    if not holdings:
        notes.append("no_holdings_yet — first rebalance will seed your portfolio")

    return PortfolioStatus(
        enabled=bool(profile.get("ai_portfolio_enabled", False)),
        holdings_count=len(holdings),
        last_rebalanced_at=str(last) if last else None,
        next_rebalance_at=_next_last_sunday_of_month().isoformat(),
        top_position=top,
        notes=notes,
    )


@router.get("/holdings", response_model=List[HoldingRow])
async def get_holdings(
    user: UserTier = Depends(RequireFeature("ai_sip")),
) -> List[HoldingRow]:
    rows = _load_holdings(user.user_id)
    return [_to_holding_row(r) for r in rows]


@router.post("/toggle")
async def toggle(
    body: ToggleRequest,
    user: UserTier = Depends(RequireFeature("ai_sip")),
) -> Dict[str, Any]:
    sb = get_supabase_admin()
    sb.table("user_profiles").update(
        {"ai_portfolio_enabled": bool(body.enabled)}
    ).eq("id", user.user_id).execute()
    logger.info("ai_portfolio.toggle user=%s enabled=%s", user.user_id, body.enabled)
    return {"enabled": bool(body.enabled), "ok": True}


@router.get("/proposal", response_model=ProposalSummary)
async def get_latest_proposal(
    user: UserTier = Depends(RequireFeature("ai_sip")),
) -> ProposalSummary:
    """Latest cached proposal — read from the holdings table which
    reflects the last successful scheduler run."""
    rows = _load_holdings(user.user_id)
    if not rows:
        raise HTTPException(status_code=404, detail="no_proposal_yet")
    weights = {r["symbol"]: float(r["target_weight"]) for r in rows}
    last = max(
        (r.get("last_rebalanced_at") for r in rows if r.get("last_rebalanced_at")),
        default=None,
    )
    top_sym = max(weights, key=weights.get) if weights else None
    return ProposalSummary(
        as_of=str(last) if last else "",
        n_candidates=len(weights),
        n_positions=len(weights),
        weights={k: round(v, 4) for k, v in weights.items()},
        forecasts_used={},
        metrics={
            "top_position": {
                "symbol": top_sym,
                "weight": round(weights[top_sym], 4) if top_sym else 0,
            }
            if top_sym else None,
        },
        notes=[],
    )


@router.post("/rebalance/preview", response_model=ProposalSummary)
async def preview_rebalance(
    user: UserTier = Depends(RequireFeature("ai_sip")),
) -> ProposalSummary:
    """On-demand dry-run: builds a fresh proposal with today's data but
    does NOT persist it. Use to inspect what the next rebalance will do
    before the scheduler fires."""
    try:
        from ..ai.portfolio.engine import get_portfolio_manager
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"engine_unavailable: {exc}")

    mgr = get_portfolio_manager()
    prop = mgr.build_proposal()
    return ProposalSummary(
        as_of=prop.as_of,
        n_candidates=len(prop.candidates),
        n_positions=len(prop.weights),
        weights={k: round(v, 4) for k, v in prop.weights.items()},
        forecasts_used={k: round(v, 4) for k, v in prop.forecasts_used.items()},
        metrics=prop.metrics,
        notes=prop.notes,
    )


__all__ = ["router"]
