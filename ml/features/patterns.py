"""
SwingAI Chart Pattern Detection — Bullish Only
================================================
Consolidation patterns (trendline-based):
- Ascending Triangle, Horizontal Channel, Symmetrical Triangle
- Falling Wedge, Bull Flag

Reversal patterns (Bulkowski-researched):
- Double Bottom (68-78% WR), Triple Bottom (74-79% WR)
- Inverse Head & Shoulders (74-89% WR), Cup and Handle (61-95% WR)

Continuation:
- High & Tight Flag (69% avg rise, ~0% failure)

Pipeline: ATR-adaptive zigzag pivots → Theil-Sen trendlines →
ATR-normalized classification → pivot-sequence validation →
consolidation-zone detection → breakout + liquidity sweep scoring.

All indices are iloc-based (integer position in the DataFrame).
"""

import numpy as np
import pandas as pd
from scipy.stats import theilslopes
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict


# ===================================================================
# Timeframe Scaling
# ===================================================================

_TIMEFRAME_BARS_PER_DAY = {
    '1d': 1.0,
    '1wk': 0.2,      # 1 weekly bar = 5 daily bars
    '4h': 1.625,     # 6.5 trading hours / 4h = 1.625 bars/day
    '1h': 6.5,       # 6.5 bars per trading day
    '15m': 26.0,     # 26 bars per trading day
}


def _tf_scale(interval: str = '1d') -> float:
    """Return bars-per-day multiplier for the given candlestick timeframe."""
    return _TIMEFRAME_BARS_PER_DAY.get(interval, 1.0)


# ===================================================================
# Dataclasses
# ===================================================================

@dataclass
class ZigzagPivot:
    """A structurally significant pivot point detected by the zigzag algorithm."""
    index: int            # iloc position in DataFrame
    price: float          # high for swing high, low for swing low
    pivot_type: str       # "high" or "low"
    strength: float       # 0.0 to 1.0, composite score
    atr_multiple: float   # how many ATRs this reversal represents
    volume_ratio: float   # volume at pivot / avg volume


