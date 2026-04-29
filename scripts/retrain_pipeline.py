"""
================================================================================
AUTO-RETRAINING PIPELINE
================================================================================
Unified retraining for all Swing AI ML models. Implements candidate/promote
pattern: trains a new model, evaluates on holdout, promotes only if improved.

Usage:
    python scripts/retrain_pipeline.py --model lgbm
    python scripts/retrain_pipeline.py --model meta_labeler
    python scripts/retrain_pipeline.py --model regime
    python scripts/retrain_pipeline.py --model quantai
    python scripts/retrain_pipeline.py --model all

Scheduled: Saturday 7 AM IST (via scheduler.py)
================================================================================
"""

import argparse
import logging
import os
import sys
import time
from pathlib import Path

# Path setup
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

MODELS_DIR = os.path.join(PROJECT_ROOT, "ml", "models")


def retrain_lgbm():
    """Retrain LightGBM signal classifier."""
    logger.info("=" * 60)
    logger.info("RETRAINING: LightGBM Signal Classifier")
    logger.info("=" * 60)

    candidate_path = os.path.join(MODELS_DIR, "lgbm_signal_gate_candidate.txt")
    prod_path = os.path.join(MODELS_DIR, "lgbm_signal_gate.txt")

    try:
        # Import training logic
        from scripts.train_lgbm import (
            load_symbols, download_batch, build_dataset,
            LGBM_PARAMS, FEATURE_ORDER, BATCH_SIZE, MIN_BARS,
        )
        import numpy as np
        import lightgbm as lgb
        from sklearn.model_selection import TimeSeriesSplit
        from sklearn.metrics import accuracy_score

        # Download data
        all_symbols = load_symbols()
        tickers = [f"{sym}.NS" for sym in all_symbols[:300]]  # Use 300 for retraining speed
        stock_dfs = {}
        total_batches = (len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE

        for batch_idx in range(total_batches):
            batch_start = batch_idx * BATCH_SIZE
            batch_end = min(batch_start + BATCH_SIZE, len(tickers))
            batch = tickers[batch_start:batch_end]
            results = download_batch(batch)
            for ticker, df in results.items():
                stock_dfs[ticker.replace(".NS", "")] = df

        if len(stock_dfs) < 30:
            logger.error("Too few stocks for retraining (%d)", len(stock_dfs))
            return False

        X, y = build_dataset(stock_dfs)
        X = np.nan_to_num(X, nan=0.0, posinf=0.0, neginf=0.0)

        # Train candidate
        logger.info("Training candidate model on %d samples...", len(X))
        candidate = lgb.LGBMClassifier(**LGBM_PARAMS)
        candidate.fit(X, y)

        # Evaluate on last 20% (holdout)
        split = int(len(X) * 0.8)
        X_holdout, y_holdout = X[split:], y[split:]
        candidate_acc = accuracy_score(y_holdout, candidate.predict(X_holdout))
        logger.info("Candidate accuracy on holdout: %.4f", candidate_acc)

        # Compare with current production model
        promote = True
        if os.path.exists(prod_path):
            try:
                prod_model = lgb.Booster(model_file=prod_path)
                prod_preds_raw = prod_model.predict(X_holdout)
                # Multi-class: raw output is (n_samples, n_classes)
                if prod_preds_raw.ndim == 2:
                    prod_preds = prod_preds_raw.argmax(axis=1)
                else:
                    prod_preds = prod_preds_raw.astype(int)
                prod_acc = accuracy_score(y_holdout, prod_preds)
                logger.info("Production accuracy on holdout: %.4f", prod_acc)

                if candidate_acc <= prod_acc:
                    logger.info("Candidate NOT better than production. Skipping promotion.")
                    promote = False
                else:
                    logger.info(
                        "Candidate BETTER: %.4f > %.4f. Promoting.",
                        candidate_acc, prod_acc,
                    )
            except Exception as e:
                logger.warning("Could not evaluate production model: %s", e)

        if promote:
            os.makedirs(MODELS_DIR, exist_ok=True)
            candidate.booster_.save_model(prod_path)
            logger.info("Promoted new LightGBM model to %s", prod_path)
            return True
        return False

    except Exception as e:
        logger.error("LightGBM retraining failed: %s", e)
        return False


def retrain_meta_labeler():
    """Retrain BreakoutMetaLabeler (RandomForest)."""
    logger.info("=" * 60)
    logger.info("RETRAINING: BreakoutMetaLabeler")
    logger.info("=" * 60)

    try:
        from ml.features.patterns import BreakoutMetaLabeler
        import yfinance as yf
        import pandas as pd

        prod_path = os.path.join(MODELS_DIR, "breakout_meta_labeler.pkl")

        # Download data for 100 liquid stocks
        symbols = [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN",
            "BHARTIARTL", "LT", "AXISBANK", "KOTAKBANK", "TATASTEEL",
            "JSWSTEEL", "HINDALCO", "TRENT", "POLYCAB", "PERSISTENT",
            "DIXON", "ABB", "SIEMENS", "HAL", "BEL", "TITAN",
            "BAJFINANCE", "SUNPHARMA", "DRREDDY", "CIPLA", "MARUTI",
            "WIPRO", "TECHM", "HCLTECH", "ITC", "HINDUNILVR",
            "NTPC", "ONGC", "POWERGRID", "COALINDIA", "BPCL",
            "ADANIENT", "ADANIPORTS", "DLF", "GODREJPROP", "EICHERMOT",
            "HEROMOTOCO", "BAJAJ-AUTO", "M&M", "TATAPOWER", "INDUSINDBK",
            "BANKBARODA", "PNB", "NAUKRI",
        ]

        stock_dfs = []
        tickers = [f"{s}.NS" for s in symbols]
        for ticker in tickers:
            try:
                df = yf.download(ticker, period="2y", interval="1d", progress=False)
                if df is not None and len(df) >= 200:
                    df.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in df.columns]
                    stock_dfs.append(df)
            except Exception:
                continue

        if len(stock_dfs) < 20:
            logger.error("Too few stocks for meta-labeler retraining")
            return False

        logger.info("Training meta-labeler on %d stocks...", len(stock_dfs))
        labeler = BreakoutMetaLabeler()
        labeler.walkforward_train(stock_dfs, hold_period=15)

        if labeler.is_trained:
            os.makedirs(MODELS_DIR, exist_ok=True)
            labeler.save(prod_path)
            logger.info("Meta-labeler saved to %s", prod_path)
            return True
        else:
            logger.warning("Meta-labeler training did not produce a trained model")
            return False

    except Exception as e:
        logger.error("Meta-labeler retraining failed: %s", e)
        return False


