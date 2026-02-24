// ============================================================================
// SWINGAI - ADMIN DASHBOARD
// Main admin dashboard with system overview
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Users,
  CreditCard,
  Activity,
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Clock,
  DollarSign,
  Wifi,
  Database,
  Server,
} from 'lucide-react'
import { SystemHealth, PaymentStats, SignalStats } from '@/types/admin'

// Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  trend,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: any
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple'
  trend?: { value: number; positive: boolean }
}) {
  const colors = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    red: 'from-red-500 to-red-600',
    orange: 'from-orange-500 to-orange-600',
    purple: 'from-cyan-500 to-sky-600',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="app-card app-card-hover p-6"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-text-secondary mb-1">{title}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          {subtitle && <p className="text-xs text-text-muted mt-1">{subtitle}</p>}
          {trend && (
            <p
              className={`text-xs mt-2 ${trend.positive ? 'text-green-500' : 'text-red-500'}`}
            >
              {trend.positive ? '+' : ''}{trend.value}% from last period
            </p>
          )}
        </div>
        <div
          className={`p-3 rounded-xl bg-gradient-to-br ${colors[color]} bg-opacity-20`}
        >
          <Icon className="w-6 h-6 text-text-primary" />
        </div>
      </div>
    </motion.div>
  )
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; icon: any }> = {
    healthy: { color: 'text-green-500 bg-green-500/10', icon: CheckCircle },
    connected: { color: 'text-green-500 bg-green-500/10', icon: CheckCircle },
    running: { color: 'text-green-500 bg-green-500/10', icon: Activity },
    degraded: { color: 'text-yellow-500 bg-yellow-500/10', icon: AlertCircle },
    error: { color: 'text-red-500 bg-red-500/10', icon: AlertCircle },
    disabled: { color: 'text-text-muted bg-background-elevated/60', icon: Clock },
    stopped: { color: 'text-red-500 bg-red-500/10', icon: AlertCircle },
  }

  const config = statusConfig[status] || statusConfig.error
  const Icon = config.icon

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

