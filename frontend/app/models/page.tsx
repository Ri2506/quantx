'use client'

/**
 * /models — public trust surface (Step 4 §5.1.5).
 *
 * Grid of ModelAccuracyCards. One card per model trained in the
 * Swing AI stack. Feeds from ``model_rolling_performance`` written
 * weekly by the scheduler aggregator job (PR 7).
 */

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { api } from '@/lib/api'
import ModelAccuracyCard from '@/components/signals/ModelAccuracyCard'

export default function ModelsPublicPage() {
  const [windowDays, setWindowDays] = useState<7 | 30 | 90 | 365>(30)
  const [models, setModels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    ;(async () => {
      try {
        const res = await api.publicTrust.models(windowDays)
        if (!cancelled) {
          setModels(res.models || [])
          setError(null)
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load model data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [windowDays])

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white">
      <PublicHeader />

      <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-[28px] font-semibold">Model accuracy</h1>
          <p className="text-[13px] text-d-text-muted mt-1 max-w-3xl">
            Every model in the Swing AI stack is measured against its own closed signals and
            re-evaluated weekly. Win rate = fraction of closed signals that hit their target before
            their stop. Figures below update every Sunday at{' '}
            <span className="numeric text-white">02:00 IST</span>.
          </p>
        </div>

        {/* Window selector */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-d-text-muted">Window</span>
          <div className="inline-flex items-center bg-[#111520] border border-d-border rounded-md p-0.5">
            {[7, 30, 90, 365].map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d as 7 | 30 | 90 | 365)}
                className={`px-3 py-1 text-[11px] font-medium rounded transition-colors ${
                  windowDays === d ? 'bg-white/[0.06] text-white' : 'text-d-text-muted hover:text-white'
                }`}
              >
                {d === 365 ? '1y' : `${d}d`}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="trading-surface flex items-center justify-center min-h-[200px]">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="trading-surface text-down text-[12px]">{error}</div>
        ) : models.length === 0 ? (
          <div className="trading-surface text-center py-10">
            <p className="text-white">No model performance data yet for this window.</p>
            <p className="text-[12px] text-d-text-muted mt-1">
              First aggregate run fires Sunday 02:00 IST after we have enough closed signals.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {models.map((m) => (
              <ModelAccuracyCard
                key={m.model_name}
                modelName={m.model_name}
                windowDays={m.window_days}
                winRate={m.win_rate}
                signalCount={m.signal_count || 0}
                avgPnlPct={m.avg_pnl_pct}
                sharpeRatio={m.sharpe_ratio}
                computedAt={m.computed_at}
                sparkline={m.sparkline || []}
                status={guessStatus(m.model_name)}
              />
            ))}
          </div>
        )}

        {/* Explainer */}
        <div className="trading-surface space-y-3 text-[13px] leading-relaxed text-d-text-primary mt-4">
          <h3 className="text-[12px] uppercase tracking-wider text-d-text-muted">
            How we measure accuracy
          </h3>
          <p>
            For every closed signal we record whether it hit target, stop loss, or expired. "Win
            rate" is the fraction that hit target. "Directional accuracy" equals win rate for
            binary long/short calls. Rolling windows of{' '}
            <span className="numeric text-white">7 / 30 / 90 / 365 days</span> are recomputed every
            Sunday by the <code>aggregate_model_rolling_performance</code> job.
          </p>
          <p>
            <strong className="text-white">PROD</strong> tag = the model ships into signals users see.
            <strong className="text-warning ml-2">SHADOW</strong> tag = the model writes predictions
            alongside live signals for A/B audit but does <em>not</em> shape user-facing confidence.
            Promotion to prod requires passing our regression gate.
          </p>
          <p className="text-[11px] text-d-text-muted">
            The PROD/SHADOW labels reflect the model-registry state in{' '}
            <code>model_versions</code>. Source of truth, not marketing.
          </p>
        </div>

        <p className="text-[10px] text-d-text-muted pt-6 border-t border-d-border">
          Past model performance is not predictive of future accuracy. Models retrain monthly
          (weekly for the regime detector); results shift over time.
        </p>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- helpers

/**
 * Best-effort status guess until the backend surfaces
 * is_prod / is_shadow on the model_rolling_performance payload.
 * HMM + BreakoutMetaLabeler were registered is_prod=true at PR 3;
 * everything else started in shadow mode.
 */
function guessStatus(modelName: string): 'prod' | 'shadow' {
  const PROD = new Set(['regime_hmm', 'breakout_meta_labeler', 'strategy'])
  return PROD.has(modelName) ? 'prod' : 'shadow'
}

function PublicHeader() {
  return (
    <div className="border-b border-d-border">
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-3 flex items-center justify-between">
        <Link href="/" className="text-[14px] font-semibold text-white">
          Swing <span className="text-primary">AI</span>
        </Link>
        <div className="flex items-center gap-4 text-[12px] text-d-text-muted">
          <Link href="/regime" className="hover:text-white">Regime</Link>
          <Link href="/track-record" className="hover:text-white">Track record</Link>
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
  )
}
