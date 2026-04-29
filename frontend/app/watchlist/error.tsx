'use client'

import { useEffect } from 'react'

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
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-sm text-center">
        {/* Animated error icon */}
        <div className="mx-auto mb-6 relative w-20 h-20">
          <svg className="absolute inset-0 w-full h-full animate-[spin_8s_linear_infinite]" viewBox="0 0 80 80" fill="none">
            <circle cx="40" cy="40" r="36" stroke="#FF5947" strokeWidth="1.5" strokeDasharray="6 5" opacity="0.5" />
          </svg>
          <div className="absolute inset-2 rounded-full bg-[#FF5947]/10 blur-sm" />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[#FF5947] text-3xl font-bold animate-pulse">!</span>
          </div>
        </div>
        <h2 className="mb-2 text-lg font-bold text-white">Something went wrong</h2>
        <p className="mb-6 text-sm text-d-text-muted">An unexpected error occurred.</p>
        <button
          onClick={reset}
          className="rounded-xl bg-primary px-5 py-2 text-sm font-medium text-[#131722] transition hover:bg-primary-hover"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
