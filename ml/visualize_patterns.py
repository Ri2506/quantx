"""
SwingAI Algorithm Verification Visualizer — v2 (Institutional-Grade)
====================================================================
Generates dedicated charts to visually verify EACH algorithm component:

  Chart 1: Multi-Scale Zigzag Pivots (1.0x, 1.5x, 2.5x ATR)
  Chart 2: Theil-Sen Trendlines + Pattern Classification + Touch Points
  Chart 3: KDE Support/Resistance + Density Curve Subplot
  Chart 4: Reversal Patterns (Double Bottom, IH&S, Cup&Handle, Triple Bottom)
  Chart 5: Full Signal Overlay (combined view with all strategies)

Usage:
    python -m ml.visualize_patterns --stock RELIANCE --bars 250
    python -m ml.visualize_patterns --stock HDFCBANK SBIN --bars 200
    python -m ml.visualize_patterns --stock BAJFINANCE --bars 300 --all-emas
"""

import os
import sys
import warnings
from pathlib import Path
from typing import List, Optional, Dict

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec
import mplfinance as mpf

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.features.indicators import (
    compute_all_indicators,
    detect_support_resistance,
    detect_support_resistance_kde,
    detect_support_resistance_with_touches,
    _collect_pivot_data,
)
from ml.features.patterns import (
    scan_for_patterns, scan_for_reversal_patterns,
    detect_peaks_troughs, detect_breakout, detect_reversal_breakout,
    _zigzag_pivots, _get_atr_series,
    ZigzagPivot,
)
from ml.features.indicators import classify_trend_tier


warnings.filterwarnings("ignore")


# ── Chart style ──────────────────────────────────────────────────────────────

CHART_STYLE = mpf.make_mpf_style(
    base_mpf_style='charles',
    marketcolors=mpf.make_marketcolors(
        up='#26a69a', down='#ef5350',
        edge='inherit',
        wick={'up': '#26a69a', 'down': '#ef5350'},
        volume={'up': '#26a69a80', 'down': '#ef535080'},
    ),
    gridstyle='--',
    gridcolor='#e0e0e0',
    facecolor='white',
    figcolor='white',
)

# ── Color maps ───────────────────────────────────────────────────────────────

# Zigzag scale colors: minor=blue, intermediate=orange, major=red
ZIGZAG_COLORS = {
    1: {'high': '#42a5f5', 'low': '#42a5f5', 'size': 30,  'label': 'Scale 1 (1.0x ATR) Minor'},
    2: {'high': '#ff9800', 'low': '#ff9800', 'size': 60,  'label': 'Scale 2 (1.5x ATR) Intermediate'},
    3: {'high': '#d32f2f', 'low': '#2e7d32', 'size': 100, 'label': 'Scale 3 (2.5x ATR) Major'},
}

PATTERN_COLORS = {
    'ascending_triangle':    ('#1b5e20', '#b71c1c'),
    'horizontal_channel':    ('#004d40', '#880e4f'),
    'symmetrical_triangle':  ('#0d47a1', '#e65100'),
    'falling_wedge':         ('#1a237e', '#4a148c'),
    'bull_flag':             ('#33691e', '#bf360c'),
}

REVERSAL_COLORS = {
    # Bullish
    'double_bottom':            ('#ff6f00', '#2e7d32'),
    'triple_bottom':            ('#e65100', '#1b5e20'),
    'inverse_head_shoulders':   ('#d84315', '#004d40'),
    'cup_and_handle':           ('#bf360c', '#006064'),
    # Bearish
    # Continuation
    'high_tight_flag':          ('#1565c0', '#0d47a1'),
}

CANDLE_MARKERS = {
    'candle_hammer':               ('P', '#4caf50', 'Hammer',             'below'),
    'candle_engulfing_bull':       ('D', '#00c853', 'Engulfing Bull',     'below'),
    'candle_engulfing_bear':       ('D', '#ff1744', 'Engulfing Bear',     'above'),
    'candle_morning_star':         ('*', '#2196f3', 'Morning Star',       'below'),
    'candle_bullish_pin':          ('^', '#66bb6a', 'Pin Bar',            'below'),
    'candle_three_white_soldiers': ('H', '#00e676', '3 White Soldiers',   'below'),
    'candle_piercing_line':        ('s', '#76ff03', 'Piercing Line',      'below'),
    'candle_three_line_strike':    ('X', '#00e5ff', '3-Line Strike',      'below'),
    'candle_doji':                 ('_', '#9e9e9e', 'Doji',               'above'),
    'candle_dragonfly_doji':       ('+', '#4caf50', 'Dragonfly Doji',     'below'),
    'candle_gravestone_doji':      ('+', '#e53935', 'Gravestone Doji',    'above'),
    'candle_dark_cloud':           ('v', '#b71c1c', 'Dark Cloud',         'above'),
    'candle_evening_star':         ('*', '#d50000', 'Evening Star',       'above'),
    'candle_harami_bull':          ('o', '#43a047', 'Harami Bull',        'below'),
    'candle_harami_bear':          ('o', '#e53935', 'Harami Bear',        'above'),
    'candle_tweezer_bottom':       ('8', '#00897b', 'Tweezer Bot',        'below'),
    'candle_tweezer_top':          ('8', '#c62828', 'Tweezer Top',        'above'),
    'candle_abandoned_baby_bull':  ('*', '#00bfa5', 'Abandoned Baby',     'below'),
}

# Bullish candlestick columns to show on pattern-only charts
_BULLISH_CANDLE_COLS = [
    'candle_hammer', 'candle_inverted_hammer', 'candle_engulfing_bull',
    'candle_morning_star', 'candle_bullish_pin', 'candle_three_white_soldiers',
    'candle_piercing_line', 'candle_three_line_strike',
    'candle_dragonfly_doji', 'candle_harami_bull', 'candle_tweezer_bottom',
    'candle_abandoned_baby_bull',
]

VOLUME_MARKERS = {
    'volume_climax_sell':    ('v', '#ff1744', 'Vol Climax Sell'),
    'volume_climax_buy':     ('^', '#00c853', 'Vol Climax Buy'),
    'stopping_volume_bull':  ('o', '#4caf50', 'Stopping Vol'),
    'vpa_absorption_bull':   ('s', '#2196f3', 'Absorption Bull'),
    'vpa_no_supply':         ('d', '#66bb6a', 'No Supply'),
    'vpa_no_demand':         ('d', '#ef5350', 'No Demand'),
    'accumulation_phase':    ('P', '#00bfa5', 'Accumulation'),
}


# ═══════════════════════════════════════════════════════════════════════════
# CHART 1: Multi-Scale Zigzag Pivot Verification
# ═══════════════════════════════════════════════════════════════════════════

