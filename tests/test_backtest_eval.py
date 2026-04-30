"""
PR 162 — tests for backtest-driven trainer eval.

Verifies:
  - metrics_from_returns produces sane Sharpe / drawdown / Calmar
  - compute_backtest_metrics handles discrete + probability predictions
  - promote_gate_passes correctly accepts/rejects on each threshold
  - empty input returns the JSON-stable sentinel (no NaN/None leak)
"""

from __future__ import annotations

import numpy as np
import pytest

from ml.eval import (
    BacktestEvalConfig,
    compute_backtest_metrics,
    metrics_from_returns,
    promote_gate_passes,
)


# ============================================================================
# metrics_from_returns
# ============================================================================


def test_sharpe_positive_for_consistent_winning_returns():
    # Daily return of +0.1% with low vol → high Sharpe
    rets = np.full(252, 0.001)
    rets += np.random.RandomState(0).normal(0, 0.0005, size=252)
    m = metrics_from_returns(rets)
    assert m["sharpe"] > 5.0, f"expected high sharpe; got {m['sharpe']}"
    assert m["max_drawdown_pct"] >= -0.05  # shallow drawdown


def test_sharpe_zero_for_zero_returns():
    rets = np.zeros(252)
    m = metrics_from_returns(rets)
    assert m["sharpe"] == 0.0
    assert m["max_drawdown_pct"] == 0.0


def test_max_drawdown_negative_when_equity_drops():
    # Equity goes 1.0 → 1.10 → 0.90 → 1.0. Max dd should be (0.90-1.10)/1.10 = -18%
    daily = np.array([0.1, -0.18, 0.111])
    m = metrics_from_returns(daily)
    assert m["max_drawdown_pct"] < -0.15
    assert m["max_drawdown_pct"] >= -0.20


def test_calmar_positive_when_strategy_profitable():
    rets = np.array([0.01] * 250 + [-0.05, -0.02])
    m = metrics_from_returns(rets)
    assert m["calmar"] > 0


def test_benchmark_relative_metrics_added_when_provided():
    rets = np.full(100, 0.001)
    bench = np.full(100, 0.0005)
    m = metrics_from_returns(rets, bench)
    assert "benchmark_return_pct" in m
    assert "excess_return_pct" in m
    assert "information_ratio" in m
    assert m["excess_return_pct"] > 0  # strategy beats benchmark


def test_empty_returns_sentinel():
    m = metrics_from_returns([])
    assert m["sharpe"] == 0.0
    assert m["n_periods"] == 0
    assert m["primary_metric"] == "sharpe"


# ============================================================================
# compute_backtest_metrics
# ============================================================================


def test_discrete_predictions_long_short_flat():
    # Pred = always LONG (1). Returns are positive on average.
    n = 252
    forward = np.full(n, 0.001)
    preds = np.ones(n)
    out = compute_backtest_metrics(preds, forward)
    assert out["n_trades"] >= 1
    assert out["sharpe"] > 0
    assert out["total_return_pct"] > 0


def test_probability_predictions_with_threshold():
    # All predictions just barely above 0.5 (below threshold) → no trades
    cfg = BacktestEvalConfig(direction_neutral=False, confidence_threshold=0.05)
    preds = np.full(100, 0.51)  # below 0.55 upper gate
    rets = np.full(100, 0.001)
    out = compute_backtest_metrics(preds, rets, cfg=cfg)
    assert out["n_trades"] == 0


def test_probability_predictions_above_threshold_creates_trades():
    cfg = BacktestEvalConfig(direction_neutral=False, confidence_threshold=0.05)
    preds = np.full(100, 0.70)  # well above upper gate → constant LONG
    rets = np.full(100, 0.001)
    out = compute_backtest_metrics(preds, rets, cfg=cfg)
    assert out["n_trades"] >= 1
    assert out["total_return_pct"] > 0


