'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  Wallet,
  TrendingUp,
  BarChart3,
  Briefcase,
  Inbox,
  ArrowLeft,
  Stethoscope,
} from 'lucide-react'
import PillTabs from '@/components/ui/PillTabs'
import StockAvatar from '@/components/ui/StockAvatar'
import EmptyState from '@/components/ui/EmptyState'
import MiniSparkline from '@/components/ui/MiniSparkline'
import PriceChange from '@/components/ui/PriceChange'
import AppLayout from '@/components/shared/AppLayout'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Generate mock sparkline data based on P&L direction */
function generateSparkline(basePrice: number, pnlPercent: number): number[] {
  return Array.from({ length: 7 }, (_, i) =>
    basePrice * (1 + (pnlPercent / 100) * (i / 6) + (Math.random() - 0.5) * 0.01),
  )
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Position {
  id: string
  symbol: string
  quantity: number
  avg_price: number
  current_price: number
  pnl: number
  pnl_percent: number
  value: number
}

interface HistoryPoint {
  date: string
  value: number
}

/* ------------------------------------------------------------------ */
/*  Chart custom tooltip                                               */
/* ------------------------------------------------------------------ */

function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as HistoryPoint
  return (
    <div className="bg-d-bg-elevated border border-d-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-d-text-muted mb-1">{d.date}</p>
      <p className="text-sm font-bold font-mono num-display text-white">
        {'\u20B9'}{d.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const PERIOD_TABS = [
  { label: '1M', value: '30' },
  { label: '3M', value: '90' },
  { label: '6M', value: '180' },
  { label: '1Y', value: '365' },
]

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [chartLoading, setChartLoading] = useState(false)
  const [period, setPeriod] = useState('30')

  /* ---- Fetch positions ---- */
  useEffect(() => {
    api.positions
      .getOpen()
      .then((res) => {
        if (res.positions && res.positions.length > 0) {
          const mapped: Position[] = res.positions.map((p) => {
            const entryPrice = p.entry_price ?? p.average_price ?? 0
            const currentPrice = p.current_price ?? 0
            const qty = p.quantity ?? 0
            return {
              id: String(p.id),
              symbol: p.symbol,
              quantity: qty,
              avg_price: entryPrice,
              current_price: currentPrice,
              pnl: p.unrealized_pnl ?? 0,
              pnl_percent:
                p.unrealized_pnl_percentage ?? p.unrealized_pnl_percent ?? 0,
              value: currentPrice * qty,
            }
          })
          setPositions(mapped)
        } else {
          setPositions([])
        }
      })
      .catch(() => {
        setPositions([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  /* ---- Fetch portfolio history ---- */
  const fetchHistory = useCallback((days: number) => {
    setChartLoading(true)
    api.portfolio
      .getHistory(days)
      .then((res) => {
        if (res.history && res.history.length > 0) {
          const mapped: HistoryPoint[] = res.history.map((h: any) => ({
            date: h.date ?? new Date(h.timestamp ?? h.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
            value: h.portfolio_value ?? h.equity ?? h.value ?? 0,
          }))
          setHistory(mapped)
        } else {
          setHistory([])
        }
      })
      .catch(() => {
        setHistory([])
      })
      .finally(() => {
        setChartLoading(false)
      })
  }, [])

  useEffect(() => {
    fetchHistory(Number(period))
  }, [period, fetchHistory])

  /* ---- Derived values ---- */
  const totalValue = positions.reduce((s, p) => s + p.value, 0)
  const totalPnL = positions.reduce((s, p) => s + p.pnl, 0)
  const totalInvested = positions.reduce(
    (s, p) => s + p.avg_price * p.quantity,
    0,
  )
  const overallPnLPercent =
    totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0

  /* ---- Loading skeleton ---- */
  if (loading) {
    return (
      <AppLayout>
      <div className="px-4 md:px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* header skeleton */}
          <div className="h-8 w-40 rounded-lg bg-d-bg-card animate-skeleton-pulse" />
          <div className="h-4 w-64 rounded bg-d-bg-card animate-skeleton-pulse" />
          {/* stat skeleton */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="bg-d-bg-card rounded-lg border border-d-border p-5 space-y-3"
              >
                <div className="h-3 w-20 rounded bg-white/[0.03] animate-skeleton-pulse" />
                <div className="h-7 w-28 rounded bg-white/[0.03] animate-skeleton-pulse" />
              </div>
            ))}
          </div>
          {/* chart skeleton */}
          <div className="bg-d-bg-elevated rounded-xl border border-d-border h-72 animate-skeleton-pulse" />
          {/* rows skeleton */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="bg-d-bg-card rounded-lg border border-d-border p-5 h-16 animate-skeleton-pulse"
            />
          ))}
        </div>
      </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* ====== Header ====== */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Portfolio</h1>
            <p className="text-sm text-d-text-muted mt-1">
              Track your holdings and performance
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* PR 67 — discovery hook for the Portfolio Doctor (Pro) */}
            <Link
              href="/portfolio/doctor"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-primary/40 bg-primary/10 text-[12px] font-semibold text-primary hover:bg-primary/15 transition-colors"
            >
              <Stethoscope className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Run Portfolio Doctor</span>
              <span className="sm:hidden">Doctor</span>
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-sm text-d-text-muted hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          </div>
        </div>

        {/* ====== Summary Stat Cards ====== */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Portfolio Value */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-d-text-muted uppercase tracking-wider">
                Portfolio Value
              </span>
              <Wallet className="w-4 h-4 text-d-text-muted" />
            </div>
            <div className="text-2xl font-bold font-mono num-display text-white">
              {'\u20B9'}{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>

          {/* Total P&L */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-d-text-muted uppercase tracking-wider">
                Total P&L
              </span>
              <TrendingUp className="w-4 h-4 text-d-text-muted" />
            </div>
            <div
              className={`text-2xl font-bold font-mono num-display ${totalPnL >= 0 ? 'text-up' : 'text-down'}`}
            >
              {totalPnL >= 0 ? '+' : ''}
              {'\u20B9'}{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <PriceChange value={overallPnLPercent} size="sm" className="mt-1" />
          </div>

          {/* Positions */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-d-text-muted uppercase tracking-wider">
                Positions
              </span>
              <Briefcase className="w-4 h-4 text-d-text-muted" />
            </div>
            <div className="text-2xl font-bold text-primary">
              {positions.length}
            </div>
          </div>

          {/* Total Invested */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-d-text-muted uppercase tracking-wider">
                Total Invested
              </span>
              <BarChart3 className="w-4 h-4 text-d-text-muted" />
            </div>
            <div className="text-2xl font-bold font-mono num-display text-white">
              {'\u20B9'}{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
          </div>
        </div>

        {/* ====== Performance Chart ====== */}
        <div className="relative overflow-hidden glass-card p-5">
          <div className="aurora-cyan absolute -top-20 left-1/4 opacity-50" />
          {/* Ambient glow behind chart */}
          <div className="pointer-events-none absolute -inset-4 rounded-2xl bg-gradient-to-br from-primary/[0.03] via-transparent to-accent/[0.03] blur-2xl" />
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-white">Performance</h2>
            <PillTabs
              tabs={PERIOD_TABS}
              activeTab={period}
              onChange={setPeriod}
              size="sm"
            />
          </div>

          {chartLoading ? (
            <div className="h-64 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin-slow" />
            </div>
          ) : history.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={history}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary, #4FECCD)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-primary, #4FECCD)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-d-border, #202124)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-d-border, #202124)"
                    tick={{ fill: 'var(--color-d-text-muted, #9C9C9D)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="var(--color-d-border, #202124)"
                    tick={{ fill: 'var(--color-d-text-muted, #9C9C9D)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: number) =>
                      `\u20B9${(v / 1000).toFixed(0)}k`
                    }
                    width={60}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="var(--color-primary, #4FECCD)"
                    strokeWidth={2}
                    fill="url(#portfolioGrad)"
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-d-text-muted text-sm">
              No performance data available for this period
            </div>
          )}
        </div>

        {/* ====== Allocation Bar ====== */}
        {positions.length > 0 && (
          <div className="glass-card p-5">
            <h2 className="text-sm font-semibold text-white mb-3">Capital Allocation</h2>
            {/* Invested vs Cash bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-d-text-muted">
                <span>Invested</span>
                <span>
                  {'\u20B9'}{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  {' '}({totalValue > 0 ? ((totalInvested / totalValue) * 100).toFixed(0) : 0}%)
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-white/[0.05] overflow-hidden flex">
                <div
                  className="h-full rounded-full bg-primary/70 transition-all"
                  style={{ width: `${totalValue > 0 ? Math.min((totalInvested / totalValue) * 100, 100) : 0}%` }}
                />
                <div
                  className="h-full rounded-r-full bg-white/10 transition-all"
                  style={{ width: `${totalValue > 0 ? Math.max(100 - (totalInvested / totalValue) * 100, 0) : 100}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-xs text-d-text-muted">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-primary/70" />
                  Invested
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-white/10" />
                  Unrealized {totalPnL >= 0 ? 'Gain' : 'Loss'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== Positions Section ====== */}
        {positions.length === 0 ? (
          <div className="glass-card">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {/* Animated briefcase/chart SVG */}
              <div className="relative mb-5">
                <svg viewBox="0 0 150 120" width="150" height="120" className="mx-auto">
                  {/* Briefcase body */}
                  <rect x="30" y="40" width="90" height="60" rx="8" fill="none" className="text-white/10" stroke="currentColor" strokeWidth="1.5" />
                  {/* Briefcase handle */}
                  <path d="M55,40 V30 Q55,22 63,22 H87 Q95,22 95,30 V40" fill="none" className="text-white/10" stroke="currentColor" strokeWidth="1.5" />
                  {/* Briefcase clasp */}
                  <rect x="68" y="55" width="14" height="10" rx="2" className="text-white/10" fill="currentColor" />
                  {/* Chart line inside briefcase */}
                  <polyline
                    points="42,85 55,78 68,82 82,68 95,72 108,62"
                    fill="none"
                    className="text-primary"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="80"
                    strokeDashoffset="80"
                    style={{ animation: 'portfolio-line-draw 2s ease-out 0.3s forwards' }}
                  />
                  {/* Chart dot at end */}
                  <circle cx="108" cy="62" r="3" className="text-primary" fill="currentColor" opacity="0" style={{ animation: 'portfolio-dot-appear 0.3s ease-out 2.2s forwards' }} />
                </svg>
                <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/[0.03] blur-xl" />
                <style>{`
                  @keyframes portfolio-line-draw {
                    to { stroke-dashoffset: 0; }
                  }
                  @keyframes portfolio-dot-appear {
                    to { opacity: 0.8; }
                  }
                `}</style>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">No open positions</h3>
              <p className="text-sm text-d-text-muted max-w-sm mb-4">
                Once you execute trades, your open positions will appear here.
              </p>
              <a
                href="/signals"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm font-medium hover:bg-primary/20 transition-colors"
              >
                View Signals
              </a>
            </div>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            {/* Column headers (desktop) */}
            <div className="hidden md:grid grid-cols-[2.5fr_1fr_1.5fr_1.5fr_1fr_1.5fr_1.5fr] gap-4 px-5 py-3 border-b border-d-border text-xs text-d-text-muted uppercase tracking-wider">
              <div>Stock</div>
              <div className="text-right">Qty</div>
              <div className="text-right">Entry</div>
              <div className="text-right">Current</div>
              <div className="text-center">Trend</div>
              <div className="text-right">Value</div>
              <div className="text-right">P&L</div>
            </div>

            {/* Rows */}
            {positions.map((pos) => (
              <div
                key={pos.id}
                className="border-b border-d-border last:border-0 hover:bg-white/[0.02] transition-colors"
              >
                {/* Desktop row */}
                <div className="hidden md:grid grid-cols-[2.5fr_1fr_1.5fr_1.5fr_1fr_1.5fr_1.5fr] gap-4 items-center px-5 py-4">
                  {/* Symbol + avatar */}
                  <div className="flex items-center gap-3">
                    <StockAvatar symbol={pos.symbol} size="sm" />
                    <span className="font-semibold text-white">
                      {pos.symbol}
                    </span>
                  </div>
                  <div className="text-right text-white/60 text-sm font-mono num-display">
                    {pos.quantity}
                  </div>
                  <div className="text-right text-white/60 text-sm font-mono num-display">
                    {'\u20B9'}{pos.avg_price.toFixed(2)}
                  </div>
                  <div className="text-right text-white text-sm font-medium font-mono num-display">
                    {'\u20B9'}{pos.current_price.toFixed(2)}
                  </div>
                  {/* Sparkline */}
                  <div className="flex justify-center">
                    <MiniSparkline
                      data={generateSparkline(pos.avg_price, pos.pnl_percent)}
                      color={pos.pnl >= 0 ? 'up' : 'down'}
                      width={64}
                      height={24}
                    />
                  </div>
                  <div className="text-right text-white text-sm font-medium font-mono num-display">
                    {'\u20B9'}{pos.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-sm font-bold font-mono num-display ${pos.pnl >= 0 ? 'text-up' : 'text-down'}`}
                    >
                      {pos.pnl >= 0 ? '+' : ''}
                      {'\u20B9'}{pos.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                    <div className="flex justify-end mt-0.5">
                      <PriceChange value={pos.pnl_percent} size="sm" />
                    </div>
                  </div>
                </div>

                {/* Mobile row */}
                <div className="md:hidden px-4 py-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <StockAvatar symbol={pos.symbol} size="sm" />
                      <div>
                        <div className="font-semibold text-white text-sm">
                          {pos.symbol}
                        </div>
                        <div className="text-xs text-d-text-muted">
                          {pos.quantity} x {'\u20B9'}{pos.avg_price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-sm font-bold font-mono num-display ${pos.pnl >= 0 ? 'text-up' : 'text-down'}`}
                      >
                        {pos.pnl >= 0 ? '+' : ''}
                        {'\u20B9'}{pos.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                      <PriceChange value={pos.pnl_percent} size="sm" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-d-text-muted">
                    <span>
                      LTP: {'\u20B9'}{pos.current_price.toFixed(2)}
                    </span>
                    <MiniSparkline
                      data={generateSparkline(pos.avg_price, pos.pnl_percent)}
                      color={pos.pnl >= 0 ? 'up' : 'down'}
                      width={56}
                      height={20}
                    />
                    <span>
                      Value: {'\u20B9'}{pos.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
