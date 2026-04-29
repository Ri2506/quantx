"""
================================================================================
SWING AI SIGNAL GENERATION SERVICE
================================================================================
Generates trading signals using 6 backtested strategies:
1. Each strategy scans independently for setups
2. ML meta-labeler filters weak pattern breakouts
3. Best signal per symbol (deduplication)
4. Signals saved to Supabase for frontend display

Strategies (backtested on 419 stocks x 5 years):
- BOS_Structure: 46% WR, PF 1.35 (Break of market structure)
- Volume_Reversal: 42.6% WR, PF 1.08 (Wyckoff VPA)
- Trend_Pullback: 36.9% WR (MA pullback in uptrend)
- Reversal_Patterns: 35% WR, PF 1.04 (IHS, double bottom, cup & handle)
- Candle_Reversal: 32% WR (Candlestick at support)
- Consolidation_Breakout: 32.4% WR + ML filter (Pattern breakouts)
================================================================================
"""

import os
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

try:
    from .universe_screener import UniverseScreener
except ImportError:
    UniverseScreener = None

try:
    from .fo_trading_engine import FOTradingEngine, NSE_LOT_SIZES
    from .instrument_master import InstrumentMaster
except ImportError:
    FOTradingEngine = None
    NSE_LOT_SIZES = {}
    InstrumentMaster = None

try:
    from ml.regime_detector import MarketRegimeDetector, compute_regime_features
except ImportError:
    MarketRegimeDetector = None
    compute_regime_features = None

try:
    from .sentiment_engine import SentimentEngine
except ImportError:
    SentimentEngine = None

try:
    from .model_registry import LGBMGate, LGBM_FEATURE_ORDER
    from .feature_engineering import compute_features, split_feature_sets, build_feature_row
except ImportError:
    LGBMGate = None
    LGBM_FEATURE_ORDER = None
    compute_features = None
    split_feature_sets = None
    build_feature_row = None

try:
    from .model_registry import TFTPredictor
except ImportError:
    TFTPredictor = None

# Registry compat resolver — B2 first, disk fallback (PR 4)
try:
    from ..ai.registry import resolve_model_file
except ImportError:
    resolve_model_file = None

# HMM bear-regime final confidence multiplier (Step 2 §1.12).
_BEAR_REGIME_CONFIDENCE_GATE = 0.6


@dataclass
class GeneratedSignal:
    """
    Generated trading signal.

    DB column mapping (legacy names retained for Supabase compatibility):
      catboost_score    → ML meta-labeler (RandomForest) breakout probability (0-1)
      tft_score         → TFT price-forecast bullish score (0-1)
      stockformer_score → Raw strategy confidence (0-100)
    """
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
    catboost_score: float      # DB: catboost_score → actually ML meta-labeler (RandomForest) (0-1)
    tft_score: float           # DB: tft_score → TFT forecast bullish score (0-1)
    stockformer_score: float   # DB: stockformer_score → raw strategy confidence (0-100)
    lgbm_score: float          # LightGBM BUY probability (0-1)
    model_agreement: int       # 1=strategy only, 2+=more models agree
    reasons: List[str]
    is_premium: bool
    strategy_name: str = ""    # Primary strategy that generated this signal
    tft_prediction: Optional[Dict] = None  # TFT quantile forecast (p10, p50, p90)
    lot_size: Optional[int] = None
    expiry_date: Optional[date] = None
    strategy_catalog_id: Optional[str] = None  # Links to strategy_catalog for marketplace deployments
    strike_price: Optional[float] = None
    option_type: Optional[str] = None
    # PR 4 — HMM/shadow-model columns (see PR 2 migration).
    regime_at_signal: Optional[str] = None    # 'bull' / 'sideways' / 'bear'
    regime_snapshot: Optional[Dict] = None    # full regime_info dict at signal time
    lgbm_buy_prob: Optional[float] = None     # LGBMGate SHADOW buy probability (0-1)


