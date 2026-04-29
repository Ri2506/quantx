'use client'

/**
 * /earnings-calendar — F9 Earnings predictor dashboard.
 *
 * Pro users see: calendar + beat probability + 1-line thesis.
 * Elite users see: additional "Pre-earnings strategy" drawer on click.
 *
 * Data source: ``/api/earnings/upcoming`` (DB-backed, refreshed daily
 * at 17:00 IST by the ``earnings_predictor_scan`` scheduler job).
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CalendarDays,
  Minus,
  Newspaper,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'

type UpcomingRow = Awaited<ReturnType<typeof api.earnings.upcoming>>[number]
type StrategyDetail = Awaited<ReturnType<typeof api.earnings.strategy>>


export default function EarningsCalendarPage() {
  const [rows, setRows] = useState<UpcomingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish' | 'non_directional'>('all')
  const [days, setDays] = useState<7 | 14 | 30>(14)
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null)
  const [strategyLoading, setStrategyLoading] = useState(false)
  const [strategyError, setStrategyError] = useState<string | null>(null)
  const [modelReady, setModelReady] = useState<boolean | null>(null)
  // PR 71 — watchlist filter so users can answer "do MY stocks have
  // earnings ahead?" without scrolling the full NSE calendar.
  const [watchlistOnly, setWatchlistOnly] = useState(false)
  const [watchlistSyms, setWatchlistSyms] = useState<Set<string>>(new Set())

  // PR 52 — gate the whole page on EarningsScout model availability.
  useEffect(() => {
    ;(async () => {
      try {
        const s = await api.publicTrust.modelsStatus()
        setModelReady(Boolean(s.models?.earnings_scout))
      } catch {
        setModelReady(false)
      }
    })()
  }, [])

  // PR 71 — load the user's watchlist symbols once for the filter.
  useEffect(() => {
    ;(async () => {
      try {
        const w = await api.watchlist.getAll()
        const syms = new Set<string>(
          (w.watchlist || [])
            .map((row) => String(row.symbol || '').toUpperCase().replace(/\.NS$/, ''))
            .filter(Boolean),
        )
        setWatchlistSyms(syms)
      } catch {
        setWatchlistSyms(new Set())
      }
    })()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const r = await api.earnings.upcoming(days)
      setRows(r || [])
      setError(null)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (modelReady === false) { setLoading(false); return }
    if (modelReady === null) return
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, modelReady])

  const filtered = useMemo(() => {
    let out = rows
    if (filter !== 'all') out = out.filter((r) => r.direction === filter)
    if (watchlistOnly && watchlistSyms.size > 0) {
      out = out.filter((r) => watchlistSyms.has(r.symbol.toUpperCase().replace(/\.NS$/, '')))
    }
    return out
  }, [rows, filter, watchlistOnly, watchlistSyms])

  const watchlistCount = useMemo(() => {
    if (watchlistSyms.size === 0) return 0
    return rows.filter((r) =>
      watchlistSyms.has(r.symbol.toUpperCase().replace(/\.NS$/, '')),
    ).length
  }, [rows, watchlistSyms])

  const grouped = useMemo(() => {
    const by: Record<string, UpcomingRow[]> = {}
    for (const r of filtered) {
      const key = r.announce_date
      if (!by[key]) by[key] = []
      by[key].push(r)
    }
    return by
  }, [filtered])

  const loadStrategy = async (symbol: string) => {
    setStrategyError(null)
    setStrategyLoading(true)
    try {
      const s = await api.earnings.strategy(symbol)
      setStrategy(s)
    } catch (err) {
      setStrategyError(handleApiError(err))
      setStrategy(null)
    } finally {
      setStrategyLoading(false)
    }
  }

  // PR 52 — model-unavailable state. Clean "coming soon" rather than
  // simulated output.
  if (modelReady === false) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-16 text-center space-y-3">
        <CalendarDays className="w-10 h-10 text-primary mx-auto" />
        <h1 className="text-[22px] font-semibold text-white">Earnings Calendar — coming soon</h1>
        <p className="text-[13px] text-d-text-muted max-w-lg mx-auto leading-relaxed">
          The EarningsScout model is still being trained on the full NSE dataset.
          Once live, you&rsquo;ll see every upcoming announcement with a calibrated
          beat probability and a pre-earnings setup read. We don&rsquo;t ship
          simulated AI — this page stays dark until the real engine lands.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-primary" />
            Earnings Calendar
          </h1>
          <p className="text-[12px] text-d-text-muted mt-0.5">
            Upcoming NSE announcements · beat probability + pre-earnings setup
          </p>
        </div>
        <div className="flex items-center gap-2">
          <WindowPill active={days === 7} onClick={() => setDays(7)}>7d</WindowPill>
          <WindowPill active={days === 14} onClick={() => setDays(14)}>14d</WindowPill>
          <WindowPill active={days === 30} onClick={() => setDays(30)}>30d</WindowPill>
        </div>
      </header>

      {/* Filter chips */}
      <section className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
          All · {rows.length}
        </FilterChip>
        <FilterChip
          active={filter === 'bullish'}
          onClick={() => setFilter('bullish')}
          color="#05B878"
        >
          Bullish · {rows.filter((r) => r.direction === 'bullish').length}
        </FilterChip>
        <FilterChip
          active={filter === 'bearish'}
          onClick={() => setFilter('bearish')}
          color="#FF5947"
        >
          Bearish · {rows.filter((r) => r.direction === 'bearish').length}
        </FilterChip>
        <FilterChip
          active={filter === 'non_directional'}
          onClick={() => setFilter('non_directional')}
          color="#FEB113"
        >
          Non-directional · {rows.filter((r) => r.direction === 'non_directional').length}
        </FilterChip>
        {/* PR 71 — separator + watchlist filter. Hidden when the user
            hasn't built a watchlist yet (zero symbols). */}
        {watchlistSyms.size > 0 && (
          <>
            <span className="h-4 w-px bg-d-border mx-1" aria-hidden />
            <FilterChip
              active={watchlistOnly}
              onClick={() => setWatchlistOnly((v) => !v)}
              color="#4FECCD"
            >
              My watchlist · {watchlistCount}
            </FilterChip>
          </>
        )}
      </section>

      {loading ? (
        <div className="rounded-lg border border-d-border bg-[#111520] p-8 text-center text-[13px] text-d-text-muted">
          Loading earnings calendar…
        </div>
      ) : error ? (
        <div className="rounded-lg border border-d-border bg-[#111520] p-5">
          <p className="text-[13px] text-down">{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-d-border bg-[#111520] p-8 text-center space-y-2">
          <Newspaper className="w-5 h-5 text-d-text-muted mx-auto" />
          <p className="text-[13px] text-d-text-muted">
            No announcements {filter === 'all' ? '' : `flagged ${filter}`} in the next {days} days.
          </p>
          <p className="text-[11px] text-d-text-muted">
            Calendar refreshes every day at 17:00 IST.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dateStr, list]) => (
              <DaySection
                key={dateStr}
                dateStr={dateStr}
                rows={list}
                onSelect={(s) => loadStrategy(s)}
              />
            ))}
        </div>
      )}

      <p className="text-[10px] text-d-text-muted text-center">
        Beat probability + direction call from the EarningsScout engine. Calendar refreshes
        every day at 17:00 IST. Educational — not investment advice.
      </p>

      {/* Elite strategy drawer */}
      {(strategy || strategyLoading || strategyError) && (
        <StrategyDrawer
          data={strategy}
          loading={strategyLoading}
          error={strategyError}
          onClose={() => {
            setStrategy(null)
            setStrategyError(null)
          }}
        />
      )}
    </div>
  )
}


