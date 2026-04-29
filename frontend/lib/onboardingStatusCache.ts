/**
 * PR 118 — onboarding/status cache.
 *
 * The quiz recommendation is now read from at least 3 mount-time fetches
 * (/pricing PR 115, /settings PR 117, onboarding result page). Each one
 * was hitting `/api/onboarding/status` independently. The endpoint
 * itself is cheap, but we re-fetch on every navigation between these
 * surfaces — wasteful and slightly slower than it needs to be.
 *
 * Cache for 5 minutes per session. On tier change (PR 100 reportUpgradeIntent
 * fires, or any successful razorpay payment), call `invalidateOnboardingStatus()`
 * so the next read sees fresh `current_tier`.
 *
 * No localStorage — sessionless cache is fine here. The recommended_tier
 * doesn't change often (only when the user retakes the quiz), and we
 * already have an explicit invalidate hook for tier changes.
 */

import { api } from './api'

type Status = {
  completed: boolean
  current_tier: 'free' | 'pro' | 'elite'
  current_risk_profile: 'conservative' | 'moderate' | 'aggressive' | null
  recommended_tier: 'free' | 'pro' | 'elite' | null
}

const TTL_MS = 5 * 60 * 1000
let cached: { value: Status; expires: number } | null = null
let inflight: Promise<Status | null> | null = null

export function invalidateOnboardingStatus() {
  cached = null
  inflight = null
}

export async function getOnboardingStatus(): Promise<Status | null> {
  const now = Date.now()
  if (cached && cached.expires > now) return cached.value
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const s = await api.onboarding.status()
      cached = { value: s, expires: Date.now() + TTL_MS }
      return s
    } catch {
      return null
    } finally {
      inflight = null
    }
  })()
  return inflight
}
