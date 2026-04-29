'use client'

/**
 * ModelAccuracyCard — public /models page card (Step 4 §5.1).
 *
 * One card per model. Shows:
 *   - model identity color stripe
 *   - human name + version tag
 *   - win-rate bar (7d / 30d / 90d in the callers' window)
 *   - 30-bar sparkline of historical win-rate
 *   - signal count + last-retrained stamp
 *   - PROD / SHADOW badge
 */

interface Props {
  modelName: string
  windowDays: number
  winRate: number | null
  signalCount: number
  avgPnlPct: number | null
  sharpeRatio: number | null
  computedAt: string
  sparkline: number[]
  status?: 'prod' | 'shadow'
}

// Public-facing engine identities. Greek names only — real model
// architectures (TFT / Qlib / LightGBM / HMM / LSTM / etc.) stay
// internal per ``project_greek_branding_2026_04_19`` memory.
const IDENTITY: Record<string, { label: string; color: string; description: string }> = {
  tft_swing: {
    label: 'SwingLens',
    color: '#4FECCD',
    description: 'Swing forecast engine — 5-day quantile outlook with p10/p50/p90 bands.',
  },
  qlib_alpha158: {
    label: 'AlphaRank',
    color: '#5DCBD8',
    description: 'Cross-sectional alpha ranker — nightly sieve across NSE.',
  },
  lgbm_signal_gate: {
    label: 'TickPulse',
    color: '#FEB113',
    description: '3-class directional gate — shadow-mode audit signal.',
  },
  regime_hmm: {
    label: 'RegimeIQ',
    color: '#FF9900',
    description: 'Market regime detector — bull / sideways / bear with daily updates.',
  },
  strategy: {
    label: 'Strategy confluence',
    color: '#4FECCD',
    description: 'Rule-based strategy vote (breakouts, pullbacks, reversals, structure, volume).',
  },
  breakout_meta_labeler: {
    label: 'PatternScope',
    color: '#00E5CC',
    description: 'Pattern quality scorer — Scanner Lab tag.',
  },
  lstm_intraday: {
    label: 'TickPulse (intraday)',
    color: '#FEB113',
    description: 'Intraday forecast engine — 5-minute tick dynamics.',
  },
  chronos_bolt: {
    label: 'HorizonCast',
    color: '#8D5CFF',
    description: 'Long-horizon trajectory forecaster — zero-shot daily close.',
  },
  timesfm: {
    label: 'HorizonCast+',
    color: '#5DCBD8',
    description: 'Long-horizon foundation forecaster — up to 15-day horizon.',
  },
  finbert_india: {
    label: 'ToneScan',
    color: '#05B878',
    description: 'News sentiment engine — NSE-tuned for financial text.',
  },
}

export default function ModelAccuracyCard(props: Props) {
  const id = IDENTITY[props.modelName] || {
    label: props.modelName,
    color: '#8E8E8E',
    description: '',
  }
  const pct = props.winRate !== null ? Math.max(0, Math.min(1, props.winRate)) : null
  const sparkMax = Math.max(0.01, ...props.sparkline.map((x) => x || 0))
  const sparkMin = Math.min(0, ...props.sparkline.map((x) => x || 0))

  return (
    <div
      className="trading-surface flex flex-col gap-3 min-h-[200px]"
      style={{ borderLeft: `3px solid ${id.color}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: id.color }}
          />
          <span className="text-[13px] font-medium text-white truncate">
            {id.label}
          </span>
        </div>
        {props.status && (
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider ${
              props.status === 'prod'
                ? 'bg-up/10 border border-up/30 text-up'
                : 'bg-warning/10 border border-warning/30 text-warning'
            }`}
          >
            {props.status}
          </span>
        )}
      </div>

      {/* Win rate big number */}
      <div>
        <div className="flex items-baseline gap-1.5">
          {pct === null ? (
            <span className="numeric text-[24px] text-d-text-muted">—</span>
          ) : (
            <>
              <span className="numeric text-[28px] font-semibold text-white">
                {(pct * 100).toFixed(1)}
              </span>
              <span className="text-[11px] text-d-text-muted">% WR</span>
            </>
          )}
        </div>
        <p className="text-[10px] text-d-text-muted uppercase tracking-wider mt-0.5">
          {props.windowDays}-day rolling
        </p>
      </div>

      {/* Sparkline */}
      <Sparkline values={props.sparkline} color={id.color} min={sparkMin} max={sparkMax} />

      {/* Description + stats */}
      <p className="text-[11px] text-d-text-secondary leading-snug line-clamp-3">
        {id.description}
      </p>

      <div className="mt-auto pt-2 border-t border-d-border flex items-center justify-between text-[10px] text-d-text-muted">
        <span>
          Signals <span className="numeric text-white">{props.signalCount}</span>
        </span>
        {props.sharpeRatio !== null && (
          <span>
            Sharpe{' '}
            <span className="numeric text-white">{props.sharpeRatio.toFixed(2)}</span>
          </span>
        )}
        {props.avgPnlPct !== null && (
          <span>
            Avg{' '}
            <span
              className={`numeric ${props.avgPnlPct >= 0 ? 'text-up' : 'text-down'}`}
            >
              {props.avgPnlPct >= 0 ? '+' : ''}
              {props.avgPnlPct.toFixed(2)}%
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- sparkline

function Sparkline({
  values,
  color,
  min,
  max,
}: {
  values: number[]
  color: string
  min: number
  max: number
}) {
  if (!values.length) {
    return <div className="h-[32px] bg-d-bg-elevated rounded" />
  }
  const w = 100
  const h = 32
  const range = max - min || 1
  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * w
      const y = h - ((v - min) / range) * h
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[32px]" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
