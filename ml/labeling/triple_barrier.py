"""
PR 163 — Triple-barrier labeling (López de Prado).

The naive labeling scheme used by lgbm_signal_gate + intraday_lstm so
far ("did the price go up over the next N bars") has two well-known
problems for real-money systems:

  1. **Path-dependence ignored** — a +5% terminal return that came
     after a -10% drawdown is not the same trade as a smooth +5% climb.
     A sign-of-return label says "BUY" for both; in reality the first
     one would have hit your stop loss and never realized the +5%.

  2. **Volatility-blind thresholds** — a 1% move in HDFCBANK and a 1%
     move in ZOMATO are very different events. Same numeric label,
     wildly different signal-to-noise.

Triple-barrier labeling solves both:

    For every bar t with a candidate signal:
      Set three barriers:
        upper:  price + profit_target_atr * ATR(t)
        lower:  price - stop_loss_atr * ATR(t)
        vertical: t + vertical_barrier_days bars

    Walk forward. The FIRST barrier touched determines the label:
      +1 if upper touched first (target hit before stop)
      -1 if lower touched first (stop hit before target)
       0 if vertical touched first (neither hit within the window)

This is volatility-aware (per-stock ATR scaling), path-aware (which
barrier gets hit first matters), and produces labels with proper
statistical structure (predicting first-passage events, not just
terminal returns).

Used by:
  PR 163 → lgbm_signal_gate.py (replaces 3-class threshold labels)
  PR 163 → intraday_lstm.py (replaces 0.4-sigma forward-return label)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


@dataclass
class TripleBarrierConfig:
    """Triple-barrier method parameters.

    profit_target_atr:
        Upper barrier distance in ATR units. 2.0 = 2x ATR above entry.
        López de Prado default is 1.0; we use 2.0 because NSE swing
        trades typically need at least 2x ATR to clear transaction
        costs and provide meaningful R:R.

    stop_loss_atr:
        Lower barrier distance in ATR units. 1.0 = 1x ATR below entry.
        Combined with profit_target_atr=2.0 gives 2:1 R:R targeting.

    vertical_barrier_days:
        Maximum holding period in bars. Hit this without touching either
        the upper or lower barrier and the trade is labeled 0 (neutral).
        For daily swing: 10. For 5-min intraday: 12 (one trading hour).

    min_atr_pct:
        Skip labeling if ATR/price < this threshold. Avoids labeling
        ultra-low-vol periods where barriers are effectively unreachable.

    asymmetric:
        If True, allow profit_target != stop_loss for asymmetric R:R.
        If False, force profit_target_atr = stop_loss_atr (symmetric).
    """

    profit_target_atr: float = 2.0
    stop_loss_atr: float = 1.0
    vertical_barrier_days: int = 10
    min_atr_pct: float = 0.005  # 0.5% min ATR/close, below this skip
    asymmetric: bool = True


def triple_barrier_labels(
    close: np.ndarray | pd.Series | Iterable[float],
    atr: np.ndarray | pd.Series | Iterable[float],
    cfg: Optional[TripleBarrierConfig] = None,
) -> np.ndarray:
    """Compute triple-barrier labels for every bar.

    Args:
        close: 1-D price series, length N.
        atr:   1-D ATR series aligned with close, length N. Per López
               de Prado, ATR-scaled barriers are correct because they
               normalize across volatility regimes.
        cfg:   Configuration. Defaults to 2x/1x ATR with 10-bar vertical.

    Returns:
        np.ndarray of int labels, length N:
            +1 = upper barrier (profit) hit first
             0 = vertical barrier (timeout) hit first OR insufficient ATR
            -1 = lower barrier (stop) hit first

    The last ``vertical_barrier_days`` rows are labeled 0 (no future
    data). The caller's downstream code should drop these rows from
    training (we don't drop here so the output array length matches
    the input).

    Notes on speed:
        O(N * vertical_barrier_days). For N=10k and vbd=10, ~100k inner
        loop iterations — runs in ~50ms. The inner loop is hard to
        vectorize cleanly because we need first-passage time, but
        numpy comparison ops keep it within an order of magnitude of
        a vectorized version.
    """
    cfg = cfg or TripleBarrierConfig()
    if cfg.profit_target_atr <= 0 or cfg.stop_loss_atr <= 0:
        raise ValueError("profit_target_atr and stop_loss_atr must be > 0")
    if cfg.vertical_barrier_days < 1:
        raise ValueError("vertical_barrier_days must be >= 1")
    if not cfg.asymmetric and cfg.profit_target_atr != cfg.stop_loss_atr:
        raise ValueError(
            "asymmetric=False but profit_target_atr != stop_loss_atr",
        )

    close_arr = np.asarray(list(close), dtype=float)
    atr_arr = np.asarray(list(atr), dtype=float)
    if close_arr.shape != atr_arr.shape:
        raise ValueError(
            f"close.shape {close_arr.shape} != atr.shape {atr_arr.shape}",
        )

    n = close_arr.size
    labels = np.zeros(n, dtype=np.int8)
    vbd = int(cfg.vertical_barrier_days)

    for i in range(n - vbd):
        entry_price = close_arr[i]
        entry_atr = atr_arr[i]

        # Skip ultra-low-vol periods where barriers are unreachable
        if entry_atr <= 0 or entry_price <= 0:
            continue
        if entry_atr / entry_price < cfg.min_atr_pct:
            continue

        upper = entry_price + cfg.profit_target_atr * entry_atr
        lower = entry_price - cfg.stop_loss_atr * entry_atr

        # Walk forward, first-passage check
        for j in range(1, vbd + 1):
            future_price = close_arr[i + j]
            if future_price >= upper:
                labels[i] = 1
                break
            if future_price <= lower:
                labels[i] = -1
                break
        # Else stays at 0 (vertical barrier)

    return labels


def triple_barrier_events(
    close: np.ndarray | pd.Series | Iterable[float],
    atr: np.ndarray | pd.Series | Iterable[float],
    cfg: Optional[TripleBarrierConfig] = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Triple-barrier labels + barrier-hit timestamps.

    Returns:
        labels:  int8 array shape (N,), values in {-1, 0, +1}.
        t1:      int64 array shape (N,). t1[i] is the bar index at which
                 observation i's barrier was first touched. For obs that
                 never trigger (low-ATR skip, last vbd rows) t1[i] = i.
                 For observations hitting the vertical barrier,
                 t1[i] = i + vertical_barrier_days.

    The (labels, t1) pair is what AFML Ch.4 sample-uniqueness needs:
    two observations whose [i, t1[i]] intervals overlap share label
    information and must be down-weighted.
    """
    cfg = cfg or TripleBarrierConfig()
    if cfg.profit_target_atr <= 0 or cfg.stop_loss_atr <= 0:
        raise ValueError("profit_target_atr and stop_loss_atr must be > 0")
    if cfg.vertical_barrier_days < 1:
        raise ValueError("vertical_barrier_days must be >= 1")

    close_arr = np.asarray(list(close), dtype=float)
    atr_arr = np.asarray(list(atr), dtype=float)
    if close_arr.shape != atr_arr.shape:
        raise ValueError(
            f"close.shape {close_arr.shape} != atr.shape {atr_arr.shape}",
        )

    n = close_arr.size
    labels = np.zeros(n, dtype=np.int8)
    t1 = np.arange(n, dtype=np.int64)
    vbd = int(cfg.vertical_barrier_days)

    for i in range(n - vbd):
        entry_price = close_arr[i]
        entry_atr = atr_arr[i]
        if entry_atr <= 0 or entry_price <= 0:
            continue
        if entry_atr / entry_price < cfg.min_atr_pct:
            continue

        upper = entry_price + cfg.profit_target_atr * entry_atr
        lower = entry_price - cfg.stop_loss_atr * entry_atr

        hit_at = i + vbd  # default: vertical barrier
        for j in range(1, vbd + 1):
            future_price = close_arr[i + j]
            if future_price >= upper:
                labels[i] = 1
                hit_at = i + j
                break
            if future_price <= lower:
                labels[i] = -1
                hit_at = i + j
                break
        t1[i] = hit_at
    return labels, t1


def label_distribution(labels: np.ndarray) -> dict[str, float]:
    """Convenience: return fractional class distribution. Useful for
    logging in trainer.evaluate() to surface class imbalance."""
    n = labels.size
    if n == 0:
        return {"label_+1": 0.0, "label_0": 0.0, "label_-1": 0.0}
    return {
        "label_+1": float((labels == 1).sum() / n),
        "label_0": float((labels == 0).sum() / n),
        "label_-1": float((labels == -1).sum() / n),
    }


__all__ = [
    "TripleBarrierConfig",
    "triple_barrier_labels",
    "triple_barrier_events",
    "label_distribution",
]
