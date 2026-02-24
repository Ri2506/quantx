// ============================================================================
// SWINGAI - POSITION ROW COMPONENT
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ backgroundColor: 'rgba(26, 26, 36, 0.8)' }}
      className="bg-background-elevated/50 backdrop-blur-sm rounded-xl border border-gray-800 p-4 hover:border-gray-700 transition-all"
    >
      <div className="flex items-center gap-4">
        {/* Symbol & Direction */}
        <div className="flex items-center gap-3 min-w-[150px]">
          <div
            className={`p-2 rounded-lg ${
              isLong ? 'bg-success/20' : 'bg-danger/20'
            }`}
          >
            {isLong ? (
              <TrendingUp className="w-4 h-4 text-success" />
            ) : (
              <TrendingDown className="w-4 h-4 text-danger" />
            )}
          </div>
          <div>
            <div className="font-bold text-text-primary">{position.symbol}</div>
            <div className="text-xs text-text-muted">
              {position.quantity} × ₹{position.entry_price.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Current Price */}
        <div className="min-w-[100px]">
          <div className="text-xs text-text-muted mb-1">Current Price</div>
          <div className="text-sm font-mono font-bold text-text-primary">
            ₹{currentPrice.toFixed(2)}
          </div>
        </div>

        {/* P&L */}
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
          className="min-w-[120px] px-3 py-2 rounded-lg"
        >
          <div className="text-xs text-text-muted mb-1">Unrealized P&L</div>
          <div
            className={`text-sm font-mono font-bold ${
              isProfit ? 'text-success' : 'text-danger'
            }`}
          >
            {isProfit ? '+' : ''}₹{pnl.toFixed(2)}
          </div>
          <div
            className={`text-xs ${isProfit ? 'text-success' : 'text-danger'}`}
          >
            ({isProfit ? '+' : ''}
            {pnlPercent.toFixed(2)}%)
          </div>
        </motion.div>

        {/* Progress Indicators */}
        <div className="flex-1">
          {/* Target Progress */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-1 text-text-muted">
                <Target className="w-3 h-3" />
                <span>Target</span>
              </div>
              <span className="text-success font-mono">
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

          {/* Stop Loss Distance */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <div className="flex items-center gap-1 text-text-muted">
                <Shield className="w-3 h-3" />
                <span>Stop Loss</span>
              </div>
              <span className="text-danger font-mono">
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

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Edit SL/Target */}
          {onEdit && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onEdit(position.id)}
              className="p-2 rounded-lg bg-background-surface border border-gray-800 hover:border-gray-700 text-text-secondary hover:text-text-primary transition-all"
              title="Edit SL/Target"
            >
              <Edit className="w-4 h-4" />
            </motion.button>
          )}

          {/* Close Position */}
          {onClose && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onClose(position.id)}
              className="p-2 rounded-lg bg-danger/20 border border-danger/30 hover:bg-danger/30 text-danger transition-all"
              title="Close Position"
            >
              <X className="w-4 h-4" />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
