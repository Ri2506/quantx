// ============================================================================
// SWINGAI - AI SIGNAL DESK
// AI market intelligence with one-click execution
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError, Signal } from '../../lib/api'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  RefreshCw,
  Clock,
  ChevronRight,
  Lock,
  Crown,
  Brain,
  Rocket,
  Eye,
  Play,
} from 'lucide-react'

// ============================================================================
// SIGNALS PAGE
// ============================================================================

export default function SignalsPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  
  // State
  const [signals, setSignals] = useState<Signal[]>([])
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'long' | 'short'>('all')
  const [segmentFilter, setSegmentFilter] = useState<'all' | 'equity' | 'fo'>('all')

  // Check premium
  const isPremium = profile?.subscription_status === 'active' || profile?.subscription_status === 'trial'
  const canAutoTrade = profile?.trading_mode !== 'signal_only' && profile?.broker_connected

  // Fetch signals
  const fetchSignals = useCallback(async () => {
    if (!user) return
    
    setLoading(true)
    try {
      const result = await api.signals.getToday()
      setSignals(result.all_signals || [])
    } catch (err) {
      console.error('Failed to fetch signals:', err)
      // Use mock data for demo
      setSignals([
        {
          id: '1',
          symbol: 'RELIANCE',
          exchange: 'NSE',
          segment: 'EQUITY',
          direction: 'LONG',
          entry_price: 2456.75,
          stop_loss: 2388.00,
          target_1: 2525.00,
          target_2: 2594.00,
          confidence: 85,
          risk_reward: 2.5,
          status: 'active',
          is_premium: false,
          reasons: ['VCP breakout', 'RSI rising', 'Volume surge'],
          date: new Date().toISOString().split('T')[0],
          generated_at: new Date().toISOString(),
        },
        {
          id: '2',
          symbol: 'TCS',
          exchange: 'NSE',
          segment: 'EQUITY',
          direction: 'LONG',
          entry_price: 3678.90,
          stop_loss: 3580.00,
          target_1: 3800.00,
          target_2: 3920.00,
          confidence: 78,
          risk_reward: 2.2,
          status: 'active',
          is_premium: false,
          reasons: ['Above 200 SMA', 'MACD bullish', 'Sector strength'],
          date: new Date().toISOString().split('T')[0],
          generated_at: new Date().toISOString(),
        },
        {
          id: '3',
          symbol: 'HDFCBANK',
          exchange: 'NSE',
          segment: 'EQUITY',
          direction: 'LONG',
          entry_price: 1567.80,
          stop_loss: 1528.00,
          target_1: 1635.00,
          target_2: 1685.00,
          confidence: 72,
          risk_reward: 1.8,
          status: 'active',
          is_premium: true,
          reasons: ['EMA pullback', 'RSI support zone', 'Banking sector strength'],
          date: new Date().toISOString().split('T')[0],
          generated_at: new Date().toISOString(),
        },
        {
          id: '4',
          symbol: 'INFY',
          exchange: 'NSE',
          segment: 'EQUITY',
          direction: 'LONG',
          entry_price: 1785.00,
          stop_loss: 1738.00,
          target_1: 1860.00,
          target_2: 1915.00,
          confidence: 75,
          risk_reward: 2.0,
          status: 'active',
          is_premium: true,
          reasons: ['Breakout retest', 'Momentum continuation', 'Volume expansion'],
          date: new Date().toISOString().split('T')[0],
          generated_at: new Date().toISOString(),
        },
      ] as Signal[])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchSignals()
  }, [fetchSignals])

  // Execute trade
  const executeTrade = async (signal: Signal) => {
    if (!isPremium && signal.is_premium) {
      router.push('/pricing')
      return
    }

    if (!canAutoTrade) {
      router.push('/settings')
      return
    }

    setExecuting(signal.id)
    try {
      await api.trades.execute({ signal_id: signal.id })
      alert(`Trade executed for ${signal.symbol}!`)
    } catch (err) {
      alert(handleApiError(err))
    } finally {
      setExecuting(null)
    }
  }

  // Filter signals
  const filteredSignals = signals.filter(s => {
    if (filter === 'long' && s.direction !== 'LONG') return false
    if (filter === 'short' && s.direction !== 'SHORT') return false
    if (segmentFilter === 'equity' && s.segment !== 'EQUITY') return false
    if (segmentFilter === 'fo' && s.segment === 'EQUITY') return false
    return true
  })

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="text-center">
          <Target className="w-12 h-12 text-emerald-500 animate-pulse mx-auto mb-4" />
          <p className="text-text-secondary">AI is scanning markets...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const longSignals = signals.filter(s => s.direction === 'LONG')
  const shortSignals = signals.filter(s => s.direction === 'SHORT')
  const avgConfidence = signals.length > 0 
    ? (signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length).toFixed(0)
    : 0

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                <ArrowLeft className="w-5 h-5 text-text-secondary" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Target className="w-6 h-6 text-emerald-500" />
                  AI Signal Desk
                </h1>
                <p className="text-sm text-text-muted">Generated at 8:30 AM • Updated every market day</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={fetchSignals}
                className="p-2 hover:bg-white/5 rounded-xl transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
              </button>
              {!canAutoTrade && (
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-xl font-medium hover:bg-emerald-500/30 transition-all"
                >
                  <Zap className="w-4 h-4" />
                  Enable Auto-Trade
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="app-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/20">
                <Target className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{signals.length}</p>
                <p className="text-sm text-text-muted">Total Signals</p>
              </div>
            </div>
          </div>
          <div className="app-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-green-500/20">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-400">{longSignals.length}</p>
                <p className="text-sm text-text-muted">Long Signals</p>
              </div>
            </div>
          </div>
          <div className="app-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-500/20">
                <TrendingDown className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{shortSignals.length}</p>
                <p className="text-sm text-text-muted">Short Signals</p>
              </div>
            </div>
          </div>
          <div className="app-card p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/20">
                <Brain className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">{avgConfidence}%</p>
                <p className="text-sm text-text-muted">Avg Confidence</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex items-center app-card p-1">
            {(['all', 'long', 'short'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === f
                    ? f === 'long' ? 'bg-green-500 text-white' : f === 'short' ? 'bg-red-500 text-white' : 'bg-white/10 text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f === 'all' ? 'All' : f === 'long' ? '↑ Long' : '↓ Short'}
              </button>
            ))}
          </div>
          <div className="flex items-center app-card p-1">
            {(['all', 'equity', 'fo'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setSegmentFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  segmentFilter === f ? 'bg-white/10 text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {f === 'all' ? 'All' : f === 'equity' ? 'Equity' : 'F&O'}
              </button>
            ))}
          </div>
        </div>

        {/* Signals Grid */}
        <div className="space-y-4">
          <AnimatePresence>
            {filteredSignals.map((signal, index) => {
              const target1 = signal.target_1 ?? signal.target
              const target2 = signal.target_2
              const riskReward = signal.risk_reward ?? signal.risk_reward_ratio
              const reasons = signal.reasons || []
              const optionLabel =
                signal.segment !== 'EQUITY' &&
                typeof signal.strike_price === 'number' &&
                signal.option_type &&
                signal.expiry_date
                  ? `${signal.strike_price} ${signal.option_type} • ${signal.expiry_date}`
                  : null

              return (
                <motion.div
                  key={signal.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ delay: index * 0.1 }}
                  className={`relative overflow-hidden rounded-2xl border ${
                    signal.direction === 'LONG'
                      ? 'border-green-500/20 bg-gradient-to-r from-green-500/5 to-transparent'
                      : 'border-red-500/20 bg-gradient-to-r from-red-500/5 to-transparent'
                  }`}
                >
                {/* Premium badge */}
                {signal.is_premium && !isPremium && (
                  <div className="absolute top-4 right-4 flex items-center gap-1 px-2 py-1 bg-amber-500/20 text-amber-400 text-xs font-medium rounded-full">
                    <Crown className="w-3 h-3" />
                    PRO
                  </div>
                )}

                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    {/* Stock info */}
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                        signal.direction === 'LONG' ? 'bg-green-500/20' : 'bg-red-500/20'
                      }`}>
                        {signal.direction === 'LONG' 
                          ? <TrendingUp className="w-7 h-7 text-green-400" />
                          : <TrendingDown className="w-7 h-7 text-red-400" />
                        }
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-bold text-white">{signal.symbol}</h3>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            signal.direction === 'LONG' 
                              ? 'bg-green-500/20 text-green-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {signal.direction}
                          </span>
                          <span className="px-2 py-0.5 text-xs font-medium bg-white/10 text-text-secondary rounded-full">
                            {signal.segment}
                          </span>
                        </div>
                        {optionLabel && (
                          <p className="text-sm text-text-muted mt-1">
                            {optionLabel}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Confidence */}
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-bold text-white">{signal.confidence}%</span>
                      </div>
                      <p className="text-sm text-text-muted">AI Confidence</p>
                    </div>
                  </div>

                  {/* Price levels */}
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="bg-white/[0.03] rounded-xl p-3">
                      <p className="text-xs text-text-muted mb-1">Entry</p>
                      <p className="text-lg font-semibold text-white">₹{signal.entry_price.toLocaleString()}</p>
                    </div>
                    <div className="bg-red-500/10 rounded-xl p-3">
                      <p className="text-xs text-red-400 mb-1">Stop Loss</p>
                      <p className="text-lg font-semibold text-red-400">₹{signal.stop_loss.toLocaleString()}</p>
                    </div>
                    <div className="bg-green-500/10 rounded-xl p-3">
                      <p className="text-xs text-green-400 mb-1">Target 1</p>
                      <p className="text-lg font-semibold text-green-400">
                        {typeof target1 === 'number' ? `₹${target1.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <div className="bg-green-500/10 rounded-xl p-3">
                      <p className="text-xs text-green-400 mb-1">Target 2</p>
                      <p className="text-lg font-semibold text-green-400">
                        {typeof target2 === 'number' ? `₹${target2.toLocaleString()}` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Reasons */}
                  <div className="flex items-center gap-2 mb-4">
                    {reasons.length > 0 ? (
                      reasons.map((reason, i) => (
                        <span key={i} className="px-3 py-1 bg-white/5 text-text-secondary text-sm rounded-full">
                          {reason}
                        </span>
                      ))
                    ) : (
                      <span className="px-3 py-1 bg-white/5 text-text-secondary text-sm rounded-full">
                        Rationale available in details
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between pt-4 border-t border-white/5">
                    <div className="flex items-center gap-2 text-sm text-text-muted">
                      <Clock className="w-4 h-4" />
                      <span>
                        Risk:Reward {typeof riskReward === 'number' ? riskReward.toFixed(1) : '—'}:1
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button className="flex items-center gap-2 px-4 py-2 bg-white/5 text-text-secondary rounded-xl hover:bg-white/10 transition-colors">
                        <Eye className="w-4 h-4" />
                        View Chart
                      </button>
                      
                      {signal.is_premium && !isPremium ? (
                        <Link
                          href="/pricing"
                          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium rounded-xl hover:shadow-lg hover:shadow-amber-500/25 transition-all"
                        >
                          <Lock className="w-4 h-4" />
                          Unlock with Pro
                        </Link>
                      ) : (
                        <button
                          onClick={() => executeTrade(signal)}
                          disabled={executing === signal.id}
                          className={`flex items-center gap-2 px-6 py-2.5 font-medium rounded-xl transition-all ${
                            signal.direction === 'LONG'
                              ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:shadow-lg hover:shadow-green-500/25'
                              : 'bg-gradient-to-r from-red-500 to-rose-500 text-white hover:shadow-lg hover:shadow-red-500/25'
                          } disabled:opacity-50`}
                        >
                          {executing === signal.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : canAutoTrade ? (
                            <Rocket className="w-4 h-4" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          {executing === signal.id 
                            ? 'Executing...' 
                            : canAutoTrade 
                              ? 'Auto Execute' 
                              : 'Execute Trade'
                          }
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
              )
            })}
          </AnimatePresence>
        </div>

        {/* Empty state */}
        {filteredSignals.length === 0 && !loading && (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
              <Target className="w-10 h-10 text-text-muted" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">No signals found</h3>
            <p className="text-text-muted mb-6">Signals are generated at 8:30 AM on trading days</p>
            <button
              onClick={fetchSignals}
              className="px-6 py-3 bg-emerald-500/20 text-emerald-400 rounded-xl font-medium hover:bg-emerald-500/30 transition-colors"
            >
              Refresh Signals
            </button>
          </div>
        )}

        {/* Bot Status */}
        <div className="mt-8 p-6 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-emerald-500/20">
                <Zap className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {canAutoTrade ? 'Auto-Trading Enabled' : 'Enable Auto-Trading'}
                </h3>
                <p className="text-sm text-text-secondary">
                  {canAutoTrade 
                    ? 'AI will automatically execute high-confidence signals'
                    : 'Connect your broker to enable AI-assisted execution'
                  }
                </p>
              </div>
            </div>
            {!canAutoTrade && (
              <Link
                href="/settings"
                className="flex items-center gap-2 px-6 py-3 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors"
              >
                Setup Auto-Trade
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
