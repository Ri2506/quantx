#!/usr/bin/env python3
"""
Train the F9 EarningsScout XGBoost classifier.

Usage:
    python scripts/train_earnings_scout.py                       # from DB
    python scripts/train_earnings_scout.py --min-rows 30         # relax gate
    python scripts/train_earnings_scout.py --upload              # upload to B2
    python scripts/train_earnings_scout.py --promote             # mark prod

Reads labeled rows from ``earnings_predictions`` (where ``actual_result``
is populated), builds features via yfinance + Supabase, fits XGBoost,
and writes artifacts into ``ml/models/earnings_scout/v{N}/``.

When ``--upload`` is passed, registers the artifact with the B2 model
registry (``is_shadow=True`` by default). Add ``--promote`` to flip the
new version to ``is_prod=True`` (retires the previous prod).
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path


def _setup_path():
    """Let the script run from repo root without PYTHONPATH munging."""
    root = Path(__file__).resolve().parents[1]
    src = root / "src"
    if str(src) not in sys.path:
        sys.path.insert(0, str(src))


def main() -> int:
    _setup_path()

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--min-rows", type=int, default=50,
                    help="Minimum labeled rows required to train (default 50)")
    ap.add_argument("--out-dir", type=str, default=None,
                    help="Output dir (defaults to ml/models/earnings_scout/v{next})")
    ap.add_argument("--upload", action="store_true",
                    help="Upload artifacts to B2 + register in model_versions")
    ap.add_argument("--promote", action="store_true",
                    help="Promote this new version to prod (with --upload)")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    log = logging.getLogger("train_earnings_scout")

    from backend.ai.earnings.training.features import build_feature_frame
    from backend.ai.earnings.training.trainer import (
        MODEL_NAME, ARTIFACT_FILENAME, META_FILENAME,
        train_and_save,
    )

    # --- Build training frame ---
    log.info("Assembling training frame…")
    try:
        X, y, symbols = build_feature_frame(min_rows=args.min_rows)
    except ValueError as exc:
        log.error("Cannot train yet: %s", exc)
        return 2

    log.info("Training frame: %d rows, %d positives (%.1f%%), %d symbols",
             len(X), int(y.sum()), 100 * y.mean(), len(set(symbols)))

    # --- Decide output dir ---
    repo_root = Path(__file__).resolve().parents[1]
    if args.out_dir:
        out_dir = Path(args.out_dir)
        version_label = out_dir.name
    else:
        base = repo_root / "ml" / "models" / "earnings_scout"
        next_v = 1
        if base.exists():
            existing = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("v")]
            if existing:
                nums = []
                for p in existing:
                    try:
                        nums.append(int(p.name.lstrip("v")))
                    except ValueError:
                        pass
                next_v = (max(nums) if nums else 0) + 1
        out_dir = base / f"v{next_v}"
        version_label = f"v{next_v}"

    # --- Train ---
    result = train_and_save(X, y, out_dir=out_dir, version=version_label)
    log.info("Metrics: %s", result.metrics)
    log.info("Top features: %s",
             sorted(result.feature_importance.items(), key=lambda kv: -kv[1])[:5])

    # --- Optionally upload + promote ---
    if args.upload:
        try:
            from backend.ai.registry.model_registry import get_registry
        except Exception as exc:
            log.error("Registry unavailable, skipping upload: %s", exc)
            return 0
        reg = get_registry()
        if reg is None:
            log.error("Registry not configured; skipping upload")
            return 0
        files = [out_dir / ARTIFACT_FILENAME, out_dir / META_FILENAME]
        row = reg.register(
            MODEL_NAME, files,
            metrics=result.metrics,
            trained_by=os.getenv("USER", "unknown"),
            notes="EarningsScout XGBoost (PR 51)",
            is_shadow=True,
        )
        log.info("Registered %s v%s shadow", MODEL_NAME, row.get("version"))
        if args.promote:
            promoted = reg.promote(MODEL_NAME, row["version"])
            log.info("Promoted to prod: %s", promoted)
            # Invalidate cache so workers pick up the new model.
            try:
                from backend.ai.earnings.training.trainer import invalidate_cache
                invalidate_cache()
            except Exception:
                pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
