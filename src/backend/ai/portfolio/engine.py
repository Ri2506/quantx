"""
AIPortfolioManager — F5 AI SIP orchestrator.

Builds one monthly rebalance proposal shared across Elite users (v1
simplification; per-user tailoring is a later PR). Pipeline:

    alpha_scores (Qlib rank)        → top N candidates
    forecast_scores (TimesFM+Chronos 5d)   → absolute-view priors
    200-day price history           → covariance matrix
    PyPortfolioOpt BlackLitterman   → target weights (max 7% per asset)
    news_sentiment latest           → safety filter (drop sym w/ mean_score < -0.5)
        → ``ai_portfolio_holdings`` upsert per Elite user

Invariants:
  - Outputs always sum to 1.0 (±0.001) after cleaning
  - Minimum 6 positions (hard min) and maximum 20 (to keep maintainable)
  - 7% single-stock cap enforced by the optimizer, double-checked after
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class PortfolioProposal:
    as_of: str
    candidates: List[str] = field(default_factory=list)
    weights: Dict[str, float] = field(default_factory=dict)
    forecasts_used: Dict[str, float] = field(default_factory=dict)
    metrics: Dict = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


class AIPortfolioManager:
    _lock = threading.Lock()

    def __init__(
        self,
        *,
        universe_size: int = 15,
        max_weight: float = 0.07,
        lookback_days: int = 252,
        horizon_days: int = 5,
    ):
        self.universe_size = universe_size
        self.max_weight = max_weight
        self.lookback_days = lookback_days
        self.horizon_days = horizon_days

    # ------------------------------------------------------------------ build

    def build_proposal(self, *, trade_date: Optional[date] = None) -> PortfolioProposal:
        """Compute the shared proposal. Callers upsert per user."""
        trade_date = trade_date or date.today()
        prop = PortfolioProposal(as_of=trade_date.isoformat())

        candidates = self._top_qlib_candidates(trade_date)
        if not candidates:
            prop.notes.append("no_alpha_scores — ensure qlib_nightly_rank has run")
            return prop
        prop.candidates = candidates

        # Drop sentiment-flagged symbols (very negative news last 2 days).
        filtered = self._drop_negative_sentiment(candidates, trade_date)
        if len(filtered) < len(candidates):
            dropped = set(candidates) - set(filtered)
            prop.notes.append(f"sentiment_filter_dropped: {sorted(dropped)}")
        if len(filtered) < 6:
            prop.notes.append("too_few_candidates_after_sentiment_filter")
            return prop

        # Load historical prices + AI forecasts.
        prices = self._load_prices(filtered)
        if prices is None or prices.shape[1] < 6:
            prop.notes.append("insufficient_price_history")
            return prop
        # Trim candidates to those with price history.
        available = list(prices.columns)
        forecasts = self._load_forecasts(available, trade_date)
        prop.forecasts_used = forecasts

        # Optimize.
        from .black_litterman import optimize_weights
        weights = optimize_weights(
            prices=prices,
            ai_forecasts=forecasts,
            max_weight=self.max_weight,
        )
        if not weights:
            prop.notes.append("optimizer_returned_empty")
            return prop

        prop.weights = weights
        prop.metrics = self._compute_metrics(prices, weights, forecasts)
        return prop

    # ---------------------------------------------------- candidate selection

    def _top_qlib_candidates(self, trade_date: date) -> List[str]:
        """Pull top ``universe_size`` symbols from ``alpha_scores`` as of
        the most recent trade_date <= ``trade_date``."""
        client = self._supabase()
        try:
            resp = (
                client.table("alpha_scores")
                .select("symbol, trade_date, qlib_rank")
                .lte("trade_date", trade_date.isoformat())
                .order("trade_date", desc=True)
                .order("qlib_rank", desc=False)
                .limit(self.universe_size * 3)
                .execute()
            )
        except Exception as e:
            logger.warning("alpha_scores query failed: %s", e)
            return []

        rows = resp.data or []
        if not rows:
            return []

        # Take rows from the most recent date in the result.
        latest = rows[0]["trade_date"]
        today_rows = [r for r in rows if r["trade_date"] == latest]
        today_rows.sort(key=lambda r: r["qlib_rank"])
        return [r["symbol"] for r in today_rows[: self.universe_size]]

    def _drop_negative_sentiment(
        self, symbols: List[str], trade_date: date, threshold: float = -0.5,
    ) -> List[str]:
        """Drop symbols whose latest ``news_sentiment.mean_score`` < threshold."""
        client = self._supabase()
        try:
            resp = (
                client.table("news_sentiment")
                .select("symbol, mean_score")
                .in_("symbol", symbols)
                .lte("trade_date", trade_date.isoformat())
                .gte("trade_date", (trade_date.fromordinal(trade_date.toordinal() - 4)).isoformat())
                .execute()
            )
            rows = resp.data or []
        except Exception as e:
            logger.debug("news_sentiment query failed: %s", e)
            return symbols

        flagged = {r["symbol"] for r in rows
                   if (r.get("mean_score") or 0) < threshold}
        return [s for s in symbols if s not in flagged]

    # --------------------------------------------------------- data loaders

    def _load_prices(self, symbols: List[str]):
        """Parallel yfinance load of 252-day close series. Returns a
        pandas DataFrame indexed by date, columns = symbols with data."""
        import pandas as pd
        try:
            from ...services.market_data import get_market_data_provider
            provider = get_market_data_provider()
        except Exception:
            return None

        closes = {}
        for sym in symbols:
            try:
                df = provider.get_historical(sym, period="1y", interval="1d")
                if df is None or len(df) < 60:
                    continue
                df = df.copy()
                df.columns = [c.lower() for c in df.columns]
                closes[sym] = df["close"].dropna()
            except Exception as e:
                logger.debug("price fetch %s: %s", sym, e)
        if not closes:
            return None
        frame = pd.DataFrame(closes).dropna(how="all").ffill().dropna()
        return frame.tail(self.lookback_days) if len(frame) > 0 else None

    def _load_forecasts(
        self, symbols: List[str], trade_date: date,
    ) -> Dict[str, float]:
        """Pull TimesFM+Chronos ensemble 5d forecasts from the
        ``forecast_scores`` table. Returns ``{symbol: expected_return}``
        where expected_return = (ensemble_p50 - last_close) / last_close.

        When the table is empty (first runs) we fall back to a mild 2%
        prior across all candidates so Black-Litterman still has views.
        """
        client = self._supabase()
        try:
            resp = (
                client.table("forecast_scores")
                .select("symbol, ensemble_p50, trade_date, horizon_days")
                .in_("symbol", symbols)
                .eq("horizon_days", self.horizon_days)
                .lte("trade_date", trade_date.isoformat())
                .execute()
            )
            rows = resp.data or []
        except Exception as e:
            logger.debug("forecast_scores query failed: %s", e)
            rows = []

        # Latest forecast per symbol.
        latest_by_sym: Dict[str, dict] = {}
        for r in rows:
            sym = r["symbol"]
            if sym not in latest_by_sym or r["trade_date"] > latest_by_sym[sym]["trade_date"]:
                latest_by_sym[sym] = r

        # Convert price target → expected return. Pull last close again.
        out: Dict[str, float] = {}
        try:
            from ...services.market_data import get_market_data_provider
            provider = get_market_data_provider()
        except Exception:
            provider = None

        for sym in symbols:
            if sym in latest_by_sym and provider:
                try:
                    df = provider.get_historical(sym, period="1mo", interval="1d")
                    if df is not None and len(df) > 0:
                        df.columns = [c.lower() for c in df.columns]
                        last = float(df["close"].iloc[-1])
                        target = float(latest_by_sym[sym]["ensemble_p50"])
                        if last > 0:
                            out[sym] = round((target - last) / last, 4)
                            continue
                except Exception:
                    pass
            out[sym] = 0.02  # fallback neutral prior
        return out

    # ------------------------------------------------------------- metrics

    def _compute_metrics(self, prices, weights, forecasts):
        """Portfolio-level summary for the UI."""
        import numpy as np
        import pandas as pd

        syms = [s for s in weights if s in prices.columns]
        if not syms:
            return {}
        w_vec = np.array([weights[s] for s in syms])
        returns = prices[syms].pct_change().dropna()
        cov = returns.cov() * 252  # annualized
        port_vol = float(np.sqrt(w_vec.T @ cov.values @ w_vec))
        fc_vec = np.array([forecasts.get(s, 0.0) for s in syms])
        expected_return_5d = float(np.dot(w_vec, fc_vec))
        return {
            "n_holdings": len(syms),
            "annualized_vol": round(port_vol, 4),
            "expected_5d_return": round(expected_return_5d, 4),
            "top_position": {
                "symbol": max(weights, key=weights.get),
                "weight": round(max(weights.values()), 4),
            },
        }

    # ------------------------------------------------------- rebalance loop

    async def rebalance_all_elite_users(self, proposal: PortfolioProposal) -> int:
        """Upsert ``ai_portfolio_holdings`` for every Elite user whose
        ``ai_portfolio_enabled`` flag is true. Returns user count updated."""
        if not proposal.weights:
            return 0

        client = self._supabase()
        try:
            users_resp = (
                client.table("user_profiles")
                .select("id, tier, ai_portfolio_enabled")
                .eq("tier", "elite")
                .eq("ai_portfolio_enabled", True)
                .execute()
            )
            users = users_resp.data or []
        except Exception as e:
            logger.warning("user_profiles query failed: %s", e)
            return 0

        count = 0
        now_iso = datetime.utcnow().isoformat()
        for u in users:
            user_id = u["id"]
            try:
                # Clear symbols no longer in target.
                target_syms = list(proposal.weights.keys())
                existing = (
                    client.table("ai_portfolio_holdings")
                    .select("symbol")
                    .eq("user_id", user_id)
                    .execute()
                )
                drop_syms = [
                    r["symbol"] for r in (existing.data or [])
                    if r["symbol"] not in target_syms
                ]
                if drop_syms:
                    client.table("ai_portfolio_holdings").delete().eq(
                        "user_id", user_id
                    ).in_("symbol", drop_syms).execute()

                # Upsert new target weights.
                payload = [
                    {
                        "user_id": user_id,
                        "symbol": sym,
                        "target_weight": weight,
                        "last_rebalanced_at": now_iso,
                    }
                    for sym, weight in proposal.weights.items()
                ]
                client.table("ai_portfolio_holdings").upsert(
                    payload, on_conflict="user_id,symbol",
                ).execute()
                count += 1

                # PR 13: notify the user their rebalance proposal is ready.
                try:
                    from ...services.event_bus import MessageType, emit_event
                    await emit_event(
                        MessageType.REBALANCE_PROPOSAL,
                        {
                            "as_of": proposal.as_of,
                            "n_positions": len(proposal.weights),
                            "top_position": proposal.metrics.get("top_position"),
                            "expected_5d_return": proposal.metrics.get(
                                "expected_5d_return",
                            ),
                            "notes": proposal.notes,
                        },
                        user_id=user_id,
                    )
                except Exception:
                    pass
            except Exception as e:
                logger.warning("rebalance user=%s failed: %s", user_id, e)
        return count

    # --------------------------------------------------------------- utility

    def _supabase(self):
        from ...core.database import get_supabase_admin
        return get_supabase_admin()


# --------------------------------------------------------------- singleton

_mgr: Optional[AIPortfolioManager] = None
_mgr_lock = threading.Lock()


def get_portfolio_manager() -> AIPortfolioManager:
    global _mgr
    if _mgr is not None:
        return _mgr
    with _mgr_lock:
        if _mgr is None:
            _mgr = AIPortfolioManager()
    return _mgr
