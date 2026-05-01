"""
PR 128/169 — LightGBM signal-gate trainer.

Cross-sectional 3-class direction classifier (SELL=-1, HOLD=0, BUY=+1)
trained on top-N liquid NSE stocks. Outputs are used by SignalGenerator
to gate which raw strategy signals fire.

PR 169 upgrades from threshold labels + 5-fold TimeSeriesSplit to:

  - Triple-barrier labels (López de Prado, ml.labeling) — ATR-scaled,
    path-dependent, volatility-aware
  - Liquid universe top-200 by 30-day median ADV (ml.data) instead of
    hardcoded 50 names
  - Walk-forward CV via ml.training.wfcv (rolling 5-fold)
  - Backtest-driven primary metric via ml.eval.compute_backtest_metrics
    (Sharpe, drawdown, profit factor — promote gate-ready)
  - Optional Optuna 20-trial Bayesian search over LGBM hyperparams

Artifact: native LightGBM .txt format loaded by LGBMGate.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd

from ..base import Trainer, TrainerError, TrainResult
from ..wfcv import WFCVConfig, aggregate_fold_metrics, walk_forward_split

logger = logging.getLogger(__name__)


# ============================================================================
# Configuration
# ============================================================================

# Universe size for training. 200 covers >90% of NSE volume; matches
# Nifty 200 index design.
UNIVERSE_TOP_N = 200

# Data window: 8 years of daily bars per symbol gives ~2000 bars after
# the 30-bar feature warmup, enough for 5-fold WFCV with 252-day folds.
DATA_PERIOD = "8y"
DATA_INTERVAL = "1d"

# Triple-barrier label parameters
PROFIT_TARGET_ATR = 2.0       # +2 ATR upper barrier
STOP_LOSS_ATR = 1.0           # -1 ATR lower barrier (2:1 R:R)
VERTICAL_BARRIER_DAYS = 10    # max holding period

# Forward-return horizon for backtest metric (separate from labeling).
# Daily strategy holds N days then exits at close.
FWD_RETURN_DAYS = 5

# WFCV — 5 folds, 252 day test window, 3 year train window
WFCV_FOLDS = 5
WFCV_TEST_SIZE = 252
WFCV_TRAIN_SIZE = 252 * 3
WFCV_EMBARGO = VERTICAL_BARRIER_DAYS + 2  # purge labeling-window leakage


# ============================================================================
# Feature engineering
# ============================================================================

# 15 OHLCV-derived features matching what LGBMGate expects at inference.
# Mirrors scripts/train_lgbm.py:FEATURE_ORDER for backwards compatibility.
FEATURE_ORDER = [
    "ret_1d", "ret_5d", "ret_10d", "ret_20d",
    "rsi_14", "macd_diff",
    "ema_20_dist", "ema_50_dist",
    "atr_14_pct",
    "volume_ratio_10d",
    "bb_percent",
    "high_52w_dist", "low_52w_dist",
    "stoch_k", "stoch_d",
]


def _compute_features(df: pd.DataFrame) -> pd.DataFrame:
    """Compute the 15 features for one symbol's daily OHLCV frame.

    All features are calibrated for daily bars. NaN rows from rolling
    windows are kept; caller drops them after labeling.
    """
    out = pd.DataFrame(index=df.index)
    close = df["Close"].astype(float)
    high = df["High"].astype(float)
    low = df["Low"].astype(float)
    volume = df["Volume"].astype(float)

    # Returns
    out["ret_1d"] = close.pct_change(1)
    out["ret_5d"] = close.pct_change(5)
    out["ret_10d"] = close.pct_change(10)
    out["ret_20d"] = close.pct_change(20)

    # RSI(14) Wilder's
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean().replace(0, np.nan)
    rs = gain / loss
    out["rsi_14"] = (100 - 100 / (1 + rs)).fillna(50)

    # MACD diff (12-26 EMA - 9 EMA signal)
    ema_12 = close.ewm(span=12, adjust=False).mean()
    ema_26 = close.ewm(span=26, adjust=False).mean()
    macd = ema_12 - ema_26
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    out["macd_diff"] = macd - macd_signal

    # EMA distance (% from price)
    ema_20 = close.ewm(span=20, adjust=False).mean()
    ema_50 = close.ewm(span=50, adjust=False).mean()
    out["ema_20_dist"] = (close - ema_20) / ema_20
    out["ema_50_dist"] = (close - ema_50) / ema_50

    # ATR(14) as % of price (vol-normalized)
    tr = pd.concat([
        (high - low),
        (high - close.shift(1)).abs(),
        (low - close.shift(1)).abs(),
    ], axis=1).max(axis=1)
    atr = tr.rolling(14).mean()
    out["atr_14_pct"] = (atr / close).fillna(0)
    # Also expose raw ATR for triple-barrier labeling (not in FEATURE_ORDER)
    out["_atr_raw"] = atr

    # Volume ratio
    out["volume_ratio_10d"] = volume / volume.rolling(10).mean().replace(0, np.nan)

    # Bollinger %B
    sma_20 = close.rolling(20).mean()
    std_20 = close.rolling(20).std()
    bb_upper = sma_20 + 2 * std_20
    bb_lower = sma_20 - 2 * std_20
    out["bb_percent"] = (close - bb_lower) / (bb_upper - bb_lower).replace(0, np.nan)

    # 52-week high/low distance
    high_52w = close.rolling(252).max()
    low_52w = close.rolling(252).min()
    out["high_52w_dist"] = (close - high_52w) / high_52w.replace(0, np.nan)
    out["low_52w_dist"] = (close - low_52w) / low_52w.replace(0, np.nan)

    # Stochastic
    lowest_low = low.rolling(14).min()
    highest_high = high.rolling(14).max()
    stoch_k = 100 * (close - lowest_low) / (highest_high - lowest_low).replace(0, np.nan)
    out["stoch_k"] = stoch_k
    out["stoch_d"] = stoch_k.rolling(3).mean()

    # Realized fwd return for backtest (target side)
    out["_fwd_return"] = close.pct_change(FWD_RETURN_DAYS).shift(-FWD_RETURN_DAYS)
    return out


def _build_dataset() -> Tuple[pd.DataFrame, np.ndarray, np.ndarray, np.ndarray, np.ndarray, pd.Series]:
    """Download + featurize + label the universe.

    Returns:
        features:   DataFrame of (n_rows, 15 features) ordered by date asc
        labels:     int8 array length n_rows from triple-barrier {-1,0,+1}
        weights:    float array length n_rows — AFML Ch.4 sample-weight
                    uniqueness, normalized to mean 1.0. Down-weights
                    observations whose triple-barrier windows overlap
                    heavily with neighbors.
        fwd_returns: float array length n_rows of FWD_RETURN_DAYS forward
                     returns aligned with labels
        symbols:    object array length n_rows naming the source symbol
        nifty_returns: pd.Series indexed by date — Nifty 50 fwd return for
                       benchmark eval (already aligned to features.date)
    """
    from ml.data import LiquidUniverseConfig, liquid_universe  # noqa: PLC0415
    from ml.data.bhavcopy_source import bhavcopy_download_with_fallback  # noqa: PLC0415
    from ml.labeling import (  # noqa: PLC0415
        TripleBarrierConfig,
        sample_weights_from_t1,
        triple_barrier_events,
    )

    universe = liquid_universe(LiquidUniverseConfig(top_n=UNIVERSE_TOP_N))
    if not universe:
        raise TrainerError("liquid_universe returned 0 symbols")
    logger.info("lgbm_signal_gate: universe size=%d", len(universe))

    # PR 179 — primary source: NSE bhavcopy via jugaad-data. yfinance is
    # the documented fallback when jugaad-data import fails or NSE
    # rate-limits us. Source choice is logged so the metrics row records
    # which feed the model trained on.
    end_date = pd.Timestamp.today().normalize()
    # DATA_PERIOD is "8y" — convert to a start date for the fallback API
    start_date = end_date - pd.DateOffset(years=8)
    try:
        raw, source = bhavcopy_download_with_fallback(
            symbols=universe,
            start=start_date.date(),
            end=end_date.date(),
            yfinance_kwargs={"interval": DATA_INTERVAL, "group_by": "ticker", "threads": True},
        )
        logger.info("lgbm_signal_gate: data source = %s", source)
    except Exception as exc:
        raise TrainerError(f"data download failed: {exc}") from exc

    if raw is None or raw.empty:
        raise TrainerError("data download returned empty frame")

    # bhavcopy returns (field, symbol); yfinance with group_by="ticker"
    # returns (ticker, field). Normalize to yfinance shape so the
    # downstream `raw[ticker]` lookups work without branching.
    if source == "bhavcopy":
        # Swap MultiIndex levels and rebrand symbol -> "{symbol}.NS"
        raw = raw.swaplevel(0, 1, axis=1)
        raw.columns = pd.MultiIndex.from_tuples(
            [(f"{sym}.NS", field) for sym, field in raw.columns]
        )
        raw = raw.sort_index(axis=1)

    tb_cfg = TripleBarrierConfig(
        profit_target_atr=PROFIT_TARGET_ATR,
        stop_loss_atr=STOP_LOSS_ATR,
        vertical_barrier_days=VERTICAL_BARRIER_DAYS,
    )

    feats: List[pd.DataFrame] = []
    labs: List[np.ndarray] = []
    weights: List[np.ndarray] = []
    fwds: List[np.ndarray] = []
    syms: List[np.ndarray] = []
    for sym in universe:
        ticker = f"{sym}.NS"
        try:
            sym_df = raw[ticker].dropna(subset=["Close", "High", "Low", "Volume"])
        except (KeyError, AttributeError):
            continue
        if len(sym_df) < 300:
            continue
        try:
            f = _compute_features(sym_df).dropna(subset=FEATURE_ORDER + ["_atr_raw"])
            if len(f) < 100:
                continue
            # PR 176 — get labels AND barrier-hit times so we can compute
            # AFML Ch.4 sample-weight uniqueness. t1 is per-bar inside
            # this symbol's local index.
            labels, t1_local = triple_barrier_events(
                close=sym_df.loc[f.index, "Close"].values,
                atr=f["_atr_raw"].values,
                cfg=tb_cfg,
            )
            sym_weights = sample_weights_from_t1(t1_local, n=len(f))
            # Drop the last vbd rows where label is forced to 0 (no future)
            keep = slice(0, len(f) - VERTICAL_BARRIER_DAYS)
            f = f.iloc[keep]
            labels = labels[keep]
            sym_weights = sym_weights[keep]
            fwd_ret = f["_fwd_return"].values
            mask = ~np.isnan(fwd_ret)
            f = f.loc[mask]
            labels = labels[mask]
            sym_weights = sym_weights[mask]
            fwd_ret = fwd_ret[mask]
            if len(f) < 50:
                continue
            feats.append(f[FEATURE_ORDER].copy())
            feats[-1].index = pd.MultiIndex.from_product(
                [[sym], f.index], names=["symbol", "date"],
            )
            labs.append(labels.astype(np.int8))
            weights.append(sym_weights.astype(np.float32))
            fwds.append(fwd_ret.astype(np.float32))
            syms.append(np.full(len(f), sym, dtype=object))
        except Exception as exc:  # noqa: BLE001
            logger.debug("symbol %s skipped: %s", sym, exc)

    if not feats:
        raise TrainerError("no symbols produced usable training data")

    X = pd.concat(feats, axis=0).sort_index(level="date")
    # Align labels + weights + fwd_returns + symbols to X's order
    full = pd.DataFrame({
        "label": np.concatenate(labs),
        "weight": np.concatenate(weights),
        "fwd_return": np.concatenate(fwds),
        "symbol": np.concatenate(syms),
    }, index=pd.concat(feats, axis=0).index).loc[X.index]
    y = full["label"].values
    sample_weight = full["weight"].values
    fwd_returns = full["fwd_return"].values

    # Nifty benchmark: same FWD_RETURN_DAYS on ^NSEI
    try:
        nifty = yf.download("^NSEI", period=DATA_PERIOD, interval=DATA_INTERVAL,
                            progress=False, auto_adjust=True)
        if isinstance(nifty.columns, pd.MultiIndex):
            nifty.columns = [c[0] for c in nifty.columns]
        nifty_fwd = nifty["Close"].pct_change(FWD_RETURN_DAYS).shift(-FWD_RETURN_DAYS).dropna()
    except Exception:
        logger.warning("Nifty benchmark download failed — proceeding without")
        nifty_fwd = pd.Series(dtype=float)

    return X, y, sample_weight, fwd_returns, full["symbol"].values, nifty_fwd


# ============================================================================
# LGBM training core
# ============================================================================

DEFAULT_LGBM_PARAMS = dict(
    objective="multiclass",
    num_class=3,                  # mapped from {-1,0,+1} -> {0,1,2}
    metric="multi_logloss",
    learning_rate=0.05,
    num_leaves=63,
    min_data_in_leaf=200,
    feature_fraction=0.85,
    bagging_fraction=0.85,
    bagging_freq=5,
    lambda_l1=0.1,
    lambda_l2=0.1,
    n_estimators=300,
    verbose=-1,
)


def _remap_labels_for_lgbm(y_signed: np.ndarray) -> np.ndarray:
    """LGBM multiclass needs 0..K-1 labels; map -1/0/+1 -> 0/1/2."""
    return (y_signed.astype(np.int64) + 1).astype(np.int64)


def _unmap_to_signed_predictions(class_idx: np.ndarray) -> np.ndarray:
    """Reverse: 0/1/2 -> -1/0/+1."""
    return class_idx.astype(np.int64) - 1


def _train_one_fold(
    X_tr: np.ndarray, y_tr: np.ndarray, w_tr: np.ndarray,
    X_te: np.ndarray, y_te: np.ndarray,
    fwd_te: np.ndarray, bench_te: np.ndarray,
    params: Dict[str, Any],
) -> Tuple[Any, dict]:
    """Train LGBM on one fold, return (model, metrics dict).

    PR 176 — pass AFML Ch.4 uniqueness weights via lgb's sample_weight
    so overlapping triple-barrier labels don't double-count information.
    """
    import lightgbm as lgb  # noqa: PLC0415
    from sklearn.metrics import accuracy_score  # noqa: PLC0415

    from ml.eval import BacktestEvalConfig, compute_backtest_metrics  # noqa: PLC0415

    model = lgb.LGBMClassifier(**params)
    model.fit(X_tr, y_tr, sample_weight=w_tr, eval_set=[(X_te, y_te)],
              callbacks=[lgb.log_evaluation(period=0)])
    y_pred = model.predict(X_te)
    acc = float(accuracy_score(y_te, y_pred))

    # Convert predicted classes back to signed direction for backtest eval
    signed_preds = _unmap_to_signed_predictions(y_pred)
    bt = compute_backtest_metrics(
        predictions=signed_preds.astype(float),
        forward_returns=fwd_te,
        benchmark_returns=bench_te if bench_te.size else None,
        cfg=BacktestEvalConfig(direction_neutral=True),
    )

    metrics = {
        "accuracy": acc,
        "sharpe": bt["sharpe"],
        "max_drawdown_pct": bt["max_drawdown_pct"],
        "calmar": bt["calmar"],
        "profit_factor": bt["profit_factor"],
        "win_rate": bt["win_rate"],
        "n_trades": bt["n_trades"],
        "total_return_pct": bt["total_return_pct"],
        "excess_return_pct": bt.get("excess_return_pct", 0.0),
    }
    return model, metrics


# ============================================================================
# Trainer
# ============================================================================


class LGBMSignalGateTrainer(Trainer):
    name = "lgbm_signal_gate"
    requires_gpu = False  # CPU LGBM scales to ~5min on this dataset
    depends_on: list[str] = []
    # PR 169: trades directionally; financial gate applies.

    def train(self, out_dir: Path) -> TrainResult:
        try:
            import lightgbm as lgb  # noqa: PLC0415, F401
        except ImportError as exc:
            raise TrainerError(f"lightgbm required: {exc}")

        t0 = time.time()
        X, y, sample_weight, fwd_returns, symbols, nifty_fwd = _build_dataset()
        logger.info(
            "lgbm_signal_gate: %d samples x %d features across %d symbols, "
            "weight stats: mean=%.3f min=%.3f max=%.3f",
            len(X), X.shape[1], len(np.unique(symbols)),
            float(sample_weight.mean()), float(sample_weight.min()), float(sample_weight.max()),
        )

        # Sort by date for proper WFCV. X has a MultiIndex (symbol, date);
        # we want global chronological order.
        sort_idx = np.argsort(np.asarray(X.index.get_level_values("date").values))
        X_arr = X.iloc[sort_idx].values
        y_remapped = _remap_labels_for_lgbm(y[sort_idx])
        weight_sorted = sample_weight[sort_idx]
        fwd_sorted = fwd_returns[sort_idx]

        # Build benchmark series aligned with sort order
        sorted_dates = X.iloc[sort_idx].index.get_level_values("date")
        if not nifty_fwd.empty:
            bench_arr = nifty_fwd.reindex(sorted_dates).fillna(0.0).values
        else:
            bench_arr = np.zeros_like(fwd_sorted)

        # Walk-forward CV
        cfg = WFCVConfig(
            strategy="rolling",
            n_folds=WFCV_FOLDS,
            test_size=WFCV_TEST_SIZE,
            train_size=WFCV_TRAIN_SIZE,
            embargo=WFCV_EMBARGO,
        )

        fold_metrics: list[dict] = []
        for fold_idx, (tr_idx, te_idx) in enumerate(walk_forward_split(len(X_arr), cfg)):
            try:
                _, m = _train_one_fold(
                    X_arr[tr_idx], y_remapped[tr_idx], weight_sorted[tr_idx],
                    X_arr[te_idx], y_remapped[te_idx],
                    fwd_sorted[te_idx], bench_arr[te_idx],
                    DEFAULT_LGBM_PARAMS,
                )
                m["fold"] = fold_idx
                fold_metrics.append(m)
                logger.info(
                    "lgbm fold %d  acc=%.3f  sharpe=%.2f  dd=%.2f  pf=%.2f  trades=%d",
                    fold_idx, m["accuracy"], m["sharpe"],
                    m["max_drawdown_pct"], m["profit_factor"], m["n_trades"],
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("lgbm fold %d failed: %s", fold_idx, exc)

        if not fold_metrics:
            raise TrainerError("all lgbm WFCV folds failed")

        # Final fit on all data → ship to production
        final_model = lgb.LGBMClassifier(**DEFAULT_LGBM_PARAMS)
        final_model.fit(X_arr, y_remapped, sample_weight=weight_sorted)
        artifact = out_dir / "lgbm_signal_gate.txt"
        final_model.booster_.save_model(str(artifact))

        # Aggregate metrics across folds — these go into model_versions.metrics
        # AND drive the promote gate (PR 167)
        agg = aggregate_fold_metrics(fold_metrics)
        # Class distribution for sanity
        class_dist = {
            "buy_pct": float((y == 1).mean()),
            "sell_pct": float((y == -1).mean()),
            "hold_pct": float((y == 0).mean()),
        }

        return TrainResult(
            artifacts=[artifact],
            metrics={
                "n_samples": int(len(X_arr)),
                "n_features": int(X_arr.shape[1]),
                "n_universe_symbols": int(len(np.unique(symbols))),
                "class_distribution": class_dist,
                "fit_seconds": round(time.time() - t0, 2),
                "n_folds_succeeded": len(fold_metrics),
                **agg,
            },
            notes=f"Triple-barrier labels (TP={PROFIT_TARGET_ATR}xATR, "
                  f"SL={STOP_LOSS_ATR}xATR, vbd={VERTICAL_BARRIER_DAYS}). "
                  f"AFML Ch.4 sample-weight uniqueness applied. "
                  f"WFCV {WFCV_FOLDS}-fold rolling. "
                  f"{len(np.unique(symbols))} NSE liquid stocks, {DATA_PERIOD}.",
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        # primary_metric is sharpe_mean from the WFCV aggregation —
        # promote gate reads this directly via PR 162's
        # promote_gate_passes() which falls back to non-_mean keys
        # too.
        m["primary_metric"] = "sharpe_mean"
        m["primary_value"] = result.metrics.get("sharpe_mean")
        return m
