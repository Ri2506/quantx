'use client'

import { useState, useEffect } from 'react'
import { Sparkles, TrendingUp, Target, BarChart3 } from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

interface AIPerformanceData {
  win_rate_filtered: number
  win_rate_unfiltered: number
  signals_scored_today: number
  regime: 'bull' | 'sideways' | 'bear'
  regime_confidence: number
}

const REGIME_LABELS: Record<string, { label: string; color: string }> = {
  bull: { label: 'Bull', color: 'text-up' },
  sideways: { label: 'Sideways', color: 'text-warning' },
  bear: { label: 'Bear', color: 'text-down' },
}

export function AIPerformanceWidget() {
  const [data, setData] = useState<AIPerformanceData | null>(null)

  useEffect(() => {
    Promise.allSettled([
      fetch(`${API_URL}/api/ai/performance`).then((r) => r.json()),
      fetch(`${API_URL}/api/market/regime`).then((r) => r.json()),
    ])
      .then(([perfRes, regimeRes]) => {
        const perf = perfRes.status === 'fulfilled' ? perfRes.value : null
        const regime = regimeRes.status === 'fulfilled' ? (regimeRes.value.current || regimeRes.value) : null

        if (!perf && !regime) return // Both failed — widget stays hidden

        setData({
          win_rate_filtered: perf?.win_rate_filtered ?? 0,
          win_rate_unfiltered: perf?.win_rate_unfiltered ?? 0,
          signals_scored_today: perf?.signals_scored_today ?? 0,
          regime: regime?.regime ?? 'sideways',
          regime_confidence: regime?.confidence ?? 0,
        })
      })
      .catch(() => {
        // Both APIs failed — widget stays hidden (data remains null)
      })
  }, [])

  if (!data) {
    return (
      <div className="glass-card rounded-xl border border-d-border p-5 animate-pulse">
        <div className="h-4 w-32 rounded bg-white/5 mb-4" />
        <div className="space-y-3">
          <div className="h-8 rounded bg-white/5" />
          <div className="h-8 rounded bg-white/5" />
          <div className="h-8 rounded bg-white/5" />
        </div>
      </div>
    )
  }

  const regimeInfo = REGIME_LABELS[data.regime] || REGIME_LABELS.bull
  const improvement = data.win_rate_filtered - data.win_rate_unfiltered

  return (
    <div className="relative glass-card rounded-xl border border-d-border p-5">
      {/* Ambient teal glow */}
      <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-primary/[0.03] blur-[60px]" />

      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-white">AI Performance (30d)</h2>
      </div>

      <div className="space-y-4">
        {/* Win Rate Comparison */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">
              Filtered Win Rate
            </span>
            <span className="font-mono text-sm font-bold text-up">{data.win_rate_filtered}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-up transition-all duration-500"
              style={{ width: `${data.win_rate_filtered}%` }}
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">
              Unfiltered Win Rate
            </span>
            <span className="font-mono text-sm font-medium text-d-text-muted">{data.win_rate_unfiltered}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-white/20 transition-all duration-500"
              style={{ width: `${data.win_rate_unfiltered}%` }}
            />
          </div>
        </div>

        {improvement > 0 && (
          <div className="flex items-center gap-1.5 rounded-lg border border-up/10 bg-up/5 px-3 py-1.5">
            <TrendingUp className="h-3 w-3 text-up" />
            <span className="text-[11px] font-medium text-up">
              +{improvement}% improvement with AI filtering
            </span>
          </div>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 border-t border-d-border pt-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <Target className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Scored Today</p>
              <p className="font-mono text-sm font-bold text-white">{data.signals_scored_today}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Market</p>
              <p className={`font-mono text-sm font-bold ${regimeInfo.color}`}>
                {regimeInfo.label} ({Math.round(data.regime_confidence * 100)}%)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
