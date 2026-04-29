import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const publicPaths = new Set([
  '/',
  '/login',
  '/signup',
  '/pricing',
  '/privacy',
  '/terms',
  '/forgot-password',
  '/verify-email',
  '/auth/callback',
  '/broker/callback',
])

// Check if Supabase is configured — when it isn't, allow all routes (dev/demo)
const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (publicPaths.has(pathname)) {
    return NextResponse.next()
  }

  // Allow static assets and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/ws') ||
    pathname.startsWith('/images') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  // If Supabase is not configured:
  // - In production (NODE_ENV=production), redirect to login with an error
  // - In development, allow all routes for dev/demo
  if (!isSupabaseConfigured) {
    if (process.env.NODE_ENV === 'production') {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('error', 'auth_not_configured')
      return NextResponse.redirect(loginUrl)
    }
    return NextResponse.next()
  }

  // Check for Supabase auth token in cookies
  // Note: @supabase/supabase-js stores tokens in localStorage by default,
  // so cookie-based check only works with @supabase/ssr.
  // For now, check both cookies and allow client-side AuthContext to handle protection.
  const hasSessionCookie = request.cookies.getAll().some(
    (c) => c.name.startsWith('sb-') && (c.name.endsWith('-auth-token') || c.name.endsWith('-auth-token.0'))
  )

  // Also check for the base64 storage key cookie that some Supabase versions set
  const hasStorageToken = request.cookies.getAll().some(
    (c) => c.name.includes('supabase') || c.name.includes('auth-token')
  )

  if (!hasSessionCookie && !hasStorageToken) {
    // In development, allow through and let client-side auth handle it
    // This avoids the race condition where localStorage auth hasn't synced to cookies
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.next()
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
