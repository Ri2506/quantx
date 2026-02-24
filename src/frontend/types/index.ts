// ============================================================================
// SWINGAI - TYPESCRIPT TYPE DEFINITIONS
// Global types for SwingAI platform
// ============================================================================

// ============================================================================
// USER & AUTH
// ============================================================================

export interface User {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  phone?: string
  created_at: string
  updated_at?: string
}

export type RiskProfile = 'conservative' | 'moderate' | 'aggressive'
export type TradingMode = 'signal_only' | 'semi_auto' | 'full_auto'
export type SubscriptionStatus = 'free' | 'trial' | 'active' | 'expired' | 'cancelled'

export interface UserProfile {
  id: string
  email: string
  full_name?: string
  phone?: string
  avatar_url?: string
  capital: number
  risk_profile: RiskProfile
  trading_mode: TradingMode
  max_positions: number
  risk_per_trade: number
  fo_enabled: boolean
  preferred_option_type?: 'put_options' | 'futures' | 'both'
  daily_loss_limit?: number
  weekly_loss_limit?: number
  monthly_loss_limit?: number
  trailing_sl_enabled?: boolean
  notifications_enabled?: boolean
  telegram_chat_id?: string
  subscription_status: SubscriptionStatus
  subscription_plan_id?: string
  broker_connected: boolean
  broker_name?: string
  paper_trading_started_at?: string
  live_trading_whitelisted?: boolean
  kill_switch_active?: boolean
  total_trades: number
  winning_trades: number
  total_pnl: number
  created_at: string
  updated_at?: string
  last_login?: string
  last_active?: string
}

export type SubscriptionTier = 'free' | 'starter' | 'pro' | 'elite'

// ============================================================================
// TRADING SIGNALS
// ============================================================================

export interface Signal {
  id: string
  symbol: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  segment: 'EQUITY' | 'FUTURES' | 'OPTIONS'
  direction: 'LONG' | 'SHORT'
  entry_price: number
  stop_loss: number
  target?: number
  target_1?: number
  target_2?: number
  target_3?: number
  confidence: number // 0-100
  risk_reward_ratio?: number
  risk_reward?: number
  catboost_score?: number
  tft_score?: number
  stockformer_score?: number
  position_size?: number
  model_predictions?: ModelPredictions
  technical_analysis?: TechnicalAnalysis
  model_agreement?: number
  strategy_names?: string[]
  reasons?: string[]
  is_premium?: boolean
  tft_prediction?: Record<string, any>
  status: SignalStatus
  created_at?: string
  generated_at?: string
  date?: string
  valid_until?: string
  executed_at?: string
  exit_at?: string
  expiry_date?: string
  strike_price?: number
  option_type?: string
  lot_size?: number
}

export type SignalStatus =
  | 'active'
  | 'triggered'
  | 'pending'
  | 'executed'
  | 'target_hit'
  | 'stop_loss_hit'
  | 'sl_hit'
  | 'expired'
  | 'cancelled'
  | 'closed'
  | 'rejected'

export interface ModelPredictions {
  catboost?: {
    prediction: 'LONG' | 'SHORT'
    confidence: number
  }
  tft?: {
    prediction: 'LONG' | 'SHORT'
    confidence: number
  }
  stockformer?: {
    prediction: 'LONG' | 'SHORT'
    confidence: number
  }
  ensemble_confidence?: number
  model_agreement?: number // 0-1 or model count
}

export interface TechnicalAnalysis {
  rsi: number
  macd: {
    macd: number
    signal: number
    histogram: number
  }
  moving_averages: {
    sma_20: number
    sma_50: number
    sma_200: number
    ema_20: number
  }
  volume_analysis: {
    volume: number
    avg_volume_20d: number
    volume_ratio: number
  }
  support_resistance: {
    support_levels: number[]
    resistance_levels: number[]
  }
  smc_analysis?: {
    order_blocks: string[]
    fair_value_gaps: string[]
    liquidity_zones: string[]
  }
}

// ============================================================================
// POSITIONS & TRADES
// ============================================================================

export interface Position {
  id: string
  user_id: string
  signal_id?: string
  trade_id?: string
  symbol: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  segment: 'EQUITY' | 'FUTURES' | 'OPTIONS'
  direction: 'LONG' | 'SHORT'
  quantity: number
  lots?: number
  entry_price?: number
  average_price?: number
  current_price: number
  stop_loss: number
  target: number
  unrealized_pnl: number
  unrealized_pnl_percentage?: number
  unrealized_pnl_percent?: number
  status?: 'open' | 'closed' | 'pending'
  is_active?: boolean
  opened_at?: string
  updated_at?: string
  execution_mode?: 'paper' | 'live'
}

