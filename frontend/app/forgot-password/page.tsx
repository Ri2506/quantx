'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Mail, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const supabase = createClientComponentClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      })
      if (resetError) throw resetError
      setSubmitted(true)
    } catch {
      // Always show success to avoid email enumeration
      setSubmitted(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Reset Your Password"
      subtitle="Don't worry, it happens to the best of us. We'll help you get back in."
    >
      <div className="animate-fade-in-up">
        <Link
          href="/login"
          className="mb-8 inline-flex items-center gap-2 text-sm text-l-text-secondary transition hover:text-l-accent"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Login
        </Link>

        <h2 className="mb-2 text-2xl font-bold tracking-tight text-l-text">Reset Password</h2>
        <p className="mb-6 text-sm text-l-text-secondary">
          Enter your email address and we&apos;ll send you a link to reset your password.
        </p>

        {submitted ? (
          <div className="rounded-xl border border-up/20 bg-up/5 p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-up/10">
              <CheckCircle className="h-7 w-7 text-up" />
            </div>
            <p className="font-medium text-up">Check your inbox!</p>
            <p className="mt-2 text-sm text-l-text-secondary">
              If an account exists for {email}, you will receive a password reset link shortly.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-l-text">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-l-text-muted" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  className="w-full rounded-xl border border-l-border bg-l-bg-subtle py-3 pl-11 pr-4 text-sm text-l-text placeholder:text-l-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl bg-primary py-3 text-sm font-semibold text-[#131722] transition-all hover:bg-primary-hover hover:shadow-glow-primary disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send Reset Link'}
            </button>
          </form>
        )}
      </div>
    </AuthLayout>
  )
}
