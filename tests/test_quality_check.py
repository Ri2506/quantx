"""PR 182 — data quality audit tests."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from ml.data.quality_check import (
    DataQualityError,
    QualityCheckConfig,
    QualityReport,
    run_quality_checks,
)


def _clean_frame(n: int = 200) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    idx = pd.date_range("2024-01-01", periods=n, freq="B")
    close = 100 + np.cumsum(rng.normal(0, 1, n))
    return pd.DataFrame({
        "Open": close * 0.999,
        "High": close * 1.005,
        "Low":  close * 0.995,
        "Close": close,
        "Volume": rng.integers(100_000, 500_000, n).astype(float),
    }, index=idx)


# ---------- clean data ----------

def test_clean_data_no_issues():
    df = _clean_frame(200)
    rep = run_quality_checks({"GOOD": df})
    assert rep.fatal_count == 0
    for issue, count in rep.issue_counts.items():
        if issue == "insufficient_rows":
            continue
        assert count == 0, f"unexpected {issue}={count} on clean data"


# ---------- stale runs ----------

def test_detects_stale_close_run():
    df = _clean_frame(200)
    df.loc[df.index[50:60], "Close"] = 150.0   # 10 stale bars
    rep = run_quality_checks({"X": df}, QualityCheckConfig(max_stale_run=5))
    assert rep.issue_counts["stale_run"] >= 1


def test_no_stale_below_threshold():
    df = _clean_frame(200)
    df.loc[df.index[50:53], "Close"] = 150.0   # only 3 stale
    rep = run_quality_checks({"X": df}, QualityCheckConfig(max_stale_run=5))
    assert rep.issue_counts["stale_run"] == 0


# ---------- duplicate rows ----------

def test_detects_dup_rows():
    df = _clean_frame(200)
    # 5 consecutive identical OHLCV rows
    template = df.iloc[100].copy()
    for i in range(100, 105):
        df.iloc[i] = template
    rep = run_quality_checks({"X": df}, QualityCheckConfig(max_dup_run=3))
    assert rep.issue_counts["dup_run"] >= 1


# ---------- outlier returns ----------

def test_detects_outlier_return():
    df = _clean_frame(200)
    df.iloc[100, df.columns.get_loc("Close")] = (
        df["Close"].iloc[99] * 2.0   # +100% bar
    )
    rep = run_quality_checks(
        {"X": df}, QualityCheckConfig(max_outlier_pct=0.50),
    )
    assert rep.issue_counts["outlier_return"] >= 1


# ---------- volume spike ----------

def test_detects_volume_spike():
    df = _clean_frame(200)
    df.iloc[100, df.columns.get_loc("Volume")] = (
        df["Volume"].iloc[100] * 1000.0   # 1000× spike
    )
    rep = run_quality_checks(
        {"X": df}, QualityCheckConfig(max_volume_spike_factor=50.0),
    )
    assert rep.issue_counts["volume_spike"] >= 1


# ---------- negative prices ----------

def test_negative_price_is_fatal():
    df = _clean_frame(200)
    df.iloc[50, df.columns.get_loc("Close")] = -1.0
    rep = run_quality_checks({"X": df})
    assert rep.issue_counts["negative_price"] == 1
    assert rep.fatal_count >= 1
    assert any("negative_price" in r for r in rep.fatal_reasons)


# ---------- gaps ----------

def test_detects_gap_days():
    """Drop a 14-day chunk to create a gap."""
    df = _clean_frame(200)
    # Drop rows for 2024-04-01..2024-04-14
    mask = (df.index < "2024-04-01") | (df.index > "2024-04-14")
    df = df.loc[mask]
    rep = run_quality_checks({"X": df}, QualityCheckConfig(max_gap_days=7))
    assert rep.issue_counts["gap_day"] >= 1


# ---------- trading-window violations ----------

def test_detects_intraday_window_violation():
    """Intraday frame with a bar at 18:00 (after market close)."""
    idx = pd.DatetimeIndex([
        pd.Timestamp("2024-01-01 09:30"),
        pd.Timestamp("2024-01-01 10:00"),
        pd.Timestamp("2024-01-01 18:00"),   # after-hours violation
        pd.Timestamp("2024-01-01 11:00"),
    ])
    df = pd.DataFrame({
        "Open": [100.0] * 4, "High": [101.0] * 4, "Low": [99.0] * 4,
        "Close": [100.5] * 4, "Volume": [1000.0] * 4,
    }, index=idx)
    rep = run_quality_checks({"X": df})
    assert rep.issue_counts["trading_window_violation"] == 1
    # Fatal — single violation is the threshold
    assert rep.fatal_count >= 1


def test_daily_bars_skip_window_check():
    """Daily bars (00:00 timestamps) must NOT trigger window violations."""
    df = _clean_frame(50)
    rep = run_quality_checks({"X": df})
    assert rep.issue_counts["trading_window_violation"] == 0


# ---------- insufficient rows ----------

def test_insufficient_rows_flagged():
    df = _clean_frame(50)
    rep = run_quality_checks({"X": df}, QualityCheckConfig(min_rows=100))
    assert rep.issue_counts["insufficient_rows"] == 1


# ---------- empty input ----------

def test_empty_frame_marks_failed():
    rep = run_quality_checks({"GHOST": pd.DataFrame()})
    assert "GHOST" in rep.failed_symbols


# ---------- aggregate report ----------

def test_report_to_dict_jsonb_safe():
    df = _clean_frame(200)
    rep = run_quality_checks({"GOOD": df})
    d = rep.to_dict()
    assert isinstance(d, dict)
    assert isinstance(d["issue_counts"], dict)
    assert isinstance(d["failed_symbols"], list)
    # All values must be JSON-serializable scalars or simple containers
    import json
    json.dumps(d)   # raises if non-serializable


def test_summary_string_compact():
    df = _clean_frame(200)
    df.iloc[50, df.columns.get_loc("Close")] = -1.0
    rep = run_quality_checks({"X": df})
    s = rep.summary()
    assert "checked=1" in s
    assert "negative_price" in s
    assert "FATAL" in s
