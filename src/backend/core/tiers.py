"""
Tier enum + feature matrix — source of truth for Free / Pro / Elite.

The tier itself is persisted on ``user_profiles.tier`` (added in PR 2).
This module answers two questions everyone needs to ask:

    1. Which tier does this user have?  (``resolve_user_tier``)
    2. Does this tier have access to <feature>?  (``FEATURE_MATRIX``)

FastAPI dependencies live in ``src/backend/middleware/tier_gate.py``
and consume everything defined here.
"""

from __future__ import annotations

import enum
import logging
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class Tier(str, enum.Enum):
    FREE = "free"
    PRO = "pro"
    ELITE = "elite"


# Ordered weakest → strongest. Used for ``rank(A) >= rank(B)`` gate checks.
TIER_ORDER: Dict[Tier, int] = {Tier.FREE: 0, Tier.PRO: 1, Tier.ELITE: 2}


def tier_rank(tier: Tier | str) -> int:
    t = Tier(tier) if not isinstance(tier, Tier) else tier
    return TIER_ORDER.get(t, 0)


def meets_tier(current: Tier | str, minimum: Tier | str) -> bool:
    return tier_rank(current) >= tier_rank(minimum)


# ============================================================================
# FEATURE MATRIX — maps feature key → minimum tier
# ============================================================================
# Source of truth: Step 1 §5 (master feature list) + §A–E tier table.
# Keep this in one place so the frontend, tier-gate middleware, and
# admin UI all read the same map.
# ============================================================================

FEATURE_MATRIX: Dict[str, Tier] = {
    # ── Acquisition / public / activation (FREE) ──────────────────────────
    "landing":                  Tier.FREE,
    "pricing":                  Tier.FREE,
    "public_regime":            Tier.FREE,
    "public_track_record":      Tier.FREE,
    "public_models":            Tier.FREE,
    "signup":                   Tier.FREE,
    "onboarding_quiz":          Tier.FREE,
    "paper_portfolio_seed":     Tier.FREE,
    "paper_trading":            Tier.FREE,    # F11 — conversion funnel, stays free
    "first_paper_trade":        Tier.FREE,
    "telegram_digest":          Tier.FREE,    # WhatsApp is Pro

    # ── Core engagement ───────────────────────────────────────────────────
    "dashboard_basic":          Tier.FREE,    # limited widgets
    "dashboard_full":           Tier.PRO,
    "signal_daily":             Tier.FREE,    # 1 signal/day
    "signal_unlimited":         Tier.PRO,     # F2
    "intraday_signals":         Tier.PRO,     # F1
    "momentum_weekly":          Tier.PRO,     # F3
    "regime_size_gating":       Tier.PRO,     # F8 (free sees banner only)
    "ai_dossier_basic":         Tier.FREE,    # N2 stock page basic
    "ai_dossier_full":          Tier.PRO,     # full model-output grid
    "scanner_lab":              Tier.PRO,     # C7 — screeners + patterns
    "copilot_chat":             Tier.FREE,    # 5 msgs/day (credit-metered)
    "copilot_pro":              Tier.PRO,     # 150 msgs/day
    "copilot_elite":            Tier.ELITE,   # unlimited
    "watchlist_basic":          Tier.FREE,    # 5 symbols
    "watchlist_unlimited":      Tier.PRO,
    "whatsapp_digest":          Tier.PRO,     # F12
    "alert_studio":             Tier.PRO,     # C12 full studio
    "finagent_vision":          Tier.PRO,     # B2 on signals (Elite on-demand)
    "finagent_vision_anywhere": Tier.ELITE,

    # ── Retention / Elite expansion ───────────────────────────────────────
    "weekly_review":            Tier.PRO,     # N10
    "sector_rotation":          Tier.PRO,     # F10
    "paper_league":             Tier.FREE,    # N6
    "referrals":                Tier.FREE,    # N12

    # ── Elite-only flagships ──────────────────────────────────────────────
    "auto_trader":              Tier.ELITE,   # F4
    "ai_sip":                   Tier.ELITE,   # F5
    "fo_strategies":            Tier.ELITE,   # F6
    "portfolio_doctor_free":    Tier.FREE,    # one-off ₹199 product
    "portfolio_doctor_pro":     Tier.PRO,     # included
    "portfolio_doctor_unlim":   Tier.ELITE,   # unlimited re-runs
    "earnings_basic":           Tier.PRO,     # F9 basic predictions
    "earnings_strategy":        Tier.ELITE,   # F9 w/ pre-earnings strategy
    "debate":                   Tier.ELITE,   # B1 Bull/Bear
    "marketplace_browse":       Tier.FREE,    # B3 browse
    "marketplace_deploy":       Tier.PRO,
    "marketplace_publish":      Tier.ELITE,

    # ── Trust / safety (all tiers) ────────────────────────────────────────
    "kill_switch":              Tier.FREE,
}


