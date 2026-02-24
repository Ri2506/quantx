"""
Strategy: Consolidation Breakout
=================================
Detects chart patterns (ascending triangle, horizontal channel, symmetrical
triangle, falling wedge, bull flag) and trades the breakout.

Pattern-type-specific logic based on Bulkowski's pattern reliability data.

Entry Rules:
- Active chart pattern detected (quality gate per pattern type)
- Close breaks above resistance trendline
- Volume > 1.5x 20-day average
- Bullish candle = confidence bonus (not required — breakout + volume are core)
- ADX > 15 (directional energy present)
- DI+ > DI- (bullish directional movement)
- Not chasing (close within 1.0 ATR of breakout level)
- Minimum R:R = 1.0 (loose — only reject terrible setups)

Stop Loss: Below pattern support - 0.5x ATR (max 2.0 ATR below entry)
Target: Measured move (pattern height projected from breakout)
Max Hold: 40 bars
"""

from typing import Optional
import pandas as pd

from .base import BaseStrategy, TradeSignal, ExitSignal, Position, Direction
from ..features.patterns import scan_for_patterns, detect_breakout


# Bulkowski-based minimum quality thresholds per pattern type
# Higher-noise patterns need stricter quality to avoid false signals
_PATTERN_MIN_QUALITY = {
    "ascending_triangle": 78,     # Inherent bullish bias from rising lows
    "horizontal_channel": 85,     # Common pattern — needs high quality to filter noise
    "symmetrical_triangle": 85,   # 50/50 direction — need high quality for bullish
    "falling_wedge": 80,          # Bullish bias — moderate gate
    "bull_flag": 88,              # Short duration, high noise — strictest gate
}

# Bulkowski-based confidence starting points per pattern type
_PATTERN_BASE_CONFIDENCE = {
    "ascending_triangle": 55.0,   # ~75% breakout success rate
    "horizontal_channel": 45.0,   # ~65% breakout in trend direction
    "symmetrical_triangle": 40.0, # ~55% continuation
    "falling_wedge": 50.0,        # ~70% breakout upward
    "bull_flag": 42.0,            # ~65% continuation (short patterns have noise)
}

# Pattern-specific RSI overbought limits
_PATTERN_RSI_LIMITS = {
    "ascending_triangle": 72,     # Higher tolerance — momentum is expected
    "horizontal_channel": 68,
    "symmetrical_triangle": 68,
    "falling_wedge": 70,          # Wedge breakouts can run hot
    "bull_flag": 65,              # Flag in already-extended move — stricter
}

# Pattern-specific exit R-multiples: (breakeven_R, trail_start_R)
_EXIT_PARAMS = {
    "ascending_triangle": (1.5, 2.0),   # Reliable — protect early
    "horizontal_channel": (2.0, 2.5),   # Standard
    "symmetrical_triangle": (2.0, 3.0), # Less reliable — needs more room
    "falling_wedge": (1.5, 2.0),        # Reliable breakout — protect early
    "bull_flag": (1.0, 1.5),            # Short, fast moves — tight management
}


