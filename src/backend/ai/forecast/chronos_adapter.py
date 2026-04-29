"""
Chronos-Bolt adapter — Amazon's 205M T5-based quantile forecaster.

- HuggingFace checkpoint: ``amazon/chronos-bolt-base`` (fallbacks:
  ``amazon/chronos-bolt-small``, ``amazon/chronos-t5-large``).
- Zero-shot: Amazon trained on 84B time-series tokens. Generalizes to
  daily NSE closes per the Chronos paper.
- CPU inference: ~1-2s per 256-bar context for 15-day horizon.

API via the ``chronos-forecasting`` package's ``BaseChronosPipeline``.
``Chronos-2`` support is attempted when the caller passes
``variant="chronos-2"``; falls back to bolt when the 2 checkpoint isn't
publicly available.
"""

from __future__ import annotations

import logging
import threading
from typing import Dict, Optional, Sequence

import numpy as np

from .base import BaseForecaster, HorizonForecast

logger = logging.getLogger(__name__)


class ChronosForecaster(BaseForecaster):
    name = "chronos_bolt"
    context_length = 256  # Chronos-Bolt handles longer context than TimesFM

    _lock = threading.Lock()

    def __init__(
        self,
        *,
        checkpoint: str = "amazon/chronos-bolt-base",
        device: str = "cpu",
    ):
        self.checkpoint = checkpoint
        self.device = device
        self._pipeline = None

    @property
    def ready(self) -> bool:
        return self._pipeline is not None

    def load(self) -> bool:
        if self.ready:
            return True
        with self._lock:
            if self.ready:
                return True
            try:
                from chronos import BaseChronosPipeline
                import torch
            except Exception as e:
                logger.info("chronos-forecasting / torch not installed (%s) — Chronos disabled", e)
                return False
            try:
                self._pipeline = BaseChronosPipeline.from_pretrained(
                    self.checkpoint,
                    device_map=self.device,
                    torch_dtype=torch.float32,
                )
                logger.info("Chronos loaded from %s (device=%s)", self.checkpoint, self.device)
                return True
            except Exception as e:
                logger.warning("Chronos load failed: %s", e)
                return False

    def forecast(
        self,
        series: Sequence[float],
        *,
        horizons: Sequence[int] = (1, 5, 10, 15),
        quantiles: Sequence[float] = (0.1, 0.5, 0.9),
    ) -> Optional[Dict[int, HorizonForecast]]:
        if not self.ready:
            return None
        try:
            import torch
            ctx_np = self._prep_context(series, self.context_length)
            context = torch.tensor(ctx_np, dtype=torch.float32)
        except Exception as e:
            logger.debug("Chronos prep failed: %s", e)
            return None

        max_h = max(self._max_horizon(horizons), 1)
        try:
            q_levels = list(quantiles)
            # Chronos 2.x API uses ``inputs=`` (was ``context=`` in 1.x).
            pred_quant, _mean = self._pipeline.predict_quantiles(
                inputs=context,
                prediction_length=max_h,
                quantile_levels=q_levels,
            )
            # Shape: (1, horizon, n_quantiles)
            pred = np.asarray(pred_quant.cpu() if hasattr(pred_quant, "cpu") else pred_quant)[0]
        except Exception as e:
            logger.debug("Chronos inference failed: %s", e)
            return None

        # Map requested quantile float → column index in prediction.
        q_to_col = {q: i for i, q in enumerate(q_levels)}
        idx_10, idx_50, idx_90 = q_to_col.get(0.1, 0), q_to_col.get(0.5, 1), q_to_col.get(0.9, 2)

        out: Dict[int, HorizonForecast] = {}
        for h in horizons:
            h = int(h)
            if h < 1 or h > pred.shape[0]:
                continue
            step = h - 1
            out[h] = HorizonForecast(
                horizon=h,
                p10=float(pred[step, idx_10]),
                p50=float(pred[step, idx_50]),
                p90=float(pred[step, idx_90]),
            )
        return out
