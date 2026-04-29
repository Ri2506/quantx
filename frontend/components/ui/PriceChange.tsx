'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

interface PriceChangeProps {
  value: number
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
}

const sizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
}

const iconSizes = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
  lg: 'h-4 w-4',
}

export default function PriceChange({
  value,
  size = 'sm',
  showIcon = true,
  className = '',
}: PriceChangeProps) {
  const isPositive = value > 0
  const isZero = value === 0
  const color = isZero ? 'text-d-text-muted' : isPositive ? 'text-up' : 'text-down'
  const Icon = isZero ? Minus : isPositive ? TrendingUp : TrendingDown
  const sign = isPositive ? '+' : ''

  return (
    <span className={`inline-flex items-center gap-1 font-mono tabular-nums ${sizeClasses[size]} ${color} ${className}`}>
      {showIcon && <Icon className={iconSizes[size]} />}
      {sign}{value.toFixed(2)}%
    </span>
  )
}
