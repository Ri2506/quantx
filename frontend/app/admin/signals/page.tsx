// ============================================================================
// QUANT X - ADMIN SIGNALS PAGE (Intellectia.ai Design System)
// Signal analytics and performance tracking
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Target,
  TrendingUp,
  TrendingDown,
  Activity,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle,
  BarChart3,
} from 'lucide-react'
import { SignalStats } from '@/types/admin'
import { api, handleApiError } from '@/lib/api'

export default function AdminSignalsPage() {
  const [stats, setStats] = useState<SignalStats | null>(null)
  const [recentSignals, setRecentSignals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)

      // Fetch stats
      const statsData = await api.admin.getSignalStats(period).catch(() => null)
      if (statsData) {
        setStats(statsData as unknown as SignalStats)
      }

      // Fetch recent signals
      const signalsData = await api.signals.getHistory({ limit: 20 }).catch(() => null)
      if (signalsData) {
        setRecentSignals(signalsData.signals || [])
      }
    } catch (err) {
      console.error('Failed to fetch signals data:', err)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'target_hit':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-up/10 text-up rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" /> Target Hit
          </span>
        )
      case 'sl_hit':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-down/10 text-down rounded-full text-xs font-medium">
            <XCircle className="w-3 h-3" /> SL Hit
          </span>
        )
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium">
            <Activity className="w-3 h-3" /> Active
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-500/10 text-d-text-muted rounded-full text-xs font-medium">
            {status}
          </span>
        )
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="loader-rings"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Signal Analytics</h1>
            <p className="text-d-text-muted mt-1 flex items-center gap-2">
              AI signal performance and accuracy tracking
              <span className="inline-flex items-center gap-1.5 text-up text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
                Live
              </span>
            </p>
          </div>
          <button
            onClick={fetchData}
            className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5 text-d-text-muted" />
          </button>
        </div>
      </div>

      {/* Period Selector */}
      <div>
        <div className="flex gap-2">
          {[7, 30, 90, 365].map((days) => (
            <button
              key={days}
              onClick={() => setPeriod(days)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === days
                  ? 'bg-warning text-black'
                  : 'bg-white/[0.04] text-d-text-muted hover:bg-white/[0.06]'
              }`}
            >
              {days === 365 ? '1 Year' : `${days} Days`}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center gap-3 mb-2">
              <Target className="w-5 h-5 text-primary" />
              <span className="text-sm text-d-text-muted">Total Signals</span>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.total_signals || 0}</p>
          </div>

          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-up" />
              <span className="text-sm text-d-text-muted">Target Hit</span>
            </div>
            <p className="text-3xl font-bold text-up">{stats?.target_hit || 0}</p>
          </div>

          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingDown className="w-5 h-5 text-down" />
              <span className="text-sm text-d-text-muted">SL Hit</span>
            </div>
            <p className="text-3xl font-bold text-down">{stats?.sl_hit || 0}</p>
          </div>

          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 className="w-5 h-5 text-purple-500" />
              <span className="text-sm text-d-text-muted">Accuracy</span>
            </div>
            <p
              className={`text-3xl font-bold font-mono num-display ${
                (stats?.accuracy || 0) >= 55 ? 'text-up' : 'text-warning'
              }`}
            >
              {stats?.accuracy.toFixed(1) || 0}%
            </p>
          </div>

          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center gap-3 mb-2">
              <Activity className="w-5 h-5 text-warning" />
              <span className="text-sm text-d-text-muted">Avg/Day</span>
            </div>
            <p className="text-3xl font-bold text-white">{stats?.avg_per_day.toFixed(1) || 0}</p>
          </div>
        </div>
      </div>

      {/* Accuracy Gauge */}
      <div>
        <div className="glass-card hover:border-primary transition-colors p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Accuracy Overview</h2>
          <div className="flex items-center gap-6">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-white/[0.06]"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${(stats?.accuracy || 0) * 3.52} 352`}
                  className={(stats?.accuracy || 0) >= 55 ? 'text-up' : 'text-warning'}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold font-mono num-display text-white">{stats?.accuracy.toFixed(0) || 0}%</span>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-d-text-muted">Winners</span>
                  <span className="text-up">{stats?.target_hit || 0}</span>
                </div>
                <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-up rounded-full"
                    style={{
                      width: `${((stats?.target_hit || 0) / (stats?.total_signals || 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-d-text-muted">Losers</span>
                  <span className="text-down">{stats?.sl_hit || 0}</span>
                </div>
                <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-down rounded-full"
                    style={{
                      width: `${((stats?.sl_hit || 0) / (stats?.total_signals || 1)) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Signals */}
      <div>
        <div className="glass-card overflow-hidden">
          <div className="p-6 border-b border-white/[0.04]">
            <h2 className="text-lg font-semibold text-white">Recent Signals</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/[0.02]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Symbol</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Direction</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Entry</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">SL</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Target</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {recentSignals.map((signal) => (
                  <tr key={signal.id} className="hover:bg-white/[0.04] transition-colors">
                    <td className="px-4 py-4">
                      <span className="text-white font-medium">{signal.symbol}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          signal.direction === 'LONG' ? 'text-up' : 'text-down'
                        }`}
                      >
                        {signal.direction === 'LONG' ? (
                          <TrendingUp className="w-4 h-4" />
                        ) : (
                          <TrendingDown className="w-4 h-4" />
                        )}
                        {signal.direction}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-d-text-muted font-mono num-display">{'\u20B9'}{signal.entry_price}</td>
                    <td className="px-4 py-4 text-down font-mono num-display">{'\u20B9'}{signal.stop_loss}</td>
                    <td className="px-4 py-4 text-up font-mono num-display">{'\u20B9'}{signal.target_1}</td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              signal.confidence >= 75
                                ? 'bg-up'
                                : signal.confidence >= 60
                                ? 'bg-warning'
                                : 'bg-down'
                            }`}
                            style={{ width: `${signal.confidence}%` }}
                          />
                        </div>
                        <span className="text-d-text-muted text-sm font-mono num-display">{signal.confidence}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">{getStatusBadge(signal.status)}</td>
                    <td className="px-4 py-4 text-d-text-muted text-sm">{signal.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
