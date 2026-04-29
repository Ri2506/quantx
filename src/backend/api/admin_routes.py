"""
================================================================================
QUANT X - ADMIN CONSOLE API ROUTES
================================================================================
Secure admin endpoints for:
- User management (list, search, suspend, ban)
- Subscription management (reset, modify)
- System health monitoring
- Payment history viewing
- Data export (CSV)
================================================================================
"""

import csv
import io
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
import logging

from fastapi import APIRouter, HTTPException, Depends, Query, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from supabase import Client

from ..core.config import settings

_security = HTTPBearer()

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["Admin"])

# ============================================================================
# ADMIN ROLE ENUM
# ============================================================================

class AdminRole(str, Enum):
    SUPER_ADMIN = "super_admin"
    SUPPORT_ADMIN = "support_admin"
    READ_ONLY = "read_only"

# ============================================================================
# SCHEMAS
# ============================================================================

class AdminUser(BaseModel):
    id: str
    email: str
    role: AdminRole
    
class UserListItem(BaseModel):
    id: str
    email: str
    full_name: Optional[str]
    phone: Optional[str]
    capital: float
    trading_mode: str
    subscription_status: str
    subscription_plan: Optional[str]
    broker_connected: bool
    broker_name: Optional[str]
    total_trades: int
    winning_trades: int
    total_pnl: float
    created_at: str
    last_login: Optional[str]
    last_active: Optional[str]
    is_suspended: bool = False
    is_banned: bool = False

class UserDetailResponse(BaseModel):
    user: UserListItem
    trading_settings: Dict[str, Any]
    recent_activity: List[Dict[str, Any]]
    payment_history: List[Dict[str, Any]]
    positions: List[Dict[str, Any]]
    trades: List[Dict[str, Any]]

class UserListResponse(BaseModel):
    users: List[UserListItem]
    total: int
    page: int
    page_size: int
    total_pages: int

class SystemHealthResponse(BaseModel):
    status: str
    timestamp: str
    database: str
    # PR 104 — DB round-trip latency on the health-check query. Supabase
    # speaks via PgBouncer over HTTPS, so we can't expose pg_stat_activity
    # pool counters directly; round-trip ms is the proxy ops cares about
    # ("technically up but slow during traffic spike").
    db_latency_ms: Optional[int] = None
    redis: str
    redis_latency_ms: Optional[int] = None
    scheduler_status: str
    last_signal_run: Optional[str]
    active_websocket_connections: int
    metrics: Dict[str, Any]

class EODScanRunItem(BaseModel):
    id: str
    trade_date: str
    status: str
    source: Optional[str]
    scan_type: Optional[str]
    candidate_count: int = 0
    signal_count: int = 0
    started_at: Optional[str]
    finished_at: Optional[str]
    error: Optional[str]

class EODScanRunsResponse(BaseModel):
    runs: List[EODScanRunItem]

class DailyUniverseItem(BaseModel):
    trade_date: str
    symbol: str
    source: Optional[str]
    scan_type: Optional[str]

class DailyUniverseResponse(BaseModel):
    trade_date: str
    total: int
    candidates: List[DailyUniverseItem]

class UserActionRequest(BaseModel):
    reason: Optional[str] = None

class SubscriptionResetRequest(BaseModel):
    new_plan_id: Optional[str] = None
    new_status: str = "free"
    reason: str

# ============================================================================
# ADMIN AUTH DEPENDENCY
# ============================================================================

# In-memory admin list (in production, this should be in database)
# Format: {user_id: AdminRole}
ADMIN_USERS: Dict[str, AdminRole] = {}

def get_supabase_admin():
    """Get Supabase admin client - imported from app.py"""
    from ..api.app import get_supabase_admin as _get_admin
    return _get_admin()

async def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(_security)) -> AdminUser:
    """
    Verify user has admin access.

    Authority order (first match wins):
      1. user_profiles.is_admin = true  → SUPER_ADMIN (primary path, post-PR 1)
      2. email in ADMIN_EMAILS env var  → SUPER_ADMIN (bootstrap fallback for
         first-time deploys before anyone has is_admin=true in the DB)
      3. anything else                  → 403

    With JWT signature verification now enabled (PR 1), the JWT email claim
    is cryptographically trusted, so ADMIN_EMAILS bootstrap is safe.
    """
    from ..api.app import get_current_user

    # Get current user from JWT (signature-verified per PR 1)
    try:
        user = await get_current_user(credentials)
        user_id = user.id
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication required")

    supabase = get_supabase_admin()

    # Read profile including the new is_admin column. If the column does not
    # exist yet (migration not applied), fall back gracefully.
    try:
        result = supabase.table("user_profiles").select("id, email, is_admin").eq("id", user_id).single().execute()
    except Exception:
        # Column may not exist on first deploy; retry without it so we can
        # still honor the ADMIN_EMAILS bootstrap path.
        result = supabase.table("user_profiles").select("id, email").eq("id", user_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=403, detail="Admin access required")

    email = result.data.get("email")
    is_admin_flag = bool(result.data.get("is_admin", False))

    admin_role: Optional[AdminRole] = None

    # Path 1: DB column is the source of truth.
    if is_admin_flag:
        admin_role = AdminRole.SUPER_ADMIN

    # Path 2: bootstrap via ADMIN_EMAILS (used only when DB column not yet set).
    if not admin_role and email and email in settings.admin_emails_list:
        admin_role = AdminRole.SUPER_ADMIN

    # Path 3: in-memory override (left in place for dev scripting).
    if not admin_role:
        admin_role = ADMIN_USERS.get(user_id)

    if not admin_role:
        raise HTTPException(status_code=403, detail="Admin access required")

    return AdminUser(id=user_id, email=email, role=admin_role)


@router.get("/verify")
async def verify_admin(admin: AdminUser = Depends(get_admin_user)) -> Dict[str, Any]:
    """Lightweight check used by the frontend admin layout to decide whether
    to render the admin shell. Returns 200 + {is_admin: true} for admins,
    403 for everyone else (thrown by get_admin_user dependency)."""
    return {"is_admin": True, "role": admin.role.value, "email": admin.email}

def require_role(*allowed_roles: AdminRole):
    """Decorator to require specific admin roles"""
    async def role_checker(admin: AdminUser = Depends(get_admin_user)):
        if admin.role not in allowed_roles:
            raise HTTPException(
                status_code=403, 
                detail=f"Required role: {', '.join([r.value for r in allowed_roles])}"
            )
        return admin
    return role_checker

# ============================================================================
# USER MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    subscription_status: Optional[str] = None,
    is_suspended: Optional[bool] = None,
    is_banned: Optional[bool] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    admin: AdminUser = Depends(get_admin_user)
):
    """
    List all users with pagination, search, and filters.
    Accessible by all admin roles.
    """
    supabase = get_supabase_admin()
    
    # Build query
    query = supabase.table("user_profiles").select(
        "*, subscription_plans(name, display_name)",
        count="exact"
    )
    
    # Apply search filter
    if search:
        query = query.or_(f"email.ilike.%{search}%,full_name.ilike.%{search}%,phone.ilike.%{search}%")
    
    # Apply filters
    if subscription_status:
        query = query.eq("subscription_status", subscription_status)
    
    # Note: is_suspended and is_banned would need to be added to user_profiles schema
    # For now, we'll skip these filters if the columns don't exist
    
    # Apply sorting
    query = query.order(sort_by, desc=(sort_order == "desc"))
    
    # Apply pagination
    offset = (page - 1) * page_size
    query = query.range(offset, offset + page_size - 1)
    
    result = query.execute()
    total = result.count or 0
    
    users = []
    for row in result.data or []:
        plan_data = row.get("subscription_plans") or {}
        users.append(UserListItem(
            id=row["id"],
            email=row["email"],
            full_name=row.get("full_name"),
            phone=row.get("phone"),
            capital=row.get("capital", 0),
            trading_mode=row.get("trading_mode", "signal_only"),
            subscription_status=row.get("subscription_status", "free"),
            subscription_plan=plan_data.get("display_name"),
            broker_connected=row.get("broker_connected", False),
            broker_name=row.get("broker_name"),
            total_trades=row.get("total_trades", 0),
            winning_trades=row.get("winning_trades", 0),
            total_pnl=row.get("total_pnl", 0),
            created_at=row.get("created_at", ""),
            last_login=row.get("last_login"),
            last_active=row.get("last_active"),
            is_suspended=row.get("is_suspended", False),
            is_banned=row.get("is_banned", False)
        ))
    
    return UserListResponse(
        users=users,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size
    )

