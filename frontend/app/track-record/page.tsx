'use client'

/**
 * /track-record — public trust surface (Step 4 §5.1.4).
 *
 * Regime banner · cumulative-return curve · expanded stats strip ·
 * filter row · per-signal engine chips + wins/losses/expired.
 * Every trade shown is verifiable — no hidden drawer.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react'

import { api } from '@/lib/api'
import ModelBadge from '@/components/ModelBadge'
import type { PublicModelKey } from '@/lib/models'

interface TrackStats {
  n: number
  wins: number
  losses: number
  expired: number
  win_rate: number
  avg_return_pct: number
  avg_win_pct: number
  avg_loss_pct: number
  profit_factor: number | null
  best_return_pct: number
  best_symbol: string | null
  worst_return_pct: number
  worst_symbol: string | null
}

interface TrackSignal {
  id: string
  symbol: string
  direction: 'LONG' | 'SHORT'
  segment: string
  entry_price: number
  exit_price: number
  target_1: number | null
  stop_loss: number
  return_pct: number
  result: 'target' | 'stop' | 'expired'
  status: string
  date: string
  confidence: number
  engines: PublicModelKey[]
  regime_at_signal: string | null
  model_agreement: number | null
}

interface CurvePoint {
  date: string
  cum_return_pct: number
}

type SegmentFilter = '' | 'EQUITY' | 'FUTURES' | 'OPTIONS'
type DirectionFilter = '' | 'LONG' | 'SHORT'

export default function TrackRecordPage() {
  const [days, setDays] = useState<30 | 90 | 365>(90)
  const [segment, setSegment] = useState<SegmentFilter>('')
  const [direction, setDirection] = useState<DirectionFilter>('')
  const [data, setData] = useState<{
    stats: TrackStats
    signals: TrackSignal[]
    curve: CurvePoint[]
    currentRegime: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await api.publicTrust.trackRecord({
          days,
          segment: segment || undefined,
          direction: direction || undefined,
          limit: 300,
        })
        if (!cancelled) {
          setData({
            stats: res.stats as TrackStats,
            signals: (res.signals as any[]) as TrackSignal[],
            curve: (res.curve as CurvePoint[]) || [],
            currentRegime: res.current_regime?.regime || null,
          })
          setError(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [days, segment, direction])

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white">
      <PublicHeader />

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-[28px] font-semibold">Track record</h1>
          <p className="text-[13px] text-d-text-muted mt-1">
            Every closed signal, last {days} days. Wins <strong className="text-up">and</strong> losses.{' '}
            Entry / exit / realized return computed from the signal row as saved at entry time.
          </p>
        </div>

        {/* ── RegimeIQ banner ── */}
        {data?.currentRegime && <RegimeBanner regime={data.currentRegime} />}

        {/* ── Stats strip ── */}
        {loading && !data ? (
          <div className="trading-surface flex items-center justify-center min-h-[80px]">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="trading-surface text-down text-[12px]">{error}</div>
        ) : data && (
          <StatsStrip stats={data.stats} />
        )}

        {/* ── Cumulative return curve ── */}
        {data && data.curve.length > 1 && <CurveCard curve={data.curve} />}

        {/* ── Win / loss / expired distribution ── */}
        {data && data.stats.n > 0 && <DistributionBar stats={data.stats} />}

        {/* ── PR 85 — per-engine breakdown ── */}
        {data && data.signals.length > 0 && <EngineBreakdown signals={data.signals} />}

        {/* ── Filters ── */}
        <div className="flex flex-wrap gap-3">
          <ButtonGroup
            label="Window"
            value={String(days)}
            options={[['30', '30d'], ['90', '90d'], ['365', '1y']]}
            onChange={(v) => setDays(Number(v) as 30 | 90 | 365)}
          />
          <ButtonGroup
            label="Segment"
            value={segment}
            options={[['', 'All'], ['EQUITY', 'Equity'], ['FUTURES', 'Futures'], ['OPTIONS', 'Options']]}
            onChange={(v) => setSegment(v as SegmentFilter)}
          />
          <ButtonGroup
            label="Direction"
            value={direction}
            options={[['', 'All'], ['LONG', 'Long'], ['SHORT', 'Short']]}
            onChange={(v) => setDirection(v as DirectionFilter)}
          />
        </div>

        {/* ── Signals list — table on md+, cards on mobile ── */}
        {data && (
          <>
            {/* md+: full table */}
            <div className="trading-surface !p-0 overflow-hidden hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] min-w-[760px]">
                  <thead className="text-d-text-muted border-b border-d-border">
                    <tr>
                      <th className="text-left px-4 py-3 font-normal">Symbol</th>
                      <th className="text-left px-2 py-3 font-normal">Dir</th>
                      <th className="text-right px-2 py-3 font-normal">Entry</th>
                      <th className="text-right px-2 py-3 font-normal">Exit</th>
                      <th className="text-right px-2 py-3 font-normal">Return</th>
                      <th className="text-left px-2 py-3 font-normal">Result</th>
                      <th className="text-left px-2 py-3 font-normal">Engines</th>
                      <th className="text-left px-2 py-3 font-normal">Regime</th>
                      <th className="text-right px-4 py-3 font-normal">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.signals.map((s) => (
                      <SignalRow key={s.id} row={s} />
                    ))}
                    {!data.signals.length && (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-d-text-muted">
                          No closed signals matching these filters yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* mobile: stacked cards */}
            <div className="md:hidden space-y-2">
              {data.signals.map((s) => (
                <SignalCardMobile key={s.id} row={s} />
              ))}
              {!data.signals.length && (
                <div className="trading-surface text-center text-[12px] text-d-text-muted py-8">
                  No closed signals matching these filters yet.
                </div>
              )}
            </div>
          </>
        )}

        <p className="text-[10px] text-d-text-muted pt-6 border-t border-d-border">
          Past performance ≠ future. Figures before transaction costs (STT / brokerage / GST) and
          tax. Market investments are subject to risk.
        </p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------- subcomponents

