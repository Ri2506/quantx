"""
================================================================================
SCHEDULER SERVICE — Production Orchestrator
================================================================================
Handles all automated tasks for 6 strategies (Consolidation Breakout,
Trend Pullback, Candle Reversal, BOS Structure, Reversal Patterns,
Volume Reversal):

- 8:30 AM: Pre-market broadcast of active signals
- 9:15 AM: Market open gap/VIX checks
- 9:30 AM: Execute pending trades (full_auto / approved semi_auto)
- Every 5 min: Position monitoring + signal lifecycle tracking
- 3:30 PM: Market close — expire old signals, update lifecycle
- 3:45 PM: EOD scanner → signal generation (for next trading day)
- 4:00 PM: Daily reports + model performance (30-day rolling)
- Saturday 6 AM: Weekly performance check + retrain alerts

Signal lifecycle:
  active → triggered (price enters entry zone ±0.5%)
  triggered → target_hit | sl_hit | expired (after SIGNAL_VALIDITY_DAYS)

Note: SwingBot (ml/bot.py) is for backtest-only. This scheduler is the
production orchestrator that uses SignalGenerator for live signal creation.
================================================================================
"""

import os
import sys
import asyncio
from datetime import datetime, date, time, timedelta
from pathlib import Path
from typing import Dict, List, Optional
import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger

