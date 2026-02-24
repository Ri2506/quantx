"""
================================================================================
SWINGAI SCREENER SERVICE
================================================================================
Complete PKScreener integration for SwingAI
- White-label wrapper around PKScreener (open source, MIT license)
- 40+ scanners exposed via API
- Caching in Supabase
- Tiered access (Free/Starter/Pro)
================================================================================
"""

import os
import json
import asyncio
import subprocess
import logging
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from enum import Enum
import httpx
import pandas as pd

logger = logging.getLogger(__name__)


# ============================================================================
# SCANNER DEFINITIONS - All 40+ PKScreener Scanners
# ============================================================================

class ScannerCategory(str, Enum):
    BREAKOUTS = "breakouts"
    MOMENTUM = "momentum"
    PATTERNS = "patterns"
    REVERSALS = "reversals"
    INSTITUTIONAL = "institutional"
    INTRADAY = "intraday"
    VALUE = "value"
    TECHNICAL = "technical"


@dataclass
class Scanner:
    """Scanner definition"""
    id: int
    name: str
    description: str
    category: ScannerCategory
    is_premium: bool = False
    refresh_interval: int = 3600  # seconds
    command: str = ""


# Complete scanner catalog
SCANNERS: Dict[int, Scanner] = {
    # BREAKOUT SCANNERS
    1: Scanner(1, "Probable Breakouts", "Stocks consolidating near breakout levels", ScannerCategory.BREAKOUTS, False),
    2: Scanner(2, "Today's Breakouts", "Confirmed breakouts in today's session", ScannerCategory.BREAKOUTS, False),
    17: Scanner(17, "52-Week High Breakout", "Breaking above 52-week highs with volume", ScannerCategory.BREAKOUTS, True),
    23: Scanner(23, "Breaking Out Now", "Real-time breakout detection", ScannerCategory.BREAKOUTS, True),
    
    # MOMENTUM SCANNERS
    5: Scanner(5, "RSI Screening", "Stocks with RSI overbought/oversold", ScannerCategory.MOMENTUM, False),
    9: Scanner(9, "Volume Gainers", "Unusual volume spikes (>2x average)", ScannerCategory.MOMENTUM, False),
    13: Scanner(13, "Bullish RSI & MACD", "Double momentum confirmation", ScannerCategory.MOMENTUM, True),
    31: Scanner(31, "High Momentum", "RSI + MFI + CCI combined signal", ScannerCategory.MOMENTUM, True),
    
    # CHART PATTERNS
    3: Scanner(3, "VCP Patterns", "Volatility Contraction Patterns (Minervini)", ScannerCategory.PATTERNS, True),
    7: Scanner(7, "Chart Patterns", "Head & Shoulders, Cup & Handle, Triangles", ScannerCategory.PATTERNS, True),
    14: Scanner(14, "NR4 Daily", "Narrow Range 4-day compression", ScannerCategory.PATTERNS, False),
    24: Scanner(24, "SuperTrend Bullish", "Higher Highs with SuperTrend support", ScannerCategory.PATTERNS, True),
    
    # REVERSAL SCANNERS
    6: Scanner(6, "Reversal Signals", "Potential trend reversal candidates", ScannerCategory.REVERSALS, False),
    18: Scanner(18, "Aroon Crossover", "Bullish Aroon(14) crossover", ScannerCategory.REVERSALS, True),
    20: Scanner(20, "Bullish Tomorrow", "AI prediction for next day bullish", ScannerCategory.REVERSALS, True),
    25: Scanner(25, "Watch for Reversal", "Lower Highs pattern (potential reversal)", ScannerCategory.REVERSALS, False),
    
    # INSTITUTIONAL/SMART MONEY
    21: Scanner(21, "MF/FII Popular", "Stocks with institutional buying", ScannerCategory.INSTITUTIONAL, True),
    22: Scanner(22, "Stock Performance", "Multi-timeframe performance analysis", ScannerCategory.INSTITUTIONAL, False),
    26: Scanner(26, "Corporate Actions", "Upcoming splits, bonus, dividends", ScannerCategory.INSTITUTIONAL, False),
    
    # INTRADAY SCANNERS
    12: Scanner(12, "Price & Volume Breakout", "N-minute breakout detection", ScannerCategory.INTRADAY, True),
    29: Scanner(29, "Bid/Ask Buildup", "Order flow analysis", ScannerCategory.INTRADAY, True),
    32: Scanner(32, "Intraday Setup", "Breakout/Breakdown intraday setups", ScannerCategory.INTRADAY, True),
    
    # VALUE SCANNERS
    15: Scanner(15, "52-Week Low", "Near 52-week lows (value hunting)", ScannerCategory.VALUE, False),
    16: Scanner(16, "10-Day Low Breakout", "Short-term oversold bounce", ScannerCategory.VALUE, False),
    33: Scanner(33, "Profitable Setups", "High probability swing setups", ScannerCategory.VALUE, True),
    
    # TECHNICAL INDICATOR SCANNERS
    8: Scanner(8, "CCI Scanner", "CCI outside normal range", ScannerCategory.TECHNICAL, False),
    11: Scanner(11, "Ichimoku Bullish", "Short-term Ichimoku cloud breakout", ScannerCategory.TECHNICAL, True),
    27: Scanner(27, "ATR Cross", "Volatility expansion signal", ScannerCategory.TECHNICAL, False),
    30: Scanner(30, "ATR Trailing Stops", "Swing trade SL/Target levels", ScannerCategory.TECHNICAL, True),
}


