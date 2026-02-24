// ============================================================================
// SWINGAI - VERIFY EMAIL PAGE
// ============================================================================

'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Mail, ArrowRight, TrendingUp } from 'lucide-react'

export default function VerifyEmailPage() {
  return (
    <div className="app-shell flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/20 via-secondary/10 to-transparent rounded-full blur-3xl animate-float" />
        <div
          className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-secondary/20 via-primary/10 to-transparent rounded-full blur-3xl animate-float"
          style={{ animationDelay: '2s' }}
        />
      </div>

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

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="app-panel p-8 shadow-2xl text-center"
        >
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-2">Verify your email</h1>
          <p className="text-text-secondary mb-6">
            We sent a verification link to your inbox. Click it to activate your account.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-glow-sm hover:shadow-glow-md transition-all"
          >
            Back to Sign In
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>
      </motion.div>
    </div>
  )
}
