"""
================================================================================
QUANT X PRODUCTION BACKEND
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
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from supabase import create_client, Client
import httpx
import razorpay

from ..core.config import settings, validate_startup, get_startup_status
from ..middleware import RateLimitMiddleware, LoggingMiddleware, SecurityHeadersMiddleware
from ..services.realtime import create_realtime_services
from ..services.broker_ticker import BrokerTickerManager
from ..services.scheduler import SchedulerService
from ..services.signal_generator import SignalGenerator
from ..services.trade_execution_service import TradeExecutionService
from ..services.risk_management import RiskManagementEngine, RISK_PROFILES, Signal as RiskSignal, Segment, Direction
from ..services.assistant import AssistantService, AssistantCreditLimiter
from ..schemas import (
    UserSignup, UserLogin, ProfileUpdate, ExecuteTrade, CloseTrade,
    CreateOrder, VerifyPayment, WatchlistAdd, WatchlistUpdate,
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
        import os as _os
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration
        from sentry_sdk.integrations.starlette import StarletteIntegration

        # PR 101 — release tagging. Sentry uses `release` to group
        # errors by deploy so a regression in build N+1 doesn't look
        # the same as a fixed issue in build N. Prefer the platform's
        # git SHA when available (Railway / Vercel / Render set these);
        # fall back to APP_VERSION so we always tag something.
        _git_sha = (
            _os.getenv("RAILWAY_GIT_COMMIT_SHA")
            or _os.getenv("VERCEL_GIT_COMMIT_SHA")
            or _os.getenv("RENDER_GIT_COMMIT")
            or _os.getenv("GIT_SHA")
            or ""
        )
        _release = f"swingai-backend@{_git_sha[:7]}" if _git_sha else f"swingai-backend@{settings.APP_VERSION}"

        # PR 101 — privacy filter. Strip Authorization / Cookie headers
        # and any payload key whose name suggests a credential before
        # the event reaches Sentry. Defense in depth — Sentry treats
        # default PII as off below, but request bodies can still carry
        # broker_token / api_key / password / etc. without those flags.
        _CREDENTIAL_KEYS = (
            "authorization", "cookie", "set-cookie",
            "password", "secret", "api_key", "apikey",
            "token", "access_token", "refresh_token",
            "totp_secret", "broker_token",
        )

        def _scrub(obj):
            if isinstance(obj, dict):
                return {
                    k: ("[redacted]" if any(c in k.lower() for c in _CREDENTIAL_KEYS) else _scrub(v))
                    for k, v in obj.items()
                }
            if isinstance(obj, list):
                return [_scrub(x) for x in obj]
            return obj

        def _before_send(event, _hint):
            try:
                req = event.get("request") if isinstance(event, dict) else None
                if isinstance(req, dict):
                    if isinstance(req.get("headers"), dict):
                        req["headers"] = _scrub(req["headers"])
                    if isinstance(req.get("cookies"), dict):
                        req["cookies"] = {}
                    if isinstance(req.get("data"), (dict, list)):
                        req["data"] = _scrub(req["data"])
                if isinstance(event, dict) and isinstance(event.get("extra"), dict):
                    event["extra"] = _scrub(event["extra"])
            except Exception:
                pass
            return event

        sentry_sdk.init(
            dsn=settings.SENTRY_DSN,
            environment=settings.APP_ENV,
            release=_release,
            traces_sample_rate=0.1,
            send_default_pii=False,
            before_send=_before_send,
            integrations=[FastApiIntegration(), StarletteIntegration()],
        )
    except ImportError:
        pass  # sentry-sdk not installed

from ..middleware import configure_structured_logging
configure_structured_logging(settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# ============================================================================
# SUPABASE QUERY HELPER WITH RETRY
# ============================================================================

import time as _time
import functools

async def supabase_query_with_retry(fn, retries=2, timeout_fallback=None):
    """Execute a Supabase query with retry on timeout. Returns fallback on failure."""
    for attempt in range(retries + 1):
        try:
            return fn()
        except Exception as e:
            err_str = str(e)
            if "timed out" in err_str or "ConnectTimeout" in err_str or "Connection reset" in err_str:
                if attempt < retries:
                    await asyncio.sleep(0.5)
                    continue
            if timeout_fallback is not None:
                logging.getLogger(__name__).warning(f"Supabase query failed after {attempt+1} attempts: {err_str[:80]}")
                return timeout_fallback
            raise

# ============================================================================
# CLIENTS
# ============================================================================

_supabase_anon: Optional[Client] = None
_supabase_admin: Optional[Client] = None
_razorpay_client: Optional[razorpay.Client] = None

def get_supabase() -> Client:
    """Get Supabase client (anon key) — singleton"""
    global _supabase_anon
    if _supabase_anon is None:
        _supabase_anon = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    return _supabase_anon

def get_supabase_admin() -> Client:
    """Get Supabase admin client (service role key) — singleton"""
    global _supabase_admin
    if _supabase_admin is None:
        _supabase_admin = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _supabase_admin

def get_razorpay() -> razorpay.Client:
    """Get Razorpay client — singleton"""
    global _razorpay_client
    if _razorpay_client is None:
        _razorpay_client = razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))
    return _razorpay_client

# ============================================================================
# AUTH DEPENDENCY
# ============================================================================

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Get current authenticated user from JWT token.

    Decodes the Supabase JWT locally with signature verification (HS256 via
    SUPABASE_JWT_SECRET). Falls back to Supabase auth.get_user() network call
    only if local decode fails with a non-signature error (e.g. unusual alg).

    Security: if SUPABASE_JWT_SECRET is set (required in production — see
    core.config.validate_startup), ALL tokens must pass signature verification.
    Forged tokens → 401. If the secret is unset (dev only), signature check is
    skipped with a WARNING log.
    """
    import jwt as pyjwt
    from types import SimpleNamespace

    token = credentials.credentials
    jwt_secret = settings.SUPABASE_JWT_SECRET

    # --- Fast path: decode JWT locally (no network call) ---
    try:
        if jwt_secret:
            # Production path: verify signature + expiry via pyjwt.
            # Supabase uses HS256 for JWTs signed with the project JWT secret.
            # audience claim is "authenticated" by default on Supabase JWTs.
            payload = pyjwt.decode(
                token,
                key=jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_signature": True, "verify_exp": True, "verify_aud": True},
            )
        else:
            # Dev-only fallback: no secret configured. Decode without verification
            # but still enforce role + expiry at the claim level.
            logger.warning(
                "JWT signature verification is DISABLED — SUPABASE_JWT_SECRET is unset. "
                "DO NOT run this in production."
            )
            payload = pyjwt.decode(
                token,
                options={"verify_signature": False},
                algorithms=["HS256", "ES256"],
            )

        user_id = payload.get("sub")
        email = payload.get("email")
        role = payload.get("role")

        if not user_id or role != "authenticated":
            raise HTTPException(status_code=401, detail="Invalid token")

        # Double-check expiry when we skipped verify_exp (unset-secret branch only).
        if not jwt_secret:
            import time as _time
            exp = payload.get("exp", 0)
            if exp and exp < _time.time():
                raise HTTPException(status_code=401, detail="Token expired")

        # Return a user-like object compatible with the rest of the app.
        return SimpleNamespace(
            id=user_id, email=email, role=role,
            user_metadata=payload.get("user_metadata", {}),
            app_metadata=payload.get("app_metadata", {}),
        )
    except HTTPException:
        raise
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidSignatureError:
        # Signature mismatch = forged or wrong-project token. NEVER fall back to
        # network verify for this — fail loudly.
        logger.warning("JWT signature verification FAILED — rejecting token")
        raise HTTPException(status_code=401, detail="Invalid token signature")
    except pyjwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail="Invalid token audience")
    except pyjwt.InvalidTokenError as decode_err:
        # Other structural decode failures — try network fallback once.
        logger.warning(f"Local JWT decode failed ({decode_err}), falling back to Supabase API")

    # --- Slow path: verify via Supabase API (only for non-signature decode failures) ---
    try:
        supabase = get_supabase()
        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user.user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")

