"""
================================================================================
ENSEMBLE META-LEARNER TRAINING SCRIPT
================================================================================
Trains a LogisticRegression stacking ensemble that combines:
  - strategy_conf_norm (0-1): normalised 6-strategy confidence
  - ml_score (0-1): BreakoutMetaLabeler probability
  - lgbm_buy_prob (0-1): LightGBM BUY probability
  - regime_id (0/1/2): HMM regime (0=bull, 1=sideways, 2=bear)
  - sentiment_score (-1 to 1): news sentiment

Modes:
  1. Historical signals from Supabase (if SUPABASE_URL + SUPABASE_KEY set and enough rows)
  2. Synthetic fallback: downloads 1y OHLCV for 100 stocks, generates realistic
     feature distributions, labels by forward 10-day return > +3%.

Output: ml/models/ensemble_meta_learner.pkl
Run:    python scripts/train_ensemble.py
================================================================================
"""

import os
import sys
import pickle
import logging
import argparse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score, classification_report, roc_auc_score

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

ROOT_DIR = Path(__file__).resolve().parents[1]
MODEL_DIR = ROOT_DIR / "ml" / "models"
MODEL_PATH = MODEL_DIR / "ensemble_meta_learner.pkl"

FEATURE_NAMES = [
    "strategy_conf_norm",   # 0-1
    "ml_score",             # 0-1
    "lgbm_buy_prob",        # 0-1
    "regime_id",            # 0, 1, 2
    "sentiment_score",      # -1 to 1
]

MIN_SUPABASE_ROWS = 200  # need at least this many historical signals


# =============================================================================
# Supabase loader
# =============================================================================

def _load_from_supabase() -> pd.DataFrame | None:
    """Try to load labelled signal outcomes from Supabase."""
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_KEY", "") or os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        logger.info("No SUPABASE_URL/KEY in env -- skipping Supabase loader")
        return None

    try:
        from supabase import create_client
        sb = create_client(url, key)
        # Expect a table 'signal_outcomes' with columns matching FEATURE_NAMES + 'outcome' (0/1)
        resp = sb.table("signal_outcomes").select("*").limit(5000).execute()
        if not resp.data or len(resp.data) < MIN_SUPABASE_ROWS:
            logger.info(
                "Supabase signal_outcomes has %d rows (need %d) -- falling back to synthetic",
                len(resp.data) if resp.data else 0,
                MIN_SUPABASE_ROWS,
            )
            return None
        df = pd.DataFrame(resp.data)
        required = set(FEATURE_NAMES) | {"outcome"}
        if not required.issubset(df.columns):
            logger.warning("Supabase table missing columns: %s", required - set(df.columns))
            return None
        logger.info("Loaded %d rows from Supabase signal_outcomes", len(df))
        return df[list(FEATURE_NAMES) + ["outcome"]]
    except Exception as e:
        logger.warning("Supabase load failed: %s", e)
        return None


# =============================================================================
# Synthetic data generator
# =============================================================================

SYNTHETIC_SYMBOLS = [
    "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "BHARTIARTL", "SBIN",
    "KOTAKBANK", "LT", "AXISBANK", "TRENT", "POLYCAB", "PERSISTENT", "DIXON",
    "TATAELXSI", "ASTRAL", "COFORGE", "LALPATHLAB", "MUTHOOTFIN", "INDHOTEL",
    "TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "ABB", "SIEMENS", "HAL", "BEL",
    "IRCTC", "WIPRO", "TECHM", "HCLTECH", "BAJFINANCE", "BAJAJFINSV", "MARUTI",
    "TITAN", "NESTLEIND", "HINDUNILVR", "ITC", "ASIANPAINT", "ULTRACEMCO",
    "GRASIM", "SHREECEM", "DIVISLAB", "DRREDDY", "CIPLA", "SUNPHARMA",
    "APOLLOHOSP", "EICHERMOT", "HEROMOTOCO", "TATAPOWER", "POWERGRID", "NTPC",
    "ONGC", "BPCL", "COALINDIA", "ADANIENT", "ADANIPORTS", "DLF", "GODREJPROP",
    "PIDILITIND", "HAVELLS", "VOLTAS", "CROMPTON", "INDIGO", "DMART", "JUBLFOOD",
    "COLPAL", "DABUR", "MARICO", "BRITANNIA", "LUPIN", "BIOCON", "GLENMARK",
    "CANFINHOME", "CHOLAFIN", "SHRIRAMFIN", "MFSL", "SRF", "PIIND", "DEEPAKNTR",
    "NAVINFLUOR", "ATUL", "RELAXO", "PAGEIND", "LTIM", "LTTS", "MPHASIS",
    "OFSS", "NAUKRI", "INFY", "WHIRLPOOL", "TATACONSUM", "SBICARD", "ICICIPRULI",
    "HDFCLIFE", "BAJAJ-AUTO", "M&M", "SAIL", "NMDC", "HONAUT",
]


