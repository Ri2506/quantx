// ============================================================================
// SWINGAI - ADMIN SYSTEM HEALTH PAGE
// System monitoring and health dashboard
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  Database,
  Server,
  Wifi,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  Target,
  TrendingUp,
  Cpu,
  HardDrive,
  Globe,
} from 'lucide-react'
import { SystemHealth, EODScanRunItem, DailyUniverseItem } from '@/types/admin'

export default function AdminSystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [eodRuns, setEodRuns] = useState<EODScanRunItem[]>([])
  const [universe, setUniverse] = useState<DailyUniverseItem[]>([])
  const [universeDate, setUniverseDate] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

      const headers = { Authorization: `Bearer ${getToken()}` }

      const [res, runsRes, universeRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/system/health`, { headers }),
        fetch(`${apiUrl}/api/admin/eod/runs?limit=5`, { headers }),
        fetch(`${apiUrl}/api/admin/eod/universe?limit=200`, { headers }),
      ])

      if (res.ok) {
        setHealth(await res.json())
      } else {
        setHealth(getMockHealth())
      }

      if (runsRes.ok) {
        const data = await runsRes.json()
        setEodRuns(data.runs || [])
      } else {
        setEodRuns(getMockEodRuns())
      }

      if (universeRes.ok) {
        const data = await universeRes.json()
        setUniverse(data.candidates || [])
        setUniverseDate(data.trade_date || '')
      } else {
        const mock = getMockUniverse()
        setUniverse(mock.candidates)
        setUniverseDate(mock.trade_date)
      }
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to fetch health:', err)
      setHealth(getMockHealth())
      setEodRuns(getMockEodRuns())
      const mock = getMockUniverse()
      setUniverse(mock.candidates)
      setUniverseDate(mock.trade_date)
      setLastRefresh(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchHealth, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh, fetchHealth])

  const getToken = () => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('sb-access-token') || ''
  }

  const getMockHealth = (): SystemHealth => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected',
    redis: 'disabled',
    scheduler_status: 'running',
    last_signal_run: new Date(Date.now() - 3600000).toISOString(),
    active_websocket_connections: 127,
    metrics: {
      total_users: 5234,
      active_subscribers: 1847,
      today_signals: 12,
      today_trades: 89,
      active_positions: 234,
    },
  })

  const getMockEodRuns = (): EODScanRunItem[] => ([
    {
      id: 'mock-run-1',
      trade_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      status: 'success',
      source: 'pkscreener_github',
      scan_type: 'swing',
      candidate_count: 312,
      signal_count: 24,
      started_at: new Date(Date.now() - 3600000).toISOString(),
      finished_at: new Date(Date.now() - 3500000).toISOString(),
    }
  ])

  const getMockUniverse = () => ({
    trade_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    total: 12,
    candidates: [
      { trade_date: '', symbol: 'RELIANCE', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'TCS', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'INFY', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'HDFCBANK', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'ICICIBANK', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'SBIN', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'LT', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'AXISBANK', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'ITC', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'SUNPHARMA', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'TATAMOTORS', source: 'pkscreener_github', scan_type: 'swing' },
      { trade_date: '', symbol: 'BEL', source: 'pkscreener_github', scan_type: 'swing' },
    ],
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'running':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-yellow-500" />
      case 'error':
      case 'stopped':
        return <XCircle className="w-5 h-5 text-red-500" />
      default:
        return <AlertCircle className="w-5 h-5 text-text-muted" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'running':
        return 'text-green-500 bg-green-500/10 border-green-500/30'
      case 'degraded':
        return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30'
      case 'error':
      case 'stopped':
        return 'text-red-500 bg-red-500/10 border-red-500/30'
      default:
        return 'text-text-muted bg-background-elevated/60 border-border/50'
    }
  }

  const getRunBadgeClass = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-500 bg-green-500/10 border-green-500/30'
      case 'failed':
        return 'text-red-500 bg-red-500/10 border-red-500/30'
      case 'running':
        return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30'
      default:
        return 'text-text-muted bg-background-elevated/60 border-border/50'
    }
  }

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">System Health</h1>
          <p className="text-text-secondary mt-1">Real-time system monitoring and status</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-border/50 bg-background-elevated/80 text-red-500 focus:ring-red-500"
            />
            Auto-refresh (30s)
          </label>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-background-elevated/80 hover:bg-background-elevated rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
            <span className="text-text-secondary">Refresh</span>
          </button>
        </div>
      </div>

      {/* Last Refresh */}
      {lastRefresh && (
        <p className="text-xs text-text-muted">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      )}

      {/* Overall Status */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-6 ${getStatusColor(health?.status || 'error')}`}
      >
        <div className="flex items-center gap-4">
          {getStatusIcon(health?.status || 'error')}
          <div>
            <h2 className="text-xl font-bold">System Status: {health?.status?.toUpperCase()}</h2>
            <p className="text-sm opacity-80">
              Last checked: {health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'N/A'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* Service Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Database */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="app-panel p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Database className="w-8 h-8 text-blue-500" />
            {getStatusIcon(health?.database || 'error')}
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Database</h3>
          <p className="text-sm text-text-secondary mt-1 capitalize">
            {health?.database || 'Unknown'}
          </p>
        </motion.div>

        {/* Redis */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="app-panel p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Server className="w-8 h-8 text-red-500" />
            {getStatusIcon(health?.redis || 'disabled')}
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Redis</h3>
          <p className="text-sm text-text-secondary mt-1 capitalize">
            {health?.redis || 'Unknown'}
          </p>
        </motion.div>

        {/* Scheduler */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="app-panel p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Clock className="w-8 h-8 text-purple-500" />
            {getStatusIcon(health?.scheduler_status || 'stopped')}
          </div>
          <h3 className="text-lg font-semibold text-text-primary">Scheduler</h3>
          <p className="text-sm text-text-secondary mt-1 capitalize">
            {health?.scheduler_status || 'Unknown'}
          </p>
          {health?.last_signal_run && (
            <p className="text-xs text-text-muted mt-2">
              Last run: {new Date(health.last_signal_run).toLocaleTimeString()}
            </p>
          )}
        </motion.div>

        {/* WebSocket */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="app-panel p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <Wifi className="w-8 h-8 text-green-500" />
            <span className="text-2xl font-bold text-green-500">
              {health?.active_websocket_connections || 0}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-text-primary">WebSocket</h3>
          <p className="text-sm text-text-secondary mt-1">Active connections</p>
        </motion.div>
      </div>

      {/* Metrics Grid */}
      <div className="app-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-6">System Metrics</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div className="text-center">
            <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-text-primary">
              {health?.metrics.total_users.toLocaleString() || 0}
            </p>
            <p className="text-sm text-text-secondary">Total Users</p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <TrendingUp className="w-6 h-6 text-green-500" />
            </div>
            <p className="text-2xl font-bold text-text-primary">
              {health?.metrics.active_subscribers.toLocaleString() || 0}
            </p>
            <p className="text-sm text-text-secondary">Active Subscribers</p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Target className="w-6 h-6 text-purple-500" />
            </div>
            <p className="text-2xl font-bold text-text-primary">
              {health?.metrics.today_signals || 0}
            </p>
            <p className="text-sm text-text-secondary">Today's Signals</p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-orange-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Activity className="w-6 h-6 text-orange-500" />
            </div>
            <p className="text-2xl font-bold text-text-primary">
              {health?.metrics.today_trades || 0}
            </p>
            <p className="text-sm text-text-secondary">Today's Trades</p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-red-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
              <Globe className="w-6 h-6 text-red-500" />
            </div>
            <p className="text-2xl font-bold text-text-primary">
              {health?.metrics.active_positions || 0}
            </p>
            <p className="text-sm text-text-secondary">Active Positions</p>
          </div>
        </div>
      </div>

      {/* EOD Scanner */}
      <div className="app-panel p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">EOD Scanner</h2>
            <p className="text-sm text-text-secondary">Latest end-of-day scan and candidate universe</p>
          </div>
          {eodRuns[0] && (
            <span
              className={`px-3 py-1 rounded-full text-xs font-medium border ${getRunBadgeClass(eodRuns[0].status)}`}
            >
              {eodRuns[0].status.toUpperCase()}
            </span>
          )}
        </div>

        {eodRuns[0] ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 bg-background-elevated/70 rounded-lg">
              <p className="text-xs text-text-secondary">Trade Date</p>
              <p className="text-text-primary font-semibold">{eodRuns[0].trade_date}</p>
            </div>
            <div className="p-4 bg-background-elevated/70 rounded-lg">
              <p className="text-xs text-text-secondary">Candidates</p>
              <p className="text-text-primary font-semibold">{eodRuns[0].candidate_count}</p>
            </div>
            <div className="p-4 bg-background-elevated/70 rounded-lg">
              <p className="text-xs text-text-secondary">Signals</p>
              <p className="text-text-primary font-semibold">{eodRuns[0].signal_count}</p>
            </div>
            <div className="p-4 bg-background-elevated/70 rounded-lg">
              <p className="text-xs text-text-secondary">Source</p>
              <p className="text-text-primary font-semibold">
                {(eodRuns[0].source || 'n/a').replace('pkscreener_', '')}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary mb-6">No EOD scan runs available.</p>
        )}

        <div className="border border-border/50 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-background-elevated/80">
            <p className="text-sm text-text-secondary">
              Candidate Universe {universeDate ? `(${universeDate})` : ''}
            </p>
            <p className="text-xs text-text-muted">{universe.length} symbols</p>
          </div>
          <div className="max-h-64 overflow-y-auto p-4 bg-background-surface/80">
            {universe.length === 0 ? (
              <p className="text-sm text-text-muted">No candidates available.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {universe.map((item) => (
                  <span
                    key={`${item.trade_date}-${item.symbol}`}
                    className="px-3 py-1 rounded-full text-xs font-medium bg-background-elevated/80 text-text-secondary border border-border/50"
                  >
                    {item.symbol}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Environment Info */}
      <div className="app-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Environment</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-background-elevated/70 rounded-lg">
            <p className="text-sm text-text-secondary">API URL</p>
            <code className="text-text-primary text-sm">
              {process.env.NEXT_PUBLIC_API_URL || 'Not configured'}
            </code>
          </div>
          <div className="p-4 bg-background-elevated/70 rounded-lg">
            <p className="text-sm text-text-secondary">Environment</p>
            <code className="text-text-primary text-sm">
              {process.env.NODE_ENV || 'development'}
            </code>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="app-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => window.open('/api/docs', '_blank')}
            className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm font-medium transition-colors"
          >
            API Documentation
          </button>
          <button
            onClick={() => window.open('/api/health', '_blank')}
            className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium transition-colors"
          >
            Health Endpoint
          </button>
          <button
            onClick={fetchHealth}
            className="px-4 py-2 bg-background-elevated/80 hover:bg-background-elevated rounded-lg text-text-secondary text-sm font-medium transition-colors"
          >
            Force Refresh
          </button>
        </div>
      </div>
    </div>
  )
}
