'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Calculator,
  TrendingUp,
  Shield,
  Target,
  Percent,
  DollarSign,
  PieChart,
  BarChart3,
  Zap,
  AlertTriangle,
  ArrowRight,
  IndianRupee,
} from 'lucide-react'

type CalculatorType = 'position' | 'profit' | 'sip' | 'cagr' | 'risk'

export default function ToolsPage() {
  const [activeCalculator, setActiveCalculator] = useState<CalculatorType>('position')
  
  // Position Sizing Calculator State
  const [capital, setCapital] = useState('')
  const [riskPercent, setRiskPercent] = useState('2')
  const [entryPrice, setEntryPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  
  // Profit Calculator State
  const [buyPrice, setBuyPrice] = useState('')
  const [sellPrice, setSellPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  
  // SIP Calculator State
  const [monthlyInvestment, setMonthlyInvestment] = useState('')
  const [expectedReturn, setExpectedReturn] = useState('12')
  const [timePeriod, setTimePeriod] = useState('5')
  
  // CAGR Calculator State
  const [initialValue, setInitialValue] = useState('')
  const [finalValue, setFinalValue] = useState('')
  const [years, setYears] = useState('')
  
  // Risk Calculator State
  const [totalCapital, setTotalCapital] = useState('')
  const [positionValue, setPositionValue] = useState('')
  const [targetPrice, setTargetPrice] = useState('')
  const [currentPrice, setCurrentPrice] = useState('')

  // Calculations
  const calculatePositionSize = () => {
    const cap = parseFloat(capital)
    const risk = parseFloat(riskPercent)
    const entry = parseFloat(entryPrice)
    const stop = parseFloat(stopLoss)
    if (!cap || !risk || !entry || !stop || entry <= stop) return null
    const riskAmount = (cap * risk) / 100
    const qty = Math.floor(riskAmount / (entry - stop))
    const positionSize = qty * entry
    return {
      riskAmount: riskAmount.toFixed(2),
      quantity: qty,
      positionSize: positionSize.toFixed(2),
      stopLossPercent: (((entry - stop) / entry) * 100).toFixed(2),
    }
  }

  const calculateProfit = () => {
    const buy = parseFloat(buyPrice)
    const sell = parseFloat(sellPrice)
    const qty = parseFloat(quantity)
    if (!buy || !sell || !qty) return null
    const investment = buy * qty
    const returns = sell * qty
    const profit = returns - investment
    const profitPercent = (profit / investment) * 100
    // Indian brokerage and taxes (approximate)
    const brokerage = Math.min(investment * 0.0003, 20) + Math.min(returns * 0.0003, 20)
    const stt = returns * 0.001 // 0.1% STT on sell
    const totalCharges = brokerage + stt
    const netProfit = profit - totalCharges
    return {
      investment: investment.toFixed(2),
      returns: returns.toFixed(2),
      grossProfit: profit.toFixed(2),
      profitPercent: profitPercent.toFixed(2),
      charges: totalCharges.toFixed(2),
      netProfit: netProfit.toFixed(2),
    }
  }

  const calculateSIP = () => {
    const monthly = parseFloat(monthlyInvestment)
    const rate = parseFloat(expectedReturn) / 100 / 12
    const months = parseFloat(timePeriod) * 12
    if (!monthly || !rate || !months) return null
    const futureValue = monthly * ((Math.pow(1 + rate, months) - 1) / rate) * (1 + rate)
    const totalInvested = monthly * months
    const wealthGained = futureValue - totalInvested
    return {
      futureValue: futureValue.toFixed(2),
      totalInvested: totalInvested.toFixed(2),
      wealthGained: wealthGained.toFixed(2),
    }
  }

  const calculateCAGR = () => {
    const initial = parseFloat(initialValue)
    const final = parseFloat(finalValue)
    const n = parseFloat(years)
    if (!initial || !final || !n) return null
    const cagr = (Math.pow(final / initial, 1 / n) - 1) * 100
    const absoluteReturn = ((final - initial) / initial) * 100
    return {
      cagr: cagr.toFixed(2),
      absoluteReturn: absoluteReturn.toFixed(2),
    }
  }

  const calculateRisk = () => {
    const cap = parseFloat(totalCapital)
    const posValue = parseFloat(positionValue)
    const target = parseFloat(targetPrice)
    const current = parseFloat(currentPrice)
    if (!cap || !posValue || !target || !current) return null
    const positionPercent = (posValue / cap) * 100
    const potentialProfit = ((target - current) / current) * 100
    const profitAmount = posValue * (potentialProfit / 100)
    return {
      positionPercent: positionPercent.toFixed(2),
      potentialProfit: potentialProfit.toFixed(2),
      profitAmount: profitAmount.toFixed(2),
      recommendation: positionPercent > 10 ? 'HIGH RISK' : positionPercent > 5 ? 'MODERATE' : 'LOW RISK',
    }
  }

  const calculators = [
    { id: 'position', name: 'Position Sizing', icon: Calculator, description: 'Calculate optimal position size based on risk' },
    { id: 'profit', name: 'Profit Calculator', icon: TrendingUp, description: 'Calculate profit/loss with Indian charges' },
    { id: 'sip', name: 'SIP Calculator', icon: PieChart, description: 'Plan your systematic investment' },
    { id: 'cagr', name: 'CAGR Calculator', icon: BarChart3, description: 'Calculate compound annual growth rate' },
    { id: 'risk', name: 'Risk Analyzer', icon: Shield, description: 'Analyze position risk and reward' },
  ]

  const positionResult = calculatePositionSize()
  const profitResult = calculateProfit()
  const sipResult = calculateSIP()
  const cagrResult = calculateCAGR()
  const riskResult = calculateRisk()

  return (
    <div className="min-h-screen bg-background-primary px-6 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="mb-2 text-4xl font-bold text-text-primary">
                <span className="gradient-text-professional">Trading Tools</span>
              </h1>
              <p className="text-lg text-text-secondary">
                Essential calculators for Indian swing traders
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-lg border border-border/60 bg-background-surface px-4 py-2 text-sm font-medium text-text-primary transition hover:border-accent/60"
            >
              ← Back to Dashboard
            </Link>
          </div>
        </div>

        {/* Calculator Selection */}
        <div className="mb-8 grid gap-4 md:grid-cols-5">
          {calculators.map((calc) => {
            const Icon = calc.icon
            return (
              <button
                key={calc.id}
                onClick={() => setActiveCalculator(calc.id as CalculatorType)}
                className={`rounded-xl border p-4 text-left transition ${
                  activeCalculator === calc.id
                    ? 'border-accent/60 bg-accent/10'
                    : 'border-border/60 bg-background-surface hover:border-accent/40'
                }`}
              >
                <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg ${
                  activeCalculator === calc.id ? 'bg-accent/20' : 'bg-background-elevated'
                }`}>
                  <Icon className={`h-5 w-5 ${activeCalculator === calc.id ? 'text-accent' : 'text-text-secondary'}`} />
                </div>
                <div className={`font-semibold ${activeCalculator === calc.id ? 'text-accent' : 'text-text-primary'}`}>
                  {calc.name}
                </div>
                <div className="text-xs text-text-secondary">{calc.description}</div>
              </button>
            )
          })}
        </div>

        {/* Calculator Content */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Section */}
          <motion.div
            key={activeCalculator}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border border-border/60 bg-gradient-to-br from-background-surface to-background-elevated p-6"
          >
            <h2 className="mb-6 text-xl font-bold text-text-primary">
              {calculators.find(c => c.id === activeCalculator)?.name}
            </h2>

            {/* Position Sizing Calculator */}
            {activeCalculator === 'position' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Total Capital (₹)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(e.target.value)}
                      placeholder="500000"
                      className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 pl-10 pr-4 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Risk Per Trade (%)</label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
                    <input
                      type="number"
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(e.target.value)}
                      placeholder="2"
                      step="0.5"
                      className="w-full rounded-lg border border-border/60 bg-background-primary/60 py-3 pl-10 pr-4 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Entry Price (₹)</label>
                  <input
                    type="number"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="2500"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Stop Loss (₹)</label>
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="2400"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Profit Calculator */}
            {activeCalculator === 'profit' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Buy Price (₹)</label>
                  <input
                    type="number"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    placeholder="2500"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Sell Price (₹)</label>
                  <input
                    type="number"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    placeholder="2800"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="100"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div className="rounded-lg bg-background-primary/50 p-3 text-xs text-text-secondary">
                  <p>* Includes approximate Indian brokerage (0.03% or ₹20 max) and STT (0.1% on sell)</p>
                </div>
              </div>
            )}

            {/* SIP Calculator */}
            {activeCalculator === 'sip' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Monthly Investment (₹)</label>
                  <input
                    type="number"
                    value={monthlyInvestment}
                    onChange={(e) => setMonthlyInvestment(e.target.value)}
                    placeholder="10000"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Expected Return (% per annum)</label>
                  <input
                    type="number"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    placeholder="12"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Time Period (Years)</label>
                  <input
                    type="number"
                    value={timePeriod}
                    onChange={(e) => setTimePeriod(e.target.value)}
                    placeholder="5"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* CAGR Calculator */}
            {activeCalculator === 'cagr' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Initial Value (₹)</label>
                  <input
                    type="number"
                    value={initialValue}
                    onChange={(e) => setInitialValue(e.target.value)}
                    placeholder="100000"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Final Value (₹)</label>
                  <input
                    type="number"
                    value={finalValue}
                    onChange={(e) => setFinalValue(e.target.value)}
                    placeholder="200000"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Number of Years</label>
                  <input
                    type="number"
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                    placeholder="3"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Risk Analyzer */}
            {activeCalculator === 'risk' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Total Capital (₹)</label>
                  <input
                    type="number"
                    value={totalCapital}
                    onChange={(e) => setTotalCapital(e.target.value)}
                    placeholder="500000"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Position Value (₹)</label>
                  <input
                    type="number"
                    value={positionValue}
                    onChange={(e) => setPositionValue(e.target.value)}
                    placeholder="50000"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Current Price (₹)</label>
                  <input
                    type="number"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    placeholder="2500"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text-secondary">Target Price (₹)</label>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="2800"
                    className="w-full rounded-lg border border-border/60 bg-background-primary/60 px-4 py-3 text-text-primary placeholder-text-secondary focus:border-accent/60 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </motion.div>

          {/* Results Section */}
          <motion.div
            key={`${activeCalculator}-result`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-xl border border-accent/30 bg-gradient-to-br from-accent/10 to-transparent p-6"
          >
            <h2 className="mb-6 text-xl font-bold text-text-primary">Results</h2>

            {/* Position Sizing Results */}
            {activeCalculator === 'position' && positionResult && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Quantity to Buy</div>
                    <div className="mt-1 text-3xl font-bold text-primary">{positionResult.quantity}</div>
                    <div className="text-xs text-text-secondary">shares</div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Position Size</div>
                    <div className="mt-1 text-3xl font-bold text-text-primary">₹{parseFloat(positionResult.positionSize).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Risk Amount</div>
                    <div className="mt-1 text-2xl font-bold text-danger">₹{parseFloat(positionResult.riskAmount).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Stop Loss %</div>
                    <div className="mt-1 text-2xl font-bold text-danger">{positionResult.stopLossPercent}%</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 text-warning" />
                  <p className="text-sm text-text-secondary">
                    Maximum loss if stop loss hits: <strong className="text-danger">₹{parseFloat(positionResult.riskAmount).toLocaleString('en-IN')}</strong>
                  </p>
                </div>
              </div>
            )}

            {/* Profit Calculator Results */}
            {activeCalculator === 'profit' && profitResult && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Investment</div>
                    <div className="mt-1 text-2xl font-bold text-text-primary">₹{parseFloat(profitResult.investment).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Returns</div>
                    <div className="mt-1 text-2xl font-bold text-text-primary">₹{parseFloat(profitResult.returns).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Gross Profit</div>
                    <div className={`mt-1 text-2xl font-bold ${parseFloat(profitResult.grossProfit) >= 0 ? 'text-success' : 'text-danger'}`}>
                      {parseFloat(profitResult.grossProfit) >= 0 ? '+' : ''}₹{parseFloat(profitResult.grossProfit).toLocaleString('en-IN')}
                    </div>
                    <div className={`text-sm ${parseFloat(profitResult.profitPercent) >= 0 ? 'text-success' : 'text-danger'}`}>
                      ({profitResult.profitPercent}%)
                    </div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Charges (Brokerage + STT)</div>
                    <div className="mt-1 text-2xl font-bold text-warning">₹{parseFloat(profitResult.charges).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <div className="rounded-lg bg-success/10 p-4">
                  <div className="text-sm text-text-secondary">Net Profit (After Charges)</div>
                  <div className={`mt-1 text-3xl font-bold ${parseFloat(profitResult.netProfit) >= 0 ? 'text-success' : 'text-danger'}`}>
                    {parseFloat(profitResult.netProfit) >= 0 ? '+' : ''}₹{parseFloat(profitResult.netProfit).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            )}

            {/* SIP Calculator Results */}
            {activeCalculator === 'sip' && sipResult && (
              <div className="space-y-4">
                <div className="rounded-lg bg-success/10 p-4">
                  <div className="text-sm text-text-secondary">Future Value</div>
                  <div className="mt-1 text-3xl font-bold text-success">₹{parseFloat(sipResult.futureValue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Total Invested</div>
                    <div className="mt-1 text-2xl font-bold text-text-primary">₹{parseFloat(sipResult.totalInvested).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Wealth Gained</div>
                    <div className="mt-1 text-2xl font-bold text-primary">₹{parseFloat(sipResult.wealthGained).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>
              </div>
            )}

            {/* CAGR Calculator Results */}
            {activeCalculator === 'cagr' && cagrResult && (
              <div className="space-y-4">
                <div className="rounded-lg bg-success/10 p-4">
                  <div className="text-sm text-text-secondary">CAGR</div>
                  <div className="mt-1 text-4xl font-bold text-success">{cagrResult.cagr}%</div>
                  <div className="text-sm text-text-secondary">Compound Annual Growth Rate</div>
                </div>
                <div className="rounded-lg bg-background-surface/60 p-4">
                  <div className="text-sm text-text-secondary">Absolute Return</div>
                  <div className="mt-1 text-2xl font-bold text-primary">{cagrResult.absoluteReturn}%</div>
                </div>
              </div>
            )}

            {/* Risk Analyzer Results */}
            {activeCalculator === 'risk' && riskResult && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Position %</div>
                    <div className="mt-1 text-2xl font-bold text-text-primary">{riskResult.positionPercent}%</div>
                    <div className="text-xs text-text-secondary">of total capital</div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Potential Profit</div>
                    <div className="mt-1 text-2xl font-bold text-success">+{riskResult.potentialProfit}%</div>
                    <div className="text-xs text-text-secondary">₹{parseFloat(riskResult.profitAmount).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-background-surface/60 p-4">
                    <div className="text-sm text-text-secondary">Risk Level</div>
                    <div className={`mt-1 text-lg font-bold ${
                      riskResult.recommendation === 'HIGH RISK' ? 'text-danger' :
                      riskResult.recommendation === 'MODERATE' ? 'text-warning' : 'text-success'
                    }`}>{riskResult.recommendation}</div>
                  </div>
                </div>
                <div className={`rounded-lg p-4 ${
                  riskResult.recommendation === 'HIGH RISK' ? 'bg-danger/10 border border-danger/30' :
                  riskResult.recommendation === 'MODERATE' ? 'bg-warning/10 border border-warning/30' :
                  'bg-success/10 border border-success/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <Shield className={`h-5 w-5 ${
                      riskResult.recommendation === 'HIGH RISK' ? 'text-danger' :
                      riskResult.recommendation === 'MODERATE' ? 'text-warning' : 'text-success'
                    }`} />
                    <span className={`font-semibold ${
                      riskResult.recommendation === 'HIGH RISK' ? 'text-danger' :
                      riskResult.recommendation === 'MODERATE' ? 'text-warning' : 'text-success'
                    }`}>{riskResult.recommendation}</span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">
                    {riskResult.recommendation === 'HIGH RISK'
                      ? 'Position exceeds recommended 10% of capital. Consider reducing position size.'
                      : riskResult.recommendation === 'MODERATE'
                      ? 'Position is within acceptable range. Monitor closely and maintain stop loss.'
                      : 'Position size is conservative and well-managed. Good risk control.'}
                  </p>
                </div>
              </div>
            )}

            {/* Empty State */}
            {((activeCalculator === 'position' && !positionResult) ||
              (activeCalculator === 'profit' && !profitResult) ||
              (activeCalculator === 'sip' && !sipResult) ||
              (activeCalculator === 'cagr' && !cagrResult) ||
              (activeCalculator === 'risk' && !riskResult)) && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Calculator className="mb-4 h-12 w-12 text-text-secondary opacity-50" />
                <p className="text-text-secondary">Enter values to see results</p>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  )
}
