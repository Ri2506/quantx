// ============================================================================
// SWINGAI - RISK GAUGE COMPONENT
// Circular gauge showing portfolio risk utilization
// ============================================================================

'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, AlertTriangle, Info } from 'lucide-react'

interface RiskGaugeProps {
  dailyRisk: number
  weeklyRisk: number
  monthlyRisk: number
  maxDailyRisk: number
  maxWeeklyRisk: number
  maxMonthlyRisk: number
}

type Period = 'daily' | 'weekly' | 'monthly'

export default function RiskGauge({
  dailyRisk,
  weeklyRisk,
  monthlyRisk,
  maxDailyRisk,
  maxWeeklyRisk,
  maxMonthlyRisk,
}: RiskGaugeProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('daily')

  const periods = {
    daily: {
      label: 'Daily',
      current: dailyRisk,
      max: maxDailyRisk,
      percentage: (dailyRisk / maxDailyRisk) * 100,
    },
    weekly: {
      label: 'Weekly',
      current: weeklyRisk,
      max: maxWeeklyRisk,
      percentage: (weeklyRisk / maxWeeklyRisk) * 100,
    },
    monthly: {
      label: 'Monthly',
      current: monthlyRisk,
      max: maxMonthlyRisk,
      percentage: (monthlyRisk / maxMonthlyRisk) * 100,
    },
  }

  const current = periods[selectedPeriod]
  const percentage = Math.min(current.percentage, 100)

  // Determine color based on risk level
  const getColor = () => {
    if (percentage >= 80) return { stroke: '#EF4444', glow: 'shadow-[0_0_30px_rgba(239,68,68,0.4)]' }
    if (percentage >= 60) return { stroke: '#F59E0B', glow: 'shadow-[0_0_30px_rgba(245,158,11,0.4)]' }
    return { stroke: '#10B981', glow: 'shadow-[0_0_30px_rgba(16,185,129,0.4)]' }
  }

  const color = getColor()

  // SVG circle calculations
  const size = 200
  const strokeWidth = 20
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (percentage / 100) * circumference

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background-surface/50 backdrop-blur-xl rounded-2xl border border-gray-800 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
            <Shield className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">Risk Utilization</h3>
            <p className="text-sm text-text-secondary">Capital at risk</p>
          </div>
        </div>

        {/* Info */}
        <button className="p-2 rounded-lg hover:bg-background-elevated transition-colors">
          <Info className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2 mb-8 bg-background-elevated rounded-xl p-1 border border-gray-800">
        {Object.entries(periods).map(([key, period]) => (
          <button
            key={key}
            onClick={() => setSelectedPeriod(key as Period)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedPeriod === key
                ? 'bg-gradient-primary text-white shadow-glow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {period.label}
          </button>
        ))}
      </div>

      {/* Gauge */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative">
          <svg width={size} height={size} className={`transform -rotate-90 ${color.glow}`}>
            {/* Background Circle */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke="#1F2937"
              strokeWidth={strokeWidth}
              fill="none"
            />

            {/* Progress Circle */}
            <motion.circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={color.stroke}
              strokeWidth={strokeWidth}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>

          {/* Center Text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
              className="text-center"
            >
              <div className={`text-4xl font-bold font-mono ${
                percentage >= 80 ? 'text-danger' :
                percentage >= 60 ? 'text-warning' :
                'text-success'
              }`}>
                {percentage.toFixed(0)}%
              </div>
              <div className="text-xs text-text-muted mt-1">Used</div>
            </motion.div>
          </div>
        </div>

        {/* Warning if high risk */}
        {percentage >= 80 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mt-4 px-4 py-2 bg-danger/10 border border-danger/20 rounded-lg"
          >
            <AlertTriangle className="w-4 h-4 text-danger" />
            <span className="text-sm text-danger font-medium">
              High risk utilization!
            </span>
          </motion.div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-800">
        <div>
          <p className="text-text-secondary text-xs mb-1">Current Risk</p>
          <p className="text-lg font-bold text-text-primary font-mono">
            ₹{current.current.toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Max Allowed</p>
          <p className="text-lg font-bold text-text-primary font-mono">
            ₹{current.max.toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Available</p>
          <p className="text-lg font-bold text-success font-mono">
            ₹{(current.max - current.current).toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Status</p>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                percentage >= 80
                  ? 'bg-danger'
                  : percentage >= 60
                  ? 'bg-warning'
                  : 'bg-success'
              } animate-pulse`}
            />
            <p
              className={`text-sm font-bold ${
                percentage >= 80
                  ? 'text-danger'
                  : percentage >= 60
                  ? 'text-warning'
                  : 'text-success'
              }`}
            >
              {percentage >= 80 ? 'Critical' : percentage >= 60 ? 'Warning' : 'Safe'}
            </p>
          </div>
        </div>
      </div>

      {/* Risk Zones Legend */}
      <div className="mt-6 pt-4 border-t border-gray-800 space-y-2">
        <p className="text-xs text-text-muted font-medium mb-2">Risk Zones:</p>
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 rounded bg-success" />
          <span className="text-xs text-text-secondary">0-60% (Safe)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 rounded bg-warning" />
          <span className="text-xs text-text-secondary">60-80% (Caution)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 rounded bg-danger" />
          <span className="text-xs text-text-secondary">80-100% (Critical)</span>
        </div>
      </div>
    </motion.div>
  )
}