def required_tier(feature: str) -> Tier:
    """Look up the minimum tier for a feature key. Unknown keys default to Free."""
    return FEATURE_MATRIX.get(feature, Tier.FREE)


def feature_access_map(tier: Tier | str) -> Dict[str, bool]:
    """Return ``{feature_key: has_access}`` for the whole matrix.
    Useful for the frontend to render tier-gated UI up front."""
    t = Tier(tier) if not isinstance(tier, Tier) else tier
    return {key: tier_rank(t) >= tier_rank(v) for key, v in FEATURE_MATRIX.items()}


# ============================================================================
# USER TIER RESOLVER — one query per user per cache window
# ============================================================================


@dataclass
class UserTier:
    user_id: str
    tier: Tier
    is_admin: bool = False
    email: Optional[str] = None


_CACHE: Dict[str, tuple] = {}  # user_id → (UserTier, expires_ts)
_CACHE_LOCK = threading.Lock()
_CACHE_TTL_SECONDS = 60  # 1 minute — tier upgrades propagate within this


def resolve_user_tier(user_id: str, *, supabase_client=None) -> UserTier:
    """Fetch the user's tier + admin flag. In-memory 60s cache.

    On any failure defaults to ``Free`` — errs on the side of not
    leaking Elite features rather than of failing open.
    """
    now = time.time()

    with _CACHE_LOCK:
        cached = _CACHE.get(user_id)
        if cached and cached[1] > now:
            return cached[0]

    resolved = UserTier(user_id=user_id, tier=Tier.FREE, is_admin=False)
    if supabase_client is None:
        try:
            from ..core.database import get_supabase_admin
            supabase_client = get_supabase_admin()
        except Exception:
            supabase_client = None

    if supabase_client is not None:
        try:
            result = (
                supabase_client.table("user_profiles")
                .select("tier, is_admin, email")
                .eq("id", user_id)
                .limit(1)
                .execute()
            )
            rows = result.data or []
            if rows:
                row = rows[0]
                tier_str = str(row.get("tier") or "free").lower()
                try:
                    resolved.tier = Tier(tier_str)
                except ValueError:
                    resolved.tier = Tier.FREE
                resolved.is_admin = bool(row.get("is_admin", False))
                resolved.email = row.get("email")
        except Exception as exc:
            logger.debug("resolve_user_tier(%s) failed: %s", user_id, exc)

    with _CACHE_LOCK:
        _CACHE[user_id] = (resolved, now + _CACHE_TTL_SECONDS)
    return resolved


def invalidate_user_tier_cache(user_id: Optional[str] = None) -> None:
    """Drop cached tier for one user (on tier change webhook) or all users."""
    with _CACHE_LOCK:
        if user_id is None:
            _CACHE.clear()
        else:
            _CACHE.pop(user_id, None)


__all__ = [
    "FEATURE_MATRIX",
    "Tier",
    "UserTier",
    "feature_access_map",
    "invalidate_user_tier_cache",
    "meets_tier",
    "required_tier",
    "resolve_user_tier",
    "tier_rank",
]
