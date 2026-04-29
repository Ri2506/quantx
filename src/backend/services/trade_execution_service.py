"""
Trade execution service for scheduler-driven fills.
Creates positions and updates trades when broker execution is not integrated.
"""

import logging
from datetime import datetime, date
from typing import Dict, Any

from .broker_integration import (
    BrokerFactory,
    Order,
    TransactionType,
    OrderType,
    ProductType,
    GTTOrder,
)
from .broker_credentials import decrypt_credentials
from ..core.config import settings
from .instrument_master import InstrumentMaster

logger = logging.getLogger(__name__)


class TradeExecutionService:
    def __init__(self, supabase_admin):
        self.supabase = supabase_admin
        self.instrument_master = InstrumentMaster(settings.FNO_INSTRUMENTS_FILE)

    async def execute(self, trade: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a pending trade by opening a position and updating trade status.
        This is a DB-level execution for environments without broker integration.
        """
        # PR 48 — global kill-switch gate. Paper trades are unaffected; only
        # live (real-money) execution halts when ops flip the flag.
        if trade.get("execution_mode") == "live":
            try:
                from .system_flags import is_globally_halted, global_halt_reason
                if is_globally_halted(supabase_client=self.supabase):
                    reason = global_halt_reason(supabase_client=self.supabase) or "ops halt"
                    logger.warning(
                        "Trade %s blocked — global kill switch active (%s)",
                        trade.get("id"), reason,
                    )
                    try:
                        self.supabase.table("trades").update({
                            "status": "rejected",
                            "exit_reason": "risk_limit",
                        }).eq("id", trade.get("id")).execute()
                    except Exception:
                        pass
                    return {
                        "success": False,
                        "message": f"Trading halted: {reason}",
                        "code": "global_kill_switch",
                    }
            except Exception as kill_exc:
                logger.debug("kill-switch check skipped: %s", kill_exc)

        try:
            if trade.get("execution_mode") == "live":
                return await self._execute_live_trade(trade)

            trade_id = trade.get("id")
            user_id = trade.get("user_id")

            if not trade_id or not user_id:
                return {"success": False, "message": "Missing trade or user id"}

            if trade.get("status") not in ["pending", "approved"]:
                return {"success": False, "message": "Trade is not pending/approved"}

            existing = self.supabase.table("positions").select("id").eq("trade_id", trade_id).execute()
            if existing.data:
                return {"success": True, "message": "Position already open"}

            entry_price = float(trade.get("average_price") or trade.get("entry_price") or 0)
            if entry_price <= 0:
                return {"success": False, "message": "Invalid entry price"}

            quantity = int(trade.get("quantity") or 0)
            if quantity <= 0:
                return {"success": False, "message": "Invalid quantity"}

            position = {
                "user_id": user_id,
                "trade_id": trade_id,
                "symbol": trade.get("symbol"),
                "exchange": trade.get("exchange", "NSE"),
                "segment": trade.get("segment", "EQUITY"),
                "expiry_date": trade.get("expiry_date"),
                "strike_price": trade.get("strike_price"),
                "option_type": trade.get("option_type"),
                "direction": trade.get("direction"),
                "quantity": quantity,
                "lots": trade.get("lots", 1),
                "average_price": entry_price,
                "current_price": entry_price,
                "current_value": quantity * entry_price,
                "stop_loss": trade.get("stop_loss"),
                "target": trade.get("target"),
                "margin_used": trade.get("margin_used"),
                "risk_amount": trade.get("risk_amount"),
                "execution_mode": trade.get("execution_mode", "paper"),
                "is_active": True,
                "last_updated": datetime.utcnow().isoformat(),
            }

            self.supabase.table("positions").insert(position).execute()

            self.supabase.table("trades").update({
                "status": "open",
                "executed_at": datetime.utcnow().isoformat(),
                "average_price": entry_price,
                "filled_quantity": quantity,
                "pending_quantity": 0,
            }).eq("id", trade_id).execute()

            return {"success": True, "message": "Trade executed"}
        except Exception as e:
            logger.error(f"Trade execution failed: {e}")
            return {"success": False, "message": str(e)}

    async def _execute_live_trade(self, trade: Dict[str, Any]) -> Dict[str, Any]:
        """Execute live trade via broker API."""
        trade_id = trade.get("id")
        user_id = trade.get("user_id")
        if not trade_id or not user_id:
            return {"success": False, "message": "Missing trade or user id"}

        # PR 130 — defense-in-depth eligibility check. Route layer already
        # gates by tier on its way in; this catches the AutoPilot / RL
        # paths that may not pass through the same routes.
        try:
            from .live_trade_eligibility import check_live_trade_eligibility  # noqa: PLC0415
            elig = check_live_trade_eligibility(
                user_id=str(user_id),
                supabase=self.supabase,
            )
            if not elig.eligible:
                logger.warning(
                    "Live execution blocked for trade %s: %s (%s)",
                    trade_id, elig.code, elig.reason,
                )
                try:
                    self.supabase.table("trades").update({
                        "status": "rejected",
                        "exit_reason": elig.code or "ineligible",
                    }).eq("id", trade_id).execute()
                except Exception:
                    pass
                return {
                    "success": False,
                    "message": elig.reason or "Live execution not allowed",
                    "code": elig.code,
                }
        except Exception as exc:
            logger.debug("eligibility check skipped: %s", exc)

        conn = self.supabase.table("broker_connections").select(
            "broker_name, access_token"
        ).eq("user_id", user_id).eq("status", "connected").single().execute()

        if not conn.data:
            return {"success": False, "message": "No broker connected"}

        broker_name = conn.data["broker_name"]
        credentials = decrypt_credentials(conn.data["access_token"])

        broker = BrokerFactory.create(broker_name, credentials)
        if not broker.login():
            return {"success": False, "message": "Broker login failed"}

        direction = trade.get("direction")
        symbol = trade.get("symbol")
        exchange = trade.get("exchange", "NSE")
        instrument_token = None
        if trade.get("segment") == "FUTURES":
            resolved = self._resolve_futures_contract(trade)
            if resolved:
                symbol = resolved.get("tradingsymbol", symbol)
                exchange = resolved.get("exchange", exchange) or exchange
                instrument_token = resolved.get("instrument_token")
        qty = int(trade.get("quantity") or 0)
        if qty <= 0:
            return {"success": False, "message": "Invalid quantity"}

        order = Order(
            symbol=symbol,
            exchange=exchange,
            transaction_type=TransactionType.BUY if direction == "LONG" else TransactionType.SELL,
            quantity=qty,
            product=ProductType.CNC if trade.get("segment") == "EQUITY" else ProductType.NRML,
            order_type=OrderType.MARKET,
            price=0,
            instrument_token=instrument_token,
        )

        placed = broker.place_order(order)
        if placed.status.name == "REJECTED":
            return {"success": False, "message": f"Order rejected: {placed.message}"}

        # Update trade
        self.supabase.table("trades").update({
            "status": "open",
            "executed_at": datetime.utcnow().isoformat(),
            "average_price": trade.get("entry_price"),
            "filled_quantity": qty,
            "pending_quantity": 0,
            "broker_order_id": placed.order_id,
        }).eq("id", trade_id).execute()

        # Create position
        position = {
            "user_id": user_id,
            "trade_id": trade_id,
            "symbol": symbol,
            "exchange": exchange,
            "segment": trade.get("segment", "EQUITY"),
            "expiry_date": trade.get("expiry_date"),
            "strike_price": trade.get("strike_price"),
            "option_type": trade.get("option_type"),
            "direction": direction,
            "quantity": qty,
            "lots": trade.get("lots", 1),
            "average_price": trade.get("entry_price"),
            "current_price": trade.get("entry_price"),
            "stop_loss": trade.get("stop_loss"),
            "target": trade.get("target"),
            "margin_used": trade.get("margin_used"),
            "risk_amount": trade.get("risk_amount"),
            "execution_mode": "live",
            "is_active": True,
            "last_updated": datetime.utcnow().isoformat(),
        }
        self.supabase.table("positions").insert(position).execute()

        # Place GTT for Zerodha if available
        if broker_name == "zerodha":
            try:
                gtt = GTTOrder(
                    symbol=symbol,
                    exchange=exchange,
                    trigger_type="two-leg",
                    trigger_values=[trade.get("stop_loss"), trade.get("target")],
                    orders=[
                        {"transaction_type": "SELL" if direction == "LONG" else "BUY", "quantity": qty, "price": trade.get("stop_loss")},
                        {"transaction_type": "SELL" if direction == "LONG" else "BUY", "quantity": qty, "price": trade.get("target")},
                    ],
                )
                gtt = broker.place_gtt_order(gtt)
                self.supabase.table("trades").update({
                    "entry_gtt_id": gtt.gtt_id
                }).eq("id", trade_id).execute()
            except Exception as e:
                logger.warning(f"GTT placement failed: {e}")

        return {"success": True, "message": "Trade executed (live)"}

    async def close_position(self, position: Dict[str, Any], exit_price: float, reason: str) -> Dict[str, Any]:
        """Close live position via broker, then update DB."""
        try:
            user_id = position.get("user_id")
            trade_id = position.get("trade_id")
            symbol = position.get("symbol")
            exchange = position.get("exchange", "NSE")
            instrument_token = None
            qty = int(position.get("quantity") or 0)
            direction = position.get("direction")

            if position.get("execution_mode") != "live":
                return {"success": False, "message": "Not a live position"}

            conn = self.supabase.table("broker_connections").select(
                "broker_name, access_token"
            ).eq("user_id", user_id).eq("status", "connected").single().execute()
            if not conn.data:
                return {"success": False, "message": "No broker connected"}

            broker_name = conn.data["broker_name"]
            credentials = decrypt_credentials(conn.data["access_token"])
            broker = BrokerFactory.create(broker_name, credentials)
            if not broker.login():
                return {"success": False, "message": "Broker login failed"}

            if position.get("segment") == "FUTURES":
                resolved = self._resolve_futures_contract(position)
                if resolved:
                    symbol = resolved.get("tradingsymbol", symbol)
                    exchange = resolved.get("exchange", exchange) or exchange
                    instrument_token = resolved.get("instrument_token")

            order = Order(
                symbol=symbol,
                exchange=exchange,
                transaction_type=TransactionType.SELL if direction == "LONG" else TransactionType.BUY,
                quantity=qty,
                product=ProductType.CNC if position.get("segment") == "EQUITY" else ProductType.NRML,
                order_type=OrderType.MARKET,
                price=0,
                instrument_token=instrument_token,
            )
            placed = broker.place_order(order)
            if placed.status.name == "REJECTED":
                return {"success": False, "message": f"Exit order rejected: {placed.message}"}

            pnl = (exit_price - position.get("average_price")) * qty if direction == "LONG" else (position.get("average_price") - exit_price) * qty
            pnl_pct = (pnl / (qty * position.get("average_price"))) * 100 if qty else 0

            self.supabase.table("trades").update({
                "status": "closed",
                "exit_price": exit_price,
                "net_pnl": pnl,
                "pnl_percent": pnl_pct,
                "exit_reason": reason,
                "closed_at": datetime.utcnow().isoformat()
            }).eq("id", trade_id).execute()

            self.supabase.table("positions").update({
                "is_active": False
            }).eq("id", position["id"]).execute()

            return {"success": True, "message": "Position closed"}
        except Exception as e:
            logger.error(f"Close position failed: {e}")
            return {"success": False, "message": str(e)}

    def _resolve_futures_contract(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Resolve futures tradingsymbol/exchange/instrument_token from instrument master.
        """
        if not self.instrument_master.available():
            return {}
        underlying = data.get("symbol")
        if not underlying:
            return {}
        expiry_raw = data.get("expiry_date")
        expiry_date = None
        if isinstance(expiry_raw, date):
            expiry_date = expiry_raw
        elif isinstance(expiry_raw, str):
            try:
                expiry_date = datetime.fromisoformat(expiry_raw.replace("Z", "+00:00")).date()
            except Exception:
                expiry_date = None
        return self.instrument_master.get_futures_contract(underlying, on_date=expiry_date or date.today()) or {}
