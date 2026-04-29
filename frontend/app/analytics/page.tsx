'use client'

import { useState, useEffect } from 'react'
import EquityCurve from '@/components/dashboard/EquityCurve'
import PnLChart from '@/components/dashboard/PnLChart'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart as RechartsPieChart,
  Pie,
} from 'recharts'
import {
  BarChart3,
  TrendingUp,
  Target,
  Activity,
  PieChart as PieChartIcon,
  Calendar,
  ArrowUp,
  ArrowDown,
  Download,
  Trophy,
  AlertTriangle,
} from 'lucide-react'
import { api } from '@/lib/api'
import AppLayout from '@/components/shared/AppLayout'

interface AnalyticsStats {
  winRate: number
  profitFactor: number
  sharpeRatio: number
  maxDrawdown: number
  avgWin: number
  avgLoss: number
  totalTrades: number
  winningTrades: number
  avgHoldPeriod: number
  bestTrade: number
  worstTrade: number
  totalReturn?: number
  bestTradeSymbol?: string
  bestTradeDate?: string
  worstTradeSymbol?: string
  worstTradeDate?: string
}

interface TradeRecord {
  date: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  entry: number
  exit: number
  pnl: number
  pnlPct: number
}

const daysMap: Record<string, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  '1y': 365,
  'all': 9999,
}

