'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Briefcase, TrendingUp, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts'
import StrategyHero from '@/components/strategy/StrategyHero'
import FAQAccordion from '@/components/strategy/FAQAccordion'
import PillTabs from '@/components/ui/PillTabs'
import StockAvatar from '@/components/ui/StockAvatar'
import SignalBadge from '@/components/ui/SignalBadge'
import EmptyState from '@/components/ui/EmptyState'
import SkeletonCard from '@/components/ui/SkeletonCard'
import { api, handleApiError } from '@/lib/api'
import type { Position } from '@/types'

const MAIN_TABS = [
  { label: 'Portfolio', value: 'portfolio' },
  { label: 'Performance', value: 'performance' },
]

const PERIOD_TABS = [
  { label: '1M', value: '30' },
  { label: '3M', value: '90' },
  { label: '6M', value: '180' },
  { label: '1Y', value: '365' },
  { label: 'All', value: '730' },
]

const PIE_COLORS = ['#4FECCD', '#22c55e', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--chart-tooltip-bg, #232a3b)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 8,
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
}

const FAQ_ITEMS = [
  {
    question: 'How is SwingMax Portfolio different from manually following SwingMax signals?',
    answer: 'SwingMax Portfolio is a curated, AI-managed collection that automatically selects only the highest-probability signals and assembles them into a diversified portfolio with proper position sizing and risk management.',
  },
  {
    question: 'How does the portfolio decide which signals to include?',
    answer: 'The portfolio evaluates signals based on relative signal strength, fundamental risk factors, liquidity constraints, and overlap with existing exposure. Only signals that improve the portfolio\'s risk-adjusted return are included.',
  },
  {
    question: 'Does SwingMax Portfolio rebalance automatically?',
    answer: 'Yes. The system monitors positions daily, adjusts trailing stop losses, and exits positions that hit targets or stop losses. New positions are added when high-quality signals emerge and capital is available.',
  },
  {
    question: 'Can I use SwingMax Portfolio alongside my own trades?',
    answer: 'Absolutely. The portfolio operates within the capital you allocate to it. Your discretionary trades are separate and won\'t interfere with portfolio operations.',
  },
]

