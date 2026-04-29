'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowUp,
  ArrowDown,
  Clock,
  Signal,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { Signal as ApiSignal, SignalsTodayResponse } from '@/lib/api'
import ConfidenceMeter from '@/components/ui/ConfidenceMeter'
import ModelScoreBadge from '@/components/ui/ModelScoreBadge'
import AppLayout from '@/components/shared/AppLayout'

interface DisplaySignal {
  id: string
  symbol: string
  name: string
  direction: 'LONG' | 'SHORT'
  entry_price: number
  target_price: number
  stop_loss: number
  confidence: number
  risk_reward: number
  generated_at: string
  status: string
  catboost_score?: number
}

type FilterTab = 'all' | 'long' | 'short'

function getTimeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function normalizeSignal(s: ApiSignal): DisplaySignal {
  return {
    id: s.id,
    symbol: s.symbol,
    name: s.segment ?? s.symbol,
    direction: s.direction ?? 'LONG',
    entry_price: s.entry_price,
    target_price: s.target ?? s.target_1 ?? s.target_2 ?? 0,
    stop_loss: s.stop_loss,
    confidence: s.confidence,
    risk_reward: s.risk_reward_ratio ?? s.risk_reward ?? 0,
    generated_at: s.created_at ?? s.generated_at ?? s.date ?? new Date().toISOString(),
    status: s.status,
    catboost_score: s.catboost_score,
  }
}

