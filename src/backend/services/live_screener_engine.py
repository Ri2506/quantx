"""
================================================================================
SWING AI LIVE SCREENER ENGINE
================================================================================
Real Kite Connect-based screening with 50+ scanners.

Pipeline:
  1. UniverseScreener fetches NSE symbol list (cached 1h)
  2. Kite Connect historical data fetches 6-month OHLCV
  3. compute_all_indicators() from ml/features computes 40+ indicators
  4. Per-scanner filter functions applied to summary DataFrame
  5. Results formatted to match frontend API contract

All scanner results cached for 5 minutes to avoid re-downloading.
================================================================================
"""

import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import ta

logger = logging.getLogger(__name__)

# Add project root to path for ml imports
ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from ml.features.indicators import compute_all_indicators, detect_support_resistance, detect_fibonacci_levels

# ============================================================================
# SCANNER MENU — complete scanner definitions for Swing AI Screener
# ============================================================================
SCANNER_MENU = {
    "exchanges": {
        "N": "NSE (All NSE Stocks)",
        "B": "BSE (All BSE Stocks)",
        "S": "NSE Nifty 50",
        "J": "NSE Nifty Next 50",
        "W": "NSE Nifty 100",
        "E": "NSE Nifty 200",
        "Q": "NSE Nifty 500",
        "Z": "NSE Nifty Midcap 50",
        "F": "NSE Nifty F&O Stocks",
        "G": "NSE Sectoral Indices",
    },
    "scan_types": {
        "X": {
            "name": "Scanners",
            "description": "50+ Professional Stock Scanners",
            "submenu": {
                # Breakout Scanners (0-10)
                0: {"name": "Full Screening", "description": "All patterns, indicators & breakouts"},
                1: {"name": "Breakout (Consolidation)", "description": "Stocks breaking out of consolidation zones"},
                2: {"name": "Top Gainers", "description": "Today's top gainers (>2%)"},
                3: {"name": "Top Losers", "description": "Today's top losers (>2%)"},
                4: {"name": "Volume Breakout", "description": "Unusual volume with price breakout"},
                5: {"name": "52 Week High", "description": "Stocks at 52-week high"},
                6: {"name": "10 Day High", "description": "Stocks at 10-day high"},
                7: {"name": "52 Week Low", "description": "Stocks at 52-week low (reversal potential)"},
                8: {"name": "Volume Surge", "description": "Volume > 2.5x average"},
                9: {"name": "RSI Oversold", "description": "RSI < 30 (potential bounce)"},
                10: {"name": "RSI Overbought", "description": "RSI > 70 (momentum stocks)"},
                # Moving Average Strategies (11-15)
                11: {"name": "Short-term MA Crossover", "description": "Price crossed 20 EMA"},
                12: {"name": "Bullish Engulfing", "description": "Bullish engulfing candlestick"},
                13: {"name": "Bearish Engulfing", "description": "Bearish engulfing pattern"},
                14: {"name": "VCP (Volatility Contraction)", "description": "Mark Minervini VCP pattern"},
                15: {"name": "Bull Crossover", "description": "20 EMA crossing 50 EMA"},
                # Advanced Patterns (16-25)
                16: {"name": "IPO Base Breakout", "description": "Recent IPOs breaking out"},
                17: {"name": "Bull Momentum", "description": "Strong bullish momentum"},
                18: {"name": "ATR Trailing", "description": "ATR-based trailing stops"},
                19: {"name": "PSar Reversal", "description": "Parabolic SAR reversal signal"},
                20: {"name": "ORB (Opening Range)", "description": "Opening Range Breakout (requires intraday data)"},
                21: {"name": "NR4 Pattern", "description": "Narrow Range 4-day pattern"},
                22: {"name": "NR7 Pattern", "description": "Narrow Range 7-day pattern"},
                23: {"name": "Cup & Handle", "description": "Cup and Handle pattern"},
                24: {"name": "Double Bottom", "description": "Double bottom reversal"},
                25: {"name": "Inverse Head & Shoulders", "description": "Inverse Head & Shoulders pattern"},
                # Momentum & Trend (26-35)
                26: {"name": "MACD Crossover", "description": "MACD bullish crossover"},
                27: {"name": "MACD Bearish", "description": "MACD bearish crossover"},
                28: {"name": "Inside Bar", "description": "Inside bar pattern (NR)"},
                29: {"name": "TTM Squeeze", "description": "TTM Squeeze indicator"},
                30: {"name": "Momentum Burst", "description": "Sudden momentum increase"},
                31: {"name": "Trend Template", "description": "Mark Minervini trend template"},
                32: {"name": "Super Trend", "description": "Super Trend indicator signal"},
                33: {"name": "Pivot Breakout", "description": "Breaking above pivot levels"},
                34: {"name": "Delivery %", "description": "High delivery percentage (>50%) — institutional interest"},
                35: {"name": "Bulk Deals", "description": "Recent bulk/block deals"},
                # Smart Money & F&O (36-42)
                36: {"name": "FII Net Buyers", "description": "Stocks with FII net buying"},
                37: {"name": "DII Net Buyers", "description": "Stocks with DII net buying"},
                38: {"name": "FII+DII Positive", "description": "Combined institutional buying"},
                39: {"name": "OI Analysis", "description": "Open Interest analysis for F&O"},
                40: {"name": "Long Buildup", "description": "F&O Long buildup (price up + OI up)"},
                41: {"name": "Short Buildup", "description": "F&O Short buildup (price down + OI up)"},
                42: {"name": "Short Covering", "description": "F&O Short covering (price up + OI down)"},
                # Custom chart pattern scanners (43-51) — ml/features/patterns.py
                43: {"name": "Ascending Triangle", "description": "Ascending triangle consolidation pattern"},
                44: {"name": "Symmetrical Triangle", "description": "Symmetrical triangle consolidation pattern"},
                45: {"name": "Falling Wedge", "description": "Falling wedge reversal/continuation pattern"},
                46: {"name": "Bull Flag", "description": "Bull flag continuation pattern"},
                47: {"name": "Triple Bottom", "description": "Triple bottom reversal pattern"},
                48: {"name": "High & Tight Flag", "description": "High & tight flag momentum pattern"},
                49: {"name": "Bull Pennant", "description": "Bull pennant continuation pattern"},
                50: {"name": "Horizontal Channel", "description": "Horizontal channel breakout pattern"},
                51: {"name": "All Chart Patterns", "description": "Run all pattern scanners at once"},
            },
        },
        "C": {
            "name": "Nifty Prediction (AI/ML)",
            "description": "AI-powered Nifty index prediction",
            "features": [
                "HMM Regime Detector (bull/bear/sideways)",
                "LightGBM signal classifier",
                "TFT 5-bar price forecaster",
                "Support/Resistance from real pivots",
            ],
        },
        "M": {
            "name": "ML Signals",
            "description": "Machine Learning based trading signals",
            "features": [
                "RandomForest breakout meta-labeler",
                "LightGBM 3-class signal gate",
                "QuantAI stock ranker",
                "Ensemble meta-learner",
            ],
        },
        "T": {
            "name": "Trend Forecast",
            "description": "Multi-timeframe trend forecasting",
            "features": [
                "Intraday / Short-term / Medium-term analysis",
                "RSI + MACD + SMA confluence",
                "ATR-based target estimation",
            ],
        },
    },
}


# =============================================================================
# STOCK METADATA (name + sector for ~200 NSE stocks)
# =============================================================================

