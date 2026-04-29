'use client'

import dynamic from 'next/dynamic'

const LottieIcon = dynamic(() => import('./LottieIcon'), { ssr: false })

// Import the Lottie data at build time for fast inline loading
import loaderData from '@/lib/lottie/loader-orbital.json'

/**
 * Premium loading animation — orbital Lottie + shimmer bar
 */
export default function PremiumLoader({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {/* Lottie orbital loader */}
      <div className="relative">
        <LottieIcon data={loaderData} width={100} height={62} loop autoplay />
        {/* Ambient glow behind loader */}
        <div className="absolute inset-0 -m-4 rounded-full bg-primary/[0.04] blur-2xl" />
      </div>

      {/* Text with gradient shimmer */}
      <div className="flex flex-col items-center gap-1.5">
        <p className="text-sm font-medium text-d-text-secondary">{text}</p>
        <div className="h-0.5 w-12 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full w-6 rounded-full bg-gradient-to-r from-transparent via-primary to-transparent"
            style={{ animation: 'shimmer 1.5s linear infinite' }}
          />
        </div>
      </div>
    </div>
  )
}
