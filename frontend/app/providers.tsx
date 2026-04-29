'use client'

import { useEffect } from 'react'
import { ThemeProvider } from 'next-themes'
import { Toaster } from 'sonner'
import { SWRConfig } from 'swr'
import { AuthProvider } from '../contexts/AuthContext'

/**
 * Registers a global mousemove listener that sets CSS custom properties
 * --mouse-x / --mouse-y on every .glass-card element, enabling the
 * spotlight-follow hover effect defined in globals.css.
 */
function useCardSpotlight() {
  useEffect(() => {
    let rafId = 0
    function handleMouseMove(e: MouseEvent) {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        const cards = document.querySelectorAll<HTMLElement>('.glass-card')
        cards.forEach((card) => {
          const rect = card.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * 100
          const y = ((e.clientY - rect.top) / rect.height) * 100
          card.style.setProperty('--mouse-x', `${x}%`)
          card.style.setProperty('--mouse-y', `${y}%`)
        })
      })
    }
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      cancelAnimationFrame(rafId)
    }
  }, [])
}

export function Providers({ children }: { children: React.ReactNode }) {
  useCardSpotlight()

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <SWRConfig
        value={{
          revalidateOnFocus: false,
          dedupingInterval: 5000,
          errorRetryCount: 3,
          errorRetryInterval: 5000,
          shouldRetryOnError: true,
        }}
      >
        <AuthProvider>{children}</AuthProvider>
      </SWRConfig>
      <Toaster
        theme="dark"
        position="top-right"
        richColors
        toastOptions={{
          style: {
            background: 'rgba(17, 21, 32, 0.95)',
            backdropFilter: 'blur(40px)',
            border: '1px solid #1C1E29',
            borderRadius: '10px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          },
        }}
      />
    </ThemeProvider>
  )
}
