"""
================================================================================
SWINGAI PRODUCTION BACKEND
================================================================================
FastAPI + Supabase + Razorpay + Real-time WebSocket
Complete API for AI-powered swing trading platform
================================================================================
"""

import os
import json
import hmac
import hashlib
import asyncio
from datetime import datetime, date, time, timedelta
from typing import Dict, List, Optional, Any
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException, Depends, BackgroundTasks, WebSocket, WebSocketDisconnect, Request, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from supabase import create_client, Client
import httpx
import razorpay

from ..core.config import settings
from ..middleware import RateLimitMiddleware, LoggingMiddleware, SecurityHeadersMiddleware
from ..services.realtime import create_realtime_services
from ..services.scheduler import SchedulerService
from ..services.signal_generator import SignalGenerator
from ..services.trade_execution_service import TradeExecutionService
from ..services.risk_management import RiskManagementEngine, RISK_PROFILES, Signal as RiskSignal, Segment, Direction
from ..services.assistant import AssistantService, AssistantCreditLimiter
from ..schemas import (
    UserSignup, UserLogin, ProfileUpdate, ExecuteTrade, CloseTrade,
    CreateOrder, VerifyPayment, BrokerConnect, WatchlistAdd,
    SuccessResponse, ErrorResponse, UserStats, PortfolioSummary,
    MarketStatus, RiskAssessment, PositionUpdate,
    AssistantChatRequest, AssistantChatResponse, AssistantUsageResponse,
)

# ============================================================================
# LOGGING
# ============================================================================

# Optional: Sentry error tracking
if settings.SENTRY_DSN:
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration
        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.APP_ENV,
            traces_sample_rate=0.1,
            integrations=[FastApiIntegration(), StarletteIntegration()],
        )
    except ImportError:
        pass  # sentry-sdk not installed

logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# CLIENTS
# ============================================================================

def get_supabase() -> Client:
    """Get Supabase client (anon key)"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)

def get_supabase_admin() -> Client:
    """Get Supabase admin client (service role key)"""
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)

def get_razorpay() -> razorpay.Client:
    """Get Razorpay client"""
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

# ============================================================================
# AUTH DEPENDENCY
# ============================================================================

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current authenticated user from JWT token"""
    try:
        token = credentials.credentials
        supabase = get_supabase()
        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user.user
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

async def get_user_profile(user = Depends(get_current_user)):
    """Get user profile with subscription details"""
    supabase = get_supabase_admin()
    result = supabase.table("user_profiles").select("*, subscription_plans(*)").eq("id", user.id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return result.data

# ============================================================================
# RUNTIME SERVICES (realtime + scheduler)
# ============================================================================

realtime_services: Dict[str, Any] = {}
manager: Optional[Any] = None
scheduler_service: Optional[SchedulerService] = None
assistant_credit_limiter = AssistantCreditLimiter()

# ============================================================================
# APP INITIALIZATION
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    global realtime_services, manager, scheduler_service
    logger.info(f"🚀 Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Environment: {settings.APP_ENV}")

    # Initialize TrueData connection (if configured)
    if settings.DATA_PROVIDER.lower() == "truedata":
        try:
            from ..services import truedata_client
            success = truedata_client.initialize(timeout=settings.TRUEDATA_INIT_TIMEOUT)
            if success:
                logger.info("✅ TrueData connected (real-time + historical)")
            else:
                logger.warning("⚠️ TrueData init failed — falling back to yfinance")
        except Exception as e:
            logger.warning(f"⚠️ TrueData init error: {e} — falling back to yfinance")

    # Initialize realtime services (WebSocket manager + notifications)
    try:
        realtime_services = create_realtime_services(get_supabase_admin(), settings.REDIS_URL)
        manager = realtime_services.get("manager")
        app.state.realtime = realtime_services

        if manager and settings.ENABLE_REDIS:
            await manager.init_redis()
            logger.info("✅ Realtime services initialized with Redis")
        else:
            logger.info("✅ Realtime services initialized (in-memory)")
    except Exception as e:
        logger.error(f"Realtime initialization failed: {e}")

    # Wire TrueData live ticks → PriceService (real-time WebSocket push)
    if settings.DATA_PROVIDER.lower() == "truedata":
        try:
            from ..services import truedata_client
            price_service = realtime_services.get("price_service")
            if price_service:
                loop = asyncio.get_event_loop()

                def _on_tick(symbol: str, data: dict):
                    """Bridge sync TrueData tick callback → async PriceService."""
                    price_data = {
                        "symbol": symbol,
                        "ltp": data.get("price", data.get("ltp", 0)),
                        "open": data.get("open", 0),
                        "high": data.get("high", 0),
                        "low": data.get("low", 0),
                        "change": data.get("change", 0),
                        "change_percent": data.get("change_percent", 0),
                        "volume": data.get("volume", 0),
                    }
                    asyncio.run_coroutine_threadsafe(
                        price_service.update_price(symbol, price_data), loop
                    )

                truedata_client.register_price_callback(_on_tick)
                logger.info("✅ TrueData ticks wired to WebSocket PriceService")
        except Exception as e:
            logger.warning(f"TrueData→PriceService bridge failed: {e}")

    # Initialize signal generator + model download (startup health)
    try:
        signal_generator = SignalGenerator(
            get_supabase_admin(),
            modal_endpoint=settings.ML_INFERENCE_URL,
            use_enhanced_ai=settings.ENABLE_ENHANCED_AI,
            enhanced_modal_endpoint=settings.ENHANCED_ML_INFERENCE_URL,
        )
        app.state.signal_generator = signal_generator
        app.state.model_status = await signal_generator.ensure_models()
        logger.info(f"✅ Model status: {app.state.model_status}")
    except Exception as e:
        app.state.model_status = {"xgboost": False, "tft": False, "tft_config": False}
        logger.error(f"Model initialization failed: {e}")

    # Initialize scheduler (optional)
    if settings.ENABLE_SCHEDULER:
        try:
            if not app.state.signal_generator:
                signal_generator = SignalGenerator(
                    get_supabase_admin(),
                    modal_endpoint=settings.ML_INFERENCE_URL,
                    use_enhanced_ai=settings.ENABLE_ENHANCED_AI,
                    enhanced_modal_endpoint=settings.ENHANCED_ML_INFERENCE_URL,
                )
                app.state.signal_generator = signal_generator
            else:
                signal_generator = app.state.signal_generator
            trade_executor = TradeExecutionService(get_supabase_admin())
            notification_service = realtime_services.get("notification_service")
            scheduler_service = SchedulerService(
                get_supabase_admin(),
                signal_generator,
                trade_executor,
                notification_service,
            )
            scheduler_service.start()
            app.state.scheduler = scheduler_service
            logger.info("✅ Scheduler started")
        except Exception as e:
            logger.error(f"Scheduler initialization failed: {e}")

    yield

    if scheduler_service:
        scheduler_service.stop()

    # Disconnect TrueData WebSocket + REST
    if settings.DATA_PROVIDER.lower() == "truedata":
        try:
            from ..services import truedata_client
            truedata_client.shutdown()
            logger.info("TrueData disconnected")
        except Exception:
            pass

    logger.info("🛑 Shutting down SwingAI")

app = FastAPI(
    title=settings.APP_NAME,
    description="AI-Powered Swing Trading Platform for Indian Markets",
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan
)

# ============================================================================
# MIDDLEWARE
# ============================================================================

# CORS - Allow frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security Headers
app.add_middleware(SecurityHeadersMiddleware)

# Logging
app.add_middleware(LoggingMiddleware)

# Rate Limiting
app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.RATE_LIMIT_PER_MINUTE)

