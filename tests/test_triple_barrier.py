"""
PR 163 — tests for triple-barrier labeling.

Verifies:
  - Upper-barrier-hit-first → +1 label
  - Lower-barrier-hit-first → -1 label
  - Neither hit within vertical → 0 label
  - Path-dependence: when both barriers would eventually hit but lower
    hits first, label is -1 (not "average of returns")
  - Last vbd rows are 0 (no future data)
  - ATR-scaled: same nominal move yields different labels at different vol
"""

from __future__ import annotations

import numpy as np
import pytest

from ml.labeling import (
    TripleBarrierConfig,
    triple_barrier_labels,
)
from ml.labeling.triple_barrier import label_distribution


def test_upper_barrier_first():
    # Constant ATR=1, price climbs from 100 to 105 over 5 bars.
    # Upper barrier @ 100 + 2*1 = 102; should be hit at bar 3 (price=103).
    close = np.array([100.0, 101.0, 102.5, 103.0, 105.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0])
    atr = np.full_like(close, 1.0)
    cfg = TripleBarrierConfig(profit_target_atr=2.0, stop_loss_atr=1.0, vertical_barrier_days=10)
    labels = triple_barrier_labels(close, atr, cfg)
    assert labels[0] == 1, f"upper hit first; got label {labels[0]}"


def test_lower_barrier_first():
    # Price drops from 100 to 95. Lower barrier @ 100 - 1 = 99.
    close = np.array([100.0, 99.5, 98.5, 95.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0])
    atr = np.full_like(close, 1.0)
    cfg = TripleBarrierConfig(profit_target_atr=2.0, stop_loss_atr=1.0, vertical_barrier_days=10)
    labels = triple_barrier_labels(close, atr, cfg)
    assert labels[0] == -1, f"lower hit first; got label {labels[0]}"


def test_vertical_barrier_when_neither_hit():
    # Price wobbles inside the barriers for the full window
    close = np.array([100.0, 100.5, 100.3, 100.7, 100.2, 100.5, 100.1, 100.4, 100.6, 100.5, 100.0, 100.0])
    atr = np.full_like(close, 1.0)
    cfg = TripleBarrierConfig(profit_target_atr=2.0, stop_loss_atr=1.0, vertical_barrier_days=10)
    labels = triple_barrier_labels(close, atr, cfg)
    # Neither 102 nor 99 ever touched; vertical barrier hit at t=10
    assert labels[0] == 0, f"vertical should hit; got label {labels[0]}"


def test_path_dependence_lower_first_wins():
    # Path: dip to 99 first, then rocket to 105. Lower hits before upper.
    close = np.array([100.0, 98.5, 99.5, 105.0, 105.0, 105.0, 105.0, 105.0, 105.0, 105.0, 105.0, 105.0])
    atr = np.full_like(close, 1.0)
    cfg = TripleBarrierConfig(profit_target_atr=2.0, stop_loss_atr=1.0, vertical_barrier_days=10)
    labels = triple_barrier_labels(close, atr, cfg)
    assert labels[0] == -1, (
        f"lower (99) hits at bar 1 before upper (102) at bar 3; got label {labels[0]}"
    )


def test_last_rows_are_zero_due_to_no_future():
    n = 20
    close = np.full(n, 100.0)
    atr = np.full(n, 1.0)
    cfg = TripleBarrierConfig(vertical_barrier_days=5)
    labels = triple_barrier_labels(close, atr, cfg)
    # Last 5 rows have no 5-bar future to scan; should be 0
    assert all(labels[-5:] == 0)


def test_low_atr_skipped():
    n = 12
    close = np.full(n, 100.0)
    # ATR = 0.001 of price → 0.1% < 0.5% threshold → labels stay 0
    atr = np.full(n, 0.1)
    cfg = TripleBarrierConfig(min_atr_pct=0.005)
    labels = triple_barrier_labels(close, atr, cfg)
    assert all(labels == 0)


def test_atr_scaling_volatile_vs_quiet():
    # Same nominal +2% move. High ATR → barrier far → 0. Low ATR → barrier
    # close → +1.
    close = np.array([100.0, 101.0, 101.5, 102.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0, 100.0])
    cfg = TripleBarrierConfig(profit_target_atr=2.0, stop_loss_atr=1.0, vertical_barrier_days=10)

    # High ATR (vol of $5) → barrier @ 110 → never reached
    atr_high = np.full_like(close, 5.0)
    labels_high = triple_barrier_labels(close, atr_high, cfg)
    assert labels_high[0] == 0

    # Low ATR (vol of $0.75) → barrier @ 101.5 → reached at bar 2
    atr_low = np.full_like(close, 0.75)
    labels_low = triple_barrier_labels(close, atr_low, cfg)
    assert labels_low[0] == 1


def test_label_distribution_basic():
    labels = np.array([1, 1, 0, -1, -1, -1, 0, 1])
    d = label_distribution(labels)
    assert d["label_+1"] == 3 / 8
    assert d["label_0"] == 2 / 8
    assert d["label_-1"] == 3 / 8


def test_invalid_config_raises():
    close = np.full(10, 100.0)
    atr = np.full(10, 1.0)
    with pytest.raises(ValueError):
        triple_barrier_labels(close, atr, TripleBarrierConfig(profit_target_atr=-1.0))
    with pytest.raises(ValueError):
        triple_barrier_labels(close, atr, TripleBarrierConfig(vertical_barrier_days=0))
    with pytest.raises(ValueError):
        triple_barrier_labels(
            close, atr,
            TripleBarrierConfig(asymmetric=False, profit_target_atr=2.0, stop_loss_atr=1.0),
        )


def test_mismatched_input_lengths_raises():
    with pytest.raises(ValueError):
        triple_barrier_labels(
            np.array([100.0, 101.0]),
            np.array([1.0, 1.0, 1.0]),
        )
