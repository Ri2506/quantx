"""
PR 162 — backtest-driven metrics for trainer evaluation.

Per-fold metrics that prove a model would actually have made money in
the test window. Promote-gate (PR 167) reads these to allow / deny
``is_prod=TRUE``.

Two entry points:

    metrics_from_returns(strategy_returns, benchmark_returns) -> dict
        Pure metric calculation. Caller has already simulated the
        strategy (e.g. RL env, regime-conditional position sizer).

    compute_backtest_metrics(predictions, forward_returns, benchmark_returns, cfg) -> dict
        End-to-end: turn discrete predictions (BUY=1, SELL=-1, HOLD=0)
        or probabilities into a strategy return series, apply
        per-trade transaction costs, then call metrics_from_returns.

Metric contract (all annualized to 252 trading days where applicable):

    sharpe              float  Risk-adjusted return; > 1 is decent, > 2 great
    max_drawdown_pct    float  Most-negative equity drop; -0.25 = -25 percent
    calmar              float  annualized return / abs(max_dd); > 0.5 to ship
    cagr                float  Compound annual growth rate of strategy
    annualized_vol      float  Stddev x sqrt(252) on daily returns
    total_return_pct    float  Strategy cum-return over test window
    benchmark_return_pct float Same for Nifty buy-and-hold
    excess_return_pct   float  Strategy minus benchmark
    win_rate            float  Fraction of trades with positive PnL
    profit_factor       float  Gross profit / gross loss; > 1.5 to ship
    n_trades            int
    avg_holding_days    float
    primary_metric      str    'sharpe' so promote_gate has a named field
    primary_value       float

All values are JSONB-safe (float | int | str | list of those).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# Trading days per year for annualization.
TRADING_DAYS = 252

# Default per-trade round-trip cost (matches ml/backtest/engine.py and
# ml/rl/env.py). 0.05 percent slippage + 0.03 percent brokerage + ~0.05 percent
# STT impact on average over EQUITY trades.
DEFAULT_COST_BPS = 13.0


@dataclass
class BacktestEvalConfig:
    """Configuration for ``compute_backtest_metrics``.

    cost_bps:
        Round-trip transaction cost in basis points. 13 bps = 0.13 percent.
        Applied on every position change.

    confidence_threshold:
        For probability predictions: only trade when |p - 0.5| > threshold.
        Default 0.05 (i.e. p > 0.55 = LONG, p < 0.45 = SHORT).

    direction_neutral:
        If True, predictions are treated as discrete LONG/SHORT/FLAT
        (-1/0/+1). If False, predictions are treated as probabilities
        in [0, 1] for binary up/down models.

    max_position:
        Cap on absolute position size (0.0 = flat, 1.0 = full long,
        -1.0 = full short). Mirrors AutoPilot's per-symbol cap.
    """

    cost_bps: float = DEFAULT_COST_BPS
    confidence_threshold: float = 0.05
    direction_neutral: bool = True
    max_position: float = 1.0


# ============================================================================
# Pure metric calculator
# ============================================================================


def metrics_from_returns(
    strategy_returns: np.ndarray | pd.Series | Iterable[float],
    benchmark_returns: Optional[np.ndarray | pd.Series | Iterable[float]] = None,
) -> dict:
    """Compute Sharpe / drawdown / Calmar / CAGR / vol from a return series.

    ``strategy_returns`` is an array of per-period (typically daily)
    simple returns (e.g. 0.012 = +1.2 percent). Caller is responsible for
    deducting transaction costs upstream.

    ``benchmark_returns`` is the same series for Nifty / NIFTY 50 buy-and-
    hold. When provided, adds excess_return_pct + benchmark fields.
    """
    arr = np.asarray(list(strategy_returns), dtype=float)
    if arr.size == 0:
        return _empty_metrics()
    n = arr.size

    # Annualized stats
    daily_mean = float(arr.mean())
    daily_std = float(arr.std(ddof=1)) if n > 1 else 0.0
    ann_return = (1.0 + daily_mean) ** TRADING_DAYS - 1.0 if daily_mean > -1.0 else -1.0
    ann_vol = daily_std * np.sqrt(TRADING_DAYS)

    # Sharpe: mean / std x sqrt(252). Risk-free assumed 0 in v1; the
    # repo's risk profile is "absolute return," not excess-of-RF.
    sharpe = float((daily_mean / daily_std) * np.sqrt(TRADING_DAYS)) if daily_std > 1e-12 else 0.0

    # Equity curve + max drawdown
    equity = np.cumprod(1.0 + arr)
    running_max = np.maximum.accumulate(equity)
    drawdowns = equity / running_max - 1.0
    max_dd = float(drawdowns.min()) if drawdowns.size > 0 else 0.0

    # Calmar = annualized return / |max_dd|
    calmar = float(ann_return / abs(max_dd)) if abs(max_dd) > 1e-9 else 0.0

    # CAGR over the realized window
    total_return = float(equity[-1] - 1.0) if equity.size > 0 else 0.0
    years = n / TRADING_DAYS
    cagr = float((1.0 + total_return) ** (1.0 / years) - 1.0) if years > 0 else 0.0

    out = {
        "sharpe": round(sharpe, 4),
        "max_drawdown_pct": round(max_dd, 4),
        "calmar": round(calmar, 4),
        "cagr": round(cagr, 4),
        "annualized_return": round(ann_return, 4),
        "annualized_vol": round(ann_vol, 4),
        "total_return_pct": round(total_return, 4),
        "n_periods": int(n),
        "primary_metric": "sharpe",
        "primary_value": round(sharpe, 4),
    }

    # Benchmark-relative
    if benchmark_returns is not None:
        bench = np.asarray(list(benchmark_returns), dtype=float)
        if bench.size == arr.size:
            bench_eq = np.cumprod(1.0 + bench)
            bench_total = float(bench_eq[-1] - 1.0)
            out["benchmark_return_pct"] = round(bench_total, 4)
            out["excess_return_pct"] = round(total_return - bench_total, 4)
            # Information ratio: excess return / tracking error
            excess = arr - bench
            te = float(excess.std(ddof=1)) if excess.size > 1 else 0.0
            out["information_ratio"] = (
                round(float(excess.mean() / te) * np.sqrt(TRADING_DAYS), 4)
                if te > 1e-12
                else 0.0
            )

    return out


# ============================================================================
# End-to-end: predictions -> strategy returns -> metrics
# ============================================================================


def compute_backtest_metrics(
    predictions: np.ndarray | pd.Series | Iterable[float],
    forward_returns: np.ndarray | pd.Series | Iterable[float],
    benchmark_returns: Optional[np.ndarray | pd.Series | Iterable[float]] = None,
    cfg: Optional[BacktestEvalConfig] = None,
) -> dict:
    """End-to-end backtest metric computation.

    Args:
        predictions:
            Aligned with ``forward_returns``. Either:
            - Discrete: -1, 0, +1 (SELL, HOLD, BUY) when cfg.direction_neutral
            - Probability: [0, 1] when cfg.direction_neutral=False (binary up)

        forward_returns:
            Realized next-period returns (same length as predictions).

        benchmark_returns:
            Nifty buy-and-hold returns. Same length as forward_returns.

        cfg:
            BacktestEvalConfig.

    Returns: metrics dict from metrics_from_returns() + n_trades, win_rate,
    profit_factor, avg_holding_days.
    """
    cfg = cfg or BacktestEvalConfig()
    preds = np.asarray(list(predictions), dtype=float)
    rets = np.asarray(list(forward_returns), dtype=float)
    if preds.shape != rets.shape:
        raise ValueError(
            f"predictions.shape {preds.shape} != forward_returns.shape {rets.shape}",
        )
    if preds.size == 0:
        return _empty_metrics()

    # Convert predictions to position signals in [-1, 1].
    if cfg.direction_neutral:
        positions = np.clip(preds, -cfg.max_position, cfg.max_position)
    else:
        # Probability gate around 0.5 + threshold.
        upper = 0.5 + cfg.confidence_threshold
        lower = 0.5 - cfg.confidence_threshold
        positions = np.where(
            preds > upper, cfg.max_position,
            np.where(preds < lower, -cfg.max_position, 0.0),
        )

    # Strategy daily return = position x forward_return - cost on changes.
    pos_change = np.abs(np.diff(positions, prepend=0.0))
    cost_per_period = pos_change * (cfg.cost_bps / 10_000.0)
    strategy_returns = positions * rets - cost_per_period

    base = metrics_from_returns(strategy_returns, benchmark_returns)

    # Trade-level metrics: a "trade" is each entry/exit (position changes).
    trades = _extract_trades(positions, rets, cfg.cost_bps)
    base["n_trades"] = int(len(trades))
    if trades:
        wins = [t for t in trades if t["pnl"] > 0]
        losses = [t for t in trades if t["pnl"] < 0]
        base["win_rate"] = round(len(wins) / len(trades), 4)
        gross_profit = sum(t["pnl"] for t in wins)
        gross_loss = abs(sum(t["pnl"] for t in losses))
        base["profit_factor"] = (
            round(gross_profit / gross_loss, 4) if gross_loss > 1e-12 else 0.0
        )
        base["avg_holding_days"] = round(
            float(np.mean([t["holding_days"] for t in trades])), 2
        )
    else:
        base["win_rate"] = 0.0
        base["profit_factor"] = 0.0
        base["avg_holding_days"] = 0.0

    # Average daily turnover (proxy for transaction-cost drag).
    base["avg_daily_turnover"] = round(float(np.mean(pos_change)), 4)
    return base


# Backwards-compat alias name kept off the module surface; the package
# __init__ re-exports the canonical name.
backtest_eval = compute_backtest_metrics


# ============================================================================
# Promote gate
# ============================================================================


# Default thresholds — set conservatively for v1 real-money launch.
# Calibrated from publicly-available NSE strategy backtests; any model
# that doesn't beat these is worse than tier-1 retail systematic
# strategies.
DEFAULT_PROMOTE_THRESHOLDS = {
    "min_sharpe": 1.0,
    "max_drawdown_pct": -0.25,         # i.e. drawdown shallower than -25 percent
    "min_calmar": 0.5,
    "min_profit_factor": 1.5,
    "min_n_trades": 30,                 # avoid lucky-streak promotes
    "min_excess_return_pct": 0.05,      # beat Nifty by >= 5 percent over test window
}


def promote_gate_passes(
    metrics: dict,
    thresholds: Optional[dict] = None,
) -> tuple[bool, list[str]]:
    """Decide whether a model's metrics warrant ``is_prod=TRUE``.

    Returns (passed, failure_reasons). When ``passed`` is False the
    runner records the reasons in ``model_versions.notes`` so the
    trainer team knows why it was held back.

    The thresholds dict can be overridden per trainer when a model has
    a known different risk profile (e.g. AutoPilot's drawdown ceiling
    is tighter than swing's because it leverages the portfolio).
    """
    th = {**DEFAULT_PROMOTE_THRESHOLDS, **(thresholds or {})}
    reasons: list[str] = []

    sharpe = float(metrics.get("sharpe_mean", metrics.get("sharpe", 0.0)))
    if sharpe < th["min_sharpe"]:
        reasons.append(f"Sharpe {sharpe:.2f} < min {th['min_sharpe']}")

    max_dd = float(metrics.get("max_drawdown_pct_mean", metrics.get("max_drawdown_pct", 0.0)))
    if max_dd < th["max_drawdown_pct"]:
        reasons.append(
            f"Max drawdown {max_dd*100:.1f} percent deeper than allowed {th['max_drawdown_pct']*100:.0f} percent",
        )

    calmar = float(metrics.get("calmar_mean", metrics.get("calmar", 0.0)))
    if calmar < th["min_calmar"]:
        reasons.append(f"Calmar {calmar:.2f} < min {th['min_calmar']}")

    pf = float(metrics.get("profit_factor_mean", metrics.get("profit_factor", 0.0)))
    if pf < th["min_profit_factor"]:
        reasons.append(f"Profit factor {pf:.2f} < min {th['min_profit_factor']}")

    n_trades = float(metrics.get("n_trades_mean", metrics.get("n_trades", 0)))
    if n_trades < th["min_n_trades"]:
        reasons.append(f"n_trades {n_trades:.0f} < min {th['min_n_trades']}")

    excess = float(metrics.get("excess_return_pct_mean", metrics.get("excess_return_pct", 0.0)))
    if excess < th["min_excess_return_pct"]:
        reasons.append(
            f"Excess vs Nifty {excess*100:.2f} percent < min {th['min_excess_return_pct']*100:.0f} percent",
        )

    return len(reasons) == 0, reasons


# ============================================================================
# Internals
# ============================================================================


def _extract_trades(positions: np.ndarray, returns: np.ndarray, cost_bps: float) -> list[dict]:
    """Walk the position array bar-by-bar; emit a trade per close."""
    trades: list[dict] = []
    cur_pos = 0.0
    entry_idx: Optional[int] = None
    pnl = 0.0
    cost_unit = cost_bps / 10_000.0
    for i, pos in enumerate(positions):
        if cur_pos == 0.0 and pos != 0.0:
            # Open a new trade
            entry_idx = i
            cur_pos = float(pos)
            pnl = -abs(cur_pos) * cost_unit  # entry cost
        elif cur_pos != 0.0 and pos != cur_pos:
            # Close (or flip) — accumulate today's return then book the trade
            pnl += cur_pos * float(returns[i]) - abs(cur_pos - float(pos)) * cost_unit
            trades.append({
                "entry_idx": int(entry_idx) if entry_idx is not None else i,
                "exit_idx": int(i),
                "holding_days": int(i - (entry_idx or i)),
                "pnl": float(pnl),
            })
            # Open a new trade if pos != 0 (flip case)
            cur_pos = float(pos)
            entry_idx = i if pos != 0.0 else None
            pnl = -abs(cur_pos) * cost_unit if pos != 0.0 else 0.0
        else:
            # Holding the same position; accrue return
            pnl += cur_pos * float(returns[i])
    if cur_pos != 0.0 and entry_idx is not None:
        # Close any open position at the last bar
        trades.append({
            "entry_idx": int(entry_idx),
            "exit_idx": int(len(positions) - 1),
            "holding_days": int(len(positions) - 1 - entry_idx),
            "pnl": float(pnl),
        })
    return trades


def _empty_metrics() -> dict:
    """Sentinel for empty input — keeps downstream JSON shape stable."""
    return {
        "sharpe": 0.0,
        "max_drawdown_pct": 0.0,
        "calmar": 0.0,
        "cagr": 0.0,
        "annualized_return": 0.0,
        "annualized_vol": 0.0,
        "total_return_pct": 0.0,
        "n_periods": 0,
        "n_trades": 0,
        "win_rate": 0.0,
        "profit_factor": 0.0,
        "avg_holding_days": 0.0,
        "avg_daily_turnover": 0.0,
        "primary_metric": "sharpe",
        "primary_value": 0.0,
    }
