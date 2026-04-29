'use client'

/**
 * /onboarding/telegram — PR 55 activation step after the risk quiz.
 *
 * Flow:
 *   1. Mount → POST /api/telegram/link/start → {deep_link, expires_at}
 *   2. Render "Open Telegram" CTA + small countdown + "Skip for now".
 *   3. Poll GET /api/telegram/link/status every 2s.
 *   4. When {connected: true} → show success → "Go to dashboard".
 *
 * The page is intentionally skippable — Telegram digest is Free-tier,
 * not gated — so we never block a user from reaching the app.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  RefreshCcw,
  Send,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'

type LinkSession = {
  token: string
  bot_username: string | null
  deep_link: string | null
  expires_at: string
}

const POLL_INTERVAL_MS = 2000

export default function OnboardingTelegramPage() {
  const router = useRouter()
  const [session, setSession] = useState<LinkSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [connected, setConnected] = useState(false)
  const [copied, setCopied] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  // PR 113 — surface WhatsApp digest as a Pro+ unlock alongside Telegram.
  // Free users only see Telegram (matches locked tier matrix).
  const [tier, setTier] = useState<'free' | 'pro' | 'elite'>('free')
  const pollRef = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    api.user.getTier()
      .then((t) => { if (active) setTier(t.tier) })
      .catch(() => {})
    return () => { active = false }
  }, [])

  const mint = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await api.telegram.linkStart()
      setSession(res)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Mint on mount.
  useEffect(() => {
    // If already connected, skip straight through.
    api.telegram.linkStatus()
      .then((s) => {
        if (s.connected) {
          setConnected(true)
          setLoading(false)
        } else {
          mint()
        }
      })
      .catch(() => mint())
  }, [mint])

  // Poll status once we have a pending session.
  useEffect(() => {
    if (!session || connected) return
    const tick = async () => {
      try {
        const s = await api.telegram.linkStatus()
        if (s.connected) {
          setConnected(true)
          if (pollRef.current) {
            window.clearInterval(pollRef.current)
            pollRef.current = null
          }
        }
      } catch {
        // swallow — keep polling
      }
    }
    pollRef.current = window.setInterval(tick, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [session, connected])

  // Expiry countdown.
  useEffect(() => {
    if (!session) { setSecondsLeft(null); return }
    const expiresAt = new Date(session.expires_at).getTime()
    const tick = () => {
      const s = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000))
      setSecondsLeft(s)
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [session])

  const expired = secondsLeft === 0

  const onCopyToken = async () => {
    if (!session) return
    try {
      await navigator.clipboard.writeText(`/start ${session.token}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const onSkip = () => router.push('/dashboard')
  const onContinue = () => router.push('/dashboard')

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white">
      <header className="border-b border-d-border">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-[14px] font-semibold">
            Swing <span className="text-primary">AI</span>
          </Link>
          <div className="text-[11px] text-d-text-muted uppercase tracking-wider">
            Onboarding · Step 2 of 2
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-6 py-10">
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 rounded-full bg-[#4FECCD1A] flex items-center justify-center mb-4">
            <Send className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-[24px] font-semibold">
            {connected ? 'Telegram connected' : 'Get your first brief on Telegram'}
          </h1>
          <p className="text-[13px] text-d-text-muted mt-2 max-w-md mx-auto">
            {connected
              ? "You're all set — the daily digest and any alerts you enable will land in your chat."
              : 'Free on every plan. We send one pre-market brief, plus any signal / alert you opt in to. You can pause or disconnect anytime.'}
          </p>
        </div>

        {connected ? (
          <ConnectedCard onContinue={onContinue} />
        ) : loading ? (
          <div className="rounded-xl border border-d-border bg-[#111520] p-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : error ? (
          <ErrorCard error={error} onRetry={mint} onSkip={onSkip} />
        ) : session ? (
          <PendingCard
            session={session}
            secondsLeft={secondsLeft}
            expired={expired}
            copied={copied}
            onCopyToken={onCopyToken}
            onRotate={mint}
            onSkip={onSkip}
          />
        ) : null}

        {/* PR 113 — Pro+ users also get WhatsApp digest. Don't gate
            the Telegram step behind it; surface as a parallel option. */}
        {(tier === 'pro' || tier === 'elite') && (
          <WhatsAppCallout tier={tier} />
        )}
      </main>
    </div>
  )
}