function SkeletonCard() {
  return (
    <div className="glass-card animate-pulse rounded-xl border border-d-border p-4">
      <div className="mb-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-white/5" />
        <div className="flex-1">
          <div className="mb-2 h-4 w-24 rounded bg-white/5" />
          <div className="h-3 w-16 rounded bg-white/5" />
        </div>
        <div className="h-6 w-16 rounded-full bg-white/5" />
      </div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div>
          <div className="mb-1 h-3 w-10 rounded bg-white/5" />
          <div className="h-5 w-20 rounded bg-white/5" />
        </div>
        <div>
          <div className="mb-1 h-3 w-10 rounded bg-white/5" />
          <div className="h-5 w-20 rounded bg-white/5" />
        </div>
        <div>
          <div className="mb-1 h-3 w-10 rounded bg-white/5" />
          <div className="h-5 w-20 rounded bg-white/5" />
        </div>
      </div>
      <div className="h-2 w-full rounded-full bg-white/5" />
    </div>
  )
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<DisplaySignal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')

  useEffect(() => {
    fetchSignals()
  }, [])

  const fetchSignals = async () => {
    setLoading(true)
    try {
      const response: SignalsTodayResponse = await api.signals.getToday()
      const raw = response.all_signals ?? []
      const long = response.long_signals ?? []
      const short = response.short_signals ?? []
      const combined = raw.length > 0 ? raw : [...long, ...short]
      setSignals(combined.map(normalizeSignal))
    } catch (error) {
      console.error('Error fetching signals:', error)
      setSignals([])
    } finally {
      setLoading(false)
    }
  }

  const filteredSignals = signals.filter((s) => {
    if (filter === 'all') return true
    if (filter === 'long') return s.direction === 'LONG'
    if (filter === 'short') return s.direction === 'SHORT'
    return true
  })

  return (
    <AppLayout>
    <div className="relative overflow-hidden px-4 py-6 md:px-6 md:py-8">
      <style>{`
        @keyframes signal-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {/* Ambient glow */}
      <div className="pointer-events-none fixed right-0 top-20 h-[400px] w-[400px] rounded-full bg-primary/[0.02] blur-[120px]" />

      <div className="relative mx-auto max-w-7xl">

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="group mb-4 inline-flex items-center gap-1.5 text-sm text-primary transition-colors hover:text-primary-hover"
          >
            <span className="transition-transform group-hover:-translate-x-0.5">&larr;</span> Dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            AI Trading Signals
          </h1>
          <p className="mt-2 max-w-lg text-d-text-secondary">
            Real-time swing trade signals powered by deep learning models and multi-timeframe analysis.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          {(['all', 'long', 'short'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`rounded-full px-5 py-2 text-sm font-medium transition-all duration-200 ${
                filter === tab
                  ? 'bg-primary text-black shadow-[0_0_16px_-4px_rgba(79,236,205,0.4)]'
                  : 'border border-d-border bg-white/[0.03] text-d-text-muted hover:border-primary/30 hover:text-white'
              }`}
            >
              {tab === 'all' && 'All Signals'}
              {tab === 'long' && 'Long'}
              {tab === 'short' && 'Short'}
            </button>
          ))}
          <span className="ml-auto rounded-full border border-d-border bg-white/[0.03] px-3 py-1 text-xs text-d-text-muted">
            {filteredSignals.length} signal{filteredSignals.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {/* Signal Cards Grid */}
        {!loading && filteredSignals.length > 0 && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredSignals.map((signal, idx) => {
              const isLong = signal.direction === 'LONG'
              return (
                <Link key={signal.id} href={`/signals/${signal.id}`}>
                  <div
                    className="glass-card group flex h-full cursor-pointer flex-col rounded-xl border border-d-border p-4 transition-all duration-200 hover:border-d-border-hover"
                    style={{
                      animation: `signal-fade-in 0.4s ease-out ${idx * 0.06}s both`,
                    }}
                  >

                    {/* Top: Avatar + Name + Direction Badge */}
                    <div className="mb-4 flex items-center gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold ${
                        isLong ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                      }`}>
                        {signal.symbol.charAt(0)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-white transition-colors group-hover:text-primary">{signal.symbol}</div>
                        <div className="truncate text-xs text-d-text-muted">{signal.name}</div>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        isLong ? 'bg-up/10 text-up' : 'bg-down/10 text-down'
                      }`}>
                        {isLong ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {signal.direction}
                      </span>
                    </div>

                    {/* Price Levels */}
                    <div className="mb-4 grid grid-cols-3 gap-3">
                      <div className="rounded-lg bg-white/[0.03] p-2">
                        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Entry</div>
                        <div className="font-mono num-display text-sm font-semibold text-primary">
                          {'\u20B9'}{signal.entry_price.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/[0.03] p-2">
                        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Target</div>
                        <div className="font-mono num-display text-sm font-semibold text-up">
                          {'\u20B9'}{signal.target_price.toFixed(2)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-white/[0.03] p-2">
                        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wider text-d-text-muted">SL</div>
                        <div className="font-mono num-display text-sm font-semibold text-down">
                          {'\u20B9'}{signal.stop_loss.toFixed(2)}
                        </div>
                      </div>
                    </div>

                    {/* Confidence Meter + ML Score */}
                    <div className="mb-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="text-[10px] font-medium uppercase tracking-wider text-d-text-muted">Confidence</span>
                        {signal.catboost_score != null && signal.catboost_score > 0 && (
                          <ModelScoreBadge score={signal.catboost_score} />
                        )}
                      </div>
                      <ConfidenceMeter score={signal.confidence} size="sm" showValue />
                    </div>

                    {/* Footer: R:R + Time */}
                    <div className="mt-auto flex items-center justify-between border-t border-d-border pt-3">
                      <span className="text-xs text-d-text-muted">
                        R:R <span className="font-mono num-display font-medium text-white">{signal.risk_reward.toFixed(2)}:1</span>
                      </span>
                      <span className="flex items-center gap-1 text-xs text-d-text-muted">
                        <Clock className="h-3 w-3" />
                        {getTimeAgo(signal.generated_at)}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {/* Empty State */}
        {!loading && filteredSignals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            {/* Animated radar/scanner SVG */}
            <div className="relative mb-6 flex h-[120px] w-[120px] items-center justify-center">
              <svg viewBox="0 0 120 120" width="120" height="120" className="absolute inset-0 text-white/10">
                {/* Outer ring */}
                <circle cx="60" cy="60" r="54" fill="none" stroke="currentColor" strokeWidth="1.5" />
                {/* Middle ring */}
                <circle cx="60" cy="60" r="38" fill="none" stroke="currentColor" strokeWidth="1" />
                {/* Inner ring */}
                <circle cx="60" cy="60" r="22" fill="none" stroke="currentColor" strokeWidth="0.75" />
                {/* Center dot */}
                <circle cx="60" cy="60" r="3" className="text-primary" fill="currentColor" opacity="0.6" />
                {/* Cross hairs */}
                <line x1="60" y1="2" x2="60" y2="18" stroke="currentColor" strokeWidth="0.75" />
                <line x1="60" y1="102" x2="60" y2="118" stroke="currentColor" strokeWidth="0.75" />
                <line x1="2" y1="60" x2="18" y2="60" stroke="currentColor" strokeWidth="0.75" />
                <line x1="102" y1="60" x2="118" y2="60" stroke="currentColor" strokeWidth="0.75" />
              </svg>
              {/* Rotating sweep line */}
              <div
                className="absolute inset-0"
                style={{
                  animation: 'radar-sweep 3s linear infinite',
                }}
              >
                <svg viewBox="0 0 120 120" width="120" height="120">
                  <defs>
                    <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#00F0FF" stopOpacity="0" />
                      <stop offset="100%" stopColor="#00F0FF" stopOpacity="0.5" />
                    </linearGradient>
                  </defs>
                  {/* Sweep cone */}
                  <path
                    d="M60,60 L60,6 A54,54 0 0,1 105,35 Z"
                    fill="url(#sweepGrad)"
                    opacity="0.15"
                  />
                  {/* Sweep line */}
                  <line x1="60" y1="60" x2="60" y2="6" className="text-primary" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
                </svg>
              </div>
              {/* Ambient glow behind radar */}
              <div className="pointer-events-none absolute inset-0 rounded-full bg-primary/[0.04] blur-xl" />
              <style>{`
                @keyframes radar-sweep {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
            <h3 className="mb-1 text-lg font-semibold text-white">No signals found</h3>
            <p className="max-w-xs text-sm text-d-text-muted">
              {filter !== 'all'
                ? `No ${filter} signals available right now. Try switching to "All Signals".`
                : 'The AI engine hasn\'t generated any signals yet. Check back soon.'}
            </p>
          </div>
        )}
      </div>
    </div>
    </AppLayout>
  )
}
