'use client'

import React from 'react'
import StockAvatar from '@/components/ui/StockAvatar'

/** Returns a small inline SVG illustration for the given pattern type. */
function PatternIllustration({ pattern }: { pattern: string }) {
  const key = pattern
    .toLowerCase()
    .replace(/[^a-z_]/g, '')
    .replace(/\s+/g, '_')

  const s = { stroke: 'currentColor', strokeOpacity: 0.5, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  const svgs: Record<string, React.ReactNode> = {
    ascending_triangle: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="8" y1="10" x2="72" y2="10" {...s} />
        <polyline points="8,42 28,30 48,20 68,10" {...s} />
      </svg>
    ),
    asc_triangle: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="8" y1="10" x2="72" y2="10" {...s} />
        <polyline points="8,42 28,30 48,20 68,10" {...s} />
      </svg>
    ),
    symmetrical_triangle: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="8" y1="6" x2="72" y2="22" {...s} />
        <line x1="8" y1="42" x2="72" y2="26" {...s} />
      </svg>
    ),
    sym_triangle: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="8" y1="6" x2="72" y2="22" {...s} />
        <line x1="8" y1="42" x2="72" y2="26" {...s} />
      </svg>
    ),
    falling_wedge: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="8" y1="8" x2="72" y2="26" {...s} />
        <line x1="8" y1="12" x2="72" y2="38" {...s} />
      </svg>
    ),
    cup_and_handle: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <path d="M8,10 Q8,42 40,42 Q72,42 72,10" {...s} />
        <path d="M72,10 Q72,18 76,14" {...s} />
      </svg>
    ),
    cup_handle: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <path d="M8,10 Q8,42 40,42 Q72,42 72,10" {...s} />
        <path d="M72,10 Q72,18 76,14" {...s} />
      </svg>
    ),
    double_bottom: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <polyline points="8,10 22,40 40,16 58,40 72,10" {...s} />
      </svg>
    ),
    triple_bottom: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <polyline points="4,10 16,40 28,14 40,40 52,14 64,40 76,10" {...s} />
      </svg>
    ),
    inverse_head_shoulders: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <polyline points="4,10 16,30 28,12 40,42 52,12 64,30 76,10" {...s} />
      </svg>
    ),
    inv_hs: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <polyline points="4,10 16,30 28,12 40,42 52,12 64,30 76,10" {...s} />
      </svg>
    ),
    bull_flag: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="12" y1="42" x2="12" y2="8" {...s} />
        <line x1="12" y1="8" x2="42" y2="16" {...s} />
        <line x1="12" y1="14" x2="42" y2="22" {...s} />
        <polyline points="42,16 58,6 72,4" {...s} strokeDasharray="3 2" />
      </svg>
    ),
    bull_pennant: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="12" y1="42" x2="12" y2="8" {...s} />
        <line x1="12" y1="8" x2="48" y2="18" {...s} />
        <line x1="12" y1="20" x2="48" y2="18" {...s} />
        <polyline points="48,18 62,10 72,6" {...s} strokeDasharray="3 2" />
      </svg>
    ),
    horizontal_channel: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="8" y1="12" x2="72" y2="12" {...s} />
        <line x1="8" y1="36" x2="72" y2="36" {...s} />
        <polyline points="12,34 24,14 36,34 48,14 60,34 68,14" {...s} strokeOpacity={0.25} strokeWidth={1.2} />
      </svg>
    ),
    h_channel: (
      <svg width="80" height="48" viewBox="0 0 80 48">
        <line x1="8" y1="12" x2="72" y2="12" {...s} />
        <line x1="8" y1="36" x2="72" y2="36" {...s} />
        <polyline points="12,34 24,14 36,34 48,14 60,34 68,14" {...s} strokeOpacity={0.25} strokeWidth={1.2} />
      </svg>
    ),
  }

  return svgs[key] ? <div className="shrink-0 text-primary opacity-70">{svgs[key]}</div> : null
}

