"""
Breakout-Based Pattern Validation
==================================
Walks through historical data BAR-BY-BAR, runs actual detect_breakout()
at each bar, and evaluates forward outcomes ONLY when a breakout fires.

This tests the PRODUCTION signal path — the same code that generates
live alerts. Unlike validate_patterns.py (which scans every 20 bars),
this only records signals at real breakout points.

Usage:
    python -m ml.backtest.validate_breakouts --stocks 50 --period 2y
"""

import sys
import time
import logging
import warnings
import argparse
from pathlib import Path
from typing import List, Dict, Tuple
from dataclasses import dataclass
from collections import defaultdict

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.features.patterns import (
    scan_for_patterns,
    detect_breakout,
    detect_reversal_breakout,
    PatternResult,
    BreakoutSignal,
)
from ml.features.patterns import scan_all_patterns as scan_all_patterns_v2
from ml.features.indicators import compute_all_indicators

_CONSOLIDATION_TYPES = {
    "ascending_triangle", "symmetrical_triangle", "horizontal_channel",
    "falling_wedge", "bull_flag",
}
_REVERSAL_TYPES = {
    "cup_and_handle", "double_bottom", "triple_bottom",
    "inverse_head_shoulders", "high_tight_flag",
}

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


# ── Reuse data loading from validate_patterns ──────────────────────────

def load_universe(filepath: str, max_stocks: int = 50) -> List[str]:
    path = ROOT / filepath
    if not path.exists():
        logger.error(f"Universe file not found: {path}")
        return []
    symbols = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        sym = line.split()[0].strip()
        if not sym.endswith(".NS"):
            sym += ".NS"
        symbols.append(sym)
    return symbols[:max_stocks]


def fetch_stock_data(symbols: List[str], period: str = "2y") -> Dict[str, pd.DataFrame]:
    import yfinance as yf
    logger.info(f"  Downloading {len(symbols)} stocks ({period})...")
    data = {}
    try:
        raw = yf.download(symbols, period=period, group_by="ticker", progress=False, threads=True)
        for sym in symbols:
            try:
                if len(symbols) == 1:
                    df = raw.copy()
                else:
                    df = raw[sym].copy()
                df = df.dropna(subset=["Close"])
                if len(df) < 200:
                    continue
                df.columns = [c.lower() for c in df.columns]
                df = df.rename(columns={"adj close": "adj_close"})
                df = compute_all_indicators(df)
                data[sym] = df
            except Exception:
                continue
    except Exception as e:
        logger.error(f"  Batch download failed: {e}")
    logger.info(f"  Got data for {len(data)}/{len(symbols)} stocks")
    return data


# ── Forward evaluation ─────────────────────────────────────────────────

def evaluate_forward(
    df: pd.DataFrame,
    entry_bar: int,
    target: float,
    stop_loss: float,
    entry_price: float,
    max_horizon: int = 40,
) -> Dict:
    """Evaluate forward P&L from a breakout signal."""
    n = len(df)
    future_start = entry_bar + 1
    future_end = min(entry_bar + max_horizon + 1, n)

    if future_start >= n:
        return {"hit_target": False, "hit_stoploss": False, "days_to_hit": 0,
                "max_favorable": 0, "max_adverse": 0, "outcome_pct": 0}

    future = df.iloc[future_start:future_end]
    if future.empty:
        return {"hit_target": False, "hit_stoploss": False, "days_to_hit": 0,
                "max_favorable": 0, "max_adverse": 0, "outcome_pct": 0}

    target_pct = abs(target - entry_price) / entry_price * 100 if entry_price > 0 else 0
    sl_pct = abs(entry_price - stop_loss) / entry_price * 100 if entry_price > 0 else 0

    hit_target = False
    hit_stoploss = False
    days_to_hit = 0
    max_favorable = 0.0
    max_adverse = 0.0

    for i, (_, row) in enumerate(future.iterrows()):
        high = float(row["high"])
        low = float(row["low"])

        fav = (high - entry_price) / entry_price * 100
        adv = (entry_price - low) / entry_price * 100
        max_favorable = max(max_favorable, fav)
        max_adverse = max(max_adverse, adv)

        # Check stop loss FIRST (intrabar: stop hit before target)
        if low <= stop_loss:
            hit_stoploss = True
            days_to_hit = i + 1
            break

        # Check target hit
        if high >= target:
            hit_target = True
            days_to_hit = i + 1
            break

    if hit_target:
        outcome_pct = target_pct
    elif hit_stoploss:
        outcome_pct = -sl_pct
    else:
        last_close = float(future.iloc[-1]["close"])
        outcome_pct = (last_close - entry_price) / entry_price * 100
        days_to_hit = len(future)

    return {
        "hit_target": hit_target,
        "hit_stoploss": hit_stoploss,
        "days_to_hit": days_to_hit,
        "max_favorable": round(max_favorable, 2),
        "max_adverse": round(max_adverse, 2),
        "outcome_pct": round(outcome_pct, 2),
    }