export default function AnalyticsPage() {
  const [timeframe, setTimeframe] = useState<'7d' | '30d' | '90d' | '1y' | 'all'>('30d')
  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState<AnalyticsStats | null>(null)
  const [monthlyData, setMonthlyData] = useState<{ month: string; pnl: number; trades: number }[]>([])
  const [equityCurveData, setEquityCurveData] = useState<{ date: string; equity: number; drawdown: number }[]>([])
  const [cumulativePnlData, setCumulativePnlData] = useState<{ date: string; value: number }[]>([])
  const [tradeHistory, setTradeHistory] = useState<TradeRecord[]>([])

  useEffect(() => {
    let cancelled = false
    const days = daysMap[timeframe]

    async function fetchData() {
      setLoading(true)
      try {
        const [perfData, historyData, signalPerf] = await Promise.allSettled([
          api.portfolio.getPerformance(),
          api.portfolio.getHistory(days),
          api.signals.getPerformance(days),
        ])

        if (cancelled) return

        // Map portfolio performance to stats
        if (perfData.status === 'fulfilled' && perfData.value) {
          const perf = perfData.value
          setStats({
            winRate: perf.win_rate ?? perf.winRate ?? 0,
            profitFactor: perf.profit_factor ?? perf.profitFactor ?? 0,
            sharpeRatio: perf.sharpe_ratio ?? perf.sharpeRatio ?? 0,
            maxDrawdown: perf.max_drawdown ?? perf.maxDrawdown ?? 0,
            avgWin: perf.avg_win ?? perf.avgWin ?? 0,
            avgLoss: perf.avg_loss ?? perf.avgLoss ?? 0,
            totalTrades: perf.total_trades ?? perf.totalTrades ?? 0,
            winningTrades: perf.winning_trades ?? perf.winningTrades ?? 0,
            avgHoldPeriod: perf.avg_hold_period ?? perf.avgHoldPeriod ?? 0,
            bestTrade: perf.best_trade ?? perf.bestTrade ?? 0,
            worstTrade: perf.worst_trade ?? perf.worstTrade ?? 0,
            totalReturn: perf.total_return ?? perf.totalReturn ?? 0,
            bestTradeSymbol: perf.best_trade_symbol ?? perf.bestTradeSymbol ?? '',
            bestTradeDate: perf.best_trade_date ?? perf.bestTradeDate ?? '',
            worstTradeSymbol: perf.worst_trade_symbol ?? perf.worstTradeSymbol ?? '',
            worstTradeDate: perf.worst_trade_date ?? perf.worstTradeDate ?? '',
          })
        }

        // Map portfolio history to equity curve and cumulative P&L
        if (historyData.status === 'fulfilled' && historyData.value?.history?.length) {
          const history = historyData.value.history
          const equity = history.map((h: Record<string, any>) => ({
            date: h.date
              ? new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
              : '',
            equity: h.equity ?? h.portfolio_value ?? h.value ?? 0,
            drawdown: h.drawdown ?? 0,
          }))
          setEquityCurveData(equity)

          const cumPnl = history.map((h: Record<string, any>) => ({
            date: h.date
              ? new Date(h.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
              : '',
            value: h.cumulative_pnl ?? h.pnl ?? h.value ?? 0,
          }))
          setCumulativePnlData(cumPnl)

          // Build trade history from history records if available
          if (history[0]?.trades) {
            const trades: TradeRecord[] = history
              .flatMap((h: Record<string, any>) =>
                (h.trades || []).map((t: Record<string, any>) => ({
                  date: t.date ?? h.date ?? '',
                  symbol: t.symbol ?? '',
                  direction: t.direction ?? 'LONG',
                  entry: t.entry ?? t.entry_price ?? 0,
                  exit: t.exit ?? t.exit_price ?? 0,
                  pnl: t.pnl ?? 0,
                  pnlPct: t.pnl_pct ?? t.pnlPct ?? 0,
                }))
              )
            setTradeHistory(trades)
          }
        } else {
          setEquityCurveData([])
          setCumulativePnlData([])
        }

        // Use signal performance for monthly data if available
        if (signalPerf.status === 'fulfilled' && signalPerf.value?.monthly) {
          const monthly = signalPerf.value.monthly
          if (Array.isArray(monthly) && monthly.length > 0) {
            setMonthlyData(
              monthly.map((m: Record<string, any>) => ({
                month: m.month ?? m.label ?? '',
                pnl: m.pnl ?? m.profit ?? 0,
                trades: m.trades ?? m.count ?? 0,
              }))
            )
          }
        }

        // Try fetching trade history from signals history
        if (signalPerf.status === 'fulfilled' && signalPerf.value?.trades) {
          const trades = signalPerf.value.trades.map((t: Record<string, any>) => ({
            date: t.date ?? t.exit_date ?? '',
            symbol: t.symbol ?? '',
            direction: t.direction ?? 'LONG',
            entry: t.entry ?? t.entry_price ?? 0,
            exit: t.exit ?? t.exit_price ?? 0,
            pnl: t.pnl ?? 0,
            pnlPct: t.pnl_pct ?? t.pnlPct ?? 0,
          }))
          setTradeHistory(trades)
        }
      } catch {
        // Keep current state on failure
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => { cancelled = true }
  }, [timeframe])

  // Win/Loss donut data derived from current stats
  const winLossData = stats ? [
    { name: 'Wins', value: stats.winningTrades },
    { name: 'Losses', value: stats.totalTrades - stats.winningTrades },
  ] : []
  const PIE_COLORS = ['#22c55e', '#FF5947']

  // Custom tooltip for monthly bar chart
  const MonthlyBarTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div className="rounded-xl border border-d-border bg-d-bg-elevated px-3 py-2 shadow-xl">
          <p className="text-sm font-medium text-white mb-1">{data.month}</p>
          <p className={`text-lg font-bold font-mono num-display ${data.pnl >= 0 ? 'text-up' : 'text-down'}`}>
            {data.pnl >= 0 ? '+' : ''}{'\u20B9'}{data.pnl.toLocaleString('en-IN')}
          </p>
          <p className="text-xs text-d-text-muted mt-1">{data.trades} trades</p>
        </div>
      )
    }
    return null
  }

  // Export trades as CSV
  const handleExportCSV = () => {
    if (tradeHistory.length === 0) return
    const headers = ['Date', 'Symbol', 'Direction', 'Entry', 'Exit', 'P&L', 'P&L%']
    const rows = tradeHistory.map((t) => [
      t.date ? new Date(t.date).toLocaleDateString('en-IN') : '',
      t.symbol,
      t.direction,
      t.entry.toFixed(2),
      t.exit.toFixed(2),
      t.pnl.toFixed(2),
      t.pnlPct.toFixed(2),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trade_history_${timeframe}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Skeleton card for loading
  const SkeletonCard = ({ className = '' }: { className?: string }) => (
    <div className={`glass-card animate-pulse ${className}`}>
      <div className="h-3 w-20 rounded bg-white/10 mb-3" />
      <div className="h-8 w-28 rounded bg-white/10" />
    </div>
  )

  return (
    <AppLayout>
    <div className="px-4 md:px-6 py-6 md:py-8">
      <div className="mx-auto max-w-7xl">

        {/* ── Hero Header ── */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-white">Performance Analytics</h1>
              <p className="text-sm text-d-text-muted mt-0.5">
                Track your trading performance with detailed metrics and visualizations
              </p>
            </div>
          </div>
        </div>

        {/* ── Period Selector ── */}
        <div className="mb-8">
          <div className="glass-card inline-flex rounded-full p-1">
            {(['7d', '30d', '90d', '1y', 'all'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  timeframe === tf
                    ? 'bg-primary/20 text-primary border border-primary/30'
                    : 'text-d-text-muted hover:text-white'
                }`}
              >
                {tf === 'all' ? 'All' : tf === '1y' ? '1Y' : tf.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* ── Loading Skeleton ── */}
        {loading && (
          <div className="space-y-6">
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonCard key={i} className="p-5" />
              ))}
            </div>
            <div className="glass-card animate-pulse p-6">
              <div className="h-4 w-32 rounded bg-white/10 mb-4" />
              <div className="h-[300px] rounded bg-white/5" />
            </div>
            <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">
              <div className="glass-card animate-pulse p-6">
                <div className="h-4 w-40 rounded bg-white/10 mb-4" />
                <div className="h-[250px] rounded bg-white/5" />
              </div>
              <div className="glass-card animate-pulse p-6">
                <div className="h-4 w-40 rounded bg-white/10 mb-4" />
                <div className="h-[250px] rounded bg-white/5" />
              </div>
            </div>
          </div>
        )}

        {/* ── Empty State ── */}
        {!loading && !stats && (
          <div className="glass-card p-16 text-center">
            <Activity className="h-14 w-14 text-d-text-muted mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-semibold text-white mb-2">No Trading Data Yet</h3>
            <p className="text-d-text-muted max-w-md mx-auto">
              Start trading to see your performance analytics here. Your equity curve, win rate, and detailed trade history will appear once you have closed positions.
            </p>
          </div>
        )}

        {/* ── Section 1: KPI Stats Row ── */}
        {!loading && stats && (
          <>
            <div className="mb-8 grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
              {/* Total Return */}
              <div className="glass-card p-5 transition-all hover:border-d-border-hover">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">
                  <TrendingUp className="h-3.5 w-3.5" />
                  Total Return
                </div>
                <div className={`text-2xl font-bold font-mono num-display ${(stats.totalReturn ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
                  {(stats.totalReturn ?? 0) >= 0 ? '+' : ''}{'\u20B9'}{(stats.totalReturn ?? 0).toLocaleString('en-IN')}
                </div>
              </div>

              {/* Win Rate */}
              <div className="glass-card p-5 transition-all hover:border-d-border-hover">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">
                  <Target className="h-3.5 w-3.5" />
                  Win Rate
                </div>
                <div className={`text-2xl font-bold font-mono num-display ${stats.winRate >= 50 ? 'text-up' : 'text-down'}`}>
                  {stats.winRate.toFixed(1)}%
                </div>
              </div>

              {/* Profit Factor */}
              <div className="glass-card p-5 transition-all hover:border-d-border-hover">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">
                  <BarChart3 className="h-3.5 w-3.5" />
                  Profit Factor
                </div>
                <div className={`text-2xl font-bold font-mono num-display ${stats.profitFactor >= 1 ? 'text-up' : 'text-down'}`}>
                  {stats.profitFactor.toFixed(2)}
                </div>
              </div>

              {/* Sharpe Ratio */}
              <div className="glass-card p-5 transition-all hover:border-d-border-hover">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">
                  <Activity className="h-3.5 w-3.5" />
                  Sharpe Ratio
                </div>
                <div className={`text-2xl font-bold font-mono num-display ${stats.sharpeRatio >= 1 ? 'text-up' : 'text-primary'}`}>
                  {stats.sharpeRatio.toFixed(2)}
                </div>
              </div>

              {/* Max Drawdown */}
              <div className="glass-card p-5 transition-all hover:border-d-border-hover">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Max Drawdown
                </div>
                <div className="text-2xl font-bold font-mono num-display text-down">
                  {stats.maxDrawdown.toFixed(1)}%
                </div>
              </div>

              {/* Total Trades */}
              <div className="glass-card p-5 transition-all hover:border-d-border-hover">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">
                  <Calendar className="h-3.5 w-3.5" />
                  Total Trades
                </div>
                <div className="text-2xl font-bold font-mono num-display text-white">
                  {stats.totalTrades}
                </div>
              </div>
            </div>

            {/* ── Section 2: Equity Curve ── */}
            {equityCurveData.length > 0 && (
              <div className="mb-8 glass-card p-5">
                <EquityCurve data={equityCurveData} />
              </div>
            )}

            {/* ── Section 3: Two-Column — P&L Distribution + Win/Loss Breakdown ── */}
            <div className="mb-8 grid gap-6 grid-cols-1 lg:grid-cols-2">
              {/* P&L Distribution (Monthly Bar Chart) */}
              <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="rounded-lg bg-primary/10 p-2 border border-primary/20">
                    <BarChart3 className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold text-white">P&L Distribution</h2>
                </div>
                {monthlyData.length > 0 ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" strokeOpacity={0.3} vertical={false} />
                        <XAxis
                          dataKey="month"
                          stroke="#6B7280"
                          tick={{ fill: '#9C9C9D', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#6B7280"
                          tick={{ fill: '#9C9C9D', fontSize: 12 }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(value) => `${'\u20B9'}${(value / 1000).toFixed(0)}K`}
                        />
                        <Tooltip content={<MonthlyBarTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                        <Bar dataKey="pnl" radius={[6, 6, 0, 0]} animationDuration={800}>
                          {monthlyData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? '#22c55e' : '#FF5947'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-[280px] flex items-center justify-center">
                    <p className="text-sm text-d-text-muted">No monthly data available yet</p>
                  </div>
                )}
              </div>

              {/* Win/Loss Breakdown (Pie Donut) */}
              <div className="glass-card p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="rounded-lg bg-up/10 p-2 border border-up/20">
                    <PieChartIcon className="w-4 h-4 text-up" />
                  </div>
                  <h2 className="text-lg font-bold text-white">Win/Loss Breakdown</h2>
                </div>

                {stats.totalTrades > 0 ? (
                  <>
                    <div className="flex justify-center mb-6">
                      <div className="relative">
                        <RechartsPieChart width={180} height={180}>
                          <Pie
                            data={winLossData}
                            cx={90}
                            cy={90}
                            innerRadius={55}
                            outerRadius={80}
                            paddingAngle={4}
                            dataKey="value"
                            animationDuration={800}
                            stroke="none"
                          >
                            {winLossData.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={PIE_COLORS[index]} />
                            ))}
                          </Pie>
                        </RechartsPieChart>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-3xl font-bold text-up font-mono num-display">{stats.winRate.toFixed(0)}%</span>
                          <span className="text-xs text-d-text-muted">Win Rate</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-center gap-8 mb-6">
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-up" />
                        <span className="text-sm text-d-text-muted">Wins ({stats.winningTrades})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-3 w-3 rounded-full bg-down" />
                        <span className="text-sm text-d-text-muted">Losses ({stats.totalTrades - stats.winningTrades})</span>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="space-y-3 pt-4 border-t border-d-border">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-d-text-muted">Average Win</span>
                        <span className="text-sm font-bold font-mono num-display text-up">+{'\u20B9'}{stats.avgWin.toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-d-text-muted">Average Loss</span>
                        <span className="text-sm font-bold font-mono num-display text-down">-{'\u20B9'}{Math.abs(stats.avgLoss).toLocaleString('en-IN')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-d-text-muted">Avg Hold Period</span>
                        <span className="text-sm font-bold font-mono num-display text-white">{stats.avgHoldPeriod} days</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="h-[280px] flex items-center justify-center">
                    <p className="text-sm text-d-text-muted">No trades to display</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Section 4: Best/Worst Trades ── */}
            <div className="mb-8 grid gap-6 grid-cols-1 sm:grid-cols-2">
              {/* Best Trade */}
              <div className="glass-card p-6 border-l-4 !border-l-up">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-lg bg-up/10 p-2">
                    <Trophy className="w-5 h-5 text-up" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Best Trade</h3>
                </div>
                <div className="space-y-2">
                  {stats.bestTradeSymbol && (
                    <p className="text-sm text-d-text-muted">
                      Symbol: <span className="font-semibold text-white">{stats.bestTradeSymbol}</span>
                    </p>
                  )}
                  <p className="text-2xl font-bold font-mono num-display text-up">
                    +{'\u20B9'}{stats.bestTrade.toLocaleString('en-IN')}
                  </p>
                  {stats.bestTradeDate && (
                    <p className="text-xs text-d-text-muted">
                      {new Date(stats.bestTradeDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>

              {/* Worst Trade */}
              <div className="glass-card p-6 border-l-4 !border-l-down">
                <div className="flex items-center gap-3 mb-4">
                  <div className="rounded-lg bg-down/10 p-2">
                    <AlertTriangle className="w-5 h-5 text-down" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Worst Trade</h3>
                </div>
                <div className="space-y-2">
                  {stats.worstTradeSymbol && (
                    <p className="text-sm text-d-text-muted">
                      Symbol: <span className="font-semibold text-white">{stats.worstTradeSymbol}</span>
                    </p>
                  )}
                  <p className="text-2xl font-bold font-mono num-display text-down">
                    {'\u20B9'}{stats.worstTrade.toLocaleString('en-IN')}
                  </p>
                  {stats.worstTradeDate && (
                    <p className="text-xs text-d-text-muted">
                      {new Date(stats.worstTradeDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Cumulative P&L Chart ── */}
            {cumulativePnlData.length > 0 && (
              <div className="mb-8 glass-card p-5">
                <PnLChart data={cumulativePnlData} title="Cumulative P&L" />
              </div>
            )}

            {/* ── Section 5: Trade History Table ── */}
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 border border-primary/20">
                    <Calendar className="w-4 h-4 text-primary" />
                  </div>
                  <h2 className="text-lg font-bold text-white">Trade History</h2>
                  {tradeHistory.length > 0 && (
                    <span className="text-xs text-d-text-muted bg-white/5 rounded-full px-2.5 py-0.5">
                      {tradeHistory.length} trades
                    </span>
                  )}
                </div>
                {tradeHistory.length > 0 && (
                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-2 rounded-xl border border-d-border bg-white/[0.03] px-4 py-2 text-sm font-medium text-d-text-muted hover:text-white hover:bg-white/[0.06] transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    <span className="hidden sm:inline">Export CSV</span>
                  </button>
                )}
              </div>

              {tradeHistory.length > 0 ? (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-d-border">
                          <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">Date</th>
                          <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">Symbol</th>
                          <th className="pb-3 text-left text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">Direction</th>
                          <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">Entry</th>
                          <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">Exit</th>
                          <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">P&L</th>
                          <th className="pb-3 text-right text-[10px] font-semibold uppercase tracking-widest text-d-text-muted">P&L%</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {tradeHistory.map((trade, i) => (
                          <tr key={i} className="hover:bg-white/[0.02] transition-colors">
                            <td className="py-3 text-d-text-muted">
                              {trade.date ? new Date(trade.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}
                            </td>
                            <td className="py-3 font-semibold text-white">{trade.symbol}</td>
                            <td className="py-3">
                              <span className={`inline-flex items-center gap-1 text-xs font-medium ${trade.direction === 'LONG' ? 'text-up' : 'text-down'}`}>
                                {trade.direction === 'LONG' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                                {trade.direction}
                              </span>
                            </td>
                            <td className="py-3 text-right font-mono num-display text-white">{'\u20B9'}{trade.entry.toLocaleString('en-IN')}</td>
                            <td className="py-3 text-right font-mono num-display text-white">{'\u20B9'}{trade.exit.toLocaleString('en-IN')}</td>
                            <td className={`py-3 text-right font-mono num-display font-semibold ${trade.pnl >= 0 ? 'text-up' : 'text-down'}`}>
                              {trade.pnl >= 0 ? '+' : ''}{'\u20B9'}{trade.pnl.toLocaleString('en-IN')}
                            </td>
                            <td className={`py-3 text-right font-mono num-display font-semibold ${trade.pnlPct >= 0 ? 'text-up' : 'text-down'}`}>
                              {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Cards */}
                  <div className="md:hidden space-y-3">
                    {tradeHistory.map((trade, i) => (
                      <div key={i} className="rounded-xl border border-d-border bg-white/[0.02] p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-white">{trade.symbol}</span>
                            <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              trade.direction === 'LONG' ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                            }`}>
                              {trade.direction === 'LONG' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                              {trade.direction}
                            </span>
                          </div>
                          <span className={`text-lg font-bold font-mono num-display ${trade.pnl >= 0 ? 'text-up' : 'text-down'}`}>
                            {trade.pnl >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-d-text-muted">
                          <span>{trade.date ? new Date(trade.date).toLocaleDateString('en-IN') : '-'}</span>
                          <span className="font-mono num-display">{'\u20B9'}{trade.entry.toLocaleString('en-IN')} → {'\u20B9'}{trade.exit.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center">
                  <Calendar className="h-10 w-10 text-d-text-muted mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-d-text-muted">No trade history available for this period</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
