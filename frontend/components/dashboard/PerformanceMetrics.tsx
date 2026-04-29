// ============================================================================
// QUANT X - PERFORMANCE METRICS COMPONENT
// Win rate, profit factor, Sharpe ratio display
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Target, Zap } from 'lucide-react'

interface PerformanceMetricsProps {
  winRate: number
  profitFactor: number
  sharpeRatio: number
  maxDrawdown: number
  avgWin: number
  avgLoss: number
  totalTrades: number
  winningTrades: number
}

export default function PerformanceMetrics({
  winRate,
  profitFactor,
  sharpeRatio,
  maxDrawdown,
  avgWin,
  avgLoss,
  totalTrades,
  winningTrades,
}: PerformanceMetricsProps) {
  const metrics = [
    {
      label: 'Win Rate',
      value: `${winRate.toFixed(1)}%`,
      icon: Target,
      color: winRate >= 60 ? 'success' : winRate >= 50 ? 'warning' : 'danger',
      description: `${winningTrades} / ${totalTrades} trades`,
    },
    {
      label: 'Profit Factor',
      value: profitFactor.toFixed(2),
      icon: Zap,
      color: profitFactor >= 2 ? 'success' : profitFactor >= 1.5 ? 'warning' : 'danger',
      description: profitFactor >= 2 ? 'Excellent' : profitFactor >= 1.5 ? 'Good' : 'Needs improvement',
    },
    {
      label: 'Sharpe Ratio',
      value: sharpeRatio.toFixed(2),
      icon: TrendingUp,
      color: sharpeRatio >= 2 ? 'success' : sharpeRatio >= 1 ? 'warning' : 'danger',
      description: sharpeRatio >= 2 ? 'Excellent' : sharpeRatio >= 1 ? 'Good' : 'Poor',
    },
    {
      label: 'Max Drawdown',
      value: `${maxDrawdown.toFixed(1)}%`,
      icon: TrendingDown,
      color: maxDrawdown <= 10 ? 'success' : maxDrawdown <= 20 ? 'warning' : 'danger',
      description: maxDrawdown <= 10 ? 'Low risk' : maxDrawdown <= 20 ? 'Moderate' : 'High risk',
    },
  ]

  const colorClasses = {
    success: {
      bg: 'bg-up/10',
      text: 'text-up',
      border: 'border-up/20',
    },
    warning: {
      bg: 'bg-warning/10',
      text: 'text-warning',
      border: 'border-warning/20',
    },
    danger: {
      bg: 'bg-down/10',
      text: 'text-down',
      border: 'border-down/20',
    },
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric, index) => {
        const Icon = metric.icon
        const colors = colorClasses[metric.color as keyof typeof colorClasses]

        return (
          <motion.div
            key={metric.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -4 }}
            className="bg-background-surface rounded-xl border border-d-border p-4 hover:border-white/20 transition-colors"
          >
            {/* Icon & Value */}
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${colors.bg} border ${colors.border}`}>
                <Icon className={`w-5 h-5 ${colors.text}`} />
              </div>
              <div className={`text-3xl font-bold font-mono ${colors.text}`}>
                {metric.value}
              </div>
            </div>

            {/* Label */}
            <p className="text-sm font-medium text-white mb-1">{metric.label}</p>

            {/* Description */}
            <p className="text-xs text-d-text-muted">{metric.description}</p>
          </motion.div>
        )
      })}
    </div>
  )
}