async def get_user_profile(user = Depends(get_current_user)):
    """Get user profile with subscription details"""
    try:
        supabase = get_supabase_admin()
        result = supabase.table("user_profiles").select("*, subscription_plans(*)").eq("id", user.id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Profile not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Profile fetch failed ({e}), returning minimal profile")
        # Return minimal profile so endpoints don't fail completely
        return {
            "id": user.id,
            "email": user.email,
            "full_name": getattr(user, 'user_metadata', {}).get('full_name', 'User'),
            "subscription_status": "active",
            "subscription_plans": {"name": "pro", "display_name": "Pro"},
        }

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

    # Validate required environment variables
    validate_startup()

    # Verify Supabase database connectivity and schema
    if settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY:
        try:
            supabase = get_supabase_admin()
            critical_tables = ["subscription_plans", "signals", "trades", "positions", "user_profiles"]
            for table in critical_tables:
                supabase.table(table).select("id").limit(1).execute()
            logger.info(f"✅ Supabase database connected — {len(critical_tables)} critical tables verified")
        except Exception as e:
            logger.error(f"⚠️ Database check failed: {e}")
            logger.error("   Run the SQL migrations in infrastructure/database/complete_schema.sql")
            if settings.APP_ENV == "production":
                raise RuntimeError("Database schema not initialized — run migrations first")
    else:
        logger.warning("⚠️ Supabase not configured — database features unavailable")

    # Initialize market data provider
    if settings.DATA_PROVIDER == "kite":
        try:
            from ..services.kite_data_provider import get_kite_admin_client
            kite_admin = get_kite_admin_client()
            kite_admin.initialize()
            logger.info("✅ Kite admin client initialized")
        except Exception as e:
            logger.warning(f"⚠️ Kite admin init failed: {e} — will use jugaad-data fallback")
    else:
        logger.info("✅ Free data mode (yfinance) — no broker credentials needed")

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

        # PR 13: wire the unified EventBus so feature code can
        # ``await emit_event(...)`` without reaching into app.state.
        try:
            from ..services.event_bus import set_event_bus
            set_event_bus(manager, get_supabase_admin())
            logger.info("✅ EventBus wired")
        except Exception as bus_err:
            logger.warning(f"EventBus wiring failed: {bus_err}")
    except Exception as e:
        logger.error(f"Realtime initialization failed: {e}")

    # Start price polling for WebSocket (uses Kite quotes)
    price_service = realtime_services.get("price_service")
    if price_service:
        asyncio.create_task(price_service.start_polling(interval=30))
        logger.info("✅ Price polling started (30s interval)")

    # Initialize broker ticker manager (real-time streaming via broker WebSockets)
    try:
        price_service = realtime_services.get("price_service")
        if price_service and settings.ENABLE_BROKER_TICKER:
            broker_ticker_mgr = BrokerTickerManager(price_service)
            app.state.broker_ticker_manager = broker_ticker_mgr
            logger.info("✅ Broker ticker manager initialized")
        else:
            app.state.broker_ticker_manager = None
    except Exception as e:
        logger.warning(f"Broker ticker manager init failed: {e}")
        app.state.broker_ticker_manager = None

    # Initialize signal generator + model download (startup health)
    try:
        signal_generator = SignalGenerator(get_supabase_admin())
        app.state.signal_generator = signal_generator
        app.state.model_status = {
            "ml_labeler": signal_generator._ml_labeler is not None,
            "lgbm_gate": signal_generator._lgbm_gate is not None,
            "regime_detector": signal_generator._regime_detector is not None,
            "tft_predictor": getattr(signal_generator, '_tft_predictor', None) is not None,
            "ensemble": getattr(signal_generator, '_ensemble', None) is not None,
            "quantai_ranker": getattr(signal_generator, '_quantai_ranker', None) is not None,
        }
        loaded = [k for k, v in app.state.model_status.items() if v]
        logger.info(f"Signal generator initialized — models loaded: {loaded}")
    except Exception as e:
        app.state.model_status = {
            "ml_labeler": False, "lgbm_gate": False, "regime_detector": False,
            "tft_predictor": False, "ensemble": False, "quantai_ranker": False,
        }
        logger.error(f"Signal generator initialization failed: {e}")

    # Initialize scheduler (optional)
    if settings.ENABLE_SCHEDULER:
        try:
            if not app.state.signal_generator:
                signal_generator = SignalGenerator(get_supabase_admin())
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

    # Kite admin client is stateless — no shutdown needed

    logger.info("🛑 Shutting down Quant X")

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
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset"],
    max_age=600,  # Cache preflight responses for 10 minutes
)

# Security Headers
app.add_middleware(SecurityHeadersMiddleware)

# Logging
app.add_middleware(LoggingMiddleware)

# Rate Limiting
app.add_middleware(RateLimitMiddleware, requests_per_minute=settings.RATE_LIMIT_PER_MINUTE)

# GZip Compression (compress responses > 500 bytes)
app.add_middleware(GZipMiddleware, minimum_size=500)


