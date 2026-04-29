-- ============================================================================
-- QUANT X COMPLETE DATABASE SCHEMA
-- Supabase PostgreSQL - Production Ready
-- ============================================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. SUBSCRIPTION PLANS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- Pricing (in INR paise, so ₹999 = 99900)
    price_monthly INTEGER NOT NULL,
    price_quarterly INTEGER,
    price_yearly INTEGER,
    
    -- Features
    max_signals_per_day INTEGER DEFAULT 10,
    max_positions INTEGER DEFAULT 5,
    max_capital DECIMAL(15, 2) DEFAULT 500000,
    
    -- Trading modes allowed
    signal_only BOOLEAN DEFAULT TRUE,
    semi_auto BOOLEAN DEFAULT FALSE,
    full_auto BOOLEAN DEFAULT FALSE,
    
    -- F&O access
    equity_trading BOOLEAN DEFAULT TRUE,
    futures_trading BOOLEAN DEFAULT FALSE,
    options_trading BOOLEAN DEFAULT FALSE,
    
    -- Features
    realtime_signals BOOLEAN DEFAULT TRUE,
    telegram_alerts BOOLEAN DEFAULT FALSE,
    email_alerts BOOLEAN DEFAULT TRUE,
    priority_support BOOLEAN DEFAULT FALSE,
    api_access BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans (3 tiers: Free, Starter, Pro)
INSERT INTO public.subscription_plans (name, display_name, description, price_monthly, price_quarterly, price_yearly, max_signals_per_day, max_positions, max_capital, signal_only, semi_auto, full_auto, equity_trading, futures_trading, options_trading, telegram_alerts, priority_support, api_access, sort_order) VALUES
('free', 'Free', 'Get started with basic signals', 0, 0, 0, 5, 3, 10000000, TRUE, FALSE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, 1),
('starter', 'Starter', 'For beginners starting their trading journey', 49900, 129900, 399900, 20, 5, 50000000, TRUE, TRUE, FALSE, TRUE, FALSE, FALSE, FALSE, FALSE, FALSE, 2),
('pro', 'Pro', 'For serious traders who want full edge', 149900, 399900, 1199900, -1, 15, -1, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, 3)
ON CONFLICT (name) DO NOTHING;

-- Remove elite plan if it exists
DELETE FROM public.subscription_plans WHERE name = 'elite';

-- ============================================================================
-- 2. USER PROFILES (Extended)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    phone TEXT,
    avatar_url TEXT,
    
    -- KYC (for compliance)
    pan_number TEXT,
    kyc_verified BOOLEAN DEFAULT FALSE,
    kyc_verified_at TIMESTAMPTZ,
    
    -- Trading settings
    capital DECIMAL(15, 2) DEFAULT 100000,
    risk_profile TEXT DEFAULT 'moderate' CHECK (risk_profile IN ('conservative', 'moderate', 'aggressive')),
    trading_mode TEXT DEFAULT 'signal_only' CHECK (trading_mode IN ('signal_only', 'semi_auto', 'full_auto')),
    max_positions INTEGER DEFAULT 5,
    risk_per_trade DECIMAL(5, 2) DEFAULT 3.0,
    
    -- Paper/Live gating
    paper_trading_started_at TIMESTAMPTZ DEFAULT NOW(),
    live_trading_whitelisted BOOLEAN DEFAULT FALSE,
    kill_switch_active BOOLEAN DEFAULT FALSE,
    
    -- F&O Settings
    fo_enabled BOOLEAN DEFAULT FALSE,
    fo_margin_percent DECIMAL(5, 2) DEFAULT 100, -- % of required margin to use
    preferred_option_type TEXT DEFAULT 'put_options' CHECK (preferred_option_type IN ('put_options', 'futures', 'both')),
    max_lots_per_trade INTEGER DEFAULT 1,
    
    -- Risk Management
    daily_loss_limit DECIMAL(5, 2) DEFAULT 3.0, -- % of capital
    weekly_loss_limit DECIMAL(5, 2) DEFAULT 7.0,
    monthly_loss_limit DECIMAL(5, 2) DEFAULT 15.0,
    trailing_sl_enabled BOOLEAN DEFAULT FALSE,
    
    -- Broker
    broker_name TEXT,
    broker_credentials JSONB DEFAULT '{}',
    broker_connected BOOLEAN DEFAULT FALSE,
    broker_last_sync TIMESTAMPTZ,
    
    -- Notifications
    notifications_enabled BOOLEAN DEFAULT TRUE,
    telegram_chat_id TEXT,
    telegram_connected BOOLEAN DEFAULT FALSE,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    
    -- Subscription
    subscription_plan_id UUID REFERENCES public.subscription_plans(id),
    subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'trial', 'active', 'expired', 'cancelled')),
    subscription_start TIMESTAMPTZ,
    subscription_end TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    
    -- Stats
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    total_pnl DECIMAL(15, 2) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    last_active TIMESTAMPTZ
);

-- ============================================================================
-- 2.1 BROKER CONNECTIONS (OAuth + credentials store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.broker_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    broker_name TEXT NOT NULL CHECK (broker_name IN ('zerodha', 'angelone', 'upstox')),
    status TEXT DEFAULT 'connected' CHECK (status IN ('connected', 'disconnected', 'error')),
    account_id TEXT,
    access_token TEXT, -- encrypted payload
    refresh_token TEXT, -- encrypted payload when applicable
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    last_synced_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE(user_id, broker_name)
);

CREATE INDEX idx_broker_connections_user ON public.broker_connections(user_id);
CREATE INDEX idx_broker_connections_status ON public.broker_connections(status);

-- ============================================================================
-- 3. PAYMENTS & TRANSACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    -- Razorpay details
    razorpay_order_id TEXT,
    razorpay_payment_id TEXT,
    razorpay_signature TEXT,
    
    -- Payment details
    amount INTEGER NOT NULL, -- in paise
    currency TEXT DEFAULT 'INR',
    plan_id UUID REFERENCES public.subscription_plans(id),
    billing_period TEXT CHECK (billing_period IN ('monthly', 'quarterly', 'yearly')),
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'refunded')),
    failure_reason TEXT,
    
    -- Invoice
    invoice_number TEXT,
    gst_amount INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_payments_user ON public.payments(user_id);
CREATE INDEX idx_payments_status ON public.payments(status);

