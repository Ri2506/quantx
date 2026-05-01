"""PR 183 — sentiment history + feature builder tests."""
from __future__ import annotations

from datetime import date

import numpy as np
import pandas as pd
import pytest

from ml.data.sentiment_history import (
    SentimentFeatureConfig,
    reindex_sentiment_to,
    score_headlines_to_daily,
    sentiment_features_for,
)


class _FakeFinBERT:
    """Stand-in for FinBERTIndia in tests — no model load."""
    ready = True
    def load(self):
        return True
    def classify_batch(self, texts):
        # Heuristic: positive if contains "beat" / "growth" / "buy",
        # negative if "miss" / "drop" / "fraud".
        out = []
        for t in texts:
            lo = t.lower()
            if any(w in lo for w in ("beat", "growth", "buy")):
                out.append({"label": "positive", "score": 0.85})
            elif any(w in lo for w in ("miss", "drop", "fraud")):
                out.append({"label": "negative", "score": -0.85})
            else:
                out.append({"label": "neutral", "score": 0.0})
        return out


@pytest.fixture
def fake_cache(tmp_path, monkeypatch):
    """Redirect the cache file to a tmp_path so tests don't pollute repo."""
    cache_file = tmp_path / "sentiment_history.parquet"
    from ml.data import sentiment_history as mod
    monkeypatch.setattr(mod, "SENTIMENT_CACHE_FILE", cache_file)
    return cache_file


# ---------- score_headlines_to_daily ----------

def test_score_empty_headlines_zero(fake_cache):
    out = score_headlines_to_daily(
        "RELIANCE", "2024-01-15", [],
        finbert=_FakeFinBERT(),
    )
    assert out["daily_score"] == 0.0
    assert out["headline_count"] == 0


def test_score_positive_headlines(fake_cache):
    out = score_headlines_to_daily(
        "RELIANCE", "2024-01-15",
        ["Reliance Q4 beats estimates", "Buy rating from BofA"],
        finbert=_FakeFinBERT(),
    )
    assert out["headline_count"] == 2
    assert out["daily_score"] > 0.5


def test_score_negative_headlines(fake_cache):
    out = score_headlines_to_daily(
        "X", "2024-01-15",
        ["Q4 miss disappoints", "Stock drops on fraud allegations"],
        finbert=_FakeFinBERT(),
    )
    assert out["daily_score"] < -0.5


def test_score_persist_writes_cache(fake_cache):
    score_headlines_to_daily(
        "TCS", "2024-02-01",
        ["TCS reports growth in Q4"],
        finbert=_FakeFinBERT(),
    )
    assert fake_cache.exists()
    df = pd.read_parquet(fake_cache)
    assert len(df) == 1
    assert df.iloc[0]["symbol"] == "TCS"


def test_score_upserts_existing_row(fake_cache):
    """Scoring the same (symbol, date) twice should overwrite, not append."""
    score_headlines_to_daily(
        "TCS", "2024-02-01",
        ["TCS reports growth"],
        finbert=_FakeFinBERT(),
    )
    score_headlines_to_daily(
        "TCS", "2024-02-01",
        ["TCS hit by fraud"],
        finbert=_FakeFinBERT(),
    )
    df = pd.read_parquet(fake_cache)
    rel = df[(df["symbol"] == "TCS") & (df["date"] == pd.Timestamp("2024-02-01"))]
    assert len(rel) == 1
    assert rel.iloc[0]["daily_score"] < 0   # second write overwrote


def test_score_finbert_unavailable_zero(fake_cache, monkeypatch):
    """When FinBERT can't load, return zero score so trainer doesn't fail."""
    class NotReady:
        ready = False
        def load(self):
            return False
    out = score_headlines_to_daily(
        "X", "2024-01-15", ["any headline"],
        finbert=NotReady(),
    )
    assert out["daily_score"] == 0.0
    assert out["headline_count"] == 0


# ---------- sentiment_features_for ----------

def test_features_empty_cache_zero_filled(fake_cache):
    feats = sentiment_features_for(
        ["RELIANCE", "TCS"],
        "2024-01-01", "2024-01-31",
    )
    assert (feats["sentiment_5d_mean"] == 0.0).all()
    assert (feats["sentiment_5d_count"] == 0).all()