/* ───────────────────────── components ───────────────────────── */


function DaySection({
  dateStr,
  rows,
  onSelect,
}: {
  dateStr: string
  rows: UpcomingRow[]
  onSelect: (symbol: string) => void
}) {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000)
  const relLabel =
    diffDays === 0 ? 'Today'
    : diffDays === 1 ? 'Tomorrow'
    : diffDays > 0 ? `in ${diffDays}d`
    : `${Math.abs(diffDays)}d ago`

  return (
    <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
      <div className="px-5 py-3 border-b border-d-border flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold text-white">
            {d.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-[10px] text-d-text-muted">{relLabel} · {rows.length} companies</p>
        </div>
        <Calendar className="w-4 h-4 text-d-text-muted" />
      </div>
      <div className="divide-y divide-d-border">
        {rows
          .sort((a, b) => (b.beat_prob ?? 0) - (a.beat_prob ?? 0))
          .map((r) => (
            <EarningsRow key={`${r.symbol}-${r.announce_date}`} r={r} onSelect={() => onSelect(r.symbol)} />
          ))}
      </div>
    </section>
  )
}


function EarningsRow({ r, onSelect }: { r: UpcomingRow; onSelect: () => void }) {
  const bp = r.beat_prob ?? 0.5
  const prob = Math.round(bp * 100)
  const color = r.direction === 'bullish' ? '#05B878' : r.direction === 'bearish' ? '#FF5947' : '#FEB113'
  const Icon = r.direction === 'bullish' ? ArrowUpRight : r.direction === 'bearish' ? ArrowDownRight : Minus

  return (
    <div className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/stock/${r.symbol.replace('.NS', '')}`}
            className="text-[13px] font-semibold text-white hover:text-primary"
          >
            {r.symbol.replace('.NS', '')}
          </Link>
          {r.confidence && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0A0D14] border border-d-border text-d-text-muted">
              {r.confidence}
            </span>
          )}
        </div>
        {r.thesis && (
          <p className="text-[11px] text-d-text-secondary mt-0.5 truncate">{r.thesis}</p>
        )}
      </div>

      {/* Beat bar */}
      <div className="shrink-0 w-40">
        <div className="flex items-end justify-between mb-1">
          <span className="text-[9px] uppercase tracking-wider text-d-text-muted">Beat prob.</span>
          <span className="numeric text-[12px] font-semibold" style={{ color }}>
            {prob}%
          </span>
        </div>
        <div className="relative h-1.5 bg-[#0A0D14] rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full transition-all"
            style={{ width: `${prob}%`, background: color }}
          />
          <div className="absolute top-0 h-full w-px bg-d-text-muted" style={{ left: '50%' }} />
        </div>
      </div>

      <Icon className="w-4 h-4 shrink-0" style={{ color }} />

      <button
        onClick={onSelect}
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-d-border text-[10px] text-white hover:bg-white/[0.03] hover:border-primary/40"
      >
        <Sparkles className="w-3 h-3 text-primary" />
        Strategy
      </button>
    </div>
  )
}


function StrategyDrawer({
  data,
  loading,
  error,
  onClose,
}: {
  data: StrategyDetail | null
  loading: boolean
  error: string | null
  onClose: () => void
}) {
  const color =
    data?.strategy.direction === 'bullish' ? '#05B878'
    : data?.strategy.direction === 'bearish' ? '#FF5947'
    : '#FEB113'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-d-border bg-[#0E1220] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#0E1220] px-5 py-4 border-b border-d-border flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Pre-earnings strategy
            <span className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 bg-[rgba(255,209,102,0.10)] text-[#FFD166] border border-[rgba(255,209,102,0.45)]">
              Elite
            </span>
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
            <X className="w-4 h-4 text-d-text-muted" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <p className="text-[13px] text-d-text-muted">Building strategy…</p>
          )}
          {error && !loading && (
            <div className="rounded-lg border border-d-border bg-[#111520] p-4">
              <p className="text-[12px] text-down">{error}</p>
              {error.toLowerCase().includes('elite') && (
                <Link
                  href="/pricing"
                  className="inline-block mt-2 text-[11px] text-primary hover:underline"
                >
                  Upgrade to Elite →
                </Link>
              )}
            </div>
          )}
          {data && !loading && !error && (
            <>
              <div className="rounded-lg border border-d-border bg-[#111520] p-4">
                <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-1">Thesis</p>
                <p className="text-[13px] text-white">{data.strategy.thesis}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border" style={{
                    color, borderColor: `${color}66`, background: `${color}14`,
                  }}>
                    <TrendingUp className="w-3 h-3" /> {data.strategy.strategy_name || '—'}
                  </span>
                  <span className="text-d-text-muted">
                    Announce {new Date(data.announce_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                    {' · '}beat prob {Math.round(data.beat_prob * 100)}%
                  </span>
                </div>
              </div>

              {data.strategy.legs && data.strategy.legs.length > 0 ? (
                <div className="rounded-lg border border-d-border bg-[#111520] p-4">
                  <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-2">Legs</p>
                  <div className="space-y-1.5">
                    {data.strategy.legs.map((l, i) => (
                      <div key={i} className="flex items-center gap-3 text-[12px]">
                        <span
                          className={`inline-flex items-center justify-center w-14 h-6 rounded text-[10px] font-semibold tracking-wider ${
                            l.action === 'BUY'
                              ? 'bg-up/10 text-up border border-up/30'
                              : 'bg-down/10 text-down border border-down/30'
                          }`}
                        >
                          {l.action}
                        </span>
                        <span className={`text-[11px] font-semibold ${l.option_type === 'CE' ? 'text-[#4FECCD]' : 'text-[#FF9900]'}`}>
                          {l.option_type}
                        </span>
                        <span className="numeric text-white w-16">{l.strike.toFixed(0)}</span>
                        <span className="text-d-text-muted text-[10px] flex-1">
                          IV {(l.iv * 100).toFixed(1)}% · Δ {l.delta.toFixed(2)}
                        </span>
                        <span className="numeric text-white w-14 text-right">₹{l.premium.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
                    <MiniStat
                      label="Max profit"
                      value={data.strategy.max_profit != null ? `₹${data.strategy.max_profit.toFixed(0)}` : '—'}
                      accent="#05B878"
                    />
                    <MiniStat
                      label="Max loss"
                      value={data.strategy.max_loss != null ? `₹${data.strategy.max_loss.toFixed(0)}` : 'Undefined'}
                      accent="#FF5947"
                    />
                    <MiniStat
                      label="POP"
                      value={
                        data.strategy.probability_of_profit != null
                          ? `${Math.round(data.strategy.probability_of_profit * 100)}%`
                          : '—'
                      }
                    />
                  </div>
                  {data.strategy.breakevens && data.strategy.breakevens.length > 0 && (
                    <p className="mt-2 text-[10px] text-d-text-muted">
                      Breakeven: {data.strategy.breakevens.map((b) => b.toFixed(0)).join(' / ')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-lg border border-d-border bg-[#111520] p-4">
                  <p className="text-[12px] text-d-text-muted">
                    Legs unavailable — typically happens when spot price lookup fails
                    or the symbol has no weekly options.
                  </p>
                  {data.strategy.notes && data.strategy.notes.length > 0 && (
                    <ul className="mt-2 space-y-0.5 text-[10px] text-d-text-muted">
                      {data.strategy.notes.map((n, i) => <li key={i}>· {n}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}


function MiniStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md bg-[#0A0D14] border border-d-border px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-d-text-muted">{label}</p>
      <p className="numeric text-[12px] font-semibold mt-0.5" style={{ color: accent || '#FFFFFF' }}>
        {value}
      </p>
    </div>
  )
}


function WindowPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-md text-[11px] font-medium border transition-colors ${
        active
          ? 'bg-primary/10 border-primary/40 text-primary'
          : 'bg-[#111520] border-d-border text-d-text-secondary hover:text-white'
      }`}
    >
      {children}
    </button>
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
