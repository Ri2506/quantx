"""
Public model naming registry — the moat layer.

Every user-facing surface (API response labels, UI copy, emails,
digests, pricing page) refers to our AI engines by their **descriptive
product brand name**, never by the underlying architecture.

Internal code paths keep real names (``TFT``, ``Qlib``, ``FinBERT``,
``HMM``, ``LightGBM``, ``FinRL-X``, ``Chronos``, ``TimesFM``, ``XGBoost``,
``PyPortfolioOpt``) — those live in model_registry, scheduler telemetry,
backtest artifacts, MLflow tags, and internal docs. They must never
reach the browser or a non-staff API consumer.

Naming convention:
    *Lens / *Cast / *Scope → forecast / view engines
    *IQ                    → intelligence / classification
    *Rank                  → ranking
    *Pulse                 → real-time / tick
    AutoPilot, EarningsScout, Counterpoint, SectorFlow → one-word roles

When a new engine joins the platform:
    1. Pick a descriptive name following the convention above
       (avoid generic "AI" suffix — prefer tighter pattern names).
    2. Add a row to ``PUBLIC_MODELS`` below.
    3. Use ``public_label(internal_key)`` everywhere in
       user-facing payloads.

Frontend mirror: ``frontend/lib/models.ts``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional


@dataclass(frozen=True)
class PublicModel:
    key: str            # internal stable identifier used in code paths
    name: str           # public brand name
    role: str           # one-line positioning, safe to ship to UI
    hex_color: str      # consistent accent everywhere (landing, dossier, signal cards)


# ---------------------------------------------------------------- registry
# Keys are the internal identifiers we already use around the code.
# The ``name`` column is the ONLY thing that reaches end users.

PUBLIC_MODELS: Dict[str, PublicModel] = {
    "swing_forecast": PublicModel(
        key="swing_forecast", name="SwingLens",
        role="Swing forecast engine — 5-day quantile outlook",
        hex_color="#4FECCD",
    ),
    "intraday_forecast": PublicModel(
        key="intraday_forecast", name="TickPulse",
        role="Intraday forecast engine — 5-minute tick dynamics",
        hex_color="#FEB113",
    ),
    "cross_sectional_ranker": PublicModel(
        key="cross_sectional_ranker", name="AlphaRank",
        role="Cross-sectional alpha ranker — nightly universe sieve",
        hex_color="#5DCBD8",
    ),
    "trajectory_forecast": PublicModel(
        key="trajectory_forecast", name="HorizonCast",
        role="Long-horizon trajectory forecaster",
        hex_color="#8D5CFF",
    ),
    "regime_detector": PublicModel(
        key="regime_detector", name="RegimeIQ",
        role="Market regime detector — bull · sideways · bear",
        hex_color="#FF9900",
    ),
    "sentiment_engine": PublicModel(
        key="sentiment_engine", name="ToneScan",
        role="News sentiment engine — NSE-tuned",
        hex_color="#05B878",
    ),
    "portfolio_optimizer": PublicModel(
        key="portfolio_optimizer", name="AllocIQ",
        role="Portfolio optimizer — quality-first allocation",
        hex_color="#FFD166",
    ),
    "execution_engine": PublicModel(
        key="execution_engine", name="AutoPilot",
        role="Autonomous execution engine — volatility-gated",
        hex_color="#FF5947",
    ),
    "pattern_scorer": PublicModel(
        key="pattern_scorer", name="PatternScope",
        role="Pattern quality scorer — Scanner Lab only",
        hex_color="#00E5CC",
    ),
    "cot_agents": PublicModel(
        key="cot_agents", name="InsightAI",
        role="Multi-agent reasoning — portfolio doctor",
        hex_color="#4FECCD",
    ),
    "debate_engine": PublicModel(
        key="debate_engine", name="Counterpoint",
        role="Bull/Bear debate — high-stakes signals",
        hex_color="#8D5CFF",
    ),
    "sector_rotation": PublicModel(
        key="sector_rotation", name="SectorFlow",
        role="Sector rotation tracker",
        hex_color="#5DCBD8",
    ),
    "earnings_predictor": PublicModel(
        key="earnings_predictor", name="EarningsScout",
        role="Earnings surprise model",
        hex_color="#FEB113",
    ),
    "vix_forecaster": PublicModel(
        key="vix_forecaster", name="VolCast",
        role="Volatility forecaster",
        hex_color="#4FECCD",
    ),
}


def public_label(internal_key: str) -> str:
    """Return the public brand name for an internal key. Unknown keys
    return a capitalized token so we never accidentally leak raw
    identifiers like ``tft_p50`` to the UI."""
    m = PUBLIC_MODELS.get(internal_key)
    if m is None:
        return internal_key.replace("_", " ").title()
    return m.name


def public_model(internal_key: str) -> Optional[PublicModel]:
    return PUBLIC_MODELS.get(internal_key)


def all_public() -> list:
    """Ordered list for landing/pricing/page rendering."""
    return list(PUBLIC_MODELS.values())


__all__ = [
    "PUBLIC_MODELS",
    "PublicModel",
    "all_public",
    "public_label",
    "public_model",
]
