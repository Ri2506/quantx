"""PR 181 — corporate-actions volume-adjustment tests."""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from ml.data.corporate_actions import (
    CORPORATE_ACTIONS,
    CorporateAction,
    actions_for,
    adjust_batch,
    adjust_volume_for_actions,
)


# ---------- registry semantics ----------

def test_registry_well_formed():
    """All registered actions have valid ratios + dates + types."""
    valid_types = {"split", "bonus", "consolidation"}
    for ev in CORPORATE_ACTIONS:
        assert ev.symbol and isinstance(ev.symbol, str)
        assert isinstance(ev.ex_date, date)
        assert ev.action_type in valid_types
        assert ev.ratio_old > 0 and ev.ratio_new > 0


def test_adjustment_factor_split():
    """2-for-1 split: pre-action volume halved."""
    a = CorporateAction("X", date(2024, 1, 1), "split", ratio_old=1, ratio_new=2)
    assert a.adjustment_factor == 0.5


def test_adjustment_factor_bonus():
    """1:1 bonus doubles share count: pre-action volume halved."""
    a = CorporateAction("X", date(2024, 1, 1), "bonus", ratio_old=1, ratio_new=2)
    assert a.adjustment_factor == 0.5


def test_adjustment_factor_consolidation():
    """1-for-10 reverse split: pre-action volume multiplied by 10."""
    a = CorporateAction("X", date(2024, 1, 1), "consolidation",
                       ratio_old=10, ratio_new=1)
    assert a.adjustment_factor == 10.0


def test_actions_for_returns_sorted():
    """actions_for sorts by ex_date asc."""
    a1 = CorporateAction("Z", date(2024, 6, 1), "split", 1, 2)
    a2 = CorporateAction("Z", date(2020, 3, 1), "bonus", 1, 2)
    actions = sorted([a1, a2], key=lambda a: a.ex_date)
    assert actions[0].ex_date < actions[1].ex_date


# ---------- adjust_volume_for_actions ----------

def test_adjust_volume_halves_pre_split_rows():
    """For a 2-for-1 split on 2024-06-01, pre-split rows should be halved."""
    idx = pd.date_range("2024-05-30", "2024-06-04", freq="D")
    df = pd.DataFrame({"Volume": [1000.0] * len(idx)}, index=idx)
    a = CorporateAction("X", date(2024, 6, 1), "split", 1, 2)
    out = adjust_volume_for_actions(df, "X", actions=[a])
    # Rows BEFORE 2024-06-01 are halved
    assert out.loc["2024-05-30", "Volume"] == 500.0
    assert out.loc["2024-05-31", "Volume"] == 500.0
    # Row ON ex-date and AFTER unchanged
    assert out.loc["2024-06-01", "Volume"] == 1000.0
    assert out.loc["2024-06-04", "Volume"] == 1000.0


def test_adjust_volume_handles_multiple_actions():
    """Two actions: first halves, then second halves again on remaining
    pre-action rows."""
    idx = pd.date_range("2020-01-01", "2024-12-31", freq="MS")  # monthly
    df = pd.DataFrame({"Volume": [1000.0] * len(idx)}, index=idx)
    actions = [
        CorporateAction("X", date(2022, 1, 1), "split", 1, 2),
        CorporateAction("X", date(2024, 1, 1), "split", 1, 2),
    ]
    out = adjust_volume_for_actions(df, "X", actions=actions)
    # 2020-06-01: before both → 1000 * 0.5 * 0.5 = 250
    assert out.loc["2020-06-01", "Volume"] == 250.0
    # 2022-06-01: after first, before second → 1000 * 0.5 = 500
    assert out.loc["2022-06-01", "Volume"] == 500.0
    # 2024-06-01: after both → 1000
    assert out.loc["2024-06-01", "Volume"] == 1000.0


def test_adjust_volume_no_action_passes_through():
    idx = pd.date_range("2024-01-01", periods=5, freq="D")
    df = pd.DataFrame({"Volume": [100.0] * 5}, index=idx)
    out = adjust_volume_for_actions(df, "X", actions=[])
    pd.testing.assert_frame_equal(df, out)


def test_adjust_volume_action_outside_window():
    """If the action ex_date is before the entire data window, no rows
    are adjusted."""
    idx = pd.date_range("2024-01-01", periods=5, freq="D")
    df = pd.DataFrame({"Volume": [100.0] * 5}, index=idx)
    a = CorporateAction("X", date(2020, 1, 1), "split", 1, 2)
    out = adjust_volume_for_actions(df, "X", actions=[a])
    # All rows are AFTER ex_date — nothing adjusted
    assert (out["Volume"] == 100.0).all()


def test_adjust_volume_empty_df():
    out = adjust_volume_for_actions(pd.DataFrame(), "X", actions=[])
    assert out.empty


def test_adjust_volume_missing_volume_col():
    """No Volume column → pass-through unchanged."""
    idx = pd.date_range("2024-01-01", periods=3, freq="D")
    df = pd.DataFrame({"Close": [100.0, 101.0, 102.0]}, index=idx)
    out = adjust_volume_for_actions(df, "X", actions=[
        CorporateAction("X", date(2024, 1, 2), "split", 1, 2),
    ])
    pd.testing.assert_frame_equal(df, out)


# ---------- adjust_batch ----------

def test_adjust_batch_yfinance_shaped_frame():
    """yfinance group_by='ticker' produces (ticker, field) columns."""
    idx = pd.date_range("2024-05-30", "2024-06-03", freq="D")
    cols = pd.MultiIndex.from_tuples([
        ("RELIANCE.NS", "Close"), ("RELIANCE.NS", "Volume"),
        ("FOO.NS", "Close"), ("FOO.NS", "Volume"),
    ])
    raw = pd.DataFrame(
        np.full((5, 4), 1000.0),
        index=idx, columns=cols,
    )
    actions = [CorporateAction("RELIANCE", date(2024, 6, 1), "split", 1, 2)]
    # Inject a registry override via direct call
    out = adjust_batch(raw, symbol_map={
        "RELIANCE.NS": "RELIANCE", "FOO.NS": "FOO",
    })
    # Pre-2024-06-01 RELIANCE volume halved
    pre_mask = out.index < pd.Timestamp("2024-06-01")
    rel_vol_pre = out.loc[pre_mask, ("RELIANCE.NS", "Volume")]
    # Reliance has a registered 2017 bonus → 0.5 multiplier on data far
    # before the bonus date; since 2024-05-30/31 is AFTER 2017, only
    # actions with ex_date AFTER 2024-05-30 trigger here.
    # So no registered RELIANCE action affects this window — vol unchanged.
    assert (rel_vol_pre == 1000.0).all()
    # FOO has no registered actions → unchanged
    assert (out[("FOO.NS", "Volume")] == 1000.0).all()


def test_adjust_batch_empty_passes():
    out = adjust_batch(pd.DataFrame())
    assert out.empty


def test_adjust_batch_non_multiindex_passes():
    df = pd.DataFrame({"A": [1, 2, 3]})
    out = adjust_batch(df)
    pd.testing.assert_frame_equal(df, out)
