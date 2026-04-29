'use client'

/**
 * /sector-rotation — F10 Pro sector rotation dashboard.
 *
 * Step 4 §4.14: 11 NSE sectors, rotation-tagged In / Out / Neutral,
 * FII/DII flow context, drill-down to top stocks per sector.
 *
 * Backing data refreshed nightly at 17:15 IST by
 * ``scheduler.sector_rotation_aggregate``.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Waypoints,
  X,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'

type Overview = Awaited<ReturnType<typeof api.sectorRotation.overview>>
type SectorRow = Overview['sectors'][number]
type Detail = Awaited<ReturnType<typeof api.sectorRotation.sector>>
type Flows = Awaited<ReturnType<typeof api.sectorRotation.flows>>

const ROTATING_COPY: Record<SectorRow['rotating'], { label: string; color: string; Icon: any }> = {
  in:      { label: 'Rotating in',  color: '#05B878', Icon: ArrowUpRight },
  out:     { label: 'Rotating out', color: '#FF5947', Icon: ArrowDownRight },
  neutral: { label: 'Neutral',      color: '#FEB113', Icon: Minus },
}


export default function SectorRotationPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [flows, setFlows] = useState<Flows | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'in' | 'out' | 'neutral'>('all')
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const [o, f] = await Promise.all([
        api.sectorRotation.overview(),
        api.sectorRotation.flows(7).catch(() => null),
      ])
      setData(o)
      setFlows(f)
      setError(null)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'all') return data.sectors
    return data.sectors.filter((s) => s.rotating === filter)
  }, [data, filter])

  const openDetail = async (sector: string) => {
    setDetailError(null)
    setDetailLoading(true)
    try {
      const d = await api.sectorRotation.sector(sector)
      setDetail(d)
    } catch (err) {
      setDetailError(handleApiError(err))
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-10">
        <div className="text-[13px] text-d-text-muted">Loading sector rotation…</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-10">
        <div className="rounded-lg border border-d-border bg-[#111520] p-5">
          <p className="text-[13px] text-down">{error || 'Failed to load'}</p>
        </div>
      </div>
    )
  }

  const noData = !data.trade_date || data.sectors.length === 0

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
            <Waypoints className="w-5 h-5 text-primary" />
            Sector Rotation
          </h1>
          <p className="text-[12px] text-d-text-muted mt-0.5">
            SectorFlow alpha aggregation · NSE FII/DII flow context · updated daily 17:15 IST
          </p>
        </div>
        {data.trade_date && (
          <span className="text-[11px] text-d-text-muted">
            as of {new Date(data.trade_date).toLocaleDateString('en-IN', {
              day: '2-digit', month: 'short', year: 'numeric',
            })}
          </span>
        )}
      </header>

      {noData ? (
        <div className="rounded-lg border border-d-border bg-[#111520] p-8 text-center space-y-2">
          <Waypoints className="w-5 h-5 text-d-text-muted mx-auto" />
          <p className="text-[13px] text-d-text-muted">
            {data.note || 'Awaiting first aggregate run.'}
          </p>
          <p className="text-[11px] text-d-text-muted">
            The scheduler produces the first snapshot once AlphaRank has populated nightly ranks.
          </p>
        </div>
      ) : (
        <>
          {/* FII/DII strip */}
          <FlowsStrip flows={flows} />

          {/* Filter chips */}
          <section className="flex flex-wrap items-center gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              All · {data.sectors.length}
            </FilterChip>
            <FilterChip
              active={filter === 'in'}
              onClick={() => setFilter('in')}
              color="#05B878"
            >
              Rotating in · {data.counts.in}
            </FilterChip>
            <FilterChip
              active={filter === 'out'}
              onClick={() => setFilter('out')}
              color="#FF5947"
            >
              Rotating out · {data.counts.out}
            </FilterChip>
            <FilterChip
              active={filter === 'neutral'}
              onClick={() => setFilter('neutral')}
              color="#FEB113"
            >
              Neutral · {data.counts.neutral}
            </FilterChip>
          </section>

          {/* Sector grid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((s) => (
              <SectorCard key={s.sector} s={s} onClick={() => openDetail(s.sector)} />
            ))}
          </section>
        </>
      )}

      <p className="text-[10px] text-d-text-muted text-center">
        Rotation tags are derived from cross-sectional quartiles of AlphaRank momentum scores.
        FII/DII flow is NSE-wide (sector-specific attribution requires custody data we do not have).
      </p>

      {/* Detail drawer */}
      {(detail || detailLoading || detailError) && (
        <SectorDrawer
          d={detail}
          loading={detailLoading}
          error={detailError}
          onClose={() => {
            setDetail(null)
            setDetailError(null)
          }}
        />
      )}
    </div>
  )
}


/* ───────────────────────── components ───────────────────────── */