# ============================================================================
# GLOBAL EXCEPTION HANDLERS
# ============================================================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Return consistent 422 error format for validation failures"""
    errors = []
    for error in exc.errors():
        field = " -> ".join(str(loc) for loc in error.get("loc", []))
        errors.append({"field": field, "message": error.get("msg", "Validation error")})
    return JSONResponse(
        status_code=422,
        content={"error": "Validation failed", "details": errors},
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Standardize HTTP error responses"""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail or "Request failed"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all handler — never leak internal details"""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


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
    """Liveness probe — returns 200 if the process is alive."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION,
    }


@app.get("/ready", tags=["Health"])
@app.get("/api/ready", tags=["Health"])
async def readiness():
    """Readiness probe — returns 200 only when all critical dependencies are up.

    Use this for Kubernetes / Railway / load-balancer health checks so traffic
    is only routed to instances that can actually serve requests.
    """
    checks: Dict[str, str] = {}

    # 1. Database
    try:
        supabase = get_supabase_admin()
        supabase.table("subscription_plans").select("id").limit(1).execute()
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"

    # 2. ML models (optional — degraded but not down)
    model_status = getattr(app.state, "model_status", {})
    loaded_count = sum(1 for v in model_status.values() if v)
    checks["ml_models"] = f"{loaded_count}/{len(model_status)} loaded"
    checks["ml_labeler"] = "ok" if model_status.get("ml_labeler") else "unavailable"

    # 3. Redis (only if enabled)
    if settings.ENABLE_REDIS:
        try:
            rt = getattr(app.state, "realtime", {})
            mgr = rt.get("manager")
            if mgr and mgr.redis:
                await mgr.redis.ping()
                checks["redis"] = "ok"
            else:
                checks["redis"] = "not_connected"
        except Exception:
            checks["redis"] = "error"

    # 4. Scheduler
    sched = getattr(app.state, "scheduler", None)
    checks["scheduler"] = "running" if sched and getattr(sched, "running", False) else "stopped"

    # Overall: ready if database is OK (everything else is degraded-OK)
    is_ready = checks["database"] == "ok"
    status_code = 200 if is_ready else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "ready": is_ready,
            "checks": checks,
            "timestamp": datetime.utcnow().isoformat(),
            "version": settings.APP_VERSION,
        },
    )

@app.get("/api/system/status", tags=["Admin"])
async def system_status(user = Depends(get_current_user)):
    """Return configuration status of all subsystems (admin only)."""
    # Admin gate: only emails listed in ADMIN_EMAILS may access this endpoint
    if user.email not in settings.admin_emails_list:
        raise HTTPException(status_code=403, detail="Admin access required")

    status = get_startup_status()
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "environment": settings.APP_ENV,
        "config_status": status,
        "timestamp": datetime.utcnow().isoformat(),
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

@app.get("/api/user/tier", tags=["User"])
async def get_user_tier(user = Depends(get_current_user)):
    """Return the user's tier + per-feature access map + Copilot credit cap.

    The frontend consumes this once per session to pre-paint tier-gated
    UI (locks on Pro/Elite features, Upgrade CTAs, Copilot credit budget).
    """
    from ..core.tiers import feature_access_map, resolve_user_tier
    from ..middleware.tier_gate import copilot_daily_cap

    ut = resolve_user_tier(str(user.id))
    return {
        "user_id": ut.user_id,
        "tier": ut.tier.value,
        "is_admin": ut.is_admin,
        "features": feature_access_map(ut.tier),
        "copilot_daily_cap": copilot_daily_cap(ut.tier),
    }

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

@app.get("/api/user/ui-preferences", tags=["User"])
async def get_ui_preferences(user = Depends(get_current_user)):
    """PR 123 — read user's cross-device UI preferences.

    First consumer is watchlist alert preset pins. Returns ``{}`` for
    rows with no prefs set (default JSONB value); the frontend merges
    against its own session defaults.
    """
    sb = get_supabase_admin()
    rows = (
        sb.table("user_profiles")
        .select("ui_preferences")
        .eq("id", user.id)
        .limit(1)
        .execute()
    )
    if not rows.data:
        return {"ui_preferences": {}}
    return {"ui_preferences": rows.data[0].get("ui_preferences") or {}}


@app.put("/api/user/ui-preferences", tags=["User"])
async def update_ui_preferences(payload: dict, user = Depends(get_current_user)):
    """PR 123 — replace the user's UI preferences blob.

    Whole-document write keeps the surface trivial; the blob is small
    (≤4KB realistically) and we don't need server-side merge semantics.
    Validate the top-level shape so a client bug can't pollute storage
    with arbitrary keys.
    """
    ALLOWED_KEYS = {"watchlist_preset_pins"}
    prefs = payload.get("ui_preferences")
    if not isinstance(prefs, dict):
        raise HTTPException(status_code=422, detail="ui_preferences must be an object")
    cleaned = {k: v for k, v in prefs.items() if k in ALLOWED_KEYS and isinstance(v, dict)}
    # PR 123 — watchlist_preset_pins values must be a known preset id.
    if "watchlist_preset_pins" in cleaned:
        valid_ids = {"pct5", "pct10", "pct5_breakout", "pct5_drop", "atr1", "atr2"}
        cleaned["watchlist_preset_pins"] = {
            sym.upper(): pid
            for sym, pid in cleaned["watchlist_preset_pins"].items()
            if isinstance(sym, str) and isinstance(pid, str) and pid in valid_ids
        }
    sb = get_supabase_admin()
    sb.table("user_profiles").update({
        "ui_preferences": cleaned,
        "updated_at": datetime.utcnow().isoformat(),
    }).eq("id", user.id).execute()
    return {"success": True, "ui_preferences": cleaned}


@app.get("/api/user/stats", tags=["User"])
async def get_user_stats(user = Depends(get_current_user)):
    """Get user trading statistics"""
    try:
        supabase = get_supabase_admin()
        
        profile = supabase.table("user_profiles").select("*").eq("id", user.id).single().execute()
        positions = supabase.table("positions").select("*").eq("user_id", user.id).eq("is_active", True).limit(100).execute()

        today = date.today().isoformat()
        today_trades = supabase.table("trades").select("net_pnl").eq("user_id", user.id).eq("status", "closed").gte("closed_at", today).limit(200).execute()

        week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()
        week_trades = supabase.table("trades").select("net_pnl, status").eq("user_id", user.id).gte("created_at", week_start).limit(500).execute()
        
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
        result = supabase.table("payments").select("*, subscription_plans(display_name)").eq("user_id", user.id).order("created_at", desc=True).limit(100).execute()
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
    """Get today's trading signals (falls back to most recent signals if none today)"""
    today = date.today().isoformat()

    def _fetch():
        sb = get_supabase_admin()
        # Try today first
        query = sb.table("signals").select("*").eq("date", today).in_("status", ["active", "triggered"])
        if segment:
            query = query.eq("segment", segment)
        if direction:
            query = query.eq("direction", direction)
        is_premium = profile.get("subscription_status") in ["active", "trial"]
        if not is_premium:
            query = query.eq("is_premium", False)
        results = query.order("confidence", desc=True).execute().data

        # Fallback: if no signals today, show most recent signals (last 7 days)
        if not results:
            fallback_date = (date.today() - timedelta(days=7)).isoformat()
            fb_query = sb.table("signals").select("*").gte("date", fallback_date).in_("status", ["active", "triggered"])
            if segment:
                fb_query = fb_query.eq("segment", segment)
            if direction:
                fb_query = fb_query.eq("direction", direction)
            if not is_premium:
                fb_query = fb_query.eq("is_premium", False)
            results = fb_query.order("date", desc=True).order("confidence", desc=True).limit(50).execute().data
        return results

    signals = await supabase_query_with_retry(_fetch, retries=2, timeout_fallback=[])

    return {
        "date": today,
        "total": len(signals),
        "long_signals": [s for s in signals if s.get("direction") == "LONG"],
        "short_signals": [s for s in signals if s.get("direction") == "SHORT"],
        "equity_signals": [s for s in signals if s.get("segment") == "EQUITY"],
        "futures_signals": [s for s in signals if s.get("segment") == "FUTURES"],
        "options_signals": [s for s in signals if s.get("segment") == "OPTIONS"],
        "all_signals": signals
    }

# PR 50 — F1 TickPulse intraday signals (last 60 min window, Pro tier)
@app.get("/api/signals/intraday", tags=["Signals"])
async def get_intraday_signals(
    window_minutes: int = 60,
    profile = Depends(get_user_profile),
):
    """Recent intraday signals (signal_type='intraday'). Fresh ones
    expire after 1 hour — the default window matches."""
    window_minutes = max(5, min(240, int(window_minutes)))
    cutoff = (datetime.utcnow() - timedelta(minutes=window_minutes)).isoformat()

    def _fetch():
        sb = get_supabase_admin()
        query = (
            sb.table("signals")
            .select("*")
            .eq("signal_type", "intraday")
            .gte("created_at", cutoff)
            .in_("status", ["active", "triggered"])
        )
        is_premium = profile.get("subscription_status") in ["active", "trial"]
        if not is_premium:
            # Non-Pro users get an empty list + upgrade hint; tier gate
            # at the frontend routes them to /pricing. Keep the route
            # unauthed-friendly at the API level though (no 402 here).
            return []
        return query.order("created_at", desc=True).limit(50).execute().data

    signals = await supabase_query_with_retry(_fetch, retries=2, timeout_fallback=[])
    return {
        "window_minutes": window_minutes,
        "total": len(signals),
        "signals": signals,
    }


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
    limit: int = Query(default=100, ge=1, le=500),
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
    limit: int = Query(default=50, ge=1, le=500),
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
    # PR 96 — pulled out of the try block so the failure-path observability
    # hooks below can reference it even when the body raises before line 1028.
    user_id = str(profile.get("id") or "")
    execution_mode = "paper"
    try:
        supabase = get_supabase_admin()
        
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
        
        # PR 96 — observability for trade execution. EventName.SIGNAL_EXECUTED_*
        # was already defined but never tracked. Branch by execution_mode
        # so the paper / live cohort split lines up with what the tier
        # gate actually allowed. Failure path tracks the same event with
        # success=false so failed-trade-attempt cohorts are visible too.
        try:
            from ..observability import EventName, track
            event = (EventName.SIGNAL_EXECUTED_LIVE
                     if execution_mode == "live"
                     else EventName.SIGNAL_EXECUTED_PAPER)
            track(event, user_id, {
                "success": True,
                "signal_id": str(data.signal_id),
                "trade_id": str(trade_id),
                "symbol": sig.get("symbol"),
                "direction": sig.get("direction"),
                "execution_mode": execution_mode,
                "quantity": quantity,
                "entry_price": float(entry_price or 0),
            })
        except Exception:
            pass

        return {
            "success": True,
            "trade_id": trade_id,
            "status": trade["status"],
            "quantity": quantity,
            "entry_price": entry_price,
            "stop_loss": stop_loss,
            "target": target
        }
    except HTTPException as e:
        # PR 96 — log tier-gate / risk-engine refusals too. The detail
        # message tells ops whether the user hit max_positions, the
        # kill switch, F&O off, etc.
        try:
            from ..observability import EventName, track
            track(EventName.SIGNAL_EXECUTED_PAPER, user_id, {
                "success": False,
                "signal_id": str(getattr(data, "signal_id", "")),
                "blocked_reason": str(e.detail)[:200],
                "status_code": e.status_code,
            })
        except Exception:
            pass
        raise
    except Exception as e:
        logger.error(f"Trade execution error: {e}")
        try:
            from ..observability import EventName, track
            track(EventName.SIGNAL_EXECUTED_PAPER, user_id, {
                "success": False,
                "signal_id": str(getattr(data, "signal_id", "")),
                "error": str(e)[:300],
            })
        except Exception:
            pass
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
    """Shared close-trade logic used by trades and positions endpoints.

    PR 99 — observability: tracks POSITION_CLOSED on success (both the
    live-broker branch and the paper / manual P&L branch) and on
    failure paths so the cohort report shows attempted vs successful
    exits. The two wrapper endpoints
    (``/api/trades/{id}/close`` + ``/api/positions/{id}/close``)
    delegate here, so instrumenting once covers both surfaces.
    """
    supabase = get_supabase_admin()

    try:
        trade = supabase.table("trades").select("*").eq("id", trade_id).eq("user_id", user_id).single().execute()
        if not trade.data or trade.data["status"] != "open":
            raise HTTPException(status_code=400, detail="Trade not found or not open")

        t = trade.data
        if t.get("execution_mode") == "live":
            pos = supabase.table("positions").select("*").eq("trade_id", trade_id).eq("is_active", True).single().execute()
            if pos.data:
                trade_executor = TradeExecutionService(get_supabase_admin())
                await trade_executor.close_position(pos.data, data.exit_price or t["entry_price"], data.reason)
                try:
                    from ..observability import EventName, track
                    track(EventName.POSITION_CLOSED, str(user_id), {
                        "success": True,
                        "trade_id": str(trade_id),
                        "symbol": t.get("symbol"),
                        "direction": t.get("direction"),
                        "execution_mode": "live",
                        "exit_reason": data.reason,
                    })
                except Exception:
                    pass
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

        try:
            from ..observability import EventName, track
            track(EventName.POSITION_CLOSED, str(user_id), {
                "success": True,
                "trade_id": str(trade_id),
                "symbol": t.get("symbol"),
                "direction": t.get("direction"),
                "execution_mode": t.get("execution_mode") or "paper",
                "exit_reason": data.reason,
                "net_pnl": round(net_pnl, 2),
                "pnl_percent": round(pnl_percent, 2),
            })
        except Exception:
            pass

        return {
            "success": True,
            "gross_pnl": round(gross_pnl, 2),
            "net_pnl": round(net_pnl, 2),
            "pnl_percent": round(pnl_percent, 2)
        }
    except HTTPException as exc:
        try:
            from ..observability import EventName, track
            track(EventName.POSITION_CLOSED, str(user_id), {
                "success": False,
                "trade_id": str(trade_id),
                "blocked_reason": str(exc.detail)[:200],
                "status_code": exc.status_code,
            })
        except Exception:
            pass
        raise
    except Exception as exc:
        try:
            from ..observability import EventName, track
            track(EventName.POSITION_CLOSED, str(user_id), {
                "success": False,
                "trade_id": str(trade_id),
                "error": str(exc)[:300],
            })
        except Exception:
            pass
        raise

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
    # PR 96 — observability for the highest-stakes user action on the
    # platform. EventName.KILL_SWITCH_FIRED was already defined in the
    # enum but never tracked anywhere. Fire on both success + failure
    # so the audit picks up failed attempts (e.g., broker disconnected
    # during liquidation) — those are exactly the cases ops needs to
    # see.
    user_id = str(getattr(user, "id", "") or "")
    positions_processed = 0
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
            positions_processed += 1

        try:
            from ..observability import EventName, track
            track(EventName.KILL_SWITCH_FIRED, user_id, {
                "success": True,
                "positions_closed": positions_processed,
                "source": "user",
            })
        except Exception:
            pass

        return {"success": True, "message": "Kill switch activated. All positions closed."}
    except Exception as e:
        try:
            from ..observability import EventName, track
            track(EventName.KILL_SWITCH_FIRED, user_id, {
                "success": False,
                "positions_closed": positions_processed,
                "error": str(e)[:300],
                "source": "user",
            })
        except Exception:
            pass
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
        
        positions = supabase.table("positions").select("*").eq("user_id", user_id).eq("is_active", True).limit(100).execute()
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
        
        result = supabase.table("portfolio_history").select("*").eq("user_id", user.id).gte("date", start_date).order("date").limit(365).execute()
        return {"history": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/portfolio/performance", tags=["Portfolio"])
async def get_performance_metrics(user = Depends(get_current_user)):
    """Get portfolio performance metrics"""
    try:
        supabase = get_supabase_admin()
        
        trades = supabase.table("trades").select("*").eq("user_id", user.id).eq("status", "closed").order("closed_at", desc=True).limit(1000).execute()

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
        result = supabase.table("positions").select("*").eq("user_id", user.id).eq("is_active", True).limit(100).execute()
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
# BROKER ROUTES — handled by broker_routes.py (included via include_router)
# ============================================================================

# ============================================================================
# NOTIFICATIONS ROUTES
# ============================================================================

@app.get("/api/notifications", tags=["Notifications"])
async def get_notifications(unread_only: bool = False, limit: int = Query(default=50, ge=1, le=200), user = Depends(get_current_user)):
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
# PUSH SUBSCRIPTION ROUTES
# ============================================================================

@app.get("/api/push/vapid-key", tags=["Push"])
async def get_vapid_key():
    """Return VAPID public key for frontend push subscription."""
    if not settings.VAPID_PUBLIC_KEY:
        raise HTTPException(status_code=503, detail="Web Push not configured")
    return {"public_key": settings.VAPID_PUBLIC_KEY}

@app.post("/api/push/subscribe", tags=["Push"])
async def push_subscribe(request: Request, user = Depends(get_current_user)):
    """Save a push subscription for the current user."""
    try:
        data = await request.json()
        endpoint = data.get("endpoint")
        keys = data.get("keys", {})
        p256dh = keys.get("p256dh")
        auth = keys.get("auth")

        if not endpoint or not p256dh or not auth:
            raise HTTPException(status_code=400, detail="Missing subscription fields")

        supabase = get_supabase_admin()
        # Upsert: update if same user+endpoint exists
        supabase.table("push_subscriptions").upsert({
            "user_id": user.id,
            "endpoint": endpoint,
            "p256dh": p256dh,
            "auth": auth,
            "user_agent": request.headers.get("user-agent", ""),
        }, on_conflict="user_id,endpoint").execute()

        return {"success": True, "message": "Push subscription saved"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/push/unsubscribe", tags=["Push"])
async def push_unsubscribe(request: Request, user = Depends(get_current_user)):
    """Remove a push subscription."""
    try:
        data = await request.json()
        endpoint = data.get("endpoint")
        if not endpoint:
            raise HTTPException(status_code=400, detail="Missing endpoint")

        supabase = get_supabase_admin()
        supabase.table("push_subscriptions").delete().eq(
            "user_id", user.id
        ).eq("endpoint", endpoint).execute()

        return {"success": True, "message": "Push subscription removed"}
    except HTTPException:
        raise
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
        result = supabase.table("watchlist").select("*").eq("user_id", user.id).order("added_at", desc=True).limit(100).execute()
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
    except Exception as e:
        logger.warning(f"Watchlist add failed: {e}")
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


@app.put("/api/watchlist/{symbol}/alerts", tags=["Watchlist"])
async def update_watchlist_alerts(
    symbol: str,
    data: WatchlistUpdate,
    user = Depends(get_current_user),
):
    """PR 112 — partial update of a watchlist row's alert thresholds.

    Resets the PR 109 debounce columns whenever a threshold value
    changes so the price-alert scanner can re-arm and fire fresh.
    The row is matched by ``(user_id, symbol)`` — no id roundtrip
    needed from the client.
    """
    sym = symbol.upper()
    sb = get_supabase_admin()

    # Snapshot current row to detect threshold drift. The PUT body is
    # a partial — fields the client didn't send leave the existing
    # value alone.
    try:
        existing = (
            sb.table("watchlist")
            .select("alert_price_above, alert_price_below, alert_enabled")
            .eq("user_id", user.id)
            .eq("symbol", sym)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.warning("watchlist alerts lookup failed sym=%s: %s", sym, exc)
        raise HTTPException(status_code=500, detail="lookup_failed")

    row = (existing.data or [None])[0]
    if row is None:
        raise HTTPException(status_code=404, detail="not_in_watchlist")

    update: Dict[str, Any] = {}
    threshold_changed = False
    if data.alert_price_above is not None or "alert_price_above" in data.model_fields_set:
        new_above = data.alert_price_above
        if new_above != row.get("alert_price_above"):
            threshold_changed = True
        update["alert_price_above"] = new_above
    if data.alert_price_below is not None or "alert_price_below" in data.model_fields_set:
        new_below = data.alert_price_below
        if new_below != row.get("alert_price_below"):
            threshold_changed = True
        update["alert_price_below"] = new_below
    if data.alert_enabled is not None:
        update["alert_enabled"] = bool(data.alert_enabled)
    if data.notes is not None:
        update["notes"] = data.notes[:500]

    if not update:
        return {"success": True, "updated": False}

    # Re-arm the debounce: a threshold change means the user wants the
    # next crossing to fire fresh, regardless of last_fired_direction.
    if threshold_changed:
        update["alert_last_fired_at"] = None
        update["alert_last_fired_direction"] = None

    try:
        sb.table("watchlist").update(update).eq("user_id", user.id).eq("symbol", sym).execute()
    except Exception as exc:
        logger.error("watchlist alerts update failed sym=%s: %s", sym, exc)
        raise HTTPException(status_code=500, detail="update_failed")

    return {
        "success": True,
        "updated": True,
        "rearmed": threshold_changed,
    }

# ============================================================================
# DASHBOARD ROUTES
# ============================================================================

@app.get("/api/dashboard/overview", tags=["Dashboard"])
async def get_dashboard_overview(profile = Depends(get_user_profile)):
    """Get dashboard overview data"""
    user_id = profile["id"]
    today = date.today().isoformat()

    sb = get_supabase_admin()
    pos_list = await supabase_query_with_retry(
        lambda: sb.table("positions").select("*").eq("user_id", user_id).eq("is_active", True).limit(100).execute().data,
        timeout_fallback=[]
    )
    trades_data = await supabase_query_with_retry(
        lambda: sb.table("trades").select("net_pnl").eq("user_id", user_id).eq("status", "closed").gte("closed_at", today).limit(200).execute().data,
        timeout_fallback=[]
    )
    today_pnl = sum(float(t.get("net_pnl", 0) or 0) for t in trades_data)
    signals_list = await supabase_query_with_retry(
        lambda: sb.table("signals").select("*").eq("date", today).eq("status", "active").order("confidence", desc=True).limit(5).execute().data,
        timeout_fallback=[]
    )
    notif_data = await supabase_query_with_retry(
        lambda: sb.table("notifications").select("id").eq("user_id", user_id).eq("is_read", False).limit(100).execute().data,
        timeout_fallback=[]
    )
    notif_count = len(notif_data)

    unrealized_pnl = sum(float(p.get("unrealized_pnl", 0) or 0) for p in pos_list)
    total_trades = profile.get("total_trades") or 0
    winning_trades = profile.get("winning_trades") or 0
    win_rate = (winning_trades / total_trades * 100) if total_trades > 0 else 0

    return {
        "stats": {
            "capital": profile.get("capital", 500000),
            "total_pnl": profile.get("total_pnl", 0),
            "total_trades": total_trades,
            "winning_trades": winning_trades,
            "win_rate": round(win_rate, 2),
            "open_positions": len(pos_list),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "today_pnl": round(today_pnl, 2),
            "subscription_status": profile.get("subscription_status", "active")
        },
        "recent_signals": signals_list,
        "active_positions": pos_list[:5],
        "notifications_count": notif_count
    }

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
        # PR 86 — forward page_context so the assistant can resolve
        # pronouns against what the user is actually looking at.
        ctx_payload = data.page_context.model_dump() if data.page_context else None
        response = await assistant_service.chat(
            message=data.message,
            history=[item.model_dump() for item in data.history],
            page_context=ctx_payload,
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
# WEBSOCKET ENDPOINTS (token via header — preferred — and legacy URL path)
# ============================================================================

def _verify_ws_token(token: str) -> Optional[str]:
    """Verify a JWT and return the user_id (sub claim) or None on failure.

    Mirrors get_current_user's local verification path so WebSocket handshakes
    don't need to round-trip Supabase. Respects SUPABASE_JWT_SECRET — when set,
    signatures are verified. When unset (dev only), signature verification is
    skipped with the same warning as REST.
    """
    import jwt as pyjwt
    jwt_secret = settings.SUPABASE_JWT_SECRET
    try:
        if jwt_secret:
            payload = pyjwt.decode(
                token,
                key=jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
                options={"verify_signature": True, "verify_exp": True, "verify_aud": True},
            )
        else:
            payload = pyjwt.decode(
                token,
                options={"verify_signature": False},
                algorithms=["HS256", "ES256"],
            )
            # Enforce role + expiry when signature skipped
            import time as _time
            if payload.get("exp", 0) and payload["exp"] < _time.time():
                return None
        if payload.get("role") != "authenticated":
            return None
        return payload.get("sub")
    except pyjwt.InvalidTokenError as e:
        logger.warning(f"WebSocket JWT verification failed: {e}")
        return None


async def _handle_ws_session(websocket: WebSocket, user_id: str):
    """Shared WebSocket session loop used by both /ws (header auth) and
    /ws/{token} (legacy URL auth). Assumes websocket is already authenticated
    but NOT yet accepted."""
    if not manager:
        await websocket.accept()
        await websocket.send_json({"type": "error", "message": "Realtime services not available"})
        await websocket.close(code=4002)
        return

    await manager.connect(websocket, user_id)

    broker_ticker_mgr = getattr(app.state, 'broker_ticker_manager', None)
    if broker_ticker_mgr:
        try:
            supabase_admin = get_supabase_admin()
            conn_resp = supabase_admin.table("broker_connections").select("broker_name,access_token").eq("user_id", user_id).eq("status", "connected").maybe_single().execute()
            if conn_resp and conn_resp.data:
                from ..services.broker_credentials import decrypt_credentials
                broker_name = conn_resp.data["broker_name"]
                creds = decrypt_credentials(conn_resp.data["access_token"])
                await broker_ticker_mgr.connect_user_ticker(user_id, broker_name, creds)
        except Exception as e:
            logger.debug(f"Broker ticker auto-connect skipped for {user_id}: {e}")

    try:
        while True:
            data = await websocket.receive_text()

            if data == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat()})
                continue

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
                    symbols = message.get("symbols", [])
                    await send_price_update(user_id, symbols)
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown action: {action}"
                    })
            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "echo",
                    "data": data,
                    "timestamp": datetime.utcnow().isoformat()
                })
    except WebSocketDisconnect:
        if user_id:
            manager.disconnect(user_id)
            if broker_ticker_mgr:
                await broker_ticker_mgr.disconnect_user_ticker(user_id)


