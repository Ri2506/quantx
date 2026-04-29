// ============================================================================
// QUANT X - POSITION ROW COMPONENT
// Live P&L position row with progress indicators
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import { Position } from '../../types'
import {
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  X,
  Edit,
} from 'lucide-react'
import { useState, useEffect } from 'react'

interface PositionRowProps {
  position: Position
  onClose?: (positionId: string) => void
  onEdit?: (positionId: string) => void
}

export default function PositionRow({
  position,
  onClose,
  onEdit,
}: PositionRowProps) {
  const [currentPrice, setCurrentPrice] = useState(position.current_price)
  const [pnl, setPnl] = useState(position.unrealized_pnl)
  const [pnlPercent, setPnlPercent] = useState(position.unrealized_pnl_percentage)
  const [pulseColor, setPulseColor] = useState<'green' | 'red' | null>(null)

  const isLong = position.direction === 'LONG'
  const isProfit = pnl >= 0

  // Simulate real-time price updates
  useEffect(() => {
    // In real app, this would be from WebSocket
    const interval = setInterval(() => {
      const randomChange = (Math.random() - 0.5) * 5
      const newPrice = currentPrice + randomChange
      const newPnl = isLong
        ? (newPrice - position.entry_price) * position.quantity
        : (position.entry_price - newPrice) * position.quantity
      const newPnlPercent = (newPnl / (position.entry_price * position.quantity)) * 100

      // Trigger pulse animation on change
      if (newPnl > pnl) {
        setPulseColor('green')
      } else if (newPnl < pnl) {
        setPulseColor('red')
      }

      setCurrentPrice(newPrice)
      setPnl(newPnl)
      setPnlPercent(newPnlPercent)

      // Clear pulse after animation
      setTimeout(() => setPulseColor(null), 500)
    }, 3000)

    return () => clearInterval(interval)
  }, [currentPrice, pnl, position, isLong])

  // Calculate progress to target
  const progressToTarget = isLong
    ? ((currentPrice - position.entry_price) / (position.target - position.entry_price)) * 100
    : ((position.entry_price - currentPrice) / (position.entry_price - position.target)) * 100

  // Calculate distance to SL
  const distanceToSL = isLong
    ? ((currentPrice - position.stop_loss) / (position.entry_price - position.stop_loss)) * 100
    : ((position.stop_loss - currentPrice) / (position.stop_loss - position.entry_price)) * 100

  // PR 59 — responsive layout. Below md: stacked sections. md+: horizontal row.
  // Action buttons always visible; on mobile they sit in the top-right next
  // to the symbol so one-thumb closing stays reachable.
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ backgroundColor: 'rgba(26, 26, 36, 0.8)' }}
      className="bg-background-elevated rounded-xl border border-d-border p-3 md:p-4 hover:border-white/20 transition-colors"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
        {/* ROW 1 on mobile: Symbol + direction + actions. On md+: first column. */}
        <div className="flex items-center gap-3 md:min-w-[150px]">
          <div
            className={`p-2 rounded-lg shrink-0 ${isLong ? 'bg-up/20' : 'bg-down/20'}`}
          >
            {isLong ? (
              <TrendingUp className="w-4 h-4 text-up" />
            ) : (
              <TrendingDown className="w-4 h-4 text-down" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-bold text-white truncate">{position.symbol}</div>
            <div className="text-xs text-d-text-muted truncate">
              {position.quantity} × ₹{position.entry_price.toFixed(2)}
            </div>
          </div>
          {/* Actions: inline on mobile, moved to end on desktop via md:hidden */}
          <div className="flex items-center gap-1.5 md:hidden">
            {onEdit && (
              <button
                onClick={() => onEdit(position.id)}
                className="touch-target p-2 rounded-lg bg-background-surface border border-d-border text-white/60"
                title="Edit SL/Target"
                aria-label="Edit stop loss or target"
              >
                <Edit className="w-4 h-4" />
              </button>
            )}
            {onClose && (
              <button
                onClick={() => onClose(position.id)}
                className="touch-target p-2 rounded-lg bg-down/20 border border-down/30 text-down"
                title="Close Position"
                aria-label="Close position"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* ROW 2 on mobile: Price + P&L side by side in a 2-col grid. */}
        <div className="grid grid-cols-2 md:flex md:items-center md:gap-4 gap-3">
          <div className="md:min-w-[100px]">
            <div className="text-xs text-d-text-muted mb-1">Current Price</div>
            <div className="text-sm font-mono font-bold text-white numeric">
              ₹{currentPrice.toFixed(2)}
            </div>
          </div>

          <motion.div
            animate={
              pulseColor
                ? {
                    scale: [1, 1.1, 1],
                    backgroundColor:
                      pulseColor === 'green'
                        ? ['rgba(16, 185, 129, 0.1)', 'rgba(16, 185, 129, 0.3)', 'rgba(16, 185, 129, 0.1)']
                        : ['rgba(239, 68, 68, 0.1)', 'rgba(239, 68, 68, 0.3)', 'rgba(239, 68, 68, 0.1)'],
                  }
                : {}
            }
            transition={{ duration: 0.5 }}
            className="md:min-w-[120px] md:px-3 md:py-2 rounded-lg"
          >
            <div className="text-xs text-d-text-muted mb-1">Unrealized P&amp;L</div>
            <div className={`text-sm font-mono font-bold numeric ${isProfit ? 'text-up' : 'text-down'}`}>
              {isProfit ? '+' : ''}₹{pnl.toFixed(2)}
            </div>
            <div className={`text-xs ${isProfit ? 'text-up' : 'text-down'}`}>
              ({isProfit ? '+' : ''}{pnlPercent.toFixed(2)}%)
            </div>
          </motion.div>
        </div>

        {/* ROW 3 on mobile: Target + SL progress bars. Uses flex-1 on md+ to fill. */}
        <div className="md:flex-1 space-y-2">
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-1 text-d-text-muted">
                <Target className="w-3 h-3" />
                <span>Target</span>
              </div>
              <span className="text-up font-mono numeric">
                ₹{position.target.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 bg-background-surface rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(Math.max(progressToTarget, 0), 100)}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-success/50 to-success"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-1 text-d-text-muted">
                <Shield className="w-3 h-3" />
                <span>Stop Loss</span>
              </div>
              <span className="text-down font-mono numeric">
                ₹{position.stop_loss.toFixed(2)}
              </span>
            </div>
            <div className="h-1.5 bg-background-surface rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(Math.max(distanceToSL, 0), 100)}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-danger/50 to-danger"
              />
            </div>
          </div>
        </div>

        {/* Actions: desktop only — mobile rendered above in the symbol row. */}
        <div className="hidden md:flex items-center gap-2">
          {onEdit && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onEdit(position.id)}
              className="p-2 rounded-lg bg-background-surface border border-d-border hover:border-white/20 text-white/60 hover:text-white transition-all"
              title="Edit SL/Target"
              aria-label="Edit stop loss or target"
            >
              <Edit className="w-4 h-4" />
            </motion.button>
          )}
          {onClose && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onClose(position.id)}
              className="p-2 rounded-lg bg-down/20 border border-down/30 hover:bg-down/30 text-down transition-all"
              title="Close Position"
              aria-label="Close position"
            >
              <X className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
