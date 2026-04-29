'use client'

interface RiskLevelBadgeProps {
  level: 'low' | 'medium' | 'high' | 'very-high'
  className?: string
}

const levelConfig = {
  low: { label: 'Low Risk', bg: 'bg-up/10', text: 'text-up' },
  medium: { label: 'Medium Risk', bg: 'bg-warning/10', text: 'text-warning' },
  high: { label: 'High Risk', bg: 'bg-down/10', text: 'text-down' },
  'very-high': { label: 'Very High', bg: 'bg-down/10', text: 'text-down' },
}

export default function RiskLevelBadge({ level, className = '' }: RiskLevelBadgeProps) {
  const config = levelConfig[level]

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.bg} ${config.text} ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${level === 'low' ? 'bg-up' : level === 'medium' ? 'bg-warning' : 'bg-down'}`} />
      {config.label}
    </span>
  )
}
