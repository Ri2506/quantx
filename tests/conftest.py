"""
Shared test fixtures and configuration.

Provides mock Supabase, Razorpay, and auth dependencies so API tests
run without external services.
"""

import sys
import os
from datetime import datetime, date
from typing import Any, Dict, List, Optional
from unittest.mock import MagicMock, AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

# Ensure project root is on sys.path so ml/ and src/ imports work
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ---------------------------------------------------------------------------
# Set minimal env vars BEFORE importing the app (prevents startup crashes)
# ---------------------------------------------------------------------------
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_KEY", "test-service-key")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-default")
os.environ.setdefault("RAZORPAY_KEY_ID", "rzp_test_key")
os.environ.setdefault("RAZORPAY_KEY_SECRET", "rzp_test_secret")
os.environ.setdefault("APP_ENV", "development")
os.environ.setdefault("BROKER_ENCRYPTION_KEY", "")
os.environ.setdefault("GEMINI_API_KEY", "")
os.environ.setdefault("ENABLE_REDIS", "False")
os.environ.setdefault("ENABLE_BROKER_TICKER", "False")


# ---------------------------------------------------------------------------
# FAKE USER / PROFILE
# ---------------------------------------------------------------------------

FAKE_USER_ID = "00000000-0000-0000-0000-000000000001"
FAKE_USER_EMAIL = "test@quantx.app"

FAKE_USER = MagicMock()
FAKE_USER.id = FAKE_USER_ID
FAKE_USER.email = FAKE_USER_EMAIL

FAKE_PROFILE = {
    "id": FAKE_USER_ID,
    "email": FAKE_USER_EMAIL,
    "full_name": "Test User",
    "capital": 100000,
    "risk_profile": "moderate",
    "trading_mode": "signal_only",
    "max_positions": 5,
    "risk_per_trade": 2,
    "fo_enabled": False,
    "subscription_status": "active",
    "subscription_plan_id": "plan_pro",
    "broker_connected": False,
    "total_trades": 10,
    "winning_trades": 6,
    "total_pnl": 5000,
    "created_at": "2026-01-01T00:00:00Z",
    "subscription_plans": {
        "id": "plan_pro",
        "name": "Pro",
        "tier": "pro",
    },
}


# ---------------------------------------------------------------------------
# MOCK SUPABASE QUERY BUILDER
# ---------------------------------------------------------------------------

class MockQueryBuilder:
    """Chainable mock that mimics Supabase's query builder."""

    def __init__(self, data=None):
        self._data = data if data is not None else []

    def select(self, *a, **kw):
        return self

    def insert(self, *a, **kw):
        return self

    def update(self, *a, **kw):
        return self

    def upsert(self, *a, **kw):
        return self

    def delete(self, *a, **kw):
        return self

    def eq(self, *a, **kw):
        return self

    def neq(self, *a, **kw):
        return self

    def gt(self, *a, **kw):
        return self

    def gte(self, *a, **kw):
        return self

    def lt(self, *a, **kw):
        return self

    def lte(self, *a, **kw):
        return self

    def in_(self, *a, **kw):
        return self

    def order(self, *a, **kw):
        return self

    def limit(self, *a, **kw):
        return self

    def single(self):
        return self

    def execute(self):
        result = MagicMock()
        if isinstance(self._data, dict):
            result.data = self._data
        elif isinstance(self._data, list):
            result.data = self._data
        else:
            result.data = self._data
        return result


class MockSupabase:
    """Minimal Supabase client mock."""

    def __init__(self, table_data: Optional[Dict[str, Any]] = None):
        self._table_data = table_data or {}
        self.auth = MagicMock()

    def table(self, name: str) -> MockQueryBuilder:
        data = self._table_data.get(name, [])
        return MockQueryBuilder(data)


# ---------------------------------------------------------------------------
# FIXTURES
# ---------------------------------------------------------------------------

@pytest.fixture
def mock_supabase():
    """Returns a MockSupabase that can be configured per-test."""
    return MockSupabase()


@pytest.fixture
def app_with_mocks(mock_supabase):
    """Import the FastAPI app with auth + Supabase mocked out."""
    from src.backend.api.app import app, get_current_user, get_user_profile

    # Override auth dependencies
    async def fake_get_current_user():
        return FAKE_USER

    async def fake_get_user_profile():
        return FAKE_PROFILE

    app.dependency_overrides[get_current_user] = fake_get_current_user
    app.dependency_overrides[get_user_profile] = fake_get_user_profile

    yield app

    # Cleanup
    app.dependency_overrides.clear()


@pytest.fixture
def client(app_with_mocks):
    """TestClient with auth mocked — all protected routes accessible."""
    return TestClient(app_with_mocks, raise_server_exceptions=False)


@pytest.fixture
def anon_client():
    """TestClient WITHOUT auth overrides — for testing public/unauth routes."""
    from src.backend.api.app import app
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def fake_signals():
    """Sample signal data for testing."""
    today = date.today().isoformat()
    return [
        {
            "id": "sig-001",
            "symbol": "RELIANCE",
            "exchange": "NSE",
            "segment": "EQUITY",
            "direction": "LONG",
            "entry_price": 2450.0,
            "stop_loss": 2400.0,
            "target": 2550.0,
            "confidence": 85,
            "status": "active",
            "is_premium": False,
            "date": today,
            "created_at": datetime.utcnow().isoformat(),
        },
        {
            "id": "sig-002",
            "symbol": "TCS",
            "exchange": "NSE",
            "segment": "EQUITY",
            "direction": "SHORT",
            "entry_price": 3600.0,
            "stop_loss": 3650.0,
            "target": 3500.0,
            "confidence": 72,
            "status": "active",
            "is_premium": True,
            "date": today,
            "created_at": datetime.utcnow().isoformat(),
        },
    ]


@pytest.fixture
def fake_trades():
    """Sample trade data for testing."""
    return [
        {
            "id": "trade-001",
            "user_id": FAKE_USER_ID,
            "signal_id": "sig-001",
            "symbol": "RELIANCE",
            "segment": "EQUITY",
            "direction": "LONG",
            "entry_price": 2450.0,
            "exit_price": 2530.0,
            "quantity": 10,
            "net_pnl": 800.0,
            "status": "closed",
            "created_at": datetime.utcnow().isoformat(),
        },
    ]
