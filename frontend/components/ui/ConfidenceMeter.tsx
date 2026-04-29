'use client'

interface ConfidenceMeterProps {
  score: number
  size?: 'sm' | 'md'
  label?: string
  showValue?: boolean
  className?: string
}

function getColor(score: number): string {
  if (score >= 70) return '#FF9900'  // orange accent for high confidence
  if (score >= 40) return '#FEB113'
  return '#FF5947'
}

export default function ConfidenceMeter({
  score,
  size = 'sm',
  label,
  showValue = true,
  className = '',
}: ConfidenceMeterProps) {
  const clamped = Math.max(0, Math.min(100, score))
  const color = getColor(clamped)
  const h = size === 'sm' ? 'h-1.5' : 'h-2.5'

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {label && (
        <span className="shrink-0 text-[11px] text-d-text-muted">{label}</span>
      )}
      <div className={`relative flex-1 overflow-hidden rounded-full bg-white/[0.06] ${h}`}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
      {showValue && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums" style={{ color }}>
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  )
}
