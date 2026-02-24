// ============================================================================
// SWINGAI - STAT CARD COMPONENT
// Animated stat card with sparkline and icon
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface StatCardProps {
  title: string
  value: string | number
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral'
  icon: LucideIcon
  color: 'blue' | 'green' | 'purple' | 'orange' | 'red'
  prefix?: string
  suffix?: string
  sparklineData?: { value: number }[]
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-500',
    border: 'border-blue-500/20',
    glow: 'group-hover:shadow-glow-sm',
  },
  green: {
    bg: 'bg-green-500/10',
    text: 'text-green-500',
    border: 'border-green-500/20',
    glow: 'group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)]',
  },
  purple: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-500',
    border: 'border-purple-500/20',
    glow: 'group-hover:shadow-[0_0_20px_rgba(139,92,246,0.3)]',
  },
  orange: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-500',
    border: 'border-orange-500/20',
    glow: 'group-hover:shadow-[0_0_20px_rgba(249,115,22,0.3)]',
  },
  red: {
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    border: 'border-red-500/20',
    glow: 'group-hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]',
  },
}

export default function StatCard({
  title,
  value,
  change,
  changeType = 'neutral',
  icon: Icon,
  color,
  prefix = '',
  suffix = '',
  sparklineData,
}: StatCardProps) {
  const colors = colorClasses[color]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
      className={`group bg-background-surface/50 backdrop-blur-xl rounded-2xl border border-gray-800 p-6 hover:border-gray-700 transition-all ${colors.glow}`}
    >
      <div className="flex items-start justify-between mb-4">
        {/* Icon */}
        <motion.div
          whileHover={{ scale: 1.1, rotate: 5 }}
          transition={{ type: 'spring', stiffness: 400 }}
          className={`p-3 rounded-xl border ${colors.bg} ${colors.text} ${colors.border}`}
        >
          <Icon className="w-5 h-5" />
        </motion.div>

        {/* Change Indicator */}
        {change && (
          <div
            className={`flex items-center gap-1 text-sm font-medium ${
              changeType === 'positive'
                ? 'text-success'
                : changeType === 'negative'
                ? 'text-danger'
                : 'text-text-muted'
            }`}
          >
            {changeType === 'positive' && <ArrowUpRight className="w-4 h-4" />}
            {changeType === 'negative' && <ArrowDownRight className="w-4 h-4" />}
            {change}
          </div>
        )}
      </div>

      {/* Title */}
      <p className="text-text-secondary text-sm mb-1 font-medium">{title}</p>

      {/* Value */}
      <p className="text-3xl font-bold text-text-primary font-mono mb-3">
        {prefix}
        {typeof value === 'number' ? value.toLocaleString('en-IN') : value}
        {suffix}
      </p>

      {/* Sparkline */}
      {sparklineData && sparklineData.length > 0 && (
        <div className="h-12 -mx-2 -mb-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparklineData}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={
                  changeType === 'positive'
                    ? '#10B981'
                    : changeType === 'negative'
                    ? '#EF4444'
                    : '#3B82F6'
                }
                strokeWidth={2}
                dot={false}
                animationDuration={1000}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  )
}