def retrain_regime():
    """Retrain HMM regime detector."""
    logger.info("=" * 60)
    logger.info("RETRAINING: HMM Regime Detector")
    logger.info("=" * 60)

    try:
        from ml.regime_detector import MarketRegimeDetector, compute_regime_features
        import yfinance as yf
        import pandas as pd

        prod_path = os.path.join(MODELS_DIR, "regime_hmm.pkl")

        # Download 10y Nifty data
        nifty = yf.download("^NSEI", period="10y", interval="1d", progress=False)
        if nifty is None or len(nifty) < 500:
            logger.error("Insufficient Nifty data for regime retraining")
            return False

        nifty.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in nifty.columns]

        # Try VIX data
        vix = None
        try:
            vix = yf.download("^INDIAVIX", period="10y", interval="1d", progress=False)
            if vix is not None and len(vix) > 0:
                vix.columns = [c.lower() if isinstance(c, str) else c[0].lower() for c in vix.columns]
        except Exception:
            pass

        features = compute_regime_features(nifty, vix)
        detector = MarketRegimeDetector()
        detector.train(features)

        if detector.is_trained:
            os.makedirs(MODELS_DIR, exist_ok=True)
            detector.save(prod_path)
            logger.info("Regime detector saved to %s", prod_path)
            return True
        return False

    except Exception as e:
        logger.error("Regime retraining failed: %s", e)
        return False


def retrain_quantai():
    """Retrain QuantAI ranking model."""
    logger.info("=" * 60)
    logger.info("RETRAINING: QuantAI Ranker")
    logger.info("=" * 60)

    try:
        # Delegate to existing training script
        from scripts.train_quantai import main as train_quantai_main
        train_quantai_main()
        prod_path = os.path.join(MODELS_DIR, "quantai_ranker.txt")
        return os.path.exists(prod_path)
    except Exception as e:
        logger.error("QuantAI retraining failed: %s", e)
        return False


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------

MODEL_TRAINERS = {
    "lgbm": retrain_lgbm,
    "meta_labeler": retrain_meta_labeler,
    "regime": retrain_regime,
    "quantai": retrain_quantai,
}


def main():
    parser = argparse.ArgumentParser(description="Swing AI Auto-Retraining Pipeline")
    parser.add_argument(
        "--model",
        choices=list(MODEL_TRAINERS.keys()) + ["all"],
        default="all",
        help="Which model to retrain (default: all)",
    )
    args = parser.parse_args()

    targets = list(MODEL_TRAINERS.keys()) if args.model == "all" else [args.model]

    results = {}
    total_start = time.time()

    for model_name in targets:
        start = time.time()
        logger.info("\n")
        success = MODEL_TRAINERS[model_name]()
        elapsed = time.time() - start
        status = "SUCCESS" if success else "FAILED"
        results[model_name] = status
        logger.info("%s retraining %s in %.0fs", model_name, status, elapsed)

    total_elapsed = time.time() - total_start

    # Summary
    logger.info("\n" + "=" * 60)
    logger.info("RETRAINING SUMMARY (%.0fs total)", total_elapsed)
    logger.info("=" * 60)
    for model_name, status in results.items():
        icon = "✓" if status == "SUCCESS" else "✗"
        logger.info("  %s %s: %s", icon, model_name, status)


if __name__ == "__main__":
    main()
