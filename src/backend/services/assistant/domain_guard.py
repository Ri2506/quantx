"""
Deterministic finance scope guard for assistant prompts.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Awaitable, Callable, Dict, Optional, Set


TOPIC_VALUES = {"markets", "stocks", "trading", "news", "education", "out_of_scope"}


@dataclass(frozen=True)
class DomainDecision:
    allowed: bool
    topic: str
    reason_code: str


class DomainGuard:
    """
    Deterministic allow/deny gate with optional LLM fallback for ambiguous prompts.
    """

    def __init__(
        self,
        fallback_classifier: Optional[Callable[[str], Awaitable[Dict[str, Any]]]] = None,
    ):
        self._fallback_classifier = fallback_classifier

        self._allow_keywords: Dict[str, Set[str]] = {
            "markets": {
                "market",
                "nifty",
                "sensex",
                "banknifty",
                "indices",
                "index",
                "macro",
                "inflation",
                "gdp",
                "yield",
                "interest rate",
                "fii",
                "dii",
                "global market",
                "volatility",
                "vix",
            },
            "stocks": {
                "stock",
                "equity",
                "share",
                "company",
                "earnings",
                "valuation",
                "pe ratio",
                "dividend",
                "sector",
                "fundamental",
                "balance sheet",
                "cash flow",
            },
            "trading": {
                "trade",
                "trading",
                "swing",
                "intraday",
                "futures",
                "options",
                "derivative",
                "hedge",
                "stop loss",
                "target",
                "risk reward",
                "position sizing",
                "portfolio",
                "support",
                "resistance",
            },
            "news": {
                "news",
                "headline",
                "breaking",
                "update",
                "latest",
                "today",
                "announcement",
                "regulation",
                "policy",
                "budget",
                "rbi",
                "fed",
            },
            "education": {
                "learn",
                "explain",
                "what is",
                "how does",
                "beginner",
                "finance",
                "financial",
                "investment",
                "asset allocation",
                "risk management",
                "mutual fund",
                "etf",
                "bond",
            },
        }

        self._deny_keywords: Set[str] = {
            "recipe",
            "cooking",
            "movie",
            "music",
            "lyrics",
            "game",
            "gaming",
            "football",
            "cricket score",
            "politics",
            "dating",
            "relationship",
            "medical",
            "doctor",
            "symptom",
            "disease",
            "homework",
            "essay",
            "poem",
            "code",
            "coding",
            "python script",
            "javascript",
            "react component",
            "travel",
            "hotel",
        }

    @staticmethod
    def _normalize(text: str) -> str:
        return " ".join(text.strip().lower().split())

    def _keyword_hits(self, text: str) -> Dict[str, int]:
        hits: Dict[str, int] = {topic: 0 for topic in self._allow_keywords}
        for topic, keywords in self._allow_keywords.items():
            for kw in keywords:
                if kw in text:
                    hits[topic] += 1
        return hits

    def _deny_hits(self, text: str) -> int:
        return sum(1 for kw in self._deny_keywords if kw in text)

    @staticmethod
    def _select_topic(hits: Dict[str, int]) -> str:
        # Priority order keeps intent stable when multiple categories match.
        priority = ["news", "trading", "stocks", "markets", "education"]
        best_topic = "education"
        best_score = -1
        for topic in priority:
            score = hits.get(topic, 0)
            if score > best_score:
                best_score = score
                best_topic = topic
        return best_topic

    async def _fallback(self, message: str) -> DomainDecision:
        if not self._fallback_classifier:
            return DomainDecision(
                allowed=False,
                topic="out_of_scope",
                reason_code="ambiguous_rejected_no_classifier",
            )

        try:
            result = await self._fallback_classifier(message)
            allowed = bool(result.get("allowed", False))
            topic = str(result.get("topic", "out_of_scope"))
            reason_code = str(result.get("reason_code", "ambiguous_classifier_result"))

            if topic not in TOPIC_VALUES:
                topic = "out_of_scope"

            if not allowed:
                topic = "out_of_scope"

            return DomainDecision(
                allowed=allowed and topic != "out_of_scope",
                topic=topic,
                reason_code=reason_code,
            )
        except Exception:
            return DomainDecision(
                allowed=False,
                topic="out_of_scope",
                reason_code="ambiguous_classifier_error",
            )

    async def evaluate(self, message: str) -> DomainDecision:
        normalized = self._normalize(message)
        if not normalized:
            return DomainDecision(
                allowed=False,
                topic="out_of_scope",
                reason_code="empty_message",
            )

        allow_hits = self._keyword_hits(normalized)
        deny_hits = self._deny_hits(normalized)
        total_allow_hits = sum(allow_hits.values())

        if deny_hits > 0 and total_allow_hits == 0:
            return DomainDecision(
                allowed=False,
                topic="out_of_scope",
                reason_code="denylist_match",
            )

        if total_allow_hits > 0 and deny_hits == 0:
            return DomainDecision(
                allowed=True,
                topic=self._select_topic(allow_hits),
                reason_code="allowlist_match",
            )

        return await self._fallback(normalized)
