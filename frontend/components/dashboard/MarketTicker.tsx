// ============================================================================
// QUANT X - MARKET TICKER COMPONENT
// Scrolling marquee with live market indices
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Activity, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

interface MarketData {
  symbol: string
  price: number
  change: number
  changePercent: number
}

interface MarketTickerProps {
  data?: MarketData[]
}

const INDEX_SYMBOLS = ['NIFTY 50', 'BANK NIFTY', 'NIFTY IT', 'INDIA VIX', 'NIFTY MIDCAP', 'SENSEX']

export default function MarketTicker({ data: externalData }: MarketTickerProps) {
  const [liveData, setLiveData] = useState<MarketData[]>([])
  const [loading, setLoading] = useState(!externalData)

  useEffect(() => {
    if (externalData) return

    let mounted = true

    const fetchIndices = async () => {
      try {
        const res = await api.market.getIndices()
        if (!mounted) return

        // Normalize response to MarketData[]
        const indices: MarketData[] = []
        if (Array.isArray(res?.indices || res)) {
          const arr = res?.indices || res
          for (const item of arr as any[]) {
            indices.push({
              symbol: item.symbol || item.name || '',
              price: item.price || item.last || item.close || 0,
              change: item.change ?? 0,
              changePercent: item.changePercent ?? item.change_percent ?? item.pchange ?? 0,
            })
          }
        }

        if (indices.length > 0) {
          setLiveData(indices)
        }
      } catch (err) {
        console.error('MarketTicker: failed to fetch indices', err)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    fetchIndices()
    const interval = setInterval(fetchIndices, 30_000)

    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [externalData])

  const data = externalData || liveData

  if (loading) {
    return (
      <div className="bg-background-surface rounded-2xl border border-d-border overflow-hidden">
        <div className="flex items-center gap-2 px-6 py-3 border-b border-d-border">
          <Activity className="w-5 h-5 text-primary" />
          <span className="text-sm font-bold text-white">Market Overview</span>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-d-text-muted animate-spin" />
        </div>
      </div>
    )
  }

  if (data.length === 0) return null

  // Duplicate data for seamless loop
  const tickerData = [...data, ...data, ...data]

  return (
    <div className="bg-background-surface rounded-2xl border border-d-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-d-border">
        <Activity className="w-5 h-5 text-primary" />
        <span className="text-sm font-bold text-white">Market Overview</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-up animate-pulse" />
          <span className="text-xs text-d-text-muted">Live</span>
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
            x: [0, -1800],
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
                className="flex items-center gap-4 px-4 py-2 bg-background-elevated rounded-lg border border-d-border whitespace-nowrap cursor-pointer hover:border-white/20 transition-all"
              >
                {/* Symbol */}
                <div className="flex items-center gap-2">
                  <div
                    className={`p-1.5 rounded ${
                      isPositive ? 'bg-up/20' : 'bg-down/20'
                    }`}
                  >
                    {isPositive ? (
                      <TrendingUp className="w-4 h-4 text-up" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-down" />
                    )}
                  </div>
                  <span className="text-sm font-bold text-white">
                    {item.symbol}
                  </span>
                </div>

                {/* Price */}
                <div className="flex items-center gap-3">
                  <span className="text-sm font-mono text-white">
                    {item.price.toLocaleString('en-IN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>

                  {/* Change */}
                  <div
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${
                      isPositive
                        ? 'bg-up/20 text-up'
                        : 'bg-down/20 text-down'
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
