'use client'

/**
 * /paper-trading — F11 paper trading dashboard (Step 4 §5.3 rebuild).
 *
 * Layout:
 *   - Top hero: achievements strip (streak + trades + total + badges)
 *   - Row 1: equity curve (8/12) · stat cards (4/12)
 *   - Row 2: Paper League leaderboard (full width)
 *   - Conditional: Go-Live CTA panel (shown at ≥30 days paper trading)
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, TrendingUp, Zap, ArrowUpRight, RefreshCw } from 'lucide-react'

import AppLayout from '@/components/shared/AppLayout'
import AchievementsStrip from '@/components/paper/AchievementsStrip'
import PaperLeagueLeaderboard from '@/components/paper/PaperLeagueLeaderboard'
import EquityCurveWithBenchmark from '@/components/paper/EquityCurveWithBenchmark'
import { api } from '@/lib/api'

type EquityPoint = {
  snapshot_date: string
  equity: number
  cash: number
  invested: number
  drawdown_pct: number | null
  nifty_close: number | null
  return_pct: number
  nifty_pct: number
}

export default function PaperTradingPage() {
  const [equity, setEquity] = useState<{
    points: EquityPoint[]
    latest: any
  } | null>(null)
  const [achievements, setAchievements] = useState<Awaited<ReturnType<typeof api.paper.getAchievements>> | null>(null)
  const [league, setLeague] = useState<Awaited<ReturnType<typeof api.paper.getLeague>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAll = async () => {
    setLoading(true)
    setError(null)
    try {
      const [eq, ach, lg] = await Promise.all([
        api.paper.getEquityCurve(90).catch(() => null),
        api.paper.getAchievements().catch(() => null),
        api.paper.getLeague(1).catch(() => null),
      ])
      setEquity(eq as any)
      setAchievements(ach as any)
      setLeague(lg as any)
    } catch (e: any) {
      setError(e?.message || 'Failed to load paper-trading data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [])

  const latestEquity = achievements?.current_equity ?? equity?.latest?.equity ?? 10_00_000
  const points = equity?.points ?? []
  const latestPoint = points[points.length - 1]
  const yourPct = latestPoint?.return_pct ?? 0
  const niftyPct = latestPoint?.nifty_pct ?? 0
  const vsNifty = yourPct - niftyPct

  if (loading && !equity && !achievements) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto space-y-5">
        {/* ── Title row ── */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[26px] font-semibold text-white">Paper trading</h1>
            <p className="text-[12px] text-d-text-muted mt-1">
              Virtual ₹10,00,000 portfolio. Every trade recorded. No capital at risk.
            </p>
          </div>
          <button
            onClick={loadAll}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] border border-d-border rounded-md text-d-text-secondary hover:text-white hover:bg-white/[0.03] transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>

        {error && (
          <div className="trading-surface text-down text-[12px]">{error}</div>
        )}

        {/* ── Achievements strip ── */}
        {achievements && (
          <AchievementsStrip
            streakDays={achievements.streak_days}
            tradeCount={achievements.trade_count}
            totalReturnPct={achievements.total_return_pct}
            badges={achievements.badges}
          />
        )}

        {/* ── Row 1: equity curve + stat cards ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Chart card */}
          <div className="lg:col-span-8 trading-surface">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-d-text-muted">
                  Equity curve · last 90 days
                </p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span className="numeric text-[26px] font-semibold text-white">
                    ₹{Math.round(latestEquity).toLocaleString('en-IN')}
                  </span>
                  <span
                    className="numeric text-[13px] font-medium"
                    style={{ color: yourPct >= 0 ? '#05B878' : '#FF5947' }}
                  >
                    {yourPct >= 0 ? '+' : ''}{yourPct.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
            <EquityCurveWithBenchmark points={points} />
          </div>

          {/* Stats column */}
          <div className="lg:col-span-4 space-y-3">
            <StatCard
              label="vs Nifty 50"
              value={`${vsNifty >= 0 ? '+' : ''}${vsNifty.toFixed(2)}%`}
              sub={`You ${yourPct.toFixed(1)}% · Nifty ${niftyPct.toFixed(1)}%`}
              color={vsNifty >= 0 ? '#05B878' : '#FF5947'}
            />
            <StatCard
              label="Closed trades"
              value={String(achievements?.trade_count ?? 0)}
              sub="Since account open"
              color="#4FECCD"
            />
            <StatCard
              label="Days trading"
              value={String(achievements?.days_trading ?? 0)}
              sub="Snapshots captured"
              color="#DADADA"
            />
            <StatCard
              label="Drawdown"
              value={`${latestPoint?.drawdown_pct?.toFixed(2) ?? '0.00'}%`}
              sub="vs 90-day peak"
              color={(latestPoint?.drawdown_pct ?? 0) < -5 ? '#FF5947' : '#FEB113'}
            />
          </div>
        </div>

        {/* ── Go live CTA (≥30 days) ── */}
        {achievements?.go_live_eligible && (
          <div
            className="trading-surface flex flex-col md:flex-row items-start md:items-center gap-4"
            style={{
              borderLeft: '4px solid #FFD166',
              background: 'linear-gradient(135deg, rgba(255,209,102,0.06) 0%, rgba(255,153,0,0.04) 100%)',
            }}
          >
            <div className="flex-1">
              <h3 className="text-[16px] font-semibold text-white flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#FFD166]" />
                You&apos;ve paper-traded for 30+ days
              </h3>
              <p className="text-[12px] text-d-text-secondary mt-1">
                Ready to switch to live? Connect your broker and trade real capital with the same
                AI signals, risk controls, and kill-switch.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/settings?tab=broker"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover transition-colors"
              >
                <Zap className="w-3.5 h-3.5" />
                Connect broker
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium border border-d-border text-white rounded-md hover:bg-white/[0.03] transition-colors"
              >
                Upgrade to Elite
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* ── Paper League ── */}
        {league && <PaperLeagueLeaderboard rows={league.top_20} />}

        <p className="text-[10px] text-d-text-muted pt-6 border-t border-d-border">
          Paper trading results do not include market impact, slippage, or after-hours risk. Live
          trading introduces execution cost and tax. Market investments carry risk.
        </p>
      </div>
    </AppLayout>
  )
}

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className="trading-surface">
      <p className="text-[10px] text-d-text-muted uppercase tracking-wider">{label}</p>
      <p className="numeric text-[20px] font-semibold mt-0.5" style={{ color }}>{value}</p>
      {sub && <p className="text-[10px] text-d-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}