@dataclass
class TrendLine:
    """A fitted trendline through price points."""
    slope: float
    intercept: float
    r_squared: float
    points: List[Tuple[int, float]]  # (bar_idx, price) used for fitting
    start_idx: int
    end_idx: int
    respect_ratio: float = 1.0  # 0.0-1.0: how well price respects this line

    @property
    def num_touches(self) -> int:
        return len(self.points)

    def value_at(self, bar_idx: int) -> float:
        return self.slope * bar_idx + self.intercept

    @property
    def pct_slope_per_bar(self) -> float:
        """Slope as percentage of price per bar (for cross-stock comparison)."""
        mid_price = self.value_at((self.start_idx + self.end_idx) // 2)
        return (self.slope / mid_price * 100) if mid_price > 0 else 0.0


@dataclass
class PatternResult:
    """A detected chart pattern."""
    pattern_type: str
    support_line: Optional['TrendLine']
    resistance_line: Optional['TrendLine']
    duration_bars: int
    breakout_level: float
    support_level: float
    pattern_height: float
    quality_score: float
    volume_declining: bool = False
    neckline_level: float = 0.0
    candle_confirmed_touches: int = 0
    respect_ratio: float = 1.0  # avg line respect ratio (0.0-1.0)
    pivot_indices: List[Tuple[int, float, str]] = field(default_factory=list)  # (bar_idx, price, label)


@dataclass
class BreakoutSignal:
    """A breakout signal from a pattern."""
    pattern: PatternResult
    entry_price: float
    stop_loss: float
    target: float
    volume_ratio: float
    alpha_score: float = 0.0
    alpha_reasons: list = None
    sweep_detected: bool = False
    sweep_depth: float = 0.0

    def __post_init__(self):
        if self.alpha_reasons is None:
            self.alpha_reasons = []


# ===================================================================
# Candlestick Touch Validation (kept from Phase 8)
# ===================================================================

_SUPPORT_CANDLE_COLS = [
    'candle_hammer', 'candle_engulfing_bull', 'candle_bullish_pin',
    'candle_morning_star', 'candle_harami_bull', 'candle_piercing_line',
    'candle_tweezer_bottom', 'candle_three_line_strike',
    'candle_dragonfly_doji', 'candle_abandoned_baby_bull',
]

_RESISTANCE_CANDLE_COLS = [
    'candle_engulfing_bear', 'candle_evening_star', 'candle_dark_cloud',
    'candle_harami_bear', 'candle_tweezer_top', 'candle_gravestone_doji',
]


def _count_candlestick_touches(
    line: TrendLine, df: pd.DataFrame, line_type: str,
) -> int:
    """Count trendline touch points with confirming candlestick pattern."""
    cols = _SUPPORT_CANDLE_COLS if line_type == "support" else _RESISTANCE_CANDLE_COLS
    confirmed = 0
    for pt_idx, _ in line.points:
        if 0 <= pt_idx < len(df):
            row = df.iloc[pt_idx]
            if any(bool(row.get(c, False)) for c in cols if c in df.columns):
                confirmed += 1
    return confirmed


def _check_pivot_candle(
    df: pd.DataFrame, pivot_idx: int, pivot_type: str = "low",
) -> bool:
    """Check if pivot point has confirming candlestick (at bar or bar+1)."""
    cols = _SUPPORT_CANDLE_COLS if pivot_type == "low" else _RESISTANCE_CANDLE_COLS
    for idx in [pivot_idx, pivot_idx + 1]:
        if 0 <= idx < len(df):
            row = df.iloc[idx]
            if any(bool(row.get(c, False)) for c in cols if c in df.columns):
                return True
    return False


# ===================================================================
# Module 1: Zigzag Pivot Detection (ATR-Adaptive)
# ===================================================================

def _get_atr_series(df: pd.DataFrame, period: int = 14) -> np.ndarray:
    """Get or compute ATR series. Uses pre-computed atr_14 if available."""
    if 'atr_14' in df.columns and period == 14:
        atr = df['atr_14'].values.astype(float)
        # Fill NaN at start with first valid value
        first_valid = np.nanmean(atr[~np.isnan(atr)][:5]) if np.any(~np.isnan(atr)) else 0
        atr = np.where(np.isnan(atr), first_valid, atr)
        return atr

    # Compute ATR manually
    high = df['high'].values.astype(float)
    low = df['low'].values.astype(float)
    close = df['close'].values.astype(float)

    tr = np.maximum(high - low,
                    np.maximum(np.abs(high - np.roll(close, 1)),
                               np.abs(low - np.roll(close, 1))))
    tr[0] = high[0] - low[0]

    atr = np.full_like(tr, np.nan)
    atr[period - 1] = np.mean(tr[:period])
    for i in range(period, len(tr)):
        atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period

    # Backfill NaN at start
    first_valid = atr[period - 1] if period - 1 < len(atr) else tr[0]
    atr[:period - 1] = first_valid
    return atr


def _zigzag_pivots(
    df: pd.DataFrame,
    atr_multiplier: float = 1.5,
    atr_period: int = 14,
    min_bars_between: int = 3,
) -> List[ZigzagPivot]:
    """
    Zigzag pivot detection — the gold standard for financial time series.

    Only marks a new pivot when price reverses by >= atr_multiplier * ATR
    from the last extreme. This automatically adapts to stock volatility.

    Args:
        df: DataFrame with high, low, close, volume columns
        atr_multiplier: Multiplier for ATR threshold (1.0=minor, 1.5=standard, 2.5=major)
        atr_period: ATR calculation period
        min_bars_between: Minimum bars between consecutive pivots

    Returns:
        List of ZigzagPivot sorted by index
    """
    n = len(df)
    if n < atr_period + 5:
        return []

    high = df['high'].values.astype(float)
    low = df['low'].values.astype(float)
    atr = _get_atr_series(df, atr_period)

    # Get volume ratio if available
    has_vol = 'volume_ratio' in df.columns
    vol_ratios = df['volume_ratio'].values.astype(float) if has_vol else np.ones(n)
    vol_ratios = np.where(np.isnan(vol_ratios), 1.0, vol_ratios)

    pivots: List[ZigzagPivot] = []

    # Initialize: determine starting direction from first few bars
    start = max(atr_period, 1)
    if start >= n - 1:
        return []

    # Find initial direction by looking at first significant move
    direction = None  # "up" or "down"
    last_high_idx = start
    last_high_val = high[start]
    last_low_idx = start
    last_low_val = low[start]

    for i in range(start + 1, min(start + 20, n)):
        if high[i] > last_high_val:
            last_high_val = high[i]
            last_high_idx = i
        if low[i] < last_low_val:
            last_low_val = low[i]
            last_low_idx = i

    if last_high_idx > last_low_idx:
        direction = "up"
        extreme_idx = last_high_idx
        extreme_val = last_high_val
        # Record the low before the up move
        if last_low_idx > start:
            pivots.append(ZigzagPivot(
                index=last_low_idx, price=last_low_val, pivot_type="low",
                strength=0.5, atr_multiple=1.0, volume_ratio=float(vol_ratios[last_low_idx]),
            ))
    else:
        direction = "down"
        extreme_idx = last_low_idx
        extreme_val = last_low_val
        if last_high_idx > start:
            pivots.append(ZigzagPivot(
                index=last_high_idx, price=last_high_val, pivot_type="high",
                strength=0.5, atr_multiple=1.0, volume_ratio=float(vol_ratios[last_high_idx]),
            ))

    # Main zigzag loop
    scan_start = max(extreme_idx + 1, start + 1)
    for i in range(scan_start, n):
        threshold = atr_multiplier * max(atr[i], 0.001)

        if direction == "up":
            # Track running high
            if high[i] > extreme_val:
                extreme_val = high[i]
                extreme_idx = i
            # Check for reversal DOWN
            elif extreme_val - low[i] >= threshold:
                if i - extreme_idx >= min_bars_between or not pivots:
                    reversal_atr = (extreme_val - low[i]) / max(atr[extreme_idx], 0.001)
                    pivots.append(ZigzagPivot(
                        index=extreme_idx, price=extreme_val, pivot_type="high",
                        strength=0.0,  # computed later
                        atr_multiple=reversal_atr,
                        volume_ratio=float(vol_ratios[extreme_idx]),
                    ))
                    direction = "down"
                    extreme_val = low[i]
                    extreme_idx = i

        elif direction == "down":
            # Track running low
            if low[i] < extreme_val:
                extreme_val = low[i]
                extreme_idx = i
            # Check for reversal UP
            elif high[i] - extreme_val >= threshold:
                if i - extreme_idx >= min_bars_between or not pivots:
                    reversal_atr = (high[i] - extreme_val) / max(atr[extreme_idx], 0.001)
                    pivots.append(ZigzagPivot(
                        index=extreme_idx, price=extreme_val, pivot_type="low",
                        strength=0.0,
                        atr_multiple=reversal_atr,
                        volume_ratio=float(vol_ratios[extreme_idx]),
                    ))
                    direction = "up"
                    extreme_val = high[i]
                    extreme_idx = i

    # Compute strength for each pivot
    for p in pivots:
        p.strength = _compute_pivot_strength(df, p)

    return pivots


def _compute_pivot_strength(df: pd.DataFrame, pivot: ZigzagPivot) -> float:
    """
    Pivot strength = weighted combination of:
    - ATR multiple (30%): how significant the reversal was
    - Volume ratio (30%): volume at pivot vs average
    - Candle quality (20%): reversal candle present?
    - Base (20%): 0.5 default

    Returns 0.0 to 1.0
    """
    # ATR component: saturates at 3x ATR
    atr_score = min(1.0, pivot.atr_multiple / 3.0)

    # Volume component: capped at 3.0
    vol_score = min(1.0, max(0.0, (pivot.volume_ratio - 0.5) / 2.5))

    # Candle component
    candle_score = 0.0
    if 0 <= pivot.index < len(df):
        cols = _SUPPORT_CANDLE_COLS if pivot.pivot_type == "low" else _RESISTANCE_CANDLE_COLS
        row = df.iloc[pivot.index]
        if any(bool(row.get(c, False)) for c in cols if c in df.columns):
            candle_score = 1.0

    strength = 0.30 * atr_score + 0.30 * vol_score + 0.20 * candle_score + 0.20 * 0.5
    return round(min(1.0, strength), 3)



def detect_peaks_troughs(
    df: pd.DataFrame,
    min_distance: int = 5,
    prominence_pct: float = 0.012,
) -> Tuple[List[Tuple[int, float]], List[Tuple[int, float]]]:
    """
    Detect significant peaks (swing highs) and troughs (swing lows).

    BACKWARD COMPATIBLE wrapper — internally uses zigzag algorithm.
    Returns lists of (iloc_index_in_df, price).
    """
    # Map old prominence to ATR multiplier heuristically
    # prominence_pct 0.012 ≈ 1.5x ATR for typical stocks
    # prominence_pct 0.015 ≈ 2.0x ATR for reversal patterns
    atr_mult = 1.5 if prominence_pct <= 0.013 else 2.0

    pivots = _zigzag_pivots(df, atr_multiplier=atr_mult)

    peaks = [(p.index, p.price) for p in pivots if p.pivot_type == "high"]
    troughs = [(p.index, p.price) for p in pivots if p.pivot_type == "low"]
    return peaks, troughs


# ===================================================================
# Module 2b: Line Respect Validation
# ===================================================================

def _compute_line_respect(
    slope: float,
    intercept: float,
    touch_points: List[Tuple[int, float]],
    df: pd.DataFrame,
    line_type: str,
    violation_threshold_atr: float = 0.20,
) -> float:
    """
    Check that price stays on the correct side of a trendline between touches.

    For resistance: close should stay below line + tolerance.
    For support: close should stay above line - tolerance.

    Returns respect ratio 0.0-1.0. Reject lines with ratio < 0.80.
    """
    if len(touch_points) < 2:
        return 1.0

    close = df['close'].values.astype(float)
    atr = _get_atr_series(df)
    sorted_pts = sorted(touch_points, key=lambda p: p[0])

    total_bars = 0
    violation_bars = 0

    for seg in range(len(sorted_pts) - 1):
        start_bar = sorted_pts[seg][0]
        end_bar = sorted_pts[seg + 1][0]

        for bar in range(start_bar + 1, end_bar):
            if bar < 0 or bar >= len(df):
                continue

            line_val = slope * bar + intercept
            local_atr = float(atr[min(bar, len(atr) - 1)])
            if np.isnan(local_atr) or local_atr <= 0:
                local_atr = abs(line_val) * 0.015  # fallback
            threshold = violation_threshold_atr * local_atr

            total_bars += 1

            if line_type == "resistance":
                if close[bar] > line_val + threshold:
                    violation_bars += 1
            else:  # support
                if close[bar] < line_val - threshold:
                    violation_bars += 1

    if total_bars == 0:
        return 1.0

    return 1.0 - (violation_bars / total_bars)


# ===================================================================
# Module 2c: Visual Dominance Pivot Ranking
# ===================================================================

def _compute_visual_dominance(
    pivot: Tuple[int, float],
    all_same_type: List[Tuple[int, float]],
    df: pd.DataFrame,
    pivot_type: str,
) -> float:
    """
    Score how visually prominent a pivot is (0.0 to 1.0).

    Components:
    - local_extremity (0.35): Highest peak / lowest trough in +/-10 bar window
    - isolation (0.25): Distance to nearest same-type pivot
    - atr_score (0.20): How far from local mean relative to ATR
    - volume (0.20): Volume at pivot relative to average
    """
    idx, price = pivot
    n = len(df)

    # Local extremity: is this the most extreme in a 10-bar window?
    window = 10
    lo = max(0, idx - window)
    hi = min(n, idx + window + 1)
    if pivot_type == "high":
        local_extreme = float(df['high'].iloc[lo:hi].max())
        local_extremity = 1.0 if price >= local_extreme * 0.998 else 0.4
    else:
        local_extreme = float(df['low'].iloc[lo:hi].min())
        local_extremity = 1.0 if price <= local_extreme * 1.002 else 0.4

    # Isolation: distance to nearest same-type pivot (normalized by 20 bars)
    others = [p for p in all_same_type if p[0] != idx]
    if others:
        min_dist = min(abs(idx - p[0]) for p in others)
        isolation = min(1.0, min_dist / 20.0)
    else:
        isolation = 1.0

    # ATR score: how far from 10-bar close mean relative to ATR
    atr = _get_atr_series(df)
    local_atr = float(atr[min(idx, len(atr) - 1)])
    if np.isnan(local_atr) or local_atr <= 0:
        local_atr = abs(price) * 0.015
    close_lo = max(0, idx - 5)
    close_hi = min(n, idx + 6)
    mean_close = float(df['close'].iloc[close_lo:close_hi].mean())
    atr_score = min(1.0, abs(price - mean_close) / (2.0 * local_atr)) if local_atr > 0 else 0.5

    # Volume
    if 'volume_ratio' in df.columns and 0 <= idx < n:
        vol_ratio = float(df['volume_ratio'].iloc[idx])
        if np.isnan(vol_ratio):
            vol_ratio = 1.0
    else:
        vol_ratio = 1.0
    vol_score = min(1.0, max(0.0, (vol_ratio - 0.5) / 2.5))

    return 0.35 * local_extremity + 0.25 * isolation + 0.20 * atr_score + 0.20 * vol_score


def _rank_pivots_by_dominance(
    pivots: List[Tuple[int, float]],
    df: pd.DataFrame,
    pivot_type: str,
    max_pivots: int = 15,
) -> List[Tuple[int, float]]:
    """
    Rank pivots by visual dominance and return top max_pivots.

    Preserves chronological order in the returned list.
    Replaces the old 'distance from mean price' pre-filter.
    """
    if len(pivots) <= max_pivots:
        return list(pivots)

    scored = [
        (p, _compute_visual_dominance(p, pivots, df, pivot_type))
        for p in pivots
    ]
    scored.sort(key=lambda x: x[1], reverse=True)
    top = [s[0] for s in scored[:max_pivots]]
    top.sort(key=lambda p: p[0])  # restore chronological order
    return top


# ===================================================================
# Module 2d: Anchor-Pair Trendline Search
# ===================================================================

def _find_best_trendline_anchor(
    pivots: List[Tuple[int, float]],
    df: pd.DataFrame,
    line_type: str,
    min_touches: int = 3,
    max_deviation_atr_mult: float = 0.5,
    min_respect: float = 0.80,
    min_duration_bars: int = 15,
) -> Optional[TrendLine]:
    """
    Find best trendline using pairwise anchor search — mimics how humans draw.

    For each pair of pivots:
    1. Compute line through pair (anchor points)
    2. Find all other pivots within tolerance (confirming touches)
    3. Validate that price respects the line between touches
    4. Score by touches × respect × sqrt(duration)
    5. Refit Theil-Sen on winning inlier set

    O(N² × M) where N ≈ 15 pivots, M ≈ window size — instant.
    """
    if len(pivots) < min_touches:
        return None

    atr = _get_atr_series(df)

    # Rank by visual dominance — keep the pivots a human would notice
    ranked = _rank_pivots_by_dominance(
        pivots, df,
        "high" if line_type == "resistance" else "low",
        max_pivots=15,
    )

    if len(ranked) < min_touches:
        return None

    best_score = -1.0
    best_candidate = None  # (inliers, slope, intercept)

    n_pts = len(ranked)
    for i in range(n_pts):
        for j in range(i + 1, n_pts):
            idx_a, price_a = ranked[i]
            idx_b, price_b = ranked[j]

            dx = idx_b - idx_a
            if dx < min_duration_bars:
                continue

            # Line through anchor pair
            slope = (price_b - price_a) / dx
            intercept = price_a - slope * idx_a

            # Find confirming touches (all pivots within tolerance of the line)
            inliers = []
            for p in ranked:
                p_idx, p_price = p
                line_val = slope * p_idx + intercept
                local_atr = float(atr[min(p_idx, len(atr) - 1)])
                if np.isnan(local_atr) or local_atr <= 0:
                    local_atr = abs(line_val) * 0.015
                deviation = abs(p_price - line_val)
                if deviation <= max_deviation_atr_mult * local_atr:
                    inliers.append(p)

            if len(inliers) < min_touches:
                continue

            # Line respect validation
            respect = _compute_line_respect(
                slope, intercept, inliers, df, line_type,
            )
            if respect < min_respect:
                continue

            # R² of inliers on this line
            ix = np.array([p[0] for p in inliers], dtype=float)
            iy = np.array([p[1] for p in inliers], dtype=float)
            fitted = slope * ix + intercept
            ss_res = float(np.sum((iy - fitted) ** 2))
            ss_tot = float(np.sum((iy - np.mean(iy)) ** 2))
            r_sq = 1.0 - ss_res / ss_tot if ss_tot > 1e-10 else 1.0

            # Duration = span of all inliers (not just anchors)
            duration = max(p[0] for p in inliers) - min(p[0] for p in inliers)

            # Score: touches × respect × sqrt(duration capped at 80) × (1 + 0.5*R²)
            score = len(inliers) * respect * np.sqrt(min(max(1, duration), 80)) * (1.0 + 0.5 * max(0, r_sq))

            if score > best_score:
                best_score = score
                best_candidate = (list(inliers), slope, intercept, r_sq, respect)

    if best_candidate is None:
        return None

    inliers, slope, intercept, r_sq, respect = best_candidate

    # Refit Theil-Sen on winning inlier set for clean final line
    if len(inliers) >= 3:
        ix = np.array([p[0] for p in inliers], dtype=float)
        iy = np.array([p[1] for p in inliers], dtype=float)
        try:
            ts_result = theilslopes(iy, ix)
            new_slope = float(ts_result[0])
            new_intercept = float(ts_result[1])

            # Re-validate respect on refined line
            new_respect = _compute_line_respect(
                new_slope, new_intercept, inliers, df, line_type,
            )
            if new_respect >= min_respect:
                slope = new_slope
                intercept = new_intercept
                respect = new_respect
                # Recompute R²
                fitted = slope * ix + intercept
                ss_res = float(np.sum((iy - fitted) ** 2))
                ss_tot = float(np.sum((iy - np.mean(iy)) ** 2))
                r_sq = 1.0 - ss_res / ss_tot if ss_tot > 1e-10 else 1.0
        except (ValueError, IndexError):
            pass  # Keep anchor-pair line

    return TrendLine(
        slope=slope,
        intercept=intercept,
        r_squared=r_sq,
        points=inliers,
        start_idx=int(min(p[0] for p in inliers)),
        end_idx=int(max(p[0] for p in inliers)),
        respect_ratio=respect,
    )



# ===================================================================
# Module 3: ATR-Normalized Pattern Classification
# ===================================================================

def _classify_slope(
    slope_pct_per_bar: float, atr_pct_per_bar: float, duration: int = 50,
) -> str:
    """
    Classify a trendline slope using TOTAL movement in ATR units.

    A line is "flat" if its total movement over the pattern duration
    is less than 1.5 ATR. This prevents long patterns (91+ bars)
    from accumulating visible slopes while still being called "flat".

    Examples:
      20-bar pattern: flat if slope < 0.075 ATR/bar (generous for short)
      50-bar pattern: flat if slope < 0.030 ATR/bar (matches old threshold)
      91-bar pattern: flat if slope < 0.016 ATR/bar (stricter for long)
    """
    if atr_pct_per_bar <= 0:
        return "flat"

    normalized_per_bar = slope_pct_per_bar / atr_pct_per_bar
    total_movement_atr = abs(normalized_per_bar) * max(duration, 1)

    if total_movement_atr < 1.5:
        return "flat"
    elif normalized_per_bar > 0:
        return "rising"
    else:
        return "falling"


def _convergence_ratio(
    support_line: TrendLine, resistance_line: TrendLine, current_bar: int,
) -> float:
    """
    How fast the two trendlines converge.

    ratio = height_at_start / height_at_end
    > 3.0: Very tight (imminent breakout)
    2.0-3.0: Normal convergence
    ~1.0: Parallel (channel)
    """
    start = max(support_line.start_idx, resistance_line.start_idx)
    height_start = resistance_line.value_at(start) - support_line.value_at(start)
    height_end = resistance_line.value_at(current_bar) - support_line.value_at(current_bar)

    if height_end <= 0:
        return 0.0  # Trendlines have crossed — invalid consolidation geometry
    return height_start / height_end if height_start > 0 else 1.0


def classify_pattern(
    support_line: TrendLine,
    resistance_line: TrendLine,
    current_bar_idx: int,
    df: Optional[pd.DataFrame] = None,
    interval: str = '1d',
) -> Optional[PatternResult]:
    """Classify a pattern using ATR-normalized slopes and convergence ratio."""
    pattern_start = max(support_line.start_idx, resistance_line.start_idx)
    pattern_end = min(support_line.end_idx, resistance_line.end_idx)
    duration = pattern_end - pattern_start

    if duration < 10:
        return None

    breakout_level = resistance_line.value_at(current_bar_idx)
    support_level = support_line.value_at(current_bar_idx)
    pattern_height = breakout_level - support_level

    if pattern_height <= 0:
        return None

    # Per-line minimum touch validation (Bulkowski: 3 on one line, 2 on other)
    if support_line.num_touches < 2 or resistance_line.num_touches < 2:
        return None
    if support_line.num_touches + resistance_line.num_touches < 5:
        return None

    # Get ATR for volatility-normalized classification
    avg_price = (breakout_level + support_level) / 2
    atr_pct = 1.5  # Default: 1.5% daily volatility

    if df is not None and 'atr_14' in df.columns:
        atr_vals = df['atr_14'].iloc[pattern_start:current_bar_idx + 1].dropna()
        if len(atr_vals) > 0:
            median_atr = float(atr_vals.median())
            if avg_price > 0 and median_atr > 0:
                atr_pct = median_atr / avg_price * 100

    # Classify slopes relative to volatility
    res_slope_pct = resistance_line.pct_slope_per_bar
    sup_slope_pct = support_line.pct_slope_per_bar
    res_class = _classify_slope(res_slope_pct, atr_pct, duration)
    sup_class = _classify_slope(sup_slope_pct, atr_pct, duration)

    conv_ratio = _convergence_ratio(support_line, resistance_line, current_bar_idx)

    # Reject if trendlines have crossed (invalid geometry)
    if conv_ratio <= 0:
        return None

    # --- Classification ---
    pattern_type = None

    if res_class == "flat" and sup_class == "rising":
        pattern_type = "ascending_triangle"
    elif res_class == "flat" and sup_class == "flat":
        pattern_type = "horizontal_channel"
    elif res_class == "falling" and sup_class == "rising":
        if conv_ratio > 1.3:
            pattern_type = "symmetrical_triangle"
    elif res_class == "falling" and sup_class == "falling":
        # Both falling — falling wedge if resistance falls faster (more negative = converging)
        if res_slope_pct < sup_slope_pct and conv_ratio > 1.3:
            pattern_type = "falling_wedge"
    elif res_class == "rising" and sup_class == "rising":
        pattern_type = "bull_flag"

    # Bull flag requires sharp prior impulse (continuation pattern)
    if df is not None and pattern_type == "bull_flag":
        pre_flag_bars = int(50 * _tf_scale(interval))
        impulse_start = max(0, pattern_start - pre_flag_bars)
        if impulse_start < pattern_start:
            pre_low = float(df['low'].iloc[impulse_start:pattern_start].min())
            pre_high = float(df['high'].iloc[impulse_start:pattern_start].max())
            if pre_low > 0:
                impulse_gain = (pre_high - pre_low) / pre_low
                if impulse_gain < 0.10:
                    pattern_type = None  # No qualifying impulse

    if pattern_type is None:
        return None

    # --- ATR-adaptive minimum durations ---
    # Volatile stocks form patterns faster
    volatility_factor = max(0.6, min(1.5, 1.0 / max(0.5, atr_pct / 1.5)))
    _base_durations = {
        "ascending_triangle": 25,
        "symmetrical_triangle": 25,
        "horizontal_channel": 20,
        "falling_wedge": 25,
        "bull_flag": 10,
    }
    min_dur = int(_base_durations.get(pattern_type, 10) * volatility_factor)
    if duration < min_dur:
        return None

    # --- Maximum durations ---
    # Patterns beyond these limits are trend channels, not consolidation patterns.
    _max_durations = {
        "bull_flag": 65,           # Bulkowski: flags are short (5-25 bars typical, 65 max)
        "falling_wedge": 150,      # Wedges can be longer but not entire downtrends
        "ascending_triangle": 120,
        "symmetrical_triangle": 120,
        "horizontal_channel": 120,
    }
    max_dur = _max_durations.get(pattern_type, 150)
    if duration > max_dur:
        return None

    # --- Quality scoring ---
    total_touches = support_line.num_touches + resistance_line.num_touches

    # Graduated touch score
    if total_touches <= 4:
        touch_score = total_touches * 4.0
    elif total_touches <= 6:
        touch_score = 16.0 + (total_touches - 4) * 6.0
    elif total_touches <= 8:
        touch_score = 28.0 + (total_touches - 6) * 5.0
    else:
        touch_score = min(44.0, 38.0 + (total_touches - 8) * 3.0)

    # Duration "Goldilocks zone" — 4-8 weeks (30-60 daily bars) is optimal
    # Scale thresholds for timeframe (e.g. weekly has fewer bars per week)
    _sc = _tf_scale(interval)
    d15 = int(15 * _sc)
    d60 = int(60 * _sc)
    d100 = int(100 * _sc)
    if duration <= d15:
        duration_score = duration * (0.5 / max(_sc, 0.01))  # Immature: low score
    elif duration <= d60:
        duration_score = 15 + min(20, (duration - d15) * (0.45 / max(_sc, 0.01)))  # Optimal
    elif duration <= d100:
        duration_score = 35 - (duration - d60) * (0.15 / max(_sc, 0.01))  # Aging
    else:
        duration_score = max(10, 29 - (duration - d100) * (0.1 / max(_sc, 0.01)))  # Very old

    # ATR-normalized tightness (cross-stock comparable)
    median_atr = avg_price * 0.015  # fallback
    if df is not None and 'atr_14' in df.columns:
        atr_vals = df['atr_14'].iloc[pattern_start:current_bar_idx + 1].dropna()
        if len(atr_vals) > 0:
            median_atr = float(atr_vals.median())
    height_in_atr = pattern_height / median_atr if median_atr > 0 else 3.0
    if 2.0 <= height_in_atr <= 6.0:
        tight_score = 30.0
    elif height_in_atr < 2.0:
        tight_score = 15.0
    else:
        tight_score = max(5.0, 30.0 - (height_in_atr - 6.0) * 5.0)

    quality = touch_score + duration_score + tight_score

    # Convergence quality (triangles with good convergence)
    if pattern_type in ("ascending_triangle", "symmetrical_triangle", "falling_wedge"):
        if 2.0 <= conv_ratio <= 4.0:
            quality += 10.0
        elif 1.5 <= conv_ratio < 2.0:
            quality += 5.0

    # Horizontal channel: reward tight parallel lines
    if pattern_type == "horizontal_channel":
        if conv_ratio < 1.15:
            quality += 5.0

    # Trendline fit quality — reward good fit, PENALIZE poor fit
    avg_r_sq = (support_line.r_squared + resistance_line.r_squared) / 2
    min_r_sq = min(support_line.r_squared, resistance_line.r_squared)
    if avg_r_sq > 0.95:
        quality += 0.0    # Overfitted — likely noise; no bonus
    elif avg_r_sq > 0.90:
        quality += 6.0    # Excellent fit — peak bonus
    elif avg_r_sq > 0.85:
        quality += 4.0    # Strong fit
    elif avg_r_sq > 0.80:
        quality += 2.0    # Good fit
    # Penalize if EITHER line has poor fit
    if min_r_sq < 0.60:
        quality -= 20.0   # Terrible fit — one line is nearly random
    elif min_r_sq < 0.70:
        quality -= 12.0
    elif min_r_sq < 0.80:
        quality -= 5.0

    # Body-touch quality (line-type-aware)
    if df is not None and 'open' in df.columns:
        body_touch_count = 0
        total_touch_points = 0
        for line, ltype in [(support_line, "support"), (resistance_line, "resistance")]:
            for pt_idx, pt_price in line.points:
                if 0 <= pt_idx < len(df):
                    bar_open = float(df['open'].iloc[pt_idx])
                    bar_close = float(df['close'].iloc[pt_idx])
                    body_top = max(bar_open, bar_close)
                    body_bot = min(bar_open, bar_close)
                    bar_low = float(df['low'].iloc[pt_idx])
                    bar_high = float(df['high'].iloc[pt_idx])
                    line_val = line.value_at(pt_idx)
                    total_touch_points += 1
                    # Body passes through line (universal)
                    if body_bot <= line_val <= body_top:
                        body_touch_count += 1
                    # Support: wick low tests support (hammers bounce off support)
                    elif ltype == "support" and bar_low <= line_val <= body_bot:
                        body_touch_count += 1
                    # Resistance: wick high tests resistance (shooting stars rejected)
                    elif ltype == "resistance" and body_top <= line_val <= bar_high:
                        body_touch_count += 1
        if total_touch_points > 0:
            body_ratio = body_touch_count / total_touch_points
            if body_ratio >= 0.5:
                quality += 10
            elif body_ratio >= 0.25:
                pass  # Acceptable but no bonus
            elif body_ratio > 0:
                quality -= 15  # Mostly wick touches
            else:
                return None  # Zero body touches — trendlines not interacting with candle bodies

    # Candlestick-validated touches
    candle_confirmed = 0
    if df is not None:
        sup_ct = _count_candlestick_touches(support_line, df, "support")
        res_ct = _count_candlestick_touches(resistance_line, df, "resistance")
        candle_confirmed = sup_ct + res_ct
        quality += min(20, candle_confirmed * 4)

    # Volume decline during consolidation
    vol_declining = False
    if df is not None and 'volume' in df.columns:
        p_start = max(0, pattern_start)
        p_end = min(len(df) - 1, pattern_end)
        quarter = max(1, (p_end - p_start) // 4)
        q_vols = []
        for q in range(4):
            qs = p_start + q * quarter
            qe = min(qs + quarter, p_end)
            if qs < qe:
                q_vols.append(float(df['volume'].iloc[qs:qe].mean()))
        if len(q_vols) == 4 and q_vols[0] > 0:
            # Pattern-type-specific volume decline (Bulkowski standards)
            _TRIANGLE_PATTERNS = {"ascending_triangle", "symmetrical_triangle", "falling_wedge"}
            if pattern_type in _TRIANGLE_PATTERNS:
                # Triangles: volume declines 78-86% — require ALL 3 transitions + steeper overall
                declining_transitions = sum(
                    1 for i in range(3) if q_vols[i + 1] <= q_vols[i] * 1.05
                )
                overall_decline = q_vols[3] < q_vols[0] * 0.65
                if declining_transitions >= 3 and overall_decline:
                    quality += 10
                    vol_declining = True
            else:
                # Non-triangle (channel, flag): original 2/3 standard
                declining_transitions = sum(
                    1 for i in range(3) if q_vols[i + 1] <= q_vols[i] * 1.10
                )
                overall_decline = q_vols[3] < q_vols[0] * 0.80
                if declining_transitions >= 2 and overall_decline:
                    quality += 10
                    vol_declining = True

    # Line respect quality — does price stay on the correct side?
    avg_respect = 1.0
    if df is not None:
        sup_respect = _compute_line_respect(
            support_line.slope, support_line.intercept,
            support_line.points, df, "support",
        )
        res_respect = _compute_line_respect(
            resistance_line.slope, resistance_line.intercept,
            resistance_line.points, df, "resistance",
        )
        avg_respect = (sup_respect + res_respect) / 2

        # Hard reject: price routinely violates trendlines → not a real pattern
        # Production standard (Trendoscope): 100% containment; we use 90% minimum
        if avg_respect < 0.90:
            return None

        if avg_respect >= 0.97:
            quality += 15.0
        elif avg_respect >= 0.95:
            quality += 12.0
        elif avg_respect >= 0.92:
            quality += 8.0
        elif avg_respect >= 0.90:
            quality += 3.0

    # Validate pivot sequence matches claimed pattern structure
    if df is not None:
        pivot_adj = _validate_pivot_sequence(
            pattern_type, resistance_line, support_line, df,
        )
        quality += pivot_adj

    # Breakout proximity — how close price is to resistance (readiness scoring)
    # Production standard (Stocklytics): 30% of total score = breakout readiness
    if df is not None and current_bar_idx < len(df):
        current_close = float(df['close'].iloc[current_bar_idx])
        distance_to_breakout = breakout_level - current_close
        pattern_range = breakout_level - support_level
        if pattern_range > 0:
            proximity_pct = 1.0 - (distance_to_breakout / pattern_range)
            # Reward price in top 25% of pattern range (near resistance)
            if proximity_pct >= 0.85:
                quality += 10.0  # Very close to breakout
            elif proximity_pct >= 0.75:
                quality += 5.0   # Approaching resistance

    return PatternResult(
        pattern_type=pattern_type,
        support_line=support_line,
        resistance_line=resistance_line,
        duration_bars=duration,
        breakout_level=round(breakout_level, 2),
        support_level=round(support_level, 2),
        pattern_height=round(pattern_height, 2),
        quality_score=round(quality, 1),
        volume_declining=vol_declining,
        candle_confirmed_touches=candle_confirmed,
        respect_ratio=round(avg_respect, 3),
    )


# ===================================================================
# Module 5b: Pivot Sequence Validation (Structure-First)
# ===================================================================

def _validate_pivot_sequence(
    pattern_type: str,
    resistance_line: 'TrendLine',
    support_line: 'TrendLine',
    df: pd.DataFrame,
) -> float:
    """
    Post-classification check: do the actual pivot points structurally
    match the claimed pattern type?

    Fits a linear trend to peak prices (resistance touches) and trough
    prices (support touches) separately, then checks whether those
    trends are consistent with the pattern label.

    Returns: quality adjustment (-10 to +8).
    """
    from numpy.polynomial.polynomial import polyfit

    res_points = resistance_line.points
    sup_points = support_line.points

    if len(res_points) < 2 or len(sup_points) < 2:
        return 0.0

    res_x = np.array([p[0] for p in res_points], dtype=float)
    res_y = np.array([p[1] for p in res_points], dtype=float)
    sup_x = np.array([p[0] for p in sup_points], dtype=float)
    sup_y = np.array([p[1] for p in sup_points], dtype=float)

    # Normalize x to [0, 1] for stable regression
    x_min = min(res_x.min(), sup_x.min())
    x_range = max(res_x.max(), sup_x.max()) - x_min
    if x_range <= 0:
        return 0.0
    res_x_norm = (res_x - x_min) / x_range
    sup_x_norm = (sup_x - x_min) / x_range

    # Linear fit: y = a + b*x  (slope = b = price change over full span)
    res_coef = polyfit(res_x_norm, res_y, 1)
    sup_coef = polyfit(sup_x_norm, sup_y, 1)
    res_slope = res_coef[1]
    sup_slope = sup_coef[1]

    # Normalize slopes by average price for cross-stock comparison
    avg_price = (res_y.mean() + sup_y.mean()) / 2
    if avg_price <= 0:
        return 0.0
    res_slope_pct = res_slope / avg_price
    sup_slope_pct = sup_slope / avg_price

    FLAT = 0.02  # ±2% total movement = flat

    if pattern_type == "ascending_triangle":
        peaks_flat = abs(res_slope_pct) < FLAT
        troughs_rising = sup_slope_pct > FLAT
        if peaks_flat and troughs_rising:
            return 8.0
        elif peaks_flat or troughs_rising:
            return 0.0
        return -10.0

    elif pattern_type == "symmetrical_triangle":
        peaks_falling = res_slope_pct < -FLAT
        troughs_rising = sup_slope_pct > FLAT
        if peaks_falling and troughs_rising:
            return 8.0
        elif peaks_falling or troughs_rising:
            return 0.0
        return -10.0

    elif pattern_type == "falling_wedge":
        both_falling = res_slope_pct < -FLAT and sup_slope_pct < -FLAT
        res_faster = res_slope_pct < sup_slope_pct
        if both_falling and res_faster:
            return 8.0
        elif both_falling:
            return 0.0
        return -10.0

    elif pattern_type == "horizontal_channel":
        peaks_flat = abs(res_slope_pct) < FLAT
        troughs_flat = abs(sup_slope_pct) < FLAT
        if peaks_flat and troughs_flat:
            return 8.0
        elif peaks_flat or troughs_flat:
            return 0.0
        return -10.0

    elif pattern_type == "bull_flag":
        both_rising = res_slope_pct > 0 and sup_slope_pct > 0
        if both_rising:
            return 5.0
        return -5.0

    return 0.0


# ===================================================================
# Module 6a: Liquidity Sweep Detection
# ===================================================================

def _detect_liquidity_sweep(
    df: pd.DataFrame,
    bar_idx: int,
    pattern: PatternResult,
) -> Tuple[bool, float]:
    """
    Check if a liquidity sweep occurred before the breakout.

    Logic (adapted from ZiadFrancis/BreakOutLiquiditySweep):
    1. Find the most recent swing low BEFORE the pattern started (PL1)
    2. Find the lowest low WITHIN the pattern (PL2)
    3. If PL2 < PL1 → sellers were trapped below PL1 then price recovered
       → "liquidity fuel" exists for the breakout

    Returns:
        (sweep_detected, sweep_depth) where sweep_depth is in ATR multiples.
    """
    pattern_start = max(
        pattern.support_line.start_idx,
        pattern.resistance_line.start_idx,
    )

    # Find swing lows in the 30 bars before pattern start
    pre_start = max(0, pattern_start - 30)
    if pre_start >= pattern_start or pattern_start < 2:
        return False, 0.0

    # Simple swing-low detection: bar whose low is <= both neighbors
    swing_lows_before = []
    for idx in range(pre_start + 1, pattern_start):
        if idx <= 0 or idx >= len(df) - 1:
            continue
        if (float(df['low'].iloc[idx]) <= float(df['low'].iloc[idx - 1])
                and float(df['low'].iloc[idx]) <= float(df['low'].iloc[idx + 1])):
            swing_lows_before.append(float(df['low'].iloc[idx]))

    if not swing_lows_before:
        return False, 0.0

    pl1_price = swing_lows_before[-1]  # Most recent pre-pattern swing low

    # PL2: lowest low within the pattern
    pattern_end = min(
        pattern.support_line.end_idx,
        pattern.resistance_line.end_idx,
    )
    pattern_end = min(pattern_end, len(df) - 1)
    if pattern_start >= pattern_end:
        return False, 0.0

    pl2_price = float(df['low'].iloc[pattern_start:pattern_end + 1].min())

    # Sweep condition: price swept below pre-pattern support
    if pl2_price >= pl1_price:
        return False, 0.0

    # Measure sweep depth in ATR
    atr_val = float(df['atr_14'].iloc[bar_idx]) if 'atr_14' in df.columns else pl1_price * 0.02
    if pd.isna(atr_val) or atr_val <= 0:
        atr_val = pl1_price * 0.02

    sweep_depth = (pl1_price - pl2_price) / atr_val
    return True, round(sweep_depth, 2)


# ===================================================================
# Module 6b: Breakout Detection (ATR-Adaptive)
# ===================================================================

def detect_breakout(
    df: pd.DataFrame,
    bar_idx: int,
    pattern: PatternResult,
    volume_mult: float = 1.3,
) -> Optional[BreakoutSignal]:
    """Check whether *bar_idx* is a valid breakout from *pattern*."""
    if bar_idx < 1 or bar_idx >= len(df):
        return None

    curr = df.iloc[bar_idx]
    prev = df.iloc[bar_idx - 1]

    close = float(curr['close'])
    high = float(curr['high'])
    low = float(curr['low'])
    open_ = float(curr['open'])
    prev_close = float(prev['close'])
    breakout_level = pattern.breakout_level

    # Apex-relative breakout position for triangles (Bulkowski: 60-74% optimal)
    _TRIANGLE_TYPES = {"ascending_triangle", "symmetrical_triangle", "falling_wedge"}
    if (pattern.pattern_type in _TRIANGLE_TYPES
            and pattern.support_line is not None
            and pattern.resistance_line is not None):
        slope_diff = pattern.resistance_line.slope - pattern.support_line.slope
        if slope_diff < -1e-10:  # Lines converge
            intercept_diff = pattern.support_line.intercept - pattern.resistance_line.intercept
            apex_bar = intercept_diff / (-slope_diff)
            pattern_start = max(pattern.support_line.start_idx, pattern.resistance_line.start_idx)
            apex_distance = apex_bar - pattern_start
            if apex_distance > 5:
                position_pct = (bar_idx - pattern_start) / apex_distance
                if position_pct < 0.50 or position_pct > 0.85:
                    return None

    # Get ATR for adaptive thresholds
    atr = float(curr.get('atr_14', close * 0.02))
    if pd.isna(atr) or atr <= 0:
        atr = close * 0.02

    # Absolute volume minimum (50k shares for NSE)
    curr_volume = float(curr.get('volume', 0))
    if curr_volume < 50000:
        return None

    # 1. Close above resistance
    if close <= breakout_level:
        return None

    # 2. Fresh break: previous bar was below or near resistance
    prev_resistance = pattern.resistance_line.value_at(bar_idx - 1)
    if prev_close > prev_resistance + 0.5 * atr:
        return None

    # 3. ATR-based chase limit (don't chase if >1.0 ATR above breakout)
    if close > breakout_level + 1.0 * atr:
        return None

    # 3b. Gap-up rejection — too extended to enter safely
    if open_ > breakout_level + 1.5 * atr:
        return None

    # 4. Volume confirmation (slightly stricter in low-vol environments)
    vol_ratio = curr.get('volume_ratio', 0)
    if pd.isna(vol_ratio):
        return None
    atr_pct = atr / close if close > 0 else 0.02
    if atr_pct < 0.015:
        vol_threshold = volume_mult * 1.15  # Low-vol: need stronger volume
    elif atr_pct > 0.03:
        vol_threshold = volume_mult * 0.92  # High-vol: slightly relaxed
    else:
        vol_threshold = volume_mult
    if vol_ratio < vol_threshold:
        return None

    # 5. Breakout candle quality: strong body + close position in range
    bar_range = high - low
    body_pct = float(curr.get('body_pct', 0.5))
    if pd.isna(body_pct):
        body_pct = 0.5
    # Weak body candle = not a conviction breakout
    if body_pct < 0.50:
        return None
    if bar_range > 0:
        close_position = (close - low) / bar_range
        if body_pct >= 0.70:
            if close_position < 0.65:  # Strong body: close in top 35%
                return None
        else:
            if close_position < 0.60:  # Moderate body: close in top 40%
                return None

    # 6. Wick rejection hard gate: upper wick dominates → price rejected at resistance
    body = abs(close - open_)
    if body_pct < 0.50 or (body > 0 and (high - max(close, open_)) > body * 2.0):
        return None

    # 7. Pre-breakout momentum: at least 2 of last 3 bars show buying pressure
    if bar_idx >= 4:
        momentum_count = 0
        for j in range(1, 4):
            prev_bar = df.iloc[bar_idx - j]
            if float(prev_bar['close']) > float(prev_bar['open']):
                momentum_count += 1
            elif float(prev_bar['close']) > float(df.iloc[bar_idx - j - 1]['close']):
                momentum_count += 1
        if momentum_count < 2:
            return None  # No buying momentum leading into breakout

    # 8. Pre-breakout volume context: market was "waking up" before breakout
    if bar_idx >= 4 and 'volume_sma_20' in df.columns:
        recent_vols = [float(df['volume'].iloc[bar_idx - j]) for j in range(1, 4)]
        vol_sma_val = float(df['volume_sma_20'].iloc[bar_idx])
        if vol_sma_val > 0 and not pd.isna(vol_sma_val):
            avg_recent_vol_ratio = sum(recent_vols) / (3 * vol_sma_val)
            if avg_recent_vol_ratio < 0.7:
                return None  # Dead volume before breakout

    # --- Stop and target ---
    # Stop below recent swing low (lowest low in last 20 bars) with 0.5 ATR buffer
    lookback = min(20, bar_idx)
    recent_swing_low = float(df['low'].iloc[bar_idx - lookback:bar_idx + 1].min())
    stop = recent_swing_low - 0.5 * atr

    # Max stop: 2.0 ATR below entry
    max_stop_distance = 2.0 * atr
    if close - stop > max_stop_distance:
        stop = close - max_stop_distance

    # Target: measured move
    target = close + pattern.pattern_height

    risk = close - stop
    if risk <= 0:
        return None
    if (target - close) / risk < 1.5:
        target = close + 2.0 * risk

    # Compute breakout alpha score
    alpha, alpha_reasons = _compute_breakout_alpha(df, bar_idx, breakout_level)

    # 9. Liquidity sweep check — trapped traders provide fuel for breakout
    sweep_detected, sweep_depth = _detect_liquidity_sweep(df, bar_idx, pattern)

    return BreakoutSignal(
        pattern=pattern,
        entry_price=round(close, 2),
        stop_loss=round(stop, 2),
        target=round(target, 2),
        volume_ratio=round(float(vol_ratio), 1),
        alpha_score=round(alpha, 1),
        alpha_reasons=alpha_reasons,
        sweep_detected=sweep_detected,
        sweep_depth=sweep_depth,
    )


def _compute_breakout_alpha(
    df: pd.DataFrame, bar_idx: int, breakout_level: float,
) -> Tuple[float, list]:
    """Breakout alpha score — trader's conviction check.

    Scores factors NOT already gated by detect_breakout() or strategy gates.
    Range: approximately -8 to +10.
    """
    if bar_idx < 3 or bar_idx >= len(df):
        return 0.0, []

    curr = df.iloc[bar_idx]
    score = 0.0
    reasons = []

    close = float(curr['close'])
    high = float(curr['high'])
    open_ = float(curr['open'])
    body = abs(close - open_)
    body_pct = float(curr.get('body_pct', 0))

    # 1. Candle quality bonus (conviction candles)
    if bool(curr.get('candle_three_white_soldiers', False)):
        score += 5
        reasons.append("Three White Soldiers (+5)")
    elif bool(curr.get('candle_engulfing_bull', False)):
        score += 3
        reasons.append("Bullish Engulfing (+3)")
    elif bool(curr.get('candle_morning_star', False)):
        score += 3
        reasons.append("Morning Star (+3)")

    # 2. Volume trend into breakout
    if bar_idx >= 3:
        vols = [float(df['volume'].iloc[bar_idx - j]) for j in range(3, -1, -1)]
        if all(v > 0 for v in vols):
            rising = all(vols[j + 1] >= vols[j] * 0.95 for j in range(3))
            if rising:
                score += 5
                reasons.append("Rising volume into breakout (+5)")
            declining = all(vols[j + 1] <= vols[j] * 0.90 for j in range(3))
            if declining:
                score -= 3
                reasons.append("Declining volume into breakout (-3)")

    # 3. Wick rejection (only when body is weak)
    if body_pct < 0.60 and body > 0:
        upper_wick = high - max(close, open_)
        if upper_wick > body * 1.5:
            score -= 5
            reasons.append(f"Wick rejection {upper_wick / body:.1f}x body (-5)")

    return round(score, 1), reasons


# ===================================================================
# Module 4: ATR-Adaptive Reversal Patterns
# ===================================================================

def _atr_tolerance(df: pd.DataFrame, pivot_indices: List[int], multiplier: float = 0.5) -> float:
    """Compute tolerance as multiplier * median ATR at pivot locations."""
    if 'atr_14' not in df.columns:
        return float(df['close'].mean()) * 0.015

    atrs = []
    for idx in pivot_indices:
        if 0 <= idx < len(df):
            atr_val = float(df['atr_14'].iloc[idx])
            if not np.isnan(atr_val) and atr_val > 0:
                atrs.append(atr_val)

    if not atrs:
        return float(df['close'].mean()) * 0.015

    return float(np.median(atrs)) * multiplier


def _volume_profile(df: pd.DataFrame, start: int, end: int) -> float:
    """Average volume ratio in a bar range."""
    if df is None or 'volume' not in df.columns:
        return 1.0
    start = max(0, start)
    end = min(len(df), end)
    if start >= end:
        return 1.0
    vol_sma = df.get('volume_sma_20')
    if vol_sma is not None:
        vols = df['volume'].iloc[start:end].values.astype(float)
        sma = vol_sma.iloc[start:end].values.astype(float)
        mask = sma > 0
        if mask.any():
            return float(np.nanmean(vols[mask] / sma[mask]))
    return 1.0


def _validate_prior_downtrend(
    df: pd.DataFrame,
    pattern_start_idx: int,
    pattern_low_price: float,
    min_decline_pct: float = 0.10,
    lookback_bars: int = 120,
    interval: str = '1d',
) -> Tuple[bool, float]:
    """
    Validate that a genuine downtrend preceded a reversal pattern.

    Checks two conditions (either is sufficient):
    1. Price declined >= min_decline_pct from a prior swing high to the
       pattern's lowest point.
    2. Price was below the 200-EMA when the pattern started forming.

    Returns:
        (is_valid, decline_pct) — whether a prior downtrend exists and
        how much price declined from the prior high to the pattern low.
    """
    if pattern_start_idx < 10:
        return False, 0.0

    # Scale lookback for timeframe
    effective_lookback = int(lookback_bars * _tf_scale(interval))
    # Lookback window: up to lookback_bars before pattern start
    lb_start = max(0, pattern_start_idx - effective_lookback)
    lb_end = pattern_start_idx

    # Find the highest close in the lookback window (prior swing high)
    prior_highs = df['high'].iloc[lb_start:lb_end]
    if len(prior_highs) == 0:
        return False, 0.0

    prior_high = float(prior_highs.max())
    if prior_high <= 0:
        return False, 0.0

    # Condition 1: price declined from prior high to pattern low
    decline_pct = (prior_high - pattern_low_price) / prior_high
    if decline_pct >= min_decline_pct:
        return True, decline_pct

    # Condition 2: price was below 200-EMA at pattern start
    if 'ema_200' in df.columns and pattern_start_idx < len(df):
        ema_val = df['ema_200'].iloc[pattern_start_idx]
        price_at_start = float(df['close'].iloc[pattern_start_idx])
        if not pd.isna(ema_val) and price_at_start < ema_val:
            return True, decline_pct

    return False, decline_pct


def detect_double_bottom(
    peaks: List[Tuple[int, float]],
    troughs: List[Tuple[int, float]],
    df: pd.DataFrame,
    current_bar: int,
    price_tolerance: float = 0.015,
    min_duration: int = 20,
    max_duration: int = 300,
) -> Optional[PatternResult]:
    """
    Detect Double Bottom pattern using ATR-adaptive tolerances.

    Two swing lows at similar price (within ATR tolerance), separated by
    a swing high (neckline). Bulkowski: 68-78% WR, avg rise +40%.
    """
    if len(troughs) < 2 or len(peaks) < 1:
        return None

    current_price = float(df['close'].iloc[current_bar])
    best_candidate: Optional[PatternResult] = None

    for i in range(len(troughs) - 1, 0, -1):
        t2_idx, t2_price = troughs[i]

        # Recency check — allow patterns up to 120 bars back
        if current_bar - t2_idx > 120:
            continue

        for j in range(i - 1, max(i - 6, -1), -1):
            t1_idx, t1_price = troughs[j]

            duration = t2_idx - t1_idx
            if duration < min_duration or duration > max_duration:
                continue

            # ATR-adaptive tolerance: bottoms within 0.75 * median_ATR
            tol = _atr_tolerance(df, [t1_idx, t2_idx], multiplier=0.75)
            if abs(t1_price - t2_price) > tol:
                continue

            # Find neckline peak between troughs (use strongest peak, not just highest)
            neckline_peaks = [p for p in peaks if t1_idx < p[0] < t2_idx]
            if not neckline_peaks:
                continue

            neckline_peak = max(neckline_peaks, key=lambda p: p[1])
            neckline_level = neckline_peak[1]
            avg_trough = (t1_price + t2_price) / 2
            pattern_depth = neckline_level - min(t1_price, t2_price)

            if pattern_depth <= 0:
                continue

            # Min depth: >= 1.0 * ATR (adaptive) AND >= 5% (Bulkowski: meaningful reversal)
            depth_atr = _atr_tolerance(df, [t1_idx, t2_idx], multiplier=1.0)
            if pattern_depth < depth_atr:
                continue
            depth_pct = pattern_depth / neckline_level
            if depth_pct < 0.05:
                continue

            # Prior downtrend validation — reversal must reverse something
            dt_valid, dt_decline = _validate_prior_downtrend(
                df, t1_idx, min(t1_price, t2_price),
            )
            if not dt_valid:
                continue

            # W-shape validation: bounce between troughs must be >= 10% of trough price
            # (Bulkowski: clear rally between bottoms, not a flat base)
            bounce_height = neckline_level - avg_trough
            if bounce_height <= 0:
                continue
            bounce_from_trough_pct = bounce_height / avg_trough
            if bounce_from_trough_pct < 0.10:
                continue
            retrace_pct = bounce_height / pattern_depth
            if retrace_pct < 0.40:
                continue

            # Relevance: current price near neckline (ATR-adaptive, generous)
            relevance_atr = _atr_tolerance(df, [current_bar], multiplier=1.5)
            if current_price > neckline_level + relevance_atr:
                continue

            # Quality scoring
            quality = 0.0
            symmetry = max(0.0, 1.0 - abs(t1_price - t2_price) / max(tol, 0.01))
            quality += symmetry * 20

            quality += min(25.0, duration * 0.4)

            if 0.04 <= depth_pct <= 0.15:
                quality += 25.0
            else:
                quality += max(0, 25.0 - (depth_pct - 0.15) * 100)

            # Volume declining on 2nd bottom
            vol_first = _volume_profile(df, t1_idx - 3, t1_idx + 3)
            vol_second = _volume_profile(df, t2_idx - 3, t2_idx + 3)
            vol_declining = vol_second < vol_first * 0.9
            if vol_declining:
                quality += 10.0

            # Candlestick confirmation at pivot lows
            pivot_candles = (
                int(_check_pivot_candle(df, t1_idx, "low"))
                + int(_check_pivot_candle(df, t2_idx, "low"))
            )
            quality += pivot_candles * 5.0

            if quality < 35:
                continue

            candidate = PatternResult(
                pattern_type="double_bottom",
                support_line=None, resistance_line=None,
                duration_bars=duration,
                breakout_level=round(neckline_level, 2),
                support_level=round(min(t1_price, t2_price), 2),
                pattern_height=round(pattern_depth, 2),
                quality_score=round(quality, 1),
                volume_declining=vol_declining,
                neckline_level=round(neckline_level, 2),
                candle_confirmed_touches=pivot_candles,
                pivot_indices=[
                    (t1_idx, t1_price, "trough_1"),
                    (neckline_peak[0], neckline_peak[1], "neckline_peak"),
                    (t2_idx, t2_price, "trough_2"),
                ],
            )
            if best_candidate is None or candidate.quality_score > best_candidate.quality_score:
                best_candidate = candidate

    return best_candidate


def detect_triple_bottom(
    peaks: List[Tuple[int, float]],
    troughs: List[Tuple[int, float]],
    df: pd.DataFrame,
    current_bar: int,
    price_tolerance: float = 0.015,
    min_duration: int = 40,
    max_duration: int = 350,
) -> Optional[PatternResult]:
    """Detect Triple Bottom with ATR-adaptive tolerances. Bulkowski: 74-79% WR."""
    if len(troughs) < 3 or len(peaks) < 2:
        return None

    current_price = float(df['close'].iloc[current_bar])
    best_candidate: Optional[PatternResult] = None

    for i in range(len(troughs) - 1, 1, -1):
        t3_idx, t3_price = troughs[i]
        if current_bar - t3_idx > 120:
            continue

        for j in range(i - 1, 0, -1):
            t2_idx, t2_price = troughs[j]
            for k in range(j - 1, max(j - 5, -1), -1):
                t1_idx, t1_price = troughs[k]

                duration = t3_idx - t1_idx
                if duration < min_duration or duration > max_duration:
                    continue

                # ATR-adaptive: all three bottoms within tolerance
                tol = _atr_tolerance(df, [t1_idx, t2_idx, t3_idx], multiplier=0.75)
                avg_bottom = (t1_price + t2_price + t3_price) / 3
                if (abs(t1_price - avg_bottom) > tol
                        or abs(t2_price - avg_bottom) > tol
                        or abs(t3_price - avg_bottom) > tol):
                    continue

                # Spacing
                gap1 = t2_idx - t1_idx
                gap2 = t3_idx - t2_idx
                if gap1 < 8 or gap2 < 8:
                    continue
                spacing_ratio = max(gap1, gap2) / max(1, min(gap1, gap2))
                if spacing_ratio > 3.5:
                    continue

                # Find neckline peaks between each adjacent pair of troughs
                nl_12 = [p for p in peaks if t1_idx < p[0] < t2_idx]
                nl_23 = [p for p in peaks if t2_idx < p[0] < t3_idx]
                if not nl_12 or not nl_23:
                    continue

                nl_peak_1 = max(nl_12, key=lambda p: p[1])
                nl_peak_2 = max(nl_23, key=lambda p: p[1])

                # Sloped neckline through the two neckline peaks
                nl_span = nl_peak_2[0] - nl_peak_1[0]
                if nl_span > 0:
                    nl_slope_per_bar = (nl_peak_2[1] - nl_peak_1[1]) / nl_span
                else:
                    nl_slope_per_bar = 0.0

                # Neckline projected to current bar for accurate breakout
                nl_at_current = nl_peak_1[1] + nl_slope_per_bar * (current_bar - nl_peak_1[0])
                # Use max of the two peaks for depth calculation (conservative)
                neckline_level = nl_at_current
                neckline_for_depth = max(nl_peak_1[1], nl_peak_2[1])

                pattern_depth = neckline_for_depth - min(t1_price, t2_price, t3_price)
                if pattern_depth <= 0:
                    continue

                depth_atr = _atr_tolerance(df, [t1_idx, t2_idx, t3_idx], multiplier=1.0)
                if pattern_depth < depth_atr:
                    continue
                depth_pct = pattern_depth / neckline_for_depth
                if depth_pct < 0.05:
                    continue

                # Prior downtrend validation
                dt_valid, dt_decline = _validate_prior_downtrend(
                    df, t1_idx, min(t1_price, t2_price, t3_price),
                )
                if not dt_valid:
                    continue

                relevance_atr = _atr_tolerance(df, [current_bar], multiplier=1.5)
                if current_price > nl_at_current + relevance_atr:
                    continue

                quality = 0.0
                spread = max(t1_price, t2_price, t3_price) - min(t1_price, t2_price, t3_price)
                quality += max(0, 25.0 - (spread / max(tol, 0.01)) * 5)
                quality += min(25.0, duration * 0.3)
                if 0.04 <= depth_pct <= 0.15:
                    quality += 25.0
                if spacing_ratio < 2.0:
                    quality += 10.0

                # Ascending bottoms bonus (Bulkowski: each successive bottom
                # higher = more bullish, buyers stepping in earlier)
                if t2_price >= t1_price and t3_price >= t2_price:
                    quality += 10.0  # Full ascending sequence
                elif t3_price >= t1_price:
                    quality += 5.0   # At least T3 higher than T1

                vol_t1 = _volume_profile(df, t1_idx - 2, t1_idx + 2)
                vol_t3 = _volume_profile(df, t3_idx - 2, t3_idx + 2)
                vol_declining = vol_t3 < vol_t1 * 0.85
                if vol_declining:
                    quality += 10.0

                pivot_candles = (
                    int(_check_pivot_candle(df, t1_idx, "low"))
                    + int(_check_pivot_candle(df, t2_idx, "low"))
                    + int(_check_pivot_candle(df, t3_idx, "low"))
                )
                quality += pivot_candles * 5.0

                # Neckline slope quality — flatter = more accurate breakout
                nl_slope_pct = abs(nl_peak_2[1] - nl_peak_1[1]) / max(neckline_for_depth, 1)
                if nl_slope_pct < 0.015:
                    quality += 10.0
                elif nl_slope_pct < 0.03:
                    quality += 5.0

                if quality < 40:
                    continue

                candidate = PatternResult(
                    pattern_type="triple_bottom",
                    support_line=None, resistance_line=None,
                    duration_bars=duration,
                    breakout_level=round(neckline_level, 2),
                    support_level=round(min(t1_price, t2_price, t3_price), 2),
                    pattern_height=round(pattern_depth, 2),
                    quality_score=round(quality, 1),
                    volume_declining=vol_declining,
                    neckline_level=round(neckline_level, 2),
                    candle_confirmed_touches=pivot_candles,
                    pivot_indices=[
                        (t1_idx, t1_price, "trough_1"),
                        (nl_peak_1[0], nl_peak_1[1], "neckline_peak"),
                        (t2_idx, t2_price, "trough_2"),
                        (nl_peak_2[0], nl_peak_2[1], "neckline_peak"),
                        (t3_idx, t3_price, "trough_3"),
                    ],
                )
                if best_candidate is None or candidate.quality_score > best_candidate.quality_score:
                    best_candidate = candidate

    return best_candidate


def detect_inverse_head_shoulders(
    peaks: List[Tuple[int, float]],
    troughs: List[Tuple[int, float]],
    df: pd.DataFrame,
    current_bar: int,
    shoulder_tolerance: float = 0.018,
    min_duration: int = 30,
    max_duration: int = 350,
) -> Optional[PatternResult]:
    """Detect Inverse Head & Shoulders with ATR-adaptive tolerances. Bulkowski: 74-89% WR."""
    if len(troughs) < 3 or len(peaks) < 2:
        return None

    current_price = float(df['close'].iloc[current_bar])
    best_candidate: Optional[PatternResult] = None

    for i in range(len(troughs) - 1, 1, -1):
        rs_idx, rs_price = troughs[i]
        if current_bar - rs_idx > 120:
            continue

        for j in range(i - 1, 0, -1):
            h_idx, h_price = troughs[j]
            for k in range(j - 1, max(j - 5, -1), -1):
                ls_idx, ls_price = troughs[k]

                duration = rs_idx - ls_idx
                if duration < min_duration or duration > max_duration:
                    continue

                # Head must be lower than both shoulders
                if h_price >= ls_price or h_price >= rs_price:
                    continue

                # ATR-adaptive head drop: >= 1.0 * ATR below avg shoulder
                avg_shoulder = (ls_price + rs_price) / 2
                head_atr = _atr_tolerance(df, [ls_idx, h_idx, rs_idx], multiplier=1.0)
                if avg_shoulder - h_price < head_atr:
                    continue

                # ATR-adaptive shoulder tolerance: within 1.0 * ATR
                shoulder_tol = _atr_tolerance(df, [ls_idx, rs_idx], multiplier=1.0)
                if abs(ls_price - rs_price) > shoulder_tol:
                    continue

                # Neckline peaks
                left_peaks = [p for p in peaks if ls_idx < p[0] < h_idx]
                right_peaks = [p for p in peaks if h_idx < p[0] < rs_idx]
                if not left_peaks or not right_peaks:
                    continue

                nl_left = max(left_peaks, key=lambda p: p[1])
                nl_right = max(right_peaks, key=lambda p: p[1])

                # Neckline slope: peaks within ATR tolerance
                nl_tol = _atr_tolerance(df, [nl_left[0], nl_right[0]], multiplier=2.0)
                if abs(nl_left[1] - nl_right[1]) > nl_tol:
                    continue

                # Timing symmetry
                ls_to_head = h_idx - ls_idx
                head_to_rs = rs_idx - h_idx
                if ls_to_head > 0 and head_to_rs > 0:
                    timing_ratio = max(ls_to_head, head_to_rs) / min(ls_to_head, head_to_rs)
                    if timing_ratio > 3.0:
                        continue

                # Sloped neckline: project the line through left and right peaks
                # to the current bar for precise breakout detection
                nl_span = nl_right[0] - nl_left[0]
                if nl_span > 0:
                    nl_slope_per_bar = (nl_right[1] - nl_left[1]) / nl_span
                else:
                    nl_slope_per_bar = 0.0

                # Neckline at head position (for depth calculation)
                nl_at_head = nl_left[1] + nl_slope_per_bar * (h_idx - nl_left[0])
                # Neckline projected to current bar (for breakout detection)
                nl_at_current = nl_left[1] + nl_slope_per_bar * (current_bar - nl_left[0])
                # Use average for backward-compatible neckline_level storage
                neckline_level = nl_at_current

                pattern_depth = nl_at_head - h_price
                if pattern_depth <= 0:
                    continue

                depth_pct = pattern_depth / nl_at_head
                if depth_pct < 0.04:
                    continue

                # Prior downtrend validation
                dt_valid, dt_decline = _validate_prior_downtrend(
                    df, ls_idx, h_price,
                )
                if not dt_valid:
                    continue

                relevance_atr = _atr_tolerance(df, [current_bar], multiplier=1.5)
                if current_price > nl_at_current + relevance_atr:
                    continue

                # Shoulder width similarity: left and right sides within 2:1 ratio
                ls_to_head = h_idx - ls_idx
                head_to_rs = rs_idx - h_idx
                if ls_to_head > 0 and head_to_rs > 0:
                    width_ratio = max(ls_to_head, head_to_rs) / min(ls_to_head, head_to_rs)
                    if width_ratio > 2.5:
                        continue  # Too asymmetric — not a valid IH&S

                # Quality scoring
                quality = 0.0
                shoulder_diff = abs(ls_price - rs_price)
                quality += max(0, 20.0 - (shoulder_diff / max(shoulder_tol, 0.01)) * 10)

                if 0.04 <= depth_pct <= 0.25:
                    quality += 25.0
                else:
                    quality += max(0, 25.0 - (depth_pct - 0.25) * 100)

                quality += min(20.0, duration * 0.3)

                # Bulkowski: right shoulder higher than left = better performance
                # Penalize when left shoulder is higher (deeper) than right
                if ls_price < rs_price:
                    # Left shoulder is lower (deeper) = left is "higher" in inverted sense
                    # This means right shoulder is shallower = more bullish
                    quality += 5.0
                elif ls_price > rs_price:
                    # Left shoulder is shallower, right is deeper = less bullish
                    shoulder_imbalance = (ls_price - rs_price) / max(shoulder_tol, 0.01)
                    quality -= min(10.0, shoulder_imbalance * 5.0)

                # Neckline slope direction (Bulkowski: down-sloping performs better)
                nl_slope_signed = nl_right[1] - nl_left[1]  # positive = up-sloping
                nl_slope_pct = abs(nl_slope_signed) / max(nl_at_head, 1)
                if nl_slope_pct < 0.015:
                    quality += 15.0  # Very level neckline
                elif nl_slope_pct < 0.03:
                    quality += 12.0 if nl_slope_signed < 0 else 10.0
                elif nl_slope_pct < 0.05:
                    quality += 7.0 if nl_slope_signed < 0 else 5.0
                else:
                    if nl_slope_signed > 0:
                        quality -= 5.0  # Steep up-slope penalty

                vol_ls = _volume_profile(df, ls_idx - 3, ls_idx + 3)
                vol_rs = _volume_profile(df, rs_idx - 3, rs_idx + 3)
                vol_declining = vol_rs < vol_ls * 0.9
                if vol_declining:
                    quality += 10.0

                pivot_candles = (
                    int(_check_pivot_candle(df, ls_idx, "low"))
                    + int(_check_pivot_candle(df, h_idx, "low"))
                    + int(_check_pivot_candle(df, rs_idx, "low"))
                )
                quality += pivot_candles * 5.0

                if quality < 40:
                    continue

                candidate = PatternResult(
                    pattern_type="inverse_head_shoulders",
                    support_line=None, resistance_line=None,
                    duration_bars=duration,
                    breakout_level=round(neckline_level, 2),
                    support_level=round(h_price, 2),
                    pattern_height=round(pattern_depth, 2),
                    quality_score=round(quality, 1),
                    volume_declining=vol_declining,
                    neckline_level=round(neckline_level, 2),
                    candle_confirmed_touches=pivot_candles,
                    pivot_indices=[
                        (ls_idx, ls_price, "left_shoulder"),
                        (nl_left[0], nl_left[1], "neckline_left"),
                        (h_idx, h_price, "head"),
                        (nl_right[0], nl_right[1], "neckline_right"),
                        (rs_idx, rs_price, "right_shoulder"),
                    ],
                )
                if best_candidate is None or candidate.quality_score > best_candidate.quality_score:
                    best_candidate = candidate

    return best_candidate


def detect_cup_and_handle(
    peaks: List[Tuple[int, float]],
    troughs: List[Tuple[int, float]],
    df: pd.DataFrame,
    current_bar: int,
    min_cup_bars: int = 30,
    max_cup_bars: int = 300,
) -> Optional[PatternResult]:
    """Detect Cup and Handle with ATR-adaptive tolerances. Bulkowski: 61-95% WR."""
    if len(peaks) < 2 or len(troughs) < 2:
        return None

    best_candidate: Optional[PatternResult] = None

    for i in range(len(peaks) - 1, 0, -1):
        right_rim_idx, right_rim_price = peaks[i]
        if current_bar - right_rim_idx > 60:
            continue

        for j in range(i - 1, max(i - 8, -1), -1):
            left_rim_idx, left_rim_price = peaks[j]

            cup_duration = right_rim_idx - left_rim_idx
            if cup_duration < min_cup_bars or cup_duration > max_cup_bars:
                continue

            # ATR-adaptive rim tolerance — generous (1.5x ATR)
            rim_tol = _atr_tolerance(df, [left_rim_idx, right_rim_idx], multiplier=1.5)
            if abs(left_rim_price - right_rim_price) > rim_tol:
                continue

            cup_troughs = [t for t in troughs if left_rim_idx < t[0] < right_rim_idx]
            if not cup_troughs:
                continue

            cup_bottom = min(cup_troughs, key=lambda t: t[1])
            cup_bottom_idx, cup_bottom_price = cup_bottom

            # Sloped rim line: project through left and right rim peaks
            rim_span = right_rim_idx - left_rim_idx
            if rim_span > 0:
                rim_slope_per_bar = (right_rim_price - left_rim_price) / rim_span
            else:
                rim_slope_per_bar = 0.0
            # Rim level projected to current bar for breakout detection
            rim_at_current = left_rim_price + rim_slope_per_bar * (current_bar - left_rim_idx)
            rim_level = rim_at_current  # Used for breakout_level and neckline_level

            cup_depth = max(left_rim_price, right_rim_price) - cup_bottom_price
            if cup_depth <= 0:
                continue

            # ATR-adaptive depth: >= 1.5 * ATR AND 8-40% range (Bulkowski: 12-33% typical)
            depth_atr = _atr_tolerance(df, [cup_bottom_idx], multiplier=1.5)
            if cup_depth < depth_atr:
                continue
            cup_depth_pct = cup_depth / max(left_rim_price, right_rim_price)
            if cup_depth_pct < 0.08 or cup_depth_pct > 0.40:
                continue

            # Prior uptrend validation — Cup & Handle is a continuation pattern.
            # Price must have risen meaningfully before the left rim.
            lb_start = max(0, left_rim_idx - 120)
            if lb_start < left_rim_idx:
                prior_low = float(df['low'].iloc[lb_start:left_rim_idx].min())
                if prior_low > 0:
                    prior_rise = (left_rim_price - prior_low) / prior_low
                    if prior_rise < 0.10:
                        continue  # No meaningful uptrend before cup

            # U-shape: bottom in middle 60% (not strict thirds)
            cup_fifth = cup_duration // 5
            if not (left_rim_idx + cup_fifth <= cup_bottom_idx <= right_rim_idx - cup_fifth):
                continue

            # Handle (allow up to 30 bars)
            handle_start = right_rim_idx
            handle_end = min(current_bar, handle_start + 30)
            if handle_end <= handle_start:
                continue

            handle_low = float(np.min(df['low'].iloc[handle_start:handle_end + 1].values))
            handle_retrace = right_rim_price - handle_low

            # O'Neil rule: max handle retrace 50% of cup depth (was 60%)
            if handle_retrace > cup_depth * 0.50:
                continue

            # Handle low must stay above cup bottom (distinguishes from double bottom)
            if handle_low < cup_bottom_price:
                continue

            # Handle must form in upper half of cup (O'Neil/Bulkowski rule)
            cup_midpoint = cup_bottom_price + cup_depth * 0.50
            if handle_low < cup_midpoint:
                continue

            # Quality scoring
            quality = 0.0

            mid_troughs = [t for t in cup_troughs
                           if left_rim_idx + cup_fifth <= t[0] <= right_rim_idx - cup_fifth]
            quality += min(15.0, len(mid_troughs) * 5.0)

            if 0.06 <= cup_depth_pct <= 0.30:
                quality += 25.0
            else:
                quality += 15.0

            rim_diff = abs(left_rim_price - right_rim_price)
            quality += max(0, 15.0 - (rim_diff / max(rim_tol, 0.01)) * 8)

            quality += min(15.0, cup_duration * 0.2)

            if handle_end > handle_start + 3:
                vol_handle = _volume_profile(df, handle_start, handle_end)
                vol_cup_avg = _volume_profile(df, left_rim_idx, right_rim_idx)
                if vol_handle < vol_cup_avg * 0.8:
                    quality += 10.0

            current_price = float(df['close'].iloc[current_bar])
            relevance_atr = _atr_tolerance(df, [current_bar], multiplier=1.5)
            if current_price > rim_level + relevance_atr:
                continue

            pivot_candles = int(_check_pivot_candle(df, cup_bottom_idx, "low"))
            quality += pivot_candles * 5.0

            if quality < 35:
                continue

            # Find handle low bar index
            handle_low_bar = handle_start + int(np.argmin(
                df['low'].iloc[handle_start:handle_end + 1].values))

            candidate = PatternResult(
                pattern_type="cup_and_handle",
                support_line=None, resistance_line=None,
                duration_bars=cup_duration,
                breakout_level=round(rim_level, 2),
                support_level=round(cup_bottom_price, 2),
                pattern_height=round(cup_depth, 2),
                quality_score=round(quality, 1),
                neckline_level=round(rim_level, 2),
                candle_confirmed_touches=pivot_candles,
                pivot_indices=[
                    (left_rim_idx, left_rim_price, "left_rim"),
                    (cup_bottom_idx, cup_bottom_price, "cup_bottom"),
                    (right_rim_idx, right_rim_price, "right_rim"),
                    (handle_low_bar, handle_low, "handle_low"),
                ],
            )
            if best_candidate is None or candidate.quality_score > best_candidate.quality_score:
                best_candidate = candidate

    return best_candidate



def detect_high_tight_flag(
    peaks: List[Tuple[int, float]],
    troughs: List[Tuple[int, float]],
    df: pd.DataFrame,
    current_bar: int,
) -> Optional[PatternResult]:
    """
    Detect High & Tight Flag.

    Bulkowski: 69% avg rise, ~0% failure. Powerful continuation signal.
    Requires >= 75% gain in <= 60 days, then tight consolidation (< 25% retrace).
    """
    n = len(df)
    if n < 50 or current_bar < 50:
        return None

    closes = df['close'].values.astype(float)
    highs = df['high'].values.astype(float)
    lows = df['low'].values.astype(float)

    best_candidate: Optional[PatternResult] = None

    # Search for a rapid advance in recent 120 bars
    search_start = max(0, current_bar - 120)

    for move_start in range(search_start, current_bar - 15):
        move_start_price = float(lows[move_start])
        if move_start_price <= 0:
            continue

        # Find advance peak within 60 bars (was 45)
        for peak_bar in range(move_start + 10, min(move_start + 61, current_bar - 3)):
            peak_price = float(max(highs[move_start:peak_bar + 1]))
            peak_idx = move_start + int(np.argmax(highs[move_start:peak_bar + 1]))

            # Check >= 75% gain (Bulkowski: high-tight requires explosive advance)
            gain_pct = (peak_price / move_start_price) - 1.0
            if gain_pct < 0.75:
                continue

            # Flag: tight consolidation after peak
            flag_start = peak_idx
            flag_end = min(flag_start + 15, current_bar)
            if flag_end - flag_start < 3:
                continue

            flag_prices = closes[flag_start:flag_end + 1]
            flag_low = float(min(lows[flag_start:flag_end + 1]))
            flag_high = float(max(highs[flag_start:flag_end + 1]))

            # Retrace must be <= 25% (being slightly generous vs strict 20%)
            retrace = (peak_price - flag_low) / (peak_price - move_start_price)
            if retrace > 0.25:
                continue

            flag_duration = flag_end - flag_start

            # Quality scoring — scaled for 75%+ threshold
            quality = 0.0
            if gain_pct >= 1.50:
                quality += 30.0  # 150%+ gain = exceptional high-tight
            elif gain_pct >= 1.00:
                quality += 25.0  # 100%+ gain = classic Bulkowski
            elif gain_pct >= 0.75:
                quality += 20.0

            if retrace < 0.10:
                quality += 25.0
            elif retrace < 0.15:
                quality += 20.0
            elif retrace < 0.20:
                quality += 15.0
            else:
                quality += 10.0

            if flag_duration <= 8:
                quality += 20.0
            elif flag_duration <= 12:
                quality += 15.0
            else:
                quality += 10.0

            # Volume: declining in flag
            vol_advance = _volume_profile(df, peak_idx - 3, peak_idx)
            vol_flag = _volume_profile(df, flag_start + 1, flag_end)
            if vol_flag < vol_advance * 0.7:
                quality += 15.0

            quality += 10.0  # Breakout potential baseline

            if quality < 45:
                continue

            flag_low_bar = flag_start + int(np.argmin(lows[flag_start:flag_end + 1]))

            candidate = PatternResult(
                pattern_type="high_tight_flag",
                support_line=None, resistance_line=None,
                duration_bars=flag_end - move_start,
                breakout_level=round(flag_high, 2),
                support_level=round(flag_low, 2),
                pattern_height=round(flag_high - flag_low, 2),
                quality_score=round(quality, 1),
                volume_declining=vol_flag < vol_advance * 0.7,
                neckline_level=round(flag_high, 2),
                pivot_indices=[
                    (move_start, move_start_price, "move_start"),
                    (peak_idx, peak_price, "advance_peak"),
                    (flag_low_bar, flag_low, "flag_low"),
                    (flag_end, float(closes[flag_end]), "flag_end"),
                ],
            )
            if best_candidate is None or candidate.quality_score > best_candidate.quality_score:
                best_candidate = candidate

    return best_candidate


# ===================================================================
# Reversal Breakout Detection
# ===================================================================

def detect_reversal_breakout(
    df: pd.DataFrame,
    bar_idx: int,
    pattern: PatternResult,
    volume_mult: float = 1.3,
) -> Optional[BreakoutSignal]:
    """Check whether *bar_idx* breaks out of a reversal pattern."""
    if bar_idx < 1 or bar_idx >= len(df):
        return None

    curr = df.iloc[bar_idx]
    prev = df.iloc[bar_idx - 1]

    close = float(curr['close'])
    prev_close = float(prev['close'])
    neckline = pattern.neckline_level if pattern.neckline_level > 0 else pattern.breakout_level

    atr = float(curr.get('atr_14', close * 0.02))
    if pd.isna(atr) or atr <= 0:
        atr = close * 0.02

    high = float(curr['high'])
    low = float(curr['low'])
    bar_range = high - low

    # 4. Volume confirmation (shared for both directions)
    vol_ratio = curr.get('volume_ratio', 0)
    if pd.isna(vol_ratio) or vol_ratio < volume_mult:
        return None

    # ── Bullish breakout: close ABOVE neckline ──
    if close <= neckline:
        return None
    if prev_close > neckline + 0.3 * atr:
        return None  # Not a fresh break — already above neckline
    if close > neckline + 1.5 * atr:
        return None  # Chasing — too far above neckline
    if bar_range > 0:
        close_position = (close - low) / bar_range
        if close_position < 0.30:
            return None  # Weak close — near bar low

    # Stop below recent swing low (lowest low in last 20 bars) with 0.5 ATR buffer
    lookback = min(20, bar_idx)
    recent_swing_low = float(df['low'].iloc[bar_idx - lookback:bar_idx + 1].min())
    stop = recent_swing_low - 0.5 * atr

    max_stop_distance = 3.0 * atr
    if close - stop > max_stop_distance:
        stop = close - max_stop_distance

    target = neckline + pattern.pattern_height

    risk = close - stop
    if risk <= 0:
        return None
    if (target - close) / risk < 1.0:
        target = close + 1.5 * risk  # Adjust target to minimum 1.5:1

    alpha, alpha_reasons = _compute_breakout_alpha(df, bar_idx, neckline)

    return BreakoutSignal(
        pattern=pattern,
        entry_price=round(close, 2),
        stop_loss=round(stop, 2),
        target=round(target, 2),
        volume_ratio=round(float(vol_ratio), 1),
        alpha_score=round(alpha, 1),
        alpha_reasons=alpha_reasons,
    )


# ===================================================================
# Master Scan Functions
# ===================================================================

def scan_for_reversal_patterns(
    df: pd.DataFrame,
    lookback: int = 250,
    interval: str = '1d',
) -> List[PatternResult]:
    """
    Scan for reversal patterns at multiple zigzag scales for better detection.

    Scans at both 1.5x ATR (intermediate) and 2.0x ATR (major) scales,
    then deduplicates by keeping the highest quality for each pattern type.
    """
    n = len(df)
    if n < lookback + 50:
        return []

    scan_start = n - lookback
    scan_df = df.iloc[scan_start:]
    current_bar = n - 1

    candidates: List[PatternResult] = []

    # Scan at THREE scales for better reversal detection (fine → coarse)
    for atr_mult in [1.0, 1.5, 2.0]:
        pivots = _zigzag_pivots(scan_df, atr_multiplier=atr_mult)
        all_peaks = [(p.index + scan_start, p.price) for p in pivots if p.pivot_type == "high"]
        all_troughs = [(p.index + scan_start, p.price) for p in pivots if p.pivot_type == "low"]

        if len(all_peaks) < 2 or len(all_troughs) < 2:
            continue

        for detect_fn in [
            # Bullish reversal
            detect_double_bottom,
            detect_triple_bottom,
            detect_inverse_head_shoulders,
            detect_cup_and_handle,
            # Bullish continuation
            detect_high_tight_flag,
        ]:
            p = detect_fn(all_peaks, all_troughs, df, current_bar)
            if p is not None:
                candidates.append(p)

    if not candidates:
        return []

    # Deduplicate: keep best quality per pattern type
    best_by_type: Dict[str, PatternResult] = {}
    for c in candidates:
        if c.pattern_type not in best_by_type or c.quality_score > best_by_type[c.pattern_type].quality_score:
            best_by_type[c.pattern_type] = c

    # Mutual exclusion: keep best among bottom-type patterns
    # (Only bullish patterns remain — no top-type exclusion needed)
    bottom_types = {"double_bottom", "triple_bottom", "inverse_head_shoulders"}
    bottom_patterns = [v for k, v in best_by_type.items() if k in bottom_types]
    other_patterns = [v for k, v in best_by_type.items() if k not in bottom_types]

    patterns: List[PatternResult] = list(other_patterns)
    if bottom_patterns:
        best_bottom = max(bottom_patterns, key=lambda p: p.quality_score)
        patterns.append(best_bottom)

    patterns.sort(key=lambda p: p.quality_score, reverse=True)
    return patterns


# ===================================================================
# Consolidation Zone Detection (Structure-First)
# ===================================================================

def _detect_consolidation_zones(
    df: pd.DataFrame,
    scan_start: int,
    current_bar: int,
    window: int = 20,
    compression_threshold: float = 2.5,
) -> List[int]:
    """
    Find bar indices where price transitions into consolidation.

    Uses rolling range / ATR ratio.  When the ratio drops below
    *compression_threshold*, price is compressing — likely forming a
    pattern.  These zone-start indices are fed as additional window
    boundaries into the main scanner so we don't miss patterns that
    fall between pivot-based windows.

    Returns: list of global iloc indices where consolidation begins.
    """
    if current_bar - scan_start < window + 5:
        return []

    highs = df['high'].iloc[scan_start:current_bar + 1].values
    lows = df['low'].iloc[scan_start:current_bar + 1].values

    if len(highs) < window:
        return []

    # Rolling range over trailing *window* bars
    from numpy.lib.stride_tricks import sliding_window_view
    rolling_high = np.max(sliding_window_view(highs, window), axis=1)
    rolling_low = np.min(sliding_window_view(lows, window), axis=1)
    rolling_range = rolling_high - rolling_low

    # ATR for normalization
    if 'atr_14' not in df.columns:
        return []
    atr_vals = df['atr_14'].iloc[scan_start + window - 1:current_bar + 1].values

    # Avoid division by zero / NaN
    atr_safe = np.where(
        (atr_vals > 0) & ~np.isnan(atr_vals), atr_vals, 1.0,
    )
    ratio = rolling_range / atr_safe

    # Find transition points: ratio crosses below threshold
    zones: List[int] = []
    in_zone = False
    for i in range(len(ratio)):
        if ratio[i] < compression_threshold and not in_zone:
            global_idx = scan_start + window - 1 + i
            # Only include if far enough from current bar (min 25 bars)
            if current_bar - global_idx >= 25:
                zones.append(global_idx)
            in_zone = True
        elif ratio[i] >= compression_threshold + 0.5:  # Hysteresis
            in_zone = False

    return zones


# ===================================================================
# Natural Pattern Boundary Detection
# ===================================================================

def _generate_natural_windows(
    pivots: List[ZigzagPivot],
    current_bar: int,
    min_window: int = 25,
    max_window: int = 250,
    interval: str = '1d',
) -> List[int]:
    """
    Generate candidate pattern-start bars from significant pivots.

    Each pivot with strength >= 0.4 becomes a candidate start.
    Also includes fixed fallback windows [120, 80, 50] scaled by timeframe.
    Merges cutoffs within 5 bars of each other.

    Returns: sorted list of cutoff bar indices.
    """
    cutoffs = set()

    # Natural boundaries: strong pivots
    for p in pivots:
        window_size = current_bar - p.index
        if min_window <= window_size <= max_window and p.strength >= 0.4:
            cutoffs.add(p.index)

    # Fixed fallbacks scaled by timeframe (always include)
    _sc = _tf_scale(interval)
    for w in [int(120 * _sc), int(80 * _sc), int(50 * _sc)]:
        cutoff = current_bar - w
        if cutoff >= 0:
            cutoffs.add(cutoff)

    # Merge cutoffs within 5 bars of each other (keep earliest)
    sorted_cutoffs = sorted(cutoffs)
    merged = []
    for c in sorted_cutoffs:
        if not merged or c - merged[-1] > 5:
            merged.append(c)

    return merged


def scan_for_patterns(
    df: pd.DataFrame,
    lookback: int = 250,
    min_duration: int = 15,
    min_touches: int = 3,
    max_deviation_pct: float = 0.012,
    interval: str = '1d',
) -> List[PatternResult]:
    """
    Scan the last *lookback* bars for consolidation patterns.

    Uses zigzag pivots + Theil-Sen trendlines for robust detection.
    Tries multiple window sizes for multi-scale pattern capture.
    """
    n = len(df)
    if n < lookback + 50:
        return []

    scan_start = n - lookback
    scan_df = df.iloc[scan_start:]

    # Zigzag at scale 2 (1.5x ATR) for intermediate structural pivots
    all_peaks, all_troughs = detect_peaks_troughs(
        scan_df, min_distance=5, prominence_pct=0.012
    )

    if len(all_peaks) < min_touches or len(all_troughs) < min_touches:
        return []

    # Convert to global iloc indices
    all_peaks = [(p[0] + scan_start, p[1]) for p in all_peaks]
    all_troughs = [(t[0] + scan_start, t[1]) for t in all_troughs]

    current_bar = n - 1
    patterns: List[PatternResult] = []

    # Generate natural window boundaries from significant pivots
    raw_pivots = _zigzag_pivots(scan_df, atr_multiplier=1.5)
    for p in raw_pivots:
        p.index += scan_start
    window_cutoffs = _generate_natural_windows(
        raw_pivots, current_bar, min_window=25, max_window=lookback,
        interval=interval,
    )

    # Add consolidation-zone boundaries (structure-first detection)
    zone_starts = _detect_consolidation_zones(df, scan_start, current_bar)
    for z in zone_starts:
        # Merge with existing cutoffs (skip if within 5 bars of existing)
        if not any(abs(z - c) <= 5 for c in window_cutoffs):
            window_cutoffs.append(z)
    window_cutoffs.sort()

    has_atr = 'atr_14' in df.columns

    for cutoff in window_cutoffs:
        w_peaks = [p for p in all_peaks if p[0] >= cutoff]
        w_troughs = [t for t in all_troughs if t[0] >= cutoff]

        if len(w_peaks) < min_touches or len(w_troughs) < min_touches:
            continue

        # Primary: anchor-pair search with respect validation
        res_line = None
        sup_line = None

        if has_atr:
            res_line = _find_best_trendline_anchor(
                w_peaks, df, line_type="resistance",
                min_touches=min_touches,
                max_deviation_atr_mult=0.50,
                min_respect=0.80,
            )
            sup_line = _find_best_trendline_anchor(
                w_troughs, df, line_type="support",
                min_touches=min_touches,
                max_deviation_atr_mult=0.50,
                min_respect=0.80,
            )

        # No fallback — if anchor-pair search with respect >= 0.80 fails,
        # skip this window rather than produce garbage trendlines.

        if res_line is None or sup_line is None:
            continue

        pattern = classify_pattern(sup_line, res_line, current_bar, df, interval=interval)
        if (pattern is not None
                and pattern.duration_bars >= max(5, int(min_duration * _tf_scale(interval)))
                and pattern.quality_score >= 60):  # reject marginal patterns early
            patterns.append(pattern)

    # Remove overlapping consolidation patterns from different windows (keep higher quality)
    patterns.sort(key=lambda p: p.quality_score, reverse=True)
    filtered: List[PatternResult] = []
    for pat in patterns:
        if pat.support_line is None or pat.resistance_line is None:
            filtered.append(pat)
            continue
        p_start = min(pat.support_line.start_idx, pat.resistance_line.start_idx)
        p_end = max(pat.support_line.end_idx, pat.resistance_line.end_idx)
        overlaps = False
        for existing in filtered:
            if existing.support_line is None or existing.resistance_line is None:
                continue
            e_start = min(existing.support_line.start_idx, existing.resistance_line.start_idx)
            e_end = max(existing.support_line.end_idx, existing.resistance_line.end_idx)
            overlap = max(0, min(p_end, e_end) - max(p_start, e_start))
            span = max(1, p_end - p_start)
            if overlap / span > 0.70:  # >70% overlap = same price action
                overlaps = True
                break
        if not overlaps:
            filtered.append(pat)
    patterns = filtered

    # Also scan for reversal patterns (no trendlines, include unconditionally)
    reversal_patterns = scan_for_reversal_patterns(df, lookback=max(lookback, 250), interval=interval)
    patterns.extend(reversal_patterns)

    # Sort by quality, deduplicate by type
    patterns.sort(key=lambda p: p.quality_score, reverse=True)
    seen = set()
    unique: List[PatternResult] = []
    for p in patterns:
        if p.pattern_type not in seen:
            seen.add(p.pattern_type)
            unique.append(p)

    return unique
