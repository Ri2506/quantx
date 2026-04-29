"""
Paper Trading API Routes
Virtual trading with ₹10,00,000 starting balance.
Persists to Supabase with in-memory fallback.
"""

import uuid
import logging
from datetime import datetime
from typing import Dict, List, Optional
from dataclasses import dataclass, field, asdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Paper Trading"])

INITIAL_CASH = 10_00_000.0  # ₹10 Lakh

# ============================================================================
# IN-MEMORY STORE (fallback when Supabase tables don't exist)
# ============================================================================

@dataclass
class PaperUser:
    id: str
    email: str
    cash_balance: float = INITIAL_CASH
    holdings: Dict[str, dict] = field(default_factory=dict)  # symbol -> {qty, avg_price}

_users: Dict[str, PaperUser] = {}        # user_id -> PaperUser
_users_by_email: Dict[str, str] = {}     # email -> user_id
_orders: Dict[str, list] = {}            # user_id -> [order_dicts]

# ============================================================================
# REQUEST MODELS
# ============================================================================

class RegisterRequest(BaseModel):
    email: str

class OrderRequest(BaseModel):
    user_id: str
    symbol: str
    action: str  # BUY or SELL
    quantity: int
    order_type: str = "MARKET"

# ============================================================================
# HELPERS
# ============================================================================

def _get_or_create_user(email: str) -> PaperUser:
    if email in _users_by_email:
        return _users[_users_by_email[email]]
    uid = str(uuid.uuid4())
    user = PaperUser(id=uid, email=email)
    _users[uid] = user
    _users_by_email[email] = uid
    _orders[uid] = []
    return user


def _try_supabase():
    """Return supabase admin client or None."""
    try:
        from ..core.config import settings
        from supabase import create_client
        return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    except Exception:
        return None


async def _fetch_live_price(symbol: str) -> Optional[dict]:
    """Get live price via MarketDataService, return dict with price info or None."""
    try:
        from ..services.market_data import get_market_data_provider
        provider = get_market_data_provider()
        quote = await provider.get_quote_async(symbol)
        if quote:
            return {
                "symbol": symbol,
                "price": quote.ltp,
                "name": symbol,
                "change": quote.change,
                "change_percent": quote.change_percent,
            }
    except Exception as e:
        logger.warning(f"MarketDataService unavailable for {symbol}: {e}")

    # Fallback: try yfinance
    try:
        import yfinance as yf
        suffix = "" if "." in symbol else ".NS"
        ticker = yf.Ticker(f"{symbol}{suffix}")
        info = ticker.fast_info
        price = float(info.get("lastPrice", 0) or info.get("last_price", 0) or 0)
        prev = float(info.get("previousClose", 0) or info.get("previous_close", 0) or price)
        if price > 0:
            change = price - prev
            change_pct = (change / prev * 100) if prev else 0.0
            return {
                "symbol": symbol,
                "price": round(price, 2),
                "name": symbol,
                "change": round(change, 2),
                "change_percent": round(change_pct, 2),
            }
    except Exception as e:
        logger.warning(f"yfinance fallback failed for {symbol}: {e}")

    return None


def _build_portfolio(user: PaperUser, live_prices: Dict[str, float] = None) -> dict:
    holdings_list = []
    total_invested = 0.0
    total_current = 0.0

    for sym, h in user.holdings.items():
        qty = h["qty"]
        avg = h["avg_price"]
        live = (live_prices or {}).get(sym, avg)
        invested = qty * avg
        current = qty * live
        pnl = current - invested
        pnl_pct = (pnl / invested * 100) if invested else 0.0
        holdings_list.append({
            "symbol": sym,
            "quantity": qty,
            "avg_price": round(avg, 2),
            "live_price": round(live, 2),
            "invested": round(invested, 2),
            "current_value": round(current, 2),
            "pnl": round(pnl, 2),
            "pnl_percent": round(pnl_pct, 2),
        })
        total_invested += invested
        total_current += current

    total_pnl = total_current - total_invested
    portfolio_value = user.cash_balance + total_current
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested else 0.0

    return {
        "cash_balance": round(user.cash_balance, 2),
        "holdings": holdings_list,
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current, 2),
        "total_pnl": round(total_pnl, 2),
        "total_pnl_percent": round(total_pnl_pct, 2),
        "portfolio_value": round(portfolio_value, 2),
    }


# ============================================================================
# ROUTES
# ============================================================================

@router.post("/api/users/register")
async def register_user(req: RegisterRequest):
    """Register or lookup a paper trading user by email."""
    email = req.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    user = _get_or_create_user(email)
    return {
        "success": True,
        "user": {"id": user.id, "email": user.email},
    }


@router.get("/api/paper/portfolio/{user_id}")
async def get_portfolio(user_id: str):
    """Get portfolio state with live prices."""
    if user_id not in _users:
        raise HTTPException(status_code=404, detail="User not found")

    user = _users[user_id]

    # Fetch live prices for all holdings
    live_prices: Dict[str, float] = {}
    for sym in user.holdings:
        data = await _fetch_live_price(sym)
        if data:
            live_prices[sym] = data["price"]

    return _build_portfolio(user, live_prices)


