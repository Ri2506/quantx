"""
PR 128 — LightGBM signal-gate trainer.

Wraps the existing ``scripts/train_lgbm.py`` (3-class HOLD/BUY/SELL on
15-feature OHLCV-derived inputs) as a Trainer module so the unified
runner produces ``lgbm_signal_gate.txt`` and registers it into
``model_versions``.

The script's heavy lifting (yfinance batch download + dataset build +
TimeSeriesSplit CV + final fit + native-format save) lives in
``scripts/train_lgbm.py`` already. We import its building blocks rather
than duplicating logic; the trainer routes the artifact to ``out_dir``
instead of the legacy on-disk path.
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Dict

import numpy as np

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


class LGBMSignalGateTrainer(Trainer):
    name = "lgbm_signal_gate"
    requires_gpu = False  # ~5 min on CPU for ~50 NSE stocks
    depends_on: list[str] = []

    def train(self, out_dir: Path) -> TrainResult:
        try:
            import lightgbm as lgb  # noqa: PLC0415
            from sklearn.metrics import accuracy_score  # noqa: PLC0415
            from sklearn.model_selection import TimeSeriesSplit  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(f"missing training dep: {exc}")

        # Re-use the existing data + feature pipeline.
        try:
            from scripts import train_lgbm as legacy  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(f"scripts.train_lgbm not importable: {exc}")

        symbols = legacy.load_symbols()
        tickers = [f"{s}.NS" for s in symbols]
        stock_dfs: Dict[str, Any] = {}
        for batch_idx in range(0, len(tickers), legacy.BATCH_SIZE):
            batch = tickers[batch_idx:batch_idx + legacy.BATCH_SIZE]
            for ticker, df in legacy.download_batch(batch).items():
                stock_dfs[ticker.replace(".NS", "")] = df

        if len(stock_dfs) < 30:
            raise TrainerError(
                f"too few stocks downloaded ({len(stock_dfs)}); check yfinance",
            )

        X, y = legacy.build_dataset(stock_dfs)
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

        # 5-fold time-series CV for the eval metric.
        tscv = TimeSeriesSplit(n_splits=5)
        fold_acc = []
        for train_idx, val_idx in tscv.split(X):
            m = lgb.LGBMClassifier(**legacy.LGBM_PARAMS)
            m.fit(
                X[train_idx], y[train_idx],
                eval_set=[(X[val_idx], y[val_idx])],
                callbacks=[lgb.log_evaluation(period=0)],
            )
            fold_acc.append(float(accuracy_score(y[val_idx], m.predict(X[val_idx]))))
        cv_acc = float(np.mean(fold_acc))

        # Final fit on all rows.
        t0 = time.time()
        final = lgb.LGBMClassifier(**legacy.LGBM_PARAMS)
        final.fit(X, y)
        fit_seconds = time.time() - t0

        artifact = out_dir / "lgbm_signal_gate.txt"
        final.booster_.save_model(str(artifact))

        class_counts = {legacy.LABEL_MAP[c]: int((y == c).sum()) for c in legacy.LABEL_MAP}
        return TrainResult(
            artifacts=[artifact],
            metrics={
                "n_samples": int(X.shape[0]),
                "n_features": int(X.shape[1]),
                "n_stocks": int(len(stock_dfs)),
                "cv_accuracy_mean": cv_acc,
                "cv_accuracy_per_fold": [round(a, 4) for a in fold_acc],
                "fit_seconds": round(fit_seconds, 2),
                "class_counts": class_counts,
            },
            notes=f"5-fold TS CV across {len(stock_dfs)} NSE stocks",
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        m["primary_metric"] = "cv_accuracy_mean"
        m["primary_value"] = result.metrics.get("cv_accuracy_mean")
        return m
