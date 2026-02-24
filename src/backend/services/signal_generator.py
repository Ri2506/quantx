"""
================================================================================
SWINGAI SIGNAL GENERATION SERVICE
================================================================================
Generates trading signals using 15 rule-based strategies:
1. Each strategy scans independently for setups
2. Optional XGBoost/TFT confirmation (confidence boost)
3. Signals saved to Supabase for frontend display
================================================================================
"""

import os
import json
import asyncio
import httpx
import logging
import sys
from pathlib import Path
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import pandas as pd
import numpy as np
from ..core.config import settings
from .market_data import get_market_data_provider

logger = logging.getLogger(__name__)

# Allow importing from repo root (ml module)
ROOT_DIR = Path(__file__).resolve().parents[3]
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from ml.scanner import scan_stock, get_all_strategies
from ml.features.indicators import compute_all_indicators

# Optional imports — these may not exist in all environments
try:
    from .feature_engineering import compute_features, build_feature_row, split_feature_sets
    from .model_registry import XGBoostGate, TFTPredictor
except ImportError:
    compute_features = None
    build_feature_row = None
    split_feature_sets = None
    XGBoostGate = None
    TFTPredictor = None

try:
    from .pkscreener_integration import PKScreenerIntegration
except ImportError:
    PKScreenerIntegration = None

try:
    from .fo_trading_engine import FOTradingEngine, InstrumentType, NSE_LOT_SIZES
    from .instrument_master import InstrumentMaster
except ImportError:
    FOTradingEngine = None
    NSE_LOT_SIZES = {}
    InstrumentMaster = None


@dataclass
class SignalCandidate:
    """Stock candidate for signal generation"""
    symbol: str
    price: float
    change_percent: float
    volume: int
    rsi: float
    macd_signal: str
    trend: str
    support: float
    resistance: float
    sector: str


@dataclass
class GeneratedSignal:
    """Generated trading signal"""
    symbol: str
    exchange: str
    segment: str
    direction: str
    confidence: float
    entry_price: float
    stop_loss: float
    target_1: float
    target_2: Optional[float]
    target_3: Optional[float]
    risk_reward: float
    catboost_score: float
    tft_score: float
    stockformer_score: float
    model_agreement: int
    reasons: List[str]
    is_premium: bool
    lot_size: Optional[int] = None
    expiry_date: Optional[date] = None
    strike_price: Optional[float] = None
    option_type: Optional[str] = None


