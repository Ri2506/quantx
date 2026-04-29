"""
Train the ML Breakout Meta-Labeler model.

Downloads 10y OHLCV for ~500+ liquid NSE stocks (from data/nse_all_symbols.json),
builds training data from detected breakout patterns, trains a RandomForest
classifier, and saves the model.

Usage:
    python scripts/train_ml_model.py

Output:
    ml/models/breakout_meta_labeler.pkl
"""

import json
import os
import sys
import time

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

import numpy as np
import yfinance as yf
from ml.features.patterns import walkforward_train, _ML_FEATURE_NAMES


MODEL_PATH = os.path.join(PROJECT_ROOT, "ml", "models", "breakout_meta_labeler.pkl")
SYMBOLS_PATH = os.path.join(PROJECT_ROOT, "data", "nse_all_symbols.json")

# Minimum requirements for a stock to be included in training
MIN_BARS = 500       # At least ~2 years of trading data
MIN_AVG_VOL = 200000  # Strong liquidity: avg daily volume >= 200K shares

# Batch size for yfinance downloads
BATCH_SIZE = 50


def load_symbols():
    """Load NSE symbols from cached JSON file."""
    with open(SYMBOLS_PATH) as f:
        data = json.load(f)
    symbols = data["symbols"]
    print(f"Loaded {len(symbols)} NSE symbols from {SYMBOLS_PATH}")
    return symbols


def download_batch(tickers: list) -> dict:
    """Download OHLCV for a batch of tickers using yfinance batch API."""
    ticker_str = " ".join(tickers)
    try:
        raw = yf.download(ticker_str, period="10y", interval="1d",
                          progress=False, group_by="ticker", threads=True)
        if raw.empty:
            return {}
    except Exception:
        return {}

    results = {}
    for ticker in tickers:
        try:
            if len(tickers) == 1:
                df = raw.copy()
            else:
                df = raw[ticker].copy()

            if df.empty or len(df) < MIN_BARS:
                continue

            df = df.dropna(subset=["Close"])
            if len(df) < MIN_BARS:
                continue

            # Normalize columns
            df.columns = [
                c.lower() if isinstance(c, str) else c[0].lower()
                for c in df.columns
            ]

            # Filter by volume
            if "volume" in df.columns:
                avg_vol = df["volume"].mean()
                if avg_vol < MIN_AVG_VOL:
                    continue

            results[ticker] = df
        except Exception:
            continue

    return results


def main():
    print("=" * 60)
    print("ML Breakout Meta-Labeler Training")
    print("=" * 60)
    print()

    # Load all NSE symbols
    all_symbols = load_symbols()

    # Build ticker list (add .NS suffix)
    tickers = [f"{sym}.NS" for sym in all_symbols]

    # Download in batches
    stock_dfs = {}
    total_batches = (len(tickers) + BATCH_SIZE - 1) // BATCH_SIZE
    t_download = time.time()

    for batch_idx in range(total_batches):
        batch_start = batch_idx * BATCH_SIZE
        batch_end = min(batch_start + BATCH_SIZE, len(tickers))
        batch = tickers[batch_start:batch_end]

        results = download_batch(batch)
        # Store with clean symbol name (without .NS)
        for ticker, df in results.items():
            sym = ticker.replace(".NS", "")
            stock_dfs[sym] = df

        downloaded = len(stock_dfs)
        elapsed = time.time() - t_download
        print(f"  Batch {batch_idx + 1}/{total_batches} | "
              f"Downloaded: {downloaded} qualifying stocks | "
              f"Elapsed: {elapsed:.0f}s")

    download_time = time.time() - t_download
    print(f"\nDownload complete: {len(stock_dfs)} stocks in {download_time:.0f}s")
    print(f"  (filtered from {len(all_symbols)} total, "
          f"requiring >={MIN_BARS} bars & avg vol >={MIN_AVG_VOL:,})")

    if len(stock_dfs) < 50:
        print("ERROR: Too few stocks downloaded. Check network connection.")
        sys.exit(1)

    # Train model
    print(f"\nTraining model on {len(stock_dfs)} stocks (lookback=500, hold_period=15 bars)...")
    t0 = time.time()
    labeler = walkforward_train(stock_dfs, lookback=500, hold_period=15)
    elapsed = time.time() - t0

    if not labeler.is_trained:
        print("ERROR: Model training failed (insufficient training samples).")
        sys.exit(1)

    # Print stats
    print(f"\nTraining completed in {elapsed:.1f}s")
    print(f"Model: RandomForest(n_estimators={labeler.n_estimators}, "
          f"max_depth={labeler.max_depth})")

    importances = list(zip(_ML_FEATURE_NAMES, labeler.model.feature_importances_))
    importances.sort(key=lambda x: x[1], reverse=True)
    print("\nFeature importances:")
    for name, imp in importances:
        print(f"  {name:>12s}: {imp:.3f}")

    # Save
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    labeler.save(MODEL_PATH)
    file_size = os.path.getsize(MODEL_PATH)
    print(f"\nModel saved: {MODEL_PATH} ({file_size / 1024:.0f} KB)")
    print(f"Training stocks: {len(stock_dfs)}")


if __name__ == "__main__":
    main()
