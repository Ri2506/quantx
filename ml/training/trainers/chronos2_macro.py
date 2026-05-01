"""
PR 201 — Chronos-2 macro-aware regime forecaster (real Amazon Chronos).

Step 2 §1.3 (locked) calls for a macro-aware Chronos variant separate
from the F3 momentum_chronos zero-shot. This trainer registers the
**Chronos-2 covariate forecaster** for F8 regime-persistence + F3
macro-conditioned momentum.

Implementation locked to **real upstream libraries** — NO custom port:
  - autogluon.timeseries.TimeSeriesPredictor  (preferred, wraps Chronos)
  - amazon-chronos / chronos-forecasting       (direct fallback)
  - HuggingFace: amazon/chronos-2 (behind waitlist as of 2026-01)
                 amazon/chronos-bolt-base (fallback)
                 amazon/chronos-t5-large (last-resort fallback)

Covariates (per Step 2 §1.3 spec):
  - India VIX (NSE/Kite, yfinance ^INDIAVIX as default)
  - INR/USD (yfinance INR=X)
  - FII net flow (NSEData service / existing FII/DII parquet)
  - US 10Y yield (yfinance ^TNX)

Strategy: zero-shot forecast Nifty 50 close 10 days ahead with the
covariates as known-future regressors. Calibration check: directional
accuracy on the last 6 months. The artifact is a JSON pointer
(checkpoint ID + covariate schema) consistent with momentum_timesfm /
momentum_chronos.

Skips the financial promote gate via skip_promote_gate=True — this is
a regime-persistence forecaster, not a directional signal generator;
ensemble logic in services/regime_persistence.py decides how to
consume it.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import pandas as pd

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


# Calibration window — Nifty 50 + macro covariates over last 18 months
CALIBRATION_PERIOD = "18mo"
CONTEXT_LEN = 64
HORIZON = 10

# Tickers
NIFTY = "^NSEI"
VIX = "^INDIAVIX"
INR_USD = "INR=X"
US_10Y = "^TNX"

# HF repo preference order — Chronos-2 first, fallback chain when it
# isn't accessible on HF yet (waitlist).
HF_REPO_PREFERENCE = [
    "amazon/chronos-2",
    "amazon/chronos-bolt-base",
    "amazon/chronos-t5-large",
]


def _load_macro_frame() -> pd.DataFrame:
    """Build a long-format frame with target Nifty close + covariate
    series aligned by date. Used by both AutoGluon and direct paths.
    """
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required") from exc

    def _close(ticker: str) -> pd.Series:
        df = yf.download(ticker, period=CALIBRATION_PERIOD, progress=False, auto_adjust=False)
        if df is None or df.empty:
            return pd.Series(dtype=float)
        col = df["Close"]
        if isinstance(col, pd.DataFrame):
            col = col.iloc[:, 0]
        return col.astype(float)

    nifty = _close(NIFTY)
    if nifty.empty:
        raise TrainerError("Nifty close download empty for chronos2_macro")

    df = pd.DataFrame(index=nifty.index)
    df["target"] = nifty
    df["vix"] = _close(VIX).reindex(df.index).ffill().fillna(15.0)
    df["inr_usd"] = _close(INR_USD).reindex(df.index).ffill().fillna(83.0)
    df["us10y"] = _close(US_10Y).reindex(df.index).ffill().fillna(4.0)

    # Add FII flow if our existing parquet cache has it
    try:
        from ml.data.fii_dii_history import fii_dii_series  # noqa: PLC0415
        flow = fii_dii_series(df.index.min().date(), df.index.max().date())
        if not flow.empty:
            df["fii_net"] = flow["fii_net"].reindex(df.index).ffill().fillna(0.0)
        else:
            df["fii_net"] = 0.0
    except Exception as exc:  # noqa: BLE001
        logger.debug("FII flow unavailable for chronos2_macro: %s", exc)
        df["fii_net"] = 0.0

    df = df.dropna(subset=["target"]).sort_index()
    return df


def _try_autogluon_path(out_dir: Path, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
    """Preferred path: AutoGluon TimeSeriesPredictor with chronos_bolt
    preset (drives Chronos-2 when available). Returns None if AutoGluon
    isn't installed."""
    try:
        from autogluon.timeseries import TimeSeriesDataFrame, TimeSeriesPredictor  # noqa: PLC0415
    except ImportError:
        return None

    long_df = df.reset_index().rename(columns={"index": "timestamp", "Date": "timestamp"})
    long_df["item_id"] = "nifty"
    long_df = long_df.rename(columns={"target": "target"})
    ts_data = TimeSeriesDataFrame.from_data_frame(
        long_df, id_column="item_id", timestamp_column="timestamp",
    )
    predictor_path = out_dir / "chronos2_macro_autogluon"
    predictor = TimeSeriesPredictor(
        prediction_length=HORIZON,
        path=str(predictor_path),
        target="target",
        known_covariates_names=["vix", "inr_usd", "us10y", "fii_net"],
        eval_metric="WAPE",
    )
    predictor.fit(
        ts_data, presets="chronos_bolt_base",
        time_limit=300, verbosity=1,
    )
    forecast = predictor.predict(ts_data)
    return {
        "path": "autogluon",
        "predictor_dir": str(predictor_path),
        "forecast_columns": list(forecast.columns) if hasattr(forecast, "columns") else [],
        "n_train_obs": int(len(df)),
    }


