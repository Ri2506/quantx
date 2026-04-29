'use client'

/**
 * /watchlist — PR 39 rebuild.
 *
 * Active monitoring surface for the user's tracked symbols.  Each card
 * joins a live quote with:
 *   - Dossier consensus  (bullish / bearish / mixed / neutral)
 *   - RegimeIQ warning   (flag when open signal conflicts with regime)
 *   - ToneScan sentiment (14-day mean, -1..+1)
 *   - Latest signal      (last 7 days, if any)
 *   - EarningsScout      (upcoming announcement next 14 days)
 *
 * Free tier is capped at 5 symbols; Pro+ is unlimited. The cap is
 * enforced server-side (watchlist_live_routes.py) and surfaced as an
 * inline upgrade banner when truncated.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellOff,
  CalendarDays,
  Check,
  Eye,
  Loader2,
  Minus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X as XIcon,
  Zap,
} from 'lucide-react'

import AppLayout from '@/components/shared/AppLayout'
import { api, handleApiError } from '@/lib/api'
import ModelBadge from '@/components/ModelBadge'


type Live = Awaited<ReturnType<typeof api.watchlist.live>>
type Item = Live['items'][number]

const CONSENSUS_COLOR: Record<string, string> = {
  bullish: '#05B878',
  bearish: '#FF5947',
  mixed:   '#FEB113',
  neutral: '#8e8e8e',
}

const REGIME_COLOR: Record<string, string> = {
  bull:     '#05B878',
  sideways: '#FEB113',
  bear:     '#FF5947',
}


export default function WatchlistPage() {
  const [data, setData] = useState<Live | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [addSymbol, setAddSymbol] = useState('')
  const [filter, setFilter] = useState<'all' | 'bullish' | 'bearish' | 'warnings'>('all')

  const refresh = async (spinner = false) => {
    if (spinner) setRefreshing(true)
    try {
      const r = await api.watchlist.live()
      setData(r)
      setError(null)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    refresh()
    // PR 123 — hydrate per-symbol pins from the server once per session
    // so cross-device pins (set on phone, opened on desktop) appear in
    // the modal without manual re-pinning. Fire-and-forget.
    import('@/lib/watchlistPresetMemory').then(({ hydrateSymbolPinsFromServer }) => {
      void hydrateSymbolPinsFromServer()
    }).catch(() => {})
    const id = setInterval(() => refresh(false), 60_000)
    return () => clearInterval(id)
  }, [])

  const filtered = useMemo(() => {
    if (!data) return []
    if (filter === 'all') return data.items
    if (filter === 'warnings') return data.items.filter((i) => i.engines?.regime_warning)
    return data.items.filter((i) => i.engines?.consensus === filter)
  }, [data, filter])

  const onAdd = async () => {
    const s = addSymbol.trim().toUpperCase().replace(/\.NS$/, '')
    if (!s) return
    setAdding(true)
    setError(null)
    try {
      await api.watchlist.add(s)
      setAddSymbol('')
      await refresh()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setAdding(false)
    }
  }

  const onRemove = async (sym: string) => {
    if (!confirm(`Remove ${sym} from watchlist?`)) return
    try {
      await api.watchlist.remove(sym)
      await refresh()
    } catch (err) {
      setError(handleApiError(err))
    }
  }

  const counts = useMemo(() => {
    const items = data?.items ?? []
    return {
      all: items.length,
      bullish: items.filter((i) => i.engines?.consensus === 'bullish').length,
      bearish: items.filter((i) => i.engines?.consensus === 'bearish').length,
      warnings: items.filter((i) => i.engines?.regime_warning).length,
    }
  }, [data])

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-5">
        {/* Header */}
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              Watchlist
            </h1>
            <p className="text-[12px] text-d-text-muted mt-0.5">
              Every symbol joined with engine consensus, regime warnings, and upcoming events.
            </p>
          </div>
          <button
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-d-border text-[12px] text-white hover:bg-white/[0.03] disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </header>

        {/* Add row */}
        <section className="rounded-xl border border-d-border bg-[#111520] p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              onAdd()
            }}
            className="flex items-center gap-2"
          >
            <Search className="w-4 h-4 text-d-text-muted shrink-0" />
            <input
              type="text"
              value={addSymbol}
              onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
              placeholder="Add symbol — e.g. TCS, RELIANCE, HDFCBANK"
              className="flex-1 bg-[#0A0D14] border border-d-border rounded-md px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-primary/50"
            />
            <button
              type="submit"
              disabled={adding || !addSymbol.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-primary text-black rounded-md text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-40"
            >
              {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Add
            </button>
          </form>
          {data && (
            <p className="text-[10px] text-d-text-muted mt-2 numeric">
              {data.count} symbol{data.count === 1 ? '' : 's'}
              {data.cap !== null ? ` · cap ${data.cap} (${data.tier})` : ` · unlimited (${data.tier})`}
            </p>
          )}
        </section>

        {/* Cap truncation banner */}
        {data?.capped && data.cap !== null && (
          <section className="rounded-lg border border-[#FFD166]/40 bg-[#FFD166]/10 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-[12px] text-[#FFD166]">
              Free tier shows the first {data.cap} of your {data.count} symbols. Upgrade to Pro to
              track everything and unlock regime alerts for each.
            </p>
            <Link
              href="/pricing"
              className="text-[11px] font-semibold text-[#FFD166] hover:underline whitespace-nowrap"
            >
              Upgrade →
            </Link>
          </section>
        )}

        {error && (
          <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-[12px] text-down">
            {error}
          </div>
        )}

        {/* Filter chips */}
        {data && data.items.length > 0 && (
          <section className="flex flex-wrap items-center gap-2">
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              All · {counts.all}
            </FilterChip>
            <FilterChip active={filter === 'bullish'} onClick={() => setFilter('bullish')} color="#05B878">
              Bullish · {counts.bullish}
            </FilterChip>
            <FilterChip active={filter === 'bearish'} onClick={() => setFilter('bearish')} color="#FF5947">
              Bearish · {counts.bearish}
            </FilterChip>
            <FilterChip active={filter === 'warnings'} onClick={() => setFilter('warnings')} color="#FEB113">
              Warnings · {counts.warnings}
            </FilterChip>
          </section>
        )}

        {/* List */}
        {loading ? (
          <div className="rounded-xl border border-d-border bg-[#111520] p-8 text-center">
            <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" />
            <p className="text-[12px] text-d-text-muted mt-2">Loading your watchlist…</p>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState empty={data?.items.length === 0} filter={filter} />
        ) : (
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((i) => (
              <WatchCard
                key={i.symbol}
                i={i}
                onRemove={() => onRemove(i.symbol)}
                onAlertSaved={() => refresh(false)}
              />
            ))}
          </section>
        )}

        <p className="text-[10px] text-d-text-muted text-center">
          Quotes auto-refresh every 60 seconds. Engine snapshots refresh nightly.
        </p>
      </div>
    </AppLayout>
  )
}


