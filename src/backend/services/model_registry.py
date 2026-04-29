"""
Model registry for PRD pipeline.
Loads LightGBM and TFT models and provides inference helpers.
"""

from __future__ import annotations

import json
import logging
from typing import Dict, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# The 15 features expected by LGBMGate, matching split_feature_sets() xgb_keys
LGBM_FEATURE_ORDER = [
    "close", "rsi_14", "macd", "macd_signal",
    "bb_upper", "bb_lower", "bb_percent",
    "ema_20", "ema_50", "atr_14",
    "volume_ratio", "obv", "vwap_diff",
    "body_pct", "wick_pct",
]


class LGBMGate:
    """
    LightGBM 3-class signal classifier (HOLD=0, BUY=1, SELL=2).
    Uses native Booster for fast inference from .txt model file.
    """

    def __init__(self, model_path: str):
        import lightgbm as lgb

        self.model = lgb.Booster(model_file=model_path)
        self._num_classes = self.model.num_model_per_iteration()
        logger.info(f"LGBMGate loaded from {model_path} ({self._num_classes} classes)")

    def predict(self, features: Dict) -> Tuple[str, float, Dict[str, float]]:
        """
        Returns (direction, confidence, probs_dict).
        direction: "BUY" / "SELL" / "HOLD"
        confidence: 0-100
        probs_dict: {"hold": ..., "buy": ..., "sell": ...} each 0-100
        """
        X = np.array([[features.get(k, 0.0) for k in LGBM_FEATURE_ORDER]])
        # Replace inf/nan
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

        raw = self.model.predict(X)[0]  # shape (num_classes,) for multiclass

        # Booster.predict returns raw scores for multiclass — apply softmax
        if self._num_classes > 1 and len(raw) == self._num_classes:
            proba = _softmax(raw)
        else:
            # Single-row predict may already be probabilities
            proba = np.array(raw) if hasattr(raw, '__len__') else np.array([raw])
            if proba.sum() > 1.5:  # raw scores, need softmax
                proba = _softmax(proba)

        # Map: 0=HOLD, 1=BUY, 2=SELL
        label_map = {0: "HOLD", 1: "BUY", 2: "SELL"}
        best_class = int(np.argmax(proba))
        direction = label_map.get(best_class, "HOLD")
        confidence = float(proba[best_class]) * 100

        probs_dict = {
            "hold": float(proba[0]) * 100 if len(proba) > 0 else 0.0,
            "buy": float(proba[1]) * 100 if len(proba) > 1 else 0.0,
            "sell": float(proba[2]) * 100 if len(proba) > 2 else 0.0,
        }
        return direction, confidence, probs_dict


def _softmax(x: np.ndarray) -> np.ndarray:
    """Numerically stable softmax."""
    e = np.exp(x - np.max(x))
    return e / e.sum()


