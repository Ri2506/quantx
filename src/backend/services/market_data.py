"""
================================================================================
SWINGAI - MARKET DATA SERVICE (yfinance based)
================================================================================
Pluggable market data provider using yfinance for free data access.
Supports:
- Real-time quotes (15-20 min delayed for free tier)
- Historical OHLCV data
- Index data (Nifty, Bank Nifty, VIX)
- Batch price fetching
================================================================================
"""

import os
import json
import logging
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import asyncio
from functools import lru_cache

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False
    yf = None

import pandas as pd
from ..core.config import settings

logger = logging.getLogger(__name__)

# ============================================================================
# CONSTANTS
# ============================================================================

# NSE Index symbols for yfinance
INDEX_SYMBOLS = {
    'NIFTY': '^NSEI',
    'BANKNIFTY': '^NSEBANK', 
    'VIX': '^INDIAVIX',
    'NIFTYIT': '^CNXIT',
    'NIFTYFIN': 'NIFTYFIN.NS',
}

# NSE Holiday list fallback (2025)
NSE_HOLIDAYS_FALLBACK = [
    date(2025, 1, 26),   # Republic Day
    date(2025, 2, 26),   # Mahashivratri
    date(2025, 3, 14),   # Holi
    date(2025, 3, 31),   # Eid-Ul-Fitr
    date(2025, 4, 10),   # Ram Navami
    date(2025, 4, 14),   # Dr Ambedkar Jayanti / Good Friday
    date(2025, 4, 18),   # Good Friday
    date(2025, 5, 1),    # Maharashtra Day
    date(2025, 5, 12),   # Buddha Purnima
    date(2025, 6, 7),    # Bakri Eid
    date(2025, 7, 6),    # Moharram
    date(2025, 8, 15),   # Independence Day
    date(2025, 8, 16),   # Parsi New Year
    date(2025, 8, 27),   # Ganesh Chaturthi
    date(2025, 10, 2),   # Gandhi Jayanti / Dussehra
    date(2025, 10, 21),  # Diwali (Laxmi Puja)
    date(2025, 10, 22),  # Diwali Balipratipada
    date(2025, 11, 5),   # Guru Nanak Jayanti
    date(2025, 12, 25),  # Christmas
]

def _load_holidays_from_file(path: str) -> List[date]:
    """Load NSE holidays from JSON file."""
    try:
        if not path or not os.path.exists(path):
            return []
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, dict):
            items = data.get("holidays", [])
        else:
            items = data
        return [date.fromisoformat(d) for d in items if isinstance(d, str)]
    except Exception as e:
        logger.warning(f"Failed to load holidays from {path}: {e}")
        return []


@dataclass
class Quote:
    """Real-time quote data"""
    symbol: str
    ltp: float  # Last traded price
    open: float
    high: float
    low: float
    close: float  # Previous close
    volume: int
    change: float
    change_percent: float
    timestamp: datetime
    bid: Optional[float] = None
    ask: Optional[float] = None


@dataclass
class MarketStatus:
    """Market status information"""
    is_trading_day: bool
    is_market_open: bool
    market_phase: str  # PRE_OPEN, OPEN, CLOSED, HOLIDAY
    next_open: Optional[datetime] = None
    reason: str = ""