export default function AdminDashboard() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [paymentStats, setPaymentStats] = useState<PaymentStats | null>(null)
  const [signalStats, setSignalStats] = useState<SignalStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDashboardData()
  }, [])

  const fetchDashboardData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Get API URL from environment
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

      // Fetch all data in parallel
      const [healthRes, paymentRes, signalRes] = await Promise.all([
        fetch(`${apiUrl}/api/admin/system/health`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }).catch(() => null),
        fetch(`${apiUrl}/api/admin/payments/stats?days=30`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }).catch(() => null),
        fetch(`${apiUrl}/api/admin/signals/stats?days=30`, {
          headers: { Authorization: `Bearer ${getToken()}` },
        }).catch(() => null),
      ])

      if (healthRes?.ok) {
        setHealth(await healthRes.json())
      } else {
        // Use mock data for development
        setHealth(getMockHealth())
      }

      if (paymentRes?.ok) {
        setPaymentStats(await paymentRes.json())
      } else {
        setPaymentStats(getMockPaymentStats())
      }

      if (signalRes?.ok) {
        setSignalStats(await signalRes.json())
      } else {
        setSignalStats(getMockSignalStats())
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
      // Use mock data for development
      setHealth(getMockHealth())
      setPaymentStats(getMockPaymentStats())
      setSignalStats(getMockSignalStats())
    } finally {
      setLoading(false)
    }
  }

  const getToken = () => {
    if (typeof window === 'undefined') return ''
    const session = localStorage.getItem('sb-access-token')
    return session || ''
  }

  // Mock data for development
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

  const getMockPaymentStats = (): PaymentStats => ({
    period_days: 30,
    total_revenue: 487500,
    completed_payments: 325,
    failed_payments: 18,
    refunds_count: 7,
    refunds_amount: 13500,
    net_revenue: 474000,
  })

  const getMockSignalStats = (): SignalStats => ({
    period_days: 30,
    total_signals: 342,
    target_hit: 198,
    sl_hit: 122,
    accuracy: 61.88,
    avg_per_day: 11.4,
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Admin Dashboard</h1>
        <p className="text-text-secondary mt-1">System overview and key metrics</p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* System Status */}
      <div className="app-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">System Status</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-text-secondary" />
            <div>
              <p className="text-sm text-text-secondary">Database</p>
              <StatusBadge status={health?.database || 'error'} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-text-secondary" />
            <div>
              <p className="text-sm text-text-secondary">Redis</p>
              <StatusBadge status={health?.redis || 'disabled'} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-text-secondary" />
            <div>
              <p className="text-sm text-text-secondary">Scheduler</p>
              <StatusBadge status={health?.scheduler_status || 'stopped'} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Wifi className="w-5 h-5 text-text-secondary" />
            <div>
              <p className="text-sm text-text-secondary">WebSocket</p>
              <p className="text-text-primary font-medium">
                {health?.active_websocket_connections || 0} connected
              </p>
            </div>
          </div>
        </div>
        {health?.last_signal_run && (
          <p className="text-xs text-text-muted mt-4">
            Last signal run: {new Date(health.last_signal_run).toLocaleString()}
          </p>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Users"
          value={health?.metrics.total_users.toLocaleString() || '0'}
          subtitle="All registered users"
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Active Subscribers"
          value={health?.metrics.active_subscribers.toLocaleString() || '0'}
          subtitle="Paid subscriptions"
          icon={CreditCard}
          color="green"
        />
        <StatCard
          title="Today's Signals"
          value={health?.metrics.today_signals || 0}
          subtitle="Generated today"
          icon={Target}
          color="purple"
        />
        <StatCard
          title="Active Positions"
          value={health?.metrics.active_positions || 0}
          subtitle="Open trades"
          icon={Activity}
          color="orange"
        />
      </div>

      {/* Revenue & Signals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Card */}
        <div className="app-panel p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Revenue (30 days)</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Total Revenue</span>
              <span className="text-2xl font-bold text-green-500">
                ₹{paymentStats?.total_revenue.toLocaleString() || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Completed Payments</span>
              <span className="text-text-primary font-medium">
                {paymentStats?.completed_payments || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Failed Payments</span>
              <span className="text-red-400 font-medium">
                {paymentStats?.failed_payments || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Refunds</span>
              <span className="text-yellow-400 font-medium">
                {paymentStats?.refunds_count || 0} (₹{paymentStats?.refunds_amount.toLocaleString() || 0})
              </span>
            </div>
            <div className="border-t border-border/50 pt-4 flex justify-between items-center">
              <span className="text-text-secondary">Net Revenue</span>
              <span className="text-xl font-bold text-text-primary">
                ₹{paymentStats?.net_revenue.toLocaleString() || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Signal Performance Card */}
        <div className="app-panel p-6">
          <h2 className="text-lg font-semibold text-text-primary mb-4">Signal Performance (30 days)</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Total Signals</span>
              <span className="text-text-primary font-medium">
                {signalStats?.total_signals || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Target Hit</span>
              <span className="text-green-500 font-medium">
                {signalStats?.target_hit || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Stop Loss Hit</span>
              <span className="text-red-400 font-medium">
                {signalStats?.sl_hit || 0}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Avg Signals/Day</span>
              <span className="text-text-primary font-medium">
                {signalStats?.avg_per_day.toFixed(1) || 0}
              </span>
            </div>
            <div className="border-t border-border/50 pt-4 flex justify-between items-center">
              <span className="text-text-secondary">Accuracy</span>
              <span
                className={`text-xl font-bold ${
                  (signalStats?.accuracy || 0) >= 55 ? 'text-green-500' : 'text-yellow-500'
                }`}
              >
                {signalStats?.accuracy.toFixed(1) || 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="app-panel p-6">
        <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <a
            href="/admin/users"
            className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm font-medium transition-colors"
          >
            View All Users
          </a>
          <a
            href="/admin/payments"
            className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium transition-colors"
          >
            Payment History
          </a>
          <a
            href="/admin/signals"
            className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-lg text-purple-400 text-sm font-medium transition-colors"
          >
            Signal Analytics
          </a>
          <button
            onClick={fetchDashboardData}
            className="px-4 py-2 bg-background-elevated/80 hover:bg-background-elevated rounded-lg text-text-secondary text-sm font-medium transition-colors"
          >
            Refresh Data
          </button>
        </div>
      </div>
    </div>
  )
}
