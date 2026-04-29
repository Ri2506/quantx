"""
AutoPilot (F4) — FinRL-X ensemble execution engine.

Trained weights load via ``load_model()``. Per the no-fallback rule,
returns None until the unified GPU pipeline produces artifacts.
"""

from __future__ import annotations

import logging
import threading
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

MODEL_NAME = "autopilot"

_LOCK = threading.Lock()
_LOADED: dict = {"model": None}


def load_model() -> Optional[Any]:
    """Load the FinRL-X ensemble from the registry. Returns None
    until trained weights are available."""
    with _LOCK:
        if _LOADED["model"] is not None:
            return _LOADED["model"]
        try:
            from ..registry.model_registry import get_registry
            reg = get_registry()
            prod = reg.get_prod(MODEL_NAME) if reg else None
            if prod and prod.get("version"):
                # Real loader wired here when the training module lands.
                logger.info(
                    "AutoPilot: registry has v%s but loader not yet wired",
                    prod.get("version"),
                )
        except Exception:
            pass
        return None


def invalidate_cache():
    with _LOCK:
        _LOADED["model"] = None


__all__ = ["load_model", "invalidate_cache", "MODEL_NAME"]
