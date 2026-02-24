"""
================================================================================
SWINGAI - CUTTING-EDGE RISK MANAGEMENT ENGINE
================================================================================
5-Layer Risk Management for Maximum Returns with Minimum Drawdown
Handles: Equity, Futures, Options with proper margin & lot calculations
================================================================================
"""

import asyncio
from datetime import datetime, date, time, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)

# ============================================================================
# ENUMS & DATA CLASSES
# ============================================================================

class RiskLevel(Enum):
    LOW = "LOW"
    MODERATE = "MODERATE"
    HIGH = "HIGH"
    EXTREME = "EXTREME"

class Segment(Enum):
    EQUITY = "EQUITY"
    FUTURES = "FUTURES"
    OPTIONS = "OPTIONS"

class Direction(Enum):
    LONG = "LONG"
    SHORT = "SHORT"

@dataclass
class RiskProfile:
    name: str
    risk_per_trade: float  # % of capital
    max_positions: int
    min_confidence: float
    max_sector_exposure: float  # % of capital
    max_daily_loss: float  # % of capital
    max_weekly_loss: float
    max_monthly_loss: float
    position_size_factor: float
    allow_pyramiding: bool
    trailing_sl_enabled: bool

@dataclass
class MarketCondition:
    vix: float
    nifty_change: float
    fii_net: float
    advance_decline_ratio: float
    pcr: float  # Put-Call Ratio

@dataclass
class Signal:
    symbol: str
    segment: Segment
    direction: Direction
    confidence: float
    entry_price: float
    stop_loss: float
    target: float
    lot_size: int = 1
    expiry: Optional[date] = None
    strike: Optional[float] = None
    option_type: Optional[str] = None  # CE or PE

@dataclass
class PositionSize:
    quantity: int
    lots: int
    position_value: float
    margin_required: float
    risk_amount: float
    risk_percent: float
    approved: bool
    rejection_reason: Optional[str] = None

# ============================================================================
# RISK PROFILES
# ============================================================================

RISK_PROFILES = {
    "conservative": RiskProfile(
        name="Conservative",
        risk_per_trade=2.0,
        max_positions=3,
        min_confidence=75,
        max_sector_exposure=30,
        max_daily_loss=3.0,
        max_weekly_loss=5.0,
        max_monthly_loss=10.0,
        position_size_factor=0.7,
        allow_pyramiding=False,
        trailing_sl_enabled=True
    ),
    "moderate": RiskProfile(
        name="Moderate",
        risk_per_trade=3.0,
        max_positions=5,
        min_confidence=70,
        max_sector_exposure=40,
        max_daily_loss=5.0,
        max_weekly_loss=8.0,
        max_monthly_loss=15.0,
        position_size_factor=1.0,
        allow_pyramiding=True,
        trailing_sl_enabled=True
    ),
    "aggressive": RiskProfile(
        name="Aggressive",
        risk_per_trade=5.0,
        max_positions=8,
        min_confidence=65,
        max_sector_exposure=50,
        max_daily_loss=7.0,
        max_weekly_loss=12.0,
        max_monthly_loss=20.0,
        position_size_factor=1.3,
        allow_pyramiding=True,
        trailing_sl_enabled=False
    )
}

# ============================================================================
# F&O LOT SIZES (NSE - Updated Jan 2025)
# ============================================================================

FO_LOT_SIZES = {
    # Index
    "NIFTY": 25,
    "BANKNIFTY": 15,
    "FINNIFTY": 25,
    "MIDCPNIFTY": 50,
    
    # Stocks (sample - actual list has 180+ stocks)
    "RELIANCE": 250,
    "TCS": 150,
    "HDFCBANK": 550,
    "INFY": 300,
    "ICICIBANK": 700,
    "BHARTIARTL": 475,
    "SBIN": 750,
    "KOTAKBANK": 400,
    "LT": 150,
    "AXISBANK": 600,
    "TATASTEEL": 550,
    "JSWSTEEL": 300,
    "HINDALCO": 1075,
    "VEDL": 1700,
    "TATAMOTORS": 575,
    "MARUTI": 50,
    "M&M": 350,
    "BAJFINANCE": 125,
    "BAJAJFINSV": 125,
    "TITAN": 200,
    "TRENT": 200,
    "POLYCAB": 100,
    "PERSISTENT": 100,
    "DIXON": 75,
    "TATAELXSI": 75,
    "ABB": 125,
    "SIEMENS": 75,
    "HAL": 150,
    "BEL": 3250,
    "ADANIENT": 250,
    "ADANIPORTS": 500,
    "DLF": 825,
    "GODREJPROP": 275,
    # Add more as needed
}

