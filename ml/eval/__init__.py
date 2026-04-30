"""
PR 162 — model-eval primitives.

Trainer-facing evaluation layer separate from the full strategy
backtester in ``ml/backtest/``. Trainers call these functions to
compute Sharpe, drawdown, Calmar, win-rate, profit-factor, and benchmark-
relative metrics on a per-fold basis. The promote gate (PR 167) reads
the aggregated values to decide whether ``is_prod=TRUE`` is allowed.

The full backtester engine (`ml/backtest/engine.py`) handles strategy
simulation with slippage/brokerage/STT and is used outside of training
(scanner-lab walk-throughs, manual user backtests). This module is
intentionally lightweight: a frozen series of predictions + realized
returns + a benchmark goes in, a dict of metrics comes out.
"""

from .backtest_eval import (
    BacktestEvalConfig,
    compute_backtest_metrics,
    metrics_from_returns,
    promote_gate_passes,
)
from .overfitting import (
    deflated_sharpe_ratio,
    dsr_pbo_from_fold_returns,
    expected_max_sharpe,
    probability_of_backtest_overfitting,
)

__all__ = [
    "BacktestEvalConfig",
    "compute_backtest_metrics",
    "metrics_from_returns",
    "promote_gate_passes",
    "deflated_sharpe_ratio",
    "dsr_pbo_from_fold_returns",
    "expected_max_sharpe",
    "probability_of_backtest_overfitting",
]