def chart_zigzag_pivots(symbol, df, last_n_bars, output_dir, start):
    """Visualize zigzag pivots at 3 ATR scales on candlestick chart."""
    chart_df = df.iloc[start:].copy()
    if not isinstance(chart_df.index, pd.DatetimeIndex):
        chart_df.index = pd.to_datetime(chart_df.index)

    plot_df = chart_df.rename(columns={
        'open': 'Open', 'high': 'High', 'low': 'Low',
        'close': 'Close', 'volume': 'Volume',
    })

    addplots = []
    atr_val = _get_median_atr(chart_df)
    pivot_summary = []

    # Run multi-scale zigzag on FULL dataframe
    scales = {1: 1.0, 2: 1.5, 3: 2.5}
    multi = {s: _zigzag_pivots(df, atr_multiplier=m) for s, m in scales.items()}

    for scale, pivots in multi.items():
        cfg = ZIGZAG_COLORS[scale]

        # Separate highs and lows
        high_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
        low_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
        high_count, low_count = 0, 0

        for p in pivots:
            local_i = p.index - start
            if 0 <= local_i < len(chart_df):
                if p.pivot_type == "high":
                    high_s.iloc[local_i] = p.price + 0.15 * scale * atr_val
                    high_count += 1
                else:
                    low_s.iloc[local_i] = p.price - 0.15 * scale * atr_val
                    low_count += 1

        if high_s.notna().sum() > 0:
            addplots.append(mpf.make_addplot(
                high_s, type='scatter', markersize=cfg['size'],
                marker='v', color=cfg['high'],
            ))
        if low_s.notna().sum() > 0:
            addplots.append(mpf.make_addplot(
                low_s, type='scatter', markersize=cfg['size'],
                marker='^', color=cfg['low'],
            ))

        pivot_summary.append(f"Scale {scale}: {high_count}H + {low_count}L = {high_count+low_count} pivots")

    # Add zigzag lines (connect pivots at scale 2 for visual clarity)
    scale2_pivots = multi.get(2, [])
    if len(scale2_pivots) >= 2:
        zz_line = pd.Series(np.nan, index=plot_df.index, dtype=float)
        chart_pivots = [(p.index - start, p.price) for p in scale2_pivots
                        if 0 <= p.index - start < len(chart_df)]
        # Linear interpolation between consecutive pivots
        for i in range(len(chart_pivots) - 1):
            idx1, price1 = chart_pivots[i]
            idx2, price2 = chart_pivots[i + 1]
            for j in range(idx1, min(idx2 + 1, len(chart_df))):
                if idx2 != idx1:
                    frac = (j - idx1) / (idx2 - idx1)
                    zz_line.iloc[j] = price1 + frac * (price2 - price1)
        if zz_line.notna().sum() > 1:
            addplots.append(mpf.make_addplot(
                zz_line, color='#ff9800', width=0.8, linestyle='--',
            ))

    # EMA 200 reference
    if 'ema_200' in chart_df.columns:
        ema = chart_df['ema_200'].copy()
        ema.index = plot_df.index
        if ema.notna().sum() > 2:
            addplots.append(mpf.make_addplot(ema, color='#ff9800', width=1.0))

    # ATR subplot (panel 2)
    if 'atr_14' in chart_df.columns:
        atr_s = chart_df['atr_14'].copy()
        atr_s.index = plot_df.index
        if atr_s.notna().sum() > 2:
            addplots.append(mpf.make_addplot(atr_s, panel=2, color='#7e57c2', width=0.8))

    title = f"{symbol} | Zigzag Pivots (3 ATR Scales) | Bars={len(chart_df)}"

    fig, axes = mpf.plot(
        plot_df, type='candle', volume=True, style=CHART_STYLE,
        addplot=addplots if addplots else None,
        title=title, figsize=(24, 14), returnfig=True,
        tight_layout=True,
        panel_ratios=(5, 1.2, 1),
    )

    # Legend and summary text
    legend_text = (
        "ZIGZAG PIVOT VERIFICATION\n"
        "Blue small = Scale 1 (1.0x ATR) Minor pivots\n"
        "Orange medium = Scale 2 (1.5x ATR) Intermediate\n"
        "Red/Green large = Scale 3 (2.5x ATR) Major structural\n"
        "Orange dashed line = Scale 2 zigzag path\n\n"
        + "\n".join(pivot_summary)
    )
    fig.text(0.02, 0.01, legend_text, fontsize=9, fontfamily='monospace',
             verticalalignment='bottom', color='#333333',
             bbox=dict(boxstyle='round', facecolor='#f5f5f5', alpha=0.8))

    # Pivot strength info on right side
    scale3 = multi.get(3, [])
    strength_lines = ["SCALE 3 PIVOT STRENGTH:"]
    visible_s3 = [p for p in scale3 if 0 <= p.index - start < len(chart_df)]
    for p in visible_s3[-10:]:  # Last 10
        dt = chart_df.index[p.index - start] if 0 <= p.index - start < len(chart_df) else "?"
        strength_lines.append(
            f"  {p.pivot_type.upper():4s} {p.price:8.1f}  str={p.strength:.2f}  "
            f"ATRx={p.atr_multiple:.1f}  vol={p.volume_ratio:.1f}x"
        )
    if len(strength_lines) > 1:
        fig.text(0.70, 0.01, "\n".join(strength_lines), fontsize=8,
                 fontfamily='monospace', verticalalignment='bottom', color='#1a237e',
                 bbox=dict(boxstyle='round', facecolor='#e8eaf6', alpha=0.8))

    path = os.path.join(output_dir, f"{symbol}_1_zigzag_pivots.png")
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  Chart 1 (Zigzag): {path}")
    for s in pivot_summary:
        print(f"    {s}")
    return path


# ═══════════════════════════════════════════════════════════════════════════
# CHART 2: Theil-Sen Trendlines + Pattern Classification
# ═══════════════════════════════════════════════════════════════════════════

def chart_trendlines_patterns(symbol, df, last_n_bars, output_dir, start):
    """Visualize Theil-Sen trendlines with R², touch points, and pattern labels."""
    chart_df = df.iloc[start:].copy()
    if not isinstance(chart_df.index, pd.DatetimeIndex):
        chart_df.index = pd.to_datetime(chart_df.index)

    plot_df = chart_df.rename(columns={
        'open': 'Open', 'high': 'High', 'low': 'Low',
        'close': 'Close', 'volume': 'Volume',
    })

    addplots = []
    pattern_info = []

    # Scan for trendline patterns
    patterns = scan_for_patterns(
        df, lookback=min(last_n_bars + 50, 300),
        min_duration=12, min_touches=3,
    )

    for pat in patterns:
        if pat.support_line is None or pat.resistance_line is None:
            continue

        sup_color, res_color = PATTERN_COLORS.get(
            pat.pattern_type, ('#4caf50', '#f44336')
        )

        # Line width by quality
        if pat.quality_score >= 70:
            lstyle, lwidth = '-', 2.0
        elif pat.quality_score >= 50:
            lstyle, lwidth = '--', 1.4
        else:
            lstyle, lwidth = ':', 0.9

        # Draw trendlines
        sup_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
        res_s = pd.Series(np.nan, index=plot_df.index, dtype=float)

        p_start = min(pat.support_line.start_idx, pat.resistance_line.start_idx)
        p_end = max(pat.support_line.end_idx, pat.resistance_line.end_idx)

        for i in range(len(chart_df)):
            gi = i + start
            if p_start <= gi <= p_end + 15:
                sup_s.iloc[i] = pat.support_line.value_at(gi)
                res_s.iloc[i] = pat.resistance_line.value_at(gi)

        if sup_s.notna().sum() > 1:
            addplots.append(mpf.make_addplot(
                sup_s, color=sup_color, linestyle=lstyle, width=lwidth,
            ))
        if res_s.notna().sum() > 1:
            addplots.append(mpf.make_addplot(
                res_s, color=res_color, linestyle=lstyle, width=lwidth,
            ))

        # Touch point markers
        for line, tp_color, tp_marker in [
            (pat.support_line, '#ff6f00', '^'),
            (pat.resistance_line, '#d50000', 'v'),
        ]:
            tp_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
            for pt_idx, pt_price in line.points:
                local_i = pt_idx - start
                if 0 <= local_i < len(chart_df):
                    tp_s.iloc[local_i] = pt_price
            if tp_s.notna().sum() > 0:
                addplots.append(mpf.make_addplot(
                    tp_s, type='scatter', markersize=80,
                    marker=tp_marker, color=tp_color,
                ))

        ptype = pat.pattern_type.replace('_', ' ').title()
        total_touches = pat.support_line.num_touches + pat.resistance_line.num_touches
        pattern_info.append(
            f"{ptype}: {pat.duration_bars}bars, Q={pat.quality_score:.0f}, "
            f"R²(sup={pat.support_line.r_squared:.3f}, "
            f"res={pat.resistance_line.r_squared:.3f}), "
            f"{total_touches}T, "
            f"candle_conf={pat.candle_confirmed_touches}"
        )

    # EMA 200
    if 'ema_200' in chart_df.columns:
        ema = chart_df['ema_200'].copy()
        ema.index = plot_df.index
        if ema.notna().sum() > 2:
            addplots.append(mpf.make_addplot(ema, color='#ff9800', width=0.8))

    title = (f"{symbol} | Theil-Sen Trendlines + Patterns | "
             f"{len(patterns)} pattern(s) detected")

    fig, axes = mpf.plot(
        plot_df, type='candle', volume=True, style=CHART_STYLE,
        addplot=addplots if addplots else None,
        title=title, figsize=(24, 14), returnfig=True,
        tight_layout=True,
        panel_ratios=(5, 1.2),
    )

    # Pattern details text
    if pattern_info:
        details = "TRENDLINE PATTERNS (Theil-Sen + ATR-normalized):\n" + "\n".join(pattern_info)
    else:
        details = "NO TRENDLINE PATTERNS DETECTED in visible range."

    legend = (
        "LEGEND: ^ = support touch | v = resistance touch\n"
        "Solid = Q>=70 | Dashed = Q>=50 | Dotted = Q<50\n"
        "R² = Theil-Sen fit quality (higher = better fit)"
    )

    fig.text(0.02, 0.01, details + "\n\n" + legend, fontsize=9,
             fontfamily='monospace', verticalalignment='bottom', color='#333333',
             bbox=dict(boxstyle='round', facecolor='#f5f5f5', alpha=0.8))

    path = os.path.join(output_dir, f"{symbol}_2_trendlines.png")
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  Chart 2 (Trendlines): {path}")
    for p in pattern_info:
        print(f"    {p}")
    return path


# ═══════════════════════════════════════════════════════════════════════════
# CHART 3: KDE Support/Resistance + Density Curves
# ═══════════════════════════════════════════════════════════════════════════

