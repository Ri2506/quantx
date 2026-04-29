"""
PR 139 — VIX TFT trainer (F6 VolCast).

Trains a Temporal Fusion Transformer to forecast India VIX 5–10 days
ahead. Output drives F&O strategy selection: a falling VIX path biases
the strategy generator toward Iron Condors and short straddles; a
rising VIX path biases it toward long straddles / strangles.

Per Step 1 §F6, this is its own TFT instance separate from the equity
swing TFT — the inputs are macro (VIX, Nifty, USDINR, India 10Y yield)
rather than per-stock OHLCV.

Per the unified-training-plan memory directive, this PR adds the
trainer module — actual training executes in Phase H on GPU.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


# Macro signal pack used as covariates. yfinance tickers.
VIX_TICKER = "^INDIAVIX"
NIFTY_TICKER = "^NSEI"
USDINR_TICKER = "USDINR=X"
IND10Y_TICKER = "^IRX"  # proxy until a true India 10Y CSV ingester lands

CONTEXT_LEN = 60       # input history bars (daily)
HORIZON = 10           # forecast horizon
MAX_EPOCHS = 30
BATCH_SIZE = 64
LR = 3e-4


def _macro_frame(start: str = "2014-01-01") -> pd.DataFrame:
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required") from exc

    def _close(ticker: str) -> pd.Series:
        df = yf.download(ticker, start=start, progress=False, auto_adjust=False)
        if df is None or df.empty:
            raise TrainerError(f"yfinance empty: {ticker}")
        col = df["Close"]
        if isinstance(col, pd.DataFrame):
            col = col.iloc[:, 0]
        return col.astype(float)

    df = pd.DataFrame({
        "vix": _close(VIX_TICKER),
        "nifty": _close(NIFTY_TICKER),
        "usdinr": _close(USDINR_TICKER),
        "yield_10y": _close(IND10Y_TICKER),
    })
    return df.dropna()


class VIXTFTTrainer(Trainer):
    name = "vix_tft"
    requires_gpu = True   # TFT is heavy enough to need a GPU realistically
    depends_on: list[str] = []

    def train(self, out_dir: Path) -> TrainResult:
        # Use pytorch-forecasting (already in requirements.txt for the
        # equity swing TFT). The VIX univariate target with macro
        # covariates is a small TFT compared to the equity one.
        try:
            import torch  # noqa: PLC0415
            import lightning.pytorch as pl  # noqa: PLC0415
            from pytorch_forecasting import (  # noqa: PLC0415
                TemporalFusionTransformer,
                TimeSeriesDataSet,
            )
            from pytorch_forecasting.data import GroupNormalizer  # noqa: PLC0415
            from pytorch_forecasting.metrics import QuantileLoss  # noqa: PLC0415
        except ImportError as exc:
            raise TrainerError(f"missing TFT dep: {exc}")

        df = _macro_frame()
        df = df.reset_index().rename(columns={"index": "date", "Date": "date"})
        df["time_idx"] = (df["date"] - df["date"].min()).dt.days
        df["group"] = "india_vix"  # single time-series group
        df = df.sort_values("time_idx").reset_index(drop=True)

        train_cut = int(len(df) * 0.85)
        train_df = df.iloc[:train_cut].copy()
        val_df = df.iloc[train_cut:].copy()

        training = TimeSeriesDataSet(
            train_df,
            time_idx="time_idx",
            target="vix",
            group_ids=["group"],
            min_encoder_length=CONTEXT_LEN // 2,
            max_encoder_length=CONTEXT_LEN,
            min_prediction_length=1,
            max_prediction_length=HORIZON,
            time_varying_known_reals=["time_idx"],
            time_varying_unknown_reals=["vix", "nifty", "usdinr", "yield_10y"],
            target_normalizer=GroupNormalizer(groups=["group"], transformation="softplus"),
            allow_missing_timesteps=True,
        )
        validation = TimeSeriesDataSet.from_dataset(training, val_df, predict=False, stop_randomization=True)

        train_loader = training.to_dataloader(train=True, batch_size=BATCH_SIZE, num_workers=0)
        val_loader = validation.to_dataloader(train=False, batch_size=BATCH_SIZE, num_workers=0)

        tft = TemporalFusionTransformer.from_dataset(
            training,
            learning_rate=LR,
            hidden_size=64,
            attention_head_size=4,
            dropout=0.1,
            hidden_continuous_size=32,
            output_size=7,        # 7 quantiles (default)
            loss=QuantileLoss(),
            log_interval=0,
            reduce_on_plateau_patience=3,
        )

        trainer = pl.Trainer(
            max_epochs=MAX_EPOCHS,
            accelerator="auto",
            devices=1,
            enable_progress_bar=False,
            gradient_clip_val=0.1,
            log_every_n_steps=50,
            enable_checkpointing=False,
        )
        trainer.fit(tft, train_dataloaders=train_loader, val_dataloaders=val_loader)

        # OOS quantile-loss + median directional accuracy.
        predictions = tft.predict(val_loader, return_y=True, mode="quantiles")
        # predictions.output: (n_samples, HORIZON, 7); .y: (n_samples, HORIZON)
        try:
            preds = np.asarray(predictions.output.cpu())
            ys = np.asarray(predictions.y[0].cpu() if isinstance(predictions.y, tuple) else predictions.y.cpu())
        except Exception:
            preds = np.asarray(getattr(predictions, "output", []))
            ys = np.asarray(getattr(predictions, "y", []))
        if preds.size and ys.size:
            median_idx = preds.shape[-1] // 2
            median_pred = preds[..., median_idx]
            terminal_pred = median_pred[:, -1]
            terminal_truth = ys[:, -1]
            initial = ys[:, 0]
            dir_acc = float(((terminal_pred - initial) > 0) == ((terminal_truth - initial) > 0)).mean() if hasattr(((terminal_pred - initial) > 0) == ((terminal_truth - initial) > 0), "mean") else 0.0
            mae = float(np.abs(median_pred - ys).mean())
        else:
            dir_acc, mae = 0.0, 0.0

        # Save checkpoint + tiny config pointer.
        ckpt = out_dir / "vix_tft.ckpt"
        trainer.save_checkpoint(str(ckpt))
        cfg = out_dir / "vix_tft_config.json"
        cfg.write_text(
            f'{{"context_len": {CONTEXT_LEN}, "horizon": {HORIZON}, "target": "vix", '
            f'"covariates": ["nifty", "usdinr", "yield_10y"]}}'
        )

        return TrainResult(
            artifacts=[ckpt, cfg],
            metrics={
                "n_train": int(len(train_df)),
                "n_val": int(len(val_df)),
                "horizon_days": HORIZON,
                "context_len": CONTEXT_LEN,
                "median_mae": mae,
                "directional_accuracy": dir_acc,
            },
            notes=f"TFT VIX forecaster on macro covariates {NIFTY_TICKER}/{USDINR_TICKER}",
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        m["primary_metric"] = "directional_accuracy"
        m["primary_value"] = result.metrics.get("directional_accuracy")
        return m
