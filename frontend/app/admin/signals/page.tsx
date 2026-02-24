// ============================================================================
// SWINGAI - ADMIN SIGNALS PAGE
// Signal analytics and performance tracking
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
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
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import StatusDot from '@/components/ui/StatusDot'

export default function AdminSignalsPage() {
  const [stats, setStats] = useState<SignalStats | null>(null)
  const [recentSignals, setRecentSignals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(30)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

      // Fetch stats
      const statsRes = await fetch(`${apiUrl}/api/admin/signals/stats?days=${period}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (statsRes.ok) {
        setStats(await statsRes.json())
      } else {
        setStats(getMockStats())
      }

      // Fetch recent signals
      const signalsRes = await fetch(`${apiUrl}/api/signals/history?limit=20`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (signalsRes.ok) {
        const data = await signalsRes.json()
        setRecentSignals(data.signals || [])
      } else {
        setRecentSignals(getMockSignals())
      }
    } catch (err) {
      console.error('Failed to fetch signals data:', err)
      setStats(getMockStats())
      setRecentSignals(getMockSignals())
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const getToken = () => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('sb-access-token') || ''
  }

  const getMockStats = (): SignalStats => ({
    period_days: period,
    total_signals: 342,
    target_hit: 198,
    sl_hit: 122,
    accuracy: 61.88,
    avg_per_day: 11.4,
  })

  const getMockSignals = () => [
    {
      id: '1',
      symbol: 'RELIANCE',
      direction: 'LONG',
      entry_price: 2450,
      stop_loss: 2400,
      target_1: 2550,
      confidence: 78,
      status: 'target_hit',
      date: '2025-08-15',
    },
    {
      id: '2',
      symbol: 'TCS',
      direction: 'SHORT',
      entry_price: 3680,
      stop_loss: 3750,
      target_1: 3550,
      confidence: 72,
      status: 'sl_hit',
      date: '2025-08-15',
    },
    {
      id: '3',
      symbol: 'INFY',
      direction: 'LONG',
      entry_price: 1480,
      stop_loss: 1450,
      target_1: 1550,
      confidence: 85,
      status: 'active',
      date: '2025-08-15',
    },
    {
      id: '4',
      symbol: 'HDFC',
      direction: 'LONG',
      entry_price: 1650,
      stop_loss: 1600,
      target_1: 1750,
      confidence: 68,
      status: 'target_hit',
      date: '2025-08-14',
    },
  ]

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'target_hit':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-neon-green/10 text-neon-green rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" /> Target Hit
          </span>
        )
      case 'sl_hit':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-danger/10 text-danger rounded-full text-xs font-medium">
            <XCircle className="w-3 h-3" /> SL Hit
          </span>
        )
      case 'active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-neon-cyan/10 text-neon-cyan rounded-full text-xs font-medium">
            <Activity className="w-3 h-3" /> Active
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-500/10 text-text-secondary rounded-full text-xs font-medium">
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
      <ScrollReveal>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-text-primary">Signal Analytics</h1>
            <p className="text-text-secondary mt-1 flex items-center gap-2">
              AI signal performance and accuracy tracking
              <StatusDot status="live" label="Live" />
            </p>
          </div>
          <button
            onClick={fetchData}
            className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            <RefreshCw className="w-5 h-5 text-text-secondary" />
          </button>
        </div>
      </ScrollReveal>

      {/* Period Selector */}
      <ScrollReveal delay={0.05}>
        <div className="flex gap-2">
          {[7, 30, 90, 365].map((days) => (
            <button
              key={days}
              onClick={() => setPeriod(days)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                period === days
                  ? 'bg-neon-gold text-space-void'
                  : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.06]'
              }`}
            >
              {days === 365 ? '1 Year' : `${days} Days`}
            </button>
          ))}
        </div>
      </ScrollReveal>

      {/* Stats Grid */}
      <ScrollReveal delay={0.1}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <Target className="w-5 h-5 text-neon-cyan" />
                <span className="text-sm text-text-secondary">Total Signals</span>
              </div>
              <p className="text-3xl font-bold text-text-primary">{stats?.total_signals || 0}</p>
            </motion.div>
          </Card3D>

          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <TrendingUp className="w-5 h-5 text-neon-green" />
                <span className="text-sm text-text-secondary">Target Hit</span>
              </div>
              <p className="text-3xl font-bold text-neon-green">{stats?.target_hit || 0}</p>
            </motion.div>
          </Card3D>

          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <TrendingDown className="w-5 h-5 text-danger" />
                <span className="text-sm text-text-secondary">SL Hit</span>
              </div>
              <p className="text-3xl font-bold text-danger">{stats?.sl_hit || 0}</p>
            </motion.div>
          </Card3D>

          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 className="w-5 h-5 text-neon-purple" />
                <span className="text-sm text-text-secondary">Accuracy</span>
              </div>
              <p
                className={`text-3xl font-bold ${
                  (stats?.accuracy || 0) >= 55 ? 'text-neon-green' : 'text-neon-gold'
                }`}
              >
                {stats?.accuracy.toFixed(1) || 0}%
              </p>
            </motion.div>
          </Card3D>

          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center gap-3 mb-2">
                <Activity className="w-5 h-5 text-neon-gold" />
                <span className="text-sm text-text-secondary">Avg/Day</span>
              </div>
              <p className="text-3xl font-bold text-text-primary">{stats?.avg_per_day.toFixed(1) || 0}</p>
            </motion.div>
          </Card3D>
        </div>
      </ScrollReveal>

      {/* Accuracy Gauge */}
      <ScrollReveal delay={0.15}>
        <Card3D maxTilt={3}>
          <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6">
            <h2 className="text-lg font-semibold text-text-primary mb-4">Accuracy Overview</h2>
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
                    className={(stats?.accuracy || 0) >= 55 ? 'text-neon-green' : 'text-neon-gold'}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold text-text-primary">{stats?.accuracy.toFixed(0) || 0}%</span>
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">Winners</span>
                    <span className="text-neon-green">{stats?.target_hit || 0}</span>
                  </div>
                  <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-neon-green rounded-full"
                      style={{
                        width: `${((stats?.target_hit || 0) / (stats?.total_signals || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-text-secondary">Losers</span>
                    <span className="text-danger">{stats?.sl_hit || 0}</span>
                  </div>
                  <div className="h-2 bg-white/[0.04] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-danger rounded-full"
                      style={{
                        width: `${((stats?.sl_hit || 0) / (stats?.total_signals || 1)) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card3D>
      </ScrollReveal>

      {/* Recent Signals */}
      <ScrollReveal delay={0.2}>
        <Card3D maxTilt={2}>
          <div className="glass-card-neu rounded-2xl border border-white/[0.04] overflow-hidden">
            <div className="p-6 border-b border-white/[0.04]">
              <h2 className="text-lg font-semibold text-text-primary">Recent Signals</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Symbol</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Direction</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Entry</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">SL</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Target</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Confidence</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {recentSignals.map((signal) => (
                    <tr key={signal.id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-4">
                        <span className="text-text-primary font-medium">{signal.symbol}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            signal.direction === 'LONG' ? 'text-neon-green' : 'text-danger'
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
                      <td className="px-4 py-4 text-text-secondary">{'\u20B9'}{signal.entry_price}</td>
                      <td className="px-4 py-4 text-danger">{'\u20B9'}{signal.stop_loss}</td>
                      <td className="px-4 py-4 text-neon-green">{'\u20B9'}{signal.target_1}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                signal.confidence >= 75
                                  ? 'bg-neon-green'
                                  : signal.confidence >= 60
                                  ? 'bg-neon-gold'
                                  : 'bg-danger'
                              }`}
                              style={{ width: `${signal.confidence}%` }}
                            />
                          </div>
                          <span className="text-text-secondary text-sm">{signal.confidence}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">{getStatusBadge(signal.status)}</td>
                      <td className="px-4 py-4 text-text-secondary text-sm">{signal.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card3D>
      </ScrollReveal>
    </div>
  )
}