@app.websocket("/ws")
async def websocket_endpoint_header(websocket: WebSocket):
    """WebSocket endpoint with bearer-token auth via the Sec-WebSocket-Protocol
    header — the preferred path (tokens don't leak to server logs / CDN).

    Clients connect with two subprotocols:
        new WebSocket(url, ['access_token', userJwt])
    The server echoes back 'access_token' to complete the handshake and uses
    the second protocol string as the JWT.
    """
    user_id: Optional[str] = None
    try:
        subprotocols = websocket.headers.get("sec-websocket-protocol", "")
        parts = [p.strip() for p in subprotocols.split(",") if p.strip()]
        if len(parts) < 2 or parts[0] != "access_token":
            await websocket.close(code=4003)
            return
        token = parts[1]
        user_id = _verify_ws_token(token)
        if not user_id:
            await websocket.close(code=4001)
            return

        # Accept the handshake echoing the 'access_token' subprotocol.
        await websocket.accept(subprotocol="access_token")

        # Hand off to the shared session loop. Reuse its setup code but skip
        # the accept (we already accepted with the subprotocol echo).
        if not manager:
            await websocket.send_json({"type": "error", "message": "Realtime services not available"})
            await websocket.close(code=4002)
            return
        await manager.connect(websocket, user_id)
        broker_ticker_mgr = getattr(app.state, 'broker_ticker_manager', None)
        if broker_ticker_mgr:
            try:
                supabase_admin = get_supabase_admin()
                conn_resp = supabase_admin.table("broker_connections").select("broker_name,access_token").eq("user_id", user_id).eq("status", "connected").maybe_single().execute()
                if conn_resp and conn_resp.data:
                    from ..services.broker_credentials import decrypt_credentials
                    broker_name = conn_resp.data["broker_name"]
                    creds = decrypt_credentials(conn_resp.data["access_token"])
                    await broker_ticker_mgr.connect_user_ticker(user_id, broker_name, creds)
            except Exception as e:
                logger.debug(f"Broker ticker auto-connect skipped for {user_id}: {e}")
        try:
            while True:
                data = await websocket.receive_text()
                if data == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat()})
                    continue
                try:
                    message = json.loads(data)
                    action = message.get("action", "")
                    channel = message.get("channel", "")
                    if action == "subscribe":
                        await handle_subscribe(user_id, message)
                        await websocket.send_json({"type": "subscribed", "channel": channel, "timestamp": datetime.utcnow().isoformat()})
                    elif action == "unsubscribe":
                        await handle_unsubscribe(user_id, message)
                        await websocket.send_json({"type": "unsubscribed", "channel": channel, "timestamp": datetime.utcnow().isoformat()})
                    elif action == "get_prices":
                        await send_price_update(user_id, message.get("symbols", []))
                    else:
                        await websocket.send_json({"type": "error", "message": f"Unknown action: {action}"})
                except json.JSONDecodeError:
                    await websocket.send_json({"type": "echo", "data": data, "timestamp": datetime.utcnow().isoformat()})
        except WebSocketDisconnect:
            if user_id and manager:
                manager.disconnect(user_id)
                if broker_ticker_mgr:
                    await broker_ticker_mgr.disconnect_user_ticker(user_id)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        if user_id and manager:
            manager.disconnect(user_id)
        await websocket.close(code=4000)


