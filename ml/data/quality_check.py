"""
PR 182 — automated data-quality audit for training feeds.

Quant pipelines fail silently when input data has rotted. The model
trains on garbage, the gate may even pass, and live performance
collapses because the feature distribution looked fine in aggregate
but had subtle pathologies. Common rot patterns on NSE-via-yfinance:

  1. Stale prices — same Close repeated for 5+ consecutive bars
  2. Repeated bars — entire OHLCV row duplicated
  3. Missing-day gaps — > N business days without data on a live name
  4. After-hours leakage — bar with timestamp outside 09:15-15:30 IST
  5. Adjusted-volume anomalies — volume_ratio_10d > 50× without a
     corresponding registered corporate action
  6. Negative or zero prices/volumes
  7. Wild outliers — single-bar return |x| > 50 percent (corp actions
     missed by adjuster)
  8. Insufficient history — symbol has < min_rows of usable data

This module runs every audit on a trainer's data frame and emits a
structured report. Trainers can either treat issues as fatal (raise)
or as warnings (proceed with reduced confidence weight).

Public surface:

    from ml.data.quality_check import (
        QualityCheckConfig,
        run_quality_checks,
        DataQualityError,
    )

    cfg = QualityCheckConfig(max_stale_run=5, max_outlier_pct=0.50)
    report = run_quality_checks(per_symbol_frames, cfg)
    if report.fatal_count > 0:
        raise DataQualityError(report.summary())

The report is JSONB-safe so trainers can persist it under
``model_versions.metrics["data_quality_report"]``.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Dict, Iterable, List, Optional

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


class DataQualityError(RuntimeError):
    """Raised when a fatal data-quality issue is detected."""


# ============================================================================
# Configuration
# ============================================================================


@dataclass
class QualityCheckConfig:
    """Thresholds for each audit. None disables the check.

    max_stale_run:
        Max consecutive bars with the same Close price. Default 5.
        Higher than 5 → likely stale feed.

    max_dup_run:
        Max consecutive bars where the entire OHLCV row repeats
        (Close = Open = High = Low = same as prior bar).

    max_gap_days:
        Max calendar days without data inside the symbol's lifespan.
        > 7 → suspicious for a name claimed liquid.

    max_outlier_pct:
        Max |single-bar return| considered normal. 0.50 = ±50 percent.
        Anything beyond suggests a missed corporate action.

    max_volume_spike_factor:
        volume_ratio (today / 10d median) ceiling. 50.0 = 50× median.
        Beyond this without a registered corp action is rot.

    min_rows:
        Minimum total rows for a symbol to be considered usable.
        Trainers may skip symbols that fail this.

    fatal_thresholds:
        Map issue-type → max number of issues across the universe
        before run_quality_checks raises DataQualityError. Default
        treats only "negative_price" and "trading_window_violation" as
        fatal.

    market_open_hhmm:
        Tuple (open, close) HHMM for the trading window. NSE: 0915-1530.
    """

    max_stale_run: Optional[int] = 5
    max_dup_run: Optional[int] = 3
    max_gap_days: Optional[int] = 7
    max_outlier_pct: Optional[float] = 0.50
    max_volume_spike_factor: Optional[float] = 50.0
    min_rows: int = 100
    fatal_thresholds: Dict[str, int] = field(default_factory=lambda: {
        "negative_price": 0,                # any → fatal
        "trading_window_violation": 0,      # any → fatal
        "stale_run": 50,                    # > 50 stale runs across universe → fatal
    })
    market_open_hhmm: tuple[int, int] = (915, 1530)


# ============================================================================
# Per-symbol audits
# ============================================================================


def _detect_stale_runs(close: np.ndarray, threshold: int) -> int:
    """Count runs of identical-Close longer than threshold."""
    if close.size < 2:
        return 0
    runs = 0
    current = 1
    for i in range(1, close.size):
        if close[i] == close[i - 1]:
            current += 1
        else:
            if current > threshold:
                runs += 1
            current = 1
    if current > threshold:
        runs += 1
    return runs


def _detect_dup_runs(df: pd.DataFrame, threshold: int) -> int:
    """Count runs of duplicate OHLCV rows longer than threshold."""
    needed = ["Open", "High", "Low", "Close", "Volume"]
    if not all(c in df.columns for c in needed):
        return 0
    arr = df[needed].values
    if arr.shape[0] < 2:
        return 0
    runs = 0
    current = 1
    for i in range(1, arr.shape[0]):
        if np.array_equal(arr[i], arr[i - 1]):
            current += 1
        else:
            if current > threshold:
                runs += 1
            current = 1
    if current > threshold:
        runs += 1
    return runs


def _detect_gap_days(idx: pd.DatetimeIndex, threshold: int) -> int:
    """Count gaps in the index larger than threshold business days."""
    if len(idx) < 2:
        return 0
    gaps = 0
    sorted_idx = idx.sort_values()
    for i in range(1, len(sorted_idx)):
        bdays = pd.bdate_range(sorted_idx[i - 1], sorted_idx[i]).size - 1
        if bdays > threshold:
            gaps += 1
    return gaps


def _detect_outlier_returns(close: np.ndarray, max_pct: float) -> int:
    """Count single-bar returns whose abs value exceeds max_pct."""
    if close.size < 2:
        return 0
    rets = np.diff(close) / close[:-1]
    return int((np.abs(rets) > max_pct).sum())


def _detect_volume_spikes(volume: np.ndarray, max_factor: float) -> int:
    """Count bars where volume / 10d-median > max_factor."""
    if volume.size < 11:
        return 0
    s = pd.Series(volume)
    median_10d = s.rolling(10, min_periods=5).median()
    ratio = s / median_10d.replace(0, np.nan)
    return int((ratio > max_factor).sum())


def _detect_negative_prices(df: pd.DataFrame) -> int:
    cols = [c for c in ["Open", "High", "Low", "Close"] if c in df.columns]
    if not cols:
        return 0
    return int((df[cols] <= 0).any(axis=1).sum())


def _detect_window_violations(idx: pd.DatetimeIndex, market_window: tuple[int, int]) -> int:
    """Intraday-only check. Counts timestamps outside the trading window.

    For daily bars (no time component), every entry's time is 00:00 →
    we skip the check by inspecting whether any timestamp has non-zero
    time."""
    if len(idx) == 0:
        return 0
    has_time = any(t.time() != pd.Timestamp("00:00").time() for t in idx[:5])
    if not has_time:
        return 0
    open_h, open_m = divmod(market_window[0], 100)
    close_h, close_m = divmod(market_window[1], 100)
    open_t = pd.Timestamp(f"{open_h:02d}:{open_m:02d}").time()
    close_t = pd.Timestamp(f"{close_h:02d}:{close_m:02d}").time()
    violations = 0
    for ts in idx:
        t = ts.time()
        if t < open_t or t > close_t:
            violations += 1
    return violations


# ============================================================================
# Aggregate report
# ============================================================================


@dataclass
class QualityReport:
    """Per-issue counts across the universe + per-symbol breakdown."""

    issue_counts: Dict[str, int] = field(default_factory=dict)
    per_symbol: Dict[str, Dict[str, int]] = field(default_factory=dict)
    failed_symbols: List[str] = field(default_factory=list)
    fatal_count: int = 0
    fatal_reasons: List[str] = field(default_factory=list)
    n_symbols_checked: int = 0

    def summary(self) -> str:
        parts = [f"checked={self.n_symbols_checked}"]
        for k, v in sorted(self.issue_counts.items()):
            if v > 0:
                parts.append(f"{k}={v}")
        if self.failed_symbols:
            parts.append(f"failed={len(self.failed_symbols)}")
        if self.fatal_count:
            parts.append(f"FATAL={self.fatal_count}")
        return " ".join(parts)

    def to_dict(self) -> dict:
        """JSONB-safe dict for model_versions.metrics."""
        return {
            "n_symbols_checked": self.n_symbols_checked,
            "issue_counts": dict(self.issue_counts),
            "n_failed_symbols": len(self.failed_symbols),
            "failed_symbols": self.failed_symbols[:50],   # cap for storage
            "fatal_count": self.fatal_count,
            "fatal_reasons": list(self.fatal_reasons),
        }


def run_quality_checks(
    per_symbol_frames: Dict[str, pd.DataFrame],
    cfg: Optional[QualityCheckConfig] = None,
) -> QualityReport:
    """Run all configured audits over each symbol's frame.

    Returns a QualityReport. Caller decides whether to raise on
    ``fatal_count > 0`` or proceed and persist the report into
    ``model_versions.metrics``.

    Args:
        per_symbol_frames: dict from NSE symbol → DataFrame with
            DatetimeIndex and OHLCV columns.
        cfg: thresholds.
    """
    cfg = cfg or QualityCheckConfig()
    report = QualityReport()
    report.n_symbols_checked = len(per_symbol_frames)
    issue_keys = [
        "stale_run", "dup_run", "gap_day", "outlier_return",
        "volume_spike", "negative_price", "trading_window_violation",
        "insufficient_rows",
    ]
    for k in issue_keys:
        report.issue_counts[k] = 0

    for sym, df in per_symbol_frames.items():
        if df is None or df.empty:
            report.failed_symbols.append(sym)
            continue
        symbol_issues: Dict[str, int] = {}
        idx = df.index
        if not isinstance(idx, pd.DatetimeIndex):
            idx = pd.to_datetime(idx)
        close = df["Close"].values if "Close" in df.columns else np.array([])
        volume = df["Volume"].values if "Volume" in df.columns else np.array([])

        if len(df) < cfg.min_rows:
            symbol_issues["insufficient_rows"] = 1
            report.issue_counts["insufficient_rows"] += 1

        if cfg.max_stale_run is not None and close.size > 0:
            n = _detect_stale_runs(close, cfg.max_stale_run)
            symbol_issues["stale_run"] = n
            report.issue_counts["stale_run"] += n

        if cfg.max_dup_run is not None:
            n = _detect_dup_runs(df, cfg.max_dup_run)
            symbol_issues["dup_run"] = n
            report.issue_counts["dup_run"] += n

        if cfg.max_gap_days is not None:
            n = _detect_gap_days(idx, cfg.max_gap_days)
            symbol_issues["gap_day"] = n
            report.issue_counts["gap_day"] += n

        if cfg.max_outlier_pct is not None and close.size > 0:
            n = _detect_outlier_returns(close, cfg.max_outlier_pct)
            symbol_issues["outlier_return"] = n
            report.issue_counts["outlier_return"] += n

        if cfg.max_volume_spike_factor is not None and volume.size > 0:
            n = _detect_volume_spikes(volume, cfg.max_volume_spike_factor)
            symbol_issues["volume_spike"] = n
            report.issue_counts["volume_spike"] += n

        n = _detect_negative_prices(df)
        symbol_issues["negative_price"] = n
        report.issue_counts["negative_price"] += n

        n = _detect_window_violations(idx, cfg.market_open_hhmm)
        symbol_issues["trading_window_violation"] = n
        report.issue_counts["trading_window_violation"] += n

        report.per_symbol[sym] = symbol_issues

    # Fatal-threshold check
    for issue_type, max_count in cfg.fatal_thresholds.items():
        actual = report.issue_counts.get(issue_type, 0)
        if actual > max_count:
            report.fatal_count += 1
            report.fatal_reasons.append(
                f"{issue_type}={actual} > fatal_threshold={max_count}"
            )
    return report


__all__ = [
    "DataQualityError",
    "QualityCheckConfig",
    "QualityReport",
    "run_quality_checks",
]
