"""
EarningsScout feature builder.

Assembles a training frame from:
    1. ``earnings_predictions`` rows where ``actual_result`` is populated
       (filled in after each quarter's actual comes in — today's
       production pipeline has to grow this table before a training run
       is meaningful).
    2. yfinance ``earnings_history`` for longer-horizon historical
       labels when the user pre-seeds the training set for the first
       model fit.

Features (name → meaning):
    hist_beat_rate_4q   — fraction of last 4 quarters that beat estimate
    hist_beat_streak    — current consecutive-beats streak
    hist_avg_surprise   — mean surprise % over last 4 quarters
    sentiment_14d       — weighted FinBERT-India score 14 days pre-announce
    sentiment_volume    — headline count in same window (log-scaled)
    analyst_tilt        — -0.10..+0.10 from analyst consensus
    price_chg_30d       — % price change 30 sessions pre-announce
    rel_vol_10d         — 10-day avg volume / 60-day avg volume
    regime_at_announce  — one-hot bull/sideways/bear (3 cols)

Label:
    y = 1 if actual_result == 'beat', else 0 (treat 'inline' as miss).

The builder tolerates missing features gracefully — imputes to sensible
defaults so early runs on thin data don't blow up.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


FEATURE_COLS: List[str] = [
    "hist_beat_rate_4q",
    "hist_beat_streak",
    "hist_avg_surprise",
    "sentiment_14d",
    "sentiment_volume",
    "analyst_tilt",
    "price_chg_30d",
    "rel_vol_10d",
    "regime_bull",
    "regime_sideways",
    "regime_bear",
]

FEATURE_DEFAULTS: Dict[str, float] = {
    "hist_beat_rate_4q": 0.5,
    "hist_beat_streak":  0.0,
    "hist_avg_surprise": 0.0,
    "sentiment_14d":     0.0,
    "sentiment_volume":  0.0,
    "analyst_tilt":      0.0,
    "price_chg_30d":     0.0,
    "rel_vol_10d":       1.0,
    "regime_bull":       0.0,
    "regime_sideways":   1.0,  # neutral default
    "regime_bear":       0.0,
}


# ---------------------------------------------------------------- helpers


def _history_from_yfinance(symbol: str) -> Tuple[float, float, float]:
    """Return (hist_beat_rate_4q, hist_beat_streak, hist_avg_surprise)
    from yfinance. ``(0.5, 0, 0)`` on any failure."""
    try:
        import yfinance as yf
        import numpy as np
        tk = symbol if symbol.endswith(".NS") else f"{symbol}.NS"
        hist = yf.Ticker(tk).earnings_history
        if hist is None or hist.empty:
            return 0.5, 0.0, 0.0
        df = hist.tail(4).dropna(subset=["epsActual", "epsEstimate"])
        if df.empty:
            return 0.5, 0.0, 0.0
        beats = (df["epsActual"] > df["epsEstimate"]).astype(int).values
        surprise = ((df["epsActual"] - df["epsEstimate"]) /
                    df["epsEstimate"].abs().clip(lower=1e-6)).values
        # Streak counts contiguous beats walking backwards.
        streak = 0
        for b in reversed(beats):
            if b == 1:
                streak += 1
            else:
                break
        return (float(beats.mean()),
                float(streak),
                float(np.nanmean(surprise)))
    except Exception as exc:
        logger.debug("yf earnings_history for %s failed: %s", symbol, exc)
        return 0.5, 0.0, 0.0


def _sentiment_window(
    sb, symbol: str, announce_date: date,
) -> Tuple[float, float]:
    """Weighted sentiment + log-scaled headline count in 14 days before."""
    try:
        import math
        start = (announce_date - timedelta(days=14)).isoformat()
        end = announce_date.isoformat()
        rows = (
            sb.table("news_sentiment")
            .select("mean_score, headline_count, trade_date")
            .eq("symbol", symbol.upper())
            .gte("trade_date", start)
            .lt("trade_date", end)
            .execute()
        )
        data = rows.data or []
        if not data:
            return 0.0, 0.0
        total = sum(int(r.get("headline_count") or 0) for r in data)
        if total <= 0:
            return 0.0, 0.0
        weighted = sum(
            float(r.get("mean_score") or 0) * int(r.get("headline_count") or 0)
            for r in data
        ) / total
        return max(-1.0, min(1.0, weighted)), float(math.log1p(total))
    except Exception:
        return 0.0, 0.0


def _analyst_tilt_yfinance(symbol: str) -> float:
    mapping = {
        "strong_buy": 0.10, "buy": 0.06, "hold": 0.0,
        "underperform": -0.04, "sell": -0.08, "strong_sell": -0.10,
    }
    try:
        import yfinance as yf
        tk = symbol if symbol.endswith(".NS") else f"{symbol}.NS"
        info = yf.Ticker(tk).info or {}
        return mapping.get((info.get("recommendationKey") or "").lower(), 0.0)
    except Exception:
        return 0.0


def _price_action_features(symbol: str, announce_date: date) -> Tuple[float, float]:
    """(price_chg_30d, rel_vol_10d). Falls back to (0, 1) on failure."""
    try:
        import yfinance as yf
        tk = symbol if symbol.endswith(".NS") else f"{symbol}.NS"
        start = (announce_date - timedelta(days=90)).isoformat()
        end = announce_date.isoformat()
        df = yf.Ticker(tk).history(start=start, end=end, interval="1d")
        if df is None or df.empty or len(df) < 30:
            return 0.0, 1.0
        df = df.dropna(subset=["Close"])
        close = df["Close"].astype(float).values
        vol = df["Volume"].astype(float).values if "Volume" in df.columns else None
        if len(close) < 30:
            return 0.0, 1.0
        chg = float((close[-1] - close[-30]) / close[-30] * 100)
        rv = 1.0
        if vol is not None and len(vol) >= 60:
            rv = float(vol[-10:].mean() / max(vol[-60:].mean(), 1.0))
        return chg, rv
    except Exception:
        return 0.0, 1.0


def _regime_one_hot(sb, announce_date: date) -> Tuple[float, float, float]:
    """Return (bull, sideways, bear) one-hot at announce date."""
    try:
        day = announce_date.isoformat()
        rows = (
            sb.table("regime_history")
            .select("regime, as_of")
            .lte("as_of", day)
            .order("as_of", desc=True)
            .limit(1)
            .execute()
        )
        if not rows.data:
            return 0.0, 1.0, 0.0
        regime = (rows.data[0].get("regime") or "sideways").lower()
        return (
            1.0 if regime == "bull" else 0.0,
            1.0 if regime == "sideways" else 0.0,
            1.0 if regime == "bear" else 0.0,
        )
    except Exception:
        return 0.0, 1.0, 0.0


# ---------------------------------------------------------------- builder


def build_features_for(
    symbol: str,
    announce_date: date,
    *,
    supabase_client=None,
) -> Dict[str, float]:
    """Assemble a single row of features. Safe to call at inference
    time — every input degrades to a default rather than raising."""
    if supabase_client is None:
        try:
            from ...core.database import get_supabase_admin
            supabase_client = get_supabase_admin()
        except Exception:
            supabase_client = None

    beat_rate, streak, avg_surp = _history_from_yfinance(symbol)
    if supabase_client is not None:
        senti, senti_vol = _sentiment_window(supabase_client, symbol, announce_date)
        regime_bull, regime_sideways, regime_bear = _regime_one_hot(supabase_client, announce_date)
    else:
        senti, senti_vol = 0.0, 0.0
        regime_bull, regime_sideways, regime_bear = 0.0, 1.0, 0.0

    tilt = _analyst_tilt_yfinance(symbol)
    price_chg, rel_vol = _price_action_features(symbol, announce_date)

    row = {
        "hist_beat_rate_4q": beat_rate,
        "hist_beat_streak":  streak,
        "hist_avg_surprise": avg_surp,
        "sentiment_14d":     senti,
        "sentiment_volume":  senti_vol,
        "analyst_tilt":      tilt,
        "price_chg_30d":     price_chg,
        "rel_vol_10d":       rel_vol,
        "regime_bull":       regime_bull,
        "regime_sideways":   regime_sideways,
        "regime_bear":       regime_bear,
    }
    # Fill any None/NaN with defaults.
    for k, default in FEATURE_DEFAULTS.items():
        if row.get(k) is None:
            row[k] = default
    return row


def build_feature_frame(
    *,
    supabase_client=None,
    min_rows: int = 50,
):
    """Assemble a labeled training frame from ``earnings_predictions``
    rows whose ``actual_result`` is populated. Returns (X_df, y_series,
    symbols_list). Raises ValueError when there aren't enough rows —
    callers should defer retraining until live data accumulates."""
    import pandas as pd

    if supabase_client is None:
        from ...core.database import get_supabase_admin
        supabase_client = get_supabase_admin()

    try:
        rows = (
            supabase_client.table("earnings_predictions")
            .select("symbol, announce_date, actual_result")
            .not_.is_("actual_result", "null")
            .limit(5000)
            .execute()
        )
        records = rows.data or []
    except Exception as exc:
        raise ValueError(f"earnings_predictions query failed: {exc}")

    if len(records) < min_rows:
        raise ValueError(
            f"Not enough labeled earnings rows yet ({len(records)} < {min_rows}). "
            f"Populate ``actual_result`` on historical rows before retraining."
        )

    feature_rows: List[Dict[str, Any]] = []
    labels: List[int] = []
    symbols: List[str] = []

    for r in records:
        try:
            sym = str(r["symbol"]).upper()
            ad = date.fromisoformat(str(r["announce_date"]))
            feats = build_features_for(sym, ad, supabase_client=supabase_client)
            feature_rows.append(feats)
            labels.append(1 if (r.get("actual_result") == "beat") else 0)
            symbols.append(sym)
        except Exception as exc:
            logger.debug("feature build skip %s: %s", r.get("symbol"), exc)

    X = pd.DataFrame(feature_rows, columns=FEATURE_COLS)
    y = pd.Series(labels, name="y")
    return X, y, symbols
