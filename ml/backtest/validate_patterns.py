"""
Pattern Detection Accuracy Validator
=====================================
Downloads 2y daily OHLCV for N stocks, runs pattern detection at rolling
historical points, then checks whether price hit the breakout target
within a swing-trading horizon (5-40 bars).

Produces per-pattern-type stats:
  - Detection count
  - Hit rate (price reached breakout_level within horizon)
  - Avg days to hit
  - Avg quality_score for hits vs misses
  - False positive rate

Usage:
    python -m ml.backtest.validate_patterns --stocks 50 --period 2y
"""

import sys
import time
import logging
import warnings
import argparse
from pathlib import Path
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
from collections import defaultdict

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from ml.features.patterns import (
    scan_all_patterns,
    scan_for_patterns,
    scan_for_reversal_patterns,
    detect_breakout,
    detect_reversal_breakout,
    PatternResult,
    BreakoutSignal,
    BreakoutMetaLabeler,
    _check_trend_alignment,
)
from ml.features.indicators import compute_all_indicators

# Consolidation pattern types (use detect_breakout for calibrated target/stop)
_CONSOLIDATION_TYPES = {"ascending_triangle", "symmetrical_triangle", "horizontal_channel",
                         "falling_wedge", "bull_flag"}
# Reversal pattern types (use detect_reversal_breakout for calibrated target/stop)
_REVERSAL_TYPES = {"cup_and_handle", "double_bottom", "triple_bottom",
                    "inverse_head_shoulders"}

warnings.filterwarnings("ignore")
logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger(__name__)


@dataclass
class PatternDetection:
    """A single pattern detection event with forward outcome."""
    symbol: str
    pattern_type: str
    detection_bar: int          # iloc index where pattern was detected
    detection_date: str
    breakout_level: float
    support_level: float
    quality_score: float
    close_at_detection: float
    # Forward outcome
    hit_target: bool = False
    hit_stoploss: bool = False
    days_to_hit: int = 0
    max_favorable: float = 0.0  # max % move toward target
    max_adverse: float = 0.0    # max % move against
    outcome_pct: float = 0.0    # P&L % at exit (target, SL, or timeout)


@dataclass
class PatternStats:
    """Aggregated stats for one pattern type."""
    pattern_type: str
    total_detections: int = 0
    hits: int = 0
    misses: int = 0
    stoploss_hits: int = 0
    timeouts: int = 0
    avg_days_to_hit: float = 0.0
    avg_quality_hits: float = 0.0
    avg_quality_misses: float = 0.0
    avg_outcome_pct: float = 0.0
    avg_max_favorable: float = 0.0
    avg_max_adverse: float = 0.0
    win_rate: float = 0.0
    expectancy: float = 0.0     # avg win * win_rate - avg loss * loss_rate


def load_universe(filepath: str, max_stocks: int = 50) -> List[str]:
    """Load stock symbols from universe file."""
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
    """Download OHLCV data via yfinance."""
    import yfinance as yf

    logger.info(f"  Downloading {len(symbols)} stocks ({period})...")
    data = {}
    # Batch download
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
                # Compute indicators needed by pattern detection
                df = compute_all_indicators(df)
                data[sym] = df
            except Exception:
                continue
    except Exception as e:
        logger.error(f"  Batch download failed: {e}")

    logger.info(f"  Got data for {len(data)}/{len(symbols)} stocks")
    return data


@dataclass
class CalibratedPattern:
    """Pattern with calibrated trading levels from detect_breakout/detect_reversal_breakout."""
    pattern: PatternResult
    target: float       # Calibrated target (from BreakoutSignal or raw)
    stop_loss: float    # Calibrated stop (from BreakoutSignal or raw)
    entry: float        # Entry price
    has_breakout: bool   # Whether detect_breakout() confirmed it


