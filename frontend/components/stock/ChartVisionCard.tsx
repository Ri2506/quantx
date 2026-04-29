'use client'

/**
 * ChartVisionCard — B2 chart-vision result surface.
 *
 * Server runs Gemini 2.0 Flash on a 120-bar chart image and returns:
 *   - Trend tag         (uptrend / downtrend / range / unclear)
 *   - Dominant pattern
 *   - Support + resistance levels (up to 3 each)
 *   - Volume signal     (accumulation / distribution / neutral)
 *   - Setup label
 *   - Confidence 0-100
 *   - 2-3 sentence narrative
 *
 * Free tier: hidden (gated upstream — card never renders).
 * Pro:       enabled for signal + watchlist symbols only; prompts
 *            upgrade on 403 ``vision_symbol_restricted``.
 * Elite:     fires via ``anywhere=true`` for any symbol.
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  Activity,
  AlertTriangle,
  Eye,
  Loader2,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'
import ModelBadge from '@/components/ModelBadge'


type Analysis = Awaited<ReturnType<typeof api.ai.visionAnalyze>>

const TREND_META: Record<string, { label: string; color: string; icon: any }> = {
  uptrend:   { label: 'Uptrend',   color: '#05B878', icon: TrendingUp },
  downtrend: { label: 'Downtrend', color: '#FF5947', icon: TrendingDown },
  range:     { label: 'Range',     color: '#FEB113', icon: Minus },
  unclear:   { label: 'Unclear',   color: '#8e8e8e', icon: Minus },
}

const VOLUME_COLOR: Record<string, string> = {
  accumulation: '#05B878',
  distribution: '#FF5947',
  neutral:      '#8e8e8e',
}


interface Props {
  symbol: string
  /** Elite-only flag — uses the unrestricted endpoint. */
  anywhere?: boolean
}


export default function ChartVisionCard({ symbol, anywhere = false }: Props) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await api.ai.visionAnalyze(symbol, anywhere)
      setAnalysis(r)
      if (!r.available && r.notes?.length) {
        setError(`Chart vision unavailable: ${r.notes.join(', ')}`)
      }
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
      <header className="px-5 py-3 border-b border-d-border flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-white flex items-center gap-2">
          <Eye className="w-4 h-4 text-primary" />
          Chart vision
          {anywhere && (
            <span className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 bg-[rgba(255,209,102,0.10)] text-[#FFD166] border border-[rgba(255,209,102,0.45)]">
              Elite
            </span>
          )}
        </h3>
        {!analysis && !loading && (
          <button
            onClick={run}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-primary text-black text-[11px] font-semibold hover:bg-primary-hover"
          >
            <Sparkles className="w-3 h-3" />
            Run analysis
          </button>
        )}
        {analysis && !loading && (
          <button
            onClick={run}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-d-border text-[10px] text-d-text-secondary hover:text-white"
          >
            <Sparkles className="w-3 h-3" />
            Re-run
          </button>
        )}
      </header>

      <div className="px-5 py-4 space-y-3">
        {loading && (
          <div className="flex items-center gap-2 text-[12px] text-d-text-muted">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Reading the chart…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-down mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-down">{error}</p>
              {error.toLowerCase().includes('restricted') && (
                <Link
                  href="/pricing"
                  className="inline-block mt-1 text-[11px] text-primary hover:underline"
                >
                  Upgrade to Elite for chart vision on any symbol →
                </Link>
              )}
            </div>
          </div>
        )}

        {!analysis && !loading && !error && (
          <p className="text-[12px] text-d-text-muted leading-relaxed">
            Our vision engine reads a 120-bar candlestick chart and returns trend,
            pattern, support/resistance, and a plain-language setup thesis.
            One-click — no prompts.
          </p>
        )}

        {analysis && analysis.available && !loading && (
          <AnalysisView a={analysis} />
        )}
      </div>
    </section>
  )
}


/* ───────────────────────── components ───────────────────────── */


function AnalysisView({ a }: { a: Analysis }) {
  const trendMeta = a.trend ? (TREND_META[a.trend] || TREND_META.unclear) : TREND_META.unclear
  const TrendIcon = trendMeta.icon
  const setupColor =
    a.setup?.includes('bullish') ? '#05B878'
    : a.setup?.includes('bearish') ? '#FF5947'
    : '#FEB113'

  return (
    <div className="space-y-3">
      {/* Top chips row */}
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 border"
          style={{ color: trendMeta.color, borderColor: `${trendMeta.color}55`, background: `${trendMeta.color}14` }}
        >
          <TrendIcon className="w-3 h-3" />
          {trendMeta.label}
        </span>
        {a.pattern && (
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border border-d-border bg-[#0A0D14] text-d-text-secondary">
            {a.pattern}
          </span>
        )}
        {a.volume_signal && (
          <span
            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider rounded-full px-2 py-0.5 border"
            style={{
              color: VOLUME_COLOR[a.volume_signal],
              borderColor: `${VOLUME_COLOR[a.volume_signal]}55`,
              background: `${VOLUME_COLOR[a.volume_signal]}14`,
            }}
          >
            <Activity className="w-3 h-3" />
            {a.volume_signal}
          </span>
        )}
        {a.confidence != null && (
          <span className="text-[10px] text-d-text-muted numeric ml-auto">
            conf {a.confidence}
          </span>
        )}
      </div>

      {/* Setup banner */}
      {a.setup && (
        <div
          className="rounded-md border px-3 py-2"
          style={{ borderColor: `${setupColor}55`, background: `${setupColor}10` }}
        >
          <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-0.5">Setup</p>
          <p className="text-[13px] font-semibold capitalize" style={{ color: setupColor }}>
            {a.setup}
          </p>
        </div>
      )}

      {/* Levels */}
      <div className="grid grid-cols-2 gap-2">
        <LevelBox label="Support" values={a.support_levels} color="#05B878" />
        <LevelBox label="Resistance" values={a.resistance_levels} color="#FF5947" />
      </div>

      {/* Narrative */}
      {a.narrative && (
        <div className="rounded-md bg-[#0A0D14] border border-d-border px-3 py-2.5">
          <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-1">Read</p>
          <p className="text-[12px] text-d-text-primary leading-relaxed">{a.narrative}</p>
        </div>
      )}

      <p className="text-[9px] text-d-text-muted pt-1 border-t border-d-border flex items-center gap-1">
        Powered by our <ModelBadge modelKey="sentiment_engine" size="xs" /> vision extension — read is a snapshot, not investment advice.
      </p>
    </div>
  )
}


function LevelBox({
  label,
  values,
  color,
}: {
  label: string
  values: number[]
  color: string
}) {
  return (
    <div className="rounded-md bg-[#0A0D14] border border-d-border px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-d-text-muted">{label}</p>
      {values.length === 0 ? (
        <p className="text-[12px] text-d-text-muted mt-0.5">—</p>
      ) : (
        <div className="flex flex-wrap gap-1 mt-1">
          {values.map((v, i) => (
            <span
              key={i}
              className="numeric text-[11px] font-semibold px-1.5 py-0.5 rounded border"
              style={{ color, borderColor: `${color}40`, background: `${color}10` }}
            >
              ₹{v.toFixed(2)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