@router.get("/api/paper/orders/{user_id}")
async def get_orders(user_id: str):
    """Get order history."""
    if user_id not in _users:
        raise HTTPException(status_code=404, detail="User not found")

    return {"orders": _orders.get(user_id, [])}


@router.get("/api/paper/price/{symbol}")
async def get_stock_price(symbol: str):
    """Lookup live price for a stock symbol."""
    symbol = symbol.upper().strip()
    data = await _fetch_live_price(symbol)
    if not data or data["price"] <= 0:
        raise HTTPException(status_code=404, detail=f"Stock {symbol} not found")
    return data


@router.post("/api/paper/order")
async def place_order(req: OrderRequest):
    """Place a buy or sell paper trade at market price."""
    if req.user_id not in _users:
        raise HTTPException(status_code=404, detail="User not found")
    if req.action not in ("BUY", "SELL"):
        raise HTTPException(status_code=400, detail="Action must be BUY or SELL")
    if req.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    user = _users[req.user_id]
    symbol = req.symbol.upper().strip()

    # Get live price
    price_data = await _fetch_live_price(symbol)
    if not price_data or price_data["price"] <= 0:
        raise HTTPException(status_code=404, detail=f"Could not fetch price for {symbol}")

    price = price_data["price"]
    total_value = price * req.quantity

    if req.action == "BUY":
        cost = total_value * 1.001  # ~0.1% charges
        if cost > user.cash_balance:
            raise HTTPException(status_code=400, detail="Insufficient cash balance")

        user.cash_balance -= cost
        if symbol in user.holdings:
            h = user.holdings[symbol]
            old_val = h["qty"] * h["avg_price"]
            new_val = old_val + total_value
            h["qty"] += req.quantity
            h["avg_price"] = new_val / h["qty"]
        else:
            user.holdings[symbol] = {"qty": req.quantity, "avg_price": price}

    else:  # SELL
        if symbol not in user.holdings or user.holdings[symbol]["qty"] < req.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient holdings for {symbol}")

        proceeds = total_value * 0.999  # ~0.1% charges
        user.cash_balance += proceeds
        user.holdings[symbol]["qty"] -= req.quantity
        if user.holdings[symbol]["qty"] == 0:
            del user.holdings[symbol]

    # Record order
    order = {
        "id": str(uuid.uuid4()),
        "symbol": symbol,
        "action": req.action,
        "quantity": req.quantity,
        "price": round(price, 2),
        "total_value": round(total_value, 2),
        "status": "EXECUTED",
        "created_at": datetime.utcnow().isoformat(),
    }
    _orders.setdefault(req.user_id, []).insert(0, order)

    return {
        "success": True,
        "executed_price": round(price, 2),
        "order": order,
    }


@router.post("/api/paper/reset/{user_id}")
async def reset_account(user_id: str):
    """Reset paper trading account to initial state."""
    if user_id not in _users:
        raise HTTPException(status_code=404, detail="User not found")

    user = _users[user_id]
    user.cash_balance = INITIAL_CASH
    user.holdings.clear()
    _orders[user_id] = []

    return {"success": True, "message": "Account reset to ₹10,00,000"}


# ============================================================================
# PR 19 — v2 endpoints backed by PR 2 schema
# ============================================================================
# These read from the PR 2 tables (paper_portfolios / paper_positions /
# paper_snapshots) directly. Powers the rebuilt /paper-trading page:
# equity curve with Nifty benchmark, weekly league leaderboard,
# achievements (streaks + badges).
# ============================================================================

from datetime import date, timedelta
from fastapi import Depends
from ..core.database import get_supabase_admin
from ..core.security import get_current_user


