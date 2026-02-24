import { cn } from '@/lib/utils'
import React from 'react'

type FeatureType = {
  title: string
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  description: string
}

type FeatureCardProps = React.ComponentProps<'div'> & {
  feature: FeatureType
}

export function FeatureCard({ feature, className, ...props }: FeatureCardProps) {
  const pattern = genPatternFromSeed(feature.title)

  return (
    <div className={cn('relative overflow-hidden p-6', className)} {...props}>
      <div className="relative z-10">
        <div className="pointer-events-none absolute left-1/2 top-0 -ml-20 -mt-2 h-full w-full [mask-image:linear-gradient(white,transparent)]">
          <div className="absolute inset-0 bg-gradient-to-r from-text-primary/5 to-text-primary/0 [mask-image:radial-gradient(farthest-side_at_top,white,transparent)] opacity-100">
            <GridPattern
              width={20}
              height={20}
              x="-12"
              y="4"
              squares={pattern}
              className="absolute inset-0 h-full w-full fill-text-primary/5 stroke-text-primary/25 mix-blend-overlay"
            />
          </div>
        </div>
        <feature.icon className="size-6 text-text-primary/75" strokeWidth={1} aria-hidden />
        <h3 className="mt-10 text-sm font-semibold text-text-primary md:text-base">{feature.title}</h3>
        <p className="relative z-20 mt-2 text-xs font-light text-text-secondary">{feature.description}</p>
      </div>
    </div>
  )
}

function GridPattern({
  width,
  height,
  x,
  y,
  squares,
  ...props
}: React.ComponentProps<'svg'> & { width: number; height: number; x: string; y: string; squares?: number[][] }) {
  const patternId = React.useId()

  return (
    <svg aria-hidden="true" {...props}>
      <defs>
        <pattern id={patternId} width={width} height={height} patternUnits="userSpaceOnUse" x={x} y={y}>
          <path d={`M.5 ${height}V.5H${width}`} fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${patternId})`} />
      {squares ? (
        <svg x={x} y={y} className="overflow-visible">
          {squares.map(([squareX, squareY], index) => (
            <rect
              strokeWidth="0"
              key={`${squareX}-${squareY}-${index}`}
              width={width + 1}
              height={height + 1}
              x={squareX * width}
              y={squareY * height}
            />
          ))}
        </svg>
      ) : null}
    </svg>
  )
}

function genPatternFromSeed(seed: string, length = 5): number[][] {
  const rand = mulberry32(hashSeed(seed))
  return Array.from({ length }, () => [
    Math.floor(rand() * 4) + 7,
    Math.floor(rand() * 6) + 1,
  ])
}

function hashSeed(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash >>> 0
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
