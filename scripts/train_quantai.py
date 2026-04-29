"""
Train QuantAI Alpha Picks — LightGBM stock ranker.

Downloads 10y OHLCV for ~500+ liquid NSE stocks, computes 51 technical features
via feature_engineering.compute_features(), adds fundamental-proxy features,
labels bars by forward 2-week return, and trains a LGBMRegressor that predicts
expected return (then ranks stocks by predicted return).

Walk-forward validation: train on first 8 years, test on last 2 years.

Usage:
    python scripts/train_quantai.py

Output:
    ml/models/quantai_ranker.txt  (native LightGBM format)
"""

import json
import os
import sys
import time
import warnings

warnings.filterwarnings("ignore", category=FutureWarning)

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

import numpy as np
import pandas as pd
import yfinance as yf
import lightgbm as lgb
from sklearn.metrics import mean_squared_error, r2_score

from src.backend.services.feature_engineering import compute_features

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MODEL_PATH = os.path.join(PROJECT_ROOT, "ml", "models", "quantai_ranker.txt")
SYMBOLS_PATH = os.path.join(PROJECT_ROOT, "data", "nse_all_symbols.json")
UNIVERSE_PATH = os.path.join(PROJECT_ROOT, "data", "full_backtest_universe.txt")

MIN_BARS = 500          # Minimum ~2 years of data
MIN_AVG_VOL = 200_000   # Strong liquidity filter
BATCH_SIZE = 50
FORWARD_DAYS = 10  # ~2 trading weeks

# LightGBM hyper-parameters (regression)
LGBM_PARAMS = dict(
    n_estimators=1000,
    max_depth=7,
    learning_rate=0.02,
    num_leaves=63,
    subsample=0.8,
    colsample_bytree=0.8,
    reg_alpha=0.1,
    reg_lambda=1.0,
    random_state=42,
    n_jobs=-1,
    verbose=-1,
)

# Feature columns from compute_features() + custom extras
# We'll discover them dynamically but define custom ones here
CUSTOM_FEATURES = ["pos_52w", "momentum_20d", "sector_rs"]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_symbols() -> list:
    """Load NSE symbols from JSON or universe text file."""
    if os.path.exists(SYMBOLS_PATH):
        with open(SYMBOLS_PATH) as f:
            data = json.load(f)
        symbols = data["symbols"]
        print(f"Loaded {len(symbols)} NSE symbols from {SYMBOLS_PATH}")
        return symbols

    if os.path.exists(UNIVERSE_PATH):
        with open(UNIVERSE_PATH) as f:
            symbols = [line.strip() for line in f if line.strip()]
        print(f"Loaded {len(symbols)} symbols from {UNIVERSE_PATH}")
        return symbols

    # Hardcoded top-200 fallback
    fallback = [
        "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "BHARTIARTL",
        "SBIN", "KOTAKBANK", "LT", "AXISBANK", "TATASTEEL", "JSWSTEEL",
        "HINDALCO", "VEDL", "ABB", "SIEMENS", "HAL", "BEL", "IRCTC",
        "TRENT", "POLYCAB", "PERSISTENT", "ASTRAL", "COFORGE", "TATAELXSI",
        "MUTHOOTFIN", "MARUTI", "BAJFINANCE", "BAJAJFINSV", "HDFCLIFE",
        "SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "APOLLOHOSP",
        "TITAN", "NESTLEIND", "ASIANPAINT", "ULTRACEMCO", "GRASIM",
        "ADANIENT", "ADANIPORTS", "WIPRO", "TECHM", "HCLTECH",
        "POWERGRID", "NTPC", "ONGC", "BPCL", "COALINDIA",
        "ITC", "HINDUNILVR", "BRITANNIA", "DABUR", "MARICO",
        "PIDILITIND", "BERGEPAINT", "GODREJCP", "COLPAL", "HAVELLS",
        "VOLTAS", "CROMPTON", "EICHERMOT", "HEROMOTOCO",
        "BAJAJ-AUTO", "M&M", "TATAPOWER", "TORNTPOWER", "INDUSINDBK",
        "BANKBARODA", "PNB", "CANBK", "IDFCFIRSTB",
        "LICHSGFIN", "CHOLAFIN", "SHRIRAMFIN", "MFSL", "SBICARD",
        "ICICIPRULI", "ICICIGI", "RECLTD", "PFC", "IRFC",
        "DLF", "GODREJPROP", "PRESTIGE", "OBEROIRLTY", "SOBHA",
        "SRF", "PIIND", "NAVINFLUOR", "DEEPAKNTR", "ATUL",
        "LUPIN", "AUROPHARMA", "BIOCON", "GLENMARK", "ALKEM",
        "JUBLFOOD", "TATACONSUM", "VBL",
        "NAUKRI", "DMART", "LTIM", "LTTS", "MPHASIS", "KPITTECH",
        "MRF", "PAGEIND", "SHREECEM", "AMBUJACEM", "DALBHARAT",
        "SAIL", "NMDC", "NATIONALUM", "JINDALSTEL", "TATACHEM",
        "INDIGO", "CONCOR", "BHEL", "GAIL", "NHPC",
        "SJVN", "RVNL", "HUDCO", "INDUSTOWER",
        "ACC", "RAMCOCEM", "STARHEALTH", "MAXHEALTH", "MEDANTA",
        "CDSL", "CAMS", "ANGELONE", "MOTILALOFS", "MANAPPURAM",
        "RADICO", "SKFINDIA", "TIMKEN", "SCHAEFFLER", "GRINDWELL",
        "HONAUT", "LINDEINDIA", "RELAXO", "SUPREMEIND", "RATNAMANI",
        "KAYNES", "SYRMA", "DATAPATTNS", "CLEAN", "FIVESTAR",
        "CANFINHOME", "RBLBANK", "AUBANK", "BANDHANBNK", "SUNDARMFIN",
        "AFFLE", "MAPMYINDIA", "LATENTVIEW", "INTELLECT",
        "ZYDUSLIFE", "GLAXO", "PFIZER", "SANOFI", "NATCOPHARM",
    ]
    print(f"Using hardcoded fallback of {len(fallback)} symbols")
    return fallback


