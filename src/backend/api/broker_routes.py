"""
================================================================================
SWINGAI - BROKER AUTHENTICATION ROUTES
================================================================================
OAuth2 integration for:
- Zerodha (KiteConnect)
- Angel One (SmartAPI)
- Upstox (v2 API)

Each broker has:
1. /auth/initiate - Start OAuth flow, returns auth URL
2. /auth/callback - Handle OAuth callback, store credentials
3. Credentials are encrypted before storage
================================================================================
"""

import os
import json
import hmac
import hashlib
import secrets
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, Any
from urllib.parse import urlencode, parse_qs, urlparse

from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from ..core.config import settings
from ..core.database import supabase_admin
from ..core.security import get_current_user
from ..services.broker_credentials import encrypt_credentials, decrypt_credentials

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/broker", tags=["broker"])

# ============================================================================
# CENTRALIZED CONFIG (from core.config.Settings)
# ============================================================================

ZERODHA_API_KEY = settings.ZERODHA_API_KEY
ZERODHA_API_SECRET = settings.ZERODHA_API_SECRET
ZERODHA_REDIRECT_URI = settings.ZERODHA_REDIRECT_URI

ANGEL_API_KEY = settings.ANGEL_API_KEY
ANGEL_REDIRECT_URI = settings.ANGEL_REDIRECT_URI

UPSTOX_API_KEY = settings.UPSTOX_API_KEY
UPSTOX_API_SECRET = settings.UPSTOX_API_SECRET
UPSTOX_REDIRECT_URI = settings.UPSTOX_REDIRECT_URI

FRONTEND_URL = settings.FRONTEND_URL

# OAuth state store (in production, use Redis)
_oauth_states: Dict[str, Dict] = {}


# ============================================================================
# REQUEST/RESPONSE MODELS
# ============================================================================

class BrokerAuthInitiate(BaseModel):
    broker: str  # zerodha, angelone, upstox


class BrokerAuthCallback(BaseModel):
    code: str
    state: str


class BrokerStatus(BaseModel):
    connected: bool
    broker_name: Optional[str] = None
    last_synced: Optional[str] = None
    account_id: Optional[str] = None


class BrokerCredentialsUpdate(BaseModel):
    api_key: Optional[str] = None
    api_secret: Optional[str] = None
    client_id: Optional[str] = None
    password: Optional[str] = None
    totp_secret: Optional[str] = None


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def generate_state(user_id: str, broker: str) -> str:
    """Generate secure state token for OAuth"""
    state = secrets.token_urlsafe(32)
    _oauth_states[state] = {
        'user_id': user_id,
        'broker': broker,
        'created_at': datetime.utcnow().isoformat(),
        'expires_at': (datetime.utcnow() + timedelta(minutes=10)).isoformat()
    }
    return state


def verify_state(state: str) -> Optional[Dict]:
    """Verify and consume OAuth state"""
    if state not in _oauth_states:
        return None
    
    state_data = _oauth_states.pop(state)
    
    # Check expiry
    expires_at = datetime.fromisoformat(state_data['expires_at'])
    if datetime.utcnow() > expires_at:
        return None
    
    return state_data


# ============================================================================
# COMMON ENDPOINTS
# ============================================================================

@router.get("/status")
async def get_broker_status(user: Any = Depends(get_current_user)) -> BrokerStatus:
    """
    Get current broker connection status for user.
    """
    try:
        result = supabase_admin.table("broker_connections").select(
            "broker_name, status, last_synced_at, account_id"
        ).eq("user_id", user.id).eq("status", "connected").single().execute()
        
        if result.data:
            return BrokerStatus(
                connected=True,
                broker_name=result.data['broker_name'],
                last_synced=result.data.get('last_synced_at'),
                account_id=result.data.get('account_id')
            )
        
        return BrokerStatus(connected=False)
        
    except Exception as e:
        logger.error(f"Error getting broker status: {e}")
        return BrokerStatus(connected=False)


