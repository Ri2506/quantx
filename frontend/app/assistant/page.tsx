'use client'

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowUp,
  BarChart3,
  ExternalLink,
  Loader2,
  Menu,
  MessageSquare,
  Plus,
  Sparkles,
  Target,
  Activity,
  TrendingUp,
  X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import dynamic from 'next/dynamic'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError } from '../../lib/api'
import BeamButton from '@/components/ui/BeamButton'
import type { AssistantMessage, AssistantSource, AssistantUsage } from '../../types'
import AppLayout from '@/components/shared/AppLayout'
import { dispatchCopilotQuotaExhausted } from '@/components/CopilotQuotaModal'

const LottieIcon = dynamic(() => import('@/components/ui/LottieIcon'), { ssr: false })

import aiPulseData from '@/lib/lottie/ai-pulse.json'

const SESSION_KEY = 'quantx_finance_assistant_session_v1'
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

const QUICK_CHIPS = [
  { icon: '📊', color: '#21c1f2', label: 'Technical Analysis', prompt: 'Give me a technical analysis overview of NIFTY 50 with key levels' },
  { icon: '📈', color: '#57E38A', label: 'Price Prediction', prompt: 'What is the short-term price outlook for RELIANCE based on technicals?' },
  { icon: '🤔', color: '#7383ff', label: 'Should I Buy', prompt: 'Should I buy TCS at current levels? Analyze the setup.' },
  { icon: '⚡', color: '#9973FF', label: 'Market Update', prompt: "What's happening in Indian markets today? Key movers and sectors." },
]

const SIDEBAR_LINKS = [
  { icon: BarChart3, label: 'QuantScan Screener', href: '/screener' },
  { icon: Target, label: 'SwingMax Signals', href: '/swingmax-signal' },
  { icon: Activity, label: 'Pattern Detection', href: '/pattern-detection' },
  { icon: TrendingUp, label: 'Paper Trading', href: '/paper-trading' },
]

function toMessageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function sourceKey(source: AssistantSource): string {
  return `${source.url}-${source.title}`
}