def download_batch(tickers: list) -> dict:
    """Download OHLCV for a batch of tickers (Yahoo Finance)."""
    ticker_str = " ".join(tickers)
    try:
        raw = yf.download(
            ticker_str, period="10y", interval="1d",
            progress=False, group_by="ticker", threads=True,
        )
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


def download_nifty_benchmark() -> pd.Series:
    """Download Nifty 50 close prices for benchmark comparison."""
    try:
        nifty = yf.download("^NSEI", period="10y", interval="1d", progress=False)
        if nifty is not None and not nifty.empty:
            nifty.columns = [
                c.lower() if isinstance(c, str) else c[0].lower()
                for c in nifty.columns
            ]
            return nifty["close"]
    except Exception:
        pass
    return None


def add_custom_features(df: pd.DataFrame, nifty_close: pd.Series = None) -> pd.DataFrame:
    """
    Add fundamental-proxy features on top of compute_features() output.
    - pos_52w: position in 52-week range (0-1)
    - momentum_20d: 20-day return
    - sector_rs: relative strength vs Nifty 50
    """
    # Position in 52-week range
    high_52w = df["close"].rolling(252, min_periods=50).max()
    low_52w = df["close"].rolling(252, min_periods=50).min()
    range_52w = high_52w - low_52w
    df["pos_52w"] = ((df["close"] - low_52w) / range_52w.replace(0, np.nan)).fillna(0.5)

    # 20-day momentum (return)
    df["momentum_20d"] = df["close"].pct_change(20).fillna(0)

    # Relative strength vs Nifty 50
    if nifty_close is not None:
        # Align indices
        stock_ret_20 = df["close"].pct_change(20)
        nifty_aligned = nifty_close.reindex(df.index, method="ffill")
        nifty_ret_20 = nifty_aligned.pct_change(20)
        df["sector_rs"] = (stock_ret_20 - nifty_ret_20).fillna(0)
    else:
        df["sector_rs"] = df["close"].pct_change(20).fillna(0)

    return df


