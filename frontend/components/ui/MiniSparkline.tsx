'use client'

import { AreaChart, Area, ResponsiveContainer } from 'recharts'

interface MiniSparklineProps {
  data: number[]
  color?: 'up' | 'down' | 'primary'
  width?: number
  height?: number
  className?: string
}

const colorMap = {
  up: { stroke: '#22c55e', fill: '#22c55e' },
  down: { stroke: '#FF5947', fill: '#FF5947' },
  primary: { stroke: '#4FECCD', fill: '#4FECCD' },
}

export default function MiniSparkline({
  data,
  color = 'primary',
  width = 64,
  height = 24,
  className = '',
}: MiniSparklineProps) {
  if (!data || data.length < 2) return null

  const trend = data[data.length - 1] >= data[0] ? 'up' : 'down'
  const resolvedColor = color === 'primary' ? 'primary' : trend
  const { stroke, fill } = colorMap[resolvedColor]
  const chartData = data.map((v, i) => ({ v, i }))
  const gradientId = `spark-${Math.random().toString(36).slice(2, 8)}`

  return (
    <div className={className} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 1, right: 0, bottom: 1, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity={0.3} />
              <stop offset="100%" stopColor={fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
