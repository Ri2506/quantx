"""
Options-RL trainer — F6 dedicated options agent.

Architecture (planned for the GPU run):
    * Env: custom Gym env wrapping NIFTY / BANKNIFTY / FINNIFTY weekly
      option chains. Observation = {spot, IV surface, VIX, regime,
      days-to-expiry, positions, Greeks}.
    * Action space: {0=no-op, 1=bull-call-spread, 2=bear-put-spread,
      3=iron-condor, 4=long-straddle, 5=short-strangle,
      6=iron-butterfly} × {1..10 lots}.
    * Agent: PPO (Stable-Baselines3), 3M steps.
    * Reward: premium captured minus adverse-move losses minus margin
      carrying cost.

Data:
    * 5 years of weekly option chain snapshots (needs ingestion — big
      job, not in this scope).

Interface scaffold today — implementation lands during the GPU run.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from ...training import TrainingContext, TrainReport

logger = logging.getLogger(__name__)


MODEL_NAME = "options_rl"
ARTIFACT_FILES = ["options_ppo.zip", "meta.json"]


class OptionsRLTrainer:
    """EngineTrainer for F6 Options-RL PPO agent. Scaffold."""

    model_name: str = MODEL_NAME

    def __init__(self):
        self._artifact_dir: Path | None = None

    def is_ready(self, ctx: TrainingContext) -> bool:
        try:
            import stable_baselines3  # noqa: F401
            import gymnasium  # noqa: F401
        except Exception as exc:
            logger.info("Options-RL trainer: RL deps not available (%s)", exc)
            return False
        if ctx.supabase_client is None:
            return False
        # Requires an ``options_chain_history`` table that doesn't exist yet.
        try:
            rows = (
                ctx.supabase_client.table("options_chain_history")
                .select("trade_date", count="exact")
                .limit(1)
                .execute()
            )
            n = int(getattr(rows, "count", 0) or 0)
            if n < 1000:
                logger.info("Options-RL trainer: need ≥1000 chain rows, have %d", n)
                return False
        except Exception as exc:
            logger.info("Options-RL trainer: chain table missing (%s)", exc)
            return False
        if not ctx.gpu_available:
            logger.info("Options-RL trainer: GPU recommended for RL")
            return False
        return True

    def run(self, ctx: TrainingContext) -> TrainReport:
        if not self.is_ready(ctx):
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason="awaiting RL deps + options chain history + GPU",
            )
        if ctx.dry_run:
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason="dry_run",
            )
        return TrainReport(
            model_name=self.model_name, status="skipped",
            reason="Options-RL training body not yet implemented "
                   "(interface in place for the unified GPU pipeline)",
        )

    def artifacts(self) -> List[Path]:
        if self._artifact_dir is None:
            return []
        return [self._artifact_dir / name for name in ARTIFACT_FILES]


__all__ = ["OptionsRLTrainer", "MODEL_NAME", "ARTIFACT_FILES"]