def build_dataset(stock_dfs: dict, nifty_close: pd.Series = None) -> tuple:
    """
    Build feature matrix X and target vector y (forward 2-week return).
    Returns (X, y, dates, feature_names).
    """
    all_rows = []
    skipped = 0

    for sym, df in stock_dfs.items():
        try:
            featured = compute_features(df, benchmark_close=nifty_close)
            featured = add_custom_features(featured, nifty_close)

            # Forward return label (2-week = 10 trading days)
            featured["fwd_return"] = featured["close"].shift(-FORWARD_DAYS) / featured["close"] - 1

            # Drop NaN rows
            featured = featured.dropna(subset=["fwd_return"])

            if len(featured) < 50:
                skipped += 1
                continue

            # Select feature columns (everything except OHLCV and target)
            exclude_cols = {"open", "high", "low", "close", "volume", "fwd_return"}
            feature_cols = [c for c in featured.columns if c not in exclude_cols and featured[c].dtype in [np.float64, np.int64, np.float32, np.int32, float, int]]

            for _, row in featured.iterrows():
                row_dict = {col: row[col] for col in feature_cols}
                row_dict["_target"] = row["fwd_return"]
                row_dict["_date"] = row.name if hasattr(row.name, "strftime") else None
                row_dict["_symbol"] = sym
                all_rows.append(row_dict)

        except Exception as e:
            skipped += 1
            continue

    if skipped:
        print(f"  Skipped {skipped} stocks (insufficient data or errors)")

    if not all_rows:
        return None, None, None, None

    result_df = pd.DataFrame(all_rows)
    feature_cols = [c for c in result_df.columns if not c.startswith("_")]

    X = result_df[feature_cols].replace([np.inf, -np.inf], np.nan).fillna(0).values
    y = result_df["_target"].values
    dates = result_df["_date"].values
    symbols = result_df["_symbol"].values

    return X, y, dates, feature_cols, symbols


