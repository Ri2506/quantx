// ============================================================================
// SWINGAI - FORGOT PASSWORD PAGE
// Password reset with email verification
// ============================================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { auth } from '../../lib/supabase'
import {
  Mail,
  ArrowLeft,
  TrendingUp,
  Loader2,
  CheckCircle,
} from 'lucide-react'

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

// ============================================================================
// FORGOT PASSWORD PAGE
// ============================================================================

export default function ForgotPasswordPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  // ============================================================================
  // HANDLE SUBMIT
  // ============================================================================

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true)

    try {
      await auth.resetPassword(data.email)
      setEmailSent(true)
      toast.success('Password reset email sent!')
    } catch (error: any) {
      toast.error(error.message || 'Failed to send reset email')
    } finally {
      setIsLoading(false)
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="app-shell flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/20 via-secondary/10 to-transparent rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-secondary/20 via-primary/10 to-transparent rounded-full blur-3xl animate-float" style={{ animationDelay: '2s' }} />
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo & Brand */}
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <motion.div
            whileHover={{ scale: 1.05, rotate: 5 }}
            transition={{ type: 'spring', stiffness: 400 }}
            className="w-12 h-12 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow-md"
          >
            <TrendingUp className="w-6 h-6 text-white" />
          </motion.div>
          <span className="text-2xl font-bold text-text-primary">SwingAI</span>
        </Link>

        {/* Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="app-panel p-8 shadow-2xl"
        >
          {!emailSent ? (
            <>
              {/* Header */}
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-text-primary mb-2">
                  Forgot Password?
                </h1>
                <p className="text-text-secondary">
                  No worries! Enter your email and we'll send you reset instructions
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Email Field */}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-text-secondary mb-2"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                    <input
                      {...register('email')}
                      type="email"
                      id="email"
                      placeholder="you@example.com"
                      className="w-full pl-12 pr-4 py-3 bg-background-elevated border border-border/50 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                  </div>
                  {errors.email && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-danger text-sm mt-1"
                    >
                      {errors.email.message}
                    </motion.p>
                  )}
                </div>

                {/* Submit Button */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-glow-sm hover:shadow-glow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Send Reset Link'
                  )}
                </motion.button>

                {/* Back to Login */}
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Login
                </Link>
              </form>
            </>
          ) : (
            <>
              {/* Success State */}
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-20 h-20 mx-auto mb-6 rounded-full bg-success/20 flex items-center justify-center"
                >
                  <CheckCircle className="w-10 h-10 text-success" />
                </motion.div>

                <h2 className="text-2xl font-bold text-text-primary mb-2">
                  Check Your Email
                </h2>
                <p className="text-text-secondary mb-8">
                  We've sent password reset instructions to your email address. Please check your inbox and follow the link to reset your password.
                </p>

                <div className="space-y-3">
                  <p className="text-sm text-text-muted">
                    Didn't receive the email? Check your spam folder or
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setEmailSent(false)}
                    className="text-primary hover:text-primary-dark font-medium transition-colors"
                  >
                    Try again
                  </motion.button>
                </div>

                <Link
                  href="/login"
                  className="flex items-center justify-center gap-2 mt-8 text-text-secondary hover:text-text-primary transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Login
                </Link>
              </div>
            </>
          )}
        </motion.div>

        {/* Help Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-6 text-sm text-text-muted"
        >
          <p>
            Need help?{' '}
            <Link href="/contact" className="text-primary hover:text-primary-dark">
              Contact Support
            </Link>
          </p>
        </motion.div>
      </motion.div>
    </div>
  )
}
