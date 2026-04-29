import './globals.css'
import type { Metadata, Viewport } from 'next'
import { DM_Sans, DM_Mono } from 'next/font/google'
import { Providers } from './providers'

// PR 59 — mobile viewport config. `viewportFit: 'cover'` lets the page
// extend into the iOS notch + home-indicator areas; the safe-area CSS
// utilities in globals.css keep real content out of those regions.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: '#0A0D14',
}

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const dmMono = DM_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['300', '400', '500'],
})

// PR 107 — base URL for resolving relative OG image paths. The site
// URL falls back to a sensible default for local dev so share
// previews still work in staging without env juggling.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://quantx.app'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'AI Swing Trading Platform for NSE/BSE | Quant X',
  description:
    'AI market intelligence for Indian stocks. Engine-based signals, transparent track record, paper-trade free.',
  keywords: [
    'swing trading',
    'trading signals',
    'NSE',
    'BSE',
    'stock market',
    'risk management',
    'India',
  ],
  authors: [{ name: 'Quant X' }],
  openGraph: {
    title: 'Quant X | AI Swing Trading Intelligence',
    description:
      'Engine-based AI signals for Indian markets. Public track record, paper-trade free.',
    type: 'website',
    siteName: 'Quant X',
    // PR 107 — Next 14 picks up app/opengraph-image.tsx automatically
    // when no explicit images array is given, but we list it here so
    // any Twitter / Meta crawler that doesn't follow the convention
    // still resolves the right URL.
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Quant X — AI swing trading intelligence for Indian markets',
      },
    ],
  },
  // PR 107 — Twitter card metadata. Twitter ignores OG images unless
  // an explicit `card: summary_large_image` is set.
  twitter: {
    card: 'summary_large_image',
    title: 'Quant X | AI Swing Trading Intelligence',
    description:
      'Engine-based AI signals for Indian markets. Public track record, paper-trade free.',
    images: ['/opengraph-image'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${dmMono.variable} font-sans bg-main text-white antialiased noise-overlay`}
      >
        <div className="min-h-screen">
            <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  )
}
