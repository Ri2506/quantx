"""
PR 137 — TimesFM + Chronos-Bolt zero-shot wrappers (F3 HorizonCast).

These models are *zero-shot* — there is no fine-tune step, only a
registration step that captures the HF model id + a calibration check
on recent NSE closes so we can detect provider drift between deploys.
The unified runner still treats them as Trainers so the registry,
versioning, and admin UI surface them like every other model.

The two trainers are independent:
    momentum_timesfm — google/timesfm-1.0-200m-pytorch
    momentum_chronos — amazon/chronos-bolt-base-pytorch

Inference happens in ``services.momentum_predictor`` (PR 138).
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


# Calibration universe for both models — Nifty 50 large caps. We only
# need a few days of data to verify the model loads + produces
# reasonable forecasts, not full training.
CALIBRATION_UNIVERSE = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK"]
CALIBRATION_HISTORY = 64       # input context length
CALIBRATION_HORIZON = 5        # 1-week ahead forecast


def _download_closes(symbols: List[str]) -> pd.DataFrame:
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required") from exc
    tickers = [f"{s}.NS" for s in symbols]
    df = yf.download(
        tickers, period="6mo", interval="1d", progress=False, auto_adjust=False,
    )
    if df is None or df.empty:
        raise TrainerError("yfinance momentum calibration empty")
    if "Close" in df.columns.get_level_values(0):
        close = df["Close"]
    else:
        close = df
    if isinstance(close.columns, pd.MultiIndex):
        close.columns = [c[0] for c in close.columns]
    close.columns = [c.replace(".NS", "") for c in close.columns]
    return close.dropna(how="all")


def _calibration_metrics(
    forecaster_name: str,
    forecast_fn,
) -> Dict[str, Any]:
    """Common calibration: per-symbol forecast vs realized return.

    Returns mean directional accuracy + mean absolute pct error so the
    runner has something to record into ``model_versions.metrics``.
    """
    closes = _download_closes(CALIBRATION_UNIVERSE)
    accs: List[bool] = []
    errs: List[float] = []

    for sym in closes.columns:
        series = closes[sym].dropna().astype(float)
        if len(series) < CALIBRATION_HISTORY + CALIBRATION_HORIZON:
            continue
        history = series.iloc[-CALIBRATION_HISTORY - CALIBRATION_HORIZON:-CALIBRATION_HORIZON]
        truth = series.iloc[-CALIBRATION_HORIZON:]
        try:
            pred = forecast_fn(history.values, CALIBRATION_HORIZON)
        except Exception as exc:
            logger.warning("%s forecast failed for %s: %s", forecaster_name, sym, exc)
            continue
        pred = np.asarray(pred, dtype=float).flatten()
        if len(pred) != CALIBRATION_HORIZON:
            continue
        # Directional accuracy: did the model get the sign of the
        # cumulative 5-day return right?
        actual_dir = float(truth.iloc[-1] - history.iloc[-1])
        pred_dir = float(pred[-1] - history.iloc[-1])
        accs.append((actual_dir > 0) == (pred_dir > 0))
        # Absolute pct error on terminal point.
        if history.iloc[-1] != 0:
            errs.append(abs(pred[-1] - truth.iloc[-1]) / abs(history.iloc[-1]))
    return {
        "calibration_universe": CALIBRATION_UNIVERSE,
        "calibration_horizon": CALIBRATION_HORIZON,
        "directional_accuracy": float(np.mean(accs)) if accs else None,
        "mae_pct": float(np.mean(errs)) if errs else None,
        "n_calibrations": int(len(errs)),
    }


# ============================================================================
# TimesFM trainer
# ============================================================================


class MomentumTimesFMTrainer(Trainer):
    name = "momentum_timesfm"
    requires_gpu = True   # 200M params; CPU works but slow for inference too
    depends_on: list[str] = []
    # PR 167 — zero-shot foundation models don't backtest as directional
    # signals on their own; consumers (PR 138 momentum email) ensemble
    # the forecast with rule-based filters before generating trades.
    # Skip the promote gate; rely on directional_accuracy from
    # _calibration_metrics instead.
    skip_promote_gate: bool = True

    HF_MODEL_ID = "google/timesfm-1.0-200m-pytorch"

    def train(self, out_dir: Path) -> TrainResult:
        try:
            import timesfm  # noqa: PLC0415, F401
        except ImportError as exc:
            raise TrainerError(
                "timesfm not installed — pip install "
                '"timesfm[torch] @ git+https://github.com/google-research/timesfm.git@master"',
            ) from exc

        # Zero-shot: we don't train. We snapshot the model identifier +
        # version + calibration metrics into a tiny pointer file.
        try:
            tfm = timesfm.TimesFm(
                hparams=timesfm.TimesFmHparams(
                    backend="cpu",
                    per_core_batch_size=8,
                    horizon_len=CALIBRATION_HORIZON,
                ),
                checkpoint=timesfm.TimesFmCheckpoint(huggingface_repo_id=self.HF_MODEL_ID),
            )
        except Exception as exc:
            raise TrainerError(f"TimesFM checkpoint load failed: {exc}")

        def _forecast(history: np.ndarray, horizon: int) -> np.ndarray:
            point, _ = tfm.forecast([history.tolist()], freq=[0])
            return np.asarray(point[0])[:horizon]

        metrics = _calibration_metrics("timesfm", _forecast)

        pointer = out_dir / "timesfm_pointer.json"
        pointer.write_text(json.dumps({
            "hf_model_id": self.HF_MODEL_ID,
            "horizon": CALIBRATION_HORIZON,
            "context": CALIBRATION_HISTORY,
            "type": "zero_shot_pointer",
            "calibration": metrics,
        }, indent=2))

        return TrainResult(
            artifacts=[pointer],
            metrics={**metrics, "hf_model_id": self.HF_MODEL_ID},
            notes="TimesFM 200M zero-shot — pointer + calibration only",
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        m["primary_metric"] = "directional_accuracy"
        m["primary_value"] = result.metrics.get("directional_accuracy")
        return m


# ============================================================================
# Chronos-Bolt trainer
# ============================================================================


class MomentumChronosTrainer(Trainer):
    name = "momentum_chronos"
    requires_gpu = False  # Bolt-Base is small enough for CPU calibration
    depends_on: list[str] = []
    # PR 167 — same opt-out reasoning as TimesFM (zero-shot pointer).
    skip_promote_gate: bool = True

    HF_MODEL_ID = "amazon/chronos-bolt-base"

    def train(self, out_dir: Path) -> TrainResult:
        try:
            from chronos import ChronosBoltPipeline  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(
                "chronos-forecasting not installed — pip install chronos-forecasting",
            ) from exc

        try:
            pipeline = ChronosBoltPipeline.from_pretrained(self.HF_MODEL_ID)
        except Exception as exc:
            raise TrainerError(f"Chronos checkpoint load failed: {exc}")

        def _forecast(history: np.ndarray, horizon: int) -> np.ndarray:
            try:
                import torch  # noqa: PLC0415
            except ImportError as exc:
                raise TrainerError("PyTorch required for Chronos") from exc
            ctx = torch.tensor(history.tolist(), dtype=torch.float32)
            # Chronos library renamed `context=` → `inputs=` in v2.x
            try:
                quantiles, mean = pipeline.predict_quantiles(
                    inputs=ctx,
                    prediction_length=horizon,
                    quantile_levels=[0.1, 0.5, 0.9],
                )
            except TypeError:
                quantiles, mean = pipeline.predict_quantiles(
                    context=ctx,
                    prediction_length=horizon,
                    quantile_levels=[0.1, 0.5, 0.9],
                )
            return np.asarray(mean[0])[:horizon]

        metrics = _calibration_metrics("chronos", _forecast)

        pointer = out_dir / "chronos_pointer.json"
        pointer.write_text(json.dumps({
            "hf_model_id": self.HF_MODEL_ID,
            "horizon": CALIBRATION_HORIZON,
            "context": CALIBRATION_HISTORY,
            "type": "zero_shot_pointer",
            "calibration": metrics,
        }, indent=2))

        return TrainResult(
            artifacts=[pointer],
            metrics={**metrics, "hf_model_id": self.HF_MODEL_ID},
            notes="Chronos-Bolt Base zero-shot — pointer + calibration only",
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        m["primary_metric"] = "directional_accuracy"
        m["primary_value"] = result.metrics.get("directional_accuracy")
        return m