export interface Trade {
  id: string
  user_id: string
  signal_id?: string
  position_id?: string
  symbol: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  segment: 'EQUITY' | 'FUTURES' | 'OPTIONS'
  direction: 'LONG' | 'SHORT'
  quantity: number
  lots?: number
  entry_price: number
  exit_price?: number
  stop_loss: number
  target: number
  status?: 'pending' | 'open' | 'closed' | 'cancelled'
  gross_pnl?: number
  net_pnl?: number
  pnl_percent?: number
  realized_pnl?: number
  realized_pnl_percentage?: number
  exit_reason?: ExitReason | string
  holding_duration_hours?: number
  opened_at?: string
  created_at?: string
  executed_at?: string
  closed_at?: string
  execution_mode?: 'paper' | 'live'
  charges?: {
    brokerage: number
    stt: number
    exchange_fee: number
    gst: number
    sebi_charges: number
    stamp_duty: number
    total: number
  }
}

export type ExitReason =
  | 'target_hit'
  | 'stop_loss_hit'
  | 'manual_close'
  | 'time_based'
  | 'risk_limit_reached'

// ============================================================================
// PORTFOLIO & PERFORMANCE
// ============================================================================

export interface PortfolioSummary {
  total_capital: number
  invested_capital: number
  available_capital: number
  total_pnl: number
  total_pnl_percentage: number
  day_pnl: number
  day_pnl_percentage: number
  week_pnl: number
  month_pnl: number
  positions_count: number
  open_positions_value: number
}

export interface UserStats {
  capital: number
  total_pnl: number
  total_trades: number
  winning_trades: number
  win_rate: number
  open_positions: number
  unrealized_pnl: number
  today_pnl: number
  week_pnl?: number
  subscription_status: string
}

export interface DashboardOverview {
  stats: UserStats
  recent_signals: Signal[]
  active_positions: Position[]
  notifications_count: number
}

// ============================================================================
// FINANCE ASSISTANT
// ============================================================================

export type AssistantTopic =
  | 'markets'
  | 'stocks'
  | 'trading'
  | 'news'
  | 'education'
  | 'out_of_scope'

export interface AssistantSource {
  title: string
  url: string
  source: string
  published_at?: string
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  topic?: AssistantTopic
  in_scope?: boolean
  sources?: AssistantSource[]
  created_at: string
}

