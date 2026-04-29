'use client'

import React from 'react'

interface StockAvatarProps {
  symbol: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const COLORS = [
  'bg-primary/20 text-primary',
  'bg-up/20 text-up',
  'bg-dot-blue/20 text-dot-blue',
  'bg-dot-purple/20 text-dot-purple',
  'bg-warning/20 text-warning',
  'bg-dot-indigo/20 text-dot-indigo',
]

export default function StockAvatar({ symbol, size = 'md', className = '' }: StockAvatarProps) {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
  }

  const colorIndex = symbol.charCodeAt(0) % COLORS.length
  const letter = symbol.charAt(0).toUpperCase()

  return (
    <div
      className={`${sizeClasses[size]} rounded-full flex items-center justify-center font-bold ${COLORS[colorIndex]} ${className}`}
    >
      {letter}
    </div>
  )
}
