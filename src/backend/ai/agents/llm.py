"""
LLM adapter — single Gemini access surface for every agent.

Wraps the existing ``GeminiWrapper`` (``src/backend/services/assistant``)
so agents don't duplicate client setup, credit accounting, or JSON
extraction. Also exposes structured-output helpers (``generate_json``)
which every agent below needs.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, Optional

from ...services.assistant.gemini_wrapper import GeminiWrapper

logger = logging.getLogger(__name__)


class LLM:
    """Thin wrapper: one method per call-site pattern agents use."""

    def __init__(self, wrapper: Optional[GeminiWrapper] = None):
        self._wrapper = wrapper or GeminiWrapper()

    @property
    def enabled(self) -> bool:
        return self._wrapper.enabled

    async def complete(
        self,
        prompt: str,
        *,
        temperature: float = 0.2,
        top_p: float = 0.9,
        system: Optional[str] = None,
    ) -> str:
        """Free-text completion. Returns '' if the LLM isn't configured."""
        full_prompt = prompt if system is None else f"{system}\n\n{prompt}"
        return await self._wrapper._generate(
            prompt=full_prompt, temperature=temperature, top_p=top_p
        )

    async def generate_json(
        self,
        prompt: str,
        schema_hint: str,
        *,
        temperature: float = 0.0,
        system: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Ask Gemini for a JSON object. Returns {} on parse failure.

        ``schema_hint`` is a plain-English description of the expected
        fields — Gemini is good enough at JSON mode that we don't need
        strict schema enforcement here, but we do retry-extract from any
        surrounding prose.
        """
        if system is None:
            system = "Respond with a single JSON object only. No prose."
        full_prompt = (
            f"{system}\n\n"
            f"Expected JSON shape:\n{schema_hint}\n\n"
            f"Task:\n{prompt}"
        )
        raw = await self._wrapper._generate(
            prompt=full_prompt, temperature=temperature, top_p=0.1
        )
        return self._wrapper._extract_json(raw)


# ---------------------------------------------------------------- singleton

_llm: Optional[LLM] = None


def get_llm() -> LLM:
    global _llm
    if _llm is None:
        _llm = LLM()
    return _llm
