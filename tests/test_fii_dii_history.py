"""PR 180 — FII/DII flow history + feature tests."""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from ml.data.fii_dii_history import (
    FlowFeatureConfig,
    compute_flow_features,
    fii_dii_series,
    reindex_flow_features_to,
)


def _synthetic_flows(n: int = 200) -> pd.DataFrame:
    """Synthetic FII/DII flow series for deterministic tests."""
    rng = np.random.default_rng(42)
    dates = pd.date_range("2024-01-01", periods=n, freq="B")
    return pd.DataFrame({
        "fii_net": rng.normal(0, 2000, n),     # ₹ Cr per day
        "dii_net": rng.normal(500, 1500, n),   # DIIs slightly net buyers on avg
    }, index=dates)


def test_compute_flow_features_empty_input():
    out = compute_flow_features(pd.DataFrame(columns=["fii_net", "dii_net"]))
    assert out.empty
    assert list(out.columns) == ["fii_5d_sum", "dii_5d_sum", "fii_5d_z", "dii_5d_z"]


def test_compute_flow_features_basic_shapes():
    flows = _synthetic_flows(200)
    out = compute_flow_features(flows)
    assert len(out) == 200
    assert set(out.columns) == {"fii_5d_sum", "dii_5d_sum", "fii_5d_z", "dii_5d_z"}
    # No NaNs
    assert not out.isna().any().any()


def test_compute_flow_features_5d_sum_correctness():
    """The 5d_sum at row i should equal sum of last 5 fii_net values."""
    flows = pd.DataFrame({
        "fii_net": [100.0, 200.0, 300.0, 400.0, 500.0, 600.0, 700.0],
        "dii_net": [10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0],
    }, index=pd.date_range("2024-01-01", periods=7, freq="B"))
    out = compute_flow_features(flows)
    # Day 4 (0-indexed): sum of days 0-4 = 100+200+300+400+500 = 1500
    assert out["fii_5d_sum"].iloc[4] == pytest.approx(1500.0)
    # Day 5: sum of days 1-5 = 200+...+600 = 2000
    assert out["fii_5d_sum"].iloc[5] == pytest.approx(2000.0)


def test_compute_flow_features_z_score_centered():
    """Z-score should hover near zero on stationary noise."""
    flows = _synthetic_flows(500)
    out = compute_flow_features(flows)
    # Drop the warm-up window where z is still 0-filled
    settled = out.iloc[100:]
    assert abs(settled["fii_5d_z"].mean()) < 0.5
    assert abs(settled["dii_5d_z"].mean()) < 0.5
    # Std of z-scored series should be roughly 1 in steady state
    assert 0.5 < settled["fii_5d_z"].std() < 1.5


def test_reindex_to_target_pads_with_ffill_then_zero():
    """Sparse flow data on Mon/Wed/Fri but target index is daily;
    forward-fill up to 1 day, zero-fill anything older.

    Source dates: 01-01, 01-03, 01-05.
    Target: 01-01 thru 01-07.
    Expected: each source date carries forward to the next day; the
    second day after the last source entry zero-fills.
    """
    flow_idx = pd.DatetimeIndex(["2024-01-01", "2024-01-03", "2024-01-05"])
    flows = pd.DataFrame({
        "fii_5d_sum": [100.0, 200.0, 300.0],
        "dii_5d_sum": [10.0, 20.0, 30.0],
        "fii_5d_z": [0.5, 1.0, 1.5],
        "dii_5d_z": [0.1, 0.2, 0.3],
    }, index=flow_idx)
    target = pd.date_range("2024-01-01", "2024-01-07", freq="D")
    out = reindex_flow_features_to(flows, target)
    assert len(out) == 7
    assert out.loc["2024-01-01", "fii_5d_sum"] == 100.0     # exact
    assert out.loc["2024-01-02", "fii_5d_sum"] == 100.0     # ffill 1 day
    assert out.loc["2024-01-03", "fii_5d_sum"] == 200.0
    assert out.loc["2024-01-06", "fii_5d_sum"] == 300.0     # ffill 1 day from 01-05
    assert out.loc["2024-01-07", "fii_5d_sum"] == 0.0       # 2 days past → zero-fill


def test_reindex_empty_input_zero_filled():
    target = pd.date_range("2024-01-01", "2024-01-05", freq="D")
    empty = pd.DataFrame(columns=["fii_5d_sum", "dii_5d_sum", "fii_5d_z", "dii_5d_z"])
    out = reindex_flow_features_to(empty, target)
    assert len(out) == 5
    assert (out == 0.0).all().all()


def test_fii_dii_series_returns_empty_on_no_cache_no_network(monkeypatch):
    """When cache empty and NSE fetch returns empty, output is empty."""
    from ml.data import fii_dii_history as mod
    monkeypatch.setattr(mod, "_load_cache", lambda: mod._empty_flow_frame())
    monkeypatch.setattr(mod, "_fetch_from_nse", lambda *a, **kw: mod._empty_flow_frame())
    out = fii_dii_series("2024-01-01", "2024-01-31", use_cache=True, refresh=True)
    assert out.empty


def test_fii_dii_series_uses_cache_when_covers(monkeypatch):
    from ml.data import fii_dii_history as mod
    cache = _synthetic_flows(60)
    monkeypatch.setattr(mod, "_load_cache", lambda: cache)
    fetch_called = [False]
    def fake_fetch(*args, **kwargs):
        fetch_called[0] = True
        return mod._empty_flow_frame()
    monkeypatch.setattr(mod, "_fetch_from_nse", fake_fetch)
    # Cache spans 2024-01-01 to ~2024-03-22; ask for a subset
    out = fii_dii_series("2024-01-15", "2024-02-15", use_cache=True)
    assert not out.empty
    # Cache covered range — should NOT have hit network
    assert fetch_called[0] is False


def test_flow_feature_config_defaults():
    cfg = FlowFeatureConfig()
    assert cfg.sum_window == 5
    assert cfg.z_window == 90
    assert cfg.fillna_value == 0.0
