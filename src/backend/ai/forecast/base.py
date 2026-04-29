"""
Shared forecaster abstractions.

Every foundation-model adapter returns ``HorizonForecast`` dicts keyed by
day-ahead horizon (1 / 5 / 10 / 15). ``ForecastResult`` aggregates per
symbol with per-model quantiles + the ensemble + direction.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence

import numpy as np


@dataclass
class HorizonForecast:
    """Per-horizon forecast for one model. Prices in absolute (not %)."""
    horizon: int
    p10: float
    p50: float
    p90: float

    def as_dict(self) -> dict:
        return {
            "horizon": self.horizon,
            "p10": round(self.p10, 4),
            "p50": round(self.p50, 4),
            "p90": round(self.p90, 4),
        }


@dataclass
class ForecastResult:
    """Full forecast for one symbol across all requested horizons."""
    symbol: str
    last_close: float
    # Per-horizon → per-model point forecasts + ensemble + direction
    horizons: Dict[int, Dict] = field(default_factory=dict)
    timesfm_ready: bool = False
    chronos_ready: bool = False

    def as_rows(self, trade_date: str) -> List[dict]:
        """Flatten into `forecast_scores` table rows (one per horizon)."""
        rows: List[dict] = []
        for h, payload in self.horizons.items():
            rows.append({
                "symbol": self.symbol,
                "trade_date": trade_date,
                "horizon_days": int(h),
                "timesfm_p50":     payload.get("timesfm_p50"),
                "chronos_bolt_p50": payload.get("chronos_bolt_p50"),
                "chronos_2_p50":   payload.get("chronos_2_p50"),
                "ensemble_p50":    payload.get("ensemble_p50"),
                "ensemble_p10":    payload.get("ensemble_p10"),
                "ensemble_p90":    payload.get("ensemble_p90"),
                "direction":       payload.get("direction"),
            })
        return rows


class BaseForecaster(ABC):
    """Common interface shared by TimesFM + Chronos adapters."""

    name: str = "base"
    context_length: int = 128
    supported_horizons: Sequence[int] = (1, 5, 10, 15)

    @abstractmethod
    def load(self) -> bool:
        """Load the foundation model. Returns True on success, False on
        ImportError / network / no-checkpoint."""

    @property
    @abstractmethod
    def ready(self) -> bool: ...

    @abstractmethod
    def forecast(
        self,
        series: Sequence[float],
        *,
        horizons: Sequence[int] = (1, 5, 10, 15),
        quantiles: Sequence[float] = (0.1, 0.5, 0.9),
    ) -> Optional[Dict[int, HorizonForecast]]:
        """Run zero-shot forecast over ``series`` (daily close prices).
        Returns ``{horizon: HorizonForecast}`` or ``None`` on failure.
        """

    # ------------------------------------------------------------ utilities

    @staticmethod
    def _prep_context(series: Sequence[float], target_len: int) -> np.ndarray:
        arr = np.asarray(series, dtype="float32")
        # drop NaN / inf from the tail
        arr = arr[np.isfinite(arr)]
        if len(arr) < 32:
            raise ValueError(f"forecast needs ≥32 context points, got {len(arr)}")
        return arr[-target_len:] if len(arr) > target_len else arr

    @staticmethod
    def _max_horizon(horizons: Sequence[int]) -> int:
        return max(int(h) for h in horizons)
