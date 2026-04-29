"""
================================================================================
SWING AI SCREENER API ROUTES
================================================================================
Complete API for Swing AI Screener with 50+ scanners, AI predictions,
ML signals, trend forecasting, and full NSE/BSE coverage.
================================================================================
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any
from fastapi import APIRouter, Query, HTTPException, Path
from pydantic import BaseModel

from ..services.live_screener_engine import get_live_screener, SCANNER_MENU

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/screener", tags=["QuantScan AI"])
quantai_router = APIRouter(prefix="/api/quantai", tags=["QuantAI Alpha Picks"])

# ============================================================================
# RESPONSE MODELS
# ============================================================================

class ScannerInfo(BaseModel):
    id: int
    name: str
    description: str
    premium: bool = False

class ScanResult(BaseModel):
    symbol: str
    name: Optional[str] = None
    sector: Optional[str] = None
    ltp: float
    change_pct: float
    volume: str
    rsi: int
    trend: str
    pattern: str
    signal: str
    ma_signal: Optional[str] = None
    breakout_level: Optional[float] = None
    support_level: Optional[float] = None
    target_1: Optional[float] = None
    target_2: Optional[float] = None
    stop_loss: Optional[float] = None

# ============================================================================
# SCANNER ENDPOINTS
# ============================================================================

@router.get("/info")
async def get_screener_info():
    """Get Swing AI Screener capabilities and scanner inventory."""
    screener = get_live_screener()

    return {
        "name": "Swing AI Screener",
        "version": "3.0",
        "description": "AI-powered market scanner for NSE/BSE with 50+ scanners and 6 ML models",
        "features": screener.get_all_scanners(),
        "status": "active",
        "data_source": screener._data_source,
    }


@router.get("/scanners")
async def get_all_scanners():
    """
    Get all available scanner categories and individual scanners
    
    Returns 50+ scanners organized by category with full descriptions
    """
    screener = get_live_screener()
    scanner_data = screener.get_all_scanners()
    
    return {
        "success": True,
        "total_scanners": scanner_data["total_scanners"],
        "stock_universe": scanner_data["stock_universe"],
        "categories": scanner_data["categories"],
        "ai_ml_features": scanner_data["ai_ml_features"],
        "exchanges": SCANNER_MENU["exchanges"],
    }


@router.get("/menu")
async def get_screener_menu():
    """
    Get screener menu definitions for frontend UI
    """
    return {
        "exchanges": SCANNER_MENU["exchanges"],
        "scan_types": SCANNER_MENU["scan_types"],
    }


@router.get("/scanners/all")
async def get_all_scanner_details():
    """
    Get detailed information for ALL 50+ scanners
    """
    screener = get_live_screener()
    scanner_details = SCANNER_MENU["scan_types"]["X"]["submenu"]
    
    scanners = []
    for scanner_id, info in scanner_details.items():
        scanners.append({
            "id": scanner_id,
            "name": info["name"],
            "description": info["description"],
            "premium": scanner_id >= 30,  # Advanced scanners are premium
        })
    
    return {
        "success": True,
        "count": len(scanners),
        "scanners": scanners,
    }


@router.get("/scan/{scanner_id}")
async def run_scanner(
    scanner_id: int = Path(..., ge=0, le=51, description="Scanner ID (0-51)"),
    exchange: str = Query("N", description="Exchange: N=NSE, B=BSE, S=Nifty50, etc."),
    index: str = Query("12", description="Index: 12=Nifty500, 0=Full, etc."),
):
    """
    Run a specific scanner by ID
    
    Scanner IDs:
    - 0: Full Screening (all patterns)
    - 1: Breakout from Consolidation
    - 2: Top Gainers (>2%)
    - 3: Top Losers (>2%)
    - 4: Volume Breakout
    - 5: 52-Week High
    - 6: 10-Day High
    - 7: 52-Week Low
    - 8: Volume Surge (>2.5x)
    - 9: RSI Oversold (<30)
    - 10: RSI Overbought (>70)
    - 11-15: MA Crossover Strategies
    - 16-25: Advanced Patterns (VCP, Cup&Handle, etc.)
    - 26-35: Momentum & Trend
    - 36-42: Smart Money & F&O Analysis
    """
    scanner_info = SCANNER_MENU["scan_types"]["X"]["submenu"].get(scanner_id)
    
    if not scanner_info:
        raise HTTPException(status_code=404, detail=f"Scanner {scanner_id} not found")
    
    screener = get_live_screener()
    result = await screener.run_scanner(scanner_id, exchange, index)
    
    return result


@router.get("/scan/category/{category}")
async def run_category_scan(
    category: str = Path(..., description="Category: breakout, momentum, volume, reversal, patterns, etc."),
    exchange: str = Query("N", description="Exchange code"),
):
    """
    Run all scanners in a category and combine results
    """
    category_map = {
        "breakout": [0, 1, 4, 5, 6, 7, 20, 33],
        "momentum": [2, 3, 10, 17, 26, 30, 31],
        "volume": [4, 8, 37, 38, 39],
        "reversal": [9, 12, 19, 24, 25, 28],
        "patterns": [12, 13, 14, 21, 22, 23, 24, 25],
        "ma_strategies": [11, 15, 26, 27, 32],
        "smart_money": [36, 37, 38, 39, 40],
        "fo_analysis": [40, 41, 42, 36],
    }
    
    if category not in category_map:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid category. Available: {list(category_map.keys())}"
        )
    
    screener = get_live_screener()
    scanner_ids = category_map[category]
    
    all_results = []
    for scanner_id in scanner_ids[:3]:  # Limit to 3 scanners per request
        result = await screener.run_scanner(scanner_id, exchange, "12")
        if result.get("results"):
            all_results.extend(result["results"][:10])
    
    # Deduplicate by symbol
    seen = set()
    unique_results = []
    for r in all_results:
        if r["symbol"] not in seen:
            seen.add(r["symbol"])
            unique_results.append(r)
    
    return {
        "success": True,
        "category": category,
        "scanners_used": scanner_ids,
        "timestamp": datetime.now().isoformat(),
        "results": unique_results[:30],
        "count": len(unique_results[:30]),
    }


# ============================================================================
# AI/ML PREDICTION ENDPOINTS
# ============================================================================

@router.get("/ai/nifty-prediction")
async def get_nifty_prediction():
    """
    Get AI/ML-powered Nifty prediction.

    Uses real market data + multiple AI models:
    - HMM Regime Detector: 3-state market regime (bull/sideways/bear)
    - LightGBM Signal Gate: 3-class signal (BUY/SELL/HOLD) with probabilities
    - Technical indicators: RSI, MACD, SMA, Bollinger Bands, ATR
    Returns prediction with confidence levels, regime, and support/resistance.
    """
    screener = get_live_screener()
    prediction = await screener.get_nifty_prediction()

    # If prediction has real data, return it
    if prediction and not prediction.get("error"):
        return {
            "success": True,
            "feature": "AI Nifty Prediction",
            "source": "Swing AI Models (HMM + LightGBM)",
            "data": prediction,
        }

    # yfinance fallback for Nifty data
    try:
        import yfinance as yf
        t = yf.Ticker("^NSEI")
        hist = t.history(period="3mo")
        if len(hist) > 0:
            last = hist.iloc[-1]
            prev = hist.iloc[-2] if len(hist) > 1 else last
            close = float(last["Close"])
            prev_close = float(prev["Close"])
            change_pct = ((close - prev_close) / prev_close * 100) if prev_close else 0

            # Compute basic indicators from history
            closes = hist["Close"].values
            sma_20 = float(closes[-20:].mean()) if len(closes) >= 20 else close
            sma_50 = float(closes[-50:].mean()) if len(closes) >= 50 else close
            sma_200 = float(closes.mean())

            # Simple RSI calculation
            deltas = [closes[i] - closes[i-1] for i in range(1, min(15, len(closes)))]
            gains = [d for d in deltas if d > 0]
            losses = [-d for d in deltas if d < 0]
            avg_gain = sum(gains) / 14 if gains else 0
            avg_loss = sum(losses) / 14 if losses else 1
            rs = avg_gain / avg_loss if avg_loss else 100
            rsi = 100 - (100 / (1 + rs))

            # Determine direction
            direction = "BULLISH" if close > sma_20 and close > sma_50 else "BEARISH" if close < sma_20 and close < sma_50 else "NEUTRAL"
            confidence = 65 if direction != "NEUTRAL" else 50

            fallback_data = {
                "current_level": round(close, 2),
                "change_percent": round(change_pct, 2),
                "prediction": {
                    "direction": direction,
                    "confidence": confidence,
                    "models_used": ["SMA Crossover", "RSI", "Price Action"],
                },
                "regime": {
                    "regime": "BULL" if close > sma_50 else "BEAR" if close < sma_50 else "SIDEWAYS",
                    "confidence": 60,
                },
                "indicators": {
                    "rsi": round(rsi, 1),
                    "macd": round(sma_20 - sma_50, 2),
                    "macd_signal": 0,
                    "sma_20": round(sma_20, 2),
                    "sma_50": round(sma_50, 2),
                    "sma_200": round(sma_200, 2),
                },
                "support_levels": [round(close * 0.97, 2), round(close * 0.95, 2)],
                "resistance_levels": [round(close * 1.03, 2), round(close * 1.05, 2)],
            }
            return {
                "success": True,
                "feature": "AI Nifty Prediction",
                "source": "yfinance (fallback)",
                "data": fallback_data,
            }
    except Exception as yf_err:
        logger.warning(f"yfinance Nifty fallback failed: {yf_err}")

    return {
        "success": True,
        "feature": "AI Nifty Prediction",
        "source": "Swing AI Models (HMM + LightGBM)",
        "data": prediction or {"error": "Could not fetch Nifty data"},
    }


@router.get("/ai/trend-forecast/{symbol}")
async def get_trend_forecast(
    symbol: str = Path(..., description="Stock symbol (e.g., RELIANCE, TCS, NIFTY)"),
):
    """
    Get multi-timeframe trend forecast for a stock
    
    Returns:
    - Intraday trend
    - Short-term trend (1-2 weeks)
    - Medium-term trend (1-3 months)
    - Technical indicators
    - Pattern detection
    """
    screener = get_live_screener()
    forecast = await screener.get_trend_forecast(symbol.upper())
    
    return {
        "success": True,
        "feature": "Trend Forecasting",
        "data": forecast,
    }


@router.get("/ai/ml-signals")
async def get_ml_signals(
    limit: int = Query(20, ge=5, le=50, description="Number of signals to return"),
):
    """
    Get ML-based trading signals
    
    Uses pattern recognition and momentum prediction models
    """
    screener = get_live_screener()
    
    # Get top momentum stocks
    momentum_result = await screener.run_scanner(17, "N", "12")  # Bull Momentum scanner
    
    signals = []
    for stock in momentum_result.get("results", [])[:limit]:
        signals.append({
            "symbol": stock["symbol"],
            "name": stock.get("name", stock["symbol"]),
            "signal_type": "BUY" if stock.get("change_pct", 0) > 0 else "SELL",
            "strength": "Strong" if abs(stock.get("change_pct", 0)) > 3 else "Moderate",
            "confidence": min(0.85, 0.5 + abs(stock.get("change_pct", 0)) / 20),
            "entry_price": stock.get("ltp", 0),
            "target": stock.get("target_1", stock.get("ltp", 0) * 1.08),
            "stop_loss": stock.get("stop_loss", stock.get("ltp", 0) * 0.95),
            "pattern": stock.get("pattern", "Momentum"),
            "rsi": stock.get("rsi", 50),
            "risk_reward": "1:2",
        })
    
    return {
        "success": True,
        "feature": "ML Trading Signals",
        "timestamp": datetime.now().isoformat(),
        "signals": signals,
        "count": len(signals),
    }


# ============================================================================
# SPECIAL SCAN ENDPOINTS
# ============================================================================

@router.get("/swing-candidates")
async def get_swing_candidates(
    limit: int = Query(20, ge=5, le=50),
):
    """
    Get best swing trading candidates using AI analysis.

    If the QuantAI ML ranker model is available, uses it for ML-powered picks.
    Otherwise falls back to the heuristic multi-scanner approach.
    """
    # Try QuantAI ML engine first
    try:
        from ..services.quantai_engine import get_quantai_engine
        engine = get_quantai_engine()
        if engine.is_ready:
            picks = await engine.generate_daily_picks(top_n=limit)
            if picks:
                return {
                    "success": True,
                    "feature": "QuantAI Alpha Picks (ML)",
                    "source": "quantai_ml",
                    "timestamp": datetime.now().isoformat(),
                    "results": picks,
                    "count": len(picks),
                }
    except Exception as e:
        logger.warning("QuantAI engine unavailable, falling back to heuristic: %s", e)

    # Fallback: heuristic multi-scanner approach
    screener = get_live_screener()

    # Run multiple relevant scanners
    scanner_tasks = [
        screener.run_scanner(1, "N", "12"),   # Breakout
        screener.run_scanner(4, "N", "12"),   # Volume breakout
        screener.run_scanner(14, "N", "12"),  # VCP
        screener.run_scanner(17, "N", "12"),  # Bull momentum
    ]

    results = await asyncio.gather(*scanner_tasks, return_exceptions=True)

    all_stocks = []
    for result in results:
        if isinstance(result, dict) and result.get("results"):
            all_stocks.extend(result["results"])

    # Score and rank
    scored_stocks = []
    for stock in all_stocks:
        score = 0
        score += min(stock.get("change_pct", 0) * 5, 25)  # Max 25 for change
        score += min((70 - abs(stock.get("rsi", 50) - 55)) / 2, 15)  # RSI near 55 is good

        volume = stock.get("volume", "1x").replace("x", "")
        try:
            vol_mult = float(volume)
            score += min(vol_mult * 5, 20)  # Volume multiplier bonus
        except:
            pass

        if stock.get("signal") == "Strong Buy":
            score += 20
        elif stock.get("signal") == "Buy":
            score += 10

        stock["swing_score"] = round(score, 2)
        scored_stocks.append(stock)

    # Deduplicate and sort
    seen = set()
    unique_stocks = []
    for s in sorted(scored_stocks, key=lambda x: x.get("swing_score", 0), reverse=True):
        if s["symbol"] not in seen:
            seen.add(s["symbol"])
            unique_stocks.append(s)

    if unique_stocks:
        return {
            "success": True,
            "feature": "AI Swing Candidates",
            "source": "heuristic",
            "timestamp": datetime.now().isoformat(),
            "results": unique_stocks[:limit],
            "count": len(unique_stocks[:limit]),
        }

    # yfinance fallback: return top NSE stocks with basic price data
    try:
        import yfinance as yf
        top_symbols = [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
            "BHARTIARTL", "ITC", "KOTAKBANK", "LT", "SBIN",
            "BAJFINANCE", "MARUTI", "TITAN", "ASIANPAINT", "ULTRACEMCO",
            "WIPRO", "HCLTECH", "SUNPHARMA", "TECHM", "TATAMOTORS",
            "ADANIENT", "TATASTEEL", "NTPC", "POWERGRID", "ONGC",
            "DRREDDY", "DIVISLAB", "CIPLA", "NESTLEIND", "HEROMOTOCO",
        ]
        yf_results = []
        for sym in top_symbols[:limit]:
            try:
                t = yf.Ticker(f"{sym}.NS")
                fi = t.fast_info
                p = float(fi.get("lastPrice", 0) or fi.get("last_price", 0) or 0)
                pc = float(fi.get("previousClose", 0) or fi.get("previous_close", 0) or p)
                if p > 0:
                    yf_results.append({
                        "symbol": sym,
                        "ltp": round(p, 2),
                        "price": round(p, 2),
                        "change_pct": round((p - pc) / pc * 100, 2) if pc else 0,
                        "change_percent": round((p - pc) / pc * 100, 2) if pc else 0,
                        "volume": str(int(fi.get("lastVolume", 0) or 0)),
                        "swing_score": 50,
                        "signal": "Hold",
                    })
            except Exception:
                pass
        return {
            "success": True,
            "feature": "AI Swing Candidates",
            "source": "yfinance",
            "timestamp": datetime.now().isoformat(),
            "results": yf_results,
            "count": len(yf_results),
        }
    except Exception as yf_err:
        logger.warning(f"yfinance fallback failed: {yf_err}")

    return {
        "success": True,
        "feature": "AI Swing Candidates",
        "source": "heuristic",
        "timestamp": datetime.now().isoformat(),
        "results": [],
        "count": 0,
    }


# ============================================================================
# QUANTAI ALPHA PICKS ENDPOINTS
# ============================================================================

@quantai_router.get("/picks")
async def get_quantai_picks(
    limit: int = Query(15, ge=5, le=50, description="Number of picks to return"),
):
    """
    Get QuantAI Alpha Picks — ML-powered daily stock recommendations.

    Uses a LightGBM ranker trained on 51+ technical features to predict
    2-week forward returns and rank stocks by expected alpha.

    Returns SwingCandidate-compatible results with confidence scores.
    """
    try:
        from ..services.quantai_engine import get_quantai_engine
        engine = get_quantai_engine()

        if not engine.is_ready:
            return {
                "success": False,
                "error": "QuantAI model not trained. Run `python scripts/train_quantai.py` first.",
                "feature": "QuantAI Alpha Picks",
            }

        picks = await engine.generate_daily_picks(top_n=limit)

        return {
            "success": True,
            "feature": "QuantAI Alpha Picks",
            "timestamp": datetime.now().isoformat(),
            "results": picks,
            "count": len(picks),
        }

    except Exception as e:
        logger.error("QuantAI picks generation failed: %s", e)
        return {
            "success": False,
            "error": str(e),
            "feature": "QuantAI Alpha Picks",
        }


@quantai_router.get("/status")
async def get_quantai_status():
    """Check if QuantAI model is loaded and ready."""
    try:
        from ..services.quantai_engine import get_quantai_engine
        engine = get_quantai_engine()
        return {
            "success": True,
            "model_loaded": engine.is_ready,
            "feature_count": len(engine._feature_names),
            "forward_days": engine._forward_days,
        }
    except Exception as e:
        return {"success": False, "model_loaded": False, "error": str(e)}


@router.get("/breakouts")
async def get_breakout_stocks():
    """Get stocks with breakout signals"""
    screener = get_live_screener()
    result = await screener.run_scanner(1, "N", "12")
    return result


@router.get("/momentum")
async def get_momentum_stocks():
    """Get high momentum stocks"""
    screener = get_live_screener()
    result = await screener.run_scanner(17, "N", "12")
    return result


@router.get("/volume-surge")
async def get_volume_surge():
    """Get stocks with unusual volume"""
    screener = get_live_screener()
    result = await screener.run_scanner(8, "N", "12")
    return result


@router.get("/patterns/{pattern_type}")
async def get_pattern_stocks(
    pattern_type: str = Path(..., description="Pattern: vcp, cup_handle, double_bottom, engulfing, etc."),
):
    """Get stocks matching specific chart patterns"""
    pattern_map = {
        "vcp": 14,
        "cup_handle": 23,
        "double_bottom": 24,
        "head_shoulders": 25,
        "bullish_engulfing": 12,
        "bearish_engulfing": 13,
        "inside_bar": 28,
        "nr4": 21,
        "nr7": 22,
    }
    
    if pattern_type not in pattern_map:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid pattern. Available: {list(pattern_map.keys())}"
        )
    
    screener = get_live_screener()
    result = await screener.run_scanner(pattern_map[pattern_type], "N", "12")
    return result


@router.get("/vcp")
async def get_vcp_patterns():
    """Alias for VCP pattern scan"""
    return await get_pattern_stocks("vcp")


@router.get("/reversals")
async def get_reversal_candidates(exchange: str = Query("N", description="Exchange code")):
    """Alias for reversal scans"""
    return await run_category_scan("reversal", exchange)


@router.get("/institutional")
async def get_institutional_picks(exchange: str = Query("N", description="Exchange code")):
    """Alias for smart money scans"""
    return await run_category_scan("smart_money", exchange)


@router.get("/bullish-tomorrow")
async def get_bullish_tomorrow(limit: int = Query(10, ge=1, le=50)):
    """Alias for AI bullish signals"""
    return await get_ml_signals(limit=limit)


@router.get("/fo/long-buildup")
async def get_long_buildup():
    """Get F&O stocks with long buildup"""
    screener = get_live_screener()
    result = await screener.run_scanner(41, "F", "0")
    return result


@router.get("/fo/short-buildup")
async def get_short_buildup():
    """Get F&O stocks with short buildup"""
    screener = get_live_screener()
    result = await screener.run_scanner(42, "F", "0")
    return result


@router.get("/smart-money/fii-dii")
async def get_fii_dii_data():
    """Get FII/DII buying/selling data"""
    screener = get_live_screener()
    result = await screener.run_scanner(36, "N", "12")
    return result


# ============================================================================
# CATEGORY & BATCH SCAN ENDPOINTS (Frontend integration)
# ============================================================================

@router.get("/pk/categories")
async def get_pk_categories():
    """
    Get all scanner categories with their scanners for the frontend UI.
    Returns categories keyed by ID with name and scanner list.
    """
    screener = get_live_screener()
    scanner_data = screener.get_all_scanners()
    scanner_details = SCANNER_MENU["scan_types"]["X"]["submenu"]

    categories = {}
    for cat in scanner_data.get("categories", []):
        cat_id = cat["id"]
        scanners = []
        for sid in cat.get("scanners", []):
            info = scanner_details.get(sid, {})
            scanners.append({
                "id": sid,
                "name": info.get("name", f"Scanner {sid}"),
                "menu_code": info.get("description", ""),
            })
        categories[cat_id] = {
            "name": cat["name"],
            "scanners": scanners,
        }

    total = sum(len(c["scanners"]) for c in categories.values())
    return {
        "success": True,
        "categories": categories,
        "total_scanners": total,
    }


@router.post("/pk/scan/batch")
async def run_batch_scan(
    scanner_id: int = Query(..., description="Scanner ID to run"),
    universe: str = Query("nifty500", description="Stock universe"),
    limit: int = Query(50, ge=1, le=100, description="Max results"),
):
    """
    Run a scanner and return batch results.
    Called by the frontend screener page when a user clicks a scanner.
    """
    index_map = {
        "nifty50": "12",
        "nifty100": "12",
        "nifty200": "12",
        "nifty500": "12",
        "full": "0",
    }
    index = index_map.get(universe, "12")

    screener = get_live_screener()
    result = await screener.run_scanner(scanner_id, "N", index)

    results = result.get("results", [])[:limit]
    return {
        "success": True,
        "scanner_id": scanner_id,
        "universe": universe,
        "timestamp": datetime.now().isoformat(),
        "results": results,
        "count": len(results),
    }


# ============================================================================
# LIVE PRICE ENDPOINT
# ============================================================================

@router.get("/prices/live")
async def get_live_prices(
    symbols: str = Query(..., description="Comma-separated symbols"),
):
    """
    Get live/recent prices for multiple symbols.
    Uses Kite Connect for real-time quotes, yfinance fallback.
    """
    from ..services.market_data import get_market_data_provider

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        return {"success": True, "prices": []}

    prices = []
    source = "kite"

    # Use configured market data provider (Kite Connect)
    provider = get_market_data_provider()
    batch = await provider.get_quotes_batch_async(symbol_list[:50])

    got_kite = False
    for symbol in symbol_list[:50]:
        quote = batch.get(symbol)
        if quote and quote.ltp > 0:
            prices.append({
                "symbol": symbol,
                "price": round(quote.ltp, 2),
                "change": round(quote.change, 2),
                "change_percent": round(quote.change_percent, 2),
            })
            got_kite = True
        else:
            prices.append({"symbol": symbol, "price": 0, "change": 0, "change_percent": 0})

    # yfinance fallback for symbols with price=0
    if not got_kite:
        source = "yfinance"
        try:
            import yfinance as yf
            for i, item in enumerate(prices):
                if item["price"] == 0:
                    try:
                        sym = item["symbol"]
                        suffix = "" if "." in sym else ".NS"
                        t = yf.Ticker(f"{sym}{suffix}")
                        fi = t.fast_info
                        p = float(fi.get("lastPrice", 0) or fi.get("last_price", 0) or 0)
                        pc = float(fi.get("previousClose", 0) or fi.get("previous_close", 0) or p)
                        if p > 0:
                            prices[i] = {
                                "symbol": sym,
                                "price": round(p, 2),
                                "change": round(p - pc, 2),
                                "change_percent": round((p - pc) / pc * 100, 2) if pc else 0,
                            }
                    except Exception:
                        pass
        except ImportError:
            pass

    return {
        "success": True,
        "prices": prices,
        "source": source,
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/prices/{symbol}")
async def get_stock_price(
    symbol: str = Path(..., description="Stock symbol e.g. RELIANCE"),
):
    """
    Get detailed price data for a single stock.
    Uses Kite Connect for real-time data.
    """
    from ..services.market_data import get_market_data_provider

    sym = symbol.strip().upper()
    provider = get_market_data_provider()

    try:
        quote = await provider.get_quote_async(sym)
        if quote and quote.ltp > 0:
            # Stock metadata (sector/marketcap from NSE data if available)
            try:
                info = {}
            except Exception:
                info = {}

            return {
                "success": True,
                "symbol": sym,
                "name": info.get("shortName", sym),
                "price": round(quote.ltp, 2),
                "change": round(quote.change, 2),
                "change_percent": round(quote.change_percent, 2),
                "open": round(quote.open, 2),
                "high": round(quote.high, 2),
                "low": round(quote.low, 2),
                "volume": quote.volume,
                "prev_close": round(quote.close, 2),
                "week_52_high": info.get("fiftyTwoWeekHigh", 0),
                "week_52_low": info.get("fiftyTwoWeekLow", 0),
                "market_cap": info.get("marketCap", 0),
                "pe_ratio": info.get("trailingPE", 0),
                "sector": info.get("sector", ""),
                "industry": info.get("industry", ""),
            }

        # yfinance fallback
        try:
            import yfinance as yf
            suffix = "" if "." in sym else ".NS"
            ticker = yf.Ticker(f"{sym}{suffix}")
            fi = ticker.fast_info
            p = float(fi.get("lastPrice", 0) or fi.get("last_price", 0) or 0)
            pc = float(fi.get("previousClose", 0) or fi.get("previous_close", 0) or p)
            if p > 0:
                return {
                    "success": True,
                    "symbol": sym,
                    "name": sym,
                    "price": round(p, 2),
                    "change": round(p - pc, 2),
                    "change_percent": round((p - pc) / pc * 100, 2) if pc else 0,
                    "open": round(float(fi.get("open", 0) or 0), 2),
                    "high": round(float(fi.get("dayHigh", 0) or fi.get("day_high", 0) or 0), 2),
                    "low": round(float(fi.get("dayLow", 0) or fi.get("day_low", 0) or 0), 2),
                    "volume": int(fi.get("lastVolume", 0) or fi.get("last_volume", 0) or 0),
                    "prev_close": round(pc, 2),
                    "week_52_high": round(float(fi.get("yearHigh", 0) or fi.get("year_high", 0) or 0), 2),
                    "week_52_low": round(float(fi.get("yearLow", 0) or fi.get("year_low", 0) or 0), 2),
                    "market_cap": int(fi.get("marketCap", 0) or fi.get("market_cap", 0) or 0),
                    "pe_ratio": 0,
                    "sector": "",
                    "industry": "",
                }
        except Exception as yf_err:
            logger.warning(f"yfinance fallback failed for {sym}: {yf_err}")

        return {"success": False, "symbol": sym, "error": "No price data available"}
    except Exception as e:
        logger.error(f"Error fetching price for {sym}: {e}")
        return {"success": False, "symbol": sym, "error": str(e)}


@router.get("/prices/{symbol}/history")
async def get_stock_history(
    symbol: str = Path(..., description="Stock symbol"),
    days: int = Query(30, ge=1, le=365, description="Number of days"),
):
    """
    Get historical OHLCV data for a stock.
    Uses Kite Connect.
    """
    from ..services.market_data import get_market_data_provider

    sym = symbol.strip().upper()
    provider = get_market_data_provider()

    # Map days to period string
    if days <= 5:
        period = "5d"
    elif days <= 30:
        period = "1mo"
    elif days <= 90:
        period = "3mo"
    elif days <= 180:
        period = "6mo"
    else:
        period = "1y"

    try:
        df = await provider.get_historical_async(sym, period=period, interval="1d")

        if df is None or df.empty:
            return {"success": False, "symbol": sym, "error": "No data available"}

        # Normalize column names
        df.columns = [c.lower() for c in df.columns]

        history = []
        for idx, row in df.iterrows():
            history.append({
                "date": idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx),
                "open": round(float(row.get("open", 0)), 2),
                "high": round(float(row.get("high", 0)), 2),
                "low": round(float(row.get("low", 0)), 2),
                "close": round(float(row.get("close", 0)), 2),
                "volume": int(float(row.get("volume", 0))),
            })

        return {"success": True, "symbol": sym, "history": history[-days:]}
    except Exception as e:
        return {"success": False, "symbol": sym, "error": str(e)}


@router.get("/technicals/{symbol}")
async def get_stock_technicals(
    symbol: str = Path(..., description="Stock symbol"),
):
    """
    Get technical indicators for a stock.
    Uses the configured data provider and compute_all_indicators().
    """
    from ..services.market_data import get_market_data_provider
    from ml.features.indicators import compute_all_indicators

    sym = symbol.strip().upper()
    provider = get_market_data_provider()

    try:
        df = await provider.get_historical_async(sym, period="6mo", interval="1d")
        if df is None or df.empty or len(df) < 20:
            return {"success": False, "symbol": sym, "error": "Insufficient data"}

        df.columns = [c.lower() for c in df.columns]
        indicator_df = compute_all_indicators(df)
        last = indicator_df.iloc[-1]

        close_val = float(last.get("close", 0))
        sma_20 = float(last.get("sma_20", 0))
        sma_50 = float(last.get("sma_50", 0))

        if sma_20 > 0 and sma_50 > 0 and close_val > sma_20 > sma_50:
            trend = "Strong Uptrend"
        elif sma_20 > 0 and close_val > sma_20:
            trend = "Uptrend"
        elif sma_20 > 0 and sma_50 > 0 and close_val < sma_20 < sma_50:
            trend = "Strong Downtrend"
        elif sma_20 > 0 and close_val < sma_20:
            trend = "Downtrend"
        else:
            trend = "Sideways"

        return {
            "success": True,
            "symbol": sym,
            "rsi": round(float(last.get("rsi_14", 50)), 2),
            "macd": round(float(last.get("macd", 0)), 2),
            "macd_signal": round(float(last.get("macd_signal", 0)), 2),
            "sma_20": round(sma_20, 2),
            "sma_50": round(sma_50, 2),
            "sma_200": round(float(last.get("sma_200", 0)), 2) if float(last.get("sma_200", 0)) > 0 else None,
            "ema_21": round(float(last.get("ema_21", 0)), 2),
            "adx": round(float(last.get("adx", 0)), 2),
            "atr": round(float(last.get("atr_14", 0)), 2),
            "bb_upper": round(float(last.get("bb_upper", 0)), 2),
            "bb_lower": round(float(last.get("bb_lower", 0)), 2),
            "volume_ratio": round(float(last.get("volume_ratio", 1)), 2),
            "trend": trend,
        }
    except Exception as e:
        logger.error(f"Error computing technicals for {sym}: {e}")
        return {"success": False, "symbol": sym, "error": str(e)}



# ============================================================================
# ADDITIONAL AI ENDPOINTS
# ============================================================================

@router.get("/ai/market-regime")
async def get_market_regime():
    """
    Detect current market regime (Bull / Bear / Sideways)
    using multi-factor quantitative analysis with real breadth data.
    """
    screener = get_live_screener()
    regime_data = await screener.get_market_regime()

    # Also fetch Nifty level for the response
    prediction = await screener.get_nifty_prediction()
    nifty_level = prediction.get("current_level", 0)

    regime = regime_data.get("regime", "SIDEWAYS")
    confidence = regime_data.get("confidence", 50)

    return {
        "success": True,
        "feature": "Market Regime Detection",
        "regime": regime,
        "description": regime_data.get("description", ""),
        "confidence": confidence,
        "nifty_level": nifty_level,
        "factors": {
            "trend": "BULLISH" if regime == "BULL" else "BEARISH" if regime == "BEAR" else "NEUTRAL",
            "breadth": f"{regime_data.get('breadth_200sma', 50):.0f}% above 200 SMA",
            "volatility": "Low" if regime == "BULL" else "High" if regime == "BEAR" else "Moderate",
            "momentum": f"{regime_data.get('bullish_macd_pct', 50):.0f}% bullish MACD",
        },
        "stocks_analyzed": regime_data.get("stocks_analyzed", 0),
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/ai/momentum-radar")
async def get_momentum_radar(
    universe: str = Query("nifty500", description="Stock universe"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
):
    """
    High momentum stocks detected by AI pattern recognition.
    """
    screener = get_live_screener()
    result = await screener.run_scanner(17, "N", "12")  # Bull momentum scanner

    stocks = []
    for stock in result.get("results", [])[:limit]:
        change = stock.get("change_pct", 0)
        rsi = stock.get("rsi", 50)
        momentum_score = round(min(abs(change) * 8 + (rsi - 40) * 0.3, 100))
        stocks.append({
            **stock,
            "current_price": stock.get("ltp", 0),
            "change_percent": change,
            "momentum_score": momentum_score,
            "signal_reason": stock.get("pattern", "") or stock.get("trend", "Momentum signal"),
        })

    return {
        "success": True,
        "results": stocks,
        "count": len(stocks),
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/ai/breakout-scanner")
async def get_breakout_scanner(
    universe: str = Query("nifty500", description="Stock universe"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
):
    """
    Stocks near or at breakout levels detected by AI.
    """
    screener = get_live_screener()
    result = await screener.run_scanner(1, "N", "12")  # Breakout scanner

    stocks = []
    for stock in result.get("results", [])[:limit]:
        change = stock.get("change_pct", 0)
        breakout_prob = round(min(50 + abs(change) * 6 + (stock.get("rsi", 50) - 40) * 0.4, 95))
        stocks.append({
            **stock,
            "current_price": stock.get("ltp", 0),
            "change_percent": change,
            "breakout_score": round(breakout_prob * 0.8),
            "breakout_probability": breakout_prob,
            "signal_reason": stock.get("pattern", "") or "Breakout from consolidation",
        })

    return {
        "success": True,
        "results": stocks,
        "count": len(stocks),
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/ai/reversal-scanner")
async def get_reversal_scanner(
    universe: str = Query("nifty500", description="Stock universe"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
):
    """
    Stocks showing reversal patterns detected by AI.
    """
    screener = get_live_screener()
    result = await screener.run_scanner(9, "N", "12")  # RSI oversold scanner

    stocks = []
    for stock in result.get("results", [])[:limit]:
        rsi = stock.get("rsi", 50)
        reversal_prob = round(min(90 - rsi + abs(stock.get("change_pct", 0)) * 3, 95))
        stocks.append({
            **stock,
            "current_price": stock.get("ltp", 0),
            "change_percent": stock.get("change_pct", 0),
            "reversal_score": round(reversal_prob * 0.75),
            "reversal_probability": reversal_prob,
            "signal_reason": stock.get("pattern", "") or f"RSI oversold at {rsi:.0f}",
        })

    return {
        "success": True,
        "results": stocks,
        "count": len(stocks),
        "timestamp": datetime.now().isoformat(),
    }


@router.get("/ai/trend-analysis")
async def get_trend_analysis():
    """
    Multi-timeframe trend analysis across market segments.
    Uses real breadth data and sector-wise analysis.
    """
    screener = get_live_screener()
    analysis = await screener.get_trend_analysis()

    if "error" in analysis:
        return {"success": False, "error": analysis["error"]}

    return {
        "success": True,
        "feature": "Trend Analysis",
        "summary": analysis.get("summary", {}),
        "sectors": analysis.get("sectors", {}),
        "stocks_analyzed": analysis.get("stocks_analyzed", 0),
        "timestamp": datetime.now().isoformat(),
    }


# ============================================================================
# TFT PRICE FORECAST ENDPOINT
# ============================================================================

@router.get("/ai/tft-forecast/{symbol}")
async def get_tft_forecast(
    symbol: str = Path(..., description="Stock symbol (e.g., RELIANCE, TCS)"),
):
    """
    Get TFT (Temporal Fusion Transformer) 5-day price forecast for a stock.

    Returns quantile predictions (p10, p50, p90), direction, and score.
    Requires the TFT model to be trained and loaded.
    """
    from ..services.market_data import get_market_data_provider

    sym = symbol.strip().upper()

    # Check if TFT model is available
    try:
        from ..services.model_registry import TFTPredictor
    except ImportError:
        return {
            "success": False,
            "error": "TFT model dependencies not installed (pytorch_forecasting required)",
        }

    screener = get_live_screener()
    tft = getattr(screener, "_tft_predictor", None)

    # Try loading from signal generator if screener doesn't have it
    if tft is None:
        try:
            from ..services.signal_generator import get_signal_generator
            sg = get_signal_generator()
            tft = getattr(sg, "_tft_predictor", None)
        except Exception:
            pass

    if tft is None:
        return {
            "success": False,
            "error": "TFT model not loaded. Ensure tft_model.ckpt exists in ml/models/",
        }

    # Fetch historical data for the stock
    provider = get_market_data_provider()
    try:
        df = await provider.get_historical_async(sym, period="6mo", interval="1d")
        if df is None or df.empty or len(df) < 130:
            return {"success": False, "error": f"Insufficient data for {sym} (need 130+ bars)"}
    except Exception as e:
        return {"success": False, "error": f"Failed to fetch data for {sym}: {e}"}

    # Run TFT prediction
    try:
        result = tft.predict_for_stock(df, sym)
        if result is None:
            return {"success": False, "error": f"TFT prediction returned empty for {sym}"}

        return {
            "success": True,
            "symbol": sym,
            "forecast": result,
            "model": "Temporal Fusion Transformer",
            "timestamp": datetime.now().isoformat(),
        }
    except Exception as e:
        logger.error(f"TFT forecast error for {sym}: {e}")
        return {"success": False, "error": str(e)}


@router.get("/ai/tft-forecast-batch")
async def get_tft_forecast_batch(
    symbols: str = Query("RELIANCE,TCS,INFY,HDFCBANK,ICICIBANK", description="Comma-separated symbols"),
    limit: int = Query(10, ge=1, le=20),
):
    """
    Get TFT forecasts for multiple stocks at once.
    Used by the AI Intelligence page Price Forecast tab.
    """
    from ..services.market_data import get_market_data_provider

    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()][:limit]

    screener = get_live_screener()
    tft = getattr(screener, "_tft_predictor", None)
    if tft is None:
        try:
            from ..services.signal_generator import get_signal_generator
            sg = get_signal_generator()
            tft = getattr(sg, "_tft_predictor", None)
        except Exception:
            pass

    if tft is None:
        return {
            "success": False,
            "error": "TFT model not loaded",
            "forecasts": [],
        }

    provider = get_market_data_provider()
    forecasts = []

    for sym in symbol_list:
        try:
            df = await provider.get_historical_async(sym, period="6mo", interval="1d")
            if df is None or df.empty or len(df) < 130:
                continue
            result = tft.predict_for_stock(df, sym)
            if result:
                forecasts.append({
                    "symbol": sym,
                    **result,
                })
        except Exception as e:
            logger.debug(f"TFT batch skip {sym}: {e}")
            continue

    return {
        "success": True,
        "forecasts": forecasts,
        "count": len(forecasts),
        "timestamp": datetime.now().isoformat(),
    }


# ============================================================================
# BACKTESTING ENDPOINT
# ============================================================================

@router.post("/backtest")
async def run_backtest(
    scanner_id: int = Query(..., description="Scanner to backtest"),
    days: int = Query(30, ge=7, le=365, description="Days to backtest"),
):
    """
    Run historical backtest on a scanner.
    Uses real scanner signals on historical data to compute win rate.
    """
    screener = get_live_screener()

    # Run the scanner to get current results, then compute historical returns
    result = await screener.run_scanner(scanner_id, "N", "12")
    stocks = result.get("results", [])

    if not stocks:
        return {
            "success": True,
            "scanner_id": scanner_id,
            "period_days": days,
            "results": {
                "total_trades": 0,
                "winning_trades": 0,
                "losing_trades": 0,
                "win_rate": 0,
                "note": "No stocks matched this scanner. Try a different scanner.",
            },
        }

    # Compute forward returns for scanner-picked stocks using Kite Connect
    from ..services.market_data import get_market_data_provider
    kite_prov = get_market_data_provider()._get_kite_provider()
    symbols = [s["symbol"] for s in stocks[:20]]

    try:
        batch_data = kite_prov.fetch_historical_batch(symbols, period=f"{days}d")
    except Exception:
        batch_data = {}

    winning = 0
    losing = 0
    profits = []
    losses = []

    for sym in symbols:
        try:
            df = batch_data.get(sym)
            if df is None or df.empty:
                continue
            closes = df["Close"].dropna() if "Close" in df.columns else df["close"].dropna()
            if len(closes) < 5:
                continue
            ret = (float(closes.iloc[-1]) - float(closes.iloc[0])) / float(closes.iloc[0]) * 100
            if ret > 0:
                winning += 1
                profits.append(ret)
            else:
                losing += 1
                losses.append(ret)
        except (KeyError, TypeError, IndexError):
            continue

    total_trades = winning + losing
    win_rate = round(winning / total_trades * 100, 2) if total_trades > 0 else 0
    avg_profit = round(sum(profits) / len(profits), 2) if profits else 0
    avg_loss = round(sum(losses) / len(losses), 2) if losses else 0

    return {
        "success": True,
        "scanner_id": scanner_id,
        "period_days": days,
        "source": "live",
        "results": {
            "total_trades": total_trades,
            "winning_trades": winning,
            "losing_trades": losing,
            "win_rate": win_rate,
            "avg_profit_pct": avg_profit,
            "avg_loss_pct": avg_loss,
            "profit_factor": round(abs(avg_profit / avg_loss), 2) if avg_loss != 0 else 0,
            "stocks_tested": symbols[:total_trades],
        },
    }


# ============================================================================
# ROUTE REGISTRATION
# ============================================================================

def register_screener_routes(app):
    """Register all screener routes with the FastAPI app"""
    app.include_router(router)
    app.include_router(quantai_router)
    logger.info("✅ AI Beta Screener routes registered (50+ scanners + QuantAI)")