@router.get("/api/paper/v2/equity-curve")
async def paper_equity_curve(
    days: int = 90,
    user=Depends(get_current_user),
) -> dict:
    """Return the user's per-day paper equity + Nifty close benchmark
    over the last N days. Feeds the ``EquityCurve`` chart."""
    client = get_supabase_admin()
    cutoff = (date.today() - timedelta(days=days)).isoformat()
    try:
        resp = (
            client.table("paper_snapshots")
            .select("snapshot_date, equity, cash, invested, drawdown_pct, nifty_close")
            .eq("user_id", user.id)
            .gte("snapshot_date", cutoff)
            .order("snapshot_date", desc=False)
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        logger.warning("paper equity-curve query failed: %s", exc)
        rows = []

    # Compute derived columns (return % vs day-0, drawdown at this snapshot).
    if rows:
        base_equity = float(rows[0]["equity"])
        base_nifty = float(rows[0]["nifty_close"] or 0) or 1
        for r in rows:
            e = float(r["equity"])
            n = float(r["nifty_close"] or 0)
            r["return_pct"] = round((e / base_equity - 1) * 100, 4) if base_equity else 0
            r["nifty_pct"] = round((n / base_nifty - 1) * 100, 4) if base_nifty else 0

    latest = rows[-1] if rows else None
    return {
        "days": days,
        "points": rows,
        "latest": latest,
        "initial_equity": INITIAL_CASH,
    }


@router.get("/api/paper/v2/league")
async def paper_league(
    weeks: int = 1,
) -> dict:
    """Anonymized weekly paper-trading leaderboard. Top 20 by weekly
    return — each user's handle is hashed to a stable, masked string."""
    import hashlib

    client = get_supabase_admin()
    cutoff = (date.today() - timedelta(days=weeks * 7)).isoformat()

    try:
        resp = (
            client.table("paper_snapshots")
            .select("user_id, snapshot_date, equity")
            .gte("snapshot_date", cutoff)
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        logger.warning("paper league query failed: %s", exc)
        rows = []

    # Group snapshots by user, find first + last in window, compute return.
    by_user: Dict[str, List[dict]] = {}
    for r in rows:
        by_user.setdefault(r["user_id"], []).append(r)
    for user_id, snaps in by_user.items():
        snaps.sort(key=lambda s: s["snapshot_date"])

    leaderboard = []
    for user_id, snaps in by_user.items():
        if len(snaps) < 2:
            continue
        start_eq = float(snaps[0]["equity"])
        end_eq = float(snaps[-1]["equity"])
        if start_eq <= 0:
            continue
        ret_pct = (end_eq / start_eq - 1) * 100
        handle = "Swing" + hashlib.sha256(user_id.encode()).hexdigest()[:6].upper()
        leaderboard.append({
            "handle": handle,
            "return_pct": round(ret_pct, 2),
            "final_equity": round(end_eq, 2),
            "snapshots": len(snaps),
        })

    leaderboard.sort(key=lambda x: x["return_pct"], reverse=True)
    top = leaderboard[:20]
    for i, row in enumerate(top, start=1):
        row["rank"] = i

    return {
        "weeks": weeks,
        "top_20": top,
        "computed_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/api/paper/v2/achievements")
async def paper_achievements(user=Depends(get_current_user)) -> dict:
    """Streaks + badges for the current user. Pure derivations from
    ``paper_snapshots`` + ``paper_positions``."""
    client = get_supabase_admin()

    try:
        snaps_resp = (
            client.table("paper_snapshots")
            .select("snapshot_date, equity, drawdown_pct")
            .eq("user_id", user.id)
            .order("snapshot_date", desc=False)
            .execute()
        )
        snaps = snaps_resp.data or []
    except Exception as exc:
        logger.warning("paper achievements snaps query failed: %s", exc)
        snaps = []

    # Green-day streak: consecutive daily up-moves ending today.
    streak = 0
    for i in range(len(snaps) - 1, 0, -1):
        prev = float(snaps[i - 1]["equity"])
        curr = float(snaps[i]["equity"])
        if curr > prev:
            streak += 1
        else:
            break

    # Closed trade stats from paper_positions (status=closed).
    try:
        trades_resp = (
            client.table("paper_positions")
            .select("symbol, qty, entry_price, status")
            .eq("user_id", user.id)
            .eq("status", "closed")
            .execute()
        )
        trades = trades_resp.data or []
    except Exception:
        trades = []

    trade_count = len(trades)
    initial = INITIAL_CASH
    current_equity = float(snaps[-1]["equity"]) if snaps else initial
    total_return_pct = ((current_equity - initial) / initial) * 100 if initial else 0
    days_trading = len(snaps)

    badges = []
    if trade_count >= 1:
        badges.append({"key": "first_trade", "label": "First trade", "tier": "bronze"})
    if trade_count >= 10:
        badges.append({"key": "ten_trades", "label": "10 trades", "tier": "silver"})
    if trade_count >= 50:
        badges.append({"key": "fifty_trades", "label": "50 trades", "tier": "gold"})
    if streak >= 3:
        badges.append({"key": "three_streak", "label": "3-day streak", "tier": "bronze"})
    if streak >= 7:
        badges.append({"key": "seven_streak", "label": "Week streak", "tier": "silver"})
    if total_return_pct >= 5:
        badges.append({"key": "five_pct", "label": "+5% gain", "tier": "bronze"})
    if total_return_pct >= 10:
        badges.append({"key": "ten_pct", "label": "+10% gain", "tier": "silver"})
    if days_trading >= 30:
        badges.append({"key": "thirty_days", "label": "30 days active", "tier": "gold"})

    return {
        "streak_days": streak,
        "trade_count": trade_count,
        "days_trading": days_trading,
        "total_return_pct": round(total_return_pct, 2),
        "current_equity": round(current_equity, 2),
        "badges": badges,
        # Step 1 §C10 conversion prompt — surface this when days_trading >= 30
        "go_live_eligible": days_trading >= 30,
    }
