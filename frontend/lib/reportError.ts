/**
 * reportError — ship one client crash to the backend telemetry endpoint.
 *
 * Used by every error boundary we render: `app/global-error.tsx`, the
 * per-route `error.tsx` files, and the widget-level `ErrorBoundary`.
 * Best-effort: swallows everything. A telemetry failure must NEVER
 * cascade into another user-visible error.
 *
 * Transport:
 *   * Prefer `navigator.sendBeacon` — fires during unload too, and
 *     won't block the page repaint.
 *   * Fall back to `fetch(..., { keepalive: true })` when the beacon
 *     API isn't available.
 *   * On SSR / no-window: no-op.
 *
 * In dev we also forward to `console.error` so the stack lands in the
 * browser console, which is a faster feedback loop than tailing server
 * logs.
 */

import { supabase } from './supabase'

type Boundary = 'global' | 'route' | 'widget' | 'handler'

export interface ReportErrorInput {
  error: unknown
  /** Which boundary caught it — helps us group in PostHog. */
  boundary?: Boundary
  /** Next.js-provided digest (server-rendered stack hash). */
  digest?: string
  /** Pathname when the error fired. */
  route?: string
}

const ENDPOINT = '/api/client-errors'
const MAX_STACK = 4000
const MAX_MESSAGE = 500

function truncate(s: string | undefined, max: number): string | undefined {
  if (!s) return s
  if (s.length <= max) return s
  return s.slice(0, max) + `…[truncated ${s.length - max} chars]`
}

async function currentUserId(): Promise<string | undefined> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id || undefined
  } catch {
    return undefined
  }
}

export async function reportError(input: ReportErrorInput): Promise<void> {
  if (typeof window === 'undefined') return

  const { error, boundary = 'handler', digest, route } = input
  const err = error instanceof Error ? error : new Error(String(error ?? 'Unknown error'))

  // Dev feedback loop — surface the raw stack immediately.
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(`[${boundary}]`, err)
  }

  const payload = {
    name: err.name || 'Error',
    message: truncate(err.message, MAX_MESSAGE) || '',
    stack: truncate(err.stack, MAX_STACK),
    digest,
    boundary,
    route: route || (typeof window !== 'undefined' ? window.location.pathname : undefined),
    user_id: await currentUserId(),
    app_version: process.env.NEXT_PUBLIC_APP_VERSION,
  }

  const body = JSON.stringify(payload)

  try {
    // sendBeacon is fire-and-forget and runs even during pagehide.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      const ok = navigator.sendBeacon(ENDPOINT, blob)
      if (ok) return
    }
    // Fallback — keepalive lets this outlive the current page.
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    })
  } catch {
    // Telemetry must never throw.
  }
}
