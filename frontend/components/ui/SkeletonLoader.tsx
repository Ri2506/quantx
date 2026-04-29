'use client'

import { cn } from '@/lib/utils'

interface SkeletonLoaderProps {
  variant?: 'text' | 'card' | 'chart' | 'table-row' | 'stat'
  className?: string
  lines?: number
}

export default function SkeletonLoader({
  variant = 'text',
  className,
  lines = 3,
}: SkeletonLoaderProps) {
  if (variant === 'text') {
    return (
      <div className={cn('space-y-3', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer h-4 rounded"
            style={{ width: i === lines - 1 ? '60%' : '100%' }}
          />
        ))}
      </div>
    )
  }

  if (variant === 'card') {
    return (
      <div className={cn('glass-card p-6 space-y-4', className)}>
        <div className="skeleton-shimmer h-6 w-1/3 rounded" />
        <div className="skeleton-shimmer h-4 w-full rounded" />
        <div className="skeleton-shimmer h-4 w-4/5 rounded" />
        <div className="skeleton-shimmer h-32 w-full rounded-lg" />
      </div>
    )
  }

  if (variant === 'chart') {
    return (
      <div className={cn('glass-card p-6', className)}>
        <div className="skeleton-shimmer h-5 w-1/4 rounded mb-4" />
        <div className="skeleton-shimmer h-48 w-full rounded-lg" />
      </div>
    )
  }

  if (variant === 'table-row') {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 px-4">
            <div className="skeleton-shimmer h-8 w-8 rounded-full" />
            <div className="skeleton-shimmer h-4 w-24 rounded" />
            <div className="skeleton-shimmer h-4 w-16 rounded ml-auto" />
            <div className="skeleton-shimmer h-4 w-20 rounded" />
          </div>
        ))}
      </div>
    )
  }

  // stat variant
  return (
    <div className={cn('glass-card p-6', className)}>
      <div className="skeleton-shimmer h-4 w-1/3 rounded mb-3" />
      <div className="skeleton-shimmer h-8 w-2/3 rounded mb-2" />
      <div className="skeleton-shimmer h-3 w-1/2 rounded" />
    </div>
  )
}