def _download_ohlcv(symbols: list[str], period: str = "1y") -> dict[str, pd.DataFrame]:
    """Download OHLCV from yfinance for a list of NSE symbols."""
    import yfinance as yf

    tickers = [f"{s}.NS" for s in symbols]
    logger.info("Downloading OHLCV for %d symbols ...", len(tickers))
    data = yf.download(tickers, period=period, interval="1d", progress=True, group_by="ticker")

    result = {}
    for sym, ticker in zip(symbols, tickers):
        try:
            if len(tickers) == 1:
                df = data.copy()
            else:
                df = data[ticker].copy() if ticker in data.columns.get_level_values(0) else None
            if df is None or df.empty:
                continue
            df.columns = [c.lower() if isinstance(c, str) else c for c in df.columns]
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [c[0].lower() for c in df.columns]
            df = df.dropna(subset=["close"])
            if len(df) >= 60:
                result[sym] = df
        except Exception:
            continue
    logger.info("Got OHLCV for %d / %d symbols", len(result), len(symbols))
    return result


def _generate_synthetic_dataset(n_stocks: int = 100) -> pd.DataFrame:
    """
    Generate synthetic training data by combining real forward returns with
    simulated model scores.
    """
    symbols = SYNTHETIC_SYMBOLS[:n_stocks]
    stock_data = _download_ohlcv(symbols)

    rng = np.random.default_rng(42)
    rows = []

    for sym, df in stock_data.items():
        close = df["close"].values
        volume = df["volume"].values if "volume" in df.columns else np.ones(len(close))

        # Slide a window: for each bar, simulate a "signal" and compute forward return
        for i in range(50, len(close) - 10):
            fwd_ret = (close[i + 10] - close[i]) / close[i]  # 10-day forward return
            outcome = 1 if fwd_ret > 0.03 else 0  # +3% = win

            # Simulate realistic feature distributions
            # Strategy confidence: higher when trend is up
            trend_up = close[i] > close[i - 20]
            base_conf = rng.uniform(55, 90) if trend_up else rng.uniform(45, 75)
            strategy_conf_norm = base_conf / 100.0

            # ML score: slightly correlated with outcome
            ml_score = np.clip(
                rng.normal(0.45 if outcome else 0.30, 0.15), 0, 1
            )

            # LGBM BUY prob: correlated with trend and outcome
            lgbm_buy_prob = np.clip(
                rng.normal(0.55 if (trend_up and outcome) else 0.35, 0.2), 0, 1
            )

            # Regime: bull=0 if trend up, bear=2 if trend down, sideways=1 otherwise
            if close[i] > close[i - 50] * 1.05:
                regime_id = 0  # bull
            elif close[i] < close[i - 50] * 0.95:
                regime_id = 2  # bear
            else:
                regime_id = 1  # sideways

            # Sentiment: mild correlation with short-term returns
            recent_ret = (close[i] - close[i - 5]) / close[i - 5]
            sentiment_score = np.clip(recent_ret * 10 + rng.normal(0, 0.3), -1, 1)

            rows.append({
                "strategy_conf_norm": round(strategy_conf_norm, 4),
                "ml_score": round(ml_score, 4),
                "lgbm_buy_prob": round(lgbm_buy_prob, 4),
                "regime_id": int(regime_id),
                "sentiment_score": round(sentiment_score, 4),
                "outcome": outcome,
            })

    df = pd.DataFrame(rows)
    logger.info(
        "Synthetic dataset: %d samples, %.1f%% positive",
        len(df), df["outcome"].mean() * 100,
    )
    return df


