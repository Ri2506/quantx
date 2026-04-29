"""
EarningsScout trainer — unified interface adapter.

Wraps the existing ``train_and_save`` + ``build_feature_frame`` from
PR 51 into the ``EngineTrainer`` protocol the unified orchestrator
expects. No training logic lives here — this is pure glue.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from ...training import EngineTrainer, TrainingContext, TrainReport
from .features import build_feature_frame
from .trainer import (
    MODEL_NAME, ARTIFACT_FILENAME, META_FILENAME,
    train_and_save,
)

logger = logging.getLogger(__name__)


class EarningsScoutTrainer:
    """EngineTrainer implementation for F9 EarningsScout."""

    model_name: str = MODEL_NAME

    def __init__(self, min_rows: int = 50):
        self.min_rows = min_rows
        self._artifact_dir: Path | None = None

    # -- EngineTrainer --------------------------------------------------

    def is_ready(self, ctx: TrainingContext) -> bool:
        # Hard deps: xgboost + sklearn.
        try:
            import xgboost  # noqa: F401
            import sklearn  # noqa: F401
        except Exception as exc:
            logger.info("EarningsScout not ready: %s", exc)
            return False
        return True

    def run(self, ctx: TrainingContext) -> TrainReport:
        if not self.is_ready(ctx):
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason="xgboost/sklearn not installed",
            )
        try:
            X, y, _syms = build_feature_frame(
                supabase_client=ctx.supabase_client, min_rows=self.min_rows,
            )
        except ValueError as exc:
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason=str(exc),
            )

        out_dir = ctx.out_root / self.model_name / ctx.version_label
        if ctx.dry_run:
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason=f"dry_run (would train on {len(X)} rows)",
                metrics={"n_rows": int(len(X))},
            )

        try:
            result = train_and_save(
                X, y, out_dir=out_dir, version=ctx.version_label,
            )
        except Exception as exc:
            logger.exception("EarningsScout training failed")
            return TrainReport(
                model_name=self.model_name, status="failed",
                reason=str(exc),
            )

        self._artifact_dir = out_dir
        return TrainReport(
            model_name=self.model_name, status="ok",
            version=result.version,
            metrics=result.metrics,
            artifact_dir=str(out_dir),
            artifact_files=[str(p) for p in self.artifacts()],
        )

    def artifacts(self) -> List[Path]:
        if self._artifact_dir is None:
            return []
        return [
            self._artifact_dir / ARTIFACT_FILENAME,
            self._artifact_dir / META_FILENAME,
        ]
