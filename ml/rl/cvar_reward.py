"""
PR 178 — Conditional Value-at-Risk reward shaping for RL trainers.

The FinRL ensemble (PR 131/171) and options_rl (PR 140/173) both train
on raw return-based reward. The promote gate (PR 167/174) rejects
backtests with too-deep drawdown after the fact. But the policy never
*learned* to avoid tail risk — it only learned to maximize expected
return, then we hope the gate filters out the unlucky tails.

CFA Institute's RL/IRL for Investment Management Ch.6 (2025) and
MDPI 18/7/347 (2025) make the case clearly: embed the tail penalty
INSIDE the training loop. The Lagrangian formulation:

    reward'  = reward - λ · max(0, target_cvar - rolling_cvar(α))

  where rolling_cvar(α) is the per-step CVaR at confidence α (default
  5 percent) over a sliding window of the policy's recent returns.
  When the rolling CVaR breaches the target (e.g. -2 percent worst-
  5-percent-tail), reward is penalized proportional to the breach.

Public surface:

    from ml.rl.cvar_reward import CVaRRewardShaper, CVaRConfig

    cfg = CVaRConfig(alpha=0.05, target_cvar=-0.02, penalty_lambda=2.0)
    shaper = CVaRRewardShaper(cfg)

    # Inside env.step or a wrapper:
    reward = base_reward
    shaped = shaper.shape(reward)
    # shaper tracks rolling returns internally and returns the
    # adjusted reward.

Used by:
  - finrl_x_ensemble._OptionsEnv via a Gymnasium RewardWrapper
  - options_rl._OptionsEnv similarly
"""

from __future__ import annotations

import collections
import logging
from dataclasses import dataclass
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class CVaRConfig:
    """CVaR Lagrangian penalty configuration.

    alpha:
        Tail confidence level. 0.05 = worst 5 percent of returns. Smaller
        alpha = stricter tail focus (and noisier estimate). Standard
        institutional choices: 0.05 (95 percent CVaR) or 0.01 (99 percent).

    target_cvar:
        Threshold the rolling CVaR must stay above (i.e. shallower than).
        -0.02 means "worst-5-percent-of-returns average should not be
        worse than -2 percent per step". Tune with the env's reward
        scale: for daily portfolio returns -2 percent is reasonable; for
        scalar shaped rewards the units differ.

    penalty_lambda:
        Lagrangian multiplier on the breach. λ=2.0 means a 1 percent
        deeper-than-target CVaR knocks 2 units off the next reward.
        Higher λ = more risk-averse policy.

    rolling_window:
        How many recent rewards to use for CVaR estimation. 100 = the
        last 100 env steps. Too small → noisy CVaR; too large → slow
        adaptation to current policy.

    warmup_steps:
        Don't apply the penalty for the first N steps — CVaR estimate
        is too noisy with <warmup_steps samples. Defaults to half the
        rolling window.
    """

    alpha: float = 0.05
    target_cvar: float = -0.02
    penalty_lambda: float = 2.0
    rolling_window: int = 100
    warmup_steps: Optional[int] = None


class CVaRRewardShaper:
    """Stateful reward shaper. Tracks a rolling window of rewards and
    subtracts a penalty when the per-step CVaR breaches the target.

    Not thread-safe — instantiate one per env instance. ``reset()`` is
    safe to call between episodes (and is called automatically by the
    wrapper below).
    """

    def __init__(self, cfg: Optional[CVaRConfig] = None):
        self.cfg = cfg or CVaRConfig()
        if not (0.0 < self.cfg.alpha < 1.0):
            raise ValueError("alpha must be in (0, 1)")
        if self.cfg.rolling_window < 10:
            raise ValueError("rolling_window must be >= 10")
        self.warmup = (
            self.cfg.warmup_steps
            if self.cfg.warmup_steps is not None
            else self.cfg.rolling_window // 2
        )
        self._buffer: collections.deque = collections.deque(maxlen=self.cfg.rolling_window)
        self._n_seen = 0
        self._n_breaches = 0

    def reset(self) -> None:
        self._buffer.clear()
        self._n_seen = 0
        self._n_breaches = 0

    def current_cvar(self) -> Optional[float]:
        """Current rolling CVaR estimate, or None if buffer too small."""
        if len(self._buffer) < self.warmup:
            return None
        arr = np.asarray(self._buffer, dtype=float)
        # CVaR_α = mean of the worst α-quantile of returns
        cutoff = float(np.quantile(arr, self.cfg.alpha))
        tail = arr[arr <= cutoff]
        if tail.size == 0:
            return cutoff
        return float(tail.mean())

    def shape(self, base_reward: float) -> float:
        """Append reward to the rolling buffer and return shaped reward."""
        r = float(base_reward)
        self._buffer.append(r)
        self._n_seen += 1
        cvar = self.current_cvar()
        if cvar is None:
            return r
        breach = self.cfg.target_cvar - cvar  # positive when cvar < target
        if breach <= 0:
            return r
        self._n_breaches += 1
        return r - self.cfg.penalty_lambda * breach

    def stats(self) -> dict:
        """Dump end-of-episode stats for trainer.metrics."""
        return {
            "cvar_steps_seen": int(self._n_seen),
            "cvar_breaches": int(self._n_breaches),
            "cvar_breach_rate": (
                round(self._n_breaches / max(1, self._n_seen), 4)
            ),
            "cvar_final": round(self.current_cvar() or 0.0, 6),
            "cvar_target": self.cfg.target_cvar,
            "cvar_alpha": self.cfg.alpha,
        }


def make_cvar_wrapper(env, cfg: Optional[CVaRConfig] = None):
    """Return a Gymnasium-compatible RewardWrapper around ``env``.

    Forwards ``shape(reward)`` for every step. Resets the shaper's
    rolling buffer on env.reset().

    Usage:
        from ml.rl.cvar_reward import make_cvar_wrapper, CVaRConfig
        env = make_cvar_wrapper(NSETradingEnv(...), CVaRConfig())
    """
    shaper = CVaRRewardShaper(cfg)

    class _CVaRWrap:
        """Lightweight wrapper compatible with both gym 0.21 (4-tuple)
        and Gymnasium 0.29+ (5-tuple) step APIs. We detect by attempting
        the 5-tuple unpack and falling back."""

        def __init__(self, _env):
            self._env = _env
            self.action_space = _env.action_space
            self.observation_space = _env.observation_space
            self._shaper = shaper

        def reset(self, **kwargs):
            self._shaper.reset()
            return self._env.reset(**kwargs)

        def step(self, action):
            out = self._env.step(action)
            if len(out) == 5:
                obs, reward, terminated, truncated, info = out
                shaped = self._shaper.shape(reward)
                if isinstance(info, dict):
                    info = {**info, "cvar_estimate": self._shaper.current_cvar()}
                return obs, shaped, terminated, truncated, info
            obs, reward, done, info = out
            shaped = self._shaper.shape(reward)
            if isinstance(info, dict):
                info = {**info, "cvar_estimate": self._shaper.current_cvar()}
            return obs, shaped, done, info

        def render(self, *args, **kwargs):  # pragma: no cover
            return getattr(self._env, "render", lambda *a, **k: None)(*args, **kwargs)

        @property
        def shaper(self):
            return self._shaper

    return _CVaRWrap(env)


__all__ = ["CVaRConfig", "CVaRRewardShaper", "make_cvar_wrapper"]