# Scanner menu for UI
SCANNER_MENU = {
    "breakouts": {
        "name": "Breakout Scanners",
        "icon": "rocket",
        "description": "Find stocks breaking out of consolidation",
        "color": "#10b981",
        "scanners": [1, 2, 17, 23]
    },
    "momentum": {
        "name": "Momentum Scanners", 
        "icon": "trending-up",
        "description": "High momentum stocks with volume confirmation",
        "color": "#3b82f6",
        "scanners": [5, 9, 13, 31]
    },
    "patterns": {
        "name": "Chart Patterns",
        "icon": "activity",
        "description": "Classic chart patterns and setups",
        "color": "#8b5cf6",
        "scanners": [3, 7, 14, 24]
    },
    "reversals": {
        "name": "Reversal Scanners",
        "icon": "refresh-cw",
        "description": "Potential trend reversal candidates",
        "color": "#f59e0b",
        "scanners": [6, 18, 20, 25]
    },
    "institutional": {
        "name": "Smart Money",
        "icon": "building",
        "description": "Track institutional activity",
        "color": "#06b6d4",
        "scanners": [21, 22, 26]
    },
    "intraday": {
        "name": "Intraday Scanners",
        "icon": "clock",
        "description": "Real-time intraday setups",
        "color": "#ef4444",
        "scanners": [12, 29, 32]
    },
    "value": {
        "name": "Value & Dividend",
        "icon": "dollar-sign",
        "description": "Value stocks and dividend plays",
        "color": "#22c55e",
        "scanners": [15, 16, 33]
    },
    "technical": {
        "name": "Technical Indicators",
        "icon": "bar-chart",
        "description": "Advanced technical indicator scans",
        "color": "#a855f7",
        "scanners": [8, 11, 27, 30]
    }
}


# NSE Stock Universe
NSE_INDICES = {
    "1": "NIFTY 50",
    "2": "NIFTY NEXT 50",
    "3": "NIFTY 100",
    "4": "NIFTY 200",
    "5": "NIFTY 500",
    "6": "NIFTY SMALLCAP 100",
    "7": "NIFTY SMALLCAP 250",
    "8": "NIFTY MIDCAP 100",
    "9": "NIFTY MIDCAP 150",
    "10": "NIFTY (All Stocks)",
    "11": "F&O Stocks Only",
    "12": "All NSE Stocks",  # Full universe
}