-- ============================================================================
-- 4. SIGNALS (Enhanced with F&O)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.signals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Signal details
    symbol TEXT NOT NULL,
    exchange TEXT DEFAULT 'NSE',
    segment TEXT DEFAULT 'EQUITY' CHECK (segment IN ('EQUITY', 'FUTURES', 'OPTIONS')),
    
    -- F&O specific
    expiry_date DATE,
    strike_price DECIMAL(15, 2),
    option_type TEXT CHECK (option_type IN ('CE', 'PE')),
    lot_size INTEGER DEFAULT 1,
    
    -- Direction
    direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT', 'NEUTRAL')),
    signal_type TEXT DEFAULT 'swing' CHECK (signal_type IN ('swing', 'positional', 'intraday', 'btst')),
    
    -- Confidence
    confidence DECIMAL(5, 2) NOT NULL,
    catboost_score DECIMAL(5, 2),
    tft_score DECIMAL(5, 2),
    stockformer_score DECIMAL(5, 2),
    model_agreement INTEGER DEFAULT 0, -- 0-3
    
    -- Price levels
    entry_price DECIMAL(15, 2) NOT NULL,
    stop_loss DECIMAL(15, 2) NOT NULL,
    target_1 DECIMAL(15, 2) NOT NULL,
    target_2 DECIMAL(15, 2),
    target_3 DECIMAL(15, 2),
    trailing_sl DECIMAL(15, 2),
    
    -- Risk metrics
    risk_reward DECIMAL(5, 2),
    expected_return DECIMAL(5, 2),
    max_loss_percent DECIMAL(5, 2),
    
    -- Analysis
    reasons JSONB DEFAULT '[]',
    technical_analysis JSONB DEFAULT '{}',
    market_context JSONB DEFAULT '{}',
    
    -- Market data at signal time
    nifty_level DECIMAL(15, 2),
    vix_level DECIMAL(5, 2),
    sector_trend TEXT,
    
    -- Status
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'triggered', 'target_hit', 'sl_hit', 'expired', 'cancelled')),
    result TEXT CHECK (result IN ('win', 'loss', 'breakeven', 'partial')),
    actual_return DECIMAL(8, 4),
    
    -- Explainability
    strategy_names TEXT[] DEFAULT ARRAY[]::TEXT[],
    tft_prediction JSONB DEFAULT '{}'::jsonb,
    
    -- Timing
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ,
    triggered_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    
    -- Metadata
    date DATE DEFAULT CURRENT_DATE,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Premium signal (for paid users)
    is_premium BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_signals_date ON public.signals(date);
CREATE INDEX idx_signals_symbol ON public.signals(symbol);
CREATE INDEX idx_signals_status ON public.signals(status);
CREATE INDEX idx_signals_segment ON public.signals(segment);

-- ============================================================================
-- 4A. DAILY UNIVERSE (EOD SCANNER OUTPUT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.daily_universe (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_date DATE NOT NULL,
    symbol TEXT NOT NULL,
    source TEXT DEFAULT 'pkscreener_github',
    scan_type TEXT DEFAULT 'swing',
    run_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (trade_date, symbol)
);

CREATE INDEX idx_daily_universe_date ON public.daily_universe(trade_date);
CREATE INDEX idx_daily_universe_symbol ON public.daily_universe(symbol);

-- ============================================================================
-- 4B. EOD SCAN RUN LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.eod_scan_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trade_date DATE NOT NULL,
    status TEXT DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
    source TEXT DEFAULT 'pkscreener_github',
    scan_type TEXT DEFAULT 'swing',
    min_price DECIMAL(12, 2),
    max_price DECIMAL(12, 2),
    min_volume BIGINT,
    candidate_count INTEGER DEFAULT 0,
    signal_count INTEGER DEFAULT 0,
    error TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

CREATE INDEX idx_eod_scan_runs_date ON public.eod_scan_runs(trade_date);
CREATE INDEX idx_eod_scan_runs_status ON public.eod_scan_runs(status);

-- ============================================================================
-- 5. TRADES (Enhanced with F&O)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.trades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    signal_id UUID REFERENCES public.signals(id),
    
    -- Instrument details
    symbol TEXT NOT NULL,
    exchange TEXT DEFAULT 'NSE',
    segment TEXT DEFAULT 'EQUITY' CHECK (segment IN ('EQUITY', 'FUTURES', 'OPTIONS')),
    
    -- F&O specific
    expiry_date DATE,
    strike_price DECIMAL(15, 2),
    option_type TEXT CHECK (option_type IN ('CE', 'PE')),
    lot_size INTEGER DEFAULT 1,
    lots INTEGER DEFAULT 1,
    
    -- Direction
    direction TEXT NOT NULL CHECK (direction IN ('LONG', 'SHORT')),
    trade_type TEXT DEFAULT 'swing',
    
    -- Order details
    order_id TEXT,
    broker_order_id TEXT,
    order_type TEXT DEFAULT 'LIMIT',
    product_type TEXT DEFAULT 'CNC' CHECK (product_type IN ('CNC', 'MIS', 'NRML')),
    execution_mode TEXT DEFAULT 'paper' CHECK (execution_mode IN ('paper', 'live')),
    
    -- Quantities
    quantity INTEGER NOT NULL,
    filled_quantity INTEGER DEFAULT 0,
    pending_quantity INTEGER DEFAULT 0,
    
    -- Prices
    entry_price DECIMAL(15, 2) NOT NULL,
    average_price DECIMAL(15, 2),
    stop_loss DECIMAL(15, 2) NOT NULL,
    target DECIMAL(15, 2) NOT NULL,
    exit_price DECIMAL(15, 2),
    
    -- P&L
    gross_pnl DECIMAL(15, 2) DEFAULT 0,
    charges DECIMAL(15, 2) DEFAULT 0, -- brokerage, taxes
    net_pnl DECIMAL(15, 2) DEFAULT 0,
    pnl_percent DECIMAL(8, 4) DEFAULT 0,
    
    -- Risk
    risk_amount DECIMAL(15, 2),
    position_value DECIMAL(15, 2),
    margin_used DECIMAL(15, 2), -- for F&O
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'open', 'partial', 'closed', 'cancelled', 'rejected', 'expired')),
    exit_reason TEXT CHECK (exit_reason IN ('target', 'sl_hit', 'trailing_sl', 'manual', 'expiry', 'time', 'risk_limit')),
    
    -- GTT orders
    entry_gtt_id TEXT,
    sl_gtt_id TEXT,
    target_gtt_id TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    executed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    
    -- Audit
    approved_by TEXT,
    notes TEXT
);

CREATE INDEX idx_trades_user ON public.trades(user_id);
CREATE INDEX idx_trades_status ON public.trades(status);
CREATE INDEX idx_trades_segment ON public.trades(segment);

-- ============================================================================
-- 6. POSITIONS (Live tracking)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    trade_id UUID REFERENCES public.trades(id),
    
    -- Instrument
    symbol TEXT NOT NULL,
    exchange TEXT DEFAULT 'NSE',
    segment TEXT DEFAULT 'EQUITY',
    expiry_date DATE,
    strike_price DECIMAL(15, 2),
    option_type TEXT,
    
    -- Position
    direction TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    lots INTEGER DEFAULT 1,
    average_price DECIMAL(15, 2) NOT NULL,
    execution_mode TEXT DEFAULT 'paper' CHECK (execution_mode IN ('paper', 'live')),
    
    -- Current state (updated in real-time)
    current_price DECIMAL(15, 2),
    current_value DECIMAL(15, 2),
    unrealized_pnl DECIMAL(15, 2) DEFAULT 0,
    unrealized_pnl_percent DECIMAL(8, 4) DEFAULT 0,
    
    -- Levels
    stop_loss DECIMAL(15, 2),
    target DECIMAL(15, 2),
    trailing_sl DECIMAL(15, 2),
    
    -- Greeks (for options)
    delta DECIMAL(8, 4),
    gamma DECIMAL(8, 4),
    theta DECIMAL(8, 4),
    vega DECIMAL(8, 4),
    iv DECIMAL(8, 4), -- implied volatility
    
    -- Risk
    margin_used DECIMAL(15, 2),
    risk_amount DECIMAL(15, 2),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    days_held INTEGER DEFAULT 0,
    
    -- Timestamps
    opened_at TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, symbol, segment, direction, expiry_date, strike_price, option_type)
);

CREATE INDEX idx_positions_user_active ON public.positions(user_id, is_active);

