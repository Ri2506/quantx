"""
Security utilities and authentication
"""
import logging
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, Dict, Any

from .database import supabase

logger = logging.getLogger(__name__)
security = HTTPBearer()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict[str, Any]:
    """
    Get current authenticated user from JWT token

    Args:
        credentials: HTTP Bearer token credentials

    Returns:
        User object from Supabase

    Raises:
        HTTPException: If token is invalid or user not found
    """
    try:
        token = credentials.credentials
        user_response = supabase.auth.get_user(token)

        if not user_response or not user_response.user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token"
            )

        return user_response.user

    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed"
        )


async def get_user_profile(
    user: Dict[str, Any] = Depends(get_current_user)
) -> Dict[str, Any]:
    """
    Get user profile from database

    Args:
        user: Current authenticated user

    Returns:
        User profile with subscription details
    """
    try:
        profile = supabase.table("user_profiles").select("*").eq("id", user.id).single().execute()

        if not profile.data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User profile not found"
            )

        return profile.data

    except Exception as e:
        logger.error(f"Error fetching user profile: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error fetching user profile"
        )


def verify_subscription_access(
    profile: Dict[str, Any],
    required_plan: Optional[str] = None
) -> bool:
    """
    Verify user has required subscription level

    Args:
        profile: User profile dict
        required_plan: Required plan name (free, starter, pro, elite)

    Returns:
        True if user has access

    Raises:
        HTTPException: If subscription is invalid or insufficient
    """
    plan_hierarchy = {"free": 0, "starter": 1, "pro": 2, "elite": 3}

    user_plan = profile.get("subscription_plan", "free")
    user_level = plan_hierarchy.get(user_plan, 0)

    if required_plan:
        required_level = plan_hierarchy.get(required_plan, 0)
        if user_level < required_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires {required_plan} plan or higher"
            )

    # Check if subscription is active
    if profile.get("subscription_status") != "active" and user_plan != "free":
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="Subscription expired. Please renew to continue."
        )

    return True
