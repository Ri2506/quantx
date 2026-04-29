"""
PR 145 — Earnings surprise XGBoost trainer (F9 EarningsScout).

Wraps ``src.backend.ai.earnings.training.trainer.train_and_save`` so the
existing earnings-surprise XGBoost classifier (beat / miss / inline)
gets registered into ``model_versions`` via the unified runner. The
heavy data-prep + fit logic lives in the original module — this
trainer is a thin adapter.

Per the unified-training-plan memory directive, this PR adds the
trainer module — actual training executes in Phase H.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


class EarningsXGBTrainer(Trainer):
    name = "earnings_xgb"
    requires_gpu = False  # XGBoost on tabular features fits in seconds-minutes
    depends_on: list[str] = []

    def train(self, out_dir: Path) -> TrainResult:
        try:
            from src.backend.ai.earnings.training.features import build_feature_frame  # noqa: PLC0415
            from src.backend.ai.earnings.training.trainer import train_and_save  # noqa: PLC0415
        except Exception as exc:
            raise TrainerError(f"earnings training module unimportable: {exc}")

        # Build the labeled (X, y) frame from historical NSE earnings
        # announcements + 10-year price history. The builder pulls from
        # Supabase (announcements + holdings_history snapshots) when
        # available and falls back to a yfinance/MoneyControl scrape.
        try:
            X, y = build_feature_frame()
        except Exception as exc:
            raise TrainerError(f"earnings feature build failed: {exc}")
        if len(X) < 30:
            raise TrainerError(f"insufficient earnings rows: {len(X)}")

        result = train_and_save(X, y, out_dir=out_dir)

        # ``train_and_save`` already returns a TrainResult-shaped object
        # but it's local to the legacy trainer; convert to ours so the
        # unified runner can register it generically.
        artifacts: List[Path]
        if hasattr(result, "artifacts"):
            artifacts = list(result.artifacts)
        else:
            artifacts = list(out_dir.glob("*"))

        metrics: Dict[str, Any] = dict(getattr(result, "metrics", {}) or {})
        metrics.setdefault("n_samples", int(len(X)))
        return TrainResult(
            artifacts=artifacts,
            metrics=metrics,
            notes=getattr(result, "notes", "XGBoost earnings-surprise classifier"),
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        # The legacy trainer reports `roc_auc` as the primary signal.
        if "roc_auc" in m:
            m["primary_metric"] = "roc_auc"
            m["primary_value"] = m.get("roc_auc")
        elif "accuracy" in m:
            m["primary_metric"] = "accuracy"
            m["primary_value"] = m.get("accuracy")
        return m