def test_features_rolling_mean_correctness(fake_cache):
    """Pre-populate cache with two days of strong-positive scores; the
    5-day rolling mean on the second day should equal mean of both."""
    cache = pd.DataFrame([
        {"symbol": "X", "date": pd.Timestamp("2024-01-08"),
         "daily_score": 0.8, "headline_count": 3},
        {"symbol": "X", "date": pd.Timestamp("2024-01-09"),
         "daily_score": 0.6, "headline_count": 2},
    ])
    cache.to_parquet(fake_cache)

    feats = sentiment_features_for(["X"], "2024-01-08", "2024-01-09")
    sliced = feats.loc["X"]
    assert sliced.loc["2024-01-08", "sentiment_5d_mean"] == pytest.approx(0.8)
    # Day 2: rolling mean of [0.8, 0.6]
    assert sliced.loc["2024-01-09", "sentiment_5d_mean"] == pytest.approx(0.7)


def test_features_min_observations_filter(fake_cache):
    """Days with fewer than min_observations headlines are zeroed."""
    cache = pd.DataFrame([
        {"symbol": "X", "date": pd.Timestamp("2024-01-08"),
         "daily_score": 0.9, "headline_count": 1},
    ])
    cache.to_parquet(fake_cache)

    feats_default = sentiment_features_for(
        ["X"], "2024-01-08", "2024-01-08",
    )
    # min_observations defaults to 1 — score retained
    assert feats_default.loc["X"].loc["2024-01-08", "sentiment_5d_mean"] == pytest.approx(0.9)

    feats_strict = sentiment_features_for(
        ["X"], "2024-01-08", "2024-01-08",
        cfg=SentimentFeatureConfig(min_observations=3),
    )
    # Strict — < 3 headlines on that day → zeroed
    assert feats_strict.loc["X"].loc["2024-01-08", "sentiment_5d_mean"] == 0.0


# ---------- reindex_sentiment_to ----------

def test_reindex_empty_returns_zero_frame(fake_cache):
    target = pd.date_range("2024-01-01", "2024-01-05", freq="D")
    out = reindex_sentiment_to(
        pd.DataFrame(), "RELIANCE", target,
    )
    assert len(out) == 5
    assert (out["sentiment_5d_mean"] == 0.0).all()
    assert (out["sentiment_5d_count"] == 0).all()


def test_reindex_existing_symbol_aligned(fake_cache):
    sentiment = pd.DataFrame({
        "sentiment_5d_mean": [0.5, 0.7, 0.3],
        "sentiment_5d_count": [2, 3, 1],
    }, index=pd.MultiIndex.from_tuples([
        ("RELIANCE", pd.Timestamp("2024-01-08")),
        ("RELIANCE", pd.Timestamp("2024-01-09")),
        ("RELIANCE", pd.Timestamp("2024-01-10")),
    ], names=["symbol", "date"]))
    target = pd.date_range("2024-01-08", "2024-01-12", freq="D")
    out = reindex_sentiment_to(sentiment, "RELIANCE", target)
    assert len(out) == 5
    assert out.loc["2024-01-08", "sentiment_5d_mean"] == 0.5
    # Day past last entry — limit=1 ffill, then zero
    assert out.loc["2024-01-12", "sentiment_5d_mean"] == 0.0


def test_reindex_unknown_symbol_zeros(fake_cache):
    sentiment = pd.DataFrame({
        "sentiment_5d_mean": [0.5],
        "sentiment_5d_count": [2],
    }, index=pd.MultiIndex.from_tuples(
        [("RELIANCE", pd.Timestamp("2024-01-08"))],
        names=["symbol", "date"],
    ))
    target = pd.date_range("2024-01-08", "2024-01-10", freq="D")
    out = reindex_sentiment_to(sentiment, "GHOST_NOT_HERE", target)
    assert len(out) == 3
    assert (out["sentiment_5d_mean"] == 0.0).all()


def test_feature_config_defaults():
    cfg = SentimentFeatureConfig()
    assert cfg.rolling_window == 5
    assert cfg.fillna_value == 0.0
    assert cfg.min_observations == 1
