// ============================================================================
// SWINGAI - ANALYTICS PAGE
// Comprehensive trading analytics and performance metrics
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError } from '../../lib/api'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  Calendar,
  BarChart3,
  PieChart,
  Activity,
  RefreshCw,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'

// ============================================================================
// ANALYTICS PAGE
// ============================================================================

export default function AnalyticsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  
  // Data states
  const [performance, setPerformance] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  // Fetch data
  const fetchAnalytics = useCallback(async () => {
    if (!user) return
    
    setLoading(true)
    setError(null)
    
    try {
      const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 365
      
      const [performanceRes, historyRes, statsRes] = await Promise.allSettled([
        api.portfolio.getPerformance(),
        api.portfolio.getHistory(days),
        api.user.getStats(),
      ])
      
      if (performanceRes.status === 'fulfilled') {
        setPerformance(performanceRes.value)
      }
      if (historyRes.status === 'fulfilled') {
        setHistory(historyRes.value.history || [])
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value)
      }
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [user, timeframe])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!user) return null

  // Calculate derived metrics
  const p = performance || {}
  const s = stats || {}
  
  const avgRR = p.avg_win && p.avg_loss ? (p.avg_win / p.avg_loss).toFixed(2) : '0'
  const expectancy = p.win_rate && p.avg_win && p.avg_loss
    ? ((p.win_rate / 100 * p.avg_win) - ((100 - p.win_rate) / 100 * p.avg_loss)).toFixed(0)
    : '0'

  // Prepare chart data
  const cumulativePnL = history.reduce((acc: any[], h, i) => {
    const prev = acc[i - 1]?.cumulative || 0
    acc.push({
      date: h.date,
      daily: h.day_pnl || 0,
      cumulative: prev + (h.day_pnl || 0),
    })
    return acc
  }, [])

  // Calculate monthly breakdown
  const monthlyData = history.reduce((acc: any, h) => {
    const month = new Date(h.date).toLocaleString('default', { month: 'short', year: '2-digit' })
    if (!acc[month]) {
      acc[month] = { pnl: 0, trades: 0, wins: 0 }
    }
    acc[month].pnl += h.day_pnl || 0
    acc[month].trades += h.trades_taken || 0
    return acc
  }, {})

  const months = Object.entries(monthlyData).map(([month, data]: [string, any]) => ({
    month,
    ...data,
  }))

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header z-20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="p-2 hover:bg-background-elevated rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-text-secondary" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">Analytics</h1>
                <p className="text-sm text-text-muted">Performance insights and metrics</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Timeframe Selector */}
              <div className="flex items-center bg-background-elevated rounded-xl p-1">
                {(['7d', '30d', '90d', 'all'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      timeframe === tf
                        ? 'bg-primary text-white'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    {tf === 'all' ? 'All' : tf}
                  </button>
                ))}
              </div>
              <button
                onClick={fetchAnalytics}
                className="p-2 hover:bg-background-elevated rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Error */}
        {error && (
          <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricCard
            title="Total P&L"
            value={`₹${(s.total_pnl || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            change={s.total_pnl >= 0 ? '+' : ''}
            isPositive={s.total_pnl >= 0}
            icon={TrendingUp}
          />
          <MetricCard
            title="Win Rate"
            value={`${(s.win_rate || 0).toFixed(1)}%`}
            isPositive={(s.win_rate || 0) >= 50}
            icon={Target}
          />
          <MetricCard
            title="Total Trades"
            value={s.total_trades || 0}
            icon={BarChart3}
          />
          <MetricCard
            title="Profit Factor"
            value={p.profit_factor?.toFixed(2) || '0'}
            isPositive={(p.profit_factor || 0) >= 1}
            icon={Activity}
          />
          <MetricCard
            title="Avg Win"
            value={`₹${(p.avg_win || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            isPositive={true}
            icon={ArrowUpRight}
          />
          <MetricCard
            title="Avg Loss"
            value={`₹${(p.avg_loss || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
            isPositive={false}
            icon={ArrowDownRight}
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Equity Curve */}
          <div className="app-panel p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Cumulative P&L</h3>
            <div className="h-64 flex items-end gap-1">
              {cumulativePnL.slice(-30).map((d, i) => {
                const maxVal = Math.max(...cumulativePnL.map(x => Math.abs(x.cumulative)), 1)
                const height = Math.abs(d.cumulative) / maxVal * 100
                return (
                  <div
                    key={i}
                    className="flex-1 flex flex-col justify-end"
                    title={`${d.date}: ₹${d.cumulative.toFixed(0)}`}
                  >
                    <div
                      className={`rounded-t transition-all hover:opacity-80 ${
                        d.cumulative >= 0 ? 'bg-green-500' : 'bg-red-500'
                      }`}
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-text-muted">
              <span>{cumulativePnL[0]?.date || 'Start'}</span>
              <span>{cumulativePnL[cumulativePnL.length - 1]?.date || 'End'}</span>
            </div>
          </div>

          {/* Win/Loss Distribution */}
          <div className="app-panel p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Win/Loss Distribution</h3>
            <div className="flex items-center justify-center h-64">
              <div className="relative w-48 h-48">
                {/* Pie Chart */}
                <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="20"
                    strokeDasharray={`${(p.win_rate || 0) * 2.51} 251`}
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="20"
                    strokeDasharray={`${(100 - (p.win_rate || 0)) * 2.51} 251`}
                    strokeDashoffset={`-${(p.win_rate || 0) * 2.51}`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-3xl font-bold text-text-primary">{(p.win_rate || 0).toFixed(0)}%</span>
                  <span className="text-sm text-text-muted">Win Rate</span>
                </div>
              </div>
            </div>
            <div className="flex justify-center gap-8 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-text-secondary">Winners ({p.winners || 0})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-text-secondary">Losers ({p.losers || 0})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="app-panel p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Risk Metrics</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Risk:Reward Ratio</span>
                <span className={`font-medium ${Number(avgRR) >= 1.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                  1:{avgRR}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Expectancy</span>
                <span className={`font-medium ${Number(expectancy) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ₹{expectancy}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Best Trade</span>
                <span className="font-medium text-green-400">
                  ₹{(p.best_trade || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Worst Trade</span>
                <span className="font-medium text-red-400">
                  ₹{(p.worst_trade || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>

          <div className="app-panel p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Trading Summary</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Open Positions</span>
                <span className="font-medium text-text-primary">{s.open_positions || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Unrealized P&L</span>
                <span className={`font-medium ${(s.unrealized_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ₹{(s.unrealized_pnl || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Today's P&L</span>
                <span className={`font-medium ${(s.today_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ₹{(s.today_pnl || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Week's P&L</span>
                <span className={`font-medium ${(s.week_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  ₹{(s.week_pnl || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>
          </div>

          <div className="app-panel p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Capital</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Starting Capital</span>
                <span className="font-medium text-text-primary">
                  ₹{(s.capital || 100000).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Current Value</span>
                <span className="font-medium text-text-primary">
                  ₹{((s.capital || 100000) + (s.total_pnl || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Total Return</span>
                <span className={`font-medium ${(s.total_pnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {((s.total_pnl || 0) / (s.capital || 100000) * 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">Subscription</span>
                <span className="font-medium text-primary capitalize">{s.subscription_status || 'trial'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Breakdown */}
        {months.length > 0 && (
          <div className="app-panel p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">Monthly Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 text-sm font-medium text-text-muted">Month</th>
                    <th className="text-right py-3 text-sm font-medium text-text-muted">P&L</th>
                    <th className="text-right py-3 text-sm font-medium text-text-muted">Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((m, i) => (
                    <tr key={i} className="border-b border-border/50/50">
                      <td className="py-3 text-text-primary">{m.month}</td>
                      <td className={`py-3 text-right font-medium ${m.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {m.pnl >= 0 ? '+' : ''}₹{m.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-3 text-right text-text-secondary">{m.trades}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Metric Card Component
function MetricCard({
  title,
  value,
  change,
  isPositive,
  icon: Icon,
}: {
  title: string
  value: string | number
  change?: string
  isPositive?: boolean
  icon: any
}) {
  return (
    <div className="bg-background-surface rounded-xl border border-border/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-text-muted">{title}</span>
        <Icon className={`w-4 h-4 ${isPositive === undefined ? 'text-text-muted' : isPositive ? 'text-green-400' : 'text-red-400'}`} />
      </div>
      <p className={`text-xl font-bold ${isPositive === undefined ? 'text-text-primary' : isPositive ? 'text-green-400' : 'text-red-400'}`}>
        {change}{value}
      </p>
    </div>
  )
}
