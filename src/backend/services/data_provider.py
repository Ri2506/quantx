"""
TrueData Market Data Provider.
Extends MarketDataProvider to use TrueData real-time + REST for live quotes
and historical data, while inheriting holiday/timing logic from the base.

Activated when DATA_PROVIDER=truedata in environment.
"""

import logging
from typing import Dict, List, Optional
from datetime import datetime

import pandas as pd

from . import truedata_client
from .market_data import MarketDataProvider, Quote

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _strip_suffix(symbol: str) -> str:
    """Remove .NS / .BO / .NFO suffixes."""
    for suffix in (".NS", ".BO", ".NFO"):
        if symbol.endswith(suffix):
            return symbol[: -len(suffix)]
    return symbol


# TrueData index symbol mapping
_INDEX_MAP = {
    "NIFTY": "NIFTY 50",
    "^NSEI": "NIFTY 50",
    "BANKNIFTY": "NIFTY BANK",
    "^NSEBANK": "NIFTY BANK",
    "VIX": "INDIA VIX",
    "^INDIAVIX": "INDIA VIX",
    "NIFTYIT": "NIFTY IT",
    "^CNXIT": "NIFTY IT",
    "NIFTYFIN": "NIFTY FIN SERVICE",
}

# yfinance period/interval → TrueData bar_size/duration
_BAR_SIZE_MAP = {
    "1m": "1 min", "2m": "2 mins", "5m": "5 mins",
    "15m": "15 mins", "30m": "30 mins",
    "60m": "60 mins", "1h": "60 mins",
    "1d": "eod", "1wk": "week", "1mo": "month",
}
_DURATION_MAP = {
    "1d": "1 D", "5d": "5 D", "1w": "7 D",
    "1mo": "30 D", "1m": "30 D",
    "3mo": "90 D", "3m": "90 D",
    "6mo": "180 D", "6m": "180 D",
    "1y": "365 D", "2y": "730 D",
    "5y": "1825 D", "max": "3650 D",
}


def _resolve_td_symbol(symbol: str) -> str:
    """Resolve a symbol to its TrueData equivalent."""
    clean = _strip_suffix(symbol)
    return _INDEX_MAP.get(clean, clean)


def _tick_to_quote(symbol: str, data: dict) -> Quote:
    """Convert a TrueData tick dict to a Quote dataclass."""
    return Quote(
        symbol=symbol,
        ltp=data.get("price", data.get("ltp", 0.0)),
        open=data.get("open", 0.0),
        high=data.get("high", 0.0),
        low=data.get("low", 0.0),
        close=0.0,  # previous close not available from tick
        volume=data.get("volume", 0),
        change=data.get("change", 0.0),
        change_percent=data.get("change_percent", data.get("change_percentage", 0.0)),
        timestamp=datetime.now(),
    )


