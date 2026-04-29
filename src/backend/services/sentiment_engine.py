"""
================================================================================
SWING AI NEWS SENTIMENT ENGINE
================================================================================
Scores stock sentiment from recent news headlines using:
1. Google News RSS for stock-specific headline fetching
2. Gemini API for LLM-based sentiment classification (primary)
3. Keyword-based scoring as fallback when Gemini is unavailable

Design principles:
- Graceful degradation: returns neutral (0.0) on any failure
- Aggressive caching: 6-hour TTL to minimise API calls
- Rate limiting: max 10 Gemini calls per minute
- Async throughout for non-blocking integration
================================================================================
"""

import asyncio
import json
import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Keyword dictionaries for fallback scoring
# ---------------------------------------------------------------------------
_POSITIVE_KEYWORDS = frozenset({
    "upgrade", "bullish", "growth", "profit", "beat", "surge", "rally",
    "breakout", "outperform", "record", "strong", "gains", "positive",
    "buy", "accumulate", "expand", "boom", "soar", "jump", "upbeat",
    "optimistic", "recovery", "dividend", "bonus", "target raised",
})

_NEGATIVE_KEYWORDS = frozenset({
    "downgrade", "bearish", "loss", "miss", "crash", "fall", "decline",
    "underperform", "fraud", "scam", "probe", "selloff", "sell-off",
    "weak", "negative", "cut", "slash", "warning", "debt", "default",
    "ban", "penalty", "fine", "plunge", "drop", "concern", "risk",
    "target cut", "downturn", "slump",
})

# Google News RSS base URL for India-centric search
_GNEWS_RSS_URL = (
    "https://news.google.com/rss/search?"
    "q={query}+when:{days}d&hl=en-IN&gl=IN&ceid=IN:en"
)


