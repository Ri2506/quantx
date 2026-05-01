"""PR 193 — fractional differentiation tests."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.features.frac_diff import (
    _ffd_weights,
    find_min_d_stationary,
    frac_diff_ffd,
)


def test_weights_d0_identity():
    """d=0 → weights = [1.0] (identity transform)."""
    w = _ffd_weights(d=0.0, thresh=1e-4)
    assert len(w) == 1
    assert w[0] == pytest.approx(1.0)


def test_weights_d1_standard_diff():
    """d=1 → weights = [-1, 1] (standard first-difference)."""
    w = _ffd_weights(d=1.0, thresh=1e-4)
    # Reversed: most-recent first = [1, -1]
    assert w[-1] == pytest.approx(1.0)
    # The next term: -1 * (1 - 1 + 1) / 1 = -1, but that's |w| = 1,
    # below thresh check happens before we descend further. Length 2.
    assert len(w) == 2


def test_weights_partial_d_in_between():
    """0 < d < 1 → weights have multiple terms with decreasing |w|."""
    w = _ffd_weights(d=0.4, thresh=1e-3)
    assert len(w) > 5
    # Most-recent weight should be 1.0
    assert w[-1] == pytest.approx(1.0)


def test_frac_diff_d0_identity():
    s = pd.Series(range(100), dtype=float)
    out = frac_diff_ffd(s, d=0.0)
    np.testing.assert_array_almost_equal(out.dropna().values, s.values)


def test_frac_diff_d1_matches_standard_diff():
    s = pd.Series(range(100), dtype=float)
    out = frac_diff_ffd(s, d=1.0)
    expected = s.diff()
    # First row NaN in both; compare from index 1
    np.testing.assert_array_almost_equal(
        out.iloc[1:].values, expected.iloc[1:].values, decimal=6,
    )


def test_frac_diff_partial_d_attenuates_drift():
    """For a deterministic ramp, partial-d should produce a series whose
    long-run drift is reduced compared to the original."""
    s = pd.Series(np.arange(500, dtype=float))
    raw_drift = float(s.iloc[-1] - s.iloc[0])
    ffd = frac_diff_ffd(s, d=0.5).dropna()
    # FFD on a linear ramp produces a near-constant + small noise; the
    # range should be much smaller than the raw drift
    assert (ffd.max() - ffd.min()) < raw_drift * 0.5


def test_frac_diff_invalid_d_rejected():
    with pytest.raises(ValueError):
        frac_diff_ffd(pd.Series([1.0, 2.0]), d=1.5)
    with pytest.raises(ValueError):
        frac_diff_ffd(pd.Series([1.0, 2.0]), d=-0.1)


def test_frac_diff_handles_nan_in_window():
    """A NaN inside the lookback window should produce NaN output for
    that row — no silent forward-fill."""
    s = pd.Series([1.0, 2.0, np.nan, 4.0, 5.0, 6.0, 7.0])
    out = frac_diff_ffd(s, d=0.5, thresh=0.1)
    # Rows whose window includes index 2 (the NaN) must be NaN
    assert pd.isna(out.iloc[3])


def test_find_min_d_returns_value_for_random_walk():
    """A random walk (cumulative sum of i.i.d. noise) is non-stationary;
    a small d > 0 should make it stationary. Skip if statsmodels missing."""
    pytest.importorskip("statsmodels")
    rng = np.random.default_rng(42)
    rw = pd.Series(np.cumsum(rng.normal(0, 1, 1000)))
    d = find_min_d_stationary(rw)
    assert d is not None
    assert 0.0 <= d <= 1.0


def test_find_min_d_for_already_stationary_returns_zero():
    """Pure white noise is already stationary at d=0."""
    pytest.importorskip("statsmodels")
    rng = np.random.default_rng(0)
    noise = pd.Series(rng.normal(0, 1, 500))
    d = find_min_d_stationary(noise)
    # First grid point is 0.0 — should be stationary
    assert d == 0.0
