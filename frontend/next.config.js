/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  
  // Security headers including CSP for TradingView
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://s3.tradingview.com https://s.tradingview.com https://www.tradingview.com https://*.tradingview.com",
              "style-src 'self' 'unsafe-inline' https://s3.tradingview.com https://www.tradingview.com https://*.tradingview.com",
              "img-src 'self' data: blob: https: http:",
              "font-src 'self' data: https://s3.tradingview.com https://*.tradingview.com",
              "frame-src 'self' https://s.tradingview.com https://www.tradingview.com https://*.tradingview.com",
              "connect-src 'self' https: wss: ws:",
              "media-src 'self' https:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'",
            ].join('; ')
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()'
          }
        ]
      }
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
