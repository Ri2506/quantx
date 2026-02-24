"""
================================================================================
SWINGAI - REAL-TIME WEBSOCKET SYSTEM
================================================================================
Production-grade real-time updates for:
- Live price updates
- Signal notifications
- Trade status updates
- Portfolio P&L updates
- Market data streaming
================================================================================
"""

import asyncio
import json
from datetime import datetime
from typing import Dict, List, Set, Optional
from dataclasses import dataclass, asdict
from enum import Enum
import logging

from fastapi import WebSocket, WebSocketDisconnect
from redis import asyncio as aioredis
import httpx

from ..core.config import settings

logger = logging.getLogger(__name__)

# ============================================================================
# MESSAGE TYPES
# ============================================================================

class MessageType(Enum):
    # Connection
    CONNECTED = "connected"
    PING = "ping"
    PONG = "pong"
    ERROR = "error"
    
    # Signals
    NEW_SIGNAL = "new_signal"
    SIGNAL_TRIGGERED = "signal_triggered"
    SIGNAL_EXPIRED = "signal_expired"
    
    # Trades
    TRADE_PENDING = "trade_pending"
    TRADE_EXECUTED = "trade_executed"
    TRADE_CLOSED = "trade_closed"
    TRADE_REJECTED = "trade_rejected"
    
    # Positions
    POSITION_UPDATE = "position_update"
    SL_HIT = "sl_hit"
    TARGET_HIT = "target_hit"
    TRAILING_SL_UPDATE = "trailing_sl_update"
    
    # Portfolio
    PORTFOLIO_UPDATE = "portfolio_update"
    PNL_UPDATE = "pnl_update"
    MARGIN_ALERT = "margin_alert"
    
    # Market
    MARKET_DATA = "market_data"
    PRICE_UPDATE = "price_update"
    VIX_ALERT = "vix_alert"
    CIRCUIT_BREAKER = "circuit_breaker"
    
    # Notifications
    NOTIFICATION = "notification"
    ALERT = "alert"

@dataclass
class WSMessage:
    type: MessageType
    data: Dict
    timestamp: str = None
    user_id: Optional[str] = None
    
    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.utcnow().isoformat()
    
    def to_json(self) -> str:
        return json.dumps({
            "type": self.type.value,
            "data": self.data,
            "timestamp": self.timestamp
        })

# ============================================================================
# CONNECTION MANAGER
# ============================================================================