class SentimentEngine:
    """
    Score stock sentiment from recent news headlines.
    Uses Google News RSS for stock-specific news + Gemini API for classification.
    Falls back to keyword-based scoring if Gemini unavailable.
    """

    def __init__(self, gemini_api_key: str = "", model: str = "gemini-2.0-flash"):
        self.gemini_key = gemini_api_key
        self.model = model

        # Cache: symbol -> {"result": dict, "ts": float}
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 3600 * 6  # 6 hours

        # Gemini rate-limit state (max 10 calls/min)
        self._gemini_timestamps: List[float] = []
        self._gemini_rpm_limit = 10

        # Gemini client (lazy init)
        self._gemini_client: Any = None
        self._gemini_init_done = False

    # ------------------------------------------------------------------
    # Gemini client (lazy)
    # ------------------------------------------------------------------

    def _init_gemini(self) -> None:
        if self._gemini_init_done:
            return
        self._gemini_init_done = True
        if not self.gemini_key:
            return
        try:
            from google import genai
            self._gemini_client = genai.Client(api_key=self.gemini_key)
        except Exception as exc:
            logger.warning("SentimentEngine: Gemini client init failed: %s", exc)

    @property
    def gemini_enabled(self) -> bool:
        self._init_gemini()
        return self._gemini_client is not None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def get_sentiment(self, symbol: str, days: int = 7) -> Dict[str, Any]:
        """
        Return sentiment for a single symbol.

        Returns:
            {
                "score": float (-1.0 to +1.0),
                "label": "bullish" | "bearish" | "neutral",
                "headline_count": int,
                "top_headlines": list[str] (max 3),
                "source": "gemini" | "keyword" | "cache" | "neutral_fallback",
            }
        """
        # 1. Check cache
        cached = self._get_cached(symbol)
        if cached is not None:
            cached["source"] = "cache"
            return cached

        # 2. Fetch headlines
        headlines = await self._fetch_google_news(
            f"{symbol} NSE stock", days=days
        )

        if not headlines:
            result = self._neutral_result("neutral_fallback")
            self._set_cache(symbol, result)
            return result

        headline_texts = [h["title"] for h in headlines]

        # 3. Classify
        source = "keyword"
        if self.gemini_enabled and self._can_call_gemini():
            try:
                score = await self._classify_with_gemini(headline_texts, symbol)
                source = "gemini"
            except Exception as exc:
                logger.warning("Gemini sentiment failed for %s: %s", symbol, exc)
                score = self._classify_with_keywords(headline_texts)
        else:
            score = self._classify_with_keywords(headline_texts)

        label = "bullish" if score > 0.15 else ("bearish" if score < -0.15 else "neutral")
        result = {
            "score": round(score, 3),
            "label": label,
            "headline_count": len(headline_texts),
            "top_headlines": headline_texts[:3],
            "source": source,
        }
        self._set_cache(symbol, result)
        return result

    async def batch_sentiment(self, symbols: List[str]) -> Dict[str, Dict[str, Any]]:
        """Score multiple symbols. Fetches in parallel, batches Gemini calls."""
        if not symbols:
            return {}

        results: Dict[str, Dict[str, Any]] = {}

        # Separate cached vs. uncached
        uncached_symbols: List[str] = []
        for sym in symbols:
            cached = self._get_cached(sym)
            if cached is not None:
                cached["source"] = "cache"
                results[sym] = cached
            else:
                uncached_symbols.append(sym)

        if not uncached_symbols:
            return results

        # Fetch headlines in parallel (limit concurrency to avoid throttling)
        sem = asyncio.Semaphore(5)
        headlines_map: Dict[str, List[Dict[str, str]]] = {}

        async def _fetch(sym: str) -> None:
            async with sem:
                hl = await self._fetch_google_news(f"{sym} NSE stock", days=7)
                headlines_map[sym] = hl

        await asyncio.gather(*[_fetch(s) for s in uncached_symbols])

        # Classify: batch via Gemini if possible, else keyword fallback
        for sym in uncached_symbols:
            hl = headlines_map.get(sym, [])
            if not hl:
                result = self._neutral_result("neutral_fallback")
            else:
                texts = [h["title"] for h in hl]
                source = "keyword"
                if self.gemini_enabled and self._can_call_gemini():
                    try:
                        score = await self._classify_with_gemini(texts, sym)
                        source = "gemini"
                    except Exception:
                        score = self._classify_with_keywords(texts)
                else:
                    score = self._classify_with_keywords(texts)

                label = "bullish" if score > 0.15 else ("bearish" if score < -0.15 else "neutral")
                result = {
                    "score": round(score, 3),
                    "label": label,
                    "headline_count": len(texts),
                    "top_headlines": texts[:3],
                    "source": source,
                }
            self._set_cache(sym, result)
            results[sym] = result

        return results

    # ------------------------------------------------------------------
    # Google News RSS
    # ------------------------------------------------------------------

    async def _fetch_google_news(
        self, query: str, days: int = 7
    ) -> List[Dict[str, str]]:
        """Fetch headlines from Google News RSS. Returns list of {title, published}."""
        url = _GNEWS_RSS_URL.format(query=quote_plus(query), days=days)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    url,
                    headers={"User-Agent": "SwingAI/1.0 NewsBot"},
                    follow_redirects=True,
                )
                if resp.status_code != 200:
                    logger.debug(
                        "Google News RSS returned %d for query=%s",
                        resp.status_code,
                        query,
                    )
                    return []

            root = ET.fromstring(resp.text)
            items: List[Dict[str, str]] = []
            for item in root.iter("item"):
                title_el = item.find("title")
                pub_el = item.find("pubDate")
                if title_el is not None and title_el.text:
                    items.append({
                        "title": title_el.text.strip(),
                        "published": pub_el.text.strip() if pub_el is not None and pub_el.text else "",
                    })
            return items[:20]  # cap at 20 headlines
        except Exception as exc:
            logger.debug("Google News fetch failed for %s: %s", query, exc)
            return []

    # ------------------------------------------------------------------
    # Gemini classification
    # ------------------------------------------------------------------

    async def _classify_with_gemini(
        self, headlines: List[str], symbol: str
    ) -> float:
        """Use Gemini to classify headlines. Returns score in [-1, +1]."""
        self._record_gemini_call()

        # Build a numbered headline list (max 15)
        hl_block = "\n".join(
            f"{i + 1}. {h}" for i, h in enumerate(headlines[:15])
        )
        prompt = (
            f"You are a financial sentiment analyst for Indian stock markets (NSE).\n"
            f"For the stock {symbol}, classify each headline below as:\n"
            f"  +1 = bullish, -1 = bearish, 0 = neutral\n"
            f"Headlines:\n{hl_block}\n\n"
            f"Return ONLY a JSON array of numbers (integers), one per headline. "
            f"Example: [1, 0, -1, 0, 1]\n"
            f"No explanation, just the JSON array."
        )

        def _sync_call() -> str:
            response = self._gemini_client.models.generate_content(
                model=self.model,
                contents=prompt,
                config={"temperature": 0.0, "top_p": 0.1},
            )
            # Extract text from response
            text = getattr(response, "text", None)
            if isinstance(text, str) and text.strip():
                return text.strip()
            candidates = getattr(response, "candidates", None) or []
            for candidate in candidates:
                content = getattr(candidate, "content", None)
                if content is None:
                    continue
                parts = getattr(content, "parts", None) or []
                for part in parts:
                    part_text = getattr(part, "text", "")
                    if isinstance(part_text, str) and part_text.strip():
                        return part_text.strip()
            return ""

        raw = await asyncio.to_thread(_sync_call)
        return self._parse_gemini_scores(raw, len(headlines[:15]))

    @staticmethod
    def _parse_gemini_scores(raw: str, expected_count: int) -> float:
        """Parse Gemini response into aggregate score."""
        if not raw:
            return 0.0

        # Try to find a JSON array in the response
        text = raw.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(
                l for l in lines if not l.strip().startswith("```")
            ).strip()

        try:
            scores = json.loads(text)
        except json.JSONDecodeError:
            # Try to find array within the text
            start = text.find("[")
            end = text.rfind("]")
            if start >= 0 and end > start:
                try:
                    scores = json.loads(text[start : end + 1])
                except json.JSONDecodeError:
                    return 0.0
            else:
                return 0.0

        if not isinstance(scores, list):
            return 0.0

        # Clamp each score to [-1, 1] and compute weighted average
        # More recent headlines (lower index) get slightly higher weight
        valid_scores: List[float] = []
        weights: List[float] = []
        for i, s in enumerate(scores):
            try:
                val = float(s)
                val = max(-1.0, min(1.0, val))
                valid_scores.append(val)
                # Recency weight: first headline = 1.0, last = 0.5
                w = 1.0 - 0.5 * (i / max(len(scores) - 1, 1))
                weights.append(w)
            except (TypeError, ValueError):
                continue

        if not valid_scores:
            return 0.0

        total_weight = sum(weights)
        if total_weight == 0:
            return 0.0

        weighted_avg = sum(s * w for s, w in zip(valid_scores, weights)) / total_weight
        return max(-1.0, min(1.0, weighted_avg))

    # ------------------------------------------------------------------
    # Keyword fallback
    # ------------------------------------------------------------------

    @staticmethod
    def _classify_with_keywords(headlines: List[str]) -> float:
        """Fallback keyword-based sentiment scoring. Returns score in [-1, +1]."""
        if not headlines:
            return 0.0

        total_score = 0.0
        for headline in headlines:
            lower = headline.lower()
            pos = sum(1 for kw in _POSITIVE_KEYWORDS if kw in lower)
            neg = sum(1 for kw in _NEGATIVE_KEYWORDS if kw in lower)
            if pos + neg > 0:
                total_score += (pos - neg) / (pos + neg)
            # Headlines with no keywords contribute 0

        avg = total_score / len(headlines)
        return max(-1.0, min(1.0, avg))

    # ------------------------------------------------------------------
    # Cache helpers
    # ------------------------------------------------------------------

    def _get_cached(self, symbol: str) -> Optional[Dict[str, Any]]:
        entry = self._cache.get(symbol)
        if entry is None:
            return None
        if time.time() - entry["ts"] > self._cache_ttl:
            del self._cache[symbol]
            return None
        return dict(entry["result"])  # shallow copy

    def _set_cache(self, symbol: str, result: Dict[str, Any]) -> None:
        self._cache[symbol] = {"result": result, "ts": time.time()}

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------

    def _can_call_gemini(self) -> bool:
        """Check if we're under the Gemini RPM limit."""
        now = time.time()
        # Prune old timestamps
        self._gemini_timestamps = [
            t for t in self._gemini_timestamps if now - t < 60
        ]
        return len(self._gemini_timestamps) < self._gemini_rpm_limit

    def _record_gemini_call(self) -> None:
        self._gemini_timestamps.append(time.time())

    # ------------------------------------------------------------------
    # Utility
    # ------------------------------------------------------------------

    @staticmethod
    def _neutral_result(source: str = "neutral_fallback") -> Dict[str, Any]:
        return {
            "score": 0.0,
            "label": "neutral",
            "headline_count": 0,
            "top_headlines": [],
            "source": source,
        }
