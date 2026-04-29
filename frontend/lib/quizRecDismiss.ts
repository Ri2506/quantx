/**
 * PR 119 — per-session dismiss for the quiz-recommendation banner.
 *
 * The banner is helpful on first encounter but becomes nag-y once the
 * user has decided not to upgrade. Per-session (sessionStorage) means:
 *   - dismiss persists across nav within the same tab
 *   - reappears on next browser session, so we still re-engage users
 *     who came back later
 *   - keyed by recommended tier so retaking the quiz with a new result
 *     re-presents the banner
 */

const KEY = 'quizRecDismissedTier'

type Tier = 'pro' | 'elite'

export function isQuizRecDismissed(recommended: Tier): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(KEY) === recommended
  } catch {
    return false
  }
}

export function dismissQuizRec(recommended: Tier): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(KEY, recommended)
  } catch {}
}
