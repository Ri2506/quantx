import './globals.css'
import type { Metadata } from 'next'
import { JetBrains_Mono, Playfair_Display, Sora } from 'next/font/google'
import { Providers } from './providers'
import { AuroraBackground } from '@/components/ui/aurora-background'

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const newsreader = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  style: ['normal', 'italic'],
  variable: '--font-serif',
  display: 'swap',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'AI Swing Trading Platform for NSE/BSE | SwingAI',
  description:
    'AI market intelligence for Indian stocks. 73%+ win rate, risk-engineered setups, and a 7-day free trial.',
  keywords: [
    'swing trading',
    'trading signals',
    'NSE',
    'BSE',
    'stock market',
    'risk management',
    'India',
  ],
  authors: [{ name: 'SwingAI' }],
  openGraph: {
    title: 'SwingAI | AI Swing Trading Intelligence',
    description:
      'AI trading signals for Indian markets with defined risk controls and a 7-day free trial.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sora.variable} ${newsreader.variable} ${jetbrainsMono.variable} bg-background-primary text-text-primary antialiased`}
      >
        <AuroraBackground className="min-h-screen h-auto w-full items-start justify-start bg-background-primary text-text-primary">
          <Providers>{children}</Providers>
        </AuroraBackground>
      </body>
    </html>
  )
}