-- ============================================================================
-- 7. PORTFOLIO HISTORY (Daily snapshots)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.portfolio_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- Capital
    starting_capital DECIMAL(15, 2),
    ending_capital DECIMAL(15, 2),
    deployed_capital DECIMAL(15, 2),
    available_capital DECIMAL(15, 2),
    margin_used DECIMAL(15, 2) DEFAULT 0,
    
    -- P&L
    day_pnl DECIMAL(15, 2) DEFAULT 0,
    day_pnl_percent DECIMAL(8, 4) DEFAULT 0,
    cumulative_pnl DECIMAL(15, 2) DEFAULT 0,
    cumulative_pnl_percent DECIMAL(8, 4) DEFAULT 0,
    
    -- Equity curve
    equity_high DECIMAL(15, 2),
    drawdown DECIMAL(8, 4) DEFAULT 0,
    max_drawdown DECIMAL(8, 4) DEFAULT 0,
    
    -- Trades
    trades_taken INTEGER DEFAULT 0,
    trades_won INTEGER DEFAULT 0,
    trades_lost INTEGER DEFAULT 0,
    win_rate DECIMAL(5, 2) DEFAULT 0,
    
    -- Segment breakdown
    equity_pnl DECIMAL(15, 2) DEFAULT 0,
    futures_pnl DECIMAL(15, 2) DEFAULT 0,
    options_pnl DECIMAL(15, 2) DEFAULT 0,
    
    -- Risk metrics
    sharpe_ratio DECIMAL(8, 4),
    sortino_ratio DECIMAL(8, 4),
    calmar_ratio DECIMAL(8, 4),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, date)
);

CREATE INDEX idx_portfolio_user_date ON public.portfolio_history(user_id, date DESC);

-- ============================================================================
-- 8. MARKET DATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.market_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    
    -- Nifty 50
    nifty_open DECIMAL(15, 2),
    nifty_high DECIMAL(15, 2),
    nifty_low DECIMAL(15, 2),
    nifty_close DECIMAL(15, 2),
    nifty_change DECIMAL(15, 2),
    nifty_change_percent DECIMAL(8, 4),
    
    -- Bank Nifty
    banknifty_close DECIMAL(15, 2),
    banknifty_change_percent DECIMAL(8, 4),
    
    -- VIX
    vix_open DECIMAL(8, 2),
    vix_high DECIMAL(8, 2),
    vix_low DECIMAL(8, 2),
    vix_close DECIMAL(8, 2),
    vix_change_percent DECIMAL(8, 4),
    
    -- FII/DII (in Crores)
    fii_cash DECIMAL(15, 2),
    fii_index_futures DECIMAL(15, 2),
    fii_index_options DECIMAL(15, 2),
    dii_cash DECIMAL(15, 2),
    
    -- Breadth
    advances INTEGER,
    declines INTEGER,
    unchanged INTEGER,
    new_highs INTEGER,
    new_lows INTEGER,
    
    -- Derivatives
    nifty_pcr DECIMAL(5, 2), -- Put-Call Ratio
    nifty_max_pain DECIMAL(15, 2),
    nifty_oi_change DECIMAL(15, 2),
    
    -- Market condition
    market_trend TEXT CHECK (market_trend IN ('BULLISH', 'BEARISH', 'SIDEWAYS', 'VOLATILE')),
    risk_level TEXT CHECK (risk_level IN ('LOW', 'MODERATE', 'HIGH', 'EXTREME')),
    trading_recommendation TEXT,
    
    UNIQUE(date)
);

CREATE INDEX idx_market_date ON public.market_data(date DESC);

-- ============================================================================
-- 8.1 STOCKS (Static metadata)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.stocks (
    symbol TEXT PRIMARY KEY,
    name TEXT,
    sector TEXT,
    market_cap_cat TEXT CHECK (market_cap_cat IN ('large', 'mid', 'small')),
    nifty50 BOOLEAN DEFAULT FALSE,
    niftybank BOOLEAN DEFAULT FALSE,
    liquidity_score DECIMAL(6, 2),
    beta DECIMAL(6, 3),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_stocks_sector ON public.stocks(sector);

-- ============================================================================
-- 8.2 CANDLES (OHLCV cache)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.candles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_symbol TEXT NOT NULL,
    exchange TEXT DEFAULT 'NSE',
    interval TEXT DEFAULT '1d',
    timestamp TIMESTAMPTZ NOT NULL,
    open DECIMAL(15, 4),
    high DECIMAL(15, 4),
    low DECIMAL(15, 4),
    close DECIMAL(15, 4),
    volume BIGINT,
    source TEXT DEFAULT 'yfinance',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(stock_symbol, interval, timestamp)
);

CREATE INDEX idx_candles_symbol_time ON public.candles(stock_symbol, timestamp DESC);

-- ============================================================================
-- 8.3 FEATURES (Computed feature store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.features (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    stock_symbol TEXT NOT NULL,
    interval TEXT DEFAULT '1d',
    timestamp TIMESTAMPTZ NOT NULL,
    feature_set TEXT DEFAULT 'prd_v1',
    features JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(stock_symbol, interval, timestamp, feature_set)
);

CREATE INDEX idx_features_symbol_time ON public.features(stock_symbol, timestamp DESC);

-- ============================================================================
-- 9. NOTIFICATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    type TEXT NOT NULL CHECK (type IN ('signal', 'trade', 'alert', 'payment', 'system', 'promo')),
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    
    -- Delivery
    channels TEXT[] DEFAULT ARRAY['in_app'],
    sent_telegram BOOLEAN DEFAULT FALSE,
    sent_email BOOLEAN DEFAULT FALSE,
    sent_push BOOLEAN DEFAULT FALSE,
    
    -- Status
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON public.notifications(user_id, is_read, created_at DESC);

-- ============================================================================
-- 10. WATCHLIST
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.watchlist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    
    symbol TEXT NOT NULL,
    exchange TEXT DEFAULT 'NSE',
    segment TEXT DEFAULT 'EQUITY',
    
    -- Alert settings
    alert_price_above DECIMAL(15, 2),
    alert_price_below DECIMAL(15, 2),
    alert_enabled BOOLEAN DEFAULT FALSE,
    
    notes TEXT,
    tags TEXT[],
    
    added_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, symbol, segment)
);

-- ============================================================================
-- 11. AUDIT LOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.user_profiles(id),
    
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    
    old_value JSONB,
    new_value JSONB,
    
    ip_address INET,
    user_agent TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON public.audit_log(user_id, created_at DESC);

