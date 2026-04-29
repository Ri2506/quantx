/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ---------- Bundle Optimization ----------
  // Tree-shake Lucide icons (only import what's used)
  modularizeImports: {
    'lucide-react': {
      transform: 'lucide-react/dist/esm/icons/{{ kebabCase member }}',
    },
  },
  // Enable gzip + brotli compression in production
  compress: true,
  // Reduce output size by not including source maps in production
  productionBrowserSourceMaps: false,
  // Optimize package imports for heavy libraries
  experimental: {
    optimizePackageImports: ['recharts', 'date-fns', 'framer-motion'],
  },
  
  // ---------- Security headers ----------
  // PR 56 — CSP tightened for production:
  //   * script-src drops 'unsafe-eval' (not needed by Next 14 prod builds);
  //     'unsafe-inline' stays because Next App Router emits inline flight
  //     data scripts (__next_f) that would otherwise break rendering.
  //     Moving to nonce-based CSP requires an edge middleware rewrite —
  //     deferred until we have a reason to pay that cost.
  //   * connect-src pinned to an explicit origin allowlist. Dev still
  //     allows localhost + ws: because HMR + Next dev server need it;
  //     production does not.
  //   * frame-ancestors 'none' — no one embeds the app in an iframe; this
  //     is the strongest anti-clickjacking posture.
  //
  // External origins we actually call from the browser:
  //   Supabase (auth + realtime)    https://*.supabase.co + wss://*.supabase.co
  //   Our backend API               ${NEXT_PUBLIC_API_URL}        (explicit)
  //   TradingView widget            https://*.tradingview.com
  //   Razorpay checkout             https://*.razorpay.com
  //   PostHog product analytics     https://app.posthog.com, https://us.i.posthog.com, https://us-assets.i.posthog.com
  // PR 97 — Sentry is backend-only. Client-side crashes flow through
  // /api/client-errors → PostHog (CLIENT_ERROR_CAPTURED) and the
  // backend Sentry SDK captures server exceptions. The frontend has no
  // @sentry/nextjs dep, so the legacy ingest.sentry.io allowlist below
  // was dead surface area; dropping it tightens CSP without losing any
  // observability path.
  async headers() {
    const isProd = process.env.NODE_ENV === 'production'
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
    const apiOrigin = (() => {
      try { return apiUrl ? new URL(apiUrl).origin : '' } catch { return '' }
    })()
    const apiWsOrigin = apiOrigin
      .replace(/^https:\/\//, 'wss://')
      .replace(/^http:\/\//, 'ws://')

    // Explicit allowlist — production.
    const connectSrcProd = [
      "'self'",
      'https://*.supabase.co',
      'wss://*.supabase.co',
      apiOrigin,
      apiWsOrigin,
      'https://*.tradingview.com',
      'https://*.razorpay.com',
      'https://app.posthog.com',
      'https://us.i.posthog.com',
      'https://us-assets.i.posthog.com',
    ].filter(Boolean).join(' ')

    // Dev permissive — HMR / local API.
    const connectSrcDev = "'self' https: wss: ws: http://localhost:* ws://localhost:*"

    const scriptSrc = [
      "'self'",
      "'unsafe-inline'",
      // Dev needs eval for Fast Refresh; prod does not.
      !isProd && "'unsafe-eval'",
      'https://s3.tradingview.com',
      'https://s.tradingview.com',
      'https://www.tradingview.com',
      'https://*.tradingview.com',
      'https://checkout.razorpay.com',
      'https://app.posthog.com',
      'https://us-assets.i.posthog.com',
    ].filter(Boolean).join(' ')

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              `script-src ${scriptSrc}`,
              "style-src 'self' 'unsafe-inline' https://*.tradingview.com",
              "img-src 'self' data: blob: https:",
              "font-src 'self' data: https://*.tradingview.com",
              "frame-src 'self' https://*.tradingview.com https://*.razorpay.com",
              `connect-src ${isProd ? connectSrcProd : connectSrcDev}`,
              "media-src 'self' https:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join('; ')
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
        ]
      }
    ]
  },
  
  // Proxy API and WebSocket requests to the backend
  async rewrites() {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:8000'
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `${backendUrl}/ws/:path*`,
      },
    ]
  },

  // Allow TradingView images
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.tradingview.com',
      },
      {
        protocol: 'https',
        hostname: 's3.tradingview.com',
      },
    ],
  },
}

module.exports = nextConfig
