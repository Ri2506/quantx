'use client'

import { useEffect } from 'react'
import { motion } from 'framer-motion'

import { reportError } from '@/lib/reportError'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportError({ error, boundary: 'route', digest: error.digest })
  }, [error])

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-[#131722]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-md text-center"
      >
        {/* Animated error illustration */}
        <div className="mx-auto mb-8 flex flex-col items-center">
          {/* Rotating dashed circle with pulsing warning icon */}
          <div className="relative w-24 h-24 mb-4">
            {/* Rotating dashed border */}
            <svg
              className="absolute inset-0 w-full h-full animate-[spin_8s_linear_infinite]"
              viewBox="0 0 96 96"
              fill="none"
            >
              <circle
                cx="48"
                cy="48"
                r="44"
                stroke="#FF5947"
                strokeWidth="2"
                strokeDasharray="8 6"
                opacity="0.6"
              />
            </svg>
            {/* Inner glow */}
            <div className="absolute inset-3 rounded-full bg-[#FF5947]/10 blur-md" />
            {/* Pulsing exclamation mark */}
            <div className="absolute inset-0 flex items-center justify-center">
              <motion.span
                animate={{ scale: [1, 1.15, 1] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="text-[#FF5947] text-4xl font-bold select-none"
              >
                !
              </motion.span>
            </div>
          </div>

          {/* Broken chart line */}
          <svg width="120" height="32" viewBox="0 0 120 32" fill="none" className="opacity-60">
            {/* Upward line */}
            <path
              d="M4 28 L30 20 L50 22 L70 12 L82 8"
              stroke="#FF5947"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Break gap - dashed */}
            <path
              d="M82 8 L88 10"
              stroke="#FF5947"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="2 3"
              opacity="0.4"
            />
            {/* Downward crash */}
            <path
              d="M88 10 L100 24 L116 28"
              stroke="#FF5947"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.5"
            />
          </svg>
        </div>

        <h2 className="mb-2 text-xl font-bold text-white">Something went wrong</h2>
        <p className="mb-6 text-sm text-d-text-muted">
          An unexpected error occurred. Please try again.
        </p>
        <button
          onClick={reset}
          className="rounded-xl bg-primary px-6 py-2.5 text-sm font-medium text-[#131722] transition hover:bg-primary-hover"
        >
          Try again
        </button>
      </motion.div>
    </div>
  )
}
