"""
F9 Pre-earnings strategy recommender (Elite).

Maps an earnings prediction into a one-line trading thesis + matching
options strategy from the existing F6 recommender. Heuristic:

    beat_prob >= 0.70  → Directional bullish:  Bull Call Spread (debit)
    beat_prob <= 0.30  → Directional bearish:  Bear Put Spread  (debit)
    0.30 < bp < 0.70   → Volatility-expansion: Long Straddle    (debit)

Each strategy is priced for the announcement week's expiry using the
existing Black-Scholes engine. Spot is a best-effort lookup; IV uses
current VIX plus a simple event-premium uplift.

Pro tier sees the thesis text only; Elite sees legs + pricing.
"""

from __future__ import annotations

import logging
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


EVENT_IV_UPLIFT = 1.25  # pre-earnings IV is typically 20-30% higher than baseline


@dataclass
class PreEarningsStrategy:
    thesis: str                      # one-line view
    direction: str                   # 'bullish' | 'bearish' | 'non_directional'
    strategy: Optional[str] = None   # matches F6 strategy key
    strategy_name: Optional[str] = None
    legs: Any = None                 # Elite-only
    max_profit: Optional[float] = None
    max_loss: Optional[float] = None
    breakevens: Any = field(default_factory=list)
    probability_of_profit: Optional[float] = None
    expiry: Optional[str] = None
    notes: Any = field(default_factory=list)


def _thesis_for(beat_prob: float) -> tuple[str, str, str]:
    if beat_prob >= 0.70:
        return (
            "bullish",
            "bull_call_spread",
            f"High beat-probability ({round(beat_prob * 100)}%). "
            f"Pre-earnings directional long — cap risk with a debit spread.",
        )
    if beat_prob <= 0.30:
        return (
            "bearish",
            "bear_put_spread",
            f"Low beat-probability ({round(beat_prob * 100)}%). "
            f"Pre-earnings directional short — bear put spread keeps the premium small.",
        )
    return (
        "non_directional",
        "long_straddle",
        f"Uncertain outcome ({round(beat_prob * 100)}% beat). "
        f"Buy the implied move — long straddle wins on either side if move > breakeven.",
    )


def _spot_for(symbol: str) -> float:
    try:
        from ...services.market_data import MarketData
        md = MarketData()
        q = md.get_quote(symbol)
        if q and q.ltp and q.ltp > 0:
            return float(q.ltp)
    except Exception as exc:
        logger.debug("spot lookup failed %s: %s", symbol, exc)
    return 0.0


def _current_vix() -> float:
    try:
        from ...core.database import get_supabase_admin
        sb = get_supabase_admin()
        rows = (
            sb.table("regime_history")
            .select("vix")
            .order("as_of", desc=True)
            .limit(1)
            .execute()
        )
        if rows.data and rows.data[0].get("vix"):
            return float(rows.data[0]["vix"])
    except Exception:
        pass
    return 15.0


def recommend_pre_earnings_strategy(
    symbol: str,
    announce_date: date,
    beat_prob: float,
    *,
    include_legs: bool = True,
) -> PreEarningsStrategy:
    """Build a pre-earnings strategy proposal.

    Parameters
    ----------
    include_legs : Pro tier passes ``False`` → thesis-only; Elite passes
                   ``True`` → priced legs via F6 engine.
    """
    direction, strategy_key, thesis = _thesis_for(beat_prob)
    out = PreEarningsStrategy(
        thesis=thesis,
        direction=direction,
        strategy=strategy_key,
        strategy_name={
            "bull_call_spread": "Bull Call Spread",
            "bear_put_spread":  "Bear Put Spread",
            "long_straddle":    "Long Straddle",
        }.get(strategy_key),
        notes=[],
    )
    if not include_legs:
        return out

    spot = _spot_for(symbol)
    if spot <= 0:
        out.notes.append("spot_unavailable — cannot price legs")
        return out

    try:
        from ..fo.strategies import price_strategy
    except Exception as exc:
        out.notes.append(f"fo_engine_unavailable: {exc}")
        return out

    # Pre-earnings IV uplift over current VIX.
    vix = _current_vix() * EVENT_IV_UPLIFT
    # Expiry = weekly after the announce date for indexes; for stocks
    # we don't have weeklies on every name — fall back to the announce
    # date itself as a monthly-expiry approximation.
    proposal = price_strategy(
        strategy_key, symbol=symbol, spot=spot, vix=vix, expiry=announce_date,
    )
    if proposal is None:
        out.notes.append("price_strategy_returned_none")
        return out

    out.legs = [asdict(l) for l in proposal.legs]
    out.max_profit = proposal.max_profit
    out.max_loss = proposal.max_loss
    out.breakevens = proposal.breakevens
    out.probability_of_profit = proposal.probability_of_profit
    out.expiry = proposal.expiry
    return out