# PR 56 — legacy /ws/{token} endpoint removed. Tokens in URLs leaked to
# server logs, CDN caches, browser history, and proxy access logs. The
# frontend has been on the header-auth /ws path since PR 20+; removing
# the legacy path prevents downgrade attacks (an attacker who captures
# the token via logs can't open an auth'd socket on /ws/{token}).


async def handle_subscribe(user_id: str, message: Dict):
    """Handle WebSocket subscription requests"""
    channel = message.get("channel", "")
    symbols = message.get("symbols", [])
    
    if channel == "price" and symbols:
        for symbol in symbols:
            manager.subscribe_to_symbol(user_id, symbol)
        # Also subscribe on broker ticker for real-time streaming
        broker_ticker_mgr = getattr(app.state, 'broker_ticker_manager', None)
        if broker_ticker_mgr and user_id in broker_ticker_mgr._user_tickers:
            await broker_ticker_mgr.subscribe_symbols(user_id, symbols)
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
        
        quotes = await asyncio.to_thread(provider.get_quotes_batch, symbols)

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
# SCREENER ROUTES (Swing AI Screener)
# ============================================================================

try:
    from .screener_routes import register_screener_routes
    register_screener_routes(app)
    logger.info("✅ Swing AI Screener routes registered")
except Exception as e:
    logger.warning(f"Screener routes not available: {e}")

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
# MARKETPLACE ROUTES
# ============================================================================