NSE_STOCK_INFO: Dict[str, Dict[str, str]] = {
    # Nifty 50
    "RELIANCE": {"name": "Reliance Industries", "sector": "Energy"},
    "TCS": {"name": "Tata Consultancy Services", "sector": "IT"},
    "HDFCBANK": {"name": "HDFC Bank", "sector": "Banking"},
    "INFY": {"name": "Infosys", "sector": "IT"},
    "ICICIBANK": {"name": "ICICI Bank", "sector": "Banking"},
    "HINDUNILVR": {"name": "Hindustan Unilever", "sector": "FMCG"},
    "SBIN": {"name": "State Bank of India", "sector": "Banking"},
    "BHARTIARTL": {"name": "Bharti Airtel", "sector": "Telecom"},
    "KOTAKBANK": {"name": "Kotak Mahindra Bank", "sector": "Banking"},
    "ITC": {"name": "ITC Limited", "sector": "FMCG"},
    "LT": {"name": "Larsen & Toubro", "sector": "Infrastructure"},
    "AXISBANK": {"name": "Axis Bank", "sector": "Banking"},
    "ASIANPAINT": {"name": "Asian Paints", "sector": "Paints"},
    "MARUTI": {"name": "Maruti Suzuki", "sector": "Auto"},
    "TITAN": {"name": "Titan Company", "sector": "Consumer"},
    "BAJFINANCE": {"name": "Bajaj Finance", "sector": "NBFC"},
    "WIPRO": {"name": "Wipro", "sector": "IT"},
    "ONGC": {"name": "Oil & Natural Gas Corp", "sector": "Energy"},
    "NTPC": {"name": "NTPC Limited", "sector": "Power"},
    "POWERGRID": {"name": "Power Grid Corp", "sector": "Power"},
    "SUNPHARMA": {"name": "Sun Pharmaceutical", "sector": "Pharma"},
    "ULTRACEMCO": {"name": "UltraTech Cement", "sector": "Cement"},
    "TATAMOTORS": {"name": "Tata Motors", "sector": "Auto"},
    "NESTLEIND": {"name": "Nestle India", "sector": "FMCG"},
    "TECHM": {"name": "Tech Mahindra", "sector": "IT"},
    "M&M": {"name": "Mahindra & Mahindra", "sector": "Auto"},
    "HCLTECH": {"name": "HCL Technologies", "sector": "IT"},
    "BAJAJFINSV": {"name": "Bajaj Finserv", "sector": "NBFC"},
    "ADANIENT": {"name": "Adani Enterprises", "sector": "Infra"},
    "ADANIPORTS": {"name": "Adani Ports", "sector": "Ports"},
    # Nifty Next 50
    "DIVISLAB": {"name": "Divi's Laboratories", "sector": "Pharma"},
    "DRREDDY": {"name": "Dr. Reddy's Labs", "sector": "Pharma"},
    "CIPLA": {"name": "Cipla", "sector": "Pharma"},
    "GRASIM": {"name": "Grasim Industries", "sector": "Diversified"},
    "BRITANNIA": {"name": "Britannia Industries", "sector": "FMCG"},
    "HINDALCO": {"name": "Hindalco Industries", "sector": "Metals"},
    "JSWSTEEL": {"name": "JSW Steel", "sector": "Steel"},
    "TATASTEEL": {"name": "Tata Steel", "sector": "Steel"},
    "COALINDIA": {"name": "Coal India", "sector": "Mining"},
    "INDUSINDBK": {"name": "IndusInd Bank", "sector": "Banking"},
    "BPCL": {"name": "Bharat Petroleum", "sector": "Energy"},
    "EICHERMOT": {"name": "Eicher Motors", "sector": "Auto"},
    "HEROMOTOCO": {"name": "Hero MotoCorp", "sector": "Auto"},
    "BAJAJ-AUTO": {"name": "Bajaj Auto", "sector": "Auto"},
    "TATACONSUM": {"name": "Tata Consumer", "sector": "FMCG"},
    "SHRIRAMFIN": {"name": "Shriram Finance", "sector": "NBFC"},
    "APOLLOHOSP": {"name": "Apollo Hospitals", "sector": "Healthcare"},
    "LTIM": {"name": "LTIMindtree", "sector": "IT"},
    "HAL": {"name": "Hindustan Aeronautics", "sector": "Defence"},
    "BEL": {"name": "Bharat Electronics", "sector": "Defence"},
    # Midcap & Smallcap
    "TRENT": {"name": "Trent Limited", "sector": "Retail"},
    "PERSISTENT": {"name": "Persistent Systems", "sector": "IT"},
    "POLYCAB": {"name": "Polycab India", "sector": "Cables"},
    "DIXON": {"name": "Dixon Technologies", "sector": "Electronics"},
    "COFORGE": {"name": "Coforge", "sector": "IT"},
    "MUTHOOTFIN": {"name": "Muthoot Finance", "sector": "NBFC"},
    "ASTRAL": {"name": "Astral Ltd", "sector": "Pipes"},
    "PIIND": {"name": "PI Industries", "sector": "Chemicals"},
    "DEEPAKNTR": {"name": "Deepak Nitrite", "sector": "Chemicals"},
    "ANGELONE": {"name": "Angel One", "sector": "Broking"},
    "HAPPSTMNDS": {"name": "Happiest Minds", "sector": "IT"},
    "TANLA": {"name": "Tanla Platforms", "sector": "IT"},
    "ZOMATO": {"name": "Zomato", "sector": "Food Tech"},
    "DELHIVERY": {"name": "Delhivery", "sector": "Logistics"},
    "IRCTC": {"name": "IRCTC", "sector": "Travel"},
    "IRFC": {"name": "IRFC", "sector": "Finance"},
    "DLF": {"name": "DLF Limited", "sector": "Real Estate"},
    "GODREJPROP": {"name": "Godrej Properties", "sector": "Real Estate"},
    "OBEROIRLTY": {"name": "Oberoi Realty", "sector": "Real Estate"},
    "CHOLAFIN": {"name": "Cholamandalam Finance", "sector": "NBFC"},
    "MFSL": {"name": "Max Financial Services", "sector": "Insurance"},
    "SBICARD": {"name": "SBI Cards", "sector": "Finance"},
    "CANBK": {"name": "Canara Bank", "sector": "Banking"},
    "PNB": {"name": "Punjab National Bank", "sector": "Banking"},
    "BANKBARODA": {"name": "Bank of Baroda", "sector": "Banking"},
    "NHPC": {"name": "NHPC Limited", "sector": "Power"},
    "SJVN": {"name": "SJVN Limited", "sector": "Power"},
    "RECLTD": {"name": "REC Limited", "sector": "Power"},
    "PFC": {"name": "Power Finance Corp", "sector": "Power"},
    "GAIL": {"name": "GAIL India", "sector": "Gas"},
    "NMDC": {"name": "NMDC Limited", "sector": "Mining"},
    "SAIL": {"name": "Steel Authority", "sector": "Steel"},
    "VEDL": {"name": "Vedanta", "sector": "Metals"},
    "JINDALSTEL": {"name": "Jindal Steel", "sector": "Steel"},
    "LUPIN": {"name": "Lupin", "sector": "Pharma"},
    "AUROPHARMA": {"name": "Aurobindo Pharma", "sector": "Pharma"},
    "BIOCON": {"name": "Biocon", "sector": "Pharma"},
    "DABUR": {"name": "Dabur India", "sector": "FMCG"},
    "MARICO": {"name": "Marico Limited", "sector": "FMCG"},
    "COLPAL": {"name": "Colgate Palmolive", "sector": "FMCG"},
    "GODREJCP": {"name": "Godrej Consumer", "sector": "FMCG"},
    "HAVELLS": {"name": "Havells India", "sector": "Electricals"},
    "VOLTAS": {"name": "Voltas", "sector": "Consumer Durables"},
    "CROMPTON": {"name": "Crompton Greaves", "sector": "Electricals"},
    "PIDILITIND": {"name": "Pidilite Industries", "sector": "Chemicals"},
    "SRF": {"name": "SRF Limited", "sector": "Chemicals"},
    "SIEMENS": {"name": "Siemens India", "sector": "Capital Goods"},
    "ABB": {"name": "ABB India", "sector": "Capital Goods"},
    "INDIGO": {"name": "InterGlobe Aviation", "sector": "Aviation"},
    "PAGEIND": {"name": "Page Industries", "sector": "Textiles"},
    "MPHASIS": {"name": "Mphasis", "sector": "IT"},
    "KPITTECH": {"name": "KPIT Technologies", "sector": "IT"},
    "OFSS": {"name": "Oracle Financial", "sector": "IT"},
    "NAUKRI": {"name": "Info Edge", "sector": "Internet"},
}


# =============================================================================
# SCANNER FILTER FUNCTIONS
# =============================================================================

