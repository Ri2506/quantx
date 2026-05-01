"""PR 184 — PIT fundamentals layer tests."""
from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from ml.data.fundamentals_pit import (
    DEFAULT_PUBLICATION_LAG_DAYS,
    FUNDAMENTALS_FEATURE_NAMES,
    FundamentalsFeatureConfig,
    FundamentalsRecord,
    compute_fundamentals_features,
    get_pit_fundamentals,
    reindex_fundamentals_to,
    upsert_records,
)


@pytest.fixture
def fake_cache(tmp_path, monkeypatch):
    """Redirect the cache file to tmp_path."""
    cache_file = tmp_path / "fundamentals_pit.parquet"
    from ml.data import fundamentals_pit as mod
    monkeypatch.setattr(mod, "FUNDAMENTALS_CACHE_FILE", cache_file)
    return cache_file


_QUARTER_END_DAYS = {1: 31, 2: 30, 3: 30, 4: 31}   # March, June, September, December


def _make_record(symbol="X", q=1, year=2024, **fields):
    """Build a FundamentalsRecord at quarter q of given year."""
    quarter_end = date(year, q * 3, _QUARTER_END_DAYS[q])
    pub = quarter_end + timedelta(days=DEFAULT_PUBLICATION_LAG_DAYS)
    return FundamentalsRecord(
        symbol=symbol, period_end=quarter_end, published_date=pub,
        source="manual", **fields,
    )


# ---------- upsert_records ----------

def test_upsert_writes_cache(fake_cache):
    upsert_records([_make_record("X", q=1, eps_ttm=10.0)])
    assert fake_cache.exists()
    df = pd.read_parquet(fake_cache)
    assert len(df) == 1
    assert df.iloc[0]["symbol"] == "X"
    assert df.iloc[0]["eps_ttm"] == 10.0


def test_upsert_idempotent_same_period(fake_cache):
    """Same (symbol, period_end) twice with same source → still 1 row."""
    upsert_records([_make_record("X", q=1, eps_ttm=10.0)])
    upsert_records([_make_record("X", q=1, eps_ttm=12.0)])
    df = pd.read_parquet(fake_cache)
    assert len(df) == 1
    assert df.iloc[0]["eps_ttm"] == 12.0


def test_upsert_higher_priority_wins(fake_cache):
    """When multiple sources cover the same period, highest priority wins."""
    rec_yf = _make_record("X", q=1, eps_ttm=10.0)
    rec_yf.source = "yfinance"
    rec_nse = _make_record("X", q=1, eps_ttm=11.5)
    rec_nse.source = "nse_filing"
    upsert_records([rec_yf])
    upsert_records([rec_nse])
    df = pd.read_parquet(fake_cache)
    assert len(df) == 1
    assert df.iloc[0]["source"] == "nse_filing"
    assert df.iloc[0]["eps_ttm"] == 11.5


# ---------- get_pit_fundamentals ----------

def test_pit_excludes_unpublished(fake_cache):
    """Records published AFTER as_of must not be returned."""
    rec = _make_record("X", q=1, eps_ttm=10.0)
    upsert_records([rec])
    # rec.published_date is 2024-03-31 + 60 days = 2024-05-30
    # Ask for as_of BEFORE the publication date
    out = get_pit_fundamentals(["X"], as_of=date(2024, 4, 1))
    assert out.empty


def test_pit_includes_published(fake_cache):
    rec = _make_record("X", q=1, eps_ttm=10.0)
    upsert_records([rec])
    # Ask for as_of AFTER publication date
    out = get_pit_fundamentals(["X"], as_of=date(2024, 8, 1))
    assert not out.empty
    assert out.iloc[0]["eps_ttm"] == 10.0


def test_pit_returns_n_quarters(fake_cache):
    """Multiple quarters → return latest n_quarters of them."""
    for q in (1, 2, 3, 4):
        upsert_records([_make_record("X", q=q, year=2024,
                                      eps_ttm=10.0 + q)])
    out = get_pit_fundamentals(["X"], as_of=date(2025, 6, 1), n_quarters=3)
    assert len(out) == 3


def test_pit_multi_symbol(fake_cache):
    upsert_records([
        _make_record("X", q=1, eps_ttm=10.0),
        _make_record("Y", q=1, eps_ttm=20.0),
    ])
    out = get_pit_fundamentals(["X", "Y"], as_of=date(2024, 8, 1))
    syms = out.index.get_level_values("symbol").unique().tolist()
    assert set(syms) == {"X", "Y"}


# ---------- compute_fundamentals_features ----------

def test_features_empty_input_returns_empty():
    out = compute_fundamentals_features(pd.DataFrame(), as_of=date(2024, 1, 1))
    assert out.empty
    assert list(out.columns) == FUNDAMENTALS_FEATURE_NAMES


