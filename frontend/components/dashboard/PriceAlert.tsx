// ============================================================================
// SWINGAI - PRICE ALERT COMPONENT
// Mini chart with draggable alert line
// ============================================================================

'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { LineChart, Line, ResponsiveContainer, ReferenceLine } from 'recharts'
import { Bell, TrendingUp, TrendingDown, X, Check } from 'lucide-react'

interface PriceAlertProps {
  symbol: string
  currentPrice: number
  chartData: { time: string; price: number }[]
  existingAlerts?: { price: number; type: 'above' | 'below' }[]
  onCreateAlert?: (price: number, type: 'above' | 'below') => void
  onDeleteAlert?: (price: number) => void
}

export default function PriceAlert({
  symbol,
  currentPrice,
  chartData,
  existingAlerts = [],
  onCreateAlert,
  onDeleteAlert,
}: PriceAlertProps) {
  const [alertPrice, setAlertPrice] = useState<number>(currentPrice)
  const [alertType, setAlertType] = useState<'above' | 'below'>('above')
  const [showForm, setShowForm] = useState(false)

  const handleCreateAlert = () => {
    if (onCreateAlert) {
      onCreateAlert(alertPrice, alertType)
      setShowForm(false)
    }
  }

  const minPrice = Math.min(...chartData.map((d) => d.price))
  const maxPrice = Math.max(...chartData.map((d) => d.price))
  const priceRange = maxPrice - minPrice

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background-surface/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-warning/10 border border-warning/20">
            <Bell className="w-4 h-4 text-warning" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary">{symbol}</h3>
            <p className="text-xs text-text-muted">Price Alerts</p>
          </div>
        </div>

        {/* Current Price */}
        <div className="text-right">
          <p className="text-xs text-text-muted">LTP</p>
          <p className="text-lg font-bold text-text-primary font-mono">
            ₹{currentPrice.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Mini Chart with Alert Lines */}
      <div className="relative h-32 mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <Line
              type="monotone"
              dataKey="price"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
              animationDuration={1000}
            />

            {/* Current Price Line */}
            <ReferenceLine
              y={currentPrice}
              stroke="#10B981"
              strokeDasharray="3 3"
              strokeWidth={2}
              label={{
                value: `₹${currentPrice.toFixed(2)}`,
                position: 'right',
                fill: '#10B981',
                fontSize: 10,
              }}
            />

            {/* Existing Alert Lines */}
            {existingAlerts.map((alert, i) => (
              <ReferenceLine
                key={i}
                y={alert.price}
                stroke={alert.type === 'above' ? '#F59E0B' : '#EF4444'}
                strokeDasharray="5 5"
                strokeWidth={2}
                label={{
                  value: `₹${alert.price.toFixed(2)}`,
                  position: 'right',
                  fill: alert.type === 'above' ? '#F59E0B' : '#EF4444',
                  fontSize: 10,
                }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>

        {/* Alert Type Indicators */}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          <div className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="text-text-muted">Current</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <span className="text-text-muted">Above Alert</span>
          </div>
          <div className="flex items-center gap-1 text-xs">
            <div className="w-2 h-2 rounded-full bg-danger" />
            <span className="text-text-muted">Below Alert</span>
          </div>
        </div>
      </div>

      {/* Existing Alerts List */}
      {existingAlerts.length > 0 && (
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-2">Active Alerts:</p>
          <div className="space-y-2">
            {existingAlerts.map((alert, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 bg-background-elevated rounded-lg border border-gray-800"
              >
                <div className="flex items-center gap-2">
                  {alert.type === 'above' ? (
                    <TrendingUp className="w-4 h-4 text-warning" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-danger" />
                  )}
                  <span className="text-sm text-text-secondary">
                    {alert.type === 'above' ? 'Above' : 'Below'}
                  </span>
                  <span className="text-sm font-bold text-text-primary font-mono">
                    ₹{alert.price.toFixed(2)}
                  </span>
                </div>
                {onDeleteAlert && (
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => onDeleteAlert(alert.price)}
                    className="p-1 rounded hover:bg-background-surface transition-colors"
                  >
                    <X className="w-3 h-3 text-danger" />
                  </motion.button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create Alert Form */}
      {showForm ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="space-y-3 p-3 bg-background-elevated rounded-lg border border-gray-800"
        >
          {/* Alert Type */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setAlertType('above')}
              className={`p-2 rounded-lg border font-medium text-sm transition-all ${
                alertType === 'above'
                  ? 'bg-warning/20 border-warning text-warning'
                  : 'bg-background-surface border-gray-800 text-text-secondary'
              }`}
            >
              <TrendingUp className="w-4 h-4 mx-auto mb-1" />
              Above
            </button>
            <button
              onClick={() => setAlertType('below')}
              className={`p-2 rounded-lg border font-medium text-sm transition-all ${
                alertType === 'below'
                  ? 'bg-danger/20 border-danger text-danger'
                  : 'bg-background-surface border-gray-800 text-text-secondary'
              }`}
            >
              <TrendingDown className="w-4 h-4 mx-auto mb-1" />
              Below
            </button>
          </div>

          {/* Alert Price */}
          <div>
            <label className="block text-xs text-text-muted mb-1">Alert Price</label>
            <input
              type="number"
              step="0.05"
              value={alertPrice}
              onChange={(e) => setAlertPrice(parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-background-surface border border-gray-800 rounded-lg text-text-primary font-mono focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Range Slider */}
          <div>
            <input
              type="range"
              min={minPrice}
              max={maxPrice}
              step="0.05"
              value={alertPrice}
              onChange={(e) => setAlertPrice(parseFloat(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>₹{minPrice.toFixed(2)}</span>
              <span>₹{maxPrice.toFixed(2)}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 px-3 py-2 bg-background-surface border border-gray-800 rounded-lg text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleCreateAlert}
              className="flex-1 px-3 py-2 bg-gradient-primary text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Create Alert
            </motion.button>
          </div>
        </motion.div>
      ) : (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowForm(true)}
          className="w-full px-4 py-2 bg-background-elevated border border-gray-800 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:border-gray-700 transition-all flex items-center justify-center gap-2"
        >
          <Bell className="w-4 h-4" />
          Create New Alert
        </motion.button>
      )}

      {/* Help Text */}
      <p className="text-xs text-text-muted text-center mt-3">
        Get notified via email, Telegram, or push when price crosses your alert
      </p>
    </motion.div>
  )
}
