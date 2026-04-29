"""
TickPulseService — F1 intraday signal pipeline.

Strict ML-only per the no-fallback rule: the service publishes intraday
signals **only when a trained 5-min model is loaded**. No heuristic
stand-in. If the model is missing, the scan method returns 0 and logs
a clear reason — the scheduler keeps running but produces no rows.

Runtime contract:
    scan_and_publish() →
        * loads the production intraday model via the registry
        * refuses to run if the model is not available
        * otherwise, runs inference per symbol and writes rows with
          ``signal_type='intraday'`` + short expiry

Training for the 5-min model lives in ``src/backend/ai/intraday/``
(stub today — filled in by the unified training pipeline). The service
calls that module's ``predict(symbol, bars)`` when available.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))

# Top-5 by average daily turnover. Narrow universe stays appropriate
# even for the trained model — deep-liquidity names first.
TICKPULSE_UNIVERSE: List[str] = [
    "RELIANCE", "HDFCBANK", "ICICIBANK", "INFY", "TCS",
]

# Session hours in IST. First 15-min + last 15-min skipped to dodge
# open/close volatility where even trained intraday models misfire most.
SESSION_START = (9, 30)    # 09:30 IST
SESSION_END   = (15, 10)   # 15:10 IST


def _within_session(now_ist: Optional[datetime] = None) -> bool:
    now = now_ist or datetime.now(IST)
    if now.weekday() >= 5:   # Sat/Sun
        return False
    start = now.replace(hour=SESSION_START[0], minute=SESSION_START[1], second=0, microsecond=0)
    end   = now.replace(hour=SESSION_END[0],   minute=SESSION_END[1],   second=0, microsecond=0)
    return start <= now <= end


# ------------------------------------------------------------------ model


def _load_intraday_model() -> Optional[Any]:
    """Load the trained 5-min intraday model from the registry.
    Returns the loaded object (with a ``.predict(symbol, bars)`` method)
    or None when no weights are available."""
    try:
        from ..ai.intraday import load_model   # type: ignore
    except Exception as exc:
        logger.debug("tickpulse: intraday module not importable: %s", exc)
        return None
    try:
        return load_model()
    except Exception as exc:
        logger.debug("tickpulse: load_model failed: %s", exc)
        return None


# ------------------------------------------------------------------ service


class TickPulseService:
    """ML-only intraday scanner. Does nothing unless the trained model
    is loaded and live."""

    def __init__(self, supabase_admin, market_data_provider=None):
        self.supabase = supabase_admin
        self._provider = market_data_provider

    def _get_provider(self):
        if self._provider is not None:
            return self._provider
        from .market_data import get_market_data_provider
        return get_market_data_provider()

    def _current_regime(self) -> Optional[str]:
        try:
            rows = (
                self.supabase.table("regime_history")
                .select("regime")
                .order("as_of", desc=True)
                .limit(1)
                .execute()
            )
            if rows.data:
                return rows.data[0].get("regime")
        except Exception:
            pass
        return None

    def _already_fired(self, symbol: str, bucket_start: datetime) -> bool:
        """Idempotency guard — one intraday row per symbol per 5-min bucket."""
        try:
            end = bucket_start + timedelta(minutes=5)
            rows = (
                self.supabase.table("signals")
                .select("id")
                .eq("symbol", symbol)
                .eq("signal_type", "intraday")
                .gte("created_at", bucket_start.astimezone(timezone.utc).isoformat())
                .lt("created_at", end.astimezone(timezone.utc).isoformat())
                .limit(1)
                .execute()
            )
            return bool(rows.data)
        except Exception:
            return False

    async def scan_and_publish(self) -> int:
        """Scan once, publish fresh intraday signals from the trained
        model. Returns count written. Returns 0 (no-op, no error) if
        the model is not yet available."""
        now_ist = datetime.now(IST)
        if not _within_session(now_ist):
            logger.debug("tickpulse: outside session, skipping")
            return 0

        # Hard gate: refuse to scan without a real trained model.
        model = _load_intraday_model()
        if model is None:
            logger.info(
                "tickpulse: intraday model not loaded — skipping scan "
                "(feature awaiting unified training run)"
            )
            return 0

        # RegimeIQ gate — no intraday in bear regime.
        regime = self._current_regime()
        if regime == "bear":
            logger.info("tickpulse: bear regime — skipping intraday scan")
            return 0

        provider = self._get_provider()
        bucket_start = now_ist.replace(
            minute=(now_ist.minute // 5) * 5, second=0, microsecond=0,
        )

        written = 0
        for symbol in TICKPULSE_UNIVERSE:
            try:
                if self._already_fired(symbol, bucket_start):
                    continue

                bars = await asyncio.to_thread(
                    provider.get_historical, symbol, "5d", "5m",
                )
                if bars is None or len(bars) < 22:
                    continue
                bars = bars.copy()
                bars.columns = [c.lower() for c in bars.columns]

                # Trained model decides. Expected contract:
                #   model.predict(symbol, bars) -> dict with keys
                #   {direction, entry_price, stop_loss, target, confidence}
                #   or None when the model declines to fire.
                try:
                    decision = await asyncio.to_thread(model.predict, symbol, bars)
                except Exception as exc:
                    logger.warning("tickpulse model.predict %s failed: %s", symbol, exc)
                    continue
                if not decision:
                    continue

                payload = self._to_signal_row(symbol, decision, regime)
                self.supabase.table("signals").insert(payload).execute()
                written += 1
                logger.info(
                    "tickpulse: %s %s @ %.2f conf=%.1f",
                    symbol, decision.get("direction"),
                    float(decision.get("entry_price", 0)),
                    float(decision.get("confidence", 0)),
                )
            except Exception as exc:
                logger.warning("tickpulse scan %s failed: %s", symbol, exc)

        return written

    def _to_signal_row(
        self,
        symbol: str,
        d: Dict[str, Any],
        regime: Optional[str],
    ) -> Dict[str, Any]:
        created_at = datetime.utcnow()
        expires_at = created_at + timedelta(hours=1)
        entry = float(d.get("entry_price", 0))
        stop = float(d.get("stop_loss", 0))
        target = float(d.get("target", 0))
        risk = abs(entry - stop)
        reward = abs(target - entry)
        rr = round(reward / risk, 2) if risk > 0 else 0
        return {
            "symbol": symbol,
            "signal_type": "intraday",
            "direction": d.get("direction"),
            "entry_price": entry,
            "stop_loss":   stop,
            "target":      target,
            "confidence":  float(d.get("confidence", 0)),
            "risk_reward_ratio": rr,
            "strategy_names": ["tickpulse"],
            "regime_at_signal": regime,
            "status": "active",
            "exchange": "NSE",
            "segment": "EQUITY",
            "reasons": d.get("reasons") or [],
            "created_at": created_at.isoformat(),
            "expires_at": expires_at.isoformat(),
            "generated_at": created_at.isoformat(),
            "date": created_at.date().isoformat(),
        }


__all__ = ["TickPulseService", "TICKPULSE_UNIVERSE", "_within_session"]
