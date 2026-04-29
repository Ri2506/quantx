'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  XCircle,
  BarChart3,
  Target,
  Inbox,
  Calendar,
  Download,
} from 'lucide-react'
import PillTabs from '@/components/ui/PillTabs'
import StockAvatar from '@/components/ui/StockAvatar'
import EmptyState from '@/components/ui/EmptyState'
import AppLayout from '@/components/shared/AppLayout'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Trade {
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  exit_price: number
  quantity: number
  pnl: number
  pnl_percent: number
  entry_date: string
  exit_date: string
  status: 'win' | 'loss'
}

interface PendingTrade {
  id: string
  symbol: string
  direction: string
  entry_price: number
  stop_loss: number
  target: number
  quantity: number
  created_at: string
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const FILTER_TABS = [
  { label: 'All', value: 'all' },
  { label: 'Wins', value: 'win' },
  { label: 'Losses', value: 'loss' },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDate(dateStr?: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/** Download trades as CSV */
function exportTradesCSV(trades: Trade[]) {
  const header = 'Date,Symbol,Direction,Entry,Exit,P&L,P&L%'
  const rows = trades.map(
    (t) =>
      `${t.entry_date}${t.exit_date ? ' -> ' + t.exit_date : ''},${t.symbol},${t.direction},${t.entry_price.toFixed(2)},${t.exit_price.toFixed(2)},${t.pnl.toFixed(2)},${t.pnl_percent.toFixed(2)}`,
  )
  const csv = [header, ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `trades_export_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([])
  const [pendingTrades, setPendingTrades] = useState<PendingTrade[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')

  /* ---- Fetch closed / executed trades ---- */
  useEffect(() => {
    api.trades
      .getAll()
      .then((res) => {
        if (res.trades && res.trades.length > 0) {
          const mapped: Trade[] = res.trades.map((t) => {
            const pnlValue = t.net_pnl ?? t.gross_pnl ?? t.realized_pnl ?? 0
            const pnlPct =
              t.pnl_percent ?? t.realized_pnl_percentage ?? 0
            return {
              id: String(t.id),
              symbol: t.symbol,
              direction: t.direction,
              entry_price: t.entry_price ?? 0,
              exit_price: t.exit_price ?? 0,
              quantity: t.quantity ?? 0,
              pnl: pnlValue,
              pnl_percent: pnlPct,
              entry_date: formatDate(
                t.executed_at ?? t.opened_at ?? t.created_at,
              ),
              exit_date: formatDate(t.closed_at),
              status: pnlValue >= 0 ? 'win' : 'loss',
            }
          })
          setTrades(mapped)
        } else {
          setTrades([])
        }
      })
      .catch(() => {
        setTrades([])
      })
      .finally(() => {
        setLoading(false)
      })
  }, [])

  /* ---- Fetch pending trades for semi-auto approval ---- */
  useEffect(() => {
    api.trades
      .getAll({ status: 'pending' })
      .then((res) => {
        if (res.trades && res.trades.length > 0) {
          setPendingTrades(
            res.trades.map((t: any) => ({
              id: String(t.id),
              symbol: t.symbol,
              direction: t.direction || 'LONG',
              entry_price: t.entry_price ?? 0,
              stop_loss: t.stop_loss ?? 0,
              target: t.target ?? t.target_price ?? 0,
              quantity: t.quantity ?? 0,
              created_at: t.created_at || new Date().toISOString(),
            })),
          )
        }
      })
      .catch(() => {
        /* no pending trades */
      })
  }, [])

  /* ---- Approve / Reject ---- */
  const handleApprove = async (tradeId: string) => {
    setApprovingId(tradeId)
    try {
      await api.trades.approve(tradeId)
      setPendingTrades((prev) => prev.filter((t) => t.id !== tradeId))
    } catch (error) {
      console.error('Failed to approve trade:', error)
    } finally {
      setApprovingId(null)
    }
  }

  const handleReject = async (tradeId: string) => {
    setApprovingId(tradeId)
    try {
      await api.trades.close(tradeId)
      setPendingTrades((prev) => prev.filter((t) => t.id !== tradeId))
    } catch (error) {
      console.error('Failed to reject trade:', error)
    } finally {
      setApprovingId(null)
    }
  }

  /* ---- Derived values ---- */
  const filteredTrades = trades.filter((t) =>
    filter === 'all' ? true : t.status === filter,
  )
  const totalPnL = trades.reduce((s, t) => s + t.pnl, 0)
  const winCount = trades.filter((t) => t.status === 'win').length
  const lossCount = trades.length - winCount
  const winRate = trades.length > 0 ? (winCount / trades.length) * 100 : 0
  const maxAbsPnl = Math.max(...trades.map((t) => Math.abs(t.pnl)), 1)

  /* ---- Loading skeleton ---- */
  if (loading) {
    return (
      <AppLayout>
      <div className="px-4 md:px-6 py-8">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="h-8 w-44 rounded-lg bg-d-bg-card animate-skeleton-pulse" />
          <div className="h-4 w-64 rounded bg-d-bg-card animate-skeleton-pulse" />
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
          {Array.from({ length: 4 }).map((_, i) => (
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
      <style>{`
        @keyframes trade-row-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* ====== Header ====== */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Trade History</h1>
            <p className="text-sm text-d-text-muted mt-1">
              Complete record of your executed trades
            </p>
          </div>
          <div className="flex items-center gap-3">
            {trades.length > 0 && (
              <button
                onClick={() => exportTradesCSV(trades)}
                className="inline-flex items-center gap-2 text-sm text-d-text-muted hover:text-white bg-d-bg-card border border-d-border rounded-full px-4 py-2 transition-colors"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            )}
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
          {/* Total Trades */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-d-text-muted uppercase tracking-wider">
                Total Trades
              </span>
              <BarChart3 className="w-4 h-4 text-d-text-muted" />
            </div>
            <div className="text-2xl font-bold text-white">{trades.length}</div>
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
          </div>

          {/* Win Rate */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-d-text-muted uppercase tracking-wider">
                Win Rate
              </span>
              <Target className="w-4 h-4 text-d-text-muted" />
            </div>
            <div className="text-2xl font-bold font-mono num-display text-primary">
              {winRate.toFixed(1)}%
            </div>
          </div>

          {/* Wins / Losses */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-d-text-muted uppercase tracking-wider">
                Wins / Losses
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-up">{winCount}</span>
              <span className="text-white/30">/</span>
              <span className="text-2xl font-bold text-down">{lossCount}</span>
            </div>
          </div>
        </div>

        {/* ====== Pending Approval (semi-auto mode) ====== */}
        {pendingTrades.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-warning" />
              <h2 className="text-lg font-semibold text-white">
                Pending Approval
              </h2>
              <span className="text-xs font-bold text-warning bg-warning/10 border border-warning/20 rounded-full px-2.5 py-0.5">
                {pendingTrades.length}
              </span>
            </div>

            {pendingTrades.map((pt) => (
              <div
                key={pt.id}
                className="glass-card border-warning/20 px-5 py-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: info */}
                  <div className="flex items-center gap-3">
                    <StockAvatar symbol={pt.symbol} size="sm" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {pt.symbol}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                            pt.direction === 'LONG'
                              ? 'bg-up/10 text-up'
                              : 'bg-down/10 text-down'
                          }`}
                        >
                          {pt.direction === 'LONG' ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {pt.direction}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-d-text-muted">
                        <span>Entry: <span className="font-mono num-display">{'\u20B9'}{pt.entry_price.toFixed(2)}</span></span>
                        <span>SL: <span className="font-mono num-display">{'\u20B9'}{pt.stop_loss.toFixed(2)}</span></span>
                        <span>Target: <span className="font-mono num-display">{'\u20B9'}{pt.target.toFixed(2)}</span></span>
                        <span>Qty: <span className="font-mono num-display">{pt.quantity}</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleApprove(pt.id)}
                      disabled={approvingId === pt.id}
                      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold bg-up/10 text-up border border-up/20 hover:bg-up/20 transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(pt.id)}
                      disabled={approvingId === pt.id}
                      className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold bg-down/10 text-down border border-down/20 hover:bg-down/20 transition disabled:opacity-50"
                    >
                      <XCircle className="w-4 h-4" />
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ====== Filter Tabs ====== */}
        <PillTabs tabs={FILTER_TABS} activeTab={filter} onChange={setFilter} />

        {/* ====== Trade History ====== */}
        {filteredTrades.length === 0 ? (
          <div className="glass-card">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {/* Animated chart + plus icon SVG */}
              <div className="relative mb-5">
                <svg viewBox="0 0 140 110" width="140" height="110" className="mx-auto">
                  {/* Grid lines */}
                  <g className="text-white/10">
                    <line x1="20" y1="20" x2="20" y2="90" stroke="currentColor" strokeWidth="0.75" />
                    <line x1="20" y1="90" x2="120" y2="90" stroke="currentColor" strokeWidth="0.75" />
                    <line x1="20" y1="50" x2="120" y2="50" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 3" />
                    <line x1="20" y1="70" x2="120" y2="70" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 3" />
                  </g>
                  {/* Chart path */}
                  <polyline
                    points="25,80 40,72 55,76 70,55 85,60 100,42 115,35"
                    fill="none"
                    className="text-primary"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray="120"
                    strokeDashoffset="120"
                    style={{ animation: 'trades-line-draw 1.8s ease-out 0.2s forwards' }}
                  />
                  {/* Plus icon circle */}
                  <circle cx="115" cy="35" r="10" className="text-primary" fill="var(--color-d-bg-card, #131722)" stroke="currentColor" strokeWidth="1.5" opacity="0" style={{ animation: 'trades-plus-appear 0.4s ease-out 1.9s forwards' }} />
                  <line x1="111" y1="35" x2="119" y2="35" className="text-primary" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0" style={{ animation: 'trades-plus-appear 0.4s ease-out 1.9s forwards' }} />
                  <line x1="115" y1="31" x2="115" y2="39" className="text-primary" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0" style={{ animation: 'trades-plus-appear 0.4s ease-out 1.9s forwards' }} />
                </svg>
                <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/[0.04] blur-xl" />
                <style>{`
                  @keyframes trades-line-draw {
                    to { stroke-dashoffset: 0; }
                  }
                  @keyframes trades-plus-appear {
                    to { opacity: 1; }
                  }
                `}</style>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1">
                {filter === 'all'
                  ? 'No trades yet'
                  : filter === 'win'
                    ? 'No winning trades'
                    : 'No losing trades'}
              </h3>
              <p className="text-sm text-d-text-muted max-w-sm mb-4">
                {filter === 'all'
                  ? 'Once you execute trades, they will appear here.'
                  : 'Try changing the filter to see other trades.'}
              </p>
              {filter === 'all' && (
                <a
                  href="/signals"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-full text-sm font-medium hover:bg-primary/20 transition-colors"
                >
                  View Signals
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            {/* Column headers (desktop) */}
            <div className="hidden md:grid grid-cols-12 gap-4 px-5 py-3 border-b border-d-border text-xs text-d-text-muted uppercase tracking-wider">
              <div className="col-span-2">Symbol</div>
              <div className="col-span-1 text-center">Direction</div>
              <div className="col-span-2 text-right">Entry</div>
              <div className="col-span-2 text-right">Exit</div>
              <div className="col-span-2 text-right">P&L</div>
              <div className="col-span-3 text-right">Date</div>
            </div>

            {/* Rows */}
            {filteredTrades.map((trade, idx) => (
              <div
                key={trade.id}
                className="border-b border-d-border last:border-0 hover:bg-white/[0.02] transition-colors"
                style={{ animation: `trade-row-in 0.35s ease-out ${idx * 0.04}s both` }}
              >
                {/* Desktop row */}
                <div className="hidden md:grid grid-cols-12 gap-4 items-center px-5 py-4">
                  {/* Symbol */}
                  <div className="col-span-2 flex items-center gap-3">
                    <StockAvatar symbol={trade.symbol} size="sm" />
                    <span className="font-semibold text-white">
                      {trade.symbol}
                    </span>
                  </div>

                  {/* Direction badge */}
                  <div className="col-span-1 flex justify-center">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                        trade.direction === 'LONG'
                          ? 'bg-up/10 text-up'
                          : 'bg-down/10 text-down'
                      }`}
                    >
                      {trade.direction === 'LONG' ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {trade.direction}
                    </span>
                  </div>

                  {/* Entry */}
                  <div className="col-span-2 text-right text-white/60 text-sm font-mono num-display">
                    {'\u20B9'}{trade.entry_price.toFixed(2)}
                  </div>

                  {/* Exit */}
                  <div className="col-span-2 text-right text-white text-sm font-medium font-mono num-display">
                    {'\u20B9'}{trade.exit_price.toFixed(2)}
                  </div>

                  {/* P&L */}
                  <div className="col-span-2 text-right">
                    <span
                      className={`text-sm font-bold font-mono num-display ${trade.pnl >= 0 ? 'text-up' : 'text-down'}`}
                    >
                      {trade.pnl >= 0 ? '+' : ''}
                      {'\u20B9'}{trade.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                    <span
                      className={`flex items-center justify-end gap-0.5 text-xs font-mono num-display mt-0.5 ${trade.pnl >= 0 ? 'text-up' : 'text-down'}`}
                    >
                      {trade.pnl >= 0 ? (
                        <ArrowUpRight className="w-3 h-3" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3" />
                      )}
                      {Math.abs(trade.pnl_percent).toFixed(2)}%
                    </span>
                    {/* P&L bar */}
                    <div className="mt-1.5 flex items-center justify-end">
                      <div className="relative h-1.5 w-full max-w-[80px] rounded-full bg-white/[0.05] overflow-hidden">
                        <div
                          className={`absolute top-0 h-full rounded-full ${trade.pnl >= 0 ? 'bg-up/60 right-auto left-0' : 'bg-down/60 left-auto right-0'}`}
                          style={{ width: `${Math.min((Math.abs(trade.pnl) / maxAbsPnl) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Date */}
                  <div className="col-span-3 text-right">
                    <span className="inline-flex items-center gap-1.5 text-xs text-d-text-muted">
                      <Calendar className="w-3.5 h-3.5" />
                      {trade.entry_date}
                      {trade.exit_date ? ` \u2192 ${trade.exit_date}` : ''}
                    </span>
                  </div>
                </div>

                {/* Mobile row */}
                <div className="md:hidden px-4 py-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <StockAvatar symbol={trade.symbol} size="sm" />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">
                            {trade.symbol}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              trade.direction === 'LONG'
                                ? 'bg-up/10 text-up'
                                : 'bg-down/10 text-down'
                            }`}
                          >
                            {trade.direction}
                          </span>
                        </div>
                        <div className="text-xs text-d-text-muted font-mono num-display mt-0.5">
                          {'\u20B9'}{trade.entry_price.toFixed(2)} {'\u2192'} {'\u20B9'}{trade.exit_price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-sm font-bold font-mono num-display ${trade.pnl >= 0 ? 'text-up' : 'text-down'}`}
                      >
                        {trade.pnl >= 0 ? '+' : ''}
                        {'\u20B9'}{trade.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                      <div
                        className={`text-xs font-mono num-display ${trade.pnl >= 0 ? 'text-up' : 'text-down'}`}
                      >
                        {trade.pnl >= 0 ? '+' : ''}
                        {trade.pnl_percent.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  {/* P&L bar (mobile) */}
                  <div className="relative h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
                    <div
                      className={`absolute top-0 h-full rounded-full ${trade.pnl >= 0 ? 'bg-up/60 left-0' : 'bg-down/60 right-0'}`}
                      style={{ width: `${Math.min((Math.abs(trade.pnl) / maxAbsPnl) * 100, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-d-text-muted">
                    <Calendar className="w-3 h-3" />
                    {trade.entry_date}
                    {trade.exit_date ? ` \u2192 ${trade.exit_date}` : ''}
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
