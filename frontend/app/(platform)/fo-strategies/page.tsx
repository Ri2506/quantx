'use client'

/**
 * /fo-strategies — F6 Elite F&O options strategy recommender.
 *
 * Step 4 §5.3 — weekly Nifty / BankNifty / FinNifty strategy cards.
 * Each card: strategy name, market view, legs with strikes + premiums,
 * BS Greeks dashboard, max profit / loss, breakevens, probability of
 * profit. Symbol switcher tabs + VIX TFT forecast banner.
 */

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Flame,
  Gauge,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'

import { api, handleApiError, type FoStrategyLeg, type FoStrategyProposal } from '@/lib/api'

type Overview = Awaited<ReturnType<typeof api.foStrategies.overview>>

const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY'] as const
type Symbol = (typeof SYMBOLS)[number]

const REGIME_COLORS: Record<string, string> = {
  bull: '#05B878',
  sideways: '#FEB113',
  bear: '#FF5947',
}

const VIX_DIR_COPY: Record<string, { label: string; icon: any; color: string }> = {
  rising:  { label: 'VIX rising',  icon: TrendingUp,   color: '#FF5947' },
  falling: { label: 'VIX falling', icon: TrendingDown, color: '#05B878' },
  stable:  { label: 'VIX stable',  icon: Gauge,        color: '#FEB113' },
}