# ============================================================================
# HEALTH & STATUS
# ============================================================================

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
        "docs": "/api/docs",
        "health": "/api/health"
    }

@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health():
    """Health check endpoint"""
    try:
        supabase = get_supabase_admin()
        supabase.table("subscription_plans").select("id").limit(1).execute()
        db_status = "connected"
    except:
        db_status = "error"
    
    return {
        "status": "healthy",
        "database": db_status,
        "models": getattr(app.state, "model_status", {}),
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION
    }

# ============================================================================
# AUTH ROUTES
# ============================================================================

@app.post("/api/auth/signup", tags=["Auth"])
async def signup(data: UserSignup):
    """Create new user account"""
    try:
        supabase = get_supabase()
        response = supabase.auth.sign_up({
            "email": data.email,
            "password": data.password,
            "options": {"data": {"full_name": data.full_name, "phone": data.phone}}
        })
        
        if response.user:
            return {"success": True, "message": "Account created. Check email for verification.", "user_id": response.user.id}
        raise HTTPException(status_code=400, detail="Signup failed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login", tags=["Auth"])
async def login(data: UserLogin):
    """Login with email and password"""
    try:
        supabase = get_supabase()
        response = supabase.auth.sign_in_with_password({"email": data.email, "password": data.password})
        
        if response.user and response.session:
            # Update last login
            supabase_admin = get_supabase_admin()
            supabase_admin.table("user_profiles").update({
                "last_login": datetime.utcnow().isoformat(),
                "last_active": datetime.utcnow().isoformat()
            }).eq("id", response.user.id).execute()
            
            return {
                "success": True,
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token,
                "expires_at": response.session.expires_at,
                "user": {"id": response.user.id, "email": response.user.email}
            }
        raise HTTPException(status_code=401, detail="Invalid credentials")
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/api/auth/refresh", tags=["Auth"])
async def refresh(refresh_token: str):
    """Refresh access token"""
    try:
        supabase = get_supabase()
        response = supabase.auth.refresh_session(refresh_token)
        if response.session:
            return {
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token
            }
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

@app.post("/api/auth/logout", tags=["Auth"])
async def logout(user = Depends(get_current_user)):
    """Logout user"""
    return {"success": True}

