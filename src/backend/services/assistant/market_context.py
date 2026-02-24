"""
Market snapshot builder for assistant grounding.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List

try:
    import yfinance as yf
except Exception:  # pragma: no cover - optional dependency path
    yf = None

from ..market_data import get_market_data_provider


class MarketContextBuilder:
    """
    Builds a compact India + global market snapshot.
    """

    async def _fetch_india_indices(self) -> List[Dict[str, Any]]:
        provider = get_market_data_provider()
        symbols = ["NIFTY", "BANKNIFTY", "VIX"]
        quotes = await provider.get_quotes_batch_async(symbols)
        payload: List[Dict[str, Any]] = []
        for symbol in symbols:
            quote = quotes.get(symbol)
            if not quote:
                continue
            payload.append(
                {
                    "symbol": symbol,
                    "price": round(float(quote.ltp), 2),
                    "change_percent": round(float(quote.change_percent), 2),
                }
            )
        return payload

    @staticmethod
    def _global_proxy_symbols() -> Dict[str, str]:
        return {
            "S&P500": "^GSPC",
            "NASDAQ": "^IXIC",
            "DOW": "^DJI",
            "GOLD": "GC=F",
            "CRUDE": "CL=F",
        }

    async def _fetch_global_proxies(self) -> List[Dict[str, Any]]:
        if yf is None:
            return []
        return await asyncio.to_thread(self._fetch_global_proxies_sync)

    def _fetch_global_proxies_sync(self) -> List[Dict[str, Any]]:
        output: List[Dict[str, Any]] = []
        for label, ticker_symbol in self._global_proxy_symbols().items():
            try:
                ticker = yf.Ticker(ticker_symbol)
                hist = ticker.history(period="2d")
                if hist.empty:
                    continue
                latest = hist.iloc[-1]
                prev_close = hist.iloc[-2]["Close"] if len(hist) > 1 else latest["Close"]
                change_percent = ((float(latest["Close"]) - float(prev_close)) / float(prev_close)) * 100 if prev_close else 0.0
                output.append(
                    {
                        "symbol": label,
                        "price": round(float(latest["Close"]), 2),
                        "change_percent": round(change_percent, 2),
                    }
                )
            except Exception:
                continue
        return output

    async def build(self) -> Dict[str, Any]:
        provider = get_market_data_provider()
        status = provider.get_market_status()
        india, global_proxies = await asyncio.gather(
            self._fetch_india_indices(),
            self._fetch_global_proxies(),
        )
        return {
            "market_status": {
                "phase": status.market_phase,
                "is_open": status.is_market_open,
                "is_trading_day": status.is_trading_day,
                "reason": status.reason,
            },
            "india_indices": india,
            "global_proxies": global_proxies,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
