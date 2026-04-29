'use client'

import React from 'react'

interface SignalBadgeProps {
  direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL' | string
  className?: string
}

export default function SignalBadge({ direction, className = '' }: SignalBadgeProps) {
  const isLong = direction === 'LONG' || direction === 'BUY'

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
        isLong
          ? 'bg-up/15 text-up'
          : 'bg-down/15 text-down'
      } ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isLong ? 'bg-up' : 'bg-down'}`} />
      {direction}
    </span>
  )
}
