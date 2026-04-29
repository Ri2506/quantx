'use client'

import React, { useRef, useCallback } from 'react'

interface GlowCardProps {
  children: React.ReactNode
  className?: string
  glowColor?: string
}

export default function GlowCard({
  children,
  className = '',
  glowColor = 'rgba(79, 236, 205, 0.06)',
}: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    ref.current.style.setProperty('--glow-x', `${x}px`)
    ref.current.style.setProperty('--glow-y', `${y}px`)
  }, [])

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={`group relative overflow-hidden rounded-xl border border-d-border bg-d-bg-card/80 backdrop-blur-xl transition-all duration-300 hover:border-white/10 ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 z-10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: `radial-gradient(600px circle at var(--glow-x, 50%) var(--glow-y, 50%), ${glowColor}, transparent 40%)`,
        }}
      />
      <div className="relative z-20">{children}</div>
    </div>
  )
}
