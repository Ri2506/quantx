"""
================================================================================
SECTOR ROTATION ROUTES — F10 (PR 32)
================================================================================
HTTP surface for ``/sector-rotation``. All gated by
``RequireFeature("sector_rotation") = Pro``.

Data is computed nightly (17:15 IST) by
``scheduler.sector_rotation_aggregate`` from the Qlib ``alpha_scores``
table + NSE FII/DII flow. This router is read-first — /refresh is an
Elite-only override that re-runs the compute on demand.

Endpoints:
    GET  /api/sector-rotation/overview            — 11 sectors snapshot
    GET  /api/sector-rotation/sector/{name}       — detail + top-stock ranks
    GET  /api/sector-rotation/flows               — FII/DII last 7d
    POST /api/sector-rotation/refresh             — on-demand recompute
================================================================================
"""

from __future__ import annotations

import logging
from dataclasses import asdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException

from ..core.database import get_supabase_admin
from ..core.tiers import Tier, UserTier
from ..middleware.tier_gate import RequireFeature, RequireTier
from ..ai.sector import (
    CANONICAL_SECTORS,
    SectorSnapshot,
    compute_and_store,
    load_latest_snapshot,
    sector_for_symbol,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sector-rotation", tags=["sector-rotation"])

IST = timezone(timedelta(hours=5, minutes=30))


# ============================================================================
# Helpers
# ============================================================================


def _snapshot_to_dict(s: SectorSnapshot) -> Dict[str, Any]:
    d = asdict(s)
    # momentum_score -> 0..100; already rounded in engine.
    return d


def _load_top_stock_scores(
    sector: str,
    trade_date: str,
    sb,
) -> List[Dict[str, Any]]:
    """For the sector-detail drawer — fetch the top-stock symbols with
    their full Qlib rank row, attached with a live MarketData quote when
    available. Falls back to bare top-stock symbols on any failure.
    """
    try:
        snap = (
            sb.table("sector_scores")
            .select("top_stocks")
            .eq("sector", sector)
            .eq("trade_date", trade_date)
            .limit(1)
            .execute()
        )
        if not snap.data or not snap.data[0].get("top_stocks"):
            return []
        symbols = list(snap.data[0]["top_stocks"])
    except Exception as exc:
        logger.warning("top_stocks lookup failed: %s", exc)
        return []

    if not symbols:
        return []

    try:
        rows = (
            sb.table("alpha_scores")
            .select("symbol, qlib_rank, qlib_score_raw, quality_score")
            .eq("trade_date", trade_date)
            .in_("symbol", symbols)
            .execute()
        )
        by_sym = {r["symbol"]: r for r in (rows.data or [])}
    except Exception:
        by_sym = {}

    # Preserve the top-stocks ordering (highest raw score first).
    out: List[Dict[str, Any]] = []
    for sym in symbols:
        r = by_sym.get(sym, {})
        out.append({
            "symbol": sym,
            "qlib_rank": r.get("qlib_rank"),
            "qlib_score_raw": r.get("qlib_score_raw"),
            "quality_score": r.get("quality_score"),
        })
    return out


# ============================================================================
# Routes
# ============================================================================


@router.get("/overview")
async def get_overview(
    user: UserTier = Depends(RequireFeature("sector_rotation")),
) -> Dict[str, Any]:
    sb = get_supabase_admin()
    snaps = load_latest_snapshot(supabase_client=sb)
    if not snaps:
        return {
            "as_of": None,
            "trade_date": None,
            "sectors": [],
            "canonical_order": CANONICAL_SECTORS,
            "counts": {"in": 0, "out": 0, "neutral": 0},
            "note": "awaiting_first_run — sector_rotation_aggregate scheduler job runs daily at 17:15 IST",
        }
    counts = {
        "in": sum(1 for s in snaps if s.rotating == "in"),
        "out": sum(1 for s in snaps if s.rotating == "out"),
        "neutral": sum(1 for s in snaps if s.rotating == "neutral"),
    }
    return {
        "as_of": datetime.now(IST).isoformat(),
        "trade_date": snaps[0].trade_date,
        "sectors": [_snapshot_to_dict(s) for s in snaps],
        "canonical_order": CANONICAL_SECTORS,
        "counts": counts,
    }


@router.get("/sector/{name}")
async def get_sector_detail(
    name: str,
    user: UserTier = Depends(RequireFeature("sector_rotation")),
) -> Dict[str, Any]:
    # Accept both "banking" and "Banking"
    target = next((s for s in CANONICAL_SECTORS if s.lower() == name.lower()), None)
    if target is None:
        raise HTTPException(status_code=404, detail="unknown_sector")
    sb = get_supabase_admin()
    snaps = load_latest_snapshot(supabase_client=sb)
    if not snaps:
        raise HTTPException(status_code=404, detail="no_snapshot_yet")
    snap = next((s for s in snaps if s.sector == target), None)
    if snap is None:
        raise HTTPException(status_code=404, detail="sector_not_in_snapshot")
    top_scored = _load_top_stock_scores(target, snap.trade_date, sb)
    return {
        "sector": target,
        "trade_date": snap.trade_date,
        "snapshot": _snapshot_to_dict(snap),
        "top_stocks": top_scored,
    }


@router.get("/flows")
async def get_flows(
    days: int = 7,
    user: UserTier = Depends(RequireFeature("sector_rotation")),
) -> Dict[str, Any]:
    """Recent sector_scores rows joined into daily FII/DII timeseries.
    ``sector_scores`` writes the single NSE-wide FII+DII snapshot on
    every sector row — we dedupe by date for the chart."""
    days = max(1, min(60, int(days)))
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    sb = get_supabase_admin()
    try:
        rows = (
            sb.table("sector_scores")
            .select("trade_date, fii_flow_7d, dii_flow_7d")
            .gte("trade_date", cutoff)
            .order("trade_date", desc=False)
            .execute()
        )
        seen: Dict[str, Dict[str, Any]] = {}
        for r in rows.data or []:
            td = str(r.get("trade_date"))
            if td in seen:
                continue
            seen[td] = {
                "trade_date": td,
                "fii_net": r.get("fii_flow_7d"),
                "dii_net": r.get("dii_flow_7d"),
            }
        series = list(seen.values())
        return {"days": days, "series": series}
    except Exception as exc:
        logger.warning("flows query failed: %s", exc)
        return {"days": days, "series": []}


@router.post("/refresh")
async def force_refresh(
    user: UserTier = Depends(RequireTier(Tier.ELITE)),
) -> Dict[str, Any]:
    """Elite-only — re-run the aggregate without waiting for the 17:15
    scheduler. Useful for admin spot-checks; safe/idempotent."""
    sb = get_supabase_admin()
    snaps = compute_and_store(supabase_client=sb)
    return {
        "trade_date": snaps[0].trade_date if snaps else None,
        "n_sectors_written": len(snaps),
    }


__all__ = ["router"]
