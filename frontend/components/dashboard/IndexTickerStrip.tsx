// ============================================================================
// PR 66 — IndexTickerStrip
// ============================================================================
// Slim row of NIFTY / BANK NIFTY / SENSEX / INDIA VIX numbers shown at
// the top of /dashboard and /stocks. Polls /api/public/indices via SWR
// every 30s, matching the backend's CDN cache window. The endpoint is
// public, so this works pre-auth too — but we currently mount it
// behind AppLayout, where the user is signed in.
//
// Static cells when data is missing — never blanks the strip out.
// ============================================================================

'use client'

import useSWR from 'swr'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { api } from '@/lib/api'

type IndexKey = 'nifty' | 'banknifty' | 'sensex' | 'vix'

interface IndexRow {
  key: IndexKey
  label: string
  last: number | null
  change: number | null
  change_pct: number | null
}

const fetcher = () => api.publicTrust.indices()

function formatNumber(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '--'
  return n.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function IndexCell({ row }: { row: IndexRow }) {
  const up = (row.change ?? 0) > 0
  const down = (row.change ?? 0) < 0
  const isVix = row.key === 'vix'
  // VIX inverts: rising VIX is fear (bad), falling VIX is calm (good).
  // Color the *signal*, not the math: VIX up reads "down" red.
  const tone = isVix
    ? up ? 'text-down' : down ? 'text-up' : 'text-d-text-muted'
    : up ? 'text-up' : down ? 'text-down' : 'text-d-text-muted'
  const Arrow = up ? ArrowUp : down ? ArrowDown : null
  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="text-[10px] uppercase tracking-wider text-d-text-muted">{row.label}</span>
      <span className="numeric text-[12px] font-medium text-white">{formatNumber(row.last)}</span>
      <span className={`numeric text-[11px] inline-flex items-center gap-0.5 ${tone}`}>
        {Arrow && <Arrow className="w-3 h-3" />}
        {formatNumber(row.change_pct, 2)}%
      </span>
    </div>
  )
}

export default function IndexTickerStrip() {
  const { data } = useSWR('public-indices', fetcher, {
    refreshInterval: 30_000,
    dedupingInterval: 15_000,
    revalidateOnFocus: false,
  })

  const rows: IndexRow[] = data?.indices ?? [
    { key: 'nifty',     label: 'NIFTY 50',   last: null, change: null, change_pct: null },
    { key: 'banknifty', label: 'BANK NIFTY', last: null, change: null, change_pct: null },
    { key: 'sensex',    label: 'SENSEX',     last: null, change: null, change_pct: null },
    { key: 'vix',       label: 'INDIA VIX',  last: null, change: null, change_pct: null },
  ]

  return (
    <div className="trading-surface !p-2 !px-3 overflow-x-auto touch-scroll-x">
      <div className="flex items-center gap-5 whitespace-nowrap">
        {rows.map((row) => (
          <IndexCell key={row.key} row={row} />
        ))}
      </div>
    </div>
  )
}
