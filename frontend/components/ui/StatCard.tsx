'use client'

import React from 'react'

interface StatCardProps {
  label: string
  value: string | number
  change?: string
  changeType?: 'up' | 'down' | 'neutral'
  icon?: React.ReactNode
  className?: string
}

export default function StatCard({ label, value, change, changeType = 'neutral', icon, className = '' }: StatCardProps) {
  const changeColors = {
    up: 'text-up bg-up/10',
    down: 'text-down bg-down/10',
    neutral: 'text-d-text-muted bg-white/[0.04]',
  }

  return (
    <div className={`data-card p-5 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="stat-label">{label}</span>
        {icon && <span className="text-d-text-muted">{icon}</span>}
      </div>
      <div className="stat-value text-2xl">{value}</div>
      {change && (
        <span className={`inline-flex items-center mt-2 text-xs font-medium rounded-full px-2 py-0.5 ${changeColors[changeType]}`}>
          {changeType === 'up' && '▲ '}
          {changeType === 'down' && '▼ '}
          {change}
        </span>
      )}
    </div>
  )
}
