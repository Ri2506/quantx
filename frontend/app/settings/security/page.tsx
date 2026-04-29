'use client'

/**
 * /settings/security — 2FA + session management (PR 62).
 *
 * Three blocks:
 *   1. Authenticator-app enrollment — enroll → QR + secret → verify →
 *      stored as a verified TOTP factor on the Supabase user.
 *   2. Existing factors list — show each verified factor + a Remove
 *      button that calls unenroll.
 *   3. Session management — "Sign out of other devices" (scope: others)
 *      and "Sign out everywhere" (scope: global).
 *
 * All MFA calls are client-side via ``supabase.auth.mfa.*`` — no
 * backend route needed. Supabase stores the factor in its own tables
 * and surfaces it via the SDK's listFactors endpoint.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Copy,
  Loader2,
  Monitor,
  ShieldCheck,
  Smartphone,
  X as XIcon,
} from 'lucide-react'

import { supabase } from '@/lib/supabase'
import AppLayout from '@/components/shared/AppLayout'

type Factor = {
  id: string
  friendly_name?: string | null
  factor_type: string
  status: 'unverified' | 'verified'
  created_at: string
}

type EnrollData = {
  id: string
  qr_code?: string  // SVG/PNG data URI per Supabase docs
  uri?: string      // otpauth:// URI for manual entry
  secret?: string   // base32 secret
}

const CODE_LENGTH = 6

export default function SecuritySettingsPage() {
  const [factors, setFactors] = useState<Factor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [enrolling, setEnrolling] = useState<EnrollData | null>(null)
  const [enrollCode, setEnrollCode] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState<null | 'others' | 'global'>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const { data, error: err } = await supabase.auth.mfa.listFactors()
      if (err) throw err
      setFactors((data?.totp || []) as Factor[])
    } catch (err: any) {
      setError(err?.message || 'Failed to load factors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const startEnroll = async () => {
    setBusy(true)
    setError(null)
    try {
      const { data, error: err } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Authenticator (${new Date().toISOString().slice(0, 10)})`,
      })
      if (err) throw err
      const e: EnrollData = {
        id: data.id,
        qr_code: (data as any).totp?.qr_code,
        uri: (data as any).totp?.uri,
        secret: (data as any).totp?.secret,
      }
      setEnrolling(e)
      // Immediately open a challenge so we can verify below.
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: data.id,
      })
      if (chErr) throw chErr
      setChallengeId(ch.id)
    } catch (err: any) {
      setError(err?.message || 'Failed to start enrollment')
    } finally {
      setBusy(false)
    }
  }

  const verifyEnroll = async () => {
    if (!enrolling || !challengeId) return
    if (enrollCode.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from your authenticator.`)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const { error: err } = await supabase.auth.mfa.verify({
        factorId: enrolling.id,
        challengeId,
        code: enrollCode,
      })
      if (err) throw err
      setEnrolling(null)
      setChallengeId(null)
      setEnrollCode('')
      await load()
    } catch (err: any) {
      setError(err?.message || 'Code incorrect — try again.')
    } finally {
      setBusy(false)
    }
  }

  const cancelEnroll = async () => {
    if (!enrolling) return
    setBusy(true)
    try {
      // Best-effort cleanup so we don't leave unverified factors lying around.
      await supabase.auth.mfa.unenroll({ factorId: enrolling.id })
    } catch {}
    setEnrolling(null)
    setChallengeId(null)
    setEnrollCode('')
    setBusy(false)
  }

  const removeFactor = async (factorId: string) => {
    if (!confirm('Remove this authenticator? You will sign in with password only until you add a new one.')) return
    setBusy(true)
    try {
      const { error: err } = await supabase.auth.mfa.unenroll({ factorId })
      if (err) throw err
      await load()
    } catch (err: any) {
      setError(err?.message || 'Failed to remove factor')
    } finally {
      setBusy(false)
    }
  }

  const copySecret = async () => {
    if (!enrolling?.secret) return
    try {
      await navigator.clipboard.writeText(enrolling.secret)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const signOutScope = async (scope: 'others' | 'global') => {
    if (scope === 'global' && !confirm('Sign out of every device including this one?')) return
    setSignOutBusy(scope)
    try {
      await supabase.auth.signOut({ scope })
      if (scope === 'global') {
        window.location.href = '/login'
        return
      }
    } catch (err: any) {
      setError(err?.message || 'Sign-out failed')
    } finally {
      setSignOutBusy(null)
    }
  }

  const verified = factors.filter((f) => f.status === 'verified')

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
            <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-[22px] font-semibold">Security</h1>
              <p className="text-[12px] text-d-text-muted mt-0.5">
                Add a second factor so a stolen password isn't enough to get in.
              </p>
            </div>
          </div>
        </header>

        {/* ── Two-factor authentication ── */}
        <section className="trading-surface space-y-4">
          <div>
            <h2 className="text-[14px] font-semibold">Two-factor authentication</h2>
            <p className="text-[12px] text-d-text-muted mt-1">
              Use an authenticator app (Google Authenticator, Authy, 1Password, Raycast) to
              generate a 6-digit code on every sign-in.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center py-2">
              <Loader2 className="w-4 h-4 text-primary animate-spin" />
            </div>
          ) : enrolling ? (
            <EnrollCard
              data={enrolling}
              code={enrollCode}
              onCode={setEnrollCode}
              onVerify={verifyEnroll}
              onCancel={cancelEnroll}
              onCopySecret={copySecret}
              copied={copied}
              busy={busy}
            />
          ) : verified.length === 0 ? (
            <div>
              <button
                type="button"
                onClick={startEnroll}
                disabled={busy}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-md text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-40"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Add authenticator app
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {verified.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-d-border bg-[#0A0D14] px-3 py-2.5"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Check className="w-4 h-4 text-up shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[12px] text-white font-medium truncate">
                        {f.friendly_name || 'Authenticator app'}
                      </div>
                      <div className="text-[10px] text-d-text-muted numeric">
                        Added {new Date(f.created_at).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                        })}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFactor(f.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-down/30 text-[11px] text-down hover:bg-down/10 disabled:opacity-40"
                  >
                    <XIcon className="w-3 h-3" />
                    Remove
                  </button>
                </div>
              ))}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={startEnroll}
                  disabled={busy}
                  className="text-[11px] text-primary hover:underline"
                >
                  Add another authenticator
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── Sessions ── */}
        <section className="trading-surface space-y-4">
          <div>
            <h2 className="text-[14px] font-semibold">Active sessions</h2>
            <p className="text-[12px] text-d-text-muted mt-1">
              You're signed in on this device right now. If you've used Swing AI
              on a shared or lost device, sign it out below.
            </p>
          </div>

          <div className="rounded-md border border-d-border bg-[#0A0D14] px-3 py-2.5 flex items-center gap-3">
            <Monitor className="w-4 h-4 text-d-text-muted" />
            <div className="text-[12px] text-white">This device</div>
            <div className="ml-auto text-[10px] text-up uppercase tracking-wider">Current</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => signOutScope('others')}
              disabled={signOutBusy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-d-border text-[11px] text-white hover:bg-white/[0.03] disabled:opacity-40"
            >
              {signOutBusy === 'others' && <Loader2 className="w-3 h-3 animate-spin" />}
              Sign out of other devices
            </button>
            <button
              type="button"
              onClick={() => signOutScope('global')}
              disabled={signOutBusy !== null}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-down/30 text-[11px] text-down hover:bg-down/10 disabled:opacity-40"
            >
              {signOutBusy === 'global' && <Loader2 className="w-3 h-3 animate-spin" />}
              Sign out everywhere
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-down/30 bg-down/[0.08] p-3 text-[12px] text-down">
            {error}
          </div>
        )}
      </div>
    </AppLayout>
  )
}


