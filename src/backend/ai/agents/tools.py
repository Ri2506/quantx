"""
Tool registry — callables that agents can invoke to fetch real data from
the app database / market-data providers.

Registering a tool:

    @tool(name="get_portfolio", description="Returns the user's open paper + live positions")
    async def _get_portfolio(user_id: str) -> Dict[str, Any]:
        ...

Every tool:
- is async
- takes JSON-serializable kwargs
- returns a JSON-serializable dict
- never raises — catch + return ``{"error": "..."}``

The Copilot planner Agent reads ``tool_registry.schema()`` to know what's
available and builds a Gemini prompt instructing the model to emit
``{"tool": "...", "args": {...}}`` objects.
"""

from __future__ import annotations

import functools
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Awaitable, Callable, Dict, List, Optional

from .state import AgentState, ToolCall

logger = logging.getLogger(__name__)

ToolFn = Callable[..., Awaitable[Dict[str, Any]]]


@dataclass
class ToolSpec:
    name: str
    description: str
    params: Dict[str, str]  # param name → one-line description
    fn: ToolFn


@dataclass
class ToolRegistry:
    tools: Dict[str, ToolSpec] = field(default_factory=dict)

    def register(self, spec: ToolSpec) -> None:
        self.tools[spec.name] = spec

    def get(self, name: str) -> Optional[ToolSpec]:
        return self.tools.get(name)

    def schema(self) -> List[Dict[str, Any]]:
        """Return a Gemini-prompt-friendly JSON schema of available tools."""
        return [
            {
                "name": spec.name,
                "description": spec.description,
                "params": spec.params,
            }
            for spec in self.tools.values()
        ]

    async def call(
        self,
        state: AgentState,
        name: str,
        **args: Any,
    ) -> Dict[str, Any]:
        spec = self.get(name)
        started = datetime.utcnow()
        t0 = time.monotonic()
        if spec is None:
            call = ToolCall(
                name=name, args=args, result=None,
                started_at=started, duration_ms=0,
                error=f"unknown tool: {name}",
            )
            state.tool_trace.append(call)
            return {"error": f"unknown tool: {name}"}

        try:
            result = await spec.fn(**args)
            call = ToolCall(
                name=name, args=args, result=result,
                started_at=started,
                duration_ms=int((time.monotonic() - t0) * 1000),
            )
            state.tool_trace.append(call)
            return result
        except Exception as e:
            logger.warning("Tool %s failed: %s", name, e)
            call = ToolCall(
                name=name, args=args, result=None,
                started_at=started,
                duration_ms=int((time.monotonic() - t0) * 1000),
                error=str(e),
            )
            state.tool_trace.append(call)
            return {"error": str(e)}


# Module-level singleton.
tool_registry = ToolRegistry()


def tool(*, name: str, description: str, params: Optional[Dict[str, str]] = None):
    """Decorator — register an async function as a callable tool."""
    def wrap(fn: ToolFn) -> ToolFn:
        tool_registry.register(
            ToolSpec(
                name=name,
                description=description,
                params=params or {},
                fn=fn,
            )
        )

        @functools.wraps(fn)
        async def _wrapped(*a, **kw):
            return await fn(*a, **kw)

        return _wrapped

    return wrap


# ============================================================================
# BUILT-IN TOOLS — concrete data fetchers the 3 graphs need on day 1.
# ============================================================================
# These read from Supabase using the admin client so the agent sidesteps
# per-user RLS auth (the caller has already been authenticated at the API
# boundary — we pass user_id into each call).
# ============================================================================


def _client():
    from ...core.database import get_supabase_admin
    return get_supabase_admin()


@tool(
    name="get_portfolio",
    description="Return the user's open paper + live positions with current LTP, entry, PnL.",
    params={"user_id": "Supabase auth.users.id of the user"},
)
async def _get_portfolio(user_id: str) -> Dict[str, Any]:
    client = _client()
    live = client.table("positions").select(
        "symbol, quantity, entry_price, current_price, pnl, pnl_percent, product"
    ).eq("user_id", user_id).eq("status", "open").execute()
    paper = client.table("paper_positions").select(
        "symbol, qty, entry_price, entry_date, status, stop_loss, target"
    ).eq("user_id", user_id).eq("status", "open").execute()
    return {
        "live_positions": live.data or [],
        "paper_positions": paper.data or [],
    }


@tool(
    name="get_watchlist",
    description="Return the user's watched symbols.",
    params={"user_id": "Supabase auth.users.id of the user"},
)
async def _get_watchlist(user_id: str) -> Dict[str, Any]:
    client = _client()
    rows = client.table("watchlist").select("symbol, added_at").eq(
        "user_id", user_id
    ).execute()
    return {"watchlist": rows.data or []}


@tool(
    name="get_signal",
    description="Return full signal details (price levels, model scores, regime at signal) for one signal id.",
    params={"signal_id": "UUID of the signal"},
)
async def _get_signal(signal_id: str) -> Dict[str, Any]:
    client = _client()
    rows = client.table("signals").select("*").eq("id", signal_id).limit(1).execute()
    data = (rows.data or [None])[0]
    if data is None:
        return {"error": f"signal {signal_id} not found"}
    return {"signal": data}


@tool(
    name="get_todays_signals",
    description="Return today's active signals across all users (max 20). Useful for Copilot 'what should I look at today' queries.",
    params={"max_n": "Maximum signals to return (default 20)"},
)
async def _get_todays_signals(max_n: int = 20) -> Dict[str, Any]:
    client = _client()
    from datetime import date

    today = date.today().isoformat()
    rows = (
        client.table("signals")
        .select("symbol, direction, confidence, entry_price, target_1, stop_loss, regime_at_signal, strategy_names")
        .eq("date", today)
        .eq("status", "active")
        .order("confidence", desc=True)
        .limit(int(max_n))
        .execute()
    )
    return {"signals": rows.data or []}


@tool(
    name="get_stock_snapshot",
    description="Return recent OHLCV + indicator snapshot for a symbol (last 60 trading days).",
    params={"symbol": "NSE ticker, e.g. TCS or RELIANCE"},
)
async def _get_stock_snapshot(symbol: str) -> Dict[str, Any]:
    try:
        from ...services.market_data import get_market_data_provider
        provider = get_market_data_provider()
        df = provider.get_historical(symbol.upper(), period="3mo", interval="1d")
        if df is None or len(df) == 0:
            return {"error": f"no data for {symbol}"}
        df = df.tail(60).copy()
        df.columns = [c.lower() for c in df.columns]
        last = df.iloc[-1]
        first = df.iloc[0]
        pct_3m = ((last["close"] - first["close"]) / first["close"] * 100) if first["close"] else 0
        return {
            "symbol": symbol.upper(),
            "last_close": float(last["close"]),
            "last_volume": float(last.get("volume", 0) or 0),
            "high_3m": float(df["high"].max()),
            "low_3m": float(df["low"].min()),
            "pct_change_3m": round(float(pct_3m), 2),
            "bars": len(df),
        }
    except Exception as e:
        return {"error": str(e)}


@tool(
    name="get_current_regime",
    description="Return the current market regime (bull/sideways/bear) + probabilities + nifty_close + vix.",
    params={},
)
async def _get_current_regime() -> Dict[str, Any]:
    client = _client()
    rows = (
        client.table("regime_history")
        .select("regime, prob_bull, prob_sideways, prob_bear, vix, nifty_close, detected_at")
        .order("detected_at", desc=True)
        .limit(1)
        .execute()
    )
    row = (rows.data or [None])[0]
    if row is None:
        return {"regime": "bull", "prob_bull": 1.0, "source": "fallback"}
    return row
