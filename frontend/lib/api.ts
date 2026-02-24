import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantUsageResponse,
  DashboardOverview,
  Notification,
  Position,
  Signal,
  SignalFilters,
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

  const response = await fetch(`${API_BASE}${buildPath(path, query)}`, {
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

export const api = {
  user: {
    getProfile: () => request<Record<string, any>>('/api/user/profile'),
    updateProfile: (data: Record<string, any>) =>
      request<{ success: boolean; data?: Record<string, any> }>('/api/user/profile', {
        method: 'PUT',
        body: data,
      }),
    getStats: () => request<UserStats>('/api/user/stats'),
  },

  dashboard: {
    getOverview: () => request<DashboardOverview>('/api/dashboard/overview'),
  },

  assistant: {
    getUsage: () => request<AssistantUsageResponse>('/api/assistant/usage'),
    chat: (data: AssistantChatRequest) =>
      request<AssistantChatResponse>('/api/assistant/chat', {
        method: 'POST',
        body: {
          message: data.message,
          history: data.history || [],
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
    connect: (data: Record<string, any>) =>
      request<{ success: boolean; broker?: string }>('/api/broker/connect', {
        method: 'POST',
        body: data,
      }),
    disconnect: () =>
      request<{ success: boolean }>('/api/broker/disconnect', {
        method: 'POST',
      }),
    initiateOAuth: (broker: string) =>
      request<{ auth_url: string; state: string }>(`/api/broker/${broker}/auth/initiate`, {
        method: 'POST',
      }),
    getPositions: () => request<{ positions: Array<Record<string, any>> }>('/api/broker/positions'),
    getHoldings: () => request<{ holdings: Array<Record<string, any>> }>('/api/broker/holdings'),
    getMargin: () =>
      request<{ available_margin: number; used_margin: number }>('/api/broker/margin'),
  },
}
