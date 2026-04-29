'use client'

/**
 * global-error.tsx — the last line of defence.
 *
 * Fires when an error escapes the root layout itself (e.g., Providers,
 * AuthProvider, font loading). Next.js replaces the entire shell with
 * this component, so it must render its own <html>/<body> — no access
 * to Tailwind classes from the root layout is guaranteed to resolve
 * here. We inline the critical styles.
 *
 * Per-route error.tsx files handle narrower crashes with the full
 * design system available. This one just has to be resilient.
 */

import { useEffect } from 'react'

import { reportError } from '@/lib/reportError'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportError({ error, boundary: 'global', digest: error.digest })
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          fontFamily:
            'DM Sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          background: '#0A0D14',
          color: '#FFFFFF',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 20px',
              borderRadius: 999,
              background: 'rgba(255, 89, 71, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 89, 71, 0.35)',
            }}
          >
            <span
              style={{
                color: '#FF5947',
                fontSize: 28,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              !
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            Swing AI hit a critical error
          </h1>
          <p
            style={{
              margin: '12px 0 24px',
              fontSize: 13,
              lineHeight: 1.6,
              color: '#8E8E8E',
            }}
          >
            We logged it and will take a look. You can retry below, or reload the page.
            {error?.digest ? (
              <>
                {' '}
                <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11 }}>
                  ref: {error.digest}
                </span>
              </>
            ) : null}
          </p>
          <div
            style={{
              display: 'flex',
              gap: 10,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 600,
                color: '#0A0D14',
                background: '#4FECCD',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.location.reload()
              }}
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: 500,
                color: '#FFFFFF',
                background: 'transparent',
                border: '1px solid #2A2F3E',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              Reload app
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
