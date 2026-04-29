"""
PR 131 — FinRL-X ensemble trainer.

Trains PPO + DDPG + A2C policies over the NSE trading env and registers
each as a separate ``model_versions`` row. The runner produces three
artifacts (one per algo) so AutoPilot can blend them at inference time.

GPU-strongly-recommended: each algo's training loop takes ~30 min on a
V100 for 1M steps. Marked ``requires_gpu=True`` so the runner skips
this trainer on CPU-only boxes unless ``--skip-gpu`` is *not* set.

Per the unified-training-plan memory directive, this PR adds the trainer
module and registers it with the runner — actual training executes once
in Phase H on GPU before launch.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


# Default training universe: top 30 Nifty constituents. Smaller than the
# inference universe to keep the action space tractable; the policy
# generalises via the feature observation, not symbol identity.
TRAIN_UNIVERSE = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "HINDUNILVR",
    "ITC", "SBIN", "BHARTIARTL", "KOTAKBANK", "LT", "AXISBANK",
    "BAJFINANCE", "ASIANPAINT", "MARUTI", "WIPRO", "HCLTECH", "ULTRACEMCO",
    "TITAN", "SUNPHARMA", "POWERGRID", "NTPC", "ADANIENT", "ONGC",
    "TATAMOTORS", "JSWSTEEL", "GRASIM", "DIVISLAB", "TECHM", "DRREDDY",
]

TRAIN_TIMESTEPS = 1_000_000
TRAIN_START = "2018-01-01"
TRAIN_END = "2024-12-31"
EVAL_START = "2025-01-01"


def _download_prices(symbols: List[str], start: str, end: str) -> pd.DataFrame:
    """yfinance batch download → date × symbol Close DataFrame."""
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required for FinRL-X training") from exc

    tickers = [f"{s}.NS" for s in symbols]
    df = yf.download(tickers, start=start, end=end, progress=False, auto_adjust=False)
    if df is None or df.empty:
        raise TrainerError("yfinance returned empty price frame")
    if "Close" in df.columns.get_level_values(0):
        close = df["Close"]
    else:
        close = df
    if isinstance(close.columns, pd.MultiIndex):
        close.columns = [c[0] for c in close.columns]
    close.columns = [c.replace(".NS", "") for c in close.columns]
    return close.dropna(how="all")


def _build_features(prices: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    """Per-symbol features the env's observation reader expects."""
    ret_5d = prices.pct_change(5)
    ret_20d = prices.pct_change(20)
    # RSI(14) — Wilder's smoothing approximation.
    delta = prices.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean().replace(0, np.nan)
    rs = gain / loss
    rsi = (100 - 100 / (1 + rs)).fillna(50)
    # ATR-as-pct: range / close 14-day mean.
    high_low = prices.diff().abs()  # crude proxy without H/L; refined in PR 132
    atr_pct = (high_low.rolling(14).mean() / prices).fillna(0)
    return {
        "ret_5d": ret_5d.fillna(0),
        "ret_20d": ret_20d.fillna(0),
        "rsi_14": rsi,
        "atr_14_pct": atr_pct,
    }


def _build_env_data() -> Tuple[pd.DataFrame, Dict[str, pd.DataFrame], pd.Series, pd.Series]:
    prices = _download_prices(TRAIN_UNIVERSE, TRAIN_START, EVAL_START)
    features = _build_features(prices)
    # Stub regime + VIX timeseries: regime defaults to sideways(1) until
    # PR 132 wires the trained HMM in. That's acceptable here because
    # the env tolerates these defaults and the policies still learn the
    # weight-mapping behavior.
    regime = pd.Series(1, index=prices.index)
    vix = pd.Series(15.0, index=prices.index)
    return prices, features, regime, vix


