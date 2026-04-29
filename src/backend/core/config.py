"""
Core configuration for Quant X backend
Centralized settings with environment variable management
"""
import os
import logging
from typing import Dict, List, Optional
from pydantic_settings import BaseSettings
from functools import lru_cache

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Application settings with validation and environment variable loading"""

    # ============================================================================
    # APPLICATION
    # ============================================================================
    APP_NAME: str = "Quant X"
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
    # JWT signing secret for local signature verification (HS256).
    # Found in Supabase dashboard → Settings → API → JWT Secret.
    # CRITICAL in production — leaving it blank disables signature verification.
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

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
    # MARKET DATA — Provider selection + Kite Admin (optional)
    # ============================================================================
    DATA_PROVIDER: str = os.getenv("DATA_PROVIDER", "free")  # "free" (yfinance) or "kite"
    KITE_ADMIN_API_KEY: str = os.getenv("KITE_ADMIN_API_KEY", "")
    KITE_ADMIN_ACCESS_TOKEN: str = os.getenv("KITE_ADMIN_ACCESS_TOKEN", "")
    KITE_ADMIN_API_SECRET: str = os.getenv("KITE_ADMIN_API_SECRET", "")
    # Auto-login credentials for daily token refresh (optional — falls back to manual)
    KITE_ADMIN_USER_ID: str = os.getenv("KITE_ADMIN_USER_ID", "")
    KITE_ADMIN_PASSWORD: str = os.getenv("KITE_ADMIN_PASSWORD", "")
    KITE_ADMIN_TOTP_SECRET: str = os.getenv("KITE_ADMIN_TOTP_SECRET", "")
    ENABLE_BROKER_TICKER: bool = os.getenv("ENABLE_BROKER_TICKER", "True").lower() == "true"
    # PR 50 — TickPulse (F1 intraday signals) gated off by default until
    # the trained 5-minute LSTM lands. Heuristic v0 is honest-labeled
    # as "intraday_heuristic" in the signal row.
    ENABLE_TICKPULSE: bool = os.getenv("ENABLE_TICKPULSE", "False").lower() == "true"

    # ============================================================================
    # CORS
    # ============================================================================
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001")

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
    # MODEL REGISTRY — Backblaze B2 object store + Postgres model_versions table
    # ============================================================================
    # All production model artifacts live in B2; versions tracked in the
    # model_versions table (see PR 2 migration). On resolve(), files are
    # streamed to MODEL_CACHE_DIR once and reused. See
    # src/backend/ai/registry/.
    B2_APPLICATION_KEY_ID: str = os.getenv("B2_APPLICATION_KEY_ID", "")
    B2_APPLICATION_KEY: str = os.getenv("B2_APPLICATION_KEY", "")
    B2_BUCKET_MODELS: str = os.getenv("B2_BUCKET_MODELS", "swingai-models")
    MODEL_CACHE_DIR: str = os.getenv("MODEL_CACHE_DIR", ".model_cache")

    # ============================================================================
    # MONITORING
    # ============================================================================
    SENTRY_DSN: Optional[str] = os.getenv("SENTRY_DSN")
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

    # PR 16 — product analytics (PostHog). Optional; when blank the
    # event emitter becomes a no-op.
    POSTHOG_API_KEY: str = os.getenv("POSTHOG_API_KEY", "")
    POSTHOG_HOST: str = os.getenv("POSTHOG_HOST", "https://app.posthog.com")

    # ============================================================================
    # TELEGRAM (Optional)
    # ============================================================================
    TELEGRAM_BOT_TOKEN: Optional[str] = os.getenv("TELEGRAM_BOT_TOKEN")
    TELEGRAM_CHAT_ID: Optional[str] = os.getenv("TELEGRAM_CHAT_ID")

    # PR 55 — onboarding Telegram connect flow.
    # BOT_USERNAME powers the deep link (``https://t.me/<username>?start=<token>``).
    # WEBHOOK_SECRET is the URL-path secret we register with Telegram's setWebhook
    # plus the ``X-Telegram-Bot-Api-Secret-Token`` header we echo back. Both
    # layers must match or the webhook is rejected.
    TELEGRAM_BOT_USERNAME: Optional[str] = os.getenv("TELEGRAM_BOT_USERNAME")
    TELEGRAM_WEBHOOK_SECRET: Optional[str] = os.getenv("TELEGRAM_WEBHOOK_SECRET")

    # ============================================================================
    # WHATSAPP (PR 60 — F12 Pro digest channel)
    # ============================================================================
    # Provider selection — Gupshup primary (India-native, faster approval),
    # Meta Cloud API as alt. Set WHATSAPP_PROVIDER=gupshup or =meta. When
    # blank, the service layer is_configured() returns False and every
    # send-path becomes a no-op — safe pre-approval default.
    WHATSAPP_PROVIDER: Optional[str] = os.getenv("WHATSAPP_PROVIDER")

    # Gupshup: https://www.gupshup.io/developer/docs/bot-platform/guide/whatsapp-api-documentation
    GUPSHUP_API_KEY: Optional[str] = os.getenv("GUPSHUP_API_KEY")
    GUPSHUP_APP_NAME: Optional[str] = os.getenv("GUPSHUP_APP_NAME")
    GUPSHUP_SOURCE_NUMBER: Optional[str] = os.getenv("GUPSHUP_SOURCE_NUMBER")

    # Meta Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api
    META_WHATSAPP_ACCESS_TOKEN: Optional[str] = os.getenv("META_WHATSAPP_ACCESS_TOKEN")
    META_WHATSAPP_PHONE_NUMBER_ID: Optional[str] = os.getenv("META_WHATSAPP_PHONE_NUMBER_ID")

    # Approved template names for OTP + digest messages. Required by both
    # providers for business-initiated conversations outside the 24h window.
    WHATSAPP_OTP_TEMPLATE: str = os.getenv("WHATSAPP_OTP_TEMPLATE", "swingai_otp")
    WHATSAPP_DIGEST_TEMPLATE: str = os.getenv("WHATSAPP_DIGEST_TEMPLATE", "swingai_daily_brief")

    # ============================================================================
    # WEB PUSH (VAPID)
    # ============================================================================
    VAPID_PRIVATE_KEY: str = os.getenv("VAPID_PRIVATE_KEY", "")
    VAPID_PUBLIC_KEY: str = os.getenv("VAPID_PUBLIC_KEY", "")
    VAPID_CLAIMS_EMAIL: str = os.getenv("VAPID_CLAIMS_EMAIL", "mailto:admin@swingai.in")

    # ============================================================================
    # EMAIL (Resend)
    # ============================================================================
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "SwingAI <alerts@swingai.in>")

    # ============================================================================
    # WEBSOCKET
    # ============================================================================
    WS_MESSAGE_QUEUE_SIZE: int = 100
    WS_HEARTBEAT_INTERVAL: int = 30

    # ============================================================================
    # FEATURES
    # ============================================================================
    ENABLE_SCHEDULER: bool = os.getenv("ENABLE_SCHEDULER", "True").lower() == "true"
    ENABLE_ENHANCED_AI: bool = os.getenv("ENABLE_ENHANCED_AI", "False").lower() == "true"

    # ============================================================================
    # FINANCE ASSISTANT (GEMINI)
    # ============================================================================
    ENABLE_FINANCE_ASSISTANT: bool = os.getenv("ENABLE_FINANCE_ASSISTANT", "False").lower() == "true"
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    ASSISTANT_PUBLIC_MODEL_NAME: str = os.getenv("ASSISTANT_PUBLIC_MODEL_NAME", "Quant X Finance Intelligence")
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
    EOD_SCAN_MAX_STOCKS: int = int(os.getenv("EOD_SCAN_MAX_STOCKS", "300"))
    EOD_SCAN_MIN_PRICE: float = float(os.getenv("EOD_SCAN_MIN_PRICE", "50"))
    EOD_SCAN_MAX_PRICE: float = float(os.getenv("EOD_SCAN_MAX_PRICE", "10000"))
    EOD_SCAN_MIN_VOLUME: int = int(os.getenv("EOD_SCAN_MIN_VOLUME", "200000"))
    # Universe Screener (dynamic stock filtering for signal generation)
    SCREENER_ENABLED: bool = os.getenv("SCREENER_ENABLED", "True").lower() == "true"
    SCREENER_MAX_CANDIDATES: int = int(os.getenv("SCREENER_MAX_CANDIDATES", "70"))
    SCREENER_BATCH_SIZE: int = int(os.getenv("SCREENER_BATCH_SIZE", "200"))
    SCREENER_DATA_PERIOD: str = os.getenv("SCREENER_DATA_PERIOD", "3mo")
    SCREENER_MIN_TRADING_DAYS: int = int(os.getenv("SCREENER_MIN_TRADING_DAYS", "20"))
    SCREENER_MAX_VOLATILITY: float = float(os.getenv("SCREENER_MAX_VOLATILITY", "0.08"))
    SCREENER_SYMBOL_CACHE_DAYS: int = int(os.getenv("SCREENER_SYMBOL_CACHE_DAYS", "7"))
    FNO_INSTRUMENTS_FILE: str = os.getenv("FNO_INSTRUMENTS_FILE", "data/fno_instruments.csv")

    # ============================================================================
    # ADMIN
    # ============================================================================
    ADMIN_EMAILS: str = ""  # Comma-separated: ADMIN_EMAILS=admin@example.com,admin2@example.com
    RAZORPAY_WEBHOOK_SECRET: Optional[str] = os.getenv("RAZORPAY_WEBHOOK_SECRET")

    @property
    def allowed_origins_list(self) -> List[str]:
        return [x.strip() for x in self.ALLOWED_ORIGINS.split(",") if x.strip()]

    @property
    def admin_emails_list(self) -> List[str]:
        return [x.strip() for x in self.ADMIN_EMAILS.split(",") if x.strip()]

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


# ============================================================================
# STARTUP VALIDATION
# ============================================================================

_DEFAULT_SECRET_KEY = "your-secret-key-change-this-in-production"


def validate_startup() -> None:
    """Validate environment variables at startup.

    In development mode (APP_ENV=development): logs warnings but does not crash.
    In production mode (APP_ENV=production): raises RuntimeError for missing
    CRITICAL variables.
    """
    is_production = settings.APP_ENV == "production"

    # --- CRITICAL: app will not work without these ---
    critical_vars = {
        "SUPABASE_URL": settings.SUPABASE_URL,
        "SUPABASE_ANON_KEY": settings.SUPABASE_ANON_KEY,
        "SUPABASE_SERVICE_KEY": settings.SUPABASE_SERVICE_KEY,
    }
    missing_critical = [name for name, val in critical_vars.items() if not val]
    if missing_critical:
        msg = f"CRITICAL env vars missing: {', '.join(missing_critical)}"
        if is_production:
            logger.critical(msg)
            raise RuntimeError(msg)
        else:
            logger.warning(msg + " (development mode — continuing anyway)")

    # --- CRITICAL in production: SUPABASE_JWT_SECRET for JWT signature verification ---
    # Without this, any valid-shape JWT is accepted → admin spoofing trivially possible.
    if not settings.SUPABASE_JWT_SECRET:
        msg = (
            "SUPABASE_JWT_SECRET is not set — JWT signature verification is DISABLED. "
            "Set it from Supabase Dashboard → Settings → API → JWT Secret. "
            "Production MUST have this set."
        )
        if is_production:
            logger.critical(msg)
            raise RuntimeError(msg)
        else:
            logger.warning(msg + " (development mode — signatures unverified)")

    # --- HIGH: features degraded without these ---
    high_vars = {
        "RAZORPAY_KEY_ID": settings.RAZORPAY_KEY_ID,
        "RAZORPAY_KEY_SECRET": settings.RAZORPAY_KEY_SECRET,
        "BROKER_ENCRYPTION_KEY": settings.BROKER_ENCRYPTION_KEY,
    }
    missing_high = [name for name, val in high_vars.items() if not val]
    if missing_high:
        if is_production:
            # BROKER_ENCRYPTION_KEY is critical for production — broker credentials
            # are encrypted with it and cannot be recovered without it.
            if "BROKER_ENCRYPTION_KEY" in missing_high:
                msg = "BROKER_ENCRYPTION_KEY is required in production — refusing to start"
                logger.critical(msg)
                raise RuntimeError(msg)
        logger.warning(
            "HIGH-priority env vars missing (features degraded): %s",
            ", ".join(missing_high),
        )

    # --- OPTIONAL: log warnings for useful-but-optional vars ---
    optional_vars = {
        "GEMINI_API_KEY": settings.GEMINI_API_KEY,
        "SENTRY_DSN": settings.SENTRY_DSN,
        "KITE_ADMIN_API_KEY": settings.KITE_ADMIN_API_KEY,
    }
    missing_optional = [name for name, val in optional_vars.items() if not val]
    if missing_optional:
        logger.info(
            "Optional env vars not set: %s", ", ".join(missing_optional)
        )

    # --- CORS origins must not include localhost in production ---
    if is_production:
        origins = settings.allowed_origins_list
        localhost_origins = [o for o in origins if "localhost" in o or "127.0.0.1" in o]
        if localhost_origins:
            logger.warning(
                "ALLOWED_ORIGINS contains localhost entries in production: %s — "
                "set ALLOWED_ORIGINS to your production domain(s) only",
                ", ".join(localhost_origins),
            )

    # --- SECRET_KEY must not be the default in production ---
    if settings.SECRET_KEY == _DEFAULT_SECRET_KEY:
        if is_production:
            msg = "SECRET_KEY is still the default value — refusing to start in production"
            logger.critical(msg)
            raise RuntimeError(msg)
        else:
            logger.warning(
                "SECRET_KEY is the default value — change before deploying to production"
            )

    logger.info("Startup environment validation complete (env=%s)", settings.APP_ENV)


def get_startup_status() -> Dict[str, str]:
    """Return configuration status for every config group.

    Each group maps to one of: ``"configured"``, ``"not_configured"``, or
    ``"partial"``.
    """

    def _status(*values: str) -> str:
        truthy = [bool(v) for v in values]
        if all(truthy):
            return "configured"
        if any(truthy):
            return "partial"
        return "not_configured"

    return {
        "supabase": _status(
            settings.SUPABASE_URL,
            settings.SUPABASE_ANON_KEY,
            settings.SUPABASE_SERVICE_KEY,
        ),
        "razorpay": _status(
            settings.RAZORPAY_KEY_ID,
            settings.RAZORPAY_KEY_SECRET,
        ),
        "broker": _status(
            settings.BROKER_ENCRYPTION_KEY,
            settings.ZERODHA_API_KEY or settings.ANGEL_API_KEY or settings.UPSTOX_API_KEY,
        ),
        "ml": _status(
            settings.ML_INFERENCE_URL,
            settings.XGBOOST_MODEL_PATH,
        ),
        "redis": _status(settings.REDIS_URL) if settings.ENABLE_REDIS else "not_configured",
        "kite_admin": _status(
            settings.KITE_ADMIN_API_KEY,
            settings.KITE_ADMIN_ACCESS_TOKEN,
        ),
        "scheduler": "configured" if settings.ENABLE_SCHEDULER else "not_configured",
        "assistant": _status(settings.GEMINI_API_KEY) if settings.ENABLE_FINANCE_ASSISTANT else "not_configured",
        "monitoring": _status(settings.SENTRY_DSN or ""),
        "telegram": _status(
            settings.TELEGRAM_BOT_TOKEN or "",
            settings.TELEGRAM_CHAT_ID or "",
        ),
    }