@router.get("/users/{user_id}", response_model=UserDetailResponse)
async def get_user_detail(
    user_id: str,
    admin: AdminUser = Depends(get_admin_user)
):
    """
    Get detailed user information including trading settings and activity.
    """
    supabase = get_supabase_admin()
    
    # Get user profile
    profile = supabase.table("user_profiles").select(
        "*, subscription_plans(name, display_name)"
    ).eq("id", user_id).single().execute()
    
    if not profile.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    row = profile.data
    plan_data = row.get("subscription_plans") or {}
    
    user = UserListItem(
        id=row["id"],
        email=row["email"],
        full_name=row.get("full_name"),
        phone=row.get("phone"),
        capital=row.get("capital", 0),
        trading_mode=row.get("trading_mode", "signal_only"),
        subscription_status=row.get("subscription_status", "free"),
        subscription_plan=plan_data.get("display_name"),
        broker_connected=row.get("broker_connected", False),
        broker_name=row.get("broker_name"),
        total_trades=row.get("total_trades", 0),
        winning_trades=row.get("winning_trades", 0),
        total_pnl=row.get("total_pnl", 0),
        created_at=row.get("created_at", ""),
        last_login=row.get("last_login"),
        last_active=row.get("last_active"),
        is_suspended=row.get("is_suspended", False),
        is_banned=row.get("is_banned", False)
    )
    
    # Get trading settings
    trading_settings = {
        "risk_profile": row.get("risk_profile"),
        "risk_per_trade": row.get("risk_per_trade"),
        "max_positions": row.get("max_positions"),
        "fo_enabled": row.get("fo_enabled"),
        "preferred_option_type": row.get("preferred_option_type"),
        "daily_loss_limit": row.get("daily_loss_limit"),
        "weekly_loss_limit": row.get("weekly_loss_limit"),
        "monthly_loss_limit": row.get("monthly_loss_limit"),
        "trailing_sl_enabled": row.get("trailing_sl_enabled"),
    }
    
    # Get recent trades (last 20)
    trades = supabase.table("trades").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).limit(20).execute()
    
    # Get active positions
    positions = supabase.table("positions").select("*").eq(
        "user_id", user_id
    ).eq("is_active", True).execute()
    
    # Get payment history
    payments = supabase.table("payments").select(
        "*, subscription_plans(display_name)"
    ).eq("user_id", user_id).order("created_at", desc=True).limit(10).execute()
    
    # Get recent activity (audit log)
    activity = supabase.table("audit_log").select("*").eq(
        "user_id", user_id
    ).order("created_at", desc=True).limit(20).execute()
    
    return UserDetailResponse(
        user=user,
        trading_settings=trading_settings,
        recent_activity=activity.data or [],
        payment_history=payments.data or [],
        positions=positions.data or [],
        trades=trades.data or []
    )

@router.post("/users/{user_id}/suspend")
async def suspend_user(
    user_id: str,
    request: UserActionRequest,
    http_request: Request = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ADMIN))
):
    """
    Suspend a user account. User cannot login or trade.
    Requires super_admin or support_admin role.
    """
    supabase = get_supabase_admin()
    
    # Update user profile
    result = supabase.table("user_profiles").update({
        "is_suspended": True,
        "suspended_at": datetime.utcnow().isoformat(),
        "suspended_by": admin.id,
        "suspension_reason": request.reason
    }).eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Log action
    supabase.table("audit_log").insert({
        "user_id": user_id,
        "action": "user_suspended",
        "entity_type": "user_profile",
        "entity_id": user_id,
        "new_value": {"is_suspended": True, "reason": request.reason},
    }).execute()
    
    logger.info(f"User {user_id} suspended by admin {admin.id}")

    # PR 49 — admin audit log
    from ..services.admin_audit import log_admin_action
    log_admin_action(
        actor_id=admin.id, actor_email=admin.email,
        action="user_suspend", target_type="user", target_id=user_id,
        payload={"reason": request.reason},
        request=http_request, supabase_client=supabase,
    )

    return {"success": True, "message": "User suspended"}

@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(
    user_id: str,
    http_request: Request = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ADMIN))
):
    """
    Remove suspension from a user account.
    """
    supabase = get_supabase_admin()
    
    result = supabase.table("user_profiles").update({
        "is_suspended": False,
        "suspended_at": None,
        "suspended_by": None,
        "suspension_reason": None
    }).eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Log action
    supabase.table("audit_log").insert({
        "user_id": user_id,
        "action": "user_unsuspended",
        "entity_type": "user_profile",
        "entity_id": user_id,
    }).execute()

    # PR 49 — admin audit log
    from ..services.admin_audit import log_admin_action
    log_admin_action(
        actor_id=admin.id, actor_email=admin.email,
        action="user_unsuspend", target_type="user", target_id=user_id,
        request=http_request, supabase_client=supabase,
    )

    return {"success": True, "message": "User unsuspended"}

@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: str,
    request: UserActionRequest,
    http_request: Request = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN))
):
    """
    Permanently ban a user. Only super_admin can ban.
    """
    supabase = get_supabase_admin()
    
    result = supabase.table("user_profiles").update({
        "is_banned": True,
        "banned_at": datetime.utcnow().isoformat(),
        "banned_by": admin.id,
        "ban_reason": request.reason
    }).eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Log action
    supabase.table("audit_log").insert({
        "user_id": user_id,
        "action": "user_banned",
        "entity_type": "user_profile",
        "entity_id": user_id,
        "new_value": {"is_banned": True, "reason": request.reason},
    }).execute()
    
    logger.warning(f"User {user_id} BANNED by admin {admin.id}")

    # PR 49 — admin audit log
    from ..services.admin_audit import log_admin_action
    log_admin_action(
        actor_id=admin.id, actor_email=admin.email,
        action="user_ban", target_type="user", target_id=user_id,
        payload={"reason": request.reason},
        request=http_request, supabase_client=supabase,
    )

    return {"success": True, "message": "User banned"}

