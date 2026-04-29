"""
PR 128 — RegimeHMM trainer module.

Wraps ``ml.regime_detector.MarketRegimeDetector`` so the unified runner
re-trains the F8 RegimeIQ model on demand. The serialized model + scaler
artifact is the single file registered into ``model_versions``. We use
the existing ``MarketRegimeDetector.save()`` path so consumers continue
loading via ``MarketRegimeDetector.load()`` unchanged.

Features pulled from yfinance (Nifty 50 + India VIX):
    ret_5d, ret_20d, realized_vol_10d, vix_level, vix_5d_change

Eval: log-likelihood per observation on the last 252 trading days held out.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict

import numpy as np
import pandas as pd

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


# yfinance tickers used by the feature builder. Kept here (not in the
# detector) because future trainers may pull richer macro covariates.
NIFTY_TICKER = "^NSEI"
VIX_TICKER = "^INDIAVIX"


def _build_features(start: str = "2010-01-01") -> pd.DataFrame:
    try:
        import yfinance as yf  # noqa: PLC0415
    except ImportError as exc:
        raise TrainerError("yfinance required for HMM training") from exc

    nifty = yf.download(NIFTY_TICKER, start=start, progress=False, auto_adjust=False)
    vix = yf.download(VIX_TICKER, start=start, progress=False, auto_adjust=False)
    if nifty is None or nifty.empty or vix is None or vix.empty:
        raise TrainerError("yfinance returned empty Nifty or VIX series")

    # Multi-index frames from yfinance — flatten.
    if isinstance(nifty.columns, pd.MultiIndex):
        nifty.columns = [c[0] for c in nifty.columns]
    if isinstance(vix.columns, pd.MultiIndex):
        vix.columns = [c[0] for c in vix.columns]

    close = nifty["Close"].astype(float)
    vix_close = vix["Close"].astype(float)

    df = pd.DataFrame(index=close.index)
    df["ret_5d"] = close.pct_change(5)
    df["ret_20d"] = close.pct_change(20)
    df["realized_vol_10d"] = close.pct_change().rolling(10).std() * np.sqrt(252)
    df["vix_level"] = vix_close.reindex(df.index).ffill()
    df["vix_5d_change"] = df["vix_level"].pct_change(5)
    df = df.dropna()
    return df


class RegimeHMMTrainer(Trainer):
    name = "regime_hmm"
    requires_gpu = False  # tiny model; fits on CPU in seconds
    depends_on: list[str] = []

    def train(self, out_dir: Path) -> TrainResult:
        from ml.regime_detector import MarketRegimeDetector  # noqa: PLC0415

        df = _build_features()
        if len(df) < 500:
            raise TrainerError(f"insufficient HMM training data: {len(df)} rows")

        # Hold out the most recent 252 trading days for OOS eval.
        train_df = df.iloc[:-252].copy()
        eval_df = df.iloc[-252:].copy()

        det = MarketRegimeDetector()
        det.train(train_df, n_components=3, n_iter=200)

        # Reuse the detector's existing serialization path so consumers
        # (MarketRegimeDetector.load) continue to work unchanged.
        artifact = out_dir / "regime_hmm.pkl"
        det.save(str(artifact))

        # In-sample summary: count per regime over the training window.
        in_sample_states = det.model.predict(det.scaler.transform(train_df.values))
        counts = {det.REGIMES[i]: int((in_sample_states == i).sum()) for i in det.REGIMES}

        # OOS log-likelihood per observation — used by evaluate().
        # Lower (more negative) per-obs log-likelihood = worse fit.
        eval_X = det.scaler.transform(eval_df.values)
        oos_score = float(det.model.score(eval_X))
        oos_score_per_obs = oos_score / max(1, len(eval_df))

        return TrainResult(
            artifacts=[artifact],
            metrics={
                "n_train_obs": int(len(train_df)),
                "n_eval_obs": int(len(eval_df)),
                "regime_counts_in_sample": counts,
                "oos_log_likelihood": oos_score,
                "oos_log_likelihood_per_obs": oos_score_per_obs,
            },
            notes=f"trained on {df.index.min().date()}→{train_df.index.max().date()}, "
                  f"OOS {eval_df.index.min().date()}→{eval_df.index.max().date()}",
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        # The interesting metric (oos_log_likelihood_per_obs) was already
        # computed in train() against the held-out tail. Surface it as the
        # promotion gate signal so the runner's --promote check has a
        # named field to look at.
        m = dict(result.metrics)
        m["primary_metric"] = "oos_log_likelihood_per_obs"
        m["primary_value"] = result.metrics.get("oos_log_likelihood_per_obs")
        return m
