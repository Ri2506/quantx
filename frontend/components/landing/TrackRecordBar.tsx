'use client'

/**
 * TrackRecordBar — full-width 5-stat strip pulling live data from
 * ``/api/public/track-record`` (PR 18) + ``/api/public/regime/history``.
 *
 * Step 4 §5.1.1 §3 spec: Total 30d · WR · Avg return · Best signal ·
 * Active regime. DM Mono everywhere. CDN-cached via public endpoints.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { api } from '@/lib/api'

interface TrackStats {
  n: number
  win_rate: number
  avg_return_pct: number
  best_return_pct: number
  best_symbol: string | null
}

interface CurvePoint {
  date: string
  cum_return_pct: number
}

export default function TrackRecordBar() {
  const [stats, setStats] = useState<TrackStats | null>(null)
  // PR 116 — embed the same curve the /track-record page renders so
  // visitors see the upward shape without navigating. Curve comes
  // from the same endpoint as stats — no extra API call.
  const [curve, setCurve] = useState<CurvePoint[]>([])
  const [regime, setRegime] = useState<{ name: string; conf: number } | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [tr, reg] = await Promise.all([
          api.publicTrust.trackRecord({ days: 30, limit: 1 }).catch(() => null),
          api.publicTrust.regimeHistory(7).catch(() => null),
        ])
        if (tr && tr.stats) setStats(tr.stats as TrackStats)
        if (tr && Array.isArray(tr.curve)) setCurve(tr.curve as CurvePoint[])
        if (reg && reg.current) {
          const r = reg.current as any
          const confKey = `prob_${r.regime}` as 'prob_bull' | 'prob_sideways' | 'prob_bear'
          setRegime({
            name: r.regime,
            conf: Number(r[confKey] || 0),
          })
        }
      } catch {}
    })()
  }, [])

  return (
    <div className="relative rounded-2xl border border-d-border bg-[#111520]/90 backdrop-blur-sm overflow-hidden">
      <div className="grid grid-cols-2 md:grid-cols-5 divide-x divide-d-border">
        <Cell label="Signals · 30d" value={stats?.n ?? '—'} />
        <Cell
          label="Win rate"
          value={stats ? `${(stats.win_rate * 100).toFixed(1)}%` : '—'}
          accent={stats && stats.win_rate >= 0.5 ? '#05B878' : stats ? '#FEB113' : undefined}
        />
        <Cell
          label="Avg return"
          value={stats ? `${stats.avg_return_pct >= 0 ? '+' : ''}${stats.avg_return_pct.toFixed(2)}%` : '—'}
          accent={stats ? (stats.avg_return_pct >= 0 ? '#05B878' : '#FF5947') : undefined}
        />
        <Cell
          label="Best signal"
          value={stats && stats.best_symbol ? `+${stats.best_return_pct.toFixed(1)}%` : '—'}
          sub={stats?.best_symbol || undefined}
          accent="#05B878"
        />
        <Cell
          label="Market regime"
          value={regime ? capitalize(regime.name) : '—'}
          sub={regime ? `${Math.round(regime.conf * 100)}% conf` : undefined}
          accent={regime ? REGIME_COLORS[regime.name] : undefined}
        />
      </div>
      {/* PR 116 — cumulative-return sparkline. Renders only when the
          curve has at least 2 points so a fresh deployment with no
          history doesn't show a flat line. */}
      {curve.length >= 2 && (
        <div className="px-5 py-3 border-t border-d-border">
          <CurveSparkline curve={curve} />
        </div>
      )}

      <div className="px-5 py-2.5 border-t border-d-border flex items-center justify-between">
        <p className="text-[11px] text-d-text-muted">
          Every closed trade public — wins <strong className="text-up">and</strong> losses.
        </p>
        <Link
          href="/track-record"
          className="text-[11px] text-primary hover:underline"
        >
          See full track record →
        </Link>
      </div>
    </div>
  )
}


function CurveSparkline({ curve }: { curve: CurvePoint[] }) {
  // Compute scale once per render; curve length is ~30-365 points so
  // the sweep is cheap.
  const values = curve.map((p) => p.cum_return_pct)
  const minV = Math.min(0, ...values)
  const maxV = Math.max(0, ...values)
  const span = Math.max(0.001, maxV - minV)
  const last = values[values.length - 1] ?? 0
  const positive = last >= 0
  const lineColor = positive ? '#05B878' : '#FF5947'
  const fillStart = positive ? 'rgba(5,184,120,0.18)' : 'rgba(255,89,71,0.18)'

  const W = 600
  const H = 56
  const xStep = curve.length > 1 ? W / (curve.length - 1) : 0
  const yFor = (v: number) => H - ((v - minV) / span) * H
  const zeroY = yFor(0)
  const linePath = curve
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * xStep).toFixed(1)},${yFor(p.cum_return_pct).toFixed(1)}`)
    .join(' ')
  const fillPath = `${linePath} L${((curve.length - 1) * xStep).toFixed(1)},${H} L0,${H} Z`

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 text-[10px] uppercase tracking-wider text-d-text-muted">
        <span>Cumulative return · last {curve.length} sessions</span>
        <span
          className="numeric"
          style={{ color: lineColor }}
        >
          {last >= 0 ? '+' : ''}{last.toFixed(2)}%
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-[44px]"
        preserveAspectRatio="none"
        aria-label="Cumulative return curve"
      >
        {/* Zero line — only when 0 is inside the range. */}
        {minV < 0 && maxV > 0 && (
          <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="rgba(255,255,255,0.10)" strokeWidth={0.5} />
        )}
        <path d={fillPath} fill={fillStart} />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} />
      </svg>
    </div>
  )
}

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
    <div className="px-5 py-4">
      <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-1">
        {label}
      </p>
      <p
        className="numeric text-[22px] font-semibold"
        style={{ color: accent || '#FFFFFF' }}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-d-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}

const REGIME_COLORS: Record<string, string> = {
  bull: '#05B878',
  sideways: '#FEB113',
  bear: '#FF5947',
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
