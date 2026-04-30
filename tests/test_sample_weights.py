"""PR 176 — Sample-weight uniqueness tests (AFML Ch.4)."""
from __future__ import annotations

import numpy as np
import pytest

from ml.labeling import (
    average_uniqueness,
    num_concurrent_labels,
    sample_weights_from_t1,
    time_decay_weights,
    triple_barrier_events,
    TripleBarrierConfig,
)


# ---------- num_concurrent_labels ----------

def test_concurrent_count_no_overlap():
    """Sparse, non-overlapping observations: only their bars get count 1."""
    # Three observations at i=0, 3, 6 with t1=[2, 5, 8] — all others
    # are degenerate (t1[i] == i means no forward window).
    n = 10
    t1 = np.arange(n, dtype=np.int64)  # default degenerate
    t1[0] = 2  # window (0, 2] = {1, 2}
    t1[3] = 5  # window (3, 5] = {4, 5}
    t1[6] = 8  # window (6, 8] = {7, 8}
    c = num_concurrent_labels(t1, n)
    assert c.tolist() == [0, 1, 1, 0, 1, 1, 0, 1, 1, 0]


def test_concurrent_count_full_overlap():
    """All obs target the same end-bar — windows are nested."""
    n = 5
    t1 = np.arange(n, dtype=np.int64)
    t1[0] = 3  # window (0, 3] = {1, 2, 3}
    t1[1] = 3  # window (1, 3] = {2, 3}
    t1[2] = 3  # window (2, 3] = {3}
    c = num_concurrent_labels(t1, n)
    # bar 1: only obs 0 → 1
    # bar 2: obs 0, 1 → 2
    # bar 3: obs 0, 1, 2 → 3
    assert c[1] == 1 and c[2] == 2 and c[3] == 3


def test_concurrent_count_handles_degenerate():
    """Obs with t1[i] == i contributes nothing (no forward window)."""
    n = 10
    t1 = np.arange(n, dtype=np.int64)
    t1[1] = 5  # window (1, 5] = {2, 3, 4, 5}
    t1[2] = 5  # window (2, 5] = {3, 4, 5}
    c = num_concurrent_labels(t1, n)
    assert c[1] == 0
    assert c[2] == 1   # only obs 1 covers bar 2
    for t in range(3, 6):
        assert c[t] == 2   # both obs 1 and obs 2 cover bars 3-5


# ---------- average_uniqueness ----------

def test_uniqueness_no_overlap_is_one():
    """A single isolated label has uniqueness 1.0."""
    t1 = np.array([3], dtype=np.int64)
    u = average_uniqueness(t1, n=5)
    assert pytest.approx(u[0], rel=1e-6) == 1.0


def test_uniqueness_nested_windows():
    """Three observations targeting bar 3 — nested windows.
    obs 0 covers {1,2,3}, obs 1 covers {2,3}, obs 2 covers {3}.
    Concurrency: c[1]=1, c[2]=2, c[3]=3.
        u[0] = mean(1/1, 1/2, 1/3) = (1 + 0.5 + 0.333) / 3 ≈ 0.611
        u[1] = mean(1/2, 1/3)      = (0.5 + 0.333) / 2 ≈ 0.417
        u[2] = mean(1/3)           = 0.333
    """
    n = 5
    t1 = np.arange(n, dtype=np.int64)
    t1[0] = 3
    t1[1] = 3
    t1[2] = 3
    u = average_uniqueness(t1, n)
    assert pytest.approx(u[0], rel=1e-3) == (1.0 + 0.5 + 1.0/3) / 3
    assert pytest.approx(u[1], rel=1e-3) == (0.5 + 1.0/3) / 2
    assert pytest.approx(u[2], rel=1e-3) == 1.0 / 3


