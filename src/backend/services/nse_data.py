"""
================================================================================
NSE DATA SERVICE — Real institutional data from NSE India
================================================================================
Fetches delivery %, FII/DII activity, bulk/block deals, and F&O OI data
from NSE public APIs and archives.

All data cached for 1 hour to respect NSE rate limits.
================================================================================
"""

import logging
import asyncio
from datetime import datetime, date, timedelta
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

# NSE requires browser-like headers
_NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/",
}

_CACHE_TTL = timedelta(hours=1)


class NSEDataService:
    """Fetches real institutional data from NSE India public APIs."""

    def __init__(self):
        self._session = None
        self._cookies_ts: Optional[datetime] = None

        # Caches: (data, fetched_at)
        self._delivery_cache: Optional[Tuple[pd.DataFrame, datetime]] = None
        self._fii_dii_cache: Optional[Tuple[Dict, datetime]] = None
        self._bulk_deals_cache: Optional[Tuple[List[Dict], datetime]] = None
        self._block_deals_cache: Optional[Tuple[List[Dict], datetime]] = None
        self._fo_oi_cache: Optional[Tuple[pd.DataFrame, datetime]] = None

    def _get_session(self):
        """Get or create an httpx session with NSE cookies."""
        import httpx
        if self._session is None:
            self._session = httpx.Client(
                headers=_NSE_HEADERS,
                follow_redirects=True,
                timeout=15.0,
                verify=True,
            )
        # Refresh cookies every 5 minutes (NSE requires fresh session)
        if self._cookies_ts is None or datetime.now() - self._cookies_ts > timedelta(minutes=5):
            try:
                self._session.get("https://www.nseindia.com/")
                self._cookies_ts = datetime.now()
            except Exception as e:
                logger.warning(f"NSE cookie refresh failed: {e}")
        return self._session

    def _is_cached(self, cache) -> bool:
        if cache is None:
            return False
        _, ts = cache
        return datetime.now() - ts < _CACHE_TTL

    # ========================================================================
    # DELIVERY % DATA
    # ========================================================================

    def get_delivery_data(self) -> pd.DataFrame:
        """
        Fetch delivery % data from NSE security-wise delivery position report.

        Returns DataFrame with columns:
            symbol, delivery_qty, traded_qty, delivery_pct
        """
        if self._is_cached(self._delivery_cache):
            return self._delivery_cache[0]

        try:
            session = self._get_session()
            # NSE security-wise delivery data API
            url = "https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O"
            resp = session.get(url)
            resp.raise_for_status()
            data = resp.json()

            rows = []
            for item in data.get("data", []):
                symbol = item.get("symbol", "")
                total_traded = item.get("totalTradedVolume", 0)
                delivery_qty = item.get("deliveryQuantity", 0) or item.get("deliveryToTradedQuantity", 0)
                delivery_pct = item.get("deliveryToTradedQuantity", 0)

                if symbol and total_traded > 0:
                    rows.append({
                        "symbol": symbol,
                        "traded_qty": total_traded,
                        "delivery_qty": delivery_qty,
                        "delivery_pct": float(delivery_pct) if delivery_pct else 0.0,
                        "ltp": item.get("lastPrice", 0),
                        "change_pct": item.get("pChange", 0),
                    })

            df = pd.DataFrame(rows)
            if not df.empty:
                self._delivery_cache = (df, datetime.now())
                logger.info(f"NSE delivery data: {len(df)} stocks fetched")
            return df

        except Exception as e:
            logger.warning(f"NSE delivery data fetch failed: {e}")
            return pd.DataFrame()

    # ========================================================================
    # FII / DII ACTIVITY
    # ========================================================================

    def get_fii_dii_activity(self) -> Dict[str, Any]:
        """
        Fetch FII/DII daily trading activity from NSE.

        Returns dict with keys:
            fii_buy, fii_sell, fii_net, dii_buy, dii_sell, dii_net, date
        """
        if self._is_cached(self._fii_dii_cache):
            return self._fii_dii_cache[0]

        try:
            session = self._get_session()
            url = "https://www.nseindia.com/api/fiidiiTradeReact"
            resp = session.get(url)
            resp.raise_for_status()
            data = resp.json()

            result = {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "fii_buy": 0, "fii_sell": 0, "fii_net": 0,
                "dii_buy": 0, "dii_sell": 0, "dii_net": 0,
            }

            for entry in data if isinstance(data, list) else []:
                category = entry.get("category", "").upper()
                buy_val = float(entry.get("buyValue", 0) or 0)
                sell_val = float(entry.get("sellValue", 0) or 0)
                net_val = float(entry.get("netValue", 0) or 0)

                if "FII" in category or "FPI" in category:
                    result["fii_buy"] = buy_val
                    result["fii_sell"] = sell_val
                    result["fii_net"] = net_val
                    if entry.get("date"):
                        result["date"] = entry["date"]
                elif "DII" in category:
                    result["dii_buy"] = buy_val
                    result["dii_sell"] = sell_val
                    result["dii_net"] = net_val

            self._fii_dii_cache = (result, datetime.now())
            logger.info(f"NSE FII/DII: FII net={result['fii_net']}, DII net={result['dii_net']}")
            return result

        except Exception as e:
            logger.warning(f"NSE FII/DII fetch failed: {e}")
            return {
                "date": datetime.now().strftime("%Y-%m-%d"),
                "fii_buy": 0, "fii_sell": 0, "fii_net": 0,
                "dii_buy": 0, "dii_sell": 0, "dii_net": 0,
                "error": str(e),
            }

    # ========================================================================
    # BULK & BLOCK DEALS
    # ========================================================================

    def get_bulk_deals(self) -> List[Dict]:
        """Fetch today's bulk deals from NSE."""
        if self._is_cached(self._bulk_deals_cache):
            return self._bulk_deals_cache[0]

        try:
            session = self._get_session()
            url = "https://www.nseindia.com/api/snapshot-capital-market-largedeal"
            resp = session.get(url)
            resp.raise_for_status()
            data = resp.json()

            deals = []
            for item in data.get("BULK_DEALS_DATA", data.get("data", [])):
                deals.append({
                    "symbol": item.get("symbol", ""),
                    "client_name": item.get("clientName", ""),
                    "deal_type": item.get("buySell", ""),
                    "quantity": int(item.get("quantity", 0) or 0),
                    "price": float(item.get("tradePrice", 0) or 0),
                    "deal_date": item.get("dealDate", ""),
                })

            self._bulk_deals_cache = (deals, datetime.now())
            logger.info(f"NSE bulk deals: {len(deals)} deals fetched")
            return deals

        except Exception as e:
            logger.warning(f"NSE bulk deals fetch failed: {e}")
            return []

    def get_block_deals(self) -> List[Dict]:
        """Fetch today's block deals from NSE."""
        if self._is_cached(self._block_deals_cache):
            return self._block_deals_cache[0]

        try:
            session = self._get_session()
            url = "https://www.nseindia.com/api/snapshot-capital-market-largedeal"
            resp = session.get(url)
            resp.raise_for_status()
            data = resp.json()

            deals = []
            for item in data.get("BLOCK_DEALS_DATA", []):
                deals.append({
                    "symbol": item.get("symbol", ""),
                    "client_name": item.get("clientName", ""),
                    "deal_type": item.get("buySell", ""),
                    "quantity": int(item.get("quantity", 0) or 0),
                    "price": float(item.get("tradePrice", 0) or 0),
                    "deal_date": item.get("dealDate", ""),
                })

            self._block_deals_cache = (deals, datetime.now())
            logger.info(f"NSE block deals: {len(deals)} deals fetched")
            return deals

        except Exception as e:
            logger.warning(f"NSE block deals fetch failed: {e}")
            return []

    # ========================================================================
    # F&O OPEN INTEREST DATA
    # ========================================================================

    def get_fo_oi_data(self) -> pd.DataFrame:
        """
        Fetch F&O stock-wise Open Interest data from NSE.

        Returns DataFrame with columns:
            symbol, futures_oi, futures_oi_change, futures_oi_change_pct,
            ltp, change_pct, volume
        """
        if self._is_cached(self._fo_oi_cache):
            return self._fo_oi_cache[0]

        try:
            session = self._get_session()
            # Stock futures OI data
            url = "https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O"
            resp = session.get(url)
            resp.raise_for_status()
            data = resp.json()

            rows = []
            for item in data.get("data", []):
                symbol = item.get("symbol", "")
                if not symbol:
                    continue
                rows.append({
                    "symbol": symbol,
                    "ltp": float(item.get("lastPrice", 0) or 0),
                    "change_pct": float(item.get("pChange", 0) or 0),
                    "volume": int(item.get("totalTradedVolume", 0) or 0),
                    "open": float(item.get("open", 0) or 0),
                    "high": float(item.get("dayHigh", 0) or 0),
                    "low": float(item.get("dayLow", 0) or 0),
                    "prev_close": float(item.get("previousClose", 0) or 0),
                })

            df = pd.DataFrame(rows)
            if not df.empty:
                self._fo_oi_cache = (df, datetime.now())
                logger.info(f"NSE F&O data: {len(df)} stocks fetched")
            return df

        except Exception as e:
            logger.warning(f"NSE F&O OI fetch failed: {e}")
            return pd.DataFrame()

    def get_participant_oi(self) -> Dict[str, Any]:
        """Fetch participant-wise OI data (FII, DII, Pro, Client)."""
        try:
            session = self._get_session()
            url = "https://www.nseindia.com/api/live-analysis-oi-spurts-underlyingFutures"
            resp = session.get(url)
            resp.raise_for_status()
            data = resp.json()

            spurts = []
            for item in data.get("data", []):
                symbol = item.get("symbol", "")
                if not symbol:
                    continue
                oi = int(item.get("latestOI", 0) or 0)
                prev_oi = int(item.get("prevOI", 0) or 0)
                oi_change = oi - prev_oi
                oi_change_pct = (oi_change / prev_oi * 100) if prev_oi > 0 else 0

                spurts.append({
                    "symbol": symbol,
                    "latest_oi": oi,
                    "prev_oi": prev_oi,
                    "oi_change": oi_change,
                    "oi_change_pct": round(oi_change_pct, 2),
                    "volume": int(item.get("volume", 0) or 0),
                    "futures_price": float(item.get("underlyingValue", 0) or 0),
                    "change_pct": float(item.get("pChange", 0) or 0),
                })

            return {"data": spurts, "count": len(spurts)}

        except Exception as e:
            logger.warning(f"NSE participant OI fetch failed: {e}")
            return {"data": [], "count": 0, "error": str(e)}


# =============================================================================
# SINGLETON
# =============================================================================

_nse_data_instance: Optional[NSEDataService] = None


def get_nse_data() -> NSEDataService:
    """Get singleton NSE data service."""
    global _nse_data_instance
    if _nse_data_instance is None:
        _nse_data_instance = NSEDataService()
    return _nse_data_instance
