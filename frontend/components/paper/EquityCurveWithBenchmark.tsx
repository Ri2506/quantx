'use client'

/**
 * EquityCurveWithBenchmark — paper-trading equity chart + Nifty
 * benchmark overlay (Step 4 §3.1 upgrade).
 *
 * Uses Recharts (already in the dep tree via existing EquityCurve).
 * Lightweight rendering so it stays quick on mobile.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  Legend,
} from 'recharts'

interface Point {
  snapshot_date: string
  return_pct: number
  nifty_pct: number
  equity: number
}

interface Props {
  points: Point[]
  showBenchmark?: boolean
  height?: number
}

export default function EquityCurveWithBenchmark({
  points,
  showBenchmark = true,
  height = 280,
}: Props) {
  if (!points.length) {
    return (
      <div className="flex items-center justify-center text-[12px] text-d-text-muted" style={{ height }}>
        Equity curve appears after your first paper snapshot (23:00 IST daily).
      </div>
    )
  }

  const data = points.map((p) => ({
    date: formatShortDate(p.snapshot_date),
    you: p.return_pct,
    nifty: p.nifty_pct,
    equity: p.equity,
  }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="youGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4FECCD" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#4FECCD" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#2D303D" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: '#8E8E8E', fontSize: 10 }}
          axisLine={{ stroke: '#2D303D' }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#8E8E8E', fontSize: 10, fontFamily: 'DM Mono, monospace' }}
          axisLine={{ stroke: '#2D303D' }}
          tickLine={false}
          tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`}
          width={50}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#111520',
            border: '1px solid #2D303D',
            borderRadius: 6,
            fontSize: 11,
          }}
          labelStyle={{ color: '#8E8E8E', fontSize: 10 }}
          formatter={(v: any, name: string) => [`${Number(v).toFixed(2)}%`, name === 'you' ? 'You' : 'Nifty']}
        />
        {showBenchmark && (
          <Legend
            verticalAlign="top"
            height={24}
            iconType="plainline"
            iconSize={12}
            wrapperStyle={{ fontSize: 10, color: '#8E8E8E' }}
            formatter={(v) => (v === 'you' ? 'Your paper equity' : 'Nifty 50')}
          />
        )}
        <Area type="monotone" dataKey="you" stroke="#4FECCD" strokeWidth={2} fill="url(#youGrad)" />
        {showBenchmark && (
          <Line type="monotone" dataKey="nifty" stroke="#8E8E8E" strokeWidth={1} dot={false} strokeDasharray="3 3" />
        )}
      </AreaChart>
    </ResponsiveContainer>
  )
}

function formatShortDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}
