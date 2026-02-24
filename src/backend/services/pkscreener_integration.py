"""
================================================================================
                    PKSCREENER INTEGRATION
                    ======================
                    
    Integrates PKScreener for:
    - Stock filtering (2500+ → 50 swing candidates)
    - Pre-built swing trading scans
    - Quality stock selection
    
    GitHub: https://github.com/pkjmesra/PKScreener
    
================================================================================
"""

import os
import json
import subprocess
import pandas as pd
import requests
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class PKScreenerIntegration:
    """
    Integration with PKScreener for stock filtering
    
    PKScreener scans:
    - Menu 1: Breakout scans
    - Menu 2: Momentum scans  
    - Menu 3: Chart patterns
    - Menu 4: Volume scans
    - Menu 5: Trend scans
    - Menu 6: Swing trading scans (MAIN)
    - Menu 7: Short-term scans
    """
    
    def __init__(self):
        self.base_url = "https://raw.githubusercontent.com/pkjmesra/PKScreener/actions-data-download/actions-data-scan"
        self.cache_dir = "./pkscreener_cache"
        os.makedirs(self.cache_dir, exist_ok=True)
        
        # Scan menu mappings
        self.scan_menus = {
            "breakout": 1,
            "momentum": 2,
            "chart_patterns": 3,
            "volume": 4,
            "trend": 5,
            "swing": 6,
            "short_term": 7
        }
        
        # Sub-scan mappings for swing trading
        self.swing_scans = {
            "swing_buy": "6_1",
            "pullback_support": "6_2",
            "ema_bounce": "6_3",
            "higher_high_low": "6_4"
        }
    
    def fetch_github_results(self, scan_type: str = "swing") -> Optional[pd.DataFrame]:
        """
        Fetch pre-computed results from PKScreener GitHub Actions
        
        PKScreener runs daily scans via GitHub Actions and publishes results.
        We can fetch these directly without running locally.
        """
        try:
            # PKScreener publishes results as CSV
            url = f"{self.base_url}/PKScreener-result_{self.scan_menus.get(scan_type, 6)}.csv"
            
            response = requests.get(url, timeout=30)
            
            if response.status_code == 200:
                # Save to cache
                cache_file = f"{self.cache_dir}/{scan_type}_{datetime.now().strftime('%Y%m%d')}.csv"
                with open(cache_file, 'w') as f:
                    f.write(response.text)
                
                # Parse CSV
                df = pd.read_csv(cache_file)
                logger.info(f"Fetched {len(df)} stocks from PKScreener ({scan_type})")
                return df
            else:
                logger.warning(f"PKScreener fetch failed: {response.status_code}")
                return None
                
        except Exception as e:
            logger.error(f"Error fetching PKScreener data: {e}")
            return None
    
    def run_local_scan(
        self, 
        scan_type: str = "swing",
        sub_scan: str = None
    ) -> Optional[pd.DataFrame]:
        """
        Run PKScreener locally (requires pkscreener installed)
        
        Install: pip install pkscreener
        """
        try:
            # Build command
            menu = self.scan_menus.get(scan_type, 6)
            
            cmd = [
                "pkscreener",
                "-a", "Y",  # Auto mode
                "-o", str(menu),  # Menu option
                "-e",  # Enable extra features
                "-p"   # Parallel processing
            ]
            
            if sub_scan:
                cmd.extend(["-s", sub_scan])
            
            # Run scan
            logger.info(f"Running PKScreener: {' '.join(cmd)}")
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode == 0:
                # Parse output (PKScreener saves to file)
                output_file = "PKScreener-result.csv"
                if os.path.exists(output_file):
                    df = pd.read_csv(output_file)
                    return df
            else:
                logger.error(f"PKScreener error: {result.stderr}")
                return None
                
        except subprocess.TimeoutExpired:
            logger.error("PKScreener scan timed out")
            return None
        except FileNotFoundError:
            logger.error("PKScreener not installed. Run: pip install pkscreener")
            return None
        except Exception as e:
            logger.error(f"Error running PKScreener: {e}")
            return None
    
    def get_swing_candidates(
        self,
        use_github: bool = True,
        max_stocks: int = 50,
        min_price: float = 50,
        max_price: float = 10000,
        min_volume: int = 100000,
        scan_type: str = "swing"
    ) -> List[str]:
        """
        Get filtered candidates from PKScreener scan

        Filtering criteria:
        - Price between min_price and max_price
        - Volume > min_volume
        - No ASM/GSM stocks
        - Positive swing setup indicators
        """
        
        # Try GitHub first (faster)
        if use_github:
            df = self.fetch_github_results(scan_type)
        else:
            df = self.run_local_scan(scan_type)
        
        if df is None or len(df) == 0:
            logger.warning("No PKScreener data, using fallback list")
            return self._get_fallback_candidates()
        
        # Apply filters
        candidates = self._filter_candidates(df, min_price, max_price, min_volume)
        
        # Rank and limit
        candidates = candidates[:max_stocks]
        
        logger.info(f"Selected {len(candidates)} swing candidates")
        return candidates
    
    def _filter_candidates(
        self,
        df: pd.DataFrame,
        min_price: float,
        max_price: float,
        min_volume: int
    ) -> List[str]:
        """Apply filtering criteria to PKScreener results"""
        
        candidates = []
        
        # PKScreener column names may vary, handle flexibly
        symbol_col = self._find_column(df, ['Symbol', 'Stock', 'Ticker', 'Name'])
        price_col = self._find_column(df, ['LTP', 'Close', 'Price', 'CMP'])
        volume_col = self._find_column(df, ['Volume', 'Vol', 'VolumeLakh'])
        
        if symbol_col is None:
            logger.error("Could not find symbol column in PKScreener data")
            return []
        
        for _, row in df.iterrows():
            symbol = str(row[symbol_col]).strip()
            
            # Skip invalid symbols
            if not symbol or symbol == 'nan':
                continue
            
            # Apply price filter
            if price_col:
                try:
                    price = float(row[price_col])
                    if price < min_price or price > max_price:
                        continue
                except:
                    pass
            
            # Apply volume filter
            if volume_col:
                try:
                    volume = float(row[volume_col])
                    # PKScreener might report in lakhs
                    if 'lakh' in volume_col.lower():
                        volume = volume * 100000
                    if volume < min_volume:
                        continue
                except:
                    pass
            
            # Clean symbol (remove .NS suffix if present)
            symbol = symbol.replace('.NS', '').replace('.BO', '')
            candidates.append(symbol)
        
        return candidates
    
    def _find_column(self, df: pd.DataFrame, possible_names: List[str]) -> Optional[str]:
        """Find column by possible names"""
        for name in possible_names:
            for col in df.columns:
                if name.lower() in col.lower():
                    return col
        return None
    
    def _get_fallback_candidates(self) -> List[str]:
        """Fallback candidate list when PKScreener is unavailable"""
        
        # High-quality swing trading candidates (manually curated)
        return [
            # Large caps with good liquidity
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
            "BHARTIARTL", "SBIN", "KOTAKBANK", "LT", "AXISBANK",
            
            # Quality mid-caps
            "TRENT", "POLYCAB", "PERSISTENT", "DIXON", "TATAELXSI",
            "ASTRAL", "COFORGE", "LALPATHLAB", "MUTHOOTFIN", "INDHOTEL",
            
            # Momentum stocks
            "ABB", "SIEMENS", "HAL", "BEL", "BHEL",
            "IRCTC", "TATAPOWER", "ADANIGREEN", "ADANIENT", "ADANIPORTS",
            
            # Metal/Mining (for shorts in bear market)
            "TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "HINDCOPPER",
            "SAIL", "NATIONALUM", "NMDC", "COALINDIA", "JINDALSTEL"
        ]
    
    def get_scan_results(self, scan_name: str) -> Dict:
        """
        Get results for a specific PKScreener scan
        
        Available scans:
        - breakout: Stocks breaking out with volume
        - momentum: RSI/MACD based momentum
        - chart_patterns: Candlestick patterns
        - volume: Volume spike stocks
        - trend: Trending stocks
        - swing: Swing trading setups
        """
        
        df = self.fetch_github_results(scan_name)
        
        if df is None:
            return {"success": False, "error": "Could not fetch data"}
        
        return {
            "success": True,
            "scan": scan_name,
            "count": len(df),
            "stocks": df.to_dict('records')[:20],  # Top 20
            "timestamp": datetime.now().isoformat()
        }
    
    def get_stage2_breakouts(self) -> List[str]:
        """
        Get Stage 2 breakout candidates (Minervini method)
        
        Stage 2 criteria:
        - Price > 150 DMA and 200 DMA
        - 150 DMA > 200 DMA
        - 200 DMA trending up for 1 month
        - Price > 50 DMA
        - Price at least 25% above 52-week low
        - Price within 25% of 52-week high
        """
        
        # Use PKScreener's trend scan which includes Stage 2
        df = self.fetch_github_results("trend")
        
        if df is None:
            return []
        
        # Filter for Stage 2 characteristics
        candidates = self._filter_candidates(df, 50, 10000, 100000)
        
        return candidates[:30]  # Top 30 breakouts
    
    def get_vcp_patterns(self) -> List[str]:
        """
        Get VCP (Volatility Contraction Pattern) candidates
        
        VCP characteristics:
        - Series of contracting ranges
        - Decreasing volume on pullbacks
        - Near breakout point
        """
        
        # Use chart patterns scan
        df = self.fetch_github_results("chart_patterns")
        
        if df is None:
            return []
        
        candidates = self._filter_candidates(df, 50, 10000, 100000)
        
        return candidates[:20]
    
    def get_high_delivery_stocks(self) -> List[str]:
        """
        Get stocks with high delivery percentage (>50%)
        
        High delivery indicates real buying, not speculation.
        """
        
        df = self.fetch_github_results("volume")
        
        if df is None:
            return []
        
        # Filter for high delivery
        delivery_col = self._find_column(df, ['Delivery', 'Del%', 'DeliveryPct'])
        
        if delivery_col:
            df = df[df[delivery_col] > 50]
        
        candidates = self._filter_candidates(df, 50, 10000, 100000)
        
        return candidates[:30]