try:
    from .marketplace_routes import router as marketplace_router
    app.include_router(marketplace_router)
    logger.info("✅ Marketplace routes registered")
except Exception as e:
    logger.warning(f"Marketplace routes not available: {e}")

# ============================================================================
# PAPER TRADING ROUTES
# ============================================================================

try:
    from .paper_routes import router as paper_router
    app.include_router(paper_router)
    logger.info("✅ Paper Trading routes registered")
except Exception as e:
    logger.warning(f"Paper Trading routes not available: {e}")

# ============================================================================
# AI AGENT ROUTES (PR 8) — Copilot / FinRobot / TradingAgents
# ============================================================================

try:
    from .ai_routes import router as ai_router
    app.include_router(ai_router, prefix="/api")
    logger.info("✅ AI agent routes registered (copilot / finrobot / debate)")
except Exception as e:
    logger.warning(f"AI agent routes not available: {e}")

# ============================================================================
# PUBLIC TRUST-SURFACE ROUTES (PR 18) — /regime /track-record /models
# ============================================================================

try:
    from .public_routes import router as public_router
    app.include_router(public_router, prefix="/api")
    logger.info("✅ Public trust-surface routes registered")
except Exception as e:
    logger.warning(f"Public routes not available: {e}")

# ============================================================================
# AUTO-TRADER ROUTES (PR 28) — F4 Elite dashboard control plane
# ============================================================================