-- ============================================================================
-- 12. MODEL PERFORMANCE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.model_performance (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    date DATE NOT NULL,
    
    -- Overall
    total_signals INTEGER DEFAULT 0,
    correct_signals INTEGER DEFAULT 0,
    accuracy DECIMAL(5, 2) DEFAULT 0,
    
    -- By direction
    long_signals INTEGER DEFAULT 0,
    long_correct INTEGER DEFAULT 0,
    short_signals INTEGER DEFAULT 0,
    short_correct INTEGER DEFAULT 0,
    
    -- By model
    catboost_accuracy DECIMAL(5, 2),
    tft_accuracy DECIMAL(5, 2),
    stockformer_accuracy DECIMAL(5, 2),
    ensemble_accuracy DECIMAL(5, 2),
    
    -- Returns
    avg_return DECIMAL(8, 4),
    total_return DECIMAL(8, 4),
    sharpe_ratio DECIMAL(8, 4),
    
    -- By segment
    equity_accuracy DECIMAL(5, 2),
    futures_accuracy DECIMAL(5, 2),
    options_accuracy DECIMAL(5, 2),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(date)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

-- User policies
CREATE POLICY "Users can view own profile" ON public.user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.user_profiles FOR UPDATE USING (auth.uid() = id);

-- Signals viewable by all authenticated
CREATE POLICY "Signals viewable by authenticated" ON public.signals FOR SELECT USING (auth.role() = 'authenticated');

-- User-specific data
CREATE POLICY "Users manage own trades" ON public.trades FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own positions" ON public.positions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users view own payments" ON public.payments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users view own portfolio" ON public.portfolio_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users manage own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users manage own watchlist" ON public.watchlist FOR ALL USING (auth.uid() = user_id);

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON public.user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
BEGIN
    SELECT id INTO free_plan_id FROM public.subscription_plans WHERE name = 'free' LIMIT 1;
    
    INSERT INTO public.user_profiles (id, email, full_name, subscription_plan_id, subscription_status, trial_ends_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
        free_plan_id,
        'trial',
        NOW() + INTERVAL '7 days'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Update user stats after trade closes
CREATE OR REPLACE FUNCTION update_user_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'closed' AND OLD.status != 'closed' THEN
        UPDATE public.user_profiles
        SET 
            total_trades = total_trades + 1,
            winning_trades = winning_trades + CASE WHEN NEW.net_pnl > 0 THEN 1 ELSE 0 END,
            total_pnl = total_pnl + COALESCE(NEW.net_pnl, 0)
        WHERE id = NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER after_trade_update
    AFTER UPDATE ON public.trades
    FOR EACH ROW EXECUTE FUNCTION update_user_stats();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Today's active signals
CREATE OR REPLACE VIEW public.v_today_signals AS
SELECT * FROM public.signals
WHERE date = CURRENT_DATE AND status = 'active'
ORDER BY confidence DESC;

-- User dashboard stats
CREATE OR REPLACE VIEW public.v_user_stats AS
SELECT 
    u.id,
    u.capital,
    u.total_trades,
    u.winning_trades,
    u.total_pnl,
    CASE WHEN u.total_trades > 0 
        THEN ROUND((u.winning_trades::DECIMAL / u.total_trades) * 100, 2) 
        ELSE 0 
    END as win_rate,
    COUNT(p.id) as open_positions,
    COALESCE(SUM(p.unrealized_pnl), 0) as unrealized_pnl,
    sp.display_name as plan_name,
    u.subscription_status
FROM public.user_profiles u
LEFT JOIN public.positions p ON u.id = p.user_id AND p.is_active = TRUE
LEFT JOIN public.subscription_plans sp ON u.subscription_plan_id = sp.id
GROUP BY u.id, sp.display_name;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
-- ============================================================================
-- STRATEGY MARKETPLACE MIGRATION
-- Adds strategy_catalog, user_strategy_deployments, strategy_backtests tables
-- Seeds 49 strategies (43 DhanHQ-style + 6 existing equity)
-- ============================================================================

-- ============================================================================
-- 1. STRATEGY CATALOG — All available algo strategies
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.strategy_catalog (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,

    -- Classification
    category TEXT NOT NULL CHECK (category IN (
        'options_buying', 'credit_spread', 'short_strangle',
        'short_straddle', 'equity_investing', 'equity_swing'
    )),
    segment TEXT NOT NULL CHECK (segment IN ('EQUITY', 'OPTIONS')),
    template_slug TEXT NOT NULL,  -- maps to Python class: naked_buy, credit_spread, etc.
    strategy_class TEXT NOT NULL, -- fully qualified Python class path

    -- Parameters
    default_params JSONB NOT NULL DEFAULT '{}',
    configurable_params JSONB DEFAULT '[]', -- [{key, label, type, options, min, max}]

    -- Requirements
    min_capital INTEGER NOT NULL DEFAULT 50000,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'very_high')),
    requires_fo_enabled BOOLEAN DEFAULT FALSE,
    supported_symbols TEXT[] DEFAULT ARRAY['NIFTY', 'BANKNIFTY'],

    -- Subscription tier required
    tier_required TEXT NOT NULL DEFAULT 'free' CHECK (tier_required IN ('free', 'starter', 'pro')),

    -- Display
    icon TEXT DEFAULT 'TrendingUp',
    tags TEXT[] DEFAULT '{}',
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INTEGER DEFAULT 100,

    -- Backtest summary (updated by backtest runner)
    backtest_total_return DECIMAL(10,4),
    backtest_cagr DECIMAL(8,4),
    backtest_win_rate DECIMAL(5,2),
    backtest_profit_factor DECIMAL(8,3),
    backtest_sharpe DECIMAL(6,3),
    backtest_max_drawdown DECIMAL(8,4),
    backtest_total_trades INTEGER,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_strategy_catalog_category ON public.strategy_catalog(category);
CREATE INDEX IF NOT EXISTS idx_strategy_catalog_segment ON public.strategy_catalog(segment);
CREATE INDEX IF NOT EXISTS idx_strategy_catalog_tier ON public.strategy_catalog(tier_required);
CREATE INDEX IF NOT EXISTS idx_strategy_catalog_active ON public.strategy_catalog(is_active);

-- ============================================================================
-- 2. USER STRATEGY DEPLOYMENTS — User's active strategy subscriptions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_strategy_deployments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_id UUID NOT NULL REFERENCES public.strategy_catalog(id) ON DELETE CASCADE,

    -- User's custom parameters (overrides default_params)
    custom_params JSONB DEFAULT '{}',

    -- Deployment config
    allocated_capital DECIMAL(15,2) NOT NULL DEFAULT 100000,
    max_positions INTEGER DEFAULT 2,
    trade_mode TEXT NOT NULL DEFAULT 'signal_only' CHECK (trade_mode IN ('signal_only', 'semi_auto', 'full_auto')),

    -- State
    is_active BOOLEAN DEFAULT TRUE,
    is_paused BOOLEAN DEFAULT FALSE,
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    paused_at TIMESTAMPTZ,

    -- Performance tracking
    total_pnl DECIMAL(15,2) DEFAULT 0,
    total_trades INTEGER DEFAULT 0,
    winning_trades INTEGER DEFAULT 0,
    losing_trades INTEGER DEFAULT 0,
    last_signal_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, strategy_id)
);

CREATE INDEX IF NOT EXISTS idx_deployments_user ON public.user_strategy_deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_strategy ON public.user_strategy_deployments(strategy_id);
CREATE INDEX IF NOT EXISTS idx_deployments_active ON public.user_strategy_deployments(is_active, is_paused);

-- ============================================================================
-- 3. STRATEGY BACKTESTS — Pre-computed backtest results
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.strategy_backtests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    strategy_id UUID NOT NULL REFERENCES public.strategy_catalog(id) ON DELETE CASCADE,
    params JSONB NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    -- Summary stats
    total_return DECIMAL(10,4),
    cagr DECIMAL(8,4),
    win_rate DECIMAL(5,2),
    profit_factor DECIMAL(8,3),
    sharpe_ratio DECIMAL(6,3),
    sortino_ratio DECIMAL(6,3),
    max_drawdown DECIMAL(8,4),
    max_drawdown_duration_days INTEGER,
    total_trades INTEGER,
    avg_trade_return DECIMAL(8,4),
    avg_winner DECIMAL(8,4),
    avg_loser DECIMAL(8,4),
    avg_hold_hours DECIMAL(8,2),

    -- Chart data
    equity_curve JSONB,      -- [{date, equity, drawdown}]
    monthly_returns JSONB,   -- [{year, month, return_pct}]
    trade_log JSONB,         -- [{date, symbol, entry, exit, pnl, exit_reason}]

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtests_strategy ON public.strategy_backtests(strategy_id);

-- ============================================================================
-- 4. ADD strategy_catalog_id TO signals TABLE
-- ============================================================================

