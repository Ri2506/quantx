import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantUsageResponse,
  DashboardOverview,
  Notification,
  Position,
  Signal,
  SignalFilters,
  StrategyCatalog,
  StrategyBacktest,
  StrategyDeployment,
  Trade,
  UserStats,
} from '../types'
import { supabase } from './supabase'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''

type Primitive = string | number | boolean | null | undefined

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
  query?: Record<string, Primitive>
  auth?: boolean
}

type ApiErrorShape = {
  detail?: string
  error?: string
  message?: string
}

function buildPath(path: string, query?: Record<string, Primitive>): string {
  if (!query) {
    return path
  }

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue
    }
    params.set(key, String(value))
  }

  const queryString = params.toString()
  return queryString ? `${path}?${queryString}` : path
}

async function getAuthToken(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) {
      return session.access_token
    }
  } catch {
    // fall back to local storage below
  }

  if (typeof window === 'undefined') {
    return null
  }

  return (
    localStorage.getItem('sb-access-token') ||
    localStorage.getItem('supabase.auth.token') ||
    null
  )
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = options
  const fullPath = buildPath(path, query)

  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  if (body) {
    headers['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = await getAuthToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }

  try {
    const response = await fetch(`${API_BASE}${fullPath}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    let payload: unknown = null
    const text = await response.text()
    if (text) {
      try {
        payload = JSON.parse(text)
      } catch {
        payload = text
      }
    }

    if (!response.ok) {
      const err = payload as ApiErrorShape
      const message =
        err?.detail || err?.error || err?.message || `Request failed (${response.status})`
      throw new Error(message)
    }

    return payload as T
  } catch (error) {
    throw error
  }
}

export function handleApiError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object') {
    const err = error as ApiErrorShape
    return err.detail || err.error || err.message || 'Unknown API error'
  }
  return 'Unknown API error'
}

export type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantUsageResponse,
  DashboardOverview,
  Notification,
  Position,
  Signal,
  Trade,
  UserStats,
}

export type SignalsTodayResponse = {
  date: string
  total: number
  long_signals: Signal[]
  short_signals: Signal[]
  equity_signals?: Signal[]
  futures_signals?: Signal[]
  options_signals?: Signal[]
  all_signals: Signal[]
}

export type SignalsHistoryResponse = {
  signals: Signal[]
}

export type TradesResponse = {
  trades: Trade[]
}

export type PositionsResponse = {
  positions: Position[]
}

export type PortfolioHistoryResponse = {
  history: Array<Record<string, any>>
}

export type NotificationsResponse = {
  notifications: Notification[]
}

// PR 30 — F&O strategy proposal shape (shared between overview + single-symbol + price)
export type FoStrategyLeg = {
  action: 'BUY' | 'SELL'
  option_type: 'CE' | 'PE'
  strike: number
  expiry: string
  premium: number
  delta: number
  gamma: number
  theta: number
  vega: number
  iv: number
}

export type FoStrategyProposal = {
  symbol: string
  strategy: string
  name: string
  regime: string
  vix_direction: string
  vix_level: number | null
  view: string
  legs: FoStrategyLeg[]
  max_profit: number | null
  max_loss: number | null
  breakevens: number[]
  net_premium: number
  credit_debit: 'credit' | 'debit'
  lot_size: number
  probability_of_profit: number | null
  expiry: string
  strike_interval: number
}

// PR 33 — AI Dossier engine block shape (shared by every engine row)
export type DossierEngineBlock = {
  engine: string
  role: string
  available: boolean
  direction?: 'bullish' | 'bearish' | 'bullish_tilt' | 'bearish_tilt' | 'neutral' | 'non_directional' | 'mixed'
  // SwingLens
  p10?: number | null
  p50?: number | null
  p90?: number | null
  // AlphaRank
  rank?: number
  score?: number
  sector_rank?: number
  date?: string
  // HorizonCast
  horizon_days?: number
  // Thales
  headline_count?: number
  trade_dates?: number
  // RegimeIQ
  regime?: string
  prob_bull?: number | null
  prob_sideways?: number | null
  prob_bear?: number | null
  vix?: number | null
  // TickPulse
  up_prob?: number
  // EarningsScout
  announce_date?: string
  beat_prob?: number
  confidence?: string | null
  // SectorFlow
  sector?: string
  rotating?: 'in' | 'out' | 'neutral'
  momentum_score?: number | null
}

// PR 34 — Portfolio Doctor report shape (shared: analyze + report)
export type DoctorRiskFlag = {
  kind: 'concentration' | 'sector_skew' | 'drawdown' | 'stale_stop'
  severity: 'low' | 'medium' | 'high'
  message: string
  meta?: Record<string, any>
}
export type DoctorPositionResult = {
  symbol: string
  weight: number
  composite_score: number
  action: string
  narrative: string
}
export type DoctorReport = {
  id: string
  created_at: string
  source: 'manual' | 'broker' | 'csv'
  position_count: number
  capital: number | null
  composite_score: number
  action: 'rebalance' | 'hold' | 'reduce_risk' | 'increase_risk'
  narrative: string
  per_position: DoctorPositionResult[]
  risk_flags: DoctorRiskFlag[]
  agents: Record<string, any>
  quota: {
    tier: 'free' | 'pro' | 'elite'
    runs_this_month: number
    quota: number | null
    remaining: number | null
  }
}

export const api = {
  user: {
    getProfile: () => request<Record<string, any>>('/api/user/profile'),
    updateProfile: (data: Record<string, any>) =>
      request<{ success: boolean; data?: Record<string, any> }>('/api/user/profile', {
        method: 'PUT',
        body: data,
      }),
    getStats: () => request<UserStats>('/api/user/stats'),
    // PR 14 — tier + feature access map + Copilot daily cap.
    getTier: () =>
      request<{
        user_id: string
        tier: 'free' | 'pro' | 'elite'
        is_admin: boolean
        features: Record<string, boolean>
        copilot_daily_cap: number
      }>('/api/user/tier'),
    // PR 123 — cross-device UI prefs blob (watchlist preset pins, etc.).
    getUIPreferences: () =>
      request<{ ui_preferences: Record<string, any> }>('/api/user/ui-preferences'),
    updateUIPreferences: (ui_preferences: Record<string, any>) =>
      request<{ success: boolean; ui_preferences: Record<string, any> }>(
        '/api/user/ui-preferences',
        { method: 'PUT', body: { ui_preferences } },
      ),
  },

  dashboard: {
    getOverview: () => request<DashboardOverview>('/api/dashboard/overview'),
  },

  assistant: {
    getUsage: () => request<AssistantUsageResponse>('/api/assistant/usage'),
    chat: (data: AssistantChatRequest & {
      page_context?: {
        route?: string
        symbol?: string
        signal_id?: string
        page_label?: string
      }
    }) =>
      request<AssistantChatResponse>('/api/assistant/chat', {
        method: 'POST',
        body: {
          message: data.message,
          history: data.history || [],
          // PR 86 — optional page context. Backend clamps strings + drops
          // unknown keys, so the shape sent here is the public contract.
          page_context: data.page_context,
        },
      }),
  },

  signals: {
    getToday: (filters?: SignalFilters) =>
      request<SignalsTodayResponse>('/api/signals/today', {
        query: {
          segment: filters?.segment,
          direction: filters?.direction,
        },
      }),
    getById: (signalId: string) => request<Signal>(`/api/signals/${signalId}`),
    // PR 50 — F1 intraday signals (last 60 min by default)
    getIntraday: (windowMinutes = 60) =>
      request<{
        window_minutes: number
        total: number
        signals: Signal[]
      }>('/api/signals/intraday', { query: { window_minutes: windowMinutes } }),
    getHistory: (filters?: Record<string, Primitive>) =>
      request<SignalsHistoryResponse>('/api/signals/history', { query: filters }),
    getPerformance: (days = 30) =>
      request<Record<string, any>>('/api/signals/performance', { query: { days } }),
  },

  trades: {
    getAll: (filters?: Record<string, Primitive>) =>
      request<TradesResponse>('/api/trades', { query: filters }),
    execute: (data: Record<string, any>) =>
      request<{
        success: boolean
        trade_id: string
        status: 'pending' | 'open' | string
        quantity: number
        entry_price: number
        stop_loss: number
        target: number
      }>('/api/trades/execute', {
        method: 'POST',
        body: data,
      }),
    close: (tradeId: string, data?: Record<string, any>) =>
      request<{ success: boolean }>(`/api/trades/${tradeId}/close`, {
        method: 'POST',
        body: data || {},
      }),
    approve: (tradeId: string) =>
      request<{ success: boolean; message: string }>(`/api/trades/${tradeId}/approve`, {
        method: 'POST',
      }),
    killSwitch: () =>
      request<{ success: boolean; message: string }>('/api/trades/kill-switch', {
        method: 'POST',
      }),
  },

  positions: {
    getAll: () => request<PositionsResponse>('/api/positions'),
    getOpen: () => request<PositionsResponse>('/api/positions/open'),
    getById: (positionId: string) => request<Position>(`/api/positions/${positionId}`),
    close: (positionId: string, data?: Record<string, any>) =>
      request<{ success: boolean }>(`/api/positions/${positionId}/close`, {
        method: 'POST',
        body: data || {},
      }),
    updateSlTarget: (positionId: string, data: { stop_loss?: number; target?: number }) =>
      request<{ success: boolean }>(`/api/positions/${positionId}`, {
        method: 'PUT',
        body: data,
      }),
  },

  portfolio: {
    getSummary: () => request<Record<string, any>>('/api/portfolio'),
    getHistory: (days = 30) =>
      request<PortfolioHistoryResponse>('/api/portfolio/history', { query: { days } }),
    getPerformance: () => request<Record<string, any>>('/api/portfolio/performance'),
  },

  notifications: {
    getAll: (params?: { unread_only?: boolean; limit?: number }) =>
      request<NotificationsResponse>('/api/notifications', {
        query: {
          unread_only: params?.unread_only,
          limit: params?.limit,
        },
      }),
    markRead: (notificationId: string) =>
      request<{ success: boolean }>(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
      }),
    markAllRead: () =>
      request<{ success: boolean }>('/api/notifications/read-all', {
        method: 'POST',
      }),
  },

  watchlist: {
    getAll: () => request<{ watchlist: Array<Record<string, any>> }>('/api/watchlist'),
    add: (symbol: string, segment: 'EQUITY' | 'FUTURES' | 'OPTIONS' = 'EQUITY') =>
      request<{ success: boolean; message?: string }>('/api/watchlist', {
        method: 'POST',
        body: { symbol, segment },
      }),
    remove: (symbol: string) =>
      request<{ success: boolean }>(`/api/watchlist/${symbol}`, {
        method: 'DELETE',
      }),
    update: (symbol: string, data: { notes?: string; target_price?: string; stop_loss?: string }) =>
      request<{ success: boolean }>(`/api/watchlist/${symbol}`, {
        method: 'PUT',
        query: {
          notes: data.notes || undefined,
          target_price: data.target_price || undefined,
          stop_loss: data.stop_loss || undefined,
        },
      }),

    // PR 112 — partial update for alert thresholds. Backend re-arms
    // the PR 109 price-alert debounce when a threshold value changes,
    // so the next crossing fires fresh.
    updateAlerts: (
      symbol: string,
      data: {
        alert_price_above?: number | null
        alert_price_below?: number | null
        alert_enabled?: boolean
        notes?: string
      },
    ) =>
      request<{ success: boolean; updated: boolean; rearmed?: boolean }>(
        `/api/watchlist/${symbol}/alerts`,
        { method: 'PUT', body: data },
      ),

    // PR 39 — enriched per-symbol engine snapshots
    live: () =>
      request<{
        items: Array<{
          symbol: string
          added_at: string | null
          alert_enabled: boolean
          alert_price_above: number | null
          alert_price_below: number | null
          notes: string | null
          last_price: number | null
          change_pct: number | null
          engines: {
            consensus: 'bullish' | 'bearish' | 'mixed' | 'neutral'
            swing_direction: 'bullish' | 'bearish' | 'neutral' | null
            regime: 'bull' | 'sideways' | 'bear' | null
            regime_warning: boolean
            sentiment_score: number | null
          } | null
          latest_signal: {
            id: string
            direction: 'LONG' | 'SHORT'
            confidence: number
            status: string
            created_at: string
            entry_price: number | null
            target: number | null
            stop_loss: number | null
          } | null
          upcoming_earnings: {
            announce_date: string
            beat_prob: number
            confidence: string | null
          } | null
        }>
        tier: 'free' | 'pro' | 'elite'
        cap: number | null
        count: number
        capped: boolean
      }>('/api/watchlist/live'),

    limits: () =>
      request<{
        tier: 'free' | 'pro' | 'elite'
        cap: number | null
        used: number
        remaining: number | null
      }>('/api/watchlist/limits'),
  },

  market: {
    getStatus: () => request<Record<string, any>>('/api/market/status', { auth: false }),
    getQuote: (symbol: string) =>
      request<Record<string, any>>(`/api/market/quote/${symbol}`, { auth: false }),
    getIndices: () => request<Record<string, any>>('/api/market/indices', { auth: false }),
    getOHLC: (symbol: string, interval = '1d', days = 30) =>
      request<Record<string, any>>(`/api/market/ohlc/${symbol}`, {
        query: { interval, days },
        auth: false,
      }),
  },

  broker: {
    getStatus: () => request<Record<string, any>>('/api/broker/status'),
    getConnections: () =>
      request<{
        brokers: Array<{
          broker_name: 'zerodha' | 'upstox' | 'angelone'
          status: 'connected' | 'disconnected' | 'expired' | 'error' | 'not_connected'
          account_id: string | null
          last_synced_at: string | null
          expires_at: string | null
        }>
      }>('/api/broker/connections'),
    connect: (data: Record<string, any>) =>
      request<{ success: boolean; broker?: string; account_id?: string; auto_refresh?: boolean }>('/api/broker/connect', {
        method: 'POST',
        body: data,
      }),
    disconnect: (broker?: string) =>
      request<{ success: boolean; disconnected: string }>(
        broker ? `/api/broker/disconnect?broker=${broker}` : '/api/broker/disconnect',
        { method: 'POST' }
      ),
    initiateOAuth: (broker: string) =>
      request<{ auth_url: string; state: string; auth_type?: string; required_fields?: any[] }>(`/api/broker/${broker}/auth/initiate`, {
        method: 'POST',
      }),
    getPositions: () => request<{ positions: Array<Record<string, any>> }>('/api/broker/positions'),
    getHoldings: () => request<{ holdings: Array<Record<string, any>> }>('/api/broker/holdings'),
    getMargin: () =>
      request<{ available_margin: number; used_margin: number }>('/api/broker/margin'),
  },

  // PR 18 — public trust-surface endpoints (/regime, /track-record, /models)
  publicTrust: {
    regimeHistory: (days = 90) =>
      request<{
        days: number
        current: {
          regime: 'bull' | 'sideways' | 'bear'
          prob_bull: number
          prob_sideways: number
          prob_bear: number
          vix: number | null
          nifty_close: number | null
          detected_at: string
        } | null
        history: Array<{
          regime: 'bull' | 'sideways' | 'bear'
          prob_bull: number
          prob_sideways: number
          prob_bear: number
          vix: number | null
          nifty_close: number | null
          detected_at: string
        }>
        counts: { bull: number; sideways: number; bear: number }
      }>('/api/public/regime/history', { auth: false, query: { days } }),

    trackRecord: (opts?: {
      days?: number
      segment?: 'EQUITY' | 'FUTURES' | 'OPTIONS'
      direction?: 'LONG' | 'SHORT'
      limit?: number
    }) =>
      request<{
        days: number
        stats: {
          n: number
          wins: number
          losses: number
          expired: number
          win_rate: number
          avg_return_pct: number
          avg_win_pct: number
          avg_loss_pct: number
          profit_factor: number | null
          best_return_pct: number
          best_symbol: string | null
          worst_return_pct: number
          worst_symbol: string | null
        }
        curve: Array<{ date: string; cum_return_pct: number }>
        current_regime: { regime: string; detected_at: string } | null
        signals: Array<Record<string, any>>
      }>('/api/public/track-record', {
        auth: false,
        query: {
          days: opts?.days ?? 90,
          segment: opts?.segment,
          direction: opts?.direction,
          limit: opts?.limit ?? 200,
        },
      }),

    models: (windowDays = 30) =>
      request<{
        window_days: number
        models: Array<{
          model_name: string
          window_days: number
          win_rate: number | null
          avg_pnl_pct: number | null
          signal_count: number
          directional_accuracy: number | null
          sharpe_ratio: number | null
          max_drawdown_pct: number | null
          computed_at: string
          sparkline: number[]
        }>
      }>('/api/public/models', { auth: false, query: { window_days: windowDays } }),

    // PR 48 — public ops status (trading halt flag only, no reason text)
    systemStatus: () =>
      request<{
        trading_halted: boolean
        computed_at: string
      }>('/api/public/system/status', { auth: false }),

    // PR 52 — public model-availability flags so the UI hides features
    // whose trained models haven't shipped yet. Never returns architecture names.
    modelsStatus: () =>
      request<{
        models: {
          earnings_scout: boolean
          tickpulse: boolean
        }
        computed_at: string
      }>('/api/public/models/status', { auth: false }),

    // PR 66 — live index ticker. Backed by 30s CDN cache so a
    // dashboard-wide refresh storm is one upstream call.
    indices: () =>
      request<{
        indices: Array<{
          key: 'nifty' | 'banknifty' | 'sensex' | 'vix'
          label: string
          last: number | null
          change: number | null
          change_pct: number | null
        }>
        computed_at: string
      }>('/api/public/indices', { auth: false }),

    // PR 108 — landing-hero "today's best" card. Returns either an
    // active high-confidence signal from today, or the best closed
    // winner from the last 7 days, or a `none` sentinel when neither
    // exists. Three response shapes share `kind` as the discriminator.
    signalOfTheDay: () =>
      request<
        | {
            kind: 'active'
            symbol: string
            direction: 'LONG' | 'SHORT'
            segment: string
            confidence: number
            entry_price: number | null
            regime_at_signal: string | null
            generated_at: string | null
            computed_at: string
          }
        | {
            kind: 'closed_winner'
            symbol: string
            direction: 'LONG' | 'SHORT'
            segment: string
            return_pct: number
            closed_on: string
            computed_at: string
          }
        | { kind: 'none'; computed_at: string }
      >('/api/public/signal-of-the-day', { auth: false }),
  },

  // PR 17 — AI agent endpoints (Copilot / FinRobot / Debate)
  ai: {
    copilotChat: (body: {
      message: string
      route?: string
      history?: Array<{ role: string; content: string }>
      mentioned_symbols?: string[]
    }) =>
      request<{
        reply: string
        refused: boolean
        intent?: string
        tools_used: string[]
        trace: Array<{ agent: string; duration_ms: number }>
      }>('/api/ai/copilot/chat', { method: 'POST', body }),

    finrobotAnalyze: (body: {
      symbol: string
      fundamentals?: Record<string, any>
      concall_transcript?: string
      management_headlines?: string[]
      promoter_holding?: Record<string, any>
      peers?: Array<Record<string, any>>
    }) =>
      request<{
        symbol: string
        narrative: string
        action: 'add' | 'hold' | 'trim' | 'exit'
        composite_score: number
        agents: Record<string, any>
        trace: Array<{ agent: string; duration_ms: number }>
      }>('/api/ai/finrobot/analyze', { method: 'POST', body }),

    debate: (signalId: string, body: {
      fundamentals?: Record<string, any>
      stock_snapshot?: Record<string, any>
      news_headlines?: string[]
      regime?: Record<string, any>
      vix?: number
    }) =>
      request<{
        signal_id: string
        symbol: string
        decision: 'enter' | 'skip' | 'half_size' | 'wait'
        confidence: number
        summary: string
        transcript: Record<string, any>
        trace: Array<{ agent: string; duration_ms: number }>
      }>(`/api/ai/debate/signal/${signalId}`, { method: 'POST', body }),

    // PR 46 — Chart vision analysis (B2)
    visionAnalyze: (symbol: string, anywhere = false) =>
      request<{
        symbol: string
        available: boolean
        trend: 'uptrend' | 'downtrend' | 'range' | 'unclear' | null
        pattern: string | null
        support_levels: number[]
        resistance_levels: number[]
        volume_signal: 'accumulation' | 'distribution' | 'neutral' | null
        setup: string | null
        confidence: number | null
        narrative: string | null
        notes: string[]
      }>(anywhere
        ? `/api/ai/vision/analyze/any/${encodeURIComponent(symbol)}`
        : `/api/ai/vision/analyze/${encodeURIComponent(symbol)}`,
        { method: 'POST' },
      ),
  },

  // PR 28 — Auto-trader (F4 Elite) dashboard
  autoTrader: {
    status: () =>
      request<{
        enabled: boolean
        paused: boolean
        last_run_at: string | null
        broker_connected: boolean
        broker_name: string | null
        open_positions: number
        today_trades: number
        today_pnl_pct: number
        regime: {
          name: 'bull' | 'sideways' | 'bear'
          prob_bull: number
          prob_sideways: number
          prob_bear: number
          as_of: string
        } | null
        vix_band: 'calm' | 'normal' | 'elevated' | 'high' | 'stressed' | 'panic' | null
        equity_scaler_pct: number
        config: {
          risk_profile: 'conservative' | 'moderate' | 'aggressive'
          max_position_pct: number
          daily_loss_limit_pct: number
          max_concurrent_positions: number
          allow_fno: boolean
        }
      }>('/api/auto-trader/status'),

    getConfig: () =>
      request<{
        risk_profile: 'conservative' | 'moderate' | 'aggressive'
        max_position_pct: number
        daily_loss_limit_pct: number
        max_concurrent_positions: number
        allow_fno: boolean
      }>('/api/auto-trader/config'),

    updateConfig: (patch: {
      risk_profile?: 'conservative' | 'moderate' | 'aggressive'
      max_position_pct?: number
      daily_loss_limit_pct?: number
      max_concurrent_positions?: number
      allow_fno?: boolean
    }) =>
      request<{
        risk_profile: 'conservative' | 'moderate' | 'aggressive'
        max_position_pct: number
        daily_loss_limit_pct: number
        max_concurrent_positions: number
        allow_fno: boolean
      }>('/api/auto-trader/config', { method: 'PATCH', body: patch }),

    toggle: (enabled: boolean) =>
      request<{ enabled: boolean; ok: boolean }>('/api/auto-trader/toggle', {
        method: 'POST',
        body: { enabled },
      }),

    trades: (days = 7) =>
      request<
        Array<{
          id: string
          symbol: string
          direction: 'LONG' | 'SHORT'
          quantity: number
          entry_price: number | null
          exit_price: number | null
          status: string
          net_pnl: number | null
          pnl_percent: number | null
          created_at: string | null
          closed_at: string | null
          signal_id: string | null
        }>
      >('/api/auto-trader/trades', { query: { days } }),

    weekly: () =>
      request<{
        days: number
        trades_executed: number
        trades_closed: number
        wins: number
        losses: number
        win_rate: number
        total_pnl_pct: number
        net_pnl: number
        symbols: string[]
      }>('/api/auto-trader/weekly'),

    // PR 69 — recent rebalance ticks for the dashboard log.
    runs: (limit = 10) =>
      request<
        Array<{
          id: string
          ran_at: string
          regime: 'bull' | 'sideways' | 'bear' | null
          vix: number | null
          vix_band: string | null
          equity_scaler_pct: number | null
          actions_count: number
          trades_executed: number
          summary: string | null
        }>
      >('/api/auto-trader/runs', { query: { limit } }),

    // PR 133 — today's planned weights + VIX/Kelly/VaR overlay diagnostics.
    todayPlan: () =>
      request<{
        ran_at: string | null
        regime: 'bull' | 'sideways' | 'bear' | null
        target_weights: Record<string, number>
        diagnostics: {
          vix_level?: number
          vix_exposure_cap?: number
          bear_scale?: number
          applied_scale?: number
          var_95_inr?: number
          var_capped?: boolean
        }
        status: string | null
      }>('/api/auto-trader/plan/today'),

    killSwitch: () =>
      request<{ success: boolean; message: string }>('/api/trades/kill-switch', {
        method: 'POST',
      }),
  },

  // PR 29 — AI Portfolio (F5 AI SIP Elite)
  aiPortfolio: {
    status: () =>
      request<{
        enabled: boolean
        holdings_count: number
        last_rebalanced_at: string | null
        next_rebalance_at: string
        top_position: { symbol: string; target_weight: number } | null
        notes: string[]
      }>('/api/ai-portfolio/status'),

    holdings: () =>
      request<
        Array<{
          symbol: string
          target_weight: number
          current_weight: number | null
          qty: number
          last_rebalanced_at: string | null
          drift_pct: number | null
          sector: string | null
        }>
      >('/api/ai-portfolio/holdings'),

    toggle: (enabled: boolean) =>
      request<{ enabled: boolean; ok: boolean }>('/api/ai-portfolio/toggle', {
        method: 'POST',
        body: { enabled },
      }),

    proposal: () =>
      request<{
        as_of: string
        n_candidates: number
        n_positions: number
        weights: Record<string, number>
        forecasts_used: Record<string, number>
        metrics: Record<string, any>
        notes: string[]
      }>('/api/ai-portfolio/proposal'),

    previewRebalance: () =>
      request<{
        as_of: string
        n_candidates: number
        n_positions: number
        weights: Record<string, number>
        forecasts_used: Record<string, number>
        metrics: Record<string, any>
        notes: string[]
      }>('/api/ai-portfolio/rebalance/preview', { method: 'POST' }),
  },

  // PR 30 — F&O strategies (F6 Elite)
  foStrategies: {
    overview: () =>
      request<{
        as_of: string
        regime: {
          name: 'bull' | 'sideways' | 'bear'
          prob_bull: number | null
          prob_sideways: number | null
          prob_bear: number | null
        } | null
        vix: {
          current: number | null
          forecast_p50_5d: number | null
          direction: 'rising' | 'falling' | 'stable'
          p10: number | null
          p90: number | null
          forecast_date: string | null
        }
        symbols: string[]
        recommendations: Record<string, Array<FoStrategyProposal>>
      }>('/api/fo-strategies/overview'),

    recommend: (symbol: string) =>
      request<{
        symbol: string
        spot: number
        regime: string
        vix_direction: string
        vix_level: number | null
        recommendations: FoStrategyProposal[]
      }>(`/api/fo-strategies/recommend/${symbol}`),

    price: (body: { strategy: string; symbol: string; expiry?: string }) =>
      request<FoStrategyProposal>('/api/fo-strategies/price', {
        method: 'POST',
        body,
      }),
  },

  // PR 31 — Earnings predictor (F9)
  earnings: {
    upcoming: (days = 14) =>
      request<
        Array<{
          symbol: string
          announce_date: string
          beat_prob: number | null
          confidence: 'low' | 'medium' | 'high' | null
          direction: 'bullish' | 'bearish' | 'non_directional' | null
          thesis: string | null
          evidence: Record<string, any>
        }>
      >('/api/earnings/upcoming', { query: { days } }),

    symbol: (symbol: string) =>
      request<{
        symbol: string
        announce_date: string
        beat_prob: number | null
        confidence: 'low' | 'medium' | 'high' | null
        direction: 'bullish' | 'bearish' | 'non_directional' | null
        thesis: string | null
        evidence: Record<string, any>
        computed_at?: string
      }>(`/api/earnings/symbol/${symbol}`),

    strategy: (symbol: string) =>
      request<{
        symbol: string
        announce_date: string
        beat_prob: number
        confidence: 'low' | 'medium' | 'high' | null
        evidence: Record<string, any>
        strategy: {
          thesis: string
          direction: 'bullish' | 'bearish' | 'non_directional'
          strategy: string | null
          strategy_name: string | null
          legs: Array<{
            action: 'BUY' | 'SELL'
            option_type: 'CE' | 'PE'
            strike: number
            expiry: string
            premium: number
            delta: number
            gamma: number
            theta: number
            vega: number
            iv: number
          }> | null
          max_profit: number | null
          max_loss: number | null
          breakevens: number[]
          probability_of_profit: number | null
          expiry: string | null
          notes: string[]
        }
      }>(`/api/earnings/strategy/${symbol}`),

    forcePredict: (symbol: string, announce_date?: string) =>
      request<{
        symbol: string
        announce_date: string
        beat_prob: number
        confidence: 'low' | 'medium' | 'high' | null
        evidence: Record<string, any>
      }>(`/api/earnings/predict/${symbol}`, {
        method: 'POST',
        query: announce_date ? { announce_date } : undefined,
      }),
  },

  // PR 32 — Sector rotation (F10 Pro)
  sectorRotation: {
    overview: () =>
      request<{
        as_of: string | null
        trade_date: string | null
        sectors: Array<{
          sector: string
          trade_date: string
          momentum_score: number
          fii_flow_7d: number | null
          dii_flow_7d: number | null
          rotating: 'in' | 'out' | 'neutral'
          top_stocks: string[]
          constituent_count: number
          mean_rank_norm: number
        }>
        canonical_order: string[]
        counts: { in: number; out: number; neutral: number }
        note?: string
      }>('/api/sector-rotation/overview'),

    sector: (name: string) =>
      request<{
        sector: string
        trade_date: string
        snapshot: {
          sector: string
          trade_date: string
          momentum_score: number
          fii_flow_7d: number | null
          dii_flow_7d: number | null
          rotating: 'in' | 'out' | 'neutral'
          top_stocks: string[]
          constituent_count: number
          mean_rank_norm: number
        }
        top_stocks: Array<{
          symbol: string
          qlib_rank: number | null
          qlib_score_raw: number | null
          quality_score: number | null
        }>
      }>(`/api/sector-rotation/sector/${encodeURIComponent(name)}`),

    flows: (days = 7) =>
      request<{
        days: number
        series: Array<{
          trade_date: string
          fii_net: number | null
          dii_net: number | null
        }>
      }>('/api/sector-rotation/flows', { query: { days } }),

    refresh: () =>
      request<{ trade_date: string | null; n_sectors_written: number }>(
        '/api/sector-rotation/refresh',
        { method: 'POST' },
      ),
  },

  // PR 33 — AI Dossier (per-stock consolidated engine output)
  dossier: {
    get: (symbol: string) =>
      request<{
        symbol: string
        as_of: string
        spot: number | null
        tier: 'free' | 'pro' | 'elite'
        consensus: 'bullish' | 'bearish' | 'mixed' | 'neutral'
        engines: Array<DossierEngineBlock>
        debate_available: boolean
        latest_signal: {
          id: string | null
          direction: string | null
          entry_price: number | null
          stop_loss: number | null
          target: number | null
          created_at: string | null
          explanation_text: string | null
        } | null
      }>(`/api/dossier/${symbol}`),
  },

  // PR 34 — Portfolio Doctor (F7, Pro+)
  portfolioDoctor: {
    analyze: (body: {
      source?: 'manual' | 'broker' | 'csv'
      capital?: number
      positions: Array<{
        symbol: string
        weight: number
        qty?: number
        entry_price?: number
        current_price?: number
      }>
    }) =>
      request<DoctorReport>('/api/portfolio/doctor/analyze', {
        method: 'POST',
        body,
      }),

    quota: () =>
      request<{
        tier: 'free' | 'pro' | 'elite'
        runs_this_month: number
        quota: number | null
        remaining: number | null
        engine: string
      }>('/api/portfolio/doctor/quota'),

    reports: (limit = 20) =>
      request<
        Array<{
          id: string
          created_at: string
          source: 'manual' | 'broker' | 'csv'
          position_count: number
          composite_score: number
          action: string
        }>
      >('/api/portfolio/doctor/reports', { query: { limit } }),

    report: (id: string) =>
      request<DoctorReport>(`/api/portfolio/doctor/reports/${id}`),
  },

  // PR 37 — Onboarding risk-profile quiz (N5)
  onboarding: {
    quiz: () =>
      request<{
        quiz: Array<{
          key: string
          question: string
          options: Array<{ value: string; label: string; score: number }>
        }>
      }>('/api/onboarding/quiz', { auth: false }),

    status: () =>
      request<{
        completed: boolean
        completed_at: string | null
        current_tier: 'free' | 'pro' | 'elite'
        current_risk_profile: 'conservative' | 'moderate' | 'aggressive' | null
        recommended_tier: 'free' | 'pro' | 'elite' | null
      }>('/api/onboarding/status'),

    submit: (answers: Record<string, string>) =>
      request<{
        risk_profile: 'conservative' | 'moderate' | 'aggressive'
        recommended_tier: 'free' | 'pro' | 'elite'
        score: number
        rationale: string
        suggested_filters: Record<string, any>
        auto_trader_defaults: Record<string, any>
      }>('/api/onboarding/quiz', { method: 'POST', body: { answers } }),

    skip: () =>
      request<{ completed: boolean; skipped: boolean }>('/api/onboarding/skip', {
        method: 'POST',
      }),
  },

  // PR 55 — Telegram connect flow (onboarding activation funnel)
  telegram: {
    linkStart: () =>
      request<{
        token: string
        bot_username: string | null
        deep_link: string | null
        expires_at: string
      }>('/api/telegram/link/start', { method: 'POST' }),

    linkStatus: () =>
      request<{
        connected: boolean
        chat_id: string | null
        linked_at: string | null
      }>('/api/telegram/link/status'),

    disconnect: () =>
      request<{ connected: boolean }>('/api/telegram/link/disconnect', {
        method: 'POST',
      }),
  },

  // PR 60 — F12 WhatsApp digest (Pro tier)
  whatsapp: {
    status: () =>
      request<{
        phone: string | null
        verified: boolean
        digest_enabled: boolean
        provider_configured: boolean
      }>('/api/whatsapp/link/status'),

    linkStart: (phone: string) =>
      request<{
        phone: string
        expires_at: string
        provider_configured: boolean
        delivered: boolean
      }>('/api/whatsapp/link/start', { method: 'POST', body: { phone } }),

    linkVerify: (code: string) =>
      request<{ verified: boolean }>('/api/whatsapp/link/verify', {
        method: 'POST',
        body: { code },
      }),

    disconnect: () =>
      request<{
        phone: string | null
        verified: boolean
        digest_enabled: boolean
        provider_configured: boolean
      }>('/api/whatsapp/link/disconnect', { method: 'POST' }),

    toggleDigest: (enabled: boolean) =>
      request<{
        phone: string | null
        verified: boolean
        digest_enabled: boolean
        provider_configured: boolean
      }>('/api/whatsapp/digest/toggle', { method: 'POST', body: { enabled } }),
  },

  // PR 38 — Weekly portfolio review (N10 Pro+)
  weeklyReview: {
    latest: () =>
      request<{
        week_of: string
        content_markdown: string
        week_return_pct: number | null
        nifty_return_pct: number | null
        generated_at: string
      }>('/api/weekly-review/latest'),

    history: (limit = 8) =>
      request<
        Array<{
          week_of: string
          content_markdown: string
          week_return_pct: number | null
          nifty_return_pct: number | null
          generated_at: string
        }>
      >('/api/weekly-review/history', { query: { limit } }),

    generate: () =>
      request<{
        week_of: string
        content_markdown: string
        week_return_pct: number | null
        nifty_return_pct: number | null
        generated_at: string
      }>('/api/weekly-review/generate', { method: 'POST' }),
  },

  // PR 40 — Alerts Studio (N11 Pro)
  alerts: {
    preferences: () =>
      request<{
        preferences: Record<string, Record<string, boolean>>
        events: Array<{ key: string; label: string; description: string }>
        channels: Array<{
          channel: 'push' | 'telegram' | 'whatsapp' | 'email'
          connected: boolean
          detail?: string | null
        }>
      }>('/api/alerts/preferences'),

    toggle: (event: string, channel: 'push' | 'telegram' | 'whatsapp' | 'email', enabled: boolean) =>
      request<{
        preferences: Record<string, Record<string, boolean>>
        events: Array<{ key: string; label: string; description: string }>
        channels: Array<{
          channel: 'push' | 'telegram' | 'whatsapp' | 'email'
          connected: boolean
          detail?: string | null
        }>
      }>('/api/alerts/preferences', {
        method: 'PATCH',
        body: { toggle: { event, channel, enabled } },
      }),

    bulkUpdate: (preferences: Record<string, Record<string, boolean>>) =>
      request<{
        preferences: Record<string, Record<string, boolean>>
        events: Array<{ key: string; label: string; description: string }>
        channels: Array<{
          channel: 'push' | 'telegram' | 'whatsapp' | 'email'
          connected: boolean
          detail?: string | null
        }>
      }>('/api/alerts/preferences', {
        method: 'PATCH',
        body: { bulk: { preferences } },
      }),

    test: (channel: 'push' | 'telegram' | 'whatsapp' | 'email') =>
      request<{ delivered: boolean; channel: string; detail: string }>(
        '/api/alerts/test',
        { method: 'POST', body: { channel } },
      ),
  },

  // PR 42 — Referral loop (N12)
  referrals: {
    status: () =>
      request<{
        code: string
        share_url: string
        stats: {
          invited: number
          signed_up: number
          rewarded: number
          pending: number
          credit_months: number
        }
        recent: Array<{
          id: string
          referred_email: string | null
          referred_user_id: string | null
          status: 'pending' | 'signed_up' | 'rewarded' | 'expired'
          created_at: string
          signed_up_at: string | null
          rewarded_at: string | null
        }>
      }>('/api/referrals/status'),

    rotateCode: () =>
      request<{
        code: string
        share_url: string
        stats: {
          invited: number
          signed_up: number
          rewarded: number
          pending: number
          credit_months: number
        }
        recent: Array<any>
      }>('/api/referrals/rotate-code', { method: 'POST' }),

    resolve: (code: string) =>
      request<{ valid: boolean; referrer_id?: string }>(
        `/api/referrals/resolve/${encodeURIComponent(code)}`,
        { auth: false },
      ),

    attribute: (body: { referred_user_id: string; code: string; referred_email?: string }) =>
      request<{ attributed: boolean; reason?: string; referrer_id?: string }>(
        '/api/referrals/attribute',
        { method: 'POST', auth: false, body },
      ),
  },

  payments: {
    getPlans: () => request<{ plans: Array<Record<string, any>> }>('/api/plans', { auth: false }),
    createOrder: (planId: string, billingPeriod: string) =>
      request<{ order_id: string; amount: number; currency: string; key_id: string }>('/api/payments/create-order', {
        method: 'POST',
        body: { plan_id: planId, billing_period: billingPeriod },
      }),
    verify: (data: { order_id: string; payment_id: string; signature: string }) =>
      request<{ success: boolean; subscription_status: string }>('/api/payments/verify', {
        method: 'POST',
        body: data,
      }),
  },

  marketplace: {
    getStrategies: (filters?: {
      category?: string
      segment?: string
      risk_level?: string
      tier?: string
      search?: string
      sort_by?: string
    }) =>
      request<{
        success: boolean
        strategies: StrategyCatalog[]
        total: number
        category_counts: Record<string, number>
      }>('/api/marketplace/strategies', { query: filters as Record<string, string>, auth: false }),

    getStrategy: (slug: string) =>
      request<{ success: boolean; strategy: StrategyCatalog }>(
        `/api/marketplace/strategies/${slug}`,
        { auth: false },
      ),

    getBacktest: (slug: string) =>
      request<{ success: boolean; backtest: StrategyBacktest | null; summary?: Record<string, unknown> }>(
        `/api/marketplace/strategies/${slug}/backtest`,
        { auth: false },
      ),

    deploy: (data: {
      strategy_slug: string
      allocated_capital: number
      max_positions: number
      trade_mode: string
      custom_params: Record<string, unknown>
    }) =>
      request<{ success: boolean; deployment: StrategyDeployment; message: string }>(
        '/api/marketplace/deploy',
        { method: 'POST', body: data },
      ),

    getMyStrategies: () =>
      request<{ success: boolean; deployments: StrategyDeployment[]; total: number }>(
        '/api/marketplace/my-strategies',
      ),

    updateDeployment: (deploymentId: string, data: Record<string, unknown>) =>
      request<{ success: boolean; deployment: StrategyDeployment }>(
        `/api/marketplace/deployments/${deploymentId}`,
        { method: 'PUT', body: data },
      ),

    deactivateDeployment: (deploymentId: string) =>
      request<{ success: boolean; message: string }>(
        `/api/marketplace/deployments/${deploymentId}`,
        { method: 'DELETE' },
      ),
  },

  screener: {
    getCategories: () =>
      request<{ success: boolean; categories: Record<string, any>; total_scanners: number }>('/api/screener/pk/categories', { auth: false }),
    runScan: (scannerId: number, universe = 'nifty500', limit = 50) =>
      request<{ success: boolean; results: Array<Record<string, any>> }>('/api/screener/pk/scan/batch', {
        method: 'POST',
        query: { scanner_id: scannerId, universe, limit },
        auth: false,
      }),
    getSwingCandidates: (limit = 30) =>
      request<{ success: boolean; results: Array<Record<string, any>> }>('/api/screener/swing-candidates', {
        query: { limit },
        auth: false,
      }),
    getLivePrices: (symbols: string[]) =>
      request<{ success: boolean; prices: Array<Record<string, any>> }>('/api/screener/prices/live', {
        query: { symbols: symbols.join(',') },
        auth: false,
      }),
    getStockPrice: (symbol: string) =>
      request<Record<string, any>>(`/api/screener/prices/${symbol}`, { auth: false }),
    getTechnicals: (symbol: string) =>
      request<Record<string, any>>(`/api/screener/technicals/${symbol}`, { auth: false }),
    getAI: (endpoint: string) =>
      request<Record<string, any>>(endpoint, { auth: false }),
  },

  // PR 19 — paper trading v2 endpoints
  paper: {
    getEquityCurve: (days = 90) =>
      request<{
        days: number
        initial_equity: number
        latest: {
          snapshot_date: string
          equity: number
          cash: number
          invested: number
          drawdown_pct: number | null
          nifty_close: number | null
        } | null
        points: Array<{
          snapshot_date: string
          equity: number
          cash: number
          invested: number
          drawdown_pct: number | null
          nifty_close: number | null
          return_pct: number
          nifty_pct: number
        }>
      }>('/api/paper/v2/equity-curve', { query: { days } }),
    getLeague: (weeks = 1) =>
      request<{
        weeks: number
        top_20: Array<{
          rank: number
          handle: string
          return_pct: number
          final_equity: number
          snapshots: number
        }>
        computed_at: string
      }>('/api/paper/v2/league', { auth: false, query: { weeks } }),
    getAchievements: () =>
      request<{
        streak_days: number
        trade_count: number
        days_trading: number
        total_return_pct: number
        current_equity: number
        badges: Array<{ key: string; label: string; tier: 'bronze' | 'silver' | 'gold' }>
        go_live_eligible: boolean
      }>('/api/paper/v2/achievements'),
  },

  admin: {
    getSystemHealth: () => request<Record<string, any>>('/api/admin/system/health'),
    getPaymentStats: (days = 30) =>
      request<Record<string, any>>('/api/admin/payments/stats', { query: { days } }),
    getSignalStats: (days = 30) =>
      request<Record<string, any>>('/api/admin/signals/stats', { query: { days } }),
    getUsers: (params?: { page?: number; page_size?: number; search?: string; subscription_status?: string; is_suspended?: string }) =>
      request<Record<string, any>>('/api/admin/users', { query: params as Record<string, string> }),
    getUser: (userId: string) => request<Record<string, any>>(`/api/admin/users/${userId}`),
    suspendUser: (userId: string) =>
      request<Record<string, any>>(`/api/admin/users/${userId}/suspend`, { method: 'POST' }),
    unsuspendUser: (userId: string) =>
      request<Record<string, any>>(`/api/admin/users/${userId}/unsuspend`, { method: 'POST' }),
    banUser: (userId: string) =>
      request<Record<string, any>>(`/api/admin/users/${userId}/ban`, { method: 'POST' }),
    resetSubscription: (userId: string) =>
      request<Record<string, any>>(`/api/admin/users/${userId}/reset-subscription`, { method: 'POST' }),
    exportUsers: () => request<string>('/api/admin/users/export/csv'),
    getPayments: (params?: { page?: number; page_size?: number; status?: string }) =>
      request<Record<string, any>>('/api/admin/payments', { query: params as Record<string, string> }),
    getMLPerformance: () => request<Record<string, any>>('/api/admin/ml/performance'),
    getMLRegime: () => request<Record<string, any>>('/api/admin/ml/regime'),
    // PR 43 — Admin drift monitoring
    getMLDrift: (windowDays = 30) =>
      request<{
        window_days: number
        models: Array<{
          model_name: string
          window_days: number
          win_rate: number | null
          avg_pnl_pct: number | null
          signal_count: number
          directional_accuracy: number | null
          sharpe_ratio: number | null
          max_drawdown_pct: number | null
          computed_at: string
        }>
        drifted: Array<{
          model_name: string
          win_rate: number | null
          signal_count: number
          computed_at: string
        }>
        drift_threshold: number
        computed_at: string
      }>('/api/admin/ml/drift', { query: { window_days: windowDays } }),
    retrain: (model?: string) =>
      request<Record<string, any>>('/api/admin/ml/retrain', { method: 'POST', query: model ? { model } : undefined }),
    triggerScan: () => request<Record<string, any>>('/api/admin/scan/trigger', { method: 'POST' }),
    seedDemo: () => request<Record<string, any>>('/api/admin/scan/seed-demo', { method: 'POST' }),

    // PR 47 — N9 Command Center expansions
    getSchedulerJobs: (params?: { job_id?: string; status?: string; limit?: number }) =>
      request<{
        rows: Array<{
          id: string
          job_id: string
          started_at: string
          finished_at: string | null
          status: 'ok' | 'failed' | 'skipped'
          err_msg: string | null
          items_processed: number | null
          metadata: Record<string, any> | null
        }>
        latest_by_job: Array<{
          job_id: string
          started_at: string
          status: 'ok' | 'failed' | 'skipped'
          items_processed: number | null
          err_msg: string | null
        }>
        count: number
        computed_at: string
      }>('/api/admin/scheduler/jobs', { query: params as Record<string, string> | undefined }),

    getGlobalKillSwitch: () =>
      request<{
        active: boolean
        reason: string | null
        updated_by: string | null
        updated_at: string | null
        description?: string | null
      }>('/api/admin/system/global-kill-switch'),

    setGlobalKillSwitch: (active: boolean, reason?: string | null) =>
      request<{
        active: boolean
        reason: string | null
        updated_by: string | null
        updated_at: string | null
      }>('/api/admin/system/global-kill-switch', {
        method: 'POST',
        body: { active, reason: reason ?? null },
      }),

    // PR 49 — admin audit log viewer
    getAuditLog: (params?: {
      actor_id?: string
      action?: string
      target_type?: string
      target_id?: string
      limit?: number
    }) =>
      request<{
        rows: Array<{
          id: string
          actor_id: string | null
          actor_email: string | null
          action: string
          target_type: string
          target_id: string | null
          payload: Record<string, any> | null
          ip_address: string | null
          user_agent: string | null
          created_at: string
        }>
        count: number
        actions: string[]
        computed_at: string
      }>('/api/admin/audit-log', { query: params as Record<string, string> | undefined }),

    // PR 129 — unified training pipeline
    listTrainers: () =>
      request<{
        trainers: Array<{ name: string; requires_gpu: boolean; depends_on: string[] }>
        count: number
      }>('/api/admin/training/trainers'),
    listTrainingRuns: () =>
      request<{
        runs: Array<{
          run_id: string
          status: 'running' | 'ok' | 'partial' | 'failed'
          started_at: string
          finished_at: string | null
          triggered_by: string
          params: { only?: string[] | null; skip_gpu?: boolean; promote?: boolean; dry_run?: boolean }
          reports: Array<{
            name: string
            status: 'ok' | 'skipped' | 'failed'
            duration_sec: number
            metrics: Record<string, any>
            error: string | null
            version: number | null
            promoted: boolean
          }>
          error: string | null
        }>
        last_versions: Array<{
          model_name: string
          version: number
          trained_at: string
          trained_by: string | null
          metrics: Record<string, any>
          is_prod: boolean
          is_shadow: boolean
        }>
      }>('/api/admin/training/runs'),
    triggerTrainingRun: (body: {
      only?: string[]
      skip_gpu?: boolean
      promote?: boolean
      dry_run?: boolean
    }) =>
      request<{ run_id: string; status: string; started_at: string }>(
        '/api/admin/training/run',
        { method: 'POST', body },
      ),
  },
}
