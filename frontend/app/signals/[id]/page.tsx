'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Target,
  Shield,
  Sparkles,
  Clock,
  BarChart3,
  Layers,
  Activity,
  Zap,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import GradientBorder from '@/components/ui/GradientBorder'
import StatusDot from '@/components/ui/StatusDot'

interface SignalDetail {
  id: string
  symbol: string
  name: string
  direction: 'LONG'
  entry_price: number
  target_price: number
  stop_loss: number
  confidence: number
  risk_reward: number
  generated_at: string
  status: 'active' | 'triggered' | 'expired'
  strategy: string
  timeframe: string
  sector: string
  potential_return: number
  max_risk: number
  indicators: { name: string; signal: 'bullish' | 'bearish' | 'neutral'; weight: number }[]
}

const mockSignals: Record<string, SignalDetail> = {
  '1': {
    id: '1', symbol: 'RELIANCE', name: 'Reliance Industries Ltd', direction: 'LONG',
    entry_price: 2847.50, target_price: 3020.00, stop_loss: 2780.00,
    confidence: 89, risk_reward: 2.57, generated_at: new Date(Date.now() - 2 * 60000).toISOString(),
    status: 'active', strategy: 'Breakout + Volume Surge', timeframe: '4H / Daily',
    sector: 'Energy & Petrochemicals', potential_return: 6.05, max_risk: 2.37,
    indicators: [
      { name: 'MACD Crossover', signal: 'bullish', weight: 0.92 },
      { name: 'RSI Momentum', signal: 'bullish', weight: 0.85 },
      { name: 'Volume Profile', signal: 'bullish', weight: 0.88 },
      { name: 'Order Block', signal: 'bullish', weight: 0.78 },
      { name: 'Fibonacci Retracement', signal: 'neutral', weight: 0.65 },
    ],
  },
  '2': {
    id: '2', symbol: 'TCS', name: 'Tata Consultancy Services', direction: 'LONG',
    entry_price: 3678.90, target_price: 3850.00, stop_loss: 3580.00,
    confidence: 82, risk_reward: 1.73, generated_at: new Date(Date.now() - 45 * 60000).toISOString(),
    status: 'active', strategy: 'EMA Pullback + Demand Zone', timeframe: 'Daily',
    sector: 'Information Technology', potential_return: 4.65, max_risk: 2.69,
    indicators: [
      { name: 'EMA 21/50 Stack', signal: 'bullish', weight: 0.90 },
      { name: 'RSI Divergence', signal: 'bullish', weight: 0.80 },
      { name: 'Demand Zone Test', signal: 'bullish', weight: 0.86 },
      { name: 'ADX Trend Strength', signal: 'bullish', weight: 0.72 },
      { name: 'Bollinger Squeeze', signal: 'neutral', weight: 0.60 },
    ],
  },
  '3': {
    id: '3', symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', direction: 'LONG',
    entry_price: 1650.00, target_price: 1780.00, stop_loss: 1600.00,
    confidence: 75, risk_reward: 2.60, generated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    status: 'triggered', strategy: 'Fair Value Gap Reclaim', timeframe: '4H',
    sector: 'Banking & Financial Services', potential_return: 7.88, max_risk: 3.03,
    indicators: [
      { name: 'Fair Value Gap', signal: 'bullish', weight: 0.82 },
      { name: 'Liquidity Sweep', signal: 'bullish', weight: 0.76 },
      { name: 'Market Structure', signal: 'bullish', weight: 0.80 },
      { name: 'Volume Delta', signal: 'neutral', weight: 0.68 },
      { name: 'Ichimoku Cloud', signal: 'bearish', weight: 0.55 },
    ],
  },
  '4': {
    id: '4', symbol: 'INFY', name: 'Infosys Ltd', direction: 'LONG',
    entry_price: 1523.45, target_price: 1620.00, stop_loss: 1480.00,
    confidence: 78, risk_reward: 2.22, generated_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    status: 'active', strategy: 'Ascending Triangle Breakout', timeframe: 'Daily',
    sector: 'Information Technology', potential_return: 6.34, max_risk: 2.85,
    indicators: [
      { name: 'Triangle Pattern', signal: 'bullish', weight: 0.88 },
      { name: 'OBV Rising', signal: 'bullish', weight: 0.82 },
      { name: 'VWAP Reclaim', signal: 'bullish', weight: 0.79 },
      { name: 'ATR Expansion', signal: 'neutral', weight: 0.70 },
      { name: 'Stochastic RSI', signal: 'bullish', weight: 0.74 },
    ],
  },
  '5': {
    id: '5', symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', direction: 'LONG',
    entry_price: 1547.00, target_price: 1680.00, stop_loss: 1490.00,
    confidence: 84, risk_reward: 2.33, generated_at: new Date(Date.now() - 6 * 3600000).toISOString(),
    status: 'expired', strategy: 'Cup & Handle Breakout', timeframe: 'Weekly / Daily',
    sector: 'Telecommunications', potential_return: 8.60, max_risk: 3.68,
    indicators: [
      { name: 'Cup & Handle', signal: 'bullish', weight: 0.91 },
      { name: 'Volume Confirmation', signal: 'bullish', weight: 0.87 },
      { name: 'Relative Strength', signal: 'bullish', weight: 0.83 },
      { name: 'Supertrend', signal: 'bullish', weight: 0.80 },
      { name: 'Pivot Points', signal: 'neutral', weight: 0.66 },
    ],
  },
}