function PublicHeader() {
  return (
    <div className="border-b border-d-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-[14px] font-semibold text-white">
          Swing <span className="text-primary">AI</span>
        </Link>
        <div className="flex items-center gap-4 text-[12px] text-d-text-muted">
          <Link href="/regime" className="hover:text-white">Regime</Link>
          <Link href="/models" className="hover:text-white">Models</Link>
          <Link href="/pricing" className="hover:text-white">Pricing</Link>
          <Link
            href="/signup"
            className="px-3 py-1.5 bg-primary text-black rounded-md hover:bg-primary-hover transition-colors font-medium"
          >
            Start free
          </Link>
        </div>
      </div>
    </div>
  )
}

function RegimeBanner({ regime }: { regime: string }) {
  const tone =
    regime === 'bull' ? { bg: '#05B87814', fg: '#05B878', label: 'Bull' } :
    regime === 'bear' ? { bg: '#FF594714', fg: '#FF5947', label: 'Bear' } :
                        { bg: '#FEB11314', fg: '#FEB113', label: 'Sideways' }
  return (
    <div
      className="flex items-center justify-between rounded-lg border px-4 py-3 text-[12px]"
      style={{ background: tone.bg, borderColor: `${tone.fg}33` }}
    >
      <div className="flex items-center gap-3">
        <ModelBadge modelKey="regime_detector" size="xs" variant="soft" />
        <span className="text-d-text-muted">Current regime</span>
        <span className="font-semibold" style={{ color: tone.fg }}>{tone.label}</span>
      </div>
      <Link href="/regime" className="text-d-text-muted hover:text-white">View timeline →</Link>
    </div>
  )
}