class MarketDataProvider:
    """
    Market data provider using yfinance.
    
    Features:
    - Quote fetching (single and batch)
    - Historical data
    - Index data
    - Trading day/holiday checks
    - Caching for performance
    """
    
    def __init__(self):
        if not YFINANCE_AVAILABLE:
            logger.warning("yfinance not installed. Market data will use fallback values.")
        
        self._quote_cache: Dict[str, Tuple[Quote, datetime]] = {}
        self._cache_ttl = 60  # Cache TTL in seconds
        self._holidays: List[date] = _load_holidays_from_file(settings.NSE_HOLIDAYS_FILE) or NSE_HOLIDAYS_FALLBACK
        
        logger.info("MarketDataProvider initialized with yfinance backend")
    
    # ========================================================================
    # TRADING DAY / HOLIDAY CHECKS
    # ========================================================================
    
    def is_trading_day(self, check_date: Optional[date] = None) -> bool:
        """
        Check if given date is a trading day.
        
        Args:
            check_date: Date to check (defaults to today)
            
        Returns:
            True if trading day, False otherwise
        """
        check_date = check_date or date.today()
        
        # Weekend check
        if check_date.weekday() >= 5:  # Saturday = 5, Sunday = 6
            return False
        
        # Holiday check (loaded from config file if available)
        if check_date in self._holidays:
            return False
        
        return True
    
    def is_market_open(self) -> bool:
        """
        Check if market is currently open.
        
        Returns:
            True if market is open, False otherwise
        """
        now = datetime.now()
        today = now.date()
        
        # Check if trading day
        if not self.is_trading_day(today):
            return False
        
        # Market hours: 9:15 AM to 3:30 PM IST
        market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
        market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)
        
        return market_open <= now <= market_close
    
    def get_market_status(self) -> MarketStatus:
        """
        Get detailed market status.
        
        Returns:
            MarketStatus object with current market state
        """
        now = datetime.now()
        today = now.date()
        
        # Check for holiday
        if today in self._holidays:
            return MarketStatus(
                is_trading_day=False,
                is_market_open=False,
                market_phase="HOLIDAY",
                next_open=self._get_next_trading_day_open(),
                reason="NSE Holiday"
            )
        
        # Check for weekend
        if today.weekday() >= 5:
            return MarketStatus(
                is_trading_day=False,
                is_market_open=False,
                market_phase="CLOSED",
                next_open=self._get_next_trading_day_open(),
                reason="Weekend"
            )
        
        # Trading day - check time
        current_time = now.time()
        pre_open_start = datetime.strptime("09:00", "%H:%M").time()
        market_open = datetime.strptime("09:15", "%H:%M").time()
        market_close = datetime.strptime("15:30", "%H:%M").time()
        
        if current_time < pre_open_start:
            return MarketStatus(
                is_trading_day=True,
                is_market_open=False,
                market_phase="PRE_MARKET",
                next_open=now.replace(hour=9, minute=15, second=0),
                reason="Market opens at 9:15 AM"
            )
        elif current_time < market_open:
            return MarketStatus(
                is_trading_day=True,
                is_market_open=False,
                market_phase="PRE_OPEN",
                next_open=now.replace(hour=9, minute=15, second=0),
                reason="Pre-open session"
            )
        elif current_time <= market_close:
            return MarketStatus(
                is_trading_day=True,
                is_market_open=True,
                market_phase="OPEN",
                reason="Market is open"
            )
        else:
            return MarketStatus(
                is_trading_day=True,
                is_market_open=False,
                market_phase="CLOSED",
                next_open=self._get_next_trading_day_open(),
                reason="Market closed for the day"
            )
    
    def _get_next_trading_day_open(self) -> datetime:
        """Get datetime of next market open"""
        check_date = date.today() + timedelta(days=1)
        
        while not self.is_trading_day(check_date):
            check_date += timedelta(days=1)
        
        return datetime.combine(check_date, datetime.strptime("09:15", "%H:%M").time())
    
    # ========================================================================
    # QUOTE FETCHING
    # ========================================================================
    
    def _to_yf_symbol(self, symbol: str) -> str:
        """
        Convert symbol to yfinance format.
        NSE stocks need .NS suffix, BSE needs .BO suffix.
        """
        # Check if it's an index
        if symbol.upper() in INDEX_SYMBOLS:
            return INDEX_SYMBOLS[symbol.upper()]
        
        # Already has suffix
        if symbol.endswith('.NS') or symbol.endswith('.BO'):
            return symbol
        
        # Default to NSE
        return f"{symbol}.NS"
    
    def get_quote(self, symbol: str) -> Optional[Quote]:
        """
        Get real-time quote for a symbol.
        
        Args:
            symbol: Stock symbol (e.g., 'RELIANCE' or 'RELIANCE.NS')
            
        Returns:
            Quote object or None if failed
        """
        # Check cache first
        cache_key = symbol.upper()
        if cache_key in self._quote_cache:
            cached_quote, cache_time = self._quote_cache[cache_key]
            if (datetime.now() - cache_time).seconds < self._cache_ttl:
                return cached_quote
        
        if not YFINANCE_AVAILABLE:
            return self._get_fallback_quote(symbol)
        
        try:
            yf_symbol = self._to_yf_symbol(symbol)
            ticker = yf.Ticker(yf_symbol)
            
            # Get fast info
            info = ticker.fast_info
            
            # Get today's data for OHLCV
            hist = ticker.history(period='2d')
            
            if hist.empty:
                logger.warning(f"No data for {symbol}")
                return self._get_fallback_quote(symbol)
            
            latest = hist.iloc[-1]
            prev_close = hist.iloc[-2]['Close'] if len(hist) > 1 else latest['Close']
            
            quote = Quote(
                symbol=symbol,
                ltp=float(latest['Close']),
                open=float(latest['Open']),
                high=float(latest['High']),
                low=float(latest['Low']),
                close=float(prev_close),
                volume=int(latest['Volume']),
                change=float(latest['Close'] - prev_close),
                change_percent=float((latest['Close'] - prev_close) / prev_close * 100) if prev_close > 0 else 0,
                timestamp=datetime.now()
            )
            
            # Cache the quote
            self._quote_cache[cache_key] = (quote, datetime.now())
            
            return quote
            
        except Exception as e:
            logger.error(f"Error fetching quote for {symbol}: {e}")
            return self._get_fallback_quote(symbol)
    
    def get_quotes_batch(self, symbols: List[str]) -> Dict[str, Quote]:
        """
        Get quotes for multiple symbols efficiently.
        
        Args:
            symbols: List of stock symbols
            
        Returns:
            Dict mapping symbol to Quote
        """
        results = {}
        
        if not YFINANCE_AVAILABLE:
            for symbol in symbols:
                results[symbol] = self._get_fallback_quote(symbol)
            return results
        
        try:
            # Convert symbols
            yf_symbols = [self._to_yf_symbol(s) for s in symbols]
            symbol_map = dict(zip(yf_symbols, symbols))
            
            # Use yfinance download for batch
            data = yf.download(yf_symbols, period='2d', progress=False, threads=True)
            
            if data.empty:
                for symbol in symbols:
                    results[symbol] = self._get_fallback_quote(symbol)
                return results
            
            for yf_sym, orig_sym in symbol_map.items():
                try:
                    if len(yf_symbols) == 1:
                        sym_data = data
                    else:
                        # Multi-level columns for multiple symbols
                        sym_data = data.xs(yf_sym, axis=1, level=1) if yf_sym in data.columns.get_level_values(1) else None
                    
                    if sym_data is None or sym_data.empty:
                        results[orig_sym] = self._get_fallback_quote(orig_sym)
                        continue
                    
                    latest = sym_data.iloc[-1]
                    prev_close = sym_data.iloc[-2]['Close'] if len(sym_data) > 1 else latest['Close']
                    
                    results[orig_sym] = Quote(
                        symbol=orig_sym,
                        ltp=float(latest['Close']),
                        open=float(latest['Open']),
                        high=float(latest['High']),
                        low=float(latest['Low']),
                        close=float(prev_close),
                        volume=int(latest['Volume']),
                        change=float(latest['Close'] - prev_close),
                        change_percent=float((latest['Close'] - prev_close) / prev_close * 100) if prev_close > 0 else 0,
                        timestamp=datetime.now()
                    )
                except Exception as e:
                    logger.warning(f"Error processing {orig_sym}: {e}")
                    results[orig_sym] = self._get_fallback_quote(orig_sym)
            
            return results
            
        except Exception as e:
            logger.error(f"Batch quote error: {e}")
            for symbol in symbols:
                results[symbol] = self._get_fallback_quote(symbol)
            return results
    
    def _get_fallback_quote(self, symbol: str) -> Quote:
        """Generate fallback quote when data unavailable"""
        import random
        base_price = random.uniform(100, 3000)
        change = random.uniform(-50, 50)
        
        return Quote(
            symbol=symbol,
            ltp=base_price,
            open=base_price - change * 0.5,
            high=base_price + abs(change),
            low=base_price - abs(change),
            close=base_price - change,
            volume=random.randint(100000, 5000000),
            change=change,
            change_percent=(change / (base_price - change)) * 100 if base_price != change else 0,
            timestamp=datetime.now()
        )
    
    # ========================================================================
    # HISTORICAL DATA
    # ========================================================================
    
    def get_historical(self, symbol: str, period: str = '6mo', interval: str = '1d') -> Optional[pd.DataFrame]:
        """
        Get historical OHLCV data.
        
        Args:
            symbol: Stock symbol
            period: Data period (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max)
            interval: Data interval (1m, 5m, 15m, 30m, 1h, 1d, 1wk, 1mo)
            
        Returns:
            DataFrame with OHLCV data
        """
        if not YFINANCE_AVAILABLE:
            return self._get_fallback_historical(period, interval)
        
        try:
            yf_symbol = self._to_yf_symbol(symbol)
            ticker = yf.Ticker(yf_symbol)
            data = ticker.history(period=period, interval=interval)
            
            if data.empty:
                return self._get_fallback_historical(period, interval)
            
            # Standardize column names
            data.columns = [c.lower() for c in data.columns]
            return data
            
        except Exception as e:
            logger.error(f"Error fetching historical data for {symbol}: {e}")
            return self._get_fallback_historical(period, interval)
    
    def _get_fallback_historical(self, period: str, interval: str) -> pd.DataFrame:
        """Generate fallback historical data"""
        import numpy as np
        
        # Determine number of rows based on period/interval
        rows = 100
        
        base_price = 1500
        prices = [base_price]
        
        for _ in range(rows - 1):
            change = np.random.randn() * 20
            prices.append(prices[-1] + change)
        
        dates = pd.date_range(end=datetime.now(), periods=rows, freq='D')
        
        return pd.DataFrame({
            'open': [p - np.random.rand() * 10 for p in prices],
            'high': [p + np.random.rand() * 20 for p in prices],
            'low': [p - np.random.rand() * 20 for p in prices],
            'close': prices,
            'volume': np.random.randint(100000, 5000000, rows)
        }, index=dates)
    
    # ========================================================================
    # INDEX DATA
    # ========================================================================
    
    def get_index_data(self, index_name: str = 'NIFTY') -> Optional[Quote]:
        """
        Get index data (Nifty, Bank Nifty, VIX).
        
        Args:
            index_name: Index name (NIFTY, BANKNIFTY, VIX)
            
        Returns:
            Quote for the index
        """
        return self.get_quote(index_name)
    
    def get_market_overview(self) -> Dict:
        """
        Get overall market data including indices and sentiment.
        
        Returns:
            Dict with market overview data
        """
        nifty = self.get_quote('NIFTY')
        banknifty = self.get_quote('BANKNIFTY')
        vix = self.get_quote('VIX')
        
        return {
            'nifty': {
                'ltp': nifty.ltp if nifty else 0,
                'change': nifty.change if nifty else 0,
                'change_percent': nifty.change_percent if nifty else 0,
            },
            'banknifty': {
                'ltp': banknifty.ltp if banknifty else 0,
                'change': banknifty.change if banknifty else 0,
                'change_percent': banknifty.change_percent if banknifty else 0,
            },
            'vix': {
                'ltp': vix.ltp if vix else 15,
                'change': vix.change if vix else 0,
                'change_percent': vix.change_percent if vix else 0,
            },
            'market_status': self.get_market_status().__dict__,
            'timestamp': datetime.now().isoformat(),
        }
    
    # ========================================================================
    # ASYNC WRAPPERS (for async code compatibility)
    # ========================================================================
    
    async def get_quote_async(self, symbol: str) -> Optional[Quote]:
        """Async wrapper for get_quote"""
        return await asyncio.to_thread(self.get_quote, symbol)
    
    async def get_quotes_batch_async(self, symbols: List[str]) -> Dict[str, Quote]:
        """Async wrapper for get_quotes_batch"""
        return await asyncio.to_thread(self.get_quotes_batch, symbols)
    
    async def get_historical_async(self, symbol: str, period: str = '6mo', interval: str = '1d') -> Optional[pd.DataFrame]:
        """Async wrapper for get_historical"""
        return await asyncio.to_thread(self.get_historical, symbol, period, interval)
    
    async def get_market_overview_async(self) -> Dict:
        """Async wrapper for get_market_overview"""
        return await asyncio.to_thread(self.get_market_overview)


