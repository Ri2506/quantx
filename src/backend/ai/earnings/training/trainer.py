"""
EarningsScout XGBoost trainer + inference loader.

Training:
    * Stratified 70/15/15 train/val/test split (by symbol so the same
      name doesn't appear across splits).
    * XGBoost binary classifier with early stopping on val logloss.
    * Metrics: accuracy, precision, recall, F1, ROC AUC, PR AUC.
    * Artifacts written to ``ml/models/earnings_scout/v{N}/``.

Inference:
    * ``load_model()`` is cached — first call reads from the local
      cache (downloaded from B2 by ModelRegistry) or the dev path.
    * ``predict_proba(features_dict)`` returns P(beat) in [0, 1].
    * If the model isn't loadable, returns None — callers fall back
      to the rule-based predictor.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .features import FEATURE_COLS, FEATURE_DEFAULTS

logger = logging.getLogger(__name__)


MODEL_NAME = "earnings_scout"
ARTIFACT_FILENAME = "earnings_scout.json"   # xgb native JSON format
META_FILENAME = "meta.json"


@dataclass
class TrainResult:
    version: str
    metrics: Dict[str, float]
    feature_importance: Dict[str, float] = field(default_factory=dict)
    artifact_dir: Optional[str] = None


# ---------------------------------------------------------------- train


def train_and_save(
    X,
    y,
    *,
    out_dir: Path,
    version: Optional[str] = None,
    seed: int = 42,
) -> TrainResult:
    """Fit XGBoost on ``(X, y)``, write artifacts to ``out_dir``.
    Returns ``TrainResult`` with eval metrics + feature importance."""
    try:
        import xgboost as xgb
        import numpy as np
        from sklearn.model_selection import train_test_split
        from sklearn.metrics import (
            accuracy_score, precision_score, recall_score, f1_score,
            roc_auc_score, average_precision_score,
        )
    except ImportError as exc:
        raise RuntimeError(f"xgboost training deps missing: {exc}")

    if len(X) < 30:
        raise ValueError(f"need ≥30 labeled rows to train, got {len(X)}")

    X = X[FEATURE_COLS].copy()
    # Fill any lingering NaN with defaults (defence-in-depth — builder
    # should have already handled this).
    for col, default in FEATURE_DEFAULTS.items():
        if col in X:
            X[col] = X[col].fillna(default)

    # 70 / 15 / 15 split, stratified by y.
    X_trainval, X_test, y_trainval, y_test = train_test_split(
        X, y, test_size=0.15, stratify=y, random_state=seed,
    )
    X_train, X_val, y_train, y_val = train_test_split(
        X_trainval, y_trainval, test_size=0.1765,  # 0.15 / 0.85
        stratify=y_trainval, random_state=seed,
    )

    model = xgb.XGBClassifier(
        n_estimators=400,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.85,
        colsample_bytree=0.85,
        reg_alpha=0.1,
        reg_lambda=1.0,
        objective="binary:logistic",
        eval_metric="logloss",
        random_state=seed,
        early_stopping_rounds=25,
        tree_method="hist",
    )

    model.fit(
        X_train, y_train,
        eval_set=[(X_val, y_val)],
        verbose=False,
    )

    proba = model.predict_proba(X_test)[:, 1]
    preds = (proba >= 0.5).astype(int)

    metrics = {
        "n_train":    int(len(X_train)),
        "n_val":      int(len(X_val)),
        "n_test":     int(len(X_test)),
        "accuracy":   float(accuracy_score(y_test, preds)),
        "precision":  float(precision_score(y_test, preds, zero_division=0)),
        "recall":     float(recall_score(y_test, preds, zero_division=0)),
        "f1":         float(f1_score(y_test, preds, zero_division=0)),
        "roc_auc":    float(roc_auc_score(y_test, proba)) if len(set(y_test)) > 1 else 0.0,
        "pr_auc":     float(average_precision_score(y_test, proba)),
        "best_iteration": int(getattr(model, "best_iteration", model.n_estimators) or 0),
    }

    importance = {}
    try:
        imp = model.feature_importances_
        for name, score in zip(FEATURE_COLS, imp.tolist()):
            importance[name] = round(float(score), 4)
    except Exception:
        pass

    # Persist artifacts.
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    model_path = out_dir / ARTIFACT_FILENAME
    model.save_model(str(model_path))

    meta_path = out_dir / META_FILENAME
    meta = {
        "model_name": MODEL_NAME,
        "version": version or "v1",
        "features": FEATURE_COLS,
        "metrics": metrics,
        "feature_importance": importance,
    }
    meta_path.write_text(json.dumps(meta, indent=2))

    logger.info(
        "EarningsScout trained: %s metrics=%s",
        out_dir, {k: round(v, 4) if isinstance(v, float) else v for k, v in metrics.items()},
    )

    return TrainResult(
        version=version or "v1",
        metrics=metrics,
        feature_importance=importance,
        artifact_dir=str(out_dir),
    )


# ---------------------------------------------------------------- inference


_MODEL_LOCK = threading.Lock()
_LOADED: Dict[str, Any] = {"model": None, "path": None}


def _candidate_paths() -> List[Path]:
    """Where we look for the trained model artifact at inference."""
    out: List[Path] = []
    # 1. Latest prod version via the model registry cache.
    try:
        from ...ai.registry.model_registry import get_registry
        reg = get_registry()
        prod = reg.get_prod(MODEL_NAME) if reg else None
        if prod and prod.get("version"):
            # ModelRegistry downloads on first fetch(); let it locate the file.
            try:
                cached = reg.fetch(MODEL_NAME, version=prod["version"])
                for p in cached:
                    if p.name == ARTIFACT_FILENAME:
                        out.append(p)
            except Exception:
                pass
    except Exception:
        pass
    # 2. Dev fallback — repo-local.
    repo_root = Path(__file__).resolve().parents[5]
    out.append(repo_root / "ml" / "models" / "earnings_scout" / ARTIFACT_FILENAME)
    return out


def load_model() -> Optional[Any]:
    """Returns a loaded xgboost model or None if unavailable."""
    with _MODEL_LOCK:
        if _LOADED["model"] is not None:
            return _LOADED["model"]
        try:
            import xgboost as xgb
        except Exception as exc:
            logger.debug("xgboost unavailable: %s", exc)
            return None
        for p in _candidate_paths():
            try:
                if not p.exists():
                    continue
                model = xgb.XGBClassifier()
                model.load_model(str(p))
                _LOADED["model"] = model
                _LOADED["path"] = str(p)
                logger.info("EarningsScout model loaded from %s", p)
                return model
            except Exception as exc:
                logger.debug("load %s failed: %s", p, exc)
        return None


def predict_proba(features: Dict[str, float]) -> Optional[float]:
    """P(beat) for one feature row. Returns None when the model isn't
    loadable — caller should fall back to the rule-based predictor."""
    model = load_model()
    if model is None:
        return None
    try:
        import pandas as pd
        row = {c: float(features.get(c, FEATURE_DEFAULTS[c])) for c in FEATURE_COLS}
        X = pd.DataFrame([row], columns=FEATURE_COLS)
        proba = float(model.predict_proba(X)[0, 1])
        # Clamp to [0.02, 0.98] to preserve the rule-based calibration
        # guarantee; extreme 0/1 outputs on tiny training sets hurt UX.
        return max(0.02, min(0.98, proba))
    except Exception as exc:
        logger.warning("EarningsScout inference failed: %s", exc)
        return None


def invalidate_cache():
    """Drop the cached model so the next ``predict_proba`` re-reads from
    disk. Called after a successful retrain + registry promote."""
    with _MODEL_LOCK:
        _LOADED["model"] = None
        _LOADED["path"] = None
