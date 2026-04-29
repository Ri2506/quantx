"""
ForecastEngine — orchestrates TimesFM + Chronos-Bolt over a symbol or a
universe. Powers F3 Momentum + the ``chronos_nightly_forecast`` job.

Load sequence:
  1. ``TimesFMForecaster.load()`` — lazy, ImportError-safe.
  2. ``ChronosForecaster.load()``  — lazy, ImportError-safe.

If both loaders fail, ``engine.any_ready == False`` and the caller
(scheduler) logs ``status=skipped reason=no_forecasters_ready`` without
raising.

Universe-scale loop:
  - fetch last ~260 bars of daily close per symbol (yfinance + NSE
    suffix via existing market_data provider);
  - run both models;
  - fuse via ``ensemble_forecast`` to produce `forecast_scores` rows.
"""

from __future__ import annotations

import logging
import threading
from datetime import date
from typing import Dict, List, Optional, Sequence

from .base import ForecastResult
from .chronos_adapter import ChronosForecaster
from .ensemble import ensemble_forecast
from .timesfm_adapter import TimesFMForecaster

logger = logging.getLogger(__name__)

_DEFAULT_HORIZONS = (1, 5, 10, 15)


class ForecastEngine:
    """Wraps the two forecasters + fetches historical context per
    symbol + calls the ensemble helper."""

    _lock = threading.Lock()

    def __init__(
        self,
        *,
        timesfm: Optional[TimesFMForecaster] = None,
        chronos: Optional[ChronosForecaster] = None,
    ):
        self.timesfm = timesfm or TimesFMForecaster()
        self.chronos = chronos or ChronosForecaster()
        self._loaded = False

    # ---------------------------------------------------------------- load

    def load(self) -> None:
        with self._lock:
            if self._loaded:
                return
            self.timesfm.load()
            self.chronos.load()
            self._loaded = True
            logger.info(
                "ForecastEngine — TimesFM.ready=%s Chronos.ready=%s",
                self.timesfm.ready, self.chronos.ready,
            )

    @property
    def any_ready(self) -> bool:
        return self.timesfm.ready or self.chronos.ready

    # ------------------------------------------------------ single-symbol

    def forecast_symbol(
        self,
        symbol: str,
        *,
        horizons: Sequence[int] = _DEFAULT_HORIZONS,
    ) -> Optional[ForecastResult]:
        """Return per-horizon ensemble forecast for one symbol, or
        ``None`` if no price data / no models ready."""
        self.load()
        if not self.any_ready:
            return None

        series, last_close = self._load_series(symbol)
        if series is None or last_close is None:
            return None

        tfm = self.timesfm.forecast(series, horizons=horizons) if self.timesfm.ready else None
        chr_ = self.chronos.forecast(series, horizons=horizons) if self.chronos.ready else None

        fused = ensemble_forecast(
            last_close=last_close,
            timesfm=tfm,
            chronos_bolt=chr_,
            chronos_2=None,  # see docstring — fills in later if available
        )
        return ForecastResult(
            symbol=symbol.upper(),
            last_close=last_close,
            horizons=fused,
            timesfm_ready=self.timesfm.ready and tfm is not None,
            chronos_ready=self.chronos.ready and chr_ is not None,
        )

    # ---------------------------------------------------- universe-scale

    def forecast_universe(
        self,
        symbols: List[str],
        *,
        horizons: Sequence[int] = _DEFAULT_HORIZONS,
    ) -> List[dict]:
        """Run forecasts for every symbol and flatten to
        ``forecast_scores``-ready dict rows."""
        self.load()
        if not self.any_ready:
            return []

        trade_date = date.today().isoformat()
        rows: List[dict] = []
        for sym in symbols:
            try:
                result = self.forecast_symbol(sym, horizons=horizons)
                if result is None or not result.horizons:
                    continue
                rows.extend(result.as_rows(trade_date))
            except Exception as e:
                logger.debug("forecast_symbol(%s) failed: %s", sym, e)
        return rows

    # ------------------------------------------------------- data loader

    def _load_series(self, symbol: str):
        """Fetch the trailing 300 daily closes for ``symbol`` via the
        existing market-data provider. Returns ``(series, last_close)``
        or ``(None, None)`` on failure."""
        try:
            from ...services.market_data import get_market_data_provider
            provider = get_market_data_provider()
            df = provider.get_historical(symbol.upper(), period="2y", interval="1d")
        except Exception as e:
            logger.debug("market_data fetch failed for %s: %s", symbol, e)
            return None, None
        if df is None or len(df) < 64:
            return None, None
        df = df.copy()
        df.columns = [c.lower() for c in df.columns]
        if "close" not in df.columns:
            return None, None
        closes = df["close"].dropna().astype("float32").values
        if len(closes) < 64:
            return None, None
        return closes, float(closes[-1])


# ---------------------------------------------------------------- singleton

_engine: Optional[ForecastEngine] = None
_engine_lock = threading.Lock()


def get_forecast_engine() -> ForecastEngine:
    global _engine
    if _engine is not None:
        return _engine
    with _engine_lock:
        if _engine is None:
            _engine = ForecastEngine()
    return _engine