const relatedSignals = [
  { id: '2', symbol: 'TCS', confidence: 82, direction: 'BUY' as const },
  { id: '4', symbol: 'INFY', confidence: 78, direction: 'BUY' as const },
  { id: '3', symbol: 'HDFCBANK', confidence: 75, direction: 'BUY' as const },
]

export default function SignalDetailPage() {
  const params = useParams()
  const signalId = params.id as string
  const [signal, setSignal] = useState<SignalDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate API fetch
    const timer = setTimeout(() => {
      setSignal(mockSignals[signalId] || mockSignals['1'])
      setLoading(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [signalId])

  const getTimeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const getSignalColor = (s: string) => {
    if (s === 'bullish') return 'text-neon-green'
    if (s === 'bearish') return 'text-danger'
    return 'text-text-muted'
  }

  const getSignalBg = (s: string) => {
    if (s === 'bullish') return 'bg-neon-green/10 border-neon-green/20'
    if (s === 'bearish') return 'bg-danger/10 border-danger/20'
    return 'bg-white/[0.04] border-white/[0.04]'
  }

  if (loading || !signal) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-primary">
        <div className="text-center">
          <div className="loader-rings mx-auto" />
          <p className="mt-6 text-lg text-text-secondary">Loading signal analysis...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-primary px-6 py-8">
      <div className="mx-auto max-w-5xl">
        {/* Back Navigation */}
        <ScrollReveal direction="up" delay={0}>
          <Link
            href="/signals"
            className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-text-muted transition hover:text-neon-cyan"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to All Signals
          </Link>
        </ScrollReveal>

        {/* Signal Header */}
        <ScrollReveal direction="up" delay={0.05}>
          <GradientBorder className="mb-8">
            <div className="rounded-[19px] bg-background-surface p-8">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-5">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-neon-green/10">
                    <TrendingUp className="h-7 w-7 text-neon-green" />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-3">
                      <h1 className="text-3xl font-bold text-text-primary">{signal.symbol}</h1>
                      <span className="badge-glass-neu-success rounded-lg px-3 py-1 text-sm font-bold">
                        BUY
                      </span>
                      <span className="flex items-center gap-1.5">
                        <StatusDot
                          status={signal.status === 'active' ? 'live' : signal.status === 'triggered' ? 'warning' : 'offline'}
                        />
                        <span className={`text-xs font-semibold uppercase tracking-wider ${
                          signal.status === 'active' ? 'text-neon-green' :
                          signal.status === 'triggered' ? 'text-neon-gold' : 'text-text-muted'
                        }`}>
                          {signal.status}
                        </span>
                      </span>
                    </div>
                    <p className="text-text-secondary">{signal.name}</p>
                    <div className="mt-2 flex items-center gap-4 text-sm text-text-muted">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {getTimeAgo(signal.generated_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" />
                        {signal.sector}
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3.5 w-3.5" />
                        {signal.timeframe}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-neon-cyan/10 border border-neon-cyan/20 px-6 py-3 text-center">
                    <div className="mb-0.5 text-xs font-medium text-text-muted">AI Confidence</div>
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="h-5 w-5 text-neon-cyan" />
                      <span className="text-2xl font-bold text-neon-cyan">{signal.confidence}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </GradientBorder>
        </ScrollReveal>

        {/* Key Metrics Grid */}
        <ScrollReveal direction="up" delay={0.1}>
          <div className="mb-8 grid gap-4 md:grid-cols-4">
            <Card3D maxTilt={5}>
              <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6 text-center transition hover:border-neon-cyan/20">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Entry Zone
                </div>
                <div className="mt-2 text-2xl font-bold text-neon-cyan">
                  ₹{signal.entry_price.toFixed(2)}
                </div>
                <div className="mt-2 text-xs text-text-muted">Optimal entry point</div>
              </div>
            </Card3D>

            <Card3D maxTilt={5}>
              <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6 text-center transition hover:border-neon-green/20">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Target Price
                </div>
                <div className="mt-2 flex items-center justify-center gap-1 text-2xl font-bold text-neon-green">
                  <ArrowUp className="h-5 w-5" />
                  ₹{signal.target_price.toFixed(2)}
                </div>
                <div className="mt-2 text-xs text-neon-green/70">+{signal.potential_return}% upside</div>
              </div>
            </Card3D>

            <Card3D maxTilt={5}>
              <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6 text-center transition hover:border-danger/20">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Stop Loss
                </div>
                <div className="mt-2 flex items-center justify-center gap-1 text-2xl font-bold text-danger">
                  <ArrowDown className="h-5 w-5" />
                  ₹{signal.stop_loss.toFixed(2)}
                </div>
                <div className="mt-2 text-xs text-danger/70">-{signal.max_risk}% max risk</div>
              </div>
            </Card3D>

            <Card3D maxTilt={5}>
              <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6 text-center transition hover:border-neon-purple/20">
                <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
                  Risk:Reward
                </div>
                <div className="mt-2 flex items-center justify-center gap-1.5 text-2xl font-bold text-neon-purple">
                  <Shield className="h-5 w-5" />
                  {signal.risk_reward.toFixed(2)}:1
                </div>
                <div className="mt-2 text-xs text-neon-purple/70">Favorable ratio</div>
              </div>
            </Card3D>
          </div>
        </ScrollReveal>

        {/* Chart Placeholder */}
        <ScrollReveal direction="up" delay={0.15}>
          <div className="glass-card-neu mb-8 overflow-hidden rounded-2xl border border-white/[0.04]">
            <div className="flex items-center justify-between border-b border-white/[0.04] bg-white/[0.02] px-6 py-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-neon-cyan" />
                <span className="font-semibold text-text-primary">Price Chart</span>
                <span className="badge-glass-neu-accent ml-2 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase">
                  {signal.timeframe}
                </span>
              </div>
              <div className="flex gap-2">
                {['1D', '4H', '1H', '15m'].map((tf) => (
                  <button
                    key={tf}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      tf === signal.timeframe.split(' ')[0]
                        ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20'
                        : 'text-text-muted hover:text-text-secondary hover:bg-white/[0.04]'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative flex h-72 items-center justify-center">
              {/* Simulated chart background gradient */}
              <div className="absolute inset-0 bg-gradient-to-b from-neon-cyan/[0.03] via-transparent to-neon-green/[0.02]" />
              <div className="absolute inset-0 flex items-end px-8 pb-8">
                {/* Simulated candlestick bars */}
                {Array.from({ length: 30 }).map((_, i) => {
                  const h = 20 + Math.random() * 80
                  const isGreen = Math.random() > 0.4
                  return (
                    <motion.div
                      key={i}
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: h, opacity: 1 }}
                      transition={{ delay: 0.02 * i, duration: 0.4 }}
                      className="mx-[2px] flex-1 rounded-sm"
                      style={{
                        background: isGreen
                          ? 'linear-gradient(to top, rgba(0, 255, 136, 0.3), rgba(0, 255, 136, 0.1))'
                          : 'linear-gradient(to top, rgba(255, 71, 87, 0.3), rgba(255, 71, 87, 0.1))',
                        boxShadow: isGreen
                          ? '0 0 4px rgba(0, 255, 136, 0.2)'
                          : '0 0 4px rgba(255, 71, 87, 0.2)',
                      }}
                    />
                  )
                })}
              </div>
              {/* Overlay labels */}
              <div className="relative z-10 text-center">
                <Activity className="mx-auto h-8 w-8 text-neon-cyan/40" />
                <p className="mt-2 text-sm font-medium text-text-muted">
                  Interactive chart coming soon
                </p>
                <p className="mt-1 text-xs text-text-muted/60">
                  TradingView integration in progress
                </p>
              </div>
            </div>
            {/* Entry / Target / SL horizontal markers */}
            <div className="grid grid-cols-3 divide-x divide-white/[0.04] border-t border-white/[0.04]">
              <div className="px-4 py-3 text-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Entry</span>
                <div className="text-sm font-bold text-neon-cyan">₹{signal.entry_price.toFixed(2)}</div>
              </div>
              <div className="px-4 py-3 text-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Target</span>
                <div className="text-sm font-bold text-neon-green">₹{signal.target_price.toFixed(2)}</div>
              </div>
              <div className="px-4 py-3 text-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted">Stop Loss</span>
                <div className="text-sm font-bold text-danger">₹{signal.stop_loss.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </ScrollReveal>

        {/* Strategy Breakdown */}
        <ScrollReveal direction="up" delay={0.2}>
          <div className="glass-card-neu mb-8 rounded-2xl border border-white/[0.04] p-8">
            <div className="mb-6 flex items-center gap-2">
              <Zap className="h-5 w-5 text-neon-cyan" />
              <h2 className="text-xl font-bold text-text-primary">
                <span className="gradient-text-professional">Strategy Breakdown</span>
              </h2>
            </div>

            <div className="mb-6 glass-neu-inset rounded-xl p-5">
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">Strategy</div>
              <div className="text-lg font-semibold text-text-primary">{signal.strategy}</div>
            </div>

            <div className="space-y-3">
              {signal.indicators.map((ind, i) => (
                <motion.div
                  key={ind.name}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                  className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] px-5 py-3.5 transition hover:border-neon-cyan/10"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${getSignalBg(ind.signal)}`}>
                      {ind.signal === 'bullish' ? (
                        <ArrowUp className="h-4 w-4 text-neon-green" />
                      ) : ind.signal === 'bearish' ? (
                        <ArrowDown className="h-4 w-4 text-danger" />
                      ) : (
                        <Activity className="h-4 w-4 text-text-muted" />
                      )}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-text-primary">{ind.name}</span>
                      <span className={`ml-2 text-xs font-semibold uppercase ${getSignalColor(ind.signal)}`}>
                        {ind.signal}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-24 overflow-hidden rounded-full bg-white/[0.04] h-1.5">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${ind.weight * 100}%` }}
                        transition={{ duration: 0.8, delay: 0.4 + i * 0.1 }}
                        className={`h-full rounded-full ${
                          ind.signal === 'bullish' ? 'bg-gradient-to-r from-neon-green/60 to-neon-green' :
                          ind.signal === 'bearish' ? 'bg-gradient-to-r from-danger/60 to-danger' :
                          'bg-gradient-to-r from-text-muted/40 to-text-muted/80'
                        }`}
                      />
                    </div>
                    <span className="w-10 text-right text-xs font-bold text-text-secondary">
                      {(ind.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Related Signals */}
        <ScrollReveal direction="up" delay={0.25}>
          <div className="mb-8">
            <div className="mb-5 flex items-center gap-2">
              <Target className="h-5 w-5 text-neon-cyan" />
              <h2 className="text-xl font-bold text-text-primary">
                <span className="gradient-text-professional">Related Signals</span>
              </h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {relatedSignals
                .filter((rs) => rs.id !== signalId)
                .slice(0, 3)
                .map((rs, i) => (
                <ScrollReveal key={rs.id} direction="up" delay={0.3 + i * 0.08}>
                  <Card3D maxTilt={4}>
                    <Link href={`/signals/${rs.id}`}>
                      <div className="glass-card-neu group rounded-2xl border border-white/[0.04] p-5 transition-all hover:border-neon-cyan/20 hover:shadow-glow-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neon-green/10">
                              <TrendingUp className="h-5 w-5 text-neon-green" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-text-primary">{rs.symbol}</span>
                                <span className="badge-glass-neu-success rounded px-2 py-0.5 text-[10px] font-bold">
                                  {rs.direction}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <Sparkles className="h-3 w-3 text-neon-cyan" />
                                <span className="text-xs font-medium text-neon-cyan">{rs.confidence}% confidence</span>
                              </div>
                            </div>
                          </div>
                          <ChevronRight className="h-5 w-5 text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-neon-cyan" />
                        </div>
                      </div>
                    </Link>
                  </Card3D>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Disclaimer */}
        <ScrollReveal direction="up" delay={0.3}>
          <div className="rounded-xl border border-white/[0.04] bg-white/[0.02] px-6 py-4 text-center">
            <p className="text-xs text-text-muted">
              This signal is generated by AI models and is for informational purposes only.
              It does not constitute financial advice. Always do your own research before making trading decisions.
            </p>
          </div>
        </ScrollReveal>
      </div>
    </div>
  )
}