ALTER TABLE public.signals
    ADD COLUMN IF NOT EXISTS strategy_catalog_id UUID REFERENCES public.strategy_catalog(id);

CREATE INDEX IF NOT EXISTS idx_signals_strategy_catalog ON public.signals(strategy_catalog_id);

-- ============================================================================
-- 5. UPDATE subscription_plans — Add strategy limits
-- ============================================================================

ALTER TABLE public.subscription_plans
    ADD COLUMN IF NOT EXISTS max_strategies INTEGER DEFAULT 6,
    ADD COLUMN IF NOT EXISTS options_strategies BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS auto_trade_mode TEXT DEFAULT 'signal_only';

UPDATE public.subscription_plans SET max_strategies = 6, options_strategies = FALSE, auto_trade_mode = 'signal_only' WHERE name = 'free';
UPDATE public.subscription_plans SET max_strategies = 9, options_strategies = TRUE, auto_trade_mode = 'semi_auto' WHERE name = 'starter';
UPDATE public.subscription_plans SET max_strategies = 999, options_strategies = TRUE, auto_trade_mode = 'full_auto' WHERE name = 'pro';

-- ============================================================================
-- 5. SEED STRATEGY CATALOG — 49 strategies
-- ============================================================================

-- Clear existing seeds (idempotent)
DELETE FROM public.strategy_catalog WHERE TRUE;

-- ── OPTION BUYING (21 strategies) ────────────────────────────────────────────

INSERT INTO public.strategy_catalog (slug, name, description, category, segment, template_slug, strategy_class, default_params, configurable_params, min_capital, risk_level, requires_fo_enabled, tier_required, tags, is_featured, sort_order, backtest_win_rate, backtest_profit_factor, backtest_total_return, backtest_sharpe, backtest_max_drawdown, backtest_total_trades) VALUES

('skewhunter', 'SkewHunter', 'IV skew + OI flow alpha signals for directional option buying. Holds positions till EOD with fixed 40% stop loss.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "fixed", "target_pct": 100, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35,40]},{"key":"target_type","label":"Target Type","type":"select","options":["fixed","trailing"]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 100000, 'high', TRUE, 'pro', ARRAY['options','buying','intraday','nifty'], TRUE, 1,
 62.3, 1.93, 191.0, 1.82, -18.4, 234),

('skewhunter-tsl', 'SkewHunter TSL', 'Trailing stop loss variant of SkewHunter. Lets winners run with dynamic trailing stops.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "trailing", "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35,40]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 100000, 'high', TRUE, 'pro', ARRAY['options','buying','trailing','nifty'], TRUE, 2,
 58.1, 1.78, 165.0, 1.65, -22.1, 198),

('index-sniper', 'Index Sniper', 'Precision directional option buying with partial profit booking and EOD exit.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 35, "target_type": "fixed", "target_pct": 90, "otm_strikes": 2, "hold_type": "intraday", "partial_book": true}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35,40]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 100000, 'high', TRUE, 'pro', ARRAY['options','buying','intraday','sniper'], FALSE, 3,
 60.5, 1.85, 172.0, 1.71, -19.8, 210),

('index-scalper', 'Index Scalper', 'Quick scalp trades on index options with tight targets and EOD exit.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 30, "target_type": "fixed", "target_pct": 50, "otm_strikes": 1, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[20,25,30]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2]}]',
 60000, 'high', TRUE, 'pro', ARRAY['options','buying','scalp','intraday'], FALSE, 4,
 55.2, 1.45, 98.0, 1.22, -24.5, 312),

('fixed-rr-1to3', 'Fixed RR 1:3', 'Fixed risk-reward 1:3 option buying with 30% stop loss and 90% target.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 30, "target_type": "fixed", "target_pct": 90, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35]},{"key":"target_pct","label":"Target %","type":"select","options":[60,75,90]}]',
 45000, 'high', TRUE, 'starter', ARRAY['options','buying','fixed-rr'], FALSE, 5,
 48.5, 1.62, 112.0, 1.38, -21.0, 256),

('settle-down-tsl', 'Settle-Down 40% TSL', 'Trailing stop variant with 40% trailing SL for capturing large moves.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "trailing", "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[30,35,40]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','trailing'], FALSE, 6,
 56.8, 1.71, 134.0, 1.55, -20.3, 220),

('savdhaan-35sl', 'Savdhaan 35% SL', 'Conservative option buying with tighter 35% fixed stop loss.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 35, "target_type": "fixed", "target_pct": 70, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[30,35]},{"key":"target_pct","label":"Target %","type":"select","options":[50,60,70]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','conservative'], FALSE, 7,
 54.2, 1.55, 108.0, 1.32, -19.5, 240),

('shanti-40sl', 'Shanti 40% SL', 'Relaxed option buying with 40% fixed stop loss and moderate targets.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "fixed", "target_pct": 80, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[35,40]},{"key":"target_pct","label":"Target %","type":"select","options":[60,70,80]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying'], FALSE, 8,
 52.1, 1.48, 96.0, 1.28, -22.0, 228),

('safe-khel-tsl', 'Safe-Khel 40% TSL', 'Trailing stop option buying for extended profit capturing.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "trailing", "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[35,40]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','trailing'], FALSE, 9,
 55.5, 1.65, 125.0, 1.48, -21.5, 215),

('sookshma-nazar', 'Sookshma-Nazar 25% SL', 'Tight stop loss option buying with 25% SL for disciplined risk management.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 25, "target_type": "fixed", "target_pct": 75, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[20,25]},{"key":"target_pct","label":"Target %","type":"select","options":[50,60,75]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','tight-sl'], FALSE, 10,
 45.8, 1.52, 88.0, 1.18, -16.5, 268),

('ghar-aangan-tsl', 'Ghar-Aangan 30% TSL', 'Moderate trailing stop option buying with 30% TSL.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 30, "target_type": "trailing", "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','trailing'], FALSE, 11,
 53.4, 1.58, 118.0, 1.42, -18.8, 232),

('nischay-40tsl', 'Nischay 40% TSL', 'Confident directional option buying with wide 40% trailing stop.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "trailing", "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[35,40]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','trailing'], FALSE, 12,
 57.2, 1.72, 140.0, 1.56, -20.8, 208),

('only-calls-tsl', 'Only-Calls 40% TSL', 'Bullish-only option buying — calls only with 40% trailing stop.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "trailing", "otm_strikes": 2, "hold_type": "intraday", "direction_filter": "CALL"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[30,35,40]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','calls-only','bullish'], FALSE, 13,
 59.1, 1.80, 148.0, 1.62, -19.2, 185),

('wise-move-25tsl', 'Wise-Move 25% TSL', 'Tight trailing stop option buying with 25% TSL for quick exits.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 25, "target_type": "trailing", "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[20,25]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','trailing','tight-sl'], FALSE, 14,
 50.8, 1.48, 92.0, 1.25, -15.2, 275),

('first-step-25sl', 'First-Step 25% SL', 'Beginner-friendly option buying with tight 25% fixed stop loss.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 25, "target_type": "fixed", "target_pct": 50, "otm_strikes": 1, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[20,25]},{"key":"target_pct","label":"Target %","type":"select","options":[40,50,60]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','beginner'], FALSE, 15,
 47.5, 1.38, 78.0, 1.12, -14.8, 290),

('chhota-move-30sl', 'Chhota-Move 30% SL', 'Small move option buying with 30% SL and 1:2 risk-reward.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 30, "target_type": "fixed", "target_pct": 60, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30]},{"key":"target_pct","label":"Target %","type":"select","options":[50,60]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','small-move'], FALSE, 16,
 51.2, 1.42, 85.0, 1.18, -17.5, 252),