try:
    from .auto_trader_routes import router as auto_trader_router
    app.include_router(auto_trader_router, prefix="/api")
    logger.info("✅ Auto-trader routes registered (F4)")
except Exception as e:
    logger.warning(f"Auto-trader routes not available: {e}")

# ============================================================================
# AI PORTFOLIO ROUTES (PR 29) — F5 AI SIP Elite rebalance dashboard
# ============================================================================

try:
    from .ai_portfolio_routes import router as ai_portfolio_router
    app.include_router(ai_portfolio_router, prefix="/api")
    logger.info("✅ AI Portfolio routes registered (F5)")
except Exception as e:
    logger.warning(f"AI Portfolio routes not available: {e}")

# ============================================================================
# F&O STRATEGIES ROUTES (PR 30) — F6 Elite options strategy recommender
# ============================================================================

try:
    from .fo_strategies_routes import router as fo_strategies_router
    app.include_router(fo_strategies_router, prefix="/api")
    logger.info("✅ F&O Strategies routes registered (F6)")
except Exception as e:
    logger.warning(f"F&O Strategies routes not available: {e}")

# ============================================================================
# EARNINGS ROUTES (PR 31) — F9 Earnings predictor + calendar
# ============================================================================

try:
    from .earnings_routes import router as earnings_router
    app.include_router(earnings_router, prefix="/api")
    logger.info("✅ Earnings routes registered (F9)")
except Exception as e:
    logger.warning(f"Earnings routes not available: {e}")

# ============================================================================
# SECTOR ROTATION ROUTES (PR 32) — F10 Pro sector rotation dashboard
# ============================================================================

try:
    from .sector_rotation_routes import router as sector_rotation_router
    app.include_router(sector_rotation_router, prefix="/api")
    logger.info("✅ Sector Rotation routes registered (F10)")
except Exception as e:
    logger.warning(f"Sector Rotation routes not available: {e}")

# ============================================================================
# DOSSIER ROUTES (PR 33) — per-stock consolidated AI engine output
# ============================================================================

try:
    from .dossier_routes import router as dossier_router
    app.include_router(dossier_router, prefix="/api")
    logger.info("✅ Dossier routes registered (N2)")
except Exception as e:
    logger.warning(f"Dossier routes not available: {e}")

# ============================================================================
# PORTFOLIO DOCTOR ROUTES (PR 34) — F7 InsightAI whole-portfolio analysis
# ============================================================================

try:
    from .portfolio_doctor_routes import router as portfolio_doctor_router
    app.include_router(portfolio_doctor_router, prefix="/api")
    logger.info("✅ Portfolio Doctor routes registered (F7)")
except Exception as e:
    logger.warning(f"Portfolio Doctor routes not available: {e}")

# ============================================================================
# ONBOARDING ROUTES (PR 37) — N5 risk-profile quiz
# ============================================================================

try:
    from .onboarding_routes import router as onboarding_router
    app.include_router(onboarding_router, prefix="/api")
    logger.info("✅ Onboarding routes registered (N5)")
except Exception as e:
    logger.warning(f"Onboarding routes not available: {e}")

# ============================================================================
# WEEKLY REVIEW ROUTES (PR 38) — N10 Sunday personal review
# ============================================================================

try:
    from .weekly_review_routes import router as weekly_review_router
    app.include_router(weekly_review_router, prefix="/api")
    logger.info("✅ Weekly Review routes registered (N10)")
except Exception as e:
    logger.warning(f"Weekly Review routes not available: {e}")

# ============================================================================
# WATCHLIST LIVE ROUTES (PR 39) — enriched per-symbol engine snapshots
# ============================================================================

try:
    from .watchlist_live_routes import router as watchlist_live_router
    app.include_router(watchlist_live_router, prefix="/api")
    logger.info("✅ Watchlist Live routes registered")
