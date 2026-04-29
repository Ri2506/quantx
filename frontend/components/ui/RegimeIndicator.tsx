'use client'

interface RegimeIndicatorProps {
  regime: 'bull' | 'sideways' | 'bear'
  confidence?: number
  size?: 'sm' | 'md'
  className?: string
}

const regimeConfig = {
  bull: {
    label: 'Bullish',
    bg: 'bg-up/10',
    text: 'text-up',
    dot: 'bg-up',
  },
  sideways: {
    label: 'Sideways',
    bg: 'bg-warning/10',
    text: 'text-warning',
    dot: 'bg-warning',
  },
  bear: {
    label: 'Bearish',
    bg: 'bg-down/10',
    text: 'text-down',
    dot: 'bg-down',
  },
}

export default function RegimeIndicator({
  regime,
  confidence,
  size = 'sm',
  className = '',
}: RegimeIndicatorProps) {
  const config = regimeConfig[regime]
  const padding = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1'
  const textSize = size === 'sm' ? 'text-[11px]' : 'text-xs'

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${config.bg} ${padding} ${className}`}>
      <span className={`relative flex h-2 w-2`}>
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${config.dot} opacity-40`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${config.dot}`} />
      </span>
      <span className={`font-medium ${config.text} ${textSize}`}>
        {config.label}
      </span>
      {confidence !== undefined && (
        <span className={`font-mono ${config.text} ${textSize} opacity-70`}>
          {Math.round(confidence)}%
        </span>
      )}
    </span>
  )
}
