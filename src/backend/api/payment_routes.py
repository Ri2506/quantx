"""
================================================================================
SWINGAI - RAZORPAY PAYMENT ROUTES
================================================================================
Complete payment integration with:
- Order creation
- Payment verification
- Webhook handlers (success/fail/refund)
- Idempotent subscription lifecycle
================================================================================
"""

import hmac
import hashlib
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional

from fastapi import APIRouter, HTTPException, Depends, Request, Header
from pydantic import BaseModel
from supabase import Client
import razorpay

from ..core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["Payments"])

# ============================================================================
# SCHEMAS
# ============================================================================

class CreateSubscriptionOrder(BaseModel):
    plan_id: str
    billing_period: str  # monthly, quarterly, yearly

class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str

class RefundRequest(BaseModel):
    payment_id: str
    amount: Optional[int] = None  # Optional partial refund amount in paise
    reason: str = "Customer request"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_razorpay_client() -> razorpay.Client:
    """Get Razorpay client instance"""
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Payment service not configured"
        )
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))

def get_supabase_admin() -> Client:
    """Get Supabase admin client"""
    from ..api.app import get_supabase_admin as _get_admin
    return _get_admin()

def verify_webhook_signature(payload: bytes, signature: str, secret: str) -> bool:
    """
    Verify Razorpay webhook signature.
    
    Args:
        payload: Raw request body bytes
        signature: X-Razorpay-Signature header value
        secret: Razorpay webhook secret
    
    Returns:
        True if signature is valid
    """
    expected = hmac.new(
        secret.encode('utf-8'),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

def calculate_subscription_end(billing_period: str, start_date: datetime = None) -> datetime:
    """Calculate subscription end date based on billing period"""
    start = start_date or datetime.utcnow()
    
    if billing_period == "monthly":
        return start + timedelta(days=30)
    elif billing_period == "quarterly":
        return start + timedelta(days=90)
    elif billing_period == "yearly":
        return start + timedelta(days=365)
    else:
        return start + timedelta(days=30)  # Default to monthly

# ============================================================================
# IDEMPOTENCY HELPERS
# ============================================================================

async def get_or_create_payment(
    supabase: Client,
    user_id: str,
    razorpay_order_id: str,
    plan_id: str,
    billing_period: str,
    amount: int
) -> Dict:
    """
    Idempotent payment creation - returns existing payment if order_id exists.
    """
    # Check if payment already exists
    existing = supabase.table("payments").select("*").eq(
        "razorpay_order_id", razorpay_order_id
    ).execute()
    
    if existing.data:
        return existing.data[0]
    
    # Create new payment record
    payment = {
        "user_id": user_id,
        "razorpay_order_id": razorpay_order_id,
        "amount": amount,
        "plan_id": plan_id,
        "billing_period": billing_period,
        "status": "pending"
    }
    
    result = supabase.table("payments").insert(payment).execute()
    return result.data[0] if result.data else payment

async def process_successful_payment(
    supabase: Client,
    payment_id: str,
    razorpay_payment_id: str,
    razorpay_signature: str
) -> bool:
    """
    Idempotent payment success processing.
    Returns False if already processed, True if newly processed.
    """
    # Get payment record
    payment = supabase.table("payments").select("*").eq(
        "id", payment_id
    ).single().execute()
    
    if not payment.data:
        logger.error(f"Payment not found: {payment_id}")
        return False
    
    # Check if already processed (idempotency)
    if payment.data["status"] == "completed":
        logger.info(f"Payment {payment_id} already completed - skipping")
        return False
    
    # Update payment record
    supabase.table("payments").update({
        "razorpay_payment_id": razorpay_payment_id,
        "razorpay_signature": razorpay_signature,
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat()
    }).eq("id", payment_id).execute()
    
    # Activate subscription
    user_id = payment.data["user_id"]
    plan_id = payment.data["plan_id"]
    billing_period = payment.data["billing_period"]
    
    subscription_end = calculate_subscription_end(billing_period)
    
    supabase.table("user_profiles").update({
        "subscription_plan_id": plan_id,
        "subscription_status": "active",
        "subscription_start": datetime.utcnow().isoformat(),
        "subscription_end": subscription_end.isoformat()
    }).eq("id", user_id).execute()
    
    logger.info(f"Payment {payment_id} processed - subscription activated for user {user_id}")
    
    return True

async def process_failed_payment(
    supabase: Client,
    razorpay_order_id: str,
    failure_reason: str
) -> bool:
    """
    Idempotent payment failure processing.
    """
    # Get payment by order ID
    payment = supabase.table("payments").select("*").eq(
        "razorpay_order_id", razorpay_order_id
    ).single().execute()
    
    if not payment.data:
        logger.error(f"Payment not found for order: {razorpay_order_id}")
        return False
    
    # Check if already processed
    if payment.data["status"] in ["completed", "failed", "refunded"]:
        logger.info(f"Payment {payment.data['id']} already in final state - skipping")
        return False
    
    # Update payment record
    supabase.table("payments").update({
        "status": "failed",
        "failure_reason": failure_reason
    }).eq("id", payment.data["id"]).execute()
    
    logger.info(f"Payment {payment.data['id']} marked as failed: {failure_reason}")
    
    return True

async def process_refund(
    supabase: Client,
    razorpay_payment_id: str,
    refund_amount: int,
    refund_id: str
) -> bool:
    """
    Idempotent refund processing.
    """
    # Get payment by Razorpay payment ID
    payment = supabase.table("payments").select("*").eq(
        "razorpay_payment_id", razorpay_payment_id
    ).single().execute()
    
    if not payment.data:
        logger.error(f"Payment not found: {razorpay_payment_id}")
        return False
    
    # Check if already refunded
    if payment.data["status"] == "refunded":
        logger.info(f"Payment {payment.data['id']} already refunded - skipping")
        return False
    
    # Update payment record
    supabase.table("payments").update({
        "status": "refunded",
        "refund_id": refund_id,
        "refund_amount": refund_amount
    }).eq("id", payment.data["id"]).execute()
    
    # Revert subscription if full refund
    if refund_amount >= payment.data["amount"]:
        user_id = payment.data["user_id"]
        
        # Get free plan
        free_plan = supabase.table("subscription_plans").select("id").eq(
            "name", "free"
        ).single().execute()
        
        supabase.table("user_profiles").update({
            "subscription_plan_id": free_plan.data["id"] if free_plan.data else None,
            "subscription_status": "free",
            "subscription_end": None
        }).eq("id", user_id).execute()
        
        logger.info(f"Full refund processed - subscription reverted for user {user_id}")
    
    return True

# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/create-order")
async def create_order(
    data: CreateSubscriptionOrder,
    user = None  # Will be injected by dependency
):
    """
    Create a Razorpay order for subscription payment.
    """
    from ..api.app import get_current_user
    
    # This will be called with proper dependency injection from app.py
    # For now, we handle the case where user might be None
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    supabase = get_supabase_admin()
    rzp = get_razorpay_client()
    
    # Get plan details
    plan = supabase.table("subscription_plans").select("*").eq(
        "id", data.plan_id
    ).single().execute()
    
    if not plan.data:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    # Calculate amount based on billing period
    if data.billing_period == "monthly":
        amount = plan.data["price_monthly"]
    elif data.billing_period == "quarterly":
        amount = plan.data["price_quarterly"] or plan.data["price_monthly"] * 3
    elif data.billing_period == "yearly":
        amount = plan.data["price_yearly"] or plan.data["price_monthly"] * 12
    else:
        raise HTTPException(status_code=400, detail="Invalid billing period")
    
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Cannot create order for free plan")
    
    # Create Razorpay order
    order_data = {
        "amount": amount,
        "currency": "INR",
        "receipt": f"order_{user.id[:8]}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
        "notes": {
            "user_id": user.id,
            "plan_id": data.plan_id,
            "plan_name": plan.data["name"],
            "billing_period": data.billing_period
        }
    }
    
    try:
        rzp_order = rzp.order.create(order_data)
    except Exception as e:
        logger.error(f"Razorpay order creation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to create payment order")
    
    # Save payment record (idempotent)
    await get_or_create_payment(
        supabase,
        user.id,
        rzp_order["id"],
        data.plan_id,
        data.billing_period,
        amount
    )
    
    return {
        "order_id": rzp_order["id"],
        "amount": amount,
        "currency": "INR",
        "key_id": settings.RAZORPAY_KEY_ID,
        "plan_name": plan.data["display_name"],
        "billing_period": data.billing_period
    }

@router.post("/verify")
async def verify_payment(
    data: VerifyPaymentRequest,
    user = None
):
    """
    Verify Razorpay payment signature and activate subscription.
    """
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    supabase = get_supabase_admin()
    
    # Verify signature
    message = f"{data.razorpay_order_id}|{data.razorpay_payment_id}"
    expected_signature = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode('utf-8'),
        message.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    if not hmac.compare_digest(expected_signature, data.razorpay_signature):
        logger.warning(f"Invalid payment signature for order {data.razorpay_order_id}")
        raise HTTPException(status_code=400, detail="Invalid payment signature")
    
    # Get payment record
    payment = supabase.table("payments").select("*").eq(
        "razorpay_order_id", data.razorpay_order_id
    ).single().execute()
    
    if not payment.data:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    # Verify user owns this payment
    if payment.data["user_id"] != user.id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    # Process payment (idempotent)
    was_processed = await process_successful_payment(
        supabase,
        payment.data["id"],
        data.razorpay_payment_id,
        data.razorpay_signature
    )
    
    if was_processed:
        return {
            "success": True,
            "message": "Payment verified and subscription activated"
        }
    else:
        return {
            "success": True,
            "message": "Payment already processed"
        }

# ============================================================================
# WEBHOOK HANDLERS
# ============================================================================

@router.post("/webhook")
async def handle_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None)
):
    """
    Handle Razorpay webhook events.
    
    Supported events:
    - payment.captured: Payment successful
    - payment.failed: Payment failed
    - refund.created: Refund initiated
    - refund.processed: Refund completed
    """
    # Get raw body for signature verification
    body = await request.body()
    
    # Verify webhook signature
    webhook_secret = getattr(settings, 'RAZORPAY_WEBHOOK_SECRET', settings.RAZORPAY_KEY_SECRET)
    
    if x_razorpay_signature:
        if not verify_webhook_signature(body, x_razorpay_signature, webhook_secret):
            logger.warning("Invalid webhook signature")
            raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Parse payload
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")
    
    event = payload.get("event")
    event_data = payload.get("payload", {}).get("payment", {}).get("entity", {})
    
    logger.info(f"Webhook received: {event}")
    
    supabase = get_supabase_admin()
    
    # Handle different event types
    if event == "payment.captured":
        # Payment was successful
        order_id = event_data.get("order_id")
        payment_id = event_data.get("id")
        
        if order_id and payment_id:
            # Get payment record
            payment = supabase.table("payments").select("*").eq(
                "razorpay_order_id", order_id
            ).single().execute()
            
            if payment.data:
                await process_successful_payment(
                    supabase,
                    payment.data["id"],
                    payment_id,
                    "webhook_verified"
                )
    
    elif event == "payment.failed":
        # Payment failed
        order_id = event_data.get("order_id")
        error_reason = event_data.get("error_description", "Payment failed")
        
        if order_id:
            await process_failed_payment(supabase, order_id, error_reason)
    
    elif event in ["refund.created", "refund.processed"]:
        # Refund event
        refund_data = payload.get("payload", {}).get("refund", {}).get("entity", {})
        payment_id = refund_data.get("payment_id")
        refund_id = refund_data.get("id")
        refund_amount = refund_data.get("amount", 0)
        
        if payment_id and refund_id:
            await process_refund(supabase, payment_id, refund_amount, refund_id)
    
    else:
        logger.info(f"Unhandled webhook event: {event}")
    
    # Always return 200 to acknowledge receipt
    return {"status": "ok"}

