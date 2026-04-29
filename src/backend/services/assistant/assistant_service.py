"""
Finance-only assistant orchestration service.
"""

from __future__ import annotations

import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from ...core.config import settings
from .domain_guard import DomainDecision, DomainGuard
from .gemini_wrapper import GeminiWrapper
from .market_context import MarketContextBuilder
from .news_context import NewsContextService

logger = logging.getLogger(__name__)


OUT_OF_SCOPE_REPLY = (
    "I can only help with finance, stocks, trading, market analysis, and financial news. "
    "Try prompts like: 'What moved NIFTY today?', 'Explain risk-reward in swing trading', "
    "or 'Summarize key Indian and global market headlines.'"
)

NO_LIVE_NEWS_REPLY = (
    "I am unable to fetch reliable live financial news right now. "
    "Please retry in a moment for a source-backed update."
)

RISK_DISCLAIMER = "Educational content only, not personalized financial advice."


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public_model_name() -> str:
    return settings.ASSISTANT_PUBLIC_MODEL_NAME or "Quant X Finance Intelligence"


class AssistantService:
    def __init__(
        self,
        gemini: Optional[GeminiWrapper] = None,
        news_service: Optional[NewsContextService] = None,
        market_context_builder: Optional[MarketContextBuilder] = None,
    ):
        self.gemini = gemini or GeminiWrapper()
        self.news_service = news_service or NewsContextService()
        self.market_context_builder = market_context_builder or MarketContextBuilder()
        self.guard = DomainGuard(fallback_classifier=self.gemini.classify_scope)

    @staticmethod
    def _hash_message(message: str) -> str:
        return hashlib.sha256(message.encode("utf-8")).hexdigest()[:12]

    @staticmethod
    def _normalize_history(history: Optional[List[Dict[str, str]]]) -> List[Dict[str, str]]:
        if not history:
            return []
        normalized: List[Dict[str, str]] = []
        for item in history:
            role = str(item.get("role", "")).strip().lower()
            content = str(item.get("content", "")).strip()
            if role not in {"user", "assistant"}:
                continue
            if not content:
                continue
            normalized.append({"role": role, "content": content})
        return normalized

    def _validate_inputs(self, message: str, history: List[Dict[str, str]]) -> None:
        if not message or not message.strip():
            raise ValueError("Message cannot be empty.")
        if len(message) > settings.ASSISTANT_MAX_USER_MESSAGE_CHARS:
            raise ValueError(
                f"Message exceeds max length ({settings.ASSISTANT_MAX_USER_MESSAGE_CHARS} characters)."
            )
        if len(history) > settings.ASSISTANT_MAX_HISTORY_MESSAGES:
            raise ValueError(
                f"History exceeds max messages ({settings.ASSISTANT_MAX_HISTORY_MESSAGES})."
            )

    @staticmethod
    def _needs_news(topic: str, message: str) -> bool:
        lowered = message.lower()
        return topic == "news" or any(token in lowered for token in ["latest", "today", "headline", "breaking", "news"])

    @staticmethod
    def _format_sources(news_items: List[Any]) -> List[Dict[str, str]]:
        return [item.to_source() for item in news_items]

    @staticmethod
    def _enforce_disclaimer(reply: str, topic: str) -> str:
        if topic in {"stocks", "trading", "markets"} and RISK_DISCLAIMER.lower() not in reply.lower():
            return f"{reply}\n\n{RISK_DISCLAIMER}"
        return reply

    @staticmethod
    def _out_of_scope_payload(reason_code: str) -> Dict[str, Any]:
        return {
            "reply": OUT_OF_SCOPE_REPLY,
            "in_scope": False,
            "topic": "out_of_scope",
            "sources": [],
            "generated_at": _utc_now_iso(),
            "model": _public_model_name(),
            "reason_code": reason_code,
        }

    async def chat(
        self,
        message: str,
        history: Optional[List[Dict[str, str]]] = None,
        page_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        start = time.perf_counter()
        normalized_history = self._normalize_history(history)
        self._validate_inputs(message.strip(), normalized_history)

        decision: DomainDecision = await self.guard.evaluate(message)
        message_hash = self._hash_message(message)
        if not decision.allowed:
            payload = self._out_of_scope_payload(decision.reason_code)
            logger.info(
                "assistant_chat_blocked message_hash=%s topic=%s reason=%s",
                message_hash,
                payload["topic"],
                decision.reason_code,
            )
            return payload

        market_context = await self.market_context_builder.build()
        wants_news = self._needs_news(decision.topic, message)
        news_items = await self.news_service.get_relevant_news(message, limit=5) if wants_news else []

        if decision.topic == "news" and not news_items:
            elapsed_ms = int((time.perf_counter() - start) * 1000)
            logger.info(
                "assistant_chat_news_unavailable message_hash=%s topic=%s elapsed_ms=%s",
                message_hash,
                decision.topic,
                elapsed_ms,
            )
            return {
                "reply": NO_LIVE_NEWS_REPLY,
                "in_scope": True,
                "topic": decision.topic,
                "sources": [],
                "generated_at": _utc_now_iso(),
                "model": _public_model_name(),
                "reason_code": "news_unavailable",
            }

        sources = self._format_sources(news_items)
        # PR 86 — clamp page_context: drop unknown keys and cap each
        # string at 64 chars before passing to the prompt builder. The
        # client supplies it untrusted; we never let it grow the prompt
        # by more than ~250 chars.
        safe_ctx: Dict[str, str] = {}
        if isinstance(page_context, dict):
            for key in ("route", "symbol", "signal_id", "page_label"):
                v = page_context.get(key)
                if isinstance(v, str) and v.strip():
                    safe_ctx[key] = v.strip()[:64]
        reply = await self.gemini.generate_reply(
            message=message,
            history=normalized_history,
            topic=decision.topic,
            market_context=market_context,
            news_context=sources,
            page_context=safe_ctx or None,
        )
        reply = self._enforce_disclaimer(reply, decision.topic)

        elapsed_ms = int((time.perf_counter() - start) * 1000)
        logger.info(
            "assistant_chat_complete message_hash=%s in_scope=true topic=%s sources=%s elapsed_ms=%s model=%s",
            message_hash,
            decision.topic,
            len(sources),
            elapsed_ms,
            settings.GEMINI_MODEL,
        )

        return {
            "reply": reply,
            "in_scope": True,
            "topic": decision.topic,
            "sources": sources,
            "generated_at": _utc_now_iso(),
            "model": _public_model_name(),
            "reason_code": decision.reason_code,
        }
