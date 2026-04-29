'use client'

interface ModelScoreBadgeProps {
  score: number
  modelName?: string
  className?: string
}

export default function ModelScoreBadge({
  score,
  modelName,
  className = '',
}: ModelScoreBadgeProps) {
  const clamped = Math.max(0, Math.min(1, score))
  const pct = Math.round(clamped * 100)
  const color = pct >= 60 ? 'text-orange bg-orange/10' : pct >= 35 ? 'text-warning bg-warning/10' : 'text-down bg-down/10'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium font-mono tabular-nums ${color} ${className}`}
      title={modelName ? `${modelName}: ${pct}%` : `Signal Strength: ${pct}%`}
    >
      <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.3" />
        <circle
          cx="6" cy="6" r="5"
          stroke="currentColor" strokeWidth="1.5"
          strokeDasharray={`${clamped * 31.4} 31.4`}
          strokeLinecap="round"
          transform="rotate(-90 6 6)"
        />
      </svg>
      {modelName ? `${modelName} ${pct}%` : `Strength ${pct}%`}
    </span>
  )
}
