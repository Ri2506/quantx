"""
================================================================================
SWINGAI SCHEDULER SERVICE
================================================================================
Handles all automated tasks:
- 8:30 AM: Pre-market broadcast
- 9:15 AM: Market open checks
- 9:30 AM: Execute pending trades
- Every 5 min: Position monitoring
- 3:30 PM: Market close processing
- 3:45 PM: End-of-day scanner & signal generation (for next trading day)
- 4:00 PM: Daily report generation
================================================================================
"""

import os
import asyncio
from datetime import datetime, date, time, timedelta
from typing import Dict, List, Optional
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from ..core.config import settings

logger = logging.getLogger(__name__)

# ============================================================================
# SCHEDULER SERVICE
# ============================================================================

class SchedulerService:
    """
    Master scheduler for all automated tasks
    """
    
    def __init__(self, supabase_admin, signal_generator, trade_executor, notification_service):
        self.supabase = supabase_admin
        self.signal_generator = signal_generator
        self.trade_executor = trade_executor
        self.notification_service = notification_service
        
        self.scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
        self.is_trading_day = True
    
    def setup_jobs(self):
        """Setup all scheduled jobs"""
        
        # Pre-market scan - 8:30 AM IST
        self.scheduler.add_job(
            self.pre_market_scan,
            CronTrigger(hour=8, minute=30, day_of_week="mon-fri"),
            id="pre_market_scan",
            name="Pre-Market Scan & Signal Generation"
        )
        
        # Market open check - 9:15 AM IST
        self.scheduler.add_job(
            self.market_open_check,
            CronTrigger(hour=9, minute=15, day_of_week="mon-fri"),
            id="market_open_check",
            name="Market Open Condition Check"
        )
        
        # Execute trades - 9:30 AM IST
        self.scheduler.add_job(
            self.execute_pending_trades,
            CronTrigger(hour=9, minute=30, day_of_week="mon-fri"),
            id="execute_trades",
            name="Execute Pending Trades"
        )
        
        # Position monitoring - Every 5 minutes during market hours
        self.scheduler.add_job(
            self.monitor_positions,
            IntervalTrigger(minutes=5),
            id="position_monitor",
            name="Position Monitoring"
        )
        
        # Price updates - Every 1 minute during market hours
        self.scheduler.add_job(
            self.update_prices,
            IntervalTrigger(minutes=1),
            id="price_updates",
            name="Price Updates"
        )
        
        # Market close - 3:30 PM IST
        self.scheduler.add_job(
            self.market_close_processing,
            CronTrigger(hour=15, minute=30, day_of_week="mon-fri"),
            id="market_close",
            name="Market Close Processing"
        )
        
        # End-of-day scanner - 3:45 PM IST (signals for next trading day)
        self.scheduler.add_job(
            self.eod_signal_scan,
            CronTrigger(hour=15, minute=45, day_of_week="mon-fri"),
            id="eod_signal_scan",
            name="EOD Scanner & Signal Generation"
        )

        # Daily report - 4:00 PM IST
        self.scheduler.add_job(
            self.generate_daily_reports,
            CronTrigger(hour=16, minute=0, day_of_week="mon-fri"),
            id="daily_report",
            name="Daily Report Generation"
        )
        
        # Weekend model retraining - Saturday 6:00 AM
        self.scheduler.add_job(
            self.weekend_model_check,
            CronTrigger(hour=6, minute=0, day_of_week="sat"),
            id="model_check",
            name="Weekend Model Performance Check"
        )
        
        logger.info("All scheduled jobs configured")
    
    def start(self):
        """Start the scheduler"""
        self.setup_jobs()
        self.scheduler.start()
        logger.info("Scheduler started")
    
    def stop(self):
        """Stop the scheduler"""
        self.scheduler.shutdown()
        logger.info("Scheduler stopped")
    
    # ========================================================================
    # JOB IMPLEMENTATIONS
    # ========================================================================
    
    async def pre_market_scan(self):
        """
        8:30 AM - Pre-market broadcast of today's signals
        """
        logger.info("Starting pre-market broadcast...")
        
        try:
            # Check if trading day (skip holidays)
            if not await self._is_trading_day():
                logger.info("Not a trading day, skipping scan")
                return

            # Fetch today's active signals and broadcast
            today = date.today().isoformat()
            result = self.supabase.table("signals").select("*").eq("date", today).eq("status", "active").execute()
            signals = result.data or []

            if signals and self.notification_service:
                await self.notification_service.broadcast_signals(signals)
                logger.info(f"Broadcasted {len(signals)} signals for today")
            else:
                logger.info("No active signals to broadcast")
            
        except Exception as e:
            logger.error(f"Pre-market broadcast error: {e}")
            if self.notification_service:
                await self.notification_service.send_admin_alert(
                    "Pre-market broadcast failed",
                    str(e)
                )
    
    async def market_open_check(self):
        """
        9:15 AM - Check market conditions at open
        """
        logger.info("Checking market open conditions...")
        
        try:
            # Fetch market data
            market_data = await self._fetch_market_data()
            
            # Save to database
            self.supabase.table("market_data").upsert({
                "date": date.today().isoformat(),
                **market_data
            }, on_conflict="date").execute()
            
            # Check for gaps
            gap = market_data.get("nifty_gap_pct", 0)
            vix = market_data.get("vix_close", 15)
            
            if abs(gap) > 2:
                logger.warning(f"Gap {gap}% detected - waiting before trading")
                if self.notification_service:
                    await self.notification_service.broadcast_alert(
                        "Market Gap Alert",
                        f"Nifty gap of {gap:.1f}% detected. Waiting 30 minutes."
                    )
            
            if vix > 25:
                logger.warning(f"High VIX {vix} - reduced trading")
                if self.notification_service:
                    await self.notification_service.broadcast_alert(
                        "High Volatility Alert",
                        f"VIX at {vix}. Reducing position sizes."
                    )
            
            # Determine market condition
            condition = self._determine_market_condition(market_data)
            
            self.supabase.table("market_data").update({
                "market_trend": condition["trend"],
                "risk_level": condition["risk_level"],
                "trading_recommendation": condition["recommendation"]
            }).eq("date", date.today().isoformat()).execute()
            
            logger.info(f"Market open: {condition['trend']}, Risk: {condition['risk_level']}")
            
        except Exception as e:
            logger.error(f"Market open check error: {e}")
    
    async def execute_pending_trades(self):
        """
        9:30 AM - Execute approved pending trades
        """
        logger.info("Executing pending trades...")
        
        try:
            # Get pending trades for full-auto users
            pending = self.supabase.table("trades").select(
                "*, user_profiles(trading_mode, broker_name, broker_credentials, kill_switch_active)"
            ).eq("status", "pending").execute()
            
            for trade in pending.data:
                user = trade.get("user_profiles", {})
                
                # Kill switch gate
                if user.get("kill_switch_active"):
                    continue
                # Only execute for full_auto users or approved semi_auto
                if user.get("trading_mode") == "full_auto" or trade.get("approved_at"):
                    try:
                        if not self.trade_executor:
                            logger.warning("Trade executor not configured; skipping execution")
                            continue

                        result = await self.trade_executor.execute(trade)
                        
                        if result["success"]:
                            logger.info(f"Trade executed: {trade['symbol']}")
                        else:
                            logger.warning(f"Trade failed: {trade['symbol']} - {result['message']}")
                            
                    except Exception as e:
                        logger.error(f"Trade execution error: {e}")
            
            logger.info("Trade execution completed")
            
        except Exception as e:
            logger.error(f"Execute pending trades error: {e}")
    
    async def monitor_positions(self):
        """
        Every 5 minutes - Monitor open positions for SL/Target hits
        """
        # Only during market hours
        if not self._is_market_hours():
            return
        
        logger.debug("Monitoring positions...")
        
        try:
            # Get all active positions
            positions = self.supabase.table("positions").select(
                "*, trades(*)"
            ).eq("is_active", True).execute()
            
            for pos in positions.data:
                trade = pos.get("trades", {})
                
                # Get current price (in production, fetch from broker)
                current_price = await self._get_current_price(pos["symbol"])
                
                if current_price is None:
                    continue
                
                # Update position
                self.supabase.table("positions").update({
                    "current_price": current_price,
                    "last_updated": datetime.utcnow().isoformat()
                }).eq("id", pos["id"]).execute()
                
                # Check SL/Target
                direction = pos["direction"]
                sl = trade.get("stop_loss", 0)
                target = trade.get("target", 0)
                
                if direction == "LONG":
                    if current_price <= sl:
                        await self._close_position(pos, current_price, "sl_hit")
                    elif current_price >= target:
                        await self._close_position(pos, current_price, "target")
                else:  # SHORT
                    if current_price >= sl:
                        await self._close_position(pos, current_price, "sl_hit")
                    elif current_price <= target:
                        await self._close_position(pos, current_price, "target")
                
                # Check trailing SL
                await self._update_trailing_sl(pos, current_price)
            
        except Exception as e:
            logger.error(f"Position monitoring error: {e}")

    async def intraday_signal_scan(self):
        """Legacy intraday scan (disabled in scheduler by default)."""
        if not self._is_market_hours():
            return
        try:
            signals = await self.signal_generator.generate_intraday_signals(save=True)
            if signals and self.notification_service:
                await self.notification_service.broadcast_signals(signals)
        except Exception as e:
            logger.error(f"Intraday signal scan failed: {e}")

    async def eod_signal_scan(self):
        """
        3:45 PM - End-of-day scan to generate signals for next trading day.
        """
        logger.info("Starting EOD signal scan...")

        run_id = None
        try:
            if not await self._is_trading_day():
                logger.info("Not a trading day, skipping EOD scan")
                return

            next_trade_date = self._get_next_trading_day()
            # Create run log (status=running)
            try:
                run_row = self.supabase.table("eod_scan_runs").insert({
                    "trade_date": next_trade_date.isoformat(),
                    "status": "running",
                    "source": settings.EOD_SCAN_SOURCE,
                    "scan_type": settings.EOD_SCAN_TYPE,
                    "min_price": settings.EOD_SCAN_MIN_PRICE,
                    "max_price": settings.EOD_SCAN_MAX_PRICE,
                    "min_volume": settings.EOD_SCAN_MIN_VOLUME,
                }).execute()
                if run_row.data:
                    run_id = run_row.data[0].get("id")
            except Exception as e:
                logger.warning(f"Failed to create EOD run log: {e}")

            result = await self.signal_generator.run_eod_scan(
                signal_date=next_trade_date,
                run_id=run_id,
            )
            signals = result.get("signals", [])
            candidate_count = int(result.get("candidate_count", 0))
            source = result.get("source", settings.EOD_SCAN_SOURCE)
            scan_type = result.get("scan_type", settings.EOD_SCAN_TYPE)

            logger.info(f"Generated {len(signals)} EOD signals for {next_trade_date.isoformat()}")

            # Update run log
            if run_id:
                self.supabase.table("eod_scan_runs").update({
                    "status": "success",
                    "finished_at": datetime.utcnow().isoformat(),
                    "candidate_count": candidate_count,
                    "signal_count": len(signals),
                    "source": source,
                    "scan_type": scan_type,
                }).eq("id", run_id).execute()

            if signals and self.notification_service:
                await self.notification_service.broadcast_signals(
                    [s.__dict__ if hasattr(s, "__dict__") else s for s in signals]
                )
        except Exception as e:
            logger.error(f"EOD signal scan failed: {e}")
            if run_id:
                try:
                    self.supabase.table("eod_scan_runs").update({
                        "status": "failed",
                        "finished_at": datetime.utcnow().isoformat(),
                        "error": str(e),
                    }).eq("id", run_id).execute()
                except Exception as log_err:
                    logger.warning(f"Failed to update EOD run log: {log_err}")
    
    async def update_prices(self):
        """
        Every 1 minute - Update current prices for all positions
        """
        if not self._is_market_hours():
            return
        
        try:
            # Get unique symbols from active positions
            positions = self.supabase.table("positions").select(
                "symbol"
            ).eq("is_active", True).execute()
            
            symbols = list(set(p["symbol"] for p in positions.data))
            
            if not symbols:
                return
            
            # Fetch current prices (batch)
            prices = await self._fetch_batch_prices(symbols)
            
            # Update positions
            for pos in positions.data:
                price = prices.get(pos["symbol"])
                if price:
                    self.supabase.table("positions").update({
                        "current_price": price,
                        "unrealized_pnl": self._calculate_pnl(pos, price)
                    }).eq("id", pos["id"]).execute()
            
        except Exception as e:
            logger.error(f"Price update error: {e}")
    
    async def market_close_processing(self):
        """
        3:30 PM - Process end of day
        """
        logger.info("Processing market close...")
        
        try:
            # Mark expired signals
            today = date.today().isoformat()
            self.supabase.table("signals").update({
                "status": "expired"
            }).eq("date", today).eq("status", "active").execute()
            
            # Update signal results based on price action
            await self._update_signal_results()
            
            # Send EOD summary to users
            await self._send_eod_summaries()
            
            logger.info("Market close processing completed")
            
        except Exception as e:
            logger.error(f"Market close processing error: {e}")
    
    async def generate_daily_reports(self):
        """
        4:00 PM - Generate daily reports for all users
        """
        logger.info("Generating daily reports...")
        
        try:
            # Get all active users
            users = self.supabase.table("user_profiles").select(
                "id, email, capital"
            ).execute()
            
            today = date.today().isoformat()
            
            for user in users.data:
                try:
                    # Get today's trades
                    trades = self.supabase.table("trades").select("*").eq(
                        "user_id", user["id"]
                    ).gte("created_at", today).execute()
                    
                    # Get positions
                    positions = self.supabase.table("positions").select("*").eq(
                        "user_id", user["id"]
                    ).eq("is_active", True).execute()
                    
                    # Calculate metrics
                    day_pnl = sum(t.get("net_pnl", 0) or 0 for t in trades.data if t.get("status") == "closed")
                    unrealized_pnl = sum(p.get("unrealized_pnl", 0) or 0 for p in positions.data)
                    trades_taken = len(trades.data)
                    trades_won = len([t for t in trades.data if (t.get("net_pnl") or 0) > 0])
                    
                    # Save to portfolio history
                    self.supabase.table("portfolio_history").upsert({
                        "user_id": user["id"],
                        "date": today,
                        "day_pnl": day_pnl,
                        "day_pnl_percent": (day_pnl / user["capital"]) * 100 if user["capital"] else 0,
                        "trades_taken": trades_taken,
                        "trades_won": trades_won,
                        "win_rate": (trades_won / trades_taken * 100) if trades_taken > 0 else 0
                    }, on_conflict="user_id,date").execute()
                    
                except Exception as e:
                    logger.error(f"Report generation error for user {user['id']}: {e}")
            
            # Generate model performance
            await self._update_model_performance()
            
            logger.info("Daily reports generated")
            
        except Exception as e:
            logger.error(f"Daily report generation error: {e}")
    
    async def weekend_model_check(self):
        """
        Saturday 6 AM - Check model performance, trigger retraining if needed
        """
        logger.info("Checking model performance...")
        
        try:
            # Get last 30 days performance
            start_date = (date.today() - timedelta(days=30)).isoformat()
            
            performance = self.supabase.table("model_performance").select(
                "accuracy, ensemble_accuracy"
            ).gte("date", start_date).execute()
            
            if not performance.data:
                return
            
            avg_accuracy = sum(p["accuracy"] for p in performance.data) / len(performance.data)
            
            logger.info(f"30-day average accuracy: {avg_accuracy:.1f}%")
            
            # Alert if accuracy dropping
            if avg_accuracy < 55:
                if self.notification_service:
                    await self.notification_service.send_admin_alert(
                        "Model Performance Alert",
                        f"30-day accuracy dropped to {avg_accuracy:.1f}%. Consider retraining."
                    )
            
        except Exception as e:
            logger.error(f"Model check error: {e}")
    
    # ========================================================================
    # HELPER METHODS
    # ========================================================================
    
    async def _is_trading_day(self) -> bool:
        """Check if today is a trading day using MarketDataProvider"""
        try:
            from .market_data import get_market_data_provider
            provider = get_market_data_provider()
            return provider.is_trading_day()
        except Exception as e:
            logger.warning(f"Market data provider not available, using fallback: {e}")
            # Fallback to basic check
            today = date.today()
            
            # Weekend
            if today.weekday() >= 5:
                return False
            
            # Check holidays (fetch from NSE calendar)
            holidays = [
                # Add NSE holidays here
                date(2025, 1, 26),  # Republic Day
                date(2025, 3, 14),  # Holi
                # ... etc
            ]
            
            return today not in holidays

    def _get_next_trading_day(self) -> date:
        """Get next trading day date using MarketDataProvider"""
        try:
            from .market_data import get_market_data_provider
            provider = get_market_data_provider()
            next_day = date.today() + timedelta(days=1)
            while not provider.is_trading_day(next_day):
                next_day += timedelta(days=1)
            return next_day
        except Exception as e:
            logger.warning(f"Market data provider not available, using fallback: {e}")
            next_day = date.today() + timedelta(days=1)
            while next_day.weekday() >= 5:
                next_day += timedelta(days=1)
            return next_day
    
    def _is_market_hours(self) -> bool:
        """Check if within market hours using MarketDataProvider"""
        try:
            from .market_data import get_market_data_provider
            provider = get_market_data_provider()
            return provider.is_market_open()
        except Exception as e:
            logger.warning(f"Market data provider not available, using fallback: {e}")
            now = datetime.now().time()
            return time(9, 15) <= now <= time(15, 30) and datetime.now().weekday() < 5
    
    async def _fetch_market_data(self) -> Dict:
        """Fetch current market data using MarketDataProvider"""
        try:
            from .market_data import get_market_data_provider
            provider = get_market_data_provider()
            
            # Get real market overview
            overview = provider.get_market_overview()
            
            nifty = overview.get('nifty', {})
            vix = overview.get('vix', {})
            
            # Calculate gap (compare today's open with yesterday's close)
            nifty_quote = provider.get_quote('NIFTY')
            gap_pct = 0
            if nifty_quote and nifty_quote.open and nifty_quote.close:
                gap_pct = ((nifty_quote.open - nifty_quote.close) / nifty_quote.close) * 100
            
            return {
                "nifty_open": nifty_quote.open if nifty_quote else 0,
                "nifty_close": nifty.get('ltp', 0),
                "nifty_change_percent": nifty.get('change_percent', 0),
                "nifty_gap_pct": gap_pct,
                "vix_close": vix.get('ltp', 15),
                "fii_cash": 0,  # Would need separate data source
                "dii_cash": 0,  # Would need separate data source
                "advances": 0,  # Would need separate data source
                "declines": 0   # Would need separate data source
            }
        except Exception as e:
            logger.warning(f"Market data fetch failed, using fallback: {e}")
            # Fallback to simulated data
            return {
                "nifty_open": 21800,
                "nifty_close": 21850,
                "nifty_change_percent": 0.23,
                "nifty_gap_pct": 0.15,
                "vix_close": 14.5,
                "fii_cash": 1500,
                "dii_cash": 800,
                "advances": 1200,
                "declines": 800
            }
    
    def _determine_market_condition(self, data: Dict) -> Dict:
        """Determine market trend and risk"""
        vix = data.get("vix_close", 15)
        change = data.get("nifty_change_percent", 0)
        
        if vix > 25:
            risk = "HIGH"
        elif vix > 20:
            risk = "MODERATE"
        else:
            risk = "LOW"
        
        if change > 0.5:
            trend = "BULLISH"
        elif change < -0.5:
            trend = "BEARISH"
        else:
            trend = "SIDEWAYS"
        
        recommendation = "Normal trading"
        if risk == "HIGH":
            recommendation = "Reduce position sizes"
        if risk == "EXTREME":
            recommendation = "Avoid new trades"
        
        return {
            "trend": trend,
            "risk_level": risk,
            "recommendation": recommendation
        }
    
    async def _get_current_price(self, symbol: str) -> Optional[float]:
        """Get current price for symbol using MarketDataProvider"""
        try:
            from .market_data import get_market_data_provider
            provider = get_market_data_provider()
            quote = provider.get_quote(symbol)
            return quote.ltp if quote else None
        except Exception as e:
            logger.warning(f"Price fetch failed for {symbol}: {e}")
            return None
    
    async def _fetch_batch_prices(self, symbols: List[str]) -> Dict[str, float]:
        """Fetch prices for multiple symbols using MarketDataProvider"""
        try:
            from .market_data import get_market_data_provider
            provider = get_market_data_provider()
            quotes = provider.get_quotes_batch(symbols)
            return {s: q.ltp for s, q in quotes.items() if q}
        except Exception as e:
            logger.warning(f"Batch price fetch failed: {e}")
            return {}
    
    def _calculate_pnl(self, position: Dict, current_price: float) -> float:
        """Calculate P&L for position"""
        qty = position["quantity"]
        avg = position["average_price"]
        
        if position["direction"] == "LONG":
            return (current_price - avg) * qty
        else:
            return (avg - current_price) * qty
    
    async def _close_position(self, position: Dict, exit_price: float, reason: str):
        """Close a position"""
        # Delegate to trade executor for live positions
        if self.trade_executor and position.get("execution_mode") == "live":
            await self.trade_executor.close_position(position, exit_price, reason)
            return
        
        trade_id = position.get("trade_id")
        
        pnl = self._calculate_pnl(position, exit_price)
        pnl_pct = (pnl / (position["quantity"] * position["average_price"])) * 100
        
        # Update trade
        self.supabase.table("trades").update({
            "status": "closed",
            "exit_price": exit_price,
            "net_pnl": pnl,
            "pnl_percent": pnl_pct,
            "exit_reason": reason,
            "closed_at": datetime.utcnow().isoformat()
        }).eq("id", trade_id).execute()
        
        # Deactivate position
        self.supabase.table("positions").update({
            "is_active": False
        }).eq("id", position["id"]).execute()
        
        # Send notification
        if self.notification_service:
            await self.notification_service.send_to_user(
                position["user_id"],
                "position_closed",
                f"{position['symbol']} closed at ₹{exit_price} ({reason}). P&L: ₹{pnl:.0f}"
            )
        
        logger.info(f"Position closed: {position['symbol']} - {reason} - P&L: {pnl:.0f}")
    
    async def _update_trailing_sl(self, position: Dict, current_price: float):
        """Update trailing stop loss if applicable"""
        # Implementation depends on user settings
        pass
    
    async def _update_signal_results(self):
        """Update signal results based on price action"""
        today = date.today().isoformat()
        
        signals = self.supabase.table("signals").select("*").eq("date", today).execute()
        
        for signal in signals.data:
            # Get price data for signal
            # Check if target or SL was hit
            # Update result field
            pass
    
    async def _send_eod_summaries(self):
        """Send end of day summaries to users"""
        users = self.supabase.table("user_profiles").select(
            "id, email, notifications_enabled"
        ).eq("notifications_enabled", True).execute()
        
        if not self.notification_service:
            return

        for user in users.data:
            await self.notification_service.send_daily_summary(user["id"])
    
    async def _update_model_performance(self):
        """Calculate and save model performance"""
        today = date.today().isoformat()
        
        signals = self.supabase.table("signals").select("*").eq("date", today).execute()
        
        total = len(signals.data)
        correct = len([s for s in signals.data if s.get("result") == "win"])
        
        self.supabase.table("model_performance").upsert({
            "date": today,
            "total_signals": total,
            "correct_signals": correct,
            "accuracy": (correct / total * 100) if total > 0 else 0
        }, on_conflict="date").execute()


# ============================================================================
# USAGE
# ============================================================================

if __name__ == "__main__":
    # Initialize and start scheduler
    # scheduler = SchedulerService(...)
    # scheduler.start()
    pass
