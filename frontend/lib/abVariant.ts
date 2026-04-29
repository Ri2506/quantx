/**
 * PR 123 — minimal client-side A/B variant assignment.
 *
 * Used to split the quiz-recommendation banner's "What changes for you"
 * bullet copy into feature-led vs outcome-led variants so we can compare
 * conversion rates per variant (instrument arm via the existing
 * UPGRADE_INITIATED `source` slug — see PR 122). Keep it dead-simple:
 *
 *  - 2-arm split (50/50) keyed on user_id when authed, else a stable
 *    anonymous id stored in localStorage (so the same anon visitor sees
 *    the same arm across sessions until they sign up — at which point
 *    the user_id arm assignment takes over).
 *  - Hash function is non-cryptographic (FNV-1a 32-bit). Good enough
 *    for a 50/50 split; we don't need uniformity guarantees.
 *  - Experiment key + variant set caller-supplied so future PRs can
 *    register more experiments without touching this file.
 */

const ANON_KEY = 'ab_anon_id'

function fnv1a32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h >>> 0
}

function ensureAnonId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    let id = window.localStorage.getItem(ANON_KEY)
    if (!id) {
      id = `anon_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`
      window.localStorage.setItem(ANON_KEY, id)
    }
    return id
  } catch {
    return 'no-storage'
  }
}

export function getVariant<T extends string>(
  experiment: string,
  variants: readonly T[],
  userId?: string | null,
): T {
  if (variants.length === 0) throw new Error('variants required')
  const subject = userId || ensureAnonId()
  const bucket = fnv1a32(`${experiment}:${subject}`) % variants.length
  return variants[bucket]
}

// ============================================================================
// PR 124 — exposure event reporter
//
// Fire once per page-view per experiment. Without this, we have no
// denominator for per-arm conversion math. Internally deduped with a
// per-tab Set so a remount doesn't double-fire.
//
// PR 126 — also persist the dedup set in sessionStorage. Without
// persistence, navigating /pricing → /dashboard → /settings re-fires
// the same experiment exposure twice (the in-memory Set lived on the
// previous page's window). sessionStorage means one exposure per tab
// session per (experiment, variant) — the right unit for conversion
// math vs UPGRADE_INITIATED. Cleared automatically when the tab closes.
// ============================================================================

const EXPOSED_KEY = '__ab_exposed_v1'

function getExposedSet(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  const w = window as any
  if (w[EXPOSED_KEY] instanceof Set) return w[EXPOSED_KEY] as Set<string>
  // PR 126 — hydrate from sessionStorage on first access in this page
  // load so a fresh tab navigation reads back any prior exposures.
  const set = new Set<string>()
  try {
    const raw = window.sessionStorage.getItem(EXPOSED_KEY)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) {
        for (const t of arr) if (typeof t === 'string') set.add(t)
      }
    }
  } catch {}
  w[EXPOSED_KEY] = set
  return set
}

function persistExposedSet(set: Set<string>): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(EXPOSED_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

const ENDPOINT = '/api/telemetry/experiment-exposed'

// PR 127 — pass through tier so the analytics warehouse can slice
// per-arm conversion by user tier. Without it, a tier mix difference
// between arms (which can happen even with stable bucketing) is
// indistinguishable from a real conversion-rate delta.
export async function reportExposure(
  experiment: string,
  variant: string,
  context?: { current_tier?: 'free' | 'pro' | 'elite' | null },
): Promise<void> {
  if (typeof window === 'undefined') return
  const tag = `${experiment}::${variant}`
  const seen = getExposedSet()
  if (seen.has(tag)) return
  seen.add(tag)
  // PR 126 — write the dedup tag synchronously before the network call
  // so any concurrent in-flight mounts on other surfaces hit the same
  // sessionStorage state and don't race-fire.
  persistExposedSet(seen)
  const tier = context?.current_tier ?? null
  const body = JSON.stringify(
    tier ? { experiment, variant, current_tier: tier } : { experiment, variant },
  )
  try {
    let auth: string | undefined
    try {
      const { supabase } = await import('./supabase')
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) auth = `Bearer ${session.access_token}`
    } catch {}
    if (!auth && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'application/json' })
      if (navigator.sendBeacon(ENDPOINT, blob)) return
    }
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(auth ? { Authorization: auth } : {}),
      },
      body,
      keepalive: true,
    })
  } catch {
    // Re-allow next attempt if the network failed.
    seen.delete(tag)
    persistExposedSet(seen)
  }
}