# ── Breakout detection result ─────────────────────────────────────────

@dataclass
class BreakoutDetection:
    symbol: str
    pattern_type: str
    detection_bar: int
    detection_date: str
    entry_price: float
    target: float
    stop_loss: float
    quality_score: float
    alpha_score: float
    # Forward outcome
    hit_target: bool = False
    hit_stoploss: bool = False
    days_to_hit: int = 0
    max_favorable: float = 0.0
    max_adverse: float = 0.0
    outcome_pct: float = 0.0


# ── Core: bar-by-bar breakout walk ─────────────────────────────────────

def validate_breakouts(
    stock_data: Dict[str, pd.DataFrame],
    lookback: int = 250,
    scan_interval: int = 5,
    max_horizon: int = 40,
) -> Tuple[List[BreakoutDetection], Dict]:
    """
    Walk bar-by-bar through historical data. Every scan_interval bars,
    re-scan for patterns. At EVERY bar, check detect_breakout() on
    cached patterns. Record only when breakout fires.
    """
    all_detections: List[BreakoutDetection] = []
    stats_by_type: Dict[str, List[BreakoutDetection]] = defaultdict(list)

    total_stocks = len(stock_data)
    done = 0

    for sym, df in stock_data.items():
        done += 1
        n = len(df)
        clean_sym = sym.replace(".NS", "")

        # Track recent signals to deduplicate
        recent_signals: Dict[str, int] = {}  # pattern_type -> last_signal_bar
        cached_patterns: List[PatternResult] = []
        last_scan_bar = -999

        sym_signals = 0
        sym_patterns_found = 0
        sym_breakout_checks = 0
        start_bar = lookback + 50
        end_bar = n - max_horizon

        def _check_breakout_at_bar(check_bar, pat):
            """Try detect_breakout at a single bar. Returns BreakoutSignal or None."""
            # Dynamically update breakout/support to current trendline value
            if pat.resistance_line is not None:
                pat.breakout_level = pat.resistance_line.value_at(check_bar)
            if pat.support_line is not None:
                pat.support_level = pat.support_line.value_at(check_bar)
            try:
                if pat.pattern_type in _CONSOLIDATION_TYPES:
                    return detect_breakout(df, check_bar, pat)
                elif pat.pattern_type in _REVERSAL_TYPES:
                    return detect_reversal_breakout(df, check_bar, pat)
            except Exception:
                pass
            return None

        for bar in range(start_bar, end_bar):
            # Re-scan for patterns every scan_interval bars
            new_scan = False
            if bar - last_scan_bar >= scan_interval:
                try:
                    cached_patterns = scan_for_patterns(
                        df.iloc[:bar + 1], lookback=lookback, interval='1d'
                    )
                except Exception:
                    cached_patterns = []
                sym_patterns_found += len(cached_patterns)
                last_scan_bar = bar
                new_scan = True

            # When new patterns detected, retroactively check the previous
            # scan_interval bars (the breakout may have fired between scans)
            bars_to_check = [bar]
            if new_scan:
                retro_start = max(start_bar, bar - scan_interval)
                bars_to_check = list(range(retro_start, bar + 1))

            for check_bar in bars_to_check:
                for pat in cached_patterns:
                    # Dedup: skip if same pattern fired within last 10 bars
                    if pat.pattern_type in recent_signals:
                        if check_bar - recent_signals[pat.pattern_type] < 10:
                            continue

                    sym_breakout_checks += 1
                    signal = _check_breakout_at_bar(check_bar, pat)

                    if signal is None:
                        continue

                    # Breakout fired! Record it.
                    recent_signals[pat.pattern_type] = check_bar

                fwd = evaluate_forward(
                    df, check_bar, signal.target, signal.stop_loss,
                    signal.entry_price, max_horizon=max_horizon,
                )

                date_str = (str(df.index[check_bar].date())
                            if hasattr(df.index[check_bar], 'date')
                            else str(df.index[check_bar]))

                det = BreakoutDetection(
                    symbol=clean_sym,
                    pattern_type=pat.pattern_type,
                    detection_bar=check_bar,
                    detection_date=date_str,
                    entry_price=signal.entry_price,
                    target=signal.target,
                    stop_loss=signal.stop_loss,
                    quality_score=round(pat.quality_score, 1),
                    alpha_score=signal.alpha_score,
                    **fwd,
                )
                all_detections.append(det)
                stats_by_type[pat.pattern_type].append(det)
                sym_signals += 1

        if done % 10 == 0 or done == total_stocks:
            logger.info(f"  [{done}/{total_stocks}] {clean_sym}: {sym_signals} signals "
                        f"({sym_patterns_found} patterns, {sym_breakout_checks} checks)")

    # Compute aggregate stats
    pattern_stats = {}
    for ptype, dets in stats_by_type.items():
        total = len(dets)
        hits = [d for d in dets if d.hit_target]
        sl_hits = [d for d in dets if d.hit_stoploss]
        timeouts = [d for d in dets if not d.hit_target and not d.hit_stoploss]

        avg_days = np.mean([d.days_to_hit for d in hits]) if hits else 0
        avg_outcome = np.mean([d.outcome_pct for d in dets]) if dets else 0
        avg_fav = np.mean([d.max_favorable for d in dets]) if dets else 0
        avg_adv = np.mean([d.max_adverse for d in dets]) if dets else 0
        win_rate = len(hits) / total * 100 if total > 0 else 0
        avg_q_hits = np.mean([d.quality_score for d in hits]) if hits else 0
        avg_q_misses = np.mean([d.quality_score for d in dets if not d.hit_target]) if any(not d.hit_target for d in dets) else 0

        avg_win = np.mean([d.outcome_pct for d in hits]) if hits else 0
        avg_loss = np.mean([abs(d.outcome_pct) for d in dets if not d.hit_target]) if any(not d.hit_target for d in dets) else 0
        loss_rate = 1 - (win_rate / 100)
        expectancy = (avg_win * win_rate / 100) - (avg_loss * loss_rate) if total > 0 else 0

        avg_alpha = np.mean([d.alpha_score for d in dets]) if dets else 0

        pattern_stats[ptype] = {
            "total": total, "hits": len(hits), "sl_hits": len(sl_hits),
            "timeouts": len(timeouts), "win_rate": round(win_rate, 1),
            "avg_days": round(avg_days, 1), "avg_outcome": round(avg_outcome, 2),
            "avg_fav": round(avg_fav, 2), "avg_adv": round(avg_adv, 2),
            "expectancy": round(expectancy, 2), "avg_alpha": round(avg_alpha, 1),
            "avg_q_hits": round(avg_q_hits, 1), "avg_q_misses": round(avg_q_misses, 1),
        }

    return all_detections, pattern_stats