class ConnectionManager:
    """
    Manages WebSocket connections with Redis pub/sub for scaling
    """
    
    def __init__(self, redis_url: str = None):
        # Local connections (per server instance)
        self.active_connections: Dict[str, WebSocket] = {}
        
        # User subscriptions (what each user is subscribed to)
        self.user_subscriptions: Dict[str, Set[str]] = {}
        
        # Symbol subscriptions (which users are watching which symbols)
        self.symbol_watchers: Dict[str, Set[str]] = {}
        
        # Redis for cross-server messaging
        self.redis_url = redis_url
        self.redis: Optional[aioredis.Redis] = None
        self.pubsub = None
    
    async def init_redis(self):
        """Initialize Redis connection for pub/sub"""
        if self.redis_url:
            try:
                self.redis = await aioredis.from_url(self.redis_url)
                self.pubsub = self.redis.pubsub()
                await self.pubsub.subscribe("swingai:broadcast")
                logger.info("Redis pub/sub initialized")
            except Exception as e:
                logger.error(f"Redis connection failed: {e}")
    
    async def connect(self, websocket: WebSocket, user_id: str) -> bool:
        """Accept new WebSocket connection"""
        try:
            await websocket.accept()
            self.active_connections[user_id] = websocket
            self.user_subscriptions[user_id] = set(["global"])
            
            # Send connection confirmation
            await self.send_to_user(user_id, WSMessage(
                type=MessageType.CONNECTED,
                data={"user_id": user_id, "status": "connected"}
            ))
            
            logger.info(f"WebSocket connected: {user_id}")
            return True
        except Exception as e:
            logger.error(f"Connection failed for {user_id}: {e}")
            return False
    
    def disconnect(self, user_id: str):
        """Handle disconnection"""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        
        if user_id in self.user_subscriptions:
            del self.user_subscriptions[user_id]
        
        # Remove from symbol watchers
        for symbol, watchers in self.symbol_watchers.items():
            watchers.discard(user_id)
        
        logger.info(f"WebSocket disconnected: {user_id}")
    
    async def send_to_user(self, user_id: str, message: WSMessage):
        """Send message to specific user"""
        if user_id in self.active_connections:
            try:
                await self.active_connections[user_id].send_text(message.to_json())
            except Exception as e:
                logger.error(f"Failed to send to {user_id}: {e}")
                self.disconnect(user_id)
    
    async def broadcast(self, message: WSMessage):
        """Broadcast to all connected users"""
        disconnected = []
        
        for user_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(message.to_json())
            except Exception as e:
                logger.error(f"Broadcast failed for {user_id}: {e}")
                disconnected.append(user_id)
        
        # Cleanup disconnected
        for user_id in disconnected:
            self.disconnect(user_id)
        
        # Also publish to Redis for other server instances
        if self.redis:
            await self.redis.publish("swingai:broadcast", message.to_json())
    
    async def broadcast_to_subscribers(self, channel: str, message: WSMessage):
        """Broadcast to users subscribed to a channel"""
        for user_id, subs in self.user_subscriptions.items():
            if channel in subs:
                await self.send_to_user(user_id, message)
    
    async def broadcast_symbol_update(self, symbol: str, message: WSMessage):
        """Broadcast to users watching a specific symbol"""
        if symbol in self.symbol_watchers:
            for user_id in self.symbol_watchers[symbol]:
                await self.send_to_user(user_id, message)
    
    def subscribe_to_symbol(self, user_id: str, symbol: str):
        """Subscribe user to symbol updates"""
        if symbol not in self.symbol_watchers:
            self.symbol_watchers[symbol] = set()
        self.symbol_watchers[symbol].add(user_id)
    
    def unsubscribe_from_symbol(self, user_id: str, symbol: str):
        """Unsubscribe user from symbol updates"""
        if symbol in self.symbol_watchers:
            self.symbol_watchers[symbol].discard(user_id)
    
    def get_connection_count(self) -> int:
        """Get number of active connections"""
        return len(self.active_connections)
    
    def is_connected(self, user_id: str) -> bool:
        """Check if user is connected"""
        return user_id in self.active_connections

# ============================================================================
# REAL-TIME PRICE SERVICE
# ============================================================================

class PriceService:
    """
    Real-time price updates service
    Integrates with broker APIs for live prices
    """
    
    def __init__(self, connection_manager: ConnectionManager):
        self.manager = connection_manager
        self.price_cache: Dict[str, Dict] = {}
        self.last_update: Dict[str, datetime] = {}
    
    async def update_price(self, symbol: str, price_data: Dict):
        """
        Update price and broadcast to watchers
        
        price_data: {
            "symbol": "TRENT",
            "ltp": 2765.50,
            "open": 2745.00,
            "high": 2780.00,
            "low": 2740.00,
            "change": 20.50,
            "change_percent": 0.75,
            "volume": 125000
        }
        """
        self.price_cache[symbol] = price_data
        self.last_update[symbol] = datetime.utcnow()
        
        message = WSMessage(
            type=MessageType.PRICE_UPDATE,
            data=price_data
        )
        
        await self.manager.broadcast_symbol_update(symbol, message)
    
    async def update_position_pnl(self, user_id: str, positions: List[Dict]):
        """
        Update position P&L with live prices
        """
        updated_positions = []
        
        for pos in positions:
            symbol = pos["symbol"]
            if symbol in self.price_cache:
                current_price = self.price_cache[symbol]["ltp"]
                
                if pos["direction"] == "LONG":
                    pnl = (current_price - pos["average_price"]) * pos["quantity"]
                else:
                    pnl = (pos["average_price"] - current_price) * pos["quantity"]
                
                pnl_percent = (pnl / (pos["average_price"] * pos["quantity"])) * 100
                
                updated_positions.append({
                    **pos,
                    "current_price": current_price,
                    "unrealized_pnl": round(pnl, 2),
                    "unrealized_pnl_percent": round(pnl_percent, 2)
                })
        
        message = WSMessage(
            type=MessageType.POSITION_UPDATE,
            data={"positions": updated_positions}
        )
        
        await self.manager.send_to_user(user_id, message)
    
    def get_price(self, symbol: str) -> Optional[float]:
        """Get cached price for symbol"""
        if symbol in self.price_cache:
            return self.price_cache[symbol].get("ltp")
        return None

