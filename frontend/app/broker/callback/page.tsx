'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

function BrokerCallbackContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing')
  const [message, setMessage] = useState('Connecting your broker account...')

  useEffect(() => {
    // Get state from URL (Upstox passes it) or sessionStorage (Zerodha doesn't pass it)
    const state = searchParams.get('state') || sessionStorage.getItem('broker_oauth_state') || ''
    const broker = searchParams.get('broker') || sessionStorage.getItem('broker_oauth_broker') || ''

    // Clean up stored values
    sessionStorage.removeItem('broker_oauth_state')
    sessionStorage.removeItem('broker_oauth_broker')

    // Angel One uses credential-based auth (SmartAPI has no OAuth redirect).
    // If somehow the callback fires for Angel, bounce back to settings.
    if (broker === 'angelone') {
      setStatus('error')
      setMessage('Angel One connects via credentials, not OAuth. Please use the Angel One tile in Settings.')
      setTimeout(() => router.push('/settings'), 3000)
      return
    }

    // Zerodha sends request_token, Upstox sends code
    const requestToken = searchParams.get('request_token')
    const code = searchParams.get('code') || searchParams.get('auth_code')

    // Detect broker from available params if not already set
    const detectedBroker = broker || (requestToken ? 'zerodha' : 'upstox')

    if (!requestToken && !code) {
      setStatus('error')
      setMessage('No authorization code received from broker.')
      return
    }

    if (!state) {
      setStatus('error')
      setMessage('OAuth state missing. Please try connecting again from Settings.')
      return
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''

    // Build callback URL with query params (backend expects Query params, not JSON body)
    const callbackParams = new URLSearchParams()
    if (detectedBroker === 'zerodha' && requestToken) {
      callbackParams.set('request_token', requestToken)
    } else if (code) {
      callbackParams.set('code', code)
    }
    callbackParams.set('state', state)

    const callbackUrl = `${apiUrl}/api/broker/${detectedBroker}/auth/callback?${callbackParams.toString()}`

    // Get auth token and send the callback request
    supabase.auth.getSession().then(({ data: { session } }) => {
      const token = session?.access_token
      const headers: Record<string, string> = {}
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      return fetch(callbackUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
      })
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.detail || 'Broker connection failed')
        }
        setStatus('success')
        setMessage('Broker connected successfully! Redirecting to settings...')
        setTimeout(() => router.push('/settings'), 2000)
      })
      .catch((err) => {
        setStatus('error')
        setMessage(err.message || 'Failed to connect broker. Please try again.')
      })
  }, [searchParams, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0D14] p-4">
      <div className="trading-surface max-w-md w-full text-center !p-8">
        {status === 'processing' && (
          <>
            <Loader2 className="h-10 w-10 text-primary animate-spin mx-auto mb-4" />
            <h2 className="text-[18px] font-semibold text-white mb-1">Connecting broker…</h2>
            <p className="text-[12px] text-d-text-muted">Exchanging tokens with your broker</p>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="relative h-14 w-14 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full bg-up/10 animate-ping" />
              <CheckCircle2 className="relative h-14 w-14 text-up" />
            </div>
            <h2 className="text-[20px] font-semibold text-white mb-1">Connected</h2>
            <p className="text-[12px] text-d-text-muted">Redirecting to settings…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-12 w-12 text-down mx-auto mb-4" />
            <h2 className="text-[18px] font-semibold text-white mb-1">Connection failed</h2>
            <p className="text-[12px] text-d-text-muted mt-2">{message}</p>
            <button
              onClick={() => router.push('/settings')}
              className="mt-6 px-5 py-2 bg-primary text-black rounded-md text-[13px] font-medium hover:bg-primary-hover transition-colors"
            >
              Back to settings
            </button>
          </>
        )}
        {status === 'processing' && message && message !== 'Connecting your broker account...' && (
          <p className="text-[11px] text-d-text-muted mt-3">{message}</p>
        )}
      </div>
    </div>
  )
}

export default function BrokerCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-main">
          <Loader2 className="h-12 w-12 text-primary animate-spin" />
        </div>
      }
    >
      <BrokerCallbackContent />
    </Suspense>
  )
}