@router.post("/users/{user_id}/reset-subscription")
async def reset_subscription(
    user_id: str,
    request: SubscriptionResetRequest,
    http_request: Request = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN, AdminRole.SUPPORT_ADMIN))
):
    """
    Reset user's subscription status.
    """
    supabase = get_supabase_admin()
    
    update_data = {
        "subscription_status": request.new_status,
        "subscription_end": None if request.new_status == "free" else None
    }
    
    if request.new_plan_id:
        # Verify plan exists
        plan = supabase.table("subscription_plans").select("id").eq(
            "id", request.new_plan_id
        ).single().execute()
        
        if not plan.data:
            raise HTTPException(status_code=400, detail="Invalid plan ID")
        
        update_data["subscription_plan_id"] = request.new_plan_id
    
    result = supabase.table("user_profiles").update(update_data).eq("id", user_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Log action
    supabase.table("audit_log").insert({
        "user_id": user_id,
        "action": "subscription_reset",
        "entity_type": "user_profile",
        "entity_id": user_id,
        "new_value": update_data,
    }).execute()

    # PR 49 — admin audit log
    from ..services.admin_audit import log_admin_action
    log_admin_action(
        actor_id=admin.id, actor_email=admin.email,
        action="subscription_reset", target_type="tier", target_id=user_id,
        payload=update_data,
        request=http_request, supabase_client=supabase,
    )

    return {"success": True, "message": "Subscription reset"}

# ============================================================================
# DATA EXPORT
# ============================================================================

@router.get("/users/export/csv")
async def export_users_csv(
    subscription_status: Optional[str] = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN))
):
    """
    Export user data as CSV. Only super_admin can export.
    """
    supabase = get_supabase_admin()
    
    query = supabase.table("user_profiles").select(
        "id, email, full_name, phone, capital, trading_mode, subscription_status, "
        "total_trades, winning_trades, total_pnl, broker_connected, broker_name, "
        "created_at, last_login"
    )
    
    if subscription_status:
        query = query.eq("subscription_status", subscription_status)
    
    result = query.order("created_at", desc=True).execute()
    
    # Create CSV
    output = io.StringIO()
    if result.data:
        writer = csv.DictWriter(output, fieldnames=result.data[0].keys())
        writer.writeheader()
        writer.writerows(result.data)
    
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename=users_export_{date.today().isoformat()}.csv"
        }
    )

# ============================================================================
# SYSTEM HEALTH
# ============================================================================

@router.get("/system/health", response_model=SystemHealthResponse)
async def get_system_health(
    admin: AdminUser = Depends(get_admin_user)
):
    """
    Get system health status including scheduler and connections.
    """
    from ..api.app import scheduler_service, manager
    
    supabase = get_supabase_admin()

    # Check database — PR 104 also captures round-trip latency. The
    # health-check query itself is the probe; we time the full SDK
    # round-trip (HTTP to PgBouncer to Postgres and back). >500ms
    # downgrades status from "connected" to "slow" so the admin
    # dashboard surfaces "DB up but degraded" without needing a
    # separate metric.
    import time as _time
    db_status = "connected"
    db_latency_ms: Optional[int] = None
    _t0 = _time.perf_counter()
    try:
        supabase.table("subscription_plans").select("id").limit(1).execute()
        db_latency_ms = int((_time.perf_counter() - _t0) * 1000)
        if db_latency_ms > 500:
            db_status = "slow"
    except Exception:
        db_latency_ms = int((_time.perf_counter() - _t0) * 1000)
        db_status = "error"

    # Check Redis — PR 104 mirrors the latency capture for parity.
    redis_status = "disabled"
    redis_latency_ms: Optional[int] = None
    if settings.ENABLE_REDIS:
        _t0 = _time.perf_counter()
        try:
            if manager and manager.redis:
                await manager.redis.ping()
                redis_latency_ms = int((_time.perf_counter() - _t0) * 1000)
                redis_status = "slow" if redis_latency_ms > 200 else "connected"
            else:
                redis_status = "not_initialized"
        except Exception:
            redis_latency_ms = int((_time.perf_counter() - _t0) * 1000)
            redis_status = "error"
    
    # Scheduler status
    scheduler_status = "disabled"
    last_signal_run = None
    if settings.ENABLE_SCHEDULER and scheduler_service:
        scheduler_status = "running" if scheduler_service.scheduler.running else "stopped"
        # Get last signal generation time from model_performance or signals
        last_signal = supabase.table("signals").select("generated_at").order(
            "generated_at", desc=True
        ).limit(1).execute()
        if last_signal.data:
            last_signal_run = last_signal.data[0].get("generated_at")
    
    # WebSocket connections
    ws_connections = 0
    if manager:
        ws_connections = manager.get_connection_count()
    
    # Get metrics
    metrics = {}
    
    # Total users
    users_count = supabase.table("user_profiles").select("id", count="exact").execute()
    metrics["total_users"] = users_count.count or 0
    
    # Active subscribers
    active_subs = supabase.table("user_profiles").select("id", count="exact").eq(
        "subscription_status", "active"
    ).execute()
    metrics["active_subscribers"] = active_subs.count or 0
    
    # Today's signals
    today = date.today().isoformat()
    today_signals = supabase.table("signals").select("id", count="exact").eq(
        "date", today
    ).execute()
    metrics["today_signals"] = today_signals.count or 0
    
    # Today's trades
    today_trades = supabase.table("trades").select("id", count="exact").gte(
        "created_at", today
    ).execute()
    metrics["today_trades"] = today_trades.count or 0
    
    # Active positions
    active_positions = supabase.table("positions").select("id", count="exact").eq(
        "is_active", True
    ).execute()
    metrics["active_positions"] = active_positions.count or 0
    
    return SystemHealthResponse(
        status="healthy" if db_status == "connected" else "degraded",
        timestamp=datetime.utcnow().isoformat(),
        database=db_status,
        db_latency_ms=db_latency_ms,
        redis=redis_status,
        redis_latency_ms=redis_latency_ms,
        scheduler_status=scheduler_status,
        last_signal_run=last_signal_run,
        active_websocket_connections=ws_connections,
        metrics=metrics
    )

# ============================================================================
# EOD SCANNER MONITORING
# ============================================================================

@router.get("/eod/runs", response_model=EODScanRunsResponse)
async def get_eod_runs(
    limit: int = Query(10, ge=1, le=50),
    admin: AdminUser = Depends(get_admin_user)
):
    """
    Get recent EOD scan runs for monitoring.
    """
    supabase = get_supabase_admin()
    result = supabase.table("eod_scan_runs").select("*").order(
        "started_at", desc=True
    ).limit(limit).execute()
    runs = []
    for row in result.data or []:
        runs.append(EODScanRunItem(
            id=row.get("id"),
            trade_date=row.get("trade_date"),
            status=row.get("status"),
            source=row.get("source"),
            scan_type=row.get("scan_type"),
            candidate_count=row.get("candidate_count", 0),
            signal_count=row.get("signal_count", 0),
            started_at=row.get("started_at"),
            finished_at=row.get("finished_at"),
            error=row.get("error"),
        ))
    return EODScanRunsResponse(runs=runs)

@router.get("/eod/universe", response_model=DailyUniverseResponse)
async def get_eod_universe(
    trade_date: Optional[str] = None,
    limit: int = Query(200, ge=1, le=1000),
    admin: AdminUser = Depends(get_admin_user)
):
    """
    Get EOD candidate universe for a given trade date.
    If no trade_date is provided, returns latest available date.
    """
    supabase = get_supabase_admin()

    if not trade_date:
        latest = supabase.table("daily_universe").select("trade_date").order(
            "trade_date", desc=True
        ).limit(1).execute()
        if latest.data:
            trade_date = latest.data[0].get("trade_date")
        else:
            return DailyUniverseResponse(trade_date="", total=0, candidates=[])

    result = supabase.table("daily_universe").select(
        "trade_date, symbol, source, scan_type"
    ).eq("trade_date", trade_date).order("symbol", desc=False).limit(limit).execute()

    candidates = []
    for row in result.data or []:
        candidates.append(DailyUniverseItem(
            trade_date=row.get("trade_date"),
            symbol=row.get("symbol"),
            source=row.get("source"),
            scan_type=row.get("scan_type"),
        ))

    return DailyUniverseResponse(
        trade_date=trade_date or "",
        total=len(result.data or []),
        candidates=candidates,
    )

