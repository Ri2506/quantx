"""
Quant X Backtest Trade Visualizer
==================================
Generates professional candlestick charts for backtest trades.

Features:
- Candlestick chart with volume bars
- Entry / exit markers
- Stop loss and target lines
- Pattern trendlines (for Consolidation_Breakout)
- EMA overlays (9, 21, 200)
- Trade annotation (strategy, P&L, hold days)

Usage:
    python -m ml.backtest.visualizer --stock RELIANCE.NS --trades 10
    python -m ml.backtest.visualizer --stock NTPC.NS --strategy Consolidation_Breakout
"""

import os
import sys
import warnings
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass

import numpy as np
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import mplfinance as mpf

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.backtest.engine import BacktestEngine, BacktestConfig, BacktestTrade, BacktestResult
from ml.features.indicators import compute_all_indicators
from ml.features.patterns import scan_for_patterns, detect_peaks_troughs
from ml.scanner import get_all_strategies

warnings.filterwarnings("ignore")

# Chart style
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


def plot_trade(
    df: pd.DataFrame,
    trade: BacktestTrade,
    padding_before: int = 40,
    padding_after: int = 15,
    show_indicators: bool = True,
    show_pattern: bool = True,
    save_path: Optional[str] = None,
    title: Optional[str] = None,
):
    """
    Plot a single backtest trade on a candlestick chart.

    Args:
        df: Full OHLCV DataFrame with indicators (DatetimeIndex)
        trade: BacktestTrade to visualize
        padding_before: Bars to show before entry
        padding_after: Bars to show after exit
        show_indicators: Overlay EMAs
        show_pattern: Overlay trendlines for pattern strategies
        save_path: Path to save PNG (None = display)
        title: Custom chart title
    """
    # Find entry and exit bar indices
    entry_idx = _find_bar_index(df, trade.entry_date)
    exit_idx = _find_bar_index(df, trade.exit_date)

    if entry_idx is None or exit_idx is None:
        print(f"  Could not find trade dates in data: {trade.entry_date} / {trade.exit_date}")
        return

    # Slice the chart window
    start = max(0, entry_idx - padding_before)
    end = min(len(df), exit_idx + padding_after)
    chart_df = df.iloc[start:end].copy()

    if len(chart_df) < 5:
        return

    # Ensure proper index for mplfinance
    if not isinstance(chart_df.index, pd.DatetimeIndex):
        chart_df.index = pd.to_datetime(chart_df.index)

    # Rename columns to what mplfinance expects
    chart_df = chart_df.rename(columns={
        'open': 'Open', 'high': 'High', 'low': 'Low',
        'close': 'Close', 'volume': 'Volume',
    })

    addplots = []

    # --- Entry / Exit markers ---
    entry_series = pd.Series(np.nan, index=chart_df.index)
    exit_series = pd.Series(np.nan, index=chart_df.index)

    if entry_idx - start >= 0 and entry_idx - start < len(chart_df):
        entry_series.iloc[entry_idx - start] = trade.entry_price
    if exit_idx - start >= 0 and exit_idx - start < len(chart_df):
        exit_series.iloc[exit_idx - start] = trade.exit_price

    addplots.append(mpf.make_addplot(
        entry_series, type='scatter', markersize=120,
        marker='^', color='#00c853',
    ))

    exit_color = '#00c853' if trade.net_pnl_pct > 0 else '#ff1744'
    addplots.append(mpf.make_addplot(
        exit_series, type='scatter', markersize=120,
        marker='v', color=exit_color,
    ))

    # --- Stop loss and target lines ---
    sl_val = trade.stop_loss if trade.stop_loss > 0 else trade.entry_price * 0.97
    tgt_val = trade.target if trade.target > 0 else trade.entry_price * 1.06

    sl_series = pd.Series(np.nan, index=chart_df.index, dtype=float)
    tgt_series = pd.Series(np.nan, index=chart_df.index, dtype=float)
    for i in range(len(sl_series)):
        if entry_idx - start <= i <= exit_idx - start:
            sl_series.iloc[i] = sl_val
            tgt_series.iloc[i] = tgt_val

    addplots.append(mpf.make_addplot(sl_series, color='#ff1744', linestyle='--', width=0.8))
    addplots.append(mpf.make_addplot(tgt_series, color='#00c853', linestyle='--', width=0.8))

    # --- Indicator overlays ---
    if show_indicators:
        for col, color, width in [('ema_9', '#2196f3', 0.7), ('ema_200', '#ff9800', 1.0)]:
            if col in df.columns:
                ind = df[col].iloc[start:end].copy()
                ind.index = chart_df.index
                if ind.notna().sum() > 2:
                    addplots.append(mpf.make_addplot(ind, color=color, width=width))

    # --- Pattern trendlines ---
    if show_pattern and trade.strategy == "Consolidation_Breakout":
        _add_pattern_trendlines(df, chart_df, entry_idx, start, addplots)

    # --- Title ---
    pnl_str = f"+{trade.net_pnl_pct:.1f}%" if trade.net_pnl_pct > 0 else f"{trade.net_pnl_pct:.1f}%"
    if title is None:
        title = (
            f"{trade.symbol} | {trade.strategy} | "
            f"Entry: {trade.entry_price} → Exit: {trade.exit_price} | "
            f"P&L: {pnl_str} | {trade.hold_days}d | {trade.exit_reason}"
        )

    # --- Plot ---
    fig, axes = mpf.plot(
        chart_df,
        type='candle',
        volume=True,
        style=CHART_STYLE,
        addplot=addplots if addplots else None,
        title=title,
        figsize=(16, 9),
        returnfig=True,
        tight_layout=True,
    )

    if save_path:
        fig.savefig(save_path, dpi=150, bbox_inches='tight')
        plt.close(fig)
    else:
        plt.show()
        plt.close(fig)


