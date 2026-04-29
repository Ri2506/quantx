"""
F9 Earnings surprise predictor — ML-only (PR 52).

Per the no-fallback rule (memory/feedback_no_fallbacks_no_refunds_2026_04_19),
this module serves predictions **only when the trained XGBoost classifier
is loaded**. Heuristic / rule-based fallbacks were stripped in PR 52 —
we don't simulate AI output.

Runtime contract:
    predict_surprise(symbol, announce_date) →
        * returns a SurprisePrediction when the model is loaded
        * raises ModelNotReadyError otherwise

Callers surface a clean 503 / "coming soon" state to the UI until the
unified training pipeline produces the weights.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict

logger = logging.getLogger(__name__)


class ModelNotReadyError(RuntimeError):
    """Raised when the EarningsScout model is not loaded. Callers
    translate this to a 503 at the HTTP boundary."""


@dataclass
class SurprisePrediction:
    symbol: str
    announce_date: str
    beat_prob: float                  # 0..1
    confidence: str                   # 'high' (ML-served) — only value for now
    evidence: Dict[str, Any] = field(default_factory=dict)


def predict_surprise(
    symbol: str,
    announce_date: date,
    *,
    supabase_client=None,
) -> SurprisePrediction:
    """Produce a ``beat_prob`` from the trained XGBoost classifier.

    Raises ``ModelNotReadyError`` if:
      * xgboost or the training module is unavailable
      * no serialized model exists on disk / in the B2 registry
      * inference fails for this specific row

    No rule-based fallback. Per the no-fallback rule, the caller must
    surface an unavailable state to the user rather than ship
    simulated output.
    """
    sym = symbol.upper()

    try:
        from .training.features import build_features_for
        from .training.trainer import predict_proba as ml_predict_proba, load_model
    except Exception as exc:
        raise ModelNotReadyError(
            f"earnings_scout training module unavailable: {exc}"
        ) from exc

    if load_model() is None:
        raise ModelNotReadyError(
            "earnings_scout model not loaded — run the unified training "
            "pipeline before enabling this feature."
        )

    try:
        features = build_features_for(
            sym, announce_date, supabase_client=supabase_client,
        )
    except Exception as exc:
        raise ModelNotReadyError(
            f"earnings_scout feature build failed for {sym}: {exc}"
        ) from exc

    prob = ml_predict_proba(features)
    if prob is None:
        raise ModelNotReadyError(
            "earnings_scout inference returned no value — model may have "
            "become invalid at runtime."
        )

    return SurprisePrediction(
        symbol=sym,
        announce_date=announce_date.isoformat(),
        beat_prob=round(float(prob), 4),
        confidence="high",
        evidence={
            "method": "xgboost_v1",
            "features": {k: round(float(v), 4) for k, v in features.items()},
        },
    )


def batch_predict(
    symbols_with_dates,
    *,
    supabase_client=None,
):
    """Batch wrapper. Skips rows whose inference fails rather than
    failing the whole batch — but never falls back to a heuristic.
    Returns a list of (prediction | None) in the same order.

    Caller decides whether a partial batch is acceptable.
    """
    out = []
    for sym, d in symbols_with_dates:
        try:
            out.append(predict_surprise(sym, d, supabase_client=supabase_client))
        except ModelNotReadyError as exc:
            logger.debug("batch skip %s: %s", sym, exc)
            out.append(None)
    return out


__all__ = ["SurprisePrediction", "ModelNotReadyError", "predict_surprise", "batch_predict"]