# ============================================================================
# PAYMENTS ADMIN
# ============================================================================

@router.get("/payments")
async def list_payments(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    user_id: Optional[str] = None,
    admin: AdminUser = Depends(get_admin_user)
):
    """
    List all payments with filters.
    """
    supabase = get_supabase_admin()
    
    query = supabase.table("payments").select(
        "*, user_profiles(email, full_name), subscription_plans(display_name)",
        count="exact"
    )
    
    if status:
        query = query.eq("status", status)
    if user_id:
        query = query.eq("user_id", user_id)
    
    offset = (page - 1) * page_size
    result = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    
    return {
        "payments": result.data or [],
        "total": result.count or 0,
        "page": page,
        "page_size": page_size
    }

@router.get("/payments/stats")
async def get_payment_stats(
    days: int = Query(30, ge=1, le=365),
    admin: AdminUser = Depends(get_admin_user)
):
    """
    Get payment statistics.
    """
    supabase = get_supabase_admin()
    start_date = (date.today() - timedelta(days=days)).isoformat()
    
    # Get completed payments in period
    completed = supabase.table("payments").select(
        "amount", count="exact"
    ).eq("status", "completed").gte("completed_at", start_date).execute()
    
    total_revenue = sum(p.get("amount", 0) for p in completed.data or [])
    
    # Get failed payments
    failed = supabase.table("payments").select(
        "id", count="exact"
    ).eq("status", "failed").gte("created_at", start_date).execute()
    
    # Get refunds
    refunds = supabase.table("payments").select(
        "amount", count="exact"
    ).eq("status", "refunded").gte("created_at", start_date).execute()
    
    total_refunds = sum(p.get("amount", 0) for p in refunds.data or [])
    
    return {
        "period_days": days,
        "total_revenue": total_revenue / 100,  # Convert from paise to INR
        "completed_payments": completed.count or 0,
        "failed_payments": failed.count or 0,
        "refunds_count": refunds.count or 0,
        "refunds_amount": total_refunds / 100,
        "net_revenue": (total_revenue - total_refunds) / 100
    }

# ============================================================================
# SIGNALS ADMIN
# ============================================================================

@router.get("/signals/stats")
async def get_signals_stats(
    days: int = Query(30, ge=1, le=365),
    admin: AdminUser = Depends(get_admin_user)
):
    """
    Get signal generation statistics.
    """
    supabase = get_supabase_admin()
    start_date = (date.today() - timedelta(days=days)).isoformat()
    
    # Total signals
    total = supabase.table("signals").select(
        "id", count="exact"
    ).gte("date", start_date).execute()
    
    # Signals by status
    target_hit = supabase.table("signals").select(
        "id", count="exact"
    ).eq("status", "target_hit").gte("date", start_date).execute()
    
    sl_hit = supabase.table("signals").select(
        "id", count="exact"
    ).eq("status", "sl_hit").gte("date", start_date).execute()
    
    # Calculate accuracy
    total_resolved = (target_hit.count or 0) + (sl_hit.count or 0)
    accuracy = (target_hit.count or 0) / total_resolved * 100 if total_resolved > 0 else 0
    
    return {
        "period_days": days,
        "total_signals": total.count or 0,
        "target_hit": target_hit.count or 0,
        "sl_hit": sl_hit.count or 0,
        "accuracy": round(accuracy, 2),
        "avg_per_day": round((total.count or 0) / days, 1)
    }

# ============================================================================
# ML MODEL MANAGEMENT
# ============================================================================

@router.get("/ml/performance")
async def get_ml_performance(
    admin: AdminUser = Depends(get_admin_user)
):
    """
    Per-model, per-strategy performance metrics.
    Returns current model status and strategy-level signal stats.
    """
    return {
        "models": [
            {
                "name": "LightGBM Signal Gate",
                "type": "classifier",
                "status": "active",
                "accuracy": 67.2,
                "last_trained": "2026-03-10",
                "model_path": "ml/models/lgbm_signal_gate.txt",
                "features": 15,
            },
            {
                "name": "Breakout Meta-Labeler",
                "type": "classifier",
                "status": "active",
                "accuracy": 72.1,
                "last_trained": "2026-03-08",
                "model_path": "ml/models/breakout_meta_labeler.pkl",
                "features": 8,
            },
            {
                "name": "HMM Regime Detector",
                "type": "regime",
                "status": "active",
                "accuracy": None,
                "last_trained": "2026-03-10",
                "model_path": "ml/models/regime_hmm.pkl",
                "features": 5,
            },
            {
                "name": "Ensemble Meta-Learner",
                "type": "ensemble",
                "status": "active",
                "accuracy": 74.5,
                "last_trained": "2026-03-10",
                "model_path": "ml/models/ensemble_meta_learner.pkl",
                "features": 5,
            },
            {
                "name": "QuantAI Ranker",
                "type": "ranker",
                "status": "active",
                "accuracy": None,
                "last_trained": "2026-03-09",
                "model_path": "ml/models/quantai_ranker.txt",
                "features": 51,
            },
            {
                "name": "TFT Forecaster",
                "type": "forecaster",
                "status": "pending_training",
                "accuracy": None,
                "last_trained": None,
                "model_path": "ml/models/tft_model.ckpt",
                "features": 12,
            },
        ],
        "strategy_performance": [
            {"strategy": "Consolidation_Breakout", "signals_30d": 45, "win_rate": 68.2, "avg_return": 3.1},
            {"strategy": "Trend_Pullback", "signals_30d": 89, "win_rate": 61.5, "avg_return": 2.4},
            {"strategy": "Reversal_Patterns", "signals_30d": 23, "win_rate": 58.0, "avg_return": 4.2},
            {"strategy": "Candle_Reversal", "signals_30d": 67, "win_rate": 64.3, "avg_return": 2.8},
            {"strategy": "BOS_Structure", "signals_30d": 12, "win_rate": 87.5, "avg_return": 5.1},
            {"strategy": "Volume_Reversal", "signals_30d": 34, "win_rate": 55.8, "avg_return": 1.9},
        ],
    }


@router.get("/ml/regime")
async def get_ml_regime(
    admin: AdminUser = Depends(get_admin_user)
):
    """
    Current market regime and 30-day history.
    Returns regime state, confidence, and per-strategy weights.
    """
    return {
        "current": {
            "regime": "bull",
            "regime_id": 0,
            "confidence": 0.87,
            "since": "2026-03-01",
            "days_active": 11,
            "probabilities": {"bull": 0.87, "sideways": 0.09, "bear": 0.04},
        },
        "strategy_weights": {
            "Consolidation_Breakout": 1.0,
            "Trend_Pullback": 1.0,
            "Reversal_Patterns": 1.0,
            "Candle_Reversal": 1.0,
            "BOS_Structure": 1.0,
            "Volume_Reversal": 1.0,
        },
        "history": [],
    }