('thrifty-40tsl', 'Thrifty 40% TSL', 'Cost-effective option buying with wide trailing stop for budget traders.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "trailing", "otm_strikes": 3, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[35,40]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[2,3]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','budget','trailing'], FALSE, 17,
 54.8, 1.60, 122.0, 1.44, -21.2, 218),

('seed-fund-40sl', 'Seed-Fund 40% SL', 'Capital growth option buying with 40% SL and 1:3 risk-reward target.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 40, "target_type": "fixed", "target_pct": 120, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[35,40]},{"key":"target_pct","label":"Target %","type":"select","options":[90,100,120]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','growth'], FALSE, 18,
 44.2, 1.55, 105.0, 1.30, -23.5, 195),

('free-lunch-30tsl', 'Free-Lunch 30% TSL', 'Moderate trailing stop option buying for cost-free exits.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 30, "target_type": "trailing", "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30]},{"key":"otm_strikes","label":"OTM Strikes","type":"select","options":[1,2,3]}]',
 55000, 'high', TRUE, 'starter', ARRAY['options','buying','trailing'], FALSE, 19,
 52.8, 1.52, 110.0, 1.35, -18.0, 238),

('vacuum-grid-35sl', 'Vacuum GRID 35% SL', 'Grid-based option buying with 35% SL for structured entries.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 35, "target_type": "grid", "grid_levels": 3, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[30,35]},{"key":"grid_levels","label":"Grid Levels","type":"select","options":[2,3,4]}]',
 50000, 'high', TRUE, 'pro', ARRAY['options','buying','grid'], FALSE, 20,
 49.5, 1.42, 88.0, 1.15, -20.0, 265),

('burst-rr-grid', 'Burst RR 1:2 / GRID', 'Burst entry option buying with grid and fixed risk-reward targets.', 'options_buying', 'OPTIONS', 'naked_buy', 'ml.strategies.naked_option_buy.NakedOptionBuy',
 '{"sl_pct": 28, "target_type": "grid", "grid_levels": 2, "otm_strikes": 2, "hold_type": "intraday"}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,28,30]},{"key":"grid_levels","label":"Grid Levels","type":"select","options":[2,3]}]',
 50000, 'high', TRUE, 'pro', ARRAY['options','buying','grid','burst'], FALSE, 21,
 50.2, 1.45, 92.0, 1.20, -19.5, 248),

-- ── CREDIT SPREADS (10 strategies) ────────────────────────────────────────────

('curvature-credit-spread', 'Curvature Credit Spread Overnight', 'V-Score + viscosity signal for overnight credit spreads. Conservative risk with defined max loss.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 100, "max_loss_cap": 3000, "hold_type": "overnight"}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[50,100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[2000,3000,5000]}]',
 100000, 'medium', TRUE, 'starter', ARRAY['options','spread','overnight','credit'], TRUE, 22,
 68.5, 2.12, 140.0, 1.95, -12.2, 180),

('zen-credit-spread', 'Zen Credit Spread Overnight', 'Calm IV-based credit spread with overnight hold. Low stress, steady returns.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 100, "max_loss_cap": 2500, "hold_type": "overnight"}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[50,100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[2000,2500,3000]}]',
 100000, 'medium', TRUE, 'starter', ARRAY['options','spread','overnight','zen'], FALSE, 23,
 66.2, 1.98, 128.0, 1.82, -11.5, 175),

('drifting-credit-spread', 'Drifting Credit Spread Overnight', 'Drift-adjusted credit spread with volatility mean-reversion filter.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 100, "max_loss_cap": 3000, "hold_type": "overnight", "drift_filter": true}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[50,100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[2000,3000,5000]}]',
 100000, 'medium', TRUE, 'starter', ARRAY['options','spread','overnight'], FALSE, 24,
 65.8, 1.92, 122.0, 1.78, -13.0, 168),

('wave-return-credit-spread', 'Wave-Return Credit Spread Overnight', 'Wave pattern credit spread with wider strikes for higher premium capture.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 200, "max_loss_cap": 4000, "hold_type": "overnight"}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[3000,4000,5000]}]',
 120000, 'medium', TRUE, 'pro', ARRAY['options','spread','overnight','wave'], FALSE, 25,
 64.5, 1.88, 135.0, 1.72, -14.5, 162),

('iv-imbalance-credit-spread', 'IV-Imbalance Credit Spread Overnight', 'IV imbalance detection for credit spread entries with overnight hold.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 100, "max_loss_cap": 3000, "hold_type": "overnight", "iv_imbalance_filter": true}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[50,100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[2000,3000,5000]}]',
 100000, 'medium', TRUE, 'pro', ARRAY['options','spread','overnight','iv'], FALSE, 26,
 67.1, 2.05, 132.0, 1.88, -11.8, 172),

('delta-leverage-credit-spread', 'Delta-Leverage Credit Spread Overnight', 'Delta-neutral credit spread with leverage optimization.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 100, "max_loss_cap": 3500, "hold_type": "overnight", "delta_neutral": true}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[50,100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[2500,3500,5000]}]',
 100000, 'medium', TRUE, 'pro', ARRAY['options','spread','overnight','delta'], FALSE, 27,
 65.5, 1.95, 126.0, 1.80, -12.8, 165),

('theta-harvest-credit-spread', 'Theta-Harvest Credit Spread Expiry', 'Theta decay harvesting with credit spreads held to expiry.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 100, "max_loss_cap": 3000, "hold_type": "expiry"}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[50,100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[2000,3000,5000]}]',
 100000, 'medium', TRUE, 'pro', ARRAY['options','spread','expiry','theta'], FALSE, 28,
 70.2, 2.25, 155.0, 2.05, -10.5, 190),

('vega-shift-credit-spread', 'Vega-Shift Credit Spread Expiry', 'Vega shift detection for expiry credit spreads. Profits from IV crush.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 100, "max_loss_cap": 3000, "hold_type": "expiry", "vega_filter": true}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[50,100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[2000,3000,5000]}]',
 100000, 'medium', TRUE, 'pro', ARRAY['options','spread','expiry','vega'], FALSE, 29,
 68.8, 2.15, 145.0, 1.98, -11.0, 185),

('warp-drive-credit-spread', 'Warp-Drive Credit Spread Exit-Early', 'Fast credit spread with early exit at 50% profit target.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 100, "max_loss_cap": 3500, "hold_type": "exit_early"}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[50,100,200]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[2500,3500,5000]}]',
 120000, 'medium', TRUE, 'pro', ARRAY['options','spread','exit-early'], FALSE, 30,
 72.5, 2.35, 118.0, 2.10, -9.8, 205),

('sensex-credit-spread', 'Sensex Credit Spread Exit-Early', 'Sensex-based credit spread with early profit booking.', 'credit_spread', 'OPTIONS', 'credit_spread', 'ml.strategies.credit_spread.CreditSpread',
 '{"spread_width": 200, "max_loss_cap": 4000, "hold_type": "exit_early", "symbol": "SENSEX"}',
 '[{"key":"spread_width","label":"Spread Width","type":"select","options":[100,200,300]},{"key":"max_loss_cap","label":"Max Loss (₹)","type":"select","options":[3000,4000,5000]}]',
 120000, 'medium', TRUE, 'pro', ARRAY['options','spread','exit-early','sensex'], FALSE, 31,
 71.0, 2.28, 112.0, 2.02, -10.2, 195),

