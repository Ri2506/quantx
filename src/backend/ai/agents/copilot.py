"""
AI Copilot graph (N1) — context-aware chat embedded on every platform page.

Graph shape (linear):

    Classifier → ToolPlanner → ToolCaller → Responder

- **Classifier** rejects out-of-scope prompts early (EarlyExit).
- **ToolPlanner** asks Gemini "which tool(s) does this user request need?"
  and emits a tiny JSON plan. No tools need calling is a valid plan.
- **ToolCaller** executes the plan against ``tool_registry`` and records
  each tool's output in scratch for the Responder.
- **Responder** synthesizes the final reply using current context +
  route + user + tool results.

Senior-analyst voice per Step 4 §1: numbers first, no fluff, cite the
tool data.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

from .base import Agent, EarlyExit, GraphRunner
from .state import AgentState
from .tools import tool_registry

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------- classifier


class CopilotClassifier(Agent):
    name = "classifier"

    async def _run(self, state: AgentState) -> None:
        message = state.inputs.get("message", "")
        if not message:
            state.output = {"reply": "Please send a message.", "refused": True}
            raise EarlyExit

        system = (
            "You are a strict classifier for a finance-only trading assistant "
            "serving Indian retail + prosumer traders (NSE / BSE). Return JSON only."
        )
        schema = (
            '{"in_scope": true|false, "intent": "portfolio_review|signal_explain|'
            'market_context|stock_research|regime_ask|greeting|other", '
            '"reason": "short string"}'
        )
        prompt = (
            f"User message: {message}\n"
            "In scope: stocks, F&O, trading, portfolio, market news, macro, "
            "regime, signals, paper-trading, tax-on-trades questions.\n"
            "Out of scope: coding help, personal advice, medical, entertainment."
        )
        parsed = await self.llm.generate_json(prompt, schema, system=system)
        in_scope = bool(parsed.get("in_scope", True))
        intent = str(parsed.get("intent", "other"))

        state.put(self.name, intent=intent, in_scope=in_scope, raw=parsed)

        if not in_scope:
            state.output = {
                "reply": (
                    "I can only help with trading, markets, portfolio, and "
                    "signals. Ask me about a stock, a signal, or your "
                    "positions and I'll dig in."
                ),
                "refused": True,
                "intent": intent,
            }
            raise EarlyExit


# ---------------------------------------------------------------- tool planner


class CopilotToolPlanner(Agent):
    name = "tool_planner"

    async def _run(self, state: AgentState) -> None:
        message = state.inputs.get("message", "")
        intent = state.get("classifier", "intent", "other")
        route = state.inputs.get("route", "")
        mentioned_symbols = state.inputs.get("mentioned_symbols") or []

        schema_json = json.dumps(tool_registry.schema(), indent=2)
        schema_hint = (
            '{"tool_calls": [{"tool": "<name>", "args": {...}}, ...]} '
            "— empty array if no tools needed."
        )
        system = (
            "You plan which tools to call to answer a trading question. "
            "Call the fewest tools that cover the question. Prefer one call. "
            "Never call more than 3. Return JSON only."
        )
        prompt = (
            f"Available tools:\n{schema_json}\n\n"
            f"Current route: {route}\n"
            f"Intent: {intent}\n"
            f"Mentioned symbols: {mentioned_symbols}\n"
            f"User message: {message}\n\n"
            "Produce the plan."
        )
        parsed = await self.llm.generate_json(prompt, schema_hint, system=system)
        raw_calls = parsed.get("tool_calls") or []
        plan: List[Dict[str, Any]] = []
        for c in raw_calls[:3]:  # hard cap
            name = c.get("tool")
            args = c.get("args") or {}
            if not isinstance(name, str) or not isinstance(args, dict):
                continue
            plan.append({"tool": name, "args": args})
        state.put(self.name, plan=plan)


# ----------------------------------------------------------------- tool caller


class CopilotToolCaller(Agent):
    name = "tool_caller"

    async def _run(self, state: AgentState) -> None:
        plan = state.get("tool_planner", "plan") or []
        user_id = state.user_id or state.inputs.get("user_id")
        results: List[Dict[str, Any]] = []
        for item in plan:
            args = dict(item.get("args") or {})
            # Inject user_id automatically when a tool needs it.
            spec = tool_registry.get(item["tool"])
            if spec and "user_id" in spec.params and user_id and "user_id" not in args:
                args["user_id"] = user_id
            out = await tool_registry.call(state, item["tool"], **args)
            results.append({"tool": item["tool"], "args": args, "result": out})
        state.put(self.name, tool_results=results)


# ------------------------------------------------------------------- responder


class CopilotResponder(Agent):
    name = "responder"

    async def _run(self, state: AgentState) -> None:
        message = state.inputs.get("message", "")
        history = state.inputs.get("history") or []
        route = state.inputs.get("route", "")
        tool_results = state.get("tool_caller", "tool_results") or []

        system = (
            "You are Swing AI Copilot — senior NSE/BSE trading analyst voice. "
            "Numbers first, narrative second. DM Mono for every price / percent "
            "(callers will style it). Never use emoji. Never preamble. Never "
            "say 'as an AI'. Cite tool data using this format: [tool:<name>]. "
            "Max 4 short paragraphs. Educational, not an execution recommendation."
        )
        prompt = (
            f"Route: {route}\n"
            f"Recent conversation (last 6 turns): "
            f"{json.dumps(history[-6:], ensure_ascii=False)}\n\n"
            f"Tool results JSON: {json.dumps(tool_results, ensure_ascii=False, default=str)[:4000]}\n\n"
            f"User message: {message}\n\n"
            "Write the reply."
        )
        reply = await self.llm.complete(prompt, system=system, temperature=0.25)
        if not reply:
            reply = (
                "I could not generate a reply right now. The model may not be "
                "configured (check GEMINI_API_KEY) or the request timed out."
            )
        state.put(self.name, response=reply)
        state.output = {
            "reply": reply,
            "refused": False,
            "intent": state.get("classifier", "intent", "other"),
            "tools_used": [t["tool"] for t in tool_results],
        }


# --------------------------------------------------------------------- runner


COPILOT_GRAPH = GraphRunner(
    "copilot",
    [
        CopilotClassifier(),
        CopilotToolPlanner(),
        CopilotToolCaller(),
        CopilotResponder(),
    ],
)


async def run_copilot(
    *,
    user_id: str,
    message: str,
    route: str = "",
    history: list | None = None,
    mentioned_symbols: list | None = None,
) -> Dict[str, Any]:
    """Single-turn Copilot call. Returns ``state.output`` + trace."""
    state = AgentState(
        inputs={
            "message": message,
            "route": route,
            "history": history or [],
            "mentioned_symbols": mentioned_symbols or [],
        },
        user_id=user_id,
        graph_name="copilot",
    )
    await COPILOT_GRAPH.run(state)
    return {
        **state.output,
        "trace": [
            {"agent": t.agent, "duration_ms": t.duration_ms}
            for t in state.turns
        ],
        "tool_calls": [
            {"name": tc.name, "duration_ms": tc.duration_ms, "error": tc.error}
            for tc in state.tool_trace
        ],
    }
