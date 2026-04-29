'use client'

import { cn } from '@/lib/utils'

interface StatusDotProps {
  status: 'live' | 'warning' | 'offline'
  className?: string
  label?: string
}

export default function StatusDot({ status, className, label }: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'status-dot',
          status === 'live' && 'status-live',
          status === 'warning' && 'status-warning',
          status === 'offline' && 'status-offline'
        )}
      />
      {label && (
        <span className="text-xs font-medium text-d-text-muted">{label}</span>
      )}
    </span>
  )
}
