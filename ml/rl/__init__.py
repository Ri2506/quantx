"""
PR 131 — F4 AutoPilot reinforcement-learning stack.

Public surface:
    from ml.rl import NSETradingEnv, FinRLXEnsemble

The env is a Gymnasium environment over a Nifty-N portfolio with daily
rebalancing actions (target weight per asset). The ensemble blends PPO,
DDPG, and A2C policies per regime per Step 1 §F4.
"""

from .cvar_reward import CVaRConfig, CVaRRewardShaper, make_cvar_wrapper
from .env import NSETradingEnv
from .ensemble import FinRLXEnsemble

__all__ = [
    "CVaRConfig",
    "CVaRRewardShaper",
    "FinRLXEnsemble",
    "NSETradingEnv",
    "make_cvar_wrapper",
]
