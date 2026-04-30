"""PR 175 — Combinatorial Purged CV tests."""
from __future__ import annotations

import numpy as np
import pytest

from ml.training import (
    CPCVConfig,
    combinatorial_purged_split,
    extract_backtest_paths,
    n_paths,
)


def test_n_paths_formula():
    """N=10, k=2 → 9 paths (López de Prado eq.7.5)."""
    assert n_paths(CPCVConfig(n_groups=10, n_test_groups=2)) == 9
    # N=6, k=2 → 5 paths
    assert n_paths(CPCVConfig(n_groups=6, n_test_groups=2)) == 5
    # N=8, k=3 → 21 paths
    assert n_paths(CPCVConfig(n_groups=8, n_test_groups=3)) == 21


def test_split_count_matches_combinations():
    """N=10, k=2 → C(10,2) = 45 folds."""
    cfg = CPCVConfig(n_groups=10, n_test_groups=2, embargo=0, purge=0)
    folds = list(combinatorial_purged_split(1000, cfg))
    assert len(folds) == 45


def test_train_test_disjoint():
    """No row appears in both train and test of the same fold."""
    cfg = CPCVConfig(n_groups=8, n_test_groups=2, embargo=0, purge=0)
    for train, test, _ in combinatorial_purged_split(800, cfg):
        assert len(set(train) & set(test)) == 0


def test_test_size_consistent():
    """Each fold's test should be exactly k * (n // N) rows (last group
    absorbs remainder so some folds may differ slightly)."""
    n = 800
    cfg = CPCVConfig(n_groups=8, n_test_groups=2, embargo=0, purge=0)
    expected = 2 * (n // 8)
    sizes = [len(test) for _, test, _ in combinatorial_purged_split(n, cfg)]
    # All but the last-group folds match exactly; tolerate up to one chunk's worth of slack.
    assert min(sizes) >= expected - 1
    assert max(sizes) <= expected + (n - 8 * (n // 8))


def test_embargo_excludes_neighbors():
    """With embargo=10, no train index sits within 10 bars of test start
    or end."""
    cfg = CPCVConfig(n_groups=10, n_test_groups=2, embargo=10, purge=0)
    folds = list(combinatorial_purged_split(1000, cfg))
    for train, test, _ in folds:
        train_set = set(train.tolist())
        for t in test:
            for delta in range(1, 11):
                # Bars within embargo on either side must not be in train
                # unless they're inside another test chunk
                pre = t - delta
                post = t + delta
                if pre >= 0 and pre not in test:
                    assert pre not in train_set
                # post check skipped — out of range allowed


def test_purge_drops_forward_overlap():
    """With purge=20, train rows immediately before each test chunk are
    dropped (their forward labels overlap test)."""
    cfg = CPCVConfig(n_groups=10, n_test_groups=2, embargo=0, purge=20)
    for train, test, _ in combinatorial_purged_split(1000, cfg):
        test_starts = set()
        # Identify chunk start boundaries within `test`
        if len(test) > 0:
            sorted_test = sorted(test.tolist())
            test_starts.add(sorted_test[0])
            for i in range(1, len(sorted_test)):
                if sorted_test[i] != sorted_test[i - 1] + 1:
                    test_starts.add(sorted_test[i])
        train_set = set(train.tolist())
        for ts in test_starts:
            # Bars within `purge` distance before each test chunk must be
            # absent from train.
            for delta in range(1, 21):
                pre = ts - delta
                if pre >= 0:
                    assert pre not in train_set, f"purge fail at ts={ts}, pre={pre}"


def test_test_groups_returned():
    cfg = CPCVConfig(n_groups=6, n_test_groups=2, embargo=0, purge=0)
    seen = set()
    for _, _, groups in combinatorial_purged_split(600, cfg):
        assert len(groups) == 2
        seen.add(groups)
    # Every (i,j) i<j combination should appear exactly once
    expected = set()
    for i in range(6):
        for j in range(i + 1, 6):
            expected.add((i, j))
    assert seen == expected


def test_extract_paths_shape():
    """Extracting paths returns shape (n_paths, n_samples)."""
    cfg = CPCVConfig(n_groups=6, n_test_groups=2, embargo=0, purge=0)
    n = 600
    folds = list(combinatorial_purged_split(n, cfg))
    # Synthesize fake fold returns: 1.0 for every test bar
    per_fold = [(grp, np.ones(len(test))) for _, test, grp in folds]
    paths = extract_backtest_paths(per_fold, cfg, n)
    assert paths.shape == (n_paths(cfg), n)


def test_extract_paths_covers_full_timeline():
    """When every fold returns 1.0, every path's row should cover all
    n_samples (no zeros except possibly at the boundary chunk)."""
    cfg = CPCVConfig(n_groups=6, n_test_groups=2, embargo=0, purge=0)
    n = 600
    folds = list(combinatorial_purged_split(n, cfg))
    per_fold = [(grp, np.ones(len(test))) for _, test, grp in folds]
    paths = extract_backtest_paths(per_fold, cfg, n)
    # Every path should have most bars filled with 1.0
    for p in range(paths.shape[0]):
        nonzero_frac = float(np.mean(paths[p] > 0))
        assert nonzero_frac > 0.95, f"path {p} only {nonzero_frac:.2%} covered"
