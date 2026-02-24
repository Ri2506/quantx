// ============================================================================
// SWINGAI - AUTH CONTEXT (PRODUCTION READY)
// Global authentication state management
// Removed dev-mode mock user fallbacks for production builds
// ============================================================================

'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { User } from '@supabase/supabase-js'
import { supabase, getUserProfile, createUserProfile } from '../lib/supabase'
import { UserProfile } from '../types'
import { useRouter } from 'next/navigation'

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

// Check if we're in production build
const isProduction = process.env.NODE_ENV === 'production'
const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'
const allowDemo = isDemoMode && !isProduction

const demoCreatedAt = new Date().toISOString()
const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@swingai.local',
  app_metadata: {},
  user_metadata: { full_name: 'Demo User' },
  aud: 'authenticated',
  created_at: demoCreatedAt,
} as User

const DEMO_PROFILE: UserProfile = {
  id: DEMO_USER.id,
  email: DEMO_USER.email,
  full_name: 'Demo User',
  capital: 250000,
  risk_profile: 'moderate',
  trading_mode: 'signal_only',
  max_positions: 5,
  risk_per_trade: 1,
  fo_enabled: false,
  subscription_status: 'trial',
  broker_connected: false,
  total_trades: 0,
  winning_trades: 0,
  total_pnl: 0,
  created_at: demoCreatedAt,
}

// ============================================================================
// PROVIDER
// ============================================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const setDemoSession = () => {
    setUser(DEMO_USER)
    setProfile(DEMO_PROFILE)
  }

  // ============================================================================
  // LOAD USER ON MOUNT
  // ============================================================================

  useEffect(() => {
    const loadUser = async () => {
      try {
        // Check if Supabase is configured
        if (!isSupabaseConfigured) {
          console.warn('⚠️ Supabase is not configured. Authentication will not work.')
          if (allowDemo) {
            setDemoSession()
          } else if (!isProduction) {
            console.info('💡 Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env file')
          }
          setLoading(false)
          return
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession()

        if (sessionError) {
          console.error('Session error:', sessionError)
          setError('Failed to load session')
          setLoading(false)
          return
        }

        if (session?.user) {
          setUser(session.user)
          await loadProfile(session.user.id, session.user.email || '')
        }
      } catch (err) {
        console.error('Error loading user:', err)
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
        console.log('Auth state changed:', event)

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
        console.log('Creating new profile for user:', userId)
        profileData = await createUserProfile(userId, email)
      }
      
      setProfile(profileData as UserProfile)
    } catch (err) {
      console.error('Error loading profile:', err)
      // Don't set profile error as user might still be valid
      setProfile(null)
    }
  }

  // ============================================================================
  // REFRESH PROFILE
  // ============================================================================

  const refreshProfile = async () => {
    if (user) {
      await loadProfile(user.id, user.email || '')
    }
  }

  // ============================================================================
  // CLEAR ERROR
  // ============================================================================

  const clearError = () => {
    setError(null)
  }

  // ============================================================================
  // SIGN UP
  // ============================================================================

  const signUp = async (email: string, password: string, fullName: string) => {
    if (!isSupabaseConfigured) {
      if (allowDemo) {
        setDemoSession()
        return
      }
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
  }

  // ============================================================================
  // SIGN IN
  // ============================================================================

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      if (allowDemo) {
        setDemoSession()
        router.push('/dashboard')
        return
      }
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
        router.push('/dashboard')
      }
    } catch (err: any) {
      const message = err.message || 'Failed to sign in'
      setError(message)
      throw new Error(message)
    }
  }

  // ============================================================================
  // SIGN IN WITH GOOGLE
  // ============================================================================

  const signInWithGoogle = async () => {
    if (!isSupabaseConfigured) {
      if (allowDemo) {
        setDemoSession()
        router.push('/dashboard')
        return
      }
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
  }

  // ============================================================================
  // SIGN OUT
  // ============================================================================

  const signOut = async () => {
    try {
      setError(null)
      
      if (isSupabaseConfigured) {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) {
          console.error('Sign out error:', signOutError)
        }
      }

      setUser(null)
      setProfile(null)
      router.push('/')
    } catch (err: any) {
      console.error('Sign out error:', err)
      // Force clear state even on error
      setUser(null)
      setProfile(null)
      router.push('/')
    }
  }

  // ============================================================================
  // CONTEXT VALUE
  // ============================================================================

  const value: AuthContextType = {
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
  }

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
