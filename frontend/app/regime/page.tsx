'use client'

/**
 * /regime — public trust surface (Step 4 §5.1.3).
 *
 * Current regime banner (large, tinted) + 90-day timeline + strategy-
 * weight table + explainer. No auth; no personalization. CDN-cacheable
 * on the server side via Cache-Control headers.
 */

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowUpRight, Info, Loader2 } from 'lucide-react'

import { api } from '@/lib/api'

type Regime = 'bull' | 'sideways' | 'bear'

interface RegimeRow {
  regime: Regime
  prob_bull: number
  prob_sideways: number
  prob_bear: number
  vix: number | null
  nifty_close: number | null
  detected_at: string
}

const REGIME_META: Record<Regime, { label: string; color: string; bg: string; blurb: string }> = {
  bull: {
    label: 'Bull',
    color: '#05B878',
    bg: 'rgba(5, 184, 120, 0.08)',
    blurb: 'Trend + volume in sync with rising Nifty. AI signals run at full size.',
  },
  sideways: {
    label: 'Sideways',
    color: '#FEB113',
    bg: 'rgba(254, 177, 19, 0.08)',
    blurb: 'Range-bound price action. Mean-reversion favored; trend-following dampened.',
  },
  bear: {
    label: 'Bear',
    color: '#FF5947',
    bg: 'rgba(255, 89, 71, 0.08)',
    blurb: 'Structural breakdown. AI sizes reduced to 50%; long-only strategies down-weighted.',
  },
}