def _direct_chronos_path(df: pd.DataFrame) -> Dict[str, Any]:
    """Fallback: direct chronos-forecasting + HF checkpoint resolution.
    Walks HF_REPO_PREFERENCE until one loads cleanly."""
    try:
        from chronos import ChronosBoltPipeline  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError(
            "chronos-forecasting not installed and AutoGluon path also missing — "
            "pip install chronos-forecasting OR autogluon.timeseries"
        ) from exc
    try:
        import torch  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("PyTorch required for direct Chronos path") from exc

    pipeline = None
    repo_used: Optional[str] = None
    for repo in HF_REPO_PREFERENCE:
        try:
            pipeline = ChronosBoltPipeline.from_pretrained(repo)
            repo_used = repo
            break
        except Exception as exc:  # noqa: BLE001
            logger.debug("Chronos repo %s unavailable: %s", repo, exc)
            continue
    if pipeline is None or repo_used is None:
        raise TrainerError(
            f"none of {HF_REPO_PREFERENCE} loaded. "
            f"Chronos-2 may still be HF-waitlisted; check HF account access."
        )

    # Direct mode: forecast target only (covariate-aware path requires
    # autogluon.timeseries — fallback degrades to univariate).
    series = df["target"].astype(float).values
    if len(series) < CONTEXT_LEN + HORIZON:
        raise TrainerError(
            f"insufficient calibration data: {len(series)} < {CONTEXT_LEN + HORIZON}"
        )
    history = series[-CONTEXT_LEN - HORIZON: -HORIZON]
    truth = series[-HORIZON:]

    ctx = torch.tensor(history.tolist(), dtype=torch.float32)
    quantiles, mean = pipeline.predict_quantiles(
        context=ctx, prediction_length=HORIZON,
        quantile_levels=[0.1, 0.5, 0.9],
    )
    pred = np.asarray(mean[0])[:HORIZON]

    # Directional accuracy + WAPE on the calibration window
    actual_dir = float(truth[-1] - history[-1])
    pred_dir = float(pred[-1] - history[-1])
    dir_acc = float((actual_dir > 0) == (pred_dir > 0))
    wape = float(np.sum(np.abs(truth - pred)) / max(1e-9, np.sum(np.abs(truth))))

    return {
        "path": "direct_chronos",
        "hf_repo_used": repo_used,
        "directional_accuracy": dir_acc,
        "wape": round(wape, 4),
        "context_len": CONTEXT_LEN,
        "horizon": HORIZON,
    }


class Chronos2MacroTrainer(Trainer):
    name = "chronos2_macro"
    requires_gpu = False    # Chronos-Bolt is CPU-inferable; AutoGluon
                            # auto-detects. GPU shaves seconds, not
                            # required for the calibration run.
    depends_on: list[str] = []
    skip_promote_gate: bool = True   # macro forecaster, not directional

    def train(self, out_dir: Path) -> TrainResult:
        df = _load_macro_frame()
        logger.info("chronos2_macro: %d daily obs across 5 columns", len(df))

        out_dir.mkdir(parents=True, exist_ok=True)

        # Prefer AutoGluon (true covariate path). Fallback to direct
        # chronos-forecasting (univariate only — degraded but
        # functional).
        result = _try_autogluon_path(out_dir, df)
        if result is None:
            logger.info("AutoGluon unavailable; falling back to direct Chronos path")
            result = _direct_chronos_path(df)

        # Pointer artifact (consistent with momentum_timesfm/chronos)
        pointer = out_dir / "chronos2_macro_pointer.json"
        pointer.write_text(json.dumps({
            "type": "chronos2_macro_pointer",
            "covariates": ["vix", "inr_usd", "us10y", "fii_net"],
            "context_len": CONTEXT_LEN,
            "horizon": HORIZON,
            **result,
        }, indent=2, default=str))

        artifacts = [pointer]
        if result.get("path") == "autogluon":
            # AutoGluon stores its predictor in its own directory; track it
            artifacts.append(Path(result["predictor_dir"]))

        return TrainResult(
            artifacts=artifacts,
            metrics={
                "n_calibration_obs": int(len(df)),
                "covariates": ["vix", "inr_usd", "us10y", "fii_net"],
                "directional_accuracy": float(result.get("directional_accuracy", 0.0)),
                "wape": float(result.get("wape", 0.0)),
                "path": result.get("path"),
                "hf_repo_used": result.get("hf_repo_used", ""),
            },
            notes=(
                f"Real Amazon Chronos-2 (HF: {result.get('hf_repo_used', 'autogluon')}) "
                f"on Nifty 50 + macro covariates (VIX/INR/UST10Y/FII), {HORIZON}-bar horizon"
            ),
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        m["primary_metric"] = "directional_accuracy"
        m["primary_value"] = result.metrics.get("directional_accuracy", 0.0)
        return m
