"""
F5 AI SIP — AI-managed long-term portfolio.

Monthly rebalance pipeline::

    Qlib top-ranked candidates (from alpha_scores)
        → optional multi-factor quality screen
        → PyPortfolioOpt Black-Litterman optimizer (AI priors → weights)
        → ``ai_portfolio_holdings`` per Elite user

Public API::

    from src.backend.ai.portfolio import AIPortfolioManager, get_portfolio_manager

    mgr = get_portfolio_manager()
    proposal = mgr.build_proposal(universe_size=15, max_weight=0.07)
    # -> {"candidates": [...], "weights": {symbol: weight, ...}, "metrics": {...}}
"""

from .black_litterman import BLOptimizer, optimize_weights
from .engine import AIPortfolioManager, get_portfolio_manager
from .screener import QualityFilter, filter_universe

__all__ = [
    "AIPortfolioManager",
    "BLOptimizer",
    "QualityFilter",
    "filter_universe",
    "get_portfolio_manager",
    "optimize_weights",
]