interface PatternCardProps {
  symbol: string
  exchange?: string
  patternName: string
  trend: 'bullish' | 'bearish'
  targetPrice: number
  currentPrice: number
  stopLoss?: number
  confidence?: number
  signalConfidence?: 'high' | 'low'
  mlScore?: number | null
  riskReward?: number
  detectedAt?: string
  onClick?: () => void
  className?: string
}

export default function PatternCard({
  symbol,
  exchange = 'NSE',
  patternName,
  trend,
  targetPrice,
  currentPrice,
  stopLoss,
  confidence,
  signalConfidence = 'high',
  mlScore,
  riskReward,
  detectedAt,
  onClick,
  className = '',
}: PatternCardProps) {
  const changePercent = ((targetPrice - currentPrice) / currentPrice) * 100
  const isBullish = trend === 'bullish'

  return (
    <div
      onClick={onClick}
      className={`data-card overflow-hidden
        ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {/* Chart thumbnail area */}
      <div className="h-[140px] relative bg-gradient-to-br from-d-bg-sidebar to-d-bg-card flex items-center justify-center">
        <PatternIllustration pattern={patternName} />

        {/* Pattern badge overlay */}
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span className="ai-badge">
            {patternName}
          </span>
          {signalConfidence === 'low' && (
            <span className="bg-warning/15 text-warning text-[9px] font-medium px-1.5 py-0.5 rounded-full">
              Low Conf
            </span>
          )}
        </div>

        {/* AI Verified badge */}
        {mlScore != null && mlScore >= 0 && (
          <div className="absolute top-3 right-3">
            {mlScore >= 0.5 ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-up/20 text-up border border-up/30 shadow-[0_0_8px_rgba(34,197,94,0.2)]">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                AI Verified {Math.round(mlScore * 100)}%
              </span>
            ) : (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                mlScore >= 0.35 ? 'bg-warning/15 text-warning'
                  : 'bg-down/15 text-down'
              }`}>
                AI {Math.round(mlScore * 100)}%
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {/* Symbol row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <StockAvatar symbol={symbol} size="sm" />
            <div>
              <span className="text-white font-semibold text-sm">{symbol}</span>
              <span className="text-d-text-muted text-xs ml-1.5">{exchange}</span>
            </div>
          </div>
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded ${
              isBullish ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
            }`}
          >
            {isBullish ? 'Bullish' : 'Bearish'}
          </span>
        </div>

        {/* Price info */}
        <div className={`grid ${stopLoss && stopLoss > 0 ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
          <div>
            <p className="stat-label">Current</p>
            <p className="text-white font-mono font-medium text-sm tabular-nums">{currentPrice.toFixed(2)}</p>
          </div>
          <div>
            <p className="stat-label">Target</p>
            <p className={`font-mono font-medium text-sm tabular-nums ${isBullish ? 'text-up' : 'text-down'}`}>
              {targetPrice.toFixed(2)}
              <span className="text-xs ml-1">({changePercent > 0 ? '+' : ''}{changePercent.toFixed(1)}%)</span>
            </p>
          </div>
          {stopLoss != null && stopLoss > 0 && (
            <div>
              <p className="stat-label">Stop</p>
              <p className="font-mono font-medium text-sm tabular-nums text-down">{stopLoss.toFixed(2)}</p>
            </div>
          )}
        </div>

        {/* Risk-reward badge */}
        {riskReward != null && riskReward > 0 && (
          <div className="flex items-center gap-2">
            <span className="stat-label">R:R</span>
            <span className={`text-xs font-semibold font-mono tabular-nums ${riskReward >= 2 ? 'text-up' : riskReward >= 1 ? 'text-warning' : 'text-down'}`}>
              1:{riskReward.toFixed(1)}
            </span>
          </div>
        )}

        {/* Confidence bar */}
        {confidence != null && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="stat-label">Confidence</span>
              <span className="text-xs text-white font-mono tabular-nums">{confidence}%</span>
            </div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isBullish ? 'bg-up' : 'bg-down'}`}
                style={{ width: `${confidence}%` }}
              />
            </div>
          </div>
        )}

        {/* Detected time */}
        {detectedAt && (
          <p className="text-[10px] text-d-text-muted">Detected {detectedAt}</p>
        )}
      </div>
    </div>
  )
}
