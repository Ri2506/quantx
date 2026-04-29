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