@router.post("/disconnect")
async def disconnect_broker(user: Any = Depends(get_current_user)):
    """
    Disconnect broker and clear credentials.
    """
    try:
        # Update connection status
        supabase_admin.table("broker_connections").update({
            "status": "disconnected",
            "access_token": None,
            "refresh_token": None,
            "disconnected_at": datetime.utcnow().isoformat()
        }).eq("user_id", user.id).eq("status", "connected").execute()
        
        # Update user profile
        supabase_admin.table("user_profiles").update({
            "broker_connected": False,
            "broker_name": None
        }).eq("id", user.id).execute()
        
        return {"success": True, "message": "Broker disconnected"}
        
    except Exception as e:
        logger.error(f"Error disconnecting broker: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect broker")


# ============================================================================
# ZERODHA (KITE CONNECT)
# ============================================================================

@router.post("/zerodha/auth/initiate")
async def zerodha_auth_initiate(user: Any = Depends(get_current_user)):
    """
    Initiate Zerodha OAuth flow.
    Returns the Kite Connect login URL.
    """
    if not ZERODHA_API_KEY:
        raise HTTPException(status_code=400, detail="Zerodha API key not configured")
    
    state = generate_state(user.id, "zerodha")
    
    # Kite Connect login URL
    auth_url = f"https://kite.zerodha.com/connect/login?v=3&api_key={ZERODHA_API_KEY}"
    
    return {
        "auth_url": auth_url,
        "state": state,
        "instructions": "Complete login on Zerodha, then call the callback endpoint with the request_token"
    }


@router.post("/zerodha/auth/callback")
async def zerodha_auth_callback(
    request_token: str = Query(...),
    state: str = Query(...),
    user: Any = Depends(get_current_user)
):
    """
    Handle Zerodha OAuth callback.
    Exchange request_token for access_token.
    """
    # Verify state
    state_data = verify_state(state)
    if not state_data or state_data['user_id'] != user.id:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    if not ZERODHA_API_KEY or not ZERODHA_API_SECRET:
        raise HTTPException(status_code=400, detail="Zerodha API credentials not configured")
    
    try:
        # Generate checksum
        checksum = hashlib.sha256(
            f"{ZERODHA_API_KEY}{request_token}{ZERODHA_API_SECRET}".encode()
        ).hexdigest()
        
        # Exchange for access token
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.kite.trade/session/token",
                data={
                    "api_key": ZERODHA_API_KEY,
                    "request_token": request_token,
                    "checksum": checksum
                }
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to exchange token")
            
            data = response.json().get("data", {})
        
        access_token = data.get("access_token")
        user_id_broker = data.get("user_id")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token received")
        
        # Encrypt and store credentials
        encrypted_creds = encrypt_credentials({
            "api_key": ZERODHA_API_KEY,
            "access_token": access_token,
            "user_id": user_id_broker
        })
        
        # Upsert broker connection
        supabase_admin.table("broker_connections").upsert({
            "user_id": user.id,
            "broker_name": "zerodha",
            "status": "connected",
            "account_id": user_id_broker,
            "access_token": encrypted_creds,
            "connected_at": datetime.utcnow().isoformat(),
            "last_synced_at": datetime.utcnow().isoformat()
        }, on_conflict="user_id,broker_name").execute()
        
        # Update user profile
        supabase_admin.table("user_profiles").update({
            "broker_connected": True,
            "broker_name": "zerodha"
        }).eq("id", user.id).execute()
        
        return {"success": True, "broker": "zerodha", "account_id": user_id_broker}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Zerodha auth error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")


# ============================================================================
# ANGEL ONE (SMART API)
# ============================================================================

@router.post("/angelone/auth/initiate")
async def angelone_auth_initiate(user: Any = Depends(get_current_user)):
    """
    Initiate Angel One authentication.
    Angel One uses API key + client credentials (no OAuth redirect).
    Returns instructions for credential entry.
    """
    state = generate_state(user.id, "angelone")
    
    return {
        "auth_type": "credentials",
        "state": state,
        "required_fields": [
            {"field": "client_id", "label": "Client ID", "type": "text"},
            {"field": "password", "label": "PIN/Password", "type": "password"},
            {"field": "totp_secret", "label": "TOTP Secret (from SmartAPI)", "type": "password"}
        ],
        "instructions": "Enter your Angel One SmartAPI credentials. Get API key and TOTP secret from smartapi.angelbroking.com"
    }


