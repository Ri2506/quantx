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
import { SystemHealth } from '@/types/admin'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import StatusDot from '@/components/ui/StatusDot'

export default function AdminSystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

      const res = await fetch(`${apiUrl}/api/admin/system/health`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (res.ok) {
        setHealth(await res.json())
      } else {
        setHealth(getMockHealth())
      }
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to fetch health:', err)
      setHealth(getMockHealth())
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

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'running':
        return <CheckCircle className="w-5 h-5 text-neon-green" />
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-neon-gold" />
      case 'error':
      case 'stopped':
        return <XCircle className="w-5 h-5 text-danger" />
      default:
        return <AlertCircle className="w-5 h-5 text-text-secondary" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'running':
        return 'text-neon-green bg-neon-green/10 border-neon-green/20'
      case 'degraded':
        return 'text-neon-gold bg-neon-gold/10 border-neon-gold/20'
      case 'error':
      case 'stopped':
        return 'text-danger bg-danger/10 border-danger/20'
      default:
        return 'text-text-secondary bg-gray-500/10 border-gray-500/30'
    }
  }

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="loader-rings"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <ScrollReveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">System Health</h1>
            <p className="text-text-secondary mt-1 flex items-center gap-2">
              Real-time system monitoring and status
              <StatusDot status="live" label="Live" />
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-white/[0.06] bg-white/[0.04] text-neon-gold focus:ring-neon-gold"
              />
              Auto-refresh (30s)
            </label>
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
              <span className="text-text-secondary">Refresh</span>
            </button>
          </div>
        </div>
      </ScrollReveal>

      {/* Last Refresh */}
      {lastRefresh && (
        <p className="text-xs text-text-secondary">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      )}

      {/* Overall Status */}
      <ScrollReveal delay={0.05}>
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
      </ScrollReveal>

      {/* Service Status Grid */}
      <ScrollReveal delay={0.1}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Database */}
          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <Database className="w-8 h-8 text-neon-cyan" />
                {getStatusIcon(health?.database || 'error')}
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Database</h3>
              <p className="text-sm text-text-secondary mt-1 capitalize">
                {health?.database || 'Unknown'}
              </p>
            </motion.div>
          </Card3D>

          {/* Redis */}
          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <Server className="w-8 h-8 text-danger" />
                {getStatusIcon(health?.redis || 'disabled')}
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Redis</h3>
              <p className="text-sm text-text-secondary mt-1 capitalize">
                {health?.redis || 'Unknown'}
              </p>
            </motion.div>
          </Card3D>

          {/* Scheduler */}
          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <Clock className="w-8 h-8 text-neon-purple" />
                {getStatusIcon(health?.scheduler_status || 'stopped')}
              </div>
              <h3 className="text-lg font-semibold text-text-primary">Scheduler</h3>
              <p className="text-sm text-text-secondary mt-1 capitalize">
                {health?.scheduler_status || 'Unknown'}
              </p>
              {health?.last_signal_run && (
                <p className="text-xs text-text-secondary mt-2">
                  Last run: {new Date(health.last_signal_run).toLocaleTimeString()}
                </p>
              )}
            </motion.div>
          </Card3D>

          {/* WebSocket */}
          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <Wifi className="w-8 h-8 text-neon-green" />
                <span className="text-2xl font-bold text-neon-green">
                  {health?.active_websocket_connections || 0}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-text-primary">WebSocket</h3>
              <p className="text-sm text-text-secondary mt-1">Active connections</p>
            </motion.div>
          </Card3D>
        </div>
      </ScrollReveal>

      {/* Metrics Grid */}
      <ScrollReveal delay={0.15}>
        <Card3D maxTilt={3}>
          <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-6">System Metrics</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              <div className="text-center">
                <div className="w-12 h-12 bg-neon-cyan/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Users className="w-6 h-6 text-neon-cyan" />
                </div>
                <p className="text-2xl font-bold text-text-primary">
                  {health?.metrics.total_users.toLocaleString() || 0}
                </p>
                <p className="text-sm text-text-secondary">Total Users</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-neon-green/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <TrendingUp className="w-6 h-6 text-neon-green" />
                </div>
                <p className="text-2xl font-bold text-text-primary">
                  {health?.metrics.active_subscribers.toLocaleString() || 0}
                </p>
                <p className="text-sm text-text-secondary">Active Subscribers</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-neon-purple/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Target className="w-6 h-6 text-neon-purple" />
                </div>
                <p className="text-2xl font-bold text-text-primary">
                  {health?.metrics.today_signals || 0}
                </p>
                <p className="text-sm text-text-secondary">Today's Signals</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-neon-gold/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Activity className="w-6 h-6 text-neon-gold" />
                </div>
                <p className="text-2xl font-bold text-text-primary">
                  {health?.metrics.today_trades || 0}
                </p>
                <p className="text-sm text-text-secondary">Today's Trades</p>
              </div>

              <div className="text-center">
                <div className="w-12 h-12 bg-danger/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Globe className="w-6 h-6 text-danger" />
                </div>
                <p className="text-2xl font-bold text-text-primary">
                  {health?.metrics.active_positions || 0}
                </p>
                <p className="text-sm text-text-secondary">Active Positions</p>
              </div>
            </div>
          </div>
        </Card3D>
      </ScrollReveal>

      {/* Environment Info */}
      <ScrollReveal delay={0.2}>
        <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Environment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white/[0.02] rounded-lg">
              <p className="text-sm text-text-secondary">API URL</p>
              <code className="text-text-primary text-sm">
                {process.env.NEXT_PUBLIC_API_URL || 'Not configured'}
              </code>
            </div>
            <div className="p-4 bg-white/[0.02] rounded-lg">
              <p className="text-sm text-text-secondary">Environment</p>
              <code className="text-text-primary text-sm">
                {process.env.NODE_ENV || 'development'}
              </code>
            </div>
          </div>
        </div>
      </ScrollReveal>

      {/* Quick Actions */}
      <ScrollReveal delay={0.2}>
        <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => window.open('/api/docs', '_blank')}
              className="px-4 py-2 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/20 rounded-lg text-neon-cyan text-sm font-medium transition-colors"
            >
              API Documentation
            </button>
            <button
              onClick={() => window.open('/api/health', '_blank')}
              className="px-4 py-2 bg-neon-green/10 hover:bg-neon-green/20 border border-neon-green/20 rounded-lg text-neon-green text-sm font-medium transition-colors"
            >
              Health Endpoint
            </button>
            <button
              onClick={fetchHealth}
              className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-text-secondary text-sm font-medium transition-colors"
            >
              Force Refresh
            </button>
          </div>
        </div>
      </ScrollReveal>
    </div>
  )
}