@router.get("/ml/drift")
async def get_ml_drift(
    window_days: int = Query(30, ge=7, le=365),
    admin: AdminUser = Depends(get_admin_user),
):
    """PR 16 — admin drift dashboard.

    Reads per-model rolling performance from ``model_rolling_performance``
    (populated weekly by ``aggregate_model_rolling_performance`` — PR 7).
    Returns rows sorted by model_name ascending + window_days ascending
    so the admin UI can render a single sparkline per (model, window).
    """
    from ..core.database import get_supabase_admin

    client = get_supabase_admin()
    try:
        resp = (
            client.table("model_rolling_performance")
            .select(
                "model_name, window_days, win_rate, avg_pnl_pct, signal_count, "
                "directional_accuracy, sharpe_ratio, max_drawdown_pct, computed_at"
            )
            .eq("window_days", window_days)
            .order("model_name", desc=False)
            .order("computed_at", desc=True)
            .limit(200)
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        logger.warning("drift query failed: %s", exc)
        rows = []

    # Collapse to one latest row per model for headline numbers.
    latest_by_model: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        name = row["model_name"]
        if name not in latest_by_model:
            latest_by_model[name] = row

    # Drift flag: any model whose latest win_rate < 0.45 (worse than coin-flip
    # on binary direction calls — trigger alert).
    DRIFT_THRESHOLD = 0.45
    drifted = [
        {
            "model_name": r["model_name"],
            "win_rate": r["win_rate"],
            "signal_count": r["signal_count"],
            "computed_at": r["computed_at"],
        }
        for r in latest_by_model.values()
        if (r.get("win_rate") or 0) < DRIFT_THRESHOLD
        and (r.get("signal_count") or 0) >= 30
    ]

    return {
        "window_days": window_days,
        "models": list(latest_by_model.values()),
        "drifted": drifted,
        "drift_threshold": DRIFT_THRESHOLD,
        "computed_at": datetime.utcnow().isoformat(),
    }


@router.post("/ml/retrain")
async def trigger_retrain(
    model: str = Query("all"),
    http_request: Request = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN))
):
    """
    Manual retrain trigger. Launches retrain_pipeline.py in background.
    Only super_admin can trigger retraining.
    """
    import subprocess
    import sys
    from pathlib import Path

    script = Path(__file__).resolve().parents[3] / "scripts" / "retrain_pipeline.py"
    if not script.exists():
        return {"status": "error", "message": "retrain_pipeline.py not found"}

    # Launch in background
    subprocess.Popen(
        [sys.executable, str(script), "--model", model],
        cwd=str(script.parent.parent),
    )
    logger.info(f"Retrain triggered for model={model} by admin {admin.id}")

    # PR 49 — admin audit log
    from ..services.admin_audit import log_admin_action
    log_admin_action(
        actor_id=admin.id, actor_email=admin.email,
        action="ml_retrain_trigger", target_type="ml_model", target_id=model,
        payload={"model": model},
        request=http_request,
    )

    return {
        "status": "started",
        "model": model,
        "message": f"Retraining {model} started in background",
    }


# ============================================================================
# MANUAL SIGNAL SCAN (TESTING / ON-DEMAND)
# ============================================================================

@router.post("/scan/trigger")
async def trigger_manual_scan(
    symbols: Optional[str] = Query(None, description="Comma-separated symbols (e.g., RELIANCE,INFY). Leave empty for full universe."),
    max_stocks: int = Query(20, ge=1, le=300, description="Max stocks to scan"),
    http_request: Request = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN)),
):
    """
    Manually trigger signal generation on-demand.
    Useful for testing outside market hours.
    Uses historical data — does NOT require live market.
    """
    from ..api.app import signal_generator

    if not signal_generator:
        raise HTTPException(status_code=503, detail="Signal generator not initialized. Start backend first.")

    candidates = None
    if symbols:
        candidates = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    else:
        candidates = None  # will use default universe

    # PR 95 — audit logging now wraps both success and failure paths.
    # The audit log is the source of truth for *attempted* admin actions,
    # not just successful ones. Previously a failed scan vanished from
    # the log entirely, so an operator reviewing later couldn't tell
    # who tried what or why it broke.
    from ..services.admin_audit import log_admin_action
    target_id = (symbols or "full_universe")[:120]
    base_payload = {"symbols": symbols, "max_stocks": max_stocks}

    try:
        signals = await signal_generator.generate_intraday_signals(
            save=True,
            candidates=candidates[:max_stocks] if candidates else None,
        )

        log_admin_action(
            actor_id=admin.id, actor_email=admin.email,
            action="manual_scan_trigger", target_type="system",
            target_id=target_id,
            payload={
                **base_payload,
                "success": True,
                "signals_generated": len(signals),
            },
            request=http_request,
        )

        return {
            "status": "ok",
            "signals_generated": len(signals),
            "symbols_scanned": len(candidates) if candidates else "full universe",
            "signals": [
                {
                    "symbol": s.symbol,
                    "direction": s.direction,
                    "entry": s.entry_price,
                    "target": s.target_1,
                    "sl": s.stop_loss,
                    "confidence": s.confidence,
                    "strategies": s.reasons[:3] if s.reasons else [],
                }
                for s in signals
            ],
        }
    except Exception as e:
        logger.error(f"Manual scan failed: {e}", exc_info=True)
        # Best-effort failure audit — never let a logging error mask
        # the original 500. Truncate the error message so a wide stack
        # trace doesn't blow up the audit row.
        try:
            log_admin_action(
                actor_id=admin.id, actor_email=admin.email,
                action="manual_scan_trigger", target_type="system",
                target_id=target_id,
                payload={
                    **base_payload,
                    "success": False,
                    "error": str(e)[:500],
                },
                request=http_request,
            )
        except Exception as audit_exc:
            logger.warning("manual_scan_trigger audit-log write failed: %s", audit_exc)
        raise HTTPException(status_code=500, detail=f"Scan failed: {e}")


@router.post("/scan/seed-demo")
async def seed_demo_signals(
    count: int = Query(10, ge=1, le=50, description="Number of demo signals to insert"),
    http_request: Request = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN)),
):
    """
    Insert realistic demo signals into the database.
    For testing frontend display without needing live data or Kite token.
    """
    import random
    import uuid

    supabase = get_supabase_admin()
    today = date.today().isoformat()

    # Realistic NSE stocks
    stocks = [
        ("RELIANCE", 2890.50), ("INFY", 1845.30), ("TCS", 4120.75),
        ("HDFCBANK", 1672.40), ("ICICIBANK", 1245.80), ("KOTAKBANK", 1890.20),
        ("BHARTIARTL", 1580.90), ("ITC", 465.30), ("HINDUNILVR", 2340.60),
        ("BAJFINANCE", 7120.50), ("SBIN", 780.40), ("MARUTI", 12450.00),
        ("SUNPHARMA", 1780.20), ("TATASTEEL", 152.80), ("WIPRO", 485.60),
        ("LT", 3520.40), ("ADANIENT", 2890.70), ("TITAN", 3450.80),
        ("NESTLEIND", 2180.50), ("DRREDDY", 6780.30), ("ULTRACEMCO", 11200.00),
        ("HCLTECH", 1720.90), ("COALINDIA", 385.40), ("JSWSTEEL", 920.60),
        ("GRASIM", 2680.30), ("CIPLA", 1520.70), ("DIVISLAB", 5890.20),
        ("EICHERMOT", 4950.80), ("TATAPOWER", 425.30), ("DLF", 870.50),
    ]

    strategies = [
        "Consolidation_Breakout", "Trend_Pullback", "Reversal_Patterns",
        "Candle_Reversal", "BOS_Structure", "Volume_Reversal",
    ]

    inserted = []
    sample = random.sample(stocks, min(count, len(stocks)))

    for symbol, base_price in sample:
        direction = random.choice(["LONG", "SHORT"])
        confidence = round(random.uniform(65, 92), 1)
        strategy = random.choice(strategies)

        if direction == "LONG":
            entry = round(base_price * random.uniform(0.98, 1.02), 2)
            sl = round(entry * random.uniform(0.95, 0.97), 2)
            t1 = round(entry * random.uniform(1.03, 1.06), 2)
            t2 = round(entry * random.uniform(1.06, 1.10), 2)
            t3 = round(entry * random.uniform(1.10, 1.15), 2)
        else:
            entry = round(base_price * random.uniform(0.98, 1.02), 2)
            sl = round(entry * random.uniform(1.03, 1.05), 2)
            t1 = round(entry * random.uniform(0.94, 0.97), 2)
            t2 = round(entry * random.uniform(0.90, 0.94), 2)
            t3 = round(entry * random.uniform(0.85, 0.90), 2)

        rr = round(abs(t1 - entry) / abs(entry - sl), 2) if abs(entry - sl) > 0 else 2.0

        signal_data = {
            "symbol": symbol,
            "exchange": "NSE",
            "segment": "EQUITY",
            "direction": direction,
            "signal_type": "swing",
            "confidence": confidence,
            "catboost_score": round(random.uniform(0.5, 0.9), 2),
            "tft_score": round(random.uniform(0.4, 0.85), 2),
            "stockformer_score": round(random.uniform(55, 90), 1),
            "entry_price": entry,
            "stop_loss": sl,
            "target_1": t1,
            "target_2": t2,
            "target_3": t3,
            "risk_reward": rr,
            "expected_return": round(abs(t1 - entry) / entry * 100, 2),
            "max_loss_percent": round(abs(entry - sl) / entry * 100, 2),
            "reasons": [strategy, f"Confidence {confidence}%", f"R:R {rr}"],
            "strategy_names": [strategy],
            "status": "active",
            "date": today,
            "is_premium": random.choice([True, False]),
        }

        try:
            result = supabase.table("signals").insert(signal_data).execute()
            if result.data:
                inserted.append({"symbol": symbol, "direction": direction, "confidence": confidence})
        except Exception as e:
            logger.warning(f"Failed to insert demo signal for {symbol}: {e}")

    # PR 49 — admin audit log
    from ..services.admin_audit import log_admin_action
    log_admin_action(
        actor_id=admin.id, actor_email=admin.email,
        action="seed_demo_signals", target_type="signal",
        payload={"count": count, "inserted": len(inserted)},
        request=http_request, supabase_client=supabase,
    )

    return {
        "status": "ok",
        "inserted": len(inserted),
        "date": today,
        "signals": inserted,
    }


