'use client'

/**
 * CopilotPanel — N1 global AI assistant slide-out.
 *
 * Backed by ``/api/ai/copilot/chat``. The panel is always mounted
 * when the user is inside the authenticated platform — a floating
 * trigger button + ``⌘/`` (Ctrl+/ on Windows) toggles it.
 *
 * Conventions:
 *  - Context-aware: current route is sent with every turn so the
 *    agent can ground answers.
 *  - @-mention parsing: tokens like ``@TCS`` in the composer are
 *    extracted and shipped as ``mentioned_symbols``.
 *  - Per-route memory: conversation persists in sessionStorage keyed
 *    by route so switching tabs / refreshing keeps context.
 *  - Credit caps are enforced server-side; 402 returns the upgrade
 *    payload which we render as a CTA.
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Bot,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'


type Role = 'user' | 'assistant'
interface Message {
  role: Role
  content: string
  tools_used?: string[]
  intent?: string
  refused?: boolean
  upgrade?: { tier: string; limit: number } | null
}

const STORAGE_PREFIX = 'swingai.copilot.v1:'
const MAX_TURNS = 20


function storageKey(route: string): string {
  return STORAGE_PREFIX + (route || '/')
}


function loadHistory(route: string): Message[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(storageKey(route))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}


function saveHistory(route: string, messages: Message[]) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(storageKey(route), JSON.stringify(messages.slice(-MAX_TURNS)))
  } catch { /* quota exceeded — silently drop */ }
}


function parseSymbols(text: string): string[] {
  const matches = text.match(/@([A-Z][A-Z0-9\-&]{1,20})/g) || []
  return Array.from(new Set(matches.map((m) => m.slice(1).toUpperCase())))
}


// ---------------------------------------------------------------- panel


interface CopilotPanelProps {
  open: boolean
  onClose: () => void
  // PR 87 — optional starter text dropped into the composer when the
  // panel opens via dispatchCopilotOpen('What does the regime mean?').
  prefill?: string
}


