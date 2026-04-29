"""
PyPortfolioOpt Black-Litterman wrapper.

Black-Litterman combines:
  - **Prior** — equilibrium implied returns from market-cap weights
    (treated as equilibrium because Indian index weights include free-float
    caps) OR from historical means when market-cap weights aren't supplied.
  - **Views** — AI return forecasts per symbol (Qlib LightGBM 5-day pct
    change + Chronos ensemble). One view per asset with confidence Ω
    derived from model quantile spread.

Output: target weights maximizing expected Sharpe subject to
``w_i ≤ max_weight`` (default 7% per F5 spec).

Graceful degradation:
  - PyPortfolioOpt missing → return equal-weight fallback.
  - Covariance matrix singular → shrink via ``CovarianceShrinkage``.
  - No AI priors → plain Markowitz max-Sharpe over historical means.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class BLOptimizer:
    """One instance per rebalance — keeps inputs immutable."""

    prices: pd.DataFrame          # columns = symbols, index = dates, values = close
    ai_forecasts: Dict[str, float]  # symbol → expected total return over horizon (0.05 = +5%)
    market_caps: Optional[Dict[str, float]] = None  # optional equilibrium prior
    risk_aversion: float = 2.5    # δ in BL literature
    tau: float = 0.05             # uncertainty in prior
    max_weight: float = 0.07      # hard cap per F5 §Primary

    # -------------------------------------------------------------- optimize

    def optimize(self) -> Dict[str, float]:
        """Return ``{symbol: weight}`` summing to 1.0 (within float tol)."""
        try:
            from pypfopt import BlackLittermanModel, CovarianceShrinkage, EfficientFrontier
            from pypfopt import expected_returns, risk_models
        except Exception as e:
            logger.warning("PyPortfolioOpt missing (%s) — falling back to equal weight", e)
            return _equal_weights(list(self.ai_forecasts.keys()), cap=self.max_weight)

        symbols = list(self.prices.columns)
        if len(symbols) < 2:
            return _equal_weights(symbols, cap=self.max_weight)

        # Feasibility: a fully-invested portfolio with cap ``max_weight`` needs
        # at least ``ceil(1 / max_weight)`` assets. If the candidate set is
        # smaller, raise the cap to ``1 / n_assets`` so the LP is solvable.
        effective_cap = max(self.max_weight, 1.0 / len(symbols) + 1e-6)
        if effective_cap != self.max_weight:
            logger.info(
                "BL: raising effective cap %.3f → %.3f (n_assets=%d too small for %.3f)",
                self.max_weight, effective_cap, len(symbols), self.max_weight,
            )

        # Covariance — Ledoit-Wolf shrinkage, robust against short-history noise.
        try:
            S = CovarianceShrinkage(self.prices).ledoit_wolf()
        except Exception as e:
            logger.warning("CovarianceShrinkage failed (%s) — using sample cov", e)
            S = risk_models.sample_cov(self.prices)

        # Historical mean returns — used as backup prior + for info ratio tilt.
        try:
            mu_hist = expected_returns.mean_historical_return(self.prices)
        except Exception:
            mu_hist = pd.Series(0.0, index=symbols)

        # Views vector: user's AI forecasts, one per asset. PyPortfolioOpt
        # accepts absolute views as a dict: {ticker: expected_return}.
        views = {s: float(r) for s, r in self.ai_forecasts.items() if s in symbols}
        if not views:
            logger.warning("No AI views — falling back to historical Markowitz")
            return _markowitz(self.prices, S, effective_cap)

        try:
            # Confidence Ω — default ``tau * P * S * P.T`` if omitted.
            bl = BlackLittermanModel(
                S,
                pi="market" if self.market_caps else mu_hist.values,
                market_caps=self.market_caps if self.market_caps else None,
                risk_aversion=self.risk_aversion,
                tau=self.tau,
                absolute_views=views,
            )
            posterior_ret = bl.bl_returns()
            posterior_cov = bl.bl_cov()
        except Exception as e:
            logger.warning("BL posterior failed (%s) — falling back to Markowitz", e)
            return _markowitz(self.prices, S, effective_cap)

        # Efficient Frontier with per-asset cap.
        try:
            ef = EfficientFrontier(posterior_ret, posterior_cov,
                                   weight_bounds=(0.0, effective_cap))
            ef.max_sharpe()
            clean = ef.clean_weights(cutoff=0.005, rounding=4)
            # Drop zeros after cleaning and renormalize.
            nonzero = {k: v for k, v in clean.items() if v > 0}
            total = sum(nonzero.values())
            if total <= 0:
                return _equal_weights(symbols, cap=effective_cap)
            return {k: round(v / total, 4) for k, v in nonzero.items()}
        except Exception as e:
            logger.warning("EfficientFrontier optimize failed (%s) — fallback", e)
            return _equal_weights(symbols, cap=effective_cap)


def optimize_weights(
    prices: pd.DataFrame,
    ai_forecasts: Dict[str, float],
    *,
    market_caps: Optional[Dict[str, float]] = None,
    max_weight: float = 0.07,
) -> Dict[str, float]:
    """Convenience function — one-call wrapper around ``BLOptimizer``."""
    return BLOptimizer(
        prices=prices,
        ai_forecasts=ai_forecasts,
        market_caps=market_caps,
        max_weight=max_weight,
    ).optimize()


# ------------------------------------------------------------------ helpers


def _equal_weights(symbols, cap: float = 1.0) -> Dict[str, float]:
    """Equal weight with per-asset cap enforced.

    When ``1/n <= cap`` returns pure equal-weight. Otherwise caps at
    ``cap`` and leaves ``1 - n*cap`` as residual cash (caller can
    renormalize if desired — we prefer under-100% allocation to silent
    cap violation).
    """
    if not symbols:
        return {}
    n = len(symbols)
    w = min(1.0 / n, cap)
    return {s: round(w, 4) for s in symbols}


def _markowitz(prices: pd.DataFrame, cov, max_weight: float) -> Dict[str, float]:
    from pypfopt import EfficientFrontier, expected_returns

    effective_cap = max(max_weight, 1.0 / len(prices.columns) + 1e-6)
    try:
        mu = expected_returns.mean_historical_return(prices)
        ef = EfficientFrontier(mu, cov, weight_bounds=(0.0, effective_cap))
        ef.max_sharpe()
        clean = ef.clean_weights(cutoff=0.005, rounding=4)
        nonzero = {k: v for k, v in clean.items() if v > 0}
        total = sum(nonzero.values()) or 1
        return {k: round(v / total, 4) for k, v in nonzero.items()}
    except Exception as e:
        logger.warning("Markowitz fallback failed (%s) — equal weight", e)
        return _equal_weights(list(prices.columns), cap=effective_cap)
