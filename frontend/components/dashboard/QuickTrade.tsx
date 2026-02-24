// ============================================================================
// SWINGAI - QUICK TRADE COMPONENT
// Modal for fast order entry with execution suggestions
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  X,
  Search,
  TrendingUp,
  TrendingDown,
  Shield,
  Target,
  Calculator,
  Zap,
  Loader2,
} from 'lucide-react'

// ============================================================================
// VALIDATION SCHEMA
// ============================================================================

const tradeSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  direction: z.enum(['BUY', 'SELL']),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  orderType: z.enum(['MARKET', 'LIMIT', 'SL', 'SL-M']),
  price: z.number().optional(),
  stopLoss: z.number().optional(),
  target: z.number().optional(),
  product: z.enum(['CNC', 'MIS', 'NRML']),
})

type TradeFormData = z.infer<typeof tradeSchema>

interface QuickTradeProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: TradeFormData) => Promise<void>
  defaultSymbol?: string
  defaultDirection?: 'BUY' | 'SELL'
  // Signal-based props for auto-fill
  initialSymbol?: string
  initialDirection?: 'LONG' | 'SHORT' | 'BUY' | 'SELL'
  initialEntryPrice?: number
  initialStopLoss?: number
  initialTarget?: number
}

// ============================================================================
// MOCK STOCK SEARCH DATA
// ============================================================================

const mockStocks = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', price: 2456.75 },
  { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3678.90 },
  { symbol: 'INFY', name: 'Infosys Limited', price: 1456.30 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Limited', price: 1567.45 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Limited', price: 987.60 },
]