class _SB3AlgoTrainer(Trainer):
    """Shared logic. Subclasses set ``algo_name`` + ``_train_one``."""
    requires_gpu = True
    depends_on: list[str] = []

    algo_name: str = ""

    def _build_env(self):
        try:
            import gymnasium as gym  # noqa: PLC0415, F401
            from stable_baselines3.common.vec_env import DummyVecEnv  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(f"missing RL dep: {exc}")

        from ml.rl.env import EnvConfig, NSETradingEnv  # noqa: PLC0415
        prices, features, regime, vix = _build_env_data()

        # SB3 wants a vectorised env. Single-env vectorisation is fine
        # for the v1 batch — we trade horizontal scaling for code simplicity.
        def _make():
            return _GymWrapper(NSETradingEnv(prices, features, regime, vix, EnvConfig()))
        return DummyVecEnv([_make]), prices

    def _train_one(self, env, total_timesteps: int):  # pragma: no cover — overridden
        raise NotImplementedError

    def train(self, out_dir: Path) -> TrainResult:
        env, prices = self._build_env()
        model = self._train_one(env, TRAIN_TIMESTEPS)

        artifact = out_dir / "model.zip"
        model.save(str(artifact))

        # Quick eval: average reward over 1 random episode in the training
        # window. Walk-forward OOS eval lands in PR 132.
        obs = env.reset()
        ep_reward = 0.0
        for _ in range(252):
            action, _ = model.predict(obs, deterministic=True)
            obs, reward, done, info = env.step(action)
            ep_reward += float(reward[0]) if hasattr(reward, "__iter__") else float(reward)
            if (done if isinstance(done, bool) else bool(np.any(done))):
                break

        return TrainResult(
            artifacts=[artifact],
            metrics={
                "algo": self.algo_name,
                "n_assets": int(prices.shape[1]),
                "train_timesteps": int(TRAIN_TIMESTEPS),
                "ep_reward_train": float(ep_reward),
            },
            notes=f"FinRL-X {self.algo_name} on {prices.shape[1]} NSE symbols, "
                  f"{TRAIN_START}→{EVAL_START}",
        )


class _GymWrapper:
    """Adapts NSETradingEnv to the gym API SB3 still expects (4-tuple step)."""
    def __init__(self, env):
        self._env = env
        self.action_space = env.action_space
        self.observation_space = env.observation_space

    def reset(self, **kwargs):
        obs, info = self._env.reset(**kwargs)
        return obs

    def step(self, action):
        obs, reward, terminated, truncated, info = self._env.step(action)
        done = bool(terminated or truncated)
        return obs, float(reward), done, info

    def render(self, *args, **kwargs):  # pragma: no cover
        return None


class FinRLXPPOTrainer(_SB3AlgoTrainer):
    name = "finrl_x_ppo"
    algo_name = "PPO"

    def _train_one(self, env, total_timesteps):
        from stable_baselines3 import PPO  # noqa: PLC0415
        model = PPO("MlpPolicy", env, verbose=0, n_steps=2048, batch_size=128, learning_rate=3e-4)
        model.learn(total_timesteps=total_timesteps, progress_bar=False)
        return model


class FinRLXDDPGTrainer(_SB3AlgoTrainer):
    name = "finrl_x_ddpg"
    algo_name = "DDPG"

    def _train_one(self, env, total_timesteps):
        from stable_baselines3 import DDPG  # noqa: PLC0415
        model = DDPG("MlpPolicy", env, verbose=0, learning_rate=1e-3, buffer_size=200_000)
        model.learn(total_timesteps=total_timesteps, progress_bar=False)
        return model


class FinRLXA2CTrainer(_SB3AlgoTrainer):
    name = "finrl_x_a2c"
    algo_name = "A2C"

    def _train_one(self, env, total_timesteps):
        from stable_baselines3 import A2C  # noqa: PLC0415
        model = A2C("MlpPolicy", env, verbose=0, learning_rate=7e-4, n_steps=8)
        model.learn(total_timesteps=total_timesteps, progress_bar=False)
        return model
