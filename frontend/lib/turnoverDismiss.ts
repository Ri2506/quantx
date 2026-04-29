/**
 * PR 124 — per-session dismiss for the "high regime turnover" warning.
 *
 * The warning is useful on first sight but power users who already
 * factor turnover into their sizing find it nag-y. Per-session
 * (sessionStorage) means it returns next browser session — turnover
 * counts may have changed and the user may want a fresh nudge.
 *
 * PR 126 — also persist the "help expanded" state. Once a user clicks
 * the `?` to read what high turnover means, keep it open across nav
 * within the same tab so they don't have to re-click on every reload.
 * Resets next browser session.
 */

const KEY = 'regimeTurnoverDismissed'
const HELP_KEY = 'regimeTurnoverHelpOpen'

export function isTurnoverDismissed(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function dismissTurnover(): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(KEY, '1')
  } catch {}
}

export function isTurnoverHelpOpen(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(HELP_KEY) === '1'
  } catch {
    return false
  }
}

export function setTurnoverHelpOpen(open: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (open) window.sessionStorage.setItem(HELP_KEY, '1')
    else window.sessionStorage.removeItem(HELP_KEY)
  } catch {}
}
