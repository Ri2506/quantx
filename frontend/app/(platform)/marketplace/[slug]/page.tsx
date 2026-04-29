'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, BarChart3, TrendingUp, TrendingDown, Shield, Zap, Clock,
  Target, AlertTriangle, ChevronDown, Play, FileText, Lock,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import BeamButton from '@/components/ui/BeamButton'
import SkeletonCard from '@/components/ui/SkeletonCard'
import PayoffDiagram from '@/components/strategy/PayoffDiagram'
import { api, handleApiError } from '@/lib/api'
import type { StrategyCatalog, StrategyBacktest, ConfigurableParam } from '@/types'

// ============================================================================
// HELPERS
// ============================================================================

const RISK_STYLES: Record<string, { label: string; color: string }> = {
  low: { label: 'Low Risk', color: 'text-up bg-up/10 border-up/20' },
  medium: { label: 'Medium Risk', color: 'text-warning bg-warning/10 border-warning/20' },
  high: { label: 'High Risk', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' },
  very_high: { label: 'Very High Risk', color: 'text-down bg-down/10 border-down/20' },
}

// PR 75 — locked tier structure: Free / Pro ₹999 / Elite ₹1,999.
// `starter` falls back to Pro for legacy catalog rows.
const TIER_STYLES: Record<string, { label: string; color: string }> = {
  free:    { label: 'Free Plan',           color: 'text-up' },
  pro:     { label: 'Pro Plan (\u20B9999/mo)',   color: 'text-primary' },
  elite:   { label: 'Elite Plan (\u20B91,999/mo)', color: 'text-[#FFD166]' },
  starter: { label: 'Pro Plan (\u20B9999/mo)',   color: 'text-primary' },
}

function formatNumber(val: number | null | undefined, suffix = ''): string {
  if (val == null) return '--'
  return `${val >= 0 ? (suffix === '%' && val > 0 ? '+' : '') : ''}${val.toFixed(suffix === '%' ? 1 : 2)}${suffix}`
}

function formatCapital(val: number): string {
  if (val >= 100000) return `${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`
  return `${val}`
}

// ============================================================================
// STAT CARD
// ============================================================================

function StatBox({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="data-card p-3 text-center">
      <p className="stat-label mb-1">{label}</p>
      <p className={`text-lg font-bold font-mono num-display tabular-nums ${color || 'text-white'}`}>{value}</p>
    </div>
  )
}

// ============================================================================
// MONTHLY HEATMAP
// ============================================================================

function MonthlyHeatmap({ data }: { data: { year: number; month: number; return_pct: number }[] }) {
  if (!data || data.length === 0) return null

  const years = Array.from(new Set(data.map((d) => d.year))).sort()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  const lookup: Record<string, number> = {}
  data.forEach((d) => {
    lookup[`${d.year}-${d.month}`] = d.return_pct
  })

  function cellColor(val: number | undefined): string {
    if (val == null) return 'bg-white/[0.02]'
    if (val >= 10) return 'bg-up/40'
    if (val >= 5) return 'bg-up/25'
    if (val >= 0) return 'bg-up/10'
    if (val >= -5) return 'bg-down/10'
    if (val >= -10) return 'bg-down/25'
    return 'bg-down/40'
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr>
            <th className="text-left text-white/30 font-normal py-1 pr-2" />
            {months.map((m) => (
              <th key={m} className="text-center text-white/30 font-normal py-1 px-1 min-w-[40px]">{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {years.map((yr) => (
            <tr key={yr}>
              <td className="text-white/50 font-medium py-1 pr-2">{yr}</td>
              {months.map((_, mi) => {
                const val = lookup[`${yr}-${mi + 1}`]
                return (
                  <td key={mi} className="py-1 px-0.5">
                    <div className={`rounded-md py-1.5 text-center font-medium ${cellColor(val)} ${val != null ? (val >= 0 ? 'text-up' : 'text-down') : 'text-white/10'}`}>
                      {val != null ? `${val >= 0 ? '+' : ''}${val.toFixed(0)}%` : '-'}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// PAYOFF LEGS BUILDER (illustrative legs from strategy template)
// ============================================================================

interface PayoffLeg {
  strike: number
  option_type: 'CE' | 'PE'
  direction: 'BUY' | 'SELL'
  lots: number
  entry_price: number
}

function buildIllustrativeLegs(strategy: StrategyCatalog): { legs: PayoffLeg[]; spot: number; lotSize: number } | null {
  if (strategy.segment !== 'OPTIONS') return null

  const p = strategy.default_params as Record<string, number | string>
  const slug = strategy.template_slug

  // Use NIFTY as reference for illustrative payoff
  const spot = 24000
  const gap = 50
  const lotSize = 25
  const atm = Math.round(spot / gap) * gap

  if (slug === 'naked_buy') {
    const otm = Number(p.otm_strikes ?? 2)
    const strike = atm + otm * gap
    const premium = Math.round(180 + Math.random() * 40) // Illustrative ~₹180-220
    return {
      legs: [{ strike, option_type: 'CE', direction: 'BUY', lots: 1, entry_price: premium }],
      spot,
      lotSize,
    }
  }

  if (slug === 'credit_spread') {
    const width = Number(p.spread_width ?? 100)
    const sellStrike = atm - width
    const buyStrike = sellStrike - width
    return {
      legs: [
        { strike: sellStrike, option_type: 'PE', direction: 'SELL', lots: 1, entry_price: 120 },
        { strike: buyStrike, option_type: 'PE', direction: 'BUY', lots: 1, entry_price: 55 },
      ],
      spot,
      lotSize,
    }
  }

  if (slug === 'short_strangle') {
    const dist = Number(p.distance_from_atm ?? 100)
    return {
      legs: [
        { strike: atm + dist, option_type: 'CE', direction: 'SELL', lots: 1, entry_price: 85 },
        { strike: atm - dist, option_type: 'PE', direction: 'SELL', lots: 1, entry_price: 80 },
      ],
      spot,
      lotSize,
    }
  }

  if (slug === 'short_straddle') {
    return {
      legs: [
        { strike: atm, option_type: 'CE', direction: 'SELL', lots: 1, entry_price: 210 },
        { strike: atm, option_type: 'PE', direction: 'SELL', lots: 1, entry_price: 195 },
      ],
      spot,
      lotSize,
    }
  }

  return null
}

// ============================================================================
// DEPLOY SECTION
// ============================================================================

function DeploySection({ strategy }: { strategy: StrategyCatalog }) {
  const router = useRouter()
  const [params, setParams] = useState<Record<string, unknown>>(() => ({ ...strategy.default_params }))
  const [capital, setCapital] = useState(strategy.min_capital)
  const [mode, setMode] = useState<string>('signal_only')
  const [deploying, setDeploying] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const configParams: ConfigurableParam[] = Array.isArray(strategy.configurable_params)
    ? strategy.configurable_params
    : []

  async function handleDeploy() {
    setDeploying(true)
    setError('')
    setSuccess('')
    try {
      const res = await api.marketplace.deploy({
        strategy_slug: strategy.slug,
        allocated_capital: capital,
        max_positions: 2,
        trade_mode: mode,
        custom_params: params as Record<string, unknown>,
      })
      setSuccess(res.message || 'Strategy deployed!')
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" />
        Configure & Deploy
      </h3>

      <div className="space-y-4">
        {/* Configurable params */}
        {configParams.map((param) => (
          <div key={param.key}>
            <label className="text-xs text-white/50 mb-1 block">{param.label}</label>
            {param.type === 'select' && param.options ? (
              <select
                value={String(params[param.key] ?? strategy.default_params[param.key] ?? '')}
                onChange={(e) => {
                  const val = isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value)
                  setParams((p) => ({ ...p, [param.key]: val }))
                }}
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-primary/30 appearance-none"
              >
                {param.options.map((opt) => (
                  <option key={String(opt)} value={String(opt)} className="text-white">
                    {String(opt)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                value={String(params[param.key] ?? '')}
                onChange={(e) => setParams((p) => ({ ...p, [param.key]: Number(e.target.value) }))}
                min={param.min}
                max={param.max}
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-primary/30"
              />
            )}
          </div>
        ))}

        {/* Capital */}
        <div>
          <label className="text-xs text-white/50 mb-1 block">Capital Allocation</label>
          <input
            type="number"
            value={capital}
            onChange={(e) => setCapital(Number(e.target.value))}
            min={strategy.min_capital}
            step={10000}
            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-primary/30"
          />
          <p className="text-[10px] text-white/30 mt-1">Min: {formatCapital(strategy.min_capital)}</p>
        </div>

        {/* Trade mode */}
        <div>
          <label className="text-xs text-white/50 mb-1 block">Trade Mode</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-white focus:outline-none focus:border-primary/30 appearance-none"
          >
            <option value="signal_only">Signal Only</option>
            <option value="semi_auto">Semi-Auto (approve trades)</option>
            <option value="full_auto">Full Auto (bot trades)</option>
          </select>
        </div>

        {/* Requirements */}
        <div className="rounded-lg bg-white/[0.02] border border-white/[0.04] p-3 space-y-1">
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">Requirements</p>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <Shield className="w-3.5 h-3.5" />
            <span>Requires: {TIER_STYLES[strategy.tier_required]?.label || 'Free Plan'}</span>
          </div>
          {strategy.requires_fo_enabled && (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>F&O must be enabled</span>
            </div>
          )}
          {mode !== 'signal_only' && (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Zap className="w-3.5 h-3.5" />
              <span>Broker connection required</span>
            </div>
          )}
        </div>

        {/* Deploy buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {deploying ? 'Deploying...' : 'Deploy Strategy'}
          </button>
        </div>

        {error && <p className="text-xs text-down">{error}</p>}
        {success && <p className="text-xs text-up">{success}</p>}
      </div>

      {/* Risk disclaimer */}
      <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-amber-300/70 leading-relaxed">
            {strategy.segment === 'OPTIONS'
              ? 'Options trading involves significant risk of loss. Past performance does not guarantee future results. Only trade with capital you can afford to lose.'
              : 'Trading involves risk. Past performance does not guarantee future results. Always use proper risk management.'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// STRATEGY DETAIL PAGE
// ============================================================================

export default function StrategyDetailPage() {
  const params = useParams()
  const slug = params?.slug as string

  const [strategy, setStrategy] = useState<StrategyCatalog | null>(null)
  const [backtest, setBacktest] = useState<StrategyBacktest | null>(null)
  const [backtestSummary, setBacktestSummary] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const [stratRes, btRes] = await Promise.all([
        api.marketplace.getStrategy(slug),
        api.marketplace.getBacktest(slug),
      ])
      setStrategy(stratRes.strategy)
      setBacktest(btRes.backtest ?? null)
      setBacktestSummary((btRes.summary as Record<string, unknown>) ?? null)
    } catch (err) {
      console.error('Failed to fetch strategy:', handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        <SkeletonCard />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    )
  }

  if (!strategy) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-white/50">Strategy not found.</p>
        <Link href="/marketplace" className="text-primary text-sm mt-2 inline-block hover:underline">
          Back to Marketplace
        </Link>
      </div>
    )
  }

  const risk = RISK_STYLES[strategy.risk_level] || RISK_STYLES.medium

  // Use backtest data or catalog summary
  const winRate = backtest?.win_rate ?? strategy.backtest_win_rate
  const totalReturn = backtest?.total_return ?? strategy.backtest_total_return
  const pf = backtest?.profit_factor ?? strategy.backtest_profit_factor
  const sharpe = backtest?.sharpe_ratio ?? strategy.backtest_sharpe
  const maxDD = backtest?.max_drawdown ?? strategy.backtest_max_drawdown
  const totalTrades = backtest?.total_trades ?? strategy.backtest_total_trades
  const equityCurve = backtest?.equity_curve || []
  const monthlyReturns = backtest?.monthly_returns || []
  const tradeLog = backtest?.trade_log || []

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
      {/* Back link */}
      <Link
        href="/marketplace"
        className="inline-flex items-center gap-1.5 text-sm text-white/40 hover:text-white mb-4 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Marketplace
      </Link>

      {/* ================================================================ */}
      {/* STRATEGY HEADER */}
      {/* ================================================================ */}
      <div className="glass-card p-5 md:p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${risk.color}`}>
                {risk.label}
              </span>
              <span className="text-xs text-white/30 capitalize">{strategy.category.replace(/_/g, ' ')}</span>
              <span className="text-xs text-white/20">&middot;</span>
              <span className="text-xs text-white/30">{strategy.segment}</span>
            </div>
            <h1 className="text-xl md:text-2xl font-bold text-white mb-1">{strategy.name}</h1>
            <p className="text-sm text-white/50 max-w-xl">{strategy.description}</p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mt-3">
              {strategy.tags.map((tag) => (
                <span key={tag} className="px-2 py-0.5 rounded-full bg-white/[0.04] border border-d-border text-[10px] text-white/40">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3 shrink-0">
            <StatBox
              label="Return"
              value={formatNumber(totalReturn, '%')}
              color={(totalReturn ?? 0) >= 0 ? 'text-up' : 'text-down'}
            />
            <StatBox label="Win Rate" value={winRate != null ? `${winRate}%` : '--'} />
            <StatBox label="Min Capital" value={`${formatCapital(strategy.min_capital)}`} />
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* MAIN CONTENT: 2-col layout */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Backtest results (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatBox label="Total Return" value={formatNumber(totalReturn, '%')} color={(totalReturn ?? 0) >= 0 ? 'text-up' : 'text-down'} />
            <StatBox label="Win Rate" value={winRate != null ? `${winRate}%` : '--'} color="text-white" />
            <StatBox label="Profit Factor" value={pf != null ? pf.toFixed(2) : '--'} color="text-white" />
            <StatBox label="Sharpe Ratio" value={sharpe != null ? sharpe.toFixed(2) : '--'} color="text-white" />
            <StatBox label="Max Drawdown" value={maxDD != null ? `${maxDD}%` : '--'} color="text-down" />
            <StatBox label="Total Trades" value={totalTrades != null ? String(totalTrades) : '--'} />
            <StatBox label="Avg Trade" value={backtest?.avg_trade_return != null ? formatNumber(backtest.avg_trade_return, '%') : '--'} />
            <StatBox label="Sortino" value={backtest?.sortino_ratio != null ? backtest.sortino_ratio.toFixed(2) : '--'} />
          </div>

          {/* Equity Curve */}
          {equityCurve.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Equity Curve
              </h3>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve}>
                    <defs>
                      <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4FECCD" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#4FECCD" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }} />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(13,15,14,0.95)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                    <Area type="monotone" dataKey="equity" stroke="#4FECCD" fill="url(#equityGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Payoff Diagram (OPTIONS strategies only) */}
          {(() => {
            const payoff = buildIllustrativeLegs(strategy)
            if (!payoff) return null
            return (
              <PayoffDiagram
                legs={payoff.legs}
                spotPrice={payoff.spot}
                lotSize={payoff.lotSize}
                label={`${strategy.name} — Illustrative Payoff at Expiry`}
              />
            )
          })()}

          {/* Monthly Returns Heatmap */}
          {monthlyReturns.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Monthly Returns Heatmap
              </h3>
              <MonthlyHeatmap data={monthlyReturns} />
            </div>
          )}

          {/* Trade Log */}
          {tradeLog.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                Recent Trades ({tradeLog.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-white/30 border-b border-d-border">
                      <th className="text-left font-normal py-2 pr-3">Date</th>
                      <th className="text-left font-normal py-2 pr-3">Symbol</th>
                      <th className="text-right font-normal py-2 pr-3">Entry</th>
                      <th className="text-right font-normal py-2 pr-3">Exit</th>
                      <th className="text-right font-normal py-2 pr-3">P&L</th>
                      <th className="text-left font-normal py-2">Exit Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeLog.slice(0, 20).map((trade, idx) => (
                      <tr key={idx} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                        <td className="py-2 pr-3 text-white/50">{trade.date}</td>
                        <td className="py-2 pr-3 text-white font-medium">{trade.symbol}</td>
                        <td className="py-2 pr-3 text-right text-white/60">{trade.entry.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-right text-white/60">{trade.exit.toFixed(2)}</td>
                        <td className={`py-2 pr-3 text-right font-medium ${trade.pnl >= 0 ? 'text-up' : 'text-down'}`}>
                          {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(0)}
                        </td>
                        <td className="py-2 text-white/30 capitalize">{trade.exit_reason.replace(/_/g, ' ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No backtest data placeholder */}
          {equityCurve.length === 0 && monthlyReturns.length === 0 && (
            <div className="glass-card p-8 text-center">
              <BarChart3 className="w-10 h-10 text-white/10 mx-auto mb-3" />
              <p className="text-sm text-white/40">Detailed backtest data coming soon</p>
              <p className="text-xs text-white/20 mt-1">Summary statistics are available from the catalog</p>
            </div>
          )}
        </div>

        {/* Right: Deploy panel (1 col) */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <DeploySection strategy={strategy} />
          </div>
        </div>
      </div>

    </div>
  )
}
