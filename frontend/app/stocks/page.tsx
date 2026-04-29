'use client'

/**
 * /stocks — AI-first stock discovery surface (PR 58 rewrite).
 *
 * This page is a browsing surface, not an AI output. Every AI engine
 * (SwingLens, AlphaRank, HorizonCast, ToneScan, RegimeIQ, PatternScope…)
 * lives on the per-stock dossier at /stock/[symbol]. Here we:
 *
 *   * Show the current market regime (RegimeIQ) at the top so the user
 *     reads the table with the right mental frame.
 *   * List every popular NSE symbol with real market data — price,
 *     change %, sector, 52-week anchors.
 *   * Tag stocks with an "Active signal" chip when today's signal set
 *     includes them (real data — surfaces our output, doesn't fabricate).
 *   * Link each row to the full /stock/[symbol] dossier.
 *
 * What we deliberately don't do:
 *   * No synthetic "AI score" badges (the prior page hashed the symbol
 *     name into a 60-94 number and labelled it AI — misleading, retired
 *     under the no-fallbacks rule).
 *   * No fake sparklines. Charts live on the dossier where we have real
 *     OHLCV data.
 *   * No inline model outputs. Dossier is the destination.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react'

import { api } from '@/lib/api'
import AppLayout from '@/components/shared/AppLayout'
import ModelBadge from '@/components/ModelBadge'
import ErrorBoundary from '@/components/ErrorBoundary'
import IndexTickerStrip from '@/components/dashboard/IndexTickerStrip'

// ----------------------------------------------------------------- types

interface StockRow {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  high52w: number | null
  low52w: number | null
  sector: string | null
}

type RegimeCode = 'bull' | 'sideways' | 'bear'

interface CurrentRegime {
  regime: RegimeCode
  prob_bull: number
  prob_sideways: number
  prob_bear: number
  vix: number | null
}

type SortKey = 'changePercent' | 'volume' | 'price' | 'symbol'
type SortDir = 'desc' | 'asc'

const SECTORS = ['All', 'IT', 'Banking', 'Pharma', 'Auto', 'FMCG', 'Metal', 'Energy'] as const

const SORT_OPTIONS: { label: string; key: SortKey; dir: SortDir }[] = [
  { label: 'Change %',   key: 'changePercent', dir: 'desc' },
  { label: 'Volume',     key: 'volume',        dir: 'desc' },
  { label: 'Price',      key: 'price',         dir: 'desc' },
  { label: 'Alphabetical', key: 'symbol',      dir: 'asc' },
]

// Symbol → sector map. The backend doesn't yet return sector on the
// live-prices endpoint; we fold it in client-side so at least the
// popular universe lights up.
const SECTOR_MAP: Record<string, string> = {
  TCS: 'IT', INFY: 'IT', WIPRO: 'IT', HCLTECH: 'IT', TECHM: 'IT', LTIM: 'IT', LTTS: 'IT',
  COFORGE: 'IT', MPHASIS: 'IT', PERSISTENT: 'IT',
  HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', KOTAKBANK: 'Banking',
  AXISBANK: 'Banking', INDUSINDBK: 'Banking', PNB: 'Banking', BANKBARODA: 'Banking',
  AUBANK: 'Banking', BANDHANBNK: 'Banking', IDFCFIRSTB: 'Banking',
  SUNPHARMA: 'Pharma', DRREDDY: 'Pharma', CIPLA: 'Pharma', DIVISLAB: 'Pharma',
  LUPIN: 'Pharma', AUROPHARMA: 'Pharma', BIOCON: 'Pharma',
  MARUTI: 'Auto', TATAMOTORS: 'Auto', 'BAJAJ-AUTO': 'Auto', EICHERMOT: 'Auto',
  HEROMOTOCO: 'Auto', 'M&M': 'Auto', MOTHERSON: 'Auto',
  HINDUNILVR: 'FMCG', ITC: 'FMCG', NESTLEIND: 'FMCG', BRITANNIA: 'FMCG',
  DABUR: 'FMCG', MARICO: 'FMCG', GODREJCP: 'FMCG', TATACONSUM: 'FMCG',
  TATASTEEL: 'Metal', JSWSTEEL: 'Metal', HINDALCO: 'Metal', VEDL: 'Metal', SAIL: 'Metal',
  RELIANCE: 'Energy', ONGC: 'Energy', BPCL: 'Energy', GAIL: 'Energy', NTPC: 'Energy',
  POWERGRID: 'Energy', COALINDIA: 'Energy', ADANIENT: 'Energy', TATAPOWER: 'Energy',
}

const POPULAR = [
  'RELIANCE','TCS','HDFCBANK','INFY','ICICIBANK','HINDUNILVR','BHARTIARTL','ITC','SBIN',
  'KOTAKBANK','LT','AXISBANK','BAJFINANCE','MARUTI','TITAN','SUNPHARMA','WIPRO','HCLTECH',
  'ADANIENT','TATAMOTORS','NTPC','POWERGRID','COALINDIA','ONGC','ULTRACEMCO','TATASTEEL',
  'TECHM','NESTLEIND','DRREDDY','CIPLA','BAJAJFINSV','EICHERMOT','HEROMOTOCO','DIVISLAB',
  'GRASIM','APOLLOHOSP','BRITANNIA','INDUSINDBK','TATACONSUM','BPCL','JSWSTEEL','M&M',
  'ASIANPAINT','HDFCLIFE','HINDALCO','SBILIFE','BAJAJ-AUTO','VEDL','DLF',
]

const PAGE_SIZE = 20

// ----------------------------------------------------------------- page

export default function StocksPage() {
  const [rows, setRows] = useState<StockRow[]>([])
  const [regime, setRegime] = useState<CurrentRegime | null>(null)
  const [signalSymbols, setSignalSymbols] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [sector, setSector] = useState<string>('All')
  const [sortOpt, setSortOpt] = useState(SORT_OPTIONS[0])
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)

      const [pricesRes, regimeRes, signalsRes] = await Promise.all([
        fetchLivePrices(),
        api.publicTrust.regimeHistory(1).catch(() => null),
        api.signals.getToday().catch(() => null),
      ])

      if (cancelled) return

      setRows(pricesRes)

      if (regimeRes?.current) {
        setRegime({
          regime: regimeRes.current.regime,
          prob_bull: regimeRes.current.prob_bull,
          prob_sideways: regimeRes.current.prob_sideways,
          prob_bear: regimeRes.current.prob_bear,
          vix: regimeRes.current.vix,
        })
      }

      const sigSymbols = new Set<string>()
      const sigList = (signalsRes as any)?.signals || []
      for (const s of sigList) {
        if (s?.symbol) sigSymbols.add(String(s.symbol).replace('.NS', '').toUpperCase())
      }
      setSignalSymbols(sigSymbols)

      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [])

  // ── Derived: gainers / losers strip
  const [topGainers, topLosers] = useMemo(() => {
    if (!rows.length) return [[], []]
    const sorted = [...rows].sort((a, b) => b.changePercent - a.changePercent)
    return [sorted.slice(0, 5), sorted.slice(-5).reverse()]
  }, [rows])

  // ── Derived: filtered + sorted
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = rows.filter((r) => {
      const matchesSearch = !q
        || r.symbol.toLowerCase().includes(q)
        || r.name.toLowerCase().includes(q)
      const matchesSector = sector === 'All' || r.sector === sector
      return matchesSearch && matchesSector
    })
    const sorted = [...filtered].sort((a, b) => {
      const k = sortOpt.key
      const av: any = (a as any)[k]
      const bv: any = (b as any)[k]
      if (typeof av === 'string') {
        return sortOpt.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortOpt.dir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0)
    })
    return sorted
  }, [rows, search, sector, sortOpt])

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const pageClamped = Math.min(page, totalPages)
  const pageRows = visible.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE)

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-semibold">Stocks</h1>
            <p className="text-[12px] text-d-text-muted mt-1">
              Browse the NSE universe. Tap any stock for the full AI dossier — engine
              outputs, technicals, chart.
            </p>
          </div>
          <Link
            href="/signals"
            className="inline-flex items-center gap-1.5 text-[12px] text-primary hover:underline"
          >
            <Sparkles className="w-3.5 h-3.5" />
            See today's signals
          </Link>
        </div>

        {/* PR 66 — live index ticker strip */}
        <ErrorBoundary label="Indices">
          <IndexTickerStrip />
        </ErrorBoundary>

        {/* RegimeIQ banner */}
        <ErrorBoundary label="Regime">
          <RegimeBanner regime={regime} loading={loading} />
        </ErrorBoundary>

        {/* Gainers / losers strip */}
        <ErrorBoundary label="Movers">
          <div className="grid md:grid-cols-2 gap-4">
            <MoversCard title="Top gainers" items={topGainers} loading={loading} accent="#05B878" />
            <MoversCard title="Top losers" items={topLosers} loading={loading} accent="#FF5947" />
          </div>
        </ErrorBoundary>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-[360px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-d-text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search symbol or company"
              className="w-full pl-9 pr-3 py-2 rounded-md bg-[#111520] border border-d-border text-[12px] placeholder:text-d-text-muted focus:outline-none focus:border-primary/60"
            />
          </div>

          <SortMenu value={sortOpt} onChange={(v) => { setSortOpt(v); setPage(1) }} />

          <div className="flex flex-wrap gap-1.5">
            {SECTORS.map((s) => (
              <button
                key={s}
                onClick={() => { setSector(s); setPage(1) }}
                className={`px-3 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${
                  sector === s
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-d-border text-d-text-muted hover:text-white hover:border-d-border-hover'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <ErrorBoundary label="Stock list">
          <StockList
            rows={pageRows}
            signalSymbols={signalSymbols}
            loading={loading}
          />
        </ErrorBoundary>

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination
            page={pageClamped}
            totalPages={totalPages}
            onChange={setPage}
            total={visible.length}
          />
        )}
      </div>
    </AppLayout>
  )
}

// --------------------------------------------------------- subcomponents

function RegimeBanner({ regime, loading }: { regime: CurrentRegime | null; loading: boolean }) {
  if (loading && !regime) {
    return <div className="h-[64px] rounded-lg border border-d-border bg-[#111520] animate-pulse" />
  }
  if (!regime) return null

  const tone =
    regime.regime === 'bull' ? { fg: '#05B878', label: 'Bull', copy: 'Sizing up allowed. Momentum strategies favored.' } :
    regime.regime === 'bear' ? { fg: '#FF5947', label: 'Bear', copy: 'Halve position size. Cash + defensives preferred.' } :
                                { fg: '#FEB113', label: 'Sideways', copy: 'Mean-reversion works, breakouts don\'t. Tighten SLs.' }

  const probs = [
    { label: 'Bull',     pct: regime.prob_bull,     color: '#05B878' },
    { label: 'Sideways', pct: regime.prob_sideways, color: '#FEB113' },
    { label: 'Bear',     pct: regime.prob_bear,     color: '#FF5947' },
  ]

  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{ background: `${tone.fg}0D`, borderColor: `${tone.fg}33` }}
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <ModelBadge modelKey="regime_detector" size="xs" variant="soft" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-d-text-muted uppercase tracking-wider">Market regime</span>
              <span className="font-semibold text-[13px]" style={{ color: tone.fg }}>{tone.label}</span>
              {regime.vix != null && (
                <span className="text-[11px] text-d-text-muted">
                  · VIX <span className="numeric text-white">{regime.vix.toFixed(2)}</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-d-text-muted mt-0.5">{tone.copy}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-d-text-muted">
          {probs.map((p) => (
            <div key={p.label} className="flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
              {p.label} <span className="numeric text-white">{(p.pct * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MoversCard({
  title, items, loading, accent,
}: {
  title: string
  items: StockRow[]
  loading: boolean
  accent: string
}) {
  return (
    <div className="rounded-lg border border-d-border bg-[#111520]">
      <div className="px-4 py-2.5 border-b border-d-border">
        <p className="text-[10px] uppercase tracking-wider text-d-text-muted">{title}</p>
      </div>
      <div>
        {loading && !items.length ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-4 py-2.5 border-b border-d-border last:border-0 animate-pulse">
              <div className="h-3 w-24 bg-white/5 rounded" />
            </div>
          ))
        ) : items.length ? (
          items.map((r) => (
            <Link
              key={r.symbol}
              href={`/stock/${r.symbol.replace('.NS', '')}`}
              className="flex items-center justify-between px-4 py-2.5 border-b border-d-border last:border-0 hover:bg-white/[0.02] transition-colors"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-medium text-white truncate">{r.symbol.replace('.NS', '')}</div>
                <div className="text-[10px] text-d-text-muted truncate">{r.name || '—'}</div>
              </div>
              <div className="text-right ml-3 shrink-0">
                <div className="text-[12px] numeric text-white">₹{r.price.toFixed(2)}</div>
                <div className="text-[11px] numeric font-medium" style={{ color: accent }}>
                  {r.changePercent >= 0 ? '+' : ''}{r.changePercent.toFixed(2)}%
                </div>
              </div>
            </Link>
          ))
        ) : (
          <div className="px-4 py-6 text-center text-[11px] text-d-text-muted">No data</div>
        )}
      </div>
    </div>
  )
}

function SortMenu({
  value, onChange,
}: {
  value: typeof SORT_OPTIONS[number]
  onChange: (v: typeof SORT_OPTIONS[number]) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-d-border text-[11px] text-d-text-muted hover:text-white hover:border-d-border-hover"
      >
        <SlidersHorizontal className="w-3 h-3" />
        Sort: <span className="text-white">{value.label}</span>
      </button>
      {open && (
        <div className="absolute top-full mt-1 right-0 z-10 min-w-[160px] rounded-md border border-d-border bg-[#111520] shadow-lg py-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onMouseDown={(e) => { e.preventDefault(); onChange(opt); setOpen(false) }}
              className={`w-full text-left px-3 py-1.5 text-[11px] transition-colors ${
                opt.key === value.key && opt.dir === value.dir
                  ? 'bg-primary/10 text-primary'
                  : 'text-d-text-secondary hover:bg-white/[0.03] hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StockList({
  rows, signalSymbols, loading,
}: {
  rows: StockRow[]
  signalSymbols: Set<string>
  loading: boolean
}) {
  if (loading && !rows.length) {
    return (
      <div className="rounded-lg border border-d-border bg-[#111520] overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-d-border last:border-0 animate-pulse">
            <div className="h-4 w-20 bg-white/5 rounded" />
            <div className="h-3 w-40 bg-white/5 rounded flex-1" />
            <div className="h-4 w-16 bg-white/5 rounded" />
            <div className="h-4 w-14 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    )
  }
  if (!rows.length) {
    return (
      <div className="rounded-lg border border-d-border bg-[#111520] p-10 text-center text-[12px] text-d-text-muted">
        No stocks matching this filter.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-d-border bg-[#111520] overflow-hidden">
      <div className="hidden md:grid grid-cols-[1fr_100px_100px_100px_120px_32px] items-center gap-4 px-4 py-2.5 border-b border-d-border text-[10px] text-d-text-muted uppercase tracking-wider">
        <div>Symbol</div>
        <div className="text-right">Price</div>
        <div className="text-right">Change</div>
        <div className="text-right hidden lg:block">Volume</div>
        <div className="text-right">AI</div>
        <div />
      </div>
      {rows.map((r) => (
        <StockRowLink
          key={r.symbol}
          row={r}
          hasSignal={signalSymbols.has(r.symbol.replace('.NS', '').toUpperCase())}
        />
      ))}
    </div>
  )
}

function StockRowLink({ row, hasSignal }: { row: StockRow; hasSignal: boolean }) {
  const clean = row.symbol.replace('.NS', '')
  const up = row.changePercent >= 0
  return (
    <Link
      href={`/stock/${clean}`}
      className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_100px_100px_120px_32px] lg:grid-cols-[1fr_100px_100px_100px_120px_32px] items-center gap-4 px-4 py-3 border-b border-d-border last:border-0 hover:bg-white/[0.02] transition-colors"
    >
      {/* Symbol + name + sector */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-white">{clean}</span>
          {row.sector && (
            <span className="text-[9px] text-d-text-muted uppercase tracking-wider bg-white/[0.03] px-1.5 py-0.5 rounded">
              {row.sector}
            </span>
          )}
        </div>
        <div className="text-[11px] text-d-text-muted truncate mt-0.5">{row.name || '—'}</div>
      </div>

      {/* Price */}
      <div className="text-right numeric text-[13px] text-white hidden md:block">
        ₹{row.price.toFixed(2)}
      </div>

      {/* Change */}
      <div
        className="text-right numeric text-[12px] font-medium flex items-center justify-end gap-0.5"
        style={{ color: up ? '#05B878' : '#FF5947' }}
      >
        {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {up ? '+' : ''}{row.changePercent.toFixed(2)}%
      </div>

      {/* Volume (hidden on tablet, visible lg+) */}
      <div className="text-right numeric text-[11px] text-d-text-muted hidden lg:block">
        {formatVolume(row.volume)}
      </div>

      {/* Signal chip */}
      <div className="hidden md:flex justify-end">
        {hasSignal ? (
          <ModelBadge modelKey="swing_forecast" size="xs" variant="soft" />
        ) : (
          <span className="text-[10px] text-d-text-muted">—</span>
        )}
      </div>

      {/* Chevron */}
      <ChevronRight className="w-3.5 h-3.5 text-d-text-muted shrink-0" />
    </Link>
  )
}

function Pagination({
  page, totalPages, onChange, total,
}: {
  page: number; totalPages: number; onChange: (p: number) => void; total: number
}) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-[11px] text-d-text-muted">
        Page <span className="text-white numeric">{page}</span> of{' '}
        <span className="numeric">{totalPages}</span> · {total} stocks
      </p>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page === 1}
          className="px-3 py-1.5 rounded-md border border-d-border text-[11px] text-d-text-muted hover:text-white hover:border-d-border-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <button
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          className="px-3 py-1.5 rounded-md border border-d-border text-[11px] text-d-text-muted hover:text-white hover:border-d-border-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}

// --------------------------------------------------------------- helpers

async function fetchLivePrices(): Promise<StockRow[]> {
  try {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''
    const res = await fetch(
      `${API_BASE}/api/screener/prices/live?symbols=${POPULAR.join(',')}`
    )
    const json = await res.json()
    if (!json?.success || !Array.isArray(json.prices)) return []
    return json.prices.map((p: any): StockRow => {
      const clean = String(p.symbol || '').replace('.NS', '').toUpperCase()
      return {
        symbol: p.symbol || clean,
        name: p.name || p.company || clean,
        price: Number(p.price || p.last_price || 0),
        change: Number(p.change || 0),
        changePercent: Number(p.change_percent || 0),
        volume: Number(p.volume || 0),
        high52w: p.high_52w != null ? Number(p.high_52w) : null,
        low52w: p.low_52w != null ? Number(p.low_52w) : null,
        sector: p.sector || SECTOR_MAP[clean] || null,
      }
    })
  } catch {
    return []
  }
}

function formatVolume(v: number): string {
  if (!v || !isFinite(v)) return '—'
  if (v >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`
  if (v >= 1e5) return `${(v / 1e5).toFixed(1)}L`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return String(v)
}
