'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Target, Clock, TrendingUp, ArrowUpDown, X, AlertTriangle, Zap } from 'lucide-react'
import { toast } from 'sonner'
import StrategyHero from '@/components/strategy/StrategyHero'
import StatsBar from '@/components/strategy/StatsBar'
import FAQAccordion from '@/components/strategy/FAQAccordion'
import PillTabs from '@/components/ui/PillTabs'
import StockAvatar from '@/components/ui/StockAvatar'
import SignalBadge from '@/components/ui/SignalBadge'
import ModelScoreBadge from '@/components/ui/ModelScoreBadge'
import BeamButton from '@/components/ui/BeamButton'
import EmptyState from '@/components/ui/EmptyState'
import SkeletonCard from '@/components/ui/SkeletonCard'
import { api, handleApiError } from '@/lib/api'
import type { Signal } from '@/types'
import { RegimeBanner } from '@/components/dashboard/RegimeBanner'

type TabValue = 'opening' | 'intraday' | 'closed'
type SortValue = 'latest' | 'highest_return' | 'oldest'

const TABS = [
  { label: 'Opening', value: 'opening' },
  { label: 'Intraday', value: 'intraday' },
  { label: 'Closed', value: 'closed' },
]

const SEGMENT_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Equity', value: 'EQUITY' },
  { label: 'F&O', value: 'FUTURES' },
]

// PR 83 — FAQ rewritten to match the current AI architecture. Prior copy
// referenced six retired hand-coded strategies (consolidation breakout,
// trend pullback, candle reversal, BOS structure, volume reversal) that
// were removed from default signal generation per Step 1 §3.1. We now
// describe the multi-engine ensemble using public engine brand names —
// internal model architecture names (TFT/Qlib/LightGBM/HMM/etc.) never
// appear in user-facing copy per the engine-name moat.
const FAQ_ITEMS = [
  {
    question: 'What is SwingMax AI Signal?',
    answer: 'SwingMax fuses output from a stack of proprietary AI engines — SwingLens (price-band forecaster), AlphaRank (cross-sectional ranker), HorizonCast (trajectory forecaster), ToneScan (news sentiment), and RegimeIQ (market regime gate) — into a single high-conviction swing setup with defined entry, stop-loss, and multiple targets. Every signal lists which engines agreed.',
  },
  {
    question: 'How are signals generated?',
    answer: 'Each morning before the open, the engines independently rate every Nifty 500 stock. Their outputs are combined cross-sectionally — not voted equally; each engine\'s weight is set from its own rolling-window accuracy. RegimeIQ gates the whole stack: in a bear regime, signal sizing is automatically halved. Only setups where the engines agree above our quality threshold are published.',
  },
  {
    question: 'Can I automate trade execution?',
    answer: 'Yes. Connect your broker (Zerodha, Angel One, or Upstox) and enable Semi-Auto or Full-Auto in Settings. Semi-Auto queues trades for your approval; Full-Auto routes immediately within your risk rails. Live auto-trading is an Elite feature; paper-trade is free.',
  },
  {
    question: 'What are Target 1 and Target 2?',
    answer: 'Target 1 is the conservative profit target — book partial profits (50-70%) here. Target 2 is the extended target; once price clears it, trail the remaining position by moving stop to T2 and let the trend run.',
  },
  {
    question: 'How is stop loss calculated?',
    answer: 'Stops are set using ATR-based volatility bands plus the nearest structural support/resistance level. This adapts to each stock\'s own volatility — tight enough to control downside, loose enough to avoid getting whipsawed out of valid setups.',
  },
  {
    question: 'What time are signals published?',
    answer: 'Swing signals publish at 8:30 AM IST daily — you have ~45 minutes before the 9:15 AM open to review. Intraday signals (TickPulse) refresh every 5 minutes during market hours when that engine ships.',
  },
  {
    question: 'How is engine accuracy tracked?',
    answer: 'Every closed signal — wins and losses — is published to the public Track Record. Per-engine win rates, average return, and Sharpe ratio are recomputed weekly and live on the Model Accuracy page. Real outcomes only; nothing is curated or cherry-picked.',
  },
]

