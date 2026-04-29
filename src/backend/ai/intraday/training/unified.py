"""
TickPulse trainer — F1 5-minute intraday model.

Architecture (planned for the GPU run):
    * Input: 60 × 8 tensor per sample (60 five-min bars × 8 features:
      close, returns, RSI(14), MACD, VWAP-delta, volume z-score,
      regime one-hot, session-time-of-day sin/cos).
    * 2-layer Bidirectional LSTM, 128 hidden units, dropout 0.2.
    * Head: two outputs — up-probability (sigmoid) + expected return
      magnitude (linear).
    * Label: 1 if 15-min forward return > +0.25%, 0 if < -0.25%,
      neutral rows discarded.
    * Loss: BCE(up_prob) + 0.3 × MSE(exp_return).

Data:
    * 2 years of 5-min bars on the 50 most-liquid NSE names.
    * Ingested into ``tickpulse_bars_5m`` (new table owned by the
      training pipeline; created by the ingest pass before training).

This module is deliberately an interface scaffold. Real training code
and data loaders arrive when Rishi runs the unified pipeline on GPU.
Until then, ``is_ready()`` returns False so the orchestrator reports
"skipped (awaiting ingest + gpu)" cleanly rather than pretending.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from ...training import TrainingContext, TrainReport

logger = logging.getLogger(__name__)


MODEL_NAME = "tickpulse"
ARTIFACT_FILENAME = "tickpulse.pt"
META_FILENAME = "meta.json"


class TickPulseTrainer:
    """EngineTrainer for F1 intraday LSTM. Scaffold — real training
    code fills ``run()`` during the unified GPU pipeline."""

    model_name: str = MODEL_NAME

    def __init__(self):
        self._artifact_dir: Path | None = None

    def is_ready(self, ctx: TrainingContext) -> bool:
        # Hard deps: torch + 5-min bar table populated.
        try:
            import torch  # noqa: F401
        except Exception as exc:
            logger.info("TickPulse trainer: torch not available (%s)", exc)
            return False
        if ctx.supabase_client is None:
            logger.info("TickPulse trainer: no supabase client")
            return False
        try:
            rows = (
                ctx.supabase_client.table("tickpulse_bars_5m")
                .select("symbol", count="exact")
                .limit(1)
                .execute()
            )
            n = int(getattr(rows, "count", 0) or 0)
            if n < 10_000:
                logger.info("TickPulse trainer: %d bars — need ≥10k", n)
                return False
        except Exception as exc:
            logger.info("TickPulse trainer: bars table missing (%s)", exc)
            return False
        if not ctx.gpu_available:
            logger.info("TickPulse trainer: GPU required for LSTM")
            return False
        return True

    def run(self, ctx: TrainingContext) -> TrainReport:
        if not self.is_ready(ctx):
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason="awaiting torch + bar ingest + GPU",
            )

        out_dir = ctx.out_root / self.model_name / ctx.version_label
        if ctx.dry_run:
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason="dry_run",
            )

        # Real training body populated during the GPU run. Placeholder
        # keeps the orchestrator honest — no synthetic metrics.
        return TrainReport(
            model_name=self.model_name, status="skipped",
            reason="TickPulse training body not yet implemented "
                   "(interface in place for the unified GPU pipeline)",
        )

    def artifacts(self) -> List[Path]:
        if self._artifact_dir is None:
            return []
        return [
            self._artifact_dir / ARTIFACT_FILENAME,
            self._artifact_dir / META_FILENAME,
        ]


__all__ = ["TickPulseTrainer", "MODEL_NAME", "ARTIFACT_FILENAME", "META_FILENAME"]
