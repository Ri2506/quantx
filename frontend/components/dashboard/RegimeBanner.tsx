'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

import { api } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

interface RegimeData {
  regime: 'bull' | 'sideways' | 'bear'
  confidence: number
  days_active: number
}

type RegimeName = 'bull' | 'sideways' | 'bear'

// PR 118 — strip color map matches RegimeBanner palette so the strip
// reads as a continuation of the banner, not a separate element.
const STRIP_COLOR: Record<RegimeName, string> = {
  bull: '#05B878',
  sideways: '#FEB113',
  bear: '#FF5947',
}

const REGIME_CONFIG = {
  bull: {
    icon: TrendingUp,
    label: 'Bull Market',
    message: 'Market analysis indicates Bullish conditions — all strategies active',
    bg: 'bg-up/[0.06]',
    border: 'border-up/20',
    iconColor: 'text-up',
    textColor: 'text-up',
    dotColor: 'bg-up',
  },
  sideways: {
    icon: Minus,
    label: 'Range-Bound',
    message: 'Market analysis indicates Sideways conditions — defensive strategies prioritized',
    bg: 'bg-warning/[0.06]',
    border: 'border-warning/20',
    iconColor: 'text-warning',
    textColor: 'text-warning',
    dotColor: 'bg-warning',
  },
  bear: {
    icon: TrendingDown,
    label: 'Bear Market',
    message: 'Market analysis indicates Bearish conditions — reduced exposure, defensive mode',
    bg: 'bg-down/[0.06]',
    border: 'border-down/20',
    iconColor: 'text-down',
    textColor: 'text-down',
    dotColor: 'bg-down',
  },
}

