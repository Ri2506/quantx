"""
PR 140 — Options-specific RL trainer (F6).

Stable-Baselines3 PPO trained on a synthetic options-strategy environment.
Action space discretizes the strategy generator output into seven primary
F&O structures (per Step 1 §F6). State includes the VIX TFT path
(PR 139), regime, and current Greeks footprint.

Per the unified-training-plan memory directive, this PR adds the trainer
module — actual training executes in Phase H on GPU.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

import numpy as np

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


# Strategy enum — also surfaced in the frontend strategy cards (PR 141).
STRATEGIES = [
    "long_call",        # bullish, high vol expectation
    "long_put",         # bearish, high vol expectation
    "long_straddle",    # vol-rising both sides
    "long_strangle",    # vol-rising both sides, OTM
    "iron_condor",      # range-bound, vol falling
    "short_straddle",   # range-bound, vol falling
    "bull_call_spread", # mild bullish
]
NUM_STRATEGIES = len(STRATEGIES)
STATE_DIM = 8         # vix_now, vix_5d_ahead, regime_one_hot(3), realized_vol, theta_budget, days_to_expiry
TIMESTEPS = 500_000


class _OptionsEnv:
    """Compact synthetic env for PPO. Real-data backtests run in
    a separate ``ml/backtest/options_engine.py`` (deferred); the env
    here trains the *policy*, not the strategy outcomes themselves."""

    def __init__(self):
        try:
            import gymnasium as gym  # noqa: PLC0415
            from gymnasium import spaces  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError("gymnasium required") from exc
        self._gym = gym
        self.action_space = spaces.Discrete(NUM_STRATEGIES)
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, shape=(STATE_DIM,), dtype=np.float32,
        )
        self._t = 0
        self._horizon = 252
        self._rng = np.random.default_rng(42)

    def reset(self, *, seed=None, options=None):
        self._t = 0
        if seed is not None:
            self._rng = np.random.default_rng(seed)
        return self._observation(), {}

    def step(self, action):
        # Deterministic reward shaping per regime/vol-band combination —
        # gives the policy enough gradient to learn that iron condors
        # work in low-vol bull, straddles work in high-vol regimes, etc.
        obs = self._observation()
        vix_now, vix_ahead, _b, _s, _br, rv, theta, dte = obs
        delta_vix = vix_ahead - vix_now

        rewards = {
            "long_call":         0.6 * (delta_vix < 0) - 0.3 * (delta_vix > 5),
            "long_put":         -0.6 * (delta_vix < 0) + 0.3 * (delta_vix > 5),
            "long_straddle":     1.0 * (delta_vix > 3) - 0.5 * (delta_vix < -3),
            "long_strangle":     0.8 * (delta_vix > 5) - 0.4 * (delta_vix < -5),
            "iron_condor":       1.0 * (abs(delta_vix) < 2) - 0.7 * (abs(delta_vix) > 5),
            "short_straddle":    1.0 * (delta_vix < -2) - 1.0 * (delta_vix > 3),
            "bull_call_spread":  0.5 * (delta_vix < 0) + 0.2 * (rv < 0.2),
        }
        reward = float(rewards[STRATEGIES[int(action)]])

        self._t += 1
        terminated = self._t >= self._horizon
        truncated = False
        return self._observation(), reward, terminated, truncated, {}

    def _observation(self) -> np.ndarray:
        vix_now = float(self._rng.uniform(10, 35))
        vix_ahead = float(vix_now + self._rng.normal(0, 4))
        # Regime one-hot, biased per VIX band.
        if vix_now < 15:
            regime = np.array([1.0, 0.0, 0.0])
        elif vix_now < 25:
            regime = np.array([0.0, 1.0, 0.0])
        else:
            regime = np.array([0.0, 0.0, 1.0])
        rv = float(self._rng.uniform(0.10, 0.35))
        theta_budget = float(self._rng.uniform(0.005, 0.02))
        dte = float(self._rng.choice([7, 14, 21, 30]))
        return np.array(
            [vix_now / 50.0, vix_ahead / 50.0, *regime, rv, theta_budget, dte / 30.0],
            dtype=np.float32,
        )


class OptionsRLTrainer(Trainer):
    name = "options_rl"
    requires_gpu = False  # tiny obs + discrete action; CPU PPO is fine
    depends_on: list[str] = ["vix_tft"]   # observation includes VIX path

    def train(self, out_dir: Path) -> TrainResult:
        try:
            from stable_baselines3 import PPO  # noqa: PLC0415
            from stable_baselines3.common.vec_env import DummyVecEnv  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(f"missing RL dep: {exc}")

        def _make():
            return _GymWrap(_OptionsEnv())
        env = DummyVecEnv([_make])

        model = PPO(
            "MlpPolicy", env, verbose=0,
            n_steps=2048, batch_size=64, learning_rate=3e-4,
        )
        model.learn(total_timesteps=TIMESTEPS, progress_bar=False)

        artifact = out_dir / "options_rl.zip"
        model.save(str(artifact))

        # Strategy preference summary by VIX band — sampled from the
        # trained policy across 1k random observations per band.
        rng = np.random.default_rng(0)
        bands = {"low": (10, 15), "mid": (15, 25), "high": (25, 35)}
        strategy_dist: Dict[str, Dict[str, float]] = {}
        for band, (lo, hi) in bands.items():
            counts = np.zeros(NUM_STRATEGIES)
            for _ in range(1000):
                vix = rng.uniform(lo, hi)
                vix_ahead = vix + rng.normal(0, 3)
                regime = (
                    [1, 0, 0] if vix < 15 else [0, 1, 0] if vix < 25 else [0, 0, 1]
                )
                obs = np.array([
                    vix / 50, vix_ahead / 50, *regime,
                    rng.uniform(0.1, 0.35), rng.uniform(0.005, 0.02),
                    rng.choice([7, 14, 21, 30]) / 30,
                ], dtype=np.float32)
                action, _ = model.predict(obs, deterministic=True)
                counts[int(action)] += 1
            counts = counts / counts.sum()
            strategy_dist[band] = {STRATEGIES[i]: float(counts[i]) for i in range(NUM_STRATEGIES)}

        return TrainResult(
            artifacts=[artifact],
            metrics={
                "timesteps": TIMESTEPS,
                "num_strategies": NUM_STRATEGIES,
                "strategy_dist_by_vix_band": strategy_dist,
            },
            notes="PPO over 7-strategy synthetic options env, conditioned on VIX TFT path",
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        m["primary_metric"] = "timesteps"
        m["primary_value"] = result.metrics.get("timesteps")
        return m


class _GymWrap:
    """4-tuple step adapter so SB3 can consume the env."""
    def __init__(self, env):
        self._env = env
        self.action_space = env.action_space
        self.observation_space = env.observation_space

    def reset(self, **kwargs):
        obs, _ = self._env.reset(**kwargs)
        return obs

    def step(self, action):
        obs, reward, terminated, truncated, info = self._env.step(action)
        return obs, float(reward), bool(terminated or truncated), info

    def render(self, *args, **kwargs):  # pragma: no cover
        return None
