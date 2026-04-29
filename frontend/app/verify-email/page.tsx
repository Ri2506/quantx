'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Mail, ArrowRight, Loader2, CheckCircle } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import { supabase } from '@/lib/supabase'

export default function VerifyEmailPage() {
  const searchParams = useSearchParams()
  const email = searchParams.get('email') || ''
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const [error, setError] = useState('')

  const handleResend = async () => {
    if (!email) {
      setError('Email address not available. Please sign up again.')
      return
    }

    setResending(true)
    setError('')
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email,
      })
      if (resendError) throw resendError
      setResent(true)
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification email')
    } finally {
      setResending(false)
    }
  }

  return (
    <AuthLayout
      title="Almost There!"
      subtitle="Just one more step to unlock your AI-powered trading intelligence."
    >
      <div className="animate-fade-in-up text-center">
        {/* Envelope icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-l-border bg-primary/5">
          <Mail className="h-8 w-8 text-l-accent" />
        </div>

        <h1 className="mb-2 text-2xl font-bold tracking-tight text-l-text">Verify your email</h1>
        <p className="mx-auto mb-8 max-w-sm text-sm text-l-text-secondary">
          We sent a verification link to{' '}
          {email ? (
            <span className="font-medium text-l-text">{email}</span>
          ) : (
            'your inbox'
          )}
          . Click it to activate your account and start trading.
        </p>

        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-3 text-sm font-semibold text-[#131722] transition-all hover:bg-primary-hover hover:shadow-glow-primary"
        >
          Back to Sign In
          <ArrowRight className="h-4 w-4" />
        </Link>

        <p className="mt-6 text-xs text-l-text-muted">
          Didn&apos;t receive the email? Check your spam folder or{' '}
          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="font-medium text-l-accent transition-colors hover:text-primary disabled:opacity-50"
          >
            {resending ? (
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
            ) : resent ? (
              <CheckCircle className="mr-1 inline h-3 w-3 text-up" />
            ) : null}
            {resent ? 'Verification sent!' : 'resend verification'}
          </button>
        </p>
        {error && <p className="mt-2 text-xs text-down">{error}</p>}
      </div>
    </AuthLayout>
  )
}