def test_transaction_costs_reduce_return():
    n = 100
    forward = np.full(n, 0.001)
    # Alternating long/short → many position changes → many cost hits
    preds = np.tile([1, -1], n // 2)
    cfg_zero_cost = BacktestEvalConfig(cost_bps=0.0)
    cfg_high_cost = BacktestEvalConfig(cost_bps=50.0)
    free = compute_backtest_metrics(preds, forward, cfg=cfg_zero_cost)
    costly = compute_backtest_metrics(preds, forward, cfg=cfg_high_cost)
    assert costly["total_return_pct"] < free["total_return_pct"]


def test_mismatched_lengths_raises():
    with pytest.raises(ValueError):
        compute_backtest_metrics(np.array([1.0, 0.0]), np.array([0.01]))


# ============================================================================
# promote_gate_passes
# ============================================================================


def test_promote_gate_passes_when_all_thresholds_met():
    metrics = {
        "sharpe_mean": 1.5,
        "max_drawdown_pct_mean": -0.18,
        "calmar_mean": 0.8,
        "profit_factor_mean": 1.8,
        "n_trades_mean": 50,
        "excess_return_pct_mean": 0.10,
    }
    passed, reasons = promote_gate_passes(metrics)
    assert passed is True, f"should pass; reasons: {reasons}"
    assert reasons == []


def test_promote_gate_fails_low_sharpe():
    metrics = {
        "sharpe_mean": 0.5,  # below 1.0 threshold
        "max_drawdown_pct_mean": -0.18,
        "calmar_mean": 0.8,
        "profit_factor_mean": 1.8,
        "n_trades_mean": 50,
        "excess_return_pct_mean": 0.10,
    }
    passed, reasons = promote_gate_passes(metrics)
    assert passed is False
    assert any("Sharpe" in r for r in reasons)


def test_promote_gate_fails_deep_drawdown():
    metrics = {
        "sharpe_mean": 1.5,
        "max_drawdown_pct_mean": -0.40,  # deeper than -0.25
        "calmar_mean": 0.8,
        "profit_factor_mean": 1.8,
        "n_trades_mean": 50,
        "excess_return_pct_mean": 0.10,
    }
    passed, reasons = promote_gate_passes(metrics)
    assert passed is False
    assert any("drawdown" in r.lower() for r in reasons)


def test_promote_gate_fails_too_few_trades():
    metrics = {
        "sharpe_mean": 1.5,
        "max_drawdown_pct_mean": -0.18,
        "calmar_mean": 0.8,
        "profit_factor_mean": 1.8,
        "n_trades_mean": 5,  # below min 30
        "excess_return_pct_mean": 0.10,
    }
    passed, reasons = promote_gate_passes(metrics)
    assert passed is False
    assert any("n_trades" in r for r in reasons)


def test_promote_gate_uses_per_trainer_overrides():
    metrics = {
        "sharpe_mean": 0.7,
        "max_drawdown_pct_mean": -0.18,
        "calmar_mean": 0.4,
        "profit_factor_mean": 1.3,
        "n_trades_mean": 50,
        "excess_return_pct_mean": 0.03,
    }
    # With looser overrides, should pass
    passed, reasons = promote_gate_passes(metrics, thresholds={
        "min_sharpe": 0.5,
        "min_calmar": 0.3,
        "min_profit_factor": 1.2,
        "min_excess_return_pct": 0.02,
    })
    assert passed is True, f"should pass with loose thresholds; reasons: {reasons}"


def test_promote_gate_falls_back_to_non_aggregated_keys():
    # Single-fold model: no _mean suffix
    metrics = {
        "sharpe": 1.5,
        "max_drawdown_pct": -0.18,
        "calmar": 0.8,
        "profit_factor": 1.8,
        "n_trades": 50,
        "excess_return_pct": 0.10,
    }
    passed, reasons = promote_gate_passes(metrics)
    assert passed is True, f"should pass on raw keys; reasons: {reasons}"