class SignalGenerator:
    """
    Signal generation service.
    Orchestrates 6 strategies → ML filter → dedup → save to Supabase.
    """

    def __init__(
        self,
        supabase_client,
        min_confidence: float = 40.0,
        min_risk_reward: float = 1.0,
        **kwargs,  # Accept and ignore legacy params (modal_endpoint, use_enhanced_ai, etc.)
    ):
        self.supabase = supabase_client
        self.min_confidence = min_confidence
        self.min_risk_reward = min_risk_reward

        # Strategy name → catalog ID mapping (loaded on first use)
        self._strategy_catalog_map: Optional[Dict[str, str]] = None

        # ---------------------------------------------------------------
        # Model loading — registry (B2) first, disk fallback for dev/CI.
        # See src/backend/ai/registry/compat.py.
        # PR 3 registered these artifacts as v1; PR 4 wires them in here.
        # ---------------------------------------------------------------

        def _resolve(model_name: str, filename: str) -> Optional[Path]:
            if resolve_model_file is None:
                path = ROOT_DIR / "ml" / "models" / filename
                return path if path.exists() else None
            return resolve_model_file(
                model_name,
                filename,
                ROOT_DIR / "ml" / "models" / filename,
            )

        # Breakout meta-labeler (PROD — Scanner Lab only, not signal alpha).
        self._ml_labeler = None
        try:
            from ml.features.patterns import BreakoutMetaLabeler
            model_path = _resolve("breakout_meta_labeler", "breakout_meta_labeler.pkl")
            if model_path is not None:
                labeler = BreakoutMetaLabeler()
                labeler.load(str(model_path))
                if labeler.is_trained:
                    self._ml_labeler = labeler
                    logger.info("ML meta-labeler loaded for pattern filtering")
        except Exception as e:
            logger.warning(f"ML labeler load failed: {e}")

        # LGBM gate (SHADOW — predictions logged but not in ensemble score).
        self._lgbm_gate = None
        try:
            if LGBMGate is not None:
                lgbm_path = _resolve("lgbm_signal_gate", "lgbm_signal_gate.txt")
                if lgbm_path is not None:
                    self._lgbm_gate = LGBMGate(str(lgbm_path))
                    logger.info("LGBMGate loaded (SHADOW — shadow predictions only)")
        except Exception as e:
            logger.warning(f"LGBMGate load failed (will skip LGBM scoring): {e}")

        # HMM regime detector (PROD — drives regime_at_signal + bear gate).
        self._regime_detector = None
        try:
            if MarketRegimeDetector is not None:
                regime_path = _resolve("regime_hmm", "regime_hmm.pkl")
                if regime_path is not None:
                    detector = MarketRegimeDetector()
                    detector.load(str(regime_path))
                    if detector.is_trained:
                        self._regime_detector = detector
                        logger.info("HMM regime detector loaded (PROD)")
        except Exception as e:
            logger.warning(f"Regime detector load failed (defaulting to bull): {e}")

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

        self.fo_lot_sizes = {
            "NIFTY": 25, "BANKNIFTY": 15, "RELIANCE": 250, "TCS": 150,
            "HDFCBANK": 550, "INFY": 300, "ICICIBANK": 700, "SBIN": 750,
            "TATASTEEL": 425, "TRENT": 385, "POLYCAB": 200
        }

        # TFT price forecaster (SHADOW — predictions logged, not in ensemble).
        # TFT v1 is under-parameterized (hidden_size=32, 100 stocks); v2
        # trains in Weeks 1-2 on Colab, then is_prod flips to v2.
        self._tft_predictor = None
        try:
            if TFTPredictor is not None:
                tft_ckpt = _resolve("tft_swing", "tft_model.ckpt")
                tft_config = _resolve("tft_swing", "tft_config.json")
                if tft_ckpt is not None and tft_config is not None:
                    self._tft_predictor = TFTPredictor(str(tft_ckpt), str(tft_config))
                    logger.info("TFT price forecaster loaded (SHADOW)")
        except Exception as e:
            logger.warning(f"TFT load failed (will skip TFT predictions): {e}")

        # Ensemble meta-learner — retired. ensemble_meta_learner.pkl is an
        # unused orphan per Step 1 §6 / Step 2 §10. Confidence is now a
        # deterministic weighted formula in _compute_ensemble_score.
        self._ensemble_model = None

        # Sentiment engine (optional — degrades gracefully)
        self._sentiment_engine = None
        if SentimentEngine is not None:
            try:
                self._sentiment_engine = SentimentEngine(
                    gemini_api_key=getattr(settings, "GEMINI_API_KEY", ""),
                    model=getattr(settings, "GEMINI_MODEL", "gemini-2.0-flash"),
                )
                logger.info("SentimentEngine initialised")
            except Exception as e:
                logger.warning(f"SentimentEngine init failed: {e}")

    # ========================================================================
    # PUBLIC API
    # ========================================================================

    async def generate_daily_signals(self) -> List[GeneratedSignal]:
        """Main entry point — generates all signals for the day."""
        logger.info("Starting daily signal generation...")
        try:
            signals = await self.generate_intraday_signals(save=True)
            logger.info(f"Generated {len(signals)} signals for today")
            return signals
        except Exception as e:
            logger.error(f"Signal generation failed: {e}")
            raise

    async def generate_eod_signals(self, signal_date: Optional[date] = None) -> List[GeneratedSignal]:
        """End-of-day scan. Signals are saved for the next trading day."""
        result = await self.run_eod_scan(signal_date=signal_date)
        return result.get("signals", [])

    async def run_eod_scan(
        self,
        signal_date: Optional[date] = None,
        run_id: Optional[str] = None,
    ) -> Dict[str, object]:
        """Run EOD scan, persist candidate universe, and generate signals."""
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

    # ========================================================================
    # CORE SIGNAL GENERATION
    # ========================================================================

    async def generate_intraday_signals(
        self,
        save: bool = False,
        candidates: Optional[List[str]] = None,
        signal_date: Optional[date] = None,
    ) -> List[GeneratedSignal]:
        """
        Strategy-first pipeline: 6 strategies scan each stock.
        ML meta-labeler filters weak pattern breakouts.
        Deduplicates to best signal per symbol.
        """
        logger.info("Starting signal generation with 6 strategies...")

        candidates = candidates or self._load_universe()
        signals: List[GeneratedSignal] = []
        provider = get_market_data_provider()
        strategies = get_all_strategies(ml_labeler=self._ml_labeler)

        # --- HMM Regime Detection ---
        regime_info = None
        strategy_weights = {}
        if self._regime_detector and compute_regime_features is not None:
            try:
                provider_reg = get_market_data_provider()
                nifty = provider_reg.get_historical("NIFTY", period="6mo", interval="1d")
                if nifty is not None and len(nifty) >= 30:
                    nifty.columns = [c.lower() for c in nifty.columns]
                    vix = None
                    try:
                        vix = provider_reg.get_historical("VIX", period="6mo", interval="1d")
                        if vix is not None and len(vix) > 0:
                            vix.columns = [c.lower() for c in vix.columns]
                    except Exception:
                        pass
                    features = compute_regime_features(nifty, vix)
                    regime_info = self._regime_detector.predict_regime(features)
                    strategy_weights = self._regime_detector.get_strategy_weights(regime_info["regime_id"])
                    logger.info(
                        "Market regime: %s (confidence=%.2f)",
                        regime_info["regime"], regime_info["confidence"],
                    )
            except Exception as e:
                logger.warning(f"Regime detection failed, defaulting to bull: {e}")

        # Default: all strategies at full weight (bull regime)
        if not strategy_weights:
            from ml.regime_detector import ALL_STRATEGIES as _ALL_STRATS
            strategy_weights = {s: 1.0 for s in _ALL_STRATS}

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

                # Scan with all 6 strategies
                trade_signals = scan_stock(hist, symbol, strategies)
                await self._cache_candles(symbol, hist)

                # Pre-compute LGBM features for this stock (once per symbol)
                lgbm_buy_prob = 0.0
                lgbm_direction = "HOLD"
                if self._lgbm_gate is not None and compute_features is not None:
                    try:
                        feat_df = compute_features(hist)
                        feat_row = build_feature_row(feat_df)
                        lgbm_feats, _ = split_feature_sets(feat_row)
                        lgbm_direction, _, lgbm_probs = self._lgbm_gate.predict(lgbm_feats)
                        lgbm_buy_prob = lgbm_probs.get("buy", 0.0) / 100.0  # normalize to 0-1
                    except Exception as e:
                        logger.debug(f"LGBM scoring failed for {symbol}: {e}")

                # Pre-compute TFT forecast for this stock (once per symbol)
                tft_result = None
                tft_score = 0.0
                if self._tft_predictor is not None:
                    try:
                        tft_result = self._tft_predictor.predict_for_stock(hist, symbol)
                        if tft_result:
                            tft_score = tft_result.get("score", 0.0)
                    except Exception as e:
                        logger.debug(f"TFT prediction failed for {symbol}: {e}")

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

                    # Regime-based strategy filtering
                    regime_weight = strategy_weights.get(ts.strategy, 1.0)
                    if regime_weight == 0.0:
                        logger.debug(
                            "Skipping %s signal for %s (regime weight=0)",
                            ts.strategy, symbol,
                        )
                        continue

                    entry = ts.entry_price
                    stop_loss = ts.stop_loss
                    target_1 = ts.target
                    # Compute target 2 and 3 as extensions
                    risk = abs(entry - stop_loss)
                    target_2 = round(entry + 2.5 * risk, 2) if risk > 0 else target_1
                    target_3 = round(entry + 3.5 * risk, 2) if risk > 0 else target_1

                    # ML meta-labeler score (set by ConsolidationBreakout/ReversalPatterns)
                    ml_score = getattr(ts, 'ml_score', -1.0)
                    if ml_score is None or (isinstance(ml_score, float) and ml_score != ml_score):
                        ml_score = 0.0  # NaN safety

                    # Regime id for ensemble input (default bull=0)
                    current_regime_id = regime_info["regime_id"] if regime_info else 0

                    # Ensemble confidence (LGBM + TFT are SHADOW in PR 4).
                    confidence = self._compute_ensemble_score(
                        strategy_conf=strategy_conf,
                        ml_score=max(0, ml_score),  # clamp -1 sentinel to 0
                        regime_id=current_regime_id,
                        sentiment_score=0.0,  # sentiment applied post-dedup
                    )

                    # Apply regime confidence penalty for reduced-weight strategies
                    if regime_weight < 1.0:
                        penalty = (1.0 - regime_weight) * 20.0
                        confidence = max(0, confidence - penalty)

                    # Step 2 §1.12 — HMM bear-regime size gate for LONG signals.
                    # Multiplied on top of all other scoring; position-size halving
                    # is handled by TradeExecutionService via the regime tag.
                    if regime_info and regime_info["regime"] == "bear":
                        confidence = confidence * _BEAR_REGIME_CONFIDENCE_GATE

                    # Floor: never go below 30% of raw strategy confidence
                    # Ensemble can down-weight but shouldn't zero-out valid signals
                    confidence = max(confidence, strategy_conf * 0.3)

                    # Model agreement: count computed models that concur with
                    # the BUY direction (even shadow models contribute to the
                    # display chip — they just don't shape the confidence).
                    model_agreement = 1  # strategy always counts
                    if ml_score >= 0.35:
                        model_agreement += 1  # BreakoutMetaLabeler (PROD) agrees
                    if lgbm_direction == "BUY":
                        model_agreement += 1  # LGBMGate (SHADOW) agrees
                    if tft_result and tft_result.get("direction") == "bullish":
                        model_agreement += 1  # TFT v1 (SHADOW) forecasts bullish

                    regime_tag = f"Regime:{regime_info['regime']}" if regime_info else "Regime:bull"
                    reasons = ts.reasons + [
                        f"Strategy:{ts.strategy}",
                        f"Direction:LONG",
                        f"Segment:EQUITY",
                        regime_tag,
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
                        catboost_score=round(max(0, ml_score), 2),
                        tft_score=round(tft_score, 4),
                        stockformer_score=round(strategy_conf, 2),
                        lgbm_score=round(lgbm_buy_prob, 4),
                        model_agreement=model_agreement,
                        reasons=reasons,
                        is_premium=is_premium,
                        strategy_name=ts.strategy,
                        tft_prediction=tft_result,
                        regime_at_signal=(regime_info or {}).get("regime") or "bull",
                        regime_snapshot=regime_info,
                        lgbm_buy_prob=round(lgbm_buy_prob, 4),
                    )

                    signals.append(signal)
            except Exception as e:
                logger.warning(f"Signal generation failed for {symbol}: {e}")

        # Deduplicate: keep highest-confidence signal per symbol
        best_per_symbol: Dict[str, GeneratedSignal] = {}
        for sig in signals:
            existing = best_per_symbol.get(sig.symbol)
            if existing is None or sig.confidence > existing.confidence:
                best_per_symbol[sig.symbol] = sig
        signals = list(best_per_symbol.values())

        # ---- Sentiment adjustment ----
        if self._sentiment_engine and signals:
            try:
                signal_symbols = [s.symbol for s in signals]
                sentiment_map = await self._sentiment_engine.batch_sentiment(signal_symbols)
                for sig in signals:
                    sent = sentiment_map.get(sig.symbol)
                    if sent is None:
                        continue
                    sent_score = sent.get("score", 0.0)
                    sent_label = sent.get("label", "neutral")
                    # Adjust confidence: ±10 points max, clamped to [0, 100]
                    adjustment = sent_score * 10
                    sig.confidence = round(
                        max(0.0, min(100.0, sig.confidence + adjustment)), 2
                    )
                    sig.is_premium = sig.confidence >= 75
                    sig.reasons.append(
                        f"Sentiment:{sent_label}({sent_score:+.2f})"
                    )
                logger.info(
                    "Sentiment applied to %d signals (%d via Gemini)",
                    len(signals),
                    sum(1 for s in sentiment_map.values() if s.get("source") == "gemini"),
                )
            except Exception as e:
                logger.warning(f"Sentiment enrichment failed (non-fatal): {e}")

        signals.sort(key=lambda x: x.confidence, reverse=True)
        if save:
            await self._save_signals(signals, signal_date=signal_date)
        logger.info(f"Generated {len(signals)} signals from 6 strategies")
        return signals

    # ========================================================================
    # ENSEMBLE SCORING
    # ========================================================================

    def _compute_ensemble_score(
        self,
        strategy_conf: float,
        ml_score: float,
        regime_id: int,
        sentiment_score: float = 0.0,
    ) -> float:
        """Compute final ensemble confidence score (0-100).

        PR 4: LGBM is SHADOW (logged, not scored). TFT v1 is SHADOW. The
        live contributors are:
          - strategy confluence (primary)
          - BreakoutMetaLabeler ``ml_score`` (PROD)
          - HMM regime one-hot regime bonus (PROD)
          - sentiment adjustment (post-dedup, see generate_intraday_signals)

        Bear regime confidence × 0.6 is applied *after* this fn, directly
        in the signal-build loop (Step 2 §1.12 size gate).
        """
        regime_bonus = {0: 1.0, 1: 0.5, 2: 0.0}.get(regime_id, 0.5)
        return (
            0.65 * strategy_conf
            + 0.20 * (ml_score * 100)
            + 0.10 * (regime_bonus * 100)
            + 0.05 * ((sentiment_score + 1) / 2 * 100)
        )

    # ========================================================================
    # UNIVERSE LOADING
    # ========================================================================

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
        """Load EOD universe using UniverseScreener or fallback."""
        if UniverseScreener is not None:
            try:
                screener = UniverseScreener()
                candidates = screener.screen_sync()
                if candidates and len(candidates) >= 30:
                    logger.info(f"UniverseScreener returned {len(candidates)} candidates")
                    return candidates, "universe_screener"
            except Exception as e:
                logger.warning(f"UniverseScreener failed: {e}")

        return self._load_universe(), "alpha_fallback"

    def _get_fallback_candidates(self) -> List[str]:
        """Fallback candidate list when universe file unavailable."""
        return [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
            "BHARTIARTL", "SBIN", "KOTAKBANK", "LT", "AXISBANK",
            "TRENT", "POLYCAB", "PERSISTENT", "DIXON", "TATAELXSI",
            "ASTRAL", "COFORGE", "LALPATHLAB", "MUTHOOTFIN", "INDHOTEL",
            "TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL",
            "ABB", "SIEMENS", "HAL", "BEL", "IRCTC"
        ]

    # ========================================================================
    # PERSISTENCE
    # ========================================================================

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
                    "source": "kite"
                })
            self.supabase.table("candles").upsert(rows, on_conflict="stock_symbol,interval,timestamp").execute()
        except Exception as e:
            logger.debug(f"Failed to cache candles for {symbol}: {e}")

    def _resolve_catalog_id(self, strategy_name: str) -> Optional[str]:
        """Map strategy_name (e.g. 'Consolidation_Breakout') → strategy_catalog.id UUID."""
        if self._strategy_catalog_map is None:
            try:
                result = self.supabase.table("strategy_catalog").select("id, slug, name").execute()
                self._strategy_catalog_map = {}
                for row in (result.data or []):
                    # Map by slug (kebab-case) and name variations
                    self._strategy_catalog_map[row["slug"]] = row["id"]
                    # Also map by name lowered with underscores
                    normalized = row["name"].lower().replace(" ", "_").replace("-", "_")
                    self._strategy_catalog_map[normalized] = row["id"]
            except Exception as e:
                logger.warning(f"Failed to load strategy catalog map: {e}")
                self._strategy_catalog_map = {}

        # Try exact match, then normalized
        normalized_name = strategy_name.lower().replace(" ", "_").replace("-", "_")
        return self._strategy_catalog_map.get(normalized_name)

    async def _save_signals(self, signals: List[GeneratedSignal], signal_date: Optional[date] = None) -> None:
        """Save generated signals to database."""
        today = (signal_date or date.today()).isoformat()

        for signal in signals:
            try:
                # Check for existing signal (prevent re-run duplicates)
                existing = self.supabase.table("signals").select("id").eq(
                    "date", today
                ).eq("symbol", signal.symbol).eq("direction", signal.direction).eq("status", "active").execute()
                if existing.data:
                    continue

                # Build TFT prediction payload (strip internal keys for DB)
                tft_pred_payload = {}
                if signal.tft_prediction:
                    tft_pred_payload = {
                        k: v for k, v in signal.tft_prediction.items()
                        if k in ("p10", "p50", "p90", "direction", "horizon",
                                 "current_close", "predicted_close")
                    }

                # Sanitize numpy types for JSON serialization
                def _sanitize(v):
                    if isinstance(v, (np.integer,)):
                        return int(v)
                    if isinstance(v, (np.floating,)):
                        return float(v)
                    if isinstance(v, (np.bool_,)):
                        return bool(v)
                    if isinstance(v, np.ndarray):
                        return v.tolist()
                    if isinstance(v, dict):
                        return {k2: _sanitize(v2) for k2, v2 in v.items()}
                    if isinstance(v, list):
                        return [_sanitize(i) for i in v]
                    return v

                tft_pred_payload = _sanitize(tft_pred_payload)

                def _safe_float(v, default=0.0):
                    if v is None:
                        return default
                    fv = float(v)
                    if fv == float("inf") or fv == float("-inf"):
                        return default
                    return fv

                data = {
                    "symbol": signal.symbol,
                    "exchange": signal.exchange,
                    "segment": signal.segment,
                    "direction": signal.direction,
                    "confidence": _safe_float(signal.confidence),
                    "entry_price": _safe_float(signal.entry_price),
                    "stop_loss": _safe_float(signal.stop_loss),
                    "target_1": _safe_float(signal.target_1),
                    "target_2": _safe_float(signal.target_2),
                    "target_3": _safe_float(signal.target_3),
                    "risk_reward": _safe_float(signal.risk_reward),
                    "catboost_score": float(signal.catboost_score) if signal.catboost_score is not None else None,
                    "tft_score": float(signal.tft_score) if signal.tft_score is not None else None,
                    "stockformer_score": float(signal.stockformer_score) if signal.stockformer_score is not None else None,
                    "model_agreement": int(signal.model_agreement) if signal.model_agreement is not None else 1,
                    "reasons": signal.reasons or [],
                    "is_premium": bool(signal.is_premium) if signal.is_premium is not None else False,
                    "lot_size": int(signal.lot_size) if signal.lot_size is not None else 1,
                    "strategy_names": [signal.strategy_name],
                    "tft_prediction": tft_pred_payload,
                    "date": today,
                    "status": "active",
                    "generated_at": datetime.utcnow().isoformat(),
                    # PR 4 — HMM + shadow-model columns (see PR 2 migration).
                    "regime_at_signal": signal.regime_at_signal,
                    "lgbm_buy_prob": (
                        float(signal.lgbm_buy_prob)
                        if signal.lgbm_buy_prob is not None else None
                    ),
                    "tft_p10": (
                        _safe_float(tft_pred_payload.get("p10")[-1])
                        if isinstance(tft_pred_payload.get("p10"), list) and tft_pred_payload["p10"]
                        else None
                    ),
                    "tft_p50": (
                        _safe_float(tft_pred_payload.get("p50")[-1])
                        if isinstance(tft_pred_payload.get("p50"), list) and tft_pred_payload["p50"]
                        else None
                    ),
                    "tft_p90": (
                        _safe_float(tft_pred_payload.get("p90")[-1])
                        if isinstance(tft_pred_payload.get("p90"), list) and tft_pred_payload["p90"]
                        else None
                    ),
                }

                # Tag with marketplace strategy catalog ID
                catalog_id = signal.strategy_catalog_id or self._resolve_catalog_id(signal.strategy_name)
                if catalog_id:
                    data["strategy_catalog_id"] = catalog_id

                self.supabase.table("signals").insert(data).execute()

            except Exception as e:
                logger.error(f"Failed to save signal for {signal.symbol}: {e}")

    async def get_today_signals(
        self,
        segment: Optional[str] = None,
        direction: Optional[str] = None,
        is_premium: Optional[bool] = None
    ) -> List[Dict]:
        """Fetch today's signals from database."""
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

    # ========================================================================
    # OPTIONS SIGNAL GENERATION (Sprint 4 — deployment-aware)
    # ========================================================================

    async def generate_options_signals(self, save: bool = True) -> List[GeneratedSignal]:
        """
        Generate options signals for users with active OPTIONS deployments.
        Called at 9:30 AM+ when live chain data is available.

        Flow:
        1. Get all active OPTIONS deployments (not paused)
        2. For each deployment, load the strategy class + params
        3. Build OptionsChainSnapshot from FO engine
        4. Run strategy.scan(chain, params)
        5. Convert OptionsTradeSignal → GeneratedSignal, save to DB
        """
        logger.info("Starting options signal generation...")
        all_signals: List[GeneratedSignal] = []

        try:
            # Get active options deployments
            deployments = self.supabase.table("user_strategy_deployments").select(
                "*, strategy_catalog(*)"
            ).eq("is_active", True).eq("is_paused", False).execute()

            if not deployments.data:
                logger.info("No active options deployments")
                return all_signals

            # Filter to OPTIONS segment only
            options_deployments = [
                d for d in deployments.data
                if d.get("strategy_catalog", {}).get("segment") == "OPTIONS"
            ]

            if not options_deployments:
                logger.info("No OPTIONS deployments found")
                return all_signals

            logger.info(f"Processing {len(options_deployments)} OPTIONS deployments")

            for deployment in options_deployments:
                try:
                    catalog = deployment.get("strategy_catalog", {})
                    strategy_class_path = catalog.get("strategy_class", "")
                    default_params = catalog.get("default_params", {})
                    custom_params = deployment.get("custom_params", {})

                    # Merge params (custom overrides defaults)
                    params = {**default_params, **custom_params}

                    # Dynamically load strategy class
                    strategy = self._load_strategy_class(strategy_class_path)
                    if strategy is None:
                        logger.warning(f"Could not load strategy: {strategy_class_path}")
                        continue

                    # Build chain snapshot
                    symbol = catalog.get("supported_symbols", ["NIFTY"])[0]
                    chain = await self._build_options_chain(symbol, params)
                    if chain is None:
                        continue

                    # Inject market context (IV history, ADX) for strategies
                    # that need it (CreditSpread, ShortStraddle)
                    if "_iv_20d_mean" not in params:
                        params["_iv_20d_mean"] = await self._get_iv_20d_mean(symbol, chain)
                    if "_iv_20d_std" not in params:
                        params["_iv_20d_std"] = await self._get_iv_20d_std(symbol, chain)
                    if "_prev_close" not in params:
                        params["_prev_close"] = chain.spot_price * 0.998  # approx prev close
                    if "_adx" not in params:
                        params["_adx"] = await self._get_adx(symbol)

                    # Run strategy scan
                    signal = strategy.scan(chain, params)
                    if signal is None:
                        continue

                    # Convert OptionsTradeSignal → GeneratedSignal
                    legs_desc = " + ".join(
                        f"{l.direction} {l.strike}{l.option_type}"
                        for l in signal.legs
                    )
                    gen_signal = GeneratedSignal(
                        symbol=signal.symbol,
                        exchange="NFO",
                        segment="OPTIONS",
                        direction="LONG" if signal.net_premium < 0 else "SHORT",
                        confidence=signal.confidence,
                        entry_price=abs(signal.net_premium),
                        stop_loss=signal.max_loss,
                        target_1=signal.max_profit if signal.max_profit != float('inf') else 0,
                        target_2=None,
                        target_3=None,
                        risk_reward=round(signal.max_profit / max(signal.max_loss, 1), 2) if signal.max_loss > 0 and signal.max_profit != float('inf') else 0,
                        catboost_score=0,
                        tft_score=0,
                        stockformer_score=signal.confidence,
                        lgbm_score=0,
                        model_agreement=1,
                        reasons=signal.reasons,
                        is_premium=True,
                        strategy_name=catalog.get("name", ""),
                        strategy_catalog_id=catalog.get("id"),
                        lot_size=chain.lot_size,
                    )
                    all_signals.append(gen_signal)

                    # Update deployment last_signal_at
                    self.supabase.table("user_strategy_deployments").update({
                        "last_signal_at": datetime.utcnow().isoformat(),
                    }).eq("id", deployment["id"]).execute()

                    logger.info(f"Options signal: {signal.symbol} {legs_desc} conf={signal.confidence:.0f}")

                except Exception as e:
                    logger.error(f"Options deployment scan error: {e}")
                    continue

            if save and all_signals:
                await self._save_signals(all_signals)

            logger.info(f"Options signal generation complete: {len(all_signals)} signals")

        except Exception as e:
            logger.error(f"Options signal generation failed: {e}")

        return all_signals

    async def monitor_options_positions(self) -> None:
        """
        Monitor active options positions and check exit conditions.
        Called every 15 minutes during market hours.
        """
        logger.info("Monitoring options positions...")

        try:
            # Get all active OPTIONS positions
            positions = self.supabase.table("positions").select(
                "*, trades(*)"
            ).eq("is_active", True).eq("segment", "OPTIONS").execute()

            if not positions.data:
                return

            for pos in positions.data:
                try:
                    trade = pos.get("trades", {})
                    strategy_catalog_id = trade.get("strategy_catalog_id")

                    if not strategy_catalog_id:
                        continue

                    # Load strategy catalog for class + params
                    catalog_result = self.supabase.table("strategy_catalog").select("*").eq(
                        "id", strategy_catalog_id
                    ).single().execute()

                    if not catalog_result.data:
                        continue

                    catalog = catalog_result.data
                    strategy = self._load_strategy_class(catalog.get("strategy_class", ""))
                    if strategy is None:
                        continue

                    params = catalog.get("default_params", {})

                    # Build current chain
                    chain = await self._build_options_chain(
                        pos["symbol"],
                        params,
                    )
                    if chain is None:
                        continue

                    # Build position dict for exit check
                    position_dict = {
                        "legs": [
                            {
                                "strike": trade.get("strike_price", 0),
                                "option_type": trade.get("option_type", "CE"),
                                "entry_price": trade.get("entry_price", 0),
                            }
                        ],
                        "entry_price": trade.get("entry_price", 0),
                        "entry_time": trade.get("created_at", ""),
                        "entry_date": trade.get("created_at", "")[:10] if trade.get("created_at") else "",
                        "highest_since_entry": pos.get("highest_since_entry", trade.get("entry_price", 0)),
                    }

                    exit_signal = strategy.should_exit(chain, position_dict, params)
                    if exit_signal:
                        logger.info(f"Options exit signal: {pos['symbol']} reason={exit_signal.reason}")
                        # Close position (reuses existing _close_position logic)
                        current_price = exit_signal.exit_price or pos.get("current_price", 0)
                        await self._close_options_position(pos, current_price, exit_signal.reason)

                except Exception as e:
                    logger.error(f"Options position monitor error for {pos.get('symbol')}: {e}")

        except Exception as e:
            logger.error(f"Options position monitoring failed: {e}")

    async def _close_options_position(self, position: Dict, exit_price: float, reason: str) -> None:
        """Close an options position and update P&L."""
        try:
            entry_price = position.get("average_price") or position.get("entry_price", 0)
            quantity = position.get("quantity", 1)
            direction = position.get("direction", "LONG")

            if direction == "LONG":
                pnl = (exit_price - entry_price) * quantity
            else:
                pnl = (entry_price - exit_price) * quantity

            # Update position
            self.supabase.table("positions").update({
                "is_active": False,
                "current_price": exit_price,
                "status": "closed",
                "closed_at": datetime.utcnow().isoformat(),
            }).eq("id", position["id"]).execute()

            # Update trade
            trade_id = position.get("trade_id")
            if trade_id:
                self.supabase.table("trades").update({
                    "exit_price": exit_price,
                    "exit_reason": reason,
                    "status": "closed",
                    "realized_pnl": pnl,
                    "closed_at": datetime.utcnow().isoformat(),
                }).eq("id", trade_id).execute()

            # Update deployment stats
            signal_id = position.get("signal_id")
            if signal_id:
                signal = self.supabase.table("signals").select("strategy_catalog_id").eq(
                    "id", signal_id
                ).single().execute()
                if signal.data and signal.data.get("strategy_catalog_id"):
                    # Find deployment for this user + strategy
                    user_id = position.get("user_id")
                    if user_id:
                        self.supabase.rpc("increment_deployment_stats", {
                            "p_user_id": user_id,
                            "p_strategy_id": signal.data["strategy_catalog_id"],
                            "p_pnl": pnl,
                            "p_is_win": pnl > 0,
                        }).execute()

            logger.info(f"Options position closed: {position.get('symbol')} reason={reason} pnl={pnl:.0f}")

        except Exception as e:
            logger.error(f"Close options position error: {e}")

    def _load_strategy_class(self, class_path: str):
        """Dynamically load a strategy class from its dotted path."""
        try:
            parts = class_path.rsplit(".", 1)
            if len(parts) != 2:
                return None
            module_path, class_name = parts
            import importlib
            module = importlib.import_module(module_path)
            cls = getattr(module, class_name)
            return cls()
        except Exception as e:
            logger.warning(f"Failed to load strategy class {class_path}: {e}")
            return None

    async def _build_options_chain(self, symbol: str, params: Dict):
        """
        Build OptionsChainSnapshot from live broker/market data.
        Falls back to FOTradingEngine synthetic chain when live data unavailable.
        """
        try:
            from ml.strategies.options_base import OptionsChainSnapshot, OptionSnapshot

            # Fetch raw chain data via MarketDataProvider (Kite → synthetic fallback)
            provider = get_market_data_provider()
            raw_chain = await provider.get_option_chain_async(symbol)

            if not raw_chain:
                logger.warning(f"No options chain data for {symbol}")
                return None

            # Get spot price
            spot_quote = await provider.get_quote_async(symbol)
            spot_price = spot_quote.ltp if spot_quote else 0
            if spot_price <= 0:
                defaults = {"NIFTY": 24000, "BANKNIFTY": 51000, "FINNIFTY": 23000}
                spot_price = defaults.get(symbol, 0)
            if spot_price <= 0:
                return None

            # Determine strike gap and lot size from chain data
            strikes = sorted(set(c['strike'] for c in raw_chain))
            strike_gap = min(
                (strikes[i + 1] - strikes[i]) for i in range(len(strikes) - 1)
            ) if len(strikes) > 1 else 50

            lot_size = raw_chain[0].get('lot_size', 1) if raw_chain else 1
            if FOTradingEngine is not None:
                lot_size = FOTradingEngine().get_lot_size(symbol) or lot_size

            atm_strike = round(spot_price / strike_gap) * strike_gap
            expiry_str = raw_chain[0].get('expiry', '')

            # Parse expiry date
            from datetime import date as date_cls
            expiry_date = date_cls.today()
            if expiry_str:
                try:
                    expiry_date = datetime.strptime(expiry_str, "%Y-%m-%d").date()
                except ValueError:
                    pass

            # Build OptionSnapshot list
            snapshots = []
            total_call_oi = 0
            total_put_oi = 0
            for c in raw_chain:
                snap = OptionSnapshot(
                    strike=c['strike'],
                    option_type=c['option_type'],
                    expiry=expiry_date,
                    ltp=c.get('ltp', 0),
                    bid=c.get('bid', 0),
                    ask=c.get('ask', 0),
                    iv=c.get('iv', 0),
                    oi=c.get('oi', 0),
                    oi_change=c.get('oi_change', 0),
                    volume=c.get('volume', 0),
                    delta=c.get('delta', 0),
                    gamma=c.get('gamma', 0),
                    theta=c.get('theta', 0),
                    vega=c.get('vega', 0),
                )
                snapshots.append(snap)
                if c['option_type'] == 'CE':
                    total_call_oi += c.get('oi', 0)
                else:
                    total_put_oi += c.get('oi', 0)

            # Compute PCR and IV index
            pcr = total_put_oi / max(total_call_oi, 1)
            atm_ivs = [s.iv for s in snapshots if s.strike == atm_strike and s.iv > 0]
            iv_index = sum(atm_ivs) / len(atm_ivs) if atm_ivs else 15.0

            chain_snapshot = OptionsChainSnapshot(
                symbol=symbol,
                spot_price=spot_price,
                atm_strike=atm_strike,
                strike_gap=strike_gap,
                lot_size=lot_size,
                expiry=expiry_date,
                chain=snapshots,
                iv_index=iv_index,
                pcr=pcr,
                timestamp=datetime.now(),
            )
            logger.info(
                f"Built options chain for {symbol}: {len(snapshots)} contracts, "
                f"spot={spot_price}, ATM={atm_strike}, PCR={pcr:.2f}, IV={iv_index:.1f}"
            )
            return chain_snapshot

        except Exception as e:
            logger.warning(f"Build options chain error for {symbol}: {e}")
            return None

    async def _get_iv_20d_mean(self, symbol: str, chain) -> float:
        """Get 20-day mean IV from INDIA VIX or estimate from chain."""
        try:
            provider = get_market_data_provider()
            vix_quote = provider.get_quote("VIX")
            if vix_quote and vix_quote.ltp > 0:
                # VIX is annualized %, use it as IV proxy
                # 20-day mean is typically lower than current VIX
                return vix_quote.ltp * 0.85
        except Exception:
            pass
        # Fallback: estimate from chain — assume current IV is elevated
        return chain.iv_index * 0.80

    async def _get_iv_20d_std(self, symbol: str, chain) -> float:
        """Get 20-day IV standard deviation (estimate)."""
        try:
            provider = get_market_data_provider()
            vix_quote = provider.get_quote("VIX")
            if vix_quote and vix_quote.ltp > 0:
                # Typical VIX std is ~15-20% of its level
                return vix_quote.ltp * 0.18
        except Exception:
            pass
        return chain.iv_index * 0.15

    async def _get_adx(self, symbol: str) -> float:
        """Get ADX from recent historical data."""
        try:
            provider = get_market_data_provider()
            hist = provider.get_historical(symbol, period="3mo", interval="1d")
            if hist is not None and len(hist) >= 20:
                import ta
                adx = ta.trend.ADXIndicator(hist['high'], hist['low'], hist['close'], window=14)
                val = adx.adx().iloc[-1]
                if not pd.isna(val):
                    return float(val)
        except Exception:
            pass
        return 25.0  # neutral default

    @staticmethod
    def _strip_exchange_suffix(symbol: str) -> str:
        """Normalize symbols to NSE ticker without suffix."""
        if symbol.endswith(".NS"):
            return symbol[:-3]
        return symbol
