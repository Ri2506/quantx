// ============================================================================
// SWINGAI - MARKET TICKER COMPONENT
// Scrolling marquee with Nifty, BankNifty, VIX
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity } from 'lucide-react'

interface MarketData {
  symbol: string
  price: number
  change: number
  changePercent: number
}

interface MarketTickerProps {
  data?: MarketData[]
}

const defaultData: MarketData[] = [
  { symbol: 'NIFTY 50', price: 21453.75, change: 145.30, changePercent: 0.68 },
  { symbol: 'BANK NIFTY', price: 45678.90, change: -234.50, changePercent: -0.51 },
  { symbol: 'NIFTY IT', price: 32456.20, change: 89.45, changePercent: 0.28 },
  { symbol: 'INDIA VIX', price: 13.45, change: -0.75, changePercent: -5.28 },
  { symbol: 'NIFTY MIDCAP', price: 43210.55, change: 321.40, changePercent: 0.75 },
  { symbol: 'SENSEX', price: 70987.65, change: 456.80, changePercent: 0.65 },
]

export default function MarketTicker({ data = defaultData }: MarketTickerProps) {
  // Duplicate data for seamless loop
  const tickerData = [...data, ...data, ...data]

  return (
    <div className="bg-background-surface/50 backdrop-blur-xl rounded-2xl border border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-800">
        <Activity className="w-5 h-5 text-primary" />
        <span className="text-sm font-bold text-text-primary">Market Overview</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
          <span className="text-xs text-text-muted">Live</span>
        </div>
      </div>

      {/* Ticker */}
      <div className="relative overflow-hidden py-4">
        {/* Gradient Fade Edges */}
        <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-background-surface to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-background-surface to-transparent z-10" />

        {/* Scrolling Content */}
        <motion.div
          className="flex gap-8"
          animate={{
            x: [0, -1800], // Adjust based on content width
          }}
          transition={{
            x: {
              repeat: Infinity,
              repeatType: 'loop',
              duration: 30,
              ease: 'linear',
            },
          }}
        >
          {tickerData.map((item, index) => {
            const isPositive = item.change >= 0

            return (
              <motion.div
                key={`${item.symbol}-${index}`}
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-4 px-4 py-2 bg-background-elevated rounded-lg border border-gray-800 whitespace-nowrap cursor-pointer hover:border-gray-700 transition-all"
              >
                {/* Symbol */}
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded ${
                      isPositive ? 'bg-success/20' : 'bg-danger/20'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-4 h-4 text-success" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-danger" />
                    )}
                  </div>
                  <span className="text-sm font-bold text-text-primary">
                    {item.symbol}
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-text-primary">
                    {item.price.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>

                  {/* Change */}
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                      isPositive
                        ? 'bg-success/20 text-success'
                        : 'bg-danger/20 text-danger'
                    }`}
                  >
                    <span>
                      {isPositive ? '+' : ''}
                      {item.change.toFixed(2)}
                    </span>
                    <span>
                      ({isPositive ? '+' : ''}
                      {item.changePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </div>
  )
}
