"""
PR 145 / PR 172 — Earnings surprise XGBoost trainer (F9 EarningsScout).

Wraps ``src.backend.ai.earnings.training.trainer.train_and_save`` so the
existing earnings-surprise XGBoost classifier (beat / miss / inline)
gets registered into ``model_versions`` via the unified runner. The
heavy data-prep + fit logic lives in the original module — this
trainer is a thin adapter.

PR 172 — earnings_xgb is a *classifier*, not a directional trader.
The financial promote gate (Sharpe / drawdown / profit factor) doesn't
apply: the model emits P(beat) and downstream EarningsScout strategy
logic decides whether to recommend a pre-earnings position. Surface
``roc_auc`` as the primary metric and skip the financial gate via
``skip_promote_gate=True``.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List

from ..base import Trainer, TrainerError, TrainResult

logger = logging.getLogger(__name__)


class EarningsXGBTrainer(Trainer):
    name = "earnings_xgb"
    requires_gpu = False  # XGBoost on tabular features fits in seconds-minutes
    depends_on: list[str] = []
    # PR 172 — binary classifier feeds strategy logic; opt out of the
    # Sharpe-based gate. The runner records the `roc_auc` metric in
    # `model_versions.metrics` so we can manually verify quality before
    # flipping is_prod=TRUE for downstream consumers.
    skip_promote_gate: bool = True

    def train(self, out_dir: Path) -> TrainResult:
        try:
            from src.backend.ai.earnings.training.features import build_feature_frame  # noqa: PLC0415
            from src.backend.ai.earnings.training.trainer import train_and_save  # noqa: PLC0415
        except Exception as exc:
            raise TrainerError(f"earnings training module unimportable: {exc}")

        # Build the labeled (X, y) frame from historical NSE earnings
        # announcements + 10-year price history. The builder pulls from
        # Supabase (announcements + holdings_history snapshots) when
        # available and falls back to a yfinance/MoneyControl scrape.
        try:
            X, y = build_feature_frame()
        except Exception as exc:
            raise TrainerError(f"earnings feature build failed: {exc}")
        if len(X) < 30:
            raise TrainerError(f"insufficient earnings rows: {len(X)}")

        result = train_and_save(X, y, out_dir=out_dir)

        # ``train_and_save`` already returns a TrainResult-shaped object
        # but it's local to the legacy trainer; convert to ours so the
        # unified runner can register it generically.
        artifacts: List[Path]
        if hasattr(result, "artifacts"):
            artifacts = list(result.artifacts)
        else:
            artifacts = list(out_dir.glob("*"))

        metrics: Dict[str, Any] = dict(getattr(result, "metrics", {}) or {})
        metrics.setdefault("n_samples", int(len(X)))
        # Surface label distribution so the runner report shows class
        # balance — earnings beat/miss is usually ~55/45 but small
        # datasets can skew badly.
        try:
            import numpy as np  # noqa: PLC0415
            arr = np.asarray(list(y), dtype=int)
            metrics["label_pos_rate"] = round(float(arr.mean()), 4) if arr.size else 0.0
        except Exception:
            pass

        return TrainResult(
            artifacts=artifacts,
            metrics=metrics,
            notes=getattr(result, "notes", "XGBoost earnings-surprise classifier"),
        )

    def evaluate(self, result: TrainResult) -> Dict[str, Any]:
        m = dict(result.metrics)
        # PR 172 — primary metric is ROC AUC for the binary beat/miss
        # classifier. PR AUC is also recorded as a secondary signal
        # because earnings classes can be imbalanced in narrow universes
        # (only large caps with consistent surprise patterns).
        if "roc_auc" in m:
            m["primary_metric"] = "roc_auc"
            m["primary_value"] = m.get("roc_auc")
        elif "pr_auc" in m:
            m["primary_metric"] = "pr_auc"
            m["primary_value"] = m.get("pr_auc")
        elif "accuracy" in m:
            m["primary_metric"] = "accuracy"
            m["primary_value"] = m.get("accuracy")
        return m