export default function AssistantPage() {
  const { user, loading: authLoading } = useAuth()
  const [messages, setMessages] = useState<AssistantMessage[]>([starterMessage])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [usage, setUsage] = useState<AssistantUsage | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Session restore
  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as AssistantMessage[]
      if (Array.isArray(parsed) && parsed.length > 0) setMessages(parsed)
    } catch {}
  }, [])

  // Session persist
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages))
  }, [messages])

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Usage fetch
  useEffect(() => {
    if (!user) return
    let active = true
    api.assistant.getUsage().then((data) => { if (active) setUsage(data.usage) }).catch(() => {})
    return () => { active = false }
  }, [user])

  const historyPayload = useMemo<Array<{ role: 'user' | 'assistant'; content: string }>>(
    () => messages.slice(-MAX_HISTORY).map((msg) => ({ role: msg.role, content: msg.content })),
    [messages]
  )
  const creditsExhausted = usage ? usage.credits_remaining <= 0 : false

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault()
    const content = input.trim()
    if (!content || loading || creditsExhausted) return
    sendMessage(content)
  }

  const sendMessage = async (content: string) => {
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
      ].slice(-MAX_HISTORY)

      const response = await api.assistant.chat({
        message: content,
        history: requestHistory,
        // PR 86 — the dedicated /assistant page has no live symbol,
        // but route + page label still help the model understand
        // when the user is on the open Copilot surface vs. embedded.
        page_context: {
          route: '/assistant',
          page_label: 'AI Assistant',
        },
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
          dispatchCopilotQuotaExhausted(current.usage)
        } catch {}
      }
    } finally {
      setLoading(false)
    }
  }

  const handleNewChat = () => {
    setMessages([starterMessage])
    setError(null)
    setInput('')
    sessionStorage.removeItem(SESSION_KEY)
    setSidebarOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  if (authLoading) {
    return (
      <AppLayout>
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
        <span className="text-d-text-muted">Loading assistant...</span>
      </div>
      </AppLayout>
    )
  }

  const showIdleState = messages.length <= 1 && !loading

  return (
    <AppLayout>
    <div className="flex h-screen overflow-hidden">
      {/* ==================== LEFT SIDEBAR (desktop) ==================== */}
      <aside className="w-[260px] shrink-0 hidden md:flex flex-col border-r border-d-border">
        {/* New Chat */}
        <div className="p-4">
          <BeamButton variant="secondary" fullWidth onClick={handleNewChat}>
            <Plus className="w-4 h-4" />
            New Chat
          </BeamButton>
        </div>

        {/* Nav Links */}
        <nav className="px-2 space-y-0.5">
          {SIDEBAR_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-d-text-muted hover:bg-white/[0.02] hover:text-white transition-colors"
            >
              <link.icon className="w-4 h-4" />
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Divider */}
        <div className="mx-4 my-3 h-px bg-d-border" />

        {/* Chat history hint */}
        {messages.length > 1 && (
          <div className="px-4">
            <p className="text-[10px] text-d-text-muted uppercase tracking-wider mb-2">Current Session</p>
            <p className="text-xs text-white/50 truncate">
              {messages.find(m => m.role === 'user')?.content || 'New conversation'}
            </p>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Credits + Upgrade */}
        <div className="p-4 space-y-3">
          {usage && (
            <div className="text-center text-xs text-d-text-muted">
              <span className="font-semibold font-mono num-display text-white">{usage.credits_remaining}</span> / <span className="font-mono num-display">{usage.credits_limit}</span> credits
            </div>
          )}
          <BeamButton variant="primary" size="sm" fullWidth href="/pricing">
            Upgrade Plan
          </BeamButton>
        </div>
      </aside>

      {/* ==================== MOBILE SIDEBAR OVERLAY ==================== */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              className="fixed left-0 top-0 bottom-0 w-[260px] z-50 flex flex-col bg-d-bg border-r border-d-border md:hidden"
            >
              <div className="p-4 flex items-center justify-between">
                <BeamButton variant="secondary" onClick={handleNewChat} className="flex-1">
                  <Plus className="w-4 h-4" />
                  New Chat
                </BeamButton>
                <button onClick={() => setSidebarOpen(false)} className="ml-2 p-2 text-d-text-muted hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="px-2 space-y-0.5">
                {SIDEBAR_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm text-d-text-muted hover:bg-white/[0.02] hover:text-white transition-colors"
                  >
                    <link.icon className="w-4 h-4" />
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="flex-1" />
              <div className="p-4">
                <BeamButton variant="primary" size="sm" fullWidth href="/pricing">
                  Upgrade Plan
                </BeamButton>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ==================== MAIN CHAT AREA ==================== */}
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Ambient background effect — subtle radial glow */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none z-0"
          style={{
            background:
              'radial-gradient(circle at 50% 40%, rgba(79, 236, 205, 0.12) 0%, transparent 60%)',
          }}
        />
        {/* Top bar (mobile) */}
        <div className="relative z-10 flex md:hidden items-center justify-between px-4 py-3 border-b border-d-border">
          <button onClick={() => setSidebarOpen(true)} className="p-1.5 text-d-text-muted hover:text-white">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-white">Finance AI</span>
          </div>
          {usage && (
            <span className="text-[10px] font-mono num-display text-d-text-muted">{usage.credits_remaining} credits</span>
          )}
        </div>

        {/* Messages area */}
        <div className="relative z-10 flex-1 overflow-y-auto">
          {showIdleState ? (
            /* ==================== IDLE STATE ==================== */
            <div className="h-full flex flex-col items-center justify-center px-4">
              {/* AI Pulse Lottie avatar */}
              <div className="relative w-20 h-20 flex items-center justify-center mb-6">
                <LottieIcon
                  data={aiPulseData}
                  size={80}
                  loop
                  autoplay
                />
                <div className="absolute inset-0 rounded-full bg-primary/[0.06] blur-xl" />
              </div>

              <h2 className="text-xl md:text-2xl font-bold text-white mb-2 text-center">
                What can I help you with today?
              </h2>
              <p className="text-sm text-d-text-muted mb-8 text-center max-w-md">
                Ask anything about Indian markets, stocks, trading strategies, or financial news.
              </p>

              {/* Quick chips */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-lg">
                {QUICK_CHIPS.map((chip) => (
                  <button
                    key={chip.label}
                    onClick={() => sendMessage(chip.prompt)}
                    className="flex items-center gap-3 px-4 py-3 glass-card text-left text-sm text-white/80 hover:bg-white/[0.02] hover:text-white hover:border-primary/20 transition-all"
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: chip.color }}
                    />
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Disclaimer */}
              <div className="mt-8 flex items-start gap-2 max-w-lg rounded-lg bg-warning/5 border border-warning/20 p-3 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Finance-only AI. Replies are educational, not personalized investment advice.</span>
              </div>
            </div>
          ) : (
            /* ==================== CHAT MESSAGES ==================== */
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
                >
                  {message.role === 'assistant' && (
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center mr-3 mt-1 shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      message.role === 'user'
                        ? 'bg-white/[0.05] text-white rounded-br-sm'
                        : message.in_scope === false
                          ? 'text-down/80'
                          : 'text-white/90'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>

                    {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                      <details className="mt-3">
                        <summary className="text-[11px] uppercase tracking-wide text-d-text-muted cursor-pointer hover:text-white transition-colors">
                          View {message.sources.length} sources
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          {message.sources.map((source) => (
                            <a
                              key={sourceKey(source)}
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block rounded-lg bg-d-bg-card border border-d-border hover:border-primary/30 px-3 py-2 text-xs text-d-text-muted hover:text-white transition-all"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <p className="font-medium text-white/80">{source.title}</p>
                                  <p className="mt-0.5 text-[11px] text-d-text-muted">
                                    {source.source}
                                    {source.published_at ? ` · ${new Date(source.published_at).toLocaleString()}` : ''}
                                  </p>
                                </div>
                                <ExternalLink className="h-3 w-3 shrink-0 text-d-text-muted" />
                              </div>
                            </a>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center mr-3 mt-1 shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-d-text-muted">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    Thinking...
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ==================== INPUT BAR ==================== */}
        <div className="relative z-10 px-4 pb-4 pt-2">
          <div className="max-w-3xl mx-auto">
            <form onSubmit={handleSubmit}>
              <div className="relative glass-card !rounded-2xl focus-within:border-primary/40 transition-colors">
                <div className="absolute left-4 top-4 text-primary/50">
                  <Sparkles className="w-4 h-4" />
                </div>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    creditsExhausted
                      ? 'Daily credits exhausted. Upgrade plan or wait for reset.'
                      : 'Ask about stocks, trading, markets...'
                  }
                  className="w-full pl-11 pr-14 py-4 bg-transparent text-white placeholder:text-white/30 resize-none outline-none text-sm min-h-[52px] max-h-[120px]"
                  rows={1}
                  maxLength={1200}
                  disabled={creditsExhausted}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim() || creditsExhausted}
                  className="absolute right-3 bottom-3 w-8 h-8 bg-primary rounded-full flex items-center justify-center text-black hover:bg-primary-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </form>

            {error && <p className="mt-2 text-sm text-down">{error}</p>}

            <p className="mt-2 text-center text-[10px] text-d-text-muted">
              AI responses are educational only, not financial advice.
              {usage && (
                <> · <span className="font-mono num-display">{usage.credits_used}/{usage.credits_limit}</span> credits used</>
              )}
            </p>
          </div>
        </div>
      </main>
    </div>
    </AppLayout>
  )
}
