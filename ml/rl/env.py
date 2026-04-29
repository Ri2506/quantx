"""
PR 131 — NSE trading Gymnasium environment.

A daily-rebalance portfolio environment over a fixed equity universe.
The agent emits target weights summing to 1 (cash is the implicit
remainder). Reward is the next-day log return of the chosen weights
minus a transaction-cost term proportional to the L1-distance from
the prior weights, plus a small drawdown penalty.

Observation per step:
    [w_t (N), ret_5d (N), ret_20d (N), rsi_14 (N), atr_14_pct (N),
     vix_level (1), regime_one_hot (3)]
    → length 5N + 4

This is intentionally compact — a richer state space (Alpha158, FinBERT
sentiment, FII/DII flows) lands in PR 132 once the wiring is proven.

Env contract follows Gymnasium ≥ 0.29:
    reset(*, seed=None, options=None) → (obs, info)
    step(action)                      → (obs, reward, terminated, truncated, info)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

try:
    import gymnasium as gym
    from gymnasium import spaces
except ImportError:  # pragma: no cover — surfaced as TrainerError when used
    gym = None
    spaces = None


# ── Reward / cost coefficients ─────────────────────────────────────────
# Slippage 0.05% + brokerage 0.03% + STT (sell-side) approximated to a
# round-trip 0.13% per L1 unit of weight change. Same magnitude as the
# backtest engine in ml/backtest/engine.py.
TRANSACTION_COST_BPS = 13.0  # 0.13% round trip
DRAWDOWN_PENALTY = 0.5       # weight on -peak_drawdown over the rolling window


@dataclass
class EnvConfig:
    initial_cash: float = 1_000_000.0
    max_steps: Optional[int] = None
    drawdown_window: int = 20
    seed: int = 42


class NSETradingEnv:
    """Gymnasium environment over an NSE equity universe.

    Notes:
        Subclassing ``gym.Env`` is deferred to instantiation time so this
        module imports cleanly even if gymnasium isn't installed (the
        trainer flips that to a hard fail).
    """

    def __init__(
        self,
        prices: pd.DataFrame,                 # date × symbol → close
        features: Optional[Dict[str, pd.DataFrame]] = None,  # name → date × symbol
        regime: Optional[pd.Series] = None,   # date → regime_id (0/1/2)
        vix: Optional[pd.Series] = None,
        config: Optional[EnvConfig] = None,
    ):
        if gym is None:
            raise RuntimeError("gymnasium not installed; pip install gymnasium")
        self.prices = prices.sort_index().dropna(how="all")
        self.symbols: List[str] = list(self.prices.columns)
        self.n_assets = len(self.symbols)
        if self.n_assets == 0:
            raise ValueError("prices DataFrame must have at least one symbol column")

        self.features = features or {}
        self.regime = regime if regime is not None else pd.Series(0, index=self.prices.index)
        self.vix = vix if vix is not None else pd.Series(15.0, index=self.prices.index)
        self.config = config or EnvConfig()

        # Pre-compute log returns for fast reward calc.
        self._log_returns = np.log(self.prices).diff().fillna(0).values

        # Action: target weights per asset (cash = 1 - sum(actions)).
        self._action_dim = self.n_assets
        self._obs_dim = 5 * self.n_assets + 4

        self._action_space = spaces.Box(low=0.0, high=1.0, shape=(self._action_dim,), dtype=np.float32)
        self._obs_space = spaces.Box(low=-np.inf, high=np.inf, shape=(self._obs_dim,), dtype=np.float32)

        self._reset_state()

    # ── Gymnasium-style hooks ──────────────────────────────────────────
    @property
    def action_space(self):
        return self._action_space

    @property
    def observation_space(self):
        return self._obs_space

    def reset(self, *, seed: Optional[int] = None, options=None):
        if seed is not None:
            np.random.seed(seed)
        self._reset_state()
        return self._observation(), {"step_idx": self._t}

    def step(self, action: np.ndarray) -> Tuple[np.ndarray, float, bool, bool, dict]:
        action = np.asarray(action, dtype=np.float64).clip(0.0, 1.0)
        s = action.sum()
        # Normalize so weights ≤ 1 and cash absorbs the residual.
        if s > 1.0:
            action = action / s

        prev_w = self._weights.copy()
        # Transaction cost is paid up-front against the new target.
        l1_change = float(np.abs(action - prev_w).sum())
        cost = l1_change * (TRANSACTION_COST_BPS / 10_000.0)

        self._weights = action
        # Realize next-day return based on the new weights.
        next_t = self._t + 1
        if next_t >= len(self._log_returns):
            terminated = True
            truncated = False
            reward = -cost
        else:
            day_returns = self._log_returns[next_t]
            port_log_return = float(np.dot(action, day_returns))
            reward = port_log_return - cost
            self._cum_log_return += port_log_return - cost
            self._equity_curve.append(np.exp(self._cum_log_return))
            self._t = next_t
            terminated = self._t >= len(self._log_returns) - 1
            truncated = (
                self.config.max_steps is not None
                and (self._t - self._start_t) >= self.config.max_steps
            )

            # Light drawdown penalty over a rolling window so the policy
            # learns to avoid prolonged losing streaks.
            if len(self._equity_curve) > self.config.drawdown_window:
                window = self._equity_curve[-self.config.drawdown_window:]
                peak = max(window)
                dd = (peak - window[-1]) / peak if peak > 0 else 0.0
                reward -= DRAWDOWN_PENALTY * dd

        info = {
            "step_idx": self._t,
            "cum_log_return": self._cum_log_return,
            "transaction_cost": cost,
            "weights_l1_change": l1_change,
        }
        return self._observation(), reward, terminated, truncated, info

    def render(self):  # pragma: no cover — unused
        pass

    # ── Internal state ─────────────────────────────────────────────────
    def _reset_state(self):
        # Skip the first ~20 rows so feature columns have valid windows.
        self._t = 20
        self._start_t = self._t
        self._weights = np.zeros(self.n_assets, dtype=np.float64)
        self._cum_log_return = 0.0
        self._equity_curve: List[float] = [1.0]

    def _feature_row(self, name: str, default: float = 0.0) -> np.ndarray:
        df = self.features.get(name)
        if df is None or self._t >= len(df):
            return np.full(self.n_assets, default, dtype=np.float64)
        row = df.iloc[self._t].reindex(self.symbols).fillna(default).values
        return np.asarray(row, dtype=np.float64)

    def _observation(self) -> np.ndarray:
        ret_5d = self._feature_row("ret_5d")
        ret_20d = self._feature_row("ret_20d")
        rsi_14 = self._feature_row("rsi_14", default=50.0) / 100.0
        atr_pct = self._feature_row("atr_14_pct", default=0.0)
        vix_level = float(self.vix.iloc[self._t]) if self._t < len(self.vix) else 15.0
        regime_id = int(self.regime.iloc[self._t]) if self._t < len(self.regime) else 0
        regime_one_hot = np.zeros(3, dtype=np.float64)
        if 0 <= regime_id < 3:
            regime_one_hot[regime_id] = 1.0

        obs = np.concatenate([
            self._weights.astype(np.float64),
            ret_5d, ret_20d, rsi_14, atr_pct,
            np.array([vix_level / 50.0]),  # normalized
            regime_one_hot,
        ])
        return obs.astype(np.float32)


__all__ = ["NSETradingEnv", "EnvConfig"]