@app.post("/api/auth/forgot-password", tags=["Auth"])
async def forgot_password(email: str):
    """Send password reset email"""
    try:
        supabase = get_supabase()
        supabase.auth.reset_password_email(email, {
            "redirect_to": f"{settings.FRONTEND_URL}/reset-password"
        })
        return {"success": True, "message": "Password reset email sent"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ============================================================================
# USER PROFILE ROUTES
# ============================================================================

@app.get("/api/auth/me", tags=["Auth"])
async def get_current_user_info(user = Depends(get_current_user)):
    """Get current authenticated user info"""
    return {"user_id": user.id, "email": user.email}

@app.get("/api/user/profile", tags=["User"])
async def get_profile(profile = Depends(get_user_profile)):
    """Get current user profile"""
    return profile

@app.put("/api/user/profile", tags=["User"])
async def update_profile(data: ProfileUpdate, user = Depends(get_current_user)):
    """Update user profile"""
    try:
        supabase = get_supabase_admin()
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        update_data["updated_at"] = datetime.utcnow().isoformat()
        result = supabase.table("user_profiles").update(update_data).eq("id", user.id).execute()
        return {"success": True, "data": result.data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/user/stats", tags=["User"])
async def get_user_stats(user = Depends(get_current_user)):
    """Get user trading statistics"""
    try:
        supabase = get_supabase_admin()
        
        profile = supabase.table("user_profiles").select("*").eq("id", user.id).single().execute()
        positions = supabase.table("positions").select("*").eq("user_id", user.id).eq("is_active", True).execute()
        
        today = date.today().isoformat()
        today_trades = supabase.table("trades").select("net_pnl").eq("user_id", user.id).eq("status", "closed").gte("closed_at", today).execute()
        
        week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()
        week_trades = supabase.table("trades").select("net_pnl, status").eq("user_id", user.id).gte("created_at", week_start).execute()
        
        p = profile.data
        pos = positions.data or []
        
        unrealized_pnl = sum(float(pos_item.get("unrealized_pnl", 0) or 0) for pos_item in pos)
        today_pnl = sum(float(t.get("net_pnl", 0) or 0) for t in today_trades.data or [])
        week_pnl = sum(float(t.get("net_pnl", 0) or 0) for t in week_trades.data or [] if t.get("status") == "closed")
        
        win_rate = (p["winning_trades"] / p["total_trades"] * 100) if p["total_trades"] > 0 else 0
        
        return {
            "capital": p["capital"],
            "total_pnl": p["total_pnl"],
            "total_trades": p["total_trades"],
            "winning_trades": p["winning_trades"],
            "win_rate": round(win_rate, 2),
            "open_positions": len(pos),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "today_pnl": round(today_pnl, 2),
            "week_pnl": round(week_pnl, 2),
            "subscription_status": p["subscription_status"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# SUBSCRIPTION & PAYMENT ROUTES
# ============================================================================

@app.get("/api/plans", tags=["Subscription"])
async def get_plans():
    """Get all subscription plans"""
    try:
        supabase = get_supabase_admin()
        result = supabase.table("subscription_plans").select("*").eq("is_active", True).order("sort_order").execute()
        return {"plans": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/payments/create-order", tags=["Payments"])
async def create_payment_order(data: CreateOrder, user = Depends(get_current_user)):
    """Create Razorpay payment order"""
    try:
        supabase = get_supabase_admin()
        rzp = get_razorpay()
        
        plan = supabase.table("subscription_plans").select("*").eq("id", data.plan_id).single().execute()
        if not plan.data:
            raise HTTPException(status_code=404, detail="Plan not found")
        
        # Calculate amount based on billing period
        if data.billing_period == "monthly":
            amount = plan.data["price_monthly"]
        elif data.billing_period == "quarterly":
            amount = plan.data["price_quarterly"]
        else:
            amount = plan.data["price_yearly"]
        
        # Create Razorpay order
        order_data = {
            "amount": amount,
            "currency": "INR",
            "receipt": f"order_{user.id[:8]}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "notes": {
                "user_id": user.id,
                "plan_id": data.plan_id,
                "billing_period": data.billing_period.value
            }
        }
        
        rzp_order = rzp.order.create(order_data)
        
        # Save to database
        supabase.table("payments").insert({
            "user_id": user.id,
            "razorpay_order_id": rzp_order["id"],
            "amount": amount,
            "plan_id": data.plan_id,
            "billing_period": data.billing_period.value,
            "status": "pending"
        }).execute()
        
        return {
            "order_id": rzp_order["id"],
            "amount": amount,
            "currency": "INR",
            "key_id": settings.RAZORPAY_KEY_ID
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/payments/verify", tags=["Payments"])
async def verify_payment(data: VerifyPayment, user = Depends(get_current_user)):
    """Verify Razorpay payment and activate subscription"""
    try:
        supabase = get_supabase_admin()
        
        # Verify signature
        message = f"{data.razorpay_order_id}|{data.razorpay_payment_id}"
        expected_signature = hmac.new(
            settings.RAZORPAY_KEY_SECRET.encode(),
            message.encode(),
            hashlib.sha256
        ).hexdigest()
        
        if expected_signature != data.razorpay_signature:
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Get payment record
        payment = supabase.table("payments").select("*").eq("razorpay_order_id", data.razorpay_order_id).single().execute()
        if not payment.data:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        # Update payment
        supabase.table("payments").update({
            "razorpay_payment_id": data.razorpay_payment_id,
            "razorpay_signature": data.razorpay_signature,
            "status": "completed",
            "completed_at": datetime.utcnow().isoformat()
        }).eq("id", payment.data["id"]).execute()
        
        # Calculate subscription end date
        billing_period = payment.data["billing_period"]
        if billing_period == "monthly":
            end_date = datetime.utcnow() + timedelta(days=30)
        elif billing_period == "quarterly":
            end_date = datetime.utcnow() + timedelta(days=90)
        else:
            end_date = datetime.utcnow() + timedelta(days=365)
        
        # Update user subscription
        supabase.table("user_profiles").update({
            "subscription_plan_id": payment.data["plan_id"],
            "subscription_status": "active",
            "subscription_start": datetime.utcnow().isoformat(),
            "subscription_end": end_date.isoformat()
        }).eq("id", user.id).execute()
        
        return {"success": True, "message": "Payment verified and subscription activated"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/payments/history", tags=["Payments"])
async def get_payment_history(user = Depends(get_current_user)):
    """Get user payment history"""
    try:
        supabase = get_supabase_admin()
        result = supabase.table("payments").select("*, subscription_plans(display_name)").eq("user_id", user.id).order("created_at", desc=True).execute()
        return {"payments": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# SIGNALS ROUTES
# ============================================================================

@app.get("/api/signals/today", tags=["Signals"])
async def get_today_signals(
    segment: Optional[str] = None,
    direction: Optional[str] = None,
    profile = Depends(get_user_profile)
):
    """Get today's trading signals"""
    try:
        supabase = get_supabase_admin()
        today = date.today().isoformat()
        
        query = supabase.table("signals").select("*").eq("date", today).eq("status", "active")
        
        if segment:
            query = query.eq("segment", segment)
        if direction:
            query = query.eq("direction", direction)
        
        # Check subscription for premium signals
        is_premium = profile.get("subscription_status") in ["active", "trial"]
        if not is_premium:
            query = query.eq("is_premium", False)
        
        result = query.order("confidence", desc=True).execute()
        signals = result.data
        
        return {
            "date": today,
            "total": len(signals),
            "long_signals": [s for s in signals if s["direction"] == "LONG"],
            "short_signals": [s for s in signals if s["direction"] == "SHORT"],
            "equity_signals": [s for s in signals if s["segment"] == "EQUITY"],
            "futures_signals": [s for s in signals if s["segment"] == "FUTURES"],
            "options_signals": [s for s in signals if s["segment"] == "OPTIONS"],
            "all_signals": signals
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/signals/{signal_id}", tags=["Signals"])
async def get_signal(signal_id: str, user = Depends(get_current_user)):
    """Get signal details"""
    try:
        supabase = get_supabase_admin()
        result = supabase.table("signals").select("*").eq("id", signal_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Signal not found")
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/signals/history", tags=["Signals"])
async def get_signal_history(
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    status: Optional[str] = None,
    segment: Optional[str] = None,
    direction: Optional[str] = None,
    limit: int = 100,
    profile = Depends(get_user_profile)
):
    """Get historical signals with optional filters"""
    try:
        supabase = get_supabase_admin()
        query = supabase.table("signals").select("*")

        if from_date:
            query = query.gte("date", from_date)
        if to_date:
            query = query.lte("date", to_date)
        if status:
            query = query.eq("status", status)
        if segment:
            query = query.eq("segment", segment)
        if direction:
            query = query.eq("direction", direction)

        # Premium gating
        is_premium = profile.get("subscription_status") in ["active", "trial"]
        if not is_premium:
            query = query.eq("is_premium", False)

        result = query.order("date", desc=True).limit(limit).execute()
        return {"signals": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/signals/performance", tags=["Signals"])
async def get_signal_performance(days: int = 30, user = Depends(get_current_user)):
    """Get signal performance metrics"""
    try:
        supabase = get_supabase_admin()
        start_date = (date.today() - timedelta(days=days)).isoformat()
        
        result = supabase.table("model_performance").select("*").gte("date", start_date).order("date", desc=True).execute()
        return {"performance": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# TRADES ROUTES
# ============================================================================

@app.get("/api/trades", tags=["Trades"])
async def get_trades(
    status: Optional[str] = None,
    segment: Optional[str] = None,
    limit: int = 50,
    user = Depends(get_current_user)
):
    """Get user trades"""
    try:
        supabase = get_supabase_admin()
        query = supabase.table("trades").select("*, signals(symbol, direction, confidence)").eq("user_id", user.id)
        
        if status:
            query = query.eq("status", status)
        if segment:
            query = query.eq("segment", segment)
        
        result = query.order("created_at", desc=True).limit(limit).execute()
        return {"trades": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trades/execute", tags=["Trades"])
async def execute_trade(data: ExecuteTrade, profile = Depends(get_user_profile)):
    """Execute a trade from signal"""
    try:
        supabase = get_supabase_admin()
        user_id = profile["id"]
        
        # Get signal
        signal = supabase.table("signals").select("*").eq("id", data.signal_id).single().execute()
        if not signal.data:
            raise HTTPException(status_code=404, detail="Signal not found")
        
        sig = signal.data
        
        # Check subscription for premium signals
        if sig.get("is_premium") and profile.get("subscription_status") not in ["active", "trial"]:
            raise HTTPException(status_code=403, detail="Premium subscription required")
        
        # Check if F&O is enabled for F&O signals
        if sig["segment"] in ["FUTURES", "OPTIONS"] and not profile.get("fo_enabled"):
            raise HTTPException(status_code=403, detail="F&O trading not enabled")
        
        # Check trading mode
        if profile["trading_mode"] == "signal_only":
            raise HTTPException(status_code=400, detail="Auto-trading not enabled")
        
        # Check max positions
        positions = supabase.table("positions").select("id").eq("user_id", user_id).eq("is_active", True).execute()
        plan = profile.get("subscription_plans") or {}
        max_positions = plan.get("max_positions", profile.get("max_positions", 5))
        
        if len(positions.data) >= max_positions:
            raise HTTPException(status_code=400, detail=f"Max positions ({max_positions}) reached")
        
        # Paper -> Live gate
        if profile.get("kill_switch_active"):
            raise HTTPException(status_code=400, detail="Kill switch active. Trading paused.")
        paper_start = profile.get("paper_trading_started_at") or profile.get("created_at")
        paper_start_dt = datetime.fromisoformat(paper_start.replace("Z", "+00:00")) if isinstance(paper_start, str) else paper_start
        days_elapsed = (datetime.utcnow() - paper_start_dt).days if paper_start_dt else 0
        eligible_live = profile.get("live_trading_whitelisted", False) and days_elapsed >= settings.PAPER_TRADE_DAYS
        execution_mode = "live" if (eligible_live or not settings.LIVE_TRADING_WHITELIST_ONLY) else "paper"

        # Risk engine checks
        risk_engine = RiskManagementEngine(supabase)
        risk_profile = RISK_PROFILES.get(profile.get("risk_profile", "moderate"), RISK_PROFILES["moderate"])

        entry_price = float(sig["entry_price"])
        stop_loss = float(data.custom_sl or sig["stop_loss"])
        target = float(data.custom_target or sig["target_1"])

        signal_obj = RiskSignal(
            symbol=sig["symbol"],
            segment=Segment[sig["segment"]],
            direction=Direction.LONG if sig["direction"] == "LONG" else Direction.SHORT,
            confidence=float(sig["confidence"]),
            entry_price=entry_price,
            stop_loss=stop_loss,
            target=target,
            lot_size=int(sig.get("lot_size") or 1),
            expiry=sig.get("expiry_date"),
            strike=sig.get("strike_price"),
            option_type=sig.get("option_type"),
        )

        ok, msg = risk_engine.check_signal_quality(signal_obj, risk_profile)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)

        ok, msg = await risk_engine.check_portfolio_limits(user_id, signal_obj, risk_profile)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)

        ok, msg = await risk_engine.check_loss_limits(user_id, risk_profile)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)

        # Available margin (only for live)
        available_margin = None
        if execution_mode == "live":
            try:
                from ..services.broker_integration import BrokerFactory
                from ..services.broker_credentials import decrypt_credentials
                conn = supabase.table("broker_connections").select(
                    "broker_name, access_token"
                ).eq("user_id", user_id).eq("status", "connected").single().execute()
                if conn.data:
                    broker = BrokerFactory.create(conn.data["broker_name"], decrypt_credentials(conn.data["access_token"]))
                    if broker.login():
                        available_margin = broker.get_available_margin()
            except Exception as e:
                logger.warning(f"Margin fetch failed: {e}")

        capital = float(profile["capital"])
        pos = risk_engine.calculate_position_size(signal_obj, capital, risk_profile, available_margin)
        if not pos.approved:
            raise HTTPException(status_code=400, detail=pos.rejection_reason or "Position rejected")

        quantity = data.quantity or pos.quantity
        lots = data.lots or pos.lots
        margin_used = pos.margin_required
        
        # Create trade
        trade = {
            "user_id": user_id,
            "signal_id": data.signal_id,
            "symbol": sig["symbol"],
            "exchange": sig.get("exchange", "NSE"),
            "segment": sig["segment"],
            "expiry_date": sig.get("expiry_date"),
            "strike_price": sig.get("strike_price"),
            "option_type": sig.get("option_type"),
            "lot_size": sig.get("lot_size"),
            "lots": lots,
            "direction": sig["direction"],
            "quantity": quantity,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "target": target,
            "risk_amount": pos.risk_amount,
            "position_value": quantity * entry_price,
            "margin_used": margin_used,
            "product_type": "CNC" if sig["segment"] == "EQUITY" else "NRML",
            "execution_mode": execution_mode,
            "status": "pending" if profile["trading_mode"] == "semi_auto" else "open"
        }
        
        result = supabase.table("trades").insert(trade).execute()
        trade_id = result.data[0]["id"]
        
        # If full auto, create position immediately
        if profile["trading_mode"] == "full_auto":
            trade_executor = TradeExecutionService(get_supabase_admin())
            if execution_mode == "live":
                await trade_executor.execute({**trade, "id": trade_id, "execution_mode": "live"})
            else:
                position = {
                    "user_id": user_id,
                    "trade_id": trade_id,
                    "symbol": sig["symbol"],
                    "exchange": sig.get("exchange", "NSE"),
                    "segment": sig["segment"],
                    "expiry_date": sig.get("expiry_date"),
                    "strike_price": sig.get("strike_price"),
                    "option_type": sig.get("option_type"),
                    "direction": sig["direction"],
                    "quantity": quantity,
                    "lots": lots,
                    "average_price": entry_price,
                    "current_price": entry_price,
                    "stop_loss": stop_loss,
                    "target": target,
                    "margin_used": margin_used,
                    "execution_mode": "paper",
                    "is_active": True
                }
                supabase.table("positions").insert(position).execute()
                supabase.table("trades").update({
                    "status": "open",
                    "executed_at": datetime.utcnow().isoformat()
                }).eq("id", trade_id).execute()
        
        return {
            "success": True,
            "trade_id": trade_id,
            "status": trade["status"],
            "quantity": quantity,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "target": target
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Trade execution error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trades/{trade_id}/approve", tags=["Trades"])
async def approve_trade(trade_id: str, user = Depends(get_current_user)):
    """Approve pending trade (for semi-auto mode)"""
    try:
        supabase = get_supabase_admin()
        
        trade = supabase.table("trades").select("*").eq("id", trade_id).eq("user_id", user.id).single().execute()
        if not trade.data:
            raise HTTPException(status_code=404, detail="Trade not found")
        
        if trade.data["status"] != "pending":
            raise HTTPException(status_code=400, detail="Trade not pending")
        
        t = trade.data
        
        if t.get("execution_mode") == "live":
            trade_executor = TradeExecutionService(get_supabase_admin())
            await trade_executor.execute({**t, "execution_mode": "live"})
        else:
            position = {
                "user_id": user.id,
                "trade_id": trade_id,
                "symbol": t["symbol"],
                "exchange": t.get("exchange", "NSE"),
                "segment": t["segment"],
                "expiry_date": t.get("expiry_date"),
                "strike_price": t.get("strike_price"),
                "option_type": t.get("option_type"),
                "direction": t["direction"],
                "quantity": t["quantity"],
                "lots": t.get("lots", 1),
                "average_price": t["entry_price"],
                "current_price": t["entry_price"],
                "stop_loss": t["stop_loss"],
                "target": t["target"],
                "margin_used": t.get("margin_used", 0),
                "execution_mode": "paper",
                "is_active": True
            }
            supabase.table("positions").insert(position).execute()
            
            supabase.table("trades").update({
                "status": "open",
                "approved_at": datetime.utcnow().isoformat(),
                "executed_at": datetime.utcnow().isoformat()
            }).eq("id", trade_id).execute()
        
        return {"success": True, "message": "Trade approved and executed"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def _close_trade_record(trade_id: str, data: CloseTrade, user_id: str) -> Dict[str, Any]:
    """Shared close-trade logic used by trades and positions endpoints"""
    supabase = get_supabase_admin()

    trade = supabase.table("trades").select("*").eq("id", trade_id).eq("user_id", user_id).single().execute()
    if not trade.data or trade.data["status"] != "open":
        raise HTTPException(status_code=400, detail="Trade not found or not open")

    t = trade.data
    if t.get("execution_mode") == "live":
        pos = supabase.table("positions").select("*").eq("trade_id", trade_id).eq("is_active", True).single().execute()
        if pos.data:
            trade_executor = TradeExecutionService(get_supabase_admin())
            await trade_executor.close_position(pos.data, data.exit_price or t["entry_price"], data.reason)
            return {"success": True}

    exit_price = data.exit_price or t["entry_price"]

    # Calculate P&L
    if t["direction"] == "LONG":
        gross_pnl = (exit_price - t["entry_price"]) * t["quantity"]
    else:
        gross_pnl = (t["entry_price"] - exit_price) * t["quantity"]

    # Estimate charges
    charge_rate = 0.001 if t["segment"] == "EQUITY" else 0.0005
    charges = abs(t["position_value"]) * charge_rate
    net_pnl = gross_pnl - charges
    pnl_percent = (net_pnl / t["position_value"]) * 100 if t["position_value"] else 0

    # Update trade
    supabase.table("trades").update({
        "status": "closed",
        "exit_price": exit_price,
        "gross_pnl": gross_pnl,
        "charges": charges,
        "net_pnl": net_pnl,
        "pnl_percent": pnl_percent,
        "exit_reason": data.reason,
        "closed_at": datetime.utcnow().isoformat()
    }).eq("id", trade_id).execute()

    # Deactivate position
    supabase.table("positions").update({"is_active": False}).eq("trade_id", trade_id).execute()

    return {
        "success": True,
        "gross_pnl": round(gross_pnl, 2),
        "net_pnl": round(net_pnl, 2),
        "pnl_percent": round(pnl_percent, 2)
    }

@app.post("/api/trades/{trade_id}/close", tags=["Trades"])
async def close_trade(trade_id: str, data: CloseTrade = CloseTrade(), user = Depends(get_current_user)):
    """Close an open trade"""
    try:
        return await _close_trade_record(trade_id, data, user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/trades/kill-switch", tags=["Trades"])
async def kill_switch(user = Depends(get_current_user)):
    """Emergency kill switch: close all positions and pause trading."""
    try:
        supabase = get_supabase_admin()
        supabase.table("user_profiles").update({
            "kill_switch_active": True
        }).eq("id", user.id).execute()

        positions = supabase.table("positions").select("*").eq("user_id", user.id).eq("is_active", True).execute()
        trade_executor = TradeExecutionService(get_supabase_admin())
        for pos in positions.data or []:
            if pos.get("execution_mode") == "live":
                await trade_executor.close_position(pos, pos.get("current_price") or pos.get("average_price"), "kill_switch")
            else:
                await _close_trade_record(pos.get("trade_id"), CloseTrade(exit_price=pos.get("current_price"), reason="kill_switch"), user.id)

        return {"success": True, "message": "Kill switch activated. All positions closed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# PORTFOLIO ROUTES
# ============================================================================

@app.get("/api/portfolio", tags=["Portfolio"])
async def get_portfolio(profile = Depends(get_user_profile)):
    """Get portfolio summary"""
    try:
        supabase = get_supabase_admin()
        user_id = profile["id"]
        
        positions = supabase.table("positions").select("*").eq("user_id", user_id).eq("is_active", True).execute()
        pos_list = positions.data or []
        
        total_invested = sum(p["quantity"] * p["average_price"] for p in pos_list)
        total_current = sum(p["quantity"] * (p["current_price"] or p["average_price"]) for p in pos_list)
        unrealized_pnl = total_current - total_invested
        margin_used = sum(p.get("margin_used", 0) or 0 for p in pos_list)
        
        return {
            "capital": profile["capital"],
            "deployed": round(total_invested, 2),
            "available": round(profile["capital"] - total_invested, 2),
            "margin_used": round(margin_used, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "positions": pos_list,
            "equity_positions": [p for p in pos_list if p["segment"] == "EQUITY"],
            "fo_positions": [p for p in pos_list if p["segment"] in ["FUTURES", "OPTIONS"]]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/portfolio/history", tags=["Portfolio"])
async def get_portfolio_history(days: int = 30, user = Depends(get_current_user)):
    """Get portfolio history"""
    try:
        supabase = get_supabase_admin()
        start_date = (date.today() - timedelta(days=days)).isoformat()
        
        result = supabase.table("portfolio_history").select("*").eq("user_id", user.id).gte("date", start_date).order("date").execute()
        return {"history": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/portfolio/performance", tags=["Portfolio"])
async def get_performance_metrics(user = Depends(get_current_user)):
    """Get portfolio performance metrics"""
    try:
        supabase = get_supabase_admin()
        
        trades = supabase.table("trades").select("*").eq("user_id", user.id).eq("status", "closed").execute()
        
        if not trades.data:
            return {
                "total_trades": 0, "win_rate": 0, "avg_win": 0, "avg_loss": 0,
                "profit_factor": 0, "total_pnl": 0, "best_trade": 0, "worst_trade": 0
            }
        
        t_list = trades.data
        winners = [t for t in t_list if (t.get("net_pnl") or 0) > 0]
        losers = [t for t in t_list if (t.get("net_pnl") or 0) < 0]
        
        total_wins = sum(t.get("net_pnl", 0) for t in winners)
        total_losses = abs(sum(t.get("net_pnl", 0) for t in losers))
        
        return {
            "total_trades": len(t_list),
            "winners": len(winners),
            "losers": len(losers),
            "win_rate": round(len(winners) / len(t_list) * 100, 2) if t_list else 0,
            "avg_win": round(total_wins / len(winners), 2) if winners else 0,
            "avg_loss": round(total_losses / len(losers), 2) if losers else 0,
            "profit_factor": round(total_wins / total_losses, 2) if total_losses > 0 else 0,
            "total_pnl": round(sum(t.get("net_pnl", 0) for t in t_list), 2),
            "best_trade": round(max(t.get("net_pnl", 0) for t in t_list), 2),
            "worst_trade": round(min(t.get("net_pnl", 0) for t in t_list), 2)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# POSITIONS ROUTES
# ============================================================================

@app.get("/api/positions", tags=["Positions"])
async def get_positions(user = Depends(get_current_user)):
    """Get active positions"""
    try:
        supabase = get_supabase_admin()
        result = supabase.table("positions").select("*").eq("user_id", user.id).eq("is_active", True).execute()
        return {"positions": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/positions/open", tags=["Positions"])
async def get_open_positions(user = Depends(get_current_user)):
    """Get active positions (alias)"""
    return await get_positions(user)

@app.get("/api/positions/{position_id}", tags=["Positions"])
async def get_position(position_id: str, user = Depends(get_current_user)):
    """Get a single position"""
    try:
        supabase = get_supabase_admin()
        result = supabase.table("positions").select("*").eq("id", position_id).eq("user_id", user.id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Position not found")
        return result.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/positions/{position_id}", tags=["Positions"])
async def update_position(position_id: str, data: PositionUpdate, user = Depends(get_current_user)):
    """Update position SL/Target"""
    try:
        supabase = get_supabase_admin()
        
        update_data = {}
        if data.stop_loss:
            update_data["stop_loss"] = data.stop_loss
        if data.target:
            update_data["target"] = data.target
        
        if update_data:
            supabase.table("positions").update(update_data).eq("id", position_id).eq("user_id", user.id).execute()
            # Also update the trade
            position = supabase.table("positions").select("trade_id").eq("id", position_id).eq("user_id", user.id).single().execute()
            trade_id = position.data.get("trade_id") if position.data else None
            if trade_id:
                supabase.table("trades").update(update_data).eq("id", trade_id).eq("user_id", user.id).execute()
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/positions/{position_id}/close", tags=["Positions"])
async def close_position(position_id: str, data: CloseTrade = CloseTrade(), user = Depends(get_current_user)):
    """Close an open position by position id"""
    try:
        supabase = get_supabase_admin()
        position = supabase.table("positions").select("trade_id").eq("id", position_id).eq("user_id", user.id).single().execute()
        if not position.data or not position.data.get("trade_id"):
            raise HTTPException(status_code=404, detail="Position not found")

        trade_id = position.data["trade_id"]
        return await _close_trade_record(trade_id, data, user.id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# MARKET DATA ROUTES
# ============================================================================

@app.get("/api/market/data", tags=["Market"])
async def get_market_data(user = Depends(get_current_user)):
    """Get current market data"""
    try:
        supabase = get_supabase_admin()
        today = date.today().isoformat()
        
        result = supabase.table("market_data").select("*").eq("date", today).single().execute()
        
        return result.data or {
            "date": today,
            "nifty_close": 0,
            "vix_close": 0,
            "market_trend": "UNKNOWN",
            "risk_level": "UNKNOWN"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market/risk", tags=["Market"])
async def get_risk_assessment(user = Depends(get_current_user)):
    """Get market risk assessment"""
    try:
        supabase = get_supabase_admin()
        today = date.today().isoformat()
        
        result = supabase.table("market_data").select("*").eq("date", today).single().execute()
        data = result.data or {}
        
        vix = data.get("vix_close", 15)
        
        if vix < 15:
            risk_level, recommendation = "LOW", "Normal trading - full position sizes"
        elif vix < 20:
            risk_level, recommendation = "MODERATE", "Reduce position sizes by 25%"
        elif vix < 25:
            risk_level, recommendation = "HIGH", "Reduce position sizes by 50%, only high-confidence trades"
        else:
            risk_level, recommendation = "EXTREME", "Stop all new trades, consider hedging"
        
        return {
            "vix": vix,
            "risk_level": risk_level,
            "recommendation": recommendation,
            "nifty_change": data.get("nifty_change_percent", 0),
            "fii_net": data.get("fii_cash", 0),
            "market_trend": data.get("market_trend", "UNKNOWN"),
            "circuit_breaker": risk_level == "EXTREME"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# BROKER ROUTES
# ============================================================================

@app.post("/api/broker/connect", tags=["Broker"])
async def connect_broker(data: BrokerConnect, user = Depends(get_current_user)):
    """Connect broker account (non-OAuth/manual credentials)"""
    try:
        from ..services.broker_credentials import encrypt_credentials
        supabase = get_supabase_admin()
        
        credentials = {k: v for k, v in data.model_dump().items() if v is not None and k != "broker_name"}
        encrypted_creds = encrypt_credentials(credentials)
        
        supabase.table("broker_connections").upsert({
            "user_id": user.id,
            "broker_name": data.broker_name,
            "status": "connected",
            "account_id": credentials.get("client_id"),
            "access_token": encrypted_creds,
            "connected_at": datetime.utcnow().isoformat(),
            "last_synced_at": datetime.utcnow().isoformat()
        }, on_conflict="user_id,broker_name").execute()
        
        supabase.table("user_profiles").update({
            "broker_connected": True,
            "broker_name": data.broker_name,
            "broker_last_sync": datetime.utcnow().isoformat()
        }).eq("id", user.id).execute()
        
        return {"success": True, "broker": data.broker_name}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/broker/disconnect", tags=["Broker"])
async def disconnect_broker(user = Depends(get_current_user)):
    """Disconnect broker account"""
    try:
        supabase = get_supabase_admin()
        
        supabase.table("broker_connections").update({
            "status": "disconnected",
            "access_token": None,
            "refresh_token": None,
            "disconnected_at": datetime.utcnow().isoformat()
        }).eq("user_id", user.id).execute()
        
        supabase.table("user_profiles").update({
            "broker_name": None,
            "broker_connected": False
        }).eq("id", user.id).execute()
        
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/broker/status", tags=["Broker"])
async def get_broker_status(profile = Depends(get_user_profile)):
    """Get broker connection status"""
    try:
        supabase = get_supabase_admin()
        result = supabase.table("broker_connections").select(
            "broker_name, status, last_synced_at"
        ).eq("user_id", profile["id"]).eq("status", "connected").single().execute()
        
        if result.data:
            return {
                "connected": True,
                "broker_name": result.data["broker_name"],
                "last_sync": result.data.get("last_synced_at")
            }
    except Exception:
        pass
    
    return {
        "connected": profile.get("broker_connected", False),
        "broker_name": profile.get("broker_name"),
        "last_sync": profile.get("broker_last_sync")
    }

# ============================================================================
# NOTIFICATIONS ROUTES
# ============================================================================

@app.get("/api/notifications", tags=["Notifications"])
async def get_notifications(unread_only: bool = False, limit: int = 50, user = Depends(get_current_user)):
    """Get user notifications"""
    try:
        supabase = get_supabase_admin()
        
        query = supabase.table("notifications").select("*").eq("user_id", user.id)
        if unread_only:
            query = query.eq("is_read", False)
        
        result = query.order("created_at", desc=True).limit(limit).execute()
        return {"notifications": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/notifications/{notification_id}/read", tags=["Notifications"])
async def mark_notification_read(notification_id: str, user = Depends(get_current_user)):
    """Mark notification as read"""
    try:
        supabase = get_supabase_admin()
        supabase.table("notifications").update({
            "is_read": True,
            "read_at": datetime.utcnow().isoformat()
        }).eq("id", notification_id).eq("user_id", user.id).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/notifications/read-all", tags=["Notifications"])
async def mark_all_notifications_read(user = Depends(get_current_user)):
    """Mark all notifications as read"""
    try:
        supabase = get_supabase_admin()
        supabase.table("notifications").update({
            "is_read": True,
            "read_at": datetime.utcnow().isoformat()
        }).eq("user_id", user.id).eq("is_read", False).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# WATCHLIST ROUTES
# ============================================================================

@app.get("/api/watchlist", tags=["Watchlist"])
async def get_watchlist(user = Depends(get_current_user)):
    """Get user watchlist"""
    try:
        supabase = get_supabase_admin()
        result = supabase.table("watchlist").select("*").eq("user_id", user.id).order("added_at", desc=True).execute()
        return {"watchlist": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/watchlist", tags=["Watchlist"])
async def add_to_watchlist(data: WatchlistAdd, user = Depends(get_current_user)):
    """Add stock to watchlist"""
    try:
        supabase = get_supabase_admin()
        supabase.table("watchlist").insert({
            "user_id": user.id,
            "symbol": data.symbol.upper(),
            "segment": data.segment.value,
            "alert_price_above": data.alert_price_above,
            "alert_price_below": data.alert_price_below,
            "alert_enabled": data.alert_price_above is not None or data.alert_price_below is not None
        }).execute()
        return {"success": True}
    except:
        return {"success": False, "message": "Already in watchlist"}

@app.delete("/api/watchlist/{symbol}", tags=["Watchlist"])
async def remove_from_watchlist(symbol: str, user = Depends(get_current_user)):
    """Remove stock from watchlist"""
    try:
        supabase = get_supabase_admin()
        supabase.table("watchlist").delete().eq("user_id", user.id).eq("symbol", symbol.upper()).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# DASHBOARD ROUTES
# ============================================================================

@app.get("/api/dashboard/overview", tags=["Dashboard"])
async def get_dashboard_overview(profile = Depends(get_user_profile)):
    """Get dashboard overview data"""
    try:
        supabase = get_supabase_admin()
        user_id = profile["id"]
        today = date.today().isoformat()
        
        # Get stats
        positions = supabase.table("positions").select("*").eq("user_id", user_id).eq("is_active", True).execute()
        today_trades = supabase.table("trades").select("net_pnl").eq("user_id", user_id).eq("status", "closed").gte("closed_at", today).execute()
        signals = supabase.table("signals").select("*").eq("date", today).eq("status", "active").order("confidence", desc=True).limit(5).execute()
        notifications = supabase.table("notifications").select("id").eq("user_id", user_id).eq("is_read", False).execute()
        
        pos_list = positions.data or []
        unrealized_pnl = sum(float(p.get("unrealized_pnl", 0) or 0) for p in pos_list)
        today_pnl = sum(float(t.get("net_pnl", 0) or 0) for t in today_trades.data or [])
        win_rate = (profile["winning_trades"] / profile["total_trades"] * 100) if profile["total_trades"] > 0 else 0
        
        return {
            "stats": {
                "capital": profile["capital"],
                "total_pnl": profile["total_pnl"],
                "total_trades": profile["total_trades"],
                "winning_trades": profile["winning_trades"],
                "win_rate": round(win_rate, 2),
                "open_positions": len(pos_list),
                "unrealized_pnl": round(unrealized_pnl, 2),
                "today_pnl": round(today_pnl, 2),
                "subscription_status": profile["subscription_status"]
            },
            "recent_signals": signals.data[:5] if signals.data else [],
            "active_positions": pos_list[:5],
            "notifications_count": len(notifications.data) if notifications.data else 0
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# ASSISTANT ROUTES
# ============================================================================

@app.get("/api/assistant/usage", tags=["Assistant"], response_model=AssistantUsageResponse)
async def get_assistant_usage(profile = Depends(get_user_profile)):
    """Get current assistant daily credit usage for the authenticated user."""
    if not settings.ENABLE_FINANCE_ASSISTANT:
        raise HTTPException(status_code=404, detail="Finance assistant is disabled")

    usage = assistant_credit_limiter.get_usage(user_id=profile["id"], profile=profile)
    return {"usage": usage.to_dict()}


@app.post("/api/assistant/chat", tags=["Assistant"], response_model=AssistantChatResponse)
async def chat_with_assistant(data: AssistantChatRequest, profile = Depends(get_user_profile)):
    """Finance-only assistant chat endpoint."""
    if not settings.ENABLE_FINANCE_ASSISTANT:
        raise HTTPException(status_code=404, detail="Finance assistant is disabled")

    try:
        user_id = profile["id"]
        preview_usage = assistant_credit_limiter.get_usage(user_id=user_id, profile=profile)
        if preview_usage.credits_remaining <= 0:
            tier_name = preview_usage.tier.upper()
            if preview_usage.tier == "free":
                detail = (
                    f"Daily assistant credits exhausted ({preview_usage.credits_limit}/day on FREE). "
                    "Upgrade to Pro for higher daily limits."
                )
            else:
                detail = (
                    f"Daily assistant credits exhausted ({preview_usage.credits_limit}/day on {tier_name}). "
                    f"Credits reset at {preview_usage.reset_at}."
                )
            raise HTTPException(status_code=429, detail=detail)

        assistant_service = AssistantService()
        response = await assistant_service.chat(
            message=data.message,
            history=[item.model_dump() for item in data.history],
        )

        # Consume one credit only for in-scope assistant responses.
        usage = preview_usage
        if response.get("in_scope", False):
            _, usage = assistant_credit_limiter.consume_if_available(
                user_id=user_id,
                profile=profile,
                cost=1,
            )
        response["usage"] = usage.to_dict()
        return response
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("assistant_chat_route_error error=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Assistant is temporarily unavailable")

# ============================================================================
# WEBSOCKET ENDPOINT (Enhanced with subscribe/unsubscribe)
# ============================================================================

@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str):
    """
    WebSocket endpoint for real-time updates.
    
    Supported message types:
    - ping: Keep-alive
    - subscribe: Subscribe to channels (symbols, signals, portfolio)
    - unsubscribe: Unsubscribe from channels
    
    Message format:
    {"action": "subscribe", "channel": "price", "symbols": ["RELIANCE", "TCS"]}
    {"action": "unsubscribe", "channel": "price", "symbols": ["RELIANCE"]}
    """
    user_id = None
    try:
        supabase = get_supabase()
        user = supabase.auth.get_user(token)
        
        if not user:
            await websocket.close(code=4001)
            return
        
        user_id = user.user.id
        if not manager:
            await websocket.accept()
            await websocket.send_json({"type": "error", "message": "Realtime services not available"})
            await websocket.close(code=4002)
            return

        await manager.connect(websocket, user_id)
        
        try:
            while True:
                data = await websocket.receive_text()
                
                # Handle ping
                if data == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat()})
                    continue
                
                # Parse JSON messages
                try:
                    message = json.loads(data)
                    action = message.get("action", "")
                    channel = message.get("channel", "")
                    
                    if action == "subscribe":
                        await handle_subscribe(user_id, message)
                        await websocket.send_json({
                            "type": "subscribed",
                            "channel": channel,
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    
                    elif action == "unsubscribe":
                        await handle_unsubscribe(user_id, message)
                        await websocket.send_json({
                            "type": "unsubscribed", 
                            "channel": channel,
                            "timestamp": datetime.utcnow().isoformat()
                        })
                    
                    elif action == "get_prices":
                        # One-time price fetch
                        symbols = message.get("symbols", [])
                        await send_price_update(user_id, symbols)
                    
                    else:
                        await websocket.send_json({
                            "type": "error",
                            "message": f"Unknown action: {action}"
                        })
                        
                except json.JSONDecodeError:
                    # Not JSON, just echo back for debugging
                    await websocket.send_json({
                        "type": "echo",
                        "data": data,
                        "timestamp": datetime.utcnow().isoformat()
                    })
                    
        except WebSocketDisconnect:
            if user_id:
                manager.disconnect(user_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if user_id and manager:
            manager.disconnect(user_id)
        await websocket.close(code=4000)


async def handle_subscribe(user_id: str, message: Dict):
    """Handle WebSocket subscription requests"""
    channel = message.get("channel", "")
    symbols = message.get("symbols", [])
    
    if channel == "price" and symbols:
        for symbol in symbols:
            manager.subscribe_to_symbol(user_id, symbol)
        logger.info(f"User {user_id} subscribed to price updates for: {symbols}")
    
    elif channel == "signals":
        if user_id in manager.user_subscriptions:
            manager.user_subscriptions[user_id].add("signals")
        logger.info(f"User {user_id} subscribed to signal updates")
    
    elif channel == "portfolio":
        if user_id in manager.user_subscriptions:
            manager.user_subscriptions[user_id].add("portfolio")
        logger.info(f"User {user_id} subscribed to portfolio updates")
    
    elif channel == "notifications":
        if user_id in manager.user_subscriptions:
            manager.user_subscriptions[user_id].add("notifications")
        logger.info(f"User {user_id} subscribed to notifications")


async def handle_unsubscribe(user_id: str, message: Dict):
    """Handle WebSocket unsubscription requests"""
    channel = message.get("channel", "")
    symbols = message.get("symbols", [])
    
    if channel == "price" and symbols:
        for symbol in symbols:
            manager.unsubscribe_from_symbol(user_id, symbol)
        logger.info(f"User {user_id} unsubscribed from price updates for: {symbols}")
    
    elif channel in ["signals", "portfolio", "notifications"]:
        if user_id in manager.user_subscriptions:
            manager.user_subscriptions[user_id].discard(channel)
        logger.info(f"User {user_id} unsubscribed from {channel}")


async def send_price_update(user_id: str, symbols: List[str]):
    """Send price update to specific user"""
    try:
        from ..services.market_data import get_market_data_provider
        provider = get_market_data_provider()
        
        quotes = provider.get_quotes_batch(symbols)
        
        price_data = []
        for symbol, quote in quotes.items():
            if quote:
                price_data.append({
                    "symbol": symbol,
                    "ltp": quote.ltp,
                    "change": quote.change,
                    "change_percent": quote.change_percent,
                    "volume": quote.volume,
                    "timestamp": quote.timestamp.isoformat()
                })
        
        if manager and user_id in manager.active_connections:
            await manager.active_connections[user_id].send_json({
                "type": "price_update",
                "data": price_data,
                "timestamp": datetime.utcnow().isoformat()
            })
    except Exception as e:
        logger.error(f"Failed to send price update: {e}")

# ============================================================================
# SCREENER ROUTES (PKScreener Real-time)
# ============================================================================

try:
    from .screener_routes import register_screener_routes
    register_screener_routes(app)
    logger.info("✅ AI Beta Screener real-time routes registered")
except Exception as e:
    logger.warning(f"Screener routes not available: {e}")
    # Fallback to Supabase-based routes if available
    try:
        from ..services.screener_service import create_screener_routes
        create_screener_routes(app, get_supabase_admin())
    except:
        pass

# ============================================================================
# BROKER ROUTES
# ============================================================================

try:
    from .broker_routes import router as broker_router
    app.include_router(broker_router, prefix="/api")
    logger.info("✅ Broker OAuth routes registered")
except Exception as e:
    logger.warning(f"Broker routes not available: {e}")

# ============================================================================
# PAYMENT ROUTES (Razorpay)
# ============================================================================

try:
    from .payment_routes import router as payment_router
    app.include_router(payment_router, prefix="/api")
    logger.info("✅ Payment routes registered")
except Exception as e:
    logger.warning(f"Payment routes not available: {e}")

# ============================================================================
# ADMIN ROUTES
# ============================================================================

try:
    from .admin_routes import register_admin_routes
    register_admin_routes(app)
    logger.info("✅ Admin routes registered")
except Exception as e:
    logger.warning(f"Admin routes not available: {e}")

# ============================================================================
# MARKET DATA ROUTES
# ============================================================================

@app.get("/api/market/status", tags=["Market"])
async def get_market_status():
    """Get current market status (open/closed, trading day check)"""
    try:
        from ..services.market_data import get_market_data_provider
        provider = get_market_data_provider()
        status = provider.get_market_status()
        return {
            "is_trading_day": status.is_trading_day,
            "is_market_open": status.is_market_open,
            "market_phase": status.market_phase,
            "next_open": status.next_open.isoformat() if status.next_open else None,
            "reason": status.reason
        }
    except Exception as e:
        logger.error(f"Market status error: {e}")
        return {
            "is_trading_day": True,
            "is_market_open": False,
            "market_phase": "UNKNOWN",
            "reason": str(e)
        }

@app.get("/api/market/quote/{symbol}", tags=["Market"])
async def get_market_quote(symbol: str):
    """Get real-time quote for a symbol using yfinance"""
    try:
        from ..services.market_data import get_market_data_provider
        provider = get_market_data_provider()
        quote = provider.get_quote(symbol)
        
        if not quote:
            raise HTTPException(status_code=404, detail="Quote not found")
        
        return {
            "symbol": quote.symbol,
            "ltp": quote.ltp,
            "open": quote.open,
            "high": quote.high,
            "low": quote.low,
            "close": quote.close,
            "volume": quote.volume,
            "change": quote.change,
            "change_percent": quote.change_percent,
            "timestamp": quote.timestamp.isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Quote error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market/indices", tags=["Market"])
async def get_market_indices():
    """Get index data (Nifty, Bank Nifty, VIX)"""
    try:
        from ..services.market_data import get_market_data_provider
        provider = get_market_data_provider()
        overview = provider.get_market_overview()
        return overview
    except Exception as e:
        logger.error(f"Indices error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/market/ohlc/{symbol}", tags=["Market"])
async def get_market_ohlc(
    symbol: str,
    interval: str = Query("1d", description="Data interval: 1d, 1h, 1wk"),
    days: int = Query(30, description="Number of days of data")
):
    """Get historical OHLCV data for a symbol"""
    try:
        from ..services.market_data import get_market_data_provider
        provider = get_market_data_provider()
        
        # Map days to period
        if days <= 5:
            period = "5d"
        elif days <= 30:
            period = "1mo"
        elif days <= 90:
            period = "3mo"
        elif days <= 180:
            period = "6mo"
        else:
            period = "1y"
        
        df = provider.get_historical(symbol, period=period, interval=interval)
        
        if df is None or df.empty:
            raise HTTPException(status_code=404, detail="Data not found")
        
        # Convert to list of dicts
        data = []
        for idx, row in df.iterrows():
            data.append({
                "timestamp": idx.isoformat() if hasattr(idx, 'isoformat') else str(idx),
                "open": float(row.get('open', 0)),
                "high": float(row.get('high', 0)),
                "low": float(row.get('low', 0)),
                "close": float(row.get('close', 0)),
                "volume": int(row.get('volume', 0))
            })
        
        return {"symbol": symbol, "interval": interval, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OHLC error for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# ============================================================================
# RUN SERVER
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
