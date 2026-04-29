"""
================================================================================
QuantAI Alpha Picks Engine
================================================================================
ML-powered stock picker for swing investing. Uses a pre-trained LightGBM
regressor to score all stocks by predicted 2-week return, then returns the
top N as daily "alpha picks".

Separate from SwingMax signals — this is a ranking/screening tool, not a
signal generator with entry/exit management.

Model: ml/models/quantai_ranker.txt (trained via scripts/train_quantai.py)
================================================================================
"""

import json
import logging
import os
import sys
from datetime import datetime, date
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

# Ensure project root is importable
_ROOT_DIR = Path(__file__).resolve().parents[3]
if str(_ROOT_DIR) not in sys.path:
    sys.path.append(str(_ROOT_DIR))

from src.backend.services.feature_engineering import compute_features

logger = logging.getLogger(__name__)

# Paths
MODEL_PATH = str(_ROOT_DIR / "ml" / "models" / "quantai_ranker.txt")
META_PATH = str(_ROOT_DIR / "ml" / "models" / "quantai_ranker_meta.json")

# Universe files
SYMBOLS_PATH = str(_ROOT_DIR / "data" / "nse_all_symbols.json")
UNIVERSE_PATH = str(_ROOT_DIR / "data" / "full_backtest_universe.txt")

# Download config
BATCH_SIZE = 50
MIN_BARS = 60  # Fewer required for daily scoring (vs 200 for training)
MIN_AVG_VOL = 100_000

# Sector mapping (simplified — maps common NSE stocks to sectors)
SECTOR_MAP = {
    "RELIANCE": "Energy", "ONGC": "Energy", "BPCL": "Energy", "GAIL": "Energy",
    "COALINDIA": "Energy", "TATAPOWER": "Energy", "TORNTPOWER": "Energy",
    "POWERGRID": "Utilities", "NTPC": "Utilities", "NHPC": "Utilities",
    "SJVN": "Utilities", "IRFC": "Utilities",
    "TCS": "IT", "INFY": "IT", "WIPRO": "IT", "HCLTECH": "IT", "TECHM": "IT",
    "LTIM": "IT", "LTTS": "IT", "MPHASIS": "IT", "KPITTECH": "IT",
    "PERSISTENT": "IT", "COFORGE": "IT", "TATAELXSI": "IT",
    "HDFCBANK": "Banking", "ICICIBANK": "Banking", "SBIN": "Banking",
    "KOTAKBANK": "Banking", "AXISBANK": "Banking", "INDUSINDBK": "Banking",
    "BANKBARODA": "Banking", "PNB": "Banking", "CANBK": "Banking",
    "IDFCFIRSTB": "Banking", "AUBANK": "Banking", "RBLBANK": "Banking",
    "BAJFINANCE": "Finance", "BAJAJFINSV": "Finance", "CHOLAFIN": "Finance",
    "SHRIRAMFIN": "Finance", "MFSL": "Finance", "SBICARD": "Finance",
    "LICHSGFIN": "Finance", "MUTHOOTFIN": "Finance", "MANAPPURAM": "Finance",
    "SUNPHARMA": "Pharma", "DRREDDY": "Pharma", "CIPLA": "Pharma",
    "DIVISLAB": "Pharma", "LUPIN": "Pharma", "AUROPHARMA": "Pharma",
    "BIOCON": "Pharma", "GLENMARK": "Pharma", "ALKEM": "Pharma",
    "ZYDUSLIFE": "Pharma", "NATCOPHARM": "Pharma",
    "TATASTEEL": "Metals", "JSWSTEEL": "Metals", "HINDALCO": "Metals",
    "VEDL": "Metals", "SAIL": "Metals", "NMDC": "Metals",
    "NATIONALUM": "Metals", "JINDALSTEL": "Metals",
    "TITAN": "Consumer", "NESTLEIND": "Consumer", "ASIANPAINT": "Consumer",
    "ITC": "Consumer", "HINDUNILVR": "Consumer", "BRITANNIA": "Consumer",
    "DABUR": "Consumer", "MARICO": "Consumer", "COLPAL": "Consumer",
    "PIDILITIND": "Consumer", "TRENT": "Consumer", "DMART": "Consumer",
    "MARUTI": "Auto", "BAJAJ-AUTO": "Auto", "M&M": "Auto",
    "EICHERMOT": "Auto", "HEROMOTOCO": "Auto",
    "LT": "Capital Goods", "ABB": "Capital Goods", "SIEMENS": "Capital Goods",
    "HAL": "Defence", "BEL": "Defence",
    "DLF": "Real Estate", "GODREJPROP": "Real Estate", "PRESTIGE": "Real Estate",
    "OBEROIRLTY": "Real Estate", "SOBHA": "Real Estate",
    "APOLLOHOSP": "Healthcare", "MAXHEALTH": "Healthcare", "MEDANTA": "Healthcare",
    "STARHEALTH": "Healthcare",
    "ADANIENT": "Infrastructure", "ADANIPORTS": "Infrastructure",
    "ULTRACEMCO": "Cement", "GRASIM": "Cement", "SHREECEM": "Cement",
    "AMBUJACEM": "Cement", "ACC": "Cement", "DALBHARAT": "Cement",
}


