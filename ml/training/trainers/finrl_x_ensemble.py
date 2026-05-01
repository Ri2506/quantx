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
    close, _, _ = _download_ohlc(symbols, start, end)
    return close


def _download_ohlc(
    symbols: List[str], start: str, end: str | None = None,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """yfinance batch download → (Close, High, Low) DataFrames per symbol.

    PR 188 — real OHLC so true-range ATR can be computed. Replaces the
    Close-only fetch that previously forced a |diff| proxy ATR.
    """
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required for FinRL-X training") from exc

    tickers = [f"{s}.NS" for s in symbols]
    df = yf.download(tickers, start=start, end=end, progress=False, auto_adjust=False)
    if df is None or df.empty:
        raise TrainerError("yfinance returned empty price frame")

    def _slice(field: str) -> pd.DataFrame:
        if field in df.columns.get_level_values(0):
            sub = df[field]
        else:
            sub = df
        if isinstance(sub.columns, pd.MultiIndex):
            sub.columns = [c[0] for c in sub.columns]
        sub.columns = [c.replace(".NS", "") for c in sub.columns]
        return sub.dropna(how="all")

    return _slice("Close"), _slice("High"), _slice("Low")


def _download_vix(start: str, end: str | None = None) -> pd.Series:
    """India VIX daily close, aligned for FinRL env covariate."""
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required") from exc
    vix = yf.download("^INDIAVIX", start=start, end=end, progress=False, auto_adjust=False)
    if vix is None or vix.empty:
        return pd.Series(dtype=float)
    if isinstance(vix.columns, pd.MultiIndex):
        vix.columns = [c[0] for c in vix.columns]
    return vix["Close"].astype(float)


def _hmm_regime_series(
    prices: pd.DataFrame,
    vix: pd.Series,
) -> pd.Series:
    """Predict per-day regime label using the trained MarketRegimeDetector.

    Trains an HMM on the same feature schema MarketRegimeDetector
    expects (ret_5d, ret_20d, realized_vol_10d, vix_level, vix_5d_change),
    then runs predict on every day. Returns int Series in {0, 1, 2}
    aligned with prices.index. Falls back to constant 1 (sideways) if
    HMM training fails — env tolerates that gracefully.
    """
    try:
        from ml.regime_detector import MarketRegimeDetector  # noqa: PLC0415
    except ImportError as exc:
        logger.warning("MarketRegimeDetector unavailable (%s); using constant regime", exc)
        return pd.Series(1, index=prices.index)

    # Use Nifty proxy = mean of train universe close. Reasonable when
    # universe is the top-30 large caps (high overlap with Nifty 50).
    nifty_proxy = prices.mean(axis=1).dropna()
    df = pd.DataFrame(index=nifty_proxy.index)
    df["ret_5d"] = nifty_proxy.pct_change(5)
    df["ret_20d"] = nifty_proxy.pct_change(20)
    df["realized_vol_10d"] = nifty_proxy.pct_change().rolling(10).std() * np.sqrt(252)
    df["vix_level"] = vix.reindex(df.index).ffill().fillna(15.0)
    df["vix_5d_change"] = df["vix_level"].pct_change(5)
    df = df.dropna()

    if len(df) < 500:
        logger.warning("insufficient data for HMM regime training; constant fallback")
        return pd.Series(1, index=prices.index)

    try:
        det = MarketRegimeDetector()
        det.train(df, n_components=3, n_iter=200)
        states = det.model.predict(det.scaler.transform(df.values))
        out = pd.Series(states.astype(int), index=df.index)
        return out.reindex(prices.index, method="ffill").fillna(1).astype(int)
    except Exception as exc:  # noqa: BLE001
        logger.warning("HMM regime training failed (%s); constant fallback", exc)
        return pd.Series(1, index=prices.index)


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


def _build_features(
    prices: pd.DataFrame,
    highs: pd.DataFrame | None = None,
    lows: pd.DataFrame | None = None,
) -> Dict[str, pd.DataFrame]:
    """Per-symbol features the env's observation reader expects.

    PR 188 — true-range ATR when High/Low are available. Falls back to
    the prior |Close-diff| proxy only when OHLC isn't fetched (which
    no longer happens after PR 188's _download_ohlc).
    """
    ret_5d = prices.pct_change(5)
    ret_20d = prices.pct_change(20)
    # RSI(14) — Wilder's smoothing approximation.
    delta = prices.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean().replace(0, np.nan)
    rs = gain / loss
    rsi = (100 - 100 / (1 + rs)).fillna(50)

    # ATR — true range when OHLC available, else |Close diff| proxy.
    if highs is not None and lows is not None:
        prev_close = prices.shift(1)
        tr1 = (highs - lows).abs()
        tr2 = (highs - prev_close).abs()
        tr3 = (lows - prev_close).abs()
        true_range = pd.concat([tr1, tr2, tr3], axis=0, keys=range(3)).groupby(level=1).max()
        # Reindex to original column order
        true_range = true_range.reindex(columns=prices.columns)
        atr = true_range.rolling(14).mean()
        atr_pct = (atr / prices).fillna(0)
    else:
        high_low = prices.diff().abs()
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
    full_close, full_high, full_low = _download_ohlc(TRAIN_UNIVERSE, TRAIN_START)
    full_features = _build_features(full_close, highs=full_high, lows=full_low)
    full_prices = full_close

    train_prices = full_prices.loc[:TRAIN_END]
    holdout_prices = full_prices.loc[HOLDOUT_START:]
    if len(holdout_prices) < 60:
        raise TrainerError(
            f"insufficient holdout window: {len(holdout_prices)} days "
            f"(need at least 60 for stable Sharpe)",
        )

    # PR 186 — real VIX series + HMM-derived regime labels.
    full_vix = _download_vix(TRAIN_START)
    if full_vix.empty:
        full_vix = pd.Series(15.0, index=full_prices.index)
        logger.warning("VIX unavailable; using constant 15.0")
    full_regime = _hmm_regime_series(full_prices, full_vix)

    train_regime = full_regime.reindex(train_prices.index).ffill().fillna(1).astype(int)
    train_vix = full_vix.reindex(train_prices.index).ffill().fillna(15.0)
    holdout_regime = full_regime.reindex(holdout_prices.index).ffill().fillna(1).astype(int)
    holdout_vix = full_vix.reindex(holdout_prices.index).ffill().fillna(15.0)

    logger.info(
        "FinRL-X regime distribution (train): bull=%d sideways=%d bear=%d",
        int((train_regime == 0).sum()),
        int((train_regime == 1).sum()),
        int((train_regime == 2).sum()),
    )

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

        from ml.rl.cvar_reward import CVaRConfig, make_cvar_wrapper  # noqa: PLC0415
        from ml.rl.env import EnvConfig, NSETradingEnv  # noqa: PLC0415
        (
            train_prices, train_features, train_regime, train_vix,
            holdout_prices, holdout_features, holdout_regime, holdout_vix,
            nifty_returns,
        ) = _build_env_data()

        # PR 178 — CVaR Lagrangian shaping. The env's reward is a daily
        # log-return - cost. Targeting -2 percent CVaR_5% over a 100-step
        # rolling window penalizes policies that allow worst-case daily
        # drawdowns deeper than 2 percent. Penalty lambda 2.0 — moderate
        # risk aversion. Holdout env runs raw rewards so the OOS Sharpe
        # measures the policy's actual return profile, not the shaped
        # reward.
        cvar_cfg = CVaRConfig(
            alpha=0.05, target_cvar=-0.02,
            penalty_lambda=2.0, rolling_window=100,
        )

        def _build_train_env():
            base = NSETradingEnv(
                train_prices, train_features, train_regime, train_vix, EnvConfig(),
            )
            return _GymWrapper(make_cvar_wrapper(base, cvar_cfg))

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
