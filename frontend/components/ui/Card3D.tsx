'use client'

import { useRef, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'

interface Card3DProps {
  children: React.ReactNode
  className?: string
  spotlight?: boolean
  maxTilt?: number
}

export default function Card3D({
  children,
  className,
  spotlight = true,
  maxTilt = 6,
}: Card3DProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState('')
  const [spotlightPos, setSpotlightPos] = useState({ x: '50%', y: '50%' })

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const card = cardRef.current
      if (!card) return

      const rect = card.getBoundingClientRect()
      const x = (e.clientX - rect.left) / rect.width
      const y = (e.clientY - rect.top) / rect.height

      const rotateX = (0.5 - y) * maxTilt
      const rotateY = (x - 0.5) * maxTilt

      setTransform(
        `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px)`
      )
      setSpotlightPos({ x: `${x * 100}%`, y: `${y * 100}%` })
    },
    [maxTilt]
  )

  const handleMouseLeave = useCallback(() => {
    setTransform('')
  }, [])

  return (
    <div className="card-3d-container">
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: transform || undefined,
          transition: transform
            ? 'none'
            : 'transform 0.4s cubic-bezier(0.03, 0.98, 0.52, 0.99)',
          transformStyle: 'preserve-3d',
          willChange: 'transform',
          ['--mouse-x' as any]: spotlightPos.x,
          ['--mouse-y' as any]: spotlightPos.y,
        }}
        className={cn(
          'relative',
          spotlight && 'card-3d-spotlight',
          className
        )}
      >
        {children}
      </div>
    </div>
  )
}
