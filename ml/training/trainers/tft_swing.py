"""
PR 200 — Swing TFT trainer (real pytorch-forecasting TFT for F2).

Step 2 §1.6 (locked) calls Temporal Fusion Transformer the F2 swing
5-bar forecaster. This is a SEPARATE TFT instance from vix_tft (F6) —
inputs are per-stock OHLCV + technicals across the Nifty 500 universe,
not macro covariates.

Implementation locked to **real upstream libraries**:
  - pytorch_forecasting.TemporalFusionTransformer (BSD-3, Jan Beitner)
  - pytorch_forecasting.TimeSeriesDataSet
  - pytorch_forecasting.data.GroupNormalizer
  - pytorch_forecasting.metrics.QuantileLoss
  - pytorch_lightning.Trainer (Lightning AI)

NO custom port. Hyperparameters match the original TFT paper
(Lim et al. 2021) defaults adapted to NSE swing horizon:
  hidden_size=128, attention_head_size=4, dropout=0.2,
  max_encoder_length=60, max_prediction_length=5, learning_rate=3e-4.

The heavy training script lives in scripts/train_tft.py (which Rishi
runs manually on Colab Pro per Step 2 §5 retrain ritual). This module
adapts that script's pipeline into a Trainer subclass so the unified
runner picks it up via discovery.

Eval: per-quantile pinball loss on holdout, directional accuracy on
the median forecast.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List

import numpy as np
import pandas as pd

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


# Universe: top liquid NSE names. Step 2 §1.6 calls for Nifty 500 but
# the unified runner caps at top-100 to fit Colab Pro RAM. Override
# via TFT_SWING_TOP_N env.
DEFAULT_TOP_N = 100
DEFAULT_TRAIN_PERIOD = "5y"
DEFAULT_INTERVAL = "1d"
MAX_ENCODER_LEN = 60      # 60 bars context (3 trading months)
MAX_PREDICTION_LEN = 5    # 5-bar forecast (swing horizon)
HIDDEN_SIZE = 128
ATTENTION_HEADS = 4
DROPOUT = 0.2
LEARNING_RATE = 3e-4
MAX_EPOCHS = 25
BATCH_SIZE = 64
QUANTILES: List[float] = [0.1, 0.25, 0.5, 0.75, 0.9]


def _build_long_format_frame(top_n: int = DEFAULT_TOP_N) -> pd.DataFrame:
    """Build the long-format DataFrame TimeSeriesDataSet expects:
    one row per (symbol, date) with the model's static + time-varying
    features as columns.
    """
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required") from exc

    from ml.data import LiquidUniverseConfig, liquid_universe  # noqa: PLC0415

    universe = liquid_universe(LiquidUniverseConfig(top_n=top_n))
    if not universe:
        raise TrainerError("liquid_universe empty for tft_swing")

    tickers = [f"{s}.NS" for s in universe]
    raw = yf.download(
        tickers, period=DEFAULT_TRAIN_PERIOD, interval=DEFAULT_INTERVAL,
        progress=False, auto_adjust=True, group_by="ticker", threads=True,
    )
    if raw is None or raw.empty:
        raise TrainerError("yfinance returned empty frame for tft_swing")

    rows: list[pd.DataFrame] = []
    for sym in universe:
        ticker = f"{sym}.NS"
        try:
            sub = raw[ticker].dropna(subset=["Close", "High", "Low", "Volume"])
        except (KeyError, AttributeError):
            continue
        if len(sub) < MAX_ENCODER_LEN + MAX_PREDICTION_LEN + 30:
            continue
        sub = sub.copy()
        sub["close"] = sub["Close"].astype(float)
        sub["high"] = sub["High"].astype(float)
        sub["low"] = sub["Low"].astype(float)
        sub["volume"] = sub["Volume"].astype(float)
        sub["ret_1d"] = sub["close"].pct_change(1).fillna(0)
        sub["ret_5d"] = sub["close"].pct_change(5).fillna(0)
        # RSI(14)
        delta = sub["close"].diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean().replace(0, np.nan)
        rs = gain / loss
        sub["rsi_14"] = (100 - 100 / (1 + rs)).fillna(50)
        # ATR % via true range
        prev_close = sub["close"].shift(1)
        tr = pd.concat([
            (sub["high"] - sub["low"]).abs(),
            (sub["high"] - prev_close).abs(),
            (sub["low"] - prev_close).abs(),
        ], axis=1).max(axis=1)
        sub["atr_14_pct"] = (tr.rolling(14).mean() / sub["close"]).fillna(0)
        sub["volume_ratio_10d"] = (
            sub["volume"] / sub["volume"].rolling(10).mean()
        ).fillna(1.0)
        sub["log_close"] = np.log(sub["close"].replace(0, np.nan))

        sub = sub.dropna(subset=["close", "log_close"])
        sub = sub.reset_index().rename(columns={"index": "date", "Date": "date"})
        sub["date"] = pd.to_datetime(sub["date"])
        sub["time_idx"] = (sub["date"] - sub["date"].min()).dt.days
        sub["day_of_week"] = sub["date"].dt.dayofweek.astype(str)
        sub["symbol"] = sym
        rows.append(sub[[
            "symbol", "time_idx", "date", "day_of_week",
            "close", "log_close", "ret_1d", "ret_5d", "rsi_14",
            "atr_14_pct", "volume_ratio_10d",
        ]])

    if not rows:
        raise TrainerError("no usable per-symbol frames for tft_swing")
    return pd.concat(rows, axis=0, ignore_index=True)


class TFTSwingTrainer(Trainer):
    name = "tft_swing"
    requires_gpu = True   # TFT training without GPU is impractically slow
    depends_on: list[str] = []

    def train(self, out_dir: Path) -> TrainResult:
        # --- Verify real upstream libraries ---
        try:
            import torch  # noqa: PLC0415
            from pytorch_forecasting import (  # noqa: PLC0415
                TemporalFusionTransformer, TimeSeriesDataSet,
            )
            from pytorch_forecasting.data import GroupNormalizer  # noqa: PLC0415
            from pytorch_forecasting.metrics import QuantileLoss  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(
                "pytorch-forecasting not installed — pip install pytorch-forecasting"
            ) from exc
        try:
            import lightning.pytorch as pl  # noqa: PLC0415
        except ImportError:
            try:
                import pytorch_lightning as pl  # noqa: PLC0415
            except ImportError as exc:
                raise TrainerError(
                    "lightning not installed — pip install lightning",
                ) from exc

        # --- Build long-format frame ---
        df = _build_long_format_frame()
        logger.info(
            "tft_swing: long-format frame %d rows × %d symbols",
            len(df), df["symbol"].nunique(),
        )

        cutoff = df["time_idx"].max() - MAX_PREDICTION_LEN

        training = TimeSeriesDataSet(
            df[df["time_idx"] <= cutoff].copy(),
            time_idx="time_idx",
            target="close",
            group_ids=["symbol"],
            min_encoder_length=MAX_ENCODER_LEN // 2,
            max_encoder_length=MAX_ENCODER_LEN,
            min_prediction_length=1,
            max_prediction_length=MAX_PREDICTION_LEN,
            static_categoricals=["symbol"],
            time_varying_known_categoricals=["day_of_week"],
            time_varying_known_reals=["time_idx"],
            time_varying_unknown_reals=[
                "close", "log_close", "ret_1d", "ret_5d",
                "rsi_14", "atr_14_pct", "volume_ratio_10d",
            ],
            target_normalizer=GroupNormalizer(groups=["symbol"], transformation="softplus"),
            add_relative_time_idx=True,
            add_target_scales=True,
            add_encoder_length=True,
        )
        validation = TimeSeriesDataSet.from_dataset(
            training, df, predict=True, stop_randomization=True,
        )
        train_loader = training.to_dataloader(train=True, batch_size=BATCH_SIZE, num_workers=0)
        val_loader = validation.to_dataloader(train=False, batch_size=BATCH_SIZE, num_workers=0)

        tft = TemporalFusionTransformer.from_dataset(
            training,
            learning_rate=LEARNING_RATE,
            hidden_size=HIDDEN_SIZE,
            attention_head_size=ATTENTION_HEADS,
            dropout=DROPOUT,
            hidden_continuous_size=HIDDEN_SIZE // 2,
            output_size=len(QUANTILES),
            loss=QuantileLoss(quantiles=QUANTILES),
            log_interval=10,
            reduce_on_plateau_patience=4,
        )
        logger.info(
            "tft_swing: model n_params=%s",
            sum(p.numel() for p in tft.parameters()),
        )

        out_dir.mkdir(parents=True, exist_ok=True)
        trainer = pl.Trainer(
            max_epochs=MAX_EPOCHS,
            accelerator="gpu" if torch.cuda.is_available() else "cpu",
            devices=1,
            gradient_clip_val=0.1,
            enable_progress_bar=False,
            logger=False,
            enable_checkpointing=False,
        )
        trainer.fit(tft, train_dataloaders=train_loader, val_dataloaders=val_loader)

        # --- OOS predictions for eval ---
        preds_obj = tft.predict(val_loader, return_y=True, mode="quantiles")
        try:
            preds = preds_obj.output
            actuals = preds_obj.y[0] if isinstance(preds_obj.y, tuple) else preds_obj.y
        except AttributeError:
            preds, actuals = preds_obj
        preds_arr = preds.cpu().numpy() if hasattr(preds, "cpu") else np.asarray(preds)
        actuals_arr = actuals.cpu().numpy() if hasattr(actuals, "cpu") else np.asarray(actuals)
        median_idx = QUANTILES.index(0.5)
        median_pred = preds_arr[..., median_idx]
        # Pinball loss across quantiles
        pinball_total = 0.0
        for q_idx, q in enumerate(QUANTILES):
            err = actuals_arr - preds_arr[..., q_idx]
            pinball_total += float(np.mean(np.maximum(q * err, (q - 1) * err)))
        pinball_mean = pinball_total / len(QUANTILES)
        # Directional accuracy on median forecast
        if actuals_arr.shape == median_pred.shape and median_pred.size > 0:
            dir_acc = float(np.mean(
                np.sign(median_pred[..., -1] - actuals_arr[..., 0]) ==
                np.sign(actuals_arr[..., -1] - actuals_arr[..., 0])
            ))
        else:
            dir_acc = 0.0

        metrics = {
            "pinball_loss_mean": round(pinball_mean, 6),
            "directional_accuracy": round(dir_acc, 4),
            "n_train_samples": int(len(training.index)),
            "hidden_size": HIDDEN_SIZE,
            "max_encoder_length": MAX_ENCODER_LEN,
            "max_prediction_length": MAX_PREDICTION_LEN,
            "n_universe": int(df["symbol"].nunique()),
        }

        # --- Save artifact ---
        artifact = out_dir / "tft_swing.ckpt"
        trainer.save_checkpoint(str(artifact))
        # pytorch-forecasting's canonical pattern: torch.save the
        # dataset params so inference can rebuild TimeSeriesDataSet via
        # TimeSeriesDataSet.from_parameters(). torch.save uses pickle
        # under the hood, same as Lightning's checkpoint format — this
        # is the upstream-recommended pattern.
        params_path = out_dir / "tft_swing_dataset_params.pt"
        torch.save(training.get_parameters(), str(params_path))

        logger.info(
            "tft_swing trained: pinball=%.4f dir_acc=%.3f n=%d",
            pinball_mean, dir_acc, len(training.index),
        )
        return TrainResult(
            artifacts=[artifact, params_path],
            metrics=metrics,
            notes=(
                f"Real pytorch-forecasting TFT (hidden={HIDDEN_SIZE}, "
                f"heads={ATTENTION_HEADS}) on top-{DEFAULT_TOP_N} NSE liquid stocks, "
                f"{MAX_ENCODER_LEN}-bar context -> {MAX_PREDICTION_LEN}-bar forecast"
            ),
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        # Higher directional_accuracy = better. Pinball loss is the
        # secondary fit metric (lower is better) — runner reads
        # primary_value as "higher is better" so we expose dir_acc.
        m["primary_metric"] = "directional_accuracy"
        m["primary_value"] = result.metrics.get("directional_accuracy")
        return m
