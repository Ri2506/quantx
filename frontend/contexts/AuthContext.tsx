// ============================================================================
// QUANT X - AUTH CONTEXT (PRODUCTION READY)
// Global authentication state management
// Removed dev-mode mock user fallbacks for production builds
// ============================================================================

'use client'

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, getUserProfile, createUserProfile } from '../lib/supabase'
import { UserProfile } from '../types'
import { useRouter } from 'next/navigation'
import { logger } from '../lib/logger'

// ============================================================================
// TYPES
// ============================================================================

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
  clearError: () => void
}

// ============================================================================
// CONTEXT
// ============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// ============================================================================
// ENVIRONMENT CHECK
// ============================================================================

// Check if Supabase is properly configured
const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && 
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)


// ============================================================================
// PROVIDER
// ============================================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  // ============================================================================
  // LOAD USER ON MOUNT
  // ============================================================================

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Check if Supabase is configured
        if (!isSupabaseConfigured) {
          logger.warn('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env file.')
          setLoading(false)
          return
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          logger.error('Session error:', sessionError)
          setError('Failed to load session')
          setLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id, session.user.email || '')
        }
      } catch (err) {
        logger.error('Error loading user:', err)
        setError('Authentication service unavailable')
      } finally {
        setLoading(false)
      }
    }

    loadUser()

    // Skip auth listener if Supabase is not configured
    if (!isSupabaseConfigured) return

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        logger.log('Auth state changed:', event)

        if (event === 'SIGNED_IN' && session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id, session.user.email || '')
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setProfile(null)
        } else if (event === 'TOKEN_REFRESHED' && session?.user) {
          setUser(session.user)
        } else if (event === 'USER_UPDATED' && session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id, session.user.email || '')
        }

        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // ============================================================================
  // LOAD USER PROFILE
  // ============================================================================

  const loadProfile = async (userId: string, email: string) => {
    try {
      let profileData = await getUserProfile(userId)
      
      // If profile doesn't exist, create one
      if (!profileData && email) {
        logger.log('Creating new profile for user:', userId)
        profileData = await createUserProfile(userId, email)
      }
      
      setProfile(profileData as UserProfile)
    } catch (err) {
      logger.error('Error loading profile:', err)
      // Don't set profile error as user might still be valid
      setProfile(null)
    }
  }

  // ============================================================================
  // REFRESH PROFILE
  // ============================================================================

  const refreshProfile = useCallback(async () => {
    if (user) {
      await loadProfile(user.id, user.email || '')
    }
  }, [user])

  // ============================================================================
  // CLEAR ERROR
  // ============================================================================

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  // ============================================================================
  // SIGN UP
  // ============================================================================

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('Authentication is not configured. Please contact support.')
    }

    try {
      setError(null)

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
          },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (signUpError) {
        throw signUpError
      }

      if (data.user && !data.user.confirmed_at) {
        // User needs to confirm email
        throw new Error('Please check your email to confirm your account.')
      }

      // Profile will be created by database trigger or on first login
    } catch (err: any) {
      const message = err.message || 'Failed to sign up'
      setError(message)
      throw new Error(message)
    }
  }, [router])

  // ============================================================================
  // SIGN IN
  // ============================================================================

  const signIn = useCallback(async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      throw new Error('Authentication is not configured. Please contact support.')
    }

    try {
      setError(null)

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        throw signInError
      }

      if (data.user) {
        setUser(data.user)
        await loadProfile(data.user.id, data.user.email || '')

        // PR 62 — MFA gate. When the user has a verified TOTP factor
        // their fresh session is AAL1 but the account requires AAL2.
        // Redirect to the challenge page; only on success does it land
        // in /dashboard. We only block when the level actually steps up.
        try {
          const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
          if (aal && aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') {
            router.push('/login/mfa')
            return
          }
        } catch {
          // MFA API absent / project not configured — fall through to dashboard.
        }

        router.push('/dashboard')
      }
    } catch (err: any) {
      const message = err.message || 'Failed to sign in'
      setError(message)
      throw new Error(message)
    }
  }, [router])

  // ============================================================================
  // SIGN IN WITH GOOGLE
  // ============================================================================

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Authentication is not configured. Please contact support.')
    }

    try {
      setError(null)

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (oauthError) {
        throw oauthError
      }
    } catch (err: any) {
      const message = err.message || 'Failed to sign in with Google'
      setError(message)
      throw new Error(message)
    }
  }, [])

  // ============================================================================
  // SIGN OUT
  // ============================================================================

  const signOut = useCallback(async () => {
    try {
      setError(null)
      
      if (isSupabaseConfigured) {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) {
          logger.error('Sign out error:', signOutError)
        }
      }

      setUser(null)
      setProfile(null)
      router.push('/')
    } catch (err: any) {
      logger.error('Sign out error:', err)
      // Force clear state even on error
      setUser(null)
      setProfile(null)
      router.push('/')
    }
  }, [router])

  // ============================================================================
  // CONTEXT VALUE (memoized to prevent cascade re-renders)
  // ============================================================================

  const value = useMemo<AuthContextType>(() => ({
    user,
    profile,
    loading,
    error,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    refreshProfile,
    clearError,
  }), [user, profile, loading, error, signUp, signIn, signInWithGoogle, signOut, refreshProfile, clearError])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// ============================================================================
// HOOK
// ============================================================================

export function useAuth() {
  const context = useContext(AuthContext)

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}

export default AuthContext