// --------------------------------------------------------- subcomponents

function EnrollCard({
  data, code, onCode, onVerify, onCancel, onCopySecret, copied, busy,
}: {
  data: EnrollData
  code: string
  onCode: (v: string) => void
  onVerify: () => void
  onCancel: () => void
  onCopySecret: () => void
  copied: boolean
  busy: boolean
}) {
  // PR 94 — auto-verify when the code reaches 6 digits. Common TOTP UX
  // expectation; saves a click. Guard with a ref so we only fire once
  // per 6-digit input and re-arm when the user edits.
  const autoFiredRef = useRef(false)
  useEffect(() => {
    if (code.length === CODE_LENGTH && !busy && !autoFiredRef.current) {
      autoFiredRef.current = true
      onVerify()
    } else if (code.length < CODE_LENGTH) {
      autoFiredRef.current = false
    }
  }, [code, busy, onVerify])

  return (
    <div className="space-y-4 rounded-md border border-primary/20 bg-primary/[0.04] p-4">
      <div className="flex items-start gap-4 flex-col sm:flex-row">
        {data.qr_code && (
          <div className="shrink-0 self-center sm:self-start bg-white p-2 rounded-md">
            {/* Supabase returns qr_code as either an <svg> string or a
                data: URI. Both render safely inside a direct src. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.qr_code.startsWith('<') ? `data:image/svg+xml;utf8,${encodeURIComponent(data.qr_code)}` : data.qr_code}
              alt="Scan with your authenticator app"
              width={168}
              height={168}
            />
          </div>
        )}
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-[12px] text-d-text-secondary">
            <strong>1.</strong> Scan the QR with your authenticator app — or paste the secret below if you can't scan.
          </p>
          {data.secret && (
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 bg-[#0A0D14] border border-d-border rounded px-2 py-1.5 numeric text-[11px] text-white truncate">
                {data.secret}
              </code>
              <button
                type="button"
                onClick={onCopySecret}
                className="inline-flex items-center gap-1 px-2 py-1.5 border border-d-border rounded text-[10px] text-d-text-muted hover:text-white"
              >
                {copied ? <Check className="w-3 h-3 text-up" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          {/* PR 94 — backup reminder. If a user loses their authenticator
              without removing the factor first, they need this secret to
              re-enroll on a new device. The /login/mfa page has an
              email-recovery escape hatch, but offline secret storage is
              the safer first line of defense. */}
          <div className="rounded border border-warning/30 bg-warning/[0.06] px-2 py-1.5 text-[11px] text-warning leading-relaxed">
            Save the secret somewhere safe (password manager / printed copy). If you
            lose your phone without removing this factor, you'll need it to recover.
          </div>
          <p className="text-[12px] text-d-text-secondary">
            <strong>2.</strong> Enter the 6-digit code your app shows to confirm.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={code}
          onChange={(e) => onCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="000000"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          maxLength={CODE_LENGTH}
          className="w-full px-3 py-2.5 rounded-md bg-[#0A0D14] border border-d-border text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/60 text-[18px] numeric tracking-[0.4em] text-center"
        />
        {/* PR 94 — TOTP 30-second tick. Authenticator apps rotate codes
            every 30s (RFC 6238 default). Showing the window visually
            tells the user when the code is about to expire. */}
        <TotpTick />
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="text-[12px] text-d-text-muted hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onVerify}
            disabled={busy || code.length !== CODE_LENGTH}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-md text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />}
            Verify &amp; enable
          </button>
        </div>
      </div>
    </div>
  )
}


function TotpTick() {
  // Wall-clock-aligned to the same 30s grid every authenticator uses,
  // so the bar empties at the same moment the user's code rotates.
  const [secondsLeft, setSecondsLeft] = useState(30 - (Math.floor(Date.now() / 1000) % 30))
  useEffect(() => {
    const tick = () => setSecondsLeft(30 - (Math.floor(Date.now() / 1000) % 30))
    tick()
    const iv = window.setInterval(tick, 250)
    return () => window.clearInterval(iv)
  }, [])
  const pct = (secondsLeft / 30) * 100
  const color = secondsLeft <= 5 ? '#FF5947' : secondsLeft <= 10 ? '#FEB113' : '#4FECCD'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-[#0A0D14] overflow-hidden">
        <div
          className="h-full transition-[width] duration-200 ease-linear"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[10px] text-d-text-muted numeric tabular-nums">
        {secondsLeft}s
      </span>
    </div>
  )
}