class TFTPredictor:
    """
    Temporal Fusion Transformer for 5-bar price forecasting with quantile outputs.

    Loads lazily to avoid importing pytorch/pytorch_forecasting at module level.
    Provides per-stock prediction via ``predict_for_stock(df, symbol)``.
    """

    def __init__(self, model_path: str, config_path: str):
        import torch
        from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
        from pytorch_forecasting.data import GroupNormalizer

        self._torch = torch
        self.TimeSeriesDataSet = TimeSeriesDataSet
        self._GroupNormalizer = GroupNormalizer

        # Load config (JSON for metadata, .pt for full dataset params)
        self.config: Dict = {}
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                self.config = json.load(f)
        except Exception:
            pass

        # Load full dataset parameters (.pt) needed by from_parameters()
        self._dataset_params = None
        pt_path = config_path.replace(".json", ".pt")
        try:
            self._dataset_params = torch.load(pt_path, map_location="cpu", weights_only=False)
        except Exception as e:
            logger.warning(f"TFT .pt config not found ({e}), will use manual dataset creation")

        # Load the trained model checkpoint
        self.model = TemporalFusionTransformer.load_from_checkpoint(model_path, map_location="cpu")
        self.model.eval()

        self._features = self.config.get("features", [
            "close", "open", "high", "low", "volume",
            "rsi_14", "macd", "ema_20", "ema_50",
            "atr_14", "volume_ratio", "bb_percent",
        ])
        self._encoder_length = self.config.get("max_encoder_length", 120)
        self._prediction_length = self.config.get("max_prediction_length", 5)
        self._quantiles = self.config.get("quantiles", [0.1, 0.5, 0.9])

        logger.info(
            "TFTPredictor loaded: encoder=%d, horizon=%d, features=%d",
            self._encoder_length, self._prediction_length, len(self._features),
        )

    def predict_for_stock(self, df, symbol: str) -> Optional[Dict]:
        """
        Run TFT inference for a single stock.

        Args:
            df: DataFrame with OHLCV + indicator columns (at least ``self._encoder_length + _prediction_length`` rows).
            symbol: Stock ticker (e.g. "RELIANCE").

        Returns:
            Dict with keys: "p10", "p50", "p90" (each a list of floats for next N bars),
            "direction" ("bullish"/"bearish"/"neutral"), and "score" (0-1).
            Returns None if prediction fails.
        """
        try:
            from src.backend.services.feature_engineering import compute_features

            # Compute features if needed
            featured = compute_features(df) if "rsi_14" not in df.columns else df.copy()

            # Check we have all required columns
            missing = [c for c in self._features if c not in featured.columns]
            if missing:
                logger.debug("TFT skip %s: missing %s", symbol, missing)
                return None

            subset = featured[self._features].copy()
            subset = subset.replace([np.inf, -np.inf], np.nan).fillna(0.0)

            min_rows = self._encoder_length + self._prediction_length
            if len(subset) < min_rows:
                return None

            # Take the last chunk needed for one prediction
            subset = subset.tail(min_rows).reset_index(drop=True)
            subset["time_idx"] = np.arange(len(subset))
            subset["symbol"] = symbol

            for col in self._features:
                subset[col] = subset[col].astype(float)
            subset["time_idx"] = subset["time_idx"].astype(int)
            subset["symbol"] = subset["symbol"].astype(str)

            # Build a prediction dataset
            if self._dataset_params is not None:
                dataset = self.TimeSeriesDataSet.from_parameters(
                    self._dataset_params, subset,
                    predict=True, stop_randomization=True,
                )
            else:
                dataset = TimeSeriesDataSet(
                    subset,
                    time_idx="time_idx",
                    target="close",
                    group_ids=["symbol"],
                    max_encoder_length=self._encoder_length,
                    max_prediction_length=self._prediction_length,
                    time_varying_unknown_reals=self._features,
                    time_varying_known_reals=[],
                    static_categoricals=["symbol"],
                    target_normalizer=self._GroupNormalizer(
                        groups=["symbol"], transformation="softplus",
                    ),
                    add_relative_time_idx=True,
                    add_target_scales=True,
                    add_encoder_length=True,
                    predict_mode=True,
                )

            loader = dataset.to_dataloader(train=False, batch_size=1, num_workers=0)

            # Get quantile predictions — shape [batch, horizon, n_quantiles]
            preds_tensor = self.model.predict(loader, mode="quantiles", return_x=False)
            preds = preds_tensor[0].detach().cpu().numpy()  # [horizon, n_quantiles]

            q_map = {}
            for i, q in enumerate(self._quantiles):
                q_map[f"p{int(q * 100)}"] = [round(float(v), 2) for v in preds[:, i]]

            # Derive direction and score from median forecast
            current_close = float(subset["close"].iloc[-self._prediction_length - 1])
            median_forecast = preds[:, 1]  # p50 column
            final_predicted = float(median_forecast[-1])

            pct_change = (final_predicted - current_close) / current_close if current_close > 0 else 0
            if pct_change > 0.005:
                direction = "bullish"
            elif pct_change < -0.005:
                direction = "bearish"
            else:
                direction = "neutral"

            # Score: 0-1 where 1 = strong bullish
            score = max(0.0, min(1.0, 0.5 + pct_change * 10))

            return {
                **q_map,
                "direction": direction,
                "score": round(score, 4),
                "horizon": self._prediction_length,
                "current_close": round(current_close, 2),
                "predicted_close": round(final_predicted, 2),
            }

        except Exception as e:
            logger.debug("TFT prediction failed for %s: %s", symbol, e)
            return None
