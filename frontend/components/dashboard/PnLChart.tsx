// ============================================================================
// SWINGAI - P&L CHART COMPONENT
// Area chart with gradient fill and multiple timeframes
// ============================================================================

'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp } from 'lucide-react'

interface PnLChartProps {
  data: { date: string; value: number }[]
  title?: string
}

const timeframes = [
  { label: '1D', value: '1d' },
  { label: '1W', value: '1w' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '1Y', value: '1y' },
  { label: 'All', value: 'all' },
]

export default function PnLChart({ data, title = 'Portfolio Performance' }: PnLChartProps) {
  const [selectedTimeframe, setSelectedTimeframe] = useState('1m')

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const value = payload[0].value
      const isPositive = value >= 0

      return (
        <div className="bg-background-elevated/95 backdrop-blur-sm border border-gray-800 rounded-xl p-3 shadow-xl">
          <p className="text-text-secondary text-xs mb-1">{payload[0].payload.date}</p>
          <p
            className={`text-lg font-bold font-mono ${
              isPositive ? 'text-success' : 'text-danger'
            }`}
          >
            {isPositive ? '+' : ''}₹{value.toLocaleString('en-IN')}
          </p>
        </div>
      )
    }
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background-surface/50 backdrop-blur-xl rounded-2xl border border-gray-800 p-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">{title}</h3>
            <p className="text-sm text-text-secondary">Cumulative P&L over time</p>
          </div>
        </div>

        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 bg-background-elevated rounded-xl p-1 border border-gray-800">
          {timeframes.map((tf) => (
            <motion.button
              key={tf.value}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedTimeframe(tf.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedTimeframe === tf.value
                  ? 'bg-gradient-primary text-white shadow-glow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-background-surface'
              }`}
            >
              {tf.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#374151"
              strokeOpacity={0.3}
              vertical={false}
            />
            <XAxis
              dataKey="date"
              stroke="#6B7280"
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#6B7280"
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#3B82F6', strokeWidth: 1 }} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#10B981"
              strokeWidth={3}
              fill="url(#pnlGradient)"
              animationDuration={1000}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-800">
        <div>
          <p className="text-text-secondary text-xs mb-1">Total P&L</p>
          <p className="text-xl font-bold text-success font-mono">
            +₹{data[data.length - 1]?.value.toLocaleString('en-IN') || 0}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Best Day</p>
          <p className="text-xl font-bold text-success font-mono">
            +₹{Math.max(...data.map((d) => d.value)).toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Worst Day</p>
          <p className="text-xl font-bold text-danger font-mono">
            ₹{Math.min(...data.map((d) => d.value)).toLocaleString('en-IN')}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