# ── Unified V2 validation (detection=confirmation) ────────────────────

def validate_unified(
    stock_data: Dict[str, pd.DataFrame],
    lookback: int = 250,
    max_horizon: int = 40,
) -> Tuple[List[BreakoutDetection], Dict]:
    """
    V2 unified validation: scan_all_patterns() returns pre-confirmed signals.
    No bar-by-bar walk needed — each signal IS the breakout.
    """
    all_detections: List[BreakoutDetection] = []
    stats_by_type: Dict[str, List[BreakoutDetection]] = defaultdict(list)

    total_stocks = len(stock_data)
    done = 0

    for sym, df in stock_data.items():
        done += 1
        n = len(df)
        clean_sym = sym.replace(".NS", "")

        signals = scan_all_patterns_v2(df, lookback=lookback, interval='1d')

        sym_signals = 0
        for sig in signals:
            # Get the confirmation bar from pivot_indices
            if not sig.pattern.pivot_indices:
                continue
            bar = sig.pattern.pivot_indices[-1][0]

            # Skip if too close to end for forward evaluation
            if bar + 5 >= n:
                continue

            fwd = evaluate_forward(
                df, bar, sig.target, sig.stop_loss,
                sig.entry_price, max_horizon=max_horizon,
            )

            date_str = (str(df.index[bar].date())
                        if hasattr(df.index[bar], 'date')
                        else str(df.index[bar]))

            det = BreakoutDetection(
                symbol=clean_sym,
                pattern_type=sig.pattern.pattern_type,
                detection_bar=bar,
                detection_date=date_str,
                entry_price=sig.entry_price,
                target=sig.target,
                stop_loss=sig.stop_loss,
                quality_score=round(sig.pattern.quality_score, 1),
                alpha_score=sig.alpha_score,
                **fwd,
            )
            all_detections.append(det)
            stats_by_type[sig.pattern.pattern_type].append(det)
            sym_signals += 1

        if done % 10 == 0 or done == total_stocks:
            logger.info(f"  [{done}/{total_stocks}] {clean_sym}: {sym_signals} signals "
                        f"({len(signals)} patterns detected)")

    # Compute aggregate stats (same as validate_breakouts)
    pattern_stats = {}
    for ptype, dets in stats_by_type.items():
        total = len(dets)
        hits = [d for d in dets if d.hit_target]
        sl_hits = [d for d in dets if d.hit_stoploss]
        timeouts = [d for d in dets if not d.hit_target and not d.hit_stoploss]

        avg_days = np.mean([d.days_to_hit for d in hits]) if hits else 0
        avg_outcome = np.mean([d.outcome_pct for d in dets]) if dets else 0
        avg_fav = np.mean([d.max_favorable for d in dets]) if dets else 0
        avg_adv = np.mean([d.max_adverse for d in dets]) if dets else 0
        win_rate = len(hits) / total * 100 if total > 0 else 0
        avg_q_hits = np.mean([d.quality_score for d in hits]) if hits else 0
        avg_q_misses = np.mean([d.quality_score for d in dets if not d.hit_target]) if any(not d.hit_target for d in dets) else 0

        avg_win = np.mean([d.outcome_pct for d in hits]) if hits else 0
        avg_loss = np.mean([abs(d.outcome_pct) for d in dets if not d.hit_target]) if any(not d.hit_target for d in dets) else 0
        loss_rate = 1 - (win_rate / 100)
        expectancy = (avg_win * win_rate / 100) - (avg_loss * loss_rate) if total > 0 else 0

        avg_alpha = np.mean([d.alpha_score for d in dets]) if dets else 0

        pattern_stats[ptype] = {
            "total": total, "hits": len(hits), "sl_hits": len(sl_hits),
            "timeouts": len(timeouts), "win_rate": round(win_rate, 1),
            "avg_days": round(avg_days, 1), "avg_outcome": round(avg_outcome, 2),
            "avg_fav": round(avg_fav, 2), "avg_adv": round(avg_adv, 2),
            "expectancy": round(expectancy, 2), "avg_alpha": round(avg_alpha, 1),
            "avg_q_hits": round(avg_q_hits, 1), "avg_q_misses": round(avg_q_misses, 1),
        }

    return all_detections, pattern_stats


