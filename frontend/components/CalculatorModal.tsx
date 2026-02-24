'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calculator, TrendingUp, Shield, DollarSign, Percent, AlertTriangle } from 'lucide-react'

interface CalculatorModalProps {
  isOpen: boolean
  onClose: () => void
  type: 'position' | 'risk'
}

export default function CalculatorModal({ isOpen, onClose, type }: CalculatorModalProps) {
  // Position Sizing Calculator State
  const [capital, setCapital] = useState('')
  const [riskPercent, setRiskPercent] = useState('2')
  const [entryPrice, setEntryPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')

  // Risk Management Calculator State
  const [totalCapital, setTotalCapital] = useState('')
  const [positionValue, setPositionValue] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')

  // Position Sizing Calculations
  const calculatePositionSize = () => {
    const cap = parseFloat(capital)
    const risk = parseFloat(riskPercent)
    const entry = parseFloat(entryPrice)
    const stop = parseFloat(stopLoss)

    if (!cap || !risk || !entry || !stop || entry <= stop) return null

    const riskAmount = (cap * risk) / 100
    const stopLossPercent = ((entry - stop) / entry) * 100
    const quantity = Math.floor(riskAmount / (entry - stop))
    const positionSize = quantity * entry

    return {
      riskAmount: riskAmount.toFixed(2),
      quantity,
      positionSize: positionSize.toFixed(2),
      stopLossPercent: stopLossPercent.toFixed(2),
      maxLoss: riskAmount.toFixed(2),
    }
  }

  // Risk Management Calculations
  const calculateRisk = () => {
    const cap = parseFloat(totalCapital)
    const posValue = parseFloat(positionValue)
    const target = parseFloat(targetPrice)
    const current = parseFloat(currentPrice)

    if (!cap || !posValue || !target || !current) return null

    const positionPercent = (posValue / cap) * 100
    const potentialProfit = ((target - current) / current) * 100
    const profitAmount = posValue * (potentialProfit / 100)
    const riskReward = target > current ? (target - current) / (current - (current * 0.95)) : 0

    return {
      positionPercent: positionPercent.toFixed(2),
      potentialProfit: potentialProfit.toFixed(2),
      profitAmount: profitAmount.toFixed(2),
      riskReward: riskReward.toFixed(2),
      recommendation: positionPercent > 10 ? 'HIGH RISK' : positionPercent > 5 ? 'MODERATE' : 'LOW RISK',
    }
  }

  const positionResults = type === 'position' ? calculatePositionSize() : null
  const riskResults = type === 'risk' ? calculateRisk() : null

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-2xl rounded-2xl border border-border/60 bg-background-surface shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 p-6">
            <div className="flex items-center gap-3">
              {type === 'position' ? (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
                  <Calculator className="h-6 w-6 text-primary" />
                </div>
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/15">
                  <Shield className="h-6 w-6 text-accent" />
                </div>
              )}
              <div>
                <h2 className="text-xl font-bold text-text-primary">
                  {type === 'position' ? 'Position Sizing Calculator' : 'Risk Management Calculator'}
                </h2>
                <p className="text-sm text-text-secondary">
                  {type === 'position'
                    ? 'Calculate optimal position size for Indian stocks'
                    : 'Analyze risk and potential returns'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 text-text-secondary transition hover:border-danger/60 hover:text-danger"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {type === 'position' ? (
              <>
                {/* Position Sizing Form */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">
                      Total Capital (₹)
                    </label>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
                      <input
                        type="number"
                        value={capital}
                        onChange={(e) => setCapital(e.target.value)}
                        placeholder="100000"
                        className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 pl-10 pr-4 text-text-primary placeholder-text-secondary transition focus:border-primary/60 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">
                      Risk Per Trade (%)
                    </label>
                    <div className="relative">
                      <Percent className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
                      <input
                        type="number"
                        value={riskPercent}
                        onChange={(e) => setRiskPercent(e.target.value)}
                        placeholder="2"
                        step="0.5"
                        className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 pl-10 pr-4 text-text-primary placeholder-text-secondary transition focus:border-primary/60 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">
                      Entry Price (₹)
                    </label>
                    <input
                      type="number"
                      value={entryPrice}
                      onChange={(e) => setEntryPrice(e.target.value)}
                      placeholder="2500"
                      className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 px-4 text-text-primary placeholder-text-secondary transition focus:border-primary/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">
                      Stop Loss (₹)
                    </label>
                    <input
                      type="number"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      placeholder="2400"
                      className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 px-4 text-text-primary placeholder-text-secondary transition focus:border-primary/60 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Results */}
                {positionResults && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-6"
                  >
                    <h3 className="mb-4 text-lg font-semibold text-text-primary">Recommended Position</h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg bg-background-surface/60 p-4">
                        <div className="text-sm text-text-secondary">Quantity to Buy</div>
                        <div className="mt-1 text-2xl font-bold text-primary">{positionResults.quantity}</div>
                        <div className="mt-1 text-xs text-text-secondary">shares</div>
                      </div>

                      <div className="rounded-lg bg-background-surface/60 p-4">
                        <div className="text-sm text-text-secondary">Position Size</div>
                        <div className="mt-1 text-2xl font-bold text-text-primary">₹{positionResults.positionSize}</div>
                      </div>

                      <div className="rounded-lg bg-background-surface/60 p-4">
                        <div className="text-sm text-text-secondary">Risk Amount</div>
                        <div className="mt-1 text-2xl font-bold text-danger">₹{positionResults.riskAmount}</div>
                      </div>

                      <div className="rounded-lg bg-background-surface/60 p-4">
                        <div className="text-sm text-text-secondary">Stop Loss %</div>
                        <div className="mt-1 text-2xl font-bold text-danger">{positionResults.stopLossPercent}%</div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-start gap-2 rounded-lg bg-warning/10 p-3">
                      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-warning" />
                      <p className="text-sm text-text-secondary">
                        Maximum loss if stop loss hits: <strong className="text-danger">₹{positionResults.maxLoss}</strong>
                      </p>
                    </div>
                  </motion.div>
                )}
              </>
            ) : (
              <>
                {/* Risk Management Form */}
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">
                      Total Capital (₹)
                    </label>
                    <input
                      type="number"
                      value={totalCapital}
                      onChange={(e) => setTotalCapital(e.target.value)}
                      placeholder="500000"
                      className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 px-4 text-text-primary placeholder-text-secondary transition focus:border-accent/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">
                      Position Value (₹)
                    </label>
                    <input
                      type="number"
                      value={positionValue}
                      onChange={(e) => setPositionValue(e.target.value)}
                      placeholder="50000"
                      className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 px-4 text-text-primary placeholder-text-secondary transition focus:border-accent/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">
                      Current Price (₹)
                    </label>
                    <input
                      type="number"
                      value={currentPrice}
                      onChange={(e) => setCurrentPrice(e.target.value)}
                      placeholder="2500"
                      className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 px-4 text-text-primary placeholder-text-secondary transition focus:border-accent/60 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-text-secondary">
                      Target Price (₹)
                    </label>
                    <input
                      type="number"
                      value={targetPrice}
                      onChange={(e) => setTargetPrice(e.target.value)}
                      placeholder="2800"
                      className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 px-4 text-text-primary placeholder-text-secondary transition focus:border-accent/60 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Results */}
                {riskResults && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6 rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent p-6"
                  >
                    <h3 className="mb-4 text-lg font-semibold text-text-primary">Risk Analysis</h3>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="rounded-lg bg-background-surface/60 p-4">
                        <div className="text-sm text-text-secondary">Position %</div>
                        <div className="mt-1 text-2xl font-bold text-text-primary">{riskResults.positionPercent}%</div>
                        <div className="mt-1 text-xs text-text-secondary">of total capital</div>
                      </div>

                      <div className="rounded-lg bg-background-surface/60 p-4">
                        <div className="text-sm text-text-secondary">Potential Profit</div>
                        <div className="mt-1 text-2xl font-bold text-success">+{riskResults.potentialProfit}%</div>
                        <div className="mt-1 text-xs text-text-secondary">₹{riskResults.profitAmount}</div>
                      </div>

                      <div className="rounded-lg bg-background-surface/60 p-4">
                        <div className="text-sm text-text-secondary">Risk:Reward</div>
                        <div className="mt-1 text-2xl font-bold text-accent">{riskResults.riskReward}:1</div>
                      </div>
                    </div>

                    <div
                      className={`mt-4 rounded-lg p-4 ${
                        riskResults.recommendation === 'HIGH RISK'
                          ? 'bg-danger/10 border border-danger/30'
                          : riskResults.recommendation === 'MODERATE'
                          ? 'bg-warning/10 border border-warning/30'
                          : 'bg-success/10 border border-success/30'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Shield
                          className={`h-5 w-5 ${
                            riskResults.recommendation === 'HIGH RISK'
                              ? 'text-danger'
                              : riskResults.recommendation === 'MODERATE'
                              ? 'text-warning'
                              : 'text-success'
                          }`}
                        />
                        <span
                          className={`font-semibold ${
                            riskResults.recommendation === 'HIGH RISK'
                              ? 'text-danger'
                              : riskResults.recommendation === 'MODERATE'
                              ? 'text-warning'
                              : 'text-success'
                          }`}
                        >
                          {riskResults.recommendation}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-text-secondary">
                        {riskResults.recommendation === 'HIGH RISK'
                          ? 'Position exceeds recommended 10% of capital. Consider reducing position size.'
                          : riskResults.recommendation === 'MODERATE'
                          ? 'Position is within acceptable range. Monitor closely and maintain stop loss.'
                          : 'Position size is conservative and well-managed. Good risk control.'}
                      </p>
                    </div>
                  </motion.div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
