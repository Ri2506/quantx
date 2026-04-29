'use client'

/**
 * /scanner-lab — merged /screener + /pattern-detection (Step 4 §5.3).
 *
 * Two tabs:
 *   - Screeners      — 50+ technical filters from live_screener_engine
 *   - Pattern Scanner — 11 chart patterns + BreakoutMetaLabeler confidence
 *
 * Pro-tier feature. Free users see the intro + upgrade CTA.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Lock,
  Search,
  ScanLine,
  Activity,
} from 'lucide-react'

import AppLayout from '@/components/shared/AppLayout'
import PatternCard from '@/components/strategy/PatternCard'
import { api, handleApiError } from '@/lib/api'


// ---------------------------------------------------------------- constants

type Tab = 'screeners' | 'patterns'

const PATTERN_TABS: Array<{ label: string; value: string; scannerId: number }> = [
  { label: 'All patterns',   value: 'all_patterns',    scannerId: 51 },
  { label: 'Cup & Handle',   value: 'cup_handle',      scannerId: 23 },
  { label: 'Double Bottom',  value: 'double_bottom',   scannerId: 24 },
  { label: 'Triple Bottom',  value: 'triple_bottom',   scannerId: 47 },
  { label: 'Inv. H&S',       value: 'inv_hs',          scannerId: 25 },
  { label: 'Asc. Triangle',  value: 'asc_triangle',    scannerId: 43 },
  { label: 'Sym. Triangle',  value: 'sym_triangle',    scannerId: 44 },
  { label: 'Falling Wedge',  value: 'falling_wedge',   scannerId: 45 },
  { label: 'Bull Flag',      value: 'bull_flag',       scannerId: 46 },
  { label: 'Bull Pennant',   value: 'bull_pennant',    scannerId: 49 },
  { label: 'VCP',            value: 'vcp',             scannerId: 14 },
  { label: 'Trend template', value: 'trend_template',  scannerId: 31 },
]

const DEFAULT_SCREENER_SCANNER_ID = 1  // Breakout consolidation — a reasonable default


// -------------------------------------------------------------- shared types

interface ScanRow {
  symbol: string
  exchange?: string
  ltp?: number
  change_pct?: number
  volume?: number
  rsi?: number
  pattern?: string
  trend?: string
  target?: number
  stop_loss?: number
  confidence?: number
  ml_score?: number | null
}


// --------------------------------------------------------------- main page

export default function ScannerLabPage() {
  const searchParams = useSearchParams()
  const initialTab: Tab =
    searchParams?.get('tab') === 'patterns' ? 'patterns' : 'screeners'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [tier, setTier] = useState<'free' | 'pro' | 'elite' | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const t = await api.user.getTier()
        setTier(t.tier)
        setIsAdmin(t.is_admin)
      } catch {
        setTier('free')
      }
    })()
  }, [])

  const locked = tier !== null && !isAdmin && tier === 'free'

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-6 max-w-7xl mx-auto space-y-5">
        {/* Title */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[26px] font-semibold text-white">Scanner Lab</h1>
            <p className="text-[12px] text-d-text-muted mt-1">
              50+ technical screeners + 11 chart-pattern scanners. Not alpha — pure data
              discovery to complement AI signals.
            </p>
          </div>
          {tier && (
            <span
              className={`text-[11px] px-2 py-1 rounded-md border font-medium uppercase tracking-wider ${
                locked
                  ? 'border-d-border bg-d-bg-elevated text-d-text-muted'
                  : 'border-primary/30 bg-primary/10 text-primary'
              }`}
            >
              {isAdmin ? 'Admin' : tier}
            </span>
          )}
        </div>

        {/* Tier gate — Free sees intro + upgrade CTA instead of the lab */}
        {locked ? (
          <LockedCard />
        ) : (
          <>
            {/* Tabs */}
            <div className="inline-flex items-center bg-[#111520] border border-d-border rounded-md p-0.5">
              <TabButton active={tab === 'screeners'} onClick={() => setTab('screeners')} icon={ScanLine}>
                Screeners
              </TabButton>
              <TabButton active={tab === 'patterns'} onClick={() => setTab('patterns')} icon={Activity}>
                Pattern Scanner
              </TabButton>
            </div>

            {tab === 'screeners' ? <ScreenersTab /> : <PatternsTab />}
          </>
        )}

        <p className="text-[10px] text-d-text-muted pt-6 border-t border-d-border">
          Scanner output is not a trade recommendation. Pattern detection is rule-based and
          does not feed Swing AI's signal pipeline — it is a complementary tool.
        </p>
      </div>
    </AppLayout>
  )
}


// --------------------------------------------------------------- Screeners tab

