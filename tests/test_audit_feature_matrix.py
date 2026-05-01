"""PR 189 — constant-feature detector tests."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.data import audit_feature_matrix


def test_no_dead_features():
    rng = np.random.default_rng(42)
    X = rng.normal(size=(500, 10))
    rep = audit_feature_matrix(X)
    assert rep["n_features"] == 10
    assert rep["n_constant"] == 0
    assert rep["constant_features"] == []
    assert not rep["fatal"]


def test_detects_single_dead_feature():
    rng = np.random.default_rng(0)
    X = rng.normal(size=(500, 10))
    X[:, 3] = 0.0   # column 3 is dead
    rep = audit_feature_matrix(X)
    assert rep["n_constant"] == 1
    assert rep["constant_fraction"] == pytest.approx(0.1)


def test_dead_feature_names_in_dataframe():
    df = pd.DataFrame({
        "rsi": np.random.randn(100),
        "fii_5d_z": np.zeros(100),       # dead because cache empty
        "sentiment_5d_mean": np.zeros(100),
    })
    rep = audit_feature_matrix(df)
    assert "fii_5d_z" in rep["constant_features"]
    assert "sentiment_5d_mean" in rep["constant_features"]
    assert "rsi" not in rep["constant_features"]


def test_fatal_threshold_triggers():
    """Default fatal_max_constant=5 — > 5 dead features should flip fatal."""
    X = np.random.randn(100, 10)
    for col in range(6):
        X[:, col] = 0.0
    rep = audit_feature_matrix(X, fatal_max_constant=5)
    assert rep["fatal"] is True


def test_fatal_threshold_not_triggered_at_boundary():
    """Exactly fatal_max_constant dead → still NOT fatal (strict >)."""
    X = np.random.randn(100, 10)
    for col in range(5):
        X[:, col] = 0.0
    rep = audit_feature_matrix(X, fatal_max_constant=5)
    assert rep["fatal"] is False


def test_constant_threshold_captures_floating_fuzz():
    """Tiny noise around 0 should still count as dead."""
    X = np.random.normal(0, 1e-15, size=(500, 5))
    rep = audit_feature_matrix(X, constant_threshold=1e-10)
    assert rep["n_constant"] == 5


def test_explicit_feature_names_override_columns():
    df = pd.DataFrame({
        "a": np.zeros(100),
        "b": np.ones(100),
    })
    rep = audit_feature_matrix(df, feature_names=["renamed_a", "renamed_b"])
    assert "renamed_a" in rep["constant_features"]
    assert "renamed_b" in rep["constant_features"]


def test_empty_input():
    rep = audit_feature_matrix(np.array([]))
    assert rep["n_features"] == 0
    assert rep["n_constant"] == 0
    assert not rep["fatal"]


def test_single_row_returns_safely():
    """Variance of 1 row is undefined; should not crash."""
    X = np.array([[1.0, 2.0, 3.0]])
    rep = audit_feature_matrix(X)
    # nanvar of single-element axis is 0 — every column is "constant"
    assert rep["n_features"] == 3
