'use client'

/**
 * /momentum — F3 Momentum Picks (Pro+).
 *
 * Step 1 §3.3 lock: this surface replaces the old /quantai-alpha-pick.
 * Same data flow as before, but engine names now match the public moat
 * (AlphaRank cross-sectional ranker · HorizonCast trajectory forecaster
 * · RegimeIQ gate). The legacy /quantai-alpha-pick route redirects here.
 */

import React, { useEffect, useState, useCallback } from 'react'
import { Brain, ExternalLink, Trophy, TrendingUp } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import Link from 'next/link'
import StrategyHero from '@/components/strategy/StrategyHero'
import FAQAccordion from '@/components/strategy/FAQAccordion'
import PillTabs from '@/components/ui/PillTabs'
import StockAvatar from '@/components/ui/StockAvatar'
import EmptyState from '@/components/ui/EmptyState'
import SkeletonCard from '@/components/ui/SkeletonCard'
import { api, handleApiError } from '@/lib/api'
import type { Signal } from '@/types'

const MAIN_TABS = [
  { label: "Today's Picks", value: 'picks' },
  { label: 'Previous Winners', value: 'winners' },
  { label: 'Performance', value: 'performance' },
]

const PERIOD_TABS = [
  { label: '1M', value: '30' },
  { label: '3M', value: '90' },
  { label: '6M', value: '180' },
  { label: '1Y', value: '365' },
]

// PR 91 — FAQ rewritten to match the actual architecture. Prior copy
// referenced four retired hand-coded strategies (consolidation breakout,
// trend pullback, volume reversal, BOS structure) that were removed
// from default signal generation per Step 1 §3.1. Engine names use the
// public moat (AlphaRank / HorizonCast / RegimeIQ) — internal model
// architecture names never appear.
const FAQ_ITEMS = [
  {
    question: 'What is Momentum Picks?',
    answer: 'Momentum Picks is a weekly Top-10 list of NSE stocks scored by the AlphaRank cross-sectional ranker and confirmed by the HorizonCast trajectory forecaster. RegimeIQ gates the output — in a bear regime, the list shrinks and sizing is halved automatically.',
  },
  {
    question: 'How are stocks selected?',
    answer: 'AlphaRank scores every Nifty 500 stock cross-sectionally each evening. The top quintile passes to HorizonCast, which projects 5-15 day price trajectories. Stocks where both engines agree above the quality threshold land on the picks list. RegimeIQ adds the final gate.',
  },
  {
    question: 'What is the typical holding period?',
    answer: 'Momentum Picks are designed for 5-15 trading days. Each pick lists entry, stop-loss, and target levels — no open-ended holds.',
  },
  {
    question: 'Can I see historical performance?',
    answer: 'Yes. The Performance tab shows cumulative returns vs the Nifty 50 benchmark with hit rate and average return. Every closed pick — wins and losses — also surfaces on the public Track Record.',
  },
  {
    question: 'How often are new picks published?',
    answer: 'New picks publish daily before the open at 8:30 AM IST. The list refreshes intraday only when AlphaRank rerank shifts a stock significantly.',
  },
]

