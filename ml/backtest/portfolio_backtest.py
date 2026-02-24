"""
SwingAI Portfolio-Level Backtest
=================================
Runs all 15 strategies across the full alpha universe (200+ stocks)
over 5 years and produces comprehensive analytics:

- Monthly / Yearly returns
- Per-trade statistics
- Risk-adjusted metrics (Sharpe, Sortino, Calmar)
- Per-strategy breakdown
- Drawdown analysis
- Win rate by market regime (optional)

Usage:
    python -m ml.backtest.portfolio_backtest
"""

import os
import sys
import logging
import warnings
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass, field
from collections import defaultdict
from datetime import datetime

import numpy as np
import pandas as pd

# Ensure project root on path
ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.backtest.engine import BacktestEngine, BacktestConfig, BacktestTrade, BacktestResult
from ml.scanner import get_all_strategies
from ml.strategies.base import BaseStrategy
from ml.risk_manager import RiskManager, RiskConfig

warnings.filterwarnings("ignore")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Portfolio-level result container
# ---------------------------------------------------------------------------
@dataclass
class PortfolioBacktestResult:
    """Aggregated results across all stocks and strategies."""
    all_trades: List[BacktestTrade] = field(default_factory=list)
    per_strategy: Dict[str, List[BacktestTrade]] = field(default_factory=lambda: defaultdict(list))
    per_stock: Dict[str, List[BacktestTrade]] = field(default_factory=lambda: defaultdict(list))
    equity_curve: List[float] = field(default_factory=list)
    config: Optional[BacktestConfig] = None
    stocks_tested: int = 0
    stocks_with_trades: int = 0
    total_bars_processed: int = 0
    runtime_seconds: float = 0.0

    # Portfolio simulation results (from simulate_portfolio)
    portfolio_trades: List[BacktestTrade] = field(default_factory=list)
    portfolio_equity_curve: pd.DataFrame = field(default_factory=pd.DataFrame)
    portfolio_final_capital: float = 0.0
    portfolio_total_return_pct: float = 0.0
    portfolio_max_drawdown_pct: float = 0.0
    portfolio_sharpe: float = 0.0
    portfolio_sortino: float = 0.0
    trades_skipped_capacity: int = 0
    trades_skipped_monthly_limit: int = 0
    trades_skipped_heat: int = 0
    trades_skipped_halted: int = 0


# ---------------------------------------------------------------------------
# Universe loader
# ---------------------------------------------------------------------------
def load_universe(path: str = "data/backtest_universe.txt", max_stocks: int = 250) -> List[str]:
    """Load stock symbols from universe file."""
    symbols = []
    if not os.path.exists(path):
        # Try relative to project root
        alt_path = ROOT / path
        if alt_path.exists():
            path = str(alt_path)
        else:
            logger.warning(f"Universe file not found: {path}")
            return _fallback_universe()

    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Ensure .NS suffix for yfinance
            if not line.endswith(".NS"):
                line = f"{line}.NS"
            symbols.append(line)

    return symbols[:max_stocks]


def _fallback_universe() -> List[str]:
    """Minimal fallback for testing."""
    return [
        "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "SBIN.NS",
        "ICICIBANK.NS", "BHARTIARTL.NS", "LT.NS", "ITC.NS", "KOTAKBANK.NS",
        "AXISBANK.NS", "MARUTI.NS", "TITAN.NS", "TATAMOTORS.NS", "WIPRO.NS",
        "SUNPHARMA.NS", "HCLTECH.NS", "BAJFINANCE.NS", "NTPC.NS", "POWERGRID.NS",
    ]


def _parse_universe_caps(universe_file: str) -> Dict[str, str]:
    """Parse universe file to build cap category map: {symbol: 'large'|'mid'|'small'}."""
    cap_map = {}
    current_cap = 'large'

    path = universe_file
    if not os.path.exists(path):
        alt_path = ROOT / path
        if alt_path.exists():
            path = str(alt_path)
        else:
            return cap_map

    with open(path, "r") as f:
        for line in f:
            line = line.strip()
            upper = line.upper()
            if 'LARGE CAP' in upper:
                current_cap = 'large'
            elif 'MID CAP' in upper:
                current_cap = 'mid'
            elif 'SMALL CAP' in upper:
                current_cap = 'small'
            elif line and not line.startswith('#'):
                sym = line if line.endswith('.NS') else f"{line}.NS"
                cap_map[sym] = current_cap

    return cap_map


