'use client'

/**
 * ModelConsensusGrid — 4-column grid of per-model cards.
 *
 * Step 4 §3.1 component. Feeds off every model score present on the
 * signal row. Models: TFT (swing), Qlib Alpha158 (cross-sectional),
 * LGBM gate (shadow), HMM regime. Each card: identity color stripe,
 * direction vote glyph, score, last-30d accuracy (from
 * model_rolling_performance when available), one-line human prediction.
 */

import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import type { ReactNode } from 'react'

type Vote = 'bullish' | 'bearish' | 'neutral'

interface ModelCard {
  key: string
  name: string
  color: string
  score: number | null           // 0-100 normalized for display; null when absent
  vote: Vote
  prediction: string             // one-line human-readable
  accuracy30d?: number | null    // 0-1
}

interface Props {
  /**
   * Signal row (superset of frontend/types/index.ts Signal). Extra fields
   * coming from PR 2 migration (tft_p50, lgbm_buy_prob, qlib_rank, etc.)
   * are read defensively with `any` escape — `Signal` type will be
   * upgraded in a later frontend PR.
   */
  signal: Record<string, any>
  /** Map of model_name → last-30d WR ∈ [0,1] from /api/models/accuracy (optional). */
  accuracy?: Record<string, number>
}

export default function ModelConsensusGrid({ signal, accuracy }: Props) {
  const cards = buildCards(signal, accuracy)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map((card) => (
        <div
          key={card.key}
          className="trading-surface !p-4"
          style={{ borderLeft: `3px solid ${card.color}` }}
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] uppercase tracking-wider text-d-text-muted">
              {card.name}
            </span>
            <VoteGlyph vote={card.vote} />
          </div>

          <div className="flex items-baseline gap-1.5 mb-1">
            {card.score === null ? (
              <span className="numeric text-[18px] text-d-text-muted">—</span>
            ) : (
              <>
                <span className="numeric text-[22px] font-semibold text-white">
                  {Math.round(card.score)}
                </span>
                <span className="text-[11px] text-d-text-muted">/ 100</span>
              </>
            )}
          </div>

          <p className="text-[11px] text-d-text-secondary leading-snug line-clamp-2">
            {card.prediction}
          </p>

          {typeof card.accuracy30d === 'number' && (
            <p className="mt-2 text-[10px] text-d-text-muted">
              30d WR{' '}
              <span className="numeric text-white">
                {(card.accuracy30d * 100).toFixed(1)}%
              </span>
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------------ helpers

function buildCards(
  signal: Record<string, any>,
  accuracy?: Record<string, number>,
): ModelCard[] {
  const dir: Vote = signal.direction === 'LONG' ? 'bullish' : signal.direction === 'SHORT' ? 'bearish' : 'neutral'
  const entry = Number(signal.entry_price) || 0

  // ---- TFT (PR 4 SHADOW — tft_p50 + tft_score columns from PR 2). ----
  const tftP50: number | null =
    firstFiniteNumber(signal.tft_p50, signal.tft_prediction?.p50?.slice?.(-1)?.[0])
  const tftDirection: Vote =
    tftP50 !== null && entry > 0
      ? tftP50 > entry * 1.005 ? 'bullish' : tftP50 < entry * 0.995 ? 'bearish' : 'neutral'
      : dir
  const tftScore = firstFiniteNumber(signal.tft_score)
  const tftCard: ModelCard = {
    key: 'tft_swing',
    name: 'SwingLens',
    color: '#4FECCD',
    score: tftScore !== null ? Math.min(100, Math.max(0, tftScore * 100)) : null,
    vote: tftDirection,
    prediction:
      tftP50 !== null && entry > 0
        ? `5-day p50 fc: ₹${tftP50.toFixed(2)} (${pctChange(entry, tftP50)})`
        : 'No SwingLens forecast available.',
    accuracy30d: accuracy?.tft_swing ?? null,
  }

  // ---- Qlib Alpha158 cross-sectional ranker (PR 9). ----
  const qlibRank: number | null = firstFiniteNumber(signal.qlib_rank)
  const qlibScore: number | null = firstFiniteNumber(signal.qlib_score)
  const qlibVote: Vote =
    qlibRank !== null && qlibRank <= 100 ? 'bullish' :
    qlibRank !== null && qlibRank > 400 ? 'bearish' : 'neutral'
  const qlibCard: ModelCard = {
    key: 'qlib_alpha158',
    name: 'AlphaRank',
    color: '#5DCBD8',
    score: qlibRank !== null ? Math.max(0, 100 - (qlibRank - 1) * 0.2) : null,
    vote: qlibVote,
    prediction:
      qlibRank !== null
        ? `Rank #${qlibRank} of NSE All (5-day horizon)`
        : qlibScore !== null
          ? `Score ${qlibScore.toFixed(4)}`
          : 'Pending next nightly rank.',
    accuracy30d: accuracy?.qlib_alpha158 ?? null,
  }

  // ---- LGBM signal gate (PR 4 SHADOW). ----
  const lgbmProb: number | null = firstFiniteNumber(signal.lgbm_buy_prob, signal.lgbm_score)
  const lgbmVote: Vote =
    lgbmProb !== null
      ? lgbmProb >= 0.55 ? 'bullish' : lgbmProb <= 0.45 ? 'bearish' : 'neutral'
      : 'neutral'
  const lgbmCard: ModelCard = {
    key: 'lgbm_signal_gate',
    name: 'TickPulse',
    color: '#FEB113',
    score: lgbmProb !== null ? lgbmProb * 100 : null,
    vote: lgbmVote,
    prediction:
      lgbmProb !== null
        ? `Buy probability ${(lgbmProb * 100).toFixed(1)}% (shadow — not gating)`
        : 'No TickPulse prediction recorded.',
    accuracy30d: accuracy?.lgbm_signal_gate ?? null,
  }

  // ---- HMM regime (PR 4 PROD). ----
  const regime: string | null = signal.regime_at_signal ?? signal.regime_context ?? null
  const regimeConf: number | null = firstFiniteNumber(signal.regime_confidence)
  const hmmVote: Vote =
    regime === 'bear' ? 'bearish' : regime === 'sideways' ? 'neutral' : 'bullish'
  const hmmCard: ModelCard = {
    key: 'regime_hmm',
    name: 'RegimeIQ',
    color: '#FF9900',
    score: regimeConf !== null ? regimeConf * 100 : regime ? 70 : null,
    vote: hmmVote,
    prediction: regime
      ? `Regime at signal: ${regime}${regimeConf !== null ? ` (conf ${Math.round(regimeConf * 100)}%)` : ''}`
      : 'Regime not captured.',
    accuracy30d: accuracy?.regime_hmm ?? null,
  }

  return [tftCard, qlibCard, lgbmCard, hmmCard]
}

function firstFiniteNumber(...vals: any[]): number | null {
  for (const v of vals) {
    if (typeof v === 'number' && Number.isFinite(v)) return v
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return null
}

function pctChange(from: number, to: number): string {
  if (!from) return '—'
  const pct = ((to - from) / from) * 100
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

function VoteGlyph({ vote }: { vote: Vote }): ReactNode {
  if (vote === 'bullish') return <ArrowUpRight className="w-3.5 h-3.5 text-up" />
  if (vote === 'bearish') return <ArrowDownRight className="w-3.5 h-3.5 text-down" />
  return <Minus className="w-3.5 h-3.5 text-d-text-muted" />
}