# ============================================================================
# NOTIFICATION SERVICE
# ============================================================================

class NotificationService:
    """
    Real-time notification service
    """
    
    def __init__(self, connection_manager: ConnectionManager, supabase_client):
        self.manager = connection_manager
        self.supabase = supabase_client
        self.telegram_token = settings.TELEGRAM_BOT_TOKEN
    
    async def send_signal_notification(self, signal: Dict, user_ids: List[str] = None):
        """Send new signal notification"""
        message = WSMessage(
            type=MessageType.NEW_SIGNAL,
            data={
                "signal": signal,
                "title": f"New {signal['direction']} Signal: {signal['symbol']}",
                "message": f"Confidence: {signal['confidence']}% | Entry: ₹{signal['entry_price']}"
            }
        )
        
        if user_ids:
            for user_id in user_ids:
                await self.manager.send_to_user(user_id, message)
                await self._send_telegram_if_enabled(user_id, message.data.get("title", ""), message.data.get("message", ""))
        else:
            await self.manager.broadcast(message)
            await self._broadcast_telegram(message.data.get("title", ""), message.data.get("message", ""))
    
    async def send_trade_notification(self, user_id: str, trade: Dict, status: str):
        """Send trade status notification"""
        type_map = {
            "pending": MessageType.TRADE_PENDING,
            "executed": MessageType.TRADE_EXECUTED,
            "closed": MessageType.TRADE_CLOSED,
            "rejected": MessageType.TRADE_REJECTED
        }
        
        message = WSMessage(
            type=type_map.get(status, MessageType.NOTIFICATION),
            data={
                "trade": trade,
                "title": f"Trade {status.capitalize()}: {trade['symbol']}",
                "message": f"{trade['direction']} {trade['quantity']} @ ₹{trade.get('average_price', trade['entry_price'])}"
            }
        )
        
        await self.manager.send_to_user(user_id, message)
        
        # Also save to database
        await self._save_notification(user_id, message)

    async def broadcast_signals(self, signals: List[Dict]):
        """Broadcast a batch of signals to all connected users"""
        for signal in signals:
            payload = signal.__dict__ if hasattr(signal, "__dict__") else signal
            await self.send_signal_notification(payload)

    async def broadcast_alert(self, title: str, message: str, priority: str = "normal"):
        """Broadcast a general alert to all users"""
        alert = WSMessage(
            type=MessageType.ALERT,
            data={
                "title": title,
                "message": message,
                "priority": priority,
            },
        )
        await self.manager.broadcast(alert)

    async def send_admin_alert(self, title: str, message: str):
        """Send admin alert (broadcast for now)"""
        await self.broadcast_alert(title, message, priority="high")

    async def send_to_user(
        self,
        user_id: str,
        notif_type: str,
        message: str,
        title: Optional[str] = None,
        data: Optional[Dict] = None,
    ):
        """Send a generic notification to a user and persist it"""
        payload = {
            "type": notif_type,
            "title": title or "Notification",
            "message": message,
            "priority": "normal",
        }
        if data:
            payload["data"] = data

        ws_message = WSMessage(type=MessageType.NOTIFICATION, data=payload)
        await self.manager.send_to_user(user_id, ws_message)
        await self._save_notification(user_id, ws_message)
        await self._send_telegram_if_enabled(user_id, payload.get("title", ""), payload.get("message", ""))

    async def send_daily_summary(self, user_id: str):
        """Send a lightweight daily summary notification"""
        try:
            profile = self.supabase.table("user_profiles").select(
                "total_trades, winning_trades, total_pnl"
            ).eq("id", user_id).single().execute()
            data = profile.data or {}
            total = data.get("total_trades", 0)
            wins = data.get("winning_trades", 0)
            win_rate = (wins / total * 100) if total else 0
            total_pnl = data.get("total_pnl", 0)

            await self.send_to_user(
                user_id,
                "daily_summary",
                f"Trades: {total} | Win rate: {win_rate:.1f}% | P&L: ₹{total_pnl:,.0f}",
                title="Daily Summary",
            )
        except Exception as e:
            logger.error(f"Failed to send daily summary: {e}")
    
    async def send_sl_alert(self, user_id: str, position: Dict):
        """Send stop loss hit alert"""
        message = WSMessage(
            type=MessageType.SL_HIT,
            data={
                "position": position,
                "title": f"⚠️ Stop Loss Hit: {position['symbol']}",
                "message": f"Position closed at ₹{position.get('exit_price', position['stop_loss'])}",
                "priority": "high"
            }
        )
        
        await self.manager.send_to_user(user_id, message)
        await self._save_notification(user_id, message)
    
    async def send_target_alert(self, user_id: str, position: Dict):
        """Send target hit alert"""
        message = WSMessage(
            type=MessageType.TARGET_HIT,
            data={
                "position": position,
                "title": f"🎯 Target Hit: {position['symbol']}",
                "message": f"Position closed at ₹{position.get('exit_price', position['target'])}",
                "priority": "high"
            }
        )
        
        await self.manager.send_to_user(user_id, message)
        await self._save_notification(user_id, message)
    
    async def send_vix_alert(self, vix_level: float):
        """Send VIX alert to all users"""
        if vix_level > 25:
            severity = "EXTREME" if vix_level > 30 else "HIGH"
            message = WSMessage(
                type=MessageType.VIX_ALERT,
                data={
                    "vix": vix_level,
                    "severity": severity,
                    "title": f"⚠️ VIX Alert: {vix_level}",
                    "message": "High volatility detected. Position sizes reduced." if severity == "HIGH" else "Trading paused due to extreme volatility.",
                    "priority": "urgent"
                }
            )
            
            await self.manager.broadcast(message)
    
    async def send_margin_alert(self, user_id: str, margin_data: Dict):
        """Send margin warning"""
        message = WSMessage(
            type=MessageType.MARGIN_ALERT,
            data={
                **margin_data,
                "title": "⚠️ Margin Warning",
                "message": f"Available margin: ₹{margin_data['available']:,.0f} ({margin_data['percent']:.1f}%)",
                "priority": "high"
            }
        )
        
        await self.manager.send_to_user(user_id, message)
    
    async def _save_notification(self, user_id: str, message: WSMessage):
        """Save notification to database"""
        try:
            self.supabase.table("notifications").insert({
                "user_id": user_id,
                "type": message.type.value,
                "title": message.data.get("title", ""),
                "message": message.data.get("message", ""),
                "data": message.data,
                "priority": message.data.get("priority", "normal")
            }).execute()
        except Exception as e:
            logger.error(f"Failed to save notification: {e}")

    async def _send_telegram_if_enabled(self, user_id: str, title: str, body: str):
        if not self.telegram_token:
            return
        try:
            profile = self.supabase.table("user_profiles").select(
                "telegram_chat_id, telegram_connected, notifications_enabled"
            ).eq("id", user_id).single().execute()
            data = profile.data or {}
            chat_id = data.get("telegram_chat_id")
            if not chat_id or not data.get("notifications_enabled"):
                return
            await self._send_telegram(chat_id, f"{title}\n{body}")
        except Exception as e:
            logger.debug(f"Telegram send failed: {e}")

    async def _broadcast_telegram(self, title: str, body: str):
        if not self.telegram_token:
            return
        try:
            result = self.supabase.table("user_profiles").select(
                "id, telegram_chat_id"
            ).neq("telegram_chat_id", None).execute()
            for row in result.data or []:
                await self._send_telegram(row["telegram_chat_id"], f"{title}\n{body}")
        except Exception as e:
            logger.debug(f"Telegram broadcast failed: {e}")

    async def _send_telegram(self, chat_id: str, text: str):
        if not self.telegram_token:
            return
        url = f"https://api.telegram.org/bot{self.telegram_token}/sendMessage"
        async with httpx.AsyncClient() as client:
            await client.post(url, json={"chat_id": chat_id, "text": text})