export default function MomentumPage() {
  const [mainTab, setMainTab] = useState('picks')
  const [period, setPeriod] = useState('90')
  const [picks, setPicks] = useState<any[]>([])
  const [winners, setWinners] = useState<Signal[]>([])
  const [perfData, setPerfData] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)

  const fetchPicks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.screener.getSwingCandidates(30)
      setPicks(data.results || [])
    } catch (err) {
      console.error('Failed to fetch picks:', handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchWinners = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.signals.getHistory({ status: 'target_hit', limit: 30 })
      setWinners(data.signals || [])
    } catch (err) {
      console.error('Failed to fetch winners:', handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchPerformance = useCallback(async () => {
    try {
      const data = await api.signals.getPerformance(Number(period))
      setPerfData(data || {})
    } catch (err) {
      console.error('Failed to fetch performance:', handleApiError(err))
    }
  }, [period])

  useEffect(() => {
    if (mainTab === 'picks') fetchPicks()
    else if (mainTab === 'winners') fetchWinners()
    else if (mainTab === 'performance') fetchPerformance()
  }, [mainTab, fetchPicks, fetchWinners, fetchPerformance])

  return (
    <div>
      {/* Hero */}
      <StrategyHero
        breadcrumb={[
          { label: 'Home', href: '/dashboard' },
          { label: 'Momentum Picks' },
        ]}
        title="Momentum Picks"
        description="AlphaRank cross-sectional ranker + HorizonCast trajectory forecaster, gated by RegimeIQ. Daily Top-10 with entry, target, and stop-loss levels."
        imageSrc="/images/quant_ai.png"
        learnMoreHref="/pricing"
      />

      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-6 relative overflow-hidden">
        <div className="aurora-cyan absolute -top-20 left-1/4 opacity-50" />
        {/* Tabs */}
        <PillTabs tabs={MAIN_TABS} activeTab={mainTab} onChange={setMainTab} className="mb-8" />

        {/* ==================== TODAY'S PICKS ==================== */}
        {mainTab === 'picks' && (
          <>
            {loading ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} lines={4} showAvatar />
                ))}
              </div>
            ) : picks.length === 0 ? (
              <EmptyState
                icon={<Brain className="h-8 w-8" />}
                title="No Picks Today"
                description="Picks publish before market open at 8:30 AM IST. Check back after the morning scan completes."
              />
            ) : (
              <>
                <p className="mb-4 text-sm text-d-text-muted">{picks.length} picks for today</p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {picks.map((pick, i) => {
                    const symbol = pick.symbol || pick.Symbol || ''
                    const price = pick.price || pick.Price || pick.ltp || 0
                    const target = pick.target || pick.Target || pick.resistance || 0
                    const sl = pick.stop_loss || pick.support || 0
                    const confidence = pick.confidence || pick.Confidence || 0
                    const change = pick.change_percent || pick.Change || 0
                    const sector = pick.sector || pick.Sector || ''

                    return (
                      <div
                        key={`${symbol}-${i}`}
                        className="glass-card rounded-xl border border-d-border p-4 transition-all duration-200 hover:border-d-border-hover"
                      >
                        {/* Header */}
                        <div className="mb-3 flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <StockAvatar symbol={symbol} size="md" />
                            <div>
                              <p className="text-sm font-semibold text-white">{symbol}</p>
                              {sector && <p className="text-[10px] text-d-text-muted">{sector}</p>}
                            </div>
                          </div>
                          <span className={`rounded-md px-2 py-0.5 font-mono num-display text-xs font-medium ${change >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                            {change >= 0 ? '+' : ''}{Number(change).toFixed(1)}%
                          </span>
                        </div>

                        {/* Price Grid */}
                        <div className="mb-3 grid grid-cols-3 gap-3">
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Entry</p>
                            <p className="font-mono num-display text-sm font-medium text-white">₹{Number(price).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Target</p>
                            <p className="font-mono num-display text-sm text-up">₹{target ? Number(target).toFixed(2) : '--'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Stop Loss</p>
                            <p className="font-mono num-display text-sm text-down">₹{sl ? Number(sl).toFixed(2) : '--'}</p>
                          </div>
                        </div>

                        {/* Confidence */}
                        {confidence > 0 && (
                          <div className="mb-3">
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Engine confidence</span>
                              <span className="font-mono num-display text-xs text-white">{confidence}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${confidence}%` }} />
                            </div>
                          </div>
                        )}

                        {/* Action */}
                        <Link
                          href={`/stock/${symbol}`}
                          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/20 py-2 text-center text-xs text-primary transition-colors hover:bg-primary/10 hover:text-white"
                        >
                          Explore <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ==================== PREVIOUS WINNERS ==================== */}
        {mainTab === 'winners' && (
          <>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <SkeletonCard key={i} lines={2} showAvatar />
                ))}
              </div>
            ) : winners.length === 0 ? (
              <EmptyState
                icon={<Trophy className="h-8 w-8" />}
                title="No Winners Yet"
                description="Winning picks will appear here once positions hit their targets."
              />
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-d-border">
                        {['Symbol', 'Direction', 'Entry', 'Exit/Target', 'Return', 'Date'].map((h) => (
                          <th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-d-text-muted first:pl-0">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {winners.map((signal) => {
                        const entry = signal.entry_price || 0
                        const target = signal.target_1 || signal.target || 0
                        const ret = entry ? ((target - entry) / entry * 100) : 0
                        return (
                          <tr key={signal.id} className="border-b border-d-border/50 transition-colors hover:bg-white/[0.02]">
                            <td className="px-3 py-3 first:pl-0">
                              <div className="flex items-center gap-2.5">
                                <StockAvatar symbol={signal.symbol} size="sm" />
                                <span className="text-sm font-medium text-white">{signal.symbol}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${signal.direction === 'LONG' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                                {signal.direction}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-mono num-display text-sm text-white">₹{entry.toFixed(2)}</td>
                            <td className="px-3 py-3 font-mono num-display text-sm text-up">₹{target.toFixed(2)}</td>
                            <td className="px-3 py-3">
                              <span className={`font-mono num-display text-sm font-bold ${ret >= 0 ? 'text-up' : 'text-down'}`}>
                                {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-3 py-3 text-xs text-d-text-muted">
                              {signal.created_at ? new Date(signal.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '--'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="space-y-3 md:hidden">
                  {winners.map((signal) => {
                    const entry = signal.entry_price || 0
                    const target = signal.target_1 || signal.target || 0
                    const ret = entry ? ((target - entry) / entry * 100) : 0
                    return (
                      <div key={signal.id} className="glass-card rounded-xl border border-d-border p-4">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StockAvatar symbol={signal.symbol} size="sm" />
                            <span className="text-sm font-semibold text-white">{signal.symbol}</span>
                          </div>
                          <span className={`font-mono num-display text-sm font-bold ${ret >= 0 ? 'text-up' : 'text-down'}`}>
                            {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-xs text-d-text-muted">Entry:</span>
                            <span className="ml-1 font-mono num-display text-white">₹{entry.toFixed(2)}</span>
                          </div>
                          <div>
                            <span className="text-xs text-d-text-muted">Target:</span>
                            <span className="ml-1 font-mono num-display text-up">₹{target.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ==================== PERFORMANCE ==================== */}
        {mainTab === 'performance' && (
          <>
            {/* Period selector */}
            <div className="mb-4 flex justify-end">
              <PillTabs tabs={PERIOD_TABS} activeTab={period} onChange={setPeriod} size="sm" />
            </div>

            {/* Performance Stats */}
            <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'Total Picks', value: perfData.total_signals || perfData.total || '--' },
                { label: 'Avg Confidence', value: perfData.avg_confidence ? `${Number(perfData.avg_confidence).toFixed(0)}%` : '--' },
                { label: 'Hit Rate', value: perfData.hit_rate ? `${Number(perfData.hit_rate).toFixed(0)}%` : '--' },
                { label: 'Avg Return', value: perfData.avg_return ? `${Number(perfData.avg_return).toFixed(1)}%` : '--' },
              ].map((stat) => (
                <div key={stat.label} className="glass-card rounded-xl border border-d-border p-4">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-d-text-muted">{stat.label}</p>
                  <p className="font-mono num-display text-lg font-bold text-white">{stat.value}</p>
                </div>
              ))}
            </div>

            {/* Performance Chart */}
            <div className="glass-card rounded-xl border border-d-border p-5">
              <h3 className="mb-4 font-semibold text-white">Picks return vs Nifty 50</h3>
              {perfData.performance && Array.isArray(perfData.performance) && perfData.performance.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={perfData.performance}>
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg, #232a3b)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8 }}
                      labelStyle={{ color: '#71717a' }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="total_return"
                      name="Momentum Picks"
                      stroke="#4FECCD"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[300px] flex-col items-center justify-center text-d-text-muted">
                  <TrendingUp className="mb-3 h-12 w-12 opacity-20" />
                  <p className="text-sm">Performance data will appear after more picks resolve</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* FAQ */}
      <div className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
        <FAQAccordion items={FAQ_ITEMS} />
      </div>
    </div>
  )
}