class ConsolidationBreakout(BaseStrategy):
    name = "Consolidation_Breakout"
    category = "pattern"
    min_bars = 200
    max_hold_bars = 40  # patterns need 30-60 bars to reach measured move

    min_quality = 80
    min_volume_mult = 1.5
    interval = '1d'  # Candlestick timeframe — set by scanner

    # Pattern cache: avoid O(n²) Theil-Sen recomputation every bar.
    _CACHE_INTERVAL = 10

    def __init__(self):
        super().__init__()
        self._cache_key = None
        self._cache_patterns = None
        self._active_pattern_type = None  # Track current position's pattern type

    def scan(self, df: pd.DataFrame, symbol: str = "") -> Optional[TradeSignal]:
        if len(df) < self.min_bars:
            return None

        bar_idx = len(df) - 1
        curr = df.iloc[bar_idx]
        close = float(curr['close'])

        # Universal RSI hard cap — reject extreme overbought
        rsi = curr.get('rsi_14', None)
        if rsi is not None and not pd.isna(rsi) and rsi > 75:
            return None

        # ADX dead-market filter — no directional energy means breakout will fail
        adx_val = curr.get('adx', None)
        if adx_val is not None and not pd.isna(adx_val) and adx_val < 15:
            return None

        # DI+ vs DI- directional check — bearish movement dominates
        di_plus = curr.get('di_plus', None)
        di_minus = curr.get('di_minus', None)
        if (di_plus is not None and di_minus is not None
                and not pd.isna(di_plus) and not pd.isna(di_minus)):
            if di_minus > di_plus * 1.2:
                return None  # Bearish directional energy dominates

        # Uptrend context check (may be bypassed for long accumulation patterns)
        ema200 = curr.get('ema_200', None)
        above_ema200 = not pd.isna(ema200) and close >= ema200

        # 1. Detect patterns — cached to avoid recomputation every bar
        cache_key = (symbol, len(df) // self._CACHE_INTERVAL)
        if cache_key != self._cache_key:
            self._cache_patterns = scan_for_patterns(
                df,
                lookback=250,
                min_duration=15,
                min_touches=3,
                interval=self.interval,
            )
            self._cache_key = cache_key
        patterns = self._cache_patterns

        if not patterns:
            return None

        # 2. Try breakout on each pattern (best quality first)
        for pattern in patterns:
            # Skip reversal patterns (no trendlines — handled by reversal_patterns strategy)
            if pattern.support_line is None or pattern.resistance_line is None:
                continue

            # Pattern-type-specific quality gate
            min_q = _PATTERN_MIN_QUALITY.get(pattern.pattern_type, self.min_quality)
            if pattern.quality_score < min_q:
                continue

            # Pattern-specific RSI overbought filter
            if rsi is not None and not pd.isna(rsi):
                rsi_limit = _PATTERN_RSI_LIMITS.get(pattern.pattern_type, 68)
                if rsi > rsi_limit:
                    continue

            # 200-EMA filter: require uptrend UNLESS long accumulation pattern
            is_long_accumulation = (
                (pattern.duration_bars > 50 and pattern.quality_score >= 80)
                or (pattern.duration_bars >= 30 and pattern.quality_score >= 95)
            )
            if not above_ema200:
                if not is_long_accumulation:
                    continue

            # Weekly trend filter — skip counter-trend breakouts
            weekly_aligned = curr.get('weekly_trend_aligned', None)
            has_weekly = not pd.isna(weekly_aligned) and weekly_aligned
            if not has_weekly and not is_long_accumulation:
                continue

            breakout = detect_breakout(
                df, bar_idx, pattern, volume_mult=self.min_volume_mult
            )

            if breakout is None:
                continue

            # Candlestick confirmation — BONUS, not a gate
            # (We won't always get perfect candle confirmation on breakouts)
            has_candle_confirm = (
                bool(curr.get('candle_engulfing_bull', False))
                or bool(curr.get('candle_morning_star', False))
                or bool(curr.get('candle_three_white_soldiers', False))
                or bool(curr.get('candle_three_line_strike', False))
                or bool(curr.get('candle_piercing_line', False))
            )

            if not has_candle_confirm:
                body_pct_val = float(curr.get('body_pct', 0))
                if pd.isna(body_pct_val):
                    body_pct_val = 0
                is_bull = bool(curr.get('is_bullish', False))
                bar_range = float(curr['high']) - float(curr['low'])
                close_pos = (close - float(curr['low'])) / bar_range if bar_range > 0 else 0
                if body_pct_val > 0.50 and is_bull and close_pos > 0.50:
                    has_candle_confirm = True  # Decent bullish candle

            # Build signal
            risk = breakout.entry_price - breakout.stop_loss
            if risk <= 0:
                continue

            # Minimum R:R — loose: only reject terrible setups
            reward = breakout.target - breakout.entry_price
            rr = reward / risk
            if rr < 1.0:
                continue

            touches = (pattern.support_line.num_touches
                       + pattern.resistance_line.num_touches)

            reasons = [
                f"{pattern.pattern_type.replace('_', ' ').title()} "
                f"({pattern.duration_bars} bars, quality={pattern.quality_score})",
                f"Breakout above {pattern.breakout_level:.2f}",
                f"Volume {breakout.volume_ratio:.1f}x avg",
                f"Pattern height {pattern.pattern_height:.2f}",
                f"{touches} touches "
                f"(S={pattern.support_line.num_touches}, "
                f"R={pattern.resistance_line.num_touches}, "
                f"candle-confirmed={pattern.candle_confirmed_touches})",
            ]

            if pattern.volume_declining:
                reasons.append("Volume declining during consolidation")

            # --- Confidence calculation (pattern-type-specific) ---
            base_conf = _PATTERN_BASE_CONFIDENCE.get(pattern.pattern_type, 45.0)

            # Quality bonus: scale from quality above the pattern's minimum threshold
            quality_above_min = max(0, pattern.quality_score - min_q)
            quality_bonus = quality_above_min * 0.3  # 0.3 per point above min

            # Volume breakout bonus
            vol_bonus = min(8.0, (breakout.volume_ratio - 1.5) * 4.0) if breakout.volume_ratio > 1.5 else 0.0

            confidence = base_conf + quality_bonus + vol_bonus

            # Candle confirmation bonus/penalty (not a gate)
            if has_candle_confirm:
                confidence += 8
                reasons.append("Bullish candle confirmation (+8)")
            else:
                confidence -= 5
                reasons.append("No candle confirmation (-5)")

            # Integration bonus: high-touch pattern + candle breakout
            if touches >= 4 and has_candle_confirm:
                confidence += 10
                reasons.append("High-touch + candle breakout (+10)")

            # Volume declining = coiled spring
            if pattern.volume_declining:
                confidence += 5

            # Candlestick-confirmed trendline touches
            if pattern.candle_confirmed_touches >= 2:
                confidence += 5
                reasons.append(
                    f"{pattern.candle_confirmed_touches} candle-confirmed touches (+5)"
                )

            # Breakout alpha score (candle type, volume trend, fake detection)
            confidence += breakout.alpha_score
            reasons.extend(breakout.alpha_reasons)

            # Liquidity sweep bonus — trapped traders provide breakout fuel
            if breakout.sweep_detected:
                sweep_bonus = min(10.0, breakout.sweep_depth * 3.0)
                confidence += sweep_bonus
                reasons.append(
                    f"Liquidity sweep ({breakout.sweep_depth:.1f} ATR depth, +{sweep_bonus:.0f})"
                )

            # Universal confluence (Golden Cross, ADX, MACD)
            conf_bonus, conf_reasons = self.confluence_bonus(curr)
            confidence += conf_bonus
            reasons.extend(conf_reasons)

            # Single final cap
            confidence = min(95.0, confidence)

            # Store pattern type for exit management
            self._active_pattern_type = pattern.pattern_type

            return TradeSignal(
                strategy=self.name,
                symbol=symbol,
                direction=Direction.BUY,
                entry_price=breakout.entry_price,
                stop_loss=breakout.stop_loss,
                target=breakout.target,
                confidence=round(confidence, 1),
                reasons=reasons,
            )

        return None

    def should_exit(
        self, df: pd.DataFrame, position: Position
    ) -> Optional[ExitSignal]:
        if len(df) < 2:
            return None

        i = len(df) - 1
        curr = df.iloc[i]
        close = float(curr['close'])
        low = float(curr['low'])
        high = float(curr['high'])

        position.highest_since_entry = max(position.highest_since_entry, high)

        risk = position.entry_price - position.stop_loss
        if risk <= 0:
            risk = position.entry_price * 0.03

        # 1. Hard stop
        if low <= position.stop_loss:
            return ExitSignal(reason="stop_loss", exit_price=position.stop_loss)

        # 2. Target hit
        if high >= position.target:
            return ExitSignal(reason="target_hit", exit_price=position.target)

        # 3. Pattern-type-specific breakeven and trailing stop R-multiples
        be_r, trail_r = _EXIT_PARAMS.get(self._active_pattern_type, (2.0, 2.5))

        # Move to breakeven after be_r * risk profit
        if (high >= position.entry_price + be_r * risk
                and position.stop_loss < position.entry_price):
            position.stop_loss = position.entry_price

        # 4. Pattern-specific trailing EMA after trail_r * risk profit
        _TRAIL_EMA = {
            "bull_flag": ('ema_9', 0.003),
            "ascending_triangle": ('ema_21', 0.005),
            "symmetrical_triangle": ('sma_50', 0.008),
            "falling_wedge": ('ema_21', 0.005),
            "horizontal_channel": ('sma_50', 0.008),
        }
        if position.highest_since_entry >= position.entry_price + trail_r * risk:
            ema_key, buffer_pct = _TRAIL_EMA.get(
                self._active_pattern_type, ('ema_21', 0.005)
            )
            ema_val = curr.get(ema_key, 0)
            if not pd.isna(ema_val) and ema_val > 0:
                trail = ema_val - close * buffer_pct
                if trail > position.stop_loss and trail < close:
                    position.stop_loss = trail

        return None
