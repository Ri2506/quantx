"""
PRD Rule Engine - deterministic strategy triggers.
Implements 5 strategies for swing trading signals.
"""

from __future__ import annotations

from typing import Dict, List, Tuple
import pandas as pd


def _ema_crossover(df: pd.DataFrame) -> Tuple[bool, bool]:
    """EMA 9/21 crossover with volume confirmation."""
    if len(df) < 2:
        return False, False
    vol_ratio = df["volume_ratio"].iloc[-1]
    buy = (
        df["ema_9"].iloc[-2] < df["ema_21"].iloc[-2]
        and df["ema_9"].iloc[-1] > df["ema_21"].iloc[-1]
        and vol_ratio >= 1.2
    )
    sell = (
        df["ema_9"].iloc[-2] > df["ema_21"].iloc[-2]
        and df["ema_9"].iloc[-1] < df["ema_21"].iloc[-1]
        and vol_ratio >= 1.2
    )
    return buy, sell


def _rsi_divergence(df: pd.DataFrame) -> Tuple[bool, bool]:
    """Simple RSI divergence check over 5-day distance."""
    if len(df) < 6:
        return False, False
    close_now = df["close"].iloc[-1]
    close_prev = df["close"].iloc[-6]
    rsi_now = df["rsi_14"].iloc[-1]
    rsi_prev = df["rsi_14"].iloc[-6]
    buy = close_now < close_prev and rsi_now > rsi_prev and rsi_now < 40
    sell = close_now > close_prev and rsi_now < rsi_prev and rsi_now > 60
    return buy, sell


def _bollinger_squeeze(df: pd.DataFrame) -> Tuple[bool, bool]:
    """Bollinger squeeze + breakout confirmation."""
    if len(df) < 20:
        return False, False
    bandwidth = df["bb_bandwidth"]
    is_squeeze = bandwidth.iloc[-1] <= bandwidth.rolling(20).min().iloc[-1]
    obv_slope = df["obv_slope_10"].iloc[-1]
    close = df["close"].iloc[-1]
    buy = is_squeeze and close > df["bb_upper"].iloc[-1] and obv_slope > 0
    sell = is_squeeze and close < df["bb_lower"].iloc[-1] and obv_slope < 0
    return buy, sell


def _vwap_momentum(df: pd.DataFrame) -> Tuple[bool, bool]:
    """VWAP momentum with volume spike for 2 candles."""
    if len(df) < 3:
        return False, False
    vol_ratio = df["volume_ratio"].iloc[-1]
    buy = (
        df["close"].iloc[-1] > df["vwap"].iloc[-1]
        and df["close"].iloc[-2] > df["vwap"].iloc[-2]
        and vol_ratio >= 1.5
    )
    sell = (
        df["close"].iloc[-1] < df["vwap"].iloc[-1]
        and df["close"].iloc[-2] < df["vwap"].iloc[-2]
        and vol_ratio >= 1.5
    )
    return buy, sell


def _macd_zero_cross(df: pd.DataFrame) -> Tuple[bool, bool]:
    """MACD zero cross with histogram confirmation."""
    if len(df) < 2:
        return False, False
    macd_now = df["macd"].iloc[-1]
    macd_prev = df["macd"].iloc[-2]
    hist = df["macd_hist"].iloc[-1]
    signal = df["macd_signal"].iloc[-1]
    buy = macd_prev <= 0 < macd_now and hist > 0 and macd_now > signal
    sell = macd_prev >= 0 > macd_now and hist < 0 and macd_now < signal
    return buy, sell


def evaluate_strategies(df: pd.DataFrame) -> Dict[str, str]:
    """
    Returns dict of strategy_name -> direction (BUY/SELL)
    """
    strategies: Dict[str, str] = {}

    buy, sell = _ema_crossover(df)
    if buy:
        strategies["EMA_CROSSOVER"] = "BUY"
    if sell:
        strategies["EMA_CROSSOVER"] = "SELL"

    buy, sell = _rsi_divergence(df)
    if buy:
        strategies["RSI_DIVERGENCE"] = "BUY"
    if sell:
        strategies["RSI_DIVERGENCE"] = "SELL"

    buy, sell = _bollinger_squeeze(df)
    if buy:
        strategies["BOLLINGER_SQUEEZE"] = "BUY"
    if sell:
        strategies["BOLLINGER_SQUEEZE"] = "SELL"

    buy, sell = _vwap_momentum(df)
    if buy:
        strategies["VWAP_MOMENTUM"] = "BUY"
    if sell:
        strategies["VWAP_MOMENTUM"] = "SELL"

    buy, sell = _macd_zero_cross(df)
    if buy:
        strategies["MACD_ZERO_CROSS"] = "BUY"
    if sell:
        strategies["MACD_ZERO_CROSS"] = "SELL"

    return strategies


def summarize_signal(strategies: Dict[str, str]) -> Tuple[str, List[str]]:
    """Resolve BUY vs SELL conflicts and return direction + strategy list."""
    if not strategies:
        return "NEUTRAL", []
    buys = [k for k, v in strategies.items() if v == "BUY"]
    sells = [k for k, v in strategies.items() if v == "SELL"]
    if len(buys) > len(sells):
        return "LONG", buys
    if len(sells) > len(buys):
        return "SHORT", sells
    # tie -> neutral to avoid conflict
    return "NEUTRAL", []