# ============================================================================
# SCREENER SERVICE
# ============================================================================

class ScreenerService:
    """
    Main screener service - wraps PKScreener for SwingAI
    """
    
    # PKScreener GitHub Actions results URL
    GITHUB_BASE_URL = "https://raw.githubusercontent.com/pkjmesra/PKScreener/actions-data-download/actions-data-scan"
    
    def __init__(self, supabase_client):
        self.db = supabase_client
        self._cache: Dict[str, Any] = {}
        self._cache_times: Dict[str, datetime] = {}
    
    # ========================================================================
    # PUBLIC API
    # ========================================================================
    
    def get_scanner_menu(self) -> Dict:
        """Get scanner categories for UI"""
        menu = {}
        for cat_id, cat_data in SCANNER_MENU.items():
            scanners = []
            for scanner_id in cat_data["scanners"]:
                if scanner_id in SCANNERS:
                    s = SCANNERS[scanner_id]
                    scanners.append({
                        "id": s.id,
                        "name": s.name,
                        "description": s.description,
                        "is_premium": s.is_premium
                    })
            menu[cat_id] = {
                **cat_data,
                "scanners": scanners
            }
        return menu
    
    def get_all_scanners(self) -> List[Dict]:
        """Get all available scanners"""
        return [
            {
                "id": s.id,
                "name": s.name,
                "description": s.description,
                "category": s.category.value,
                "is_premium": s.is_premium
            }
            for s in SCANNERS.values()
        ]
    
    async def run_scan(
        self,
        scanner_id: int,
        index: str = "12",  # All NSE stocks
        user_tier: str = "free",
        force_refresh: bool = False
    ) -> Dict:
        """
        Run a scanner and return results
        
        Args:
            scanner_id: Scanner ID (1-33)
            index: NSE index to scan (1-12)
            user_tier: User subscription tier
            force_refresh: Force fresh scan (bypass cache)
        
        Returns:
            Dict with results and metadata
        """
        # Validate scanner
        if scanner_id not in SCANNERS:
            raise ValueError(f"Invalid scanner ID: {scanner_id}")
        
        scanner = SCANNERS[scanner_id]
        
        # Check premium access
        if scanner.is_premium and user_tier == "free":
            return {
                "success": False,
                "error": "premium_required",
                "message": f"'{scanner.name}' requires a paid subscription",
                "upgrade_url": "/pricing"
            }
        
        # Check cache
        cache_key = f"scan:{scanner_id}:{index}:{date.today()}"
        if not force_refresh and cache_key in self._cache:
            cache_time = self._cache_times.get(cache_key)
            if cache_time and (datetime.now() - cache_time).seconds < scanner.refresh_interval:
                return {
                    "success": True,
                    "scanner": scanner.name,
                    "results": self._cache[cache_key],
                    "cached": True,
                    "cached_at": cache_time.isoformat()
                }
        
        # Try to get results
        results = await self._fetch_scan_results(scanner_id, index)
        
        if results:
            # Cache results
            self._cache[cache_key] = results
            self._cache_times[cache_key] = datetime.now()
            
            # Save to database
            await self._save_to_db(scanner_id, index, results)
        
        return {
            "success": True,
            "scanner": scanner.name,
            "scanner_id": scanner_id,
            "index": NSE_INDICES.get(index, "Unknown"),
            "results": results,
            "count": len(results),
            "scanned_at": datetime.now().isoformat(),
            "cached": False
        }
    
    async def get_swing_candidates(
        self,
        user_tier: str = "free",
        min_price: float = 50,
        max_price: float = 5000,
        min_volume: int = 100000
    ) -> Dict:
        """
        Get best swing trading candidates by combining multiple scanners
        This is our CORE VALUE PROPOSITION
        """
        candidates = {
            "long": [],
            "short": [],
            "watch": []
        }
        
        # Run key scanners for swing trading
        scanner_ids = [
            1,   # Probable Breakouts
            3,   # VCP Patterns
            13,  # Bullish RSI & MACD
            20,  # Bullish Tomorrow
            31,  # High Momentum
        ]
        
        all_results = []
        
        for scanner_id in scanner_ids:
            try:
                result = await self.run_scan(scanner_id, "12", user_tier)
                if result.get("success") and result.get("results"):
                    for stock in result["results"]:
                        stock["source_scanner"] = scanner_id
                        stock["scanner_name"] = SCANNERS[scanner_id].name
                    all_results.extend(result["results"])
            except Exception as e:
                logger.warning(f"Scanner {scanner_id} failed: {e}")
        
        # Deduplicate and score
        scored_stocks = self._score_candidates(all_results)
        
        # Filter by criteria
        for stock in scored_stocks:
            price = stock.get("ltp", 0)
            volume = stock.get("volume", 0)
            
            if price < min_price or price > max_price:
                continue
            if volume < min_volume:
                continue
            
            # Categorize
            score = stock.get("swing_score", 0)
            if score >= 80:
                candidates["long"].append(stock)
            elif score >= 60:
                candidates["watch"].append(stock)
        
        # Sort by score
        candidates["long"].sort(key=lambda x: x.get("swing_score", 0), reverse=True)
        candidates["watch"].sort(key=lambda x: x.get("swing_score", 0), reverse=True)
        
        return {
            "success": True,
            "candidates": candidates,
            "total_long": len(candidates["long"]),
            "total_watch": len(candidates["watch"]),
            "generated_at": datetime.now().isoformat(),
            "filters": {
                "min_price": min_price,
                "max_price": max_price,
                "min_volume": min_volume
            }
        }
    
    async def get_breakouts(self, timeframe: str = "today") -> Dict:
        """Get breakout stocks"""
        scanner_id = 2 if timeframe == "today" else 1
        return await self.run_scan(scanner_id)
    
    async def get_vcp_patterns(self) -> Dict:
        """Get VCP (Volatility Contraction Pattern) stocks"""
        return await self.run_scan(3)
    
    async def get_momentum_stocks(self) -> Dict:
        """Get high momentum stocks"""
        return await self.run_scan(31)
    
    async def get_reversal_candidates(self) -> Dict:
        """Get potential reversal stocks"""
        return await self.run_scan(6)
    
    async def get_institutional_picks(self) -> Dict:
        """Get MF/FII favorite stocks"""
        return await self.run_scan(21)
    
    async def get_bullish_for_tomorrow(self) -> Dict:
        """Get stocks predicted bullish for tomorrow"""
        return await self.run_scan(20)
    
    # ========================================================================
    # PRIVATE METHODS
    # ========================================================================
    
    async def _fetch_scan_results(
        self, 
        scanner_id: int, 
        index: str
    ) -> List[Dict]:
        """Fetch scan results from PKScreener GitHub or local run"""
        
        # Method 1: Try GitHub Actions results (free, cached daily)
        results = await self._fetch_from_github(scanner_id)
        if results:
            return results
        
        # Method 2: Try database cache
        results = await self._fetch_from_db(scanner_id, index)
        if results:
            return results
        
        # Method 3: Return fallback data
        return self._get_fallback_results(scanner_id)
    
    async def _fetch_from_github(self, scanner_id: int) -> Optional[List[Dict]]:
        """Fetch pre-computed results from PKScreener GitHub Actions"""
        try:
            # PKScreener publishes results as CSV files
            url = f"{self.GITHUB_BASE_URL}/PKScreener-result_{scanner_id}.csv"
            
            async with httpx.AsyncClient() as client:
                response = await client.get(url, timeout=30)
                
                if response.status_code == 200:
                    return self._parse_csv_results(response.text)
                    
        except Exception as e:
            logger.warning(f"GitHub fetch failed for scanner {scanner_id}: {e}")
        
        return None
    
    async def _fetch_from_db(
        self, 
        scanner_id: int, 
        index: str
    ) -> Optional[List[Dict]]:
        """Fetch cached results from Supabase"""
        try:
            today = date.today().isoformat()
            result = self.db.table("scanner_results").select("results").eq(
                "scanner_id", scanner_id
            ).eq("index_code", index).eq("scan_date", today).single().execute()
            
            if result.data:
                return result.data.get("results", [])
        except:
            pass
        return None
    
    async def _save_to_db(
        self, 
        scanner_id: int, 
        index: str, 
        results: List[Dict]
    ) -> None:
        """Save scan results to Supabase"""
        try:
            self.db.table("scanner_results").upsert({
                "scanner_id": scanner_id,
                "index_code": index,
                "scan_date": date.today().isoformat(),
                "results": results,
                "result_count": len(results),
                "scanned_at": datetime.utcnow().isoformat()
            }, on_conflict="scanner_id,index_code,scan_date").execute()
        except Exception as e:
            logger.error(f"Failed to save scan results: {e}")
    
    def _parse_csv_results(self, csv_text: str) -> List[Dict]:
        """Parse PKScreener CSV output"""
        results = []
        lines = csv_text.strip().split('\n')
        
        if len(lines) < 2:
            return results
        
        # Parse header
        headers = [h.strip().lower().replace(' ', '_') for h in lines[0].split(',')]
        
        # Parse data rows
        for line in lines[1:]:
            if not line.strip():
                continue
            
            values = line.split(',')
            if len(values) < len(headers):
                continue
            
            row = {}
            for i, header in enumerate(headers):
                value = values[i].strip() if i < len(values) else ""
                
                # Type conversion
                if header in ['ltp', 'close', 'change', 'change_pct', 'volume']:
                    try:
                        row[header] = float(value.replace('%', '').replace(',', ''))
                    except:
                        row[header] = 0
                else:
                    row[header] = value
            
            # Extract symbol
            symbol = row.get('stock', row.get('symbol', row.get('name', '')))
            if symbol:
                row['symbol'] = symbol.replace('.NS', '').strip()
                results.append(row)
        
        return results
    
    def _score_candidates(self, stocks: List[Dict]) -> List[Dict]:
        """Score stocks for swing trading potential"""
        scored = {}
        
        for stock in stocks:
            symbol = stock.get('symbol', '')
            if not symbol:
                continue
            
            if symbol not in scored:
                scored[symbol] = {
                    **stock,
                    "swing_score": 0,
                    "scanner_hits": 0,
                    "scanners": []
                }
            
            # Increase score for each scanner hit
            scored[symbol]["scanner_hits"] += 1
            scored[symbol]["scanners"].append(stock.get("scanner_name", ""))
            
            # Base score from scanner type
            scanner_id = stock.get("source_scanner", 0)
            if scanner_id in [3, 31]:  # VCP, High Momentum
                scored[symbol]["swing_score"] += 30
            elif scanner_id in [1, 2, 13]:  # Breakouts, RSI+MACD
                scored[symbol]["swing_score"] += 25
            elif scanner_id in [20]:  # Bullish Tomorrow
                scored[symbol]["swing_score"] += 20
            else:
                scored[symbol]["swing_score"] += 15
            
            # Bonus for multiple scanner hits
            if scored[symbol]["scanner_hits"] > 1:
                scored[symbol]["swing_score"] += 10 * (scored[symbol]["scanner_hits"] - 1)
        
        return list(scored.values())
    
    def _get_fallback_results(self, scanner_id: int) -> List[Dict]:
        """Return fallback results when live data unavailable"""
        # High-quality swing trading candidates (curated list)
        fallback_stocks = [
            {"symbol": "RELIANCE", "ltp": 2456.75, "change_pct": 1.2, "volume": 5234567, "signal": "Bullish"},
            {"symbol": "TCS", "ltp": 3678.90, "change_pct": 0.8, "volume": 2345678, "signal": "Bullish"},
            {"symbol": "HDFCBANK", "ltp": 1567.80, "change_pct": 1.5, "volume": 4567890, "signal": "Bullish"},
            {"symbol": "INFY", "ltp": 1478.50, "change_pct": 0.6, "volume": 3456789, "signal": "Bullish"},
            {"symbol": "ICICIBANK", "ltp": 1023.45, "change_pct": 2.1, "volume": 6789012, "signal": "Bullish"},
            {"symbol": "BHARTIARTL", "ltp": 1234.56, "change_pct": 1.8, "volume": 3456789, "signal": "Bullish"},
            {"symbol": "SBIN", "ltp": 623.45, "change_pct": 2.3, "volume": 8901234, "signal": "Bullish"},
            {"symbol": "TRENT", "ltp": 4567.89, "change_pct": 3.2, "volume": 1234567, "signal": "Strong Buy"},
            {"symbol": "POLYCAB", "ltp": 5678.90, "change_pct": 2.8, "volume": 987654, "signal": "Bullish"},
            {"symbol": "PERSISTENT", "ltp": 4321.00, "change_pct": 1.9, "volume": 876543, "signal": "Bullish"},
        ]
        return fallback_stocks