function FlowsStrip({ flows }: { flows: Flows | null }) {
  const series = flows?.series ?? []
  const latest = series[series.length - 1]
  const fii = latest?.fii_net ?? null
  const dii = latest?.dii_net ?? null
  const fiiColor = fii == null ? '#8e8e8e' : fii >= 0 ? '#05B878' : '#FF5947'
  const diiColor = dii == null ? '#8e8e8e' : dii >= 0 ? '#05B878' : '#FF5947'
  return (
    <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-d-border">
        <Cell
          label="FII net (latest)"
          value={fii == null ? '—' : `${fii >= 0 ? '+' : ''}${formatCr(fii)}`}
          accent={fiiColor}
          sub={latest ? new Date(latest.trade_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : undefined}
        />
        <Cell
          label="DII net (latest)"
          value={dii == null ? '—' : `${dii >= 0 ? '+' : ''}${formatCr(dii)}`}
          accent={diiColor}
          sub="₹ crore"
        />
        <Cell
          label="7-day window"
          value={`${series.length} sessions`}
          sub="NSE-wide flows"
        />
        <div className="px-4 py-3 text-[11px] text-d-text-muted">
          NSE FII/DII trade report. Sector attribution is derived from
          alpha-rank aggregation, not custody data.
        </div>
      </div>
      {/* PR 70 — 7-day FII/DII bar visualization. Uses the same series
          we already fetch; previously only the latest cell was rendered. */}
      {series.length >= 2 && (
        <div className="px-4 py-3 border-t border-d-border">
          <FlowsBars series={series} />
        </div>
      )}
    </section>
  )
}


function FlowsBars({
  series,
}: {
  series: Array<{ trade_date: string; fii_net: number | null; dii_net: number | null }>
}) {
  const fiiVals = series.map((d) => d.fii_net).filter((v): v is number => v != null)
  const diiVals = series.map((d) => d.dii_net).filter((v): v is number => v != null)
  const maxAbs = Math.max(
    1,
    ...fiiVals.map(Math.abs),
    ...diiVals.map(Math.abs),
  )
  const ROW_H = 28
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-d-text-muted">
        <span>FII / DII · last {series.length} sessions</span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-up" /> positive
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-down" /> negative
        </span>
      </div>
      <div className="space-y-1">
        {(['fii_net', 'dii_net'] as const).map((key) => {
          const label = key === 'fii_net' ? 'FII' : 'DII'
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-d-text-muted w-7 shrink-0">{label}</span>
              <div className="flex-1 grid gap-px" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}>
                {series.map((d) => {
                  const v = d[key] ?? 0
                  const pct = (Math.abs(v) / maxAbs) * 100
                  const positive = v >= 0
                  return (
                    <div
                      key={d.trade_date}
                      title={`${new Date(d.trade_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}: ${v >= 0 ? '+' : ''}${formatCr(v)}`}
                      className="relative"
                      style={{ height: ROW_H }}
                    >
                      <div
                        className="absolute left-0 right-0 top-1/2"
                        style={{
                          height: `${Math.max(2, pct / 2)}%`,
                          transform: positive ? 'translateY(-100%)' : 'none',
                          background: positive ? '#05B878' : '#FF5947',
                          opacity: 0.85,
                        }}
                      />
                      <div className="absolute left-0 right-0 top-1/2 h-px bg-d-border" />
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


function SectorCard({ s, onClick }: { s: SectorRow; onClick: () => void }) {
  const tag = ROTATING_COPY[s.rotating]
  const momentum = s.momentum_score
  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl border border-d-border bg-[#111520] hover:border-primary/40 transition-colors overflow-hidden"
      style={{ borderLeft: `3px solid ${tag.color}` }}
    >
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-semibold text-white">{s.sector}</h3>
            <p className="text-[10px] text-d-text-muted mt-0.5">
              {s.constituent_count} tracked stocks
            </p>
          </div>
          <span
            className="inline-flex items-center gap-1 text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 border"
            style={{
              color: tag.color,
              borderColor: `${tag.color}55`,
              background: `${tag.color}14`,
            }}
          >
            <tag.Icon className="w-2.5 h-2.5" />
            {tag.label}
          </span>
        </div>

        {/* Momentum bar */}
        <div className="mt-3">
          <div className="flex items-end justify-between mb-1">
            <span className="text-[9px] uppercase tracking-wider text-d-text-muted">
              Momentum score
            </span>
            <span className="numeric text-[12px] font-semibold" style={{ color: tag.color }}>
              {momentum.toFixed(1)}
            </span>
          </div>
          <div className="relative h-1.5 bg-[#0A0D14] rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full transition-all"
              style={{ width: `${Math.max(0, Math.min(100, momentum))}%`, background: tag.color }}
            />
            <div className="absolute top-0 h-full w-px bg-d-text-muted" style={{ left: '50%' }} />
          </div>
        </div>

        {/* Top stocks chips */}
        {s.top_stocks && s.top_stocks.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {s.top_stocks.slice(0, 3).map((sym) => (
              <span
                key={sym}
                className="text-[10px] px-1.5 py-0.5 rounded bg-[#0A0D14] border border-d-border text-d-text-secondary"
              >
                {sym.replace('.NS', '')}
              </span>
            ))}
            {s.top_stocks.length > 3 && (
              <span className="text-[10px] text-d-text-muted">+{s.top_stocks.length - 3}</span>
            )}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-[10px] text-d-text-muted">
          <span>View top stocks</span>
          <ArrowRight className="w-3 h-3" />
        </div>
      </div>
    </button>
  )
}


function SectorDrawer({
  d,
  loading,
  error,
  onClose,
}: {
  d: Detail | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const tag = d ? ROTATING_COPY[d.snapshot.rotating] : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-d-border bg-[#0E1220] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#0E1220] px-5 py-4 border-b border-d-border flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-white">
            {d ? d.sector : 'Sector detail'}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-4 h-4 text-d-text-muted" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && <p className="text-[13px] text-d-text-muted">Loading top stocks…</p>}
          {error && !loading && (
            <div className="rounded-lg border border-d-border bg-[#111520] p-4">
              <p className="text-[12px] text-down">{error}</p>
            </div>
          )}
          {d && !loading && !error && tag && (
            <>
              {/* Stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-d-border rounded-lg border border-d-border bg-[#111520] overflow-hidden">
                <Cell
                  label="Rotation"
                  value={tag.label}
                  accent={tag.color}
                />
                <Cell
                  label="Momentum"
                  value={d.snapshot.momentum_score.toFixed(1)}
                  sub="/ 100"
                />
                <Cell
                  label="Constituents"
                  value={String(d.snapshot.constituent_count)}
                  sub="tracked stocks"
                />
                <Cell
                  label="Mean rank"
                  value={(d.snapshot.mean_rank_norm * 100).toFixed(1)}
                  sub="normalized"
                />
              </div>

              {/* Top stocks table */}
              <div className="rounded-lg border border-d-border bg-[#111520] overflow-hidden">
                <div className="px-5 py-3 border-b border-d-border">
                  <p className="text-[12px] font-semibold text-white">Top-ranked stocks</p>
                  <p className="text-[10px] text-d-text-muted">by AlphaRank raw score on {d.trade_date}</p>
                </div>
                {d.top_stocks.length === 0 ? (
                  <div className="p-5 text-center text-[12px] text-d-text-muted">
                    No ranked stocks in this sector.
                  </div>
                ) : (
                  <div className="divide-y divide-d-border">
                    {d.top_stocks.map((s, i) => (
                      <div key={s.symbol} className="px-5 py-3 flex items-center gap-4">
                        <span className="text-[10px] uppercase tracking-wider text-d-text-muted w-6">
                          #{i + 1}
                        </span>
                        <Link
                          href={`/stock/${s.symbol.replace('.NS', '')}`}
                          className="text-[13px] font-semibold text-white hover:text-primary flex-1 min-w-0"
                        >
                          {s.symbol.replace('.NS', '')}
                        </Link>
                        <div className="text-right">
                          <p className="text-[9px] uppercase tracking-wider text-d-text-muted">AlphaRank</p>
                          <p className="numeric text-[12px] text-white">
                            {s.qlib_rank ?? '—'}
                          </p>
                        </div>
                        <div className="text-right w-20">
                          <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Raw score</p>
                          <p className="numeric text-[12px] text-d-text-secondary">
                            {s.qlib_score_raw != null ? s.qlib_score_raw.toFixed(4) : '—'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}


/* ───────────────────────── helpers ───────────────────────── */


function Cell({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-1">{label}</p>
      <p className="numeric text-[16px] font-semibold capitalize" style={{ color: accent || '#FFFFFF' }}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-d-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}


function FilterChip({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean
  onClick: () => void
  color?: string
  children: React.ReactNode
}) {
  const base = 'px-3 py-1 rounded-full text-[11px] font-medium border transition-colors'
  if (active && color) {
    return (
      <button
        onClick={onClick}
        className={base}
        style={{
          color,
          borderColor: `${color}66`,
          background: `${color}14`,
        }}
      >
        {children}
      </button>
    )
  }
  return (
    <button
      onClick={onClick}
      className={`${base} ${
        active
          ? 'bg-primary/10 border-primary/40 text-primary'
          : 'bg-[#111520] border-d-border text-d-text-secondary hover:text-white'
      }`}
    >
      {children}
    </button>
  )
}


function formatCr(n: number): string {
  // NSE FII/DII values are reported in ₹ crore directly.
  const abs = Math.abs(n)
  if (abs >= 1000) return `₹${(n / 1000).toFixed(1)}k cr`
  return `₹${n.toFixed(0)} cr`
}
