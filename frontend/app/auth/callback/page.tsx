// ============================================================================
// QUANT X - AUTH CALLBACK
// Handles Supabase OAuth redirect (Google sign-in)
// Supabase JS client auto-picks up tokens from URL hash via detectSessionInUrl
// ============================================================================

'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function AuthCallback() {
  const router = useRouter()
  const { user, loading } = useAuth()

  // Redirect to dashboard once session is detected
  useEffect(() => {
    if (!loading && user) {
      router.replace('/dashboard')
    }
  }, [user, loading, router])

  // Timeout fallback — if no session after 10s, redirect to login
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!user) {
        router.replace('/login?error=auth_failed')
      }
    }, 10000)
    return () => clearTimeout(timeout)
  }, [user, router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary">Completing sign-in...</p>
      </div>
    </div>
  )
}
