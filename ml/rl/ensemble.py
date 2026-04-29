"""
PR 131 — FinRL-X-style ensemble of PPO + DDPG + A2C.

Per Step 1 §F4, the AutoPilot policy is a regime-conditioned blend:

    Bull regime     → PPO 50%, DDPG 30%, A2C 20%
    Sideways regime → PPO 30%, DDPG 40%, A2C 30%
    Bear regime     → PPO 50%, DDPG 30%, A2C 20%, with position limits halved

Each policy is an SB3 model loaded by name from B2 via ModelRegistry.
Inference returns the weighted average action vector. Training is handled
by ``ml.training.trainers.finrl_x_ensemble``.

Public surface:
    ens = FinRLXEnsemble.load_prod()
    weights = ens.act(obs, regime="bull")
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)


# Regime → (PPO, DDPG, A2C) blend. Source of truth: Step 1 §F4.
REGIME_WEIGHTS: Dict[str, Dict[str, float]] = {
    "bull":     {"ppo": 0.50, "ddpg": 0.30, "a2c": 0.20},
    "sideways": {"ppo": 0.30, "ddpg": 0.40, "a2c": 0.30},
    "bear":     {"ppo": 0.50, "ddpg": 0.30, "a2c": 0.20},
}

# Bear regime caps total leverage to 50% per Step 1 §F4.
BEAR_POSITION_SCALE = 0.5


@dataclass
class FinRLXEnsemble:
    ppo: object
    ddpg: object
    a2c: object

    @classmethod
    def load_prod(cls, *, registry=None) -> "FinRLXEnsemble":
        """Load the prod version of each policy from B2 via ModelRegistry."""
        from src.backend.ai.registry import get_registry  # noqa: PLC0415
        from stable_baselines3 import A2C, DDPG, PPO  # noqa: PLC0415

        reg = registry or get_registry()
        ppo_dir = reg.resolve("finrl_x_ppo")
        ddpg_dir = reg.resolve("finrl_x_ddpg")
        a2c_dir = reg.resolve("finrl_x_a2c")
        return cls(
            ppo=PPO.load(str(ppo_dir / "model.zip")),
            ddpg=DDPG.load(str(ddpg_dir / "model.zip")),
            a2c=A2C.load(str(a2c_dir / "model.zip")),
        )

    def act(self, obs: np.ndarray, *, regime: str = "sideways") -> np.ndarray:
        """Return blended target weights for the given observation."""
        weights = REGIME_WEIGHTS.get(regime, REGIME_WEIGHTS["sideways"])

        ppo_a, _ = self.ppo.predict(obs, deterministic=True)
        ddpg_a, _ = self.ddpg.predict(obs, deterministic=True)
        a2c_a, _ = self.a2c.predict(obs, deterministic=True)

        blended = (
            weights["ppo"] * np.asarray(ppo_a, dtype=np.float64)
            + weights["ddpg"] * np.asarray(ddpg_a, dtype=np.float64)
            + weights["a2c"] * np.asarray(a2c_a, dtype=np.float64)
        )
        blended = np.clip(blended, 0.0, 1.0)
        if regime == "bear":
            blended = blended * BEAR_POSITION_SCALE
        return blended


__all__ = ["FinRLXEnsemble", "REGIME_WEIGHTS", "BEAR_POSITION_SCALE"]
