/**
 * PR 121 — remember the watchlist user's last-used alert preset across
 * symbols within a tab session.
 *
 * Power users who add 10 symbols all want the same preset (e.g. ±2× ATR).
 * Without memory, they re-pick for every new add. With memory, the
 * AlertEditModal can highlight + auto-apply on first open. Per-session
 * is the right granularity — across browser sessions, defaults reset
 * because volatility regime + user's strategy may have changed.
 *
 * PR 122 — per-symbol override slot. Some users want preset X for index
 * ETFs and preset Y for individual stocks. Per-symbol memory takes
 * precedence on load when set; falls through to global otherwise.
 * Storage layout:
 *   sessionStorage['watchlistAlertPresetId']                 → global
 *   sessionStorage['watchlistAlertPresetId:NIFTYBEES']       → per-symbol
 */

const KEY = 'watchlistAlertPresetId'

export type AlertPresetId =
  | 'pct5'
  | 'pct10'
  | 'pct5_breakout'
  | 'pct5_drop'
  | 'atr1'
  | 'atr2'

function isAlertPresetId(v: string | null): v is AlertPresetId {
  return (
    v === 'pct5' || v === 'pct10' ||
    v === 'pct5_breakout' || v === 'pct5_drop' ||
    v === 'atr1' || v === 'atr2'
  )
}

export function loadAlertPreset(symbol?: string): AlertPresetId | null {
  if (typeof window === 'undefined') return null
  try {
    if (symbol) {
      const sym = symbol.toUpperCase()
      const perSym = window.sessionStorage.getItem(`${KEY}:${sym}`)
      if (isAlertPresetId(perSym)) return perSym
    }
    const v = window.sessionStorage.getItem(KEY)
    return isAlertPresetId(v) ? v : null
  } catch {
    return null
  }
}

export function saveAlertPreset(id: AlertPresetId, opts?: { symbol?: string; perSymbol?: boolean }): void {
  if (typeof window === 'undefined') return
  try {
    if (opts?.perSymbol && opts.symbol) {
      window.sessionStorage.setItem(`${KEY}:${opts.symbol.toUpperCase()}`, id)
      return
    }
    window.sessionStorage.setItem(KEY, id)
  } catch {}
}

export function clearSymbolPreset(symbol: string): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(`${KEY}:${symbol.toUpperCase()}`)
  } catch {}
}

export function hasSymbolPreset(symbol: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return isAlertPresetId(window.sessionStorage.getItem(`${KEY}:${symbol.toUpperCase()}`))
  } catch {
    return false
  }
}

// ============================================================================
// PR 123 — backend sync for per-symbol pins.
//
// sessionStorage solved per-tab persistence; backend sync solves
// cross-device (iPhone watchlist edits show up next time the user opens
// the dashboard on desktop). We sync only per-symbol pins — the global
// "last-used" preset is intentionally session-scoped (volatility regime
// + strategy may change). The backend stores
// ``user_profiles.ui_preferences.watchlist_preset_pins`` as
// ``{ SYM: presetId }``.
//
// Hydration is fire-and-forget on first watchlist mount: pull the
// server pins and replay them into sessionStorage so all per-symbol
// reads stay synchronous (no race with the modal-open code path).
// ============================================================================

let hydrated = false

export async function hydrateSymbolPinsFromServer(): Promise<void> {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const { api } = await import('./api')
    const r = await api.user.getUIPreferences()
    const pins = r?.ui_preferences?.watchlist_preset_pins
    if (!pins || typeof pins !== 'object') return
    for (const [sym, pid] of Object.entries(pins)) {
      if (typeof sym !== 'string' || typeof pid !== 'string') continue
      if (!isAlertPresetId(pid)) continue
      try {
        window.sessionStorage.setItem(`${KEY}:${sym.toUpperCase()}`, pid)
      } catch {}
    }
  } catch {
    // Silent — failure means we run with sessionStorage only (degrades
    // back to PR 122 behavior). User can always re-pin.
    hydrated = false
  }
}

// Debounced backend writer. Fire-and-forget; the in-memory buffer
// collects rapid edits (toggling pin, picking a different preset
// while pinned) and flushes once.
let writeBuf: Record<string, string | null> = {}
let writeTimer: ReturnType<typeof setTimeout> | null = null

async function flushPinWrites() {
  writeTimer = null
  if (Object.keys(writeBuf).length === 0) return
  const pending = writeBuf
  writeBuf = {}
  try {
    const { api } = await import('./api')
    const cur = await api.user.getUIPreferences()
    const pins: Record<string, string> = { ...(cur?.ui_preferences?.watchlist_preset_pins || {}) }
    for (const [sym, pid] of Object.entries(pending)) {
      const SYM = sym.toUpperCase()
      if (pid === null) delete pins[SYM]
      else pins[SYM] = pid
    }
    const next = { ...(cur?.ui_preferences || {}), watchlist_preset_pins: pins }
    await api.user.updateUIPreferences(next)
  } catch {
    // Re-queue on next flush. Best-effort.
  }
}

export function syncSymbolPinToServer(symbol: string, id: AlertPresetId | null): void {
  if (typeof window === 'undefined') return
  writeBuf[symbol.toUpperCase()] = id
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => { void flushPinWrites() }, 800)
}