def _load_ml_labeler() -> Optional[BreakoutMetaLabeler]:
    """Load the trained ML labeler if available."""
    model_path = ROOT / "ml" / "models" / "breakout_meta_labeler.pkl"
    if not model_path.exists():
        return None
    try:
        labeler = BreakoutMetaLabeler()
        labeler.load(str(model_path))
        if labeler.is_trained:
            return labeler
    except Exception:
        pass
    return None


def run_pattern_detection_at_bar(
    df: pd.DataFrame,
    detection_bar: int,
    lookback: int = 250,
    ml_labeler: Optional[BreakoutMetaLabeler] = None,
) -> List[CalibratedPattern]:
    """Run all pattern detectors on data up to detection_bar using scan_all_patterns.
    Returns BreakoutSignals with real pattern-derived targets (not generic ATR)."""
    sub_df = df.iloc[:detection_bar + 1].copy()
    if len(sub_df) < lookback + 50:
        return []

    signals = []
    try:
        signals = scan_all_patterns(
            sub_df, lookback=lookback, interval='1d',
            ml_labeler=ml_labeler, ml_threshold=0.0,  # score all, don't filter
        )
    except Exception as e:
        logger.debug(f"scan_all_patterns failed: {e}")

    calibrated = []
    for sig in signals:
        pat = sig.pattern
        calibrated.append(CalibratedPattern(
            pattern=pat,
            target=round(sig.target, 2),
            stop_loss=round(sig.stop_loss, 2),
            entry=round(sig.entry_price, 2),
            has_breakout=True,
        ))

    return calibrated


def evaluate_forward(
    df: pd.DataFrame,
    detection_bar: int,
    breakout_level: float,
    support_level: float,
    close_at_detection: float,
    max_horizon: int = 40,
) -> Dict:
    """Check forward price action after pattern detection."""
    n = len(df)
    future_start = detection_bar + 1
    future_end = min(detection_bar + max_horizon + 1, n)

    if future_start >= n:
        return {"hit_target": False, "hit_stoploss": False, "days_to_hit": 0,
                "max_favorable": 0, "max_adverse": 0, "outcome_pct": 0}

    future = df.iloc[future_start:future_end]
    if future.empty:
        return {"hit_target": False, "hit_stoploss": False, "days_to_hit": 0,
                "max_favorable": 0, "max_adverse": 0, "outcome_pct": 0}

    is_bullish = breakout_level > close_at_detection
    target_pct = abs(breakout_level - close_at_detection) / close_at_detection * 100 if close_at_detection > 0 else 0

    # Use support_level as stop loss; if missing, use 2x risk below entry
    if support_level > 0 and support_level != close_at_detection:
        sl = support_level
    else:
        sl = close_at_detection * 0.95 if is_bullish else close_at_detection * 1.05

    hit_target = False
    hit_stoploss = False
    days_to_hit = 0
    max_favorable = 0.0
    max_adverse = 0.0

    for i, (idx, row) in enumerate(future.iterrows()):
        high = float(row["high"])
        low = float(row["low"])
        close = float(row["close"])

        if is_bullish:
            fav = (high - close_at_detection) / close_at_detection * 100
            adv = (close_at_detection - low) / close_at_detection * 100
        else:
            fav = (close_at_detection - low) / close_at_detection * 100
            adv = (high - close_at_detection) / close_at_detection * 100

        max_favorable = max(max_favorable, fav)
        max_adverse = max(max_adverse, adv)

        # Check target hit
        if is_bullish and high >= breakout_level:
            hit_target = True
            days_to_hit = i + 1
            break
        elif not is_bullish and low <= breakout_level:
            hit_target = True
            days_to_hit = i + 1
            break

        # Check stoploss hit
        if is_bullish and low <= sl:
            hit_stoploss = True
            days_to_hit = i + 1
            break
        elif not is_bullish and high >= sl:
            hit_stoploss = True
            days_to_hit = i + 1
            break

    # Outcome P&L
    if hit_target:
        outcome_pct = target_pct
    elif hit_stoploss:
        sl_dist = abs(sl - close_at_detection) / close_at_detection * 100
        outcome_pct = -sl_dist
    else:
        # Timeout — use last close
        last_close = float(future.iloc[-1]["close"])
        if is_bullish:
            outcome_pct = (last_close - close_at_detection) / close_at_detection * 100
        else:
            outcome_pct = (close_at_detection - last_close) / close_at_detection * 100
        days_to_hit = len(future)

    return {
        "hit_target": hit_target,
        "hit_stoploss": hit_stoploss,
        "days_to_hit": days_to_hit,
        "max_favorable": round(max_favorable, 2),
        "max_adverse": round(max_adverse, 2),
        "outcome_pct": round(outcome_pct, 2),
    }


