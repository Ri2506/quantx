"""PR 179 — bhavcopy primary source tests."""
from __future__ import annotations

import sys
from datetime import date

import pandas as pd
import pytest

from ml.data.bhavcopy_source import (
    BhavcopyError,
    bhavcopy_download,
    bhavcopy_download_with_fallback,
)
from ml.data.bhavcopy_source import _to_date


def test_to_date_helpers():
    assert _to_date("2024-06-15") == date(2024, 6, 15)
    assert _to_date(date(2024, 6, 15)) == date(2024, 6, 15)
    assert _to_date(pd.Timestamp("2024-06-15")) == date(2024, 6, 15)


def test_bhavcopy_raises_on_inverted_dates():
    with pytest.raises(ValueError):
        bhavcopy_download(["RELIANCE"], "2024-01-10", "2024-01-01")


def test_bhavcopy_raises_when_jugaad_missing(monkeypatch):
    """Ensure import failure becomes a BhavcopyError, not a generic
    ModuleNotFoundError that callers can't distinguish from other bugs."""
    import builtins
    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "jugaad_data.nse":
            raise ImportError("simulated missing jugaad-data")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    # Force re-import path inside the function
    sys.modules.pop("jugaad_data", None)
    sys.modules.pop("jugaad_data.nse", None)
    with pytest.raises(BhavcopyError):
        bhavcopy_download(["RELIANCE"], "2024-01-01", "2024-01-31")


def test_fallback_uses_yfinance_when_bhavcopy_unavailable(monkeypatch):
    """When bhavcopy errors, fall back to yfinance and tag the source."""
    from ml.data import bhavcopy_source

    def fake_bhavcopy(*args, **kwargs):
        raise BhavcopyError("simulated jugaad-data failure")

    monkeypatch.setattr(bhavcopy_source, "bhavcopy_download", fake_bhavcopy)

    captured = {}

    class FakeYF:
        @staticmethod
        def download(tickers, **kwargs):
            captured["tickers"] = tickers
            captured["kwargs"] = kwargs
            # Return non-empty 2-row frame for any input
            idx = pd.date_range("2024-01-01", periods=2, freq="D")
            return pd.DataFrame({"Close": [100.0, 101.0]}, index=idx)

    monkeypatch.setitem(sys.modules, "yfinance", FakeYF)
    df, source = bhavcopy_download_with_fallback(
        ["RELIANCE"], "2024-01-01", "2024-01-02",
    )
    assert source == "yfinance"
    assert captured["tickers"] == ["RELIANCE.NS"]
    assert not df.empty


def test_fallback_raises_when_both_sources_fail(monkeypatch):
    from ml.data import bhavcopy_source

    def fake_bhavcopy(*args, **kwargs):
        raise BhavcopyError("simulated")

    monkeypatch.setattr(bhavcopy_source, "bhavcopy_download", fake_bhavcopy)
    # Block yfinance import
    monkeypatch.setitem(sys.modules, "yfinance", None)
    with pytest.raises(BhavcopyError):
        bhavcopy_download_with_fallback(["RELIANCE"], "2024-01-01", "2024-01-02")