def _add_pattern_trendlines(
    full_df: pd.DataFrame,
    chart_df: pd.DataFrame,
    entry_idx: int,
    chart_start: int,
    addplots: list,
):
    """Detect pattern at entry bar and add trendlines to chart."""
    # Re-run pattern detection at the entry bar
    df_at_entry = full_df.iloc[:entry_idx + 1]
    if len(df_at_entry) < 200:
        return

    patterns = scan_for_patterns(df_at_entry, lookback=150, min_duration=15, min_touches=2)
    if not patterns:
        return

    pattern = patterns[0]  # Best quality pattern

    # Only draw trendlines for consolidation patterns (reversal patterns have no trendlines)
    if pattern.support_line is None or pattern.resistance_line is None:
        return

    # Build trendline series for chart window
    sup_series = pd.Series(np.nan, index=chart_df.index, dtype=float)
    res_series = pd.Series(np.nan, index=chart_df.index, dtype=float)

    for i in range(len(chart_df)):
        global_idx = i + chart_start
        # Only draw trendlines within pattern range + some extension
        p_start = min(pattern.support_line.start_idx, pattern.resistance_line.start_idx)
        p_end = max(pattern.support_line.end_idx, pattern.resistance_line.end_idx)

        if p_start <= global_idx <= p_end + 10:
            sup_series.iloc[i] = pattern.support_line.value_at(global_idx)
            res_series.iloc[i] = pattern.resistance_line.value_at(global_idx)

    if sup_series.notna().sum() > 1:
        addplots.append(mpf.make_addplot(sup_series, color='#4caf50', linestyle='-', width=1.2))
    if res_series.notna().sum() > 1:
        addplots.append(mpf.make_addplot(res_series, color='#f44336', linestyle='-', width=1.2))


def _find_bar_index(df: pd.DataFrame, date_str: str) -> Optional[int]:
    """Find iloc index of a date in the DataFrame."""
    try:
        ts = pd.Timestamp(date_str)
        if isinstance(df.index, pd.DatetimeIndex):
            # Find exact or nearest
            if ts in df.index:
                return df.index.get_loc(ts)
            # Try date-only match
            date_only = ts.date()
            matches = [i for i, d in enumerate(df.index) if d.date() == date_only]
            if matches:
                return matches[0]
            # Find nearest
            idx = df.index.searchsorted(ts)
            return min(idx, len(df) - 1)
    except Exception:
        pass

    # Fallback: try integer index
    try:
        idx = int(date_str)
        if 0 <= idx < len(df):
            return idx
    except (ValueError, TypeError):
        pass

    return None


