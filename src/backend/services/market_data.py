"""
================================================================================
QUANT X - MARKET DATA SERVICE (Kite Connect + jugaad-data)
================================================================================
Pluggable market data provider using admin Kite Connect for real-time OHLCV
and jugaad-data as secondary source when Kite token is expired.
Supports:
- Real-time quotes via Kite Connect
- Historical OHLCV data (Kite primary, jugaad-data secondary)
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

import pandas as pd
from ..core.config import settings

logger = logging.getLogger(__name__)

# ============================================================================
# CONSTANTS
# ============================================================================

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
    Market data provider backed by admin Kite Connect + jugaad-data.

    Delegates all OHLCV fetching to KiteDataProvider which handles:
    - Real-time quotes via kite.quote()
    - Historical data via kite.historical_data() (primary) / jugaad-data (secondary)
    - Index data via Kite instrument tokens
    - Rate limiting and caching
    """

    def __init__(self):
        self._holidays: List[date] = _load_holidays_from_file(settings.NSE_HOLIDAYS_FILE) or NSE_HOLIDAYS_FALLBACK
        # Lazy import to avoid circular dependency
        self._kite_provider = None
        logger.info("MarketDataProvider initialized (Kite + jugaad-data backend)")

    def _get_kite_provider(self):
        """Lazy-load data provider based on DATA_PROVIDER setting."""
        if self._kite_provider is None:
            if settings.DATA_PROVIDER == "kite":
                from .kite_data_provider import get_kite_data_provider
                self._kite_provider = get_kite_data_provider()
            else:
                from .yfinance_provider import get_yfinance_provider
                self._kite_provider = get_yfinance_provider()
        return self._kite_provider

    # ========================================================================
    # TRADING DAY / HOLIDAY CHECKS
    # ========================================================================

    def is_trading_day(self, check_date: Optional[date] = None) -> bool:
        """Check if given date is a trading day."""
        check_date = check_date or date.today()

        # Weekend check
        if check_date.weekday() >= 5:
            return False

        # Holiday check
        if check_date in self._holidays:
            return False

        return True

    def is_market_open(self) -> bool:
        """Check if market is currently open."""
        from zoneinfo import ZoneInfo
        ist = ZoneInfo("Asia/Kolkata")
        now = datetime.now(ist)
        today = now.date()

        if not self.is_trading_day(today):
            return False

        market_open = now.replace(hour=9, minute=15, second=0, microsecond=0)
        market_close = now.replace(hour=15, minute=30, second=0, microsecond=0)

        return market_open <= now <= market_close

    def get_market_status(self) -> MarketStatus:
        """Get detailed market status."""
        now = datetime.now()
        today = now.date()

        if today in self._holidays:
            return MarketStatus(
                is_trading_day=False,
                is_market_open=False,
                market_phase="HOLIDAY",
                next_open=self._get_next_trading_day_open(),
                reason="NSE Holiday"
            )

        if today.weekday() >= 5:
            return MarketStatus(
                is_trading_day=False,
                is_market_open=False,
                market_phase="CLOSED",
                next_open=self._get_next_trading_day_open(),
                reason="Weekend"
            )

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
        """Get datetime of next market open."""
        check_date = date.today() + timedelta(days=1)
        while not self.is_trading_day(check_date):
            check_date += timedelta(days=1)
        return datetime.combine(check_date, datetime.strptime("09:15", "%H:%M").time())

    # ========================================================================
    # QUOTE FETCHING — delegates to KiteDataProvider
    # ========================================================================

    def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get real-time quote for a symbol."""
        result = self._get_kite_provider().get_quote(symbol)
        if result is None:
            return None
        if isinstance(result, Quote):
            return result
        # Wrap dict → Quote dataclass
        try:
            return Quote(
                symbol=result.get("symbol", symbol),
                ltp=float(result.get("ltp", 0)),
                open=float(result.get("open", 0)),
                high=float(result.get("high", 0)),
                low=float(result.get("low", 0)),
                close=float(result.get("close", 0)),
                volume=int(result.get("volume", 0)),
                change=float(result.get("change", 0)),
                change_percent=float(result.get("change_percent", 0)),
                timestamp=datetime.now(),
            )
        except Exception:
            return None

    def get_quotes_batch(self, symbols: List[str]) -> Dict[str, Quote]:
        """Get quotes for multiple symbols (single batch call)."""
        raw = self._get_kite_provider().get_quotes_batch(symbols)
        result = {}
        for sym, data in raw.items():
            if data is None:
                continue
            if isinstance(data, Quote):
                result[sym] = data
            elif isinstance(data, dict):
                try:
                    result[sym] = Quote(
                        symbol=data.get("symbol", sym),
                        ltp=float(data.get("ltp", 0)),
                        open=float(data.get("open", 0)),
                        high=float(data.get("high", 0)),
                        low=float(data.get("low", 0)),
                        close=float(data.get("close", 0)),
                        volume=int(data.get("volume", 0)),
                        change=float(data.get("change", 0)),
                        change_percent=float(data.get("change_percent", 0)),
                        timestamp=datetime.now(),
                    )
                except Exception:
                    continue
        return result

    # ========================================================================
    # HISTORICAL DATA — delegates to KiteDataProvider
    # ========================================================================

    def get_historical(self, symbol: str, period: str = '6mo', interval: str = '1d') -> Optional[pd.DataFrame]:
        """Get historical OHLCV data via Kite Connect (primary) / jugaad-data (secondary)."""
        return self._get_kite_provider().get_historical(symbol, period, interval)

    # ========================================================================
    # INDEX DATA
    # ========================================================================

    def get_index_data(self, index_name: str = 'NIFTY') -> Optional[Quote]:
        """Get index data (Nifty, Bank Nifty, VIX)."""
        return self.get_quote(index_name)

    def get_market_overview(self) -> Dict:
        """Get overall market data including indices and sentiment."""
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

    # ========================================================================
    # OPTIONS CHAIN DATA — delegates to KiteDataProvider
    # ========================================================================

    def get_option_chain(self, symbol: str, expiry: str = "") -> List[Dict]:
        """
        Get live options chain via admin Kite Connect (primary).
        Falls back to FOTradingEngine Black-Scholes synthetic chain.

        Data flow: KiteDataProvider.get_option_chain()
          → InstrumentTokenCache.get_nfo_options() for NFO instruments
          → kite.quote() in batches of 200 for live LTP/OI/depth
          → Newton-Raphson IV + Black-Scholes Greeks computed per contract
        """
        try:
            from datetime import date as date_cls
            expiry_date = None
            if expiry:
                try:
                    expiry_date = datetime.strptime(expiry, "%Y-%m-%d").date()
                except ValueError:
                    expiry_date = None

            provider = self._get_kite_provider()
            chain = provider.get_option_chain(symbol, expiry_date)
            if chain:
                return chain
        except Exception as e:
            logger.warning(f"Kite option chain failed for {symbol}: {e}")

        # Fallback: synthetic chain via Black-Scholes
        return self._synthetic_option_chain(symbol)

    def _synthetic_option_chain(self, symbol: str) -> List[Dict]:
        """Generate synthetic chain via FOTradingEngine Black-Scholes when live data unavailable."""
        try:
            from .fo_trading_engine import FOTradingEngine, InstrumentType
            fo = FOTradingEngine()
            expiries = fo.get_expiry_dates(symbol, InstrumentType.OPTIONS)
            if not expiries:
                return []

            spot_quote = self.get_quote(symbol)
            spot_price = spot_quote.ltp if spot_quote else 0
            if spot_price <= 0:
                # Fallback spot prices for indices
                defaults = {"NIFTY": 24000, "BANKNIFTY": 51000, "FINNIFTY": 23000}
                spot_price = defaults.get(symbol, 0)
            if spot_price <= 0:
                return []

            # Get VIX for realistic base IV
            base_iv = 0.15  # default
            try:
                vix_quote = self.get_quote("VIX")
                if vix_quote and vix_quote.ltp > 0:
                    base_iv = vix_quote.ltp / 100  # VIX 26 → 0.26
            except Exception:
                pass

            contracts = fo.get_option_chain(symbol, expiries[0], spot_price, base_iv=base_iv)
            return [
                {
                    'strike': c.strike,
                    'option_type': c.option_type.value,  # 'CE' or 'PE'
                    'expiry': str(c.expiry),
                    'ltp': c.ltp,
                    'bid': c.bid,
                    'ask': c.ask,
                    'oi': c.oi,
                    'oi_change': c.oi_change,
                    'volume': c.volume,
                    'iv': c.iv,
                    'delta': c.delta,
                    'gamma': c.gamma,
                    'theta': c.theta,
                    'vega': c.vega,
                    'lot_size': c.lot_size,
                }
                for c in contracts
            ]
        except Exception as e:
            logger.error(f"Synthetic chain failed for {symbol}: {e}")
            return []

    async def get_option_chain_async(self, symbol: str, expiry: str = "") -> List[Dict]:
        """Async wrapper for get_option_chain."""
        return await asyncio.to_thread(self.get_option_chain, symbol, expiry)


# Singleton instance
_market_data_provider: Optional[MarketDataProvider] = None

def get_market_data_provider() -> MarketDataProvider:
    """Get or create singleton market data provider (Kite + jugaad-data)."""
    global _market_data_provider
    if _market_data_provider is None:
        _market_data_provider = MarketDataProvider()
    return _market_data_provider
