'use client'

import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface Stat {
  label: string
  value: string
  trend?: 'up' | 'down' | 'neutral'
}

interface StatsBarProps {
  stats: Stat[]
  className?: string
}

export default function StatsBar({ stats, className = '' }: StatsBarProps) {
  return (
    <div className={`w-full border-y border-d-border bg-white/[0.02] px-4 py-4 backdrop-blur-sm ${className}`}>
      <div className="scrollbar-hide mx-auto flex max-w-7xl items-center justify-center gap-6 overflow-x-auto md:gap-12">
        {stats.map((stat, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div className="h-8 w-px shrink-0 bg-d-border" />}
            <div className="flex shrink-0 flex-col items-center">
              <div className="flex items-center gap-1.5">
                <span
                  className={`font-mono text-xl font-bold tabular-nums md:text-2xl ${
                    stat.trend === 'up'
                      ? 'text-up'
                      : stat.trend === 'down'
                      ? 'text-down'
                      : 'text-white'
                  }`}
                >
                  {stat.value}
                </span>
                {stat.trend === 'up' && <TrendingUp className="h-4 w-4 text-up" />}
                {stat.trend === 'down' && <TrendingDown className="h-4 w-4 text-down" />}
              </div>
              <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-d-text-muted">
                {stat.label}
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}
