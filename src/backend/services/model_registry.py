"""
Model registry for PRD pipeline.
Loads XGBoost and TFT models and provides inference helpers.
"""

from __future__ import annotations

import json
import logging
from typing import Dict, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


class XGBoostGate:
    def __init__(self, model_path: str):
        import xgboost as xgb

        self.model = xgb.XGBClassifier()
        self.model.load_model(model_path)

    def predict(self, features: Dict) -> Tuple[str, float, Dict[str, float]]:
        """
        Returns (direction, confidence, probs)
        direction: BUY / SELL / HOLD
        confidence: 0-100
        """
        feature_order = list(features.keys())
        X = np.array([[features[k] for k in feature_order]])
        proba = self.model.predict_proba(X)[0]
        # assume classes ordered as in training: [HOLD, BUY, SELL]
        classes = list(getattr(self.model, "classes_", [0, 1, 2]))
        probs = {c: float(p) for c, p in zip(classes, proba)}
        # Map class to label
        label_map = {0: "HOLD", 1: "BUY", 2: "SELL"}
        best_class = max(probs, key=probs.get)
        direction = label_map.get(best_class, "HOLD")
        confidence = probs[best_class] * 100
        return direction, confidence, {
            "hold": probs.get(0, 0) * 100,
            "buy": probs.get(1, 0) * 100,
            "sell": probs.get(2, 0) * 100,
        }


class TFTPredictor:
    def __init__(self, model_path: str, config_path: str):
        from pytorch_forecasting import TemporalFusionTransformer, TimeSeriesDataSet
        import torch

        self.model = TemporalFusionTransformer.load_from_checkpoint(model_path)
        self.dataset_params = {}
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                self.dataset_params = json.load(f)
        except Exception:
            # fallback to .pt pickle
            try:
                pt_path = config_path.replace(".json", ".pt")
                self.dataset_params = torch.load(pt_path)
            except Exception as e:
                logger.error(f"Failed to load TFT config: {e}")
                self.dataset_params = {}
        self.dataset_params.setdefault("quantiles", [0.1, 0.5, 0.9])
        self.TimeSeriesDataSet = TimeSeriesDataSet

    def predict_quantiles(self, data) -> Dict[str, list]:
        """
        Predict quantiles for next horizon using TFT.
        Expects `data` as a DataFrame with required columns.
        """
        dataset = self.TimeSeriesDataSet.from_parameters(self.dataset_params, data, predict=True, stop_randomization=True)
        loader = dataset.to_dataloader(train=False, batch_size=1, num_workers=0)
        preds = self.model.predict(loader, mode="quantiles")
        # preds shape: [batch, time, quantiles]
        quantiles = self.dataset_params.get("quantiles", [0.1, 0.5, 0.9])
        q_map = {str(q): preds[0, :, i].detach().cpu().numpy().tolist() for i, q in enumerate(quantiles)}
        return q_map