def chart_kde_sr(symbol, df, last_n_bars, output_dir, start):
    """Visualize KDE S/R levels with density curve subplot."""
    chart_df = df.iloc[start:].copy()
    if not isinstance(chart_df.index, pd.DatetimeIndex):
        chart_df.index = pd.to_datetime(chart_df.index)

    # Create figure with gridspec: left=candlestick, right=KDE density
    fig = plt.figure(figsize=(28, 14))
    gs = gridspec.GridSpec(2, 2, width_ratios=[4, 1], height_ratios=[3, 1],
                           hspace=0.08, wspace=0.03)

    # ── Left: Candlestick with S/R levels ──
    ax_candle = fig.add_subplot(gs[0, 0])
    ax_volume = fig.add_subplot(gs[1, 0], sharex=ax_candle)

    # Draw candlesticks manually on ax_candle
    _draw_candlesticks(ax_candle, ax_volume, chart_df)

    # Get KDE S/R levels
    try:
        kde_support, kde_resistance = detect_support_resistance_kde(chart_df, lookback=60)
    except Exception:
        kde_support, kde_resistance = [], []

    sr_info = []

    # Draw support levels
    for i, (price, touches, strength) in enumerate(kde_support[:5]):
        alpha = min(0.9, 0.3 + touches * 0.15)
        ax_candle.axhline(y=price, color='#4caf50', linestyle='--',
                          linewidth=1.0 + touches * 0.3, alpha=alpha)
        ax_candle.text(chart_df.index[-1], price, f"  S {price:.1f} ({touches}T)",
                       fontsize=8, color='#2e7d32', va='bottom')
        sr_info.append(f"SUPPORT: {price:.2f} ({touches} touches, str={strength:.2f})")

    # Draw resistance levels
    for i, (price, touches, strength) in enumerate(kde_resistance[:5]):
        alpha = min(0.9, 0.3 + touches * 0.15)
        ax_candle.axhline(y=price, color='#f44336', linestyle='--',
                          linewidth=1.0 + touches * 0.3, alpha=alpha)
        ax_candle.text(chart_df.index[-1], price, f"  R {price:.1f} ({touches}T)",
                       fontsize=8, color='#c62828', va='top')
        sr_info.append(f"RESIST:  {price:.2f} ({touches} touches, str={strength:.2f})")

    # Swing point markers on candlestick
    if 'swing_high' in chart_df.columns:
        sh_mask = chart_df['swing_high'].fillna(False).astype(bool)
        for i in range(len(chart_df)):
            if sh_mask.iloc[i]:
                ax_candle.plot(chart_df.index[i], chart_df['high'].iloc[i],
                               'v', color='#d32f2f', markersize=6, alpha=0.6)
    if 'swing_low' in chart_df.columns:
        sl_mask = chart_df['swing_low'].fillna(False).astype(bool)
        for i in range(len(chart_df)):
            if sl_mask.iloc[i]:
                ax_candle.plot(chart_df.index[i], chart_df['low'].iloc[i],
                               '^', color='#388e3c', markersize=6, alpha=0.6)

    ax_candle.set_title(f"{symbol} | KDE Support/Resistance Levels", fontsize=14)
    ax_candle.set_ylabel("Price")
    ax_candle.grid(True, alpha=0.3)

    # ── Right: KDE Density Curves (rotated to align with price axis) ──
    ax_kde = fig.add_subplot(gs[0, 1], sharey=ax_candle)

    # Collect pivot data and compute KDE density curves
    support_data, resistance_data, atr_median = _collect_pivot_data(chart_df, lookback=60)
    bandwidth = 0.5 * atr_median

    _plot_kde_density(ax_kde, support_data, bandwidth, '#4caf50', 'Support')
    _plot_kde_density(ax_kde, resistance_data, bandwidth, '#f44336', 'Resistance')

    ax_kde.set_xlabel("KDE Density", fontsize=10)
    ax_kde.set_title("Density", fontsize=10)
    ax_kde.legend(loc='upper right', fontsize=8)
    ax_kde.grid(True, alpha=0.3)
    plt.setp(ax_kde.get_yticklabels(), visible=False)

    # ── Summary text ──
    summary_text = (
        f"KDE S/R VERIFICATION | bandwidth = 0.5 * ATR = {bandwidth:.2f}\n"
        f"ATR(14) median = {atr_median:.2f}\n\n"
        + "\n".join(sr_info) if sr_info else "No S/R levels detected"
    )
    fig.text(0.02, 0.01, summary_text, fontsize=9, fontfamily='monospace',
             verticalalignment='bottom', color='#333333',
             bbox=dict(boxstyle='round', facecolor='#f5f5f5', alpha=0.8))

    path = os.path.join(output_dir, f"{symbol}_3_kde_sr.png")
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  Chart 3 (KDE S/R): {path}")
    for s in sr_info:
        print(f"    {s}")
    return path


def _plot_kde_density(ax, pivot_data, bandwidth, color, label):
    """Plot KDE density curve on a vertical axis (price on y-axis)."""
    if len(pivot_data) < 2:
        return

    prices = np.array([p[0] for p in pivot_data])
    price_range = prices.max() - prices.min()
    if price_range <= 0:
        return

    bw_factor = bandwidth / price_range
    bw_factor = max(0.03, min(0.5, bw_factor))

    try:
        from scipy.stats import gaussian_kde
        kde = gaussian_kde(prices, bw_method=bw_factor)
        grid = np.linspace(prices.min() - bandwidth, prices.max() + bandwidth, 300)
        density = kde(grid)

        # Plot horizontally: density on x-axis, price on y-axis
        ax.fill_betweenx(grid, 0, density, alpha=0.3, color=color, label=label)
        ax.plot(density, grid, color=color, linewidth=1.5)

        # Mark peaks in density
        from scipy.signal import find_peaks as sp_find_peaks
        peak_idx, _ = sp_find_peaks(density, height=density.max() * 0.25)
        for pi in peak_idx:
            ax.plot(density[pi], grid[pi], 'o', color=color, markersize=8)
            ax.annotate(f"{grid[pi]:.1f}", (density[pi], grid[pi]),
                        fontsize=7, color=color, ha='left')
    except Exception:
        pass


def _draw_candlesticks(ax, ax_vol, chart_df):
    """Draw candlesticks manually on matplotlib axes."""
    dates = chart_df.index
    opens = chart_df['open'].values.astype(float)
    highs = chart_df['high'].values.astype(float)
    lows = chart_df['low'].values.astype(float)
    closes = chart_df['close'].values.astype(float)
    volumes = chart_df['volume'].values.astype(float)

    up_color = '#26a69a'
    down_color = '#ef5350'

    for i in range(len(chart_df)):
        color = up_color if closes[i] >= opens[i] else down_color
        # Wick
        ax.plot([dates[i], dates[i]], [lows[i], highs[i]],
                color=color, linewidth=0.6)
        # Body
        body_low = min(opens[i], closes[i])
        body_high = max(opens[i], closes[i])
        body_height = body_high - body_low
        if body_height < (highs[i] - lows[i]) * 0.01:
            body_height = (highs[i] - lows[i]) * 0.01
        ax.bar(dates[i], body_height, bottom=body_low, width=0.8,
               color=color, edgecolor=color, linewidth=0.3)

        # Volume
        ax_vol.bar(dates[i], volumes[i], width=0.8,
                   color=color, alpha=0.5)

    ax_vol.set_ylabel("Volume", fontsize=8)


# ═══════════════════════════════════════════════════════════════════════════
# CHART 4: Reversal Pattern Verification
# ═══════════════════════════════════════════════════════════════════════════

def chart_reversal_patterns(symbol, df, last_n_bars, output_dir, start):
    """Visualize reversal patterns with structural pivot markers."""
    chart_df = df.iloc[start:].copy()
    if not isinstance(chart_df.index, pd.DatetimeIndex):
        chart_df.index = pd.to_datetime(chart_df.index)

    plot_df = chart_df.rename(columns={
        'open': 'Open', 'high': 'High', 'low': 'Low',
        'close': 'Close', 'volume': 'Volume',
    })

    addplots = []
    pattern_info = []

    # Scan reversal patterns
    reversal_pats = scan_for_reversal_patterns(df, lookback=min(last_n_bars + 80, 300))

    for rpat in reversal_pats:
        neckline = rpat.neckline_level if rpat.neckline_level > 0 else rpat.breakout_level
        nl_color, sup_color = REVERSAL_COLORS.get(
            rpat.pattern_type, ('#ff9800', '#4caf50')
        )

        # Neckline / resistance level
        nl_s = pd.Series(neckline, index=plot_df.index, dtype=float)
        addplots.append(mpf.make_addplot(
            nl_s, color=nl_color, linestyle='--', width=1.5,
        ))

        # Support / bottom level
        sup_s = pd.Series(rpat.support_level, index=plot_df.index, dtype=float)
        addplots.append(mpf.make_addplot(
            sup_s, color=sup_color, linestyle='--', width=1.2,
        ))

        # Target projection (measured move)
        target = neckline + rpat.pattern_height
        tgt_s = pd.Series(target, index=plot_df.index, dtype=float)
        addplots.append(mpf.make_addplot(
            tgt_s, color='#1565c0', linestyle=':', width=0.8,
        ))

        ptype = rpat.pattern_type.replace('_', ' ').title()
        pattern_info.append(
            f"{ptype}: dur={rpat.duration_bars}bars, Q={rpat.quality_score:.0f}, "
            f"neck={neckline:.1f}, support={rpat.support_level:.1f}, "
            f"depth={rpat.pattern_height:.1f}, target={target:.1f}, "
            f"candle_conf={rpat.candle_confirmed_touches}"
        )

    # Scale-3 zigzag pivots (major structural points)
    pivots_major = _zigzag_pivots(df, atr_multiplier=2.5)
    high_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
    low_s = pd.Series(np.nan, index=plot_df.index, dtype=float)

    for p in pivots_major:
        local_i = p.index - start
        if 0 <= local_i < len(chart_df):
            atr_v = _get_median_atr(chart_df)
            if p.pivot_type == "high":
                high_s.iloc[local_i] = p.price + 0.3 * atr_v
            else:
                low_s.iloc[local_i] = p.price - 0.3 * atr_v

    if high_s.notna().sum() > 0:
        addplots.append(mpf.make_addplot(
            high_s, type='scatter', markersize=80,
            marker='v', color='#d32f2f',
        ))
    if low_s.notna().sum() > 0:
        addplots.append(mpf.make_addplot(
            low_s, type='scatter', markersize=80,
            marker='^', color='#2e7d32',
        ))

    # EMA 200
    if 'ema_200' in chart_df.columns:
        ema = chart_df['ema_200'].copy()
        ema.index = plot_df.index
        if ema.notna().sum() > 2:
            addplots.append(mpf.make_addplot(ema, color='#ff9800', width=0.8))

    n_pats = len(reversal_pats)
    title = (f"{symbol} | Reversal Patterns (ATR-Adaptive) | "
             f"{n_pats} pattern(s)")

    fig, axes = mpf.plot(
        plot_df, type='candle', volume=True, style=CHART_STYLE,
        addplot=addplots if addplots else None,
        title=title, figsize=(24, 14), returnfig=True,
        tight_layout=True,
        panel_ratios=(5, 1.2),
    )

    if pattern_info:
        details = "REVERSAL PATTERNS (ATR-tolerance pivots):\n" + "\n".join(pattern_info)
    else:
        details = "NO REVERSAL PATTERNS DETECTED in visible range."

    legend = (
        "LEGEND: v/^ = Scale-3 zigzag pivots (2.5x ATR)\n"
        "Dashed orange = neckline | Dashed green = support/bottom\n"
        "Dotted blue = target (measured move)"
    )

    fig.text(0.02, 0.01, details + "\n\n" + legend, fontsize=9,
             fontfamily='monospace', verticalalignment='bottom', color='#333333',
             bbox=dict(boxstyle='round', facecolor='#f5f5f5', alpha=0.8))

    path = os.path.join(output_dir, f"{symbol}_4_reversals.png")
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  Chart 4 (Reversals): {path}")
    for p in pattern_info:
        print(f"    {p}")
    return path