# ============================================================================
# ADMIN: MANUAL REFUND
# ============================================================================

@router.post("/refund")
async def initiate_refund(
    data: RefundRequest,
    admin = None  # Admin dependency
):
    """
    Initiate a refund for a payment. Admin only.
    """
    if admin is None:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    supabase = get_supabase_admin()
    rzp = get_razorpay_client()
    
    # Get payment record
    payment = supabase.table("payments").select("*").eq(
        "id", data.payment_id
    ).single().execute()
    
    if not payment.data:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    if payment.data["status"] != "completed":
        raise HTTPException(status_code=400, detail="Can only refund completed payments")
    
    if payment.data["status"] == "refunded":
        raise HTTPException(status_code=400, detail="Payment already refunded")
    
    # Initiate refund with Razorpay
    refund_amount = data.amount or payment.data["amount"]
    
    try:
        refund = rzp.payment.refund(
            payment.data["razorpay_payment_id"],
            {
                "amount": refund_amount,
                "notes": {
                    "reason": data.reason,
                    "initiated_by": admin.id if hasattr(admin, 'id') else "admin"
                }
            }
        )
    except Exception as e:
        logger.error(f"Refund initiation failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to initiate refund")
    
    # Process refund (will be confirmed by webhook)
    await process_refund(
        supabase,
        payment.data["razorpay_payment_id"],
        refund_amount,
        refund["id"]
    )
    
    return {
        "success": True,
        "refund_id": refund["id"],
        "amount": refund_amount / 100,  # Convert to INR
        "message": "Refund initiated successfully"
    }

# ============================================================================
# SUBSCRIPTION STATUS
# ============================================================================

@router.get("/subscription-status")
async def get_subscription_status(user = None):
    """
    Get current user's subscription status.
    """
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    supabase = get_supabase_admin()
    
    profile = supabase.table("user_profiles").select(
        "subscription_status, subscription_start, subscription_end, "
        "subscription_plans(name, display_name, price_monthly)"
    ).eq("id", user.id).single().execute()
    
    if not profile.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    
    data = profile.data
    plan = data.get("subscription_plans") or {}
    
    # Calculate days remaining
    days_remaining = None
    if data.get("subscription_end"):
        end_date = datetime.fromisoformat(data["subscription_end"].replace("Z", "+00:00"))
        days_remaining = max(0, (end_date - datetime.utcnow()).days)
    
    return {
        "status": data.get("subscription_status", "free"),
        "plan_name": plan.get("display_name", "Free"),
        "plan_code": plan.get("name", "free"),
        "start_date": data.get("subscription_start"),
        "end_date": data.get("subscription_end"),
        "days_remaining": days_remaining,
        "is_active": data.get("subscription_status") in ["active", "trial"]
    }
