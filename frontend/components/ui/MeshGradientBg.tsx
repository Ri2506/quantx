'use client'

import { cn } from '@/lib/utils'

interface MeshGradientBgProps {
  children?: React.ReactNode
  className?: string
  intensity?: 'low' | 'medium' | 'high'
  withOrbs?: boolean
}

export default function MeshGradientBg({
  children,
  className,
  intensity = 'medium',
  withOrbs = false,
}: MeshGradientBgProps) {
  const intensityMap = {
    low: 'opacity-30',
    medium: 'opacity-60',
    high: 'opacity-100',
  }

  return (
    <div className={cn('relative', className)}>
      <div
        className={cn(
          'absolute inset-0 bg-mesh-gradient pointer-events-none',
          intensityMap[intensity]
        )}
        aria-hidden="true"
      />
      {withOrbs && (
        <div className="bg-glow-layer absolute inset-0 pointer-events-none" aria-hidden="true">
          <div className="glow-orb glow-orb-cyan" />
          <div className="glow-orb glow-orb-purple" />
          <div className="glow-orb glow-orb-green" />
        </div>
      )}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
