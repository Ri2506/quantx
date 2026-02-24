"""
Gemini API wrapper with strict finance assistant prompting.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, List, Optional

from ...core.config import settings

try:
    from google import genai
except Exception:  # pragma: no cover - dependency missing path
    genai = None


ALLOWED_TOPICS = ["markets", "stocks", "trading", "news", "education", "out_of_scope"]


class GeminiWrapper:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or settings.GEMINI_API_KEY
        self.model = model or settings.GEMINI_MODEL
        self._client = None

        if self.api_key and genai is not None:
            self._client = genai.Client(api_key=self.api_key)

    @property
    def enabled(self) -> bool:
        return self._client is not None

    @staticmethod
    def _safe_response_text(response: Any) -> str:
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

    @staticmethod
    def _extract_json(text: str) -> Dict[str, Any]:
        if not text:
            return {}
        stripped = text.strip()
        try:
            return json.loads(stripped)
        except Exception:
            pass
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start >= 0 and end > start:
            candidate = stripped[start : end + 1]
            try:
                return json.loads(candidate)
            except Exception:
                return {}
        return {}

    async def _generate(self, prompt: str, temperature: float = 0.2, top_p: float = 0.9) -> str:
        if not self.enabled:
            return ""

        def _sync_call() -> str:
            response = self._client.models.generate_content(
                model=self.model,
                contents=prompt,
                config={"temperature": temperature, "top_p": top_p},
            )
            return self._safe_response_text(response)

        return await asyncio.to_thread(_sync_call)

    async def classify_scope(self, message: str) -> Dict[str, Any]:
        if not self.enabled:
            return {"allowed": False, "topic": "out_of_scope", "reason_code": "classifier_unavailable"}

        prompt = (
            "You are a strict classifier for a finance-only assistant.\n"
            "Classify whether the user prompt is in scope.\n"
            "In scope: finance, stocks, trading, markets, macro, financial news, risk management, portfolio education.\n"
            "Out of scope: coding, entertainment, health, relationships, cooking, travel, or unrelated tasks.\n"
            "Return JSON only with keys: allowed (boolean), topic (one of "
            + ", ".join(ALLOWED_TOPICS)
            + "), reason_code (snake_case short code).\n"
            f"User prompt: {message}"
        )

        raw = await self._generate(prompt=prompt, temperature=0.0, top_p=0.1)
        parsed = self._extract_json(raw)
        allowed = bool(parsed.get("allowed", False))
        topic = str(parsed.get("topic", "out_of_scope"))
        if topic not in ALLOWED_TOPICS:
            topic = "out_of_scope"
        reason_code = str(parsed.get("reason_code", "classifier_default"))
        return {"allowed": allowed and topic != "out_of_scope", "topic": topic, "reason_code": reason_code}

    async def generate_reply(
        self,
        message: str,
        history: List[Dict[str, str]],
        topic: str,
        market_context: Dict[str, Any],
        news_context: List[Dict[str, Any]],
    ) -> str:
        if not self.enabled:
            return (
                "Finance assistant is currently unavailable because the model key is not configured. "
                "Please set GEMINI_API_KEY and retry."
            )

        prompt = (
            "System policy:\n"
            "1) You are SwingAI Finance Intelligence.\n"
            "2) Reply in English only.\n"
            "3) Answer only finance/markets/trading/news/portfolio topics.\n"
            "4) Educational-only: do not provide personalized buy/sell execution instructions.\n"
            "5) If asked for out-of-scope content, refuse.\n"
            "6) Keep response concise and practical.\n\n"
            f"Detected topic: {topic}\n"
            f"Market context JSON: {json.dumps(market_context, ensure_ascii=True)}\n"
            f"News context JSON: {json.dumps(news_context, ensure_ascii=True)}\n"
            f"Conversation history JSON: {json.dumps(history[-12:], ensure_ascii=True)}\n"
            f"User message: {message}\n\n"
            "Return only the assistant response text."
        )

        reply = await self._generate(prompt=prompt, temperature=0.2, top_p=0.9)
        return reply.strip() if reply else "I could not generate a response right now. Please try again."
