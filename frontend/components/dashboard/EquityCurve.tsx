// ============================================================================
// SWINGAI - EQUITY CURVE COMPONENT
// Line chart with drawdown overlay
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { TrendingUp, AlertTriangle } from 'lucide-react'

interface EquityCurveProps {
  data: {
    date: string
    equity: number
    drawdown: number
  }[]
}

export default function EquityCurve({ data }: EquityCurveProps) {
  // Calculate max drawdown
  const maxDrawdown = Math.min(...data.map((d) => d.drawdown))

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const equity = payload[0].value
      const drawdown = payload[1].value

      return (
        <div className="bg-background-elevated/95 backdrop-blur-sm border border-gray-800 rounded-xl p-3 shadow-xl">
          <p className="text-text-secondary text-xs mb-2">{payload[0].payload.date}</p>
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-text-muted">Equity:</span>
              <span className="text-sm font-bold text-success font-mono">
                ₹{equity.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-text-muted">Drawdown:</span>
              <span className="text-sm font-bold text-danger font-mono">
                {drawdown.toFixed(2)}%
              </span>
            </div>
          </div>
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
          <div className="p-2 rounded-lg bg-success/10 border border-success/20">
            <TrendingUp className="w-5 h-5 text-success" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">Equity Curve</h3>
            <p className="text-sm text-text-secondary">Portfolio value over time</p>
          </div>
        </div>

        {/* Max Drawdown Badge */}
        <div className="flex items-center gap-2 px-4 py-2 bg-danger/10 border border-danger/20 rounded-xl">
          <AlertTriangle className="w-4 h-4 text-danger" />
          <div>
            <p className="text-xs text-text-muted">Max Drawdown</p>
            <p className="text-sm font-bold text-danger font-mono">
              {maxDrawdown.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10B981" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0.1} />
              </linearGradient>
              <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0.05} />
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
              yAxisId="left"
              stroke="#6B7280"
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `₹${(value / 1000).toFixed(0)}k`}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#6B7280"
              tick={{ fill: '#9CA3AF', fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
              domain={[maxDrawdown - 5, 0]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: '20px' }}
              iconType="line"
              formatter={(value) => (
                <span className="text-sm text-text-secondary">{value}</span>
              )}
            />

            {/* Drawdown Area (Background) */}
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="drawdown"
              stroke="#EF4444"
              strokeWidth={2}
              fill="url(#drawdownGradient)"
              name="Drawdown"
              animationDuration={1000}
            />

            {/* Equity Line (Foreground) */}
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="equity"
              stroke="#10B981"
              strokeWidth={3}
              dot={false}
              name="Equity"
              animationDuration={1000}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-800">
        <div>
          <p className="text-text-secondary text-xs mb-1">Starting Capital</p>
          <p className="text-lg font-bold text-text-primary font-mono">
            ₹{data[0]?.equity.toLocaleString('en-IN') || 0}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Current Equity</p>
          <p className="text-lg font-bold text-success font-mono">
            ₹{data[data.length - 1]?.equity.toLocaleString('en-IN') || 0}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Total Gain</p>
          <p className="text-lg font-bold text-success font-mono">
            +₹
            {(
              (data[data.length - 1]?.equity || 0) - (data[0]?.equity || 0)
            ).toLocaleString('en-IN')}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">ROI</p>
          <p className="text-lg font-bold text-success font-mono">
            +
            {(
              ((data[data.length - 1]?.equity - data[0]?.equity) /
                data[0]?.equity) *
              100
            ).toFixed(2)}
            %
          </p>
        </div>
      </div>
    </motion.div>
  )
}