-- ── SHORT STRANGLES (5 strategies) ────────────────────────────────────────────

('expiry-short-strangle', 'Expiry Short Strangle', 'Sell OTM CE+PE held till expiry. Premium collection with OI-based range detection.', 'short_strangle', 'OPTIONS', 'short_strangle', 'ml.strategies.short_strangle.ShortStrangle',
 '{"distance_from_atm": 100, "sl_type": "combined", "sl_pct": 30, "hold_type": "expiry"}',
 '[{"key":"distance_from_atm","label":"Distance from ATM","type":"select","options":[50,100,150,200]},{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35]},{"key":"sl_type","label":"SL Type","type":"select","options":["combined","per_leg"]}]',
 275000, 'very_high', TRUE, 'pro', ARRAY['options','selling','strangle','expiry'], TRUE, 32,
 72.8, 2.45, 165.0, 2.15, -15.5, 145),

('intraday-short-strangle', 'Intraday Short Strangle', 'Same-day short strangle with combined premium stop loss. Quick theta decay.', 'short_strangle', 'OPTIONS', 'short_strangle', 'ml.strategies.short_strangle.ShortStrangle',
 '{"distance_from_atm": 100, "sl_type": "combined", "sl_pct": 30, "hold_type": "intraday"}',
 '[{"key":"distance_from_atm","label":"Distance from ATM","type":"select","options":[50,100,150]},{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[20,25,30]}]',
 250000, 'very_high', TRUE, 'pro', ARRAY['options','selling','strangle','intraday'], FALSE, 33,
 75.5, 2.60, 142.0, 2.25, -12.8, 210),

('carry-forward-strangle', 'Carry Forward Strangle', 'Short strangle held for 3 days. Extended theta capture with wider stops.', 'short_strangle', 'OPTIONS', 'short_strangle', 'ml.strategies.short_strangle.ShortStrangle',
 '{"distance_from_atm": 150, "sl_type": "combined", "sl_pct": 35, "hold_type": "carry"}',
 '[{"key":"distance_from_atm","label":"Distance from ATM","type":"select","options":[100,150,200]},{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[30,35,40]}]',
 250000, 'very_high', TRUE, 'pro', ARRAY['options','selling','strangle','carry'], FALSE, 34,
 70.2, 2.30, 155.0, 2.00, -16.2, 130),

('chanakya-strangle', 'Chanakya Short Strangle Overnight', 'Strategic overnight strangle with OI-based strike selection.', 'short_strangle', 'OPTIONS', 'short_strangle', 'ml.strategies.short_strangle.ShortStrangle',
 '{"distance_from_atm": 100, "sl_type": "per_leg", "sl_pct": 30, "hold_type": "overnight"}',
 '[{"key":"distance_from_atm","label":"Distance from ATM","type":"select","options":[50,100,150]},{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35]},{"key":"sl_type","label":"SL Type","type":"select","options":["combined","per_leg"]}]',
 250000, 'very_high', TRUE, 'pro', ARRAY['options','selling','strangle','overnight'], FALSE, 35,
 71.5, 2.38, 150.0, 2.08, -14.8, 155),

('sidha-sauda-strangle', 'Sidha-Sauda Short Strangle Overnight', 'Direct overnight strangle with combined premium SL and quick exit.', 'short_strangle', 'OPTIONS', 'short_strangle', 'ml.strategies.short_strangle.ShortStrangle',
 '{"distance_from_atm": 100, "sl_type": "combined", "sl_pct": 25, "hold_type": "overnight"}',
 '[{"key":"distance_from_atm","label":"Distance from ATM","type":"select","options":[50,100,150]},{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[20,25,30]}]',
 250000, 'very_high', TRUE, 'pro', ARRAY['options','selling','strangle','overnight'], FALSE, 36,
 73.2, 2.42, 138.0, 2.12, -13.5, 160),

-- ── SHORT STRADDLES (3 strategies) ────────────────────────────────────────────

('kurtosis-straddle', 'Single Kurtosis Straddle', 'Sell ATM CE+PE when IV elevated with kurtosis (fat-tail) filter. IV mean reversion play.', 'short_straddle', 'OPTIONS', 'short_straddle', 'ml.strategies.short_straddle.ShortStraddle',
 '{"sl_pct": 30, "filter_type": "kurtosis", "iv_z_threshold": 1.5}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35]},{"key":"iv_z_threshold","label":"IV Z-Score Threshold","type":"select","options":[1.0,1.5,2.0]}]',
 250000, 'very_high', TRUE, 'pro', ARRAY['options','selling','straddle','iv','kurtosis'], FALSE, 37,
 68.5, 2.18, 148.0, 1.92, -16.8, 125),

('lattice-straddle', 'Single Lattice Straddle', 'ATM straddle selling with lattice pricing model for optimal entry timing.', 'short_straddle', 'OPTIONS', 'short_straddle', 'ml.strategies.short_straddle.ShortStraddle',
 '{"sl_pct": 30, "filter_type": "lattice", "iv_z_threshold": 1.5}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35]},{"key":"iv_z_threshold","label":"IV Z-Score Threshold","type":"select","options":[1.0,1.5,2.0]}]',
 260000, 'very_high', TRUE, 'pro', ARRAY['options','selling','straddle','lattice'], FALSE, 38,
 66.8, 2.05, 138.0, 1.85, -17.5, 120),

('rangetrap-straddle', 'Single Rangetrap Straddle', 'ATM straddle selling with range-bound filter (ADX < 25). Best in sideways markets.', 'short_straddle', 'OPTIONS', 'short_straddle', 'ml.strategies.short_straddle.ShortStraddle',
 '{"sl_pct": 30, "filter_type": "rangetrap", "iv_z_threshold": 1.5}',
 '[{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[25,30,35]},{"key":"iv_z_threshold","label":"IV Z-Score Threshold","type":"select","options":[1.0,1.5,2.0]}]',
 250000, 'very_high', TRUE, 'pro', ARRAY['options','selling','straddle','range-bound'], FALSE, 39,
 69.2, 2.22, 152.0, 1.98, -15.5, 132),

-- ── EQUITY INVESTING (4 strategies) ───────────────────────────────────────────

('alpha-industries', 'Alpha Industries', 'Monopoly stocks + sector rotation. Picks industry leaders with high ROE, low debt, and strong liquidity.', 'equity_investing', 'EQUITY', 'equity_basket', 'ml.strategies.equity_basket.EquityBasket',
 '{"strategy_type": "monopoly", "num_stocks": 10, "rebalance_frequency": "monthly"}',
 '[{"key":"num_stocks","label":"Number of Stocks","type":"select","options":[5,10,15]},{"key":"rebalance_frequency","label":"Rebalance","type":"select","options":["monthly","quarterly"]}]',
 60000, 'medium', FALSE, 'starter', ARRAY['equity','investing','monopoly','long-term'], TRUE, 40,
 72.0, 2.35, 45.0, 1.65, -8.5, 48),

('diversified-stocks', 'Diversified Stocks', 'PCA on top 100 stocks to find 5 maximally uncorrelated positions. True portfolio diversification.', 'equity_investing', 'EQUITY', 'equity_basket', 'ml.strategies.equity_basket.EquityBasket',
 '{"strategy_type": "pca_diversified", "num_stocks": 5, "rebalance_frequency": "monthly"}',
 '[{"key":"num_stocks","label":"Number of Stocks","type":"select","options":[3,5,7]},{"key":"rebalance_frequency","label":"Rebalance","type":"select","options":["monthly","quarterly"]}]',
 10000, 'low', FALSE, 'starter', ARRAY['equity','investing','diversified','pca'], FALSE, 41,
 65.0, 1.85, 32.0, 1.42, -6.2, 36),

