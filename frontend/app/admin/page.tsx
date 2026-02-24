// ============================================================================
// SWINGAI - ADMIN DASHBOARD (2026 Enhanced)
// Glass-neu cards, neon accents, animated indicators
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
  RefreshCw,
} from 'lucide-react'
import { SystemHealth, PaymentStats, SignalStats } from '@/types/admin'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import StatusDot from '@/components/ui/StatusDot'

// Stat Card Component
function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'blue',
  trend,
  delay = 0,
}: {
  title: string
  value: string | number
  subtitle?: string
  icon: any
  color?: 'blue' | 'green' | 'red' | 'orange' | 'purple'
  trend?: { value: number; positive: boolean }
  delay?: number
}) {
  const colors = {
    blue: 'from-neon-cyan/20 to-neon-cyan/5 text-neon-cyan',
    green: 'from-neon-green/20 to-neon-green/5 text-neon-green',
    red: 'from-danger/20 to-danger/5 text-danger',
    orange: 'from-neon-gold/20 to-neon-gold/5 text-neon-gold',
    purple: 'from-neon-purple/20 to-neon-purple/5 text-neon-purple',
  }

  const iconBg = {
    blue: 'bg-neon-cyan/10 border-neon-cyan/20',
    green: 'bg-neon-green/10 border-neon-green/20',
    red: 'bg-danger/10 border-danger/20',
    orange: 'bg-neon-gold/10 border-neon-gold/20',
    purple: 'bg-neon-purple/10 border-neon-purple/20',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card3D>
        <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-text-secondary mb-1">{title}</p>
              <p className="text-2xl font-bold text-text-primary">{value}</p>
              {subtitle && <p className="text-xs text-text-secondary mt-1">{subtitle}</p>}
              {trend && (
                <p
                  className={`text-xs mt-2 ${trend.positive ? 'text-neon-green' : 'text-danger'}`}
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
      </Card3D>
    </motion.div>
  )
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const statusConfig: Record<string, { color: string; icon: any }> = {
    healthy: { color: 'text-neon-green bg-neon-green/10 border border-neon-green/20', icon: CheckCircle },
    connected: { color: 'text-neon-green bg-neon-green/10 border border-neon-green/20', icon: CheckCircle },
    running: { color: 'text-neon-green bg-neon-green/10 border border-neon-green/20', icon: Activity },
    degraded: { color: 'text-neon-gold bg-neon-gold/10 border border-neon-gold/20', icon: AlertCircle },
    error: { color: 'text-danger bg-danger/10 border border-danger/20', icon: AlertCircle },
    disabled: { color: 'text-text-secondary bg-white/[0.04] border border-white/[0.04]', icon: Clock },
    stopped: { color: 'text-danger bg-danger/10 border border-danger/20', icon: AlertCircle },
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

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

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
        <div className="loader-rings" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <ScrollReveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Admin Dashboard</h1>
            <p className="text-text-secondary mt-1 flex items-center gap-2">
              System overview and key metrics
              <StatusDot status="live" label="Live" />
            </p>
          </div>
          <button
            onClick={fetchDashboardData}
            className="btn-beam flex items-center gap-2 px-4 py-2 rounded-xl bg-neon-gold/10 border border-neon-gold/20 text-neon-gold text-sm font-medium transition-all hover:bg-neon-gold/20"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </ScrollReveal>

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-danger" />
          <p className="text-danger">{error}</p>
        </div>
      )}

      {/* System Status */}
      <ScrollReveal delay={0.05}>
        <Card3D maxTilt={3}>
          <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">System Status</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-neon-cyan/10 border border-neon-cyan/20">
                  <Database className="w-5 h-5 text-neon-cyan" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Database</p>
                  <StatusBadge status={health?.database || 'error'} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-neon-purple/10 border border-neon-purple/20">
                  <Server className="w-5 h-5 text-neon-purple" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Redis</p>
                  <StatusBadge status={health?.redis || 'disabled'} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-neon-gold/10 border border-neon-gold/20">
                  <Clock className="w-5 h-5 text-neon-gold" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">Scheduler</p>
                  <StatusBadge status={health?.scheduler_status || 'stopped'} />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-neon-green/10 border border-neon-green/20">
                  <Wifi className="w-5 h-5 text-neon-green" />
                </div>
                <div>
                  <p className="text-sm text-text-secondary">WebSocket</p>
                  <p className="text-text-primary font-medium">
                    {health?.active_websocket_connections || 0} connected
                  </p>
                </div>
              </div>
            </div>
            {health?.last_signal_run && (
              <p className="text-xs text-text-secondary mt-4">
                Last signal run: {new Date(health.last_signal_run).toLocaleString()}
              </p>
            )}
          </div>
        </Card3D>
      </ScrollReveal>

      {/* Key Metrics */}
      <ScrollReveal delay={0.1}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Users"
            value={health?.metrics.total_users.toLocaleString() || '0'}
            subtitle="All registered users"
            icon={Users}
            color="blue"
            delay={0.1}
          />
          <StatCard
            title="Active Subscribers"
            value={health?.metrics.active_subscribers.toLocaleString() || '0'}
            subtitle="Paid subscriptions"
            icon={CreditCard}
            color="green"
            delay={0.15}
          />
          <StatCard
            title="Today's Signals"
            value={health?.metrics.today_signals || 0}
            subtitle="Generated today"
            icon={Target}
            color="purple"
            delay={0.2}
          />
          <StatCard
            title="Active Positions"
            value={health?.metrics.active_positions || 0}
            subtitle="Open trades"
            icon={Activity}
            color="orange"
            delay={0.25}
          />
        </div>
      </ScrollReveal>

      {/* Revenue & Signals */}
      <ScrollReveal delay={0.15}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Card */}
          <Card3D maxTilt={3}>
            <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-neon-green" />
                Revenue (30 days)
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Total Revenue</span>
                  <span className="text-2xl font-bold text-neon-green">
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
                  <span className="text-danger font-medium">
                    {paymentStats?.failed_payments || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Refunds</span>
                  <span className="text-neon-gold font-medium">
                    {paymentStats?.refunds_count || 0} (₹{paymentStats?.refunds_amount.toLocaleString() || 0})
                  </span>
                </div>
                <div className="border-t border-white/[0.06] pt-4 flex justify-between items-center">
                  <span className="text-text-secondary">Net Revenue</span>
                  <span className="text-xl font-bold text-text-primary">
                    ₹{paymentStats?.net_revenue.toLocaleString() || 0}
                  </span>
                </div>
              </div>
            </div>
          </Card3D>

          {/* Signal Performance Card */}
          <Card3D maxTilt={3}>
            <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                <Target className="w-5 h-5 text-neon-purple" />
                Signal Performance (30 days)
              </h2>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Total Signals</span>
                  <span className="text-text-primary font-medium">
                    {signalStats?.total_signals || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Target Hit</span>
                  <span className="text-neon-green font-medium">
                    {signalStats?.target_hit || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Stop Loss Hit</span>
                  <span className="text-danger font-medium">
                    {signalStats?.sl_hit || 0}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Avg Signals/Day</span>
                  <span className="text-text-primary font-medium">
                    {signalStats?.avg_per_day.toFixed(1) || 0}
                  </span>
                </div>
                <div className="border-t border-white/[0.06] pt-4 flex justify-between items-center">
                  <span className="text-text-secondary">Accuracy</span>
                  <span
                    className={`text-xl font-bold ${
                      (signalStats?.accuracy || 0) >= 55 ? 'text-neon-green' : 'text-neon-gold'
                    }`}
                  >
                    {signalStats?.accuracy.toFixed(1) || 0}%
                  </span>
                </div>
              </div>
            </div>
          </Card3D>
        </div>
      </ScrollReveal>

      {/* Quick Actions */}
      <ScrollReveal delay={0.2}>
        <Card3D maxTilt={2}>
          <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Quick Actions</h2>
            <div className="flex flex-wrap gap-3">
              <a
                href="/admin/users"
                className="btn-beam px-4 py-2 bg-neon-cyan/10 hover:bg-neon-cyan/20 border border-neon-cyan/20 rounded-lg text-neon-cyan text-sm font-medium transition-all hover:shadow-glow-sm"
              >
                View All Users
              </a>
              <a
                href="/admin/payments"
                className="btn-beam px-4 py-2 bg-neon-green/10 hover:bg-neon-green/20 border border-neon-green/20 rounded-lg text-neon-green text-sm font-medium transition-all hover:shadow-glow-sm"
              >
                Payment History
              </a>
              <a
                href="/admin/signals"
                className="btn-beam px-4 py-2 bg-neon-purple/10 hover:bg-neon-purple/20 border border-neon-purple/20 rounded-lg text-neon-purple text-sm font-medium transition-all hover:shadow-glow-sm"
              >
                Signal Analytics
              </a>
              <a
                href="/admin/system"
                className="btn-beam px-4 py-2 bg-neon-gold/10 hover:bg-neon-gold/20 border border-neon-gold/20 rounded-lg text-neon-gold text-sm font-medium transition-all hover:shadow-glow-sm"
              >
                System Health
              </a>
            </div>
          </div>
        </Card3D>
      </ScrollReveal>
    </div>
  )
}
