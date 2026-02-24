"""
TrueData Velocity Connection Manager (Singleton).
Uses the `truedata` v7.x SDK (TD_live for streaming, TD_hist for REST history).

Initializes once on server startup, provides shared instances
for real-time streaming and historical data across all backend modules.

Usage:
    from ..services import truedata_client
    truedata_client.initialize()
    truedata_client.subscribe_symbols(['RELIANCE', 'TCS'])
    price = truedata_client.get_cached_price('RELIANCE')
    hist = truedata_client.get_historical('RELIANCE', bar_size='eod', duration='365 D')
    truedata_client.shutdown()
"""

import ssl
import logging
from typing import Optional, Dict, Set, Callable, List
from datetime import datetime
from threading import Lock

import pandas as pd

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# TLS Compatibility Patch
# ---------------------------------------------------------------------------
# TrueData servers (auth.truedata.in, history.truedata.in) don't properly
# handle TLSv1.3 ClientHello from Python 3.13+/OpenSSL 3.x — the handshake
# hangs. Forcing TLSv1.2 as the maximum protocol version resolves this.
# push.truedata.in:8084 (WebSocket) works fine with TLSv1.3.
_tls_patched = False


def _patch_tls_for_truedata():
    """Patch urllib3's SSL context factory to cap at TLSv1.2."""
    global _tls_patched
    if _tls_patched:
        return
    try:
        import urllib3.connection as _uc
        _orig_create = _uc.create_urllib3_context

        def _tls12_create(*args, **kwargs):
            kwargs["ssl_maximum_version"] = ssl.TLSVersion.TLSv1_2
            return _orig_create(*args, **kwargs)

        _uc.create_urllib3_context = _tls12_create
        _tls_patched = True
        logger.info("Patched urllib3 SSL -> TLSv1.2 max (TrueData compatibility)")
    except Exception as e:
        logger.warning(f"TLS patch failed (non-fatal): {e}")


# ---------------------------------------------------------------------------
# Module-level state (singleton)
# ---------------------------------------------------------------------------
_td_live = None          # TD_live instance (WebSocket streaming)
_td_hist = None          # TD_hist instance (REST historical)
_instance_lock = Lock()
_is_connected = False
_hist_connected = False
_live_prices: Dict[str, dict] = {}        # symbol -> latest tick data
_subscribed_symbols: Set[str] = set()
_price_callbacks: List[Callable] = []      # external listeners (e.g. WebSocket)


# ---------------------------------------------------------------------------
# Credentials (reads from centralized config)
# ---------------------------------------------------------------------------
def _get_credentials() -> tuple:
    from ..core.config import settings
    username = settings.TRUEDATA_USERNAME
    password = settings.TRUEDATA_PASSWORD
    if not username or not password:
        raise ValueError("TRUEDATA_USERNAME and TRUEDATA_PASSWORD must be set")
    return username, password


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------
def initialize(timeout: int = 30) -> bool:
    """Initialize TrueData connections. Call once on app startup.

    Creates both TD_hist (REST, fast) and TD_live (WebSocket) instances.
    Runs in a background thread with *timeout* seconds so the server
    is never blocked if TrueData is unreachable.
    """
    global _td_live, _td_hist, _is_connected, _hist_connected

    # Apply TLS patch before any TrueData network calls
    _patch_tls_for_truedata()

    with _instance_lock:
        if _td_live is not None or _td_hist is not None:
            return True

    def _connect():
        global _td_live, _td_hist, _is_connected, _hist_connected
        username, password = _get_credentials()

        # --- Historical (REST) — fast, non-blocking ---
        try:
            from truedata import TD_hist
            td_h = TD_hist(username, password, log_level=logging.WARNING)
            with _instance_lock:
                _td_hist = td_h
                _hist_connected = td_h.historical_datasource.access_token is not None
            if _hist_connected:
                logger.info("TrueData Historical (REST) connected")
            else:
                logger.warning("TrueData Historical auth failed — check credentials")
        except Exception as e:
            logger.error(f"TrueData Historical init failed: {e}")

        # --- Live (WebSocket) — may block while connecting ---
        try:
            from truedata import TD_live
            from ..core.config import settings
            td_l = TD_live(username, password, live_port=settings.TRUEDATA_LIVE_PORT, log_level=logging.WARNING)

            # Register the global trade (tick) callback
            @td_l.trade_callback
            def _on_trade(tick_data):
                _handle_tick(tick_data)

            with _instance_lock:
                _td_live = td_l
                _is_connected = True
            logger.info("TrueData Live (WebSocket) connected")
        except Exception as e:
            logger.error(f"TrueData Live init failed: {e}")
            with _instance_lock:
                _is_connected = False

    import threading
    t = threading.Thread(target=_connect, daemon=True)
    t.start()
    t.join(timeout=timeout)

    if t.is_alive():
        logger.warning(
            f"TrueData connection timed out after {timeout}s — "
            "server continues without live feed"
        )
        return False

    return _is_connected or _hist_connected


