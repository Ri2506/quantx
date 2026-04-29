"""
B2 chart-vision analyzer.

Renders a server-side chart image for a symbol and hands it to Gemini
2.0 Flash's native vision endpoint alongside a structured prompt.
Returns a typed ``VisionAnalysis`` with trend / pattern / S-R / setup
thesis fields.

The Gemini call uses the existing client configured in
``src/backend/services/assistant/gemini_wrapper.py``. Gemini 2.0 Flash
supports inline PNG data up to 20 MB — our 800×500 charts are ~40 KB so
we fit comfortably.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class VisionAnalysis:
    symbol: str
    available: bool
    # Structured analysis (populated when available=True):
    trend: Optional[str] = None                # uptrend | downtrend | range | unclear
    pattern: Optional[str] = None              # e.g. 'ascending triangle', 'double bottom'
    support_levels: List[float] = field(default_factory=list)
    resistance_levels: List[float] = field(default_factory=list)
    volume_signal: Optional[str] = None        # 'accumulation' | 'distribution' | 'neutral'
    setup: Optional[str] = None                # 'bullish continuation' | ...
    confidence: Optional[int] = None           # 0..100
    narrative: Optional[str] = None            # 2-3 sentence thesis
    notes: List[str] = field(default_factory=list)


PROMPT = (
    "You are a technical chart reader for an Indian-equity trading app. "
    "Analyze the attached candlestick chart (last 120 daily bars) and "
    "produce a strict JSON object.\n\n"
    "Required fields:\n"
    "  trend: one of 'uptrend' | 'downtrend' | 'range' | 'unclear'\n"
    "  pattern: short label for the dominant pattern or '' if none (e.g. "
    "'ascending triangle', 'bull flag', 'double bottom', 'rising channel').\n"
    "  support_levels: array of up to 3 prices where support has formed, sorted descending.\n"
    "  resistance_levels: array of up to 3 prices where resistance has formed, sorted ascending.\n"
    "  volume_signal: one of 'accumulation' | 'distribution' | 'neutral'\n"
    "  setup: one of 'bullish continuation' | 'bullish reversal' | "
    "'bearish continuation' | 'bearish reversal' | 'range-bound' | 'no edge'\n"
    "  confidence: integer 0..100 — your conviction in this read\n"
    "  narrative: 2-3 sentences in the second person explaining what the "
    "chart is showing right now and what matters for the next 5-10 days.\n\n"
    "Rules:\n"
    "- Respond with JSON only, no prose around it.\n"
    "- Do not mention AI architecture names like TFT, LightGBM, FinBERT, HMM, "
    "LSTM, XGBoost, Chronos, TimesFM, FinRL, Qlib. Use plain trading "
    "language and, when you must reference our product, call them our "
    "'engines'.\n"
    "- Keep the narrative direct and practical. No disclaimers."
)


def _extract_json(raw: str) -> Dict[str, Any]:
    stripped = (raw or "").strip()
    if stripped.startswith("```"):
        # Strip fences.
        parts = stripped.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("{"):
                stripped = p
                break
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start < 0 or end <= start:
        return {}
    try:
        return json.loads(stripped[start : end + 1])
    except Exception:
        return {}


async def _gemini_analyze(png_bytes: bytes) -> Optional[Dict[str, Any]]:
    """Send the chart image + prompt to Gemini's vision endpoint.
    Returns parsed JSON on success, None otherwise."""
    try:
        from ...services.assistant.gemini_wrapper import GeminiWrapper
    except Exception as exc:
        logger.warning("gemini wrapper import failed: %s", exc)
        return None

    wrapper = GeminiWrapper()
    if not wrapper.enabled or not getattr(wrapper, "_client", None):
        return None

    def _sync_call() -> str:
        try:
            # Gemini SDK Part spec for inline image — both the old and new
            # SDK shapes accept {"inline_data": {"mime_type", "data"}} as a
            # content part. The ``google-genai`` client also accepts PIL
            # Images directly, but we ship raw bytes to avoid an extra dep.
            import base64
            encoded = base64.b64encode(png_bytes).decode("ascii")
            response = wrapper._client.models.generate_content(
                model=wrapper.model,
                contents=[
                    {"text": PROMPT},
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": encoded,
                        }
                    },
                ],
                config={"temperature": 0.2, "top_p": 0.9},
            )
            return wrapper._safe_response_text(response) or ""
        except Exception as exc:
            logger.warning("gemini vision call failed: %s", exc)
            return ""

    raw = await asyncio.to_thread(_sync_call)
    if not raw:
        return None
    return _extract_json(raw)


async def analyze_chart(symbol: str) -> VisionAnalysis:
    """End-to-end: render → Gemini → parsed analysis.  Never raises;
    on any failure returns ``VisionAnalysis(available=False)``."""
    sym = symbol.upper().replace(".NS", "")

    from .chart_image import render_chart_png
    png = await asyncio.to_thread(render_chart_png, sym)
    if png is None:
        return VisionAnalysis(symbol=sym, available=False,
                              notes=["chart_render_failed"])

    parsed = await _gemini_analyze(png)
    if not parsed:
        return VisionAnalysis(symbol=sym, available=False,
                              notes=["vision_call_failed"])

    # Best-effort field coercion.
    try:
        support = [float(x) for x in (parsed.get("support_levels") or []) if _is_numeric(x)]
    except Exception:
        support = []
    try:
        resistance = [float(x) for x in (parsed.get("resistance_levels") or []) if _is_numeric(x)]
    except Exception:
        resistance = []
    try:
        confidence = int(parsed.get("confidence")) if parsed.get("confidence") is not None else None
        if confidence is not None:
            confidence = max(0, min(100, confidence))
    except Exception:
        confidence = None

    return VisionAnalysis(
        symbol=sym,
        available=True,
        trend=parsed.get("trend"),
        pattern=parsed.get("pattern") or None,
        support_levels=support[:3],
        resistance_levels=resistance[:3],
        volume_signal=parsed.get("volume_signal"),
        setup=parsed.get("setup"),
        confidence=confidence,
        narrative=parsed.get("narrative"),
    )


def _is_numeric(x: Any) -> bool:
    if isinstance(x, (int, float)):
        return True
    if isinstance(x, str):
        try:
            float(x)
            return True
        except Exception:
            return False
    return False