def walk_forward_split(dates, train_months=18):
    """
    Split by date: first `train_months` months for training, rest for test.
    """
    valid_dates = pd.to_datetime([d for d in dates if d is not None])
    if len(valid_dates) == 0:
        # Fallback: 75/25 split
        n = len(dates)
        return np.arange(int(n * 0.75)), np.arange(int(n * 0.75), n)

    min_date = valid_dates.min()
    cutoff = min_date + pd.DateOffset(months=train_months)

    dates_parsed = pd.to_datetime(dates, errors="coerce")
    train_mask = dates_parsed < cutoff
    test_mask = dates_parsed >= cutoff

    train_idx = np.where(train_mask)[0]
    test_idx = np.where(test_mask)[0]

    return train_idx, test_idx


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 70)
    print("QuantAI Alpha Picks — LightGBM Ranker Training")
    print("=" * 70)

    # 1. Load symbols
    symbols = load_symbols()
    # Filter out known delisted
    symbols = [s for s in symbols if s != "TATAMOTORS"]
    yf_symbols = [f"{s}.NS" for s in symbols]

    # 2. Download Nifty benchmark
    print("\nDownloading Nifty 50 benchmark...")
    nifty_close = download_nifty_benchmark()
    if nifty_close is not None:
        print(f"  Nifty data: {len(nifty_close)} bars")
    else:
        print("  Warning: Nifty benchmark not available, using stock-only RS")

    # 3. Download stock data in batches
    print(f"\nDownloading {len(yf_symbols)} stocks in batches of {BATCH_SIZE}...")
    all_dfs = {}
    total_batches = (len(yf_symbols) + BATCH_SIZE - 1) // BATCH_SIZE

    for i in range(0, len(yf_symbols), BATCH_SIZE):
        batch = yf_symbols[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        print(f"  Batch {batch_num}/{total_batches} ({len(batch)} tickers)...", end=" ", flush=True)

        t0 = time.time()
        result = download_batch(batch)
        elapsed = time.time() - t0

        # Map back to clean symbol names
        for ticker, df in result.items():
            clean = ticker.replace(".NS", "")
            all_dfs[clean] = df

        print(f"{len(result)} OK ({elapsed:.1f}s)")
        if batch_num < total_batches:
            time.sleep(0.5)

    print(f"\nTotal stocks with sufficient data: {len(all_dfs)}")

    if len(all_dfs) < 10:
        print("ERROR: Too few stocks. Check internet connection.")
        sys.exit(1)

    # 4. Build dataset
    print("\nBuilding feature matrix...")
    t0 = time.time()
    result = build_dataset(all_dfs, nifty_close)

    if result[0] is None:
        print("ERROR: Failed to build dataset")
        sys.exit(1)

    X, y, dates, feature_names, symbols_arr = result
    print(f"  Dataset: {X.shape[0]} rows, {X.shape[1]} features ({time.time() - t0:.1f}s)")
    print(f"  Target stats: mean={y.mean():.4f}, std={y.std():.4f}")

    # 5. Walk-forward split
    train_idx, test_idx = walk_forward_split(dates, train_months=96)
    print(f"\n  Train: {len(train_idx)} rows, Test: {len(test_idx)} rows")

    if len(train_idx) < 1000 or len(test_idx) < 100:
        print("WARNING: Small dataset. Results may be unreliable.")

    X_train, y_train = X[train_idx], y[train_idx]
    X_test, y_test = X[test_idx], y[test_idx]
    test_symbols = symbols_arr[test_idx]
    test_dates = dates[test_idx]

    # 6. Train LGBMRegressor
    print("\nTraining LGBMRegressor...")
    t0 = time.time()
    model = lgb.LGBMRegressor(**LGBM_PARAMS)
    model.fit(
        X_train, y_train,
        eval_set=[(X_test, y_test)],
        callbacks=[lgb.log_evaluation(100)],
    )
    print(f"  Training done in {time.time() - t0:.1f}s")

    # 7. Evaluate
    y_pred_test = model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, y_pred_test))
    r2 = r2_score(y_test, y_pred_test)
    print(f"\n  Test RMSE: {rmse:.4f}")
    print(f"  Test R2:   {r2:.4f}")

    # Rank-based evaluation: do top-predicted stocks actually outperform?
    test_df = pd.DataFrame({
        "symbol": test_symbols,
        "date": test_dates,
        "pred_return": y_pred_test,
        "actual_return": y_test,
    })

    # Get latest date in test set for top-picks display
    test_df["date_parsed"] = pd.to_datetime(test_df["date"], errors="coerce")
    latest_date = test_df["date_parsed"].max()

    # Average returns by predicted quintile
    test_df["quintile"] = pd.qcut(test_df["pred_return"], 5, labels=False, duplicates="drop")
    quintile_returns = test_df.groupby("quintile")["actual_return"].mean() * 100
    print("\n  Average actual return by predicted quintile (%):")
    for q, ret in quintile_returns.items():
        label = "BOTTOM" if q == 0 else "TOP" if q == quintile_returns.index.max() else f"Q{q}"
        print(f"    {label}: {ret:+.2f}%")

    # Top-10 picks from latest test date
    latest_picks = test_df[test_df["date_parsed"] == latest_date].nlargest(10, "pred_return")
    if len(latest_picks) > 0:
        print(f"\n  Top-10 picks (latest test date: {latest_date.date()}):")
        for _, row in latest_picks.iterrows():
            print(f"    {row['symbol']:>15s}  pred={row['pred_return']*100:+.2f}%  actual={row['actual_return']*100:+.2f}%")

    # Nifty benchmark comparison
    if nifty_close is not None:
        test_start = test_df["date_parsed"].min()
        test_end = test_df["date_parsed"].max()
        nifty_aligned = nifty_close.loc[
            (nifty_close.index >= test_start) & (nifty_close.index <= test_end)
        ]
        if len(nifty_aligned) > 10:
            nifty_return = (float(nifty_aligned.iloc[-1]) / float(nifty_aligned.iloc[0]) - 1) * 100
            top_q_return = quintile_returns.iloc[-1] if len(quintile_returns) > 0 else 0
            print(f"\n  Nifty 50 return over test period: {nifty_return:+.2f}%")
            print(f"  Top quintile avg 2-wk return:    {top_q_return:+.2f}%")

    # 8. Feature importance
    importances = model.feature_importances_
    feat_imp = sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)
    print("\n  Top-15 features by importance:")
    for name, imp in feat_imp[:15]:
        print(f"    {name:>30s}: {imp}")

    # 9. Save model
    os.makedirs(os.path.dirname(MODEL_PATH), exist_ok=True)
    model.booster_.save_model(MODEL_PATH)
    print(f"\n  Model saved to: {MODEL_PATH}")

    # Also save feature names for inference
    meta_path = MODEL_PATH.replace(".txt", "_meta.json")
    with open(meta_path, "w") as f:
        json.dump({"feature_names": feature_names, "forward_days": FORWARD_DAYS}, f)
    print(f"  Metadata saved to: {meta_path}")

    print("\n" + "=" * 70)
    print("QuantAI training complete!")
    print("=" * 70)


if __name__ == "__main__":
    main()