def shutdown():
    """Graceful shutdown. Call on app shutdown event."""
    global _td_live, _td_hist, _is_connected, _hist_connected

    with _instance_lock:
        if _td_live:
            try:
                _td_live.disconnect()
            except Exception:
                pass
            _td_live = None
            _is_connected = False
        _td_hist = None
        _hist_connected = False
        _live_prices.clear()
        _subscribed_symbols.clear()
        logger.info("TrueData connections closed")


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------
def get_td():
    """Return the shared TD_live instance (or None)."""
    return _td_live


def get_td_hist():
    """Return the shared TD_hist instance (or None)."""
    return _td_hist


def is_connected() -> bool:
    return _is_connected


def is_hist_connected() -> bool:
    return _hist_connected


# ---------------------------------------------------------------------------
# Tick handling
# ---------------------------------------------------------------------------
def _handle_tick(tick_data):
    """
    Global tick handler — called by TrueData for every trade tick.
    Updates the in-memory price cache and notifies registered callbacks.
    """
    try:
        symbol = getattr(tick_data, "symbol", "")
        if not symbol:
            return

        data = {
            "symbol": symbol,
            "price": float(getattr(tick_data, "ltp", 0)),
            "ltp": float(getattr(tick_data, "ltp", 0)),
            "change": float(getattr(tick_data, "change", 0)),
            "change_percent": float(getattr(tick_data, "change_perc", 0)),
            "change_percentage": float(getattr(tick_data, "change_perc", 0)),
            "open": float(getattr(tick_data, "day_open", 0)),
            "high": float(getattr(tick_data, "day_high", 0)),
            "low": float(getattr(tick_data, "day_low", 0)),
            "volume": int(getattr(tick_data, "volume", 0)),
            "last_update": datetime.now().isoformat(),
        }
        _live_prices[symbol] = data

        # Notify external listeners
        for cb in _price_callbacks:
            try:
                cb(symbol, data)
            except Exception as e:
                logger.error(f"Price callback error: {e}")
    except Exception as e:
        logger.error(f"Tick handling error: {e}")


# ---------------------------------------------------------------------------
# Subscriptions
# ---------------------------------------------------------------------------
def subscribe_symbols(symbols: List[str]):
    """Subscribe to live streaming for the given symbols."""
    global _subscribed_symbols

    td = get_td()
    if not td:
        return

    new_symbols = [s for s in symbols if s not in _subscribed_symbols]
    if new_symbols:
        try:
            td.start_live_data(new_symbols)
            _subscribed_symbols.update(new_symbols)
            logger.info(f"Subscribed to {len(new_symbols)} symbols: {new_symbols[:5]}...")
        except Exception as e:
            logger.error(f"Subscribe error: {e}")


def unsubscribe_symbols(symbols: List[str]):
    """Unsubscribe from symbols."""
    global _subscribed_symbols

    td = get_td()
    if not td:
        return

    to_unsub = [s for s in symbols if s in _subscribed_symbols]
    if to_unsub:
        try:
            td.stop_live_data(to_unsub)
            _subscribed_symbols -= set(to_unsub)
        except Exception as e:
            logger.error(f"Unsubscribe error: {e}")