def validate_patterns(
    stock_data: Dict[str, pd.DataFrame],
    scan_interval: int = 20,
    lookback: int = 250,
    max_horizon: int = 40,
    ml_labeler: Optional[BreakoutMetaLabeler] = None,
) -> Tuple[List[PatternDetection], Dict[str, PatternStats]]:
    """
    Walk through historical data, detect patterns at regular intervals,
    and evaluate forward outcomes.

    Args:
        stock_data: {symbol: OHLCV DataFrame}
        scan_interval: scan every N bars (20 = ~monthly)
        lookback: lookback for pattern detection
        max_horizon: max bars to wait for target hit
        ml_labeler: optional ML labeler for scoring signals
    """
    all_detections: List[PatternDetection] = []
    stats_by_type: Dict[str, List[PatternDetection]] = defaultdict(list)

    total_stocks = len(stock_data)
    done = 0

    for sym, df in stock_data.items():
        done += 1
        n = len(df)
        clean_sym = sym.replace(".NS", "")

        # Scan at regular intervals, leaving max_horizon bars for forward eval
        scan_points = range(lookback + 50, n - max_horizon, scan_interval)

        sym_detections = 0
        for bar in scan_points:
            patterns = run_pattern_detection_at_bar(df, bar, lookback=lookback, ml_labeler=ml_labeler)

            for cpat in patterns:
                close_price = cpat.entry

                # Use calibrated target/stop from detect_breakout() when available,
                # otherwise fall back to raw pattern levels
                target = cpat.target
                stop = cpat.stop_loss
                pat = cpat.pattern

                # Skip patterns with nonsensical levels
                if target <= 0 or stop <= 0:
                    continue
                if abs(target - close_price) / close_price > 0.30:
                    continue  # >30% away from current price = noise

                fwd = evaluate_forward(
                    df, bar, target, stop,
                    close_price, max_horizon=max_horizon,
                )

                detection = PatternDetection(
                    symbol=clean_sym,
                    pattern_type=pat.pattern_type,
                    detection_bar=bar,
                    detection_date=str(df.index[bar].date()) if hasattr(df.index[bar], 'date') else str(df.index[bar]),
                    breakout_level=round(target, 2),
                    support_level=round(stop, 2),
                    quality_score=round(pat.quality_score, 1),
                    close_at_detection=round(close_price, 2),
                    **fwd,
                )
                all_detections.append(detection)
                stats_by_type[pat.pattern_type].append(detection)
                sym_detections += 1

        if done % 10 == 0 or done == total_stocks:
            logger.info(f"  [{done}/{total_stocks}] {clean_sym}: {sym_detections} detections")

    # Compute aggregate stats
    pattern_stats = {}
    for ptype, detections in stats_by_type.items():
        total = len(detections)
        hits = [d for d in detections if d.hit_target]
        sl_hits = [d for d in detections if d.hit_stoploss]
        timeouts = [d for d in detections if not d.hit_target and not d.hit_stoploss]

        avg_days = np.mean([d.days_to_hit for d in hits]) if hits else 0
        avg_q_hits = np.mean([d.quality_score for d in hits]) if hits else 0
        avg_q_misses = np.mean([d.quality_score for d in detections if not d.hit_target]) if any(not d.hit_target for d in detections) else 0
        avg_outcome = np.mean([d.outcome_pct for d in detections]) if detections else 0
        avg_fav = np.mean([d.max_favorable for d in detections]) if detections else 0
        avg_adv = np.mean([d.max_adverse for d in detections]) if detections else 0
        win_rate = len(hits) / total * 100 if total > 0 else 0

        # Expectancy
        avg_win = np.mean([d.outcome_pct for d in hits]) if hits else 0
        avg_loss = np.mean([abs(d.outcome_pct) for d in detections if not d.hit_target]) if any(not d.hit_target for d in detections) else 0
        loss_rate = 1 - (win_rate / 100)
        expectancy = (avg_win * win_rate / 100) - (avg_loss * loss_rate) if total > 0 else 0

        pattern_stats[ptype] = PatternStats(
            pattern_type=ptype,
            total_detections=total,
            hits=len(hits),
            misses=total - len(hits),
            stoploss_hits=len(sl_hits),
            timeouts=len(timeouts),
            avg_days_to_hit=round(avg_days, 1),
            avg_quality_hits=round(avg_q_hits, 1),
            avg_quality_misses=round(avg_q_misses, 1),
            avg_outcome_pct=round(avg_outcome, 2),
            avg_max_favorable=round(avg_fav, 2),
            avg_max_adverse=round(avg_adv, 2),
            win_rate=round(win_rate, 1),
            expectancy=round(expectancy, 2),
        )

    return all_detections, pattern_stats