# ── Print results ──────────────────────────────────────────────────────

def print_results(pattern_stats: Dict, all_detections: List[BreakoutDetection]):
    print(f"\n{'='*95}")
    print(f"  BREAKOUT-BASED PATTERN VALIDATION RESULTS")
    print(f"  (Only signals where detect_breakout() actually fired)")
    print(f"{'='*95}")
    print(f"  Total breakout signals: {len(all_detections)}")
    print(f"  Pattern types found: {len(pattern_stats)}")

    if not pattern_stats:
        print("\n  NO BREAKOUT SIGNALS DETECTED.")
        return

    sorted_stats = sorted(pattern_stats.items(), key=lambda x: x[1]["win_rate"], reverse=True)

    print(f"\n{'─'*95}")
    print(f"  {'Pattern Type':<25} {'Count':>6} {'Hits':>5} {'Win%':>6} {'Avg Days':>8} "
          f"{'Avg P&L%':>8} {'Expect':>7} {'Alpha':>6} {'Q(hit)':>6} {'Q(miss)':>7}")
    print(f"{'─'*95}")

    for ptype, s in sorted_stats:
        if s["total"] < 3:
            verdict = "  [LOW SAMPLE]"
        elif s["win_rate"] >= 55 and s["expectancy"] > 0:
            verdict = "  [STRONG]"
        elif s["win_rate"] >= 45 and s["expectancy"] > 0:
            verdict = "  [GOOD]"
        elif s["win_rate"] >= 35 and s["expectancy"] > 0:
            verdict = "  [OK]"
        elif s["expectancy"] > 0:
            verdict = "  [MARGINAL]"
        else:
            verdict = "  [POOR]"

        print(f"  {ptype:<25} {s['total']:>6} {s['hits']:>5} "
              f"{s['win_rate']:>5.1f}% {s['avg_days']:>7.1f} "
              f"{s['avg_outcome']:>+7.2f}% {s['expectancy']:>+6.2f} "
              f"{s['avg_alpha']:>5.1f} "
              f"{s['avg_q_hits']:>5.1f} {s['avg_q_misses']:>6.1f}{verdict}")

    print(f"{'─'*95}")

    # Overall
    total_hits = sum(s["hits"] for _, s in sorted_stats)
    total_det = sum(s["total"] for _, s in sorted_stats)
    overall_wr = total_hits / total_det * 100 if total_det > 0 else 0
    overall_pnl = np.mean([d.outcome_pct for d in all_detections]) if all_detections else 0

    print(f"\n  OVERALL: {total_det} breakout signals | {total_hits} hits | "
          f"{overall_wr:.1f}% win rate | {overall_pnl:+.2f}% avg P&L")

    # Target/stop analysis
    if all_detections:
        target_dists = [abs(d.target - d.entry_price) / d.entry_price * 100
                        for d in all_detections if d.entry_price > 0]
        stop_dists = [abs(d.entry_price - d.stop_loss) / d.entry_price * 100
                      for d in all_detections if d.entry_price > 0]
        if target_dists and stop_dists:
            print(f"\n  Avg target dist: {np.mean(target_dists):.2f}%  |  "
                  f"Avg stop dist: {np.mean(stop_dists):.2f}%  |  "
                  f"Avg R:R: {np.mean(target_dists)/np.mean(stop_dists):.2f}")

        hits = [d for d in all_detections if d.hit_target]
        sl_hits = [d for d in all_detections if d.hit_stoploss]
        if hits:
            print(f"  Avg days to target: {np.mean([d.days_to_hit for d in hits]):.1f}")
        if sl_hits:
            print(f"  Avg days to stop:   {np.mean([d.days_to_hit for d in sl_hits]):.1f}")

    # Quality score analysis
    print(f"\n{'='*95}")
    print(f"  QUALITY SCORE ANALYSIS")
    print(f"{'='*95}")
    if len(all_detections) >= 6:
        scores = [d.quality_score for d in all_detections]
        median_q = np.median(scores)
        high_q = [d for d in all_detections if d.quality_score >= median_q]
        low_q = [d for d in all_detections if d.quality_score < median_q]
        high_wr = sum(1 for d in high_q if d.hit_target) / len(high_q) * 100 if high_q else 0
        low_wr = sum(1 for d in low_q if d.hit_target) / len(low_q) * 100 if low_q else 0
        high_pnl = np.mean([d.outcome_pct for d in high_q]) if high_q else 0
        low_pnl = np.mean([d.outcome_pct for d in low_q]) if low_q else 0

        print(f"  Median quality: {median_q:.1f}")
        print(f"  High quality (>={median_q:.0f}): {len(high_q)} signals, "
              f"{high_wr:.1f}% win, {high_pnl:+.2f}% P&L")
        print(f"  Low quality  (<{median_q:.0f}):  {len(low_q)} signals, "
              f"{low_wr:.1f}% win, {low_pnl:+.2f}% P&L")
        diff = high_wr - low_wr
        if diff > 5:
            print(f"  --> Quality IS predictive (+{diff:.1f}% edge)")
        elif diff > -5:
            print(f"  --> Quality is neutral ({diff:+.1f}% diff)")
        else:
            print(f"  --> Quality is INVERTED ({diff:+.1f}% diff)")

    # Production verdict
    print(f"\n{'='*95}")
    print(f"  PRODUCTION VERDICT")
    print(f"{'='*95}")

    strong = [(p, s) for p, s in sorted_stats if s["total"] >= 3 and s["win_rate"] >= 45 and s["expectancy"] > 0]
    ok = [(p, s) for p, s in sorted_stats if s["total"] >= 3 and s["win_rate"] >= 35 and s["expectancy"] > 0 and (p, s) not in strong]
    poor = [(p, s) for p, s in sorted_stats if s["total"] >= 3 and (s["win_rate"] < 35 or s["expectancy"] <= 0)]
    low_sample = [(p, s) for p, s in sorted_stats if s["total"] < 3]

    if strong:
        print(f"\n  PRODUCTION READY (>=45% win, +expectancy):")
        for p, s in strong:
            print(f"    + {p}: {s['win_rate']:.0f}% win, {s['expectancy']:+.2f} expectancy")
    if ok:
        print(f"\n  USABLE WITH CONFIRMATION (>=35% win, +expectancy):")
        for p, s in ok:
            print(f"    ~ {p}: {s['win_rate']:.0f}% win, {s['expectancy']:+.2f} expectancy")
    if poor:
        print(f"\n  NOT RECOMMENDED (<35% win or -expectancy):")
        for p, s in poor:
            print(f"    - {p}: {s['win_rate']:.0f}% win, {s['expectancy']:+.2f} expectancy")
    if low_sample:
        print(f"\n  INSUFFICIENT DATA (<3 signals):")
        for p, s in low_sample:
            print(f"    ? {p}: only {s['total']} signals")

    print(f"\n{'='*95}")