# ---------------------------------------------------------------------------
# Price cache
# ---------------------------------------------------------------------------
def get_cached_price(symbol: str) -> Optional[dict]:
    """Get the latest cached tick data for a symbol."""
    return _live_prices.get(symbol)


def get_all_cached_prices() -> Dict[str, dict]:
    """Get all cached prices."""
    return dict(_live_prices)


# ---------------------------------------------------------------------------
# External callback registration
# ---------------------------------------------------------------------------
def register_price_callback(callback: Callable):
    """
    Register a callback that fires on every tick.
    Signature: callback(symbol: str, data: dict)
    Used by WebSocket service to push real-time updates to clients.
    """
    _price_callbacks.append(callback)


# ---------------------------------------------------------------------------
# Historical data
# ---------------------------------------------------------------------------
def _to_dataframe(data) -> Optional[pd.DataFrame]:
    """Convert TrueData SDK result (list-of-dicts) to a pandas DataFrame."""
    if data is None:
        return None
    if isinstance(data, pd.DataFrame):
        return data if not data.empty else None
    if isinstance(data, list):
        if not data:
            return None
        df = pd.DataFrame(data)
        if "time" in df.columns:
            df = df.set_index("time")
        return df
    return None


def get_historical(symbol: str, bar_size: str = "eod",
                   duration: str = "365 D") -> Optional[pd.DataFrame]:
    """
    Fetch historical OHLCV data from TrueData.

    Args:
        symbol: Bare NSE symbol (e.g. 'RELIANCE', 'NIFTY 50')
        bar_size: '1 min', '5 mins', '15 mins', '30 mins', '60 mins', 'eod', 'week', 'month'
        duration: '5 D', '30 D', '90 D', '365 D', '730 D', etc.

    Returns:
        pandas DataFrame with OHLCV columns, or None on error.
    """
    td = get_td_hist()
    if not td:
        return None
    try:
        data = td.get_historic_data(symbol, bar_size=bar_size, duration=duration)
        return _to_dataframe(data)
    except Exception as e:
        logger.error(f"Historical data error for {symbol}: {e}")
        return None


def get_n_bars(symbol: str, n: int = 100, bar_size: str = "eod") -> Optional[pd.DataFrame]:
    """Fetch last N bars for a symbol."""
    td = get_td_hist()
    if not td:
        return None
    try:
        data = td.get_n_historical_bars(symbol, no_of_bars=n, bar_size=bar_size)
        return _to_dataframe(data)
    except Exception as e:
        logger.error(f"N-bars error for {symbol}: {e}")
        return None


# ---------------------------------------------------------------------------
# Market-wide data
# ---------------------------------------------------------------------------
def get_bhavcopy(segment: str = "EQ", date=None):
    """Get market-wide price snapshot (bhavcopy). segment: 'EQ', 'FO', 'MCX'"""
    td = get_td_hist()
    if not td:
        return None
    try:
        if date:
            return td.get_bhavcopy(segment, date=date)
        return td.get_bhavcopy(segment)
    except Exception as e:
        logger.error(f"Bhavcopy error: {e}")
        return None


def get_gainers(segment: str = "NSEEQ", topn: int = 10):
    """Get top gainers."""
    td = get_td_hist()
    if not td:
        return []
    try:
        result = td.get_gainers(segment=segment, topn=topn, df_style=True)
        return result
    except Exception as e:
        logger.error(f"Gainers error: {e}")
        return []


def get_losers(segment: str = "NSEEQ", topn: int = 10):
    """Get top losers."""
    td = get_td_hist()
    if not td:
        return []
    try:
        result = td.get_losers(segment=segment, topn=topn, df_style=True)
        return result
    except Exception as e:
        logger.error(f"Losers error: {e}")
        return []


# ---------------------------------------------------------------------------
# Health / Status
# ---------------------------------------------------------------------------
def get_connection_status() -> dict:
    return {
        "provider": "truedata",
        "live_connected": _is_connected,
        "hist_connected": _hist_connected,
        "subscribed_symbols": len(_subscribed_symbols),
        "cached_prices": len(_live_prices),
        "timestamp": datetime.now().isoformat(),
    }
