"""PR 174 — Deflated Sharpe + PBO sanity tests."""
from __future__ import annotations

import math

import numpy as np
import pytest

from ml.eval import (
    deflated_sharpe_ratio,
    dsr_pbo_from_fold_returns,
    expected_max_sharpe,
    probability_of_backtest_overfitting,
    promote_gate_passes,
)


# ---------- expected_max_sharpe ----------

def test_expected_max_sharpe_single_trial_is_zero():
    assert expected_max_sharpe(1) == 0.0


def test_expected_max_sharpe_grows_with_trials():
    """More trials → higher H0 max Sharpe."""
    assert expected_max_sharpe(10) < expected_max_sharpe(100) < expected_max_sharpe(1000)


def test_expected_max_sharpe_known_value_100_trials():
    """For N=100 the closed-form is around 2.5 (Bailey/LdP 2014 Table 1)."""
    v = expected_max_sharpe(100)
    assert 2.4 < v < 2.7


# ---------- deflated_sharpe_ratio ----------

def test_dsr_high_sharpe_few_trials_high_dsr():
    """Sharpe=2.0 with 1 trial and lots of obs → DSR near 1."""
    dsr = deflated_sharpe_ratio(sharpe=2.0, n_trials=1, n_obs=1000)
    assert dsr > 0.95


def test_dsr_high_sharpe_many_trials_low_dsr():
    """Same Sharpe but 1000 Optuna trials → DSR collapses."""
    dsr = deflated_sharpe_ratio(sharpe=2.0, n_trials=1000, n_obs=1000)
    # Expected max of 1000 Sharpes is ~3.2; observed 2.0 doesn't beat it.
    assert dsr < 0.5


def test_dsr_handles_negative_skew():
    """For Sharpe ABOVE the H0 benchmark, fat tails inflate the SE which
    lowers the Z-stat and thus the DSR. (Below the benchmark the
    asymmetry inverts — that's a known property of Mertens 2002.)"""
    # Expected max Sharpe for 20 trials is ~2.0; pick 2.5 so we're above it.
    dsr_normal = deflated_sharpe_ratio(sharpe=2.5, n_trials=20, n_obs=500, skew=0.0, kurtosis=3.0)
    dsr_fat = deflated_sharpe_ratio(sharpe=2.5, n_trials=20, n_obs=500, skew=-1.5, kurtosis=8.0)
    assert dsr_fat < dsr_normal


def test_dsr_zero_obs_returns_zero():
    assert deflated_sharpe_ratio(sharpe=1.0, n_trials=10, n_obs=1) == 0.0


# ---------- probability_of_backtest_overfitting ----------

def test_pbo_random_returns_around_half():
    """Pure random performance matrix → PBO ≈ 0.5 asymptotically.

    Need enough periods/variants for the rank distribution to be well-
    behaved. Average across multiple seeds since CSCV ranks are
    correlated across combinations for fixed input.
    """
    pbos = []
    for seed in range(8):
        rng = np.random.default_rng(seed)
        perf = rng.standard_normal((128, 50))  # 128 periods × 50 variants
        pbos.append(probability_of_backtest_overfitting(perf, n_splits=16))
    avg = float(np.mean(pbos))
    assert 0.35 < avg < 0.65, f"avg PBO over 8 seeds = {avg:.3f}"


def test_pbo_consistent_winner_low():
    """If variant 0 dominates every period, PBO should be very low (no
    overfitting — the in-sample best really is the OOS best)."""
    rng = np.random.default_rng(0)
    perf = rng.standard_normal((64, 20))
    perf[:, 0] += 5.0  # variant 0 is the obvious winner
    pbo = probability_of_backtest_overfitting(perf, n_splits=8)
    assert pbo < 0.1


def test_pbo_too_few_periods_returns_half():
    """Not enough rows for CSCV → no-information value."""
    perf = np.random.standard_normal((3, 5))
    pbo = probability_of_backtest_overfitting(perf, n_splits=8)
    assert pbo == 0.5


# ---------- dsr_pbo_from_fold_returns ----------

def test_dsr_pbo_from_folds_basic():
    rng = np.random.default_rng(7)
    folds = [rng.normal(0.0008, 0.012, size=252) for _ in range(5)]
    out = dsr_pbo_from_fold_returns(folds, n_trials=20)
    assert "deflated_sharpe" in out
    assert "probability_backtest_overfitting" in out
    assert 0.0 <= out["deflated_sharpe"] <= 1.0
    assert out["n_trials_used"] == 20


# ---------- promote_gate integration ----------

def test_gate_blocks_low_dsr():
    """A model with strong Sharpe but low DSR should be blocked."""
    metrics = {
        "sharpe": 1.5, "max_drawdown_pct": -0.10, "calmar": 1.0,
        "profit_factor": 2.0, "n_trades": 50, "excess_return_pct": 0.10,
        "deflated_sharpe": 0.40,  # curve-fit risk
    }
    passed, reasons = promote_gate_passes(metrics)
    assert not passed
    assert any("Deflated Sharpe" in r for r in reasons)


def test_gate_blocks_high_pbo():
    metrics = {
        "sharpe": 1.5, "max_drawdown_pct": -0.10, "calmar": 1.0,
        "profit_factor": 2.0, "n_trades": 50, "excess_return_pct": 0.10,
        "deflated_sharpe": 0.99,
        "probability_backtest_overfitting": 0.75,
    }
    passed, reasons = promote_gate_passes(metrics)
    assert not passed
    assert any("PBO" in r for r in reasons)


def test_gate_passes_when_dsr_pbo_absent():
    """Backwards compat: trainers that don't supply DSR/PBO still pass."""
    metrics = {
        "sharpe": 1.5, "max_drawdown_pct": -0.10, "calmar": 1.0,
        "profit_factor": 2.0, "n_trades": 50, "excess_return_pct": 0.10,
    }
    passed, reasons = promote_gate_passes(metrics)
    assert passed, f"unexpected block reasons: {reasons}"


def test_gate_disabled_via_threshold_none():
    """Operator can disable DSR check by passing None."""
    metrics = {
        "sharpe": 1.5, "max_drawdown_pct": -0.10, "calmar": 1.0,
        "profit_factor": 2.0, "n_trades": 50, "excess_return_pct": 0.10,
        "deflated_sharpe": 0.10,  # would normally fail
    }
    passed, _ = promote_gate_passes(metrics, thresholds={"min_deflated_sharpe": None})
    assert passed