@router.post("/angelone/auth/credentials")
async def angelone_auth_credentials(
    credentials: BrokerCredentialsUpdate,
    state: str = Query(...),
    user: Any = Depends(get_current_user)
):
    """
    Authenticate with Angel One using credentials.
    """
    # Verify state
    state_data = verify_state(state)
    if not state_data or state_data['user_id'] != user.id:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    if not credentials.client_id or not credentials.password or not credentials.totp_secret:
        raise HTTPException(status_code=400, detail="Missing required credentials")
    
    try:
        # Attempt login with SmartAPI
        import pyotp
        
        totp = pyotp.TOTP(credentials.totp_secret).now()
        
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword",
                json={
                    "clientcode": credentials.client_id,
                    "password": credentials.password,
                    "totp": totp
                },
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "X-UserType": "USER",
                    "X-SourceID": "WEB",
                    "X-ClientLocalIP": "0.0.0.0",
                    "X-ClientPublicIP": "0.0.0.0",
                    "X-MACAddress": "00:00:00:00:00:00",
                    "X-PrivateKey": ANGEL_API_KEY
                }
            )
            
            data = response.json()
        
        if not data.get("status"):
            raise HTTPException(status_code=400, detail=data.get("message", "Login failed"))
        
        jwt_token = data.get("data", {}).get("jwtToken")
        refresh_token = data.get("data", {}).get("refreshToken")
        
        # Encrypt and store credentials
        encrypted_creds = encrypt_credentials({
            "api_key": ANGEL_API_KEY,
            "client_id": credentials.client_id,
            "password": credentials.password,
            "totp_secret": credentials.totp_secret,
            "jwt_token": jwt_token,
            "refresh_token": refresh_token
        })
        
        # Upsert broker connection
        supabase_admin.table("broker_connections").upsert({
            "user_id": user.id,
            "broker_name": "angelone",
            "status": "connected",
            "account_id": credentials.client_id,
            "access_token": encrypted_creds,
            "connected_at": datetime.utcnow().isoformat(),
            "last_synced_at": datetime.utcnow().isoformat()
        }, on_conflict="user_id,broker_name").execute()
        
        # Update user profile
        supabase_admin.table("user_profiles").update({
            "broker_connected": True,
            "broker_name": "angelone"
        }).eq("id", user.id).execute()
        
        return {"success": True, "broker": "angelone", "account_id": credentials.client_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Angel One auth error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")


# ============================================================================
# UPSTOX (V2 API)
# ============================================================================

@router.post("/upstox/auth/initiate")
async def upstox_auth_initiate(user: Any = Depends(get_current_user)):
    """
    Initiate Upstox OAuth2 flow.
    Returns the Upstox authorization URL.
    """
    if not UPSTOX_API_KEY:
        raise HTTPException(status_code=400, detail="Upstox API key not configured")
    
    state = generate_state(user.id, "upstox")
    
    # Upstox OAuth2 URL
    params = {
        "client_id": UPSTOX_API_KEY,
        "redirect_uri": UPSTOX_REDIRECT_URI or f"{FRONTEND_URL}/broker/upstox/callback",
        "response_type": "code",
        "state": state
    }
    
    auth_url = f"https://api.upstox.com/v2/login/authorization/dialog?{urlencode(params)}"
    
    return {
        "auth_url": auth_url,
        "state": state
    }


@router.post("/upstox/auth/callback")
async def upstox_auth_callback(
    code: str = Query(...),
    state: str = Query(...),
    user: Any = Depends(get_current_user)
):
    """
    Handle Upstox OAuth2 callback.
    Exchange code for access token.
    """
    # Verify state
    state_data = verify_state(state)
    if not state_data or state_data['user_id'] != user.id:
        raise HTTPException(status_code=400, detail="Invalid or expired state")
    
    if not UPSTOX_API_KEY or not UPSTOX_API_SECRET:
        raise HTTPException(status_code=400, detail="Upstox API credentials not configured")
    
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.upstox.com/v2/login/authorization/token",
                data={
                    "code": code,
                    "client_id": UPSTOX_API_KEY,
                    "client_secret": UPSTOX_API_SECRET,
                    "redirect_uri": UPSTOX_REDIRECT_URI or f"{FRONTEND_URL}/broker/upstox/callback",
                    "grant_type": "authorization_code"
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail="Failed to exchange token")
            
            data = response.json()
        
        access_token = data.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="No access token received")
        
        # Get user profile from Upstox
        async with httpx.AsyncClient() as client:
            profile_response = await client.get(
                "https://api.upstox.com/v2/user/profile",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            profile_data = profile_response.json().get("data", {})
        
        user_id_broker = profile_data.get("user_id", "")
        
        # Encrypt and store credentials
        encrypted_creds = encrypt_credentials({
            "api_key": UPSTOX_API_KEY,
            "api_secret": UPSTOX_API_SECRET,
            "access_token": access_token,
            "user_id": user_id_broker
        })
        
        # Upsert broker connection
        supabase_admin.table("broker_connections").upsert({
            "user_id": user.id,
            "broker_name": "upstox",
            "status": "connected",
            "account_id": user_id_broker,
            "access_token": encrypted_creds,
            "connected_at": datetime.utcnow().isoformat(),
            "last_synced_at": datetime.utcnow().isoformat()
        }, on_conflict="user_id,broker_name").execute()
        
        # Update user profile
        supabase_admin.table("user_profiles").update({
            "broker_connected": True,
            "broker_name": "upstox"
        }).eq("id", user.id).execute()
        
        return {"success": True, "broker": "upstox", "account_id": user_id_broker}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upstox auth error: {e}")
        raise HTTPException(status_code=500, detail="Authentication failed")


# ============================================================================
# BROKER DATA ENDPOINTS
# ============================================================================

@router.get("/positions")
async def get_broker_positions(user: Any = Depends(get_current_user)):
    """
    Get positions from connected broker.
    """
    try:
        # Get broker connection
        conn = supabase_admin.table("broker_connections").select(
            "broker_name, access_token"
        ).eq("user_id", user.id).eq("status", "connected").single().execute()
        
        if not conn.data:
            raise HTTPException(status_code=400, detail="No broker connected")
        
        broker_name = conn.data['broker_name']
        credentials = decrypt_credentials(conn.data['access_token'])
        
        # Import broker integration
        from ..services.broker_integration import BrokerFactory
        
        broker = BrokerFactory.create(broker_name, credentials)
        if not broker.login():
            raise HTTPException(status_code=400, detail="Failed to login to broker")
        
        positions = broker.get_positions()
        
        return {
            "positions": [{
                "symbol": p.symbol,
                "exchange": p.exchange,
                "quantity": p.quantity,
                "average_price": p.average_price,
                "current_price": p.current_price,
                "pnl": p.pnl,
                "pnl_percent": p.pnl_percent
            } for p in positions]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching positions: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch positions")


@router.get("/holdings")
async def get_broker_holdings(user: Any = Depends(get_current_user)):
    """
    Get holdings from connected broker.
    """
    try:
        conn = supabase_admin.table("broker_connections").select(
            "broker_name, access_token"
        ).eq("user_id", user.id).eq("status", "connected").single().execute()
        
        if not conn.data:
            raise HTTPException(status_code=400, detail="No broker connected")
        
        broker_name = conn.data['broker_name']
        credentials = decrypt_credentials(conn.data['access_token'])
        
        from ..services.broker_integration import BrokerFactory
        
        broker = BrokerFactory.create(broker_name, credentials)
        if not broker.login():
            raise HTTPException(status_code=400, detail="Failed to login to broker")
        
        holdings = broker.get_holdings()
        
        return {"holdings": holdings}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching holdings: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch holdings")


@router.get("/margin")
async def get_broker_margin(user: Any = Depends(get_current_user)):
    """
    Get available margin from connected broker.
    """
    try:
        conn = supabase_admin.table("broker_connections").select(
            "broker_name, access_token"
        ).eq("user_id", user.id).eq("status", "connected").single().execute()
        
        if not conn.data:
            raise HTTPException(status_code=400, detail="No broker connected")
        
        broker_name = conn.data['broker_name']
        credentials = decrypt_credentials(conn.data['access_token'])
        
        from ..services.broker_integration import BrokerFactory
        
        broker = BrokerFactory.create(broker_name, credentials)
        if not broker.login():
            raise HTTPException(status_code=400, detail="Failed to login to broker")
        
        available_margin = broker.get_available_margin()
        
        return {
            "available_margin": available_margin,
            "used_margin": 0  # Would need additional API call
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching margin: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch margin")
