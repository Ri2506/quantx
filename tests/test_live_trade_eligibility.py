"""
PR 156 — unit tests for live_trade_eligibility (the v1 live-execution
gate). This module gates every real-money order leaving the platform —
a regression here is unsafe to ship.

We mock the Supabase client + the kill-switch module so the gate logic
is exercised in isolation. Each test hits one rejection path so a
regression points at the failing rule directly.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest


def _mk_supabase(broker_status: str = "connected", profile_paused: bool = False):
    """Mock supabase.table().select().eq()...execute() chain."""
    sb = MagicMock()

    def table(name: str):
        t = MagicMock()
        if name == "user_profiles":
            payload = {
                "live_trading_paused": profile_paused,
                "live_trading_paused_until": None,
            }
            t.select.return_value.eq.return_value.limit.return_value.execute.return_value = (
                SimpleNamespace(data=[payload])
            )
        elif name == "broker_connections":
            payload = [{"broker_name": "zerodha", "status": broker_status}] if broker_status else []
            t.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = (
                SimpleNamespace(data=payload)
            )
        return t

    sb.table.side_effect = table
    return sb


@pytest.fixture(autouse=True)
def _mock_tier(monkeypatch):
    """Default to elite-tier user; individual tests override."""
    from src.backend.core import tiers

    fake = SimpleNamespace(tier=tiers.Tier.ELITE)
    monkeypatch.setattr(
        "src.backend.services.live_trade_eligibility.resolve_user_tier",
        lambda _uid: fake,
    )


def test_global_kill_switch_blocks_first():
    """When ops flips the global halt, every other check is skipped."""
    from src.backend.services import live_trade_eligibility as mod

    with patch.object(mod, "is_globally_halted", return_value=True), \
         patch.object(mod, "global_halt_reason", return_value="ops halt"):
        e = mod.check_live_trade_eligibility(user_id="u1", supabase=_mk_supabase())
    assert not e.eligible
    assert e.code == "global_kill_switch"
    assert "ops" in (e.reason or "")


def test_missing_user_id_rejected():
    from src.backend.services import live_trade_eligibility as mod
    with patch.object(mod, "is_globally_halted", return_value=False):
        e = mod.check_live_trade_eligibility(user_id=None, supabase=_mk_supabase())
    assert not e.eligible and e.code == "missing_user_id"


def test_tier_below_minimum_rejected(monkeypatch):
    from src.backend.core import tiers
    from src.backend.services import live_trade_eligibility as mod
    monkeypatch.setattr(
        "src.backend.services.live_trade_eligibility.resolve_user_tier",
        lambda _uid: SimpleNamespace(tier=tiers.Tier.PRO),
    )
    with patch.object(mod, "is_globally_halted", return_value=False):
        e = mod.check_live_trade_eligibility(user_id="u1", supabase=_mk_supabase())
    assert not e.eligible and e.code == "tier_too_low"


def test_user_kill_switch_rejected():
    from src.backend.services import live_trade_eligibility as mod
    with patch.object(mod, "is_globally_halted", return_value=False):
        e = mod.check_live_trade_eligibility(
            user_id="u1", supabase=_mk_supabase(profile_paused=True),
        )
    assert not e.eligible and e.code == "user_kill_switch"


def test_no_broker_rejected():
    from src.backend.services import live_trade_eligibility as mod
    with patch.object(mod, "is_globally_halted", return_value=False):
        e = mod.check_live_trade_eligibility(
            user_id="u1", supabase=_mk_supabase(broker_status=""),
        )
    assert not e.eligible and e.code == "no_broker"


def test_disconnected_broker_rejected():
    from src.backend.services import live_trade_eligibility as mod
    with patch.object(mod, "is_globally_halted", return_value=False):
        e = mod.check_live_trade_eligibility(
            user_id="u1", supabase=_mk_supabase(broker_status="expired"),
        )
    assert not e.eligible and e.code == "broker_disconnected"


def test_happy_path_returns_eligible():
    from src.backend.services import live_trade_eligibility as mod
    with patch.object(mod, "is_globally_halted", return_value=False):
        e = mod.check_live_trade_eligibility(user_id="u1", supabase=_mk_supabase())
    assert e.eligible and e.code is None and bool(e) is True
