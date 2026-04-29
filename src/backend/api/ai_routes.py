"""
================================================================================
AI AGENT ROUTES — Copilot / FinRobot / TradingAgents (PR 8)
================================================================================
All three graphs live in ``src/backend/ai/agents/``. This router is the
HTTP boundary that:
  - authenticates the user (get_current_user)
  - meters credits against the existing AssistantCreditLimiter (Copilot)
  - kicks off the graph run
  - returns the structured output + agent trace for UI rendering.

Endpoints:
  POST /api/ai/copilot/chat       — N1 context-aware chat
  POST /api/ai/finrobot/analyze   — F5/F7 portfolio-doctor 4-agent CoT
  POST /api/ai/debate/signal/{id} — B1 Bull/Bear 7-agent debate (Elite)
================================================================================
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core.database import get_supabase_admin
from ..core.security import get_current_user
from ..core.tiers import Tier, UserTier
from ..middleware.tier_gate import RequireFeature, RequireTier, copilot_daily_cap
from ..ai.agents import (
    run_copilot,
    run_finrobot_doctor,
    run_trading_debate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


# ============================================================================
# COPILOT — N1 chat (every platform page)
# ============================================================================


class CopilotChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    route: Optional[str] = Field(None, description="Current frontend route for context")
    history: Optional[List[Dict[str, str]]] = Field(
        default=None,
        description="Prior turns [{role: 'user'|'assistant', content: '...'}]",
    )
    mentioned_symbols: Optional[List[str]] = Field(
        default=None,
        description="Symbols the user @-mentioned in the composer",
    )


class CopilotChatResponse(BaseModel):
    reply: str
    refused: bool
    intent: Optional[str] = None
    tools_used: List[str] = Field(default_factory=list)
    trace: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/copilot/chat", response_model=CopilotChatResponse)
async def copilot_chat(
    body: CopilotChatRequest,
    user_tier: UserTier = Depends(RequireFeature("copilot_chat")),
) -> CopilotChatResponse:
    """One-turn AI Copilot chat.

    Tier gate + daily credit cap:
        Free  = 5 messages / day
        Pro   = 150
        Elite = 10k (effectively unlimited — cap exists for abuse protection)

    Admins bypass the credit cap. Returns HTTP 402 with structured payload
    when the cap is hit so the frontend can show an upgrade CTA.
    """
    # Credit-cap check via the existing AssistantCreditLimiter (in-memory
    # + Supabase-synced). Feature-gated above by RequireFeature.
    from ..services.assistant.credit_limiter import AssistantCreditLimiter

    cap = copilot_daily_cap(user_tier.tier)
    try:
        limiter = AssistantCreditLimiter(get_supabase_admin())
        usage = limiter.consume(
            user_id=user_tier.user_id,
            tier=user_tier.tier.value,
            credits_limit_override=cap,
        ) if hasattr(AssistantCreditLimiter, "consume") else None
    except Exception as exc:
        logger.debug("credit consume skipped (%s) — proceeding", exc)
        usage = None

    if usage is not None and getattr(usage, "credits_remaining", cap) < 0 and not user_tier.is_admin:
        raise HTTPException(
            status_code=402,
            detail={
                "error": "credit_cap",
                "current_tier": user_tier.tier.value,
                "credits_limit": cap,
                "upgrade_url": "/pricing",
            },
        )

    try:
        result = await run_copilot(
            user_id=user_tier.user_id,
            message=body.message,
            route=body.route or "",
            history=body.history or [],
            mentioned_symbols=body.mentioned_symbols or [],
        )
    except Exception as e:
        logger.error("Copilot run failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Copilot failed")

    # PR 16 — product analytics event.
    try:
        from ..observability import EventName, track
        track(EventName.COPILOT_MESSAGE_SENT, user_tier.user_id, {
            "tier": user_tier.tier.value,
            "intent": result.get("intent"),
            "tools_used": result.get("tools_used") or [],
            "refused": result.get("refused", False),
            "route": body.route or "",
        })
    except Exception:
        pass

    return CopilotChatResponse(**result)


# ============================================================================
# FINROBOT — F5/F7 Portfolio Doctor / AI SIP per-stock analysis
# ============================================================================


class FinRobotAnalyzeRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=32)
    fundamentals: Optional[Dict[str, Any]] = None
    concall_transcript: Optional[str] = None
    management_headlines: Optional[List[str]] = None
    promoter_holding: Optional[Dict[str, Any]] = None
    peers: Optional[List[Dict[str, Any]]] = None


class FinRobotAnalyzeResponse(BaseModel):
    symbol: str
    narrative: str
    action: str  # add | hold | trim | exit
    composite_score: int
    agents: Dict[str, Any]
    trace: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/finrobot/analyze", response_model=FinRobotAnalyzeResponse)
async def finrobot_analyze(
    body: FinRobotAnalyzeRequest,
    user: UserTier = Depends(RequireTier(Tier.PRO)),
) -> FinRobotAnalyzeResponse:
    """Run the 4-agent CoT graph on one stock (F5 / F7 backend).

    Pro+ tier — single-stock analysis is part of Portfolio Doctor Pro.
    Unlimited reruns are Elite (enforced client-side via feature map;
    backend refusal would require a counter, deferred).

    Caller supplies fundamentals + management data when available;
    missing fields produce neutral outputs rather than failing. The
    full data-fetching pipeline lands in PR 9-11.
    """
    try:
        result = await run_finrobot_doctor(
            user_id=user.user_id,
            symbol=body.symbol.upper(),
            fundamentals=body.fundamentals,
            concall_transcript=body.concall_transcript,
            management_headlines=body.management_headlines,
            promoter_holding=body.promoter_holding,
            peers=body.peers,
        )
    except Exception as e:
        logger.error("FinRobot run failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="FinRobot analysis failed")

    # PR 16 — analytics event.
    try:
        from ..observability import EventName, track
        track(EventName.FINROBOT_ANALYSIS_COMPLETED, user.user_id, {
            "tier": user.tier.value,
            "symbol": body.symbol.upper(),
            "action": result.get("action"),
            "composite_score": result.get("composite_score"),
        })
    except Exception:
        pass

    return FinRobotAnalyzeResponse(**result)


# ============================================================================
# TRADINGAGENTS — B1 Bull/Bear debate (Elite, high-stakes signals)
# ============================================================================


class DebateRequest(BaseModel):
    fundamentals: Optional[Dict[str, Any]] = None
    stock_snapshot: Optional[Dict[str, Any]] = None
    news_headlines: Optional[List[str]] = None
    regime: Optional[Dict[str, Any]] = None
    vix: Optional[float] = None


class DebateResponse(BaseModel):
    signal_id: Optional[str] = None
    symbol: Optional[str] = None
    decision: str  # enter | skip | half_size | wait
    confidence: int
    summary: str
    transcript: Dict[str, Any]
    trace: List[Dict[str, Any]] = Field(default_factory=list)


@router.post("/debate/signal/{signal_id}", response_model=DebateResponse)
async def trading_debate(
    signal_id: str,
    body: DebateRequest,
    user: UserTier = Depends(RequireFeature("debate")),
) -> DebateResponse:
    """Run the 7-agent Bull/Bear debate on one signal.

    Elite-tier only per Step 1 §E5. Gated via ``RequireFeature("debate")``
    → returns HTTP 402 with structured payload for non-Elite callers.
    Admins bypass the gate.
    """
    # Fetch the signal row so analysts see the real trade parameters.
    client = get_supabase_admin()
    rows = client.table("signals").select("*").eq("id", signal_id).limit(1).execute()
    signal = (rows.data or [None])[0]
    if signal is None:
        raise HTTPException(status_code=404, detail=f"signal {signal_id} not found")

    try:
        result = await run_trading_debate(
            user_id=user.user_id,
            signal=signal,
            fundamentals=body.fundamentals,
            stock_snapshot=body.stock_snapshot,
            news_headlines=body.news_headlines,
            regime=body.regime,
            vix=body.vix,
        )
    except Exception as e:
        logger.error("TradingAgents debate failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Debate run failed")

    # Persist the debate into the PR 2 signal_debates table.
    try:
        import json as _json

        transcript = result.get("transcript") or {}
        client.table("signal_debates").upsert({
            "signal_id": signal_id,
            "bull_case": _json.dumps(transcript.get("bull") or {}),
            "bear_case": _json.dumps(transcript.get("bear") or {}),
            "risk_assessment": _json.dumps(transcript.get("risk") or {}),
            "trader_verdict": _json.dumps({
                "decision": result.get("decision"),
                "confidence": result.get("confidence"),
                "summary": result.get("summary"),
            }),
        }, on_conflict="signal_id").execute()
    except Exception as persist_err:
        logger.debug("signal_debates persist failed: %s", persist_err)

    # PR 13: emit DEBATE_COMPLETED so the signal detail page can flip
    # the debate tab from "running" → "ready" without polling.
    try:
        from ..services.event_bus import MessageType, emit_event
        await emit_event(
            MessageType.DEBATE_COMPLETED,
            {
                "signal_id": signal_id,
                "symbol": result.get("symbol"),
                "decision": result.get("decision"),
                "confidence": result.get("confidence"),
                "summary": result.get("summary"),
            },
            user_id=user.user_id,
        )
    except Exception as emit_err:
        logger.debug("DEBATE_COMPLETED emit skipped: %s", emit_err)

    # PR 16 — analytics event.
    try:
        from ..observability import EventName, track
        track(EventName.DEBATE_COMPLETED, user.user_id, {
            "tier": user.tier.value,
            "signal_id": signal_id,
            "symbol": result.get("symbol"),
            "decision": result.get("decision"),
            "confidence": result.get("confidence"),
        })
    except Exception:
        pass

    return DebateResponse(**result)
