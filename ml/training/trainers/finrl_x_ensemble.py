"""
PR 131 / PR 171 — FinRL-X ensemble trainer.

Trains PPO + DDPG + A2C policies over the NSE trading env and registers
each as a separate ``model_versions`` row. The runner produces three
artifacts (one per algo) so AutoPilot can blend them at inference time.

GPU-strongly-recommended: each algo's training loop takes ~30 min on a
V100 for 1M steps. Marked ``requires_gpu=True`` so the runner skips
this trainer on CPU-only boxes unless ``--skip-gpu`` is *not* set.

PR 171 — proper OOS backtest evaluation:
    * Train on TRAIN_START → TRAIN_END.
    * Holdout deterministic rollout on EVAL_START → today.
    * Track per-step portfolio log-return → daily simple return series.
    * Compare to Nifty 50 buy-and-hold benchmark over the same window.
    * Compute Sharpe, max_drawdown, calmar, profit_factor, excess_return.
    * Per Step 1 §F4 — AutoPilot is the flagship Elite product, so the
      promote gate is tighter than default (Sharpe ≥ 1.2, drawdown
      ≤ -20 percent, excess return ≥ 8 percent over the eval window).
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
HOLDOUT_START = "2025-01-01"
NIFTY_TICKER = "^NSEI"


def _download_prices(symbols: List[str], start: str, end: str | None = None) -> pd.DataFrame:
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


def _download_nifty(start: str, end: str | None = None) -> pd.Series:
    """Nifty 50 close series — used as buy-and-hold benchmark for excess return."""
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required") from exc
    df = yf.download(NIFTY_TICKER, start=start, end=end, progress=False, auto_adjust=False)
    if df is None or df.empty:
        raise TrainerError("nifty benchmark download returned empty")
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = [c[0] for c in df.columns]
    return df["Close"].astype(float)


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


def _slice_features(features: Dict[str, pd.DataFrame], idx: pd.Index) -> Dict[str, pd.DataFrame]:
    return {k: v.reindex(idx) for k, v in features.items()}


def _build_env_data() -> Tuple[
    pd.DataFrame,           # train_prices
    Dict[str, pd.DataFrame],
    pd.Series,              # train regime
    pd.Series,              # train vix
    pd.DataFrame,           # holdout_prices
    Dict[str, pd.DataFrame],
    pd.Series,              # holdout regime
    pd.Series,              # holdout vix
    pd.Series,              # nifty_holdout_returns
]:
    """Single yfinance fetch covering train + holdout windows; split downstream."""
    full_prices = _download_prices(TRAIN_UNIVERSE, TRAIN_START)
    full_features = _build_features(full_prices)

    train_prices = full_prices.loc[:TRAIN_END]
    holdout_prices = full_prices.loc[HOLDOUT_START:]
    if len(holdout_prices) < 60:
        raise TrainerError(
            f"insufficient holdout window: {len(holdout_prices)} days "
            f"(need at least 60 for stable Sharpe)",
        )

    # Stub regime + VIX timeseries: regime defaults to sideways(1) until
    # PR 132 wires the trained HMM in. That's acceptable here because
    # the env tolerates these defaults and the policies still learn the
    # weight-mapping behavior.
    train_regime = pd.Series(1, index=train_prices.index)
    train_vix = pd.Series(15.0, index=train_prices.index)
    holdout_regime = pd.Series(1, index=holdout_prices.index)
    holdout_vix = pd.Series(15.0, index=holdout_prices.index)

    nifty = _download_nifty(HOLDOUT_START)
    nifty_returns = nifty.pct_change().dropna().reindex(holdout_prices.index).fillna(0.0)

    return (
        train_prices, _slice_features(full_features, train_prices.index),
        train_regime, train_vix,
        holdout_prices, _slice_features(full_features, holdout_prices.index),
        holdout_regime, holdout_vix,
        nifty_returns,
    )


class _SB3AlgoTrainer(Trainer):
    """Shared logic. Subclasses set ``algo_name`` + ``_train_one``."""
    requires_gpu = True
    depends_on: list[str] = []

    algo_name: str = ""

    # PR 171 — AutoPilot is the Elite flagship; keep is_prod=TRUE behind a
    # tighter gate than the swing default. Drawdown ceiling matches the
    # VIX-overlay risk policy in Step 1 §F4 (>-20 percent triggers user
    # alerts and position reduction at runtime).
    promote_thresholds = {
        "min_sharpe": 1.2,
        "max_drawdown_pct": -0.20,
        "min_calmar": 0.6,
        "min_profit_factor": 1.5,
        "min_n_trades": 30,
        "min_excess_return_pct": 0.08,
    }

    def _build_envs(self):
        try:
            import gymnasium as gym  # noqa: PLC0415, F401
            from stable_baselines3.common.vec_env import DummyVecEnv  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(f"missing RL dep: {exc}")

        from ml.rl.env import EnvConfig, NSETradingEnv  # noqa: PLC0415
        (
            train_prices, train_features, train_regime, train_vix,
            holdout_prices, holdout_features, holdout_regime, holdout_vix,
            nifty_returns,
        ) = _build_env_data()

        def _build_train_env():
            return _GymWrapper(
                NSETradingEnv(train_prices, train_features, train_regime, train_vix, EnvConfig()),
            )

        def _build_holdout_env():
            return _GymWrapper(
                NSETradingEnv(holdout_prices, holdout_features, holdout_regime, holdout_vix, EnvConfig()),
            )

        train_env = DummyVecEnv([_build_train_env])
        holdout_env = DummyVecEnv([_build_holdout_env])
        return train_env, holdout_env, train_prices, holdout_prices, nifty_returns

    def _train_one(self, env, total_timesteps: int):  # pragma: no cover — overridden
        raise NotImplementedError

    def _run_holdout_rollout(self, model, holdout_env) -> Tuple[np.ndarray, int]:
        """Deterministic rollout over the entire holdout window.

        Returns (per-period simple-return array, n_position_changes).
        n_position_changes counts how many bars the policy actually
        changed its target weights — acts as a sanity floor on the
        n_trades metric since the env doesn't expose discrete trades.
        """
        obs = holdout_env.reset()
        returns: List[float] = []
        prev_action: np.ndarray | None = None
        n_position_changes = 0

        # Full holdout window — env terminates naturally at the last bar.
        max_steps = 5000  # safety cap; window is ~250-500 bars in practice
        for _ in range(max_steps):
            action, _ = model.predict(obs, deterministic=True)
            if prev_action is not None and float(np.abs(action - prev_action).sum()) > 1e-6:
                n_position_changes += 1
            prev_action = np.asarray(action, dtype=np.float64).copy()

            obs, reward, done, info = holdout_env.step(action)
            # Reward in NSETradingEnv is already log-return - costs (PR 131).
            # Convert log-return to simple return for backtest_eval consumption.
            r = float(reward[0]) if hasattr(reward, "__iter__") else float(reward)
            returns.append(float(np.expm1(r)))
            if (done if isinstance(done, bool) else bool(np.any(done))):
                break

        return np.asarray(returns, dtype=float), int(n_position_changes)

    def train(self, out_dir: Path) -> TrainResult:
        from ml.eval import metrics_from_returns  # noqa: PLC0415

        train_env, holdout_env, train_prices, holdout_prices, nifty_returns = self._build_envs()
        model = self._train_one(train_env, TRAIN_TIMESTEPS)

        artifact = out_dir / "model.zip"
        model.save(str(artifact))

        # PR 171 — proper OOS evaluation on 2025+ window.
        holdout_returns, n_position_changes = self._run_holdout_rollout(model, holdout_env)
        bench_returns = nifty_returns.values[: len(holdout_returns)] if len(holdout_returns) > 0 else np.array([])

        if len(holdout_returns) == 0:
            raise TrainerError(f"{self.algo_name} holdout rollout produced zero steps")

        metrics = metrics_from_returns(holdout_returns, bench_returns if bench_returns.size else None)
        # Surface position-change count as a proxy for n_trades so the
        # promote gate's "min_n_trades" check is meaningful for RL.
        metrics["n_trades"] = int(n_position_changes)
        # Profit factor approximation on per-period returns (RL doesn't
        # have discrete trades, so use win/loss bar PnLs).
        wins = holdout_returns[holdout_returns > 0]
        losses = holdout_returns[holdout_returns < 0]
        metrics["win_rate"] = round(float(wins.size / max(1, holdout_returns.size)), 4)
        gp = float(wins.sum())
        gl = float(np.abs(losses.sum()))
        metrics["profit_factor"] = round(gp / gl, 4) if gl > 1e-12 else 0.0

        logger.info(
            "%s holdout: sharpe=%.2f  dd=%.2f%%  excess=%.2f%%  n_trades=%d",
            self.algo_name,
            metrics.get("sharpe", 0.0),
            metrics.get("max_drawdown_pct", 0.0) * 100,
            metrics.get("excess_return_pct", 0.0) * 100,
            metrics["n_trades"],
        )

        return TrainResult(
            artifacts=[artifact],
            metrics={
                **metrics,
                "algo": self.algo_name,
                "n_assets": int(train_prices.shape[1]),
                "train_timesteps": int(TRAIN_TIMESTEPS),
                "holdout_window": f"{holdout_prices.index.min().date()}-{holdout_prices.index.max().date()}",
                "n_holdout_periods": int(len(holdout_returns)),
            },
            notes=(
                f"FinRL-X {self.algo_name} on {train_prices.shape[1]} NSE symbols, "
                f"train {TRAIN_START}-{TRAIN_END}, holdout {HOLDOUT_START}-{holdout_prices.index.max().date()}"
            ),
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        m["primary_metric"] = "sharpe"
        m["primary_value"] = result.metrics.get("sharpe", 0.0)
        return m


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
