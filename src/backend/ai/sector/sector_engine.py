"""
F10 Sector rotation engine.

11 canonical Nifty sectors. Per-sector momentum from nightly Qlib
ranks (``alpha_scores``). Rotation tag derived from cross-sectional
quartile comparison. Optional FII/DII context from ``NSEData``.

Pipeline:

    alpha_scores (yesterday's ranks)
        ⤥   map_to_canonical(symbol_raw_sector) → canonical
        ⤥   mean_normalized_rank per sector
        ⤥   cross-sectional quartile → rotating in/out/neutral
        ⤥   pick top-5 stocks per sector (highest rank)
    FII/DII total net flow (today) — applied uniformly as context

Writes one row per (canonical_sector, trade_date) to ``sector_scores``.
Re-running the same date is idempotent (PRIMARY KEY).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# The 11 canonical Nifty sectors we expose to users. Everything else
# in NSE_STOCK_INFO collapses into these buckets.
CANONICAL_SECTORS: List[str] = [
    "Banking",
    "IT",
    "Auto",
    "FMCG",
    "Pharma",
    "Metals",
    "Energy",
    "Financial Services",
    "Capital Goods",
    "Realty",
    "Consumer",
]


# Maps NSE_STOCK_INFO raw sector strings → canonical bucket.
RAW_TO_CANONICAL: Dict[str, str] = {
    "Banking":          "Banking",
    "PSU Bank":         "Banking",
    "Private Bank":     "Banking",
    "IT":               "IT",
    "Internet":         "IT",
    "Auto":             "Auto",
    "FMCG":             "FMCG",
    "Food Tech":        "FMCG",
    "Pharma":           "Pharma",
    "Healthcare":       "Pharma",
    "Metals":           "Metals",
    "Steel":            "Metals",
    "Mining":           "Metals",
    "Energy":           "Energy",
    "Power":            "Energy",
    "Gas":              "Energy",
    "NBFC":             "Financial Services",
    "Finance":          "Financial Services",
    "Insurance":        "Financial Services",
    "Broking":          "Financial Services",
    "Capital Goods":    "Capital Goods",
    "Infrastructure":   "Capital Goods",
    "Infra":            "Capital Goods",
    "Defence":          "Capital Goods",
    "Electricals":      "Capital Goods",
    "Electronics":      "Capital Goods",
    "Cement":           "Capital Goods",
    "Ports":            "Capital Goods",
    "Real Estate":      "Realty",
    "Consumer":         "Consumer",
    "Consumer Durables":"Consumer",
    "Paints":           "Consumer",
    "Chemicals":        "Consumer",
    "Retail":           "Consumer",
    "Textiles":         "Consumer",
    "Telecom":          "Consumer",
    "Aviation":         "Consumer",
    "Logistics":        "Consumer",
    "Travel":           "Consumer",
    "Pipes":            "Consumer",
    "Cables":           "Consumer",
    "Diversified":      "Consumer",
}


def map_to_canonical(raw: Optional[str]) -> Optional[str]:
    if not raw:
        return None
    return RAW_TO_CANONICAL.get(raw.strip())


# ---------------------------------------------------------------- lookup


def _load_stock_info() -> Dict[str, Dict[str, str]]:
    """NSE_STOCK_INFO lives in live_screener_engine — import lazily to
    avoid pulling pandas unless needed."""
    try:
        from ...services.live_screener_engine import NSE_STOCK_INFO
        return NSE_STOCK_INFO
    except Exception as exc:
        logger.warning("NSE_STOCK_INFO unavailable: %s", exc)
        return {}


def sector_for_symbol(symbol: str) -> Optional[str]:
    """Canonical sector for a symbol, or None if unmapped."""
    info = _load_stock_info().get(symbol.upper(), {})
    return map_to_canonical(info.get("sector"))


@dataclass
class SectorSnapshot:
    sector: str
    trade_date: str
    momentum_score: float        # 0..100, higher = stronger rank
    fii_flow_7d: Optional[float] = None
    dii_flow_7d: Optional[float] = None
    rotating: str = "neutral"    # 'in' | 'out' | 'neutral'
    top_stocks: List[str] = field(default_factory=list)
    constituent_count: int = 0
    mean_rank_norm: float = 0.0


# ---------------------------------------------------------------- compute


def _normalized_rank(rank: int, total: int) -> float:
    """Map rank-1 (best) to 1.0 and rank-N (worst) to 0.0."""
    if total <= 1:
        return 0.5
    return max(0.0, min(1.0, 1.0 - (rank - 1) / (total - 1)))


def _quartile_tag(score: float, all_scores: List[float]) -> str:
    if not all_scores:
        return "neutral"
    sorted_scores = sorted(all_scores)
    n = len(sorted_scores)
    q1 = sorted_scores[max(0, n // 4 - 1)]
    q3 = sorted_scores[min(n - 1, 3 * n // 4)]
    if score >= q3:
        return "in"
    if score <= q1:
        return "out"
    return "neutral"


def compute_and_store(
    *,
    trade_date: Optional[date] = None,
    supabase_client=None,
) -> List[SectorSnapshot]:
    """Compute per-sector snapshots from ``alpha_scores`` and persist.

    Returns the list of snapshots written. Empty if upstream data is
    missing. Never raises — logs and returns [].
    """
    if supabase_client is None:
        from ...core.database import get_supabase_admin
        supabase_client = get_supabase_admin()

    # 1. Pick the latest alpha_scores date <= requested.
    try:
        latest = (
            supabase_client.table("alpha_scores")
            .select("trade_date")
            .order("trade_date", desc=True)
            .limit(1)
            .execute()
        )
        if not latest.data:
            logger.info("sector_engine: no alpha_scores yet")
            return []
        td = trade_date or date.fromisoformat(str(latest.data[0]["trade_date"]))
    except Exception as exc:
        logger.error("sector_engine: alpha_scores lookup failed: %s", exc)
        return []

    # 2. Pull all symbols + ranks for that date.
    try:
        rows = (
            supabase_client.table("alpha_scores")
            .select("symbol, qlib_rank, qlib_score_raw")
            .eq("trade_date", td.isoformat())
            .order("qlib_rank")
            .limit(2000)
            .execute()
        )
        data = rows.data or []
    except Exception as exc:
        logger.error("sector_engine: rank pull failed: %s", exc)
        return []

    if not data:
        return []

    total = len(data)
    stock_info = _load_stock_info()

    # 3. Group by canonical sector.
    by_sector: Dict[str, List[Dict[str, Any]]] = {s: [] for s in CANONICAL_SECTORS}
    for r in data:
        sym = str(r.get("symbol") or "").upper().replace(".NS", "")
        raw_sector = stock_info.get(sym, {}).get("sector")
        canon = map_to_canonical(raw_sector)
        if canon is None:
            continue
        by_sector.setdefault(canon, []).append({
            "symbol": sym,
            "qlib_rank": int(r.get("qlib_rank") or total),
            "qlib_score_raw": float(r.get("qlib_score_raw") or 0.0),
        })

    # 4. Score each canonical sector.
    raw_scores: Dict[str, float] = {}
    meta: Dict[str, Dict[str, Any]] = {}
    for sector in CANONICAL_SECTORS:
        members = by_sector.get(sector, [])
        if not members:
            raw_scores[sector] = 0.0
            meta[sector] = {"count": 0, "mean_rank_norm": 0.0, "top": []}
            continue
        normalized = [_normalized_rank(m["qlib_rank"], total) for m in members]
        mean_rn = sum(normalized) / len(normalized)
        raw_scores[sector] = mean_rn
        # Top 5 stocks by raw score (descending).
        top = sorted(members, key=lambda m: m["qlib_score_raw"], reverse=True)[:5]
        meta[sector] = {
            "count": len(members),
            "mean_rank_norm": round(mean_rn, 4),
            "top": [m["symbol"] for m in top],
        }

    # 5. Cross-sectional tagging (only on sectors with data).
    populated = [s for s, ms in by_sector.items() if ms]
    populated_scores = [raw_scores[s] for s in populated]

    # 6. FII/DII context — single number per day.
    fii_net, dii_net = _safe_fii_dii()

    # 7. Assemble + persist.
    out: List[SectorSnapshot] = []
    payloads: List[Dict[str, Any]] = []
    for sector in CANONICAL_SECTORS:
        score = raw_scores.get(sector, 0.0)
        if meta[sector]["count"] == 0:
            tag = "neutral"
        else:
            tag = _quartile_tag(score, populated_scores)
        # 0..100 momentum score for display.
        momentum = round(score * 100.0, 2)
        snap = SectorSnapshot(
            sector=sector,
            trade_date=td.isoformat(),
            momentum_score=momentum,
            fii_flow_7d=fii_net,
            dii_flow_7d=dii_net,
            rotating=tag,
            top_stocks=meta[sector]["top"],
            constituent_count=meta[sector]["count"],
            mean_rank_norm=meta[sector]["mean_rank_norm"],
        )
        out.append(snap)
        payloads.append({
            "sector":        sector,
            "trade_date":    td.isoformat(),
            "momentum_score": momentum,
            "fii_flow_7d":   fii_net,
            "dii_flow_7d":   dii_net,
            "rotating":      tag,
            "top_stocks":    snap.top_stocks,
            "computed_at":   datetime.utcnow().isoformat(),
        })

    try:
        supabase_client.table("sector_scores").upsert(
            payloads, on_conflict="sector,trade_date",
        ).execute()
    except Exception as exc:
        logger.error("sector_scores upsert failed: %s", exc)

    return out


def _safe_fii_dii() -> Tuple[Optional[float], Optional[float]]:
    """Best-effort FII/DII net flow snapshot. NSE endpoint sometimes
    fails — return (None, None) on error."""
    try:
        from ...services.nse_data import NSEData
        flow = NSEData().get_fii_dii_activity() or {}
        return (
            float(flow.get("fii_net")) if flow.get("fii_net") is not None else None,
            float(flow.get("dii_net")) if flow.get("dii_net") is not None else None,
        )
    except Exception as exc:
        logger.debug("fii_dii lookup failed: %s", exc)
        return None, None


# ---------------------------------------------------------------- read


def load_latest_snapshot(
    *,
    supabase_client=None,
    trade_date: Optional[date] = None,
) -> List[SectorSnapshot]:
    """Read the most recent complete snapshot for display."""
    if supabase_client is None:
        from ...core.database import get_supabase_admin
        supabase_client = get_supabase_admin()

    try:
        if trade_date is None:
            latest = (
                supabase_client.table("sector_scores")
                .select("trade_date")
                .order("trade_date", desc=True)
                .limit(1)
                .execute()
            )
            if not latest.data:
                return []
            trade_date = date.fromisoformat(str(latest.data[0]["trade_date"]))

        rows = (
            supabase_client.table("sector_scores")
            .select("sector, trade_date, momentum_score, fii_flow_7d, dii_flow_7d, rotating, top_stocks")
            .eq("trade_date", trade_date.isoformat())
            .execute()
        )
        snaps: List[SectorSnapshot] = []
        for r in rows.data or []:
            snaps.append(SectorSnapshot(
                sector=r.get("sector"),
                trade_date=str(r.get("trade_date")),
                momentum_score=float(r.get("momentum_score") or 0.0),
                fii_flow_7d=r.get("fii_flow_7d"),
                dii_flow_7d=r.get("dii_flow_7d"),
                rotating=r.get("rotating") or "neutral",
                top_stocks=list(r.get("top_stocks") or []),
            ))
        # Canonical ordering.
        rank = {s: i for i, s in enumerate(CANONICAL_SECTORS)}
        snaps.sort(key=lambda s: rank.get(s.sector, 99))
        return snaps
    except Exception as exc:
        logger.error("load_latest_snapshot failed: %s", exc)
        return []
