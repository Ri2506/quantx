'use client'

/**
 * ErrorBoundary — widget-level catch-all.
 *
 * Next.js App Router gives us route-level `error.tsx` out of the box,
 * but a single broken widget inside a route still kills the entire
 * page tree on the way up. Wrap any risky tile (chart, signal list,
 * portfolio panel) with this class boundary so the blast radius is
 * just that tile.
 *
 * Usage:
 *   <ErrorBoundary label="Equity curve">
 *     <EquityCurve symbol={sym} />
 *   </ErrorBoundary>
 *
 * Passing a custom `fallback` element overrides the default tile.
 *
 * Every catch reports to the backend via `reportError` with
 * boundary='widget' so it's distinguishable from route-level crashes
 * in PostHog.
 */

import * as React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

import { reportError } from '@/lib/reportError'

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Short label used in the default fallback + telemetry grouping. */
  label?: string
  /** Render override. Receives the error + a reset callback. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode
  /** Hook for callers that want to do more than the default report. */
  onError?: (error: Error, info: React.ErrorInfo) => void
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Telemetry — best-effort.
    reportError({ error, boundary: 'widget' })
    this.props.onError?.(error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) {
      return this.props.fallback(error, this.reset)
    }

    return <DefaultWidgetFallback label={this.props.label} onReset={this.reset} />
  }
}


// ----------------------------------------------------------------- fallback

function DefaultWidgetFallback({
  label,
  onReset,
}: {
  label?: string
  onReset: () => void
}) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-d-border bg-[#111520] p-4 flex flex-col items-start gap-2"
    >
      <div className="flex items-center gap-2 text-warning text-[12px] font-medium">
        <AlertTriangle className="w-3.5 h-3.5" />
        {label ? `${label} couldn't load` : "This panel couldn't load"}
      </div>
      <p className="text-[11px] text-d-text-muted">
        We logged the error on our side. Retrying usually works — if it keeps failing,
        refresh the page or switch views.
      </p>
      <button
        onClick={onReset}
        className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-d-text-secondary border border-d-border rounded hover:bg-white/[0.03] hover:text-white transition-colors"
      >
        <RotateCcw className="w-3 h-3" />
        Retry
      </button>
    </div>
  )
}