function WhatsAppCallout({ tier }: { tier: 'pro' | 'elite' }) {
  return (
    <section className="mt-5 rounded-xl border border-[#05B87833] bg-[#05B8780A] p-5 flex items-start gap-4">
      <div className="shrink-0 w-10 h-10 rounded-full bg-[#05B8781A] border border-[#05B87833] flex items-center justify-center">
        <MessageCircle className="w-5 h-5 text-up" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium text-white flex items-center gap-2">
          WhatsApp daily digest
          <span
            className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-1.5 py-0.5 border"
            style={
              tier === 'elite'
                ? { color: '#FFD166', borderColor: '#FFD16655', background: '#FFD16614' }
                : { color: '#4FECCD', borderColor: '#4FECCD55', background: '#4FECCD14' }
            }
          >
            {tier}
          </span>
        </p>
        <p className="text-[12px] text-d-text-muted mt-1 leading-relaxed">
          Pre-market brief + evening summary on WhatsApp. Verify your number once and the
          template-approved sender handles delivery.
        </p>
      </div>
      <Link
        href="/settings/whatsapp"
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-[#05B87833] text-[11px] font-medium text-up hover:bg-up/10 transition-colors"
      >
        Set up
        <ArrowRight className="w-3 h-3" />
      </Link>
    </section>
  )
}

// ------------------------------------------------------------- subcomponents

function ConnectedCard({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="rounded-xl border border-[#05B87833] bg-[#05B8780D] p-6 text-center">
      <div className="mx-auto w-10 h-10 rounded-full bg-up/20 flex items-center justify-center mb-3">
        <Check className="w-5 h-5 text-up" />
      </div>
      <p className="text-[13px] text-d-text-secondary">
        Your first daily brief arrives at <span className="text-white font-medium">7:30 AM IST</span>. Alerts fire in
        real time once you enable them.
      </p>
      <button
        onClick={onContinue}
        className="mt-5 inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-black rounded-md text-[13px] font-semibold hover:bg-primary-hover"
      >
        Go to dashboard
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </section>
  )
}

function PendingCard({
  session,
  secondsLeft,
  expired,
  copied,
  onCopyToken,
  onRotate,
  onSkip,
}: {
  session: LinkSession
  secondsLeft: number | null
  expired: boolean
  copied: boolean
  onCopyToken: () => void
  onRotate: () => void
  onSkip: () => void
}) {
  const hasDeepLink = !!session.deep_link
  const mm = secondsLeft != null ? Math.floor(secondsLeft / 60) : 0
  const ss = secondsLeft != null ? secondsLeft % 60 : 0

  return (
    <section className="rounded-xl border border-d-border bg-[#111520] p-6 md:p-7 space-y-5">
      <div className="flex items-start gap-4">
        <StepNum n={1} />
        <div className="flex-1">
          <p className="text-[13px] text-white font-medium">Open the Swing AI bot on Telegram</p>
          <p className="text-[12px] text-d-text-muted mt-1">
            We pre-fill the connection code — you just tap <span className="text-white">Start</span>.
          </p>
          {hasDeepLink ? (
            <a
              href={session.deep_link || '#'}
              target="_blank"
              rel="noreferrer"
              className={`mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-md text-[13px] font-semibold ${
                expired
                  ? 'bg-white/[0.06] text-d-text-muted cursor-not-allowed'
                  : 'bg-primary text-black hover:bg-primary-hover'
              }`}
              aria-disabled={expired}
              onClick={(e) => { if (expired) e.preventDefault() }}
            >
              <Send className="w-3.5 h-3.5" />
              Open Telegram
            </a>
          ) : (
            <div className="mt-3 text-[12px] text-down">
              Bot username not configured. Contact support.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-start gap-4 pt-4 border-t border-d-border">
        <StepNum n={2} />
        <div className="flex-1">
          <p className="text-[13px] text-white font-medium">Or paste this into the bot manually</p>
          <p className="text-[12px] text-d-text-muted mt-1">
            Use if the button can't open Telegram (desktop web, restricted network).
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="flex-1 bg-[#0A0D14] border border-d-border rounded px-3 py-2 numeric text-[12px] text-white overflow-x-auto">
              /start {session.token}
            </code>
            <button
              onClick={onCopyToken}
              className="inline-flex items-center gap-1.5 px-3 py-2 border border-d-border rounded text-[11px] text-d-text-muted hover:text-white hover:bg-white/[0.03]"
            >
              {copied ? <Check className="w-3 h-3 text-up" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-d-border">
        <div className="text-[11px] text-d-text-muted flex items-center gap-3">
          {expired ? (
            <>
              <span className="text-warning">Code expired.</span>
              <button
                onClick={onRotate}
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                <RefreshCcw className="w-3 h-3" />
                Get new code
              </button>
            </>
          ) : secondsLeft != null ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin text-primary" />
              Waiting for Telegram — code expires in{' '}
              <span className="numeric text-white">{mm}:{ss.toString().padStart(2, '0')}</span>
            </>
          ) : (
            <>Waiting for Telegram…</>
          )}
        </div>
        <button
          onClick={onSkip}
          className="text-[12px] text-d-text-muted hover:text-white"
        >
          Skip for now →
        </button>
      </div>
    </section>
  )
}

function ErrorCard({
  error, onRetry, onSkip,
}: { error: string; onRetry: () => void; onSkip: () => void }) {
  const misconfigured = /not_configured|503/i.test(error)
  return (
    <section className="rounded-xl border border-[#FEB11333] bg-[#FEB11308] p-6 text-center space-y-3">
      <p className="text-[13px] text-warning">
        {misconfigured
          ? 'Telegram connect is not configured on this environment yet.'
          : `Couldn't start the connection: ${error}`}
      </p>
      <div className="flex items-center justify-center gap-3">
        {!misconfigured && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 px-4 py-2 border border-d-border rounded-md text-[12px] text-white hover:bg-white/[0.03]"
          >
            <RefreshCcw className="w-3 h-3" />
            Try again
          </button>
        )}
        <button
          onClick={onSkip}
          className="px-4 py-2 text-[12px] text-d-text-muted hover:text-white"
        >
          Continue to dashboard →
        </button>
      </div>
    </section>
  )
}

function StepNum({ n }: { n: number }) {
  return (
    <div className="shrink-0 w-7 h-7 rounded-full border border-d-border bg-[#0A0D14] flex items-center justify-center numeric text-[12px] text-d-text-muted">
      {n}
    </div>
  )
}