export default function CopilotPanel({ open, onClose, prefill }: CopilotPanelProps) {
  const pathname = usePathname() || '/'
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Hydrate from storage per route.
  useEffect(() => {
    setMessages(loadHistory(pathname))
    setError(null)
  }, [pathname])

  // Focus composer on open.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [open])

  // PR 87 — when opened with a prefill, drop it into the composer once
  // (don't overwrite the user's in-flight text on subsequent re-opens).
  useEffect(() => {
    if (open && prefill && !input) {
      setInput(prefill)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill])

  // Autoscroll to bottom on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, sending])

  // Persist.
  useEffect(() => {
    saveHistory(pathname, messages)
  }, [pathname, messages])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setError(null)

    const userMsg: Message = { role: 'user', content: text }
    const next = [...messages, userMsg]
    setMessages(next)
    setInput('')
    setSending(true)

    try {
      const res = await api.ai.copilotChat({
        message: text,
        route: pathname,
        history: next.slice(-MAX_TURNS).map((m) => ({ role: m.role, content: m.content })),
        mentioned_symbols: parseSymbols(text),
      })
      setMessages((cur) => [
        ...cur,
        {
          role: 'assistant',
          content: res.reply,
          tools_used: res.tools_used || [],
          intent: res.intent,
          refused: res.refused,
        },
      ])
    } catch (err: any) {
      // 402 → upgrade CTA inline.
      if (err?.status === 402 || /credit_cap|tier_gate/.test(String(err?.message))) {
        setMessages((cur) => [
          ...cur,
          {
            role: 'assistant',
            content:
              'You have hit the daily Copilot limit for your tier. Upgrade to keep chatting, or come back tomorrow.',
            upgrade: { tier: 'free', limit: 5 },
          },
        ])
      } else {
        setError(handleApiError(err))
      }
    } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clearHistory = () => {
    setMessages([])
    setError(null)
    sessionStorage.removeItem(storageKey(pathname))
  }

  return (
    <>
      {/* Backdrop — click to close, mobile only */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-40 md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={`fixed top-0 right-0 h-screen w-full md:w-[420px] bg-[#0E1220] border-l border-d-border z-50 shadow-2xl transition-transform duration-300 ease-out flex flex-col ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="AI Copilot panel"
        aria-hidden={!open}
      >
        {/* Header */}
        <header className="px-4 py-3 border-b border-d-border flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-white">AI Copilot</p>
              <p className="text-[10px] text-d-text-muted truncate">
                Context: {pathname}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                className="text-[10px] text-d-text-muted hover:text-white px-1.5 py-0.5 rounded"
                title="Clear conversation"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10"
              aria-label="Close Copilot"
            >
              <X className="w-4 h-4 text-d-text-muted" />
            </button>
          </div>
        </header>

        {/* Message list */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
        >
          {messages.length === 0 && !sending && <EmptyState route={pathname} onPick={(p) => setInput(p)} />}

          {messages.map((m, i) => <Bubble key={i} m={m} />)}

          {sending && (
            <div className="inline-flex items-center gap-2 text-[12px] text-d-text-muted">
              <Loader2 className="w-3 h-3 animate-spin" />
              Thinking…
            </div>
          )}

          {error && (
            <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-[11px] text-down">
              {error}
            </div>
          )}
        </div>

        {/* Composer */}
        <form
          className="border-t border-d-border px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask anything — use @SYMBOL to reference a stock"
              rows={1}
              maxLength={2000}
              className="flex-1 resize-none bg-[#0A0D14] border border-d-border rounded-md px-3 py-2 text-[13px] text-white focus:outline-none focus:border-primary/50 max-h-[120px]"
            />
            <button
              type="submit"
              disabled={!input.trim() || sending}
              className="shrink-0 inline-flex items-center justify-center w-9 h-9 bg-primary text-black rounded-md hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Send"
            >
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[9px] text-d-text-muted mt-1.5">
            ⌘/Ctrl + Enter to send · shift+enter for newline · Copilot knows your current page
          </p>
        </form>
      </aside>
    </>
  )
}


/* ───────────────────────── bubbles + empty state ───────────────────────── */


function Bubble({ m }: { m: Message }) {
  const isUser = m.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
          isUser
            ? 'bg-primary/10 border border-primary/30 text-white'
            : 'bg-[#111520] border border-d-border text-d-text-primary'
        }`}
      >
        <div className={`${isUser ? '' : 'whitespace-pre-wrap'}`}>{m.content}</div>

        {m.tools_used && m.tools_used.length > 0 && (
          <div className="mt-2 pt-2 border-t border-d-border flex flex-wrap gap-1">
            {m.tools_used.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#0A0D14] text-d-text-muted border border-d-border"
              >
                <Zap className="w-2.5 h-2.5 text-primary" />
                {t.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}

        {m.upgrade && (
          <Link
            href="/pricing"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
          >
            Upgrade to keep chatting
            <ChevronRight className="w-3 h-3" />
          </Link>
        )}

        {m.refused && (
          <p className="mt-1 text-[10px] text-[#FEB113]">
            Copilot declined — out of scope for this product.
          </p>
        )}
      </div>
    </div>
  )
}


function EmptyState({ route, onPick }: { route: string; onPick: (prompt: string) => void }) {
  const prompts = suggestionsFor(route)
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-d-border bg-[#111520] px-4 py-3">
        <p className="text-[12px] text-white flex items-center gap-2 font-medium">
          <Bot className="w-3.5 h-3.5 text-primary" />
          How can I help?
        </p>
        <p className="text-[11px] text-d-text-muted mt-1 leading-snug">
          I can explain signals, check regime state, look up stocks, summarise your portfolio,
          and draft trade plans. I know which page you are on.
        </p>
      </div>
      <p className="text-[10px] uppercase tracking-wider text-d-text-muted">Try asking</p>
      <div className="space-y-1.5">
        {prompts.map((p, i) => (
          <button
            key={i}
            onClick={() => onPick(p)}
            className="w-full text-left px-3 py-2 rounded-md border border-d-border bg-[#0A0D14] text-[12px] text-d-text-secondary hover:text-white hover:border-primary/40 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  )
}


function suggestionsFor(route: string): string[] {
  if (route.startsWith('/signals/')) {
    return [
      'Explain this signal in plain English',
      'What does the engine consensus say?',
      'What is the current market regime?',
    ]
  }
  if (route.startsWith('/signals') || route.startsWith('/swingmax-signal')) {
    return [
      'Which signals have the strongest consensus today?',
      'Filter today for bullish regime only',
      'Compare @RELIANCE and @TCS latest signals',
    ]
  }
  if (route.startsWith('/portfolio')) {
    return [
      'How concentrated is my portfolio right now?',
      'What is my largest sector exposure?',
      'Which holdings have a weak engine score?',
    ]
  }
  if (route.startsWith('/stock/')) {
    return [
      'What does the dossier say about this stock?',
      'Are there earnings coming up for this name?',
      'What is the 5-day forecast?',
    ]
  }
  if (route.startsWith('/sector-rotation')) {
    return [
      'Which sector is rotating in the most?',
      'Compare top stocks across Banking vs IT',
      'What does FII flow look like this week?',
    ]
  }
  if (route.startsWith('/paper-trading')) {
    return [
      'How am I doing vs Nifty this month?',
      'Show my best closed paper trades',
      'Suggest my next paper trade from today\u2019s signals',
    ]
  }
  return [
    'What can you do?',
    'Summarise today in Indian markets',
    'What is the current regime?',
  ]
}