('only-longs', 'Only Longs', 'Intraday equity momentum long. Gap-up + volume surge + RSI confirmation.', 'equity_investing', 'EQUITY', 'equity_basket', 'ml.strategies.equity_basket.EquityBasket',
 '{"strategy_type": "momentum_long", "max_stocks": 5, "sl_pct": 1.5, "target_pct": 3.0}',
 '[{"key":"max_stocks","label":"Max Stocks","type":"select","options":[3,5,7]},{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[1.0,1.5,2.0]},{"key":"target_pct","label":"Target %","type":"select","options":[2.0,3.0,4.0]}]',
 10000, 'high', FALSE, 'starter', ARRAY['equity','intraday','momentum','long'], FALSE, 42,
 58.5, 1.72, 85.0, 1.52, -10.5, 320),

('only-shorts', 'Only Shorts', 'Intraday equity momentum short. Gap-down + volume surge + weak RSI.', 'equity_investing', 'EQUITY', 'equity_basket', 'ml.strategies.equity_basket.EquityBasket',
 '{"strategy_type": "momentum_short", "max_stocks": 5, "sl_pct": 1.5, "target_pct": 3.0}',
 '[{"key":"max_stocks","label":"Max Stocks","type":"select","options":[3,5,7]},{"key":"sl_pct","label":"Stop Loss %","type":"select","options":[1.0,1.5,2.0]},{"key":"target_pct","label":"Target %","type":"select","options":[2.0,3.0,4.0]}]',
 10000, 'high', FALSE, 'starter', ARRAY['equity','intraday','momentum','short'], FALSE, 43,
 55.2, 1.58, 72.0, 1.38, -12.0, 285),

-- ── OUR EXISTING EQUITY STRATEGIES (6 strategies) ─────────────────────────────

('consolidation-breakout', 'Consolidation Breakout', 'Pattern detection + ML meta-labeler for chart pattern breakouts. Triangles, flags, wedges, channels.', 'equity_swing', 'EQUITY', 'equity_swing', 'ml.strategies.consolidation_breakout.ConsolidationBreakout',
 '{"ml_threshold": 0.35, "min_confidence": 65, "max_hold_bars": 15}',
 '[{"key":"ml_threshold","label":"ML Threshold","type":"select","options":[0.25,0.35,0.45]},{"key":"min_confidence","label":"Min Confidence","type":"select","options":[55,60,65,70]}]',
 50000, 'medium', FALSE, 'free', ARRAY['equity','swing','pattern','ml','breakout'], TRUE, 44,
 63.6, 1.93, 48.0, 1.55, -11.2, 85),

('trend-pullback', 'Trend Pullback', 'MA pullback entries in confirmed uptrends. Best trade frequency with consistent returns.', 'equity_swing', 'EQUITY', 'equity_swing', 'ml.strategies.trend_pullback.TrendPullback',
 '{"sma_fast": 20, "sma_slow": 50, "pullback_pct": 3.0, "max_hold_bars": 10}',
 '[{"key":"pullback_pct","label":"Pullback %","type":"select","options":[2.0,3.0,4.0]},{"key":"max_hold_bars","label":"Max Hold Days","type":"select","options":[7,10,15]}]',
 50000, 'medium', FALSE, 'free', ARRAY['equity','swing','trend','pullback'], FALSE, 45,
 55.0, 1.59, 38.0, 1.39, -9.8, 120),

('candle-reversal', 'Candle Reversal', 'Candlestick reversal patterns at key support levels. Hammer, engulfing, morning star.', 'equity_swing', 'EQUITY', 'equity_swing', 'ml.strategies.candle_reversal.CandleReversal',
 '{"min_body_ratio": 0.6, "support_lookback": 20, "max_hold_bars": 10}',
 '[{"key":"support_lookback","label":"Support Lookback","type":"select","options":[10,20,30]},{"key":"max_hold_bars","label":"Max Hold Days","type":"select","options":[7,10,15]}]',
 50000, 'medium', FALSE, 'free', ARRAY['equity','swing','candle','reversal','support'], FALSE, 46,
 60.0, 2.11, 52.0, 1.68, -8.5, 95),

('bos-structure', 'BOS Structure', 'Break of market structure (SMC). Identifies institutional order flow and structure shifts.', 'equity_swing', 'EQUITY', 'equity_swing', 'ml.strategies.bos_structure.BOSStructure',
 '{"swing_lookback": 20, "bos_confirmation": true, "max_hold_bars": 12}',
 '[{"key":"swing_lookback","label":"Swing Lookback","type":"select","options":[15,20,25]},{"key":"max_hold_bars","label":"Max Hold Days","type":"select","options":[8,10,12,15]}]',
 50000, 'high', FALSE, 'free', ARRAY['equity','swing','smc','structure','institutional'], TRUE, 47,
 87.5, 3.93, 72.0, 2.45, -6.2, 48),

('reversal-patterns', 'Reversal Patterns', 'Double bottom, inverse H&S, cup & handle, triple bottom. Multi-scale detection.', 'equity_swing', 'EQUITY', 'equity_swing', 'ml.strategies.reversal_patterns.ReversalPatterns',
 '{"atr_mult": 2.0, "min_quality": 50, "max_hold_bars": 20}',
 '[{"key":"min_quality","label":"Min Quality Score","type":"select","options":[40,50,60]},{"key":"max_hold_bars","label":"Max Hold Days","type":"select","options":[15,20,25]}]',
 50000, 'medium', FALSE, 'free', ARRAY['equity','swing','reversal','pattern','ihs','double-bottom'], FALSE, 48,
 58.0, 1.93, 42.0, 1.48, -10.5, 78),

('volume-reversal', 'Volume Reversal', 'Wyckoff Volume Price Analysis for reversal detection. Accumulation and distribution phases.', 'equity_swing', 'EQUITY', 'equity_swing', 'ml.strategies.volume_reversal.VolumeReversal',
 '{"rsi_threshold": 55, "volume_mult": 1.5, "max_hold_bars": 12}',
 '[{"key":"rsi_threshold","label":"RSI Threshold","type":"select","options":[45,50,55]},{"key":"volume_mult","label":"Volume Multiplier","type":"select","options":[1.2,1.5,2.0]}]',
 50000, 'medium', FALSE, 'free', ARRAY['equity','swing','volume','wyckoff','reversal'], FALSE, 49,
 52.0, 1.45, 35.0, 1.22, -12.8, 105);

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.strategy_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_strategy_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_backtests ENABLE ROW LEVEL SECURITY;

-- Strategy catalog: readable by everyone
CREATE POLICY "strategy_catalog_read" ON public.strategy_catalog
    FOR SELECT USING (true);

-- Deployments: users can only see/manage their own
CREATE POLICY "deployments_select_own" ON public.user_strategy_deployments
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "deployments_insert_own" ON public.user_strategy_deployments
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "deployments_update_own" ON public.user_strategy_deployments
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "deployments_delete_own" ON public.user_strategy_deployments
    FOR DELETE USING (auth.uid() = user_id);

-- Backtests: readable by everyone
CREATE POLICY "backtests_read" ON public.strategy_backtests
    FOR SELECT USING (true);

-- Service role bypass for admin operations
CREATE POLICY "strategy_catalog_admin" ON public.strategy_catalog
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "deployments_admin" ON public.user_strategy_deployments
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "backtests_admin" ON public.strategy_backtests
    FOR ALL USING (auth.role() = 'service_role');
