"""
F1 Intraday model surface (TickPulse engine).

Trained weights are produced by the unified training pipeline on GPU
(see ``memory/project_unified_training_plan_2026_04_19.md``). This
module exposes two things:

    load_model() → trained model instance or None
    IntradayModel — abstract predict(symbol, bars) contract

Until the unified training run populates weights, ``load_model()``
returns None and the TickPulse service declines to publish signals.
No heuristic fallback.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)


MODEL_NAME = "tickpulse"
ARTIFACT_FILENAME = "tickpulse.pt"    # PyTorch checkpoint
META_FILENAME = "meta.json"

_LOCK = threading.Lock()
_LOADED: dict = {"model": None, "path": None}


def _candidate_paths() -> list:
    paths = []
    # Registry-managed cache (populated after training pipeline uploads).
    try:
        from ..registry.model_registry import get_registry
        reg = get_registry()
        prod = reg.get_prod(MODEL_NAME) if reg else None
        if prod and prod.get("version"):
            try:
                cached = reg.fetch(MODEL_NAME, version=prod["version"])
                for p in cached:
                    if p.name == ARTIFACT_FILENAME:
                        paths.append(p)
            except Exception:
                pass
    except Exception:
        pass
    # Dev fallback — repo-local.
    repo_root = Path(__file__).resolve().parents[5]
    paths.append(repo_root / "ml" / "models" / "tickpulse" / ARTIFACT_FILENAME)
    return paths


def load_model() -> Optional[Any]:
    """Return the loaded intraday model, or None.

    Interface expected of the returned object:
        model.predict(symbol: str, bars: DataFrame) -> Optional[Dict]
        where Dict has keys:
            direction, entry_price, stop_loss, target, confidence, reasons
    """
    with _LOCK:
        if _LOADED["model"] is not None:
            return _LOADED["model"]
        # No trained weights ship in this repo — unified training pipeline
        # writes the first artifact to ml/models/tickpulse/ and uploads.
        for p in _candidate_paths():
            if not p.exists():
                continue
            try:
                # Real loader replaces this block when the training module
                # lands. For now, simply signal "not available" so the
                # TickPulse service short-circuits without error.
                logger.info("tickpulse artifact found at %s but loader not wired", p)
            except Exception as exc:
                logger.debug("tickpulse load %s failed: %s", p, exc)
        return None


def invalidate_cache():
    with _LOCK:
        _LOADED["model"] = None
        _LOADED["path"] = None


__all__ = ["load_model", "invalidate_cache", "MODEL_NAME"]