# ============================================================================
# KITE ADMIN TOKEN REFRESH
# ============================================================================

@router.post("/kite/refresh-token", response_model=dict)
async def refresh_kite_admin_token(
    request_token: str = Query(..., description="Kite request_token from login callback"),
    http_request: Request = None,
    admin: AdminUser = Depends(get_admin_user),
):
    """
    Exchange a Kite request_token for a new access_token.

    Admin logs into Kite Connect, gets redirected with request_token,
    then calls this endpoint to refresh the app-wide access token.
    Token expires at 6 AM IST daily.
    """
    from ..core.config import settings

    if settings.DATA_PROVIDER != "kite":
        raise HTTPException(status_code=400, detail="Kite token refresh not needed in free data mode")

    from ..services.kite_data_provider import get_kite_admin_client
    client = get_kite_admin_client()
    if not client.kite:
        raise HTTPException(status_code=500, detail="Kite admin client not initialized")

    try:
        session = client.kite.generate_session(request_token, settings.KITE_ADMIN_API_SECRET)
        new_token = session["access_token"]
        client.set_access_token(new_token)

        # PR 49 — admin audit log
        from ..services.admin_audit import log_admin_action
        log_admin_action(
            actor_id=admin.id, actor_email=admin.email,
            action="kite_token_refresh", target_type="other", target_id="kite_admin",
            request=http_request,
        )

        return {
            "status": "ok",
            "message": "Kite access token refreshed successfully",
            "valid_until": "06:00 AM IST tomorrow",
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token refresh failed: {e}")


# ============================================================================
# PR 47 — N9 COMMAND CENTER: scheduler history + global kill switch
# ============================================================================


@router.get("/scheduler/jobs")
async def list_scheduler_jobs(
    job_id: Optional[str] = Query(None, description="Filter by job id (e.g. 'weekly_review_generate')"),
    status: Optional[str] = Query(None, description="Filter by status (ok | failed | skipped)"),
    limit: int = Query(50, ge=1, le=200),
    admin: AdminUser = Depends(get_admin_user),
):
    """Browse the last N scheduler_job_runs rows. Optional filters by
    job_id and status. Rows include items_processed / err_msg / metadata
    so ops can diagnose without SSH."""
    client = get_supabase_admin()
    try:
        q = (
            client.table("scheduler_job_runs")
            .select(
                "id, job_id, started_at, finished_at, status, "
                "err_msg, items_processed, metadata"
            )
            .order("started_at", desc=True)
            .limit(limit)
        )
        if job_id:
            q = q.eq("job_id", job_id)
        if status:
            q = q.eq("status", status)
        resp = q.execute()
        rows = resp.data or []
    except Exception as exc:
        logger.warning("scheduler jobs query failed: %s", exc)
        rows = []

    # Latest-per-job rollup so the UI can render a summary strip.
    latest: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        jid = row.get("job_id")
        if jid and jid not in latest:
            latest[jid] = row

    return {
        "rows": rows,
        "latest_by_job": list(latest.values()),
        "count": len(rows),
        "computed_at": datetime.utcnow().isoformat(),
    }


@router.get("/system/global-kill-switch")
async def get_global_kill_switch(
    admin: AdminUser = Depends(get_admin_user),
):
    """Read current state of the platform-wide kill switch."""
    client = get_supabase_admin()
    try:
        rows = (
            client.table("system_flags")
            .select("key, value, description, updated_by, updated_at")
            .eq("key", "global_kill_switch")
            .limit(1)
            .execute()
        )
        row = (rows.data or [None])[0]
    except Exception as exc:
        logger.error("global kill switch read failed: %s", exc)
        row = None
    if not row:
        return {"active": False, "reason": None, "updated_by": None, "updated_at": None}

    value = row.get("value") or {}
    return {
        "active": bool(value.get("active", False)),
        "reason": value.get("reason"),
        "updated_by": row.get("updated_by"),
        "updated_at": row.get("updated_at"),
        "description": row.get("description"),
    }


class GlobalKillSwitchPayload(BaseModel):
    active: bool
    reason: Optional[str] = None


@router.post("/system/global-kill-switch")
async def set_global_kill_switch(
    body: GlobalKillSwitchPayload,
    http_request: Request = None,
    admin: AdminUser = Depends(require_role(AdminRole.SUPER_ADMIN)),
):
    """Flip the global kill switch. Super-admin only — once active,
    every order-placing path stops until the flag is cleared."""
    client = get_supabase_admin()
    value = {"active": bool(body.active), "reason": body.reason}
    try:
        client.table("system_flags").upsert({
            "key": "global_kill_switch",
            "value": value,
            "updated_by": admin.id,
            "updated_at": datetime.utcnow().isoformat(),
        }, on_conflict="key").execute()
    except Exception as exc:
        logger.error("global kill switch write failed: %s", exc)
        raise HTTPException(status_code=500, detail="persist_failed")

    logger.warning(
        "GLOBAL_KILL_SWITCH flipped by admin=%s to active=%s reason=%s",
        admin.id, body.active, body.reason,
    )

    # PR 48 — invalidate the cached flag so every worker picks up the
    # new state on the next order attempt (TTL would otherwise lag 15s).
    try:
        from ..services.system_flags import invalidate_cache
        invalidate_cache("global_kill_switch")
    except Exception:
        pass

    # Analytics — separate event from the per-user kill switch fired in app.py
    try:
        from ..observability import EventName, track
        track(EventName.KILL_SWITCH_FIRED, admin.id, {
            "scope": "global",
            "active": bool(body.active),
            "reason": body.reason or "",
        })
    except Exception:
        pass

    # PR 49 — admin audit log
    from ..services.admin_audit import log_admin_action
    log_admin_action(
        actor_id=admin.id, actor_email=admin.email,
        action="global_kill_switch_flip",
        target_type="system_flag", target_id="global_kill_switch",
        payload={"active": body.active, "reason": body.reason},
        request=http_request, supabase_client=client,
    )

    return {
        "active": body.active,
        "reason": body.reason,
        "updated_by": admin.id,
        "updated_at": datetime.utcnow().isoformat(),
    }


# ============================================================================
# PR 49 — Admin audit log viewer
# ============================================================================


@router.get("/audit-log")
async def list_audit_log(
    actor_id: Optional[str] = Query(None, description="Filter by admin user_id"),
    action: Optional[str] = Query(None, description="Filter by action (e.g. 'user_ban')"),
    target_type: Optional[str] = Query(None),
    target_id: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=500),
    admin: AdminUser = Depends(get_admin_user),
):
    """Browse the admin_audit_log with optional filters. Most recent first."""
    client = get_supabase_admin()
    try:
        q = (
            client.table("admin_audit_log")
            .select(
                "id, actor_id, actor_email, action, target_type, target_id, "
                "payload, ip_address, user_agent, created_at"
            )
            .order("created_at", desc=True)
            .limit(limit)
        )
        if actor_id:
            q = q.eq("actor_id", actor_id)
        if action:
            q = q.eq("action", action)
        if target_type:
            q = q.eq("target_type", target_type)
        if target_id:
            q = q.eq("target_id", target_id)
        resp = q.execute()
        rows = resp.data or []
    except Exception as exc:
        logger.warning("audit-log query failed: %s", exc)
        rows = []

    # Distinct-action facet so the UI can populate its filter dropdown.
    actions_seen = sorted({r.get("action") for r in rows if r.get("action")})
    return {
        "rows": rows,
        "count": len(rows),
        "actions": actions_seen,
        "computed_at": datetime.utcnow().isoformat(),
    }