export default function RegimePublicPage() {
  const [state, setState] = useState<{
    current: RegimeRow | null
    history: RegimeRow[]
    counts: { bull: number; sideways: number; bear: number }
    loading: boolean
    error: string | null
  }>({
    current: null,
    history: [],
    counts: { bull: 0, sideways: 0, bear: 0 },
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.publicTrust.regimeHistory(90)
        if (!cancelled) {
          setState({
            current: (data.current as RegimeRow) || null,
            history: (data.history as RegimeRow[]) || [],
            counts: data.counts,
            loading: false,
            error: null,
          })
        }
      } catch (e: any) {
        if (!cancelled) {
          setState((s) => ({ ...s, loading: false, error: e?.message || 'Failed to load regime data' }))
        }
      }
    })()
    return () => { cancelled = true }
  }, [])

  const totalDays = state.counts.bull + state.counts.sideways + state.counts.bear
  // PR 127 — `?highlight=transitions` deep-links from the dashboard
  // turnover help. When set, the Timeline emphasizes regime-change
  // days so the user can see exactly *which* days flipped, not just
  // the count.
  const searchParams = useSearchParams()
  const highlightTransitions = searchParams?.get('highlight') === 'transitions'
  const current = state.current
  const currentMeta = current ? REGIME_META[current.regime] : null

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white">
      {/* ── Public nav ── */}
      <div className="border-b border-d-border">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-[14px] font-semibold text-white">
            Swing <span className="text-primary">AI</span>
          </Link>
          <div className="flex items-center gap-4 text-[12px] text-d-text-muted">
            <Link href="/track-record" className="hover:text-white">Track record</Link>
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

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-[28px] font-semibold">Market regime</h1>
          <p className="text-[13px] text-d-text-muted mt-1">
            Our 3-state Hidden Markov Model reads Nifty + India VIX every morning at{' '}
            <span className="numeric text-white">08:15 IST</span> and tells every
            signal downstream what regime sizing to apply.
          </p>
        </div>

        {state.loading ? (
          <div className="trading-surface flex items-center justify-center min-h-[120px]">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : state.error ? (
          <div className="trading-surface text-down text-[12px]">{state.error}</div>
        ) : current && currentMeta ? (
          <>
            {/* Current-regime hero */}
            <div
              className="trading-surface !p-6 flex flex-col md:flex-row items-start md:items-center gap-5"
              style={{ borderLeft: `4px solid ${currentMeta.color}`, background: currentMeta.bg }}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <span
                    className="text-[32px] font-semibold"
                    style={{ color: currentMeta.color }}
                  >
                    {currentMeta.label}
                  </span>
                  <span className="text-[13px] text-d-text-muted">
                    · conf{' '}
                    <span className="numeric text-white">
                      {Math.round((current[`prob_${current.regime}` as keyof RegimeRow] as number) * 100)}%
                    </span>
                  </span>
                </div>
                <p className="text-[13px] text-d-text-secondary max-w-2xl">{currentMeta.blurb}</p>
                <p className="text-[11px] text-d-text-muted mt-2">
                  As of{' '}
                  <span className="numeric text-white">
                    {new Date(current.detected_at).toLocaleString('en-IN', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                  {current.vix !== null && (
                    <> · VIX <span className="numeric text-white">{current.vix.toFixed(2)}</span></>
                  )}
                  {current.nifty_close !== null && (
                    <> · Nifty <span className="numeric text-white">{current.nifty_close.toLocaleString('en-IN')}</span></>
                  )}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 shrink-0 min-w-[280px]">
                <ProbabilityChip label="Bull" value={current.prob_bull} color="#05B878" />
                <ProbabilityChip label="Side." value={current.prob_sideways} color="#FEB113" />
                <ProbabilityChip label="Bear" value={current.prob_bear} color="#FF5947" />
              </div>
            </div>

            {/* Timeline — horizontal bar sized by counts */}
            <div className="trading-surface">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[12px] uppercase tracking-wider text-d-text-muted">
                  90-day regime timeline
                </h3>
                <span className="text-[11px] text-d-text-muted">
                  <span className="numeric text-white">{state.history.length}</span> daily samples
                </span>
              </div>
              <Timeline history={state.history} highlightTransitions={highlightTransitions} />
              {totalDays > 0 && (
                <div className="flex gap-4 mt-4 text-[11px]">
                  <Legend label="Bull" value={state.counts.bull} total={totalDays} color="#05B878" />
                  <Legend label="Sideways" value={state.counts.sideways} total={totalDays} color="#FEB113" />
                  <Legend label="Bear" value={state.counts.bear} total={totalDays} color="#FF5947" />
                </div>
              )}
            </div>

            {/* Strategy-weight table */}
            <div className="trading-surface">
              <h3 className="text-[12px] uppercase tracking-wider text-d-text-muted mb-3">
                How regime shapes signal generation
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-d-text-muted">
                    <tr className="border-b border-d-border">
                      <th className="text-left py-2 font-normal">Regime</th>
                      <th className="text-right py-2 font-normal">Strategy confluence</th>
                      <th className="text-right py-2 font-normal">SwingLens / AlphaRank weight</th>
                      <th className="text-right py-2 font-normal">TickPulse (shadow)</th>
                      <th className="text-right py-2 font-normal">Position size</th>
                      <th className="text-right py-2 font-normal">Confidence mult</th>
                    </tr>
                  </thead>
                  <tbody className="numeric">
                    <WeightRow regime="bull" values={['1.0', '1.0', '0.0', '1.0', '1.0']} />
                    <WeightRow regime="sideways" values={['0.5', '0.7', '0.0', '0.7', '0.85']} />
                    <WeightRow regime="bear" values={['0.5', '0.5', '0.0', '0.5', '0.6']} />
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-d-text-muted mt-3 flex items-start gap-1.5">
                <Info className="w-3 h-3 shrink-0 mt-0.5" />
                TickPulse contributes shadow predictions only in the current version — scheduled for
                retirement after the next out-of-sample gate. See the{' '}
                <Link href="/models" className="text-primary hover:underline">models page</Link>{' '}
                for live accuracy.
              </p>
            </div>

            {/* Explainer */}
            <div className="trading-surface space-y-3 text-[13px] leading-relaxed text-d-text-primary">
              <h3 className="text-[12px] uppercase tracking-wider text-d-text-muted">
                How RegimeIQ works
              </h3>
              <p>
                RegimeIQ reads 5 features from Nifty + India VIX daily — 5-day return,
                20-day return, 10-day realized volatility, VIX level, and 5-day VIX change —
                and maps them to one of three regimes: <span className="numeric">bull</span>,
                {' '}<span className="numeric">sideways</span>, or{' '}
                <span className="numeric">bear</span>.
              </p>
              <p>
                Every morning at <span className="numeric text-white">08:15 IST</span> the
                scheduler re-runs inference, writes a row into <code>regime_history</code>,
                and emits a <code>regime_change</code> event if the state transitioned.
                Signal sizes are gated the moment the transition fires — not on the next
                candle, not on the next day.
              </p>
              <p>
                <Link href="/track-record" className="text-primary hover:underline inline-flex items-center gap-1">
                  See every closed signal with realized P&L
                  <ArrowUpRight className="w-3 h-3" />
                </Link>
              </p>
            </div>
          </>
        ) : (
          <div className="trading-surface text-[12px] text-d-text-muted">
            No regime data captured yet. First snapshot lands at the next 08:15 IST run.
          </div>
        )}

        <p className="text-[10px] text-d-text-muted pt-6 border-t border-d-border">
          Past regime performance is not predictive of future market behavior. Market
          investments carry risk.
        </p>
      </div>
    </div>
  )
}

// ------------------------------------------------------------- subcomponents

function ProbabilityChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div
      className="trading-surface !p-3 text-center"
      style={{ borderLeft: `2px solid ${color}` }}
    >
      <div className="numeric text-[16px] font-semibold" style={{ color }}>
        {Math.round(value * 100)}%
      </div>
      <div className="text-[10px] text-d-text-muted uppercase tracking-wider mt-0.5">
        {label}
      </div>
    </div>
  )
}