# ═══════════════════════════════════════════════════════════════════════════
# CHART 5: Full Signal Overlay (combined)
# ═══════════════════════════════════════════════════════════════════════════

def chart_full_overlay(symbol, df, last_n_bars, output_dir, start, show_all_emas=False):
    """Combined chart: price + all overlays + RSI + MACD subplots."""
    chart_df = df.iloc[start:].copy()
    if not isinstance(chart_df.index, pd.DatetimeIndex):
        chart_df.index = pd.to_datetime(chart_df.index)

    plot_df = chart_df.rename(columns={
        'open': 'Open', 'high': 'High', 'low': 'Low',
        'close': 'Close', 'volume': 'Volume',
    })

    addplots = []
    atr_val = _get_median_atr(chart_df)

    # 1. Indicators
    core_indicators = [
        ('ema_200', '#ff9800', 1.2, 'EMA 200'),
        ('bb_upper', '#9e9e9e', 0.5, 'BB Upper'),
        ('bb_lower', '#9e9e9e', 0.5, 'BB Lower'),
    ]
    if show_all_emas:
        core_indicators = [
            ('ema_9', '#42a5f5', 0.6, 'EMA 9'),
            ('ema_21', '#1565c0', 0.7, 'EMA 21'),
            ('sma_50', '#ab47bc', 0.7, 'SMA 50'),
        ] + core_indicators

    for col, color, width, label in core_indicators:
        if col in chart_df.columns:
            s = chart_df[col].copy()
            s.index = plot_df.index
            if s.notna().sum() > 2:
                addplots.append(mpf.make_addplot(s, color=color, width=width))

    # 2. S/R levels (KDE)
    sr_info = []
    try:
        kde_sup, kde_res = detect_support_resistance_kde(chart_df, lookback=60)
        for price, touches, _ in kde_sup[:3]:
            s = pd.Series(price, index=plot_df.index, dtype=float)
            addplots.append(mpf.make_addplot(s, color='#4caf50', linestyle=':', width=0.7))
            sr_info.append(('S', price, touches))
        for price, touches, _ in kde_res[:3]:
            s = pd.Series(price, index=plot_df.index, dtype=float)
            addplots.append(mpf.make_addplot(s, color='#f44336', linestyle=':', width=0.7))
            sr_info.append(('R', price, touches))
    except Exception:
        pass

    # 3. Trendline patterns
    pattern_info = []
    patterns = scan_for_patterns(df, lookback=min(last_n_bars + 50, 250),
                                 min_duration=15, min_touches=3)
    for pat in patterns:
        if pat.support_line is None or pat.resistance_line is None:
            continue
        sup_color, res_color = PATTERN_COLORS.get(pat.pattern_type, ('#4caf50', '#f44336'))
        lstyle = '-' if pat.quality_score >= 70 else ('--' if pat.quality_score >= 50 else ':')
        lwidth = 1.8 if pat.quality_score >= 70 else 1.2

        sup_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
        res_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
        p_start = min(pat.support_line.start_idx, pat.resistance_line.start_idx)
        p_end = max(pat.support_line.end_idx, pat.resistance_line.end_idx)
        for i in range(len(chart_df)):
            gi = i + start
            if p_start <= gi <= p_end + 10:
                sup_s.iloc[i] = pat.support_line.value_at(gi)
                res_s.iloc[i] = pat.resistance_line.value_at(gi)
        if sup_s.notna().sum() > 1:
            addplots.append(mpf.make_addplot(sup_s, color=sup_color, linestyle=lstyle, width=lwidth))
        if res_s.notna().sum() > 1:
            addplots.append(mpf.make_addplot(res_s, color=res_color, linestyle=lstyle, width=lwidth))

        for line, tp_color in [(pat.support_line, '#ff6f00'), (pat.resistance_line, '#d50000')]:
            tp_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
            for pt_idx, pt_price in line.points:
                local_i = pt_idx - start
                if 0 <= local_i < len(chart_df):
                    tp_s.iloc[local_i] = pt_price
            if tp_s.notna().sum() > 0:
                addplots.append(mpf.make_addplot(
                    tp_s, type='scatter', markersize=60, marker='o', color=tp_color))

        ptype = pat.pattern_type.replace('_', ' ').title()
        touches = pat.support_line.num_touches + pat.resistance_line.num_touches
        pattern_info.append(f"{ptype} (Q={pat.quality_score:.0f}, {touches}T)")

    # Reversal patterns
    reversal_pats = scan_for_reversal_patterns(df, lookback=min(last_n_bars + 50, 250))
    for rpat in reversal_pats:
        neckline = rpat.neckline_level if rpat.neckline_level > 0 else rpat.breakout_level
        nl_color, sup_color = REVERSAL_COLORS.get(rpat.pattern_type, ('#ff9800', '#4caf50'))
        nl_s = pd.Series(neckline, index=plot_df.index, dtype=float)
        sup_s = pd.Series(rpat.support_level, index=plot_df.index, dtype=float)
        addplots.append(mpf.make_addplot(nl_s, color=nl_color, linestyle='--', width=1.2))
        addplots.append(mpf.make_addplot(sup_s, color=sup_color, linestyle='--', width=1.0))
        ptype = rpat.pattern_type.replace('_', ' ').title()
        pattern_info.append(f"{ptype} (Q={rpat.quality_score:.0f}, neck={neckline:.1f})")

    # 4. Candle patterns
    candle_counts = {}
    for col, (marker, color, label, offset_dir) in CANDLE_MARKERS.items():
        if col not in chart_df.columns:
            continue
        mask = chart_df[col].fillna(False).astype(bool)
        count = mask.sum()
        if count == 0:
            continue
        candle_counts[label] = int(count)
        s = pd.Series(np.nan, index=plot_df.index, dtype=float)
        for i in range(len(chart_df)):
            if mask.iloc[i]:
                if offset_dir == 'below':
                    s.iloc[i] = float(chart_df['low'].iloc[i]) - 0.5 * atr_val
                else:
                    s.iloc[i] = float(chart_df['high'].iloc[i]) + 0.5 * atr_val
        if s.notna().sum() > 0:
            addplots.append(mpf.make_addplot(
                s, type='scatter', markersize=50, marker=marker, color=color))

    # 5. Volume signals
    vol_counts = {}
    for col, (marker, color, label) in VOLUME_MARKERS.items():
        if col not in chart_df.columns:
            continue
        mask = chart_df[col].fillna(False).astype(bool)
        count = mask.sum()
        if count == 0:
            continue
        vol_counts[label] = int(count)
        s = pd.Series(np.nan, index=plot_df.index, dtype=float)
        for i in range(len(chart_df)):
            if mask.iloc[i]:
                s.iloc[i] = float(chart_df['high'].iloc[i]) + 1.0 * atr_val
        if s.notna().sum() > 0:
            addplots.append(mpf.make_addplot(
                s, type='scatter', markersize=40, marker=marker, color=color))

    # 6. RSI (panel 2)
    if 'rsi_14' in chart_df.columns:
        rsi = chart_df['rsi_14'].copy()
        rsi.index = plot_df.index
        addplots.append(mpf.make_addplot(rsi, panel=2, color='#7e57c2', width=0.8))
        addplots.append(mpf.make_addplot(
            pd.Series(30.0, index=plot_df.index), panel=2, color='#4caf50', linestyle='--', width=0.4))
        addplots.append(mpf.make_addplot(
            pd.Series(70.0, index=plot_df.index), panel=2, color='#f44336', linestyle='--', width=0.4))

    # 7. MACD (panel 3)
    if 'macd' in chart_df.columns and 'macd_signal' in chart_df.columns:
        macd = chart_df['macd'].copy()
        macd_sig = chart_df['macd_signal'].copy()
        macd.index = plot_df.index
        macd_sig.index = plot_df.index
        addplots.append(mpf.make_addplot(macd, panel=3, color='#1565c0', width=0.8))
        addplots.append(mpf.make_addplot(macd_sig, panel=3, color='#e65100', width=0.8))
        if 'macd_hist' in chart_df.columns:
            mh = chart_df['macd_hist'].copy()
            mh.index = plot_df.index
            addplots.append(mpf.make_addplot(mh.where(mh >= 0), panel=3, type='bar', color='#4caf50', width=0.7))
            addplots.append(mpf.make_addplot(mh.where(mh < 0), panel=3, type='bar', color='#ef5350', width=0.7))

    # Build title
    last = chart_df.iloc[-1]
    close_price = float(last['close'])
    ema200 = last.get('ema_200', np.nan)
    rsi_v = last.get('rsi_14', np.nan)
    title_parts = [f"{symbol}", f"Close={close_price:.2f}"]
    if not pd.isna(ema200):
        title_parts.append(f"{'Above' if close_price > ema200 else 'BELOW'} 200-EMA")
    if not pd.isna(rsi_v):
        title_parts.append(f"RSI={rsi_v:.1f}")
    title = " | ".join(title_parts)

    fig, axes = mpf.plot(
        plot_df, type='candle', volume=True, style=CHART_STYLE,
        addplot=addplots if addplots else None,
        title=title, figsize=(24, 16), returnfig=True,
        tight_layout=True,
        panel_ratios=(5, 1.2, 1, 1),
    )

    text_lines = []
    if pattern_info:
        text_lines.append(f"PATTERNS: {' | '.join(pattern_info)}")
    if sr_info:
        sr_text = ", ".join([f"{t} {v:.2f} ({tc}T)" for t, v, tc in sr_info])
        text_lines.append(f"KDE S/R: {sr_text}")
    if candle_counts:
        text_lines.append(f"CANDLES: {', '.join(f'{k}={v}' for k, v in candle_counts.items())}")
    if vol_counts:
        text_lines.append(f"VOLUME: {', '.join(f'{k}={v}' for k, v in vol_counts.items())}")

    if text_lines:
        fig.text(0.02, 0.01, "\n".join(text_lines), fontsize=9, fontfamily='monospace',
                 verticalalignment='bottom', color='#333333',
                 bbox=dict(boxstyle='round', facecolor='#f5f5f5', alpha=0.8))

    path = os.path.join(output_dir, f"{symbol}_5_full_overlay.png")
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  Chart 5 (Full): {path}")
    return path


