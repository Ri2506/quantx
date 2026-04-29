"""
Unified training surface.

Every engine that needs training exposes one module under
``backend.ai.<engine>.training`` that conforms to the ``Trainer``
protocol below. The unified orchestrator (``scripts/train_all_models.py``)
walks a known-order list of trainers, calls ``run()`` on each, collects
metrics, and uploads artifacts to the B2 registry as shadow versions.

Contract:

    class EngineTrainer:
        model_name: str               # e.g. "earnings_scout"
        def is_ready(self) -> bool    # deps + data present
        def run(self, *, ctx) -> TrainReport
            # produces artifacts on disk; no uploading here
        def artifacts(self) -> list[Path]   # files to register

Why a protocol and not a base class: engines need different training
frameworks (XGBoost, PyTorch, Stable-Baselines3, pyqlib). A duck-typed
protocol keeps each trainer free to choose its stack without inheriting
lifecycle machinery it doesn't need.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable

logger = logging.getLogger(__name__)


@dataclass
class TrainingContext:
    """Shared state passed into every trainer's ``run`` call."""
    out_root: Path              # ml/models/
    version_label: str          # e.g. "2026-05-01"
    supabase_client: Any = None
    gpu_available: bool = False
    dry_run: bool = False


@dataclass
class TrainReport:
    """Standard return value per trainer."""
    model_name: str
    status: str                 # "ok" | "skipped" | "failed"
    version: Optional[str] = None
    metrics: Dict[str, Any] = field(default_factory=dict)
    artifact_dir: Optional[str] = None
    artifact_files: List[str] = field(default_factory=list)
    reason: Optional[str] = None


@runtime_checkable
class EngineTrainer(Protocol):
    """Duck-typed interface every engine trainer must satisfy."""

    @property
    def model_name(self) -> str: ...

    def is_ready(self, ctx: TrainingContext) -> bool: ...

    def run(self, ctx: TrainingContext) -> TrainReport: ...

    def artifacts(self) -> List[Path]: ...


# ---------------------------------------------------------------- registry


def all_trainers() -> List[EngineTrainer]:
    """Canonical order the unified orchestrator walks. Order matters:
    cheaper CPU models before heavy GPU RL; dependent models after
    their prerequisites.

    Importing is lazy so a missing training framework (e.g. xgboost,
    torch, stable-baselines3) doesn't crash the orchestrator on startup
    — the individual trainer's ``is_ready()`` handles that."""
    trainers: List[EngineTrainer] = []

    # 1. EarningsScout — XGBoost, cheap.
    try:
        from ..earnings.training.unified import EarningsScoutTrainer
        trainers.append(EarningsScoutTrainer())
    except Exception as exc:
        logger.debug("skip EarningsScoutTrainer import: %s", exc)

    # 2. TickPulse — 5-min LSTM.
    try:
        from ..intraday.training.unified import TickPulseTrainer
        trainers.append(TickPulseTrainer())
    except Exception as exc:
        logger.debug("skip TickPulseTrainer import: %s", exc)

    # 3. Options-RL (F6) — options PPO.
    try:
        from ..fo.training.unified import OptionsRLTrainer
        trainers.append(OptionsRLTrainer())
    except Exception as exc:
        logger.debug("skip OptionsRLTrainer import: %s", exc)

    # 4. AutoPilot — FinRL-X ensemble. Runs last (GPU-heaviest).
    try:
        from ..autopilot.training.unified import AutoPilotTrainer
        trainers.append(AutoPilotTrainer())
    except Exception as exc:
        logger.debug("skip AutoPilotTrainer import: %s", exc)

    return trainers


__all__ = [
    "EngineTrainer",
    "TrainReport",
    "TrainingContext",
    "all_trainers",
]
