"""PR 194 — Google News RSS sentiment backfill tests."""
from __future__ import annotations

import sys

import pytest

from ml.data.news_ingester import (
    backfill_sentiment_cache,
    fetch_headlines_for_symbol,
)


class _FakeResponse:
    def __init__(self, content: bytes, status: int = 200):
        self.content = content
        self.status_code = status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


@pytest.fixture
def fake_requests(monkeypatch):
    """Stub requests.get so tests don't hit Google News."""
    captured = {}

    def fake_get(url, params=None, headers=None, timeout=None):
        captured["url"] = url
        captured["params"] = params
        rss = b"""<?xml version="1.0"?>
<rss>
  <channel>
    <item>
      <title>Reliance Q4 results beat estimates - Moneycontrol</title>
    </item>
    <item>
      <title>Reliance shares hit 52-week high - Economic Times</title>
    </item>
  </channel>
</rss>"""
        return _FakeResponse(rss)

    fake_module = type("FakeRequests", (), {"get": staticmethod(fake_get)})()
    monkeypatch.setitem(sys.modules, "requests", fake_module)
    return captured


def test_fetch_strips_publication_suffix(fake_requests):
    titles = fetch_headlines_for_symbol("RELIANCE")
    assert len(titles) == 2
    # Title minus the " - Moneycontrol" suffix
    assert titles[0] == "Reliance Q4 results beat estimates"
    assert titles[1] == "Reliance shares hit 52-week high"


def test_fetch_uses_query_template(fake_requests):
    fetch_headlines_for_symbol("RELIANCE")
    assert fake_requests["params"]["q"] == "RELIANCE stock NSE"
    assert fake_requests["params"]["gl"] == "IN"


def test_fetch_returns_empty_on_network_error(monkeypatch):
    def fake_get(*args, **kwargs):
        raise RuntimeError("simulated network failure")
    monkeypatch.setitem(
        sys.modules, "requests",
        type("M", (), {"get": staticmethod(fake_get)})(),
    )
    titles = fetch_headlines_for_symbol("RELIANCE")
    assert titles == []


def test_fetch_returns_empty_on_bad_xml(monkeypatch):
    monkeypatch.setitem(
        sys.modules, "requests",
        type("M", (), {
            "get": staticmethod(lambda *a, **kw: _FakeResponse(b"<not xml>")),
        })(),
    )
    titles = fetch_headlines_for_symbol("RELIANCE")
    assert titles == []


def test_fetch_respects_limit(monkeypatch):
    """Build an RSS with 200 items; limit=10 → only 10 returned."""
    items = "".join(f"<item><title>news {i}</title></item>" for i in range(200))
    rss = f"<?xml version='1.0'?><rss><channel>{items}</channel></rss>".encode()
    monkeypatch.setitem(
        sys.modules, "requests",
        type("M", (), {
            "get": staticmethod(lambda *a, **kw: _FakeResponse(rss)),
        })(),
    )
    titles = fetch_headlines_for_symbol("X", limit=10)
    assert len(titles) == 10


# ---------- backfill_sentiment_cache ----------

class _FakeFinBERT:
    ready = True
    def load(self): return True
    def classify_batch(self, texts):
        return [{"label": "positive", "score": 0.7}] * len(texts)


def test_backfill_aggregates_metrics(fake_requests, tmp_path, monkeypatch):
    from ml.data import sentiment_history as sh
    monkeypatch.setattr(sh, "SENTIMENT_CACHE_FILE", tmp_path / "s.parquet")

    out = backfill_sentiment_cache(
        symbols=["A", "B", "C"],
        rate_limit_seconds=0,
        finbert=_FakeFinBERT(),
    )
    assert out["n_symbols"] == 3
    assert out["n_with_headlines"] == 3   # fake_requests returns 2 titles each
    assert out["n_scored"] == 3


def test_backfill_collects_errors(monkeypatch, tmp_path):
    from ml.data import news_ingester, sentiment_history as sh
    monkeypatch.setattr(sh, "SENTIMENT_CACHE_FILE", tmp_path / "s.parquet")

    def boom(*args, **kwargs):
        raise RuntimeError("fetch failed")
    monkeypatch.setattr(news_ingester, "fetch_headlines_for_symbol", boom)

    out = backfill_sentiment_cache(
        symbols=["A", "B"], rate_limit_seconds=0,
        finbert=_FakeFinBERT(),
    )
    assert out["n_with_headlines"] == 0
    assert len(out["errors"]) == 2
    assert "fetch" in out["errors"][0]["reason"]
