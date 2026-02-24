// ============================================================================
// SWINGAI - TRADE CALENDAR COMPONENT
// GitHub-style calendar heatmap of trading days
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import { Calendar, TrendingUp } from 'lucide-react'
import { useState } from 'react'

interface DayData {
  date: string
  trades: number
  pnl: number
}

interface TradeCalendarProps {
  data: DayData[]
}

export default function TradeCalendar({ data }: TradeCalendarProps) {
  const [hoveredDay, setHoveredDay] = useState<DayData | null>(null)
  const [hoveredPosition, setHoveredPosition] = useState<{ x: number; y: number } | null>(null)

  // Get color intensity based on P&L
  const getColor = (pnl: number) => {
    if (pnl === 0) return 'bg-gray-800'
    if (pnl >= 5000) return 'bg-success'
    if (pnl >= 2000) return 'bg-success/70'
    if (pnl >= 500) return 'bg-success/50'
    if (pnl > 0) return 'bg-success/30'
    if (pnl >= -500) return 'bg-danger/30'
    if (pnl >= -2000) return 'bg-danger/50'
    if (pnl >= -5000) return 'bg-danger/70'
    return 'bg-danger'
  }

  // Generate last 12 weeks of calendar
  const generateCalendar = () => {
    const weeks: DayData[][] = []
    const today = new Date()

    for (let week = 11; week >= 0; week--) {
      const weekData: DayData[] = []
      for (let day = 0; day < 7; day++) {
        const date = new Date(today)
        date.setDate(date.getDate() - (week * 7 + (6 - day)))

        const dateStr = date.toISOString().split('T')[0]
        const dayData = data.find((d) => d.date === dateStr)

        weekData.push(
          dayData || {
            date: dateStr,
            trades: 0,
            pnl: 0,
          }
        )
      }
      weeks.push(weekData)
    }

    return weeks
  }

  const weeks = generateCalendar()
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

  // Calculate monthly labels
  const getMonthLabel = (weekIndex: number) => {
    if (weekIndex === 0) return null
    const firstDay = weeks[weekIndex][0]
    const prevFirstDay = weeks[weekIndex - 1][0]
    const month = new Date(firstDay.date).getMonth()
    const prevMonth = new Date(prevFirstDay.date).getMonth()
    return month !== prevMonth ? months[month] : null
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
            <Calendar className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">Trade Calendar</h3>
            <p className="text-sm text-text-secondary">Last 12 weeks activity</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-text-muted">Less</span>
          <div className="flex gap-1">
            <div className="w-3 h-3 rounded-sm bg-gray-800" />
            <div className="w-3 h-3 rounded-sm bg-success/30" />
            <div className="w-3 h-3 rounded-sm bg-success/50" />
            <div className="w-3 h-3 rounded-sm bg-success/70" />
            <div className="w-3 h-3 rounded-sm bg-success" />
          </div>
          <span className="text-text-muted">More</span>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="relative">
        {/* Month Labels */}
        <div className="flex mb-2 ml-8">
          {weeks.map((week, weekIndex) => {
            const monthLabel = getMonthLabel(weekIndex)
            return (
              <div key={weekIndex} className="flex-1 text-xs text-text-muted">
                {monthLabel && <span>{monthLabel}</span>}
              </div>
            )
          })}
        </div>

        <div className="flex gap-1">
          {/* Weekday Labels */}
          <div className="flex flex-col gap-1 pr-2">
            {weekdays.map((day, i) => (
              <div
                key={day}
                className="h-3 flex items-center text-[10px] text-text-muted"
              >
                {i % 2 === 1 && day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="flex gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-1">
                {week.map((day, dayIndex) => (
                  <motion.button
                    key={`${weekIndex}-${dayIndex}`}
                    whileHover={{ scale: 1.2 }}
                    onHoverStart={(e) => {
                      setHoveredDay(day)
                      const rect = (e.target as HTMLElement).getBoundingClientRect()
                      setHoveredPosition({ x: rect.left, y: rect.top })
                    }}
                    onHoverEnd={() => {
                      setHoveredDay(null)
                      setHoveredPosition(null)
                    }}
                    className={`w-3 h-3 rounded-sm ${getColor(
                      day.pnl
                    )} transition-all cursor-pointer`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Tooltip */}
        {hoveredDay && hoveredPosition && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed z-50 p-3 bg-background-elevated border border-gray-700 rounded-xl shadow-2xl pointer-events-none"
            style={{
              left: hoveredPosition.x,
              top: hoveredPosition.y - 80,
            }}
          >
            <p className="text-xs text-text-primary font-bold mb-1">
              {new Date(hoveredDay.date).toLocaleDateString('en-IN', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="text-text-secondary">Trades:</span>
              <span className="text-text-primary font-bold">{hoveredDay.trades}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="text-text-secondary">P&L:</span>
              <span
                className={`font-bold font-mono ${
                  hoveredDay.pnl >= 0 ? 'text-success' : 'text-danger'
                }`}
              >
                {hoveredDay.pnl >= 0 ? '+' : ''}₹{hoveredDay.pnl.toLocaleString('en-IN')}
              </span>
            </div>
          </motion.div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-800">
        <div>
          <p className="text-text-secondary text-xs mb-1">Trading Days</p>
          <p className="text-lg font-bold text-text-primary">
            {data.filter((d) => d.trades > 0).length}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Total Trades</p>
          <p className="text-lg font-bold text-text-primary">
            {data.reduce((sum, d) => sum + d.trades, 0)}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Profitable Days</p>
          <p className="text-lg font-bold text-success">
            {data.filter((d) => d.pnl > 0).length}
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Best Day</p>
          <p className="text-lg font-bold text-success font-mono">
            +₹{Math.max(...data.map((d) => d.pnl), 0).toLocaleString('en-IN')}
          </p>
        </div>
      </div>
    </motion.div>
  )
}