# Singleton instance
_market_data_provider: Optional[MarketDataProvider] = None

def get_market_data_provider() -> MarketDataProvider:
    """Get or create singleton market data provider.

    Returns TrueDataMarketDataProvider when DATA_PROVIDER=truedata,
    otherwise the default yfinance-based MarketDataProvider.
    """
    global _market_data_provider
    if _market_data_provider is None:
        if settings.DATA_PROVIDER.lower() == "truedata":
            from .data_provider import TrueDataMarketDataProvider
            _market_data_provider = TrueDataMarketDataProvider()
        else:
            _market_data_provider = MarketDataProvider()
    return _market_data_provider


# ============================================================================
# USAGE EXAMPLE
# ============================================================================

if __name__ == "__main__":
    provider = MarketDataProvider()
    
    # Check market status
    status = provider.get_market_status()
    print(f"\nMarket Status: {status.market_phase}")
    print(f"Is Open: {status.is_market_open}")
    print(f"Is Trading Day: {status.is_trading_day}")
    
    # Get quote
    quote = provider.get_quote('RELIANCE')
    if quote:
        print(f"\nRELIANCE Quote:")
        print(f"  LTP: ₹{quote.ltp:.2f}")
        print(f"  Change: {quote.change:.2f} ({quote.change_percent:.2f}%)")
    
    # Get market overview
    overview = provider.get_market_overview()
    print(f"\nNifty: {overview['nifty']['ltp']:.2f} ({overview['nifty']['change_percent']:.2f}%)")
    print(f"VIX: {overview['vix']['ltp']:.2f}")