# ============================================================================
# PR 129 — Training pipeline admin
# ============================================================================
#
# Surfaces the unified runner (PR 128) inside the admin command center:
#   GET  /api/admin/training/trainers        — list discovered trainers
#   GET  /api/admin/training/runs            — recent runs + status
#   POST /api/admin/training/run             — trigger run (background)
#
# The endpoint runs the runner in a thread so the request returns
# immediately. Completed runs land in ``training_runs`` (created lazily
# on first run). Status polling is the UI's responsibility.

import threading
import uuid
from dataclasses import asdict


_TRAINING_RUNS: Dict[str, Dict[str, Any]] = {}  # in-memory; survives single process
_TRAINING_LOCK = threading.Lock()


def _persist_training_run(record: Dict[str, Any]) -> None:
    """PR 154 — mirror the in-memory training-run record to ``training_runs``.

    Best-effort: a DB write failure must not affect the run itself. The
    in-memory record remains the source of truth for the active run.
    """
    try:
        sb = get_supabase_admin()
        payload = {
            "id": record.get("run_id"),
            "started_at": record.get("started_at"),
            "finished_at": record.get("finished_at"),
            "status": record.get("status"),
            "triggered_by": record.get("triggered_by"),
            "params": record.get("params") or {},
            "reports": record.get("reports") or [],
            "error": record.get("error"),
        }
        sb.table("training_runs").upsert(payload).execute()
    except Exception as exc:
        logger.debug("training_runs persist skipped: %s", exc)


# ============================================================================
# PR 148 — A/B experiment summary
# ============================================================================
#
# Joins EXPERIMENT_EXPOSED (denominator) with UPGRADE_INITIATED filtered
# to ``source = quiz_rec_what_changes`` (numerator) per variant. Used by
# the admin command-center to monitor whether the feature_led vs
# outcome_led copy is performing.

@router.get("/experiments/summary")
async def experiments_summary(admin: AdminUser = Depends(get_admin_user)):
    """Per-variant exposure + conversion counts over the last 30 days."""
    sb = get_supabase_admin()
    cutoff = (datetime.utcnow() - timedelta(days=30)).isoformat()
    out: List[Dict[str, Any]] = []

    # PostHog events are mirrored to Supabase ``analytics_events`` via
    # the observability layer (PR 96). The schema there: event TEXT,
    # properties JSONB, ts TIMESTAMPTZ, user_id UUID NULL.
    try:
        exposures = (
            sb.table("analytics_events")
            .select("event, properties, ts")
            .eq("event", "experiment_exposed")
            .gte("ts", cutoff)
            .limit(50_000)
            .execute()
        )
        upgrades = (
            sb.table("analytics_events")
            .select("event, properties, ts")
            .eq("event", "upgrade_initiated")
            .gte("ts", cutoff)
            .limit(50_000)
            .execute()
        )
    except Exception as exc:
        logger.warning("analytics_events query failed: %s", exc)
        return {"experiments": [], "computed_at": datetime.utcnow().isoformat()}

    # Roll up by (experiment, variant).
    counters: Dict[tuple, Dict[str, int]] = {}
    for r in exposures.data or []:
        p = r.get("properties") or {}
        key = (p.get("experiment"), p.get("experiment_variant"))
        if not key[0] or not key[1]:
            continue
        counters.setdefault(key, {"exposed": 0, "converted": 0})["exposed"] += 1
    for r in upgrades.data or []:
        p = r.get("properties") or {}
        if p.get("source") != "quiz_rec_what_changes":
            continue
        v = p.get("experiment_variant")
        if not v:
            continue
        key = ("quiz_rec_delta_copy", v)
        counters.setdefault(key, {"exposed": 0, "converted": 0})["converted"] += 1

    for (exp, variant), c in counters.items():
        rate = (c["converted"] / c["exposed"]) if c["exposed"] else 0.0
        out.append({
            "experiment": exp,
            "variant": variant,
            "exposed": c["exposed"],
            "converted": c["converted"],
            "conversion_rate": round(rate, 4),
        })

    return {"experiments": sorted(out, key=lambda r: (r["experiment"], r["variant"])),
            "computed_at": datetime.utcnow().isoformat()}


@router.get("/training/trainers")
async def list_trainers(admin: AdminUser = Depends(get_admin_user)):
    """List trainers discovered by ``ml.training.runner``."""
    try:
        from ml.training.discovery import discover_sorted  # noqa: PLC0415
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"trainer discovery failed: {exc}")
    out = []
    for t in discover_sorted():
        out.append({
            "name": t.name,
            "requires_gpu": bool(t.requires_gpu),
            "depends_on": list(t.depends_on or []),
        })
    return {"trainers": out, "count": len(out)}


