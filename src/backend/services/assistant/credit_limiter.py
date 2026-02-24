"""
Simple in-memory daily credits for assistant usage.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from threading import Lock
from typing import Dict, Optional, Tuple

from ...core.config import settings


@dataclass
class CreditUsage:
    tier: str
    credits_limit: int
    credits_used: int
    credits_remaining: int
    reset_at: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "tier": self.tier,
            "credits_limit": self.credits_limit,
            "credits_used": self.credits_used,
            "credits_remaining": self.credits_remaining,
            "reset_at": self.reset_at,
        }


class AssistantCreditLimiter:
    """
    Daily assistant credits by user id.
    Notes:
    - In-memory only (resets on process restart).
    - UTC day boundary.
    """

    def __init__(self):
        self._usage: Dict[str, Tuple[str, int]] = {}
        self._lock = Lock()

    @staticmethod
    def _utc_today_key() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    @staticmethod
    def _next_reset_iso() -> str:
        now = datetime.now(timezone.utc)
        next_day = (now + timedelta(days=1)).date()
        reset_at = datetime.combine(next_day, datetime.min.time(), tzinfo=timezone.utc)
        return reset_at.isoformat()

    @staticmethod
    def _resolve_tier(profile: Dict) -> str:
        subscription_status = str(profile.get("subscription_status", "free")).lower()
        plan = profile.get("subscription_plans") or {}
        plan_name = str(plan.get("name", "")).lower()
        if subscription_status in {"active", "trial"}:
            return "pro"
        if plan_name in {"starter", "pro"}:
            return "pro"
        return "free"

    @staticmethod
    def _limit_for_tier(tier: str) -> int:
        if tier == "pro":
            return max(settings.ASSISTANT_DAILY_CREDITS_PRO, 1)
        return max(settings.ASSISTANT_DAILY_CREDITS_FREE, 1)

    def _current_used(self, user_id: str, today_key: str) -> int:
        row = self._usage.get(user_id)
        if not row:
            return 0
        day_key, used = row
        if day_key != today_key:
            return 0
        return used

    def get_usage(self, user_id: str, profile: Dict) -> CreditUsage:
        today_key = self._utc_today_key()
        tier = self._resolve_tier(profile)
        limit = self._limit_for_tier(tier)
        with self._lock:
            used = self._current_used(user_id, today_key)
            remaining = max(limit - used, 0)
            return CreditUsage(
                tier=tier,
                credits_limit=limit,
                credits_used=used,
                credits_remaining=remaining,
                reset_at=self._next_reset_iso(),
            )

    def consume_if_available(self, user_id: str, profile: Dict, cost: int = 1) -> Tuple[bool, CreditUsage]:
        cost = max(cost, 1)
        today_key = self._utc_today_key()
        tier = self._resolve_tier(profile)
        limit = self._limit_for_tier(tier)

        with self._lock:
            used = self._current_used(user_id, today_key)
            if used + cost > limit:
                usage = CreditUsage(
                    tier=tier,
                    credits_limit=limit,
                    credits_used=used,
                    credits_remaining=max(limit - used, 0),
                    reset_at=self._next_reset_iso(),
                )
                return False, usage

            new_used = used + cost
            self._usage[user_id] = (today_key, new_used)
            usage = CreditUsage(
                tier=tier,
                credits_limit=limit,
                credits_used=new_used,
                credits_remaining=max(limit - new_used, 0),
                reset_at=self._next_reset_iso(),
            )
            return True, usage
