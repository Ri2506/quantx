"""
PR 128 — Trainer protocol.

Every ML feature in the v1 plan registers a Trainer subclass here. The
runner discovers them via ``discover_trainers()`` and orchestrates a
single E2E pipeline run.

Contract:
    name              — unique slug, also used as ``model_versions.model_name``
    requires_gpu      — set True for RL / TFT-scale training; the runner
                        skips on CPU when this is True (unless --force-cpu)
    train(out_dir)    — produce artifact files in ``out_dir``; return
                        list of paths + a metrics dict
    evaluate(...)     — optional walk-forward / OOS metrics; return dict
    register(...)     — default impl uploads to B2 + writes
                        ``model_versions`` row via ModelRegistry
"""

from __future__ import annotations

import abc
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class TrainerError(RuntimeError):
    """Raised when a trainer cannot complete (data missing, GPU OOM, etc.)."""


@dataclass
class TrainResult:
    """Result returned by ``Trainer.train()`` and threaded through eval+register."""

    artifacts: List[Path]
    metrics: Dict[str, Any] = field(default_factory=dict)
    notes: Optional[str] = None


class Trainer(abc.ABC):
    """Base class every ML trainer module subclasses.

    Trainers are pure: ``train()`` writes artifacts under ``out_dir``,
    returns a TrainResult, and never touches the registry directly.
    The runner handles registration so a single eval+promote policy
    applies across every model.
    """

    #: Unique slug. Must match ``model_versions.model_name``.
    name: str = ""
    #: Skip this trainer when no GPU is available. RL + TFT-scale.
    requires_gpu: bool = False
    #: Optional list of other trainer names that must run first
    #: (e.g. the F2 ensemble waits on regime_hmm so it picks the
    #: just-trained version when re-evaluating).
    depends_on: List[str] = []

    @abc.abstractmethod
    def train(self, out_dir: Path) -> TrainResult:
        """Train the model and write artifact files into ``out_dir``."""

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        """Walk-forward / OOS evaluation. Override per model. Default: noop."""
        return dict(result.metrics)

    def register(
        self,
        result: TrainResult,
        eval_metrics: Dict[str, Any],
        *,
        trained_by: Optional[str] = None,
        git_sha: Optional[str] = None,
        promote: bool = False,
    ) -> Dict[str, Any]:
        """Upload artifacts and write a ``model_versions`` row.

        ``promote=True`` flips the new row to prod (and demotes the prior
        prod row inside ModelRegistry.promote — the runner only sets this
        when eval gates pass).
        """
        # Lazy import — base.py shouldn't pull the backend tree when used
        # by training scripts that just want to instantiate trainers.
        from src.backend.ai.registry import get_registry

        reg = get_registry()
        merged_metrics = {**result.metrics, **eval_metrics}
        row = reg.register(
            self.name,
            result.artifacts,
            metrics=merged_metrics,
            trained_by=trained_by,
            git_sha=git_sha,
            notes=result.notes,
        )
        if promote:
            row = reg.promote(self.name, int(row["version"]))
        return row
