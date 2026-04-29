'use client'

import { useRef, useCallback, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'

const Lottie = dynamic(() => import('lottie-react'), { ssr: false })

interface LottieIconProps {
  /** Lottie animation JSON data */
  data: Record<string, unknown>
  /** Size in pixels (square) or 'auto' for responsive */
  size?: number | 'auto'
  /** Width override (for non-square animations) */
  width?: number | string
  /** Height override (for non-square animations) */
  height?: number | string
  /** Loop the animation */
  loop?: boolean
  /** Autoplay on mount */
  autoplay?: boolean
  /** Only play on hover (desktop feature cards) */
  playOnHover?: boolean
  /** Additional classes */
  className?: string
}

export default function LottieIcon({
  data,
  size,
  width,
  height,
  loop = true,
  autoplay = true,
  playOnHover = false,
  className,
}: LottieIconProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lottieRef = useRef<any>(null)

  // Autoplay on mobile even when playOnHover is true (no hover on touch)
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const handleMouseEnter = useCallback(() => {
    if (playOnHover && lottieRef.current) {
      lottieRef.current.play()
    }
  }, [playOnHover])

  const handleMouseLeave = useCallback(() => {
    if (playOnHover && lottieRef.current) {
      lottieRef.current.stop()
    }
  }, [playOnHover])

  const style: React.CSSProperties = {}
  if (size === 'auto') {
    style.width = '100%'
    style.height = '100%'
  } else if (size) {
    style.width = size
    style.height = size
  }
  if (width) style.width = width
  if (height) style.height = height

  return (
    <div
      onMouseEnter={playOnHover ? handleMouseEnter : undefined}
      onMouseLeave={playOnHover ? handleMouseLeave : undefined}
      className={className}
    >
      <Lottie
        lottieRef={lottieRef}
        animationData={data}
        loop={loop}
        autoplay={playOnHover ? isMobile : autoplay}
        style={style}
      />
    </div>
  )
}