# ============================================================================
# MARKET DATA STREAMER
# ============================================================================

class MarketDataStreamer:
    """
    Streams market data updates
    """
    
    def __init__(self, connection_manager: ConnectionManager):
        self.manager = connection_manager
        self.market_data: Dict = {}
    
    async def update_market_data(self, data: Dict):
        """
        Update and broadcast market data
        
        data: {
            "nifty": {"price": 21850, "change": 0.45},
            "banknifty": {"price": 46230, "change": 0.32},
            "vix": {"level": 14.5, "change": -2.1},
            "fii_net": 2450,
            "advances": 1250,
            "declines": 750
        }
        """
        self.market_data = data
        
        message = WSMessage(
            type=MessageType.MARKET_DATA,
            data=data
        )
        
        await self.manager.broadcast_to_subscribers("market", message)
    
    async def send_circuit_breaker(self, reason: str, action: str):
        """Send circuit breaker alert"""
        message = WSMessage(
            type=MessageType.CIRCUIT_BREAKER,
            data={
                "reason": reason,
                "action": action,
                "title": "🚨 Circuit Breaker Activated",
                "message": f"{reason}. Action: {action}",
                "priority": "urgent"
            }
        )
        
        await self.manager.broadcast(message)

# ============================================================================
# WEBSOCKET HANDLER
# ============================================================================

