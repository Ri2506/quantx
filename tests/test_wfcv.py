"""
PR 161 — tests for walk-forward CV harness.

These verify the most important property: NO temporal overlap or leakage
between train and test indices in any fold. A regression here means a
model could see future data during training — directly invalidating
real-money production decisions.
"""

from __future__ import annotations

import numpy as np
import pytest

from ml.training.wfcv import (
    WFCVConfig,
    aggregate_fold_metrics,
    walk_forward_split,
)


def test_expanding_no_overlap_and_chronological():
    n = 2000
    cfg = WFCVConfig(strategy="expanding", n_folds=5, test_size=100, train_size=1000, embargo=5)
    folds = list(walk_forward_split(n, cfg))
    assert len(folds) == 5
    for fold_idx, (train_idx, test_idx) in enumerate(folds):
        # Train is strictly before test
        assert train_idx.max() < test_idx.min(), (
            f"fold {fold_idx} has overlap: train.max()={train_idx.max()} >= test.min()={test_idx.min()}"
        )
        # Embargo gap respected
        gap = test_idx.min() - train_idx.max() - 1
        assert gap >= cfg.embargo - 1, (
            f"fold {fold_idx} embargo violated: gap={gap} < embargo={cfg.embargo}"
        )
        # Test fold size correct
        assert len(test_idx) == cfg.test_size


def test_expanding_train_grows_each_fold():
    n = 2000
    cfg = WFCVConfig(strategy="expanding", n_folds=5, test_size=100, train_size=500, embargo=0)
    sizes = [len(t) for t, _ in walk_forward_split(n, cfg)]
    # Train should be monotone non-decreasing
    for i in range(1, len(sizes)):
        assert sizes[i] >= sizes[i - 1], f"expanding train should grow; got {sizes}"


def test_rolling_train_size_constant():
    n = 3000
    cfg = WFCVConfig(strategy="rolling", n_folds=5, test_size=100, train_size=500, embargo=0)
    sizes = [len(t) for t, _ in walk_forward_split(n, cfg)]
    assert all(s == 500 for s in sizes), f"rolling train should be constant; got {sizes}"


def test_rolling_no_temporal_overlap():
    n = 3000
    cfg = WFCVConfig(strategy="rolling", n_folds=5, test_size=100, train_size=500, embargo=10)
    for fold_idx, (train_idx, test_idx) in enumerate(walk_forward_split(n, cfg)):
        assert train_idx.max() < test_idx.min(), (
            f"rolling fold {fold_idx} has overlap"
        )


def test_purge_drops_tail_of_train():
    n = 1000
    cfg = WFCVConfig(strategy="expanding", n_folds=2, test_size=50, train_size=300, embargo=0, purge=10)
    train, test = next(walk_forward_split(n, cfg))
    # Train should end at test_start - embargo - purge = 300 - 0 - 10 = 290
    assert train.max() == 289, f"purge of 10 should leave train ending at 289; got {train.max()}"


def test_too_small_dataset_raises():
    cfg = WFCVConfig(strategy="expanding", n_folds=5, test_size=100, train_size=500, embargo=5)
    with pytest.raises(ValueError):
        list(walk_forward_split(100, cfg))


def test_aggregate_fold_metrics_basic():
    fold_metrics = [
        {"sharpe": 1.2, "max_dd": -0.15, "n_trades": 100},
        {"sharpe": 0.8, "max_dd": -0.20, "n_trades": 105},
        {"sharpe": 1.5, "max_dd": -0.10, "n_trades": 95},
    ]
    out = aggregate_fold_metrics(fold_metrics)
    assert "sharpe_mean" in out
    assert "sharpe_std" in out
    assert "sharpe_per_fold" in out
    assert out["n_folds"] == 3
    assert abs(out["sharpe_mean"] - (1.2 + 0.8 + 1.5) / 3) < 1e-9
    assert out["sharpe_per_fold"] == [1.2, 0.8, 1.5]
    # max_dd negative — averages preserved
    assert out["max_dd_mean"] < 0


def test_aggregate_drops_non_numeric_keys():
    fold_metrics = [
        {"sharpe": 1.0, "model_name": "regime_hmm"},
        {"sharpe": 1.5, "model_name": "regime_hmm"},
    ]
    out = aggregate_fold_metrics(fold_metrics)
    assert "sharpe_mean" in out
    # model_name (str) should be dropped from aggregates
    assert "model_name_mean" not in out
    assert "model_name" not in out
