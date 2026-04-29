// ============================================================================
// PR 68 — CopilotQuotaModal (shared)
// ============================================================================
// Lifted out of /assistant/page.tsx so every caller of /api/assistant/chat
// (assistant page, platform-layout floating chat, stock dossier copilot)
// surfaces the same upgrade modal when the backend returns 429
// `credits exhausted`.
//
// Dispatch:
//     window.dispatchEvent(new CustomEvent('copilot:quota_exhausted', {
//       detail: usage,
//     }))
//
// The modal mounts once at the platform-layout level and listens for
// that event. Call sites just need to refetch usage on 429 and dispatch.
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import type { AssistantUsage } from '../types'

const EVENT_NAME = 'copilot:quota_exhausted'

export function dispatchCopilotQuotaExhausted(usage: AssistantUsage) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: usage }))
}

export default function CopilotQuotaModal() {
  const [usage, setUsage] = useState<AssistantUsage | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AssistantUsage>).detail
      if (!detail) return
      setUsage(detail)
      setOpen(true)
    }
    window.addEventListener(EVENT_NAME, handler)
    return () => window.removeEventListener(EVENT_NAME, handler)
  }, [])

  if (!open || !usage) return null

  const tier = (usage.tier || 'free').toLowerCase()
  const resetTime = (() => {
    try {
      const d = new Date(usage.reset_at)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return '00:00 UTC' }
  })()
  const upgradeCopy: Record<string, { title: string; body: string; cta: string; ctaHref: string }> = {
    free: {
      title: "You've used today's Copilot credits",
      body: `Free tier is capped at ${usage.credits_limit} messages per day. Pro unlocks 150 messages/day plus Scanner Lab and unlimited swing signals.`,
      cta: 'Upgrade to Pro — \u20B9999/mo',
      ctaHref: '/pricing',
    },
    pro: {
      title: "You've hit today's Pro Copilot limit",
      body: `Pro is capped at ${usage.credits_limit} messages per day. Elite removes the cap and adds AutoPilot, AI SIP, F&O strategies, and Bull/Bear debate.`,
      cta: 'Upgrade to Elite — \u20B91,999/mo',
      ctaHref: '/pricing',
    },
    elite: {
      title: 'High Copilot usage today',
      body: `You're at ${usage.credits_used} of ${usage.credits_limit} messages. Credits reset at ${resetTime}. If you need higher limits, contact support.`,
      cta: 'View pricing',
      ctaHref: '/pricing',
    },
  }
  const copy = upgradeCopy[tier] ?? upgradeCopy.free
  const close = () => setOpen(false)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md trading-surface space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-[16px] font-semibold text-white">{copy.title}</h2>
            <p className="text-[12px] text-d-text-muted mt-1">{copy.body}</p>
          </div>
        </div>

        <div className="rounded-md border border-d-border bg-d-bg-card p-3">
          <div className="flex items-center justify-between text-[11px] text-d-text-muted">
            <span>Today's usage</span>
            <span className="font-mono num-display text-white">
              {usage.credits_used}/{usage.credits_limit}
            </span>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-white/[0.04] overflow-hidden">
            <div className="h-full bg-down/70" style={{ width: '100%' }} />
          </div>
          <p className="text-[10px] text-d-text-muted mt-2">
            Resets at {resetTime} ({tier.toUpperCase()} tier)
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={close}
            className="flex-1 py-2 text-[13px] text-d-text-secondary border border-d-border rounded-md hover:bg-white/[0.03] transition-colors"
          >
            Maybe later
          </button>
          <Link
            href={copy.ctaHref}
            onClick={() => {
              // PR 100 — credit the quota modal as the source. Only fire
              // when the user is below Elite (Elite users see a generic
              // "view pricing" CTA, not an upgrade trigger).
              if (tier !== 'elite') {
                const target = tier === 'free' ? 'pro' : 'elite'
                import('@/lib/reportUpgradeIntent').then(({ reportUpgradeIntent }) => {
                  void reportUpgradeIntent(target, 'copilot_quota_modal')
                }).catch(() => {})
              }
              close()
            }}
            className="flex-1 py-2 text-[13px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover transition-colors text-center"
          >
            {copy.cta}
          </Link>
        </div>
      </div>
    </div>
  )
}
