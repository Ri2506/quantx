"""
PR 164 — tests for liquid universe builder.

We don't hit yfinance in tests (unreliable + slow). We verify:
  - Static fallback contents are correct (Nifty 50 list size)
  - Cache reuses results between calls
  - Config defaults are sensible
  - When yfinance is mocked to fail, fallback is used
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from ml.data import (
    LiquidUniverseConfig,
    NIFTY_200_FALLBACK,
    NIFTY_50_FALLBACK,
    liquid_universe,
)
from ml.data.liquid_universe import clear_cache


@pytest.fixture(autouse=True)
def _clear_cache_each_test():
    clear_cache()
    yield
    clear_cache()


def test_nifty_50_fallback_size():
    assert len(NIFTY_50_FALLBACK) == 49 or len(NIFTY_50_FALLBACK) == 50


def test_nifty_200_fallback_includes_nifty_50():
    nifty50_set = set(NIFTY_50_FALLBACK)
    nifty200_set = set(NIFTY_200_FALLBACK)
    overlap = nifty50_set & nifty200_set
    # Most of Nifty 50 should be in Nifty 200
    assert len(overlap) >= 40


def test_nifty_200_fallback_is_sorted_unique():
    assert NIFTY_200_FALLBACK == sorted(set(NIFTY_200_FALLBACK))


def test_default_config():
    cfg = LiquidUniverseConfig()
    assert cfg.top_n == 200
    assert cfg.lookback_days == 30
    assert cfg.min_price == 10.0
    assert cfg.min_avg_volume == 100_000


def test_falls_back_when_yfinance_raises():
    cfg = LiquidUniverseConfig(top_n=50)
    with patch("yfinance.download", side_effect=RuntimeError("network down")):
        result = liquid_universe(cfg)
    assert len(result) == 50
    # All should come from the static fallback
    for sym in result:
        assert sym in NIFTY_200_FALLBACK


def test_falls_back_when_yfinance_returns_empty():
    cfg = LiquidUniverseConfig(top_n=20)
    with patch("yfinance.download", return_value=None):
        result = liquid_universe(cfg)
    assert len(result) == 20


def test_caches_results():
    cfg = LiquidUniverseConfig(top_n=10)
    with patch("yfinance.download", side_effect=RuntimeError("once")) as mock_yf:
        result_1 = liquid_universe(cfg)
        result_2 = liquid_universe(cfg)
    # Second call should NOT re-hit yfinance
    assert mock_yf.call_count == 1
    assert result_1 == result_2


def test_cache_is_keyed_per_config():
    cfg_a = LiquidUniverseConfig(top_n=10)
    cfg_b = LiquidUniverseConfig(top_n=20)
    with patch("yfinance.download", side_effect=RuntimeError("network")) as mock_yf:
        liquid_universe(cfg_a)
        liquid_universe(cfg_b)
    # Different configs → 2 separate yfinance calls (both fall back)
    assert mock_yf.call_count == 2


def test_custom_candidate_pool():
    custom = ["RELIANCE", "TCS", "INFY"]
    cfg = LiquidUniverseConfig(top_n=2, candidate_pool=custom)
    with patch("yfinance.download", side_effect=RuntimeError("offline")):
        result = liquid_universe(cfg)
    assert len(result) == 2
    for sym in result:
        assert sym in custom