def print_results(pattern_stats: Dict[str, PatternStats], all_detections: List[PatternDetection]):
    """Print formatted validation results."""
    print(f"\n{'='*90}")
    print(f"  PATTERN DETECTION VALIDATION RESULTS")
    print(f"{'='*90}")
    print(f"  Total detections: {len(all_detections)}")
    print(f"  Pattern types found: {len(pattern_stats)}")

    if not pattern_stats:
        print("\n  NO PATTERNS DETECTED. Check data quality or lookback settings.")
        return

    # Sort by win rate descending
    sorted_stats = sorted(pattern_stats.values(), key=lambda s: s.win_rate, reverse=True)

    print(f"\n{'─'*90}")
    print(f"  {'Pattern Type':<25} {'Count':>6} {'Hits':>5} {'Win%':>6} {'Avg Days':>8} "
          f"{'Avg P&L%':>8} {'Expect':>7} {'Q(hit)':>6} {'Q(miss)':>7}")
    print(f"{'─'*90}")

    for s in sorted_stats:
        verdict = ""
        if s.total_detections < 5:
            verdict = "  [LOW SAMPLE]"
        elif s.win_rate >= 60 and s.expectancy > 0:
            verdict = "  [GOOD]"
        elif s.win_rate >= 50 and s.expectancy > 0:
            verdict = "  [OK]"
        elif s.expectancy > 0:
            verdict = "  [MARGINAL]"
        else:
            verdict = "  [POOR]"

        print(f"  {s.pattern_type:<25} {s.total_detections:>6} {s.hits:>5} "
              f"{s.win_rate:>5.1f}% {s.avg_days_to_hit:>7.1f} "
              f"{s.avg_outcome_pct:>+7.2f}% {s.expectancy:>+6.2f} "
              f"{s.avg_quality_hits:>5.1f} {s.avg_quality_misses:>6.1f}{verdict}")

    print(f"{'─'*90}")

    # Overall stats
    total_hits = sum(s.hits for s in sorted_stats)
    total_det = sum(s.total_detections for s in sorted_stats)
    overall_wr = total_hits / total_det * 100 if total_det > 0 else 0
    overall_pnl = np.mean([d.outcome_pct for d in all_detections]) if all_detections else 0

    print(f"\n  OVERALL: {total_det} detections | {total_hits} hits | "
          f"{overall_wr:.1f}% win rate | {overall_pnl:+.2f}% avg P&L")

    # Verdicts
    print(f"\n{'='*90}")
    print(f"  PRODUCTION READINESS VERDICT")
    print(f"{'='*90}")

    good = [s for s in sorted_stats if s.total_detections >= 5 and s.win_rate >= 60 and s.expectancy > 0]
    ok = [s for s in sorted_stats if s.total_detections >= 5 and s.win_rate >= 50 and s.expectancy > 0 and s not in good]
    poor = [s for s in sorted_stats if s.total_detections >= 5 and (s.win_rate < 50 or s.expectancy <= 0)]
    low_sample = [s for s in sorted_stats if s.total_detections < 5]

    if good:
        print(f"\n  PRODUCTION READY (>60% win, +expectancy):")
        for s in good:
            print(f"    + {s.pattern_type}: {s.win_rate:.0f}% win, {s.expectancy:+.2f} expectancy")

    if ok:
        print(f"\n  USABLE WITH CAUTION (>50% win, +expectancy):")
        for s in ok:
            print(f"    ~ {s.pattern_type}: {s.win_rate:.0f}% win, {s.expectancy:+.2f} expectancy")

    if poor:
        print(f"\n  NOT RECOMMENDED (<50% win or -expectancy):")
        for s in poor:
            print(f"    - {s.pattern_type}: {s.win_rate:.0f}% win, {s.expectancy:+.2f} expectancy")

    if low_sample:
        print(f"\n  INSUFFICIENT DATA (<5 detections):")
        for s in low_sample:
            print(f"    ? {s.pattern_type}: only {s.total_detections} detections")

    # Quality score analysis
    print(f"\n{'='*90}")
    print(f"  QUALITY SCORE ANALYSIS")
    print(f"{'='*90}")
    print(f"  Does higher quality_score predict better outcomes?\n")

    if len(all_detections) >= 10:
        scores = [d.quality_score for d in all_detections]
        median_q = np.median(scores)
        high_q = [d for d in all_detections if d.quality_score >= median_q]
        low_q = [d for d in all_detections if d.quality_score < median_q]

        high_wr = sum(1 for d in high_q if d.hit_target) / len(high_q) * 100 if high_q else 0
        low_wr = sum(1 for d in low_q if d.hit_target) / len(low_q) * 100 if low_q else 0
        high_pnl = np.mean([d.outcome_pct for d in high_q]) if high_q else 0
        low_pnl = np.mean([d.outcome_pct for d in low_q]) if low_q else 0

        print(f"  Median quality score: {median_q:.1f}")
        print(f"  High quality (>={median_q:.0f}): {len(high_q)} det, {high_wr:.1f}% win, {high_pnl:+.2f}% avg P&L")
        print(f"  Low quality  (<{median_q:.0f}):  {low_q and len(low_q) or 0} det, {low_wr:.1f}% win, {low_pnl:+.2f}% avg P&L")

        if high_wr > low_wr + 5:
            print(f"  --> Quality score IS predictive (+{high_wr - low_wr:.1f}% edge)")
        else:
            print(f"  --> Quality score is NOT meaningfully predictive (only {high_wr - low_wr:+.1f}% diff)")

    # Target/stop distance analysis
    print(f"\n{'='*90}")
    print(f"  TARGET & STOP DISTANCE ANALYSIS")
    print(f"{'='*90}")
    if all_detections:
        target_dists = [abs(d.breakout_level - d.close_at_detection) / d.close_at_detection * 100
                        for d in all_detections if d.close_at_detection > 0]
        stop_dists = [abs(d.close_at_detection - d.support_level) / d.close_at_detection * 100
                      for d in all_detections if d.close_at_detection > 0]
        if target_dists:
            print(f"  Avg target distance: {np.mean(target_dists):.2f}%  (median: {np.median(target_dists):.2f}%)")
        if stop_dists:
            print(f"  Avg stop distance:   {np.mean(stop_dists):.2f}%  (median: {np.median(stop_dists):.2f}%)")
        if target_dists and stop_dists:
            avg_rr = np.mean(target_dists) / np.mean(stop_dists) if np.mean(stop_dists) > 0 else 0
            print(f"  Avg R:R ratio:       {avg_rr:.2f}")
        # Days analysis
        hits = [d for d in all_detections if d.hit_target]
        sl_hits = [d for d in all_detections if d.hit_stoploss]
        if hits:
            print(f"  Avg days to target:  {np.mean([d.days_to_hit for d in hits]):.1f}")
        if sl_hits:
            print(f"  Avg days to stop:    {np.mean([d.days_to_hit for d in sl_hits]):.1f}")

    print(f"\n{'='*90}")