def _filter_full_screening(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 0: Full screening - all stocks with decent volume"""
    return df[df['volume_ratio'] > 0.5].sort_values('change_pct', ascending=False)


def _filter_breakout_consolidation(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 1: Breakout from consolidation - low ATR + volume surge"""
    atr_pct = df['atr_14'] / df['close']
    return df[
        (atr_pct < 0.025) &  # Low volatility (consolidation)
        (df['volume_ratio'] > 1.5) &  # Volume surge
        (df['close'] > df['sma_20']) &  # Above 20 SMA
        (df['change_pct'] > 0.5)  # Positive day
    ].sort_values('volume_ratio', ascending=False)


def _filter_top_gainers(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 2: Top gainers (>2%)"""
    return df[df['change_pct'] > 2.0].sort_values('change_pct', ascending=False)


def _filter_top_losers(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 3: Top losers (<-2%)"""
    return df[df['change_pct'] < -2.0].sort_values('change_pct', ascending=True)


def _filter_volume_breakout(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 4: Volume breakout"""
    return df[
        (df['volume_ratio'] > 2.0) &
        (df['change_pct'] > 1.0)
    ].sort_values('volume_ratio', ascending=False)


def _filter_52w_high(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 5: At/near 52-week high"""
    return df[df['close'] >= df['high_52w'] * 0.98].sort_values('change_pct', ascending=False)


def _filter_10d_high(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 6: At 10-day high"""
    return df[df['close'] >= df['high_10d'] * 0.99].sort_values('change_pct', ascending=False)


def _filter_52w_low(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 7: Near 52-week low (reversal potential)"""
    return df[df['close'] <= df['low_52w'] * 1.05].sort_values('change_pct', ascending=False)


def _filter_volume_surge(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 8: Volume > 2.5x average"""
    return df[df['volume_ratio'] > 2.5].sort_values('volume_ratio', ascending=False)


def _filter_rsi_oversold(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 9: RSI < 30"""
    return df[df['rsi_14'] < 30].sort_values('rsi_14', ascending=True)


def _filter_rsi_overbought(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 10: RSI > 70"""
    return df[df['rsi_14'] > 70].sort_values('rsi_14', ascending=False)


def _filter_ma_crossover(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 11: Price near/crossing 20 EMA"""
    pct_from_ema = abs(df['close'] - df['ema_21']) / df['close']
    return df[
        (df['close'] > df['ema_21']) &
        (pct_from_ema < 0.02)  # Within 2% of EMA
    ].sort_values('change_pct', ascending=False)


def _filter_bullish_engulfing(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 12: Bullish engulfing pattern"""
    col = 'candle_engulfing_bull'
    if col not in df.columns:
        return pd.DataFrame()
    return df[df[col] == True].sort_values('change_pct', ascending=False)


def _filter_bearish_engulfing(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 13: Bearish engulfing pattern"""
    col = 'candle_engulfing_bear'
    if col not in df.columns:
        return pd.DataFrame()
    return df[df[col] == True].sort_values('change_pct', ascending=True)


def _filter_vcp(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 14: VCP (Volatility Contraction Pattern)"""
    atr_pct = df['atr_14'] / df['close']
    return df[
        (atr_pct < 0.02) &  # Low volatility
        (df['volume_ratio'] < 0.8) &  # Declining volume
        (df['close'] > df['sma_50']) &  # Above 50 SMA
        (abs(df['close'] - df['sma_20']) / df['close'] < 0.03)  # Tight consolidation
    ].sort_values('close', ascending=False)


def _filter_bull_cross(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 15: 20 EMA crossing above 50 SMA"""
    ema_above = df['ema_21'] > df['sma_50']
    close_cross = abs(df['ema_21'] - df['sma_50']) / df['sma_50'] < 0.01
    return df[ema_above & close_cross].sort_values('change_pct', ascending=False)


def _filter_bull_momentum(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 17: Strong bullish momentum"""
    return df[
        (df['rsi_14'] > 55) &
        (df['macd'] > df['macd_signal']) &
        (df['close'] > df['ema_21']) &
        (df['adx'] > 20) &
        (df['change_pct'] > 0)
    ].sort_values('rsi_14', ascending=False)


def _filter_atr_trailing(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 18: Price above ATR trailing stop"""
    if 'atr_trailing_stop' not in df.columns:
        return pd.DataFrame()
    return df[
        (df['close'] > df['atr_trailing_stop']) &
        (df['close'] > df['sma_50']) &
        (df['change_pct'] > 0)
    ].sort_values('change_pct', ascending=False)


def _filter_psar_reversal(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 19: Parabolic SAR bullish reversal"""
    if 'psar_bullish' not in df.columns:
        return pd.DataFrame()
    return df[df['psar_bullish'] == True].sort_values('change_pct', ascending=False)


def _filter_nr4(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 21: NR4 pattern"""
    if 'nr4' not in df.columns:
        return pd.DataFrame()
    return df[df['nr4'] == True].sort_values('volume_ratio', ascending=False)


def _filter_nr7(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 22: NR7 pattern"""
    if 'nr7' not in df.columns:
        return pd.DataFrame()
    return df[df['nr7'] == True].sort_values('volume_ratio', ascending=False)


def _filter_macd_crossover(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 26: MACD bullish crossover"""
    return df[
        (df['macd'] > df['macd_signal']) &
        (df['macd_hist'] > 0) &
        (df['macd_hist'] < abs(df['macd_signal']) * 0.15)  # Recent cross
    ].sort_values('macd_hist', ascending=True)


def _filter_macd_bearish(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 27: MACD bearish crossover"""
    return df[
        (df['macd'] < df['macd_signal']) &
        (df['macd_hist'] < 0)
    ].sort_values('macd_hist', ascending=True)


def _filter_inside_bar(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 28: Inside bar pattern"""
    if 'inside_bar' not in df.columns:
        return pd.DataFrame()
    return df[df['inside_bar'] == True].sort_values('volume_ratio', ascending=False)


def _filter_ttm_squeeze(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 29: TTM Squeeze (BB inside KC)"""
    if 'ttm_squeeze' not in df.columns:
        return pd.DataFrame()
    return df[df['ttm_squeeze'] == True].sort_values('volume_ratio', ascending=False)


def _filter_momentum_burst(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 30: Sudden momentum increase"""
    return df[
        (df['change_pct'] > 3.0) &
        (df['volume_ratio'] > 2.0) &
        (df['rsi_14'] > 50)
    ].sort_values('change_pct', ascending=False)


def _filter_trend_template(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 31: Minervini Trend Template"""
    within_25_of_high = df['close'] >= df['high_52w'] * 0.75
    above_25_of_low = df['close'] >= df['low_52w'] * 1.25
    return df[
        (df['close'] > df['sma_50']) &
        (df['sma_50'] > df['sma_200']) &
        (df['close'] > df['sma_200']) &
        within_25_of_high &
        above_25_of_low &
        (df['rsi_14'] > 50)
    ].sort_values('change_pct', ascending=False)


def _filter_supertrend(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 32: SuperTrend bullish signal"""
    if 'supertrend_direction' not in df.columns:
        return pd.DataFrame()
    return df[df['supertrend_direction'] == 1].sort_values('change_pct', ascending=False)


def _filter_pivot_breakout(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 33: Breaking above pivot R1"""
    if 'pivot_r1' not in df.columns:
        return pd.DataFrame()
    return df[df['close'] > df['pivot_r1']].sort_values('change_pct', ascending=False)


def _filter_high_tight_flag(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 48: High & Tight Flag — stock up 50%+ in 2 months with tight recent consolidation."""
    if df.empty or 'sma_50' not in df.columns:
        return pd.DataFrame()
    # Stock must be well above 50-day MA (strong prior run)
    strong_run = df[df['close'] > df['sma_50'] * 1.3].copy()
    if strong_run.empty:
        return pd.DataFrame()
    # Tight consolidation: low ATR relative to price (< 2% of close)
    if 'atr_14' in strong_run.columns:
        strong_run['atr_pct'] = strong_run['atr_14'] / strong_run['close'] * 100
        tight = strong_run[strong_run['atr_pct'] < 2.5]
        return tight.sort_values('change_pct', ascending=False).head(20)
    return strong_run.sort_values('change_pct', ascending=False).head(20)


# ---------------------------------------------------------------------------
# Scanners 34-42 — real NSE institutional data
# Uses NSEDataService for delivery %, FII/DII, bulk deals, F&O OI
# ---------------------------------------------------------------------------

def _filter_high_delivery(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 34: High delivery % — real NSE data."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        delivery_df = nse.get_delivery_data()
        if delivery_df.empty:
            return pd.DataFrame()
        # Filter for high delivery % (> 50% = institutional interest)
        high_del = delivery_df[delivery_df['delivery_pct'] > 50].copy()
        # Merge with our summary df for additional columns
        if not high_del.empty and not df.empty:
            merged = df[df.index.isin(high_del['symbol'])].copy()
            if not merged.empty:
                del_map = high_del.set_index('symbol')['delivery_pct'].to_dict()
                merged['delivery_pct'] = merged.index.map(lambda s: del_map.get(s, 0))
                return merged.sort_values('delivery_pct', ascending=False)
        return high_del.head(30)
    except Exception as e:
        logger.debug(f"Delivery scanner fallback: {e}")
        return pd.DataFrame()


def _filter_bulk_deals(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 35: Bulk/block deals — real NSE data."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        deals = nse.get_bulk_deals()
        if not deals:
            return pd.DataFrame()
        deal_symbols = list({d['symbol'] for d in deals if d.get('symbol')})
        if deal_symbols and not df.empty:
            return df[df.index.isin(deal_symbols)].sort_values('volume_ratio', ascending=False)
        return pd.DataFrame(deals).head(30)
    except Exception as e:
        logger.debug(f"Bulk deals scanner fallback: {e}")
        return pd.DataFrame()


def _filter_fii_net_buyers(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 36: FII net buyers — real NSE FII/DII data + volume/momentum filter.
    When FII net positive, show F&O stocks with bullish momentum."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        fii_dii = nse.get_fii_dii_activity()

        if fii_dii.get("fii_net", 0) <= 0:
            # FII selling today — show empty (no FII buying signal)
            return pd.DataFrame()

        # FII buying: show F&O stocks with volume surge + bullish structure
        if df.empty:
            return pd.DataFrame()
        return df[
            (df['volume_ratio'] > 1.5) &
            (df['change_pct'] > 0.5) &
            (df['close'] > df['sma_50']) &
            (df['rsi_14'] > 50)
        ].sort_values('volume_ratio', ascending=False).head(30)
    except Exception as e:
        logger.debug(f"FII scanner fallback: {e}")
        return pd.DataFrame()


def _filter_dii_net_buyers(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 37: DII net buyers — real NSE data + accumulation filter."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        fii_dii = nse.get_fii_dii_activity()

        if fii_dii.get("dii_net", 0) <= 0:
            return pd.DataFrame()

        if df.empty:
            return pd.DataFrame()
        return df[
            (df['volume_ratio'] > 1.2) &
            (df['close'] > df['sma_200']) &
            (df['change_pct'] > 0)
        ].sort_values('volume_ratio', ascending=False).head(30)
    except Exception as e:
        logger.debug(f"DII scanner fallback: {e}")
        return pd.DataFrame()


def _filter_institutional_combined(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 38: Combined FII+DII positive — real NSE data."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        fii_dii = nse.get_fii_dii_activity()

        fii_net = fii_dii.get("fii_net", 0)
        dii_net = fii_dii.get("dii_net", 0)

        if fii_net + dii_net <= 0:
            return pd.DataFrame()

        if df.empty:
            return pd.DataFrame()
        return df[
            (df['volume_ratio'] > 2.0) &
            (df['change_pct'] > 0.5) &
            (df['close'] > df['sma_50'])
        ].sort_values('volume_ratio', ascending=False).head(30)
    except Exception as e:
        logger.debug(f"Institutional combined scanner fallback: {e}")
        return pd.DataFrame()


def _filter_oi_analysis(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 39: OI analysis — real NSE F&O OI spurt data."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        oi_data = nse.get_participant_oi()
        spurts = oi_data.get("data", [])

        if not spurts:
            return pd.DataFrame()

        # Sort by absolute OI change %
        spurts_sorted = sorted(spurts, key=lambda x: abs(x.get("oi_change_pct", 0)), reverse=True)
        oi_symbols = [s['symbol'] for s in spurts_sorted[:30] if abs(s.get("oi_change_pct", 0)) > 5]

        if oi_symbols and not df.empty:
            return df[df.index.isin(oi_symbols)]
        return pd.DataFrame(spurts_sorted[:30])
    except Exception as e:
        logger.debug(f"OI scanner fallback: {e}")
        return pd.DataFrame()


def _filter_long_buildup(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 40: Long buildup — real NSE OI data (price up + OI up)."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        oi_data = nse.get_participant_oi()
        spurts = oi_data.get("data", [])

        if not spurts:
            return pd.DataFrame()

        # Long buildup: price up + OI increase
        long_symbols = [
            s['symbol'] for s in spurts
            if s.get("change_pct", 0) > 0.5 and s.get("oi_change_pct", 0) > 5
        ]

        if long_symbols and not df.empty:
            return df[df.index.isin(long_symbols)].sort_values('change_pct', ascending=False)
        return pd.DataFrame()
    except Exception as e:
        logger.debug(f"Long buildup scanner fallback: {e}")
        return pd.DataFrame()


def _filter_short_buildup(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 41: Short buildup — real NSE OI data (price down + OI up)."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        oi_data = nse.get_participant_oi()
        spurts = oi_data.get("data", [])

        if not spurts:
            return pd.DataFrame()

        # Short buildup: price down + OI increase
        short_symbols = [
            s['symbol'] for s in spurts
            if s.get("change_pct", 0) < -0.5 and s.get("oi_change_pct", 0) > 5
        ]

        if short_symbols and not df.empty:
            return df[df.index.isin(short_symbols)].sort_values('change_pct', ascending=True)
        return pd.DataFrame()
    except Exception as e:
        logger.debug(f"Short buildup scanner fallback: {e}")
        return pd.DataFrame()


def _filter_short_covering(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 42: Short covering — real NSE OI data (price up + OI down)."""
    try:
        from .nse_data import get_nse_data
        nse = get_nse_data()
        oi_data = nse.get_participant_oi()
        spurts = oi_data.get("data", [])

        if not spurts:
            return pd.DataFrame()

        # Short covering: price up + OI decrease
        cover_symbols = [
            s['symbol'] for s in spurts
            if s.get("change_pct", 0) > 1.0 and s.get("oi_change_pct", 0) < -5
        ]

        if cover_symbols and not df.empty:
            return df[df.index.isin(cover_symbols)].sort_values('change_pct', ascending=False)
        return pd.DataFrame()
    except Exception as e:
        logger.debug(f"Short covering scanner fallback: {e}")
        return pd.DataFrame()


def _filter_ipo_breakout(df: pd.DataFrame) -> pd.DataFrame:
    """Scanner 16: IPO breakout — stocks near 52W high with momentum."""
    if df.empty:
        return pd.DataFrame()
    return df[
        (df['close'] > df['high_52w'] * 0.95) &
        (df['volume_ratio'] > 2.0) &
        (df['change_pct'] > 1.0) &
        (df['rsi_14'] > 60)
    ].sort_values('change_pct', ascending=False)


def _filter_external_data_unavailable(df: pd.DataFrame) -> pd.DataFrame:
    """Scanners requiring intraday data (ORB etc.) — not available in EOD mode."""
    return pd.DataFrame()


# Map scanner ID to filter function
SCANNER_FILTERS: Dict[int, Callable] = {
    0: _filter_full_screening,
    1: _filter_breakout_consolidation,
    2: _filter_top_gainers,
    3: _filter_top_losers,
    4: _filter_volume_breakout,
    5: _filter_52w_high,
    6: _filter_10d_high,
    7: _filter_52w_low,
    8: _filter_volume_surge,
    9: _filter_rsi_oversold,
    10: _filter_rsi_overbought,
    11: _filter_ma_crossover,
    12: _filter_bullish_engulfing,
    13: _filter_bearish_engulfing,
    14: _filter_vcp,
    15: _filter_bull_cross,
    16: _filter_ipo_breakout,
    17: _filter_bull_momentum,
    18: _filter_atr_trailing,
    19: _filter_psar_reversal,
    20: _filter_external_data_unavailable,  # ORB - needs intraday data
    21: _filter_nr4,
    22: _filter_nr7,
    23: _filter_external_data_unavailable,  # Cup & Handle - handled separately
    24: _filter_external_data_unavailable,  # Double Bottom - handled separately
    25: _filter_external_data_unavailable,  # H&S - handled separately
    26: _filter_macd_crossover,
    27: _filter_macd_bearish,
    28: _filter_inside_bar,
    29: _filter_ttm_squeeze,
    30: _filter_momentum_burst,
    31: _filter_trend_template,
    32: _filter_supertrend,
    33: _filter_pivot_breakout,
    34: _filter_high_delivery,              # Delivery % — real NSE data
    35: _filter_bulk_deals,                 # Bulk deals — real NSE data
    36: _filter_fii_net_buyers,             # FII buying — real NSE data
    37: _filter_dii_net_buyers,             # DII buying — real NSE data
    38: _filter_institutional_combined,     # Combined institutional — real NSE data
    39: _filter_oi_analysis,                # OI analysis — real NSE data
    40: _filter_long_buildup,              # F&O Long buildup — real NSE data
    41: _filter_short_buildup,             # F&O Short buildup — real NSE data
    42: _filter_short_covering,            # F&O Short covering — real NSE data
    # Custom pattern scanners (43-50) - our ml/features/patterns.py
    43: _filter_external_data_unavailable,  # Ascending Triangle - handled separately
    44: _filter_external_data_unavailable,  # Symmetrical Triangle - handled separately
    45: _filter_external_data_unavailable,  # Falling Wedge - handled separately
    46: _filter_external_data_unavailable,  # Bull Flag - handled separately
    47: _filter_external_data_unavailable,  # Triple Bottom - handled separately
    48: _filter_high_tight_flag,            # High & Tight Flag - momentum filter
    49: _filter_external_data_unavailable,  # Bull Pennant - handled separately
    50: _filter_external_data_unavailable,  # Horizontal Channel - handled separately
    51: _filter_external_data_unavailable,  # All Chart Patterns - handled separately
}

# External data scanner IDs (return a message instead of empty)
EXTERNAL_DATA_SCANNERS = {20}  # Only ORB (intraday) truly needs external data

# Pattern scanners that need per-symbol DataFrame analysis
PATTERN_SCANNERS = {23, 24, 25, 43, 44, 45, 46, 47, 49, 50, 51}

# Pattern type mapping for custom scanners 43-50
_CONSOLIDATION_MAP = {
    43: "ascending_triangle",
    44: "symmetrical_triangle",
    45: "falling_wedge",
    46: "bull_flag",
    49: "bull_pennant",
    50: "horizontal_channel",
}
_CONSOLIDATION_LABELS = {
    43: "Ascending Triangle",
    44: "Symmetrical Triangle",
    45: "Falling Wedge",
    46: "Bull Flag",
    49: "Bull Pennant",
    50: "Horizontal Channel",
}
_REVERSAL_MAP = {
    23: "cup_and_handle",
    24: "double_bottom",
    25: "inverse_head_shoulders",
    47: "triple_bottom",
}
_REVERSAL_LABELS = {
    23: "Cup & Handle",
    24: "Double Bottom",
    25: "Inv Head & Shoulders",
    47: "Triple Bottom",
}


# =============================================================================
# LIVE SCREENER ENGINE
# =============================================================================

class LiveScreenerEngine:
    """
    Real-data screener engine.
    Uses Kite Connect + jugaad-data for market data.
    Pipeline: Kite data → compute_all_indicators → scanner filters → frontend JSON.
    """

    def __init__(self):
        from .universe_screener import UniverseScreener
        self._universe_screener = UniverseScreener()

        # Caches
        self._universe_cache: Optional[Tuple[List[str], datetime]] = None
        self._computed_cache: Optional[Tuple[pd.DataFrame, Dict[str, pd.DataFrame], datetime]] = None
        self._scanner_cache: Dict[str, Tuple[Dict, datetime]] = {}
        self._nifty_cache: Optional[Tuple[Dict, datetime]] = None

        self.CACHE_TTL = timedelta(minutes=5)
        self.UNIVERSE_CACHE_TTL = timedelta(hours=1)
        self.BATCH_SIZE = 200
        self.MIN_TRADING_DAYS = 20

        # Data provider
        self._data_source = "kite"

        self.screener_active = True
        logger.info(f"LiveScreenerEngine data source: {self._data_source}")

        # Project root is 4 levels up from src/backend/services/live_screener_engine.py
        import os
        self._project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

        # Model loading via registry compat (B2 first, disk fallback).
        from pathlib import Path as _Path
        try:
            from ..ai.registry import resolve_model_file as _resolve_model_file
        except ImportError:
            _resolve_model_file = None

        def _resolve(model_name: str, filename: str):
            disk = _Path(self._project_root) / "ml" / "models" / filename
            if _resolve_model_file is None:
                return str(disk) if disk.exists() else None
            resolved = _resolve_model_file(model_name, filename, disk)
            return str(resolved) if resolved else None

        # BreakoutMetaLabeler — PROD, Scanner Lab confidence tag.
        self._ml_labeler = None
        try:
            from ml.features.patterns import BreakoutMetaLabeler
            model_path = _resolve("breakout_meta_labeler", "breakout_meta_labeler.pkl")
            if model_path:
                labeler = BreakoutMetaLabeler()
                labeler.load(model_path)
                if labeler.is_trained:
                    self._ml_labeler = labeler
                    logger.info("ML breakout meta-labeler loaded successfully")
        except Exception as e:
            logger.debug(f"ML meta-labeler not loaded (patterns work without it): {e}")

        # HMM regime detector — PROD.
        self._regime_detector = None
        try:
            from ml.regime_detector import MarketRegimeDetector
            regime_path = _resolve("regime_hmm", "regime_hmm.pkl")
            if regime_path:
                detector = MarketRegimeDetector()
                detector.load(regime_path)
                if detector.is_trained:
                    self._regime_detector = detector
                    logger.info("HMM regime detector loaded for screener")
        except Exception as e:
            logger.debug(f"Regime detector not loaded: {e}")

        # LGBMGate — SHADOW (screener can still surface the probability).
        self._lgbm_gate = None
        try:
            from .model_registry import LGBMGate
            lgbm_path = _resolve("lgbm_signal_gate", "lgbm_signal_gate.txt")
            if lgbm_path:
                self._lgbm_gate = LGBMGate(lgbm_path)
                logger.info("LGBMGate loaded for screener (SHADOW)")
        except Exception as e:
            logger.debug(f"LGBMGate not loaded: {e}")

    # =========================================================================
    # UNIVERSE
    # =========================================================================

    def _get_universe(self) -> List[str]:
        """Get NSE symbol universe, cached for 1 hour."""
        if self._universe_cache:
            symbols, cached_at = self._universe_cache
            if datetime.now() - cached_at < self.UNIVERSE_CACHE_TTL:
                return symbols

        symbols = self._universe_screener._get_all_nse_symbols()
        if not symbols:
            # Fallback: hardcoded top stocks
            symbols = list(NSE_STOCK_INFO.keys())

        self._universe_cache = (symbols, datetime.now())
        logger.info(f"LiveScreener: loaded {len(symbols)} symbols")
        return symbols

    # =========================================================================
    # DATA PIPELINE
    # =========================================================================

    def _get_computed_data(self) -> Tuple[pd.DataFrame, Dict[str, pd.DataFrame]]:
        """
        Core data pipeline. Downloads OHLCV + computes all indicators.
        Uses Kite Connect + jugaad-data for market data.
        Returns (summary_df, per_symbol_dfs), cached for 5 minutes.
        """
        if self._computed_cache:
            summary_df, per_symbol_dfs, cached_at = self._computed_cache
            if datetime.now() - cached_at < self.CACHE_TTL and not summary_df.empty:
                return summary_df, per_symbol_dfs

        symbols = self._get_universe()
        if not symbols:
            return pd.DataFrame(), {}

        # Limit to manageable size for performance
        symbols = symbols[:500]

        # Fetch via Kite admin + jugaad-data
        per_symbol_dfs, summary_rows = self._fetch_via_kite(symbols)

        if not summary_rows:
            logger.warning("LiveScreener: no data computed")
            return pd.DataFrame(), {}

        summary_df = pd.DataFrame(summary_rows)
        self._computed_cache = (summary_df, per_symbol_dfs, datetime.now())
        logger.info(f"LiveScreener: computed indicators for {len(summary_df)} stocks via {self._data_source}")
        return summary_df, per_symbol_dfs

    def _fetch_via_kite(self, symbols: List[str]) -> Tuple[Dict[str, pd.DataFrame], List[Dict]]:
        """Fetch historical OHLCV from Kite Connect + compute indicators."""
        from .market_data import get_market_data_provider
        provider = get_market_data_provider()._get_kite_provider()

        per_symbol_dfs: Dict[str, pd.DataFrame] = {}
        summary_rows: List[Dict] = []
        total = len(symbols)
        processed = 0

        # Use batch fetch from Kite provider
        batch_data = provider.fetch_historical_batch(symbols, period='6mo')

        for symbol, df in batch_data.items():
            try:
                if df is None or df.empty or len(df) < 20:
                    continue

                # Ensure lowercase columns
                df.columns = [c.lower() for c in df.columns]

                # Compute indicators
                df = compute_all_indicators(df)
                per_symbol_dfs[symbol] = df

                # Build summary row using the full extraction method
                latest = df.iloc[-1]
                row = self._extract_summary_row(symbol, df, latest)
                if row:
                    summary_rows.append(row)
                else:
                    continue
                processed += 1
            except Exception as e:
                logger.debug(f"Kite fetch failed for {symbol}: {e}")
                continue

        logger.info(f"Kite: processed {processed}/{total} symbols")
        return per_symbol_dfs, summary_rows

    def _extract_summary_row(self, symbol: str, df: pd.DataFrame, last: pd.Series) -> Optional[Dict]:
        """Extract a summary row from the last bar of computed indicators."""
        try:
            close = float(last['close'])
            if close <= 0 or pd.isna(close):
                return None

            prev_close = float(last.get('prev_close', close))
            if pd.isna(prev_close) or prev_close <= 0:
                prev_close = close

            change_pct = float(last.get('change_pct', 0))
            if pd.isna(change_pct):
                change_pct = ((close - prev_close) / prev_close * 100) if prev_close > 0 else 0

            def safe_float(val, default=0.0):
                try:
                    v = float(val)
                    return default if pd.isna(v) else v
                except (TypeError, ValueError):
                    return default

            def safe_bool(val, default=False):
                try:
                    if pd.isna(val):
                        return default
                    return bool(val)
                except (TypeError, ValueError):
                    return default

            return {
                'symbol': symbol,
                'close': close,
                'open': safe_float(last.get('open', close)),
                'high': safe_float(last.get('high', close)),
                'low': safe_float(last.get('low', close)),
                'volume': safe_float(last.get('volume', 0)),
                'prev_close': prev_close,
                'change_pct': round(change_pct, 2),
                # Indicators
                'rsi_14': safe_float(last.get('rsi_14'), 50),
                'macd': safe_float(last.get('macd')),
                'macd_signal': safe_float(last.get('macd_signal')),
                'macd_hist': safe_float(last.get('macd_hist')),
                'ema_9': safe_float(last.get('ema_9')),
                'ema_21': safe_float(last.get('ema_21')),
                'ema_200': safe_float(last.get('ema_200')),
                'sma_20': safe_float(last.get('sma_20')),
                'sma_50': safe_float(last.get('sma_50')),
                'sma_200': safe_float(last.get('sma_200')),
                'adx': safe_float(last.get('adx')),
                'atr_14': safe_float(last.get('atr_14')),
                'bb_upper': safe_float(last.get('bb_upper')),
                'bb_lower': safe_float(last.get('bb_lower')),
                'volume_ratio': safe_float(last.get('volume_ratio'), 1.0),
                'golden_cross': safe_bool(last.get('golden_cross')),
                # Screener indicators
                'high_52w': safe_float(last.get('high_52w', close)),
                'low_52w': safe_float(last.get('low_52w', close)),
                'high_10d': safe_float(last.get('high_10d', close)),
                'low_10d': safe_float(last.get('low_10d', close)),
                'daily_range': safe_float(last.get('daily_range')),
                'nr4': safe_bool(last.get('nr4')),
                'nr7': safe_bool(last.get('nr7')),
                'inside_bar': safe_bool(last.get('inside_bar')),
                'pivot_r1': safe_float(last.get('pivot_r1')),
                'pivot_s1': safe_float(last.get('pivot_s1')),
                'supertrend_direction': safe_float(last.get('supertrend_direction'), 0),
                'psar_bullish': safe_bool(last.get('psar_bullish')),
                'ttm_squeeze': safe_bool(last.get('ttm_squeeze')),
                'atr_trailing_stop': safe_float(last.get('atr_trailing_stop')),
                # Candlestick patterns
                'candle_engulfing_bull': safe_bool(last.get('candle_engulfing_bull')),
                'candle_engulfing_bear': safe_bool(last.get('candle_engulfing_bear')),
                'candle_hammer': safe_bool(last.get('candle_hammer')),
                'candle_morning_star': safe_bool(last.get('candle_morning_star')),
                'candle_doji': safe_bool(last.get('candle_doji')),
            }
        except Exception as e:
            logger.debug(f"Summary extraction failed for {symbol}: {e}")
            return None

    # =========================================================================
    # SCANNER EXECUTION
    # =========================================================================

    async def run_scanner(
        self,
        scanner_id: int,
        exchange: str = "N",
        index: str = "12",
    ) -> Dict[str, Any]:
        """Run a specific scanner with real data."""
        scanner_info = SCANNER_MENU["scan_types"]["X"]["submenu"].get(scanner_id, {})

        # Check scanner result cache
        cache_key = f"scan_{exchange}_{index}_{scanner_id}"
        if cache_key in self._scanner_cache:
            cached_data, cached_at = self._scanner_cache[cache_key]
            if datetime.now() - cached_at < self.CACHE_TTL:
                return cached_data

        # External data scanners
        if scanner_id in EXTERNAL_DATA_SCANNERS:
            response = {
                "success": True,
                "scanner_id": scanner_id,
                "scanner_name": scanner_info.get("name", f"Scanner {scanner_id}"),
                "scanner_description": scanner_info.get("description", ""),
                "exchange": exchange,
                "timestamp": datetime.now().isoformat(),
                "source": "unavailable",
                "note": f"Scanner '{scanner_info.get('name', '')}' requires external data feed (FII/DII, OI, intraday). Coming soon.",
                "results": [],
                "count": 0,
            }
            self._scanner_cache[cache_key] = (response, datetime.now())
            return response

        # Get computed data (run in thread to avoid blocking event loop)
        import asyncio
        summary_df, per_symbol_dfs = await asyncio.to_thread(self._get_computed_data)

        if summary_df.empty:
            return {
                "success": False,
                "scanner_id": scanner_id,
                "error": "No market data available. Try again in a moment.",
                "results": [],
                "count": 0,
            }

        # Pattern scanners need per-symbol DataFrames
        if scanner_id in PATTERN_SCANNERS:
            results = self._run_pattern_scanner(scanner_id, summary_df, per_symbol_dfs)
        else:
            # Apply filter function
            filter_fn = SCANNER_FILTERS.get(scanner_id, _filter_full_screening)
            try:
                filtered = filter_fn(summary_df.copy())
            except Exception as e:
                logger.error(f"Scanner {scanner_id} filter error: {e}")
                filtered = pd.DataFrame()

            results = self._format_for_frontend(filtered, scanner_id)

        response = {
            "success": True,
            "scanner_id": scanner_id,
            "scanner_name": scanner_info.get("name", f"Scanner {scanner_id}"),
            "scanner_description": scanner_info.get("description", ""),
            "exchange": exchange,
            "timestamp": datetime.now().isoformat(),
            "source": "live",
            "data_provider": self._data_source,
            "results": results[:50],  # Cap at 50 results
            "count": min(len(results), 50),
        }
        self._scanner_cache[cache_key] = (response, datetime.now())
        return response

    def _run_pattern_scanner(
        self, scanner_id: int, summary_df: pd.DataFrame, per_symbol_dfs: Dict[str, pd.DataFrame]
    ) -> List[Dict]:
        """Run chart pattern detection on per-symbol DataFrames."""
        results = []

        # Determine which pattern type(s) to look for
        if scanner_id == 51:
            target_types = None  # all patterns
        elif scanner_id in _CONSOLIDATION_MAP:
            target_types = {_CONSOLIDATION_MAP[scanner_id]}
        elif scanner_id in _REVERSAL_MAP:
            target_types = {_REVERSAL_MAP[scanner_id]}
        elif scanner_id in (34, 35):
            target_types = None  # handled separately below
        else:
            target_types = None

        # Pre-filter symbols to reduce computation
        if scanner_id == 51:
            candidates = summary_df['symbol'].tolist()[:100]
        elif scanner_id in (23, 34):
            candidates = summary_df[
                (summary_df['close'] > summary_df['sma_50']) &
                (summary_df['rsi_14'] > 40)
            ]['symbol'].tolist()
        elif scanner_id == 24:
            candidates = summary_df[
                (summary_df['rsi_14'] < 50)
            ]['symbol'].tolist()
        elif scanner_id == 25:
            candidates = summary_df[
                (summary_df['close'] < summary_df['sma_50'])
            ]['symbol'].tolist()
        elif scanner_id in _CONSOLIDATION_MAP:
            candidates = summary_df[
                (summary_df['rsi_14'].between(35, 65))
            ]['symbol'].tolist()
        elif scanner_id in _REVERSAL_MAP:
            candidates = summary_df['symbol'].tolist()[:100]
        else:
            candidates = summary_df['symbol'].tolist()[:100]

        for symbol in candidates[:100]:
            if symbol not in per_symbol_dfs:
                continue
            df = per_symbol_dfs[symbol]
            if len(df) < 60:
                continue

            try:
                # --- Fibonacci (34) ---
                if scanner_id == 34:
                    fib = detect_fibonacci_levels(df)
                    if fib and fib.get('levels'):
                        close_price = float(df['close'].iloc[-1])
                        fib_618 = fib['levels'].get(0.618, 0)
                        fib_382 = fib['levels'].get(0.382, 0)
                        near_fib = (
                            abs(close_price - fib_618) / close_price < 0.02 or
                            abs(close_price - fib_382) / close_price < 0.02
                        )
                        if near_fib:
                            row = summary_df[summary_df['symbol'] == symbol].iloc[0]
                            result = self._format_stock_result(row, scanner_id, "Near Fibonacci")
                            results.append(result)

                # --- Supply/Demand (35) ---
                elif scanner_id == 35:
                    support_levels, resistance_levels = detect_support_resistance(df)
                    if support_levels and resistance_levels:
                        close_price = float(df['close'].iloc[-1])
                        near_support = any(
                            abs(close_price - lvl) / close_price < 0.02
                            for lvl in support_levels[:3]
                        )
                        near_resistance = any(
                            abs(close_price - lvl) / close_price < 0.02
                            for lvl in resistance_levels[:3]
                        )
                        if near_support or near_resistance:
                            zone_type = "Near Support" if near_support else "Near Resistance"
                            row = summary_df[summary_df['symbol'] == symbol].iloc[0]
                            result = self._format_stock_result(row, scanner_id, zone_type)
                            results.append(result)

                # --- All chart patterns (23-25, 43-51) via scan_all_patterns() ---
                else:
                    from ml.features.patterns import scan_all_patterns
                    signals = scan_all_patterns(
                        df, lookback=250, interval='1d',
                        ml_labeler=self._ml_labeler,
                        ml_threshold=0.35,
                    )
                    for sig in signals:
                        ptype = sig.pattern.pattern_type
                        if target_types is not None and ptype not in target_types:
                            continue
                        row = summary_df[summary_df['symbol'] == symbol].iloc[0]
                        result = self._format_pattern_signal(row, sig, scanner_id)
                        results.append(result)
                        if target_types is not None and len(target_types) == 1:
                            break  # one match per stock for single-pattern scanners

            except Exception as e:
                logger.debug(f"Pattern detection failed for {symbol}: {e}")
                continue

        return results

    # =========================================================================
    # FORMATTING
    # =========================================================================

    def _format_for_frontend(self, df: pd.DataFrame, scanner_id: int) -> List[Dict]:
        """Convert filtered DataFrame to frontend-expected JSON format."""
        if df.empty:
            return []

        results = []
        for _, row in df.head(50).iterrows():
            result = self._format_stock_result(row, scanner_id)
            results.append(result)
        return results

    def _format_stock_result(self, row, scanner_id: int, pattern_override: str = None) -> Dict:
        """Format a single stock result for the frontend."""
        symbol = row['symbol'] if isinstance(row, dict) else row.get('symbol', '')
        info = NSE_STOCK_INFO.get(symbol, {})
        close = float(row.get('close', 0))
        atr = float(row.get('atr_14', close * 0.02))

        return {
            "symbol": symbol,
            "name": info.get("name", symbol),
            "sector": info.get("sector", ""),
            "ltp": round(close, 2),
            "change_pct": round(float(row.get('change_pct', 0)), 2),
            "volume": f"{float(row.get('volume_ratio', 1.0)):.1f}x",
            "volume_ratio": round(float(row.get('volume_ratio', 1.0)), 2),
            "volume_raw": int(float(row.get('volume', 0))),
            "rsi": round(float(row.get('rsi_14', 50))),
            "trend": self._classify_trend(row),
            "pattern": pattern_override or self._detect_pattern_label(row, scanner_id),
            "signal": self._generate_signal(row, scanner_id),
            "ma_signal": self._classify_ma_signal(row),
            "breakout_level": round(float(row.get('bb_upper', close * 1.05)), 2),
            "support_level": round(float(row.get('bb_lower', close * 0.95)), 2),
            "target_1": round(close + atr * 1.5, 2),
            "target_2": round(close + atr * 3.0, 2),
            "stop_loss": round(close - atr * 1.5, 2),
        }

    def _format_pattern_signal(self, row, signal, scanner_id: int) -> Dict:
        """Format a BreakoutSignal into frontend JSON with real pattern-derived targets."""
        symbol = row['symbol'] if isinstance(row, dict) else row.get('symbol', '')
        info = NSE_STOCK_INFO.get(symbol, {})
        close = float(row.get('close', 0))
        pat = signal.pattern

        # Human-readable label
        label = (
            _CONSOLIDATION_LABELS.get(scanner_id)
            or _REVERSAL_LABELS.get(scanner_id)
            or pat.pattern_type.replace('_', ' ').title()
        )

        # Risk-reward ratio
        risk = signal.entry_price - signal.stop_loss
        reward = signal.target - signal.entry_price
        rr = round(reward / risk, 2) if risk > 0 else 0

        return {
            "symbol": symbol,
            "name": info.get("name", symbol),
            "sector": info.get("sector", ""),
            "ltp": round(close, 2),
            "change_pct": round(float(row.get('change_pct', 0)), 2),
            "volume": f"{signal.volume_ratio:.1f}x",
            "volume_ratio": round(signal.volume_ratio, 2),
            "volume_raw": int(float(row.get('volume', 0))),
            "rsi": round(float(row.get('rsi_14', 50))),
            "trend": self._classify_trend(row),
            "pattern": label,
            "pattern_type": pat.pattern_type,
            "signal": "BUY",
            "ma_signal": self._classify_ma_signal(row),
            # Real pattern-derived targets
            "entry_price": round(signal.entry_price, 2),
            "stop_loss": round(signal.stop_loss, 2),
            "target": round(signal.target, 2),
            "target_1": round(signal.target, 2),
            "breakout_level": round(pat.breakout_level, 2),
            "support_level": round(pat.support_level, 2),
            # Pattern metadata
            "confidence": round(pat.quality_score),
            "quality_score": round(pat.quality_score),
            "signal_confidence": getattr(signal, 'confidence', 'high'),
            "ml_score": round(signal.ml_score, 3) if signal.ml_score >= 0 else None,
            "risk_reward": rr,
            "pattern_height": round(pat.pattern_height, 2),
            "duration_bars": pat.duration_bars,
        }

    def _classify_trend(self, row) -> str:
        """Classify trend from real indicators."""
        close = float(row.get('close', 0))
        sma_20 = float(row.get('sma_20', 0))
        sma_50 = float(row.get('sma_50', 0))
        sma_200 = float(row.get('sma_200', 0))
        adx = float(row.get('adx', 0))

        if sma_20 > 0 and sma_50 > 0 and close > sma_20 > sma_50:
            return "Strong Up" if adx > 25 else "Up"
        elif sma_20 > 0 and close > sma_20:
            return "Up"
        elif sma_20 > 0 and sma_50 > 0 and close < sma_20 < sma_50:
            return "Strong Down" if adx > 25 else "Down"
        elif sma_20 > 0 and close < sma_20:
            return "Down"
        return "Sideways"

    def _detect_pattern_label(self, row, scanner_id: int) -> str:
        """Generate pattern label from indicators."""
        # Check candlestick patterns
        if row.get('candle_engulfing_bull'):
            return "Bullish Engulfing"
        if row.get('candle_engulfing_bear'):
            return "Bearish Engulfing"
        if row.get('candle_hammer'):
            return "Hammer"
        if row.get('candle_morning_star'):
            return "Morning Star"
        if row.get('candle_doji'):
            return "Doji"
        if row.get('nr4'):
            return "NR4"
        if row.get('nr7'):
            return "NR7"
        if row.get('inside_bar'):
            return "Inside Bar"
        if row.get('ttm_squeeze'):
            return "TTM Squeeze"

        # Fallback based on scanner type
        scanner_patterns = {
            1: "Consolidation Breakout", 4: "Volume Breakout", 5: "52W High",
            6: "10D High", 7: "52W Low", 8: "Volume Surge", 9: "RSI Oversold",
            10: "RSI Overbought", 14: "VCP", 17: "Momentum", 26: "MACD Cross",
            30: "Momentum Burst", 31: "Trend Template", 32: "SuperTrend Bullish",
            33: "Pivot Breakout",
        }
        return scanner_patterns.get(scanner_id, "")

    def _generate_signal(self, row, scanner_id: int) -> str:
        """Generate Buy/Sell/Hold signal from real data."""
        change = float(row.get('change_pct', 0))
        rsi = float(row.get('rsi_14', 50))

        # Bearish scanners
        if scanner_id in (3, 13, 27):
            return "Sell" if change < -3 else "Weak"

        # RSI-based
        if scanner_id == 9:  # Oversold
            return "Strong Buy" if rsi < 25 else "Buy"
        if scanner_id == 10:  # Overbought
            return "Take Profit" if rsi > 80 else "Hold"

        # Bullish scanners
        if scanner_id in (1, 2, 4, 5, 12, 14, 17, 30, 31):
            if change > 3 and rsi > 60:
                return "Strong Buy"
            elif change > 1:
                return "Buy"
            return "Hold"

        # Default
        if change > 2:
            return "Buy"
        elif change < -2:
            return "Sell"
        return "Hold"

    def _classify_ma_signal(self, row) -> str:
        """Classify moving average signal."""
        close = float(row.get('close', 0))
        ema_21 = float(row.get('ema_21', 0))
        sma_50 = float(row.get('sma_50', 0))
        sma_200 = float(row.get('sma_200', 0))

        if sma_50 > 0 and sma_200 > 0 and sma_50 > sma_200 and close > sma_50:
            return "Golden Cross"
        if ema_21 > 0 and sma_50 > 0 and ema_21 > sma_50:
            return "Bull Cross"
        if sma_200 > 0 and close > sma_200:
            return "Above 200 SMA"
        if sma_50 > 0 and close > sma_50:
            return "Above 50 SMA"
        if ema_21 > 0 and close > ema_21:
            return "Above 20 EMA"
        return "Below MAs"

    # =========================================================================
    # AI / ML ENDPOINTS
    # =========================================================================

    def _fetch_index_df(self, td_symbol: str = "NIFTY 50", yf_symbol: str = "^NSEI", period: str = "6mo") -> Optional[pd.DataFrame]:
        """Fetch index historical data from Kite Connect."""
        from .market_data import get_market_data_provider
        provider = get_market_data_provider()._get_kite_provider()
        try:
            # Map the legacy symbol names to index name
            index_map = {"NIFTY 50": "NIFTY", "Nifty 50": "NIFTY", "NIFTY BANK": "BANKNIFTY", "^NSEI": "NIFTY", "^NSEBANK": "BANKNIFTY", "^INDIAVIX": "VIX"}
            index_name = index_map.get(td_symbol, index_map.get(yf_symbol, "NIFTY"))
            df = provider.get_historical_index(index_name, period)
            if df is not None and not df.empty:
                df.columns = [c.lower() for c in df.columns]
                return df
        except Exception as e:
            logger.debug(f"Kite index fetch failed for {td_symbol}: {e}")
        return None

    async def get_nifty_prediction(self) -> Dict[str, Any]:
        """
        AI/ML-powered Nifty 50 prediction using real models:
        - HMM Regime Detector: market regime (bull/sideways/bear)
        - LightGBM Gate: 3-class signal (BUY/SELL/HOLD) with probabilities
        - Technical indicators: RSI, MACD, SMA breadth
        """
        if self._nifty_cache:
            cached_data, cached_at = self._nifty_cache
            if datetime.now() - cached_at < self.CACHE_TTL:
                return cached_data

        try:
            df = self._fetch_index_df("NIFTY 50", "^NSEI", "1y")
            if df is None or df.empty:
                return {"error": "Could not fetch Nifty data"}

            close = df['close']
            current_level = round(float(close.iloc[-1]), 2)
            prev_close = float(close.iloc[-2]) if len(close) > 1 else current_level
            change_pct = round((current_level - prev_close) / prev_close * 100, 2)

            # ── Technical indicators ──
            rsi = ta.momentum.rsi(close, window=14)
            rsi_val = float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else 50

            macd_ind = ta.trend.MACD(close)
            macd_val = float(macd_ind.macd().iloc[-1])
            macd_sig = float(macd_ind.macd_signal().iloc[-1])

            sma_20 = float(close.rolling(20).mean().iloc[-1])
            sma_50 = float(close.rolling(50).mean().iloc[-1])
            sma_200 = float(close.rolling(200).mean().iloc[-1]) if len(close) >= 200 else float(close.mean())

            bb = ta.volatility.BollingerBands(close, window=20, window_dev=2)
            bb_upper = float(bb.bollinger_hband().iloc[-1])
            bb_lower = float(bb.bollinger_lband().iloc[-1])
            bb_pct = float(bb.bollinger_pband().iloc[-1]) if not pd.isna(bb.bollinger_pband().iloc[-1]) else 0.5

            atr = ta.volatility.AverageTrueRange(df['high'], df['low'], close, window=14)
            atr_val = float(atr.average_true_range().iloc[-1]) if not pd.isna(atr.average_true_range().iloc[-1]) else 0

            obv = ta.volume.OnBalanceVolumeIndicator(close, df['volume'])
            obv_val = float(obv.on_balance_volume().iloc[-1])

            vol_ratio = float(df['volume'].iloc[-1] / df['volume'].rolling(20).mean().iloc[-1]) if df['volume'].rolling(20).mean().iloc[-1] > 0 else 1.0

            ema_20 = float(close.ewm(span=20).mean().iloc[-1])
            ema_50 = float(close.ewm(span=50).mean().iloc[-1])

            body_pct = abs(float(df['close'].iloc[-1] - df['open'].iloc[-1])) / current_level * 100 if current_level > 0 else 0
            wick_pct = (float(df['high'].iloc[-1] - df['low'].iloc[-1]) - abs(float(df['close'].iloc[-1] - df['open'].iloc[-1]))) / current_level * 100 if current_level > 0 else 0

            # ── HMM Regime Detection ──
            regime_result = None
            if self._regime_detector is not None:
                try:
                    from ml.regime_detector import compute_regime_features
                    # Try fetching India VIX for better regime detection
                    vix_df = None
                    try:
                        vix_df = self._fetch_index_df("INDIA VIX", "^INDIAVIX", "1y")
                    except Exception:
                        pass
                    regime_features = compute_regime_features(df, vix_df)
                    regime_result = self._regime_detector.predict_regime(regime_features)
                    logger.debug(f"HMM regime: {regime_result['regime']} (conf={regime_result['confidence']:.2f})")
                except Exception as e:
                    logger.debug(f"HMM regime prediction failed: {e}")

            # ── LightGBM Signal Gate ──
            lgbm_result = None
            if self._lgbm_gate is not None:
                try:
                    vwap_diff = 0.0
                    if 'volume' in df.columns:
                        typical = (df['high'] + df['low'] + df['close']) / 3
                        cum_vol = df['volume'].cumsum()
                        cum_tp_vol = (typical * df['volume']).cumsum()
                        vwap = float((cum_tp_vol / cum_vol).iloc[-1]) if float(cum_vol.iloc[-1]) > 0 else current_level
                        vwap_diff = (current_level - vwap) / vwap * 100 if vwap > 0 else 0

                    features = {
                        "close": current_level,
                        "rsi_14": rsi_val,
                        "macd": macd_val,
                        "macd_signal": macd_sig,
                        "bb_upper": bb_upper,
                        "bb_lower": bb_lower,
                        "bb_percent": bb_pct,
                        "ema_20": ema_20,
                        "ema_50": ema_50,
                        "atr_14": atr_val,
                        "volume_ratio": vol_ratio,
                        "obv": obv_val,
                        "vwap_diff": vwap_diff,
                        "body_pct": body_pct,
                        "wick_pct": wick_pct,
                    }
                    direction_lgbm, confidence_lgbm, probs = self._lgbm_gate.predict(features)
                    lgbm_result = {
                        "direction": direction_lgbm,
                        "confidence": round(confidence_lgbm, 1),
                        "probabilities": {k: round(v, 1) for k, v in probs.items()},
                    }
                    logger.debug(f"LGBM signal: {direction_lgbm} ({confidence_lgbm:.1f}%)")
                except Exception as e:
                    logger.debug(f"LGBM prediction failed: {e}")

            # ── Combine models for final prediction ──
            # Priority: HMM regime for market context, LGBM for actionable signal
            if lgbm_result:
                direction = lgbm_result["direction"]
                if direction == "BUY":
                    final_direction = "BULLISH"
                elif direction == "SELL":
                    final_direction = "BEARISH"
                else:
                    final_direction = "NEUTRAL"
                confidence = lgbm_result["confidence"]
            elif regime_result and regime_result.get("confidence", 0) > 0.4:
                regime = regime_result["regime"]
                final_direction = "BULLISH" if regime == "bull" else "BEARISH" if regime == "bear" else "NEUTRAL"
                confidence = round(regime_result["confidence"] * 100, 1)
            else:
                # Fallback: technical signal count
                bullish_signals = sum([
                    current_level > sma_50,
                    rsi_val > 50,
                    macd_val > macd_sig,
                    current_level > float(close.iloc[-5]) if len(close) > 5 else False,
                ])
                if bullish_signals >= 3:
                    final_direction = "BULLISH"
                    confidence = round(55 + bullish_signals * 5, 1)
                elif bullish_signals <= 1:
                    final_direction = "BEARISH"
                    confidence = round(55 + (4 - bullish_signals) * 5, 1)
                else:
                    final_direction = "NEUTRAL"
                    confidence = 50.0

            # ── Support/resistance from actual pivots ──
            try:
                full_df = compute_all_indicators(df)
                support_levels, resistance_levels = detect_support_resistance(full_df)
            except Exception:
                support_levels = [round(current_level * m, 0) for m in [0.98, 0.96, 0.94]]
                resistance_levels = [round(current_level * m, 0) for m in [1.02, 1.04, 1.06]]

            # ── Build response ──
            models_used = []
            if regime_result:
                models_used.append("HMM Regime Detector")
            if lgbm_result:
                models_used.append("LightGBM Signal Gate")
            if not models_used:
                models_used.append("Technical Indicators")

            result = {
                "current_level": current_level,
                "change_percent": change_pct,
                "prediction": {
                    "direction": final_direction,
                    "confidence": confidence,
                    "models_used": models_used,
                },
                "regime": regime_result if regime_result else {
                    "regime": final_direction.lower() if final_direction != "NEUTRAL" else "sideways",
                    "confidence": confidence / 100,
                    "source": "technical_fallback",
                },
                "lgbm_signal": lgbm_result,
                "support_levels": support_levels[:3] if support_levels else [],
                "resistance_levels": resistance_levels[:3] if resistance_levels else [],
                "indicators": {
                    "rsi": round(rsi_val, 1),
                    "macd": round(macd_val, 2),
                    "macd_signal": round(macd_sig, 2),
                    "sma_20": round(sma_20, 2),
                    "sma_50": round(sma_50, 2),
                    "sma_200": round(sma_200, 2),
                    "bb_percent": round(bb_pct, 3),
                    "atr_14": round(atr_val, 2),
                    "volume_ratio": round(vol_ratio, 2),
                },
                "timestamp": datetime.now().isoformat(),
            }

            self._nifty_cache = (result, datetime.now())
            return result

        except Exception as e:
            logger.error(f"Nifty prediction error: {e}")
            return {"error": str(e)}

    async def get_trend_forecast(self, symbol: str = "NIFTY") -> Dict[str, Any]:
        """Real multi-timeframe trend forecast using Kite data."""
        try:
            sym_upper = symbol.upper()
            td_symbol = "NIFTY 50" if sym_upper in ("NIFTY", "NIFTY50") else sym_upper
            yf_symbol = "^NSEI" if sym_upper in ("NIFTY", "NIFTY50") else f"{sym_upper}.NS"

            df = self._fetch_index_df(td_symbol, yf_symbol, "1y")
            if df is None or df.empty:
                return {"error": f"No data for {symbol}"}

            close = df['close']
            current_price = float(close.iloc[-1])

            # Compute indicators
            rsi = ta.momentum.rsi(close, window=14)
            rsi_val = float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else 50
            macd_ind = ta.trend.MACD(close)
            macd_val = float(macd_ind.macd().iloc[-1])
            macd_sig = float(macd_ind.macd_signal().iloc[-1])
            sma_20 = float(close.rolling(20).mean().iloc[-1])
            sma_50 = float(close.rolling(50).mean().iloc[-1])

            # Intraday trend (from recent 5 days)
            recent_5d = float(close.iloc[-5]) if len(close) > 5 else current_price
            intraday_trend = "Bullish" if current_price > recent_5d else "Bearish" if current_price < recent_5d else "Sideways"

            # Short-term (1-2 weeks)
            short_trend = "Bullish" if current_price > sma_20 and rsi_val > 50 else "Bearish" if current_price < sma_20 else "Sideways"

            # Medium-term (1-3 months)
            medium_trend = "Bullish" if current_price > sma_50 and macd_val > macd_sig else "Bearish" if current_price < sma_50 else "Sideways"

            atr = float((df['high'] - df['low']).rolling(14).mean().iloc[-1])

            return {
                "symbol": symbol.upper(),
                "current_price": round(current_price, 2),
                "timestamp": datetime.now().isoformat(),
                "timeframes": {
                    "intraday": {
                        "trend": intraday_trend,
                        "strength": round(min(abs(current_price - recent_5d) / current_price * 100, 1.0), 2),
                        "target": round(current_price + atr, 2),
                        "stop_loss": round(current_price - atr, 2),
                    },
                    "short_term": {
                        "trend": short_trend,
                        "strength": round(min(abs(rsi_val - 50) / 50, 1.0), 2),
                        "target": round(current_price + atr * 2, 2),
                        "stop_loss": round(current_price - atr * 1.5, 2),
                        "duration": "1-2 weeks",
                    },
                    "medium_term": {
                        "trend": medium_trend,
                        "strength": round(min(abs(current_price - sma_50) / sma_50, 1.0), 2) if sma_50 > 0 else 0,
                        "target": round(current_price + atr * 4, 2),
                        "stop_loss": round(current_price - atr * 3, 2),
                        "duration": "1-3 months",
                    },
                },
                "technical_indicators": {
                    "rsi_14": round(rsi_val, 1),
                    "macd_signal": "Bullish" if macd_val > macd_sig else "Bearish",
                    "adx": round(float(ta.trend.ADXIndicator(df['high'], df['low'], close).adx().iloc[-1]), 1),
                },
            }
        except Exception as e:
            logger.error(f"Trend forecast error for {symbol}: {e}")
            return {"error": str(e)}

    async def get_market_regime(self) -> Dict[str, Any]:
        """Real market regime from breadth analysis."""
        summary_df, _ = self._get_computed_data()
        if summary_df.empty:
            return {"regime": "UNKNOWN", "error": "No data available"}

        total = len(summary_df)
        above_200sma = int((summary_df['close'] > summary_df['sma_200']).sum())
        above_50sma = int((summary_df['close'] > summary_df['sma_50']).sum())
        bullish_macd = int((summary_df['macd'] > summary_df['macd_signal']).sum())

        breadth_200 = above_200sma / total * 100 if total > 0 else 50
        breadth_50 = above_50sma / total * 100 if total > 0 else 50

        if breadth_200 > 60:
            regime = "BULL"
            desc = "Broad market uptrend with expanding breadth"
        elif breadth_200 < 40:
            regime = "BEAR"
            desc = "Market in downtrend with contracting breadth"
        else:
            regime = "SIDEWAYS"
            desc = "Range-bound market with mixed signals"

        return {
            "regime": regime,
            "description": desc,
            "confidence": round(abs(breadth_200 - 50) + 50, 1),
            "breadth_200sma": round(breadth_200, 1),
            "breadth_50sma": round(breadth_50, 1),
            "bullish_macd_pct": round(bullish_macd / total * 100 if total > 0 else 50, 1),
            "stocks_analyzed": total,
            "timestamp": datetime.now().isoformat(),
        }

    async def get_trend_analysis(self) -> Dict[str, Any]:
        """Real sector-wise trend analysis."""
        summary_df, _ = self._get_computed_data()
        if summary_df.empty:
            return {"error": "No data available"}

        # Add sector info
        summary_df['sector'] = summary_df['symbol'].map(
            lambda s: NSE_STOCK_INFO.get(s, {}).get('sector', 'Other')
        )

        total = len(summary_df)
        above_50 = int((summary_df['close'] > summary_df['sma_50']).sum())
        below_50 = total - above_50
        bull_pct = round(above_50 / total * 100) if total > 0 else 50

        # Real sector-wise analysis
        sectors = {}
        for sector, group in summary_df.groupby('sector'):
            if len(group) < 3:
                continue
            sector_bullish = (group['close'] > group['sma_50']).sum()
            sector_total = len(group)
            pct = sector_bullish / sector_total * 100 if sector_total > 0 else 50
            sectors[sector] = {
                "trend": "BULLISH" if pct > 60 else "BEARISH" if pct < 40 else "NEUTRAL",
                "strength": round(pct),
                "stocks": sector_total,
            }

        return {
            "summary": {
                "bullish_stocks": above_50,
                "bearish_stocks": below_50,
                "bullish_pct": bull_pct,
                "bearish_pct": 100 - bull_pct,
                "overall_trend": "BULLISH" if bull_pct > 60 else "BEARISH" if bull_pct < 40 else "NEUTRAL",
            },
            "sectors": sectors,
            "stocks_analyzed": total,
            "timestamp": datetime.now().isoformat(),
        }

    # =========================================================================
    # SCANNER METADATA
    # =========================================================================

    def get_all_scanners(self) -> Dict[str, Any]:
        """Return complete scanner menu and capabilities."""
        scanner_details = SCANNER_MENU["scan_types"]["X"]["submenu"]
        return {
            "total_scanners": len(scanner_details),
            "exchanges": list(SCANNER_MENU["exchanges"].keys()),
            "stock_universe": {
                "NSE": "1800+ stocks",
                "BSE": "3000+ stocks",
                "F&O": "200+ derivatives",
            },
            "categories": [
                {"id": "breakout", "name": "Breakout Scanners", "count": 8, "scanners": [0, 1, 4, 5, 6, 7, 20, 33]},
                {"id": "momentum", "name": "Momentum Scanners", "count": 7, "scanners": [2, 3, 10, 17, 26, 30, 31]},
                {"id": "volume", "name": "Volume Scanners", "count": 5, "scanners": [4, 8, 34, 35, 38]},
                {"id": "reversal", "name": "Reversal Scanners", "count": 6, "scanners": [9, 12, 19, 24, 25, 28]},
                {"id": "patterns", "name": "Chart Patterns", "count": 12, "scanners": [12, 13, 14, 21, 22, 23, 24, 25, 43, 44, 45, 46]},
                {"id": "ma_strategies", "name": "Moving Average Strategies", "count": 5, "scanners": [11, 15, 26, 27, 32]},
                {"id": "smart_money", "name": "Smart Money / Institutional", "count": 5, "scanners": [34, 35, 36, 37, 38]},
                {"id": "fo_analysis", "name": "F&O / Derivatives", "count": 4, "scanners": [39, 40, 41, 42]},
                {"id": "chart_patterns", "name": "Advanced Chart Patterns", "count": 9, "scanners": [43, 44, 45, 46, 47, 49, 50, 51]},
            ],
            "ai_ml_features": {
                "nifty_prediction": {
                    "enabled": True,
                    "models": ["HMM Regime", "LightGBM", "TFT Forecaster"],
                    "source": "live",
                },
                "ml_signals": {
                    "enabled": True,
                    "models": ["RandomForest Meta-Labeler", "LightGBM Gate", "Ensemble"],
                },
                "trend_forecast": {"enabled": True, "timeframes": ["Intraday", "Short-term", "Medium-term"]},
                "quantai_picks": {"enabled": True, "model": "LightGBM Regressor (51 features)"},
            },
            "scanner_details": scanner_details,
        }


# =============================================================================
# SINGLETON
# =============================================================================

_live_screener_instance: Optional[LiveScreenerEngine] = None


def get_live_screener() -> LiveScreenerEngine:
    """Get singleton LiveScreenerEngine instance."""
    global _live_screener_instance
    if _live_screener_instance is None:
        _live_screener_instance = LiveScreenerEngine()
        logger.info("LiveScreenerEngine initialized (Kite + jugaad-data)")
    return _live_screener_instance
