'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import GradientBorder from '@/components/ui/GradientBorder'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <AuthLayout
      title="Reset Your Password"
      subtitle="Don't worry, it happens to the best of us. We'll help you get back in."
      backgroundImage="/images/auth-bg.webp"
    >
      <Link
        href="/login"
        className="mb-8 inline-flex items-center gap-2 text-sm text-text-secondary transition hover:text-neon-cyan"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Login
      </Link>

      <GradientBorder animated={false}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="rounded-[19px] p-8"
        >
          <h2 className="mb-2 text-2xl font-bold text-text-primary">Reset Password</h2>
          <p className="mb-6 text-text-secondary">
            Enter your email address and we'll send you a link to reset your password.
          </p>

          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl bg-neon-green/10 border border-neon-green/20 p-6 text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
                  className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neon-green/20"
                >
                  <CheckCircle className="h-7 w-7 text-neon-green" />
                </motion.div>
                <p className="text-neon-green font-medium">
                  Check your inbox!
                </p>
                <p className="text-text-secondary text-sm mt-2">
                  If an account exists for {email}, you will receive a password reset link shortly.
                </p>
              </motion.div>
            ) : (
              <motion.form
                key="form"
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.02] py-3 pl-10 pr-4 text-text-primary placeholder-text-secondary transition focus:border-neon-cyan/40 focus:outline-none focus:ring-1 focus:ring-neon-cyan/20"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn-tv-gradient btn-press w-full rounded-xl py-3 font-semibold text-white transition"
                >
                  Send Reset Link
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>
      </GradientBorder>
    </AuthLayout>
  )
}