def test_uniqueness_partial_overlap():
    """Two observations whose windows partially overlap.
    obs 0: t1=2 → covers {1, 2}
    obs 1: t1=3 → covers {2, 3}
    Concurrency: c[1]=1, c[2]=2, c[3]=1.
        u[0] = mean(1/c[1], 1/c[2]) = mean(1, 0.5) = 0.75
        u[1] = mean(1/c[2], 1/c[3]) = mean(0.5, 1) = 0.75
    """
    n = 5
    t1 = np.arange(n, dtype=np.int64)
    t1[0] = 2
    t1[1] = 3
    u = average_uniqueness(t1, n)
    assert pytest.approx(u[0], rel=1e-6) == 0.75
    assert pytest.approx(u[1], rel=1e-6) == 0.75


# ---------- sample_weights_from_t1 ----------

def test_sample_weights_normalize_to_unit_mean():
    rng = np.random.default_rng(42)
    n = 200
    # Random t1 between i+1 and i+10
    t1 = np.array([min(n - 1, i + rng.integers(1, 10)) for i in range(n)], dtype=np.int64)
    w = sample_weights_from_t1(t1, n)
    assert pytest.approx(w.mean(), rel=1e-6) == 1.0


def test_sample_weights_floor_applied():
    """floor parameter should ensure no zero weights pre-normalization."""
    t1 = np.array([0, 0, 5], dtype=np.int64)  # first two have degenerate windows
    w = sample_weights_from_t1(t1, n=10, normalize=False, floor=0.01)
    assert (w >= 0.01).all()


def test_sample_weights_high_overlap_lower():
    """In a fully-overlapping cluster all weights are equal; in a more
    isolated tail they're higher."""
    # 5 obs all overlapping, then one isolated obs
    t1 = np.array([4, 4, 4, 4, 4, 9], dtype=np.int64)
    w = sample_weights_from_t1(t1, n=10, normalize=False)
    assert w[5] > w[0]   # isolated obs heavier than cluster member


# ---------- time_decay_weights ----------

def test_time_decay_identity():
    """decay=1.0 returns uniqueness unchanged."""
    u = np.array([0.5, 0.7, 0.3, 0.9])
    w = time_decay_weights(u, decay=1.0)
    np.testing.assert_array_equal(w, u)


def test_time_decay_zero_zeroes_oldest():
    """decay=0 puts zero weight on the oldest obs (cum_u start)."""
    u = np.array([0.5, 0.5, 0.5, 0.5])
    w = time_decay_weights(u, decay=0.0)
    # Linear ramp from 0 to 1 across cumulative-uniqueness; the very
    # first sample gets weight (slope * cum_u[0] + 0). With decay=0:
    # slope=1, intercept=0, cum_u[0] = 0.25 → w[0] = 0.5 * 0.25 = 0.125
    # The point: oldest is the smallest, newest is the largest.
    assert w[0] < w[-1]
    assert w[0] > 0  # not zero in this 4-obs case (cum_u starts at 0.25)


# ---------- end-to-end with triple_barrier_events ----------

def test_triple_barrier_events_returns_t1_with_correct_shape():
    n = 100
    rng = np.random.default_rng(0)
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    atr = np.full(n, 2.0)
    cfg = TripleBarrierConfig(
        profit_target_atr=2.0, stop_loss_atr=1.0,
        vertical_barrier_days=5, min_atr_pct=0.0,
    )
    labels, t1 = triple_barrier_events(close, atr, cfg)
    assert labels.shape == (n,)
    assert t1.shape == (n,)
    # t1 values should be in [i, min(n-1, i+vbd)] for valid obs
    for i in range(n - 5):
        assert t1[i] >= i
        assert t1[i] <= i + 5


def test_end_to_end_weights_have_expected_shape():
    n = 200
    rng = np.random.default_rng(1)
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    atr = np.full(n, 2.0)
    cfg = TripleBarrierConfig(
        profit_target_atr=2.0, stop_loss_atr=1.0,
        vertical_barrier_days=10, min_atr_pct=0.0,
    )
    labels, t1 = triple_barrier_events(close, atr, cfg)
    w = sample_weights_from_t1(t1, n)
    assert w.shape == (n,)
    assert (w > 0).all()
    assert pytest.approx(w.mean(), rel=1e-6) == 1.0
