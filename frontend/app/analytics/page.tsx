'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import {
  BarChart3,
  TrendingUp,
  Target,
  Activity,
  PieChart,
  Calendar,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

export default function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  // Mock analytics data
  const stats = {
    winRate: 68.4,
    profitFactor: 1.92,
    sharpeRatio: 1.87,
    maxDrawdown: -8.2,
    avgWin: 3800,
    avgLoss: -2100,
    totalTrades: 47,
    winningTrades: 32,
    avgHoldPeriod: 5.2,
    bestTrade: 12500,
    worstTrade: -4200,
  }

  const monthlyData = [
    { month: 'Jul', pnl: 15200, trades: 8 },
    { month: 'Aug', pnl: -4500, trades: 6 },
    { month: 'Sep', pnl: 22400, trades: 10 },
    { month: 'Oct', pnl: 18700, trades: 9 },
    { month: 'Nov', pnl: 8900, trades: 7 },
    { month: 'Dec', pnl: 11300, trades: 7 },
  ]

  return (
    <div className="min-h-screen bg-background-primary px-4 md:px-6 py-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <ScrollReveal direction="up" delay={0}>
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="mb-2 text-3xl md:text-4xl font-bold text-text-primary">
                  <span className="gradient-text-professional">Analytics</span>
                </h1>
                <p className="text-lg text-text-secondary">
                  Detailed performance metrics and trading insights
                </p>
              </div>
              <Link
                href="/dashboard"
                className="w-fit rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-2 text-sm font-medium text-text-primary transition hover:border-neon-cyan/40"
              >
                &larr; Back to Dashboard
              </Link>
            </div>
          </div>
        </ScrollReveal>

        {/* Timeframe Filter */}
        <ScrollReveal direction="up" delay={0.05}>
          <div className="mb-8 flex flex-wrap gap-2">
            {(['7d', '30d', '90d', 'all'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  timeframe === tf
                    ? 'bg-neon-cyan/10 border border-neon-cyan/20 text-neon-cyan'
                    : 'bg-white/[0.02] text-text-secondary hover:bg-white/[0.04]'
                }`}
              >
                {tf === 'all' ? 'All Time' : tf.toUpperCase()}
              </button>
            ))}
          </div>
        </ScrollReveal>

        {/* Key Metrics */}
        <ScrollReveal direction="up" delay={0.1}>
          <div className="mb-8 grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            <Card3D>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card-neu rounded-xl border border-white/[0.04] p-5"
              >
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <Target className="h-4 w-4 text-neon-green" />
                  Win Rate
                </div>
                <div className="text-3xl font-bold text-neon-green">{stats.winRate}%</div>
              </motion.div>
            </Card3D>

            <Card3D>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-card-neu rounded-xl border border-white/[0.04] p-5"
              >
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <BarChart3 className="h-4 w-4 text-neon-cyan" />
                  Profit Factor
                </div>
                <div className="text-3xl font-bold text-neon-cyan">{stats.profitFactor}</div>
              </motion.div>
            </Card3D>

            <Card3D>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card-neu rounded-xl border border-white/[0.04] p-5"
              >
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <Activity className="h-4 w-4 text-primary" />
                  Sharpe Ratio
                </div>
                <div className="text-3xl font-bold text-primary">{stats.sharpeRatio}</div>
              </motion.div>
            </Card3D>

            <Card3D>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="glass-card-neu rounded-xl border border-white/[0.04] p-5"
              >
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <TrendingUp className="h-4 w-4 text-danger" />
                  Max Drawdown
                </div>
                <div className="text-3xl font-bold text-danger">{stats.maxDrawdown}%</div>
              </motion.div>
            </Card3D>

            <Card3D>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="glass-card-neu rounded-xl border border-white/[0.04] p-5"
              >
                <div className="mb-2 text-sm font-medium text-text-secondary">Avg Win</div>
                <div className="text-2xl font-bold text-neon-green">{'\u20B9'}{stats.avgWin.toLocaleString()}</div>
              </motion.div>
            </Card3D>

            <Card3D>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="glass-card-neu rounded-xl border border-white/[0.04] p-5"
              >
                <div className="mb-2 text-sm font-medium text-text-secondary">Avg Loss</div>
                <div className="text-2xl font-bold text-danger">{'\u20B9'}{Math.abs(stats.avgLoss).toLocaleString()}</div>
              </motion.div>
            </Card3D>
          </div>
        </ScrollReveal>

        {/* Monthly Performance */}
        <ScrollReveal direction="up" delay={0.15}>
          <Card3D maxTilt={3}>
            <div className="mb-8 glass-card-neu rounded-xl border border-white/[0.04] p-6">
              <h2 className="mb-6 text-xl font-bold text-text-primary">Monthly Performance</h2>
              <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
                {monthlyData.map((month, index) => (
                  <motion.div
                    key={month.month}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="rounded-lg bg-background-primary/50 p-4 text-center"
                  >
                    <div className="mb-2 text-sm font-medium text-text-secondary">{month.month}</div>
                    <div className={`text-xl font-bold ${month.pnl >= 0 ? 'text-neon-green' : 'text-danger'}`}>
                      {month.pnl >= 0 ? '+' : ''}{'\u20B9'}{(month.pnl / 1000).toFixed(1)}K
                    </div>
                    <div className="mt-1 text-xs text-text-secondary">{month.trades} trades</div>
                  </motion.div>
                ))}
              </div>
            </div>
          </Card3D>
        </ScrollReveal>

        {/* Trade Statistics */}
        <ScrollReveal direction="up" delay={0.2}>
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
            <Card3D>
              <div className="glass-card-neu rounded-xl border border-white/[0.04] p-6">
                <h2 className="mb-6 text-xl font-bold text-text-primary">Trade Statistics</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                    <span className="text-text-secondary">Total Trades</span>
                    <span className="font-bold text-text-primary">{stats.totalTrades}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                    <span className="text-text-secondary">Winning Trades</span>
                    <span className="font-bold text-neon-green">{stats.winningTrades}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                    <span className="text-text-secondary">Losing Trades</span>
                    <span className="font-bold text-danger">{stats.totalTrades - stats.winningTrades}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                    <span className="text-text-secondary">Avg Hold Period</span>
                    <span className="font-bold text-text-primary">{stats.avgHoldPeriod} days</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/[0.04] pb-3">
                    <span className="text-text-secondary">Best Trade</span>
                    <span className="font-bold text-neon-green">+{'\u20B9'}{stats.bestTrade.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Worst Trade</span>
                    <span className="font-bold text-danger">{'\u20B9'}{stats.worstTrade.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            </Card3D>

            <Card3D>
              <div className="glass-card-neu rounded-xl border border-white/[0.04] p-6">
                <h2 className="mb-6 text-xl font-bold text-text-primary">Win Rate by Direction</h2>
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-text-secondary">
                        <ArrowUp className="h-4 w-4 text-neon-green" />
                        Long Trades
                      </span>
                      <span className="font-bold text-neon-green">72%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-background-primary">
                      <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-neon-green to-primary" />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2 text-text-secondary">
                        <ArrowDown className="h-4 w-4 text-danger" />
                        Short Trades
                      </span>
                      <span className="font-bold text-neon-cyan">61%</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-background-primary">
                      <div className="h-full w-[61%] rounded-full bg-gradient-to-r from-neon-cyan to-primary" />
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <h3 className="mb-4 font-semibold text-text-primary">Sector Performance</h3>
                  <div className="space-y-3">
                    {[
                      { sector: 'IT', winRate: 78 },
                      { sector: 'Banking', winRate: 65 },
                      { sector: 'Energy', winRate: 71 },
                      { sector: 'FMCG', winRate: 58 },
                    ].map(({ sector, winRate }) => (
                      <div key={sector} className="flex items-center justify-between">
                        <span className="text-sm text-text-secondary">{sector}</span>
                        <span className={`text-sm font-bold ${winRate >= 65 ? 'text-neon-green' : 'text-warning'}`}>
                          {winRate}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Card3D>
          </div>
        </ScrollReveal>
      </div>
    </div>
  )
}
