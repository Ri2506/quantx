'use client'

import { cn } from '@/lib/utils'

interface GradientBorderProps {
  children: React.ReactNode
  className?: string
  animated?: boolean
}

export default function GradientBorder({
  children,
  className,
  animated = true,
}: GradientBorderProps) {
  return (
    <div
      className={cn(
        animated ? 'gradient-border' : 'gradient-border-static',
        className
      )}
    >
      {children}
    </div>
  )
}
