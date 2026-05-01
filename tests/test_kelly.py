"""PR 197 — Kelly fraction sizing tests."""
from __future__ import annotations

import pytest

from ml.eval.kelly import (
    DEFAULT_FRACTIONAL,
    MAX_KELLY_FRACTION,
    kelly_fraction,
    kelly_from_metrics,
)


# ---------- kelly_fraction ----------

def test_full_kelly_classic_50_50_with_2_to_1():
    """50/50 win rate with 2:1 win/loss → full Kelly = (0.5*2 - 0.5)/2 = 0.25.
    Quarter-Kelly default → 0.0625."""
    f = kelly_fraction(win_rate=0.5, win_loss_ratio=2.0, fractional=0.25)
    assert f == pytest.approx(0.0625)


def test_full_kelly_full_fractional():
    """fractional=1 returns full Kelly."""
    f = kelly_fraction(win_rate=0.6, win_loss_ratio=2.0, fractional=1.0,
                       max_fraction=1.0)
    expected_full = (0.6 * 2 - 0.4) / 2
    assert f == pytest.approx(expected_full)


def test_kelly_returns_zero_for_negative_edge():
    """40 percent win rate with 1:1 → full Kelly negative → 0."""
    f = kelly_fraction(win_rate=0.40, win_loss_ratio=1.0)
    assert f == 0.0


def test_kelly_returns_zero_at_50_50_unit_ratio():
    """50/50 with 1:1 win/loss → full Kelly = 0."""
    f = kelly_fraction(win_rate=0.50, win_loss_ratio=1.0)
    assert f == 0.0


def test_kelly_capped_at_max_fraction():
    """High edge should not exceed max_fraction."""
    f = kelly_fraction(win_rate=0.95, win_loss_ratio=10.0,
                       fractional=1.0, max_fraction=0.20)
    assert f == 0.20


def test_kelly_invalid_inputs_return_zero():
    assert kelly_fraction(win_rate=0, win_loss_ratio=2) == 0
    assert kelly_fraction(win_rate=1, win_loss_ratio=2) == 0
    assert kelly_fraction(win_rate=0.5, win_loss_ratio=0) == 0


def test_kelly_invalid_fractional_rejected():
    with pytest.raises(ValueError):
        kelly_fraction(win_rate=0.5, win_loss_ratio=2, fractional=1.5)
    with pytest.raises(ValueError):
        kelly_fraction(win_rate=0.5, win_loss_ratio=2, fractional=0.0)


# ---------- kelly_from_metrics ----------

def test_kelly_from_explicit_win_loss_ratio():
    f = kelly_from_metrics({"win_rate": 0.55, "win_loss_ratio": 1.5})
    expected = kelly_fraction(0.55, 1.5)
    assert f == pytest.approx(expected)


def test_kelly_from_profit_factor_derives_ratio():
    """Given win_rate=0.55 and profit_factor=1.5, derive win/loss ratio:
    PF = (p * avg_win) / ((1-p) * avg_loss)
    → avg_win / avg_loss = PF * (1-p) / p = 1.5 * 0.45 / 0.55 ≈ 1.227
    """
    metrics = {"win_rate": 0.55, "profit_factor": 1.5}
    f = kelly_from_metrics(metrics)
    expected_wlr = 1.5 * 0.45 / 0.55
    expected = kelly_fraction(0.55, expected_wlr)
    assert f == pytest.approx(expected)


def test_kelly_uses_mean_keys_from_wfcv_aggregation():
    """WFCV aggregator emits *_mean keys; should prefer those."""
    metrics = {
        "win_rate_mean": 0.60, "win_rate": 0.40,    # _mean wins
        "profit_factor_mean": 2.0, "profit_factor": 1.0,
    }
    f = kelly_from_metrics(metrics)
    expected_wlr = 2.0 * 0.40 / 0.60
    expected = kelly_fraction(0.60, expected_wlr)
    assert f == pytest.approx(expected)


def test_kelly_zero_when_no_metrics_supplied():
    assert kelly_from_metrics({}) == 0.0


def test_kelly_zero_when_win_rate_missing():
    """Profit factor without win rate → can't compute."""
    assert kelly_from_metrics({"profit_factor": 1.5}) == 0.0


# ---------- defaults ----------

def test_defaults_are_conservative():
    assert DEFAULT_FRACTIONAL == 0.25     # quarter Kelly
    assert MAX_KELLY_FRACTION == 0.20      # 20 percent absolute ceiling