# ═══════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _get_median_atr(chart_df):
    if 'atr_14' in chart_df.columns:
        vals = chart_df['atr_14'].dropna()
        if len(vals) > 0:
            return float(vals.median())
    return float(chart_df['close'].median()) * 0.015


# ═══════════════════════════════════════════════════════════════════════════
# CHART 6: Clean Pattern-Only (human-quality trendline verification)
# ═══════════════════════════════════════════════════════════════════════════

def chart_pattern_clean(symbol, df, last_n_bars, output_dir, start, interval='1d'):
    """
    Clean chart: candlesticks + bold shaded pattern areas + touch points + on-chart labels.

    Shows only the top 3 highest-quality patterns to reduce noise.
    Shape-aware reversal rendering: W-shapes, IH&S 5-point lines, smooth cup curves.
    Consolidation: lighter shading (alpha=0.15). Reversal: bolder shading (alpha=0.25).
    No EMAs, RSI, MACD, Bollinger Bands.
    """
    import matplotlib.dates as mdates

    chart_df = df.iloc[start:].copy()
    if not isinstance(chart_df.index, pd.DatetimeIndex):
        chart_df.index = pd.to_datetime(chart_df.index)

    plot_df = chart_df.rename(columns={
        'open': 'Open', 'high': 'High', 'low': 'Low',
        'close': 'Close', 'volume': 'Volume',
    })

    addplots = []
    pattern_info = []
    found_any = False

    # Data for post-render drawing
    fill_regions = []    # [(dates, lower_vals, upper_vals, color, alpha)]
    text_labels = []     # [(x_date, y_price, label_text, color)]
    shape_draws = []     # [(shape_x_locals, shape_y_prices, shade_col, pat_type, pivot_data)]
    neckline_draws = []  # [(x_start, x_end, y_start, y_end, pat_type)] for post-render necklines
    # target_draws and support_draws removed — not rendered

    # scan_for_patterns() now includes reversal patterns (bug fixed)
    all_patterns = scan_for_patterns(
        df, lookback=min(last_n_bars + 50, 300),
        min_duration=12, min_touches=3, interval=interval,
    )

    # Deduplicate by type, prioritizing bullish/consolidation for long entries.
    # Bearish patterns only shown as warnings if slots remain.
    def _pattern_priority(p):
        """Sort key: -quality (highest quality first)."""
        return -p.quality_score

    seen_types = set()
    deduped = []
    for p in sorted(all_patterns, key=_pattern_priority):
        if p.pattern_type not in seen_types:
            seen_types.add(p.pattern_type)
            deduped.append(p)
    all_patterns = deduped[:3]  # Top 3 patterns max — bullish/consolidation first

    # Pattern type → (shade_color, support_color, resistance_color, fill_alpha)
    SHADE_COLORS = {
        # Consolidation: lighter fill
        'ascending_triangle':    ('#4CAF50', '#1B5E20', '#B71C1C', 0.15),
        'bull_flag':             ('#4CAF50', '#1B5E20', '#B71C1C', 0.15),
        'falling_wedge':         ('#2196F3', '#0D47A1', '#E65100', 0.15),
        'horizontal_channel':    ('#9C27B0', '#4A148C', '#880E4F', 0.15),
        'symmetrical_triangle':  ('#607D8B', '#263238', '#BF360C', 0.15),
        # Reversal: bolder fill with distinct warm tones
        'double_bottom':         ('#FFB300', '#E65100', '#2E7D32', 0.25),
        'triple_bottom':         ('#FF8F00', '#E65100', '#1B5E20', 0.25),
        'inverse_head_shoulders':('#FF6D00', '#D84315', '#004D40', 0.25),
        'cup_and_handle':        ('#FF3D00', '#BF360C', '#006064', 0.25),
        # Diamond
        # Continuation
        'high_tight_flag':        ('#1E88E5', '#1565C0', '#0D47A1', 0.25),
    }

    for pat in all_patterns:
        shade_col, sup_col, res_col, fill_alpha = SHADE_COLORS.get(
            pat.pattern_type, ('#9E9E9E', '#424242', '#424242', 0.18)
        )

        # ── Consolidation patterns: support_line + resistance_line ──
        if pat.support_line is not None and pat.resistance_line is not None:
            found_any = True
            sup_line = pat.support_line
            res_line = pat.resistance_line

            sup_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
            res_s = pd.Series(np.nan, index=plot_df.index, dtype=float)

            p_start = min(sup_line.start_idx, res_line.start_idx)
            p_end = max(sup_line.end_idx, res_line.end_idx) + 20

            fill_dates, fill_sup, fill_res = [], [], []

            for i in range(len(chart_df)):
                gi = i + start
                if p_start <= gi <= p_end:
                    sv = sup_line.value_at(gi)
                    rv = res_line.value_at(gi)
                    sup_s.iloc[i] = sv
                    res_s.iloc[i] = rv
                    fill_dates.append(plot_df.index[i])
                    fill_sup.append(sv)
                    fill_res.append(rv)

            if fill_dates:
                fill_regions.append((fill_dates, fill_sup, fill_res, shade_col, fill_alpha))

            if sup_s.notna().sum() > 1:
                addplots.append(mpf.make_addplot(
                    sup_s, color=sup_col, linestyle='-', width=2.5,
                ))
            if res_s.notna().sum() > 1:
                addplots.append(mpf.make_addplot(
                    res_s, color=res_col, linestyle='-', width=2.5,
                ))

            for line, tp_color in [(sup_line, sup_col), (res_line, res_col)]:
                tp_s = pd.Series(np.nan, index=plot_df.index, dtype=float)
                for pt_idx, pt_price in line.points:
                    local_i = pt_idx - start
                    if 0 <= local_i < len(chart_df):
                        tp_s.iloc[local_i] = pt_price
                if tp_s.notna().sum() > 0:
                    addplots.append(mpf.make_addplot(
                        tp_s, type='scatter', markersize=150,
                        marker='o', color=tp_color,
                    ))

            ptype = pat.pattern_type.replace('_', ' ').title()
            total_t = sup_line.num_touches + res_line.num_touches
            respect = getattr(pat, 'respect_ratio', 1.0)

            mid_gi = (p_start + p_end) // 2
            mid_local = mid_gi - start
            if 0 <= mid_local < len(chart_df):
                mid_price = (sup_line.value_at(mid_gi) + res_line.value_at(mid_gi)) / 2
                text_labels.append((
                    plot_df.index[mid_local], mid_price,
                    f"{ptype}\nQ={pat.quality_score:.0f} | {total_t}T",
                    shade_col,
                ))

            pattern_info.append(
                f"{ptype} (Q={pat.quality_score:.0f}, {total_t}T, respect={respect:.2f})"
            )

        # ── Reversal patterns: shape-aware rendering via pivot_indices ──
        elif pat.neckline_level > 0:
            found_any = True
            pivots = getattr(pat, 'pivot_indices', [])
            ptype = pat.pattern_type.replace('_', ' ').title()

            if pivots:
                # Map pivots to local chart coordinates
                shape_x = []   # local indices
                shape_y = []   # prices
                shape_l = []   # labels
                for (bar_idx, price, label) in pivots:
                    local_i = bar_idx - start
                    if 0 <= local_i < len(chart_df):
                        shape_x.append(local_i)
                        shape_y.append(price)
                        shape_l.append(label)

                if len(shape_x) >= 2:
                    # Collect shape for post-render drawing
                    shape_draws.append((shape_x, shape_y, shape_l, shade_col, pat.pattern_type))

                    p_start_local = shape_x[0]
                    p_end_local = min(shape_x[-1] + 20, len(chart_df) - 1)

                    # Neckline: slope through actual pivot points for precision
                    # Find neckline reference pivots by pattern type
                    if pat.pattern_type in ("inverse_head_shoulders", "head_shoulders_top",
                                            "triple_bottom", "triple_top",
                                            "double_bottom", "double_top"):
                        nl_pivots = [(i, p) for i, p, l in zip(shape_x, shape_y, shape_l)
                                     if "neckline" in l]
                    elif pat.pattern_type == "cup_and_handle":
                        nl_pivots = [(i, p) for i, p, l in zip(shape_x, shape_y, shape_l)
                                     if "rim" in l]
                    else:
                        nl_pivots = []

                    if len(nl_pivots) >= 2:
                        # Sloped neckline through actual pivots, extrapolated right
                        nl_x0, nl_y0 = nl_pivots[0]
                        nl_x1, nl_y1 = nl_pivots[-1]
                        if nl_x1 != nl_x0:
                            slope = (nl_y1 - nl_y0) / (nl_x1 - nl_x0)
                            y_at_end = nl_y0 + slope * (p_end_local - nl_x0)
                        else:
                            y_at_end = nl_y1
                        neckline_draws.append((
                            nl_x0, p_end_local,
                            nl_y0, y_at_end,
                            pat.pattern_type,
                        ))
                    elif len(nl_pivots) == 1:
                        # Single neckline pivot — horizontal through its exact price
                        neckline_draws.append((
                            nl_pivots[0][0], p_end_local,
                            nl_pivots[0][1], nl_pivots[0][1],
                            pat.pattern_type,
                        ))
                    else:
                        # Fallback: flat at neckline_level
                        neckline_draws.append((
                            p_start_local, p_end_local,
                            pat.neckline_level, pat.neckline_level,
                            pat.pattern_type,
                        ))

                    # Shading: fill between neckline and support
                    fill_dates_rev = [plot_df.index[i] for i in range(p_start_local, p_end_local + 1)
                                      if 0 <= i < len(plot_df)]
                    fill_upper = [pat.neckline_level] * len(fill_dates_rev)
                    fill_lower = [pat.support_level] * len(fill_dates_rev)
                    if fill_dates_rev:
                        fill_regions.append((fill_dates_rev, fill_lower, fill_upper, shade_col, fill_alpha))

                    # On-chart label
                    mid_local = (shape_x[0] + shape_x[-1]) // 2
                    if 0 <= mid_local < len(chart_df):
                        mid_price = (pat.neckline_level + pat.support_level) / 2
                        text_labels.append((
                            plot_df.index[mid_local], mid_price,
                            f"{ptype}\nQ={pat.quality_score:.0f}",
                            shade_col,
                        ))
            else:
                # Fallback: flat lines for patterns without pivot_indices
                pat_start_local = max(0, len(chart_df) - pat.duration_bars - 30)
                pat_end_local = len(chart_df) - 1

                neckline_draws.append((
                    pat_start_local, pat_end_local,
                    pat.neckline_level, pat.neckline_level,
                    pat.pattern_type,
                ))
                fill_dates = [plot_df.index[i] for i in range(pat_start_local, pat_end_local + 1)
                              if 0 <= i < len(plot_df)]
                fill_lo = [pat.support_level] * len(fill_dates)
                fill_hi = [pat.neckline_level] * len(fill_dates)
                if fill_dates:
                    fill_regions.append((fill_dates, fill_lo, fill_hi, shade_col, fill_alpha))

                mid_local = (pat_start_local + pat_end_local) // 2
                if 0 <= mid_local < len(chart_df):
                    mid_price = (pat.neckline_level + pat.support_level) / 2
                    text_labels.append((
                        plot_df.index[mid_local], mid_price,
                        f"{ptype}\nQ={pat.quality_score:.0f}",
                        shade_col,
                    ))

            tgt = pat.neckline_level + pat.pattern_height
            pattern_info.append(
                f"{ptype} \u25b2 (Q={pat.quality_score:.0f}, "
                f"neck={pat.neckline_level:.1f}, "
                f"target={tgt:.1f})"
            )

    if not found_any:
        return None  # No patterns to show

    title = f"{symbol} | Pattern Detection | {len(pattern_info)} pattern(s)"

    mpf_kwargs = dict(
        type='candle', volume=True, style=CHART_STYLE,
        title=title, figsize=(24, 14), returnfig=True,
        tight_layout=True, panel_ratios=(5, 1.2),
    )
    if addplots:
        mpf_kwargs['addplot'] = addplots

    fig, axes = mpf.plot(plot_df, **mpf_kwargs)

    ax_price = axes[0]

    # mplfinance uses integer x-axis internally; map local index → x position
    # This avoids the datetime → matplotlib date mismatch that creates 256K-pixel images
    def _local_to_xpos(local_indices):
        """Convert local chart indices to mplfinance x-axis positions (integers)."""
        return [int(i) for i in local_indices]

    # ── Post-render: shaded fill between trendlines (type-specific alpha) ──
    for dates, lower_vals, upper_vals, color, alpha in fill_regions:
        # Convert dates back to integer x-positions for mplfinance compatibility
        x_positions = []
        for d in dates:
            try:
                idx = plot_df.index.get_loc(d)
                x_positions.append(idx)
            except KeyError:
                continue
        if len(x_positions) >= 2:
            # Trim values to match
            lo = [lower_vals[i] for i in range(len(x_positions))]
            hi = [upper_vals[i] for i in range(len(x_positions))]
            ax_price.fill_between(
                x_positions, lo, hi,
                alpha=alpha, color=color, linewidth=0, zorder=0,
            )
            ax_price.plot(x_positions, lo, color=color, linewidth=1.0, alpha=0.4, zorder=0)
            ax_price.plot(x_positions, hi, color=color, linewidth=1.0, alpha=0.4, zorder=0)

    # ── Post-render: reversal pattern shapes (lines + markers through pivots) ──
    _MARKER_MAP = {
        # Bullish reversal (existing)
        'trough':          ('^', '#2E7D32', 11),
        'head':            ('^', '#D32F2F', 13),
        'left_shoulder':   ('^', '#FF6F00', 11),
        'right_shoulder':  ('^', '#FF6F00', 11),
        'neckline':        ('v', '#1565C0', 10),
        'left_rim':        ('D', '#E65100', 10),
        'right_rim':       ('D', '#E65100', 10),
        'cup_bottom':      ('^', '#2E7D32', 12),
        'handle_low':      ('s', '#795548', 9),
        # Bearish reversal (double/triple top, H&S top)
        'peak':            ('v', '#C62828', 11),     # down-pointing for bearish peaks
        'neckline_trough': ('^', '#1565C0', 10),     # up-pointing for neckline valleys
        'head_top':        ('v', '#D32F2F', 13),     # head of H&S top
        # High & Tight Flag
        'move_start':      ('s', '#1E88E5', 9),
        'advance_peak':    ('v', '#1565C0', 11),
        'flag_low':        ('^', '#0D47A1', 10),
        'flag_end':        ('*', '#1E88E5', 14),
    }

    for shape_x, shape_y, shape_l, shade_col, pat_type in shape_draws:
        # shape_x are already local chart indices — use directly as integer x-positions
        shape_xpos = _local_to_xpos(shape_x)

        if pat_type == "cup_and_handle" and len(shape_xpos) >= 3:
            cup_indices = [i for i, l in enumerate(shape_l)
                           if l in ("left_rim", "cup_bottom", "right_rim")]
            if len(cup_indices) >= 3:
                x_pts = np.array([shape_xpos[i] for i in cup_indices], dtype=float)
                y_pts = np.array([shape_y[i] for i in cup_indices])
                x_smooth = np.linspace(x_pts[0], x_pts[-1], 50)
                try:
                    from scipy.interpolate import make_interp_spline
                    spline = make_interp_spline(x_pts, y_pts, k=2)
                    y_smooth = spline(x_smooth)
                    ax_price.plot(x_smooth, y_smooth,
                                  color=shade_col, linewidth=2.5,
                                  linestyle='-', zorder=5, alpha=0.9)
                except Exception:
                    ax_price.plot(shape_xpos, shape_y,
                                  color=shade_col, linewidth=2.5,
                                  linestyle='-', zorder=5, alpha=0.9)

            handle_indices = [i for i, l in enumerate(shape_l)
                              if l in ("right_rim", "handle_low")]
            if len(handle_indices) == 2:
                h_xpos = [shape_xpos[i] for i in handle_indices]
                h_prices = [shape_y[i] for i in handle_indices]
                ax_price.plot(h_xpos, h_prices, color=shade_col,
                              linewidth=2.0, linestyle='--', zorder=5, alpha=0.8)

        elif pat_type == "high_tight_flag" and len(shape_xpos) >= 4:
            # Draw prior advance (solid) and flag consolidation (dashed)
            # Pivot order: [move_start, advance_peak, flag_low, flag_end]
            # Prior advance: move_start → advance_peak
            ax_price.plot(
                [shape_xpos[0], shape_xpos[1]],
                [shape_y[0], shape_y[1]],
                color=shade_col, linewidth=2.5, linestyle='-', zorder=5, alpha=0.9)
            # Flag: advance_peak → flag_low → flag_end
            ax_price.plot(
                [shape_xpos[1], shape_xpos[2], shape_xpos[3]],
                [shape_y[1], shape_y[2], shape_y[3]],
                color=shade_col, linewidth=2.0, linestyle='--', zorder=5, alpha=0.8)

        else:
            # Default: connect all pivots with structural shape line
            ax_price.plot(shape_xpos, shape_y,
                          color=shade_col, linewidth=2.5,
                          linestyle='-', zorder=5, alpha=0.9,
                          marker='', markersize=0)

            # ── Support / structural trendlines through actual pivot points ──
            if pat_type in ("double_bottom", "triple_bottom"):
                # Support trendline through troughs — shows the structural floor
                trough_pts = [(shape_xpos[i], shape_y[i])
                              for i, l in enumerate(shape_l) if "trough" in l]
                if len(trough_pts) >= 2:
                    tx0, ty0 = trough_pts[0]
                    tx1, ty1 = trough_pts[-1]
                    x_ext = min(shape_xpos[-1] + 15, len(chart_df) - 1)
                    if tx1 != tx0:
                        s_slope = (ty1 - ty0) / (tx1 - tx0)
                        ty_ext = ty0 + s_slope * (x_ext - tx0)
                    else:
                        ty_ext = ty1
                    # (support_draws removed — not rendered)

            elif pat_type == "inverse_head_shoulders":
                # Shoulder trendline through left & right shoulders
                shoulder_pts = [(shape_xpos[i], shape_y[i])
                                for i, l in enumerate(shape_l) if "shoulder" in l]
                if len(shoulder_pts) >= 2:
                    sx0, sy0 = shoulder_pts[0]
                    sx1, sy1 = shoulder_pts[-1]
                    x_ext = min(shape_xpos[-1] + 15, len(chart_df) - 1)
                    if sx1 != sx0:
                        s_slope = (sy1 - sy0) / (sx1 - sx0)
                        sy_ext = sy0 + s_slope * (x_ext - sx0)
                    else:
                        sy_ext = sy1
                    # (support_draws removed — not rendered)

        for xp, price, label in zip(shape_xpos, shape_y, shape_l):
            m_char, m_color, m_size = ('^', shade_col, 9)
            for key, style in _MARKER_MAP.items():
                if key in label:
                    m_char, m_color, m_size = style
                    break
            ax_price.plot(xp, price,
                          marker=m_char, color=m_color, markersize=m_size,
                          markerfacecolor=m_color, markeredgecolor='white',
                          markeredgewidth=1.5, zorder=10)

    # ── Post-render: on-chart pattern name labels ──
    for x_date, y_price, label, color in text_labels:
        try:
            # Convert date to integer x-position for mplfinance
            x_pos = plot_df.index.get_loc(x_date)
            ax_price.text(
                x_pos, y_price, label,
                fontsize=14, fontweight='bold', color='white',
                ha='center', va='center',
                bbox=dict(
                    boxstyle='round,pad=0.5', facecolor=color, alpha=0.90,
                    edgecolor='white', linewidth=2,
                ),
                zorder=100,
            )
        except Exception:
            pass

    # (Support trendlines removed — clutters chart)

    # ── Post-render: NECKLINE lines (magenta, distinct from shape lines) ──
    NECKLINE_COLOR = '#E91E63'  # Magenta — distinct from orange shape lines
    for (x_start, x_end, y_start, y_end, pat_type) in neckline_draws:
        x0 = int(x_start)
        x1 = int(x_end)
        # Draw sloped (or flat) neckline through actual pivots
        ax_price.plot(
            [x0, x1], [y_start, y_end],
            color=NECKLINE_COLOR, linewidth=2.5, linestyle='--',
            zorder=8, alpha=0.95,
        )
        # "Neckline" label at the right end
        ax_price.text(
            x1 + 1, y_end, "Neckline",
            fontsize=10, fontweight='bold', color=NECKLINE_COLOR,
            va='center', ha='left',
            bbox=dict(boxstyle='round,pad=0.2', facecolor='white',
                      alpha=0.85, edgecolor=NECKLINE_COLOR, linewidth=1),
            zorder=15,
        )

    # (Target lines and KDE S/R levels removed — clutters chart)

    # ── Post-render: CANDLESTICK pattern markers (bullish signals) ──
    CANDLE_ATR_OFFSET = 0.4
    atr_val = float(chart_df['atr_14'].iloc[-1]) if 'atr_14' in chart_df.columns else 0
    candle_labels_shown = []
    candle_total = 0
    for col in _BULLISH_CANDLE_COLS:
        if col not in chart_df.columns:
            continue
        marker_info = CANDLE_MARKERS.get(col)
        if not marker_info:
            continue
        marker_char, marker_color, marker_label, offset_dir = marker_info
        hit_positions = np.where(chart_df[col].values == True)[0]
        for abs_pos in hit_positions:
            local_i = abs_pos  # chart_df is already sliced to chart window
            if 0 <= local_i < len(plot_df):
                xp = _local_to_xpos([local_i])[0]
                if offset_dir == 'below':
                    yp = float(chart_df.iloc[abs_pos]['low']) - atr_val * CANDLE_ATR_OFFSET
                else:
                    yp = float(chart_df.iloc[abs_pos]['high']) + atr_val * CANDLE_ATR_OFFSET
                ax_price.plot(xp, yp,
                              marker=marker_char, color=marker_color, markersize=10,
                              markerfacecolor=marker_color, markeredgecolor='white',
                              markeredgewidth=1.0, zorder=12, alpha=0.95)
                candle_total += 1
                # Label only first occurrence per type to avoid clutter
                if col not in candle_labels_shown:
                    ax_price.text(xp + 1, yp, marker_label,
                                  fontsize=8, color=marker_color, va='center',
                                  fontweight='bold', alpha=0.9, zorder=15)
                    candle_labels_shown.append(col)

    if candle_total > 0:
        pattern_info.append(f"Candle signals: {candle_total}")

    # Bottom label with details
    label_text = "  |  ".join(pattern_info)
    fig.text(0.50, 0.01, label_text, fontsize=12,
             fontfamily='monospace', verticalalignment='bottom',
             horizontalalignment='center', color='#1a1a1a',
             bbox=dict(boxstyle='round', facecolor='#f5f5f5', alpha=0.9))

    path = os.path.join(output_dir, f"{symbol}_pattern.png")
    fig.savefig(path, dpi=150, bbox_inches='tight')
    plt.close(fig)
    print(f"  Pattern chart: {path}")
    for p in pattern_info:
        print(f"    {p}")
    return path


