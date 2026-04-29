"""
FinBERT-India sentiment package — F1/F7/F9/F12 feature source.

This is the **batch** pipeline that feeds the ``news_sentiment`` table.
For single-symbol real-time Gemini scoring see
``src/backend/services/sentiment_engine.py``.

Public API::

    from src.backend.ai.sentiment import (
        FinBERTIndia, SentimentEngine, fetch_headlines, get_sentiment_engine,
    )

    engine = get_sentiment_engine()
    engine.load()
    rows = engine.score_universe(['RELIANCE', 'TCS', ...])  # news_sentiment rows
"""

from .engine import SentimentEngine, get_sentiment_engine
from .finbert_india import FinBERTIndia, get_finbert
from .news_fetcher import fetch_headlines

__all__ = [
    "FinBERTIndia",
    "SentimentEngine",
    "fetch_headlines",
    "get_finbert",
    "get_sentiment_engine",
]