class SwingScreener:
    """
    Higher-level screener combining PKScreener with custom filters
    """
    
    def __init__(self):
        self.pkscreener = PKScreenerIntegration()
    
    def get_daily_candidates(
        self,
        market_condition: str = "BULLISH"  # BULLISH, BEARISH, SIDEWAYS
    ) -> Dict:
        """
        Get daily swing trading candidates based on market condition
        """
        
        candidates = {
            "long": [],
            "short": [],
            "watch": []
        }
        
        if market_condition in ["BULLISH", "SIDEWAYS"]:
            # Get long candidates
            swing_candidates = self.pkscreener.get_swing_candidates(max_stocks=30)
            breakouts = self.pkscreener.get_stage2_breakouts()
            
            # Combine and dedupe
            long_candidates = list(set(swing_candidates + breakouts))[:40]
            candidates["long"] = long_candidates
        
        if market_condition in ["BEARISH", "SIDEWAYS"]:
            # Get short candidates (F&O stocks only)
            fo_stocks = self._get_fo_eligible_stocks()
            
            # In bearish market, look for weak stocks
            # For now, use some known weak sectors
            short_candidates = [s for s in fo_stocks if s in self._get_weak_sector_stocks()]
            candidates["short"] = short_candidates[:20]
        
        # Add watch list
        vcp = self.pkscreener.get_vcp_patterns()
        candidates["watch"] = vcp[:10]
        
        return {
            "date": datetime.now().strftime("%Y-%m-%d"),
            "market_condition": market_condition,
            "candidates": candidates,
            "total_long": len(candidates["long"]),
            "total_short": len(candidates["short"]),
            "total_watch": len(candidates["watch"])
        }
    
    def _get_fo_eligible_stocks(self) -> List[str]:
        """Get F&O eligible stocks (can be shorted)"""
        # This is a subset - actual list has ~180 stocks
        return [
            "RELIANCE", "TCS", "HDFCBANK", "INFY", "ICICIBANK",
            "BHARTIARTL", "SBIN", "KOTAKBANK", "LT", "AXISBANK",
            "TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "TATAMOTORS",
            "MARUTI", "M&M", "HEROMOTOCO", "BAJAJ-AUTO", "EICHERMOT",
            "SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "BIOCON",
            "TITAN", "TRENT", "JUBLFOOD", "PAGEIND", "MCDOWELL-N",
            "ADANIENT", "ADANIPORTS", "ADANIGREEN", "DLF", "GODREJPROP"
        ]
    
    def _get_weak_sector_stocks(self) -> List[str]:
        """Get stocks from typically weak sectors in bear markets"""
        return [
            "TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "SAIL",
            "HINDCOPPER", "NATIONALUM", "NMDC", "JINDALSTEL",
            "DLF", "GODREJPROP", "OBEROIRLTY", "PRESTIGE", "SOBHA",
            "INDHOTEL", "LEMON", "ELGIEQUIP"
        ]


# ==============================================================================
# USAGE EXAMPLE
# ==============================================================================

if __name__ == "__main__":
    # Initialize
    screener = SwingScreener()
    
    # Get daily candidates
    candidates = screener.get_daily_candidates(market_condition="BULLISH")
    
    print(f"\n{'='*60}")
    print(f"SWING TRADING CANDIDATES - {candidates['date']}")
    print(f"Market Condition: {candidates['market_condition']}")
    print(f"{'='*60}")
    
    print(f"\n🟢 LONG CANDIDATES ({candidates['total_long']}):")
    for i, stock in enumerate(candidates['candidates']['long'][:10], 1):
        print(f"   {i}. {stock}")
    
    print(f"\n🔴 SHORT CANDIDATES ({candidates['total_short']}):")
    for i, stock in enumerate(candidates['candidates']['short'][:5], 1):
        print(f"   {i}. {stock}")
    
    print(f"\n👀 WATCH LIST ({candidates['total_watch']}):")
    for i, stock in enumerate(candidates['candidates']['watch'][:5], 1):
        print(f"   {i}. {stock}")
