"""
Market snapshot builder for assistant grounding.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, Dict, List

import httpx

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
        output: List[Dict[str, Any]] = []
        async with httpx.AsyncClient(timeout=8.0) as client:
            for label, yf_symbol in self._global_proxy_symbols().items():
                try:
                    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{yf_symbol}?range=2d&interval=1d"
                    resp = await client.get(url, headers={"User-Agent": "Mozilla/5.0"})
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    result = data["chart"]["result"][0]
                    closes = result["indicators"]["quote"][0]["close"]
                    closes = [c for c in closes if c is not None]
                    if len(closes) < 2:
                        continue
                    latest = closes[-1]
                    prev = closes[-2]
                    change_pct = ((latest - prev) / prev) * 100 if prev else 0.0
                    output.append({
                        "symbol": label,
                        "price": round(latest, 2),
                        "change_percent": round(change_pct, 2),
                    })
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
