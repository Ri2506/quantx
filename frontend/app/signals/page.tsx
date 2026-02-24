'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Target,
  TrendingUp,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Activity,
  Filter,
  Clock,
  AlertCircle,
  ChevronRight,
  Zap,
  BarChart3,
  Shield,
} from 'lucide-react'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import StatusDot from '@/components/ui/StatusDot'

interface Signal {
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
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'active' | 'triggered'>('all')

  useEffect(() => {
    fetchSignals()
  }, [])

  const fetchSignals = async () => {
    try {
      // Mock signals data - LONG positions only
      const mockSignals: Signal[] = [
        {
          id: '1',
          symbol: 'RELIANCE',
          name: 'Reliance Industries Ltd',
          direction: 'LONG',
          entry_price: 2847.50,
          target_price: 3020.00,
          stop_loss: 2780.00,
          confidence: 89,
          risk_reward: 2.57,
          generated_at: new Date(Date.now() - 2 * 60000).toISOString(),
          status: 'active',
        },
        {
          id: '2',
          symbol: 'TCS',
          name: 'Tata Consultancy Services',
          direction: 'LONG',
          entry_price: 3678.90,
          target_price: 3850.00,
          stop_loss: 3580.00,
          confidence: 82,
          risk_reward: 1.73,
          generated_at: new Date(Date.now() - 45 * 60000).toISOString(),
          status: 'active',
        },
        {
          id: '3',
          symbol: 'HDFCBANK',
          name: 'HDFC Bank Ltd',
          direction: 'LONG',
          entry_price: 1650.00,
          target_price: 1780.00,
          stop_loss: 1600.00,
          confidence: 75,
          risk_reward: 2.60,
          generated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
          status: 'triggered',
        },
        {
          id: '4',
          symbol: 'INFY',
          name: 'Infosys Ltd',
          direction: 'LONG',
          entry_price: 1523.45,
          target_price: 1620.00,
          stop_loss: 1480.00,
          confidence: 78,
          risk_reward: 2.22,
          generated_at: new Date(Date.now() - 4 * 3600000).toISOString(),
          status: 'active',
        },
        {
          id: '5',
          symbol: 'BHARTIARTL',
          name: 'Bharti Airtel Ltd',
          direction: 'LONG',
          entry_price: 1547.00,
          target_price: 1680.00,
          stop_loss: 1490.00,
          confidence: 84,
          risk_reward: 2.33,
          generated_at: new Date(Date.now() - 6 * 3600000).toISOString(),
          status: 'expired',
        },
      ]
      setSignals(mockSignals)
    } catch (error) {
      console.error('Error fetching signals:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredSignals = signals.filter(signal => {
    if (filter === 'all') return true
    return signal.status === filter
  })

  const getTimeAgo = (dateString: string) => {
    const diff = Date.now() - new Date(dateString).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const getStatusDotVariant = (status: Signal['status']): 'live' | 'warning' | 'offline' => {
    if (status === 'active') return 'live'
    if (status === 'triggered') return 'warning'
    return 'offline'
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background-primary">
        <div className="text-center">
          <div className="loader-rings mx-auto" />
          <p className="mt-6 text-lg text-text-secondary">Scanning markets for AI signals...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-primary px-6 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <ScrollReveal direction="up" delay={0}>
          <div className="mb-10">
            <div className="flex items-center justify-between">
              <div>
                <div className="mb-3 flex items-center gap-3">
                  <StatusDot status="live" label="Live" />
                  <span className="text-xs font-medium uppercase tracking-wider text-text-muted">
                    Real-time Engine
                  </span>
                </div>
                <h1 className="mb-3 text-4xl font-bold tracking-tight text-text-primary md:text-5xl">
                  <span className="gradient-text-professional">AI Trading Signals</span>
                </h1>
                <p className="max-w-lg text-lg text-text-secondary">
                  Real-time swing trade signals powered by deep learning models and multi-timeframe analysis
                </p>
              </div>
              <Link
                href="/dashboard"
                className="glass-card-neu rounded-xl border border-white/[0.04] px-5 py-2.5 text-sm font-medium text-text-primary transition hover:border-neon-cyan/20 hover:shadow-glow-sm"
              >
                &larr; Back to Dashboard
              </Link>
            </div>
          </div>
        </ScrollReveal>

        {/* Stats Overview */}
        <ScrollReveal direction="up" delay={0.1}>
          <div className="mb-10 grid gap-4 md:grid-cols-4">
            {[
              {
                label: 'Active Signals',
                value: signals.filter(s => s.status === 'active').length,
                icon: <Zap className="h-5 w-5 text-neon-cyan" />,
                color: 'text-neon-cyan',
              },
              {
                label: 'Avg Confidence',
                value: `${Math.round(signals.reduce((a, b) => a + b.confidence, 0) / signals.length)}%`,
                icon: <Sparkles className="h-5 w-5 text-neon-green" />,
                color: 'text-neon-green',
              },
              {
                label: 'Triggered Today',
                value: signals.filter(s => s.status === 'triggered').length,
                icon: <Target className="h-5 w-5 text-neon-purple" />,
                color: 'text-neon-purple',
              },
              {
                label: 'Avg Risk:Reward',
                value: `${(signals.reduce((a, b) => a + b.risk_reward, 0) / signals.length).toFixed(2)}:1`,
                icon: <Shield className="h-5 w-5 text-neon-gold" />,
                color: 'text-neon-gold',
              },
            ].map((stat, i) => (
              <Card3D key={stat.label} maxTilt={4}>
                <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-6 transition hover:border-neon-cyan/20">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-text-secondary">{stat.label}</span>
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
                      {stat.icon}
                    </div>
                  </div>
                  <div className={`text-3xl font-bold ${stat.color}`}>{stat.value}</div>
                </div>
              </Card3D>
            ))}
          </div>
        </ScrollReveal>

        {/* Filters */}
        <ScrollReveal direction="up" delay={0.15}>
          <div className="mb-8 flex items-center gap-3">
            <Filter className="h-5 w-5 text-text-muted" />
            <div className="flex gap-2">
              {(['all', 'active', 'triggered'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`rounded-xl px-5 py-2.5 text-sm font-medium transition-all ${
                    filter === f
                      ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/20 shadow-glow-sm'
                      : 'glass-card-neu border border-white/[0.04] text-text-secondary hover:border-neon-cyan/20 hover:text-text-primary'
                  }`}
                >
                  {f === 'all' && 'All Signals'}
                  {f === 'active' && 'Active'}
                  {f === 'triggered' && 'Triggered'}
                </button>
              ))}
            </div>
          </div>
        </ScrollReveal>

        {/* Signals List */}
        <div className="space-y-5">
          {filteredSignals.map((signal, index) => (
            <ScrollReveal key={signal.id} direction="up" delay={0.05 * index}>
              <Card3D maxTilt={3}>
                <Link href={`/signals/${signal.id}`} className="block">
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.08 }}
                    className="glass-card-neu group overflow-hidden rounded-2xl border border-white/[0.04] transition-all hover:border-neon-cyan/20 hover:shadow-glow-sm"
                  >
                    {/* Signal Header */}
                    <div className="border-b border-white/[0.04] bg-white/[0.02] px-6 py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neon-green/10 shadow-glow-success/20">
                            <TrendingUp className="h-5 w-5 text-neon-green" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2.5">
                              <span className="text-lg font-bold text-text-primary">
                                {signal.symbol}
                              </span>
                              <span className="badge-glass-neu-success rounded-md px-2.5 py-0.5 text-xs font-bold">
                                BUY
                              </span>
                              <span className="flex items-center gap-1.5">
                                <StatusDot status={getStatusDotVariant(signal.status)} />
                                <span className={`text-xs font-semibold uppercase tracking-wide ${
                                  signal.status === 'active' ? 'text-neon-green' :
                                  signal.status === 'triggered' ? 'text-neon-gold' :
                                  'text-text-muted'
                                }`}>
                                  {signal.status}
                                </span>
                              </span>
                            </div>
                            <span className="text-sm text-text-secondary">{signal.name}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-5">
                          <div className="flex items-center gap-1.5 text-sm text-text-muted">
                            <Clock className="h-4 w-4" />
                            {getTimeAgo(signal.generated_at)}
                          </div>
                          <div className="flex items-center gap-1.5 rounded-full bg-neon-cyan/10 px-4 py-1.5 border border-neon-cyan/20">
                            <Sparkles className="h-4 w-4 text-neon-cyan" />
                            <span className="text-sm font-bold text-neon-cyan">{signal.confidence}%</span>
                          </div>
                          <ChevronRight className="h-5 w-5 text-text-muted transition-transform group-hover:translate-x-1 group-hover:text-neon-cyan" />
                        </div>
                      </div>
                    </div>

                    {/* Signal Data Grid */}
                    <div className="grid gap-4 p-6 md:grid-cols-4">
                      <div>
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                          Entry Price
                        </div>
                        <div className="glass-neu-inset rounded-xl px-4 py-3 text-center">
                          <div className="text-lg font-bold text-neon-cyan">
                            ₹{signal.entry_price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                          Target
                        </div>
                        <div className="glass-neu-inset rounded-xl px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-lg font-bold text-neon-green">
                            <ArrowUp className="h-4 w-4" />
                            ₹{signal.target_price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                          Stop Loss
                        </div>
                        <div className="glass-neu-inset rounded-xl px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-lg font-bold text-danger">
                            <ArrowDown className="h-4 w-4" />
                            ₹{signal.stop_loss.toFixed(2)}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="mb-1.5 text-xs font-medium uppercase tracking-wider text-text-muted">
                          Risk:Reward
                        </div>
                        <div className="glass-neu-inset rounded-xl px-4 py-3 text-center">
                          <div className="text-lg font-bold text-neon-purple">
                            {signal.risk_reward.toFixed(2)}:1
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Confidence Bar */}
                    <div className="border-t border-white/[0.04] px-6 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium text-text-muted">AI Confidence</span>
                        <div className="flex-1 overflow-hidden rounded-full bg-white/[0.04] h-1.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${signal.confidence}%` }}
                            transition={{ duration: 1, delay: index * 0.1 + 0.3 }}
                            className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-green"
                            style={{ boxShadow: '0 0 8px rgba(0, 229, 255, 0.4)' }}
                          />
                        </div>
                        <span className="text-xs font-bold text-neon-cyan">{signal.confidence}%</span>
                      </div>
                    </div>
                  </motion.div>
                </Link>
              </Card3D>
            </ScrollReveal>
          ))}
        </div>

        {/* Empty State */}
        {filteredSignals.length === 0 && (
          <ScrollReveal direction="up" delay={0.1}>
            <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-16 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]">
                <AlertCircle className="h-8 w-8 text-text-muted" />
              </div>
              <p className="text-lg font-medium text-text-secondary">No signals found for the selected filter</p>
              <p className="mt-2 text-sm text-text-muted">Try selecting a different filter or check back later</p>
            </div>
          </ScrollReveal>
        )}
      </div>
    </div>
  )
}