class SignalGenerator:
    """
    Main signal generation service
    Orchestrates PKScreener → Feature Engineering → AI Inference → Signal Creation
    """
    
    def __init__(
        self,
        supabase_client,
        modal_endpoint: str = None,
        use_enhanced_ai: bool = False,
        enhanced_modal_endpoint: Optional[str] = None,
        min_confidence: float = 65.0,
        min_risk_reward: float = 1.5
    ):
        self.supabase = supabase_client
        self.modal_endpoint = (
            modal_endpoint
            or settings.ML_INFERENCE_URL
            or os.getenv("MODAL_INFERENCE_URL", "")
        )
        self.use_enhanced_ai = use_enhanced_ai
        self.enhanced_modal_endpoint = enhanced_modal_endpoint or settings.ENHANCED_ML_INFERENCE_URL
        self._enhanced_generator = None
        self.min_confidence = min_confidence
        self.min_risk_reward = min_risk_reward
        
        # PRD model paths
        self.xgb_model_path = settings.XGBOOST_MODEL_PATH
        self.tft_model_path = settings.TFT_MODEL_PATH
        self.tft_config_path = settings.TFT_CONFIG_PATH
        self._xgb_gate: Optional[XGBoostGate] = None
        self._tft_predictor: Optional[TFTPredictor] = None

        # Strategy weights for confidence combining
        self.strategy_weight = getattr(settings, 'STRATEGY_WEIGHT', 0.6)
        self.xgb_weight = getattr(settings, 'XGB_WEIGHT', 0.2)
        self.tft_weight = getattr(settings, 'TFT_WEIGHT', 0.2)

        # F&O helpers (optional)
        self.fo_engine = FOTradingEngine() if FOTradingEngine else None
        if InstrumentMaster:
            self.instrument_master = InstrumentMaster(getattr(settings, 'FNO_INSTRUMENTS_FILE', ''))
            self.fo_symbols = set(NSE_LOT_SIZES.keys())
            if self.instrument_master.available():
                self.fo_symbols = self.instrument_master.get_fo_symbols() or self.fo_symbols
        else:
            self.instrument_master = None
            self.fo_symbols = set()
        
        # F&O lot sizes (subset - full list in fo_trading_engine.py)
        self.fo_lot_sizes = {
            "NIFTY": 25, "BANKNIFTY": 15, "RELIANCE": 250, "TCS": 150,
            "HDFCBANK": 550, "INFY": 300, "ICICIBANK": 700, "SBIN": 750,
            "TATASTEEL": 425, "TRENT": 385, "POLYCAB": 200
        }
    
    async def generate_daily_signals(self) -> List[GeneratedSignal]:
        """
        Main entry point - generates all signals for the day
        Called by scheduler at 8:30 AM
        """
        logger.info("Starting daily signal generation...")
        
        try:
            # Default to strategy-first pipeline
            signals = await self.generate_intraday_signals(save=True)
            
            logger.info(f"Generated {len(signals)} signals for today")
            return signals
            
        except Exception as e:
            logger.error(f"Signal generation failed: {e}")
            raise

    async def generate_eod_signals(self, signal_date: Optional[date] = None) -> List[GeneratedSignal]:
        """
        End-of-day scan using PKScreener-filtered universe.
        Signals are saved for the next trading day by default.
        """
        result = await self.run_eod_scan(signal_date=signal_date)
        return result.get("signals", [])

    async def run_eod_scan(
        self,
        signal_date: Optional[date] = None,
        run_id: Optional[str] = None,
    ) -> Dict[str, object]:
        """
        Run EOD scan, persist candidate universe, and generate signals.
        Returns metadata for monitoring.
        """
        candidates, source = self._load_eod_universe()
        trade_date = signal_date or date.today()
        await self._save_universe(
            candidates=candidates,
            trade_date=trade_date,
            source=source,
            scan_type=settings.EOD_SCAN_TYPE,
            run_id=run_id,
        )

        signals = await self.generate_intraday_signals(
            save=True,
            candidates=candidates,
            signal_date=trade_date,
        )

        return {
            "signals": signals,
            "candidate_count": len(candidates),
            "source": source,
            "scan_type": settings.EOD_SCAN_TYPE,
        }

    async def generate_intraday_signals(
        self,
        save: bool = False,
        candidates: Optional[List[str]] = None,
        signal_date: Optional[date] = None,
    ) -> List[GeneratedSignal]:
        """
        Strategy-first pipeline: 15 standalone strategies scan each stock.
        Optional XGBoost/TFT confirmation for confidence boost.
        """
        logger.info("Starting signal generation with 15 strategies...")
        try:
            await self._load_models()
        except Exception as e:
            logger.warning(f"Model load failed: {e}. Continuing with strategy-only signals.")

        candidates = candidates or self._load_universe()
        signals: List[GeneratedSignal] = []
        provider = get_market_data_provider()
        strategies = get_all_strategies()

        for symbol in candidates:
            try:
                hist = await provider.get_historical_async(symbol, period="1y", interval="1d")
                if hist is None or hist.empty:
                    continue
                hist = hist.copy()
                hist.columns = [c.lower() for c in hist.columns]
                hist = hist.tail(260)  # ~1y trading days

                # Fallback: append latest quote if missing today's candle
                try:
                    last_date = hist.index[-1].date()
                    if last_date < date.today():
                        quote = provider.get_quote(symbol)
                        if quote and quote.ltp:
                            hist.loc[pd.Timestamp(date.today())] = {
                                "open": quote.open,
                                "high": quote.high,
                                "low": quote.low,
                                "close": quote.ltp,
                                "volume": quote.volume,
                            }
                except Exception:
                    pass

                if len(hist) < 200:
                    continue

                # Scan with all 15 strategies
                trade_signals = scan_stock(hist, symbol, strategies)
                await self._cache_candles(symbol, hist)

                for ts in trade_signals:
                    # Only long signals (BUY direction)
                    if ts.direction.value != "BUY":
                        continue

                    strategy_conf = ts.confidence
                    if strategy_conf < self.min_confidence:
                        continue

                    rr_ratio = ts.risk_reward
                    if rr_ratio < self.min_risk_reward:
                        continue

                    entry = ts.entry_price
                    stop_loss = ts.stop_loss
                    target_1 = ts.target
                    # Compute target 2 and 3 as extensions
                    risk = abs(entry - stop_loss)
                    target_2 = round(entry + 2.5 * risk, 2) if risk > 0 else target_1
                    target_3 = round(entry + 3.5 * risk, 2) if risk > 0 else target_1

                    # Optional XGBoost/TFT confirmation
                    xgb_score = None
                    tft_score = None

                    if (self._xgb_gate or self._tft_predictor) and compute_features is not None:
                        try:
                            prd_features_df = compute_features(hist)
                            if self._xgb_gate and prd_features_df is not None:
                                feature_row = build_feature_row(prd_features_df)
                                xgb_features, _ = split_feature_sets(feature_row)
                                xgb_dir, _, xgb_probs = self._xgb_gate.predict(xgb_features)
                                xgb_score = float(xgb_probs.get("buy", 0.0))
                            if self._tft_predictor and prd_features_df is not None:
                                tft_frame = self._build_tft_frame(prd_features_df, symbol)
                                quantiles = self._tft_predictor.predict_quantiles(tft_frame)
                                tft_score = self._score_tft_quantiles(quantiles, entry, "LONG")
                        except Exception as e:
                            logger.debug(f"Model confirmation failed for {symbol}: {e}")

                    confidence = self._combine_confidence(strategy_conf, xgb_score, tft_score)

                    model_agreement = 1
                    if xgb_score is not None and xgb_score >= 50:
                        model_agreement += 1
                    if tft_score is not None and tft_score >= 50:
                        model_agreement += 1

                    reasons = ts.reasons + [
                        f"Strategy:{ts.strategy}",
                        f"Direction:LONG",
                        f"Segment:EQUITY",
                    ]

                    is_premium = confidence >= 75

                    signal = GeneratedSignal(
                        symbol=symbol,
                        exchange="NSE",
                        segment="EQUITY",
                        direction="LONG",
                        confidence=round(confidence, 2),
                        entry_price=round(entry, 2),
                        stop_loss=round(stop_loss, 2),
                        target_1=round(target_1, 2),
                        target_2=round(target_2, 2),
                        target_3=round(target_3, 2),
                        risk_reward=round(rr_ratio, 2),
                        catboost_score=round(xgb_score or 0, 2),
                        tft_score=round(tft_score or 0, 2),
                        stockformer_score=round(strategy_conf, 2),
                        model_agreement=model_agreement,
                        reasons=reasons,
                        is_premium=is_premium,
                    )
                    signal._strategy_names = [ts.strategy]  # type: ignore
                    signal._tft_prediction = {}  # type: ignore

                    signals.append(signal)
            except Exception as e:
                logger.warning(f"Signal generation failed for {symbol}: {e}")

        signals.sort(key=lambda x: x.confidence, reverse=True)
        if save:
            await self._save_signals(signals, signal_date=signal_date)
        logger.info(f"Generated {len(signals)} signals from 15 strategies")
        return signals

    async def _load_models(self):
        await self._ensure_model_files()
        if XGBoostGate is not None and self._xgb_gate is None:
            try:
                self._xgb_gate = XGBoostGate(self.xgb_model_path)
            except Exception as e:
                logger.warning(f"XGBoost load failed: {e}")
                self._xgb_gate = None
        if TFTPredictor is not None and self._tft_predictor is None:
            try:
                self._tft_predictor = TFTPredictor(self.tft_model_path, self.tft_config_path)
            except Exception as e:
                logger.warning(f"TFT load failed: {e}")
                self._tft_predictor = None

    async def ensure_models(self) -> Dict[str, bool]:
        """Ensure model files exist locally; returns status dict."""
        await self._ensure_model_files()
        return {
            "xgboost": os.path.exists(self.xgb_model_path),
            "tft": os.path.exists(self.tft_model_path),
            "tft_config": os.path.exists(self.tft_config_path),
        }

    async def _ensure_model_files(self):
        """Download model artifacts from Supabase Storage if missing."""
        try:
            from pathlib import Path
            if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
                return
            supabase = self.supabase
            bucket = settings.MODEL_STORAGE_BUCKET
            for local_path, remote in [
                (self.xgb_model_path, "xgboost_model.json"),
                (self.tft_model_path, "tft_model.ckpt"),
                (self.tft_config_path, "tft_config.json"),
            ]:
                p = Path(local_path)
                if p.exists():
                    continue
                blob = supabase.storage.from_(bucket).download(remote)
                p.parent.mkdir(parents=True, exist_ok=True)
                with open(p, "wb") as f:
                    f.write(blob)
        except Exception as e:
            logger.warning(f"Model download failed: {e}")

    def _load_universe(self) -> List[str]:
        path = settings.ALPHA_UNIVERSE_FILE
        symbols: List[str] = []
        try:
            if os.path.exists(path):
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        s = line.strip().upper()
                        if s:
                            symbols.append(s)
        except Exception as e:
            logger.warning(f"Universe load failed: {e}")
        if not symbols:
            symbols = self._get_fallback_candidates()
        return symbols[: settings.ALPHA_UNIVERSE_SIZE]

    def _load_eod_universe(self) -> Tuple[List[str], str]:
        """
        Load end-of-day universe using PKScreener filters.
        Falls back to alpha universe if PKScreener is unavailable.
        """
        source = "alpha_fallback"
        if not getattr(settings, 'EOD_SCAN_USE_PKS', False):
            return self._load_universe(), source

        if PKScreenerIntegration is None:
            return self._load_universe(), source

        try:
            pks = PKScreenerIntegration()
            use_github = getattr(settings, 'EOD_SCAN_SOURCE', 'github').lower() != "local"
            candidates = pks.get_swing_candidates(
                use_github=use_github,
                max_stocks=getattr(settings, 'EOD_SCAN_MAX_STOCKS', 50),
                min_price=getattr(settings, 'EOD_SCAN_MIN_PRICE', 50),
                max_price=getattr(settings, 'EOD_SCAN_MAX_PRICE', 5000),
                min_volume=getattr(settings, 'EOD_SCAN_MIN_VOLUME', 100000),
                scan_type=getattr(settings, 'EOD_SCAN_TYPE', 'swing'),
            )
            if candidates:
                source = "pkscreener_github" if use_github else "pkscreener_local"
                return candidates, source
        except Exception as e:
            logger.warning(f"PKScreener universe load failed: {e}")

        return self._load_universe(), source

    async def _save_universe(
        self,
        candidates: List[str],
        trade_date: date,
        source: str,
        scan_type: str,
        run_id: Optional[str] = None,
    ) -> None:
        """Persist EOD candidate universe for transparency."""
        try:
            rows = []
            for symbol in candidates:
                rows.append({
                    "trade_date": trade_date.isoformat(),
                    "symbol": symbol,
                    "source": source,
                    "scan_type": scan_type,
                    "run_id": run_id,
                })
            if rows:
                self.supabase.table("daily_universe").upsert(
                    rows,
                    on_conflict="trade_date,symbol",
                ).execute()
        except Exception as e:
            logger.warning(f"Failed to save daily universe: {e}")

    async def _cache_candles(self, symbol: str, df: pd.DataFrame) -> None:
        try:
            rows = []
            for idx, row in df.tail(200).iterrows():
                rows.append({
                    "stock_symbol": symbol,
                    "exchange": "NSE",
                    "interval": "1d",
                    "timestamp": idx.isoformat(),
                    "open": float(row["open"]),
                    "high": float(row["high"]),
                    "low": float(row["low"]),
                    "close": float(row["close"]),
                    "volume": int(row["volume"]),
                    "source": "yfinance"
                })
            self.supabase.table("candles").upsert(rows, on_conflict="stock_symbol,interval,timestamp").execute()
        except Exception as e:
            logger.debug(f"Failed to cache candles for {symbol}: {e}")

    async def _cache_features(self, symbol: str, df: pd.DataFrame, feature_set: str = "prd_v1") -> None:
        try:
            rows = []
            for idx, row in df.tail(200).iterrows():
                rows.append({
                    "stock_symbol": symbol,
                    "interval": "1d",
                    "timestamp": idx.isoformat(),
                    "feature_set": feature_set,
                    "features": row.replace([np.inf, -np.inf], np.nan).fillna(0).to_dict()
                })
            self.supabase.table("features").upsert(rows, on_conflict="stock_symbol,interval,timestamp,feature_set").execute()
        except Exception as e:
            logger.debug(f"Failed to cache features for {symbol}: {e}")

    def _build_tft_frame(self, features_df: pd.DataFrame, symbol: str) -> pd.DataFrame:
        """Prepare TFT inference frame with future known covariates."""
        df = features_df.copy().reset_index().rename(columns={"index": "timestamp"})
        df["group_id"] = symbol
        df["time_idx"] = range(len(df))
        df["day_of_week"] = df["timestamp"].dt.dayofweek
        df["week_number"] = df["timestamp"].dt.isocalendar().week.astype(int)
        df["is_holiday"] = 0
        df["is_expiry_day"] = (df["timestamp"].dt.dayofweek == 3).astype(int)
        df["trading_days_left"] = (5 - df["timestamp"].dt.dayofweek).clip(lower=0)

        # Add future rows (next 5 trading days)
        last_time = df["timestamp"].iloc[-1]
        last_idx = df["time_idx"].iloc[-1]
        future_rows = []
        for i in range(1, 6):
            ts = last_time + pd.Timedelta(days=i)
            future_rows.append({
                "timestamp": ts,
                "group_id": symbol,
                "time_idx": last_idx + i,
                "day_of_week": ts.dayofweek,
                "week_number": ts.isocalendar().week,
                "is_holiday": 0,
                "is_expiry_day": 1 if ts.dayofweek == 3 else 0,
                "trading_days_left": max(0, 5 - ts.dayofweek),
            })
        future_df = pd.DataFrame(future_rows)
        full = pd.concat([df, future_df], ignore_index=True)
        return full

    def _score_tft_quantiles(self, quantiles: Dict[str, list], entry: float, direction: str) -> float:
        """
        Score TFT quantiles into a 0-100 confidence.
        Uses upside vs downside balance relative to entry.
        """
        if not quantiles:
            return 50.0
        q10 = quantiles.get("0.1", [])
        q90 = quantiles.get("0.9", [])
        if not q10 or not q90:
            return 50.0

        max_q90 = max(q90)
        min_q10 = min(q10)

        if direction == "SHORT":
            favorable = entry - min_q10
            unfavorable = max_q90 - entry
        else:
            favorable = max_q90 - entry
            unfavorable = entry - min_q10

        total = favorable + unfavorable
        if total <= 0:
            return 50.0
        score = (favorable / total) * 100
        return float(max(0.0, min(100.0, score)))

    def _combine_confidence(
        self,
        strategy_conf: float,
        xgb_score: Optional[float],
        tft_score: Optional[float],
    ) -> float:
        weights = {
            "strategy": self.strategy_weight,
            "xgb": self.xgb_weight,
            "tft": self.tft_weight,
        }
        if xgb_score is None:
            weights["strategy"] += weights["xgb"]
            weights["xgb"] = 0.0
        if tft_score is None:
            weights["strategy"] += weights["tft"]
            weights["tft"] = 0.0

        total = weights["strategy"] + weights["xgb"] + weights["tft"]
        if total <= 0:
            return float(strategy_conf)

        combined = (
            strategy_conf * weights["strategy"]
            + (xgb_score or 0) * weights["xgb"]
            + (tft_score or 0) * weights["tft"]
        ) / total
        return float(max(0.0, min(100.0, combined)))

    async def _get_candidates(self) -> List[str]:
        """Get stock candidates from PKScreener or fallback"""
        try:
            # Try fetching from PKScreener GitHub Actions results
            async with httpx.AsyncClient() as client:
                url = "https://raw.githubusercontent.com/pkjmesra/PKScreener/actions-data-download/actions-data-scan/PKScreener-result_6.csv"
                response = await client.get(url, timeout=30)
                
                if response.status_code == 200:
                    # Parse CSV
                    lines = response.text.strip().split('\n')
                    if len(lines) > 1:
                        # Extract symbols from first column
                        candidates = []
                        for line in lines[1:51]:  # Top 50
                            parts = line.split(',')
                            if parts:
                                symbol = parts[0].strip().replace('.NS', '').replace('"', '')
                                if symbol and symbol.isalpha():
                                    candidates.append(symbol)
                        return candidates
        except Exception as e:
            logger.warning(f"PKScreener fetch failed: {e}")
        
        return self._get_fallback_candidates()
    
    def _get_fallback_candidates(self) -> List[str]:
        """Fallback candidate list when PKScreener unavailable"""
        return [
            # Large caps
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
            "BHARTIARTL", "SBIN", "KOTAKBANK", "LT", "AXISBANK",
            # Mid caps with momentum
            "TRENT", "POLYCAB", "PERSISTENT", "DIXON", "TATAELXSI",
            "ASTRAL", "COFORGE", "LALPATHLAB", "MUTHOOTFIN", "INDHOTEL",
            # F&O stocks for shorts
            "TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "TATAMOTORS",
            "ABB", "SIEMENS", "HAL", "BEL", "IRCTC"
        ]
    
    async def _get_market_data(self) -> Dict:
        """Fetch current market data"""
        try:
            today = date.today().isoformat()
            result = self.supabase.table("market_data").select("*").eq("date", today).single().execute()
            
            if result.data:
                return result.data
        except:
            pass
        
        # Return default if not available
        return {
            "nifty_close": 21500,
            "vix_close": 14.5,
            "market_trend": "SIDEWAYS",
            "risk_level": "MODERATE",
            "fii_cash": 0,
            "dii_cash": 0
        }
    
    async def _calculate_features(
        self, 
        candidates: List[str], 
        market_data: Dict
    ) -> List[Dict]:
        """Calculate features for AI models"""
        features_list = []
        
        for symbol in candidates:
            try:
                features = await self._get_stock_features(symbol)
                if features:
                    features["market_vix"] = market_data.get("vix_close", 15)
                    features["market_trend"] = market_data.get("market_trend", "SIDEWAYS")
                    features["fii_flow"] = market_data.get("fii_cash", 0)
                    features_list.append(features)
            except Exception as e:
                logger.warning(f"Failed to get features for {symbol}: {e}")
        
        return features_list
    
    async def _get_stock_features(self, symbol: str) -> Optional[Dict]:
        """
        Calculate technical features for a stock
        In production, this would fetch real-time data from broker API
        """
        # Simulated features - replace with real data in production
        import random
        
        base_price = random.uniform(100, 5000)
        
        return {
            "symbol": symbol,
            "price": base_price,
            "open": base_price * (1 + random.uniform(-0.02, 0.02)),
            "high": base_price * (1 + random.uniform(0, 0.03)),
            "low": base_price * (1 - random.uniform(0, 0.03)),
            "volume": random.randint(100000, 5000000),
            "volume_sma_20": random.randint(80000, 4000000),
            
            # Technical indicators
            "rsi_14": random.uniform(30, 70),
            "macd": random.uniform(-5, 5),
            "macd_signal": random.uniform(-5, 5),
            "macd_hist": random.uniform(-2, 2),
            "bb_upper": base_price * 1.05,
            "bb_lower": base_price * 0.95,
            "bb_mid": base_price,
            "atr_14": base_price * random.uniform(0.01, 0.03),
            
            # Moving averages
            "sma_20": base_price * (1 + random.uniform(-0.05, 0.05)),
            "sma_50": base_price * (1 + random.uniform(-0.1, 0.1)),
            "sma_200": base_price * (1 + random.uniform(-0.15, 0.15)),
            "ema_9": base_price * (1 + random.uniform(-0.02, 0.02)),
            "ema_21": base_price * (1 + random.uniform(-0.04, 0.04)),
            
            # Price action
            "prev_close": base_price * (1 + random.uniform(-0.02, 0.02)),
            "change_percent": random.uniform(-3, 3),
            "gap_percent": random.uniform(-1, 1),
            
            # Support/Resistance
            "support_1": base_price * 0.97,
            "resistance_1": base_price * 1.03,
            
            # Trend
            "adx": random.uniform(15, 40),
            "plus_di": random.uniform(10, 35),
            "minus_di": random.uniform(10, 35),
        }
    
    async def _run_inference(self, features_list: List[Dict]) -> List[Dict]:
        """
        Run AI model inference
        Uses Modal endpoint if available, otherwise uses rule-based fallback
        """
        if self.modal_endpoint:
            try:
                return await self._run_modal_inference(features_list)
            except Exception as e:
                logger.warning(f"Modal inference failed: {e}, using fallback")
        
        return self._run_fallback_inference(features_list)
    
    async def _run_modal_inference(self, features_list: List[Dict]) -> List[Dict]:
        """Run inference via Modal endpoint"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.modal_endpoint}/predict",
                json={"features": features_list},
                timeout=60
            )
            response.raise_for_status()
            return response.json()["predictions"]
    
    def _run_fallback_inference(self, features_list: List[Dict]) -> List[Dict]:
        """
        Rule-based fallback when AI models unavailable
        Uses technical analysis rules to generate signals
        """
        predictions = []
        
        for features in features_list:
            symbol = features["symbol"]
            price = features["price"]
            rsi = features["rsi_14"]
            macd_hist = features["macd_hist"]
            adx = features["adx"]
            plus_di = features["plus_di"]
            minus_di = features["minus_di"]
            sma_20 = features["sma_20"]
            sma_50 = features["sma_50"]
            volume = features["volume"]
            volume_sma = features["volume_sma_20"]
            
            # Calculate scores (0-100)
            catboost_score = 50.0
            tft_score = 50.0
            stockformer_score = 50.0
            direction = "NEUTRAL"
            reasons = []
            
            # RSI signals
            if rsi < 35:
                catboost_score += 15
                tft_score += 10
                reasons.append("RSI oversold")
            elif rsi > 65:
                catboost_score -= 10
                tft_score -= 10
                reasons.append("RSI overbought")
            
            # MACD signals
            if macd_hist > 0:
                catboost_score += 10
                stockformer_score += 10
                reasons.append("MACD bullish")
            elif macd_hist < 0:
                catboost_score -= 10
                stockformer_score -= 10
                reasons.append("MACD bearish")
            
            # Trend strength (ADX)
            if adx > 25:
                if plus_di > minus_di:
                    tft_score += 15
                    stockformer_score += 10
                    reasons.append("Strong uptrend")
                else:
                    tft_score -= 15
                    stockformer_score -= 10
                    reasons.append("Strong downtrend")
            
            # Moving average alignment
            if price > sma_20 > sma_50:
                catboost_score += 10
                tft_score += 10
                reasons.append("Price above MAs")
            elif price < sma_20 < sma_50:
                catboost_score -= 10
                tft_score -= 10
                reasons.append("Price below MAs")
            
            # Volume confirmation
            if volume > volume_sma * 1.5:
                catboost_score += 5
                reasons.append("High volume")
            
            # Determine direction
            avg_score = (catboost_score + tft_score + stockformer_score) / 3
            
            if avg_score >= 60:
                direction = "LONG"
            elif avg_score <= 40:
                direction = "SHORT"
            else:
                direction = "NEUTRAL"
            
            # Count model agreement
            model_agreement = 0
            if catboost_score >= 55 and direction == "LONG":
                model_agreement += 1
            if tft_score >= 55 and direction == "LONG":
                model_agreement += 1
            if stockformer_score >= 55 and direction == "LONG":
                model_agreement += 1
            if catboost_score <= 45 and direction == "SHORT":
                model_agreement += 1
            if tft_score <= 45 and direction == "SHORT":
                model_agreement += 1
            if stockformer_score <= 45 and direction == "SHORT":
                model_agreement += 1
            
            predictions.append({
                "symbol": symbol,
                "price": price,
                "direction": direction,
                "catboost_score": min(100, max(0, catboost_score)),
                "tft_score": min(100, max(0, tft_score)),
                "stockformer_score": min(100, max(0, stockformer_score)),
                "model_agreement": model_agreement,
                "reasons": reasons,
                "features": features
            })
        
        return predictions

    def _get_enhanced_generator(self):
        """Lazily initialize the enhanced AI core"""
        if self._enhanced_generator:
            return self._enhanced_generator
        try:
            from ml.inference.enhanced_signal_generator import EnhancedSignalGenerator
        except Exception as e:
            logger.error(f"Enhanced AI import failed: {e}")
            return None

        self._enhanced_generator = EnhancedSignalGenerator(
            modal_endpoint=self.enhanced_modal_endpoint or None
        )
        return self._enhanced_generator

    @staticmethod
    def _strip_exchange_suffix(symbol: str) -> str:
        """Normalize symbols to NSE ticker without suffix."""
        if symbol.endswith(".NS"):
            return symbol[:-3]
        return symbol

    @staticmethod
    def _map_agreement_score(agreement_score: float) -> int:
        """Map agreement score (0-100) to the 0-3 bucket used in signals."""
        if agreement_score >= 80:
            return 3
        if agreement_score >= 65:
            return 2
        if agreement_score >= 50:
            return 1
        return 0

    async def _generate_enhanced_signals(
        self,
        candidates: List[str],
        market_data: Dict,
    ) -> List[GeneratedSignal]:
        """Generate signals using the enhanced AI core."""
        enhanced_generator = self._get_enhanced_generator()
        if not enhanced_generator:
            return []

        account_value = float(os.getenv("ENHANCED_AI_ACCOUNT_VALUE", "1000000"))
        portfolio_positions: List[Dict] = []
        recent_trades: List[Dict] = []
        signals: List[GeneratedSignal] = []

        for symbol in candidates:
            yf_symbol = symbol if symbol.endswith(".NS") else f"{symbol}.NS"
            enhanced_signal = await enhanced_generator.generate_signal(
                yf_symbol,
                account_value,
                portfolio_positions,
                recent_trades,
                market_data,
            )

            if (
                not enhanced_signal
                or str(getattr(enhanced_signal, "direction", "")).upper() != "LONG"
            ):
                continue

            if enhanced_signal.ai_confidence < self.min_confidence:
                continue

            risk_reward = enhanced_signal.risk_reward_ratio or 0
            if risk_reward and risk_reward < self.min_risk_reward:
                continue

            model_predictions = enhanced_signal.model_predictions or {}
            tft_score = float(model_predictions.get("TFT", enhanced_signal.ai_confidence))
            xgb_score = float(model_predictions.get("XGBoost", enhanced_signal.ai_confidence))
            rf_score = float(
                model_predictions.get(
                    "RandomForest",
                    model_predictions.get("SVM", enhanced_signal.ai_confidence),
                )
            )
            model_agreement = self._map_agreement_score(enhanced_signal.agreement_score)

            if model_agreement < 2:
                continue

            reasons = [
                "Enhanced AI core",
                f"Grade:{enhanced_signal.signal_grade}",
                "Direction:LONG",
                "Segment:EQUITY",
                f"Agreement:{round(enhanced_signal.agreement_score, 1)}",
            ]
            if enhanced_signal.validation_score:
                reasons.append(f"Validation:{round(enhanced_signal.validation_score, 1)}")

            is_premium = enhanced_signal.signal_grade in ["PREMIUM", "EXCELLENT"]

            signal = GeneratedSignal(
                symbol=self._strip_exchange_suffix(enhanced_signal.symbol),
                exchange="NSE",
                segment="EQUITY",
                direction="LONG",
                confidence=round(enhanced_signal.ai_confidence, 2),
                entry_price=round(enhanced_signal.entry_price, 2),
                stop_loss=round(enhanced_signal.stop_loss, 2),
                target_1=round(enhanced_signal.target_1, 2),
                target_2=round(enhanced_signal.target_2, 2),
                target_3=None,
                risk_reward=round(risk_reward, 2) if risk_reward else None,
                catboost_score=round(xgb_score, 2),
                tft_score=round(tft_score, 2),
                stockformer_score=round(rf_score, 2),
                model_agreement=model_agreement,
                reasons=reasons,
                is_premium=is_premium,
                lot_size=self.fo_lot_sizes.get(symbol),
            )

            signals.append(signal)

        signals.sort(key=lambda x: x.confidence, reverse=True)
        return signals
    
    def _create_signals(
        self, 
        predictions: List[Dict],
        market_data: Dict
    ) -> List[GeneratedSignal]:
        """Create trading signals from model predictions"""
        signals = []
        vix = market_data.get("vix_close", 15)
        
        for pred in predictions:
            if pred["direction"] == "NEUTRAL":
                continue
            
            # Calculate confidence
            confidence = (
                pred["catboost_score"] * 0.35 +
                pred["tft_score"] * 0.35 +
                pred["stockformer_score"] * 0.30
            )
            
            # Skip low confidence
            if confidence < self.min_confidence:
                continue
            
            # Skip if less than 2 models agree
            if pred["model_agreement"] < 2:
                continue
            
            symbol = pred["symbol"]
            price = pred["price"]
            direction = pred["direction"]
            features = pred.get("features", {})
            
            # Calculate entry, SL, targets
            atr = features.get("atr_14", price * 0.02)
            
            if direction == "LONG":
                entry_price = price
                stop_loss = price - (atr * 1.5)
                target_1 = price + (atr * 2)
                target_2 = price + (atr * 3)
                target_3 = price + (atr * 4)
            else:  # SHORT
                entry_price = price
                stop_loss = price + (atr * 1.5)
                target_1 = price - (atr * 2)
                target_2 = price - (atr * 3)
                target_3 = price - (atr * 4)
            
            # Calculate risk:reward
            risk = abs(entry_price - stop_loss)
            reward = abs(target_1 - entry_price)
            risk_reward = reward / risk if risk > 0 else 0
            
            # Skip poor R:R
            if risk_reward < self.min_risk_reward:
                continue
            
            # Adjust for VIX
            if vix > 20:
                # Widen stops in high volatility
                if direction == "LONG":
                    stop_loss = price - (atr * 2)
                else:
                    stop_loss = price + (atr * 2)
            
            # Determine if premium signal
            is_premium = confidence >= 75 or pred["model_agreement"] == 3
            
            signal = GeneratedSignal(
                symbol=symbol,
                exchange="NSE",
                segment="EQUITY",
                direction=direction,
                confidence=round(confidence, 2),
                entry_price=round(entry_price, 2),
                stop_loss=round(stop_loss, 2),
                target_1=round(target_1, 2),
                target_2=round(target_2, 2),
                target_3=round(target_3, 2),
                risk_reward=round(risk_reward, 2),
                catboost_score=round(pred["catboost_score"], 2),
                tft_score=round(pred["tft_score"], 2),
                stockformer_score=round(pred["stockformer_score"], 2),
                model_agreement=pred["model_agreement"],
                reasons=pred["reasons"],
                is_premium=is_premium,
                lot_size=self.fo_lot_sizes.get(symbol)
            )
            
            signals.append(signal)
        
        # Sort by confidence
        signals.sort(key=lambda x: x.confidence, reverse=True)
        
        return signals
    
    async def _save_signals(self, signals: List[GeneratedSignal], signal_date: Optional[date] = None) -> None:
        """Save generated signals to database"""
        today = (signal_date or date.today()).isoformat()
        
        for signal in signals:
            try:
                existing = self.supabase.table("signals").select("id").eq(
                    "date", today
                ).eq("symbol", signal.symbol).eq("direction", signal.direction).eq("status", "active").execute()
                if existing.data:
                    continue

                data = {
                    "symbol": signal.symbol,
                    "exchange": signal.exchange,
                    "segment": signal.segment,
                    "direction": signal.direction,
                    "confidence": signal.confidence,
                    "entry_price": signal.entry_price,
                    "stop_loss": signal.stop_loss,
                    "target_1": signal.target_1,
                    "target_2": signal.target_2,
                    "target_3": signal.target_3,
                    "risk_reward": signal.risk_reward,
                    "catboost_score": signal.catboost_score,
                    "tft_score": signal.tft_score,
                    "stockformer_score": signal.stockformer_score,
                    "model_agreement": signal.model_agreement,
                    "reasons": signal.reasons,
                    "is_premium": signal.is_premium,
                    "lot_size": signal.lot_size,
                    "strategy_names": getattr(signal, "_strategy_names", signal.reasons),
                    "tft_prediction": getattr(signal, "_tft_prediction", {}),
                    "date": today,
                    "status": "active",
                    "generated_at": datetime.utcnow().isoformat()
                }
                
                self.supabase.table("signals").insert(data).execute()
                
            except Exception as e:
                logger.error(f"Failed to save signal for {signal.symbol}: {e}")
    
    async def get_today_signals(
        self, 
        segment: Optional[str] = None,
        direction: Optional[str] = None,
        is_premium: Optional[bool] = None
    ) -> List[Dict]:
        """Fetch today's signals from database"""
        today = date.today().isoformat()
        
        query = self.supabase.table("signals").select("*").eq("date", today).eq("status", "active")
        
        if segment:
            query = query.eq("segment", segment)
        if direction:
            query = query.eq("direction", direction)
        if is_premium is not None:
            query = query.eq("is_premium", is_premium)
        
        result = query.order("confidence", desc=True).execute()
        return result.data or []


# ============================================================================
# USAGE
# ============================================================================

async def main():
    """Test signal generation"""
    from supabase import create_client
    
    supabase = create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_SERVICE_KEY", "")
    )
    
    generator = SignalGenerator(supabase)
    signals = await generator.generate_daily_signals()
    
    print(f"\n{'='*60}")
    print(f"GENERATED {len(signals)} SIGNALS")
    print(f"{'='*60}")
    
    for signal in signals[:5]:
        print(f"\n{signal.symbol} - {signal.direction}")
        print(f"  Confidence: {signal.confidence}%")
        print(f"  Entry: ₹{signal.entry_price}")
        print(f"  SL: ₹{signal.stop_loss}")
        print(f"  Target: ₹{signal.target_1}")
        print(f"  R:R: {signal.risk_reward}")
        print(f"  Reasons: {', '.join(signal.reasons)}")


if __name__ == "__main__":
    asyncio.run(main())