async def websocket_handler(
    websocket: WebSocket,
    token: str,
    manager: ConnectionManager,
    price_service: PriceService,
    supabase_client
):
    """
    Main WebSocket handler
    """
    # Verify token and get user
    try:
        user = supabase_client.auth.get_user(token)
        if not user:
            await websocket.close(code=4001, reason="Invalid token")
            return
        
        user_id = user.user.id
    except Exception as e:
        logger.error(f"Token verification failed: {e}")
        await websocket.close(code=4001, reason="Authentication failed")
        return
    
    # Connect
    if not await manager.connect(websocket, user_id):
        return
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_text()
            
            try:
                message = json.loads(data)
                msg_type = message.get("type")
                
                if msg_type == "ping":
                    await manager.send_to_user(user_id, WSMessage(
                        type=MessageType.PONG,
                        data={"timestamp": datetime.utcnow().isoformat()}
                    ))
                
                elif msg_type == "subscribe_symbol":
                    symbol = message.get("symbol")
                    if symbol:
                        manager.subscribe_to_symbol(user_id, symbol)
                        await manager.send_to_user(user_id, WSMessage(
                            type=MessageType.NOTIFICATION,
                            data={"message": f"Subscribed to {symbol}"}
                        ))
                
                elif msg_type == "unsubscribe_symbol":
                    symbol = message.get("symbol")
                    if symbol:
                        manager.unsubscribe_from_symbol(user_id, symbol)
                
                elif msg_type == "get_positions":
                    # Fetch and send current positions with live P&L
                    positions = supabase_client.table("positions").select("*").eq(
                        "user_id", user_id
                    ).eq("is_active", True).execute()
                    
                    await price_service.update_position_pnl(user_id, positions.data or [])
                
            except json.JSONDecodeError:
                await manager.send_to_user(user_id, WSMessage(
                    type=MessageType.ERROR,
                    data={"message": "Invalid JSON"}
                ))
    
    except WebSocketDisconnect:
        manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WebSocket error for {user_id}: {e}")
        manager.disconnect(user_id)

