"""SwingAI Services Package."""

SignalGenerator = None
GeneratedSignal = None
RiskManagementEngine = None
FOCalculator = None
FOTradingEngine = None
FORiskManager = None
BrokerFactory = None
TradeExecutor = None
ZerodhaBroker = None
AngelOneBroker = None
UpstoxBroker = None
PKScreenerIntegration = None
SwingScreener = None

try:
    from .signal_generator import SignalGenerator, GeneratedSignal
except Exception:
    pass

try:
    from .risk_management import RiskManagementEngine, FOCalculator
except Exception:
    pass

try:
    from .fo_trading_engine import FOTradingEngine, FORiskManager
except Exception:
    pass

try:
    from .broker_integration import BrokerFactory, TradeExecutor, ZerodhaBroker, AngelOneBroker, UpstoxBroker
except Exception:
    pass

try:
    from .pkscreener_integration import PKScreenerIntegration, SwingScreener
except Exception:
    pass

__all__ = [
    # Signal Generation
    "SignalGenerator",
    "GeneratedSignal",
    
    # Risk Management
    "RiskManagementEngine",
    "FOCalculator",
    
    # F&O Trading
    "FOTradingEngine",
    "FORiskManager",
    
    # Broker Integration
    "BrokerFactory",
    "TradeExecutor",
    "ZerodhaBroker",
    "AngelOneBroker",
    "UpstoxBroker",
    
    # Screener
    "PKScreenerIntegration",
    "SwingScreener",
]
