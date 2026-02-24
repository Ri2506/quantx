'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ExternalLink, Loader2, Send, Sparkles } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError } from '../../lib/api'
import type { AssistantMessage, AssistantSource, AssistantUsage } from '../../types'

const SESSION_KEY = 'swingai_finance_assistant_session_v1'
const MAX_HISTORY = 16

const starterMessage: AssistantMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "I can help with finance, stocks, trading, market structure, and financial news (India + global). Ask me a market question to begin.",
  topic: 'education',
  in_scope: true,
  sources: [],
  created_at: new Date().toISOString(),
}

function toMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sourceKey(source: AssistantSource): string {
  return `${source.url}-${source.title}`
}

export default function AssistantPage() {
  const router = useRouter()
  const { user, signOut, loading: authLoading } = useAuth()
  const [messages, setMessages] = useState<AssistantMessage[]>([starterMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<AssistantUsage | null>(null)

  useEffect(() => {
    if (authLoading) {
      return
    }
    if (!user) {
      router.push('/login')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) {
      return
    }
    try {
      const parsed = JSON.parse(raw) as AssistantMessage[]
      if (Array.isArray(parsed) && parsed.length > 0) {
        setMessages(parsed)
      }
    } catch {
      // Ignore bad session payload.
    }
  }, [])

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages))
  }, [messages])

  useEffect(() => {
    if (!user) {
      return
    }
    let active = true
    api.assistant
      .getUsage()
      .then((data) => {
        if (active) {
          setUsage(data.usage)
        }
      })
      .catch(() => {
        // Keep chat usable even if usage prefetch fails.
      })
    return () => {
      active = false
    }
  }, [user])

  const historyPayload = useMemo<Array<{ role: 'user' | 'assistant'; content: string }>>(
    () =>
      messages
        .slice(-MAX_HISTORY)
        .map((msg) => ({ role: msg.role, content: msg.content })),
    [messages]
  )
  const creditsExhausted = usage ? usage.credits_remaining <= 0 : false

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = input.trim()
    if (!content || loading || creditsExhausted) {
      return
    }

    setError(null)
    setInput('')

    const userMessage: AssistantMessage = {
      id: toMessageId('user'),
      role: 'user',
      content,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMessage])
    setLoading(true)

    try {
      const requestHistory = [
        ...historyPayload,
        { role: 'user' as const, content },
      ].slice(-MAX_HISTORY) as Array<{ role: 'user' | 'assistant'; content: string }>

      const response = await api.assistant.chat({
        message: content,
        history: requestHistory,
      })

      const assistantMessage: AssistantMessage = {
        id: toMessageId('assistant'),
        role: 'assistant',
        content: response.reply,
        topic: response.topic,
        in_scope: response.in_scope,
        sources: response.sources || [],
        created_at: response.generated_at || new Date().toISOString(),
      }
      setMessages((prev) => [...prev, assistantMessage])
      setUsage(response.usage || null)
    } catch (err) {
      const message = handleApiError(err)
      setError(message)
      if (message.toLowerCase().includes('credits exhausted')) {
        try {
          const current = await api.assistant.getUsage()
          setUsage(current.usage)
        } catch {
          // Ignore refresh errors after limit response.
        }
      }
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading assistant...
      </div>
    )
  }

  return (
    <div className="min-h-screen px-4 py-6 md:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-text-muted">SwingAI</p>
            <h1 className="text-2xl font-semibold text-text-primary">SwingAI Finance Intelligence</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Finance-only, source-backed responses for Indian and global markets.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="rounded-lg border border-border/70 px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              Dashboard
            </Link>
            <button
              onClick={() => signOut()}
              className="rounded-lg bg-background-surface px-3 py-2 text-sm text-text-secondary hover:text-text-primary"
            >
              Sign Out
            </button>
          </div>
        </header>

        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            This assistant is restricted to finance and markets. Replies are educational and not personalized
            investment advice.
          </div>
        </div>

        {usage && (
          <div className="mb-4 rounded-xl border border-border/70 bg-background-surface/70 px-4 py-2 text-xs text-text-secondary">
            <span className="font-semibold text-text-primary">{usage.tier.toUpperCase()} credits:</span>{' '}
            {usage.credits_remaining} left today
            <span className="mx-2">·</span>
            {usage.credits_used}/{usage.credits_limit} used
            <span className="mx-2">·</span>
            Resets {new Date(usage.reset_at).toLocaleString()}
          </div>
        )}

        <section className="rounded-2xl border border-border/70 bg-background-surface/60">
          <div className="h-[58vh] overflow-y-auto p-4 md:p-6">
            <div className="space-y-4">
              {messages.map((message) => (
                <div key={message.id} className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                  <div
                    className={`max-w-[88%] rounded-xl px-4 py-3 text-sm ${
                      message.role === 'user'
                        ? 'bg-primary text-white'
                        : message.in_scope === false
                          ? 'border border-red-500/30 bg-red-500/10 text-red-100'
                          : 'border border-border/70 bg-background-primary/70 text-text-primary'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="mb-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-text-muted">
                        <Sparkles className="h-3 w-3" />
                        SwingAI Finance Intelligence
                      </div>
                    )}
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-[11px] uppercase tracking-wide text-text-muted">Sources</p>
                        {message.sources.map((source) => (
                          <a
                            key={sourceKey(source)}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block rounded-lg border border-border/70 bg-background-primary/80 px-3 py-2 text-xs text-text-secondary hover:text-text-primary"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium">{source.title}</p>
                                <p className="mt-0.5 text-[11px] text-text-muted">
                                  {source.source}
                                  {source.published_at ? ` · ${new Date(source.published_at).toLocaleString()}` : ''}
                                </p>
                              </div>
                              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-xl border border-border/70 bg-background-primary/70 px-4 py-3 text-sm text-text-secondary">
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="border-t border-border/70 p-4 md:p-6">
            <label htmlFor="assistant-input" className="mb-2 block text-xs text-text-muted">
              Ask about stocks, trading, markets, risk, or financial news.
            </label>
            <div className="flex items-center gap-2">
              <input
                id="assistant-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={
                  creditsExhausted
                    ? 'Daily credits exhausted. Come back after reset or upgrade plan.'
                    : "Example: Summarize today's top India + global market headlines."
                }
                className="app-input flex-1"
                maxLength={1200}
                disabled={creditsExhausted}
              />
              <button
                type="submit"
                disabled={loading || !input.trim() || creditsExhausted}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                Send
              </button>
            </div>
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          </form>
        </section>
      </div>
    </div>
  )
}