/* ───────────────────────── components ───────────────────────── */


function WatchCard({
  i,
  onRemove,
  onAlertSaved,
}: {
  i: Item
  onRemove: () => void
  onAlertSaved: () => void
}) {
  const consensus = i.engines?.consensus || 'neutral'
  const consensusColor = CONSENSUS_COLOR[consensus]
  const regime = i.engines?.regime
  const warning = i.engines?.regime_warning || false
  const sentiment = i.engines?.sentiment_score ?? null
  const sig = i.latest_signal
  const earnings = i.upcoming_earnings
  const [editingAlerts, setEditingAlerts] = useState(false)

  const change = i.change_pct
  const changeColor = change == null ? '#8e8e8e' : change >= 0 ? '#05B878' : '#FF5947'

  return (
    <article
      className="rounded-xl border bg-[#111520] overflow-hidden hover:border-d-border-hover transition-colors"
      style={{ borderLeft: `3px solid ${consensusColor}`, borderColor: '#242838' }}
    >
      {/* Header */}
      <header className="px-4 py-3 border-b border-d-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/stock/${i.symbol}`}
            className="text-[15px] font-semibold text-white hover:text-primary"
          >
            {i.symbol}
          </Link>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="numeric text-[14px] font-semibold text-white">
              {i.last_price != null ? `₹${i.last_price.toFixed(2)}` : '—'}
            </span>
            <span className="numeric text-[11px] font-medium" style={{ color: changeColor }}>
              {change == null ? '' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className="inline-flex items-center gap-1 text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 border"
            style={{
              color: consensusColor,
              borderColor: `${consensusColor}55`,
              background: `${consensusColor}14`,
            }}
          >
            {consensus === 'bullish' && <ArrowUpRight className="w-2.5 h-2.5" />}
            {consensus === 'bearish' && <ArrowDownRight className="w-2.5 h-2.5" />}
            {(consensus === 'neutral' || consensus === 'mixed') && <Minus className="w-2.5 h-2.5" />}
            {consensus}
          </span>
          <button
            onClick={onRemove}
            className="p-1 rounded border border-d-border text-d-text-muted hover:text-down hover:border-down/40"
            aria-label={`Remove ${i.symbol}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </header>

      {/* Regime warning */}
      {warning && (
        <div className="px-4 py-2 border-b border-d-border bg-[#FEB113]/5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-[#FEB113] mt-0.5 shrink-0" />
          <p className="text-[10px] text-[#FEB113]/95 leading-snug">
            Open {sig?.direction} signal conflicts with current{' '}
            <span className="numeric">{regime}</span> regime — consider reducing size.
          </p>
        </div>
      )}

      {/* Engines row */}
      <div className="px-4 py-2.5 border-b border-d-border flex flex-wrap items-center gap-1.5">
        {regime && (
          <span className="inline-flex items-center gap-1">
            <ModelBadge modelKey="regime_detector" size="xs" variant="outline" value={regime} />
          </span>
        )}
        {sentiment != null && (
          <span className="inline-flex items-center gap-1">
            <ModelBadge
              modelKey="sentiment_engine"
              size="xs"
              variant="outline"
              value={`${sentiment >= 0 ? '+' : ''}${sentiment.toFixed(2)}`}
            />
          </span>
        )}
        {i.engines?.swing_direction && i.engines.swing_direction !== 'neutral' && (
          <span className="inline-flex items-center gap-1">
            <ModelBadge
              modelKey="swing_forecast"
              size="xs"
              variant="outline"
              value={i.engines.swing_direction}
            />
          </span>
        )}
      </div>

      {/* Latest signal row */}
      {sig && (
        <div className="px-4 py-2 border-b border-d-border flex items-center gap-2 text-[11px]">
          <Zap className="w-3 h-3 text-primary shrink-0" />
          <span className="text-d-text-muted shrink-0">Latest signal</span>
          <span className="text-white font-semibold shrink-0">{sig.direction}</span>
          {sig.entry_price != null && (
            <span className="numeric text-d-text-muted">@ ₹{Number(sig.entry_price).toFixed(2)}</span>
          )}
          <span className="numeric text-d-text-muted ml-auto shrink-0">
            conf {Math.round(sig.confidence)}%
          </span>
          <Link
            href={`/signals/${sig.id}`}
            className="text-primary hover:underline shrink-0"
          >
            View →
          </Link>
        </div>
      )}

      {/* Earnings row */}
      {earnings && (
        <div className="px-4 py-2 border-b border-d-border flex items-center gap-2 text-[11px]">
          <CalendarDays className="w-3 h-3 text-[#FEB113] shrink-0" />
          <ModelBadge modelKey="earnings_predictor" size="xs" variant="outline" />
          <span className="text-d-text-muted">Announce</span>
          <span className="numeric text-white font-semibold">
            {new Date(earnings.announce_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          </span>
          <span className="text-d-text-muted ml-auto numeric">
            beat {Math.round(earnings.beat_prob * 100)}%
          </span>
        </div>
      )}

      {/* Footer */}
      <footer className="px-4 py-2 flex items-center justify-between gap-2 text-[11px]">
        <Link href={`/stock/${i.symbol}`} className="inline-flex items-center gap-1 text-primary hover:underline">
          Open dossier →
        </Link>
        {/* PR 114 — alert chip is now a button that opens the edit
            modal. The badge state still reflects whether thresholds
            are armed, but a click lets the user actually change them. */}
        <button
          type="button"
          onClick={() => setEditingAlerts(true)}
          className="inline-flex items-center gap-1 text-d-text-muted hover:text-white transition-colors"
        >
          {i.alert_enabled
            ? (<><Bell className="w-3 h-3 text-primary" /> alerts on</>)
            : (<><BellOff className="w-3 h-3" /> alerts off</>)}
          <Pencil className="w-2.5 h-2.5 opacity-60" />
        </button>
      </footer>

      {editingAlerts && (
        <AlertEditModal
          item={i}
          onClose={() => setEditingAlerts(false)}
          onSaved={() => { setEditingAlerts(false); onAlertSaved() }}
        />
      )}
    </article>
  )
}


/* ───────────────────────── PR 114 — alert edit modal ───────────────────────── */
//
// Two-field modal that posts to PR 112's /api/watchlist/{symbol}/alerts.
// Backend re-arms the PR 109 debounce on threshold change, so saving
// here resets the "next crossing fires fresh" state automatically.

function AlertEditModal({
  item,
  onClose,
  onSaved,
}: {
  item: Item
  onClose: () => void
  onSaved: () => void
}) {
  // PR 118 — mode toggle: absolute ₹ vs relative ±% from current price.
  // Most retail watchlist users think in "alert me if it moves 5%", not
  // "alert me at ₹2,847.20". Relative mode computes the absolute level
  // on save (since the backend stores absolute prices). Disabled when
  // we don't have a live price to anchor the percentage to.
  const live = item.last_price
  const [mode, setMode] = useState<'abs' | 'pct'>('abs')
  const [above, setAbove] = useState<string>(
    item.alert_price_above != null ? String(item.alert_price_above) : '',
  )
  const [below, setBelow] = useState<string>(
    item.alert_price_below != null ? String(item.alert_price_below) : '',
  )
  const [enabled, setEnabled] = useState(Boolean(item.alert_enabled))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // PR 120 — ATR(14) for the ATR-based preset. Fetched lazily on modal
  // open from the public technicals endpoint. Failure is silent — the
  // preset just stays disabled if ATR isn't available.
  const [atr, setAtr] = useState<number | null>(null)
  useEffect(() => {
    let active = true
    api.screener.getTechnicals(item.symbol)
      .then((r: any) => {
        if (!active) return
        if (r && r.success && typeof r.atr === 'number' && r.atr > 0) setAtr(r.atr)
      })
      .catch(() => {})
    return () => { active = false }
  }, [item.symbol])

  // PR 121 — session-scoped preset memory. Last preset used in this tab
  // is highlighted on next modal open (across symbols). For ATR presets
  // we apply once `atr` actually loads, otherwise we fall back to the
  // closest % preset so users aren't left with empty fields.
  type PresetId = 'pct5' | 'pct10' | 'pct5_breakout' | 'pct5_drop' | 'atr1' | 'atr2'
  const [activePreset, setActivePreset] = useState<PresetId | null>(null)
  // PR 122 — per-symbol pin. When checked, saves the preset under a
  // symbol-scoped key so the next open of this symbol reads it back
  // even if global memory has changed (e.g. user picked ATR for ETFs
  // but ±5% globally for individual stocks).
  const [pinPerSymbol, setPinPerSymbol] = useState(false)
  useEffect(() => {
    let cancelled = false
    import('@/lib/watchlistPresetMemory').then(({ hasSymbolPreset }) => {
      if (cancelled) return
      setPinPerSymbol(hasSymbolPreset(item.symbol))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [item.symbol])
  // Apply preset only on initial load (when fields are blank), not on
  // every render — otherwise we'd overwrite user-typed values.
  const initialAppliedRef = useRef(false)
  useEffect(() => {
    if (initialAppliedRef.current) return
    if (item.alert_price_above != null || item.alert_price_below != null) {
      // User already has thresholds saved — don't override.
      initialAppliedRef.current = true
      return
    }
    let cancelled = false
    // PR 122 — pass the symbol so the helper picks per-symbol over global.
    import('@/lib/watchlistPresetMemory').then(({ loadAlertPreset }) => {
      if (cancelled) return
      const id = loadAlertPreset(item.symbol)
      if (!id) { initialAppliedRef.current = true; return }
      // ATR presets need atr to be loaded; defer until it arrives.
      if ((id === 'atr1' || id === 'atr2') && atr == null) return
      applyPreset(id, /* persist */ false)
      initialAppliedRef.current = true
    }).catch(() => { initialAppliedRef.current = true })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atr])

  const rawAbove = above.trim() === '' ? null : Number(above)
  const rawBelow = below.trim() === '' ? null : Number(below)
  // In percent mode, the inputs are interpreted as ±% from `live`.
  // Backend always receives absolute prices.
  const aboveNum =
    mode === 'pct' && live != null && rawAbove != null && Number.isFinite(rawAbove)
      ? live * (1 + rawAbove / 100)
      : rawAbove
  const belowNum =
    mode === 'pct' && live != null && rawBelow != null && Number.isFinite(rawBelow)
      ? live * (1 - rawBelow / 100)
      : rawBelow
  const aboveValid = aboveNum === null || (Number.isFinite(aboveNum) && aboveNum > 0)
  const belowValid = belowNum === null || (Number.isFinite(belowNum) && belowNum > 0)
  // Percent inputs must be positive in either field — "below = -5%" doesn't
  // make sense (the field is already a downward delta).
  const pctValid =
    mode !== 'pct' ||
    ((rawAbove === null || (Number.isFinite(rawAbove) && rawAbove > 0)) &&
      (rawBelow === null || (Number.isFinite(rawBelow) && rawBelow > 0)))
  const orderingValid =
    aboveNum === null || belowNum === null || aboveNum > belowNum
  const canSave = aboveValid && belowValid && orderingValid && pctValid && !saving

  // PR 117 — distance preview, recomputed from the resolved absolute
  // numbers so the same logic works in both modes.
  const aboveDist =
    live != null && aboveNum != null && Number.isFinite(aboveNum) && aboveNum > 0
      ? ((aboveNum - live) / live) * 100
      : null
  const belowDist =
    live != null && belowNum != null && Number.isFinite(belowNum) && belowNum > 0
      ? ((live - belowNum) / live) * 100
      : null

  // PR 121 — single applyPreset to keep state in sync (mode, fields,
  // enabled, activePreset, and optional persistence). Called from the
  // preset buttons and from the auto-apply effect above.
  function applyPreset(id: PresetId, persist: boolean) {
    setActivePreset(id)
    setEnabled(true)
    if (id === 'pct5')           { setMode('pct'); setAbove('5');  setBelow('5')  }
    else if (id === 'pct10')     { setMode('pct'); setAbove('10'); setBelow('10') }
    else if (id === 'pct5_breakout') { setMode('pct'); setAbove('5'); setBelow('') }
    else if (id === 'pct5_drop')     { setMode('pct'); setAbove('');  setBelow('5') }
    else if ((id === 'atr1' || id === 'atr2') && atr != null && live != null) {
      const m = id === 'atr1' ? 1 : 2
      setMode('abs')
      setAbove((live + m * atr).toFixed(2))
      setBelow((live - m * atr).toFixed(2))
    }
    if (persist) {
      import('@/lib/watchlistPresetMemory').then((m) => {
        // Always update global so the next new-symbol add inherits it.
        m.saveAlertPreset(id)
        // Plus per-symbol if the user has pinned this symbol.
        if (pinPerSymbol) {
          m.saveAlertPreset(id, { symbol: item.symbol, perSymbol: true })
          // PR 123 — keep server in sync so the new preset choice
          // overrides what's stored cross-device.
          m.syncSymbolPinToServer(item.symbol, id)
        }
      }).catch(() => {})
    }
  }

  const onSave = async () => {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await api.watchlist.updateAlerts(item.symbol, {
        alert_price_above: aboveNum,
        alert_price_below: belowNum,
        // If the user blanked both thresholds, force-disable; otherwise
        // honor the toggle.
        alert_enabled:
          aboveNum === null && belowNum === null ? false : enabled,
      })
      onSaved()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const onClear = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.watchlist.updateAlerts(item.symbol, {
        alert_price_above: null,
        alert_price_below: null,
        alert_enabled: false,
      })
      onSaved()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-d-border bg-[#0E1220] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-d-text-muted">Alert thresholds</p>
            <h3 className="text-[15px] font-semibold text-white mt-0.5">
              {item.symbol}
              {item.last_price != null && (
                <span className="text-d-text-muted text-[12px] font-normal ml-2 numeric">
                  ₹{item.last_price.toFixed(2)}
                </span>
              )}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-white/10"
            aria-label="Close"
          >
            <XIcon className="w-4 h-4 text-d-text-muted" />
          </button>
        </header>

        <div className="space-y-3">
          {/* PR 118 — absolute ₹ vs relative ±% mode toggle. Disabled
              entirely when we don't have a live price to anchor against. */}
          <div className="flex items-center gap-1 rounded-md border border-d-border p-0.5 w-fit text-[10px]">
            <button
              type="button"
              onClick={() => { setMode('abs'); setAbove(''); setBelow(''); setActivePreset(null) }}
              className={`px-2.5 py-1 rounded ${mode === 'abs' ? 'bg-primary/15 text-primary' : 'text-d-text-muted hover:text-white'}`}
            >
              ₹ absolute
            </button>
            <button
              type="button"
              onClick={() => { setMode('pct'); setAbove(''); setBelow(''); setActivePreset(null) }}
              disabled={live == null}
              className={`px-2.5 py-1 rounded ${mode === 'pct' ? 'bg-primary/15 text-primary' : 'text-d-text-muted hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'}`}
            >
              ±% from current
            </button>
          </div>

          {/* PR 119 — quick-pick templates. Single click pre-fills both
              fields. Switches into % mode automatically since all four
              templates are relative — typing absolute ₹ levels for each
              symbol manually was the slowest part of the flow.
              PR 120 — ATR-based preset uses the symbol's actual 14-day
              ATR (volatility-aware) instead of a fixed % so a slow
              large-cap and a fast mid-cap don't share the same trigger
              distance. Falls back to disabled when ATR unavailable. */}
          {live != null && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-1">Quick presets</p>
              <div className="flex flex-wrap gap-1.5">
                {([
                  { id: 'pct5' as const,           label: '±5%' },
                  { id: 'pct10' as const,          label: '±10%' },
                  { id: 'pct5_breakout' as const,  label: '+5% breakout' },
                  { id: 'pct5_drop' as const,      label: '−5% drop' },
                ]).map((t) => {
                  const isActive = activePreset === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyPreset(t.id, true)}
                      className={`px-2.5 py-1 rounded-md text-[10px] border transition-colors ${
                        isActive
                          ? 'border-[#FFD166]/60 bg-[#FFD166]/[0.10] text-[#FFD166]'
                          : 'border-d-border text-d-text-secondary hover:bg-white/[0.04] hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  )
                })}
                {atr != null && atr > 0 && live != null && (
                  <>
                    {([
                      { id: 'atr1' as const, label: '±1× ATR', mult: 1 },
                      { id: 'atr2' as const, label: '±2× ATR', mult: 2 },
                    ]).map((t) => {
                      const isActive = activePreset === t.id
                      return (
                        <button
                          key={t.id}
                          type="button"
                          title={`ATR(14) = ₹${atr.toFixed(2)} · ±${t.mult}× ATR`}
                          onClick={() => applyPreset(t.id, true)}
                          className={`px-2.5 py-1 rounded-md text-[10px] border transition-colors ${
                            isActive
                              ? 'border-[#FFD166]/60 bg-[#FFD166]/[0.10] text-[#FFD166]'
                              : 'border-primary/40 bg-primary/[0.05] text-primary hover:bg-primary/[0.10]'
                          }`}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </>
                )}
              </div>
              {atr != null && atr > 0 && (
                <p className="text-[10px] text-d-text-muted mt-1 numeric">
                  ATR(14) = ₹{atr.toFixed(2)} ({((atr / live!) * 100).toFixed(2)}% of price)
                </p>
              )}
              {/* PR 122 — per-symbol pin. Off by default — global memory
                  is the right behavior for most users. Power-user opt-in. */}
              <label className="mt-2 flex items-center gap-1.5 text-[10px] text-d-text-muted cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={pinPerSymbol}
                  onChange={(e) => {
                    const next = e.target.checked
                    setPinPerSymbol(next)
                    import('@/lib/watchlistPresetMemory').then((m) => {
                      if (next && activePreset) {
                        m.saveAlertPreset(activePreset, { symbol: item.symbol, perSymbol: true })
                        // PR 123 — mirror to backend.
                        m.syncSymbolPinToServer(item.symbol, activePreset)
                      } else if (!next) {
                        m.clearSymbolPreset(item.symbol)
                        m.syncSymbolPinToServer(item.symbol, null)
                      }
                    }).catch(() => {})
                  }}
                  className="accent-primary"
                />
                Pin this preset to {item.symbol} (syncs across devices)
              </label>
            </div>
          )}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-d-text-muted mb-1">
              {mode === 'pct' ? 'Notify on % gain above current' : 'Notify when price goes above'}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-d-text-muted">{mode === 'pct' ? '+' : '₹'}</span>
              <input
                type="number"
                inputMode="decimal"
                step={mode === 'pct' ? '0.1' : '0.01'}
                value={above}
                onChange={(e) => { setAbove(e.target.value); setActivePreset(null) }}
                placeholder={mode === 'pct' ? 'e.g. 5 = +5% above' : 'leave blank to disable'}
                className="numeric flex-1 bg-[#0A0D14] border border-d-border rounded-md px-3 py-1.5 text-[13px] text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/50"
              />
              {mode === 'pct' && <span className="text-[12px] text-d-text-muted">%</span>}
            </div>
            {mode === 'pct' && aboveNum !== null && aboveValid && live != null && (
              <p className="text-[10px] mt-1 text-d-text-muted numeric">
                = ₹{aboveNum.toFixed(2)}
              </p>
            )}
            {mode === 'abs' && aboveDist !== null && aboveValid && (
              <p className="text-[10px] mt-1 numeric"
                 style={{ color: aboveDist <= 0 ? '#FEB113' : aboveDist < 1 ? '#FEB113' : '#8e8e8e' }}>
                {aboveDist <= 0
                  ? `Already ${Math.abs(aboveDist).toFixed(2)}% past threshold — fires on next tick`
                  : `${aboveDist.toFixed(2)}% above current ₹${live!.toFixed(2)}`}
              </p>
            )}
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-d-text-muted mb-1">
              {mode === 'pct' ? 'Notify on % drop below current' : 'Notify when price drops below'}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-d-text-muted">{mode === 'pct' ? '−' : '₹'}</span>
              <input
                type="number"
                inputMode="decimal"
                step={mode === 'pct' ? '0.1' : '0.01'}
                value={below}
                onChange={(e) => { setBelow(e.target.value); setActivePreset(null) }}
                placeholder={mode === 'pct' ? 'e.g. 5 = −5% below' : 'leave blank to disable'}
                className="numeric flex-1 bg-[#0A0D14] border border-d-border rounded-md px-3 py-1.5 text-[13px] text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/50"
              />
              {mode === 'pct' && <span className="text-[12px] text-d-text-muted">%</span>}
            </div>
            {mode === 'pct' && belowNum !== null && belowValid && live != null && (
              <p className="text-[10px] mt-1 text-d-text-muted numeric">
                = ₹{belowNum.toFixed(2)}
              </p>
            )}
            {mode === 'abs' && belowDist !== null && belowValid && (
              <p className="text-[10px] mt-1 numeric"
                 style={{ color: belowDist <= 0 ? '#FEB113' : belowDist < 1 ? '#FEB113' : '#8e8e8e' }}>
                {belowDist <= 0
                  ? `Already ${Math.abs(belowDist).toFixed(2)}% past threshold — fires on next tick`
                  : `${belowDist.toFixed(2)}% below current ₹${live!.toFixed(2)}`}
              </p>
            )}
          </div>
          {!pctValid && (
            <p className="text-[11px] text-down">
              Percent values must be positive. Use the toggle above to switch modes.
            </p>
          )}
          {!orderingValid && (
            <p className="text-[11px] text-down">
              Above must be greater than below.
            </p>
          )}
          <label className="flex items-center gap-2 text-[12px] text-d-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="accent-primary"
            />
            Alerts enabled
          </label>
        </div>

        {error && (
          <div className="rounded border border-down/30 bg-down/[0.08] p-2 text-[11px] text-down">
            {error}
          </div>
        )}

        <p className="text-[10px] text-d-text-muted">
          Saving with a new threshold re-arms the alert — the next crossing fires fresh,
          even if you previously hit this level.
        </p>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={saving}
            className="flex-1 py-2 text-[12px] text-d-text-muted border border-d-border rounded-md hover:bg-white/[0.03] disabled:opacity-50"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}


function EmptyState({ empty, filter }: { empty: boolean; filter: string }) {
  return (
    <div className="rounded-xl border border-d-border bg-[#111520] p-8 text-center space-y-2">
      <Eye className="w-5 h-5 text-d-text-muted mx-auto" />
      {empty ? (
        <>
          <p className="text-[13px] text-white">Your watchlist is empty.</p>
          <p className="text-[11px] text-d-text-muted">
            Add a symbol above to start tracking engine consensus and regime alerts.
          </p>
        </>
      ) : (
        <p className="text-[13px] text-d-text-muted">
          No symbols match the <span className="text-white">{filter}</span> filter.
        </p>
      )}
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
        style={{ color, borderColor: `${color}66`, background: `${color}14` }}
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