export default function SwingMaxPortfolioPage() {
  const [mainTab, setMainTab] = useState('portfolio')
  const [period, setPeriod] = useState('90')
  const [positions, setPositions] = useState<Position[]>([])
  const [portfolioData, setPortfolioData] = useState<Record<string, any>>({})
  const [performance, setPerformance] = useState<Record<string, any>>({})
  const [historyData, setHistoryData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [closingId, setClosingId] = useState<string | null>(null)

  const fetchPortfolio = useCallback(async () => {
    setLoading(true)
    try {
      const [posRes, summaryRes] = await Promise.all([
        api.positions.getOpen(),
        api.portfolio.getSummary(),
      ])
      setPositions(posRes.positions || [])
      setPortfolioData(summaryRes || {})
    } catch (err) {
      console.error('Failed to fetch portfolio:', handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPerformance = useCallback(async () => {
    try {
      const [perfRes, histRes] = await Promise.all([
        api.portfolio.getPerformance(),
        api.portfolio.getHistory(Number(period)),
      ])
      setPerformance(perfRes || {})
      setHistoryData(histRes.history || [])
    } catch (err) {
      console.error('Failed to fetch performance:', handleApiError(err))
    }
  }, [period])

  useEffect(() => { fetchPortfolio() }, [fetchPortfolio])
  useEffect(() => { if (mainTab === 'performance') fetchPerformance() }, [mainTab, fetchPerformance])

  const handleClose = async (positionId: string) => {
    setClosingId(positionId)
    try {
      const result = await api.positions.close(positionId)
      if (result.success) {
        toast.success('Position closed successfully')
        fetchPortfolio()
      }
    } catch (err) {
      toast.error(handleApiError(err))
    } finally {
      setClosingId(null)
    }
  }

  const totalValue = portfolioData.capital || portfolioData.total_capital || 0
  const deployed = portfolioData.deployed || portfolioData.invested_capital || 0
  const unrealizedPnl = portfolioData.unrealized_pnl || 0
  const dayPnl = portfolioData.day_pnl || 0

  const pieData = positions.map((p) => ({
    name: p.symbol,
    value: Math.abs((p.entry_price || p.average_price || 0) * p.quantity),
  }))

  return (
    <>
      {/* Hero */}
      <StrategyHero
        breadcrumb={[
          { label: 'Home', href: '/dashboard' },
          { label: 'SwingMax Portfolio' },
        ]}
        title="SwingMax Portfolio"
        description="AI-curated portfolio built from the best SwingMax signals. Diversified positions with disciplined risk management for consistent mid-term returns."
        imageSrc="/images/swingmax.png"
        learnMoreHref="/pricing"
      />

      <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8 space-y-6">
        {/* Tab Switch */}
        <PillTabs tabs={MAIN_TABS} activeTab={mainTab} onChange={setMainTab} />

        {/* ==================== PORTFOLIO TAB ==================== */}
        {mainTab === 'portfolio' && (
          <>
            {/* Summary Stats Strip */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 md:grid-cols-4 gap-4"
            >
              {[
                { label: 'Portfolio Value', value: `₹${totalValue.toLocaleString('en-IN')}`, color: 'text-white' },
                { label: 'Deployed', value: `₹${deployed.toLocaleString('en-IN')}`, color: 'text-white' },
                { label: 'Unrealized P&L', value: `₹${unrealizedPnl.toLocaleString('en-IN')}`, color: unrealizedPnl >= 0 ? 'text-up' : 'text-down' },
                { label: "Today's P&L", value: `₹${dayPnl.toLocaleString('en-IN')}`, color: dayPnl >= 0 ? 'text-up' : 'text-down' },
              ].map((stat) => (
                <motion.div key={stat.label} variants={itemVariants} className="data-card p-4">
                  <p className="stat-label mb-1">{stat.label}</p>
                  <p className={`stat-value ${stat.color}`}>{stat.value}</p>
                </motion.div>
              ))}
            </motion.div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} lines={4} showAvatar />
                ))}
              </div>
            ) : positions.length === 0 ? (
              <EmptyState
                icon={<Briefcase className="w-8 h-8" />}
                title="No Active Positions"
                description="Your portfolio is empty. Positions will appear here when SwingMax signals are executed."
                actionLabel="View Signals"
                actionHref="/swingmax-signal"
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Positions Grid */}
                <div className="lg:col-span-2">
                  <h2 className="text-lg font-semibold text-white mb-4">Current Positions ({positions.length})</h2>
                  <motion.div
                    variants={containerVariants}
                    initial="hidden"
                    animate="visible"
                    className="grid grid-cols-1 md:grid-cols-2 gap-4"
                  >
                    {positions.map((pos) => {
                      const pnl = pos.unrealized_pnl || 0
                      const pnlPct = pos.unrealized_pnl_percentage || pos.unrealized_pnl_percent || 0
                      const entry = pos.entry_price || pos.average_price || 0
                      const progress = pos.target && entry ? Math.min(100, Math.max(0, ((pos.current_price - entry) / (pos.target - entry)) * 100)) : 0

                      return (
                        <motion.div key={pos.id} variants={itemVariants} className="data-card p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <StockAvatar symbol={pos.symbol} size="sm" />
                              <div>
                                <span className="text-white font-semibold text-sm">{pos.symbol}</span>
                                <span className="text-d-text-muted text-xs ml-1">{pos.exchange}</span>
                              </div>
                            </div>
                            <SignalBadge direction={pos.direction} />
                          </div>

                          <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
                            <div>
                              <p className="stat-label">Entry</p>
                              <p className="text-white font-mono num-display font-medium tabular-nums">{entry.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="stat-label">Current</p>
                              <p className="text-white font-mono num-display font-medium tabular-nums">{pos.current_price?.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="stat-label">Qty</p>
                              <p className="text-white font-mono num-display font-medium tabular-nums">{pos.quantity}</p>
                            </div>
                          </div>

                          {/* P&L */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-1.5">
                              {pnl >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-up" /> : <TrendingDown className="w-3.5 h-3.5 text-down" />}
                              <span className={`text-sm font-bold font-mono num-display tabular-nums ${pnl >= 0 ? 'text-up' : 'text-down'}`}>
                                ₹{Math.abs(pnl).toFixed(0)} ({pnlPct > 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                              </span>
                            </div>
                            <span className="text-[10px] text-d-text-muted">
                              Target: {pos.target?.toFixed(2) || '--'}
                            </span>
                          </div>

                          {/* Progress toward target */}
                          <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden mb-3">
                            <div
                              className={`h-full rounded-full ${pnl >= 0 ? 'bg-up' : 'bg-down'}`}
                              style={{ width: `${Math.abs(progress)}%` }}
                            />
                          </div>

                          <button
                            onClick={() => handleClose(pos.id)}
                            disabled={closingId === pos.id}
                            className="w-full text-center text-xs text-d-text-muted hover:text-down transition-colors py-1.5 border border-d-border rounded-xl hover:border-down/30"
                          >
                            {closingId === pos.id ? 'Closing...' : 'Close Position'}
                          </button>
                        </motion.div>
                      )
                    })}
                  </motion.div>
                </div>

                {/* Allocation Pie */}
                <div>
                  <h2 className="text-lg font-semibold text-white mb-4">Allocation</h2>
                  <div className="glass-card p-4">
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={55}
                            outerRadius={85}
                            strokeWidth={2}
                            stroke="#131722"
                          >
                            {pieData.map((_, i) => (
                              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={TOOLTIP_STYLE}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Value']}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-[220px] flex items-center justify-center text-d-text-muted text-sm">No positions</div>
                    )}
                    <div className="mt-4 space-y-2">
                      {pieData.map((d, i) => (
                        <div key={d.name} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                            <span className="text-white">{d.name}</span>
                          </div>
                          <span className="text-d-text-muted font-mono num-display tabular-nums">₹{d.value.toLocaleString('en-IN')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ==================== PERFORMANCE TAB ==================== */}
        {mainTab === 'performance' && (
          <>
            {/* Performance Stats */}
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
            >
              {[
                { label: 'Total Return', value: performance.total_pnl != null ? `₹${Number(performance.total_pnl).toLocaleString('en-IN')}` : '--', color: (performance.total_pnl || 0) >= 0 ? 'text-up' : 'text-down' },
                { label: 'Win Rate', value: performance.win_rate != null ? `${performance.win_rate}%` : '--', color: 'text-primary' },
                { label: 'Total Trades', value: `${performance.total_trades || 0}`, color: 'text-white' },
                { label: 'Profit Factor', value: performance.profit_factor != null ? `${Number(performance.profit_factor).toFixed(1)}` : '--', color: 'text-white' },
                { label: 'Avg Win', value: performance.avg_win != null ? `₹${Number(performance.avg_win).toFixed(0)}` : '--', color: 'text-up' },
                { label: 'Avg Loss', value: performance.avg_loss != null ? `₹${Math.abs(Number(performance.avg_loss)).toFixed(0)}` : '--', color: 'text-down' },
              ].map((stat) => (
                <motion.div key={stat.label} variants={itemVariants} className="data-card p-4">
                  <p className="stat-label mb-1">{stat.label}</p>
                  <p className={`stat-value text-lg ${stat.color}`}>{stat.value}</p>
                </motion.div>
              ))}
            </motion.div>

            {/* Equity Curve */}
            <div className="glass-card p-5 relative overflow-hidden">
              <div className="aurora-cyan -top-40 -right-40 opacity-50" />
              <div className="flex items-center justify-between mb-4 relative z-10">
                <h3 className="text-white font-semibold">Equity Curve</h3>
                <PillTabs tabs={PERIOD_TABS} activeTab={period} onChange={setPeriod} size="sm" />
              </div>
              {historyData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={historyData}>
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--chart-primary, #4FECCD)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="var(--chart-primary, #4FECCD)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) => {
                        const d = new Date(v)
                        return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                      }}
                    />
                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelStyle={{ color: '#71717a' }}
                      itemStyle={{ color: '#4FECCD' }}
                      formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Equity']}
                    />
                    <Area
                      type="monotone"
                      dataKey="equity"
                      stroke="var(--chart-primary, #4FECCD)"
                      strokeWidth={2}
                      fill="url(#equityGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-d-text-muted text-sm">
                  No history data available for this period
                </div>
              )}
            </div>

            {/* Top Performers */}
            {performance.best_trade && (
              <div className="glass-card p-5">
                <h3 className="text-white font-semibold mb-4">Highlights</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-up/5 border border-up/20 rounded-xl p-4">
                    <p className="stat-label mb-1">Best Trade</p>
                    <p className="text-up font-bold font-mono num-display tabular-nums text-lg">₹{Number(performance.best_trade).toLocaleString('en-IN')}</p>
                  </div>
                  <div className="bg-down/5 border border-down/20 rounded-xl p-4">
                    <p className="stat-label mb-1">Worst Trade</p>
                    <p className="text-down font-bold font-mono num-display tabular-nums text-lg">₹{Number(performance.worst_trade).toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAQ */}
      <div className="max-w-7xl mx-auto px-4 pb-8 md:px-6">
        <FAQAccordion items={FAQ_ITEMS} />
      </div>
    </>
  )
}
