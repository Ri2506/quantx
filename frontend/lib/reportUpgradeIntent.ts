/**
 * reportUpgradeIntent — PR 100
 *
 * Fires `UPGRADE_INITIATED` from any user-facing upgrade CTA so the
 * conversion-funnel report shows which surface drove the click. Backend
 * allowlists target_tier + source — see telemetry_routes.upgrade_intent.
 *
 * Best-effort, fire-and-forget. A telemetry call must never throw or
 * delay the actual upgrade flow (Razorpay checkout, navigation to
 * /pricing, etc.).
 */

import { supabase } from './supabase'

const ENDPOINT = '/api/telemetry/upgrade-intent'

export type UpgradeTarget = 'pro' | 'elite'

// Keep in sync with the backend allowlist (telemetry_routes._UPGRADE_SOURCES).
export type UpgradeSource =
  | 'pricing_page'
  | 'settings_tier_panel'
  | 'copilot_quota_modal'
  | 'tier_gate_block'
  | 'signal_lock'
  | 'feature_lock'
  // PR 122 — quiz-recommendation banner slugs so we can decompose the
  // funnel: did the personalized copy (PR 120) drive the click, or
  // the "What changes" delta expand (PR 121), or the highlighted
  // recommended-tier card?
  | 'quiz_rec_banner_pricing'
  | 'quiz_rec_banner_settings'
  | 'quiz_rec_card_highlight'
  | 'quiz_rec_what_changes'

export async function reportUpgradeIntent(
  target_tier: UpgradeTarget,
  source: UpgradeSource,
  experiment_variant?: string,
): Promise<void> {
  if (typeof window === 'undefined') return

  // PR 118 — invalidate the onboarding-status cache. The user's tier
  // is about to change (or at least they're on the upgrade path), so
  // the next /pricing or /settings mount should hit the API fresh
  // rather than reading a stale `current_tier` and showing the wrong
  // recommendation banner.
  try {
    const { invalidateOnboardingStatus } = await import('./onboardingStatusCache')
    invalidateOnboardingStatus()
  } catch {}

  const body = JSON.stringify(
    experiment_variant
      ? { target_tier, source, experiment_variant }
      : { target_tier, source },
  )

  // Forward the auth token when available — the backend reads `sub` to
  // attach the event to the right user. Anonymous /pricing visitors
  // still produce an event (just without user_id).
  let auth: string | undefined
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) auth = `Bearer ${session.access_token}`
  } catch {}

  try {
    if (!auth && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      // Beacon when no auth — no header support but anonymous events
      // are still useful and beacon is the cheapest transport.
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
    // Telemetry must never throw.
  }
}