export interface AssistantChatRequest {
  message: string
  history?: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

export interface AssistantUsage {
  tier: 'free' | 'pro'
  credits_limit: number
  credits_used: number
  credits_remaining: number
  reset_at: string
}

export interface AssistantUsageResponse {
  usage: AssistantUsage
}

export interface AssistantChatResponse {
  reply: string
  in_scope: boolean
  topic: AssistantTopic
  sources: AssistantSource[]
  generated_at: string
  usage?: AssistantUsage
}

export interface PerformanceMetrics {
  total_trades: number
  winning_trades: number
  losing_trades: number
  win_rate: number // percentage
  profit_factor: number
  average_win: number
  average_loss: number
  largest_win: number
  largest_loss: number
  sharpe_ratio: number
  sortino_ratio: number
  calmar_ratio: number
  max_drawdown: number
  max_drawdown_percentage: number
  recovery_time_days: number
  average_holding_period_hours: number
  best_day_pnl: number
  worst_day_pnl: number
}

export interface EquityCurvePoint {
  date: string
  equity: number
  drawdown_percentage: number
}

// ============================================================================
// WATCHLIST & ALERTS
// ============================================================================

export interface Watchlist {
  id: string
  user_id: string
  name: string
  description?: string
  stocks: WatchlistStock[]
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface WatchlistStock {
  symbol: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  added_at: string
  current_price?: number
  change_percentage?: number
  volume?: number
}

export interface PriceAlert {
  id: string
  user_id: string
  symbol: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  alert_type: AlertType
  condition: AlertCondition
  value: number
  is_active: boolean
  triggered_at?: string
  delivery_channels: ('email' | 'telegram' | 'push')[]
  created_at: string
}

export type AlertType = 'price' | 'volume' | 'rsi' | 'macd'
export type AlertCondition = 'above' | 'below' | 'crosses_above' | 'crosses_below'

// ============================================================================
// SCREENER & SCANS
// ============================================================================

export interface ScannerCategory {
  id: string
  name: string
  description: string
  scans: Scanner[]
}

export interface Scanner {
  id: string
  name: string
  description: string
  category: string
  stocks_matched: number
  last_run_at: string
  run_frequency: 'realtime' | 'hourly' | 'eod'
}

export interface ScanResult {
  symbol: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  price: number
  change_percentage: number
  volume: number
  market_cap: number
  sector: string
  match_reason: string
  matched_at: string
}

// ============================================================================
// BROKER INTEGRATION
// ============================================================================

export interface BrokerConnection {
  id: string
  user_id: string
  broker: BrokerName
  status: 'connected' | 'disconnected' | 'error'
  api_key?: string
  connected_at: string
  last_synced_at?: string
  error_message?: string
}

export type BrokerName = 'zerodha' | 'angel_one' | 'upstox' | 'fyers' | 'iifl'

export interface OrderRequest {
  symbol: string
  exchange: 'NSE' | 'BSE' | 'NFO'
  transaction_type: 'BUY' | 'SELL'
  order_type: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M'
  quantity: number
  price?: number
  trigger_price?: number
  product: 'CNC' | 'MIS' | 'NRML'
  validity: 'DAY' | 'IOC'
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export interface Notification {
  id: string
  user_id: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, any>
  is_read: boolean
  created_at: string
}

export type NotificationType =
  | 'signal_new'
  | 'position_update'
  | 'target_hit'
  | 'stop_loss_hit'
  | 'risk_alert'
  | 'broker_disconnected'
  | 'system_alert'
  | 'subscription_expiring'

// ============================================================================
// SUBSCRIPTION & PAYMENTS
// ============================================================================

export interface Subscription {
  id: string
  user_id: string
  plan: SubscriptionTier
  status: 'active' | 'inactive' | 'trial' | 'cancelled' | 'expired'
  billing_period: 'monthly' | 'yearly'
  amount: number
  currency: 'INR'
  start_date: string
  end_date: string
  auto_renew: boolean
  next_billing_date?: string
  razorpay_subscription_id?: string
}

export interface PaymentTransaction {
  id: string
  user_id: string
  subscription_id: string
  amount: number
  currency: 'INR'
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  payment_method: string
  razorpay_order_id?: string
  razorpay_payment_id?: string
  created_at: string
  completed_at?: string
}

// ============================================================================
// SETTINGS
// ============================================================================

export interface UserSettings {
  trading_preferences: TradingPreferences
  risk_management: RiskManagementRules
  notification_preferences: NotificationPreferences
}

export interface TradingPreferences {
  default_order_type: 'MARKET' | 'LIMIT' | 'SL-M'
  default_product_type: 'CNC' | 'MIS' | 'NRML'
  trading_mode: TradingMode
  default_exchange: 'NSE' | 'BSE' | 'NFO'
  auto_square_off_time?: string
}

export interface RiskManagementRules {
  max_daily_loss_amount?: number
  max_daily_loss_percentage?: number
  max_position_size_amount?: number
  max_position_size_percentage?: number
  max_positions_count?: number
  stop_trading_on_daily_loss: boolean
  max_risk_per_trade_percentage: number
}

export interface NotificationPreferences {
  email_enabled: boolean
  telegram_enabled: boolean
  push_enabled: boolean
  new_signals: boolean
  position_updates: boolean
  risk_alerts: boolean
  system_alerts: boolean
  quiet_hours_start?: string
  quiet_hours_end?: string
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    total_pages: number
  }
}

// ============================================================================
// REAL-TIME UPDATES
// ============================================================================

export interface WebSocketMessage {
  type: 'price_update' | 'signal_new' | 'position_update' | 'notification'
  data: any
  timestamp: string
}

export interface PriceUpdate {
  symbol: string
  ltp: number
  change: number
  change_percentage: number
  volume: number
  timestamp: string
}

// ============================================================================
// CHARTS & ANALYTICS
// ============================================================================

export interface ChartDataPoint {
  date: string
  value: number
  label?: string
}

export interface OHLCData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

// ============================================================================
// FILTER & SORT OPTIONS
// ============================================================================

export interface SignalFilters {
  segment?: 'EQUITY' | 'FUTURES' | 'OPTIONS'
  direction?: 'LONG' | 'SHORT'
  min_confidence?: number
  min_risk_reward?: number
  date_range?: {
    start: string
    end: string
  }
}

export interface TradeFilters {
  segment?: 'EQUITY' | 'FUTURES' | 'OPTIONS'
  direction?: 'LONG' | 'SHORT'
  status?: 'open' | 'closed'
  date_range?: {
    start: string
    end: string
  }
  min_pnl?: number
  max_pnl?: number
}

export type SortOption = {
  field: string
  order: 'asc' | 'desc'
}
