"""
TimesFM adapter — Google's 200M decoder-only foundation forecaster (2.5).

- HuggingFace checkpoint: ``google/timesfm-2.5-200m-pytorch``
- Zero-shot: no fine-tune on NSE. 200M params trained on a mix of global
  time-series domains; generalizes to daily equity closes.
- CPU inference: ~3-4s per context for a 15-day horizon. Nightly 500-symbol
  run ≈30 min on CPU.
- Output: ``forecast()`` returns ``(point_forecast, quantile_forecast)``
  where quantile shape is ``(batch, horizon, 10)`` at levels
  [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95].

Package install note: TimesFM 2.x is not on PyPI for Python 3.12 (the
1.x line pins lingvo/paxml). Install from source::

    pip install "timesfm[torch] @ git+https://github.com/google-research/timesfm.git@master"

Lazy loading: heavy imports happen only on first ``load()`` call. If
the package isn't installed, ``ready`` stays False and ``forecast()``
returns ``None``.
"""

from __future__ import annotations

import logging
import threading
from typing import Dict, Optional, Sequence

import numpy as np

from .base import BaseForecaster, HorizonForecast

logger = logging.getLogger(__name__)


class TimesFMForecaster(BaseForecaster):
    name = "timesfm"
    context_length = 512  # TimesFM 2.5 supports up to 16k; 512 is plenty for daily.
    max_horizon = 15

    _lock = threading.Lock()

    def __init__(
        self,
        *,
        checkpoint: str = "google/timesfm-2.5-200m-pytorch",
    ):
        self.checkpoint = checkpoint
        self._model = None

    @property
    def ready(self) -> bool:
        return self._model is not None

    def load(self) -> bool:
        if self.ready:
            return True
        with self._lock:
            if self.ready:
                return True
            try:
                from timesfm import ForecastConfig, TimesFM_2p5_200M_torch
            except Exception as e:
                logger.info("timesfm package not installed (%s) — TimesFM disabled", e)
                return False
            try:
                model = self._load_bypass_hub_kwargs(TimesFM_2p5_200M_torch)
                model.compile(ForecastConfig(
                    max_context=self.context_length,
                    max_horizon=self.max_horizon,
                    normalize_inputs=True,
                    use_continuous_quantile_head=True,
                    force_flip_invariance=True,
                    fix_quantile_crossing=True,
                ))
                self._model = model
                logger.info("TimesFM 2.5 loaded from %s", self.checkpoint)
                return True
            except Exception as e:
                logger.warning("TimesFM load failed: %s", e)
                return False

    def _load_bypass_hub_kwargs(self, cls):
        """Bypass ``PyTorchModelHubMixin.from_pretrained`` because
        ``huggingface_hub>=0.30`` forwards additional kwargs (``proxies``
        etc.) via ``**model_kwargs`` that the TimesFM 2.5 constructor
        rejects. We reproduce ``_from_pretrained``'s essential path —
        download weights + construct model — without the kwarg pollution.
        Fixed upstream once timesfm publishes a 2.5.x+ release.
        """
        import os
        from huggingface_hub import hf_hub_download

        if os.path.isdir(self.checkpoint):
            weights_path = os.path.join(self.checkpoint, cls.WEIGHTS_FILENAME)
        else:
            weights_path = hf_hub_download(
                repo_id=self.checkpoint, filename=cls.WEIGHTS_FILENAME,
            )
        instance = cls(config=None)
        instance.model.load_checkpoint(
            weights_path, torch_compile=instance.torch_compile,
        )
        return instance

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
            ctx = self._prep_context(series, self.context_length)
        except Exception as e:
            logger.debug("TimesFM prep failed: %s", e)
            return None

        max_h = max(self._max_horizon(horizons), 1)
        try:
            point_fc, quant_fc = self._model.forecast(
                horizon=max_h,
                inputs=[ctx.astype("float32")],
            )
            # point_fc: (batch=1, horizon). quant_fc: (batch=1, horizon, 10)
            # where quantile levels are [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95].
            point = np.asarray(point_fc)[0]
            quant = np.asarray(quant_fc)[0]
        except Exception as e:
            logger.debug("TimesFM inference failed: %s", e)
            return None

        q_index = {0.1: 0, 0.5: 4, 0.9: 8}
        out: Dict[int, HorizonForecast] = {}
        for h in horizons:
            h = int(h)
            if h < 1 or h > len(point):
                continue
            step = h - 1
            try:
                p10 = float(quant[step, q_index[0.1]])
                p50 = float(quant[step, q_index[0.5]])
                p90 = float(quant[step, q_index[0.9]])
            except Exception:
                p50 = float(point[step])
                p10 = p90 = p50
            out[h] = HorizonForecast(horizon=h, p10=p10, p50=p50, p90=p90)
        return out
