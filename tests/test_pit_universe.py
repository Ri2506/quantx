"""PR 177 — PIT universe + survivorship handling tests."""
from __future__ import annotations

from datetime import date

import pytest

from ml.data import (
    DELISTED_NSE,
    DelistingEvent,
    LiquidUniverseConfig,
    historical_universe_extras,
    liquid_universe,
    was_listed_at,
)
from ml.data.liquid_universe import _to_date, clear_cache


# ---------- delisted registry semantics ----------

def test_was_listed_at_no_event_returns_true():
    """Symbols not in the registry are assumed always-live."""
    assert was_listed_at("RELIANCE", date(2020, 1, 1))
    assert was_listed_at("RELIANCE", date(2026, 1, 1))


def test_was_listed_at_before_delisting():
    """Before the delisting date, the symbol was tradeable."""
    # DHFL delisted 2021-09-29 per the registry
    assert was_listed_at("DHFL", date(2020, 6, 1))
    assert was_listed_at("DHFL", date(2021, 9, 28))


def test_was_listed_at_after_delisting():
    """On or after the delisting date, the symbol is no longer tradeable."""
    assert not was_listed_at("DHFL", date(2021, 9, 29))
    assert not was_listed_at("DHFL", date(2024, 1, 1))


def test_historical_universe_extras_includes_pre_delist():
    """Symbols that delist AFTER as_of should be in the extras list."""
    extras = historical_universe_extras(date(2018, 1, 1))
    assert "DHFL" in extras           # delisted 2021 — was alive in 2018
    assert "BHUSANSTL" in extras       # delisted 2018-05 — was alive 2018-01
    assert "JETAIRWAYS" in extras      # delisted 2024 — was alive 2018


def test_historical_universe_extras_excludes_post_delist():
    """Symbols delisted before as_of are not extras."""
    extras = historical_universe_extras(date(2025, 1, 1))
    assert "DHFL" not in extras        # delisted 2021 < 2025
    assert "BHUSANSTL" not in extras    # delisted 2018 < 2025


# ---------- _to_date helper ----------

def test_to_date_accepts_iso_string():
    assert _to_date("2024-06-15") == date(2024, 6, 15)


def test_to_date_accepts_date():
    d = date(2024, 6, 15)
    assert _to_date(d) == d


def test_to_date_accepts_none():
    assert _to_date(None) is None


# ---------- liquid_universe API contracts ----------

def test_config_accepts_as_of_date_field():
    """Backwards compat: as_of_date is optional, defaults None."""
    cfg = LiquidUniverseConfig()
    assert cfg.as_of_date is None
    cfg2 = LiquidUniverseConfig(as_of_date="2020-01-01")
    assert cfg2.as_of_date == "2020-01-01"


def test_liquid_universe_pit_does_not_include_post_delisted():
    """When as_of=2024-01-01, DHFL (delisted 2021) must not appear.

    This test relies on the fallback path (no yfinance access) to keep
    the assertion deterministic. We force fallback by using a tiny
    candidate_pool that's guaranteed to fail liquidity filters — which
    drops us into the fallback branch returning pool[:top_n]. The pool
    is built with PIT logic before yfinance is even called, so this is
    the right surface to assert on.
    """
    clear_cache()
    cfg = LiquidUniverseConfig(
        top_n=50, lookback_days=5, min_avg_volume=10**12,  # guaranteed fail
        candidate_pool=["DHFL", "RELIANCE", "TCS"],
        as_of_date="2024-01-01",
    )
    result = liquid_universe(cfg)
    # DHFL should be filtered out by was_listed_at; the others stay.
    assert "DHFL" not in result
    assert "RELIANCE" in result
    assert "TCS" in result


def test_liquid_universe_pit_includes_alive_then_delisted():
    """When as_of=2018-01-01, BHUSANSTL (delisted 2018-05) must appear
    even though it's not in the static NIFTY_200_FALLBACK."""
    clear_cache()
    cfg = LiquidUniverseConfig(
        top_n=300, lookback_days=5, min_avg_volume=10**12,  # force fallback
        as_of_date="2018-01-01",
    )
    result = liquid_universe(cfg)
    assert "BHUSANSTL" in result, (
        "PIT universe at 2018-01-01 must include symbols that were tradeable "
        "then but have since delisted"
    )


def test_liquid_universe_today_still_works():
    """Backwards compat: calling without as_of_date returns today's universe.

    Uses a tiny custom pool so we don't depend on yfinance live data; the
    liquidity filter is set high enough to force the fallback branch which
    returns ``pool[:top_n]`` directly.
    """
    clear_cache()
    cfg = LiquidUniverseConfig(
        top_n=2, lookback_days=5, min_avg_volume=10**12,  # force fallback
        candidate_pool=["RELIANCE", "TCS", "HDFCBANK"],
    )
    result = liquid_universe(cfg)
    assert len(result) == 2
    assert result[0] == "RELIANCE"
    assert result[1] == "TCS"


def test_cache_keyed_by_as_of():
    """Different as_of values should not collide in cache."""
    clear_cache()
    cfg_2018 = LiquidUniverseConfig(
        top_n=300, lookback_days=5, min_avg_volume=10**12,
        as_of_date="2018-01-01",
    )
    cfg_2024 = LiquidUniverseConfig(
        top_n=300, lookback_days=5, min_avg_volume=10**12,
        as_of_date="2024-01-01",
    )
    r_2018 = liquid_universe(cfg_2018)
    r_2024 = liquid_universe(cfg_2024)
    # 2018 universe must include symbols that delisted between 2018 and 2024
    delisted_in_window = {ev.symbol for ev in DELISTED_NSE
                          if date(2018, 1, 1) < ev.delisting_date <= date(2024, 1, 1)}
    for sym in delisted_in_window:
        if sym in r_2018:
            assert sym not in r_2024, f"{sym} leaked into 2024 universe"


def test_registry_entries_well_formed():
    """Sanity: every DelistingEvent has a non-empty symbol, valid date,
    and known reason."""
    valid_reasons = {"bankruptcy", "merger_acquired", "voluntary", "suspension", "scheme"}
    for ev in DELISTED_NSE:
        assert ev.symbol and isinstance(ev.symbol, str)
        assert isinstance(ev.delisting_date, date)
        assert ev.reason in valid_reasons, f"{ev.symbol} has unknown reason {ev.reason!r}"
