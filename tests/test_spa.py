"""PR 198 — Hansen SPA + family-wise correction tests."""
from __future__ import annotations

import numpy as np
import pytest

from ml.eval.spa import family_wise_t_correction, hansen_spa_test


# ---------- family_wise_t_correction ----------

def test_bonferroni_multiplies_by_n():
    pvals = [0.01, 0.04, 0.10]
    adj = family_wise_t_correction(pvals, method="bonferroni")
    assert adj[0] == pytest.approx(0.03)
    assert adj[1] == pytest.approx(0.12)
    assert adj[2] == pytest.approx(0.30)


def test_bonferroni_caps_at_1():
    """Adjusted p-value can't exceed 1."""
    adj = family_wise_t_correction([0.5, 0.6], method="bonferroni")
    assert adj[0] == 1.0
    assert adj[1] == 1.0


def test_holm_step_down_less_conservative_than_bonferroni():
    """Holm should be ≤ Bonferroni at every position."""
    pvals = [0.01, 0.02, 0.03, 0.04]
    bf = family_wise_t_correction(pvals, method="bonferroni")
    holm = family_wise_t_correction(pvals, method="holm")
    for b, h in zip(bf, holm):
        assert h <= b + 1e-9


def test_invalid_method_raises():
    with pytest.raises(ValueError):
        family_wise_t_correction([0.05], method="bogus")


def test_empty_input_returns_empty():
    assert family_wise_t_correction([]) == []


# ---------- hansen_spa_test ----------

def test_spa_high_pvalue_for_no_signal():
    """All strategies are noise → p-value should be high (fail to reject H0)."""
    rng = np.random.default_rng(0)
    diffs = rng.normal(0, 0.01, size=(252, 5))
    result = hansen_spa_test(diffs, n_bootstraps=200)
    assert result["spa_pvalue"] > 0.10


def test_spa_low_pvalue_for_real_signal():
    """One strategy with real positive edge → p-value should be low."""
    rng = np.random.default_rng(0)
    diffs = rng.normal(0, 0.01, size=(252, 5))
    diffs[:, 0] += 0.005  # +50bps daily edge
    result = hansen_spa_test(diffs, n_bootstraps=200)
    assert result["spa_pvalue"] < 0.05
    assert result["best_strategy_idx"] == 0


def test_spa_handles_too_few_periods():
    diffs = np.random.randn(10, 3)
    result = hansen_spa_test(diffs)
    assert result["spa_pvalue"] == 1.0


def test_spa_handles_empty_input():
    result = hansen_spa_test(np.array([]).reshape(0, 0))
    assert result["spa_pvalue"] == 1.0
    assert result["n_strategies"] == 0


def test_spa_returns_best_strategy_metadata():
    """The strategy with the highest realized mean should be flagged."""
    diffs = np.zeros((100, 4))
    diffs[:, 2] = 0.001   # strategy 2 has the only positive edge
    result = hansen_spa_test(diffs, n_bootstraps=100)
    assert result["best_strategy_idx"] == 2


def test_spa_pvalue_in_range():
    """Sanity: p-value always in [0, 1]."""
    rng = np.random.default_rng(7)
    diffs = rng.normal(0.0001, 0.01, (252, 8))
    result = hansen_spa_test(diffs, n_bootstraps=200)
    assert 0.0 <= result["spa_pvalue"] <= 1.0