# ═══════════════════════════════════════════════════════════════════════════
# Main orchestrator: runs all charts
# ═══════════════════════════════════════════════════════════════════════════

def visualize_stock(
    symbol, df, last_n_bars=250, output_dir="output/pattern_charts",
    show_all_emas=False, pattern_only=False, **kwargs,
):
    """Generate verification charts for a stock.

    If pattern_only=True, only generates the clean pattern chart (Chart 6).
    Otherwise generates all 6 charts.
    """
    os.makedirs(output_dir, exist_ok=True)

    n = len(df)
    start = max(0, n - last_n_bars)

    if n - start < 20:
        print(f"  {symbol}: Not enough data ({n - start} bars)")
        return []

    paths = []

    if pattern_only:
        # Only generate clean pattern chart
        try:
            _interval = kwargs.get('interval', '1d')
            result = chart_pattern_clean(symbol, df, last_n_bars, output_dir, start, interval=_interval)
            if result:
                paths.append(result)
            else:
                print(f"  {symbol}: No patterns detected")
        except Exception as e:
            print(f"  Chart Pattern FAILED: {e}")
        return paths

    # Full chart suite
    try:
        paths.append(chart_zigzag_pivots(symbol, df, last_n_bars, output_dir, start))
    except Exception as e:
        print(f"  Chart 1 (Zigzag) FAILED: {e}")

    try:
        paths.append(chart_trendlines_patterns(symbol, df, last_n_bars, output_dir, start))
    except Exception as e:
        print(f"  Chart 2 (Trendlines) FAILED: {e}")

    try:
        paths.append(chart_kde_sr(symbol, df, last_n_bars, output_dir, start))
    except Exception as e:
        print(f"  Chart 3 (KDE S/R) FAILED: {e}")

    try:
        paths.append(chart_reversal_patterns(symbol, df, last_n_bars, output_dir, start))
    except Exception as e:
        print(f"  Chart 4 (Reversals) FAILED: {e}")

    try:
        paths.append(chart_full_overlay(symbol, df, last_n_bars, output_dir, start, show_all_emas))
    except Exception as e:
        print(f"  Chart 5 (Full) FAILED: {e}")

    try:
        _interval = kwargs.get('interval', '1d')
        result = chart_pattern_clean(symbol, df, last_n_bars, output_dir, start, interval=_interval)
        if result:
            paths.append(result)
    except Exception as e:
        print(f"  Chart 6 (Pattern Clean) FAILED: {e}")

    return paths