export function RegimeBanner() {
  const [regime, setRegime] = useState<RegimeData | null>(null)
  // PR 118 — 30-day mini-strip alongside today's regime banner. Authed
  // dashboard users got the same gap as the public navbar before
  // PR 117/3: today's state without transition context. Public endpoint
  // is CDN-cached; one extra fetch on dashboard mount is negligible.
  // PR 119 — per-cell metadata so each cell can show a date+conf
  // tooltip on hover.
  const [history, setHistory] = useState<Array<{ name: RegimeName; date: string; conf: number }>>([])
  // PR 124 — per-session dismiss for the high-turnover warning.
  const [turnoverDismissed, setTurnoverDismissed] = useState(false)
  useEffect(() => {
    let active = true
    import('@/lib/turnoverDismiss').then(({ isTurnoverDismissed }) => {
      if (!active) return
      setTurnoverDismissed(isTurnoverDismissed())
    }).catch(() => {})
    return () => { active = false }
  }, [])

  useEffect(() => {
    fetch(`${API_URL}/api/market/regime`)
      .then((r) => r.json())
      .then((d) => setRegime(d.current || d))
      .catch(() => {/* API unavailable */})
  }, [])

  useEffect(() => {
    let active = true
    api.publicTrust.regimeHistory(30)
      .then((r) => {
        if (!active) return
        const cells = (r.history || [])
          .slice(-30)
          .map((h) => {
            const name = String(h.regime || '').toLowerCase()
            if (name !== 'bull' && name !== 'sideways' && name !== 'bear') return null
            const confKey = `prob_${name}` as 'prob_bull' | 'prob_sideways' | 'prob_bear'
            return {
              name: name as RegimeName,
              date: String(h.detected_at || '').slice(0, 10),
              conf: Number((h as any)[confKey] || 0),
            }
          })
          .filter((x): x is { name: RegimeName; date: string; conf: number } => x !== null)
        setHistory(cells)
      })
      .catch(() => {})
    return () => { active = false }
  }, [])

  if (!regime) return null

  const config = REGIME_CONFIG[regime.regime]
  const Icon = config.icon
  const confidencePct = Math.round(regime.confidence * 100)

  return (
    <div className={`flex flex-col gap-2 rounded-xl border ${config.border} ${config.bg} px-4 py-3`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5">
            <Icon className={`h-4 w-4 ${config.iconColor}`} />
          </div>
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 animate-status-pulse rounded-full ${config.dotColor}`} />
            <span className="text-sm font-medium text-white">{config.message}</span>
          </div>
        </div>
        <div className="ml-11 flex items-center gap-4 text-xs text-d-text-muted sm:ml-0">
          <span>
            Confidence: <span className={`font-mono font-semibold ${config.textColor}`}>{confidencePct}%</span>
          </span>
          <span>
            Active: <span className="font-mono font-semibold text-white">{regime.days_active}d</span>
          </span>
        </div>
      </div>
      {history.length >= 7 && (() => {
        // PR 122 — count regime flips. ≥3 in the visible window
        // surfaces a "high turnover" warning so the user knows the
        // current regime read is fragile and sizing should be lighter.
        // Computed inline; the strip itself doesn't need this signal.
        let transitions = 0
        for (let i = 1; i < history.length; i++) {
          if (history[i].name !== history[i - 1].name) transitions++
        }
        const highTurnover = transitions >= 3
        return (
          <>
            {highTurnover && !turnoverDismissed && (
              <TurnoverWarning
                transitions={transitions}
                windowDays={history.length}
                onDismiss={() => {
                  setTurnoverDismissed(true)
                  import('@/lib/turnoverDismiss').then(({ dismissTurnover }) => {
                    dismissTurnover()
                  }).catch(() => {})
                }}
              />
            )}
        <div className="ml-11 flex items-center gap-2 sm:ml-0">
          <span className="text-[10px] uppercase tracking-wider text-d-text-muted shrink-0">
            Last {history.length}d
          </span>
          <div
            className="flex gap-[1px] items-end h-[14px] flex-1 max-w-[260px] pt-[6px]"
            aria-label={`${history.length}-day regime timeline — hover any cell for date and confidence`}
          >
            {history.map((c, idx) => {
              // PR 120 — regime-change marker (white vertical tick on
              // the leading edge of any cell where regime flipped
              // vs prior session). Same pattern as the public navbar.
              const changed = idx > 0 && history[idx - 1].name !== c.name
              const prev = idx > 0 ? history[idx - 1] : null
              return (
                <span
                  key={idx}
                  className="relative block h-[8px] flex-1 hover:scale-y-[1.6] transition-transform origin-bottom cursor-help"
                  style={{
                    background: STRIP_COLOR[c.name],
                    opacity: 0.4 + (0.6 * (idx + 1)) / history.length,
                    minWidth: '2px',
                  }}
                  title={
                    (changed && prev
                      ? `↳ regime change · ${prev.name[0].toUpperCase()}${prev.name.slice(1)} → ${c.name[0].toUpperCase()}${c.name.slice(1)} · `
                      : '') +
                    `${c.date || '—'} · ${c.name[0].toUpperCase()}${c.name.slice(1)} · ${Math.round(c.conf * 100)}% conf`
                  }
                >
                  {changed && (
                    <>
                      <span
                        className="absolute inset-y-0 left-0 w-[1px]"
                        style={{ background: 'rgba(255,255,255,0.95)' }}
                      />
                      {/* PR 121 — downward chevron above the cell so
                          transitions read top-down without hovering.
                          Color = destination regime so the eye links
                          marker→cell visually. */}
                      <svg
                        aria-hidden
                        viewBox="0 0 6 5"
                        className="absolute -top-[6px] left-[-1px] w-[5px] h-[5px]"
                        style={{ color: STRIP_COLOR[c.name], filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.6))' }}
                      >
                        <polygon points="0,0 6,0 3,5" fill="currentColor" />
                      </svg>
                    </>
                  )}
                </span>
              )
            })}
          </div>
        </div>
          </>
        )
      })()}
    </div>
  )
}

// ============================================================================
// PR 125 — TurnoverWarning subcomponent
// ============================================================================
//
// Adds an inline "?" link that toggles a one-liner explaining what high
// turnover means and what action to take. First-time users saw the
// "size lighter" line without context; this fills the gap without
// adding a separate help page.

function TurnoverWarning({
  transitions,
  windowDays,
  onDismiss,
}: {
  transitions: number
  windowDays: number
  onDismiss: () => void
}) {
  // PR 126 — restore prior help-expanded state from sessionStorage so
  // a user who already read the explanation doesn't have to re-click
  // on every nav within the same tab.
  const [showHelp, setShowHelp] = useState(false)
  useEffect(() => {
    let active = true
    import('@/lib/turnoverDismiss').then(({ isTurnoverHelpOpen }) => {
      if (!active) return
      setShowHelp(isTurnoverHelpOpen())
    }).catch(() => {})
    return () => { active = false }
  }, [])
  return (
    <div className="ml-11 sm:ml-0 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: '#FEB113' }}>
        <span className="inline-block w-1 h-1 rounded-full" style={{ background: '#FEB113' }} />
        <span className="font-medium">High regime turnover</span>
        <span className="text-d-text-muted">
          · {transitions} flips in last {windowDays}d — read with caution, size lighter
        </span>
        <button
          type="button"
          onClick={() => {
            const next = !showHelp
            setShowHelp(next)
            // PR 126 — persist so cross-page nav keeps state.
            import('@/lib/turnoverDismiss').then(({ setTurnoverHelpOpen }) => {
              setTurnoverHelpOpen(next)
            }).catch(() => {})
          }}
          aria-label="What does high turnover mean?"
          aria-expanded={showHelp}
          className="ml-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] font-bold border border-d-border text-d-text-muted hover:text-white hover:border-white/40 transition-colors leading-none"
        >
          ?
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss turnover warning"
          className="ml-0.5 text-d-text-muted hover:text-white text-[12px] leading-none"
        >
          ×
        </button>
      </div>
      {showHelp && (
        <div className="text-[10px] text-d-text-secondary leading-relaxed max-w-xl space-y-1">
          <p>
            Three or more regime flips in 30 days means the market hasn't settled into a clear trend.
            The current regime read may flip again within days. Practical adjustment:
            cut typical position sizes ~30–50% and tighten stops until turnover drops back below 3.
          </p>
          {/* PR 127 — deep-link to the public timeline with the
              transitions highlight on so the user can see the exact
              days the regime flipped, not just the aggregate count. */}
          <a
            href="/regime?highlight=transitions"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            View full timeline →
          </a>
        </div>
      )}
    </div>
  )
}