except Exception as e:
    logger.warning(f"Watchlist Live routes not available: {e}")

# ============================================================================
# ALERTS STUDIO ROUTES (PR 40) — N11 per-event channel routing
# ============================================================================

try:
    from .alerts_routes import router as alerts_router
    app.include_router(alerts_router, prefix="/api")
    logger.info("✅ Alerts Studio routes registered (N11)")
except Exception as e:
    logger.warning(f"Alerts Studio routes not available: {e}")

# ============================================================================
# REFERRALS ROUTES (PR 42) — N12 virality loop
# ============================================================================

try:
    from .referrals_routes import router as referrals_router
    app.include_router(referrals_router, prefix="/api")
    logger.info("✅ Referrals routes registered (N12)")
except Exception as e:
    logger.warning(f"Referrals routes not available: {e}")

# ============================================================================
# VISION ROUTES (PR 46) — B2 chart-vision analysis
# ============================================================================

try:
    from .vision_routes import router as vision_router
    app.include_router(vision_router, prefix="/api")
    logger.info("✅ Chart-vision routes registered (B2)")
except Exception as e:
    logger.warning(f"Chart-vision routes not available: {e}")

# ============================================================================
# TELEGRAM ROUTES (PR 55) — onboarding connect + bot webhook
# ============================================================================

try:
    from .telegram_routes import router as telegram_router
    app.include_router(telegram_router, prefix="/api")
    logger.info("✅ Telegram connect routes registered (PR 55)")
except Exception as e:
    logger.warning(f"Telegram connect routes not available: {e}")

# ============================================================================
# TELEMETRY ROUTES (PR 57) — client-side error ingestion
# ============================================================================

try:
    from .telemetry_routes import router as telemetry_router
    app.include_router(telemetry_router, prefix="/api")
    logger.info("✅ Client-error telemetry routes registered (PR 57)")
except Exception as e:
    logger.warning(f"Telemetry routes not available: {e}")

# ============================================================================
# WHATSAPP ROUTES (PR 60) — F12 Pro digest channel (opt-in + OTP)
# ============================================================================

try:
    from .whatsapp_routes import router as whatsapp_router
    app.include_router(whatsapp_router, prefix="/api")
    logger.info("✅ WhatsApp routes registered (PR 60)")
except Exception as e:
    logger.warning(f"WhatsApp routes not available: {e}")

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
    """Get real-time quote for a symbol via Kite Connect"""
    try:
        from ..services.market_data import get_market_data_provider
        provider = get_market_data_provider()
        quote = await asyncio.to_thread(provider.get_quote, symbol)

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
        overview = await provider.get_market_overview_async()
        # Check if data is actually populated (Kite may be offline)
        if overview.get("nifty", {}).get("ltp", 0) > 0:
            return overview
    except Exception as e:
        logger.warning(f"Kite indices error: {e}")

    # If provider failed completely, return zeros
    return {"nifty": {"ltp": 0, "change": 0, "change_percent": 0},
            "banknifty": {"ltp": 0, "change": 0, "change_percent": 0}}

@app.get("/api/market/regime", tags=["Market"])
async def get_market_regime_public():
    """
    Get current market regime (Bull / Bear / Sideways).
    Public endpoint (no auth required) — used by dashboard RegimeBanner
    and AIPerformanceWidget components.
    Proxies to the AI screener's market-regime detection.
    """
    try:
        from ..services.live_screener_engine import get_live_screener
        screener = get_live_screener()
        regime_data = await screener.get_market_regime()

        regime_raw = regime_data.get("regime", "SIDEWAYS").upper()
        regime_map = {"BULL": "bull", "BEAR": "bear", "SIDEWAYS": "sideways"}
        regime = regime_map.get(regime_raw, "sideways")
        confidence = regime_data.get("confidence", 50)

        return {
            "success": True,
            "current": {
                "regime": regime,
                "confidence": round(confidence / 100, 2) if confidence > 1 else round(confidence, 2),
                "days_active": regime_data.get("days_active", 1),
            },
            "regime": regime,
            "confidence": round(confidence / 100, 2) if confidence > 1 else round(confidence, 2),
            "factors": {
                "breadth_200sma": regime_data.get("breadth_200sma", 50),
                "bullish_macd_pct": regime_data.get("bullish_macd_pct", 50),
            },
        }
    except Exception as e:
        logger.warning(f"Market regime endpoint failed: {e}")
        # Return a safe fallback so frontend doesn't break
        return {
            "success": True,
            "current": {"regime": "sideways", "confidence": 0.5, "days_active": 1},
            "regime": "sideways",
            "confidence": 0.5,
        }


@app.get("/api/ai/performance", tags=["AI"])
async def get_ai_performance():
    """
    Get AI model performance metrics for the dashboard widget.
    Public endpoint (no auth required).
    Returns filtered vs unfiltered win rates and today's signal count.
    """
    try:
        supabase = get_supabase_admin()
        today = date.today().isoformat()
        thirty_days_ago = (date.today() - timedelta(days=30)).isoformat()

        # Count today's scored signals
        today_signals = supabase.table("signals").select("id", count="exact").eq(
            "date", today
        ).eq("status", "active").execute()
        signals_today = today_signals.count or len(today_signals.data or [])

        # Get performance data from model_performance or signals tables
        # Filtered = signals where model_agreement >= 3 (ML + LGBM agree)
        # Unfiltered = all signals
        perf = supabase.table("signals").select(
            "id, confidence, model_agreement, status"
        ).gte("date", thirty_days_ago).in_(
            "status", ["target_hit", "stop_hit", "expired"]
        ).execute()

        closed_signals = perf.data or []
        total = len(closed_signals)

        if total > 0:
            filtered = [s for s in closed_signals if (s.get("model_agreement") or 0) >= 3]
            unfiltered_wins = sum(1 for s in closed_signals if s.get("status") == "target_hit")
            filtered_wins = sum(1 for s in filtered if s.get("status") == "target_hit")

            win_rate_unfiltered = round(unfiltered_wins / total * 100, 1) if total > 0 else 0
            win_rate_filtered = round(filtered_wins / len(filtered) * 100, 1) if filtered else win_rate_unfiltered
        else:
            # No closed signals yet — return reasonable defaults from training metrics
            win_rate_filtered = 67.2
            win_rate_unfiltered = 56.1

        return {
            "win_rate_filtered": win_rate_filtered,
            "win_rate_unfiltered": win_rate_unfiltered,
            "signals_scored_today": signals_today,
        }
    except Exception as e:
        logger.warning(f"AI performance endpoint failed: {e}")
        return {
            "win_rate_filtered": 67.2,
            "win_rate_unfiltered": 56.1,
            "signals_scored_today": 0,
        }


@app.get("/api/market/ohlc/{symbol}", tags=["Market"])
async def get_market_ohlc(
    symbol: str,
    interval: str = Query("1d", description="Data interval: 1d, 1h, 1wk"),
    days: int = Query(default=30, ge=1, le=365, description="Number of days of data")
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
        
        df = await asyncio.to_thread(provider.get_historical, symbol, period, interval)

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
        "src.backend.api.app:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG
    )
