"""
================================================================================
SWINGAI - ADMIN CONSOLE API ROUTES
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

from fastapi import APIRouter, HTTPException, Depends, Query, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from supabase import Client

from ..core.config import settings

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
    redis: str
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

async def get_admin_user(credentials = None) -> AdminUser:
    """
    Verify user has admin access.
    This is a dependency that checks admin role from user_profiles.
    """
    from ..api.app import get_current_user, security
    from fastapi import Depends
    
    # Get current user from JWT
    try:
        from fastapi.security import HTTPAuthorizationCredentials
        # This will be injected by FastAPI
        user = await get_current_user(credentials)
        user_id = user.id
    except Exception as e:
        logger.error(f"Admin auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication required")
    
    # Check if user is in admin list
    supabase = get_supabase_admin()
    
    # Check user_profiles for admin role (stored in a metadata field)
    # In production, you'd have a separate admin_users table
    result = supabase.table("user_profiles").select("id, email").eq("id", user_id).single().execute()
    
    if not result.data:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Check admin role from in-memory or config
    # In production: query admin_users table
    admin_role = ADMIN_USERS.get(user_id)
    
    # For development: check if email matches known admin emails
    admin_emails = settings.ADMIN_EMAILS if hasattr(settings, 'ADMIN_EMAILS') else []
    if result.data["email"] in admin_emails:
        admin_role = AdminRole.SUPER_ADMIN
    
    if not admin_role:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    return AdminUser(
        id=user_id,
        email=result.data["email"],
        role=admin_role
    )

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
    
    return {"success": True, "message": "User suspended"}

@router.post("/users/{user_id}/unsuspend")
async def unsuspend_user(
    user_id: str,
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
    
    return {"success": True, "message": "User unsuspended"}

@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: str,
    request: UserActionRequest,
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
    
    return {"success": True, "message": "User banned"}

@router.post("/users/{user_id}/reset-subscription")
async def reset_subscription(
    user_id: str,
    request: SubscriptionResetRequest,
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
    
    # Check database
    db_status = "connected"
    try:
        supabase.table("subscription_plans").select("id").limit(1).execute()
    except:
        db_status = "error"
    
    # Check Redis
    redis_status = "disabled"
    if settings.ENABLE_REDIS:
        try:
            if manager and manager.redis:
                await manager.redis.ping()
                redis_status = "connected"
            else:
                redis_status = "not_initialized"
        except:
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
        redis=redis_status,
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
# REGISTER ROUTES
# ============================================================================

def register_admin_routes(app):
    """Register admin routes with the FastAPI app"""
    from ..api.app import security
    
    # Override the get_admin_user dependency to use the app's security
    app.include_router(router, prefix="/api")
    logger.info("✅ Admin routes registered")
