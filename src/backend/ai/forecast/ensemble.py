"""
Ensemble — combine TimesFM + Chronos-Bolt (+ optional Chronos-2) into a
single per-horizon quantile forecast with derived direction.

Strategy: **equal-weight mean of per-model quantiles**. If either model
is missing, we fall back to the single available one.

Direction logic (for ``forecast_scores.direction``):
  up% = (ensemble_p50 - last_close) / last_close
  up% >  0.5%  → bullish
  up% < -0.5%  → bearish
  else          → neutral
"""

from __future__ import annotations

import logging
from typing import Dict, Optional

from .base import HorizonForecast

logger = logging.getLogger(__name__)

DIRECTION_THRESHOLD = 0.005  # 0.5%


def ensemble_forecast(
    *,
    last_close: float,
    timesfm: Optional[Dict[int, HorizonForecast]] = None,
    chronos_bolt: Optional[Dict[int, HorizonForecast]] = None,
    chronos_2: Optional[Dict[int, HorizonForecast]] = None,
) -> Dict[int, Dict]:
    """Merge per-model forecasts into one payload per horizon.

    Returns ``{horizon: {"timesfm_p50", "chronos_bolt_p50",
    "chronos_2_p50", "ensemble_p10/p50/p90", "direction"}}``.
    """
    horizons = set()
    for src in (timesfm, chronos_bolt, chronos_2):
        if src:
            horizons.update(src.keys())
    if not horizons:
        return {}

    out: Dict[int, Dict] = {}
    for h in sorted(horizons):
        t = (timesfm or {}).get(h)
        cb = (chronos_bolt or {}).get(h)
        c2 = (chronos_2 or {}).get(h)

        members = [m for m in (t, cb, c2) if m is not None]
        if not members:
            continue

        ens_p10 = sum(m.p10 for m in members) / len(members)
        ens_p50 = sum(m.p50 for m in members) / len(members)
        ens_p90 = sum(m.p90 for m in members) / len(members)

        pct_change = (ens_p50 - last_close) / last_close if last_close else 0.0
        if pct_change > DIRECTION_THRESHOLD:
            direction = "bullish"
        elif pct_change < -DIRECTION_THRESHOLD:
            direction = "bearish"
        else:
            direction = "neutral"

        out[h] = {
            "timesfm_p50":     round(t.p50, 4) if t else None,
            "chronos_bolt_p50": round(cb.p50, 4) if cb else None,
            "chronos_2_p50":   round(c2.p50, 4) if c2 else None,
            "ensemble_p10":    round(ens_p10, 4),
            "ensemble_p50":    round(ens_p50, 4),
            "ensemble_p90":    round(ens_p90, 4),
            "direction":       direction,
        }
    return out
