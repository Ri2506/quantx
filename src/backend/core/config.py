"""
Core configuration for SwingAI backend
Centralized settings with environment variable management
"""
import os
from typing import List, Optional
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application settings with validation and environment variable loading"""

    # ============================================================================
    # APPLICATION
    # ============================================================================
    APP_NAME: str = "SwingAI"
    APP_VERSION: str = "2.0.0"
    APP_ENV: str = os.getenv("APP_ENV", "development")
    DEBUG: bool = os.getenv("DEBUG", "False").lower() == "true"
    SECRET_KEY: str = os.getenv("SECRET_KEY", "your-secret-key-change-this-in-production")

    # ============================================================================
    # API
    # ============================================================================
    API_PREFIX: str = "/api"
    API_VERSION: str = "v1"

    # ============================================================================
    # FRONTEND
    # ============================================================================
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")

    # ============================================================================
    # SUPABASE
    # ============================================================================
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_ANON_KEY: str = os.getenv("SUPABASE_ANON_KEY", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")

    # ============================================================================
    # RAZORPAY
    # ============================================================================
    RAZORPAY_KEY_ID: str = os.getenv("RAZORPAY_KEY_ID", "")
    RAZORPAY_KEY_SECRET: str = os.getenv("RAZORPAY_KEY_SECRET", "")

    # ============================================================================
    # BROKER API KEYS
    # ============================================================================
    ZERODHA_API_KEY: str = os.getenv("ZERODHA_API_KEY", "")
    ZERODHA_API_SECRET: str = os.getenv("ZERODHA_API_SECRET", "")
    ZERODHA_REDIRECT_URI: str = os.getenv("ZERODHA_REDIRECT_URI", "")
    ANGEL_API_KEY: str = os.getenv("ANGEL_API_KEY", "")
    ANGEL_REDIRECT_URI: str = os.getenv("ANGEL_REDIRECT_URI", "")
    UPSTOX_API_KEY: str = os.getenv("UPSTOX_API_KEY", "")
    UPSTOX_API_SECRET: str = os.getenv("UPSTOX_API_SECRET", "")
    UPSTOX_REDIRECT_URI: str = os.getenv("UPSTOX_REDIRECT_URI", "")
    BROKER_ENCRYPTION_KEY: str = os.getenv("BROKER_ENCRYPTION_KEY", "")

    # ============================================================================
    # REDIS
    # ============================================================================
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    REDIS_PASSWORD: Optional[str] = os.getenv("REDIS_PASSWORD")
    ENABLE_REDIS: bool = os.getenv("ENABLE_REDIS", "False").lower() == "true"

    # ============================================================================
    # MARKET DATA PROVIDERS
    # ============================================================================
    DATA_PROVIDER: str = os.getenv("DATA_PROVIDER", "yfinance")  # "truedata" | "yfinance"
    TRUEDATA_USERNAME: str = os.getenv("TRUEDATA_USERNAME", "")
    TRUEDATA_PASSWORD: str = os.getenv("TRUEDATA_PASSWORD", "")
    TRUEDATA_LIVE_PORT: int = int(os.getenv("TRUEDATA_LIVE_PORT", "8084"))
    TRUEDATA_INIT_TIMEOUT: int = int(os.getenv("TRUEDATA_INIT_TIMEOUT", "30"))

    # ============================================================================
    # CORS
    # ============================================================================
    ALLOWED_ORIGINS: List[str] = [
        x.strip() for x in os.getenv(
            "ALLOWED_ORIGINS",
            "http://localhost:3000,http://localhost:3001,https://swingai.vercel.app"
        ).split(",") if x.strip()
    ]

    # ============================================================================
    # RATE LIMITING
    # ============================================================================
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PER_MINUTE", "60"))
    RATE_LIMIT_PER_HOUR: int = int(os.getenv("RATE_LIMIT_PER_HOUR", "1000"))

    # ============================================================================
    # ML MODEL
    # ============================================================================
    ML_INFERENCE_URL: str = os.getenv("ML_INFERENCE_URL", "")
    ENHANCED_ML_INFERENCE_URL: str = os.getenv("ENHANCED_ML_INFERENCE_URL", "")
    ML_MODEL_PATH: str = os.getenv("ML_MODEL_PATH", "ml/models")
    XGBOOST_MODEL_PATH: str = os.getenv("XGBOOST_MODEL_PATH", "models/xgboost_model.json")
    TFT_MODEL_PATH: str = os.getenv("TFT_MODEL_PATH", "models/tft_model.ckpt")
    TFT_CONFIG_PATH: str = os.getenv("TFT_CONFIG_PATH", "models/tft_config.json")
    MODEL_STORAGE_BUCKET: str = os.getenv("MODEL_STORAGE_BUCKET", "models")

    # ============================================================================
    # MONITORING
    # ============================================================================
    SENTRY_DSN: Optional[str] = os.getenv("SENTRY_DSN")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # ============================================================================
    # TELEGRAM (Optional)
    # ============================================================================
    TELEGRAM_BOT_TOKEN: Optional[str] = os.getenv("TELEGRAM_BOT_TOKEN")
    TELEGRAM_CHAT_ID: Optional[str] = os.getenv("TELEGRAM_CHAT_ID")

    # ============================================================================
    # WEBSOCKET
    # ============================================================================
    WS_MESSAGE_QUEUE_SIZE: int = 100
    WS_HEARTBEAT_INTERVAL: int = 30

    # ============================================================================
    # FEATURES
    # ============================================================================
    ENABLE_SCHEDULER: bool = os.getenv("ENABLE_SCHEDULER", "False").lower() == "true"
    ENABLE_ENHANCED_AI: bool = os.getenv("ENABLE_ENHANCED_AI", "False").lower() == "true"

    # ============================================================================
    # FINANCE ASSISTANT (GEMINI)
    # ============================================================================
    ENABLE_FINANCE_ASSISTANT: bool = os.getenv("ENABLE_FINANCE_ASSISTANT", "False").lower() == "true"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    ASSISTANT_PUBLIC_MODEL_NAME: str = os.getenv("ASSISTANT_PUBLIC_MODEL_NAME", "SwingAI Finance Intelligence")
    ASSISTANT_MAX_HISTORY_MESSAGES: int = int(os.getenv("ASSISTANT_MAX_HISTORY_MESSAGES", "16"))
    ASSISTANT_MAX_USER_MESSAGE_CHARS: int = int(os.getenv("ASSISTANT_MAX_USER_MESSAGE_CHARS", "1200"))
    ASSISTANT_DAILY_CREDITS_FREE: int = int(os.getenv("ASSISTANT_DAILY_CREDITS_FREE", "5"))
    ASSISTANT_DAILY_CREDITS_PRO: int = int(os.getenv("ASSISTANT_DAILY_CREDITS_PRO", "150"))
    ASSISTANT_NEWS_FEEDS: str = os.getenv(
        "ASSISTANT_NEWS_FEEDS",
        ",".join(
            [
                "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms",
                "https://www.livemint.com/rss/markets",
                "https://www.moneycontrol.com/rss/business.xml",
                "https://www.cnbc.com/id/100003114/device/rss/rss.html",
            ]
        ),
    )
    ASSISTANT_HTTP_TIMEOUT_SECONDS: float = float(os.getenv("ASSISTANT_HTTP_TIMEOUT_SECONDS", "8"))

    # ============================================================================
    # TRADING
    # ============================================================================
    MARKET_OPEN_TIME: str = "09:15"
    MARKET_CLOSE_TIME: str = "15:30"
    PRE_MARKET_SCAN_TIME: str = "08:30"
    POST_MARKET_PROCESS_TIME: str = "16:00"
    PAPER_TRADE_DAYS: int = int(os.getenv("PAPER_TRADE_DAYS", "14"))
    LIVE_TRADING_WHITELIST_ONLY: bool = os.getenv("LIVE_TRADING_WHITELIST_ONLY", "True").lower() == "true"
    ALPHA_UNIVERSE_FILE: str = os.getenv("ALPHA_UNIVERSE_FILE", "data/alpha_universe.txt")
    ALPHA_UNIVERSE_SIZE: int = int(os.getenv("ALPHA_UNIVERSE_SIZE", "100"))
    NSE_HOLIDAYS_FILE: str = os.getenv("NSE_HOLIDAYS_FILE", "data/nse_holidays_2026.json")
    STRATEGY_MIN_CONFLUENCE: float = float(os.getenv("STRATEGY_MIN_CONFLUENCE", "0.6"))
    STRATEGY_TOP_N: int = int(os.getenv("STRATEGY_TOP_N", "3"))
    STRATEGY_WEIGHT: float = float(os.getenv("STRATEGY_WEIGHT", "0.6"))
    XGB_WEIGHT: float = float(os.getenv("XGB_WEIGHT", "0.2"))
    TFT_WEIGHT: float = float(os.getenv("TFT_WEIGHT", "0.2"))
    EOD_SCAN_USE_PKS: bool = os.getenv("EOD_SCAN_USE_PKS", "True").lower() == "true"
    EOD_SCAN_SOURCE: str = os.getenv("EOD_SCAN_SOURCE", "github")  # github | local
    EOD_SCAN_TYPE: str = os.getenv("EOD_SCAN_TYPE", "swing")  # swing | trend | momentum | breakout
    EOD_SCAN_MAX_STOCKS: int = int(os.getenv("EOD_SCAN_MAX_STOCKS", "300"))
    EOD_SCAN_MIN_PRICE: float = float(os.getenv("EOD_SCAN_MIN_PRICE", "50"))
    EOD_SCAN_MAX_PRICE: float = float(os.getenv("EOD_SCAN_MAX_PRICE", "10000"))
    EOD_SCAN_MIN_VOLUME: int = int(os.getenv("EOD_SCAN_MIN_VOLUME", "200000"))
    FNO_INSTRUMENTS_FILE: str = os.getenv("FNO_INSTRUMENTS_FILE", "data/fno_instruments.csv")

    # ============================================================================
    # ADMIN
    # ============================================================================
    ADMIN_EMAILS: List[str] = []  # Loaded from env: ADMIN_EMAILS=admin@example.com,admin2@example.com
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = os.getenv("RAZORPAY_WEBHOOK_SECRET")

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "allow"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()


# Global settings instance
settings = get_settings()
