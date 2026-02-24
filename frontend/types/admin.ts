// ============================================================================
// SWINGAI - ADMIN TYPES
// Type definitions for admin console
// ============================================================================

export type AdminRole = 'super_admin' | 'support_admin' | 'read_only'

export interface AdminUser {
  id: string
  email: string
  role: AdminRole
}

export interface UserListItem {
  id: string
  email: string
  full_name?: string
  phone?: string
  capital: number
  trading_mode: string
  subscription_status: string
  subscription_plan?: string
  broker_connected: boolean
  broker_name?: string
  total_trades: number
  winning_trades: number
  total_pnl: number
  created_at: string
  last_login?: string
  last_active?: string
  is_suspended: boolean
  is_banned: boolean
}

export interface UserListResponse {
  users: UserListItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface UserDetailResponse {
  user: UserListItem
  trading_settings: Record<string, any>
  recent_activity: any[]
  payment_history: any[]
  positions: any[]
  trades: any[]
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'error'
  timestamp: string
  database: string
  redis: string
  scheduler_status: string
  last_signal_run?: string
  active_websocket_connections: number
  metrics: {
    total_users: number
    active_subscribers: number
    today_signals: number
    today_trades: number
    active_positions: number
  }
}

export interface PaymentStats {
  period_days: number
  total_revenue: number
  completed_payments: number
  failed_payments: number
  refunds_count: number
  refunds_amount: number
  net_revenue: number
}

export interface SignalStats {
  period_days: number
  total_signals: number
  target_hit: number
  sl_hit: number
  accuracy: number
  avg_per_day: number
}
