'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Mail, ArrowRight } from 'lucide-react'
import AuthLayout from '@/components/auth/AuthLayout'
import GradientBorder from '@/components/ui/GradientBorder'

export default function VerifyEmailPage() {
  return (
    <AuthLayout
      title="Almost There!"
      subtitle="Just one more step to unlock your AI-powered trading intelligence."
      backgroundImage="/images/auth-bg.webp"
    >
      <GradientBorder>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="rounded-[19px] p-8 text-center"
        >
          {/* Animated envelope icon */}
          <motion.div
            initial={{ y: -10 }}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="mx-auto mb-6"
          >
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-neon-cyan/10 border border-neon-cyan/20">
              <Mail className="h-8 w-8 text-neon-cyan" />
            </div>
          </motion.div>

          <h1 className="text-2xl font-bold text-text-primary mb-2">Verify your email</h1>
          <p className="text-text-secondary mb-8 max-w-sm mx-auto">
            We sent a verification link to your inbox. Click it to activate your account and start trading.
          </p>

          <Link
            href="/login"
            className="btn-tv-gradient btn-press inline-flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-semibold text-white transition-all"
          >
            Back to Sign In
            <ArrowRight className="w-4 h-4" />
          </Link>

          <p className="text-xs text-text-secondary mt-6">
            Didn't receive the email? Check your spam folder or{' '}
            <button className="text-neon-cyan link-animate">resend verification</button>
          </p>
        </motion.div>
      </GradientBorder>
    </AuthLayout>
  )
}
