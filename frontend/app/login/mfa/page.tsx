'use client'

/**
 * /login/mfa — TOTP challenge after password (PR 62).
 *
 * Lands here when ``signIn`` detects the fresh session is AAL1 but the
 * account has a verified TOTP factor (AAL2 required). We pick the first
 * verified TOTP factor, issue a challenge, and wait for the 6-digit
 * code. On success the session upgrades to AAL2 and we redirect to
 * /dashboard. A "Sign out" escape hatch exists for users who lost their
 * authenticator — they can then use the email recovery path.
 */

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldCheck } from 'lucide-react'

import { supabase } from '@/lib/supabase'

const CODE_LENGTH = 6

export default function MFAChallengePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [factorId, setFactorId] = useState<string | null>(null)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'verifying'>('loading')

  // Fetch the factor + issue the challenge on mount.
  const initChallenge = useCallback(async () => {
    setError(null)
    setStatus('loading')
    try {
      const { data: factors, error: listErr } = await supabase.auth.mfa.listFactors()
      if (listErr) throw listErr
      const totp = factors?.totp?.find((f: any) => f.status === 'verified')
      if (!totp) {
        // Nothing to challenge against — punt back to login so the user
        // can re-enter credentials and we'll skip the MFA gate.
        router.replace('/login')
        return
      }
      setFactorId(totp.id)

      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: totp.id })
      if (chErr) throw chErr
      setChallengeId(ch.id)
      setStatus('ready')
    } catch (err: any) {
      setError(err?.message || 'Failed to start MFA challenge')
      setStatus('ready')
    }
  }, [router])

  useEffect(() => { initChallenge() }, [initChallenge])

  const onVerify = async () => {
    if (!factorId || !challengeId) return
    if (code.length !== CODE_LENGTH) {
      setError(`Enter the ${CODE_LENGTH}-digit code from your authenticator.`)
      return
    }
    setStatus('verifying')
    setError(null)
    try {
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId, challengeId, code,
      })
      if (vErr) throw vErr
      router.replace('/dashboard')
    } catch (err: any) {
      setError(err?.message || 'Code incorrect — try again.')
      setStatus('ready')
      setCode('')
    }
  }

  const onSignOut = async () => {
    try { await supabase.auth.signOut() } catch {}
    router.replace('/login')
  }

  return (
    <div className="min-h-screen-dvh flex items-center justify-center bg-[#0A0D14] text-white px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
        </div>

        <h1 className="text-[22px] font-semibold text-center">Enter your 2FA code</h1>
        <p className="text-[13px] text-d-text-muted text-center mt-2">
          Open your authenticator app (Google Authenticator, Authy, 1Password) and
          enter the current 6-digit code for Swing AI.
        </p>

        <div className="mt-8 trading-surface space-y-4">
          {status === 'loading' ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : (
            <>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={CODE_LENGTH}
                className="w-full px-3 py-3 rounded-md bg-[#0A0D14] border border-d-border text-white placeholder:text-d-text-muted focus:outline-none focus:border-primary/60 text-[20px] numeric tracking-[0.4em] text-center"
              />
              <button
                type="button"
                onClick={onVerify}
                disabled={status === 'verifying' || code.length !== CODE_LENGTH || !challengeId}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-black rounded-md text-[13px] font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {status === 'verifying' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Verify
              </button>
            </>
          )}

          {error && (
            <div className="rounded-md border border-down/30 bg-down/[0.08] p-3 text-[12px] text-down">
              {error}
            </div>
          )}
        </div>

        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onSignOut}
            className="text-[12px] text-d-text-muted hover:text-white"
          >
            Lost your authenticator? Sign out and recover via email.
          </button>
        </div>
      </div>
    </div>
  )
}
