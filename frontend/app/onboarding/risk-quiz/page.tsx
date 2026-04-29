'use client'

/**
 * /onboarding/risk-quiz — N5 first-login wizard.
 *
 * 5-question quiz → risk profile (conservative / moderate / aggressive)
 * + recommended tier + signal-filter presets + auto-trader defaults.
 *
 * Quiz definition comes from ``/api/onboarding/quiz`` (public) so the
 * backend stays the source of truth. On submit, the result screen
 * shows the profile, rationale, and a CTA to the recommended tier
 * (upgrade) or to the dashboard (stay).
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Crown,
  Loader2,
  ShieldCheck,
  Sparkles,
  Target,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'


type QuizQuestion = Awaited<ReturnType<typeof api.onboarding.quiz>>['quiz'][number]
type QuizResult = Awaited<ReturnType<typeof api.onboarding.submit>>

const PROFILE_COLOR: Record<string, string> = {
  conservative: '#4FECCD',
  moderate:     '#FEB113',
  aggressive:   '#FF9900',
}

const TIER_COPY: Record<string, { label: string; icon: any; color: string }> = {
  free:  { label: 'Free',  icon: ShieldCheck, color: '#4FECCD' },
  pro:   { label: 'Pro',   icon: Target,      color: '#4FECCD' },
  elite: { label: 'Elite', icon: Crown,       color: '#FFD166' },
}


export default function RiskQuizPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<QuizResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      try {
        const [q, s] = await Promise.all([
          api.onboarding.quiz(),
          api.onboarding.status().catch(() => null),
        ])
        setQuestions(q.quiz || [])
        if (s?.completed) {
          // Already onboarded — bounce to dashboard.
          router.replace('/dashboard')
          return
        }
      } catch (err) {
        setError(handleApiError(err))
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  const current = questions[idx]
  const isFirst = idx === 0
  const isLast = idx === questions.length - 1
  const progress = questions.length
    ? Math.round(((Object.keys(answers).length) / questions.length) * 100)
    : 0
  const canAdvance = current ? Boolean(answers[current.key]) : false
  const allAnswered = useMemo(
    () => questions.every((q) => Boolean(answers[q.key])),
    [questions, answers],
  )

  const pick = (value: string) => {
    if (!current) return
    setAnswers((a) => ({ ...a, [current.key]: value }))
    // Auto-advance unless last — user still gets to confirm on the final
    // question since submit is an explicit click.
    if (!isLast) {
      setTimeout(() => setIdx((i) => Math.min(i + 1, questions.length - 1)), 200)
    }
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const r = await api.onboarding.submit(answers)
      setResult(r)
      // PR 118 — invalidate cache so /pricing + /settings reflect the
      // new recommended_tier without waiting for the 5-min TTL.
      try {
        const { invalidateOnboardingStatus } = await import('@/lib/onboardingStatusCache')
        invalidateOnboardingStatus()
      } catch {}
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const skip = async () => {
    try {
      await api.onboarding.skip()
      try {
        const { invalidateOnboardingStatus } = await import('@/lib/onboardingStatusCache')
        invalidateOnboardingStatus()
      } catch {}
      router.replace('/dashboard')
    } catch (err) {
      setError(handleApiError(err))
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0D14] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    )
  }

  if (result) {
    // PR 55 — hand off to the Telegram connect step instead of jumping
    // straight to the dashboard. Skip from the quiz header still goes
    // to /dashboard directly for users who want to bail out entirely.
    return <ResultScreen result={result} onDone={() => router.replace('/onboarding/telegram')} />
  }

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white">
      <main className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-16">
        {/* Header */}
        <header className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-wider uppercase text-primary">
              <Sparkles className="w-3 h-3" />
              Quick setup · 60 seconds
            </div>
            <button
              onClick={skip}
              className="text-[11px] text-d-text-muted hover:text-white"
            >
              Skip for now
            </button>
          </div>
          <h1 className="text-[28px] md:text-[32px] font-semibold leading-tight">
            Let&rsquo;s tune the AI to your risk appetite.
          </h1>
          <p className="text-[13px] text-d-text-muted mt-2">
            5 quick questions — we&rsquo;ll match you to the right tier, signal filters,
            and safe-trade defaults.
          </p>

          {/* Progress */}
          <div className="mt-5 relative h-1 bg-[#111520] rounded-full overflow-hidden">
            <div
              className="absolute top-0 left-0 h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-d-text-muted mt-1 numeric">
            Question {idx + 1} of {questions.length}
          </p>
        </header>

        {error && (
          <div className="mb-5 rounded-md border border-down/40 bg-down/10 px-3 py-2 text-[12px] text-down">
            {error}
          </div>
        )}

        {/* Active question */}
        {current && (
          <section className="rounded-xl border border-d-border bg-[#111520] p-5 md:p-6">
            <h2 className="text-[15px] md:text-[17px] font-semibold text-white">
              {current.question}
            </h2>
            <div className="mt-4 space-y-2">
              {current.options.map((opt) => {
                const picked = answers[current.key] === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => pick(opt.value)}
                    className={`w-full text-left px-4 py-3 rounded-md border transition-all ${
                      picked
                        ? 'bg-primary/10 border-primary/50 text-white'
                        : 'bg-[#0A0D14] border-d-border text-d-text-secondary hover:border-d-border-hover hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          picked ? 'border-primary bg-primary' : 'border-d-border'
                        }`}
                      >
                        {picked && <Check className="w-3 h-3 text-black" />}
                      </span>
                      <span className="text-[13px]">{opt.label}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* Nav */}
        <footer className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className="inline-flex items-center gap-1.5 text-[12px] text-d-text-muted hover:text-white disabled:opacity-40"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>

          {isLast ? (
            <button
              onClick={submit}
              disabled={!allAnswered || submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-black rounded-md text-[13px] font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {submitting ? 'Matching…' : 'Get my profile'}
            </button>
          ) : (
            <button
              onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}
              disabled={!canAdvance}
              className="inline-flex items-center gap-1.5 text-[12px] text-primary disabled:opacity-40"
            >
              Next
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </footer>

        <p className="text-[10px] text-d-text-muted text-center mt-10">
          You can always change your risk profile in <Link href="/settings" className="text-primary hover:underline">Settings</Link>.
        </p>
      </main>
    </div>
  )
}


/* ───────────────────────── result screen ───────────────────────── */


function ResultScreen({ result, onDone }: { result: QuizResult; onDone: () => void }) {
  const profileColor = PROFILE_COLOR[result.risk_profile] || '#4FECCD'
  const tierCopy = TIER_COPY[result.recommended_tier]
  const TierIcon = tierCopy?.icon || Sparkles

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white">
      <main className="max-w-2xl mx-auto px-4 md:px-6 py-10 md:py-16">
        <div
          className="rounded-2xl border p-6 md:p-8"
          style={{
            borderColor: `${profileColor}55`,
            background: `${profileColor}08`,
            borderLeftWidth: 4,
          }}
        >
          <p className="text-[10px] uppercase tracking-wider text-d-text-muted">
            Your profile
          </p>
          <h1
            className="text-[36px] md:text-[44px] font-semibold capitalize mt-1"
            style={{ color: profileColor }}
          >
            {result.risk_profile}
          </h1>
          <p className="numeric text-[12px] text-d-text-muted mt-1">
            Score {result.score}/15
          </p>

          <p className="text-[13px] text-d-text-secondary leading-relaxed mt-4">
            {result.rationale}
          </p>
        </div>

        {/* Recommended tier card */}
        <section className="mt-4 rounded-xl border border-d-border bg-[#111520] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-d-text-muted">
                Recommended tier
              </p>
              <p
                className="text-[20px] font-semibold mt-1 flex items-center gap-2"
                style={{ color: tierCopy?.color || '#FFFFFF' }}
              >
                <TierIcon className="w-5 h-5" />
                {tierCopy?.label || result.recommended_tier}
              </p>
            </div>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1.5 px-4 py-2 border border-d-border text-[12px] text-white rounded-md hover:bg-white/[0.03]"
            >
              See plans
            </Link>
          </div>
        </section>

        {/* Presets applied */}
        <section className="mt-4 rounded-xl border border-d-border bg-[#111520] p-5">
          <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-3">
            Presets applied
          </p>
          <ul className="space-y-2 text-[12px] text-d-text-secondary">
            <li>
              <span className="text-white">Signal filter:</span>{' '}
              min confidence{' '}
              <span className="numeric text-primary">
                {result.suggested_filters.min_confidence}%
              </span>
              {result.suggested_filters.include_intraday && ' · intraday on'}
              {result.suggested_filters.include_fno && ' · F&O on'}
            </li>
            <li>
              <span className="text-white">Auto-trader defaults:</span>{' '}
              max{' '}
              <span className="numeric text-primary">
                {result.auto_trader_defaults.max_position_pct}%
              </span>{' '}
              per position · daily loss cap{' '}
              <span className="numeric text-primary">
                {result.auto_trader_defaults.daily_loss_limit_pct}%
              </span>
            </li>
            <li>
              <span className="text-white">Concurrent positions:</span>{' '}
              <span className="numeric text-primary">
                up to {result.auto_trader_defaults.max_concurrent_positions}
              </span>
            </li>
          </ul>
          <p className="text-[10px] text-d-text-muted mt-3">
            You can tune any of these from <Link href="/settings" className="text-primary hover:underline">Settings</Link>.
          </p>
        </section>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/settings"
            className="text-[12px] text-d-text-muted hover:text-white"
          >
            Adjust defaults
          </Link>
          <button
            onClick={onDone}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary text-black rounded-md text-[13px] font-semibold hover:bg-primary-hover"
          >
            Continue
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </main>
    </div>
  )
}
