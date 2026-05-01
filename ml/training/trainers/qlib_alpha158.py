"""
PR 199 — Qlib Alpha158 + LightGBM trainer (real Microsoft pyqlib).

Per Step 2 §1.4 (locked) — F2/F3/F5/F10 cross-sectional alpha spine.
Uses **real Microsoft Qlib** (`pip install pyqlib`), specifically:
  - qlib.contrib.data.handler.Alpha158  — 158 cross-sectional factors
  - qlib.contrib.model.gbdt.LGBModel    — Qlib's LightGBM wrapper

NO custom port, NO in-house re-implementation. We initialize Qlib
against an NSE provider directory (built once via
``scripts/ingest_nse_to_qlib.py``), then run Microsoft's standard
Alpha158 → LGBModel pipeline against our universe.

This is the trainer registration so ``python -m ml.training.runner --all``
picks it up. The heavy lifting still lives in the standalone
``scripts/train_qlib_alpha158.py`` (which Rishi can also run manually
on Colab Pro per Step 2 §5 retrain ritual).

Eval: rank-IC mean (primary), pearson IC, ICIR, long-short decile
spread. Promote-gate friendly via skip_promote_gate=True since IC is
the right metric for cross-sectional rank models, not Sharpe.

Provider directory:
    Default ``~/.qlib/qlib_data/nse_data`` — must exist before training.
    Bootstrap: ``python scripts/ingest_nse_to_qlib.py``
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


# Default Qlib provider directory. Override via env QLIB_PROVIDER_URI
# when running on RunPod / Colab.
DEFAULT_PROVIDER_URI = os.path.expanduser("~/.qlib/qlib_data/nse_data")

# Universe + window match scripts/train_qlib_alpha158.py defaults.
DEFAULT_INSTRUMENTS = "nse_all"
DEFAULT_HORIZON = 5            # 5-day forward return
DEFAULT_TRAIN_START = "2018-01-01"
DEFAULT_TRAIN_END = "2024-06-30"
DEFAULT_VALID_START = "2024-07-01"
DEFAULT_VALID_END = "2024-12-31"
DEFAULT_OOS_START = "2025-01-01"
DEFAULT_OOS_END = "2026-04-18"


class QlibAlpha158Trainer(Trainer):
    name = "qlib_alpha158"
    requires_gpu = False   # LightGBM CPU is fast on Alpha158 features
    depends_on: list[str] = []
    # Cross-sectional rank model — primary metric is rank-IC, not
    # Sharpe. Skip the financial promote gate; IC threshold is checked
    # in the metrics-evaluation step instead.
    skip_promote_gate: bool = True

    def train(self, out_dir: Path) -> TrainResult:
        # --- 1. Verify pyqlib is installed (real Microsoft library) ---
        try:
            import qlib  # noqa: PLC0415
            from qlib.contrib.data.handler import Alpha158  # noqa: PLC0415
            from qlib.contrib.model.gbdt import LGBModel  # noqa: PLC0415
            from qlib.data.dataset import DatasetH  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(
                "pyqlib not installed — pip install pyqlib (Microsoft Qlib)"
            ) from exc

        # --- 2. Verify provider directory exists ---
        provider_uri = os.environ.get("QLIB_PROVIDER_URI", DEFAULT_PROVIDER_URI)
        if not Path(provider_uri).expanduser().exists():
            raise TrainerError(
                f"Qlib provider directory missing: {provider_uri}. "
                f"Run: python scripts/ingest_nse_to_qlib.py first."
            )

        qlib.init(provider_uri=provider_uri, region="cn")
        logger.info("Qlib initialized: provider_uri=%s", provider_uri)

        # --- 3. Build Alpha158 handler exactly as Microsoft's CSI300 example ---
        horizon = DEFAULT_HORIZON
        instruments = DEFAULT_INSTRUMENTS
        label_expr = f"Ref($close, -{horizon}) / $close - 1"
        handler = Alpha158(
            instruments=instruments,
            start_time=DEFAULT_TRAIN_START,
            end_time=DEFAULT_OOS_END,
            fit_start_time=DEFAULT_TRAIN_START,
            fit_end_time=DEFAULT_TRAIN_END,
            label=([label_expr], ["LABEL0"]),
            infer_processors=[
                {"class": "RobustZScoreNorm",
                 "kwargs": {"fields_group": "feature", "clip_outlier": True}},
                {"class": "Fillna", "kwargs": {"fields_group": "feature"}},
            ],
            learn_processors=[
                {"class": "DropnaLabel"},
                {"class": "CSRankNorm", "kwargs": {"fields_group": "label"}},
            ],
        )
        dataset = DatasetH(
            handler=handler,
            segments={
                "train": (DEFAULT_TRAIN_START, DEFAULT_TRAIN_END),
                "valid": (DEFAULT_VALID_START, DEFAULT_VALID_END),
                "test": (DEFAULT_OOS_START, DEFAULT_OOS_END),
            },
        )

        # --- 4. Build LGBModel with Qlib's CSI300 Alpha158 hyperparams ---
        model = LGBModel(
            loss="mse", learning_rate=0.0421,
            max_depth=8, num_leaves=210,
            colsample_bytree=0.8879, subsample=0.8789,
            lambda_l1=205.67, lambda_l2=580.96,
            num_threads=4, early_stopping_rounds=30,
            num_boost_round=500,
        )
        logger.info("Fitting Qlib LGBModel on Alpha158 features...")
        model.fit(dataset)

        # --- 5. OOS evaluation: rank-IC + decile spread ---
        pred = model.predict(dataset, segment="test")
        if isinstance(pred, pd.DataFrame):
            pred_df = pred
        else:
            pred_df = pred.to_frame("score")
        if "score" not in pred_df.columns:
            pred_df.columns = ["score"]
        label_df = dataset.prepare(
            "test", col_set="label", data_key=handler.DK_R,
        )
        if isinstance(label_df, pd.DataFrame) and label_df.shape[1] == 1:
            label_df.columns = ["LABEL0"]

        merged = pred_df.join(label_df, how="inner").dropna()
        if merged.empty:
            raise TrainerError("Qlib OOS prediction merge produced empty frame")

        pearson, spearman = [], []
        for _, grp in merged.groupby(level="datetime"):
            if len(grp) < 20:
                continue
            pearson.append(grp["score"].corr(grp["LABEL0"]))
            spearman.append(grp["score"].corr(grp["LABEL0"], method="spearman"))
        merged["decile"] = merged.groupby(level="datetime")["score"].transform(
            lambda x: pd.qcut(x, 10, labels=False, duplicates="drop"),
        )
        top = float(merged[merged["decile"] == 9]["LABEL0"].mean())
        bot = float(merged[merged["decile"] == 0]["LABEL0"].mean())

        metrics = {
            "pearson_ic_mean": float(np.nanmean(pearson)) if pearson else 0.0,
            "rank_ic_mean": float(np.nanmean(spearman)) if spearman else 0.0,
            "rank_ic_std": float(np.nanstd(spearman)) if spearman else 0.0,
            "rank_icir": float(
                np.nanmean(spearman) / (np.nanstd(spearman) + 1e-9)
            ) if spearman else 0.0,
            "top_decile_mean_return": top,
            "bottom_decile_mean_return": bot,
            "long_short_spread": top - bot,
            "oos_rows": int(len(merged)),
            "oos_symbols": int(merged.index.get_level_values("instrument").nunique()),
            "qlib_version": getattr(qlib, "__version__", "unknown"),
            "handler_class": "qlib.contrib.data.handler.Alpha158",
            "model_class": "qlib.contrib.model.gbdt.LGBModel",
        }

        # --- 6. Save artifact (native LightGBM booster + meta) ---
        out_dir.mkdir(parents=True, exist_ok=True)
        booster = getattr(model, "model", None)
        if booster is None:
            raise TrainerError("LGBModel.model is None — fit failed silently")
        artifact = out_dir / "qlib_alpha158.txt"
        booster.save_model(str(artifact))

        logger.info(
            "qlib_alpha158: rank_ic=%.4f icir=%.2f LS_spread=%.4f",
            metrics["rank_ic_mean"], metrics["rank_icir"],
            metrics["long_short_spread"],
        )

        return TrainResult(
            artifacts=[artifact],
            metrics=metrics,
            notes=(
                f"Real Microsoft Qlib Alpha158 + LGBModel on {instruments}, "
                f"{DEFAULT_TRAIN_START}->{DEFAULT_TRAIN_END} train, "
                f"OOS {DEFAULT_OOS_START}->{DEFAULT_OOS_END}"
            ),
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        m["primary_metric"] = "rank_ic_mean"
        m["primary_value"] = result.metrics.get("rank_ic_mean")
        return m
