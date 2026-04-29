"""
AutoPilot trainer — F4 FinRL-X ensemble.

Architecture (planned for the GPU run):
    * Env: FinRL-X style Nifty-500 portfolio env, daily rebalance,
      observation = {alpha_scores, open positions, regime one-hot,
      VIX, FII/DII net, cash pct}.
    * Agents (parallel training, ensemble at inference):
        - PPO  (Stable-Baselines3, actor-critic, 2M steps)
        - DDPG (Stable-Baselines3, continuous action, 1.5M steps)
        - A2C  (Stable-Baselines3, sync actor-critic, 2M steps)
    * Ensemble weighting at inference: regime-dependent
      (bull 50/30/20, sideways 40/30/30, bear 20/30/50 → PPO/DDPG/A2C).
    * Reward: net PnL minus transaction costs minus 0.5 × VaR penalty.

Data:
    * 5 years daily OHLCV + alpha_scores + regime_history for training
    * 1-year out-of-sample holdout

Interface scaffold today — real implementation arrives when the GPU
training pipeline runs. Gate returns False until all prerequisites are
in place (stable-baselines3, gym env, sufficient training data).
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from ...training import TrainingContext, TrainReport

logger = logging.getLogger(__name__)


MODEL_NAME = "autopilot"
ARTIFACT_FILES = ["ppo.zip", "ddpg.zip", "a2c.zip", "meta.json"]


class AutoPilotTrainer:
    """EngineTrainer for F4 AutoPilot RL ensemble. Scaffold."""

    model_name: str = MODEL_NAME

    def __init__(self):
        self._artifact_dir: Path | None = None

    def is_ready(self, ctx: TrainingContext) -> bool:
        try:
            import stable_baselines3  # noqa: F401
        except Exception as exc:
            logger.info("AutoPilot trainer: stable-baselines3 not available (%s)", exc)
            return False
        if ctx.supabase_client is None:
            return False
        try:
            rows = (
                ctx.supabase_client.table("alpha_scores")
                .select("trade_date", count="exact")
                .limit(1)
                .execute()
            )
            n = int(getattr(rows, "count", 0) or 0)
            if n < 500:
                logger.info("AutoPilot trainer: need ≥500 alpha_scores rows, have %d", n)
                return False
        except Exception as exc:
            logger.info("AutoPilot trainer: alpha_scores missing (%s)", exc)
            return False
        if not ctx.gpu_available:
            logger.info("AutoPilot trainer: GPU required for RL ensemble")
            return False
        return True

    def run(self, ctx: TrainingContext) -> TrainReport:
        if not self.is_ready(ctx):
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason="awaiting stable-baselines3 + alpha_scores + GPU",
            )
        if ctx.dry_run:
            return TrainReport(
                model_name=self.model_name, status="skipped",
                reason="dry_run",
            )
        return TrainReport(
            model_name=self.model_name, status="skipped",
            reason="AutoPilot training body not yet implemented "
                   "(interface in place for the unified GPU pipeline)",
        )

    def artifacts(self) -> List[Path]:
        if self._artifact_dir is None:
            return []
        return [self._artifact_dir / name for name in ARTIFACT_FILES]


__all__ = ["AutoPilotTrainer", "MODEL_NAME", "ARTIFACT_FILES"]