# ── CLI ──────────────────────────────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(description="SwingAI Algorithm Verification Charts")
    parser.add_argument("--stock", type=str, nargs='+', default=None,
                        help="Stock symbol(s) e.g. RELIANCE HDFCBANK")
    parser.add_argument("--stocks", type=int, default=None,
                        help="Run on top N stocks from universe (e.g. --stocks 50)")
    parser.add_argument("--bars", type=int, default=250, help="Number of bars to display")
    parser.add_argument("--output", type=str, default="output/pattern_charts",
                        help="Output directory")
    parser.add_argument("--period", type=str, default="5y", help="Data fetch period")
    parser.add_argument("--all-emas", action='store_true',
                        help="Show all EMAs (9/21/50) on full overlay chart")
    parser.add_argument("--universe", action='store_true',
                        help="Run on top 20 stocks from universe")
    parser.add_argument("--pattern-only", action='store_true', default=True,
                        help="Only generate clean pattern charts (default)")
    parser.add_argument("--full", action='store_true',
                        help="Generate all 6 chart types (zigzag, trendlines, KDE, reversals, overlay, pattern)")
    parser.add_argument("--interval", type=str, default="1d",
                        choices=['1d', '1wk', '4h', '1h', '15m'],
                        help="Candlestick timeframe (default: 1d)")
    args = parser.parse_args()

    pattern_only = not args.full  # Default: pattern-only; --full overrides

    print(f"\n{'='*70}")
    print(f"SWINGAI PATTERN DETECTION (v3 Anchor-Pair + Respect Validation)")
    print(f"{'='*70}")
    if pattern_only:
        print(f"Mode: PATTERN-ONLY (clean charts)")
    else:
        print(f"Mode: FULL (all chart types)")
    print(f"{'='*70}")

    import sys as _sys, os as _os
    _sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), '..', 'backend'))
    from data_provider import get_provider
    _provider = get_provider()

    if args.stock:
        symbols = [s if s.endswith('.NS') else f"{s}.NS" for s in args.stock]
    elif args.stocks:
        # Load top N from universe
        try:
            from ml.backtest.portfolio_backtest import load_universe
            symbols = load_universe(max_stocks=args.stocks)
        except Exception:
            symbols = [
                "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "ICICIBANK.NS",
                "INFY.NS", "BAJFINANCE.NS", "SUNPHARMA.NS",
                "NTPC.NS", "SBIN.NS", "TATASTEEL.NS",
                "ADANIENT.NS", "ADANIPORTS.NS", "APOLLOHOSP.NS",
                "ASIANPAINT.NS", "AXISBANK.NS", "BAJAJ-AUTO.NS",
                "BAJAJFINSV.NS", "BHARTIARTL.NS", "BPCL.NS",
                "BRITANNIA.NS", "CIPLA.NS", "COALINDIA.NS",
                "DIVISLAB.NS", "DRREDDY.NS", "EICHERMOT.NS",
                "GRASIM.NS", "HCLTECH.NS", "HDFC.NS",
                "HDFCLIFE.NS", "HEROMOTOCO.NS", "HINDALCO.NS",
                "HINDUNILVR.NS", "INDUSINDBK.NS", "ITC.NS",
                "JSWSTEEL.NS", "KOTAKBANK.NS", "LT.NS",
                "M&M.NS", "MARUTI.NS", "NESTLEIND.NS",
                "ONGC.NS", "POWERGRID.NS", "SBILIFE.NS",
                "SHRIRAMFIN.NS", "TATACONSUM.NS", "TATAMOTORS.NS",
                "TATASTEEL.NS", "TECHM.NS", "TITAN.NS",
                "ULTRACEMCO.NS", "UPL.NS", "WIPRO.NS",
            ][:args.stocks]
        pattern_only = True  # Auto-enable pattern-only for batch mode
    elif args.universe:
        try:
            from ml.backtest.portfolio_backtest import load_universe
            symbols = load_universe(max_stocks=20)
        except Exception:
            symbols = [
                "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "ICICIBANK.NS",
                "INFY.NS", "BAJFINANCE.NS", "SUNPHARMA.NS",
                "NTPC.NS", "SBIN.NS", "TATASTEEL.NS",
            ]
    else:
        symbols = [
            "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS",
            "BAJFINANCE.NS", "SBIN.NS",
        ]

    print(f"\nStocks: {len(symbols)} ({', '.join(symbols[:5])}{'...' if len(symbols) > 5 else ''})")
    print(f"Bars: {args.bars} | Period: {args.period} | Interval: {args.interval}")
    print(f"Output: {args.output}/\n")

    total_charts = 0
    stocks_with_patterns = 0
    # Trend context tracking for summary
    tier_counts = {'tier1': 0, 'tier2': 0, 'skip': 0}
    continuation_in_uptrend = 0
    continuation_total = 0
    reversal_in_downtrend = 0
    reversal_total = 0
    _CONTINUATION_TYPES = {'ascending_triangle', 'horizontal_channel', 'symmetrical_triangle',
                           'falling_wedge', 'bull_flag', 'high_tight_flag'}
    _REVERSAL_TYPES = {'double_bottom', 'triple_bottom', 'inverse_head_shoulders', 'cup_and_handle'}

    for sym in symbols:
        try:
            print(f"{'─'*60}")
            print(f"Processing {sym}...")

            clean_dl = sym.replace('.NS', '').replace('.BO', '')
            raw = _provider.get_historical(clean_dl, period=args.period, interval=args.interval)
            if raw is None or len(raw) < 200:
                print(f"  {sym}: Insufficient data ({len(raw) if raw is not None else 0} bars)")
                continue

            if isinstance(raw.columns, pd.MultiIndex):
                raw.columns = [c[0] if isinstance(c, tuple) else c for c in raw.columns]
            raw.columns = [c.lower() for c in raw.columns]

            df = compute_all_indicators(raw)
            clean_sym = sym.replace('.NS', '')

            # Classify trend tier for reporting
            tier = classify_trend_tier(df)
            tier_counts[tier] = tier_counts.get(tier, 0) + 1
            tier_label = {'tier1': 'UPTREND', 'tier2': 'BASE', 'skip': 'DOWNTREND'}[tier]
            print(f"  Trend: {tier_label}")

            # Scan patterns to track trend context
            from ml.features.patterns import scan_for_patterns as _scan_pats
            pats = _scan_pats(df, lookback=min(args.bars + 50, 300),
                              min_duration=12, min_touches=3, interval=args.interval)
            for p in pats:
                if p.pattern_type in _CONTINUATION_TYPES:
                    continuation_total += 1
                    if tier == 'tier1':
                        continuation_in_uptrend += 1
                elif p.pattern_type in _REVERSAL_TYPES:
                    reversal_total += 1
                    if tier in ('tier2', 'skip'):
                        reversal_in_downtrend += 1

            paths = visualize_stock(
                symbol=clean_sym, df=df,
                last_n_bars=args.bars,
                output_dir=args.output,
                show_all_emas=args.all_emas,
                pattern_only=pattern_only,
                interval=args.interval,
            )
            total_charts += len(paths)
            if paths:
                stocks_with_patterns += 1

        except Exception as e:
            print(f"  {sym}: FAILED — {e}")
            import traceback
            traceback.print_exc()

    print(f"\n{'='*70}")
    print(f"Done! {total_charts} charts saved to: {args.output}/")
    print(f"Stocks with patterns: {stocks_with_patterns}/{len(symbols)}")
    print(f"{'='*70}")
    print(f"\n{'='*70}")
    print(f"TREND CONTEXT SUMMARY")
    print(f"{'='*70}")
    print(f"Stocks by trend tier:")
    print(f"  UPTREND (tier1): {tier_counts.get('tier1', 0)}")
    print(f"  BASE    (tier2): {tier_counts.get('tier2', 0)}")
    print(f"  DOWN    (skip):  {tier_counts.get('skip', 0)}")
    print(f"\nContinuation patterns: {continuation_total} total")
    if continuation_total > 0:
        print(f"  In uptrend: {continuation_in_uptrend}/{continuation_total} "
              f"({100*continuation_in_uptrend/continuation_total:.0f}%)")
    print(f"Reversal patterns: {reversal_total} total")
    if reversal_total > 0:
        print(f"  In downtrend/base: {reversal_in_downtrend}/{reversal_total} "
              f"({100*reversal_in_downtrend/reversal_total:.0f}%)")
    print(f"{'='*70}")


if __name__ == "__main__":
    main()