class QuantAIEngine:
    """ML-powered stock picker for swing investing (separate from SwingMax signals)."""

    def __init__(self, supabase_client=None):
        self.supabase = supabase_client
        self._model = None
        self._feature_names: list = []
        self._forward_days: int = 10
        self._model_loaded = False
        self._load_model()

    def _load_model(self):
        """Load pre-trained LightGBM ranker model."""
        try:
            import lightgbm as lgb

            if not os.path.exists(MODEL_PATH):
                logger.warning(
                    "QuantAI model not found at %s. Run `python scripts/train_quantai.py` first.",
                    MODEL_PATH,
                )
                return

            self._model = lgb.Booster(model_file=MODEL_PATH)

            # Load feature metadata
            if os.path.exists(META_PATH):
                with open(META_PATH) as f:
                    meta = json.load(f)
                self._feature_names = meta.get("feature_names", [])
                self._forward_days = meta.get("forward_days", 10)

            self._model_loaded = True
            logger.info(
                "QuantAI model loaded (%d features, forward=%d days)",
                len(self._feature_names),
                self._forward_days,
            )

        except ImportError:
            logger.warning("lightgbm not installed — QuantAI engine unavailable")
        except Exception as e:
            logger.error("Failed to load QuantAI model: %s", e)

    @property
    def is_ready(self) -> bool:
        return self._model_loaded and self._model is not None

    # ------------------------------------------------------------------
    # Symbol loading
    # ------------------------------------------------------------------

    def _load_symbols(self) -> list[str]:
        """Load stock universe for scoring."""
        if os.path.exists(SYMBOLS_PATH):
            with open(SYMBOLS_PATH) as f:
                data = json.load(f)
            return data["symbols"]

        if os.path.exists(UNIVERSE_PATH):
            with open(UNIVERSE_PATH) as f:
                return [line.strip() for line in f if line.strip()]

        # Top-100 fallback
        return [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "BHARTIARTL",
            "SBIN", "KOTAKBANK", "LT", "AXISBANK", "TATASTEEL", "JSWSTEEL",
            "HINDALCO", "ABB", "SIEMENS", "HAL", "BEL", "TRENT", "POLYCAB",
            "PERSISTENT", "COFORGE", "MUTHOOTFIN", "MARUTI", "BAJFINANCE",
            "SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "APOLLOHOSP",
            "TITAN", "NESTLEIND", "ASIANPAINT", "ULTRACEMCO", "GRASIM",
            "ADANIENT", "WIPRO", "TECHM", "HCLTECH", "POWERGRID", "NTPC",
            "ITC", "HINDUNILVR", "BRITANNIA", "PIDILITIND", "HAVELLS",
            "EICHERMOT", "BAJAJ-AUTO", "M&M", "INDUSINDBK", "DLF",
            "CHOLAFIN", "SHRIRAMFIN", "RECLTD", "PFC", "IRFC",
            "LUPIN", "AUROPHARMA", "ALKEM", "JUBLFOOD", "TATACONSUM",
            "NAUKRI", "DMART", "LTIM", "MPHASIS", "KPITTECH",
            "SHREECEM", "AMBUJACEM", "SAIL", "NMDC", "JINDALSTEL",
            "INDIGO", "BHEL", "GAIL", "NHPC", "CDSL", "ANGELONE",
        ]

    # ------------------------------------------------------------------
    # Data download
    # ------------------------------------------------------------------

    def _download_batch(self, tickers: list[str]) -> dict[str, pd.DataFrame]:
        """Download recent OHLCV for a batch of tickers via Kite Connect."""
        from .market_data import get_market_data_provider
        provider = get_market_data_provider()._get_kite_provider()

        # Strip .NS suffix if present
        clean_tickers = [t.replace(".NS", "") for t in tickers]
        batch_data = provider.fetch_historical_batch(clean_tickers, period="6mo")

        results = {}
        for symbol, df in batch_data.items():
            try:
                if df is None or df.empty or len(df) < MIN_BARS:
                    continue
                df.columns = [c.lower() for c in df.columns]
                df = df.dropna(subset=["close"])
                if len(df) < MIN_BARS:
                    continue
                if "volume" in df.columns and df["volume"].mean() < MIN_AVG_VOL:
                    continue
                # Return with .NS suffix key for compatibility
                results[f"{symbol}.NS"] = df
            except Exception:
                continue
        return results

    def _download_nifty(self) -> Optional[pd.Series]:
        """Download Nifty 50 close for RS calculation via Kite Connect."""
        from .market_data import get_market_data_provider
        provider = get_market_data_provider()._get_kite_provider()

        try:
            nifty = provider.get_historical_index("NIFTY", period="6mo")
            if nifty is not None and not nifty.empty:
                nifty.columns = [c.lower() for c in nifty.columns]
                return nifty["close"]
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------
    # Feature computation
    # ------------------------------------------------------------------

    def _compute_stock_features(
        self, df: pd.DataFrame, nifty_close: Optional[pd.Series] = None
    ) -> Optional[np.ndarray]:
        """Compute features for a single stock's latest bar and return as array."""
        try:
            featured = compute_features(df, benchmark_close=nifty_close)

            # Add custom features (same as training)
            high_52w = featured["close"].rolling(252, min_periods=50).max()
            low_52w = featured["close"].rolling(252, min_periods=50).min()
            range_52w = high_52w - low_52w
            featured["pos_52w"] = ((featured["close"] - low_52w) / range_52w.replace(0, np.nan)).fillna(0.5)
            featured["momentum_20d"] = featured["close"].pct_change(20).fillna(0)

            if nifty_close is not None:
                stock_ret_20 = featured["close"].pct_change(20)
                nifty_aligned = nifty_close.reindex(featured.index, method="ffill")
                nifty_ret_20 = nifty_aligned.pct_change(20)
                featured["sector_rs"] = (stock_ret_20 - nifty_ret_20).fillna(0)
            else:
                featured["sector_rs"] = featured["close"].pct_change(20).fillna(0)

            # Get latest row
            last = featured.iloc[-1]

            # Build feature vector in training order
            if self._feature_names:
                values = []
                for col in self._feature_names:
                    val = last.get(col, 0)
                    if pd.isna(val) or np.isinf(val):
                        val = 0
                    values.append(float(val))
                return np.array(values)
            else:
                # Fallback: use all numeric features
                exclude = {"open", "high", "low", "close", "volume"}
                vals = []
                for col in featured.columns:
                    if col not in exclude and featured[col].dtype in [np.float64, np.int64, np.float32]:
                        val = float(last[col])
                        vals.append(0.0 if (pd.isna(val) or np.isinf(val)) else val)
                return np.array(vals) if vals else None

        except Exception as e:
            logger.debug("Feature computation failed: %s", e)
            return None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def generate_daily_picks(self, top_n: int = 15) -> list[dict]:
        """
        Score all stocks and return top N picks.

        Returns list of dicts matching SwingCandidate frontend type:
        {symbol, sector, price, change_percent, entry_min, entry_max,
         target, stop_loss, confidence_score, ai_insight}
        """
        if not self.is_ready:
            logger.warning("QuantAI model not loaded, returning empty picks")
            return []

        symbols = self._load_symbols()
        # Filter known delisted
        symbols = [s for s in symbols if s != "TATAMOTORS"]
        yf_symbols = [f"{s}.NS" for s in symbols]

        logger.info("QuantAI: scoring %d stocks...", len(symbols))

        # Download Nifty benchmark
        nifty_close = self._download_nifty()

        # Download stock data in batches
        all_dfs: dict[str, pd.DataFrame] = {}
        for i in range(0, len(yf_symbols), BATCH_SIZE):
            batch = yf_symbols[i : i + BATCH_SIZE]
            result = self._download_batch(batch)
            for ticker, df in result.items():
                clean = ticker.replace(".NS", "")
                all_dfs[clean] = df

        logger.info("QuantAI: downloaded %d stocks, computing features...", len(all_dfs))

        # Score each stock
        scored: list[dict] = []
        for sym, df in all_dfs.items():
            features = self._compute_stock_features(df, nifty_close)
            if features is None:
                continue

            try:
                pred_return = float(self._model.predict(features.reshape(1, -1))[0])
            except Exception as e:
                logger.debug("Prediction failed for %s: %s", sym, e)
                continue

            last_close = float(df["close"].iloc[-1])
            prev_close = float(df["close"].iloc[-2]) if len(df) > 1 else last_close
            change_pct = ((last_close - prev_close) / prev_close) * 100 if prev_close else 0

            # Compute ATR for stop loss
            try:
                atr_14 = float(df["high"].rolling(14).max().iloc[-1] - df["low"].rolling(14).min().iloc[-1]) / 14
            except Exception:
                atr_14 = last_close * 0.02

            entry_min = round(last_close * 0.98, 2)
            entry_max = round(last_close * 1.02, 2)
            target = round(last_close * (1 + max(pred_return, 0.02)), 2)  # At least 2% target
            stop_loss = round(last_close * 0.95, 2)  # 5% stop loss

            # Confidence: normalize predicted return to 0-100 scale
            # pred_return typically ranges -0.10 to +0.15
            raw_conf = (pred_return + 0.05) / 0.20  # Maps -5% to 0, +15% to 1
            confidence = int(max(10, min(95, raw_conf * 100)))

            # AI insight text
            insight_parts = []
            if pred_return > 0.05:
                insight_parts.append("Strong upside predicted")
            elif pred_return > 0.02:
                insight_parts.append("Moderate upside expected")
            else:
                insight_parts.append("Mild upside potential")

            # 52-week position
            high_52 = float(df["close"].rolling(252, min_periods=50).max().iloc[-1])
            low_52 = float(df["close"].rolling(252, min_periods=50).min().iloc[-1])
            pos_52 = (last_close - low_52) / (high_52 - low_52) if high_52 != low_52 else 0.5
            if pos_52 > 0.8:
                insight_parts.append("near 52W high")
            elif pos_52 < 0.3:
                insight_parts.append("near 52W low — potential reversal")

            sector = SECTOR_MAP.get(sym, "Other")

            scored.append({
                "symbol": sym,
                "sector": sector,
                "price": round(last_close, 2),
                "change_percent": round(change_pct, 2),
                "entry_min": entry_min,
                "entry_max": entry_max,
                "target": target,
                "stop_loss": stop_loss,
                "confidence_score": confidence,
                "ai_insight": ". ".join(insight_parts),
                "_pred_return": pred_return,  # Internal, stripped before response
            })

        # Rank by predicted return, return top N
        scored.sort(key=lambda x: x["_pred_return"], reverse=True)
        picks = scored[:top_n]

        # Strip internal fields
        for p in picks:
            p.pop("_pred_return", None)

        logger.info("QuantAI: generated %d picks (from %d scored)", len(picks), len(scored))
        return picks

    async def save_picks_to_db(self, picks: list[dict]):
        """Save daily picks to Supabase quantai_picks table."""
        if not self.supabase or not picks:
            return

        today = date.today().isoformat()
        rows = []
        for i, pick in enumerate(picks):
            rows.append({
                "date": today,
                "rank": i + 1,
                "symbol": pick["symbol"],
                "sector": pick.get("sector", ""),
                "price": pick["price"],
                "change_percent": pick.get("change_percent", 0),
                "entry_min": pick["entry_min"],
                "entry_max": pick["entry_max"],
                "target": pick["target"],
                "stop_loss": pick["stop_loss"],
                "confidence_score": pick["confidence_score"],
                "ai_insight": pick.get("ai_insight", ""),
            })

        try:
            # Delete old picks for today (upsert by date+rank)
            self.supabase.table("quantai_picks").delete().eq("date", today).execute()
            self.supabase.table("quantai_picks").insert(rows).execute()
            logger.info("Saved %d QuantAI picks to DB for %s", len(rows), today)
        except Exception as e:
            logger.error("Failed to save QuantAI picks to DB: %s", e)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
_engine: Optional[QuantAIEngine] = None


def get_quantai_engine(supabase_client=None) -> QuantAIEngine:
    """Get or create the singleton QuantAIEngine."""
    global _engine
    if _engine is None:
        _engine = QuantAIEngine(supabase_client=supabase_client)
    return _engine