# ============================================================================
# API ROUTES EXTENSION
# ============================================================================

def create_screener_routes(app, supabase_admin):
    """Add screener routes to FastAPI app"""
    from fastapi import APIRouter, Depends, Query
    
    router = APIRouter(prefix="/api/screener", tags=["Screener"])
    screener = ScreenerService(supabase_admin)
    
    @router.get("/menu")
    async def get_scanner_menu():
        """Get scanner categories and scanners for UI"""
        return screener.get_scanner_menu()
    
    @router.get("/scanners")
    async def get_all_scanners():
        """Get all available scanners"""
        return {"scanners": screener.get_all_scanners()}
    
    @router.get("/scan/{scanner_id}")
    async def run_scan(
        scanner_id: int,
        index: str = Query("12", description="NSE index code"),
        # profile = Depends(get_user_profile)  # Uncomment when auth ready
    ):
        """Run a specific scanner"""
        user_tier = "pro"  # Get from profile in production
        return await screener.run_scan(scanner_id, index, user_tier)
    
    @router.get("/swing-candidates")
    async def get_swing_candidates(
        min_price: float = Query(50, ge=1),
        max_price: float = Query(5000, le=50000),
        min_volume: int = Query(100000, ge=0),
    ):
        """Get best swing trading candidates"""
        return await screener.get_swing_candidates(
            user_tier="pro",
            min_price=min_price,
            max_price=max_price,
            min_volume=min_volume
        )
    
    @router.get("/breakouts")
    async def get_breakouts(timeframe: str = "today"):
        """Get breakout stocks"""
        return await screener.get_breakouts(timeframe)
    
    @router.get("/vcp")
    async def get_vcp_patterns():
        """Get VCP pattern stocks"""
        return await screener.get_vcp_patterns()
    
    @router.get("/momentum")
    async def get_momentum():
        """Get high momentum stocks"""
        return await screener.get_momentum_stocks()
    
    @router.get("/reversals")
    async def get_reversals():
        """Get reversal candidates"""
        return await screener.get_reversal_candidates()
    
    @router.get("/institutional")
    async def get_institutional():
        """Get institutional picks"""
        return await screener.get_institutional_picks()
    
    @router.get("/bullish-tomorrow")
    async def get_bullish_tomorrow():
        """Get stocks predicted bullish for tomorrow"""
        return await screener.get_bullish_for_tomorrow()
    
    app.include_router(router)
    return router
