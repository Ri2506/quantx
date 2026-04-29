'use client'

/**
 * /settings/whatsapp — F12 Pro digest opt-in wizard (PR 60).
 *
 * Pro-gated surface. Three states rendered from the single status
 * payload returned by /api/whatsapp/link/status:
 *
 *   1. Not verified       → phone input → POST /link/start → OTP step
 *   2. OTP pending        → 6-digit code input → POST /link/verify
 *   3. Verified           → masked phone + digest toggle + disconnect
 *
 * We always show whether the backend provider is configured. When
 * `provider_configured=false` we surface a warning copy block so Pro
 * users during the pre-launch window understand why they haven't
 * received the OTP SMS yet (Meta/Gupshup approval still pending).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Info,
  Loader2,
  MessageSquare,
  Pencil,
  X as XIcon,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'
import AppLayout from '@/components/shared/AppLayout'

type Status = {
  phone: string | null
  verified: boolean
  digest_enabled: boolean
  provider_configured: boolean
}

type Step = 'phone' | 'otp' | 'verified'

const OTP_LENGTH = 6

export default function WhatsAppOptInPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [step, setStep] = useState<Step>('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [togglingDigest, setTogglingDigest] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.whatsapp.status()
      setStatus(s)
      setStep(s.verified ? 'verified' : 'phone')
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadStatus() }, [loadStatus])

  // OTP countdown.
  useEffect(() => {
    if (!expiresAt) { setSecondsLeft(null); return }
    const exp = new Date(expiresAt).getTime()
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((exp - Date.now()) / 1000)))
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [expiresAt])

  const onStart = async () => {
    setError(null)
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) { setError('Enter a valid phone number with country code.'); return }
    setBusy(true)
    try {
      const res = await api.whatsapp.linkStart(phone.startsWith('+') ? phone : `+${digits}`)
      setExpiresAt(res.expires_at)
      setStep('otp')
      setCode('')
      if (!res.provider_configured) {
        setError('WhatsApp delivery is pending provider activation. Contact support for a manual OTP while we finish setup.')
      } else if (!res.delivered) {
        setError('OTP generated but delivery reported failure — check that the number is correct and retry.')
      }
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onVerify = async () => {
    setError(null)
    if (code.length !== OTP_LENGTH) { setError(`Enter the ${OTP_LENGTH}-digit code.`); return }
    setBusy(true)
    try {
      await api.whatsapp.linkVerify(code)
      await loadStatus()
      setStep('verified')
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onDisconnect = async () => {
    setBusy(true)
    try {
      await api.whatsapp.disconnect()
      await loadStatus()
      setPhone('')
      setCode('')
      setExpiresAt(null)
      setStep('phone')
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const onToggleDigest = async (next: boolean) => {
    setTogglingDigest(true)
    try {
      const s = await api.whatsapp.toggleDigest(next)
      setStatus(s)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setTogglingDigest(false)
    }
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 space-y-5">
        <Link
          href="/settings"
          className="inline-flex items-center gap-1.5 text-[12px] text-d-text-muted hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Settings
        </Link>

        <header>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#05B8781A] flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-up" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold">WhatsApp digest</h1>
              <p className="text-[12px] text-d-text-muted mt-0.5">
                Pre-market brief at 7:30 AM + evening summary, delivered to WhatsApp.
                Pro tier. You can pause anytime.
              </p>
            </div>
          </div>
        </header>

        {loading ? (
          <div className="trading-surface flex items-center justify-center min-h-[100px]">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
          </div>
        ) : (
          <>
            {status && !status.provider_configured && step !== 'verified' && (
              <ProviderPendingNotice />
            )}

            {step === 'phone' && (
              <PhoneStep
                value={phone}
                onChange={setPhone}
                onSubmit={onStart}
                busy={busy}
              />
            )}

            {step === 'otp' && (
              <OtpStep
                value={code}
                onChange={setCode}
                onVerify={onVerify}
                onBack={() => setStep('phone')}
                busy={busy}
                secondsLeft={secondsLeft}
              />
            )}

            {step === 'verified' && status && (
              <VerifiedStep
                status={status}
                toggling={togglingDigest}
                onToggle={onToggleDigest}
                onDisconnect={onDisconnect}
                onEdit={() => { setStep('phone'); setPhone('') }}
              />
            )}

            {error && (
              <div className="rounded-md border border-warning/30 bg-warning/[0.08] p-3 text-[12px] text-warning">
                {error}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}

// --------------------------------------------------------- subcomponents

function ProviderPendingNotice() {
  return (
    <div className="rounded-md border border-d-border bg-[#111520] p-3 flex items-start gap-2 text-[12px]">
      <Info className="w-3.5 h-3.5 text-d-text-muted shrink-0 mt-0.5" />
      <p className="text-d-text-muted">
        WhatsApp delivery is pending Meta Business approval. Your number + preferences
        will persist; once approval lands we enable delivery without another opt-in step.
      </p>
    </div>
  )
}

function PhoneStep({
  value, onChange, onSubmit, busy,
}: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  busy: boolean
}) {
  return (
    <section className="trading-surface space-y-4">
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-d-text-muted mb-2">
          Phone number
        </label>
        <input
          type="tel"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="+91 98765 43210"
          inputMode="tel"
          className="w-full px-3 py-2.5 rounded-md bg-[#0A0D14] border border-d-border text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/60 text-[14px] numeric"
        />
        <p className="text-[11px] text-d-text-muted mt-1.5">
          Include the country code (e.g. +91 for India). We send a 6-digit code to confirm it's yours.
        </p>
      </div>
      <button
        type="button"
        onClick={onSubmit}
        disabled={busy || value.replace(/\D/g, '').length < 10}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-black rounded-md text-[13px] font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
        Send verification code
      </button>
    </section>
  )
}

function OtpStep({
  value, onChange, onVerify, onBack, busy, secondsLeft,
}: {
  value: string
  onChange: (v: string) => void
  onVerify: () => void
  onBack: () => void
  busy: boolean
  secondsLeft: number | null
}) {
  const expired = secondsLeft === 0
  const mm = secondsLeft != null ? Math.floor(secondsLeft / 60) : 0
  const ss = secondsLeft != null ? secondsLeft % 60 : 0
  return (
    <section className="trading-surface space-y-4">
      <div>
        <label className="block text-[11px] uppercase tracking-wider text-d-text-muted mb-2">
          6-digit code
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={OTP_LENGTH}
          className="w-full px-3 py-2.5 rounded-md bg-[#0A0D14] border border-d-border text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/60 text-[18px] numeric tracking-[0.4em] text-center"
        />
        <p className="text-[11px] text-d-text-muted mt-1.5">
          {expired
            ? 'Code expired. Start over to request a new one.'
            : secondsLeft != null
              ? <>Code expires in <span className="numeric text-white">{mm}:{ss.toString().padStart(2, '0')}</span></>
              : 'Waiting for WhatsApp…'}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-d-text-muted hover:text-white"
        >
          ← Change number
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={busy || value.length !== OTP_LENGTH || expired}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-black rounded-md text-[13px] font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
          Verify
        </button>
      </div>
    </section>
  )
}

function VerifiedStep({
  status, toggling, onToggle, onDisconnect, onEdit,
}: {
  status: Status
  toggling: boolean
  onToggle: (next: boolean) => void
  onDisconnect: () => void
  onEdit: () => void
}) {
  return (
    <section className="trading-surface space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-up" />
            <span className="text-[13px] font-medium text-white">Verified</span>
          </div>
          <p className="numeric text-[14px] text-white mt-1">{status.phone || '—'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-d-border text-[11px] text-d-text-muted hover:text-white"
          >
            <Pencil className="w-3 h-3" />
            Change
          </button>
          <button
            type="button"
            onClick={onDisconnect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-down/30 text-[11px] text-down hover:bg-down/10"
          >
            <XIcon className="w-3 h-3" />
            Disconnect
          </button>
        </div>
      </div>

      <div className="border-t border-d-border pt-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={status.digest_enabled}
            onChange={(e) => onToggle(e.target.checked)}
            disabled={toggling}
            className="mt-0.5 h-4 w-4 rounded border-d-border bg-[#0A0D14] text-primary focus:ring-primary/40"
          />
          <div>
            <div className="text-[13px] font-medium text-white">
              Daily digest
              {toggling && <Loader2 className="inline w-3 h-3 ml-1.5 animate-spin text-primary" />}
            </div>
            <p className="text-[11px] text-d-text-muted mt-0.5">
              Pre-market brief at 7:30 AM IST + evening summary at 5:30 PM, personalized
              to your portfolio and risk profile.
            </p>
          </div>
        </label>
      </div>

      {!status.provider_configured && (
        <div className="border-t border-d-border pt-3 flex items-start gap-2 text-[11px] text-d-text-muted">
          <Info className="w-3 h-3 shrink-0 mt-0.5" />
          <span>Delivery is pending Meta Business approval. Your settings are saved and will activate automatically.</span>
        </div>
      )}
    </section>
  )
}