# ============================================================================
# BACKGROUND TASKS
# ============================================================================

async def position_monitor_task(
    manager: ConnectionManager,
    price_service: PriceService,
    notification_service: NotificationService,
    supabase_client,
    check_interval: int = 5  # seconds
):
    """
    Background task to monitor positions and trigger alerts
    """
    while True:
        try:
            # Get all active positions
            result = supabase_client.table("positions").select(
                "*, user_profiles(id)"
            ).eq("is_active", True).execute()
            
            for position in result.data or []:
                symbol = position["symbol"]
                user_id = position["user_id"]
                
                current_price = price_service.get_price(symbol)
                if not current_price:
                    continue
                
                # Check stop loss
                if position["direction"] == "LONG":
                    if current_price <= position["stop_loss"]:
                        await notification_service.send_sl_alert(user_id, {
                            **position,
                            "exit_price": current_price
                        })
                    elif current_price >= position["target"]:
                        await notification_service.send_target_alert(user_id, {
                            **position,
                            "exit_price": current_price
                        })
                else:  # SHORT
                    if current_price >= position["stop_loss"]:
                        await notification_service.send_sl_alert(user_id, {
                            **position,
                            "exit_price": current_price
                        })
                    elif current_price <= position["target"]:
                        await notification_service.send_target_alert(user_id, {
                            **position,
                            "exit_price": current_price
                        })
            
            await asyncio.sleep(check_interval)
        
        except Exception as e:
            logger.error(f"Position monitor error: {e}")
            await asyncio.sleep(check_interval)

async def market_data_task(
    market_streamer: MarketDataStreamer,
    notification_service: NotificationService,
    update_interval: int = 10  # seconds
):
    """
    Background task to fetch and broadcast market data.
    Uses the configured market data provider (TrueData or yfinance).
    """
    from .market_data import get_market_data_provider

    provider = get_market_data_provider()
    last_vix = 0

    while True:
        try:
            nifty_q = provider.get_quote("^NSEI")
            bank_q = provider.get_quote("^NSEBANK")
            vix_q = provider.get_quote("^INDIAVIX")

            market_data = {
                "nifty": {
                    "price": nifty_q.ltp if nifty_q else 0,
                    "change": nifty_q.change_percent if nifty_q else 0,
                },
                "banknifty": {
                    "price": bank_q.ltp if bank_q else 0,
                    "change": bank_q.change_percent if bank_q else 0,
                },
                "vix": {
                    "level": vix_q.ltp if vix_q else 0,
                    "change": vix_q.change_percent if vix_q else 0,
                },
                "timestamp": datetime.utcnow().isoformat(),
            }

            await market_streamer.update_market_data(market_data)

            # Check VIX alerts
            vix = market_data["vix"]["level"]
            if vix > 25 and last_vix <= 25:
                await notification_service.send_vix_alert(vix)
            last_vix = vix

            await asyncio.sleep(update_interval)

        except Exception as e:
            logger.error(f"Market data task error: {e}")
            await asyncio.sleep(update_interval)


# ============================================================================
# INITIALIZATION
# ============================================================================

def create_realtime_services(supabase_client, redis_url: str = None):
    """
    Create and return all real-time services
    """
    manager = ConnectionManager(redis_url)
    price_service = PriceService(manager)
    notification_service = NotificationService(manager, supabase_client)
    market_streamer = MarketDataStreamer(manager)
    
    return {
        "manager": manager,
        "price_service": price_service,
        "notification_service": notification_service,
        "market_streamer": market_streamer
    }