function StatsStrip({ stats }: { stats: TrackStats }) {
  const winColor = stats.win_rate >= 0.5 ? '#05B878' : '#FEB113'
  const avgColor = stats.avg_return_pct >= 0 ? '#05B878' : '#FF5947'
  const pf = stats.profit_factor
  const pfDisplay = pf === null ? '∞' : pf.toFixed(2)
  const pfColor = pf === null || (pf ?? 0) >= 1 ? '#05B878' : '#FF5947'
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <Stat label="Closed" value={stats.n} numeric />
      <Stat label="Win rate" value={`${(stats.win_rate * 100).toFixed(1)}%`} color={winColor} />
      <Stat label="Avg return" value={`${stats.avg_return_pct >= 0 ? '+' : ''}${stats.avg_return_pct.toFixed(2)}%`} color={avgColor} />
      <Stat label="Avg win" value={`+${stats.avg_win_pct.toFixed(2)}%`} color="#05B878" />
      <Stat label="Avg loss" value={`${stats.avg_loss_pct.toFixed(2)}%`} color="#FF5947" />
      <Stat label="Profit factor" value={pfDisplay} color={pfColor} />
      <Stat
        label="Best · Worst"
        value={`${stats.best_symbol || '—'}`}
        sub={`+${stats.best_return_pct.toFixed(1)}% · ${stats.worst_return_pct.toFixed(1)}% ${stats.worst_symbol || ''}`}
        color="#05B878"
      />
    </div>
  )
}