# =============================================================================
# Training
# =============================================================================

def train_ensemble(df: pd.DataFrame, n_splits: int = 5) -> Pipeline:
    """Train LogisticRegression with walk-forward TimeSeriesSplit CV."""
    X = df[FEATURE_NAMES].values
    y = df["outcome"].values

    logger.info("Training ensemble meta-learner on %d samples ...", len(X))

    # Walk-forward cross-validation
    tscv = TimeSeriesSplit(n_splits=n_splits)
    cv_scores = []
    cv_aucs = []

    for fold, (train_idx, val_idx) in enumerate(tscv.split(X), 1):
        X_tr, X_val = X[train_idx], X[val_idx]
        y_tr, y_val = y[train_idx], y[val_idx]

        pipe = Pipeline([
            ("scaler", StandardScaler()),
            ("lr", LogisticRegression(
                C=1.0,
                max_iter=1000,
                class_weight="balanced",
                solver="lbfgs",
            )),
        ])
        pipe.fit(X_tr, y_tr)
        y_pred = pipe.predict(X_val)
        y_proba = pipe.predict_proba(X_val)

        acc = accuracy_score(y_val, y_pred)
        cv_scores.append(acc)

        try:
            auc = roc_auc_score(y_val, y_proba[:, 1])
            cv_aucs.append(auc)
        except Exception:
            auc = float("nan")

        logger.info("  Fold %d: accuracy=%.3f  AUC=%.3f  (val=%d)", fold, acc, auc, len(val_idx))

    logger.info(
        "CV mean accuracy: %.3f +/- %.3f",
        np.mean(cv_scores), np.std(cv_scores),
    )
    if cv_aucs:
        logger.info(
            "CV mean AUC:      %.3f +/- %.3f",
            np.mean(cv_aucs), np.std(cv_aucs),
        )

    # Final model on all data
    final_pipe = Pipeline([
        ("scaler", StandardScaler()),
        ("lr", LogisticRegression(
            C=1.0,
            max_iter=1000,
            class_weight="balanced",
            solver="lbfgs",
        )),
    ])
    final_pipe.fit(X, y)

    # Log coefficients for interpretability
    lr = final_pipe.named_steps["lr"]
    logger.info("Final model coefficients:")
    for name, coef in zip(FEATURE_NAMES, lr.coef_[0]):
        logger.info("  %-22s  %+.4f", name, coef)
    logger.info("  %-22s  %+.4f", "intercept", lr.intercept_[0])

    return final_pipe


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Train ensemble meta-learner for Swing AI")
    parser.add_argument("--synthetic", action="store_true", help="Force synthetic data (skip Supabase)")
    parser.add_argument("--n-stocks", type=int, default=100, help="Number of stocks for synthetic data")
    parser.add_argument("--n-splits", type=int, default=5, help="TimeSeriesSplit folds")
    args = parser.parse_args()

    # Try Supabase first, fall back to synthetic
    df = None
    if not args.synthetic:
        df = _load_from_supabase()

    if df is None:
        logger.info("Generating synthetic training data ...")
        df = _generate_synthetic_dataset(n_stocks=args.n_stocks)

    if len(df) < 100:
        logger.error("Not enough training data (%d rows). Aborting.", len(df))
        sys.exit(1)

    # Train
    model = train_ensemble(df, n_splits=args.n_splits)

    # Save
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(model, f)
    size_kb = MODEL_PATH.stat().st_size / 1024
    logger.info("Saved ensemble meta-learner to %s (%.1f KB)", MODEL_PATH, size_kb)

    # Quick sanity check
    X_sample = df[FEATURE_NAMES].values[:5]
    probs = model.predict_proba(X_sample)
    logger.info("Sample predictions (first 5):")
    for i, (feats, prob) in enumerate(zip(X_sample, probs)):
        logger.info("  %s -> win_prob=%.3f", feats, prob[1] if len(prob) > 1 else prob[0])

    logger.info("Done.")


if __name__ == "__main__":
    main()