export default function SwingMaxSignalPage() {
  const [tab, setTab] = useState<TabValue>('opening')
  const [segment, setSegment] = useState('all')
  const [sort, setSort] = useState<SortValue>('latest')
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ winRate: '--', annReturn: '--', totalToday: 0, avgRR: '--' })
  const [executingId, setExecutingId] = useState<string | null>(null)
  const [confirmSignal, setConfirmSignal] = useState<Signal | null>(null)
  // PR 52 — hide Intraday tab content when TickPulse model isn't trained yet.
  const [tickpulseReady, setTickpulseReady] = useState<boolean | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const s = await api.publicTrust.modelsStatus()
        setTickpulseReady(Boolean(s.models?.tickpulse))
      } catch {
        setTickpulseReady(false)
      }
    })()
  }, [])

  const fetchSignals = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'opening') {
        const data = await api.signals.getToday()
        setSignals(data.all_signals || [])
        setStats(prev => ({ ...prev, totalToday: data.total || 0 }))
      } else if (tab === 'intraday') {
        // PR 52 — if TickPulse model isn't live yet, show empty list and
        // rely on the coming-soon empty state below. No simulated data.
        if (tickpulseReady === false) {
          setSignals([])
          setStats(prev => ({ ...prev, totalToday: 0 }))
        } else {
          const data = await api.signals.getIntraday(60)
          setSignals(data.signals || [])
          setStats(prev => ({ ...prev, totalToday: data.total || 0 }))
        }
      } else {
        const data = await api.signals.getHistory({ limit: 50 })
        setSignals(data.signals || [])
      }
    } catch (err) {
      console.error('Failed to fetch signals:', handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [tab, tickpulseReady])

  useEffect(() => {
    fetchSignals()
  }, [fetchSignals])

  useEffect(() => {
    api.signals.getPerformance(30).then(data => {
      if (data) {
        const perf = Array.isArray(data.performance) ? data.performance : []
        const wins = perf.filter((p: any) => (p.total_return || 0) > 0).length
        const total = perf.length || 1
        setStats(prev => ({
          ...prev,
          winRate: `${Math.round((wins / total) * 100)}%`,
          avgRR: data.avg_risk_reward ? `${Number(data.avg_risk_reward).toFixed(1)}` : '2.5',
        }))
      }
    }).catch(() => {})
  }, [])

  // Filter by segment
  const filtered = segment === 'all' ? signals : signals.filter(s => s.segment === segment)

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'latest') return new Date(b.created_at || b.date || '').getTime() - new Date(a.created_at || a.date || '').getTime()
    if (sort === 'oldest') return new Date(a.created_at || a.date || '').getTime() - new Date(b.created_at || b.date || '').getTime()
    if (sort === 'highest_return') return (b.risk_reward_ratio || b.risk_reward || 0) - (a.risk_reward_ratio || a.risk_reward || 0)
    return 0
  })

  const handleExecute = async (signal: Signal) => {
    setExecutingId(signal.id)
    try {
      const result = await api.trades.execute({ signal_id: signal.id })
      if (result.success) {
        toast.success(`Trade queued: ${signal.symbol} ${signal.direction} @ ${result.entry_price}`)
        setConfirmSignal(null)
        fetchSignals()
      }
    } catch (err) {
      toast.error(handleApiError(err))
    } finally {
      setExecutingId(null)
    }
  }

  const statsBarData = [
    { label: 'Win Rate', value: stats.winRate, trend: 'up' as const },
    { label: 'Signals Today', value: `${stats.totalToday}` },
    { label: 'Avg R:R', value: stats.avgRR, trend: 'up' as const },
  ]

  return (
    <div>
      {/* Hero */}
      <StrategyHero
        breadcrumb={[
          { label: 'Home', href: '/dashboard' },
          { label: 'SwingMax Signal' },
        ]}
        title="SwingMax AI Signal"
        description="AI-powered swing trade signals with defined entry, stop-loss and multiple targets. Follow signals or automate execution via connected brokers."
        imageSrc="/images/swingmax.png"
        learnMoreHref="/pricing"
      />

      {/* Regime Banner */}
      <div className="mx-auto max-w-7xl px-4 pt-6 lg:px-6">
        <RegimeBanner />
      </div>

      {/* Stats */}
      <StatsBar stats={statsBarData} />

      {/* Main content */}
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 relative overflow-hidden">
        <div className="aurora-cyan absolute -top-20 left-1/4 opacity-50" />
        {/* Controls */}
        <div className="mb-6 flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-3">
            <PillTabs tabs={TABS} activeTab={tab} onChange={(v) => setTab(v as TabValue)} />
            <div className="hidden h-6 w-px bg-d-border md:block" />
            <PillTabs tabs={SEGMENT_TABS} activeTab={segment} onChange={setSegment} size="sm" />
          </div>
          <div className="flex items-center gap-3">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortValue)}
              className="glass-input rounded-lg border border-d-border bg-d-bg-card px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
            >
              <option value="latest">Latest Signals</option>
              <option value="highest_return">Highest R:R</option>
              <option value="oldest">Oldest First</option>
            </select>
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} lines={4} showAvatar />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && sorted.length === 0 && (
          <EmptyState
            icon={<Target className="w-8 h-8" />}
            title={
              tab === 'opening'  ? 'No Active Signals' :
              tab === 'intraday'
                ? (tickpulseReady === false
                    ? 'Intraday — coming soon'
                    : 'No Intraday Signals Right Now')
                : 'No Closed Signals'
            }
            description={
              tab === 'opening'
                ? "We're scanning the market. Signals are published at 8:30 AM IST before market open."
                : tab === 'intraday'
                  ? (tickpulseReady === false
                      ? 'The TickPulse engine is still being trained on 5-minute NSE data. We don\u2019t ship simulated AI — this tab lights up the moment the trained model goes live.'
                      : 'TickPulse scans every 5 minutes during market hours (09:30\u201315:10 IST). Fresh intraday signals auto-expire after 1 hour — check back shortly.')
                  : 'Closed signals will appear here once positions are exited.'
            }
          />
        )}

        {/* Desktop Signal Table */}
        {!loading && sorted.length > 0 && (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-d-border">
                    {['Symbol', 'Direction', 'Entry', 'Target 1', 'Target 2', 'Stop Loss', 'R:R', 'Confidence', 'Time', tab === 'opening' ? 'Action' : 'Status'].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-d-text-muted first:pl-0">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((signal) => (
                    <tr
                      key={signal.id}
                      className="border-b border-d-border/50 transition-colors hover:bg-white/[0.02]"
                    >
                      <td className="px-3 py-3 first:pl-0">
                        <div className="flex items-center gap-2.5">
                          <StockAvatar symbol={signal.symbol} size="sm" />
                          <div>
                            <span className="text-sm font-medium text-white">{signal.symbol}</span>
                            <span className="ml-1 text-xs text-d-text-muted">{signal.exchange}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <SignalBadge direction={signal.direction} />
                      </td>
                      <td className="px-3 py-3 font-mono num-display text-sm font-medium text-white">
                        {signal.entry_price?.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 font-mono num-display text-sm text-up">
                        {(signal.target_1 || signal.target)?.toFixed(2) || '--'}
                      </td>
                      <td className="px-3 py-3 font-mono num-display text-sm text-up">
                        {signal.target_2?.toFixed(2) || '--'}
                      </td>
                      <td className="px-3 py-3 font-mono num-display text-sm text-down">
                        {signal.stop_loss?.toFixed(2)}
                      </td>
                      <td className="px-3 py-3 font-mono num-display text-sm text-white">
                        {(signal.risk_reward_ratio || signal.risk_reward)?.toFixed(1) || '--'}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/5">
                            <div
                              className={`h-full rounded-full ${signal.confidence >= 70 ? 'bg-orange' : signal.confidence >= 40 ? 'bg-warning' : 'bg-down'}`}
                              style={{ width: `${signal.confidence}%` }}
                            />
                          </div>
                          <span className="font-mono num-display text-xs text-d-text-muted">{signal.confidence}%</span>
                          {(signal.catboost_score != null && signal.catboost_score > 0) && (
                            <ModelScoreBadge score={signal.catboost_score} modelName="Strength" />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-d-text-muted">
                        {signal.created_at || signal.date
                          ? new Date(signal.created_at || signal.date || '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
                          : '--'}
                      </td>
                      <td className="px-3 py-3">
                        {tab === 'opening' ? (
                          <BeamButton
                            size="sm"
                            variant="primary"
                            onClick={() => setConfirmSignal(signal)}
                            disabled={executingId === signal.id}
                          >
                            <Zap className="h-3.5 w-3.5" />
                            Execute
                          </BeamButton>
                        ) : (
                          <span
                            className={`rounded-md px-2 py-1 text-xs font-medium ${
                              signal.status === 'target_hit'
                                ? 'bg-up/10 text-up'
                                : signal.status === 'sl_hit' || signal.status === 'stop_loss_hit'
                                ? 'bg-down/10 text-down'
                                : 'bg-white/5 text-d-text-muted'
                            }`}
                          >
                            {signal.status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Closed'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Signal Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:hidden">
              {sorted.map((signal) => (
                <div
                  key={signal.id}
                  className="glass-card rounded-xl border border-d-border p-4 transition-colors hover:border-d-border-hover"
                >
                  {/* Header */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <StockAvatar symbol={signal.symbol} size="sm" />
                      <div>
                        <span className="text-sm font-semibold text-white">{signal.symbol}</span>
                        <span className="ml-1 text-xs text-d-text-muted">{signal.exchange}</span>
                      </div>
                    </div>
                    <SignalBadge direction={signal.direction} />
                  </div>

                  {/* Price grid */}
                  <div className="mb-3 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Entry</p>
                      <p className="font-mono num-display text-sm font-medium text-white">{signal.entry_price?.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Target 1</p>
                      <p className="font-mono num-display text-sm text-up">{(signal.target_1 || signal.target)?.toFixed(2) || '--'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Stop Loss</p>
                      <p className="font-mono num-display text-sm text-down">{signal.stop_loss?.toFixed(2)}</p>
                    </div>
                  </div>

                  {/* Confidence + R:R */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/5">
                        <div className={`h-full rounded-full ${signal.confidence >= 70 ? 'bg-orange' : signal.confidence >= 40 ? 'bg-warning' : 'bg-down'}`} style={{ width: `${signal.confidence}%` }} />
                      </div>
                      <span className="font-mono num-display text-xs text-d-text-muted">{signal.confidence}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {(signal.catboost_score != null && signal.catboost_score > 0) && (
                        <ModelScoreBadge score={signal.catboost_score} modelName="Strength" />
                      )}
                      <span className="font-mono num-display text-xs text-white">
                        R:R {(signal.risk_reward_ratio || signal.risk_reward)?.toFixed(1) || '--'}
                      </span>
                    </div>
                  </div>

                  {/* Action */}
                  {tab === 'opening' ? (
                    <BeamButton
                      size="sm"
                      variant="primary"
                      fullWidth
                      onClick={() => setConfirmSignal(signal)}
                      disabled={executingId === signal.id}
                    >
                      <Zap className="h-3.5 w-3.5" />
                      Execute Trade
                    </BeamButton>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-d-text-muted">
                        {signal.created_at ? new Date(signal.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '--'}
                      </span>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-medium ${
                          signal.status === 'target_hit'
                            ? 'bg-up/10 text-up'
                            : signal.status === 'sl_hit' || signal.status === 'stop_loss_hit'
                            ? 'bg-down/10 text-down'
                            : 'bg-white/5 text-d-text-muted'
                        }`}
                      >
                        {signal.status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Closed'}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Execute Confirmation Modal */}
      {confirmSignal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
          <div className="glass-card w-full max-w-md rounded-2xl border border-d-border-hover p-6 shadow-2xl shadow-black/50">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Confirm Trade</h3>
              <button onClick={() => setConfirmSignal(null)} className="text-d-text-muted transition hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-5 flex items-center gap-3">
              <StockAvatar symbol={confirmSignal.symbol} size="lg" />
              <div>
                <p className="text-lg font-bold text-white">{confirmSignal.symbol}</p>
                <SignalBadge direction={confirmSignal.direction} />
              </div>
            </div>

            <div className="mb-5 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-white/[0.03] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Entry Price</p>
                <p className="font-mono num-display font-bold text-white">{confirmSignal.entry_price?.toFixed(2)}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Stop Loss</p>
                <p className="font-mono num-display font-bold text-down">{confirmSignal.stop_loss?.toFixed(2)}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Target 1</p>
                <p className="font-mono num-display font-bold text-up">{(confirmSignal.target_1 || confirmSignal.target)?.toFixed(2) || '--'}</p>
              </div>
              <div className="rounded-lg bg-white/[0.03] p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Risk:Reward</p>
                <p className="font-mono num-display font-bold text-primary">{(confirmSignal.risk_reward_ratio || confirmSignal.risk_reward)?.toFixed(1) || '--'}</p>
              </div>
            </div>

            <div className="mb-5 flex items-start gap-2 rounded-lg border border-warning/20 bg-warning/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <p className="text-xs text-d-text-secondary">
                Position size will be calculated based on your risk settings. Ensure your broker is connected for live execution.
              </p>
            </div>

            <div className="flex gap-3">
              <BeamButton
                variant="ghost"
                onClick={() => setConfirmSignal(null)}
                className="flex-1"
              >
                Cancel
              </BeamButton>
              <BeamButton
                variant="primary"
                onClick={() => handleExecute(confirmSignal)}
                disabled={executingId === confirmSignal.id}
                className="flex-1"
              >
                {executingId === confirmSignal.id ? 'Executing...' : 'Confirm Execute'}
              </BeamButton>
            </div>
          </div>
        </div>
      )}

      {/* FAQ */}
      <div className="mx-auto max-w-7xl px-4 py-16 lg:px-6">
        <FAQAccordion items={FAQ_ITEMS} />
      </div>
    </div>
  )
}