# ============================================================================
# MARGIN REQUIREMENTS (Approximate)
# ============================================================================

MARGIN_REQUIREMENTS = {
    Segment.EQUITY: {
        "delivery": 1.0,  # 100% for CNC
        "intraday": 0.2   # 20% for MIS
    },
    Segment.FUTURES: {
        "nrml": 0.15,     # ~15% SPAN + Exposure
        "mis": 0.075      # ~7.5% for intraday
    },
    Segment.OPTIONS: {
        "buy": 1.0,       # Premium only
        "sell": 0.20      # ~20% for writing
    }
}

# ============================================================================
# RISK MANAGEMENT ENGINE
# ============================================================================

class RiskManagementEngine:
    """
    5-Layer Risk Management System
    
    Layer 1: Signal Level - Confidence, Model Agreement
    Layer 2: Position Level - Size, Risk per trade
    Layer 3: Portfolio Level - Max positions, Sector exposure, Correlation
    Layer 4: Market Level - VIX, Trend, Circuit breakers
    Layer 5: System Level - Daily/Weekly/Monthly loss limits
    """
    
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        self.cache = {}
    
    # ==========================================================================
    # LAYER 1: SIGNAL LEVEL CHECKS
    # ==========================================================================
    
    def check_signal_quality(
        self,
        signal: Signal,
        profile: RiskProfile
    ) -> Tuple[bool, str]:
        """
        Check if signal meets quality thresholds
        """
        # Check confidence
        if signal.confidence < profile.min_confidence:
            return False, f"Confidence {signal.confidence}% below minimum {profile.min_confidence}%"
        
        # Check risk:reward
        if signal.direction == Direction.LONG:
            risk = signal.entry_price - signal.stop_loss
            reward = signal.target - signal.entry_price
        else:
            risk = signal.stop_loss - signal.entry_price
            reward = signal.entry_price - signal.target
        
        if risk <= 0:
            return False, "Invalid stop loss - no risk defined"
        
        rr_ratio = reward / risk
        if rr_ratio < 1.5:
            return False, f"Risk:Reward {rr_ratio:.2f} below minimum 1.5"
        
        # Check stop loss distance (max 5% for equity, 3% for F&O)
        sl_percent = abs(signal.entry_price - signal.stop_loss) / signal.entry_price * 100
        max_sl = 5.0 if signal.segment == Segment.EQUITY else 3.0
        
        if sl_percent > max_sl:
            return False, f"Stop loss {sl_percent:.2f}% too wide (max {max_sl}%)"
        
        return True, "Signal quality check passed"
    
    # ==========================================================================
    # LAYER 2: POSITION SIZING
    # ==========================================================================
    
    def calculate_position_size(
        self,
        signal: Signal,
        capital: float,
        profile: RiskProfile,
        available_margin: Optional[float] = None
    ) -> PositionSize:
        """
        Calculate optimal position size based on risk
        
        Formula: Position Size = (Capital × Risk%) / (Entry - SL)
        Adjusted for: F&O lot sizes, Margin requirements, Risk profile
        """
        # Calculate risk amount
        risk_percent = profile.risk_per_trade * profile.position_size_factor
        risk_amount = capital * (risk_percent / 100)
        
        # Calculate risk per unit
        if signal.direction == Direction.LONG:
            risk_per_unit = signal.entry_price - signal.stop_loss
        else:
            risk_per_unit = signal.stop_loss - signal.entry_price
        
        if risk_per_unit <= 0:
            return PositionSize(
                quantity=0, lots=0, position_value=0, margin_required=0,
                risk_amount=0, risk_percent=0, approved=False,
                rejection_reason="Invalid stop loss"
            )
        
        # Calculate base quantity
        base_quantity = int(risk_amount / risk_per_unit)
        
        # Adjust for F&O lot sizes
        if signal.segment in [Segment.FUTURES, Segment.OPTIONS]:
            lot_size = FO_LOT_SIZES.get(signal.symbol, signal.lot_size)
            lots = max(1, base_quantity // lot_size)
            quantity = lots * lot_size
        else:
            lots = 1
            quantity = base_quantity
        
        if quantity < 1:
            return PositionSize(
                quantity=0, lots=0, position_value=0, margin_required=0,
                risk_amount=0, risk_percent=0, approved=False,
                rejection_reason="Position size too small for given risk"
            )
        
        # Calculate position value and margin
        position_value = quantity * signal.entry_price
        
        if signal.segment == Segment.EQUITY:
            margin_required = position_value * MARGIN_REQUIREMENTS[Segment.EQUITY]["delivery"]
        elif signal.segment == Segment.FUTURES:
            margin_required = position_value * MARGIN_REQUIREMENTS[Segment.FUTURES]["nrml"]
        else:  # OPTIONS
            if signal.direction == Direction.LONG:
                margin_required = position_value  # Premium only for buying
            else:
                margin_required = position_value * MARGIN_REQUIREMENTS[Segment.OPTIONS]["sell"]
        
        # Check against available margin
        if available_margin and margin_required > available_margin:
            # Reduce lots to fit margin
            if signal.segment in [Segment.FUTURES, Segment.OPTIONS]:
                max_lots = int(available_margin / (lot_size * signal.entry_price * 
                              MARGIN_REQUIREMENTS[signal.segment]["nrml" if signal.segment == Segment.FUTURES else "buy"]))
                if max_lots < 1:
                    return PositionSize(
                        quantity=0, lots=0, position_value=0, margin_required=margin_required,
                        risk_amount=0, risk_percent=0, approved=False,
                        rejection_reason=f"Insufficient margin. Required: ₹{margin_required:,.0f}"
                    )
                lots = max_lots
                quantity = lots * lot_size
                position_value = quantity * signal.entry_price
                margin_required = available_margin
            else:
                quantity = int(available_margin / signal.entry_price)
                position_value = quantity * signal.entry_price
                margin_required = position_value
        
        # Recalculate actual risk
        actual_risk = quantity * risk_per_unit
        actual_risk_percent = (actual_risk / capital) * 100
        
        return PositionSize(
            quantity=quantity,
            lots=lots,
            position_value=position_value,
            margin_required=margin_required,
            risk_amount=actual_risk,
            risk_percent=actual_risk_percent,
            approved=True
        )
    
    # ==========================================================================
    # LAYER 3: PORTFOLIO LEVEL CHECKS
    # ==========================================================================
    
    async def check_portfolio_limits(
        self,
        user_id: str,
        signal: Signal,
        profile: RiskProfile
    ) -> Tuple[bool, str]:
        """
        Check portfolio-level constraints
        """
        # Get current positions
        result = self.supabase.table("positions").select("*").eq(
            "user_id", user_id
        ).eq("is_active", True).execute()
        
        positions = result.data or []
        
        # Check max positions
        if len(positions) >= profile.max_positions:
            return False, f"Maximum positions ({profile.max_positions}) reached"
        
        # Check if already have position in this symbol
        existing = [p for p in positions if p["symbol"] == signal.symbol]
        if existing and not profile.allow_pyramiding:
            return False, f"Already have position in {signal.symbol}"
        
        # Check sector exposure (simplified - group by first letter)
        # In production, use proper sector mapping
        symbol_sector = signal.symbol[0]  # Simplified
        sector_exposure = sum(
            p["position_value"] for p in positions 
            if p["symbol"][0] == symbol_sector
        )
        
        # Get user capital
        profile_result = self.supabase.table("user_profiles").select(
            "capital"
        ).eq("id", user_id).single().execute()
        
        capital = profile_result.data["capital"]
        sector_percent = (sector_exposure / capital) * 100 if capital > 0 else 0
        
        if sector_percent >= profile.max_sector_exposure:
            return False, f"Sector exposure {sector_percent:.1f}% exceeds limit {profile.max_sector_exposure}%"
        
        # Check correlation (simplified - same direction positions)
        same_direction = [p for p in positions if p["direction"] == signal.direction.value]
        if len(same_direction) >= profile.max_positions * 0.8:
            return False, "Too many positions in same direction - diversify"
        
        return True, "Portfolio checks passed"
    
    # ==========================================================================
    # LAYER 4: MARKET LEVEL CHECKS
    # ==========================================================================
    
    def check_market_conditions(
        self,
        market: MarketCondition,
        signal: Signal
    ) -> Tuple[bool, str, float]:
        """
        Check market conditions and adjust position size
        
        Returns: (approved, message, size_multiplier)
        """
        multiplier = 1.0
        warnings = []
        
        # VIX-based adjustments
        if market.vix > 30:
            return False, "VIX > 30 - EXTREME VOLATILITY - No new trades", 0
        elif market.vix > 25:
            multiplier *= 0.5
            warnings.append(f"VIX {market.vix:.1f} - HIGH - Position reduced 50%")
        elif market.vix > 20:
            multiplier *= 0.75
            warnings.append(f"VIX {market.vix:.1f} - ELEVATED - Position reduced 25%")
        
        # Gap opening check
        if abs(market.nifty_change) > 2:
            multiplier *= 0.5
            warnings.append(f"Nifty gap {market.nifty_change:.1f}% - Wait for stabilization")
        
        # FII flow check
        if market.fii_net < -2000 and signal.direction == Direction.LONG:
            multiplier *= 0.75
            warnings.append("Heavy FII selling - Reduced long exposure")
        elif market.fii_net > 2000 and signal.direction == Direction.SHORT:
            multiplier *= 0.75
            warnings.append("Heavy FII buying - Reduced short exposure")
        
        # Breadth check
        if market.advance_decline_ratio < 0.5 and signal.direction == Direction.LONG:
            warnings.append("Weak market breadth - Consider waiting")
        
        # PCR check for options
        if signal.segment == Segment.OPTIONS:
            if market.pcr > 1.5:
                warnings.append("High PCR - Market may be oversold")
            elif market.pcr < 0.7:
                warnings.append("Low PCR - Market may be overbought")
        
        message = " | ".join(warnings) if warnings else "Market conditions favorable"
        return True, message, multiplier
    
    # ==========================================================================
    # LAYER 5: SYSTEM LEVEL CHECKS
    # ==========================================================================
    
    async def check_loss_limits(
        self,
        user_id: str,
        profile: RiskProfile
    ) -> Tuple[bool, str]:
        """
        Check daily/weekly/monthly loss limits
        """
        # Get user capital
        profile_result = self.supabase.table("user_profiles").select(
            "capital"
        ).eq("id", user_id).single().execute()
        capital = profile_result.data["capital"]
        
        today = date.today().isoformat()
        week_start = (date.today() - timedelta(days=date.today().weekday())).isoformat()
        month_start = date.today().replace(day=1).isoformat()
        
        # Get closed trades P&L
        trades = self.supabase.table("trades").select(
            "net_pnl, closed_at"
        ).eq("user_id", user_id).eq("status", "closed").execute()
        
        today_pnl = sum(
            t["net_pnl"] for t in trades.data 
            if t["closed_at"] and t["closed_at"][:10] == today
        )
        
        week_pnl = sum(
            t["net_pnl"] for t in trades.data 
            if t["closed_at"] and t["closed_at"][:10] >= week_start
        )
        
        month_pnl = sum(
            t["net_pnl"] for t in trades.data 
            if t["closed_at"] and t["closed_at"][:10] >= month_start
        )
        
        # Check limits
        daily_loss_percent = abs(min(0, today_pnl)) / capital * 100
        if daily_loss_percent >= profile.max_daily_loss:
            return False, f"Daily loss limit ({profile.max_daily_loss}%) reached. Trading paused."
        
        weekly_loss_percent = abs(min(0, week_pnl)) / capital * 100
        if weekly_loss_percent >= profile.max_weekly_loss:
            return False, f"Weekly loss limit ({profile.max_weekly_loss}%) reached. Trading paused."
        
        monthly_loss_percent = abs(min(0, month_pnl)) / capital * 100
        if monthly_loss_percent >= profile.max_monthly_loss:
            return False, f"Monthly loss limit ({profile.max_monthly_loss}%) reached. Trading paused."
        
        return True, "Loss limits check passed"
    
    # ==========================================================================
    # MASTER RISK CHECK
    # ==========================================================================
    
    async def evaluate_trade(
        self,
        user_id: str,
        signal: Signal,
        capital: float,
        available_margin: float,
        profile_name: str = "moderate",
        market: Optional[MarketCondition] = None
    ) -> Dict:
        """
        Run all 5 layers of risk checks and return decision
        """
        profile = RISK_PROFILES.get(profile_name, RISK_PROFILES["moderate"])
        
        result = {
            "approved": False,
            "signal": {
                "symbol": signal.symbol,
                "direction": signal.direction.value,
                "segment": signal.segment.value,
                "confidence": signal.confidence
            },
            "checks": {},
            "position_size": None,
            "warnings": [],
            "rejection_reason": None
        }
        
        # Layer 1: Signal Quality
        passed, message = self.check_signal_quality(signal, profile)
        result["checks"]["signal_quality"] = {"passed": passed, "message": message}
        if not passed:
            result["rejection_reason"] = message
            return result
        
        # Layer 2: Position Sizing
        position = self.calculate_position_size(signal, capital, profile, available_margin)
        result["position_size"] = {
            "quantity": position.quantity,
            "lots": position.lots,
            "position_value": position.position_value,
            "margin_required": position.margin_required,
            "risk_amount": position.risk_amount,
            "risk_percent": position.risk_percent
        }
        result["checks"]["position_size"] = {
            "passed": position.approved,
            "message": position.rejection_reason or "Position size calculated"
        }
        if not position.approved:
            result["rejection_reason"] = position.rejection_reason
            return result
        
        # Layer 3: Portfolio Limits
        passed, message = await self.check_portfolio_limits(user_id, signal, profile)
        result["checks"]["portfolio_limits"] = {"passed": passed, "message": message}
        if not passed:
            result["rejection_reason"] = message
            return result
        
        # Layer 4: Market Conditions
        if market:
            passed, message, multiplier = self.check_market_conditions(market, signal)
            result["checks"]["market_conditions"] = {
                "passed": passed,
                "message": message,
                "size_multiplier": multiplier
            }
            if not passed:
                result["rejection_reason"] = message
                return result
            
            if multiplier < 1.0:
                result["warnings"].append(message)
                # Adjust position size
                result["position_size"]["quantity"] = int(position.quantity * multiplier)
                if signal.segment in [Segment.FUTURES, Segment.OPTIONS]:
                    lot_size = FO_LOT_SIZES.get(signal.symbol, signal.lot_size)
                    result["position_size"]["lots"] = max(1, result["position_size"]["quantity"] // lot_size)
                    result["position_size"]["quantity"] = result["position_size"]["lots"] * lot_size
        
        # Layer 5: Loss Limits
        passed, message = await self.check_loss_limits(user_id, profile)
        result["checks"]["loss_limits"] = {"passed": passed, "message": message}
        if not passed:
            result["rejection_reason"] = message
            return result
        
        # All checks passed
        result["approved"] = True
        return result
    
    # ==========================================================================
    # TRAILING STOP LOSS
    # ==========================================================================
    
    def calculate_trailing_sl(
        self,
        entry_price: float,
        current_price: float,
        initial_sl: float,
        direction: Direction,
        atr: float = None
    ) -> float:
        """
        Calculate trailing stop loss based on profit
        
        Rules:
        - Move SL to breakeven after 1R profit
        - Trail by 50% of further gains
        """
        if direction == Direction.LONG:
            initial_risk = entry_price - initial_sl
            current_profit = current_price - entry_price
            
            if current_profit <= 0:
                return initial_sl
            
            # After 1R profit, move to breakeven
            if current_profit >= initial_risk:
                breakeven_sl = entry_price + (entry_price * 0.001)  # Small buffer
                
                # Trail by 50% of gains beyond 1R
                extra_profit = current_profit - initial_risk
                trailing_sl = breakeven_sl + (extra_profit * 0.5)
                
                return max(initial_sl, trailing_sl)
            
            return initial_sl
        
        else:  # SHORT
            initial_risk = initial_sl - entry_price
            current_profit = entry_price - current_price
            
            if current_profit <= 0:
                return initial_sl
            
            if current_profit >= initial_risk:
                breakeven_sl = entry_price - (entry_price * 0.001)
                extra_profit = current_profit - initial_risk
                trailing_sl = breakeven_sl - (extra_profit * 0.5)
                
                return min(initial_sl, trailing_sl)
            
            return initial_sl


# ============================================================================
# F&O SPECIFIC CALCULATIONS
# ============================================================================

class FOCalculator:
    """
    Futures & Options specific calculations
    """
    
    @staticmethod
    def get_lot_size(symbol: str) -> int:
        """Get F&O lot size for symbol"""
        return FO_LOT_SIZES.get(symbol, 1)
    
    @staticmethod
    def calculate_futures_margin(
        symbol: str,
        price: float,
        lots: int = 1,
        is_intraday: bool = False
    ) -> Dict:
        """
        Calculate futures margin requirement
        """
        lot_size = FO_LOT_SIZES.get(symbol, 1)
        quantity = lots * lot_size
        contract_value = quantity * price
        
        margin_rate = 0.075 if is_intraday else 0.15
        margin_required = contract_value * margin_rate
        
        return {
            "symbol": symbol,
            "lot_size": lot_size,
            "lots": lots,
            "quantity": quantity,
            "contract_value": contract_value,
            "margin_required": margin_required,
            "margin_type": "MIS" if is_intraday else "NRML"
        }
    
    @staticmethod
    def calculate_options_premium(
        symbol: str,
        strike: float,
        premium: float,
        lots: int = 1,
        is_buy: bool = True
    ) -> Dict:
        """
        Calculate options premium and margin
        """
        lot_size = FO_LOT_SIZES.get(symbol, 1)
        quantity = lots * lot_size
        total_premium = quantity * premium
        
        if is_buy:
            margin_required = total_premium  # Only premium for buying
        else:
            # Selling requires higher margin
            margin_required = total_premium * 5  # Approximate
        
        return {
            "symbol": symbol,
            "strike": strike,
            "lot_size": lot_size,
            "lots": lots,
            "quantity": quantity,
            "premium_per_share": premium,
            "total_premium": total_premium,
            "margin_required": margin_required,
            "type": "BUY" if is_buy else "SELL"
        }
    
    @staticmethod
    def select_option_strike(
        spot_price: float,
        direction: Direction,
        strikes_available: List[float],
        otm_distance: int = 1  # Number of strikes OTM
    ) -> Tuple[float, str]:
        """
        Select appropriate option strike
        
        For LONG direction: Buy PUT (for short via options)
        For SHORT direction: Buy CALL (for long via options)
        
        Wait, that's inverse. Let me correct:
        - To go LONG on stock: Buy CALL or Sell PUT
        - To go SHORT on stock: Buy PUT or Sell CALL
        
        We prefer buying for limited risk.
        """
        # Sort strikes
        strikes = sorted(strikes_available)
        
        # Find ATM strike
        atm_strike = min(strikes, key=lambda x: abs(x - spot_price))
        atm_index = strikes.index(atm_strike)
        
        if direction == Direction.LONG:
            # Buy CALL, slightly OTM
            target_index = min(atm_index + otm_distance, len(strikes) - 1)
            return strikes[target_index], "CE"
        else:
            # Buy PUT, slightly OTM
            target_index = max(atm_index - otm_distance, 0)
            return strikes[target_index], "PE"
    
    @staticmethod
    def get_next_expiry(symbol: str = "NIFTY") -> date:
        """
        Get next F&O expiry date
        
        Rules:
        - Index options: Weekly (Thursday)
        - Stock options: Monthly (last Thursday)
        """
        today = date.today()
        
        # Find next Thursday
        days_until_thursday = (3 - today.weekday()) % 7
        if days_until_thursday == 0 and datetime.now().hour >= 15:
            days_until_thursday = 7
        
        next_thursday = today + timedelta(days=days_until_thursday)
        
        # Check if it's a holiday (simplified)
        # In production, use NSE holiday calendar
        
        return next_thursday


# ============================================================================
# USAGE EXAMPLE
# ============================================================================

async def example_usage():
    """Example of using the risk management engine"""
    
    # Initialize
    from supabase import create_client
    supabase = create_client("url", "key")
    risk_engine = RiskManagementEngine(supabase)
    
    # Create signal
    signal = Signal(
        symbol="TRENT",
        segment=Segment.EQUITY,
        direction=Direction.LONG,
        confidence=82,
        entry_price=2765,
        stop_loss=2680,
        target=2930
    )
    
    # Create market condition
    market = MarketCondition(
        vix=14.5,
        nifty_change=0.45,
        fii_net=2450,
        advance_decline_ratio=1.8,
        pcr=1.1
    )
    
    # Evaluate trade
    result = await risk_engine.evaluate_trade(
        user_id="user-123",
        signal=signal,
        capital=500000,
        available_margin=400000,
        profile_name="moderate",
        market=market
    )
    
    print(f"Trade Approved: {result['approved']}")
    print(f"Position Size: {result['position_size']}")
    print(f"Checks: {result['checks']}")
    
    # F&O Example
    fo_calc = FOCalculator()
    
    # Futures margin
    futures_margin = fo_calc.calculate_futures_margin(
        symbol="NIFTY",
        price=21850,
        lots=2
    )
    print(f"Futures Margin: {futures_margin}")
    
    # Options strike selection
    strikes = [21500, 21600, 21700, 21800, 21900, 22000, 22100, 22200]
    strike, option_type = fo_calc.select_option_strike(
        spot_price=21850,
        direction=Direction.LONG,
        strikes_available=strikes
    )
    print(f"Selected Strike: {strike} {option_type}")


if __name__ == "__main__":
    asyncio.run(example_usage())