export default function FoStrategiesPage() {
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSymbol, setActiveSymbol] = useState<Symbol>('NIFTY')

  useEffect(() => {
    (async () => {
      try {
        const o = await api.foStrategies.overview()
        setData(o)
      } catch (err) {
        setError(handleApiError(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const recs = useMemo(() => data?.recommendations?.[activeSymbol] ?? [], [data, activeSymbol])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-10">
        <div className="text-[13px] text-d-text-muted">Loading F&O strategies…</div>
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

  const vixDir = VIX_DIR_COPY[data.vix.direction] || VIX_DIR_COPY.stable

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            F&amp;O Strategies
            <span className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 bg-[rgba(255,209,102,0.10)] text-[#FFD166] border border-[rgba(255,209,102,0.45)]">
              Elite
            </span>
          </h1>
          <p className="text-[12px] text-d-text-muted mt-0.5">
            Weekly index option strategies · VolCast VIX forecast · RegimeIQ regime · Black-Scholes Greeks
          </p>
        </div>
      </header>

      {/* ── VIX + Regime strip ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 divide-x divide-d-border rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        <Cell
          label="India VIX"
          value={data.vix.current != null ? data.vix.current.toFixed(2) : '—'}
          sub={data.vix.current != null ? 'current' : 'data unavailable'}
        />
        <Cell
          label="5-day forecast (p50)"
          value={data.vix.forecast_p50_5d != null ? data.vix.forecast_p50_5d.toFixed(2) : '—'}
          sub={
            data.vix.p10 != null && data.vix.p90 != null
              ? `p10 ${Number(data.vix.p10).toFixed(1)} · p90 ${Number(data.vix.p90).toFixed(1)}`
              : undefined
          }
          accent="#4FECCD"
        />
        <Cell
          label={vixDir.label}
          value={data.vix.direction}
          accent={vixDir.color}
          sub="VolCast direction"
        />
        <Cell
          label="Market regime"
          value={data.regime ? capitalize(data.regime.name) : '—'}
          accent={data.regime ? REGIME_COLORS[data.regime.name] : undefined}
          sub={
            data.regime && data.regime[`prob_${data.regime.name}` as 'prob_bull' | 'prob_sideways' | 'prob_bear'] != null
              ? `${Math.round((data.regime[`prob_${data.regime.name}` as 'prob_bull' | 'prob_sideways' | 'prob_bear'] as number) * 100)}% conf`
              : undefined
          }
        />
      </section>

      {/* ── Symbol tabs ── */}
      <section className="flex items-center gap-1 rounded-lg bg-[#111520] border border-d-border p-1 w-fit">
        {SYMBOLS.map((s) => (
          <button
            key={s}
            onClick={() => setActiveSymbol(s)}
            className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
              activeSymbol === s
                ? 'bg-primary/10 text-primary border border-primary/30'
                : 'text-d-text-secondary hover:text-white border border-transparent'
            }`}
          >
            {s}
          </button>
        ))}
      </section>

      {/* ── Strategy cards ── */}
      {recs.length === 0 ? (
        <section className="rounded-xl border border-d-border bg-[#111520] p-8 text-center">
          <p className="text-[13px] text-d-text-muted">
            No strategy recommended for {activeSymbol} right now. Check back after the next regime or VIX forecast update.
          </p>
        </section>
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {recs.map((p, i) => <StrategyCard key={`${p.strategy}-${i}`} p={p} />)}
        </section>
      )}

      {/* Educational note */}
      <p className="text-[10px] text-d-text-muted text-center">
        F&amp;O trading is high-risk. Premiums shown are Black-Scholes theoretical prices — live mid-market may differ.
        SEBI-compliant educational tool — execute on your broker at your own discretion.
      </p>
    </div>
  )
}


/* ───────────────────────── components ───────────────────────── */


function Cell({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
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


function StrategyCard({ p }: { p: FoStrategyProposal }) {
  const creditColor = p.credit_debit === 'credit' ? '#05B878' : '#FEB113'
  const totals = aggregateGreeks(p.legs)
  const netPerLot = p.net_premium * p.lot_size
  const maxProfitINR = p.max_profit != null ? p.max_profit * p.lot_size : null
  const maxLossINR = p.max_loss != null ? p.max_loss * p.lot_size : null
  const expiryDate = p.expiry ? new Date(p.expiry) : null

  return (
    <article className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-d-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[16px] font-semibold text-white flex items-center gap-2">
              <Flame className="w-4 h-4 text-primary" />
              {p.name}
            </h3>
            <p className="text-[11px] text-d-text-secondary mt-1">{p.view}</p>
          </div>
          <span
            className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 border"
            style={{
              color: creditColor,
              backgroundColor: `${creditColor}14`,
              borderColor: `${creditColor}55`,
            }}
          >
            {p.credit_debit === 'credit' ? 'Credit' : 'Debit'}
          </span>
        </div>
      </div>

      {/* Legs */}
      <div className="px-5 py-3 border-b border-d-border">
        <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-2">Legs</p>
        <div className="space-y-1.5">
          {p.legs.map((l, i) => <LegRow key={i} l={l} />)}
        </div>
      </div>

      {/* Profit / Loss / BE */}
      <div className="px-5 py-3 border-b border-d-border grid grid-cols-2 gap-3">
        <Metric
          label="Max profit"
          value={p.max_profit != null ? `₹${formatINR(p.max_profit)}` : 'Unlimited'}
          sub={maxProfitINR != null ? `₹${formatINR(maxProfitINR)} / lot` : undefined}
          accent="#05B878"
          icon={ArrowUpRight}
        />
        <Metric
          label="Max loss"
          value={p.max_loss != null ? `₹${formatINR(p.max_loss)}` : 'Unlimited'}
          sub={maxLossINR != null ? `₹${formatINR(maxLossINR)} / lot` : 'Undefined risk — margin heavy'}
          accent="#FF5947"
          icon={ArrowDownRight}
        />
      </div>

      {/* Breakevens + POP */}
      <div className="px-5 py-3 border-b border-d-border grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Breakeven</p>
          <p className="numeric text-white mt-0.5">
            {p.breakevens.map((b) => b.toFixed(0)).join(' / ')}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Prob. of profit</p>
          <p
            className="numeric font-semibold mt-0.5"
            style={{ color: (p.probability_of_profit ?? 0) >= 0.5 ? '#05B878' : '#FEB113' }}
          >
            {p.probability_of_profit != null ? `${Math.round(p.probability_of_profit * 100)}%` : '—'}
          </p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Net / lot</p>
          <p className="numeric font-semibold mt-0.5" style={{ color: creditColor }}>
            {p.credit_debit === 'credit' ? '+' : ''}₹{formatINR(netPerLot)}
          </p>
        </div>
      </div>

      {/* Greeks */}
      <div className="px-5 py-3 grid grid-cols-4 gap-2 text-[11px]">
        <GreekCell label="Δ Delta" value={totals.delta.toFixed(2)} />
        <GreekCell label="Γ Gamma" value={totals.gamma.toFixed(4)} />
        <GreekCell label="Θ Theta" value={totals.theta.toFixed(1)} />
        <GreekCell label="ν Vega" value={totals.vega.toFixed(1)} />
      </div>

      {/* PR 73 — payoff-at-expiry diagram. Frontend-computed from legs +
          strikes; gives a visual sense of where the strategy makes /
          loses money relative to the breakevens already shown above. */}
      <div className="px-5 py-3 border-t border-d-border">
        <PayoffDiagram p={p} />
      </div>

      <div className="px-5 py-2.5 border-t border-d-border flex items-center justify-between text-[10px]">
        <span className="text-d-text-muted">
          Expiry {expiryDate ? expiryDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : p.expiry}
          {' · '}lot {p.lot_size}
        </span>
        <span className="text-d-text-muted">
          {p.legs.length} legs · {Math.abs(totals.delta) < 0.15 ? 'delta-neutral' : totals.delta > 0 ? 'net long' : 'net short'}
        </span>
      </div>
    </article>
  )
}


function LegRow({ l }: { l: FoStrategyLeg }) {
  const isBuy = l.action === 'BUY'
  return (
    <div className="flex items-center gap-3 text-[12px]">
      <span
        className={`inline-flex items-center justify-center w-14 h-6 rounded text-[10px] font-semibold tracking-wider ${
          isBuy
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
      <span className="text-d-text-muted text-[10px] flex-1">IV {(l.iv * 100).toFixed(1)}%</span>
      <span className="numeric text-white w-14 text-right">₹{l.premium.toFixed(2)}</span>
    </div>
  )
}


function Metric({
  label,
  value,
  sub,
  accent,
  icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
  icon: React.ElementType
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-0.5 flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {label}
      </p>
      <p className="numeric text-[15px] font-semibold" style={{ color: accent || '#FFFFFF' }}>{value}</p>
      {sub && <p className="text-[10px] text-d-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}


function GreekCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-[#0A0D14] border border-d-border px-2 py-1.5">
      <p className="text-[9px] uppercase tracking-wider text-d-text-muted">{label}</p>
      <p className="numeric text-[12px] font-semibold text-white mt-0.5">{value}</p>
    </div>
  )
}


/* ───────────────────────── payoff diagram ───────────────────────── */


function PayoffDiagram({ p }: { p: FoStrategyProposal }) {
  // Build a price range centered around the average strike. The
  // strike_interval gives us a sensible step; we sweep ±10 intervals so
  // every strategy (single-leg straddles → 4-leg condors) shows full
  // wings + a flat middle if any.
  const strikes = p.legs.map((l) => l.strike).filter((s) => Number.isFinite(s) && s > 0)
  if (strikes.length === 0) return null
  const minStrike = Math.min(...strikes)
  const maxStrike = Math.max(...strikes)
  const center = (minStrike + maxStrike) / 2
  const interval = p.strike_interval || Math.max(1, (maxStrike - minStrike) / 4 || 50)
  const span = Math.max((maxStrike - minStrike) + interval * 8, interval * 16)
  const lo = Math.max(1, center - span / 2)
  const hi = center + span / 2

  // Sample 64 points and compute net P&L per share at expiry.
  const N = 64
  const points: Array<{ x: number; y: number }> = []
  let yMin = Infinity
  let yMax = -Infinity
  for (let i = 0; i < N; i++) {
    const S = lo + (hi - lo) * (i / (N - 1))
    let pnl = 0
    for (const l of p.legs) {
      const intrinsic = l.option_type === 'CE'
        ? Math.max(0, S - l.strike)
        : Math.max(0, l.strike - S)
      // Buy pays premium, gets intrinsic. Sell collects premium, owes intrinsic.
      pnl += l.action === 'BUY' ? (intrinsic - l.premium) : (l.premium - intrinsic)
    }
    points.push({ x: S, y: pnl })
    if (pnl < yMin) yMin = pnl
    if (pnl > yMax) yMax = pnl
  }
  // Add 10% headroom so the curve never hits the SVG edges.
  const yPad = (yMax - yMin) * 0.1 || 1
  yMin -= yPad
  yMax += yPad

  const W = 320
  const H = 80
  const xScale = (x: number) => ((x - lo) / (hi - lo)) * W
  const yScale = (y: number) => H - ((y - yMin) / (yMax - yMin)) * H
  const zeroY = yScale(0)
  const isClipped = zeroY >= 0 && zeroY <= H

  // Split the curve into above-zero / below-zero polygons for green/red fill.
  const greenArea: string[] = []
  const redArea: string[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const ax = xScale(a.x), ay = yScale(a.y)
    const bx = xScale(b.x), by = yScale(b.y)
    if (a.y >= 0 && b.y >= 0) {
      greenArea.push(`M${ax},${zeroY} L${ax},${ay} L${bx},${by} L${bx},${zeroY} Z`)
    } else if (a.y < 0 && b.y < 0) {
      redArea.push(`M${ax},${zeroY} L${ax},${ay} L${bx},${by} L${bx},${zeroY} Z`)
    } else {
      // crosses zero — split at zero crossing
      const t = a.y / (a.y - b.y)
      const cx = ax + (bx - ax) * t
      if (a.y >= 0) {
        greenArea.push(`M${ax},${zeroY} L${ax},${ay} L${cx},${zeroY} Z`)
        redArea.push(`M${cx},${zeroY} L${bx},${by} L${bx},${zeroY} Z`)
      } else {
        redArea.push(`M${ax},${zeroY} L${ax},${ay} L${cx},${zeroY} Z`)
        greenArea.push(`M${cx},${zeroY} L${bx},${by} L${bx},${zeroY} Z`)
      }
    }
  }

  const linePath = points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xScale(pt.x).toFixed(1)},${yScale(pt.y).toFixed(1)}`)
    .join(' ')

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-d-text-muted">Payoff at expiry</p>
        <p className="text-[9px] text-d-text-muted numeric">
          range {Math.round(lo)} – {Math.round(hi)}
        </p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[88px]" preserveAspectRatio="none">
        {/* zero line */}
        {isClipped && (
          <line x1={0} y1={zeroY} x2={W} y2={zeroY} stroke="#2D303D" strokeWidth={1} />
        )}
        {/* breakeven verticals */}
        {p.breakevens.filter((b) => b >= lo && b <= hi).map((b) => (
          <line
            key={b}
            x1={xScale(b)}
            y1={0}
            x2={xScale(b)}
            y2={H}
            stroke="#FEB113"
            strokeWidth={0.6}
            strokeDasharray="2 2"
          />
        ))}
        {/* fills */}
        {greenArea.map((d, i) => <path key={`g${i}`} d={d} fill="#05B878" fillOpacity={0.18} />)}
        {redArea.map((d, i) => <path key={`r${i}`} d={d} fill="#FF5947" fillOpacity={0.18} />)}
        {/* curve */}
        <path d={linePath} fill="none" stroke="#FFFFFF" strokeWidth={1.2} />
        {/* strike markers */}
        {strikes.map((s, i) => (
          <line
            key={`s${i}`}
            x1={xScale(s)}
            y1={H - 4}
            x2={xScale(s)}
            y2={H}
            stroke="#4FECCD"
            strokeWidth={1}
          />
        ))}
      </svg>
      <div className="flex items-center justify-between mt-1 text-[9px] text-d-text-muted">
        <span className="numeric">{Math.round(lo)}</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-1 rounded-sm" style={{ background: '#FEB113' }} /> BE
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-1 rounded-sm bg-up/40" /> profit
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-1 rounded-sm bg-down/40" /> loss
          </span>
        </span>
        <span className="numeric">{Math.round(hi)}</span>
      </div>
    </div>
  )
}


/* ───────────────────────── helpers ───────────────────────── */


function aggregateGreeks(legs: FoStrategyLeg[]) {
  let delta = 0, gamma = 0, theta = 0, vega = 0
  for (const l of legs) {
    const sign = l.action === 'BUY' ? 1 : -1
    delta += sign * l.delta
    gamma += sign * l.gamma
    theta += sign * l.theta
    vega  += sign * l.vega
  }
  return { delta, gamma, theta, vega }
}


function formatINR(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_00_00_000) return `${(n / 1_00_00_000).toFixed(2)}Cr`
  if (abs >= 1_00_000)    return `${(n / 1_00_000).toFixed(2)}L`
  if (abs >= 1_000)       return `${(n / 1_000).toFixed(1)}k`
  return n.toFixed(0)
}


function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