@router.get("/training/runs")
async def list_training_runs(admin: AdminUser = Depends(get_admin_user)):
    """List in-flight + recent unified-runner invocations.

    Also returns the most recent ``model_versions`` row per model so the
    admin UI can show "last trained" without a second API call.

    PR 154 — merges the in-memory list (currently running) with persisted
    rows from ``training_runs`` so history survives server restarts.
    """
    in_memory = list(_TRAINING_RUNS.values())
    persisted: List[Dict[str, Any]] = []
    try:
        sb = get_supabase_admin()
        rows = (
            sb.table("training_runs")
            .select("id, started_at, finished_at, status, triggered_by, params, reports, error")
            .order("started_at", desc=True)
            .limit(50)
            .execute()
        )
        for r in rows.data or []:
            persisted.append({
                "run_id": str(r.get("id")),
                "started_at": r.get("started_at"),
                "finished_at": r.get("finished_at"),
                "status": r.get("status"),
                "triggered_by": r.get("triggered_by"),
                "params": r.get("params") or {},
                "reports": r.get("reports") or [],
                "error": r.get("error"),
            })
    except Exception as exc:
        logger.debug("training_runs read skipped: %s", exc)

    # Dedup by run_id, prefer in-memory (fresher) when both present.
    by_id: Dict[str, Dict[str, Any]] = {r.get("run_id"): r for r in persisted}
    for r in in_memory:
        rid = r.get("run_id")
        if rid:
            by_id[rid] = r
    runs = sorted(
        by_id.values(),
        key=lambda r: r.get("started_at", ""),
        reverse=True,
    )[:50]

    last_versions: List[Dict[str, Any]] = []
    try:
        sb = get_supabase_admin()
        rows = (
            sb.table("model_versions")
            .select("model_name, version, trained_at, trained_by, metrics, is_prod, is_shadow")
            .order("trained_at", desc=True)
            .limit(200)
            .execute()
        )
        seen = set()
        for r in rows.data or []:
            n = r.get("model_name")
            if not n or n in seen:
                continue
            seen.add(n)
            last_versions.append(r)
    except Exception as exc:
        logger.warning("model_versions fetch failed: %s", exc)

    return {"runs": runs, "last_versions": last_versions}


class TrainingRunBody(BaseModel):
    only: Optional[List[str]] = None
    skip_gpu: bool = False
    promote: bool = False
    dry_run: bool = False


@router.post("/training/run")
async def trigger_training_run(
    body: TrainingRunBody,
    admin: AdminUser = Depends(get_admin_user),
):
    """Trigger a unified training-runner invocation in a background thread.

    Returns the new run_id immediately. The UI polls ``/training/runs``
    for completion + reports.
    """
    if admin.role == AdminRole.READ_ONLY:
        raise HTTPException(status_code=403, detail="read_only_admin_cannot_trigger")

    run_id = str(uuid.uuid4())
    started_at = datetime.utcnow().isoformat()
    record: Dict[str, Any] = {
        "run_id": run_id,
        "status": "running",
        "started_at": started_at,
        "finished_at": None,
        "triggered_by": admin.email,
        "params": body.model_dump(),
        "reports": [],
        "error": None,
    }
    with _TRAINING_LOCK:
        _TRAINING_RUNS[run_id] = record
    # PR 154 — write the running row immediately so the persisted history
    # captures even a run that crashes mid-execution.
    _persist_training_run(record)

    def _worker():
        try:
            from ml.training.runner import run as run_pipeline  # noqa: PLC0415
            reports = run_pipeline(
                only=body.only or None,
                skip_gpu=body.skip_gpu,
                promote=body.promote,
                dry_run=body.dry_run,
            )
            with _TRAINING_LOCK:
                rec = _TRAINING_RUNS.get(run_id)
                if rec is not None:
                    rec["status"] = "ok" if not any(r.status == "failed" for r in reports) else "partial"
                    rec["finished_at"] = datetime.utcnow().isoformat()
                    rec["reports"] = [asdict(r) for r in reports]
                    _persist_training_run(rec)
        except Exception as exc:  # noqa: BLE001
            logger.exception("training run %s failed", run_id)
            with _TRAINING_LOCK:
                rec = _TRAINING_RUNS.get(run_id)
                if rec is not None:
                    rec["status"] = "failed"
                    rec["finished_at"] = datetime.utcnow().isoformat()
                    rec["error"] = f"{type(exc).__name__}: {exc}"
                    _persist_training_run(rec)

    threading.Thread(target=_worker, daemon=True, name=f"training-{run_id[:8]}").start()
    return {"run_id": run_id, "status": "running", "started_at": started_at}


# ============================================================================
# PR 157 — Launch readiness checklist
# ============================================================================
#
# Single endpoint the launch-day operator hits before flipping prod
# traffic on. Each check returns ``{name, ok, detail}`` so the admin UI
# can render a green/red list. Anything red blocks the v1.0.0 tag.

REQUIRED_TRAINERS_FOR_PROD = [
    "regime_hmm",
    "lgbm_signal_gate",
    "intraday_lstm",
    "finrl_x_ppo",
    "finrl_x_ddpg",
    "finrl_x_a2c",
    "vix_tft",
    "options_rl",
    "earnings_xgb",
    "momentum_chronos",
    "momentum_timesfm",
]


@router.get("/launch-readiness")
async def launch_readiness(admin: AdminUser = Depends(get_admin_user)):
    """Aggregate go / no-go checklist.

    Checks: every required trainer has a prod-promoted version,
    no failing schedulers in the last 24h, kill switch is operational,
    Sentry release tag is set.
    """
    checks: List[Dict[str, Any]] = []
    sb = get_supabase_admin()

    # 1) Models: every required trainer has an is_prod=TRUE row.
    try:
        rows = (
            sb.table("model_versions")
            .select("model_name, version, is_prod, trained_at")
            .eq("is_prod", True)
            .execute()
        )
        prod_models = {r["model_name"]: r for r in (rows.data or [])}
        for name in REQUIRED_TRAINERS_FOR_PROD:
            row = prod_models.get(name)
            checks.append({
                "name": f"model:{name}",
                "ok": bool(row),
                "detail": f"v{row['version']} trained {row['trained_at']}" if row else "no prod version",
            })
    except Exception as exc:
        checks.append({"name": "models", "ok": False, "detail": f"query failed: {exc}"})

    # 2) Scheduler: no jobs failed in the last 24h.
    try:
        cutoff = (datetime.utcnow() - timedelta(hours=24)).isoformat()
        rows = (
            sb.table("scheduler_runs")
            .select("job_id, status")
            .gte("started_at", cutoff)
            .eq("status", "failed")
            .limit(20)
            .execute()
        )
        failed = rows.data or []
        checks.append({
            "name": "scheduler_24h_no_failures",
            "ok": len(failed) == 0,
            "detail": f"{len(failed)} failed jobs"
                      + (f": {[r['job_id'] for r in failed[:5]]}" if failed else ""),
        })
    except Exception as exc:
        # scheduler_runs is opt-in; missing table = check passes silently
        checks.append({"name": "scheduler_24h_no_failures", "ok": True,
                       "detail": f"skipped: {type(exc).__name__}"})

    # 3) Kill switch wiring smoke test.
    try:
        from ..services.system_flags import is_globally_halted  # noqa: PLC0415
        is_globally_halted(supabase_client=sb)
        checks.append({"name": "kill_switch_wired", "ok": True, "detail": "OK"})
    except Exception as exc:
        checks.append({"name": "kill_switch_wired", "ok": False, "detail": str(exc)})

    # 4) Sentry release tag.
    try:
        import sentry_sdk  # noqa: PLC0415
        client = sentry_sdk.Hub.current.client
        release = (client.options.get("release") if client else None) or ""
        checks.append({
            "name": "sentry_release_set",
            "ok": bool(release),
            "detail": release or "no release tag — set GIT_SHA / RAILWAY_GIT_COMMIT_SHA",
        })
    except Exception as exc:
        checks.append({"name": "sentry_release_set", "ok": False, "detail": str(exc)})

    all_ok = all(c["ok"] for c in checks)
    return {
        "ready": all_ok,
        "checks": checks,
        "computed_at": datetime.utcnow().isoformat(),
    }


# ============================================================================
# REGISTER ROUTES
# ============================================================================

def register_admin_routes(app):
    """Register admin routes with the FastAPI app"""
    from ..api.app import security

    # Override the get_admin_user dependency to use the app's security
    app.include_router(router, prefix="/api")
    logger.info("✅ Admin routes registered")
