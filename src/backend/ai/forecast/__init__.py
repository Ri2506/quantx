"""
Zero-shot time-series forecasting — F3 Momentum.

Two foundation models, both zero-shot (no training needed):

- **Google TimesFM 200M** — decoder-only, patches-in / patches-out.
  HuggingFace ``google/timesfm-1.0-200m-pytorch``.
- **Amazon Chronos-Bolt Base 205M** — T5-based, quantile forecaster.
  HuggingFace ``amazon/chronos-bolt-base``.

Public API::

    from src.backend.ai.forecast import ForecastEngine, get_forecast_engine

    engine = get_forecast_engine()
    result = engine.forecast_symbol("TCS", horizons=[1, 5, 10, 15])
    # ForecastResult(symbol=..., horizons={1: ..., 5: ..., ...},
    #                timesfm_ready=True, chronos_ready=True)

    # Universe-scale — used by the nightly scheduler
    results = engine.forecast_universe(symbols, horizons=[1, 5, 10, 15])

Heavy deps (``timesfm``, ``chronos-forecasting``, ``torch``) are imported
lazily. If a package is missing the adapter stays in ``ready=False``
state; the engine still runs with whatever models loaded.
"""

from .base import BaseForecaster, ForecastResult, HorizonForecast
from .chronos_adapter import ChronosForecaster
from .engine import ForecastEngine, get_forecast_engine
from .ensemble import ensemble_forecast
from .timesfm_adapter import TimesFMForecaster

__all__ = [
    "BaseForecaster",
    "ChronosForecaster",
    "ForecastEngine",
    "ForecastResult",
    "HorizonForecast",
    "TimesFMForecaster",
    "ensemble_forecast",
    "get_forecast_engine",
]