# ── Main ───────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Validate Pattern Breakout Signals")
    parser.add_argument("--stocks", type=int, default=50)
    parser.add_argument("--period", type=str, default="2y")
    parser.add_argument("--scan-interval", type=int, default=5,
                        help="Re-scan for patterns every N bars (default: 5)")
    parser.add_argument("--lookback", type=int, default=250)
    parser.add_argument("--horizon", type=int, default=40)
    parser.add_argument("--universe", type=str, default="data/backtest_universe.txt")
    parser.add_argument("--mode", type=str, default="unified",
                        choices=["legacy", "unified"],
                        help="Detection mode: 'unified' (v2, default) or 'legacy' (v1)")
    args = parser.parse_args()

    mode_label = "UNIFIED V2 (detection=confirmation)" if args.mode == "unified" else "LEGACY (scan+breakout)"
    print(f"\n{'='*95}")
    print(f"  BREAKOUT-BASED PATTERN VALIDATION — {mode_label}")
    print(f"{'='*95}")
    print(f"  Stocks: {args.stocks} | Period: {args.period} | "
          f"Mode: {args.mode}")
    print(f"  Lookback: {args.lookback} | Forward horizon: {args.horizon} bars")
    print(f"{'='*95}")

    symbols = load_universe(args.universe, max_stocks=args.stocks)
    if not symbols:
        logger.error("No symbols loaded.")
        return

    print(f"\n[1/3] Fetching market data...")
    stock_data = fetch_stock_data(symbols, period=args.period)
    if not stock_data:
        logger.error("No stock data fetched.")
        return

    if args.mode == "unified":
        print(f"\n[2/3] Running unified V2 pattern scan...")
    else:
        print(f"\n[2/3] Walking bar-by-bar for breakout signals...")
    start = time.time()
    if args.mode == "unified":
        all_detections, pattern_stats = validate_unified(
            stock_data,
            lookback=args.lookback,
            max_horizon=args.horizon,
        )
    else:
        all_detections, pattern_stats = validate_breakouts(
            stock_data,
            lookback=args.lookback,
            scan_interval=args.scan_interval,
            max_horizon=args.horizon,
        )
    elapsed = time.time() - start
    print(f"  Completed in {elapsed:.1f}s")

    print(f"\n[3/3] Results...")
    print_results(pattern_stats, all_detections)

    # Save CSV
    if all_detections:
        out_path = ROOT / "output" / "breakout_validation.csv"
        out_path.parent.mkdir(exist_ok=True)
        rows = [{
            "symbol": d.symbol, "pattern_type": d.pattern_type,
            "detection_date": d.detection_date, "entry": d.entry_price,
            "target": d.target, "stop_loss": d.stop_loss,
            "quality_score": d.quality_score, "alpha_score": d.alpha_score,
            "hit_target": d.hit_target, "hit_stoploss": d.hit_stoploss,
            "days_to_hit": d.days_to_hit, "max_favorable": d.max_favorable,
            "max_adverse": d.max_adverse, "outcome_pct": d.outcome_pct,
        } for d in all_detections]
        pd.DataFrame(rows).to_csv(out_path, index=False)
        print(f"\n  Raw data saved to: {out_path}")


if __name__ == "__main__":
    main()