export default function QuickTrade({
  isOpen,
  onClose,
  onSubmit,
  defaultSymbol = '',
  defaultDirection = 'BUY',
  initialSymbol,
  initialDirection,
  initialEntryPrice,
  initialStopLoss,
  initialTarget,
}: QuickTradeProps) {
  // Convert LONG/SHORT to BUY/SELL
  const convertDirection = (dir?: string): 'BUY' | 'SELL' => {
    if (dir === 'LONG' || dir === 'BUY') return 'BUY'
    if (dir === 'SHORT' || dir === 'SELL') return 'SELL'
    return defaultDirection
  }

  const effectiveSymbol = initialSymbol || defaultSymbol
  const effectiveDirection = convertDirection(initialDirection || defaultDirection)

  const [searchQuery, setSearchQuery] = useState(effectiveSymbol)
  const [selectedStock, setSelectedStock] = useState<any>(
    effectiveSymbol ? { symbol: effectiveSymbol, name: effectiveSymbol, price: initialEntryPrice || 0 } : null
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [riskPercentage, setRiskPercentage] = useState(2)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TradeFormData>({
    resolver: zodResolver(tradeSchema),
    defaultValues: {
      symbol: effectiveSymbol,
      direction: effectiveDirection,
      orderType: 'MARKET',
      product: 'MIS',
      quantity: 1,
      price: initialEntryPrice,
      stopLoss: initialStopLoss,
      target: initialTarget,
    },
  })

  // Update form when props change
  useEffect(() => {
    if (initialSymbol) {
      setValue('symbol', initialSymbol)
      setSearchQuery(initialSymbol)
      setSelectedStock({ symbol: initialSymbol, name: initialSymbol, price: initialEntryPrice || 0 })
    }
    if (initialDirection) setValue('direction', convertDirection(initialDirection))
    if (initialEntryPrice) setValue('price', initialEntryPrice)
    if (initialStopLoss) setValue('stopLoss', initialStopLoss)
    if (initialTarget) setValue('target', initialTarget)
  }, [initialSymbol, initialDirection, initialEntryPrice, initialStopLoss, initialTarget, setValue])

  const direction = watch('direction')
  const quantity = watch('quantity')
  const price = watch('price')
  const stopLoss = watch('stopLoss')
  const target = watch('target')

  // Filter stocks based on search
  const filteredStocks = mockStocks.filter(
    (stock) =>
      stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      stock.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate position size based on risk
  const calculateQuantity = () => {
    if (!selectedStock || !stopLoss) return

    const capital = 100000 // Mock: Get from user profile
    const riskAmount = (capital * riskPercentage) / 100
    const riskPerShare = Math.abs((price || selectedStock.price) - stopLoss)

    if (riskPerShare > 0) {
      const calculatedQty = Math.floor(riskAmount / riskPerShare)
      setValue('quantity', calculatedQty)
    }
  }

  // Handle form submission
  const handleFormSubmit = async (data: TradeFormData) => {
    setIsSubmitting(true)
    try {
      await onSubmit(data)
      onClose()
    } catch (error) {
      console.error('Trade submission failed:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Calculate potential profit/loss
  const calculatePnL = () => {
    if (!quantity || !price || !target || !stopLoss) return null

    const potentialProfit = (target - price) * quantity
    const potentialLoss = (price - stopLoss) * quantity
    const riskReward = potentialProfit / potentialLoss

    return { potentialProfit, potentialLoss, riskReward }
  }

  const pnl = calculatePnL()

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-background-surface border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-text-primary">Quick Trade</h2>
                    <p className="text-sm text-text-secondary">Place order in seconds</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-background-elevated transition-colors"
                >
                  <X className="w-5 h-5 text-text-muted" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
                  {/* Stock Search */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Search Stock
                    </label>
                    <div className="relative">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by symbol or name..."
                        className="w-full pl-12 pr-4 py-3 bg-background-elevated border border-gray-800 rounded-xl text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    {/* Search Results */}
                    {searchQuery && (
                      <div className="mt-2 max-h-40 overflow-y-auto bg-background-elevated border border-gray-800 rounded-xl divide-y divide-gray-800">
                        {filteredStocks.map((stock) => (
                          <button
                            key={stock.symbol}
                            type="button"
                            onClick={() => {
                              setSelectedStock(stock)
                              setSearchQuery(stock.symbol)
                              setValue('symbol', stock.symbol)
                              setValue('price', stock.price)
                            }}
                            className="w-full p-3 text-left hover:bg-background-surface transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-bold text-text-primary">{stock.symbol}</div>
                                <div className="text-xs text-text-muted">{stock.name}</div>
                              </div>
                              <div className="text-sm font-mono text-text-primary">
                                ₹{stock.price.toFixed(2)}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Direction & Order Type */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Direction
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setValue('direction', 'BUY')}
                          className={`p-3 rounded-xl border font-medium transition-all ${
                            direction === 'BUY'
                              ? 'bg-success/20 border-success text-success'
                              : 'bg-background-elevated border-gray-800 text-text-secondary hover:border-gray-700'
                          }`}
                        >
                          <TrendingUp className="w-4 h-4 mx-auto mb-1" />
                          BUY
                        </button>
                        <button
                          type="button"
                          onClick={() => setValue('direction', 'SELL')}
                          className={`p-3 rounded-xl border font-medium transition-all ${
                            direction === 'SELL'
                              ? 'bg-danger/20 border-danger text-danger'
                              : 'bg-background-elevated border-gray-800 text-text-secondary hover:border-gray-700'
                          }`}
                        >
                          <TrendingDown className="w-4 h-4 mx-auto mb-1" />
                          SELL
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Order Type
                      </label>
                      <select
                        {...register('orderType')}
                        className="w-full px-4 py-3 bg-background-elevated border border-gray-800 rounded-xl text-text-primary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="MARKET">Market</option>
                        <option value="LIMIT">Limit</option>
                        <option value="SL">Stop Loss</option>
                        <option value="SL-M">SL-Market</option>
                      </select>
                    </div>
                  </div>

                  {/* Price & Quantity */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        Price
                      </label>
                      <input
                        {...register('price', { valueAsNumber: true })}
                        type="number"
                        step="0.05"
                        placeholder="₹ 0.00"
                        className="w-full px-4 py-3 bg-background-elevated border border-gray-800 rounded-xl text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2 flex items-center justify-between">
                        <span>Quantity</span>
                        <button
                          type="button"
                          onClick={calculateQuantity}
                          className="text-xs text-primary hover:text-primary-dark"
                        >
                          <Calculator className="w-3 h-3 inline mr-1" />
                          Auto-calc
                        </button>
                      </label>
                      <input
                        {...register('quantity', { valueAsNumber: true })}
                        type="number"
                        placeholder="0"
                        className="w-full px-4 py-3 bg-background-elevated border border-gray-800 rounded-xl text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  {/* Risk % Slider */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Risk per Trade: {riskPercentage}%
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="5"
                      step="0.5"
                      value={riskPercentage}
                      onChange={(e) => setRiskPercentage(parseFloat(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  {/* Stop Loss & Target */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        <Shield className="w-4 h-4 inline mr-1 text-danger" />
                        Stop Loss
                      </label>
                      <input
                        {...register('stopLoss', { valueAsNumber: true })}
                        type="number"
                        step="0.05"
                        placeholder="₹ 0.00"
                        className="w-full px-4 py-3 bg-background-elevated border border-gray-800 rounded-xl text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-2">
                        <Target className="w-4 h-4 inline mr-1 text-success" />
                        Target
                      </label>
                      <input
                        {...register('target', { valueAsNumber: true })}
                        type="number"
                        step="0.05"
                        placeholder="₹ 0.00"
                        className="w-full px-4 py-3 bg-background-elevated border border-gray-800 rounded-xl text-text-primary font-mono placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                    </div>
                  </div>

                  {/* P&L Preview */}
                  {pnl && (
                    <div className="bg-background-elevated rounded-xl p-4 border border-gray-800">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <p className="text-xs text-text-muted mb-1">Potential Profit</p>
                          <p className="text-lg font-bold text-success font-mono">
                            +₹{pnl.potentialProfit.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Potential Loss</p>
                          <p className="text-lg font-bold text-danger font-mono">
                            -₹{pnl.potentialLoss.toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-text-muted mb-1">Risk:Reward</p>
                          <p className="text-lg font-bold text-text-primary">
                            1:{pnl.riskReward.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Product Type */}
                  <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Product Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {['CNC', 'MIS', 'NRML'].map((product) => (
                        <button
                          key={product}
                          type="button"
                          onClick={() => setValue('product', product as any)}
                          className={`p-3 rounded-xl border font-medium transition-all ${
                            watch('product') === product
                              ? 'bg-primary/20 border-primary text-primary'
                              : 'bg-background-elevated border-gray-800 text-text-secondary hover:border-gray-700'
                          }`}
                        >
                          {product}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Submit */}
                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 px-6 py-3 bg-background-elevated border border-gray-800 rounded-xl text-text-primary font-medium hover:border-gray-700 transition-all"
                    >
                      Cancel
                    </button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={isSubmitting || !selectedStock}
                      className="flex-1 px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium shadow-glow-sm hover:shadow-glow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Placing Order...
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5" />
                          Place Order
                        </>
                      )}
                    </motion.button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