def _normalize_ohlcv_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure DataFrame has standard open/high/low/close/volume columns."""
    df.columns = [c.lower() for c in df.columns]
    rename = {}
    if "o" in df.columns and "open" not in df.columns:
        rename["o"] = "open"
    if "h" in df.columns and "high" not in df.columns:
        rename["h"] = "high"
    if "l" in df.columns and "low" not in df.columns:
        rename["l"] = "low"
    if "c" in df.columns and "close" not in df.columns:
        rename["c"] = "close"
    if "v" in df.columns and "volume" not in df.columns:
        rename["v"] = "volume"
    if rename:
        df = df.rename(columns=rename)
    return df


# ---------------------------------------------------------------------------
# TrueData-aware MarketDataProvider
# ---------------------------------------------------------------------------

class TrueDataMarketDataProvider(MarketDataProvider):
    """
    Extends the base MarketDataProvider (which has yfinance + holiday/timing logic)
    and overrides data-fetching methods to use TrueData when available.
    Falls back to yfinance (parent class) on failure.
    """

    def __init__(self):
        super().__init__()
        logger.info("TrueDataMarketDataProvider initialized (TrueData primary, yfinance fallback)")

    # ========================================================================
    # SINGLE QUOTE
    # ========================================================================

    def get_quote(self, symbol: str) -> Optional[Quote]:
        td_symbol = _resolve_td_symbol(symbol)

        # 1. Check live tick cache
        cached = truedata_client.get_cached_price(td_symbol)
        if cached:
            return _tick_to_quote(td_symbol, cached)

        # 2. Subscribe for future ticks
        truedata_client.subscribe_symbols([td_symbol])

        # 3. Try historical REST fallback for initial quote
        td_h = truedata_client.get_td_hist()
        if td_h:
            try:
                data = td_h.get_n_historical_bars(td_symbol, no_of_bars=2, bar_size="eod")
                df = truedata_client._to_dataframe(data)
                if df is not None and len(df) >= 1:
                    df = _normalize_ohlcv_columns(df)
                    row = df.iloc[-1]
                    prev_close = float(df.iloc[-2]["close"]) if len(df) >= 2 else float(row.get("close", 0))
                    ltp = float(row.get("close", 0))
                    change = ltp - prev_close if prev_close else 0
                    return Quote(
                        symbol=td_symbol,
                        ltp=ltp,
                        open=float(row.get("open", 0)),
                        high=float(row.get("high", 0)),
                        low=float(row.get("low", 0)),
                        close=prev_close,
                        volume=int(row.get("volume", 0)),
                        change=round(change, 2),
                        change_percent=round((change / prev_close * 100) if prev_close else 0, 2),
                        timestamp=datetime.now(),
                    )
            except Exception as e:
                logger.warning(f"TrueData quote fallback failed for {td_symbol}: {e}")

        # 4. Fall back to yfinance (parent)
        return super().get_quote(symbol)

    # ========================================================================
    # BATCH QUOTES
    # ========================================================================

    def get_quotes_batch(self, symbols: List[str]) -> Dict[str, Quote]:
        td_symbols = [_resolve_td_symbol(s) for s in symbols]
        truedata_client.subscribe_symbols(td_symbols)

        results: Dict[str, Quote] = {}
        missing = []

        for sym in td_symbols:
            cached = truedata_client.get_cached_price(sym)
            if cached:
                results[sym] = _tick_to_quote(sym, cached)
            else:
                missing.append(sym)

        # For missing symbols, try individual quotes (which have REST fallback)
        for sym in missing:
            q = self.get_quote(sym)
            if q:
                results[sym] = q

        return results

    # ========================================================================
    # HISTORICAL DATA
    # ========================================================================

    def get_historical(self, symbol: str, period: str = '6mo',
                       interval: str = '1d') -> Optional[pd.DataFrame]:
        td_symbol = _resolve_td_symbol(symbol)
        bar_size = _BAR_SIZE_MAP.get(interval, "eod")
        duration = _DURATION_MAP.get(period, "180 D")

        df = truedata_client.get_historical(td_symbol, bar_size=bar_size, duration=duration)
        if df is not None and not df.empty:
            return _normalize_ohlcv_columns(df)

        # Fallback to yfinance
        return super().get_historical(symbol, period, interval)

    # ========================================================================
    # INDEX DATA
    # ========================================================================

    def get_index_data(self, symbol: str) -> Optional[Dict]:
        """Get index quote as a dict (used by get_market_overview)."""
        td_symbol = _INDEX_MAP.get(symbol, _INDEX_MAP.get(symbol.upper(), None))
        if not td_symbol:
            # Try direct lookup
            td_symbol = _resolve_td_symbol(symbol)

        truedata_client.subscribe_symbols([td_symbol])
        cached = truedata_client.get_cached_price(td_symbol)
        if cached:
            return {
                "ltp": cached["price"],
                "change": cached["change"],
                "change_percent": cached["change_percent"],
                "open": cached["open"],
                "high": cached["high"],
                "low": cached["low"],
                "volume": cached.get("volume", 0),
            }

        # REST fallback
        td_h = truedata_client.get_td_hist()
        if td_h:
            try:
                data = td_h.get_n_historical_bars(td_symbol, no_of_bars=2, bar_size="eod")
                df = truedata_client._to_dataframe(data)
                if df is not None and len(df) >= 2:
                    df = _normalize_ohlcv_columns(df)
                    curr = float(df.iloc[-1]["close"])
                    prev = float(df.iloc[-2]["close"])
                    change = curr - prev
                    return {
                        "ltp": round(curr, 2),
                        "change": round(change, 2),
                        "change_percent": round((change / prev * 100) if prev else 0, 2),
                        "open": round(float(df.iloc[-1].get("open", 0)), 2),
                        "high": round(float(df.iloc[-1]["high"]), 2),
                        "low": round(float(df.iloc[-1]["low"]), 2),
                        "volume": int(df.iloc[-1].get("volume", 0)),
                    }
            except Exception as e:
                logger.warning(f"TrueData index fallback failed for {td_symbol}: {e}")

        return None

    # ========================================================================
    # MARKET OVERVIEW (overrides yfinance-based version)
    # ========================================================================

    def get_market_overview(self) -> Dict:
        nifty = self.get_index_data("NIFTY") or {}
        banknifty = self.get_index_data("BANKNIFTY") or {}
        vix = self.get_index_data("VIX") or {}

        return {
            "nifty": {
                "ltp": nifty.get("ltp", 0),
                "change": nifty.get("change", 0),
                "change_percent": nifty.get("change_percent", 0),
            },
            "banknifty": {
                "ltp": banknifty.get("ltp", 0),
                "change": banknifty.get("change", 0),
                "change_percent": banknifty.get("change_percent", 0),
            },
            "vix": {
                "ltp": vix.get("ltp", 0),
                "change": vix.get("change", 0),
                "change_percent": vix.get("change_percent", 0),
            },
            "market_status": self.get_market_status(),
        }

    # ========================================================================
    # GAINERS / LOSERS (TrueData-specific)
    # ========================================================================

    def get_gainers(self, segment: str = "NSEEQ", topn: int = 10) -> List[dict]:
        result = truedata_client.get_gainers(segment=segment, topn=topn)
        if isinstance(result, pd.DataFrame) and not result.empty:
            return result.to_dict("records")
        if isinstance(result, list):
            return result
        return []

    def get_losers(self, segment: str = "NSEEQ", topn: int = 10) -> List[dict]:
        result = truedata_client.get_losers(segment=segment, topn=topn)
        if isinstance(result, pd.DataFrame) and not result.empty:
            return result.to_dict("records")
        if isinstance(result, list):
            return result
        return []

    def get_bhavcopy(self, segment: str = "EQ"):
        return truedata_client.get_bhavcopy(segment=segment)