function Timeline({ history, highlightTransitions }: { history: RegimeRow[]; highlightTransitions?: boolean }) {
  if (!history.length) {
    return <div className="h-12 rounded bg-d-bg-elevated" />
  }
  return (
    <div className="flex gap-[1px] h-12 rounded overflow-hidden">
      {history.map((row, i) => {
        // PR 127 — when deep-linked with `?highlight=transitions`, dim
        // non-transition days and ring the change days so the eye
        // lands on exactly the cells that flipped.
        const changed = i > 0 && history[i - 1].regime !== row.regime
        const dimmed = highlightTransitions && !changed
        return (
          <div
            key={i}
            className="relative flex-1 min-w-[3px] transition-opacity hover:opacity-80"
            title={
              (changed ? '↳ regime change · ' : '') +
              `${row.detected_at.slice(0, 10)} · ${row.regime}`
            }
            style={{
              backgroundColor: REGIME_META[row.regime].color,
              opacity: dimmed ? 0.25 : 1,
            }}
          >
            {highlightTransitions && changed && (
              <span
                className="absolute inset-y-0 left-0 w-[2px]"
                style={{ background: 'rgba(255,255,255,0.95)' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

function Legend({ label, value, total, color }: {
  label: string; value: number; total: number; color: string
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
      <span className="text-d-text-secondary">{label}</span>
      <span className="numeric text-white">{value}d</span>
      <span className="text-d-text-muted">({((value / total) * 100).toFixed(0)}%)</span>
    </span>
  )
}

function WeightRow({ regime, values }: { regime: Regime; values: string[] }) {
  const meta = REGIME_META[regime]
  return (
    <tr className="border-b border-d-border last:border-0">
      <td className="py-2.5">
        <span
          className="inline-block px-2 py-0.5 rounded text-[11px] font-medium capitalize"
          style={{ color: meta.color, backgroundColor: `${meta.color}14` }}
        >
          {meta.label}
        </span>
      </td>
      {values.map((v, i) => (
        <td key={i} className="text-right py-2.5 text-white">{v}</td>
      ))}
    </tr>
  )
}
