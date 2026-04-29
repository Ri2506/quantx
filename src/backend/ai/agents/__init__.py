"""
Agent runtime — lightweight LangGraph-style orchestration over Gemini.

We ship a small custom runtime instead of `langgraph` itself because our
needs are narrow (sequential chains + parallel fan-out + linear tool-use)
and shipping against a 3rd-party dep surface makes refactors painful for
a solo-founder codebase.

Public API:
    from src.backend.ai.agents import (
        AgentState, Agent, GraphRunner, LLM,
        tool, tool_registry,
        run_copilot, run_finrobot_doctor, run_trading_debate,
    )

See ``copilot.py`` / ``finrobot.py`` / ``tradingagents.py`` for graph
definitions and ``tools.py`` for the callable-tool registry.
"""

from .base import Agent, GraphRunner
from .llm import LLM, get_llm
from .state import AgentState
from .tools import tool, tool_registry

try:
    from .copilot import run_copilot
except Exception:  # pragma: no cover - downstream module may import lazily
    run_copilot = None  # type: ignore

try:
    from .finrobot import run_finrobot_doctor
except Exception:  # pragma: no cover
    run_finrobot_doctor = None  # type: ignore

try:
    from .tradingagents import run_trading_debate
except Exception:  # pragma: no cover
    run_trading_debate = None  # type: ignore


__all__ = [
    "Agent",
    "AgentState",
    "GraphRunner",
    "LLM",
    "get_llm",
    "tool",
    "tool_registry",
    "run_copilot",
    "run_finrobot_doctor",
    "run_trading_debate",
]
