'use client'

/**
 * CopilotProvider — single mount point for the global AI Copilot panel.
 *
 * Wires:
 *   - Floating trigger button (bottom-right) that opens the panel.
 *   - Keyboard shortcut ``⌘/`` (Mac) / ``Ctrl+/`` (Windows) to toggle.
 *   - Escape to close when focused.
 *
 * Drop this once inside the authenticated platform layout — children
 * are rendered alongside without any wrapper div, so pages keep their
 * existing layout.
 */

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Bot } from 'lucide-react'

const CopilotPanel = dynamic(() => import('./CopilotPanel'), { ssr: false })

// PR 87 — global event so any surface (dashboard CTA tile, contextual
// "Ask Copilot" buttons inside signal cards, error states, etc.) can
// pop the panel without prop drilling. Mirrors the pattern used by
// CopilotQuotaModal in PR 68.
const OPEN_EVENT = 'copilot:open'

export function dispatchCopilotOpen(prefill?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { prefill } }))
}


export default function CopilotProvider({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<string | undefined>(undefined)

  const toggle = useCallback(() => setOpen((v) => !v), [])
  const close = useCallback(() => setOpen(false), [])

  // PR 87 — listen for global open requests.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prefill?: string }>).detail
      setPrefill(detail?.prefill)
      setOpen(true)
    }
    window.addEventListener(OPEN_EVENT, handler)
    return () => window.removeEventListener(OPEN_EVENT, handler)
  }, [])

  // ── Global keyboard shortcut ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Avoid hijacking shortcuts while typing into inputs (except when
      // the panel itself is already open — then let the user close it).
      const target = e.target as HTMLElement | null
      const inField =
        !!target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      const isToggleCombo = (e.metaKey || e.ctrlKey) && e.key === '/'
      if (isToggleCombo) {
        e.preventDefault()
        toggle()
        return
      }
      if (e.key === 'Escape' && open && !inField) {
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, toggle, close])

  return (
    <>
      {children}

      {/* Floating trigger */}
      <button
        onClick={toggle}
        aria-label={open ? 'Close AI Copilot' : 'Open AI Copilot'}
        aria-pressed={open}
        className={`fixed bottom-5 right-5 z-40 w-12 h-12 rounded-full flex items-center justify-center shadow-[0_12px_32px_rgba(79,236,205,0.35)] transition-all ${
          open
            ? 'bg-[#111520] border border-d-border text-d-text-muted opacity-0 pointer-events-none'
            : 'bg-primary text-black hover:scale-105'
        }`}
      >
        <Bot className="w-5 h-5" />
        <span
          aria-hidden
          className="absolute -top-1 -right-1 text-[8px] font-semibold bg-[#0A0D14] text-primary border border-primary/40 rounded px-1 py-0.5 tracking-wider"
        >
          ⌘/
        </span>
      </button>

      <CopilotPanel open={open} onClose={close} prefill={prefill} />
    </>
  )
}