def generate_trade_report(
    stock_data: Dict[str, pd.DataFrame],
    trades: List[BacktestTrade],
    output_dir: str = "trade_charts",
    max_trades: int = 30,
    strategy_filter: Optional[str] = None,
    stock_filter: Optional[str] = None,
):
    """
    Generate PNG charts for backtest trades.

    Produces charts for:
    - Top winning trades (sorted by P&L)
    - Top losing trades (sorted by P&L)
    - Filtered by strategy or stock if specified

    Args:
        stock_data: Dict mapping "SYMBOL.NS" -> OHLCV DataFrame
        trades: List of BacktestTrade from backtest
        output_dir: Directory to save PNGs
        max_trades: Maximum charts to generate
        strategy_filter: Only plot trades from this strategy
        stock_filter: Only plot trades for this stock (without .NS)
    """
    os.makedirs(output_dir, exist_ok=True)

    # Filter trades
    filtered = trades
    if strategy_filter:
        filtered = [t for t in filtered if t.strategy == strategy_filter]
    if stock_filter:
        clean = stock_filter.replace('.NS', '')
        filtered = [t for t in filtered if t.symbol == clean]

    if not filtered:
        print(f"No trades found after filtering.")
        return

    # Sort: best wins first, then worst losses
    wins = sorted([t for t in filtered if t.net_pnl_pct > 0], key=lambda t: -t.net_pnl_pct)
    losses = sorted([t for t in filtered if t.net_pnl_pct <= 0], key=lambda t: t.net_pnl_pct)

    # Take top wins and losses
    half = max_trades // 2
    selected = wins[:half] + losses[:half]
    selected = selected[:max_trades]

    print(f"\nGenerating {len(selected)} trade charts in {output_dir}/")
    print(f"  {min(half, len(wins))} winning trades, {min(half, len(losses))} losing trades")

    for i, trade in enumerate(selected, 1):
        sym_key = f"{trade.symbol}.NS"
        if sym_key not in stock_data:
            # Try without .NS
            sym_key = trade.symbol
            if sym_key not in stock_data:
                continue

        df = stock_data[sym_key]

        # Compute indicators if not already present
        if 'ema_9' not in df.columns:
            df = compute_all_indicators(df)
            stock_data[sym_key] = df

        pnl_label = f"win_{trade.net_pnl_pct:+.1f}pct" if trade.net_pnl_pct > 0 else f"loss_{trade.net_pnl_pct:.1f}pct"
        filename = f"{i:03d}_{trade.symbol}_{trade.strategy}_{pnl_label}.png"
        save_path = os.path.join(output_dir, filename)

        try:
            plot_trade(df, trade, save_path=save_path)
            print(f"  [{i}/{len(selected)}] {filename}")
        except Exception as e:
            print(f"  [{i}/{len(selected)}] FAILED {trade.symbol}: {e}")

    print(f"\nDone! Charts saved to: {output_dir}/")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
def main():
    """Run visualizer from command line."""
    import argparse

    parser = argparse.ArgumentParser(description="Quant X Backtest Trade Visualizer")
    parser.add_argument("--stock", type=str, default=None, help="Stock filter (e.g., RELIANCE)")
    parser.add_argument("--strategy", type=str, default=None, help="Strategy filter")
    parser.add_argument("--trades", type=int, default=20, help="Max trades to plot")
    parser.add_argument("--output", type=str, default="trade_charts", help="Output directory")
    parser.add_argument("--period", type=str, default="5y", help="Data period")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print(f"QUANT X TRADE VISUALIZER")
    print(f"{'='*60}")

    # 1. Load universe and fetch data
    from ml.backtest.portfolio_backtest import (
        load_universe, fetch_stock_data, _parse_universe_caps, _fetch_regime_data
    )

    symbols = load_universe(max_stocks=50)
    if args.stock:
        sym = args.stock if args.stock.endswith('.NS') else f"{args.stock}.NS"
        symbols = [sym]

    print(f"\nFetching data for {len(symbols)} stocks...")
    stock_data = fetch_stock_data(symbols, period=args.period)
    print(f"Got data for {len(stock_data)} stocks")

    # 2. Run backtests to get trades
    strategies = get_all_strategies()
    engine = BacktestEngine(BacktestConfig(initial_capital=500000))

    cap_map = _parse_universe_caps("data/backtest_universe.txt")
    regime_data = _fetch_regime_data(period=args.period)

    all_trades = []
    print(f"\nRunning backtests...")
    for sym, df in stock_data.items():
        clean = sym.replace('.NS', '')
        cap = cap_map.get(sym, 'large')
        regime = regime_data.get(cap)

        for strategy in strategies:
            try:
                result = engine.run(df, strategy, symbol=clean, market_regime=regime)
                all_trades.extend(result.trades)
            except Exception:
                pass

    print(f"Total trades: {len(all_trades)}")

    # 3. Generate charts
    generate_trade_report(
        stock_data=stock_data,
        trades=all_trades,
        output_dir=args.output,
        max_trades=args.trades,
        strategy_filter=args.strategy,
        stock_filter=args.stock,
    )


if __name__ == "__main__":
    main()
