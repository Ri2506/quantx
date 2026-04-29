'use client'

import { useState, useMemo } from 'react'
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
  IndianRupee,
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

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
    { id: 'position', name: 'Position Sizing', icon: Calculator, description: 'Determine optimal position size based on your risk tolerance and capital' },
    { id: 'profit', name: 'Profit Calculator', icon: TrendingUp, description: 'Calculate net profit after brokerage, STT, and exchange charges' },
    { id: 'sip', name: 'SIP Calculator', icon: PieChart, description: 'Visualize how systematic investments grow over time with compounding' },
    { id: 'cagr', name: 'CAGR Calculator', icon: BarChart3, description: 'Measure true annualized returns on any investment' },
    { id: 'risk', name: 'Risk Analyzer', icon: Shield, description: 'Analyze risk-reward ratio and position exposure' },
  ]

  const positionResult = calculatePositionSize()
  const profitResult = calculateProfit()
  const sipResult = calculateSIP()
  const cagrResult = calculateCAGR()
  const riskResult = calculateRisk()

  // SIP growth curve data for chart
  const sipChartData = useMemo(() => {
    const monthly = parseFloat(monthlyInvestment)
    const rate = parseFloat(expectedReturn) / 100 / 12
    const months = parseFloat(timePeriod) * 12
    if (!monthly || !rate || !months || months <= 0) return []
    const data: Array<{ month: number; value: number; invested: number }> = []
    // Sample at reasonable intervals to avoid too many data points
    const step = months <= 60 ? 1 : months <= 120 ? 2 : 3
    for (let m = 0; m <= months; m += step) {
      const fv = m === 0 ? 0 : monthly * ((Math.pow(1 + rate, m) - 1) / rate) * (1 + rate)
      data.push({
        month: m,
        value: Math.round(fv),
        invested: monthly * m,
      })
    }
    // Ensure last point is included
    if (data[data.length - 1]?.month !== months) {
      const fv = monthly * ((Math.pow(1 + rate, months) - 1) / rate) * (1 + rate)
      data.push({ month: months, value: Math.round(fv), invested: monthly * months })
    }
    return data
  }, [monthlyInvestment, expectedReturn, timePeriod])

  return (
    <div className="px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-white md:text-3xl">Trading Tools</h1>
          <p className="text-sm text-d-text-muted">Essential calculators for Indian swing traders</p>
        </div>

        {/* Calculator Selection */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
          {calculators.map((calc) => {
            const Icon = calc.icon
            return (
              <button
                key={calc.id}
                onClick={() => setActiveCalculator(calc.id as CalculatorType)}
                className={`data-card p-4 text-left ${
                  activeCalculator === calc.id
                    ? '!border-primary/40 bg-primary/10'
                    : ''
                }`}
              >
                <div className={`mb-2 flex h-10 w-10 items-center justify-center rounded-lg ${
                  activeCalculator === calc.id ? 'bg-primary/15' : 'bg-white/[0.05]'
                }`}>
                  <Icon className={`h-5 w-5 ${activeCalculator === calc.id ? 'text-primary' : 'text-d-text-muted'}`} />
                </div>
                <div className={`font-semibold ${activeCalculator === calc.id ? 'text-primary' : 'text-white'}`}>
                  {calc.name}
                </div>
                <div className="text-xs text-d-text-muted">{calc.description}</div>
              </button>
            )
          })}
        </div>

        {/* Calculator Content */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Input Section */}
          <div className="glass-card p-6">
            <h2 className="mb-6 text-xl font-bold text-white">
              {calculators.find(c => c.id === activeCalculator)?.name}
            </h2>

            {/* Position Sizing Calculator */}
            {activeCalculator === 'position' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Total Capital (₹)</label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-d-text-muted" />
                    <input
                      type="number"
                      value={capital}
                      onChange={(e) => setCapital(e.target.value)}
                      placeholder="500000"
                      className="w-full rounded-lg border border-d-border bg-d-bg py-3 pl-10 pr-4 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Risk Per Trade (%)</label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-d-text-muted" />
                    <input
                      type="number"
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(e.target.value)}
                      placeholder="2"
                      step="0.5"
                      className="w-full rounded-lg border border-d-border bg-d-bg py-3 pl-10 pr-4 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Entry Price (₹)</label>
                  <input
                    type="number"
                    value={entryPrice}
                    onChange={(e) => setEntryPrice(e.target.value)}
                    placeholder="2500"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Stop Loss (₹)</label>
                  <input
                    type="number"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                    placeholder="2400"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Profit Calculator */}
            {activeCalculator === 'profit' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Buy Price (₹)</label>
                  <input
                    type="number"
                    value={buyPrice}
                    onChange={(e) => setBuyPrice(e.target.value)}
                    placeholder="2500"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Sell Price (₹)</label>
                  <input
                    type="number"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    placeholder="2800"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Quantity</label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder="100"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div className="rounded-lg bg-white/[0.03] p-3 text-xs text-d-text-muted">
                  <p>* Includes approximate Indian brokerage (0.03% or ₹20 max) and STT (0.1% on sell)</p>
                </div>
              </div>
            )}

            {/* SIP Calculator */}
            {activeCalculator === 'sip' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Monthly Investment (₹)</label>
                  <input
                    type="number"
                    value={monthlyInvestment}
                    onChange={(e) => setMonthlyInvestment(e.target.value)}
                    placeholder="10000"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Expected Return (% per annum)</label>
                  <input
                    type="number"
                    value={expectedReturn}
                    onChange={(e) => setExpectedReturn(e.target.value)}
                    placeholder="12"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Time Period (Years)</label>
                  <input
                    type="number"
                    value={timePeriod}
                    onChange={(e) => setTimePeriod(e.target.value)}
                    placeholder="5"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* CAGR Calculator */}
            {activeCalculator === 'cagr' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Initial Value (₹)</label>
                  <input
                    type="number"
                    value={initialValue}
                    onChange={(e) => setInitialValue(e.target.value)}
                    placeholder="100000"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Final Value (₹)</label>
                  <input
                    type="number"
                    value={finalValue}
                    onChange={(e) => setFinalValue(e.target.value)}
                    placeholder="200000"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Number of Years</label>
                  <input
                    type="number"
                    value={years}
                    onChange={(e) => setYears(e.target.value)}
                    placeholder="3"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Risk Analyzer */}
            {activeCalculator === 'risk' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Total Capital (₹)</label>
                  <input
                    type="number"
                    value={totalCapital}
                    onChange={(e) => setTotalCapital(e.target.value)}
                    placeholder="500000"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Position Value (₹)</label>
                  <input
                    type="number"
                    value={positionValue}
                    onChange={(e) => setPositionValue(e.target.value)}
                    placeholder="50000"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Current Price (₹)</label>
                  <input
                    type="number"
                    value={currentPrice}
                    onChange={(e) => setCurrentPrice(e.target.value)}
                    placeholder="2500"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-d-text-muted">Target Price (₹)</label>
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    placeholder="2800"
                    className="w-full rounded-lg border border-d-border bg-d-bg px-4 py-3 text-white placeholder:text-d-text-muted focus:border-primary/40 focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Results Section */}
          <div className="glass-card p-6 border-primary/20 relative overflow-hidden">
            <div className="aurora-cyan -top-40 -right-40 opacity-30" />
            <h2 className="mb-6 text-xl font-bold text-white">Results</h2>

            {/* Position Sizing Results */}
            {activeCalculator === 'position' && positionResult && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Quantity to Buy</div>
                    <div className="mt-1 text-3xl font-bold font-mono num-display text-primary">{positionResult.quantity}</div>
                    <div className="text-xs text-d-text-muted">shares</div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Position Size</div>
                    <div className="mt-1 text-3xl font-bold font-mono num-display text-white">₹{parseFloat(positionResult.positionSize).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Risk Amount</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-down">₹{parseFloat(positionResult.riskAmount).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Stop Loss %</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-down">{positionResult.stopLossPercent}%</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-warning/10 p-3">
                  <AlertTriangle className="h-5 w-5 flex-shrink-0 text-warning" />
                  <p className="text-sm text-d-text-muted">
                    Maximum loss if stop loss hits: <strong className="text-down">₹{parseFloat(positionResult.riskAmount).toLocaleString('en-IN')}</strong>
                  </p>
                </div>
              </div>
            )}

            {/* Profit Calculator Results */}
            {activeCalculator === 'profit' && profitResult && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Investment</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-white">₹{parseFloat(profitResult.investment).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Returns</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-white">₹{parseFloat(profitResult.returns).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Gross Profit</div>
                    <div className={`mt-1 text-2xl font-bold font-mono num-display ${parseFloat(profitResult.grossProfit) >= 0 ? 'text-up' : 'text-down'}`}>
                      {parseFloat(profitResult.grossProfit) >= 0 ? '+' : ''}₹{parseFloat(profitResult.grossProfit).toLocaleString('en-IN')}
                    </div>
                    <div className={`text-sm font-mono num-display ${parseFloat(profitResult.profitPercent) >= 0 ? 'text-up' : 'text-down'}`}>
                      ({profitResult.profitPercent}%)
                    </div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Charges (Brokerage + STT)</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-warning">₹{parseFloat(profitResult.charges).toLocaleString('en-IN')}</div>
                  </div>
                </div>
                <div className="rounded-lg bg-up/10 p-4">
                  <div className="text-sm text-d-text-muted">Net Profit (After Charges)</div>
                  <div className={`mt-1 text-3xl font-bold font-mono num-display ${parseFloat(profitResult.netProfit) >= 0 ? 'text-up' : 'text-down'}`}>
                    {parseFloat(profitResult.netProfit) >= 0 ? '+' : ''}₹{parseFloat(profitResult.netProfit).toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
            )}

            {/* SIP Calculator Results */}
            {activeCalculator === 'sip' && sipResult && (
              <div className="space-y-4">
                <div className="rounded-lg bg-up/10 p-4">
                  <div className="text-sm text-d-text-muted">Future Value</div>
                  <div className="mt-1 text-3xl font-bold font-mono num-display text-up">₹{parseFloat(sipResult.futureValue).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Total Invested</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-white">₹{parseFloat(sipResult.totalInvested).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Wealth Gained</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-primary">₹{parseFloat(sipResult.wealthGained).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  </div>
                </div>

                {/* SIP Growth Chart */}
                {sipChartData.length > 1 && (
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="mb-3 text-sm font-medium text-d-text-muted">Projected Growth Over Time</div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sipChartData} margin={{ top: 5, right: 10, left: 10, bottom: 0 }}>
                          <defs>
                            <linearGradient id="sipGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#4FECCD" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#4FECCD" stopOpacity={0} />
                            </linearGradient>
                            <linearGradient id="sipInvestedGradient" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#5DCBD8" stopOpacity={0.15} />
                              <stop offset="95%" stopColor="#5DCBD8" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis
                            dataKey="month"
                            tick={{ fill: '#71717a', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(v: number) => v >= 12 ? `${Math.round(v / 12)}y` : `${v}m`}
                          />
                          <YAxis
                            tick={{ fill: '#71717a', fontSize: 11 }}
                            tickLine={false}
                            axisLine={false}
                            width={60}
                            tickFormatter={(v: number) => v >= 10000000 ? `${(v / 10000000).toFixed(1)}Cr` : v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}K`}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg, #232a3b)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '12px' }}
                            labelStyle={{ color: '#71717a' }}
                            labelFormatter={(v: number) => `Month ${v}`}
                            formatter={(value: number, name: string) => [
                              `₹${value.toLocaleString('en-IN')}`,
                              name === 'value' ? 'Portfolio Value' : 'Invested',
                            ]}
                          />
                          <Area
                            type="monotone"
                            dataKey="invested"
                            stroke="#5DCBD8"
                            strokeWidth={1.5}
                            fill="url(#sipInvestedGradient)"
                            strokeDasharray="4 4"
                          />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#4FECCD"
                            strokeWidth={2}
                            fill="url(#sipGradient)"
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 flex items-center justify-center gap-4 text-[11px] text-d-text-muted">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-0.5 w-4 rounded bg-primary" />
                        Portfolio Value
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block h-0.5 w-4 rounded border-t border-dashed border-[#5DCBD8]" />
                        Amount Invested
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* CAGR Calculator Results */}
            {activeCalculator === 'cagr' && cagrResult && (
              <div className="space-y-4">
                <div className="rounded-lg bg-up/10 p-4">
                  <div className="text-sm text-d-text-muted">CAGR</div>
                  <div className="mt-1 text-4xl font-bold font-mono num-display text-up">{cagrResult.cagr}%</div>
                  <div className="text-sm text-d-text-muted">Compound Annual Growth Rate</div>
                </div>
                <div className="rounded-lg bg-d-bg-card/60 p-4">
                  <div className="text-sm text-d-text-muted">Absolute Return</div>
                  <div className="mt-1 text-2xl font-bold font-mono num-display text-primary">{cagrResult.absoluteReturn}%</div>
                </div>
              </div>
            )}

            {/* Risk Analyzer Results */}
            {activeCalculator === 'risk' && riskResult && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Position %</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-white">{riskResult.positionPercent}%</div>
                    <div className="text-xs text-d-text-muted">of total capital</div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Potential Profit</div>
                    <div className="mt-1 text-2xl font-bold font-mono num-display text-up">+{riskResult.potentialProfit}%</div>
                    <div className="text-xs text-d-text-muted">₹{parseFloat(riskResult.profitAmount).toLocaleString('en-IN')}</div>
                  </div>
                  <div className="rounded-lg bg-d-bg-card/60 p-4">
                    <div className="text-sm text-d-text-muted">Risk Level</div>
                    <div className={`mt-1 text-lg font-bold ${
                      riskResult.recommendation === 'HIGH RISK' ? 'text-down' :
                      riskResult.recommendation === 'MODERATE' ? 'text-warning' : 'text-up'
                    }`}>{riskResult.recommendation}</div>
                  </div>
                </div>
                <div className={`rounded-lg p-4 ${
                  riskResult.recommendation === 'HIGH RISK' ? 'bg-down/10 border border-down/30' :
                  riskResult.recommendation === 'MODERATE' ? 'bg-warning/10 border border-warning/30' :
                  'bg-up/10 border border-up/30'
                }`}>
                  <div className="flex items-center gap-2">
                    <Shield className={`h-5 w-5 ${
                      riskResult.recommendation === 'HIGH RISK' ? 'text-down' :
                      riskResult.recommendation === 'MODERATE' ? 'text-warning' : 'text-up'
                    }`} />
                    <span className={`font-semibold ${
                      riskResult.recommendation === 'HIGH RISK' ? 'text-down' :
                      riskResult.recommendation === 'MODERATE' ? 'text-warning' : 'text-up'
                    }`}>{riskResult.recommendation}</span>
                  </div>
                  <p className="mt-2 text-sm text-d-text-muted">
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
                <Calculator className="mb-4 h-12 w-12 text-d-text-muted opacity-50" />
                <p className="text-d-text-muted">Enter values to see results</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
