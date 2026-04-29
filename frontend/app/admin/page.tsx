// ============================================================================
// QUANT X - ADMIN DASHBOARD (Intellectia.ai Design System)
// Clean cards, semantic colors, no animations
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
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
  RefreshCw,
} from 'lucide-react'
import { SystemHealth, PaymentStats, SignalStats } from '@/types/admin'
import { api, handleApiError } from '@/lib/api'

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
    blue: 'from-primary/20 to-primary/5 text-primary',
    green: 'from-up/20 to-up/5 text-up',
    red: 'from-down/20 to-down/5 text-down',
    orange: 'from-warning/20 to-warning/5 text-warning',
    purple: 'from-purple-500/20 to-purple-500/5 text-purple-500',
  }

  const iconBg = {
    blue: 'bg-primary/10 border-primary/20',
    green: 'bg-up/10 border-up/20',
    red: 'bg-down/10 border-down/20',
    orange: 'bg-warning/10 border-warning/20',
    purple: 'bg-purple-500/10 border-purple-500/20',
  }

  return (
    <div>
      <div className="glass-card hover:border-primary transition-colors p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-d-text-muted mb-1">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            {subtitle && <p className="text-xs text-d-text-muted mt-1">{subtitle}</p>}
            {trend && (
              <p
                className={`text-xs mt-2 ${trend.positive ? 'text-up' : 'text-down'}`}
              >
                {trend.positive ? '+' : ''}{trend.value}% from last period
              </p>
            )}
          </div>
          <div
            className={`p-3 rounded-xl border ${iconBg[color]}`}
          >
            <Icon className={`w-6 h-6 ${colors[color].split(' ').pop()}`} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; icon: any }> = {
    healthy: { color: 'text-up bg-up/10 border border-up/20', icon: CheckCircle },
    connected: { color: 'text-up bg-up/10 border border-up/20', icon: CheckCircle },
    running: { color: 'text-up bg-up/10 border border-up/20', icon: Activity },
    // PR 104 — "slow" is a new mid-state from the latency probe (DB up
    // but RTT >500ms or Redis >200ms). Color-coded amber to read at a
    // glance as "still working but degraded".
    slow: { color: 'text-warning bg-warning/10 border border-warning/20', icon: Clock },
    degraded: { color: 'text-warning bg-warning/10 border border-warning/20', icon: AlertCircle },
    error: { color: 'text-down bg-down/10 border border-down/20', icon: AlertCircle },
    disabled: { color: 'text-d-text-muted bg-white/[0.04] border border-white/[0.04]', icon: Clock },
    stopped: { color: 'text-down bg-down/10 border border-down/20', icon: AlertCircle },
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

      const [healthData, paymentData, signalData] = await Promise.all([
        api.admin.getSystemHealth().catch(() => null),
        api.admin.getPaymentStats(30).catch(() => null),
        api.admin.getSignalStats(30).catch(() => null),
      ])

      if (healthData) {
        setHealth(healthData as SystemHealth)
      } else {
        setError('Failed to fetch system health')
      }

      if (paymentData) {
        setPaymentStats(paymentData as PaymentStats)
      }

      if (signalData) {
        setSignalStats(signalData as SignalStats)
      }
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err)
      setError('Failed to connect to backend')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="loader-rings" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-d-text-muted mt-1 flex items-center gap-2">
              System overview and key metrics
              <span className="inline-flex items-center gap-1.5 text-up text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
                Live
              </span>
            </p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-warning/10 border border-warning/20 text-warning text-sm font-medium transition-all hover:bg-warning/20"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-down/10 border border-down/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-down" />
          <p className="text-down">{error}</p>
        </div>
      )}

      {/* System Status */}
      <div>
        <div className="glass-card hover:border-primary transition-colors p-6">
          <h2 className="text-lg font-semibold text-white mb-4">System Status</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-d-text-muted">Database</p>
                <StatusBadge status={health?.database || 'error'} />
                {/* PR 104 — round-trip latency. Color-coded so a DB
                    that's "connected" but slow stands out without
                    requiring the operator to read the badge. */}
                {health?.db_latency_ms != null && (
                  <p
                    className="text-[10px] font-mono num-display mt-0.5"
                    style={{
                      color:
                        health.db_latency_ms > 500 ? '#FF5947'
                        : health.db_latency_ms > 200 ? '#FEB113'
                        : '#71717a',
                    }}
                  >
                    {health.db_latency_ms}ms
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Server className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-d-text-muted">Redis</p>
                <StatusBadge status={health?.redis || 'disabled'} />
                {health?.redis_latency_ms != null && (
                  <p
                    className="text-[10px] font-mono num-display mt-0.5"
                    style={{
                      color:
                        health.redis_latency_ms > 200 ? '#FF5947'
                        : health.redis_latency_ms > 50 ? '#FEB113'
                        : '#71717a',
                    }}
                  >
                    {health.redis_latency_ms}ms
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
                <Clock className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-d-text-muted">Scheduler</p>
                <StatusBadge status={health?.scheduler_status || 'stopped'} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-up/10 border border-up/20">
                <Wifi className="w-5 h-5 text-up" />
              </div>
              <div>
                <p className="text-sm text-d-text-muted">WebSocket</p>
                <p className="text-white font-medium">
                  {health?.active_websocket_connections || 0} connected
                </p>
              </div>
            </div>
          </div>
          {health?.last_signal_run && (
            <p className="text-xs text-d-text-muted mt-4">
              Last signal run: {new Date(health.last_signal_run).toLocaleString()}
            </p>
          )}
        </div>
      </div>

      {/* Key Metrics */}
      <div>
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
      </div>

      {/* Revenue & Signals */}
      <div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Card */}
          <div className="glass-card hover:border-primary transition-colors p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-up" />
              Revenue (30 days)
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-d-text-muted">Total Revenue</span>
                <span className="text-2xl font-bold font-mono num-display text-up">
                  {'\u20B9'}{paymentStats?.total_revenue.toLocaleString() || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-d-text-muted">Completed Payments</span>
                <span className="text-white font-medium">
                  {paymentStats?.completed_payments || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-d-text-muted">Failed Payments</span>
                <span className="text-down font-medium">
                  {paymentStats?.failed_payments || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-d-text-muted">Refunds</span>
                <span className="text-warning font-medium">
                  {paymentStats?.refunds_count || 0} ({'\u20B9'}{paymentStats?.refunds_amount.toLocaleString() || 0})
                </span>
              </div>
              <div className="border-t border-d-border pt-4 flex justify-between items-center">
                <span className="text-d-text-muted">Net Revenue</span>
                <span className="text-xl font-bold font-mono num-display text-white">
                  {'\u20B9'}{paymentStats?.net_revenue.toLocaleString() || 0}
                </span>
              </div>
            </div>
          </div>

          {/* Signal Performance Card */}
          <div className="glass-card hover:border-primary transition-colors p-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-500" />
              Signal Performance (30 days)
            </h2>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-d-text-muted">Total Signals</span>
                <span className="text-white font-medium">
                  {signalStats?.total_signals || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-d-text-muted">Target Hit</span>
                <span className="text-up font-medium">
                  {signalStats?.target_hit || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-d-text-muted">Stop Loss Hit</span>
                <span className="text-down font-medium">
                  {signalStats?.sl_hit || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-d-text-muted">Avg Signals/Day</span>
                <span className="text-white font-medium">
                  {signalStats?.avg_per_day.toFixed(1) || 0}
                </span>
              </div>
              <div className="border-t border-d-border pt-4 flex justify-between items-center">
                <span className="text-d-text-muted">Accuracy</span>
                <span
                  className={`text-xl font-bold ${
                    (signalStats?.accuracy || 0) >= 55 ? 'text-up' : 'text-warning'
                  }`}
                >
                  <span className="font-mono num-display">{signalStats?.accuracy.toFixed(1) || 0}%</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <div className="glass-card hover:border-primary transition-colors p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <a
              href="/admin/users"
              className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg text-primary text-sm font-medium transition-all"
            >
              View All Users
            </a>
            <a
              href="/admin/payments"
              className="px-4 py-2 bg-up/10 hover:bg-up/20 border border-up/20 rounded-lg text-up text-sm font-medium transition-all"
            >
              Payment History
            </a>
            <a
              href="/admin/signals"
              className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-purple-500 text-sm font-medium transition-all"
            >
              Signal Analytics
            </a>
            <a
              href="/admin/system"
              className="px-4 py-2 bg-warning/10 hover:bg-warning/20 border border-warning/20 rounded-lg text-warning text-sm font-medium transition-all"
            >
              System Health
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
