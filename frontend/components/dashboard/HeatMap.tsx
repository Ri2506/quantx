// ============================================================================
// SWINGAI - HEATMAP COMPONENT
// Sector performance visualization
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react'
import { useState } from 'react'

interface SectorData {
  name: string
  change: number
  topGainers: string[]
  topLosers: string[]
}

interface HeatMapProps {
  data?: SectorData[]
}

const defaultData: SectorData[] = [
  {
    name: 'IT',
    change: 2.34,
    topGainers: ['TCS +3.2%', 'INFY +2.8%', 'WIPRO +2.1%'],
    topLosers: [],
  },
  {
    name: 'Banking',
    change: -0.87,
    topGainers: ['ICICIBANK +1.5%'],
    topLosers: ['HDFCBANK -1.8%', 'SBIN -2.1%'],
  },
  {
    name: 'Auto',
    change: 1.56,
    topGainers: ['TATAMOTORS +2.9%', 'M&M +2.2%'],
    topLosers: [],
  },
  {
    name: 'Pharma',
    change: -1.23,
    topGainers: [],
    topLosers: ['SUNPHARMA -2.3%', 'DRREDDY -1.8%'],
  },
  {
    name: 'FMCG',
    change: 0.45,
    topGainers: ['HINDUNILVR +0.8%'],
    topLosers: [],
  },
  {
    name: 'Metals',
    change: 3.12,
    topGainers: ['TATASTEEL +4.5%', 'HINDALCO +3.8%'],
    topLosers: [],
  },
  {
    name: 'Energy',
    change: -2.01,
    topGainers: [],
    topLosers: ['RELIANCE -2.5%', 'ONGC -1.9%'],
  },
  {
    name: 'Realty',
    change: 1.89,
    topGainers: ['DLF +3.1%', 'GODREJPROP +2.5%'],
    topLosers: [],
  },
  {
    name: 'Media',
    change: -0.34,
    topGainers: [],
    topLosers: ['ZEEL -1.2%'],
  },
  {
    name: 'Telecom',
    change: 0.78,
    topGainers: ['BHARTIARTL +1.5%'],
    topLosers: [],
  },
  {
    name: 'Infra',
    change: 2.67,
    topGainers: ['LT +3.4%', 'ADANIPORTS +2.9%'],
    topLosers: [],
  },
  {
    name: 'PSU',
    change: -1.45,
    topGainers: [],
    topLosers: ['COALINDIA -2.1%', 'NTPC -1.8%'],
  },
]

export default function HeatMap({ data = defaultData }: HeatMapProps) {
  const [hoveredSector, setHoveredSector] = useState<string | null>(null)

  // Get color based on performance
  const getColor = (change: number) => {
    if (change >= 2) return 'bg-success text-white'
    if (change >= 1) return 'bg-success/70 text-white'
    if (change >= 0.5) return 'bg-success/50 text-white'
    if (change > 0) return 'bg-success/30 text-success'
    if (change > -0.5) return 'bg-danger/30 text-danger'
    if (change > -1) return 'bg-danger/50 text-white'
    if (change > -2) return 'bg-danger/70 text-white'
    return 'bg-danger text-white'
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
            <BarChart3 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-text-primary">Sector Performance</h3>
            <p className="text-sm text-text-secondary">Today's sectoral heatmap</p>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-success" />
            <span className="text-text-muted">Gainers</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-danger" />
            <span className="text-text-muted">Losers</span>
          </div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {data.map((sector) => {
          const isPositive = sector.change >= 0
          const isHovered = hoveredSector === sector.name

          return (
            <motion.div
              key={sector.name}
              whileHover={{ scale: 1.05, zIndex: 10 }}
              onHoverStart={() => setHoveredSector(sector.name)}
              onHoverEnd={() => setHoveredSector(null)}
              className={`relative p-4 rounded-xl ${getColor(
                sector.change
              )} cursor-pointer transition-all ${
                isHovered ? 'ring-2 ring-primary shadow-glow-md' : ''
              }`}
            >
              {/* Sector Name */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold">{sector.name}</span>
                {isPositive ? (
                  <TrendingUp className="w-4 h-4" />
                ) : (
                  <TrendingDown className="w-4 h-4" />
                )}
              </div>

              {/* Change Percentage */}
              <div className="text-2xl font-bold font-mono">
                {isPositive ? '+' : ''}
                {sector.change.toFixed(2)}%
              </div>

              {/* Tooltip on Hover */}
              {isHovered && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute top-full left-0 mt-2 w-64 p-3 bg-background-elevated border border-gray-700 rounded-xl shadow-2xl z-20"
                >
                  {sector.topGainers.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs text-success font-bold mb-1">
                        Top Gainers
                      </p>
                      <ul className="space-y-1">
                        {sector.topGainers.map((stock, i) => (
                          <li key={i} className="text-xs text-text-secondary">
                            {stock}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {sector.topLosers.length > 0 && (
                    <div>
                      <p className="text-xs text-danger font-bold mb-1">
                        Top Losers
                      </p>
                      <ul className="space-y-1">
                        {sector.topLosers.map((stock, i) => (
                          <li key={i} className="text-xs text-text-secondary">
                            {stock}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-800">
        <div>
          <p className="text-text-secondary text-xs mb-1">Top Sector</p>
          <p className="text-sm font-bold text-success">
            {data.reduce((max, sector) =>
              sector.change > max.change ? sector : max
            ).name}{' '}
            +
            {data
              .reduce((max, sector) => (sector.change > max.change ? sector : max))
              .change.toFixed(2)}
            %
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Worst Sector</p>
          <p className="text-sm font-bold text-danger">
            {data.reduce((min, sector) =>
              sector.change < min.change ? sector : min
            ).name}{' '}
            {data
              .reduce((min, sector) => (sector.change < min.change ? sector : min))
              .change.toFixed(2)}
            %
          </p>
        </div>
        <div>
          <p className="text-text-secondary text-xs mb-1">Avg Change</p>
          <p
            className={`text-sm font-bold ${
              data.reduce((sum, s) => sum + s.change, 0) / data.length >= 0
                ? 'text-success'
                : 'text-danger'
            }`}
          >
            {(data.reduce((sum, s) => sum + s.change, 0) / data.length).toFixed(2)}%
          </p>
        </div>
      </div>
    </motion.div>
  )
}
