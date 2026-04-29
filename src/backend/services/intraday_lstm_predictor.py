"""
PR 136 — Intraday LSTM predictor (F1 TickPulse).

Loads the ONNX artifact registered by PR 135 via ModelRegistry and
runs CPU inference on rolling 60-minute windows of 5-min bars during
market hours. Called every 5 minutes by the scheduler job in
``scheduler.py`` (`run_intraday_inference`).

Public surface:
    p = IntradayLSTMPredictor.load_prod()
    score = p.score(df_60min)   # → {"bull": 0.62, "neutral": 0.20, "bear": 0.18}
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)


# Must match PR 135 trainer constants. Duplicated here to avoid an
# inference-time import of the training module.
WINDOW = 12
INPUT_FEATURES = 8
CLASS_LABELS = ("bear", "neutral", "bull")


@dataclass
class IntradayLSTMPredictor:
    session: object
    input_name: str = "x"

    @classmethod
    def load_prod(cls) -> "IntradayLSTMPredictor":
        try:
            import onnxruntime as ort  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError("onnxruntime not installed") from exc
        from src.backend.ai.registry import get_registry  # noqa: PLC0415
        reg = get_registry()
        local_dir: Path = reg.resolve("intraday_lstm")
        onnx_path = local_dir / "intraday_lstm.onnx"
        if not onnx_path.exists():
            raise FileNotFoundError(f"intraday_lstm artifact missing at {onnx_path}")
        session = ort.InferenceSession(
            str(onnx_path),
            providers=["CPUExecutionProvider"],
        )
        return cls(session=session, input_name=session.get_inputs()[0].name)

    def score(self, window_features: np.ndarray) -> Dict[str, float]:
        """Run inference on one (WINDOW, INPUT_FEATURES) z-scored window."""
        if window_features.shape != (WINDOW, INPUT_FEATURES):
            raise ValueError(
                f"intraday window must be ({WINDOW}, {INPUT_FEATURES}); "
                f"got {window_features.shape}",
            )
        x = window_features.astype(np.float32).reshape(1, WINDOW, INPUT_FEATURES)
        logits = self.session.run(None, {self.input_name: x})[0][0]
        # softmax
        logits = logits - logits.max()
        exp = np.exp(logits)
        probs = exp / exp.sum()
        return {label: float(probs[i]) for i, label in enumerate(CLASS_LABELS)}

    def best_class(self, window_features: np.ndarray) -> str:
        scores = self.score(window_features)
        return max(scores, key=scores.get)


# ============================================================================
# Helpers used by the 5-min scheduler job
# ============================================================================


def build_window_from_5min(df) -> Optional[np.ndarray]:
    """Build the (WINDOW, INPUT_FEATURES) z-scored window from a recent
    5-min OHLCV DataFrame. Returns None when there isn't enough history.
    """
    import pandas as pd  # noqa: PLC0415
    if df is None or len(df) < WINDOW + 14:
        return None
    df = df.dropna(subset=["Open", "High", "Low", "Close", "Volume"]).copy()
    if len(df) < WINDOW + 14:
        return None

    close = df["Close"].astype(float)
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean().replace(0, np.nan)
    rsi = (100 - 100 / (1 + gain / loss)).fillna(50)

    typical = (df["High"] + df["Low"] + df["Close"]) / 3
    vwap = (typical * df["Volume"]).cumsum() / df["Volume"].cumsum().replace(0, np.nan)
    vwap = vwap.fillna(method="ffill").fillna(close)
    obv = (np.sign(close.diff().fillna(0)) * df["Volume"]).cumsum()

    feat = np.stack([
        df["Open"].values,
        df["High"].values,
        df["Low"].values,
        df["Close"].values,
        df["Volume"].values,
        rsi.values,
        vwap.values,
        obv.values,
    ], axis=1).astype(np.float32)

    mean = feat.mean(axis=0, keepdims=True)
    std = feat.std(axis=0, keepdims=True) + 1e-6
    z = (feat - mean) / std
    return z[-WINDOW:]


__all__ = ["IntradayLSTMPredictor", "build_window_from_5min", "CLASS_LABELS", "WINDOW"]