function ScreenersTab() {
  const [categories, setCategories] = useState<Record<string, any> | null>(null)
  const [selectedCat, setSelectedCat] = useState<string | null>(null)
  const [selectedScanner, setSelectedScanner] = useState<number>(DEFAULT_SCREENER_SCANNER_ID)
  const [rows, setRows] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Load categories once.
  useEffect(() => {
    (async () => {
      try {
        const data = await api.screener.getCategories()
        setCategories(data.categories || {})
        const firstCat = Object.keys(data.categories || {})[0]
        if (firstCat) setSelectedCat(firstCat)
      } catch (err) {
        setError(handleApiError(err))
      }
    })()
  }, [])

  // Load results on scanner change.
  useEffect(() => {
    if (!selectedScanner) return
    (async () => {
      setLoading(true)
      setError(null)
      try {
        const data = await api.screener.runScan(selectedScanner, 'nifty500', 50)
        setRows((data.results || []) as ScanRow[])
      } catch (err) {
        setError(handleApiError(err))
        setRows([])
      } finally {
        setLoading(false)
      }
    })()
  }, [selectedScanner])

  const scanners = useMemo(() => {
    if (!categories || !selectedCat) return [] as Array<{ id: number; name: string; description?: string }>
    const cat = categories[selectedCat]
    return Array.isArray(cat?.scanners) ? cat.scanners : []
  }, [categories, selectedCat])

  const filtered = search
    ? rows.filter((r) => r.symbol.toUpperCase().includes(search.toUpperCase()))
    : rows

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Left: category + scanner list */}
      <aside className="lg:col-span-3 trading-surface !p-0 overflow-hidden">
        <div className="px-4 py-3 border-b border-d-border">
          <p className="text-[11px] uppercase tracking-wider text-d-text-muted">Categories</p>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          {categories ? (
            Object.entries(categories).map(([key, cat]: any) => (
              <button
                key={key}
                onClick={() => {
                  setSelectedCat(key)
                  if (cat.scanners?.[0]?.id) setSelectedScanner(cat.scanners[0].id)
                }}
                className={`w-full text-left px-4 py-2.5 text-[12px] border-b border-d-border hover:bg-white/[0.02] transition-colors ${
                  selectedCat === key ? 'bg-white/[0.03] text-white' : 'text-d-text-secondary'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{cat.label || key}</span>
                  <span className="numeric text-[10px] text-d-text-muted">
                    {cat.scanners?.length ?? 0}
                  </span>
                </div>
              </button>
            ))
          ) : (
            <div className="p-6 text-center">
              <Loader2 className="w-4 h-4 text-primary animate-spin mx-auto" />
            </div>
          )}
        </div>

        {selectedCat && scanners.length > 0 && (
          <>
            <div className="px-4 py-3 border-t border-d-border">
              <p className="text-[11px] uppercase tracking-wider text-d-text-muted">Scanners</p>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {scanners.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedScanner(s.id)}
                  className={`w-full text-left px-4 py-2 text-[11px] border-b border-d-border hover:bg-white/[0.02] transition-colors ${
                    selectedScanner === s.id ? 'bg-primary/5 text-primary' : 'text-d-text-secondary'
                  }`}
                  title={s.description || s.name}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* Right: results */}
      <section className="lg:col-span-9 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-d-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by symbol"
              className="w-full pl-8 pr-3 py-2 text-[12px] bg-[#111520] border border-d-border rounded-md text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/50"
            />
          </div>
          <span className="text-[11px] text-d-text-muted numeric">
            {loading ? '…' : `${filtered.length} / ${rows.length}`}
          </span>
        </div>

        {error && (
          <div className="trading-surface text-down text-[12px]">{error}</div>
        )}

        <div className="trading-surface !p-0 overflow-hidden">
          {loading ? (
            <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-[12px] text-d-text-muted">
              No stocks match this scanner right now.
            </div>
          ) : (
            <ScanTable rows={filtered} />
          )}
        </div>
      </section>
    </div>
  )
}


// --------------------------------------------------------------- Patterns tab

function PatternsTab() {
  const [selected, setSelected] = useState(PATTERN_TABS[0])
  const [rows, setRows] = useState<ScanRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const data = await api.screener.runScan(selected.scannerId, 'nifty500', 50)
        setRows((data.results || []) as ScanRow[])
      } catch (err) {
        setError(handleApiError(err))
        setRows([])
      } finally {
        setLoading(false)
      }
    })()
  }, [selected])

  const filtered = search
    ? rows.filter((r) => r.symbol.toUpperCase().includes(search.toUpperCase()))
    : rows

  return (
    <div className="space-y-4">
      {/* Pattern pill row */}
      <div className="flex flex-wrap gap-1.5">
        {PATTERN_TABS.map((p) => (
          <button
            key={p.value}
            onClick={() => setSelected(p)}
            className={`px-3 py-1 text-[11px] font-medium rounded-full border transition-colors ${
              selected.value === p.value
                ? 'bg-primary text-black border-primary'
                : 'bg-[#111520] text-d-text-secondary border-d-border hover:border-d-border-hover hover:text-white'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-d-text-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by symbol"
            className="w-full pl-8 pr-3 py-2 text-[12px] bg-[#111520] border border-d-border rounded-md text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/50"
          />
        </div>
        <span className="text-[11px] text-d-text-muted numeric">
          {loading ? '…' : `${filtered.length} / ${rows.length}`}
        </span>
      </div>

      {error && <div className="trading-surface text-down text-[12px]">{error}</div>}

      {/* Pattern cards grid */}
      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 text-primary animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <div className="trading-surface text-center py-12 text-[12px] text-d-text-muted">
          No {selected.label.toLowerCase()} detected right now. Scanner refreshes every hour.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((r) => {
            const ltp = r.ltp ?? 0
            const target = r.target ?? 0
            const trend: 'bullish' | 'bearish' =
              (r.change_pct ?? 0) >= 0 || (r.trend || '').toLowerCase().includes('up')
                ? 'bullish' : 'bearish'
            return (
              <PatternCard
                key={`${r.symbol}-${selected.value}`}
                symbol={r.symbol}
                exchange={r.exchange || 'NSE'}
                patternName={selected.label}
                trend={trend}
                targetPrice={target}
                currentPrice={ltp}
                stopLoss={r.stop_loss}
                confidence={r.confidence}
                mlScore={r.ml_score ?? null}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}


// ------------------------------------------------------------- subcomponents

function TabButton({
  active, onClick, icon: Icon, children,
}: {
  active: boolean
  onClick: () => void
  icon: any
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-1.5 text-[12px] font-medium rounded transition-colors ${
        active ? 'bg-white/[0.06] text-white' : 'text-d-text-muted hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {children}
    </button>
  )
}

function LockedCard() {
  return (
    <div
      className="trading-surface flex flex-col md:flex-row items-start md:items-center gap-4"
      style={{
        borderLeft: '4px solid #4FECCD',
        background: 'linear-gradient(135deg, rgba(79,236,205,0.05) 0%, rgba(79,236,205,0.02) 100%)',
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="w-4 h-4 text-primary" />
          <h3 className="text-[16px] font-semibold text-white">Scanner Lab is a Pro feature</h3>
        </div>
        <p className="text-[12px] text-d-text-secondary leading-relaxed">
          50+ technical screeners + 11 chart-pattern scanners. Not alpha — pure data discovery
          that sits alongside AI signals. Pro unlocks the full set; Elite adds unlimited
          chart-vision analysis on any symbol.
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[12px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover transition-colors"
        >
          Upgrade to Pro
          <ArrowUpRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

function ScanTable({ rows }: { rows: ScanRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="text-d-text-muted border-b border-d-border">
          <tr>
            <th className="text-left px-4 py-2.5 font-normal">Symbol</th>
            <th className="text-right px-2 py-2.5 font-normal">LTP</th>
            <th className="text-right px-2 py-2.5 font-normal">Change</th>
            <th className="text-right px-2 py-2.5 font-normal">Vol</th>
            <th className="text-right px-2 py-2.5 font-normal">RSI</th>
            <th className="text-right px-4 py-2.5 font-normal">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const chg = r.change_pct ?? 0
            return (
              <tr key={r.symbol} className="border-b border-d-border last:border-0 hover:bg-white/[0.02] transition-colors">
                <td className="px-4 py-2.5 text-white font-medium">{r.symbol}</td>
                <td className="px-2 py-2.5 text-right numeric text-d-text-primary">
                  {r.ltp ? `₹${Number(r.ltp).toFixed(2)}` : '—'}
                </td>
                <td
                  className="px-2 py-2.5 text-right numeric"
                  style={{ color: chg >= 0 ? '#05B878' : '#FF5947' }}
                >
                  <span className="inline-flex items-center gap-0.5">
                    {chg >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                  </span>
                </td>
                <td className="px-2 py-2.5 text-right numeric text-d-text-muted">
                  {r.volume ? Number(r.volume).toLocaleString('en-IN') : '—'}
                </td>
                <td className="px-2 py-2.5 text-right numeric text-d-text-muted">
                  {r.rsi ? r.rsi.toFixed(1) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Link
                    href={`/stock/${encodeURIComponent(r.symbol)}`}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