def main():
    parser = argparse.ArgumentParser(description="Validate Pattern Detection Accuracy")
    parser.add_argument("--stocks", type=int, default=50,
                        help="Number of stocks to test (default: 50)")
    parser.add_argument("--period", type=str, default="2y",
                        help="Data period: 1y, 2y, 5y (default: 2y)")
    parser.add_argument("--scan-interval", type=int, default=20,
                        help="Scan every N bars (default: 20 = ~monthly)")
    parser.add_argument("--lookback", type=int, default=250,
                        help="Lookback bars for pattern detection (default: 250)")
    parser.add_argument("--horizon", type=int, default=40,
                        help="Max forward bars to check target (default: 40)")
    parser.add_argument("--universe", type=str, default="data/backtest_universe.txt",
                        help="Universe file path")

    args = parser.parse_args()

    print(f"\n{'='*90}")
    print(f"  PATTERN DETECTION ACCURACY VALIDATION")
    print(f"{'='*90}")
    print(f"  Stocks: {args.stocks} | Period: {args.period} | Scan every: {args.scan_interval} bars")
    print(f"  Lookback: {args.lookback} | Forward horizon: {args.horizon} bars")
    print(f"{'='*90}")

    # Load universe
    symbols = load_universe(args.universe, max_stocks=args.stocks)
    if not symbols:
        logger.error("No symbols loaded. Exiting.")
        return

    print(f"\n[1/3] Fetching market data...")
    stock_data = fetch_stock_data(symbols, period=args.period)
    if not stock_data:
        logger.error("No stock data fetched. Exiting.")
        return

    # Load ML labeler
    ml_labeler = _load_ml_labeler()
    if ml_labeler:
        print(f"  ML meta-labeler loaded (will score all signals)")
    else:
        print(f"  No ML model found (run scripts/train_ml_model.py first)")

    print(f"\n[2/3] Running pattern detection + forward evaluation...")
    start = time.time()
    all_detections, pattern_stats = validate_patterns(
        stock_data,
        scan_interval=args.scan_interval,
        lookback=args.lookback,
        max_horizon=args.horizon,
        ml_labeler=ml_labeler,
    )
    elapsed = time.time() - start
    print(f"  Completed in {elapsed:.1f}s")

    print(f"\n[3/3] Results...")
    print_results(pattern_stats, all_detections)

    # Save raw data to CSV for deeper analysis
    if all_detections:
        out_path = ROOT / "output" / "pattern_validation.csv"
        out_path.parent.mkdir(exist_ok=True)
        rows = []
        for d in all_detections:
            rows.append({
                "symbol": d.symbol,
                "pattern_type": d.pattern_type,
                "detection_date": d.detection_date,
                "close": d.close_at_detection,
                "breakout_level": d.breakout_level,
                "support_level": d.support_level,
                "quality_score": d.quality_score,
                "hit_target": d.hit_target,
                "hit_stoploss": d.hit_stoploss,
                "days_to_hit": d.days_to_hit,
                "max_favorable_pct": d.max_favorable,
                "max_adverse_pct": d.max_adverse,
                "outcome_pct": d.outcome_pct,
            })
        pd.DataFrame(rows).to_csv(out_path, index=False)
        print(f"\n  Raw data saved to: {out_path}")


if __name__ == "__main__":
    main()