# Allow importing from repo root (ml module)
_ROOT_DIR = Path(__file__).resolve().parents[3]
if str(_ROOT_DIR) not in sys.path:
    sys.path.append(str(_ROOT_DIR))
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

        # Kite admin token auto-refresh - 6:05 AM IST daily (token expires at 6 AM)
        self.scheduler.add_job(
            self.refresh_kite_admin_token,
            CronTrigger(hour=6, minute=5, day_of_week="mon-fri"),
            id="kite_token_refresh",
            name="Kite Admin Token Auto-Refresh"
        )

        # User broker token refresh - 6:10 AM IST daily (after admin token)
        self.scheduler.add_job(
            self.refresh_user_broker_tokens,
            CronTrigger(hour=6, minute=10, day_of_week="mon-fri"),
            id="user_broker_token_refresh",
            name="User Broker Token Auto-Refresh"
        )

        # PR 106 — critical jobs run via _run_with_retry (auto-retries
        # 5 min later on failure, max 2 attempts). Every signal that
        # day depends on regime + pre-market scan + EOD scan
        # succeeding; transient flakes shouldn't dark the platform.
        self.scheduler.add_job(
            self._run_with_retry,
            CronTrigger(hour=8, minute=15, day_of_week="mon-fri"),
            args=["update_market_regime"],
            id="update_market_regime",
            name="Update HMM Market Regime"
        )

        # Pre-market scan - 8:30 AM IST (with retry — PR 106).
        self.scheduler.add_job(
            self._run_with_retry,
            CronTrigger(hour=8, minute=30, day_of_week="mon-fri"),
            args=["pre_market_scan"],
            id="pre_market_scan",
            name="Pre-Market Scan & Signal Generation"
        )
        
        # Auto-create trades from signals - 8:45 AM IST
        self.scheduler.add_job(
            self._create_trades_from_signals,
            CronTrigger(hour=8, minute=45, day_of_week="mon-fri"),
            id="create_trades_from_signals",
            name="Auto-Create Trades from Signals"
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

        # PR 109 — watchlist price-alert scanner. Every 5 min during the
        # day, every row with alert_enabled + a threshold gets compared
        # to live LTP. Crossings fire a `price_alert` notification (the
        # same channel signal_triggered uses), debounced via the
        # alert_last_fired_at column so a sustained breach doesn't spam.
        self.scheduler.add_job(
            self.scan_watchlist_alerts,
            IntervalTrigger(minutes=5),
            id="watchlist_price_alerts",
            name="Watchlist Price Alerts"
        )

        # PR 136 — F1 TickPulse intraday inference. Every 5 minutes
        # during market hours, run the Bi-LSTM ONNX predictor across
        # the intraday universe and emit fresh intraday signals.
        # Runs the inner is-trading-day + market-open guard inside the
        # handler since IntervalTrigger doesn't honour day_of_week.
        self.scheduler.add_job(
            self.run_intraday_inference,
            IntervalTrigger(minutes=5),
            id="intraday_lstm_inference",
            name="Intraday LSTM Inference (F1)"
        )
        
        # Market close - 3:30 PM IST
        self.scheduler.add_job(
            self.market_close_processing,
            CronTrigger(hour=15, minute=30, day_of_week="mon-fri"),
            id="market_close",
            name="Market Close Processing"
        )
        
        # Broker position reconciliation - 3:35 PM IST
        self.scheduler.add_job(
            self._reconcile_broker_positions,
            CronTrigger(hour=15, minute=35, day_of_week="mon-fri"),
            id="broker_reconciliation",
            name="Broker Position Reconciliation"
        )

        # ── OPTIONS MARKETPLACE JOBS ──

        # Options signal scan - 9:30 AM IST (needs live chain data)
        self.scheduler.add_job(
            self.options_signal_scan,
            CronTrigger(hour=9, minute=30, day_of_week="mon-fri"),
            id="options_signal_scan",
            name="Options Strategy Signal Scan"
        )

        # Options position monitoring - Every 15 min during market hours
        self.scheduler.add_job(
            self.options_position_monitor,
            IntervalTrigger(minutes=15),
            id="options_position_monitor",
            name="Options Position Monitoring"
        )

        # End-of-day scanner - 3:45 PM IST (signals for next trading day)
        # PR 106 — retry-wrapped: a failed EOD scan means tomorrow opens
        # without fresh signals.
        self.scheduler.add_job(
            self._run_with_retry,
            CronTrigger(hour=15, minute=45, day_of_week="mon-fri"),
            args=["eod_signal_scan"],
            id="eod_signal_scan",
            name="EOD Scanner & Signal Generation"
        )

        # QuantAI Alpha Picks generation - 4:15 PM IST (after SwingMax at 3:45)
        self.scheduler.add_job(
            self.generate_quantai_picks,
            CronTrigger(hour=16, minute=15, day_of_week="mon-fri"),
            id="quantai_picks",
            name="QuantAI Alpha Picks Generation"
        )

        # PR 131 — AutoPilot daily rebalance at 3:50 PM IST. Runs after
        # the 3:45 EOD scan so the freshly-computed regime + signals
        # feed the FinRL-X ensemble's observation. Per Step 1 §F4.
        self.scheduler.add_job(
            self.run_autopilot_rebalance,
            CronTrigger(hour=15, minute=50, day_of_week="mon-fri"),
            id="autopilot_rebalance",
            name="AutoPilot Daily Rebalance (F4)"
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

        # Weekly HMM retrain — Sunday 03:00 IST. Step 2 §1.12: extend the
        # trailing window and re-fit on 10 years daily. CPU only, <5 min.
        self.scheduler.add_job(
            self.retrain_hmm_weekly,
            CronTrigger(hour=3, minute=0, day_of_week="sun"),
            id="hmm_weekly_retrain",
            name="HMM Regime Detector Weekly Retrain",
        )

        # PR 27 — subscription lifecycle check, daily 06:15 IST (after
        # broker token refresh, before the market-day jobs). Expires
        # past-due paid subs + sends 3-day renewal reminders.
        self.scheduler.add_job(
            self.subscription_lifecycle_check,
            CronTrigger(hour=6, minute=15),
            id="subscription_lifecycle_check",
            name="Subscription Lifecycle Check",
        )

        # ── PR 7 — AI pipeline jobs ──────────────────────────────────────────
        # The 6 AI jobs below register their cron and telemetry NOW so the
        # schedule graph is complete; their bodies are stubs until the
        # respective feature PRs land (see method docstrings).

        # 15:40 IST — Qlib Alpha158 + LightGBM nightly alpha scoring (PR 9).
        self.scheduler.add_job(
            self.qlib_nightly_rank,
            CronTrigger(hour=15, minute=40, day_of_week="mon-fri"),
            id="qlib_nightly_rank",
            name="Qlib Alpha158 Nightly Rank",
        )

        # 15:50 IST — TimesFM + Chronos-Bolt ensemble nightly forecast (PR 10).
        self.scheduler.add_job(
            self.chronos_nightly_forecast,
            CronTrigger(hour=15, minute=50, day_of_week="mon-fri"),
            id="chronos_nightly_forecast",
            name="TimesFM + Chronos Nightly Forecast",
        )

        # 16:30 IST — FinBERT-India sentiment refresh (PR 11).
        self.scheduler.add_job(
            self.finbert_sentiment_refresh,
            CronTrigger(hour=16, minute=30, day_of_week="mon-fri"),
            id="finbert_sentiment_refresh",
            name="FinBERT-India Sentiment Refresh",
        )

        # 17:00 IST — Earnings predictor scan for next 7 days (F9, later PR).
        self.scheduler.add_job(
            self.earnings_predictor_scan,
            CronTrigger(hour=17, minute=0, day_of_week="mon-fri"),
            id="earnings_predictor_scan",
            name="Earnings Predictor (next 7d)",
        )

        # 17:15 IST — Sector rotation aggregate (F10, PR 32). Runs after
        # Qlib rank (15:40) and Chronos forecast (15:50) — needs fresh
        # ``alpha_scores`` rows to group by sector.
        self.scheduler.add_job(
            self.sector_rotation_aggregate,
            CronTrigger(hour=17, minute=15, day_of_week="mon-fri"),
            id="sector_rotation_aggregate",
            name="Sector Rotation Aggregate (F10)",
        )

        # 23:00 IST daily — paper portfolio snapshot powering /paper-trading
        # equity curve + league leaderboard (F11 / N6).
        self.scheduler.add_job(
            self.snapshot_paper_portfolios,
            CronTrigger(hour=23, minute=0),
            id="snapshot_paper_portfolios",
            name="Paper Portfolio Daily Snapshot",
        )

        # Sunday 08:00 IST — N10 weekly portfolio review generation for
        # every Pro+ user (PR 38). Uses Gemini; rule-based fallback when
        # the LLM is unavailable.
        self.scheduler.add_job(
            self.weekly_review_generate,
            CronTrigger(hour=8, minute=0, day_of_week="sun"),
            id="weekly_review_generate",
            name="Weekly Portfolio Review Generation (N10)",
        )

        # PR 138 — Monday 06:30 IST: Top-10 momentum picks email for
        # every Pro+ subscriber. Picks are the latest cross-sectional
        # rank from QuantAIEngine fused with the Chronos zero-shot
        # forecast (registered by PR 137).
        self.scheduler.add_job(
            self.momentum_weekly_email,
            CronTrigger(hour=6, minute=30, day_of_week="mon"),
            id="momentum_weekly_email",
            name="Momentum Weekly Top-10 Email (F3)",
        )

        # PR 61 — F12 morning digest (7:30 IST, Mon-Fri). Fans out to
        # every onboarded user with Telegram (free) or WhatsApp (Pro)
        # enabled. Deterministic template with an optional Gemini-
        # generated intro sentence.
        self.scheduler.add_job(
            self.morning_digest_deliver,
            CronTrigger(hour=7, minute=30, day_of_week="mon-fri"),
            id="morning_digest",
            name="F12 Morning Digest (7:30 IST)",
        )

        # PR 61 — F12 evening summary (17:30 IST, Mon-Fri). Closed
        # trades + regime + Nifty close.
        self.scheduler.add_job(
            self.evening_digest_deliver,
            CronTrigger(hour=17, minute=30, day_of_week="mon-fri"),
            id="evening_digest",
            name="F12 Evening Digest (17:30 IST)",
        )

        # Daily 03:30 IST — N12 expire referrals still pending >90 days
        # (PR 44). Low-traffic pre-dawn slot keeps it out of user paths.
        self.scheduler.add_job(
            self.referral_expire_pending,
            CronTrigger(hour=3, minute=30),
            id="referral_expire_pending",
            name="Referral Pending Expiry (N12)",
        )

        # Every 5 min during market hours (9:30–15:10 IST Mon-Fri) —
        # PR 50 F1 TickPulse intraday scan. Gated by ENABLE_TICKPULSE env
        # flag so the heuristic v0 stays off until an admin flips it on.
        from ..core.config import settings as _settings
        if _settings.ENABLE_TICKPULSE:
            self.scheduler.add_job(
                self.tickpulse_scan,
                CronTrigger(
                    minute="*/5", hour="9-15", day_of_week="mon-fri",
                ),
                id="tickpulse_scan",
                name="TickPulse Intraday Scan (F1)",
            )

        # PR 51 — First-of-month 02:00 IST: EarningsScout XGBoost retrain.
        # Skips silently when labeled-row count is below threshold.
        self.scheduler.add_job(
            self.earnings_scout_retrain,
            CronTrigger(day=1, hour=2, minute=0),
            id="earnings_scout_retrain",
            name="EarningsScout Monthly Retrain (F9)",
        )

        # Last Sunday of the month at 00:00 IST — AI SIP portfolio rebalance
        # proposals (F5, PR 12). Cron runs every Sunday; job body checks it's
        # the last Sunday before executing.
        self.scheduler.add_job(
            self.ai_portfolio_monthly_rebalance,
            CronTrigger(hour=0, minute=0, day_of_week="sun"),
            id="ai_portfolio_monthly_rebalance",
            name="AI SIP Portfolio Monthly Rebalance",
        )

        # Sunday 02:00 IST — aggregate closed-signal outcomes into
        # model_rolling_performance (powers public /models page + admin
        # drift monitoring).
        self.scheduler.add_job(
            self.aggregate_model_rolling_performance,
            CronTrigger(hour=2, minute=0, day_of_week="sun"),
            id="aggregate_model_rolling_performance",
            name="Model Rolling Performance Aggregator",
        )

        # Every 5 minutes during market hours — intraday LSTM signal
        # generation (F1, future PR). Gated by trading-day + market-hours
        # check inside the method.
        self.scheduler.add_job(
            self.intraday_lstm_scan,
            IntervalTrigger(minutes=5),
            id="intraday_lstm_scan",
            name="Intraday LSTM Signal Scan (F1)",
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
    # TELEMETRY — every job writes one row to public.scheduler_job_runs
    # (created in PR 2 migration). Admin dashboard surfaces last N runs;
    # ops alerts trigger off status != 'success'.
    # ========================================================================

    def _write_job_run(
        self,
        job_name: str,
        started_at: datetime,
        status: str,
        error: Optional[str] = None,
        items_processed: Optional[int] = None,
        metadata: Optional[Dict] = None,
    ) -> None:
        """Insert a scheduler_job_runs row. Best-effort; never raises."""
        duration_ms = int((datetime.utcnow() - started_at).total_seconds() * 1000)
        try:
            self.supabase.table("scheduler_job_runs").insert({
                "job_name": job_name,
                "triggered_at": started_at.isoformat(),
                "completed_at": datetime.utcnow().isoformat(),
                "status": status,
                "duration_ms": duration_ms,
                "items_processed": items_processed,
                "error": error,
                "metadata": metadata or {},
            }).execute()
        except Exception as exc:
            logger.debug("scheduler_job_runs write failed for %s: %s", job_name, exc)

        # PR 16 — analytics + Sentry escalation for failed jobs.
        if status == "failed":
            try:
                from ..observability import EventName, add_breadcrumb, track
                add_breadcrumb(
                    category="scheduler",
                    message=f"{job_name} failed",
                    data={"error": error, "duration_ms": duration_ms},
                    level="error",
                )
                track(EventName.SCHEDULER_JOB_FAILED, None, {
                    "job_name": job_name,
                    "error": error,
                    "duration_ms": duration_ms,
                })
            except Exception:
                pass

    # PR 106 — automatic retry on critical jobs. APScheduler's
    # `misfire_grace_time` only handles "the trigger fired but the
    # process was down" — it doesn't recover jobs that ran and threw.
    # We wrap critical jobs so a transient data-source flake or
    # broker-API hiccup gets one more shot 5 minutes later instead
    # of leaving the platform without a regime / signals / EOD scan
    # for the rest of the day.
    _RETRY_DELAY_MIN = 5
    _MAX_RETRIES = 2

    async def _run_with_retry(self, job_name: str, attempt: int = 1):
        """Execute the bound coroutine for ``job_name`` and on failure
        re-schedule a one-shot retry up to ``_MAX_RETRIES`` total.

        Tracks each retry as a separate ``scheduler_job_runs`` row so
        ops can see "ran on attempt 2 after 1 failure" in the audit
        without hunting through error logs.
        """
        coro_fn = getattr(self, job_name, None)
        if not callable(coro_fn):
            logger.error("scheduler retry: unknown job %s", job_name)
            return

        try:
            await coro_fn()
            return  # success — no retry needed
        except Exception as exc:
            logger.warning(
                "scheduler retry: %s failed on attempt %d/%d: %s",
                job_name, attempt, self._MAX_RETRIES, exc,
            )
            if attempt >= self._MAX_RETRIES:
                # Final failure already recorded by the inner job's
                # _write_job_run (which fired the SCHEDULER_JOB_FAILED
                # event). Stop here; ops can decide whether to fire
                # /admin/scan/trigger manually.
                return
            # Schedule the next attempt 5 min out via APScheduler so it
            # runs on the same event loop without blocking this one.
            try:
                next_run = datetime.utcnow() + timedelta(minutes=self._RETRY_DELAY_MIN)
                # Unique id per attempt so we don't collide if a future
                # cron firing also runs.
                retry_id = f"{job_name}_retry_{int(next_run.timestamp())}"
                self.scheduler.add_job(
                    self._run_with_retry,
                    DateTrigger(run_date=next_run),
                    args=[job_name, attempt + 1],
                    id=retry_id,
                    name=f"{job_name} retry {attempt + 1}/{self._MAX_RETRIES}",
                    replace_existing=False,
                )
                logger.info(
                    "scheduler retry: %s rescheduled at %s (attempt %d)",
                    job_name, next_run.isoformat(), attempt + 1,
                )
            except Exception as sched_exc:
                logger.error("scheduler retry: failed to reschedule %s: %s", job_name, sched_exc)

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

            # Auto-reset kill switches for new trading day
            try:
                self.supabase.table("user_profiles").update({
                    "kill_switch_active": False
                }).eq("kill_switch_active", True).execute()
                logger.info("Kill switches reset for new trading day")
            except Exception as e:
                logger.warning(f"Kill switch reset failed: {e}")

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
    
    async def refresh_kite_admin_token(self):
        """
        6:05 AM - Auto-refresh Kite admin access token (expires daily at 6 AM IST).

        Uses headless login with TOTP. If auto-refresh fails (missing creds or
        Zerodha changes their flow), logs a warning — admin must refresh manually
        via POST /admin/kite/refresh-token.
        """
        logger.info("Starting Kite admin token auto-refresh...")

        try:
            from .kite_data_provider import auto_refresh_kite_token

            # Run in thread pool since it does synchronous HTTP calls
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(None, auto_refresh_kite_token)

            if success:
                logger.info("Kite admin token refreshed automatically")
            else:
                logger.warning(
                    "Kite auto-refresh failed — manual refresh required. "
                    "Admin: POST /api/admin/kite/refresh-token?request_token=..."
                )
                if self.notification_service:
                    await self.notification_service.send_admin_alert(
                        "Kite Token Refresh Failed",
                        "Auto-refresh could not complete. Log in manually at "
                        "https://kite.trade and use /admin/kite/refresh-token."
                    )
        except Exception as e:
            logger.error(f"Kite token refresh job error: {e}", exc_info=True)
            if self.notification_service:
                await self.notification_service.send_admin_alert(
                    "Kite Token Refresh Error",
                    str(e)
                )

    async def refresh_user_broker_tokens(self):
        """
        6:10 AM - Auto-refresh enctoken for all connected Zerodha users.
        Decrypts stored credentials → auto-login → updates enctoken.
        """
        logger.info("Refreshing user broker tokens...")

        try:
            connections = self.supabase.table("broker_connections").select(
                "id, user_id, broker_name, access_token, account_id"
            ).eq("status", "connected").execute()

            if not connections.data:
                logger.info("No connected brokers to refresh")
                return

            from ..api.broker_routes import _zerodha_auto_login
            from .broker_credentials import decrypt_credentials, encrypt_credentials

            refreshed = 0
            failed = 0

            for conn in connections.data:
                broker = conn.get("broker_name")
                conn_id = conn.get("id")
                account_id = conn.get("account_id", "?")

                try:
                    creds = decrypt_credentials(conn["access_token"])
                except Exception:
                    logger.warning(f"Failed to decrypt creds for {account_id}")
                    failed += 1
                    continue

                if broker == "zerodha":
                    kite_uid = creds.get("kite_user_id")
                    kite_pwd = creds.get("kite_password")
                    totp_sec = creds.get("totp_secret")

                    if not all([kite_uid, kite_pwd, totp_sec]):
                        logger.warning(f"Missing login creds for {account_id} — skip refresh")
                        failed += 1
                        continue

                    loop = asyncio.get_event_loop()
                    new_enctoken = await loop.run_in_executor(
                        None, _zerodha_auto_login, kite_uid, kite_pwd, totp_sec
                    )

                    if new_enctoken:
                        creds["enctoken"] = new_enctoken
                        encrypted = encrypt_credentials(creds)
                        self.supabase.table("broker_connections").update({
                            "access_token": encrypted,
                            "last_synced_at": datetime.utcnow().isoformat(),
                        }).eq("id", conn_id).execute()
                        refreshed += 1
                        logger.info(f"Refreshed token for {account_id}")
                    else:
                        failed += 1
                        logger.warning(f"Token refresh failed for {account_id}")

                # Angel One: try refresh via stored credentials
                elif broker == "angelone":
                    try:
                        from SmartApi import SmartConnect
                        import pyotp

                        smart = SmartConnect(api_key=creds.get("api_key"))
                        totp_val = pyotp.TOTP(creds["totp_secret"]).now()
                        data = smart.generateSession(
                            creds["client_id"], creds["password"], totp_val
                        )
                        if data and data.get("status") is not False:
                            creds["access_token"] = data["data"]["jwtToken"]
                            creds["refresh_token"] = data["data"].get("refreshToken", "")
                            encrypted = encrypt_credentials(creds)
                            self.supabase.table("broker_connections").update({
                                "access_token": encrypted,
                                "last_synced_at": datetime.utcnow().isoformat(),
                            }).eq("id", conn_id).execute()
                            refreshed += 1
                        else:
                            failed += 1
                    except Exception as e:
                        logger.warning(f"Angel One refresh failed for {account_id}: {e}")
                        failed += 1

            logger.info(f"Broker token refresh done: {refreshed} OK, {failed} failed")

        except Exception as e:
            logger.error(f"User broker token refresh error: {e}", exc_info=True)

    async def update_market_regime(self):
        """
        8:15 AM — Detect market regime using HMM.

        Writes:
          - ``market_data`` (upsert, daily single-row — legacy consumers)
          - ``regime_history`` (append-only, powers public /regime timeline)
          - ``scheduler_job_runs`` (telemetry)
        """
        logger.info("Updating HMM market regime...")
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None

        try:
            if not await self._is_trading_day():
                logger.info("Not a trading day, skipping regime update")
                status = "skipped"
                return

            from ml.regime_detector import MarketRegimeDetector, compute_regime_features
            try:
                from ..ai.registry import resolve_model_file
            except ImportError:
                resolve_model_file = None

            # Resolve model via registry (B2) with disk fallback.
            disk_path = _ROOT_DIR / "ml" / "models" / "regime_hmm.pkl"
            regime_path = (
                resolve_model_file("regime_hmm", "regime_hmm.pkl", disk_path)
                if resolve_model_file is not None
                else (disk_path if disk_path.exists() else None)
            )
            if regime_path is None:
                logger.warning("Regime model not resolvable, skipping")
                status = "skipped"
                return

            detector = MarketRegimeDetector()
            detector.load(str(regime_path))

            if not detector.is_trained:
                logger.warning("Regime detector not trained, skipping")
                status = "skipped"
                return

            # Download recent Nifty + VIX data
            from .market_data import get_market_data_provider
            provider = get_market_data_provider()

            nifty = provider.get_historical("NIFTY", period="6mo", interval="1d")
            if nifty is None or len(nifty) < 30:
                logger.warning("Insufficient Nifty data for regime detection")
                status = "skipped"
                return

            nifty.columns = [c.lower() for c in nifty.columns]

            vix = None
            try:
                vix = provider.get_historical("VIX", period="6mo", interval="1d")
                if vix is not None and len(vix) > 0:
                    vix.columns = [c.lower() for c in vix.columns]
            except Exception:
                pass

            features = compute_regime_features(nifty, vix)
            regime_info = detector.predict_regime(features)

            logger.info(
                "Market regime: %s (confidence=%.2f, probs=%s)",
                regime_info["regime"],
                regime_info["confidence"],
                regime_info["probabilities"],
            )

            # --- Upsert legacy market_data row (single current-regime snapshot)
            import json
            today = date.today().isoformat()
            self.supabase.table("market_data").upsert({
                "date": today,
                "regime": regime_info["regime"],
                "regime_confidence": regime_info["confidence"],
                "regime_probabilities": json.dumps(regime_info["probabilities"]),
            }, on_conflict="date").execute()

            # --- Append regime_history row (PR 2 table — F8 timeline).
            # Before inserting, read the most-recent prior row so we can
            # detect transitions (PR 13 REGIME_CHANGE emit).
            previous_regime: Optional[str] = None
            try:
                prior = (
                    self.supabase.table("regime_history")
                    .select("regime")
                    .order("detected_at", desc=True)
                    .limit(1)
                    .execute()
                )
                prior_rows = prior.data or []
                previous_regime = prior_rows[0]["regime"] if prior_rows else None
            except Exception as prior_err:
                logger.debug("prior regime read failed: %s", prior_err)

            probs = regime_info.get("probabilities", {})
            nifty_close = float(nifty["close"].iloc[-1]) if "close" in nifty.columns else None
            vix_level = None
            if vix is not None and len(vix) > 0 and "close" in vix.columns:
                try:
                    vix_level = float(vix["close"].iloc[-1])
                except Exception:
                    vix_level = None
            try:
                self.supabase.table("regime_history").insert({
                    "regime": regime_info["regime"],
                    "prob_bull": round(float(probs.get("bull", 0.0)), 4),
                    "prob_sideways": round(float(probs.get("sideways", 0.0)), 4),
                    "prob_bear": round(float(probs.get("bear", 0.0)), 4),
                    "vix": vix_level,
                    "nifty_close": nifty_close,
                    # Chronos-2 persistence layer lands in a later PR.
                    "persistence_prob": None,
                    "detected_at": datetime.utcnow().isoformat(),
                }).execute()
            except Exception as hist_err:
                logger.warning("regime_history write failed: %s", hist_err)

            # ── PR 13: emit REGIME_CHANGE on transitions so the banner + kill-switch
            # gate reacts live instead of waiting for a page refresh.
            try:
                new_regime = regime_info["regime"]
                if previous_regime and previous_regime != new_regime:
                    from .event_bus import MessageType, emit_event
                    await emit_event(
                        MessageType.REGIME_CHANGE,
                        {
                            "old_regime": previous_regime,
                            "new_regime": new_regime,
                            "confidence": regime_info.get("confidence", 0.0),
                            "probabilities": probs,
                            "vix": vix_level,
                            "nifty_close": nifty_close,
                            "detected_at": datetime.utcnow().isoformat(),
                        },
                    )
                    logger.info(
                        "REGIME_CHANGE emitted: %s → %s", previous_regime, new_regime,
                    )
            except Exception as emit_err:
                logger.debug("REGIME_CHANGE emit skipped: %s", emit_err)

            logger.info("Regime saved: %s", regime_info["regime"])

        except ImportError as e:
            status = "failed"
            err_msg = f"missing dependency: {e}"
            logger.warning(f"Regime detection unavailable (missing dependency): {e}")
        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error(f"Market regime update failed: {e}")
        finally:
            # Telemetry row — scheduler_job_runs table (PR 2).
            try:
                self.supabase.table("scheduler_job_runs").insert({
                    "job_name": "update_market_regime",
                    "triggered_at": started_at.isoformat(),
                    "completed_at": datetime.utcnow().isoformat(),
                    "status": status,
                    "duration_ms": int((datetime.utcnow() - started_at).total_seconds() * 1000),
                    "error": err_msg,
                }).execute()
            except Exception:
                # Telemetry is best-effort, never raise.
                pass

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

        # PR 48 — global kill-switch short-circuit. Skip the entire job
        # when the platform is halted; per-user kill_switch_active stays
        # as the secondary gate below.
        try:
            from ..services.system_flags import is_globally_halted, global_halt_reason
            if is_globally_halted(supabase_client=self.supabase):
                reason = global_halt_reason(supabase_client=self.supabase) or "ops halt"
                logger.warning(
                    "execute_pending_trades: global kill switch active — skipping (%s)",
                    reason,
                )
                return
        except Exception as kill_exc:
            logger.debug("kill-switch check in execute_pending_trades skipped: %s", kill_exc)

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
                # Skip OPTIONS positions — handled by options_position_monitor
                if pos.get("segment") == "OPTIONS" or pos.get("product_type") == "NRML":
                    continue

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

            # Enforce daily risk limits (auto-activate kill switch if breached)
            await self._enforce_daily_risk_limits()

            # Also track signal lifecycle during market hours
            await self._update_signal_lifecycle()

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
    
    async def momentum_weekly_email(self):
        """
        PR 138 — Monday 06:30 IST top-10 momentum email.

        Reads the latest cross-sectional ranking from QuantAIEngine,
        renders a deterministic top-10 list, and dispatches via the
        existing Resend email pipeline. Failure is logged + skipped per
        user; the job never throws.
        """
        logger.info("Starting Monday momentum top-10 email...")
        try:
            from .quantai_engine import QuantAIEngine
            from .push_service import PushService
        except Exception as exc:
            logger.warning("momentum email deps unavailable: %s", exc)
            return

        try:
            engine = QuantAIEngine(supabase_client=self.supabase)
            if not engine.is_ready:
                logger.warning("momentum email skipped — QuantAI not loaded")
                return
            picks = await engine.generate_daily_picks(top_n=10)
        except Exception as exc:
            logger.warning("momentum picks generation failed: %s", exc)
            return
        if not picks:
            return

        try:
            users = (
                self.supabase.table("user_profiles")
                .select("id, email, full_name, tier")
                .in_("tier", ["pro", "elite"])
                .eq("notifications_enabled", True)
                .execute()
            )
        except Exception as exc:
            logger.warning("momentum email user query failed: %s", exc)
            return

        push = PushService()
        sent = 0
        for u in users.data or []:
            email = u.get("email")
            if not email:
                continue
            lines = [
                f"{i+1}. {p.get('symbol')} — score {round(float(p.get('score') or 0), 3)}"
                for i, p in enumerate(picks)
            ]
            body = (
                f"Top 10 momentum picks for the week\n\n"
                + "\n".join(lines)
                + "\n\nFull dossier: https://quantx.ai/momentum"
            )
            try:
                await push.send_email(
                    to=email,
                    subject="Quant X — Momentum top 10 this week",
                    body=body,
                )
                sent += 1
            except Exception as exc:
                logger.debug("momentum email failed for %s: %s", email, exc)
        logger.info("Momentum email: sent=%d", sent)

    async def run_intraday_inference(self):
        """
        PR 136 — every 5 min during NSE market hours, score the intraday
        universe with the Bi-LSTM ONNX model and write fresh intraday
        signal rows. Lazy-loads the predictor so a missing artifact
        before Phase H trains the model is a one-line WARN, not a crash.
        """
        try:
            if not await self._is_trading_day():
                return
            if not await self._is_market_open():
                return
        except Exception:
            return

        try:
            from .intraday_lstm_predictor import (
                IntradayLSTMPredictor,
                build_window_from_5min,
                CLASS_LABELS,
            )
        except Exception as exc:
            logger.debug("intraday predictor module unavailable: %s", exc)
            return

        try:
            predictor = self._get_intraday_predictor()
        except Exception as exc:
            logger.warning("intraday LSTM artifact not loaded: %s", exc)
            return
        if predictor is None:
            return

        # Universe — kept tight (Nifty + Bank Nifty constituents). Same
        # set the trainer used so feature scaling is consistent.
        from .intraday_lstm_predictor import build_window_from_5min as _bw  # noqa: F401
        from ..core.config import settings  # noqa: PLC0415
        symbols = getattr(settings, "INTRADAY_UNIVERSE", None) or [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK", "SBIN",
            "BHARTIARTL", "KOTAKBANK", "AXISBANK", "LT",
        ]

        try:
            from .market_data import get_market_data_provider  # noqa: PLC0415
            provider = get_market_data_provider()
        except Exception as exc:
            logger.debug("market data provider unavailable: %s", exc)
            return

        emitted = 0
        for sym in symbols:
            try:
                df = await provider.get_historical_async(sym, period="5d", interval="5m")
                if df is None or df.empty:
                    continue
                if "Close" not in df.columns and "close" in df.columns:
                    df.columns = [c.title() for c in df.columns]
                window = build_window_from_5min(df.tail(60))
                if window is None:
                    continue
                scores = predictor.score(window)
                top = max(scores, key=scores.get)
                if top == "neutral":
                    continue
                # Write a lightweight intraday signal row. Down-stream
                # SignalGenerator promotes high-conviction picks.
                self.supabase.table("signals").insert({
                    "symbol": sym,
                    "exchange": "NSE",
                    "segment": "EQUITY",
                    "signal_type": "intraday",
                    "direction": "LONG" if top == "bull" else "SHORT",
                    "confidence": int(round(scores[top] * 100)),
                    "engine_name": "TickPulse",
                    "model_score": scores[top],
                    "raw_scores": scores,
                    "status": "active",
                }).execute()
                emitted += 1
            except Exception as exc:
                logger.debug("intraday score failed for %s: %s", sym, exc)
        if emitted:
            logger.info("Intraday LSTM emitted %d signals", emitted)

    def _get_intraday_predictor(self):
        """Cache the predictor across ticks so we load the ONNX once."""
        if not hasattr(self, "_intraday_predictor_cache"):
            self._intraday_predictor_cache = None
            self._intraday_predictor_attempted = False
        if self._intraday_predictor_cache is not None:
            return self._intraday_predictor_cache
        if self._intraday_predictor_attempted:
            return None
        self._intraday_predictor_attempted = True
        try:
            from .intraday_lstm_predictor import IntradayLSTMPredictor  # noqa: PLC0415
            self._intraday_predictor_cache = IntradayLSTMPredictor.load_prod()
            logger.info("Intraday LSTM predictor loaded")
        except Exception as exc:
            logger.warning("intraday predictor load failed: %s", exc)
        return self._intraday_predictor_cache

    async def run_autopilot_rebalance(self):
        """
        PR 131 — 3:50 PM IST AutoPilot rebalance.

        Loads the FinRL-X ensemble (PPO+DDPG+A2C), pulls current regime,
        iterates over Elite + autopilot_enabled users and records target
        weights into auto_trader_runs. Live execution wiring lands in
        PR 134; this PR ships the decision-emission half so the
        ``/auto-trader`` dashboard can render today's plan.
        """
        logger.info("Starting AutoPilot daily rebalance...")
        try:
            if not await self._is_trading_day():
                logger.info("Not a trading day, skipping AutoPilot")
                return

            from .autopilot_service import AutoPilotService
            svc = AutoPilotService(self.supabase)
            summary = await svc.daily_rebalance()
            logger.info("AutoPilot rebalance summary: %s", summary)
        except Exception as exc:
            logger.exception("AutoPilot rebalance failed: %s", exc)

    async def generate_quantai_picks(self):
        """
        4:15 PM - Generate QuantAI Alpha Picks for the day.
        Uses ML-powered stock ranker to score and rank all stocks, then saves
        top picks to the quantai_picks table.
        """
        logger.info("Starting QuantAI Alpha Picks generation...")

        try:
            if not await self._is_trading_day():
                logger.info("Not a trading day, skipping QuantAI picks")
                return

            from .quantai_engine import QuantAIEngine

            engine = QuantAIEngine(supabase_client=self.supabase)

            if not engine.is_ready:
                logger.warning(
                    "QuantAI model not loaded. Run `python scripts/train_quantai.py` to train."
                )
                return

            picks = await engine.generate_daily_picks(top_n=15)

            if picks:
                await engine.save_picks_to_db(picks)
                logger.info(
                    "QuantAI: saved %d picks. Top pick: %s (confidence=%d)",
                    len(picks),
                    picks[0]["symbol"],
                    picks[0]["confidence_score"],
                )

                # Notify via notification service
                if self.notification_service:
                    summary = ", ".join(p["symbol"] for p in picks[:5])
                    await self.notification_service.broadcast_alert(
                        "QuantAI Alpha Picks Ready",
                        f"Today's top picks: {summary} (+{len(picks)-5} more)"
                    )
            else:
                logger.warning("QuantAI: no picks generated")

        except ImportError as e:
            logger.warning(f"QuantAI engine unavailable (missing dependency): {e}")
        except Exception as e:
            logger.error(f"QuantAI picks generation failed: {e}")

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
    
    async def scan_watchlist_alerts(self):
        """PR 109 — every 5 min during market hours, evaluate every
        watchlist row with `alert_enabled=true` + a threshold against
        live LTP. Fire one notification per crossing, debounced via
        ``alert_last_fired_at`` + ``alert_last_fired_direction`` so:

            * The same direction re-arms only when the user changes
              the threshold (a write to `alert_price_above` resets the
              fire state via the row update).
            * A cross in the opposite direction is treated as a new
              event regardless of when the last fire happened.
        """
        started_at = datetime.utcnow()
        if not self._is_market_hours():
            self._write_job_run("watchlist_price_alerts", started_at, "skipped",
                                metadata={"reason": "outside_market_hours"})
            return

        try:
            rows = (
                self.supabase.table("watchlist")
                .select(
                    "id, user_id, symbol, exchange, "
                    "alert_price_above, alert_price_below, "
                    "alert_last_fired_at, alert_last_fired_direction"
                )
                .eq("alert_enabled", True)
                .limit(2000)
                .execute()
            )
            data = rows.data or []
        except Exception as exc:
            logger.error("watchlist_price_alerts query failed: %s", exc)
            self._write_job_run("watchlist_price_alerts", started_at, "failed",
                                error=str(exc)[:300])
            return

        if not data:
            self._write_job_run("watchlist_price_alerts", started_at, "ok",
                                items_processed=0)
            return

        # Batch the LTP fetch — one MarketData call per unique symbol.
        symbols = list({r["symbol"] for r in data if r.get("symbol")})
        try:
            prices = await self._fetch_batch_prices(symbols)
        except Exception as exc:
            logger.warning("watchlist_price_alerts price fetch failed: %s", exc)
            self._write_job_run("watchlist_price_alerts", started_at, "failed",
                                error=f"price_fetch: {exc}"[:300])
            return

        fired = 0
        skipped_debounce = 0
        for row in data:
            sym = row.get("symbol")
            ltp = prices.get(sym) if sym else None
            if not ltp:
                continue
            try:
                ltp_f = float(ltp)
            except (TypeError, ValueError):
                continue

            above = row.get("alert_price_above")
            below = row.get("alert_price_below")
            triggered_dir: Optional[str] = None
            triggered_threshold: Optional[float] = None
            if above is not None and ltp_f >= float(above):
                triggered_dir = "above"
                triggered_threshold = float(above)
            elif below is not None and ltp_f <= float(below):
                triggered_dir = "below"
                triggered_threshold = float(below)

            if triggered_dir is None:
                continue

            # Debounce: skip when we already fired *this same direction*
            # since the last threshold update. A direction flip always
            # fires a fresh event.
            last_dir = row.get("alert_last_fired_direction")
            if last_dir == triggered_dir:
                skipped_debounce += 1
                continue

            try:
                self._fire_watchlist_alert(
                    user_id=row["user_id"],
                    symbol=sym,
                    direction=triggered_dir,
                    threshold=triggered_threshold,
                    ltp=ltp_f,
                )
                self.supabase.table("watchlist").update({
                    "alert_last_fired_at": datetime.utcnow().isoformat(),
                    "alert_last_fired_direction": triggered_dir,
                }).eq("id", row["id"]).execute()
                fired += 1
            except Exception as exc:
                logger.warning("watchlist alert dispatch failed sym=%s: %s", sym, exc)

        self._write_job_run(
            "watchlist_price_alerts", started_at, "ok",
            items_processed=fired,
            metadata={"rows_scanned": len(data), "fired": fired, "skipped_debounce": skipped_debounce},
        )

    def _fire_watchlist_alert(
        self,
        *,
        user_id: str,
        symbol: str,
        direction: str,
        threshold: float,
        ltp: float,
    ) -> None:
        """Insert a `price_alert` notification row. The realtime
        broadcaster picks it up and fans out to push / Telegram /
        WhatsApp per the user's alert_preferences (PR 40)."""
        title = f"{symbol} crossed {direction} \u20B9{threshold:.2f}"
        message = (
            f"{symbol} is now \u20B9{ltp:.2f} — your watchlist alert for "
            f"{direction} \u20B9{threshold:.2f} just triggered."
        )
        try:
            self.supabase.table("notifications").insert({
                "user_id": user_id,
                "type": "price_alert",
                "title": title,
                "message": message,
                "data": {
                    "symbol": symbol,
                    "direction": direction,
                    "threshold": threshold,
                    "ltp": ltp,
                },
                "is_read": False,
            }).execute()
        except Exception as exc:
            logger.debug("notifications insert failed sym=%s: %s", symbol, exc)

        # PostHog cohort event so the conversion funnel can see "user
        # set an alert → it fired → they came back". Best-effort.
        try:
            from ..observability import EventName, track
            track(EventName.PRICE_ALERT_FIRED, user_id, {
                "symbol": symbol,
                "direction": direction,
                "threshold": threshold,
                "ltp": ltp,
            })
        except Exception:
            pass

    async def market_close_processing(self):
        """
        3:30 PM - Process end of day.

        Swing signals are valid for multiple days. Only expire signals older than
        SIGNAL_VALIDITY_DAYS trading days. Track active/triggered signals through
        their lifecycle (entry zone → SL/target hit).
        """
        logger.info("Processing market close...")

        try:
            # Expire old signals (>5 trading days) — NOT same-day
            validity_days = int(os.environ.get("SIGNAL_VALIDITY_DAYS", "5"))
            cutoff = (date.today() - timedelta(days=validity_days + 2)).isoformat()  # +2 for weekends
            self.supabase.table("signals").update({
                "status": "expired"
            }).lt("date", cutoff).in_("status", ["active", "triggered"]).execute()
            logger.info(f"Expired signals older than {cutoff}")

            # Update signal lifecycle (active → triggered → hit/miss)
            await self._update_signal_lifecycle()

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
        Saturday 6 AM - Check model performance + auto-retrain all models.
        Runs retrain_pipeline.py in a subprocess (candidate/promote pattern).
        """
        logger.info("Weekend model check: performance review + auto-retraining...")

        try:
            # ── 1. 30-day performance review ──
            start_date = (date.today() - timedelta(days=30)).isoformat()

            performance = self.supabase.table("model_performance").select(
                "accuracy, ensemble_accuracy"
            ).gte("date", start_date).execute()

            avg_accuracy = None
            if performance.data:
                avg_accuracy = sum(
                    p["accuracy"] for p in performance.data
                ) / len(performance.data)
                logger.info(f"30-day average accuracy: {avg_accuracy:.1f}%")

                if avg_accuracy < 55 and self.notification_service:
                    await self.notification_service.send_admin_alert(
                        "Model Performance Alert",
                        f"30-day accuracy dropped to {avg_accuracy:.1f}%. Auto-retraining triggered.",
                    )

            # ── 2. Auto-retrain all models ──
            await self._run_retraining()

        except Exception as e:
            logger.error(f"Weekend model check error: {e}")

    async def _run_retraining(self):
        """Run scripts/retrain_pipeline.py --model all in a subprocess."""
        import subprocess

        script = _ROOT_DIR / "scripts" / "retrain_pipeline.py"
        if not script.exists():
            logger.warning("retrain_pipeline.py not found, skipping auto-retrain")
            return

        logger.info("Starting auto-retraining pipeline (all models)...")
        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, str(script), "--model", "all",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(_ROOT_DIR),
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=3600)

            if proc.returncode == 0:
                logger.info("Auto-retraining completed successfully")
                if self.notification_service:
                    await self.notification_service.send_admin_alert(
                        "Auto-Retrain Complete",
                        f"Weekly model retraining finished successfully.\n"
                        f"Output: {stdout.decode()[-500:] if stdout else 'N/A'}",
                    )
            else:
                logger.error(
                    "Auto-retraining failed (exit %d): %s",
                    proc.returncode,
                    stderr.decode()[-500:] if stderr else "no output",
                )
                if self.notification_service:
                    await self.notification_service.send_admin_alert(
                        "Auto-Retrain FAILED",
                        f"Exit code {proc.returncode}.\n"
                        f"Stderr: {stderr.decode()[-500:] if stderr else 'N/A'}",
                    )
        except asyncio.TimeoutError:
            logger.error("Auto-retraining timed out after 1 hour")
        except Exception as e:
            logger.error(f"Auto-retraining error: {e}")

    async def retrain_hmm_weekly(self):
        """
        Sunday 03:00 IST — HMM weekly retrain.

        Per Step 2 §1.12: re-fit on 10 years Nifty + VIX daily. CPU only,
        under 5 minutes. Delegates to ``scripts/train_regime.py`` so the
        training recipe stays in one place. Does NOT auto-promote —
        admin runs a regression check before flipping ``is_prod``.
        """
        logger.info("Starting weekly HMM retrain...")
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None

        try:
            script = _ROOT_DIR / "scripts" / "train_regime.py"
            if not script.exists():
                logger.warning("train_regime.py not found, skipping HMM retrain")
                status = "skipped"
                return

            # asyncio.create_subprocess_exec uses execFile semantics (argv
            # array, no shell). Mirrors _run_retraining above.
            proc = await asyncio.create_subprocess_exec(
                sys.executable, str(script),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(_ROOT_DIR),
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=600)
            if proc.returncode != 0:
                status = "failed"
                err_msg = (stderr.decode()[-500:] if stderr else "no output")
                logger.error(
                    "HMM retrain failed (exit %d): %s", proc.returncode, err_msg,
                )
                return

            logger.info("HMM retrain completed — admin must run regression check before promote.")
            if self.notification_service:
                try:
                    await self.notification_service.send_admin_alert(
                        "HMM Weekly Retrain Ready",
                        "regime_hmm retrained. Run regression check, then "
                        "promote via admin UI or registry.promote('regime_hmm', v).",
                    )
                except Exception:
                    pass
        except asyncio.TimeoutError:
            status = "failed"
            err_msg = "timeout after 600s"
            logger.error("HMM retrain timed out after 10 minutes")
        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error(f"HMM retrain error: {e}")
        finally:
            try:
                self.supabase.table("scheduler_job_runs").insert({
                    "job_name": "retrain_hmm_weekly",
                    "triggered_at": started_at.isoformat(),
                    "completed_at": datetime.utcnow().isoformat(),
                    "status": status,
                    "duration_ms": int((datetime.utcnow() - started_at).total_seconds() * 1000),
                    "error": err_msg,
                }).execute()
            except Exception:
                pass

    # ========================================================================
    # OPTIONS MARKETPLACE JOBS
    # ========================================================================

    async def options_signal_scan(self):
        """
        9:30 AM - Scan options chains for all active OPTIONS deployments.
        Delegates to signal_generator.generate_options_signals().
        """
        logger.info("Starting options strategy signal scan...")

        try:
            if not await self._is_trading_day():
                logger.info("Not a trading day, skipping options scan")
                return

            if not self._is_market_hours():
                return

            signals = await self.signal_generator.generate_options_signals()
            logger.info(f"Options scan complete: {len(signals)} signals generated")

            if signals and self.notification_service:
                for sig in signals:
                    sig_dict = sig.__dict__ if hasattr(sig, "__dict__") else sig
                    symbol = sig_dict.get("symbol", "?")
                    strategy = sig_dict.get("strategy_name", "?")
                    user_id = sig_dict.get("user_id")
                    if user_id:
                        await self.notification_service.send_to_user(
                            user_id, "options_signal",
                            f"Options signal: {strategy} on {symbol}"
                        )

        except Exception as e:
            logger.error(f"Options signal scan error: {e}")

    async def options_position_monitor(self):
        """
        Every 15 min - Monitor active OPTIONS positions for exit conditions.
        Delegates to signal_generator.monitor_options_positions().
        """
        if not self._is_market_hours():
            return

        logger.debug("Monitoring options positions...")

        try:
            await self.signal_generator.monitor_options_positions()
        except Exception as e:
            logger.error(f"Options position monitoring error: {e}")

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
        try:
            user = self.supabase.table("user_profiles").select(
                "trailing_sl_enabled, risk_profile"
            ).eq("id", position["user_id"]).single().execute()

            if not user.data or not user.data.get("trailing_sl_enabled"):
                return

            direction = position.get("direction", "LONG")
            entry = position.get("average_price") or position.get("entry_price", 0)
            current_sl = position.get("stop_loss", 0)

            if not entry or not current_sl:
                return

            # Trail SL at 50% of favorable price move
            if direction == "LONG":
                move = current_price - entry
                if move > 0:
                    new_sl = max(current_sl, entry + (move * 0.5))
                    if new_sl > current_sl:
                        self.supabase.table("positions").update(
                            {"stop_loss": round(new_sl, 2)}
                        ).eq("id", position["id"]).execute()
                        logger.info(f"Trailing SL updated for {position['symbol']}: {current_sl} -> {new_sl}")
            else:  # SHORT
                move = entry - current_price
                if move > 0:
                    new_sl = min(current_sl, entry - (move * 0.5))
                    if new_sl < current_sl:
                        self.supabase.table("positions").update(
                            {"stop_loss": round(new_sl, 2)}
                        ).eq("id", position["id"]).execute()
                        logger.info(f"Trailing SL updated for {position['symbol']}: {current_sl} -> {new_sl}")
        except Exception as e:
            logger.error(f"Trailing SL update failed for {position.get('symbol')}: {e}")
    
    async def _update_signal_lifecycle(self):
        """
        Track active/triggered signals through their lifecycle.

        Flow: active → triggered (price enters entry zone)
              triggered → target_hit | sl_hit (price hits target or SL)
        Called at market close AND every 5 min via monitor_positions.
        """
        # Fetch all active + triggered signals (not just today's)
        result = self.supabase.table("signals").select("*").in_(
            "status", ["active", "triggered"]
        ).execute()

        for signal in result.data or []:
            try:
                symbol = signal.get("symbol")
                if not symbol:
                    continue

                current_price = await self._get_current_price(symbol)
                if not current_price:
                    continue

                entry = signal.get("entry_price") or 0
                sl = signal.get("stop_loss") or 0
                target = signal.get("target_1") or signal.get("target") or 0
                direction = signal.get("direction", "LONG")

                if not entry or not sl or not target:
                    continue

                if signal["status"] == "active":
                    # Check if price entered the entry zone (within 0.5%)
                    if abs(current_price - entry) / entry < 0.005:
                        self.supabase.table("signals").update({
                            "status": "triggered",
                            "triggered_at": datetime.utcnow().isoformat(),
                        }).eq("id", signal["id"]).execute()
                        logger.info(f"Signal triggered: {symbol} at ₹{current_price} (entry ₹{entry})")

                elif signal["status"] == "triggered":
                    new_status = None
                    if direction == "LONG":
                        if current_price <= sl:
                            new_status = "sl_hit"
                        elif current_price >= target:
                            new_status = "target_hit"
                    else:  # SHORT
                        if current_price >= sl:
                            new_status = "sl_hit"
                        elif current_price <= target:
                            new_status = "target_hit"

                    if new_status:
                        actual_return = ((current_price - entry) / entry * 100) if direction == "LONG" else ((entry - current_price) / entry * 100)
                        self.supabase.table("signals").update({
                            "status": new_status,
                            "result": "win" if new_status == "target_hit" else "loss",
                            "actual_return": round(actual_return, 2),
                            "result_price": current_price,
                            "result_at": datetime.utcnow().isoformat(),
                        }).eq("id", signal["id"]).execute()
                        logger.info(f"Signal {new_status}: {symbol} at ₹{current_price} ({actual_return:+.2f}%)")

            except Exception as e:
                logger.error(f"Signal lifecycle update failed for {signal.get('id')}: {e}")
    
    # ========================================================================
    # D-PHASE: SIGNAL→TRADE AUTOMATION & RISK ENFORCEMENT
    # ========================================================================

    async def _create_trades_from_signals(self):
        """
        8:45 AM - Auto-create trade records from today's active signals.

        - full_auto users: trade created as 'approved' → executed at 9:30 AM
        - semi_auto users: trade created as 'pending' → user approves via app
        - signal_only users: no trade created
        """
        logger.info("Creating trades from signals...")

        try:
            if not await self._is_trading_day():
                return

            today = date.today().isoformat()

            # Get today's active signals
            signals_result = self.supabase.table("signals").select("*").eq(
                "date", today
            ).eq("status", "active").execute()

            if not signals_result.data:
                logger.info("No active signals for today")
                return

            # Get all users with auto trading enabled
            users = self.supabase.table("user_profiles").select(
                "id, trading_mode, risk_profile, capital, kill_switch_active"
            ).in_("trading_mode", ["full_auto", "semi_auto"]).execute()

            total_created = 0
            for user in users.data or []:
                if user.get("kill_switch_active"):
                    continue

                capital = float(user.get("capital", 0))
                if capital <= 0:
                    continue

                # Check if user has broker connected → live, else paper
                broker_conn = self.supabase.table("broker_connections").select("id").eq(
                    "user_id", user["id"]
                ).eq("status", "connected").execute()
                execution_mode = "live" if broker_conn.data else "paper"

                for signal in signals_result.data:
                    try:
                        # Skip if trade already exists for this user + signal
                        existing = self.supabase.table("trades").select("id").eq(
                            "user_id", user["id"]
                        ).eq("signal_id", signal["id"]).execute()
                        if existing.data:
                            continue

                        # Risk check
                        risk_ok, risk_msg = await self._check_risk_for_signal(user, signal)
                        if not risk_ok:
                            logger.debug(f"Risk rejected {signal['symbol']} for user {user['id']}: {risk_msg}")
                            continue

                        # Calculate position size
                        risk_pct = {"conservative": 1.5, "moderate": 3.0, "aggressive": 5.0}.get(
                            user.get("risk_profile", "moderate"), 3.0
                        )
                        entry = float(signal.get("entry_price") or 0)
                        sl = float(signal.get("stop_loss") or 0)
                        segment = signal.get("segment", "EQUITY")

                        if segment == "OPTIONS":
                            # Options: lot-based sizing, risk = premium per lot
                            lot_size = int(signal.get("lot_size") or 1)
                            if entry <= 0:
                                continue
                            max_risk = capital * risk_pct / 100
                            cost_per_lot = entry * lot_size
                            lots = max(1, int(max_risk / cost_per_lot)) if cost_per_lot > 0 else 1
                            quantity = lots * lot_size
                            risk_per_share = entry  # premium is the max risk for buyers
                            product_type = "NRML"
                        else:
                            # Equity: share-based sizing
                            risk_per_share = abs(entry - sl)
                            if risk_per_share <= 0 or entry <= 0:
                                continue
                            quantity = int((capital * risk_pct / 100) / risk_per_share)
                            if quantity < 1:
                                continue
                            product_type = "CNC"

                        status = "approved" if user["trading_mode"] == "full_auto" else "pending"

                        target_val = signal.get("target_1") or signal.get("target") or 0
                        trade = {
                            "user_id": user["id"],
                            "signal_id": signal["id"],
                            "symbol": signal["symbol"],
                            "direction": signal.get("direction", "LONG"),
                            "segment": segment,
                            "entry_price": entry,
                            "stop_loss": sl if sl > 0 else entry * 0.7,  # fallback SL for options
                            "target": float(target_val),
                            "quantity": quantity,
                            "risk_amount": round(quantity * risk_per_share, 2),
                            "execution_mode": execution_mode,
                            "status": status,
                            "order_type": "LIMIT",
                            "product_type": product_type,
                            "notes": signal.get("strategy_name", ""),
                        }
                        self.supabase.table("trades").insert(trade).execute()
                        total_created += 1

                    except Exception as e:
                        logger.error(f"Trade creation failed for {signal.get('symbol')}: {e}")

            logger.info(f"Created {total_created} trades from {len(signals_result.data)} signals")

        except Exception as e:
            logger.error(f"Create trades from signals error: {e}")

    async def _check_risk_for_signal(self, user: dict, signal: dict) -> tuple:
        """Run RiskManagementEngine checks before auto-creating a trade."""
        try:
            from .risk_management import (
                RiskManagementEngine, Signal as RiskSignal,
                Segment, Direction, RISK_PROFILES,
            )

            engine = RiskManagementEngine(self.supabase)
            risk_signal = RiskSignal(
                symbol=signal["symbol"],
                direction=Direction(signal.get("direction", "LONG")),
                segment=Segment(signal.get("segment", "EQUITY")),
                entry_price=float(signal.get("entry_price") or 0),
                stop_loss=float(signal.get("stop_loss") or 0),
                target=float(signal.get("target_1") or signal.get("target") or 0),
                confidence=float(signal.get("confidence") or 0),
            )

            # Resolve risk profile object
            profile = RISK_PROFILES.get(user.get("risk_profile", "moderate"))
            if not profile:
                return False, "Unknown risk profile"

            # Check loss limits
            ok, msg = await engine.check_loss_limits(user["id"], profile)
            if not ok:
                return False, msg

            # Check signal quality
            ok, msg = engine.check_signal_quality(risk_signal, profile)
            if not ok:
                return False, msg

            return True, "OK"
        except Exception as e:
            logger.error(f"Risk check failed: {e}")
            return False, str(e)

    async def _enforce_daily_risk_limits(self):
        """Auto-activate kill switch if a user's daily loss limit is breached."""
        try:
            users = self.supabase.table("user_profiles").select(
                "id, capital, risk_profile, daily_loss_limit, kill_switch_active"
            ).eq("kill_switch_active", False).in_(
                "trading_mode", ["full_auto", "semi_auto"]
            ).execute()

            today = date.today().isoformat()
            for user in users.data or []:
                capital = float(user.get("capital") or 0)
                if capital <= 0:
                    continue

                daily_limit = float(user.get("daily_loss_limit") or 3.0)

                # Sum today's closed trade losses
                trades = self.supabase.table("trades").select("net_pnl").eq(
                    "user_id", user["id"]
                ).eq("status", "closed").gte("closed_at", today).execute()

                today_pnl = sum(float(t.get("net_pnl") or 0) for t in trades.data or [])
                loss_pct = abs(min(0, today_pnl)) / capital * 100

                if loss_pct >= daily_limit:
                    self.supabase.table("user_profiles").update({
                        "kill_switch_active": True
                    }).eq("id", user["id"]).execute()

                    logger.warning(
                        f"Kill switch activated for user {user['id']}: "
                        f"daily loss {loss_pct:.1f}% >= limit {daily_limit}%"
                    )

                    if self.notification_service:
                        await self.notification_service.send_to_user(
                            user["id"], "kill_switch",
                            f"Trading paused: daily loss of {loss_pct:.1f}% hit your {daily_limit}% limit."
                        )
        except Exception as e:
            logger.error(f"Risk limit enforcement error: {e}")

    async def _reconcile_broker_positions(self):
        """
        3:35 PM - Sync DB positions with actual broker positions for live users.
        Detects positions closed externally (GTT fills, manual exits).
        """
        logger.info("Running broker position reconciliation...")

        try:
            if not await self._is_trading_day():
                return

            from .broker_integration import BrokerFactory
            from .broker_credentials import decrypt_credentials

            connections = self.supabase.table("broker_connections").select(
                "user_id, broker_name, access_token"
            ).eq("status", "connected").execute()

            reconciled = 0
            for conn in connections.data or []:
                try:
                    credentials = decrypt_credentials(conn["access_token"])
                    broker = BrokerFactory.create(conn["broker_name"], credentials)
                    if not broker.login():
                        continue

                    broker_positions = broker.get_positions()
                    db_positions = self.supabase.table("positions").select("*").eq(
                        "user_id", conn["user_id"]
                    ).eq("is_active", True).eq("execution_mode", "live").execute()

                    broker_symbols = {p.symbol for p in broker_positions}

                    for db_pos in db_positions.data or []:
                        if db_pos["symbol"] not in broker_symbols:
                            logger.info(
                                f"Reconciliation: {db_pos['symbol']} closed externally "
                                f"for user {conn['user_id']}"
                            )
                            self.supabase.table("positions").update({
                                "is_active": False
                            }).eq("id", db_pos["id"]).execute()

                            if db_pos.get("trade_id"):
                                self.supabase.table("trades").update({
                                    "status": "closed",
                                    "exit_reason": "broker_reconciliation",
                                    "closed_at": datetime.utcnow().isoformat(),
                                }).eq("id", db_pos["trade_id"]).execute()
                            reconciled += 1

                except Exception as e:
                    logger.error(f"Reconciliation failed for user {conn.get('user_id')}: {e}")

            logger.info(f"Broker reconciliation done: {reconciled} positions synced")

        except Exception as e:
            logger.error(f"Broker reconciliation error: {e}")

    # ========================================================================
    # EOD SUMMARIES & PERFORMANCE
    # ========================================================================

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
        """
        Calculate per-strategy signal performance over the last 30 days.
        Uses resolved signals (target_hit, sl_hit, expired) to compute real stats.
        """
        today = date.today().isoformat()
        start_date = (date.today() - timedelta(days=30)).isoformat()

        # Fetch all resolved signals from last 30 days
        resolved = self.supabase.table("signals").select("*").gte(
            "date", start_date
        ).in_("status", ["target_hit", "sl_hit", "expired"]).execute()

        if not resolved.data:
            logger.info("No resolved signals in last 30 days for performance tracking")
            return

        # Aggregate per strategy
        from collections import defaultdict
        by_strategy = defaultdict(list)
        for sig in resolved.data:
            strategy = sig.get("strategy_name") or sig.get("pattern_type") or "unknown"
            by_strategy[strategy].append(sig)

        total_signals = len(resolved.data)
        total_wins = 0

        for strategy, sigs in by_strategy.items():
            wins = [s for s in sigs if s.get("result") == "win"]
            total_wins += len(wins)
            win_rate = len(wins) / len(sigs) * 100 if sigs else 0
            avg_return = 0
            returns = [s.get("actual_return", 0) or 0 for s in sigs if s.get("actual_return") is not None]
            if returns:
                avg_return = sum(returns) / len(returns)

            logger.info(f"Strategy {strategy}: {len(sigs)} signals, {win_rate:.1f}% WR, {avg_return:+.2f}% avg return")

        # Save aggregate performance
        accuracy = (total_wins / total_signals * 100) if total_signals > 0 else 0
        self.supabase.table("model_performance").upsert({
            "date": today,
            "total_signals": total_signals,
            "correct_signals": total_wins,
            "accuracy": round(accuracy, 1),
        }, on_conflict="date").execute()

        logger.info(f"Model performance updated: {total_signals} signals, {accuracy:.1f}% accuracy (30-day)")

    # ========================================================================
    # PR 7 — AI PIPELINE JOBS
    # ========================================================================
    # Paper snapshot + model rolling aggregator ship full implementations.
    # Qlib / Chronos / FinBERT / earnings / AI-SIP / intraday-LSTM are cron-
    # registered stubs — their bodies fill in at the respective feature PR
    # so the schedule graph is already complete and observable via
    # `scheduler_job_runs`.
    # ========================================================================

    # ---- FULL: paper snapshot (powers /paper-trading equity curve, F11) ----

    async def snapshot_paper_portfolios(self):
        """23:00 IST daily — write one ``paper_snapshots`` row per user.

        Computes equity = cash + sum(qty * last_close) across every open
        ``paper_positions`` row. Nifty close attached for benchmark overlay.
        Drawdown percent computed against the user's peak equity in the last
        90 days (pulled from prior snapshots).
        """
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None
        processed = 0

        try:
            portfolios = (
                self.supabase.table("paper_portfolios")
                .select("user_id, cash")
                .execute()
            )
            users = portfolios.data or []
            if not users:
                status = "skipped"
                return

            # Nifty close for benchmark overlay (non-critical if missing).
            nifty_close: Optional[float] = None
            try:
                from .market_data import get_market_data_provider
                provider = get_market_data_provider()
                nifty_df = provider.get_historical("NIFTY", period="5d", interval="1d")
                if nifty_df is not None and len(nifty_df) > 0:
                    nifty_df.columns = [c.lower() for c in nifty_df.columns]
                    nifty_close = float(nifty_df["close"].iloc[-1])
            except Exception as nifty_err:
                logger.debug("paper snapshot: nifty close fetch failed: %s", nifty_err)

            today_iso = date.today().isoformat()

            for row in users:
                user_id = row["user_id"]
                cash = float(row.get("cash") or 0.0)
                try:
                    open_positions = (
                        self.supabase.table("paper_positions")
                        .select("symbol, qty, entry_price")
                        .eq("user_id", user_id)
                        .eq("status", "open")
                        .execute()
                    )
                    positions = open_positions.data or []

                    invested = 0.0
                    mark_to_market = 0.0
                    for p in positions:
                        qty = float(p.get("qty") or 0)
                        entry = float(p.get("entry_price") or 0)
                        invested += qty * entry
                        # LTP lookup — best-effort. Fall back to entry price.
                        ltp = entry
                        try:
                            from .market_data import get_market_data_provider
                            provider = get_market_data_provider()
                            quote = provider.get_quote(p["symbol"])
                            if quote and quote.ltp:
                                ltp = float(quote.ltp)
                        except Exception:
                            pass
                        mark_to_market += qty * ltp

                    equity = cash + mark_to_market

                    # Drawdown vs trailing 90-day peak (inclusive of today).
                    drawdown_pct: Optional[float] = None
                    try:
                        peak_q = (
                            self.supabase.table("paper_snapshots")
                            .select("equity")
                            .eq("user_id", user_id)
                            .gte(
                                "snapshot_date",
                                (date.today() - timedelta(days=90)).isoformat(),
                            )
                            .order("equity", desc=True)
                            .limit(1)
                            .execute()
                        )
                        peak_rows = peak_q.data or []
                        peak_equity = (
                            float(peak_rows[0]["equity"]) if peak_rows else equity
                        )
                        peak_equity = max(peak_equity, equity)
                        if peak_equity > 0:
                            drawdown_pct = round(
                                ((equity - peak_equity) / peak_equity) * 100, 4
                            )
                    except Exception:
                        drawdown_pct = None

                    self.supabase.table("paper_snapshots").upsert({
                        "user_id": user_id,
                        "snapshot_date": today_iso,
                        "equity": round(equity, 2),
                        "cash": round(cash, 2),
                        "invested": round(invested, 2),
                        "drawdown_pct": drawdown_pct,
                        "nifty_close": nifty_close,
                    }, on_conflict="user_id,snapshot_date").execute()
                    processed += 1

                    # PR 13: emit per-user paper-snapshot event so the
                    # /paper-trading page's equity chart updates live.
                    try:
                        from .event_bus import MessageType, emit_event
                        await emit_event(
                            MessageType.PAPER_SNAPSHOT_UPDATED,
                            {
                                "snapshot_date": today_iso,
                                "equity": round(equity, 2),
                                "cash": round(cash, 2),
                                "drawdown_pct": drawdown_pct,
                                "nifty_close": nifty_close,
                            },
                            user_id=user_id,
                        )
                    except Exception:
                        pass
                except Exception as per_user:
                    logger.warning(
                        "paper snapshot failed for user=%s: %s", user_id, per_user
                    )

            logger.info("Paper snapshots written for %d users", processed)
        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error("snapshot_paper_portfolios error: %s", e)
        finally:
            self._write_job_run(
                "snapshot_paper_portfolios",
                started_at,
                status,
                err_msg,
                items_processed=processed,
            )

    # ---- FULL: model rolling performance aggregator (/models page) --------

    async def aggregate_model_rolling_performance(self):
        """Sunday 02:00 IST — compute 7/30/90/365-day rolling WR per model.

        Reads closed signals from ``public.signals`` where ``status``
        in ('target_hit','stop_hit','expired'). Buckets by which models
        concurred (via ``strategy_names``, ``tft_score``, ``lgbm_buy_prob``,
        ``regime_at_signal``). Writes one row per (model_name, window_days)
        into ``model_rolling_performance`` — the public /models page + admin
        drift dashboard read from this table.
        """
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None
        rows_written = 0

        try:
            # We define "model participated in this signal" as:
            #   strategy    → strategy_names is non-empty
            #   tft         → tft_score is not null and > 0
            #   lgbm        → lgbm_buy_prob is not null and > 0
            #   hmm         → regime_at_signal is not null
            #   ml_labeler  → catboost_score > 0.35
            model_probes = {
                "strategy": lambda r: bool(r.get("strategy_names")),
                "tft_swing": lambda r: (r.get("tft_score") or 0) > 0,
                "lgbm_signal_gate": lambda r: (r.get("lgbm_buy_prob") or 0) > 0,
                "regime_hmm": lambda r: r.get("regime_at_signal") is not None,
                "breakout_meta_labeler": lambda r: (r.get("catboost_score") or 0) >= 0.35,
            }

            today = date.today()
            windows = [7, 30, 90, 365]

            for window in windows:
                cutoff = (today - timedelta(days=window)).isoformat()
                resp = (
                    self.supabase.table("signals")
                    .select(
                        "id, status, confidence, strategy_names, tft_score, "
                        "lgbm_buy_prob, catboost_score, regime_at_signal, "
                        "entry_price, target_1, stop_loss"
                    )
                    .gte("date", cutoff)
                    .in_("status", ["target_hit", "stop_hit", "expired"])
                    .execute()
                )
                signals = resp.data or []
                if not signals:
                    continue

                for model_name, predicate in model_probes.items():
                    participating = [s for s in signals if predicate(s)]
                    n = len(participating)
                    if n == 0:
                        continue
                    wins = sum(1 for s in participating if s["status"] == "target_hit")
                    win_rate = wins / n

                    pnl_pcts = []
                    for s in participating:
                        entry = float(s.get("entry_price") or 0)
                        if entry <= 0:
                            continue
                        if s["status"] == "target_hit":
                            exit_price = float(s.get("target_1") or entry)
                        elif s["status"] == "stop_hit":
                            exit_price = float(s.get("stop_loss") or entry)
                        else:
                            continue  # expired — no realized P&L
                        pnl_pcts.append(((exit_price - entry) / entry) * 100)

                    avg_pnl_pct = (
                        round(sum(pnl_pcts) / len(pnl_pcts), 4) if pnl_pcts else None
                    )

                    # Directional accuracy = win_rate for binary direction calls.
                    self.supabase.table("model_rolling_performance").insert({
                        "model_name": model_name,
                        "window_days": window,
                        "win_rate": round(win_rate, 4),
                        "avg_pnl_pct": avg_pnl_pct,
                        "signal_count": n,
                        "directional_accuracy": round(win_rate, 4),
                        "sharpe_ratio": None,     # requires daily-return series; compute in later PR
                        "max_drawdown_pct": None,
                    }).execute()
                    rows_written += 1

            logger.info(
                "Model rolling performance: %d (model, window) rows written",
                rows_written,
            )
        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error("aggregate_model_rolling_performance error: %s", e)
        finally:
            self._write_job_run(
                "aggregate_model_rolling_performance",
                started_at,
                status,
                err_msg,
                items_processed=rows_written,
            )

    # ---- STUBS: bodies fill in at the respective feature PRs --------------

    async def qlib_nightly_rank(self):
        """15:40 IST — Qlib Alpha158 + LightGBM cross-sectional rank on NSE All.

        Uses real Microsoft Qlib: ``qlib.init(provider_uri=...)`` + the
        trained ``qlib.contrib.data.handler.Alpha158`` handler. Ingestion
        happens on Colab Pro via ``scripts/ingest_nse_to_qlib.py`` and
        training via ``scripts/train_qlib_alpha158.py``. This job reads
        the resulting ``~/.qlib/qlib_data/nse_data/`` directory + the
        trained booster from the model registry, and upserts one row
        per (symbol, trade_date) to ``alpha_scores``.

        Graceful skips:
            * status=skipped reason=not_trading_day
            * status=skipped reason=model_not_ready (before first training)
            * status=skipped reason=provider_missing (before first ingest)
        """
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None
        ranked = 0

        try:
            if not await self._is_trading_day():
                self._write_job_run(
                    "qlib_nightly_rank", started_at, "skipped",
                    metadata={"reason": "not_trading_day"},
                )
                return

            try:
                from ..ai.qlib import get_qlib_engine
            except Exception as import_err:
                self._write_job_run(
                    "qlib_nightly_rank", started_at, "skipped",
                    metadata={"reason": "qlib_import_failed", "detail": str(import_err)},
                )
                logger.info("qlib_nightly_rank: pyqlib not installed — skipping")
                return

            engine = get_qlib_engine()
            if not engine.loaded:
                self._write_job_run(
                    "qlib_nightly_rank", started_at, "skipped",
                    metadata={"reason": "model_not_ready"},
                )
                logger.info("qlib_nightly_rank: model or provider dir not ready — skipping")
                return

            logger.info("qlib_nightly_rank: running Alpha158 rank over NSE All…")
            rows = engine.rank_universe(instruments="nse_all")
            if not rows:
                self._write_job_run(
                    "qlib_nightly_rank", started_at, "skipped",
                    metadata={"reason": "empty_rank_result"},
                )
                return

            # Batch upsert — chunked to respect Supabase request caps.
            CHUNK = 250
            for i in range(0, len(rows), CHUNK):
                self.supabase.table("alpha_scores").upsert(
                    [
                        {
                            "symbol": r["symbol"],
                            "trade_date": r["trade_date"],
                            "qlib_rank": r["qlib_rank"],
                            "qlib_score_raw": r["qlib_score_raw"],
                        }
                        for r in rows[i:i + CHUNK]
                    ],
                    on_conflict="symbol,trade_date",
                ).execute()
            ranked = len(rows)
            logger.info(
                "qlib_nightly_rank: wrote %d alpha_scores rows", ranked,
            )
        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error("qlib_nightly_rank error: %s", e, exc_info=True)
        finally:
            self._write_job_run(
                "qlib_nightly_rank",
                started_at,
                status,
                err_msg,
                items_processed=ranked,
            )

    async def chronos_nightly_forecast(self):
        """15:50 IST — TimesFM + Chronos-Bolt zero-shot ensemble forecast.

        For each symbol in the Nifty 500 universe:
          - load last ~260 daily closes
          - run TimesFM 200M and Chronos-Bolt Base (both zero-shot)
          - ensemble by quantile-mean, derive direction
          - upsert one row per (symbol, trade_date, horizon) for
            horizons {1, 5, 10, 15} to ``forecast_scores``.

        Graceful skips if neither foundation model is available
        (reason=no_forecasters_ready). Heavy deps (``timesfm``,
        ``chronos-forecasting``, ``torch``) are lazy-imported so dev
        environments without them still pass tests.
        """
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None
        written = 0

        try:
            if not await self._is_trading_day():
                self._write_job_run(
                    "chronos_nightly_forecast", started_at, "skipped",
                    metadata={"reason": "not_trading_day"},
                )
                return

            try:
                from ..ai.forecast import get_forecast_engine
                from ..ai.qlib import load_universe
            except Exception as import_err:
                self._write_job_run(
                    "chronos_nightly_forecast", started_at, "skipped",
                    metadata={"reason": "forecast_import_failed", "detail": str(import_err)},
                )
                return

            engine = get_forecast_engine()
            engine.load()
            if not engine.any_ready:
                self._write_job_run(
                    "chronos_nightly_forecast", started_at, "skipped",
                    metadata={"reason": "no_forecasters_ready"},
                )
                logger.info("chronos_nightly_forecast: neither TimesFM nor Chronos loaded")
                return

            # Nifty 500 rather than NSE All — ~2h wall-clock on CPU for 500
            # symbols × 2 models × 15-step horizon is sustainable; doubling
            # to 2000 symbols isn't without GPU.
            universe = load_universe("nifty500")
            logger.info(
                "chronos_nightly_forecast: running %d symbols through TimesFM(ready=%s) + Chronos(ready=%s)",
                len(universe), engine.timesfm.ready, engine.chronos.ready,
            )
            rows = engine.forecast_universe(universe, horizons=[1, 5, 10, 15])
            if not rows:
                self._write_job_run(
                    "chronos_nightly_forecast", started_at, "skipped",
                    metadata={"reason": "no_forecasts_produced"},
                )
                return

            # Chunked upsert into forecast_scores.
            CHUNK = 200
            for i in range(0, len(rows), CHUNK):
                self.supabase.table("forecast_scores").upsert(
                    rows[i:i + CHUNK],
                    on_conflict="symbol,trade_date,horizon_days",
                ).execute()
            written = len(rows)
            logger.info("chronos_nightly_forecast: wrote %d forecast_scores rows", written)

        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error("chronos_nightly_forecast error: %s", e, exc_info=True)
        finally:
            self._write_job_run(
                "chronos_nightly_forecast",
                started_at,
                status,
                err_msg,
                items_processed=written,
            )

    async def finbert_sentiment_refresh(self):
        """16:30 IST — FinBERT-India daily sentiment scoring.

        For every Nifty 500 symbol:
            1. Fetch last 2 days of Google News headlines
            2. Batch-classify with FinBERT-India (positive/neutral/negative)
            3. Aggregate ``mean_score``, label counts, sample headlines
            4. Upsert one row per (symbol, trade_date) into
               ``news_sentiment``.

        Graceful skips: not_trading_day / finbert_not_ready
        (transformers + torch missing or HF download failed).

        Downstream readers:
          - F1 intraday enrichment (small loop over signal candidates)
          - F7 Portfolio Doctor sentiment agent
          - F9 Earnings pre-report scoring
          - F12 daily digest headline color-coding
          - Signal detail page's news panel
        """
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None
        written = 0

        try:
            if not await self._is_trading_day():
                self._write_job_run(
                    "finbert_sentiment_refresh", started_at, "skipped",
                    metadata={"reason": "not_trading_day"},
                )
                return

            try:
                from ..ai.sentiment import get_sentiment_engine
                from ..ai.qlib import load_universe
            except Exception as import_err:
                self._write_job_run(
                    "finbert_sentiment_refresh", started_at, "skipped",
                    metadata={"reason": "sentiment_import_failed", "detail": str(import_err)},
                )
                return

            engine = get_sentiment_engine()
            engine.load()
            if not engine.ready:
                self._write_job_run(
                    "finbert_sentiment_refresh", started_at, "skipped",
                    metadata={"reason": "finbert_not_ready"},
                )
                logger.info("finbert_sentiment_refresh: FinBERT-India not loaded — skipping")
                return

            universe = load_universe("nifty500")
            logger.info(
                "finbert_sentiment_refresh: scoring %d symbols with FinBERT-India",
                len(universe),
            )

            rows = await engine.score_universe(universe, lookback_days=2)
            if not rows:
                self._write_job_run(
                    "finbert_sentiment_refresh", started_at, "skipped",
                    metadata={"reason": "no_news_scored"},
                )
                return

            # Chunked upsert.
            CHUNK = 200
            for i in range(0, len(rows), CHUNK):
                self.supabase.table("news_sentiment").upsert(
                    rows[i:i + CHUNK],
                    on_conflict="symbol,trade_date",
                ).execute()
            written = len(rows)
            logger.info("finbert_sentiment_refresh: wrote %d news_sentiment rows", written)

        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error("finbert_sentiment_refresh error: %s", e, exc_info=True)
        finally:
            self._write_job_run(
                "finbert_sentiment_refresh",
                started_at,
                status,
                err_msg,
                items_processed=written,
            )

    async def earnings_predictor_scan(self):
        """17:00 IST — scan NSE earnings calendar next 14 days + predict surprise.

        Pipeline (PR 31):
            1. Pick the symbol universe from ``daily_universe`` (latest
               trade_date), falling back to the UniverseScreener's
               expanded Nifty-200 list.
            2. Probe yfinance ``Ticker.calendar`` for each to find any
               announcements in the next 14 days.
            3. Run the rule-based surprise predictor for each hit.
            4. Upsert into ``earnings_predictions``.

        XGBoost swap ships later — the predictor module already exposes
        the same interface so this scheduler call doesn't need to change.
        """
        started_at = datetime.utcnow()
        items_written = 0
        try:
            from ..ai.earnings.predictor import predict_surprise, ModelNotReadyError
            from ..ai.earnings.calendar import bootstrap_universe_from_yfinance
            from ..ai.earnings.training.trainer import load_model as _load_es_model

            sb = self.supabase
            if sb is None:
                self._write_job_run(
                    "earnings_predictor_scan", started_at, "skipped",
                    metadata={"reason": "no_supabase_client"},
                )
                return

            # PR 52 — no fallback. Short-circuit the entire job if the
            # EarningsScout model isn't trained yet. No heuristic output
            # gets written to the predictions table.
            if _load_es_model() is None:
                self._write_job_run(
                    "earnings_predictor_scan", started_at, "skipped",
                    metadata={
                        "reason": "model_not_ready",
                        "feature": "earnings_scout",
                    },
                )
                logger.info(
                    "earnings_predictor_scan: EarningsScout model not loaded "
                    "— skipping scan (awaiting unified training run)"
                )
                return

            # 1. Universe — latest daily_universe rows, fallback to N200.
            universe: list = []
            try:
                latest_date = (
                    sb.table("daily_universe")
                    .select("trade_date")
                    .order("trade_date", desc=True)
                    .limit(1)
                    .execute()
                )
                if latest_date.data:
                    td = latest_date.data[0]["trade_date"]
                    rows = (
                        sb.table("daily_universe")
                        .select("symbol")
                        .eq("trade_date", td)
                        .limit(250)
                        .execute()
                    )
                    universe = [r["symbol"] for r in (rows.data or [])]
            except Exception as e:
                logger.debug("daily_universe read failed: %s", e)
            if not universe:
                try:
                    from .universe_screener import UniverseScreener
                    universe = UniverseScreener()._get_expanded_fallback_symbols()[:200]
                except Exception as e:
                    logger.warning("universe fallback failed: %s", e)
                    universe = []
            if not universe:
                self._write_job_run(
                    "earnings_predictor_scan", started_at, "skipped",
                    metadata={"reason": "empty_universe"},
                )
                return

            logger.info("earnings_predictor_scan: probing %d symbols", len(universe))

            # 2. Probe yfinance for upcoming announce dates (14-day window).
            hits = bootstrap_universe_from_yfinance(universe, days=14)
            if not hits:
                self._write_job_run(
                    "earnings_predictor_scan", started_at, "ok",
                    items_processed=0,
                    metadata={"universe_size": len(universe), "hits": 0},
                )
                return

            # 3 + 4. Predict + upsert. Per-row ModelNotReadyError becomes
            # a skip (the model may have unloaded mid-scan). No fallback
            # output written under any condition.
            for sym, announce in hits:
                try:
                    pred = predict_surprise(
                        sym, announce, supabase_client=sb,
                    )
                    sb.table("earnings_predictions").upsert({
                        "symbol": pred.symbol,
                        "announce_date": pred.announce_date,
                        "beat_prob": pred.beat_prob,
                        "confidence": pred.confidence,
                        "evidence": pred.evidence,
                        "computed_at": datetime.utcnow().isoformat(),
                    }, on_conflict="symbol,announce_date").execute()
                    items_written += 1
                except ModelNotReadyError as e:
                    logger.debug("earnings predict skipped (model) %s: %s", sym, e)
                except Exception as e:
                    logger.warning("earnings predict+upsert failed %s: %s", sym, e)

            self._write_job_run(
                "earnings_predictor_scan", started_at, "ok",
                items_processed=items_written,
                metadata={"universe_size": len(universe), "hits": len(hits)},
            )
            logger.info("earnings_predictor_scan: wrote %d predictions", items_written)
        except Exception as e:
            logger.error("earnings_predictor_scan error: %s", e, exc_info=True)
            self._write_job_run(
                "earnings_predictor_scan", started_at, "failed", str(e),
                items_processed=items_written,
            )

    async def earnings_scout_retrain(self):
        """First-of-month 02:00 IST — F9 EarningsScout XGBoost retrain
        (PR 51). Silently skips when labeled-row count is insufficient;
        uploads + promotes new version when training succeeds."""
        started_at = datetime.utcnow()
        try:
            from ..ai.earnings.training import build_feature_frame, train_and_save
            from ..ai.earnings.training.trainer import (
                MODEL_NAME, ARTIFACT_FILENAME, META_FILENAME, invalidate_cache,
            )

            sb = self.supabase
            if sb is None:
                self._write_job_run(
                    "earnings_scout_retrain", started_at, "skipped",
                    metadata={"reason": "no_supabase_client"},
                )
                return

            # Guarded frame build — skip silently when too few labeled rows.
            try:
                X, y, symbols = build_feature_frame(
                    supabase_client=sb, min_rows=50,
                )
            except ValueError as exc:
                self._write_job_run(
                    "earnings_scout_retrain", started_at, "skipped",
                    metadata={"reason": "insufficient_labeled_rows", "detail": str(exc)},
                )
                logger.info("earnings_scout_retrain: %s", exc)
                return

            # Train to a fresh versioned dir.
            from pathlib import Path
            base = Path(__file__).resolve().parents[3] / "ml" / "models" / "earnings_scout"
            base.mkdir(parents=True, exist_ok=True)
            existing = [p for p in base.iterdir() if p.is_dir() and p.name.startswith("v")]
            nums = [int(p.name.lstrip("v")) for p in existing
                    if p.name.lstrip("v").isdigit()]
            next_v = (max(nums) if nums else 0) + 1
            out_dir = base / f"v{next_v}"

            result = await asyncio.to_thread(
                train_and_save, X, y,
                out_dir=out_dir, version=f"v{next_v}",
            )

            # Upload + shadow-register. Promote only when metrics clear the
            # bar; otherwise the newer version sits in shadow until an
            # admin reviews and promotes manually.
            uploaded = False
            promoted = False
            try:
                from ..ai.registry.model_registry import get_registry
                reg = get_registry()
                if reg is not None:
                    files = [out_dir / ARTIFACT_FILENAME, out_dir / META_FILENAME]
                    row = await asyncio.to_thread(
                        reg.register, MODEL_NAME, files,
                        metrics=result.metrics,
                        trained_by="scheduler",
                        notes="auto-retrain (PR 51)",
                        is_shadow=True,
                    )
                    uploaded = True
                    # Auto-promote rule: new model must beat a minimum
                    # accuracy AND have at least 50 test rows.
                    acc = float(result.metrics.get("accuracy", 0))
                    n_test = int(result.metrics.get("n_test", 0))
                    if acc >= 0.60 and n_test >= 50:
                        await asyncio.to_thread(reg.promote, MODEL_NAME, row["version"])
                        invalidate_cache()
                        promoted = True
            except Exception as exc:
                logger.warning("earnings_scout_retrain upload failed: %s", exc)

            self._write_job_run(
                "earnings_scout_retrain", started_at, "ok",
                items_processed=int(len(X)),
                metadata={
                    "version": f"v{next_v}",
                    "uploaded": uploaded,
                    "promoted": promoted,
                    "metrics": {k: round(v, 4) if isinstance(v, float) else v
                                for k, v in result.metrics.items()},
                },
            )
            logger.info(
                "earnings_scout_retrain: v%d trained acc=%.3f promoted=%s",
                next_v, result.metrics.get("accuracy", 0), promoted,
            )
        except Exception as e:
            logger.error("earnings_scout_retrain error: %s", e, exc_info=True)
            self._write_job_run(
                "earnings_scout_retrain", started_at, "failed", str(e),
            )

    async def tickpulse_scan(self):
        """Every 5 min during NSE market hours — F1 intraday scan
        (PR 50). Gated at scheduler-registration time by
        ``ENABLE_TICKPULSE``; this method is the job body."""
        started_at = datetime.utcnow()
        written = 0
        try:
            from .tickpulse_service import TickPulseService
            sb = self.supabase
            if sb is None:
                self._write_job_run(
                    "tickpulse_scan", started_at, "skipped",
                    metadata={"reason": "no_supabase_client"},
                )
                return
            svc = TickPulseService(sb)
            written = await svc.scan_and_publish()
            self._write_job_run(
                "tickpulse_scan", started_at, "ok",
                items_processed=written,
            )
            if written:
                logger.info("tickpulse_scan: published %d intraday signals", written)
        except Exception as e:
            logger.error("tickpulse_scan error: %s", e, exc_info=True)
            self._write_job_run(
                "tickpulse_scan", started_at, "failed", str(e),
                items_processed=written,
            )

    async def referral_expire_pending(self):
        """Daily 03:30 IST — soft-expire user_referrals rows that have
        been ``pending`` for more than 90 days. Safe/idempotent."""
        started_at = datetime.utcnow()
        try:
            from ..services.referrals import expire_pending_referrals

            sb = self.supabase
            if sb is None:
                self._write_job_run(
                    "referral_expire_pending", started_at, "skipped",
                    metadata={"reason": "no_supabase_client"},
                )
                return

            expired = expire_pending_referrals(supabase_client=sb, days=90)
            self._write_job_run(
                "referral_expire_pending", started_at, "ok",
                items_processed=expired,
                metadata={"expired": expired},
            )
            if expired:
                logger.info("referral_expire_pending: expired %d rows", expired)
        except Exception as e:
            logger.error("referral_expire_pending error: %s", e, exc_info=True)
            self._write_job_run(
                "referral_expire_pending", started_at, "failed", str(e),
            )

    async def sector_rotation_aggregate(self):
        """17:15 IST — aggregate Qlib ranks into per-sector rotation
        snapshot (F10, PR 32).

        Reads ``alpha_scores`` (hydrated by ``qlib_nightly_rank`` at
        15:40 IST) + latest NSE FII/DII flow, writes 11 rows into
        ``sector_scores`` keyed by (sector, trade_date).
        """
        started_at = datetime.utcnow()
        written = 0
        try:
            from ..ai.sector import compute_and_store

            sb = self.supabase
            if sb is None:
                self._write_job_run(
                    "sector_rotation_aggregate", started_at, "skipped",
                    metadata={"reason": "no_supabase_client"},
                )
                return

            snaps = compute_and_store(supabase_client=sb)
            written = len(snaps)
            if written == 0:
                self._write_job_run(
                    "sector_rotation_aggregate", started_at, "skipped",
                    metadata={"reason": "no_alpha_scores_or_sectors_unmapped"},
                )
                return

            rotating_in = sum(1 for s in snaps if s.rotating == "in")
            rotating_out = sum(1 for s in snaps if s.rotating == "out")
            self._write_job_run(
                "sector_rotation_aggregate", started_at, "ok",
                items_processed=written,
                metadata={
                    "trade_date": snaps[0].trade_date,
                    "rotating_in": rotating_in,
                    "rotating_out": rotating_out,
                },
            )
            logger.info(
                "sector_rotation_aggregate: %d sectors (in=%d, out=%d)",
                written, rotating_in, rotating_out,
            )
        except Exception as e:
            logger.error("sector_rotation_aggregate error: %s", e, exc_info=True)
            self._write_job_run(
                "sector_rotation_aggregate", started_at, "failed", str(e),
                items_processed=written,
            )

    async def morning_digest_deliver(self):
        """7:30 IST — F12 pre-market brief.

        Fans the template + optional Gemini-intro builder out across
        every user with Telegram or (Pro) WhatsApp enabled. Shared
        market data (regime / signals / Nifty) is fetched once per
        run; per-user paths only read positions.
        """
        started_at = datetime.utcnow()
        try:
            from ..ai.digest import deliver_morning_all
            sb = self.supabase
            if sb is None:
                self._write_job_run(
                    "morning_digest", started_at, "skipped",
                    metadata={"reason": "no_supabase_client"},
                )
                return
            totals = await deliver_morning_all(supabase_client=sb)
            self._write_job_run(
                "morning_digest", started_at, "ok",
                items_processed=totals.get("telegram_sent", 0) + totals.get("whatsapp_sent", 0),
                metadata=totals,
            )
            logger.info(
                "morning_digest: %d telegram + %d whatsapp sent (%d users, %d failed)",
                totals.get("telegram_sent", 0),
                totals.get("whatsapp_sent", 0),
                totals.get("n_users", 0),
                totals.get("failed", 0),
            )
        except Exception as e:
            logger.error("morning_digest error: %s", e, exc_info=True)
            self._write_job_run("morning_digest", started_at, "failed", str(e))

    async def evening_digest_deliver(self):
        """17:30 IST — F12 post-close summary."""
        started_at = datetime.utcnow()
        try:
            from ..ai.digest import deliver_evening_all
            sb = self.supabase
            if sb is None:
                self._write_job_run(
                    "evening_digest", started_at, "skipped",
                    metadata={"reason": "no_supabase_client"},
                )
                return
            totals = await deliver_evening_all(supabase_client=sb)
            self._write_job_run(
                "evening_digest", started_at, "ok",
                items_processed=totals.get("telegram_sent", 0) + totals.get("whatsapp_sent", 0),
                metadata=totals,
            )
            logger.info(
                "evening_digest: %d telegram + %d whatsapp sent (%d users, %d failed)",
                totals.get("telegram_sent", 0),
                totals.get("whatsapp_sent", 0),
                totals.get("n_users", 0),
                totals.get("failed", 0),
            )
        except Exception as e:
            logger.error("evening_digest error: %s", e, exc_info=True)
            self._write_job_run("evening_digest", started_at, "failed", str(e))

    async def weekly_review_generate(self):
        """Sunday 08:00 IST — N10 weekly portfolio review loop.

        Fans out the Gemini-backed generator across every Pro+ user
        with ``onboarding_completed=True``. Each user's review is
        upserted into ``user_weekly_reviews`` keyed by
        (user_id, week_of=Monday). Falls back to rule-based narrative
        when the LLM is unavailable.
        """
        started_at = datetime.utcnow()
        try:
            from ..ai.weekly_review import generate_and_persist_all_pro

            sb = self.supabase
            if sb is None:
                self._write_job_run(
                    "weekly_review_generate", started_at, "skipped",
                    metadata={"reason": "no_supabase_client"},
                )
                return

            result = await generate_and_persist_all_pro(
                supabase_client=sb, concurrency=4,
            )
            self._write_job_run(
                "weekly_review_generate", started_at, "ok",
                items_processed=result.get("written", 0),
                metadata={
                    "n_users": result.get("n_users", 0),
                    "written": result.get("written", 0),
                    "failed": result.get("failed", 0),
                },
            )
            logger.info(
                "weekly_review_generate: %d/%d Pro+ users written, %d failed",
                result.get("written", 0),
                result.get("n_users", 0),
                result.get("failed", 0),
            )
        except Exception as e:
            logger.error("weekly_review_generate error: %s", e, exc_info=True)
            self._write_job_run(
                "weekly_review_generate", started_at, "failed", str(e),
            )

    async def ai_portfolio_monthly_rebalance(self):
        """Last Sunday 00:00 IST — AI SIP monthly rebalance proposal.

        Pipeline:
          1. Qlib ``alpha_scores`` → top 15 candidates
          2. FinBERT sentiment filter (drop symbols with mean_score < -0.5)
          3. 252-day price history → covariance (Ledoit-Wolf shrinkage)
          4. TimesFM+Chronos 5d forecasts → Black-Litterman absolute views
          5. PyPortfolioOpt BL optimizer → weights (7% per-asset cap)
          6. Upsert ``ai_portfolio_holdings`` for every Elite user with
             ``ai_portfolio_enabled=true``.

        Cron runs every Sunday — this guard bails if today isn't the
        last Sunday of the month.
        """
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None
        users_updated = 0

        try:
            today = date.today()
            is_last_sunday = (today + timedelta(days=7)).month != today.month
            if not is_last_sunday:
                self._write_job_run(
                    "ai_portfolio_monthly_rebalance", started_at, "skipped",
                    metadata={"reason": "not_last_sunday"},
                )
                return

            try:
                from ..ai.portfolio import get_portfolio_manager
            except Exception as import_err:
                self._write_job_run(
                    "ai_portfolio_monthly_rebalance", started_at, "skipped",
                    metadata={"reason": "portfolio_import_failed", "detail": str(import_err)},
                )
                return

            mgr = get_portfolio_manager()
            logger.info("ai_portfolio_monthly_rebalance: building proposal…")
            proposal = mgr.build_proposal()

            if not proposal.weights:
                self._write_job_run(
                    "ai_portfolio_monthly_rebalance", started_at, "skipped",
                    metadata={
                        "reason": "no_proposal_produced",
                        "notes": proposal.notes,
                    },
                )
                logger.info(
                    "ai_portfolio_monthly_rebalance: empty proposal (%s)",
                    proposal.notes,
                )
                return

            logger.info(
                "Proposal built: %d positions, top=%s top_w=%.2f%%, notes=%s",
                len(proposal.weights),
                proposal.metrics.get("top_position", {}).get("symbol"),
                100 * proposal.metrics.get("top_position", {}).get("weight", 0),
                proposal.notes,
            )

            users_updated = await mgr.rebalance_all_elite_users(proposal)
            logger.info(
                "ai_portfolio_monthly_rebalance: upserted holdings for %d Elite users",
                users_updated,
            )

        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error("ai_portfolio_monthly_rebalance error: %s", e, exc_info=True)
        finally:
            self._write_job_run(
                "ai_portfolio_monthly_rebalance",
                started_at,
                status,
                err_msg,
                items_processed=users_updated,
            )

    async def intraday_lstm_scan(self):
        """Every 5 min — intraday LSTM signal scan for F1.

        Runs only during market hours on trading days. Writes new intraday
        signals to ``public.signals`` with ``signal_type='intraday'``.
        Full implementation lands with F1 feature PR (2-layer BiLSTM on
        5-min Nifty 50 + Bank Nifty bars).
        """
        started_at = datetime.utcnow()
        try:
            if not await self._is_trading_day():
                return  # silent — runs every 5 min, don't flood telemetry
            now = datetime.now().time()
            market_open = time(9, 15)
            market_close = time(15, 30)
            if not (market_open <= now <= market_close):
                return  # silent — outside market hours
            logger.debug("intraday_lstm_scan: awaiting F1 feature PR")
            self._write_job_run(
                "intraday_lstm_scan", started_at, "skipped",
                metadata={"reason": "not_implemented_awaiting_f1"},
            )
        except Exception as e:
            logger.error("intraday_lstm_scan error: %s", e)
            self._write_job_run(
                "intraday_lstm_scan", started_at, "failed", str(e),
            )

    # ========================================================================
    # PR 27 — Subscription lifecycle (auto-expire + renewal reminders)
    # ========================================================================

    async def subscription_lifecycle_check(self):
        """06:15 IST daily — expire past-due paid subs, send 3-day
        renewal reminders.

        Writes per-user telemetry into `scheduler_job_runs.metadata`:
            { "expired": N, "reminded": M }

        Events emitted per affected user:
            - `TIER_DOWNGRADED` PostHog event
            - `invalidate_user_tier_cache` so gates reflect new tier
            - `NOTIFICATION` via event_bus → frontend unlocks/locks UI
            - Renewal-reminder NOTIFICATION when `subscription_end` is
              within 3 days and we haven't already sent one this cycle
              (marker column ``subscription_reminder_sent_at``).
        """
        started_at = datetime.utcnow()
        status = "success"
        err_msg: Optional[str] = None
        expired = 0
        reminded = 0

        try:
            now_iso = datetime.utcnow().isoformat()
            today = date.today()
            reminder_cutoff = (today + timedelta(days=3)).isoformat()

            # ── 1. Expire past-due paid subscriptions ─────────────────
            try:
                past_due = (
                    self.supabase.table("user_profiles")
                    .select("id, tier, subscription_plan_id, subscription_end, "
                            "subscription_status")
                    .eq("subscription_status", "active")
                    .lte("subscription_end", now_iso)
                    .execute()
                )
                rows = past_due.data or []
            except Exception as exc:
                logger.warning("past-due query failed: %s", exc)
                rows = []

            for row in rows:
                user_id = row["id"]
                previous = str(row.get("tier") or "free").lower()
                if previous == "free":
                    continue
                try:
                    self.supabase.table("user_profiles").update({
                        "tier": "free",
                        "subscription_status": "expired",
                        "subscription_plan_id": None,
                    }).eq("id", user_id).execute()
                    expired += 1
                    await self._emit_tier_expired(
                        user_id=user_id,
                        previous=previous,
                        subscription_end=row.get("subscription_end"),
                    )
                except Exception as per_user:
                    logger.warning(
                        "subscription expire failed for %s: %s", user_id, per_user,
                    )

            # ── 2. Renewal reminders (3 days out, not already sent) ───
            try:
                upcoming = (
                    self.supabase.table("user_profiles")
                    .select("id, email, full_name, tier, subscription_end, "
                            "subscription_reminder_sent_at")
                    .eq("subscription_status", "active")
                    .gt("subscription_end", now_iso)
                    .lte("subscription_end", reminder_cutoff)
                    .execute()
                )
                upcoming_rows = upcoming.data or []
            except Exception as exc:
                logger.debug("renewal upcoming query failed: %s", exc)
                upcoming_rows = []

            for row in upcoming_rows:
                user_id = row["id"]
                sent_at = row.get("subscription_reminder_sent_at")
                end = row.get("subscription_end")
                # Skip if we already reminded for THIS cycle (sent_at >= last
                # billing start is too expensive to compute here — simpler
                # heuristic: if reminder was sent within 10 days, skip).
                if sent_at:
                    try:
                        sent_dt = datetime.fromisoformat(sent_at.replace("Z", "+00:00"))
                        age_days = (datetime.utcnow() - sent_dt.replace(tzinfo=None)).days
                        if age_days < 10:
                            continue
                    except Exception:
                        pass
                try:
                    await self._emit_renewal_reminder(
                        user_id=user_id,
                        email=row.get("email"),
                        tier=str(row.get("tier") or "").lower(),
                        subscription_end=end,
                    )
                    # Mark as sent.
                    self.supabase.table("user_profiles").update({
                        "subscription_reminder_sent_at": now_iso,
                    }).eq("id", user_id).execute()
                    reminded += 1
                except Exception as per_user:
                    logger.warning(
                        "renewal reminder failed for %s: %s", user_id, per_user,
                    )

            logger.info(
                "subscription_lifecycle_check: expired=%d reminded=%d",
                expired, reminded,
            )
        except Exception as e:
            status = "failed"
            err_msg = str(e)
            logger.error(
                "subscription_lifecycle_check error: %s", e, exc_info=True,
            )
        finally:
            self._write_job_run(
                "subscription_lifecycle_check",
                started_at, status, err_msg,
                items_processed=expired + reminded,
                metadata={"expired": expired, "reminded": reminded},
            )

    # ------------------------------------------------------------ emit helpers

    async def _emit_tier_expired(
        self,
        *,
        user_id: str,
        previous: str,
        subscription_end: Optional[str],
    ) -> None:
        """Fan-out when a tier auto-expires at end of billing period."""
        # 1) Invalidate tier cache so next API call reflects Free immediately.
        try:
            from ..core.tiers import invalidate_user_tier_cache
            invalidate_user_tier_cache(user_id)
        except Exception:
            pass

        # 2) PostHog TIER_DOWNGRADED + refresh user context.
        try:
            from ..observability import EventName, set_user_context, track
            track(EventName.TIER_DOWNGRADED, user_id, {
                "previous_tier": previous,
                "new_tier": "free",
                "reason": "subscription_expired",
                "subscription_end": subscription_end,
            })
            set_user_context(user_id, {"tier": "free"})
        except Exception:
            pass

        # 3) Event bus per-user NOTIFICATION — frontend locks paid features.
        try:
            from .event_bus import MessageType, emit_event
            await emit_event(
                MessageType.NOTIFICATION,
                {
                    "type": "tier_expired",
                    "title": "Subscription expired — tier reset to Free",
                    "message": (
                        f"Your {previous.title()} plan ended. Renew on /pricing to "
                        f"re-enable paid features."
                    ),
                    "previous_tier": previous,
                    "new_tier": "free",
                    "priority": "high",
                },
                user_id=user_id,
            )
        except Exception:
            pass

    async def _emit_renewal_reminder(
        self,
        *,
        user_id: str,
        email: Optional[str],
        tier: str,
        subscription_end: Optional[str],
    ) -> None:
        """3-day renewal reminder — in-app notification + best-effort email."""
        days_left: Optional[int] = None
        if subscription_end:
            try:
                end = datetime.fromisoformat(
                    subscription_end.replace("Z", "+00:00"),
                ).replace(tzinfo=None)
                days_left = max(0, (end.date() - date.today()).days)
            except Exception:
                pass

        # In-app NOTIFICATION via event_bus.
        try:
            from .event_bus import MessageType, emit_event
            await emit_event(
                MessageType.NOTIFICATION,
                {
                    "type": "renewal_reminder",
                    "title": f"{tier.title()} renews in {days_left or 'a few'} days",
                    "message": (
                        "Your subscription will auto-renew. Update payment method "
                        "or cancel on /settings/tier if you want to change plans."
                    ),
                    "days_left": days_left,
                    "tier": tier,
                    "priority": "normal",
                },
                user_id=user_id,
            )
        except Exception:
            pass

        # Best-effort email via existing NotificationService if present.
        try:
            if self.notification_service and email:
                subject = f"Swing AI — {tier.title()} plan renews in {days_left or 3} days"
                body_html = (
                    f"<p>Hi,</p>"
                    f"<p>Your Swing AI <strong>{tier.title()}</strong> plan "
                    f"renews in {days_left or 3} days (on "
                    f"{subscription_end or 'your billing date'}).</p>"
                    f"<p>No action needed if you want to keep access. "
                    f"To change plans or cancel, visit "
                    f"<a href='https://swingai.in/settings'>Settings → Tier + billing</a>.</p>"
                )
                email_service = getattr(self.notification_service, "email_service", None)
                if email_service and getattr(email_service, "is_available", False):
                    await email_service.send(email, subject, body_html)
        except Exception as exc:
            logger.debug("renewal reminder email failed: %s", exc)


# ============================================================================
# USAGE
# ============================================================================

if __name__ == "__main__":
    # Initialize and start scheduler
    # scheduler = SchedulerService(...)
    # scheduler.start()
    pass