def _fetch_regime_data(period: str = "5y") -> Dict[str, pd.Series]:
    """Fetch Nifty 50, Midcap 150, Smallcap 250 and compute 200-SMA regime."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
    from data_provider import get_provider

    provider = get_provider()

    # TrueData-style bare index names
    REGIME_INDICES = {
        'large': 'NIFTY 50',
        'mid': 'NIFTY MIDCAP 150',
        'small': 'NIFTY SMLCAP 100',
    }

    regime_data = {}
    for cap, index_name in REGIME_INDICES.items():
        try:
            idx_df = provider.get_historical(index_name, period=period, interval="1d")
            if idx_df is not None and not idx_df.empty:
                if isinstance(idx_df.columns, pd.MultiIndex):
                    idx_df.columns = [c[0] if isinstance(c, tuple) else c for c in idx_df.columns]
                idx_df.columns = [c.lower() if isinstance(c, str) else c for c in idx_df.columns]
                if len(idx_df) >= 200:
                    sma200 = idx_df['close'].rolling(200).mean()
                    regime_series = idx_df['close'] > sma200
                    regime_data[cap] = regime_series
                    bullish_pct = regime_series.dropna().sum() / len(regime_series.dropna()) * 100
                    print(f"    {cap.upper():>6s} cap: {index_name:<25s} {len(idx_df)} bars, bullish {bullish_pct:.0f}% of time")
                else:
                    regime_data[cap] = True
            else:
                regime_data[cap] = True
        except Exception as e:
            print(f"    WARNING: No regime data for {cap} ({index_name}): {e}")
            if 'large' in regime_data:
                regime_data[cap] = regime_data['large']
            else:
                regime_data[cap] = True

    return regime_data


# ---------------------------------------------------------------------------
# Data fetcher
# ---------------------------------------------------------------------------
def fetch_stock_data(
    symbols: List[str],
    period: str = "5y",
    interval: str = "1d",
) -> Dict[str, pd.DataFrame]:
    """Fetch OHLCV data for all symbols via the data provider."""
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))
    from data_provider import get_provider

    provider = get_provider()
    data = {}
    total = len(symbols)

    for i, sym in enumerate(symbols, 1):
        try:
            clean = sym.replace('.NS', '').replace('.BO', '')
            df = provider.get_historical(clean, period=period, interval=interval)
            if isinstance(df.columns, pd.MultiIndex):
                df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
            if df is not None and len(df) >= 200:
                data[sym] = df
            if i % 25 == 0:
                print(f"  Fetched {i}/{total} stocks ({len(data)} usable)")
        except Exception as e:
            logger.debug(f"Failed to fetch {sym}: {e}")

    return data


# ---------------------------------------------------------------------------
# Core backtest runner
# ---------------------------------------------------------------------------
def run_portfolio_backtest(
    symbols: Optional[List[str]] = None,
    strategies: Optional[List[BaseStrategy]] = None,
    config: Optional[BacktestConfig] = None,
    period: str = "5y",
    max_stocks: int = 250,
    universe_file: str = "data/backtest_universe.txt",
) -> PortfolioBacktestResult:
    """
    Run all strategies across all stocks and aggregate results.

    Args:
        symbols: Stock symbols (loaded from universe_file if None)
        strategies: Strategy instances (all 15 if None)
        config: Backtest config
        period: Data period for yfinance
        max_stocks: Max stocks to test
        universe_file: Path to universe file

    Returns:
        PortfolioBacktestResult with all trades and analytics
    """
    import time
    start_time = time.time()

    if symbols is None:
        symbols = load_universe(universe_file, max_stocks=max_stocks)
    if strategies is None:
        strategies = get_all_strategies()
    if config is None:
        config = BacktestConfig(initial_capital=500000)

    engine = BacktestEngine(config)
    result = PortfolioBacktestResult(config=config)

    print(f"\n{'='*70}")
    print(f"SWINGAI PORTFOLIO BACKTEST")
    print(f"{'='*70}")
    print(f"Universe: {len(symbols)} stocks | Strategies: {len(strategies)}")
    print(f"Period: {period} | Capital: ₹{config.initial_capital:,.0f}")
    print(f"Risk: {config.risk_per_trade_pct}%/trade | Max Trades/Month: {config.max_trades_per_month}")
    print(f"{'='*70}")

    # 1. Fetch all data
    print(f"\n[1/4] Fetching market data...")
    stock_data = fetch_stock_data(symbols, period=period)
    print(f"  Got data for {len(stock_data)}/{len(symbols)} stocks")
    result.stocks_tested = len(stock_data)

    # 2. Fetch market regime indices (cap-specific)
    print(f"\n[2/4] Fetching market regime indices (Nifty 50 / Midcap 150 / Smallcap 250)...")
    cap_map = _parse_universe_caps(universe_file)
    regime_data = _fetch_regime_data(period=period)
    if regime_data:
        print(f"  Market regime filter ACTIVE ({len(regime_data)} indices loaded)")
    else:
        print(f"  WARNING: No regime data — running WITHOUT market filter")

    # 3. Run backtests
    print(f"\n[3/4] Running backtests ({len(stock_data)} stocks × {len(strategies)} strategies)...")
    stocks_with_trades = set()
    total_combos = len(stock_data) * len(strategies)
    done = 0
    regime_blocked = 0

    for sym, df in stock_data.items():
        clean_sym = sym.replace(".NS", "")
        result.total_bars_processed += len(df)

        # Look up cap-specific regime for this stock
        cap = cap_map.get(sym, 'large')
        market_regime = regime_data.get(cap)

        for strategy in strategies:
            done += 1
            try:
                bt_result = engine.run(df, strategy, symbol=clean_sym, market_regime=market_regime)
                if bt_result.trades:
                    stocks_with_trades.add(clean_sym)
                    for trade in bt_result.trades:
                        result.all_trades.append(trade)
                        result.per_strategy[strategy.name].append(trade)
                        result.per_stock[clean_sym].append(trade)
            except Exception as e:
                logger.debug(f"Backtest failed {clean_sym}/{strategy.name}: {e}")

            if done % 200 == 0:
                print(f"  Progress: {done}/{total_combos} ({done*100//total_combos}%)")

    result.stocks_with_trades = len(stocks_with_trades)
    result.runtime_seconds = time.time() - start_time

    # 4. Portfolio simulation (replay trades with shared capital & risk limits)
    print(f"\n[4/5] Simulating portfolio with risk management...")
    simulate_portfolio(
        result,
        initial_capital=config.initial_capital,
        risk_pct=config.risk_per_trade_pct,
        max_positions=getattr(config, 'max_positions', 0),
        max_trades_month=getattr(config, 'max_trades_per_month', 12),
    )

    # 5. Generate report
    print(f"\n[5/5] Generating analytics...")
    print_portfolio_report(result)

    return result


# ---------------------------------------------------------------------------
# Analytics & Reporting
# ---------------------------------------------------------------------------
def print_portfolio_report(result: PortfolioBacktestResult):
    """Print comprehensive portfolio backtest report."""
    trades = result.all_trades
    if not trades:
        print("\nNo trades generated. Check strategy parameters or data.")
        return

    # Filter out trades with NaN P&L (data issues)
    valid_trades = [t for t in trades if not (np.isnan(t.net_pnl_pct) or np.isinf(t.net_pnl_pct))]
    if len(valid_trades) < len(trades):
        print(f"  (Filtered {len(trades) - len(valid_trades)} trades with invalid P&L)")
    trades = valid_trades

    pnls = [t.net_pnl_pct for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p <= 0]
    total_win_pnl = sum(wins)
    total_loss_pnl = abs(sum(losses))

    # Build trade DataFrame for time-series analysis
    trade_df = _build_trade_dataframe(trades)

    print(f"\n{'='*70}")
    print(f"PORTFOLIO BACKTEST RESULTS")
    print(f"{'='*70}")
    print(f"Stocks Tested:         {result.stocks_tested}")
    print(f"Stocks with Trades:    {result.stocks_with_trades}")
    print(f"Runtime:               {result.runtime_seconds:.1f}s")
    print(f"{'='*70}")

    # ── Overall metrics ──
    print(f"\n--- OVERALL PERFORMANCE ---")
    print(f"Total Trades:          {len(trades)}")
    print(f"Winning Trades:        {len(wins)} ({len(wins)/len(trades)*100:.1f}%)")
    print(f"Losing Trades:         {len(losses)} ({len(losses)/len(trades)*100:.1f}%)")
    print(f"Win Rate:              {len(wins)/len(trades)*100:.1f}%")
    print(f"Avg Win:               +{np.mean(wins):.2f}%" if wins else "Avg Win:               N/A")
    print(f"Avg Loss:              {np.mean(losses):.2f}%" if losses else "Avg Loss:              N/A")
    print(f"Avg P&L per Trade:     {np.mean(pnls):+.2f}%")
    print(f"Median P&L per Trade:  {np.median(pnls):+.2f}%")
    print(f"Total Return (sum):    {sum(pnls):+.2f}%")
    print(f"Profit Factor:         {total_win_pnl/total_loss_pnl:.2f}" if total_loss_pnl > 0 else "Profit Factor:         ∞")
    print(f"Avg Hold Days:         {np.mean([t.hold_days for t in trades]):.1f}")
    rr_ratios = []
    for t in trades:
        risk = abs(t.entry_price - t.stop_loss) if t.stop_loss > 0 else t.entry_price * 0.03
        if risk > 0:
            rr_ratios.append(abs(t.exit_price - t.entry_price) / risk)
    print(f"Avg R:R Achieved:      {np.mean(rr_ratios):.2f}" if rr_ratios else "Avg R:R Achieved:      N/A")

    # Risk metrics
    if len(pnls) > 1:
        pnl_std = np.std(pnls, ddof=1)
        # Annualise using actual trades/year from the data span
        first_dt = pd.to_datetime(trades[0].entry_date, errors='coerce')
        last_dt = pd.to_datetime(trades[-1].exit_date, errors='coerce')
        if pd.notna(first_dt) and pd.notna(last_dt):
            years_span = max(0.5, (last_dt - first_dt).days / 365.25)
        else:
            years_span = max(0.5, len(pnls) / 252)
        trades_per_year = len(pnls) / years_span
        sharpe = (np.mean(pnls) / pnl_std) * np.sqrt(trades_per_year) if pnl_std > 0 else 0
        downside = [min(0, p) for p in pnls]  # All trades: wins contribute 0, losses contribute their value
        downside_std = np.std(downside, ddof=1) if len(downside) > 1 else 0
        sortino = (np.mean(pnls) / downside_std) * np.sqrt(trades_per_year) if downside_std > 0 else 0
        print(f"Sharpe Ratio:          {sharpe:.2f}")
        print(f"Sortino Ratio:         {sortino:.2f}")

    # Max consecutive
    max_w = max_l = cur_w = cur_l = 0
    for p in pnls:
        if p > 0:
            cur_w += 1; cur_l = 0
        else:
            cur_l += 1; cur_w = 0
        max_w = max(max_w, cur_w)
        max_l = max(max_l, cur_l)
    print(f"Max Consec Wins:       {max_w}")
    print(f"Max Consec Losses:     {max_l}")

    # ── Exit reason breakdown ──
    print(f"\n--- EXIT REASONS ---")
    reasons = defaultdict(int)
    for t in trades:
        reasons[t.exit_reason] += 1
    for reason, count in sorted(reasons.items(), key=lambda x: -x[1]):
        pnl_for_reason = [t.net_pnl_pct for t in trades if t.exit_reason == reason]
        avg = np.mean(pnl_for_reason)
        print(f"  {reason:20s} {count:5d} trades ({count/len(trades)*100:5.1f}%)  avg P&L: {avg:+.2f}%")

    # ── Per-strategy breakdown ──
    print(f"\n--- PER-STRATEGY BREAKDOWN ---")
    print(f"{'Strategy':<25s} {'Trades':>6s} {'WinRate':>7s} {'AvgPnL':>7s} {'TotalPnL':>9s} {'PF':>6s} {'AvgHold':>7s}")
    print("-" * 70)

    strategy_rows = []
    for name, strades in sorted(result.per_strategy.items()):
        sp = [t.net_pnl_pct for t in strades]
        sw = [p for p in sp if p > 0]
        sl = [p for p in sp if p <= 0]
        wr = len(sw) / len(sp) * 100 if sp else 0
        avg = np.mean(sp) if sp else 0
        total = sum(sp)
        tw = sum(sw)
        tl = abs(sum(sl))
        pf = tw / tl if tl > 0 else float('inf')
        ah = np.mean([t.hold_days for t in strades])
        pf_str = f"{pf:.2f}" if pf < 100 else "inf"
        print(f"  {name:<23s} {len(sp):6d} {wr:6.1f}% {avg:+6.2f}% {total:+8.2f}% {pf_str:>6s} {ah:6.1f}d")
        strategy_rows.append((name, len(sp), wr, avg, total, pf, ah))

    # ── Top 10 stocks by total return ──
    print(f"\n--- TOP 10 STOCKS (by total return) ---")
    stock_totals = []
    for sym, strades in result.per_stock.items():
        sp = [t.net_pnl_pct for t in strades]
        stock_totals.append((sym, len(sp), sum(sp), np.mean(sp)))
    stock_totals.sort(key=lambda x: -x[2])

    print(f"{'Stock':<15s} {'Trades':>6s} {'TotalPnL':>9s} {'AvgPnL':>7s}")
    print("-" * 40)
    for sym, cnt, total, avg in stock_totals[:10]:
        print(f"  {sym:<13s} {cnt:6d} {total:+8.2f}% {avg:+6.2f}%")

    # ── Bottom 10 stocks ──
    print(f"\n--- BOTTOM 10 STOCKS (by total return) ---")
    for sym, cnt, total, avg in stock_totals[-10:]:
        print(f"  {sym:<13s} {cnt:6d} {total:+8.2f}% {avg:+6.2f}%")

    # ── Monthly returns (per-trade aggregation) ──
    if trade_df is not None and not trade_df.empty:
        _print_monthly_returns(trade_df)
        _print_yearly_returns(trade_df)

    # ── Swing Trader Simulation (shared capital) ──
    _print_swing_trader_results(result)

    print(f"\n{'='*70}")
    print(f"BACKTEST COMPLETE")
    print(f"{'='*70}\n")


def simulate_portfolio(
    result: PortfolioBacktestResult,
    initial_capital: float = 500000,
    risk_pct: float = 3.0,
    max_positions: int = 0,  # 0 = unlimited
    max_trades_month: int = 12,
):
    """
    Replay all individual backtest trades chronologically with shared capital.

    All risk parameters are user-configurable:
    - risk_pct: Risk per trade as % of account (default 3%)
    - max_positions: Max simultaneous open positions (default 8)
    - max_trades_month: Max new entries per month (default 12, 0=unlimited)
    - Portfolio heat limit (15% max total risk)
    - Daily / weekly / monthly loss limits with auto-halt
    - Capital compounds: position sizes grow with profits, shrink with losses
    """
    rm = RiskManager(RiskConfig(
        account_capital=initial_capital,
        risk_per_trade_pct=risk_pct,
        max_open_positions=max_positions,
        max_trades_per_month=max_trades_month,
    ))
    capital = initial_capital
    reserved_capital = 0  # Capital tied up in open positions
    peak_capital = initial_capital

    # Sort all trades by entry date
    valid_trades = []
    for idx, t in enumerate(result.all_trades):
        entry_dt = pd.to_datetime(t.entry_date, errors='coerce')
        exit_dt = pd.to_datetime(t.exit_date, errors='coerce')
        if pd.isna(entry_dt) or pd.isna(exit_dt):
            continue
        valid_trades.append((idx, t, entry_dt, exit_dt))

    if not valid_trades:
        print("  No valid trades for portfolio simulation.")
        return

    # Build event timeline: process EXITs before ENTRYs on the same date.
    # For entries on the same date, sort by confidence DESC so high-quality
    # strategies fill limited slots first.
    events = []
    for idx, t, entry_dt, exit_dt in valid_trades:
        conf = getattr(t, 'confidence', 0.0)
        events.append((entry_dt, 1, -conf, idx, t))   # 1=ENTRY, -conf for desc sort
        events.append((exit_dt, 0, 0, idx, t))        # 0=EXIT  (processed first)
    events.sort(key=lambda e: (e[0], e[1], e[2]))

    active = {}            # idx -> (trade, portfolio_qty)
    accepted_trades = []
    equity_records = []
    skipped_capacity = 0
    skipped_monthly_limit = 0
    skipped_heat = 0
    skipped_halted = 0
    prev_dt = None

    for dt, event_type, _conf_sort, idx, trade in events:
        # ── Period resets (day/week/month boundaries) ──
        if prev_dt is not None:
            if dt.date() != prev_dt.date():
                rm.reset_daily()
            if dt.isocalendar()[1] != prev_dt.isocalendar()[1]:
                rm.reset_weekly()
            if dt.month != prev_dt.month:
                rm.reset_monthly()

        # ── EXIT event ──
        if event_type == 0 and idx in active:
            t, qty = active.pop(idx)
            # Release the original cost from reserved capital
            reserved_capital -= qty * t.entry_price
            # P&L at portfolio quantity (net_pnl_pct already includes costs)
            pnl_amount = qty * t.entry_price * (t.net_pnl_pct / 100)
            capital += pnl_amount
            rm.config.account_capital = capital
            rm.record_trade_result(t.net_pnl_pct)
            peak_capital = max(peak_capital, capital)
            equity_records.append({
                'date': dt, 'equity': capital,
                'open_positions': len(active),
                'pnl': pnl_amount,
            })

        # ── ENTRY event ──
        elif event_type == 1:
            # Capacity check (0 = unlimited)
            if rm.config.max_open_positions > 0 and len(active) >= rm.config.max_open_positions:
                skipped_capacity += 1
                continue

            # Monthly trade limit check
            if rm.monthly_trade_limit_reached:
                skipped_monthly_limit += 1
                continue

            # Halt check
            if rm.is_halted:
                skipped_halted += 1
                continue

            # Validate stop_loss exists
            stop_dist = abs(trade.entry_price - trade.stop_loss)
            if stop_dist <= 0 or trade.stop_loss <= 0:
                continue

            # Position sizing from risk manager (respects consecutive-loss reduction)
            qty = rm.calculate_position_size(trade.entry_price, trade.stop_loss)
            if qty <= 0:
                skipped_halted += 1
                continue

            # Portfolio heat check
            heat_positions = {}
            for aid, (at, aq) in active.items():
                heat_positions[f"{at.symbol}_{aid}"] = type('P', (), {
                    'entry_price': at.entry_price,
                    'stop_loss': at.stop_loss,
                    'quantity': aq,
                })()
            new_risk = stop_dist * qty
            if not rm.check_portfolio_heat(heat_positions, new_risk):
                skipped_heat += 1
                continue

            # Capital sufficiency — can't buy more than available (unreserved) capital
            available = capital - reserved_capital
            position_cost = qty * trade.entry_price
            if position_cost > available * 0.95:
                qty = max(1, int(available * 0.95 / trade.entry_price))
                position_cost = qty * trade.entry_price

            if available < trade.entry_price:
                # Not enough capital for even 1 share
                skipped_capacity += 1
                continue

            # Reserve capital for this position
            reserved_capital += position_cost

            # Accept the trade
            active[idx] = (trade, qty)
            accepted_trades.append(trade)
            rm.monthly_trades += 1

        prev_dt = dt

    # ── Build equity curve DataFrame ──
    if equity_records:
        eq_df = pd.DataFrame(equity_records)
        eq_df['date'] = pd.to_datetime(eq_df['date'])
        eq_df = eq_df.sort_values('date').reset_index(drop=True)
    else:
        eq_df = pd.DataFrame()

    # ── Max drawdown ──
    max_dd = 0.0
    if not eq_df.empty:
        running_peak = eq_df['equity'].cummax()
        drawdowns = (running_peak - eq_df['equity']) / running_peak * 100
        max_dd = drawdowns.max()

    # ── Sharpe & Sortino ratios ──
    sharpe = 0.0
    sortino = 0.0
    if accepted_trades:
        pnls = [t.net_pnl_pct for t in accepted_trades]
        if len(pnls) > 1:
            pnl_std = np.std(pnls, ddof=1)
            first_dt = pd.to_datetime(accepted_trades[0].entry_date, errors='coerce')
            last_dt = pd.to_datetime(accepted_trades[-1].exit_date, errors='coerce')
            if pd.notna(first_dt) and pd.notna(last_dt):
                years = max(0.5, (last_dt - first_dt).days / 365.25)
            else:
                years = max(0.5, len(pnls) / 252)
            trades_per_year = len(pnls) / years
            if pnl_std > 0:
                sharpe = (np.mean(pnls) / pnl_std) * np.sqrt(trades_per_year)
            # Sortino: downside deviation uses all trades (wins contribute 0)
            downside = [min(0, p) for p in pnls]
            downside_std = np.std(downside, ddof=1) if len(downside) > 1 else 0
            if downside_std > 0:
                sortino = (np.mean(pnls) / downside_std) * np.sqrt(trades_per_year)

    # ── Store results ──
    result.portfolio_trades = accepted_trades
    result.portfolio_equity_curve = eq_df
    result.portfolio_final_capital = capital
    result.portfolio_total_return_pct = (capital - initial_capital) / initial_capital * 100
    result.portfolio_max_drawdown_pct = max_dd
    result.portfolio_sharpe = sharpe
    result.portfolio_sortino = sortino
    result.trades_skipped_capacity = skipped_capacity
    result.trades_skipped_monthly_limit = skipped_monthly_limit
    result.trades_skipped_heat = skipped_heat
    result.trades_skipped_halted = skipped_halted

    print(f"  Accepted {len(accepted_trades)} / {len(valid_trades)} trades")
    print(f"  Skipped (capacity full): {skipped_capacity}")
    print(f"  Skipped (monthly limit): {skipped_monthly_limit}")
    print(f"  Skipped (heat limit):    {skipped_heat}")
    print(f"  Skipped (risk halt):     {skipped_halted}")
    print(f"  Final capital: ₹{capital:,.0f} ({result.portfolio_total_return_pct:+.1f}%)")


def _build_trade_dataframe(trades: List[BacktestTrade]) -> Optional[pd.DataFrame]:
    """Convert trades to DataFrame with datetime index for time-series analysis."""
    if not trades:
        return None

    rows = []
    for t in trades:
        try:
            # Parse exit date
            exit_dt = pd.to_datetime(t.exit_date, errors='coerce')
            if pd.isna(exit_dt):
                continue
            rows.append({
                'exit_date': exit_dt,
                'symbol': t.symbol,
                'strategy': t.strategy,
                'pnl_pct': t.net_pnl_pct,
                'pnl_amount': t.net_pnl_amount,
                'hold_days': t.hold_days,
                'exit_reason': t.exit_reason,
            })
        except Exception:
            continue

    if not rows:
        return None

    df = pd.DataFrame(rows)
    df['exit_date'] = pd.to_datetime(df['exit_date'])
    df = df.sort_values('exit_date')
    return df


def _print_monthly_returns(trade_df: pd.DataFrame):
    """Print monthly return heatmap."""
    trade_df = trade_df.copy()
    trade_df['year'] = trade_df['exit_date'].dt.year
    trade_df['month'] = trade_df['exit_date'].dt.month

    monthly = trade_df.groupby(['year', 'month']).agg(
        trades=('pnl_pct', 'count'),
        total_pnl=('pnl_pct', 'sum'),
        avg_pnl=('pnl_pct', 'mean'),
        win_rate=('pnl_pct', lambda x: (x > 0).sum() / len(x) * 100),
    ).reset_index()

    print(f"\n--- MONTHLY RETURNS ---")
    print(f"{'Year':>6s} {'Mon':>4s} {'Trades':>6s} {'TotalPnL':>9s} {'AvgPnL':>7s} {'WinRate':>7s}")
    print("-" * 45)
    for _, row in monthly.iterrows():
        month_name = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][int(row['month'])]
        print(f"  {int(row['year']):4d} {month_name:>4s} {int(row['trades']):6d} "
              f"{row['total_pnl']:+8.2f}% {row['avg_pnl']:+6.2f}% {row['win_rate']:6.1f}%")


def _print_yearly_returns(trade_df: pd.DataFrame):
    """Print yearly return summary."""
    trade_df = trade_df.copy()
    trade_df['year'] = trade_df['exit_date'].dt.year

    yearly = trade_df.groupby('year').agg(
        trades=('pnl_pct', 'count'),
        total_pnl=('pnl_pct', 'sum'),
        avg_pnl=('pnl_pct', 'mean'),
        win_rate=('pnl_pct', lambda x: (x > 0).sum() / len(x) * 100),
        max_win=('pnl_pct', 'max'),
        max_loss=('pnl_pct', 'min'),
    ).reset_index()

    print(f"\n--- YEARLY RETURNS ---")
    print(f"{'Year':>6s} {'Trades':>6s} {'TotalPnL':>9s} {'AvgPnL':>7s} {'WinRate':>7s} {'MaxWin':>7s} {'MaxLoss':>8s}")
    print("-" * 60)
    for _, row in yearly.iterrows():
        print(f"  {int(row['year']):4d} {int(row['trades']):6d} "
              f"{row['total_pnl']:+8.2f}% {row['avg_pnl']:+6.2f}% "
              f"{row['win_rate']:6.1f}% {row['max_win']:+6.2f}% {row['max_loss']:+7.2f}%")


def _print_swing_trader_results(result: PortfolioBacktestResult):
    """Print swing trader simulation results — actual earnings with shared capital."""
    if not result.portfolio_trades:
        return

    initial = result.config.initial_capital if result.config else 500000
    eq_df = result.portfolio_equity_curve

    print(f"\n{'='*70}")
    print(f"SWING TRADER SIMULATION (Shared Capital)")
    print(f"{'='*70}")
    print(f"Starting Capital:      ₹{initial:,.0f}")
    print(f"Final Capital:         ₹{result.portfolio_final_capital:,.0f}")
    profit = result.portfolio_final_capital - initial
    print(f"Total Profit/Loss:     ₹{profit:+,.0f} ({result.portfolio_total_return_pct:+.1f}%)")
    print(f"Max Drawdown:          {result.portfolio_max_drawdown_pct:.1f}%")
    print(f"Sharpe Ratio:          {result.portfolio_sharpe:.2f}")
    print(f"Sortino Ratio:         {result.portfolio_sortino:.2f}")
    print(f"Trades Executed:       {len(result.portfolio_trades)}")
    print(f"Trades Skipped:")
    print(f"  - Max positions full:  {result.trades_skipped_capacity}")
    print(f"  - Monthly limit:       {result.trades_skipped_monthly_limit}")
    print(f"  - Heat limit:          {result.trades_skipped_heat}")
    print(f"  - Risk halt:           {result.trades_skipped_halted}")

    # ── Monthly earnings in rupees ──
    if eq_df is not None and not eq_df.empty:
        eq = eq_df.copy()
        eq['year'] = eq['date'].dt.year
        eq['month'] = eq['date'].dt.month

        # Group by month — sum actual P&L per month
        monthly = eq.groupby(['year', 'month']).agg(
            trades=('pnl', 'count'),
            total_pnl=('pnl', 'sum'),
            end_equity=('equity', 'last'),
        ).reset_index()

        month_names = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

        print(f"\n--- MONTHLY EARNINGS (₹) ---")
        print(f"{'Year':>6s} {'Mon':>4s} {'Trades':>6s} {'Earnings':>12s} {'Account':>12s}")
        print("-" * 48)

        profitable_months = 0
        total_months = 0
        monthly_earns = []

        for _, row in monthly.iterrows():
            mn = month_names[int(row['month'])]
            pnl = row['total_pnl']
            eq_val = row['end_equity']
            marker = "  " if pnl >= 0 else " *"
            print(f"  {int(row['year']):4d} {mn:>4s} {int(row['trades']):6d} "
                  f"₹{pnl:>+11,.0f}{marker} ₹{eq_val:>10,.0f}")
            total_months += 1
            monthly_earns.append(pnl)
            if pnl > 0:
                profitable_months += 1

        if monthly_earns:
            print(f"\n  Profitable months:     {profitable_months}/{total_months} "
                  f"({profitable_months/total_months*100:.0f}%)")
            print(f"  Avg monthly earning:   ₹{np.mean(monthly_earns):+,.0f}")
            print(f"  Best month:            ₹{max(monthly_earns):+,.0f}")
            print(f"  Worst month:           ₹{min(monthly_earns):+,.0f}")
            print(f"  Median month:          ₹{np.median(monthly_earns):+,.0f}")

        # ── Yearly earnings ──
        yearly = eq.groupby('year').agg(
            trades=('pnl', 'count'),
            total_pnl=('pnl', 'sum'),
            end_equity=('equity', 'last'),
        ).reset_index()

        print(f"\n--- YEARLY EARNINGS (₹) ---")
        print(f"{'Year':>6s} {'Trades':>6s} {'Earnings':>12s} {'Return':>8s} {'Account':>12s}")
        print("-" * 52)

        for i, row in yearly.iterrows():
            pnl = row['total_pnl']
            eq_val = row['end_equity']
            # Year start capital = previous year end or initial
            if i == 0:
                year_start = initial
            else:
                year_start = yearly.iloc[i - 1]['end_equity']
            ret_pct = (pnl / year_start * 100) if year_start > 0 else 0
            print(f"  {int(row['year']):4d} {int(row['trades']):6d} "
                  f"₹{pnl:>+11,.0f} {ret_pct:>+6.1f}% ₹{eq_val:>10,.0f}")

        if len(yearly) > 0:
            yearly_earns = yearly['total_pnl'].tolist()
            print(f"\n  Avg yearly earning:    ₹{np.mean(yearly_earns):+,.0f}")
            years = len(yearly)
            if years > 0:
                cagr = ((result.portfolio_final_capital / initial) ** (1 / years) - 1) * 100
                print(f"  CAGR:                  {cagr:+.1f}%")


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------
def main():
    """Run the full portfolio backtest from command line."""
    import argparse

    parser = argparse.ArgumentParser(description="SwingAI Portfolio Backtest")
    parser.add_argument("--stocks", type=int, default=250,
                        help="Max stocks to test (default: 250)")
    parser.add_argument("--period", type=str, default="5y",
                        help="Data period: 1y, 2y, 5y (default: 5y)")
    parser.add_argument("--capital", type=float, default=500000,
                        help="Initial capital in INR (default: 500000)")
    parser.add_argument("--risk", type=float, default=3.0,
                        help="Risk per trade %% (default: 3.0)")
    parser.add_argument("--max-positions", type=int, default=8,
                        help="Max simultaneous open positions (default: 8)")
    parser.add_argument("--max-trades-month", type=int, default=12,
                        help="Max new trades per month (default: 12, 0=unlimited)")
    parser.add_argument("--universe", type=str, default="data/backtest_universe.txt",
                        help="Universe file path")
    parser.add_argument("--strategy", type=str, default=None,
                        help="Test specific strategy only (e.g., Supertrend_ADX)")

    args = parser.parse_args()

    config = BacktestConfig(
        initial_capital=args.capital,
        risk_per_trade_pct=args.risk,
        max_positions=args.max_positions,
        max_trades_per_month=args.max_trades_month,
    )

    strategies = None
    if args.strategy:
        all_strats = get_all_strategies()
        strategies = [s for s in all_strats if s.name == args.strategy]
        if not strategies:
            print(f"Strategy '{args.strategy}' not found. Available:")
            for s in all_strats:
                print(f"  - {s.name}")
            return

    result = run_portfolio_backtest(
        config=config,
        period=args.period,
        max_stocks=args.stocks,
        universe_file=args.universe,
        strategies=strategies,
    )

    return result


if __name__ == "__main__":
    main()