def test_features_eps_yoy_growth(fake_cache):
    """5 quarters of EPS data → eps_yoy_growth = (latest / 4q-ago) - 1."""
    for q_idx, year in enumerate([2023, 2023, 2023, 2023, 2024]):
        q = (q_idx % 4) + 1
        upsert_records([_make_record(
            "X", q=q, year=year, eps_ttm=10.0 + q_idx,
        )])
    out = get_pit_fundamentals(["X"], as_of=date(2024, 6, 1), n_quarters=5)
    feats = compute_fundamentals_features(out, as_of=date(2024, 6, 1))
    assert "X" in feats.index
    # 5 quarters: prior=10.0, latest=14.0 → (14-10)/10 = 0.4
    assert feats.loc["X", "eps_yoy_growth"] == pytest.approx(0.4)


def test_features_revenue_yoy_passthrough(fake_cache):
    upsert_records([_make_record("X", q=1, revenue_yoy=0.15)])
    out = get_pit_fundamentals(["X"], as_of=date(2024, 8, 1))
    feats = compute_fundamentals_features(out, as_of=date(2024, 8, 1))
    assert feats.loc["X", "revenue_yoy_growth"] == pytest.approx(0.15)


def test_features_margin_trend(fake_cache):
    """Margin trend = latest minus 4-quarter mean."""
    margins = [0.20, 0.18, 0.22, 0.25]   # 4 quarters, latest = 0.25
    for q_idx, m in enumerate(margins):
        q = q_idx + 1
        upsert_records([_make_record("X", q=q, year=2024, operating_margin=m)])
    out = get_pit_fundamentals(["X"], as_of=date(2025, 6, 1), n_quarters=4)
    feats = compute_fundamentals_features(out, as_of=date(2025, 6, 1))
    expected = 0.25 - np.mean(margins)
    assert feats.loc["X", "margin_trend_4q"] == pytest.approx(expected)


def test_features_promoter_delta(fake_cache):
    """Promoter delta = latest - 4-quarters-ago."""
    for q_idx, year in enumerate([2023, 2023, 2023, 2023, 2024]):
        q = (q_idx % 4) + 1
        upsert_records([_make_record(
            "X", q=q, year=year, promoter_pct=0.50 + 0.01 * q_idx,
        )])
    out = get_pit_fundamentals(["X"], as_of=date(2024, 6, 1), n_quarters=5)
    feats = compute_fundamentals_features(out, as_of=date(2024, 6, 1))
    # latest=0.54, prior=0.50 → delta=0.04
    assert feats.loc["X", "promoter_delta_4q"] == pytest.approx(0.04)


def test_features_zero_fill_when_no_data(fake_cache):
    """Symbol with no fundamentals → empty input → empty output."""
    out = get_pit_fundamentals(["GHOST"], as_of=date(2024, 6, 1))
    feats = compute_fundamentals_features(out, as_of=date(2024, 6, 1))
    assert feats.empty


# ---------- reindex_fundamentals_to ----------

def test_reindex_broadcasts_single_row():
    target = pd.date_range("2024-01-01", "2024-01-05", freq="D")
    row = pd.Series({n: 0.5 for n in FUNDAMENTALS_FEATURE_NAMES})
    out = reindex_fundamentals_to(row, target)
    assert len(out) == 5
    assert (out["eps_yoy_growth"] == 0.5).all()


def test_reindex_none_returns_zero_filled():
    target = pd.date_range("2024-01-01", "2024-01-05", freq="D")
    out = reindex_fundamentals_to(None, target)
    assert len(out) == 5
    assert (out == 0.0).all().all()


def test_reindex_uses_fillna_value():
    target = pd.date_range("2024-01-01", "2024-01-05", freq="D")
    cfg = FundamentalsFeatureConfig(fillna_value=-1.0)
    out = reindex_fundamentals_to(None, target, cfg=cfg)
    assert (out == -1.0).all().all()


# ---------- config defaults ----------

def test_config_defaults():
    cfg = FundamentalsFeatureConfig()
    assert cfg.n_quarters_for_growth == 4
    assert cfg.fillna_value == 0.0


# ---------- FUNDAMENTALS_FEATURE_NAMES count ----------

def test_feature_count_is_8():
    """The PR ships 8 fundamentals features."""
    assert len(FUNDAMENTALS_FEATURE_NAMES) == 8


# ---------- record-level ----------

def test_record_to_row_preserves_fields():
    rec = FundamentalsRecord(
        symbol="X", period_end=date(2024, 3, 31),
        published_date=date(2024, 5, 30), source="yfinance",
        eps_ttm=12.5, revenue_yoy=0.15,
    )
    row = rec.to_row()
    assert row["symbol"] == "X"
    assert row["eps_ttm"] == 12.5
    assert row["revenue_yoy"] == 0.15
    assert row["source"] == "yfinance"