function CurveCard({ curve }: { curve: CurvePoint[] }) {
  // Sample to ≤120 points for a compact SVG.
  const sampled = useMemo(() => {
    if (curve.length <= 120) return curve
    const step = Math.ceil(curve.length / 120)
    return curve.filter((_, i) => i % step === 0 || i === curve.length - 1)
  }, [curve])

  const values = sampled.map((p) => p.cum_return_pct)
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const range = max - min || 1
  const w = 1000
  const h = 160
  const pad = 8

  const points = sampled.map((p, i) => {
    const x = pad + (i / Math.max(1, sampled.length - 1)) * (w - pad * 2)
    const y = pad + (1 - (p.cum_return_pct - min) / range) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  const last = sampled[sampled.length - 1]?.cum_return_pct ?? 0
  const tone = last >= 0 ? '#05B878' : '#FF5947'

  const zeroY = pad + (1 - (0 - min) / range) * (h - pad * 2)

  return (
    <div className="trading-surface">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] text-d-text-muted uppercase tracking-wider">Cumulative return</p>
          <p className="text-[11px] text-d-text-muted mt-0.5">
            Running sum of realized %, closed signals oldest → newest
          </p>
        </div>
        <div className="text-right">
          <p className="numeric text-[20px] font-semibold" style={{ color: tone }}>
            {last >= 0 ? '+' : ''}{last.toFixed(2)}%
          </p>
        </div>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-[160px]">
        <line x1={pad} x2={w - pad} y1={zeroY} y2={zeroY} stroke="#2A2F3E" strokeWidth={1} strokeDasharray="3 3" />
        <polyline
          fill="none"
          stroke={tone}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
    </div>
  )
}

function DistributionBar({ stats }: { stats: TrackStats }) {
  const { wins, losses, expired, n } = stats
  const winPct = n ? (wins / n) * 100 : 0
  const lossPct = n ? (losses / n) * 100 : 0
  const expPct = n ? (expired / n) * 100 : 0
  return (
    <div className="trading-surface">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-d-text-muted uppercase tracking-wider">Outcome distribution</p>
        <p className="text-[11px] text-d-text-muted">
          <span className="text-up">{wins} wins</span>
          {' · '}
          <span className="text-down">{losses} losses</span>
          {' · '}
          <span className="text-d-text-muted">{expired} expired</span>
        </p>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden bg-[#1A1E2A]">
        <div style={{ width: `${winPct}%`, background: '#05B878' }} />
        <div style={{ width: `${lossPct}%`, background: '#FF5947' }} />
        <div style={{ width: `${expPct}%`, background: '#3A3F50' }} />
      </div>
    </div>
  )
}

/* ───────────────────────── PR 85 — per-engine breakdown ───────────────────────── */
//
// Each signal carries `engines: PublicModelKey[]` (which engines voted) and
// `result: 'target' | 'stop' | 'expired'`. The aggregate stats already
// answer "did the platform win" — the per-engine roll-up answers "which
// engines actually called the winners". Computed client-side from the
// signal list we're already showing; no extra API call.
//
// Win-rate denominator excludes 'expired' so an engine doesn't get
// punished by signals that simply ran out of time without resolving.

function EngineBreakdown({ signals }: { signals: TrackSignal[] }) {
  type Bucket = { engine: PublicModelKey; total: number; wins: number; losses: number; expired: number }
  const buckets: Record<string, Bucket> = {}
  for (const s of signals) {
    for (const e of s.engines || []) {
      if (!buckets[e]) buckets[e] = { engine: e, total: 0, wins: 0, losses: 0, expired: 0 }
      buckets[e].total++
      if (s.result === 'target') buckets[e].wins++
      else if (s.result === 'stop') buckets[e].losses++
      else buckets[e].expired++
    }
  }
  const rows = Object.values(buckets)
    .sort((a, b) => b.total - a.total || b.wins - a.wins)
  if (rows.length === 0) return null
  const maxTotal = Math.max(1, ...rows.map((r) => r.total))

  return (
    <div className="trading-surface !p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-d-border flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-d-text-muted">
          Per-engine breakdown
        </p>
        <p className="text-[10px] text-d-text-muted">
          which engines called the {rows.length} active signals
        </p>
      </div>
      <div className="divide-y divide-d-border">
        {rows.map((r) => {
          const decided = r.wins + r.losses
          const wr = decided > 0 ? r.wins / decided : 0
          const wrColor = wr >= 0.55 ? '#05B878' : wr >= 0.45 ? '#FEB113' : '#FF5947'
          return (
            <div key={r.engine} className="px-4 py-2.5 flex items-center gap-3">
              <div className="shrink-0 w-32">
                <ModelBadge modelKey={r.engine} size="xs" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1 text-[10px] text-d-text-muted">
                  <span>
                    <span className="numeric text-white">{r.total}</span>
                    {' signals · '}
                    <span className="text-up numeric">{r.wins}W</span>
                    {' · '}
                    <span className="text-down numeric">{r.losses}L</span>
                    {r.expired > 0 && (
                      <>
                        {' · '}
                        <span className="numeric">{r.expired} exp</span>
                      </>
                    )}
                  </span>
                  <span className="numeric font-semibold" style={{ color: wrColor }}>
                    {decided > 0 ? `${(wr * 100).toFixed(0)}% WR` : 'no decisions yet'}
                  </span>
                </div>
                <div className="relative h-1.5 rounded-full bg-[#1A1E2A] overflow-hidden">
                  {/* Total share — light underlay */}
                  <div
                    className="absolute top-0 left-0 h-full bg-white/[0.04]"
                    style={{ width: `${(r.total / maxTotal) * 100}%` }}
                  />
                  {/* Win share — filled to WR pct of the total bar */}
                  <div
                    className="absolute top-0 left-0 h-full"
                    style={{
                      width: `${(r.total / maxTotal) * 100 * wr}%`,
                      background: wrColor,
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
      <div className="px-4 py-2 border-t border-d-border text-[10px] text-d-text-muted">
        Win rate excludes expired signals (no decision). One signal can be called by multiple engines —
        each engine claims credit when it voted for that signal.
      </div>
    </div>
  )
}


function Stat({
  label, value, sub, color, numeric,
}: {
  label: string; value: string | number; sub?: string; color?: string; numeric?: boolean
}) {
  return (
    <div className="trading-surface">
      <p className="text-[10px] text-d-text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className={`${numeric ? 'numeric' : ''} text-[20px] font-semibold`} style={{ color: color || '#fff' }}>
        {value}
      </p>
      {sub && <p className="numeric text-[11px] mt-1 text-d-text-muted">{sub}</p>}
    </div>
  )
}

function ButtonGroup<T extends string>({
  label, value, options, onChange,
}: {
  label: string; value: T; options: Array<[T, string]>; onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-d-text-muted">{label}</span>
      <div className="inline-flex items-center bg-[#111520] border border-d-border rounded-md p-0.5">
        {options.map(([v, display]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
              value === v ? 'bg-white/[0.06] text-white' : 'text-d-text-muted hover:text-white'
            }`}
          >
            {display}
          </button>
        ))}
      </div>
    </div>
  )
}

function SignalRow({ row }: { row: TrackSignal }) {
  const isLong = row.direction === 'LONG'
  const resultColor =
    row.result === 'target' ? '#05B878' :
    row.result === 'stop' ? '#FF5947' : '#8E8E8E'
  const engines = (row.engines || []).slice(0, 3)
  return (
    <tr className="border-b border-d-border last:border-0 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3 text-white font-medium">{row.symbol}</td>
      <td className="px-2 py-3">
        <span
          className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded ${
            isLong ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
          }`}
        >
          {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {row.direction}
        </span>
      </td>
      <td className="px-2 py-3 text-right numeric text-d-text-primary">₹{row.entry_price.toFixed(2)}</td>
      <td className="px-2 py-3 text-right numeric text-d-text-primary">₹{row.exit_price.toFixed(2)}</td>
      <td
        className="px-2 py-3 text-right numeric font-medium"
        style={{ color: row.return_pct >= 0 ? '#05B878' : '#FF5947' }}
      >
        {row.return_pct >= 0 ? '+' : ''}{row.return_pct.toFixed(2)}%
      </td>
      <td className="px-2 py-3">
        <span
          className="inline-block px-1.5 py-0.5 text-[10px] font-medium rounded uppercase tracking-wider"
          style={{ color: resultColor, backgroundColor: `${resultColor}14` }}
        >
          {row.result}
        </span>
      </td>
      <td className="px-2 py-3">
        {engines.length ? (
          <div className="flex flex-wrap gap-1 max-w-[220px]">
            {engines.map((k) => (
              <ModelBadge key={k} modelKey={k} size="xs" variant="soft" />
            ))}
          </div>
        ) : (
          <span className="text-d-text-muted text-[11px]">—</span>
        )}
      </td>
      <td className="px-2 py-3 text-d-text-muted text-[11px] capitalize">
        {row.regime_at_signal || '—'}
      </td>
      <td className="px-4 py-3 text-right text-d-text-muted text-[11px] numeric">
        {new Date(row.date).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short',
        })}
      </td>
    </tr>
  )
}

// PR 59 — mobile card layout. Same data, stacked for narrow screens.
function SignalCardMobile({ row }: { row: TrackSignal }) {
  const isLong = row.direction === 'LONG'
  const resultColor =
    row.result === 'target' ? '#05B878' :
    row.result === 'stop' ? '#FF5947' : '#8E8E8E'
  const engines = (row.engines || []).slice(0, 3)
  return (
    <div className="trading-surface">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-white">{row.symbol}</span>
            <span
              className={`inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                isLong ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
              }`}
            >
              {isLong ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
              {row.direction}
            </span>
            <span
              className="inline-block px-1.5 py-0.5 text-[9px] font-medium rounded uppercase tracking-wider"
              style={{ color: resultColor, backgroundColor: `${resultColor}14` }}
            >
              {row.result}
            </span>
          </div>
          <div className="text-[11px] text-d-text-muted mt-1 numeric">
            {new Date(row.date).toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
            {row.regime_at_signal ? ` · ${row.regime_at_signal}` : ''}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div
            className="numeric text-[15px] font-semibold"
            style={{ color: row.return_pct >= 0 ? '#05B878' : '#FF5947' }}
          >
            {row.return_pct >= 0 ? '+' : ''}{row.return_pct.toFixed(2)}%
          </div>
          <div className="text-[10px] text-d-text-muted mt-0.5 numeric">
            ₹{row.entry_price.toFixed(2)} → ₹{row.exit_price.toFixed(2)}
          </div>
        </div>
      </div>
      {engines.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t border-d-border">
          {engines.map((k) => (
            <ModelBadge key={k} modelKey={k} size="xs" variant="soft" />
          ))}
        </div>
      )}
    </div>
  )
}
