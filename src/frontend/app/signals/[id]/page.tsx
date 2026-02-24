// ============================================================================
// SWINGAI - SIGNAL DETAIL PAGE
// Detailed view of individual signal with live data, chart, and execution workflows
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useAuth } from '../../../contexts/AuthContext'
import { api, handleApiError, Signal } from '../../../lib/api'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Clock,
  BarChart3,
  CheckCircle,
  XCircle,
  AlertCircle,
  Zap,
  Loader2,
  RefreshCw,
  Play,
  Bell,
  BookmarkPlus,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

interface DetailedSignal extends Signal {
  current_price?: number
  strategy_confluence?: number
  active_strategies?: string[]
  market_regime?: string
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SignalDetailPage() {
  const router = useRouter()
  const params = useParams()
  const { user, profile } = useAuth()
  const signalId = params.id as string
  
  // State
  const [signal, setSignal] = useState<DetailedSignal | null>(null)
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [livePrice, setLivePrice] = useState<number | null>(null)

  // Fetch signal data from API
  const fetchSignal = useCallback(async () => {
    if (!signalId) return
    
    try {
      setLoading(true)
      setError(null)
      
      // Fetch signal details
      const signalData = await api.signals.getById(signalId)
      setSignal(signalData as unknown as DetailedSignal)
      
      // Fetch live price for the symbol
      try {
        const quoteData = await api.market.getQuote(signalData.symbol)
        setLivePrice(quoteData.ltp as number)
      } catch (e) {
        console.warn('Could not fetch live price:', e)
      }
      
    } catch (err) {
      setError(handleApiError(err))
      toast.error('Failed to load signal')
    } finally {
      setLoading(false)
    }
  }, [signalId])

  // Initial load
  useEffect(() => {
    if (!user) {
      router.push('/login')
      return
    }
    fetchSignal()
  }, [user, router, fetchSignal])

  // Refresh price periodically
  useEffect(() => {
    if (!signal?.symbol) return
    
    const interval = setInterval(async () => {
      try {
        const quoteData = await api.market.getQuote(signal.symbol)
        setLivePrice(quoteData.ltp as number)
      } catch (e) {
        // Silently fail
      }
    }, 30000) // Every 30 seconds
    
    return () => clearInterval(interval)
  }, [signal?.symbol])

  // Execute trade
  const handleExecute = async () => {
    if (!signal) return
    
    setExecuting(true)
    try {
      const result = await api.trades.execute({ signal_id: signal.id })
      
      if (result.success) {
        if (result.status === 'pending') {
          toast.success('Pending trade created. It will execute when your broker workflow confirms it.')
          router.push('/trades')
        } else {
          toast.success('Trade executed successfully!')
          router.push('/portfolio')
        }
      } else {
        toast.error('Failed to execute trade')
      }
    } catch (err) {
      toast.error(handleApiError(err))
    } finally {
      setExecuting(false)
    }
  }

  // Add to watchlist
  const handleAddToWatchlist = async () => {
    if (!signal) return
    
    try {
      await api.watchlist.add(signal.symbol)
      toast.success(`${signal.symbol} added to watchlist`)
    } catch (err) {
      toast.error(handleApiError(err))
    }
  }

  // Loading state
  if (loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">Loading signal...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error || !signal) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-danger mx-auto mb-4" />
          <h2 className="text-xl font-bold text-text-primary mb-2">Signal Not Found</h2>
          <p className="text-text-secondary mb-4">{error || 'The signal you are looking for does not exist.'}</p>
          <Link href="/signals" className="text-primary hover:underline">
            ← Back to Signals
          </Link>
        </div>
      </div>
    )
  }

  // Calculate P&L
  const currentPrice = livePrice || signal.current_price || signal.entry_price
  const isProfitable = currentPrice > signal.entry_price
  const pnl = (currentPrice - signal.entry_price) * (signal.position_size || 100)
  const pnlPercent = ((currentPrice - signal.entry_price) / signal.entry_price) * 100
  const target1 = signal.target_1 ?? signal.target ?? signal.entry_price
  const riskRange = target1 - signal.stop_loss
  const entryPercent = riskRange !== 0 ? ((signal.entry_price - signal.stop_loss) / riskRange) * 100 : 0
  const pricePercent = riskRange !== 0 ? Math.abs((currentPrice - signal.entry_price) / riskRange) * 100 : 0
  
  // Determine user's trading mode
  const tradingMode = profile?.trading_mode || 'signal_only'
  const canExecute = tradingMode !== 'signal_only' && profile?.broker_connected

  const consensusRaw = signal.model_predictions?.model_agreement ?? signal.model_agreement
  const consensus =
    typeof consensusRaw === 'number'
      ? consensusRaw <= 1
        ? consensusRaw * 100
        : (consensusRaw / 3) * 100
      : null
  const generatedAt = signal.generated_at || signal.created_at || signal.date || null
  const validUntil = signal.valid_until || null

  // Technical analysis with defaults
  const technicalAnalysis = signal.technical_analysis || {
    rsi: 50,
    macd: { value: 0, signal: 0, histogram: 0 },
    volume_ratio: 1.0,
    support_levels: [signal.stop_loss],
    resistance_levels: [target1],
  }
  const macdValue =
    'value' in technicalAnalysis.macd
      ? technicalAnalysis.macd.value
      : technicalAnalysis.macd.macd
  const volumeRatio =
    'volume_ratio' in technicalAnalysis
      ? technicalAnalysis.volume_ratio
      : technicalAnalysis.volume_analysis?.volume_ratio ?? 1.0

  return (
    <div className="app-shell">
      {/* Header */}
      <div className="border-b border-border/50 bg-background-surface/50 backdrop-blur-xl sticky top-0 z-10">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/signals"
                className="p-2 rounded-lg hover:bg-background-elevated transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-text-secondary" />
              </Link>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-3xl font-bold text-text-primary">{signal.symbol}</h1>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    signal.direction === 'LONG'
                      ? 'bg-success/20 text-success'
                      : 'bg-danger/20 text-danger'
                  }`}>
                    {signal.direction}
                  </span>
                  <span className="px-3 py-1 rounded-full text-sm bg-background-elevated/80 text-text-secondary">
                    {signal.segment}
                  </span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    signal.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
                    signal.status === 'triggered' ? 'bg-green-500/20 text-green-400' :
                    'bg-background-elevated/60 text-text-secondary'
                  }`}>
                    {signal.status?.toUpperCase()}
                  </span>
                </div>
                <p className="text-text-secondary mt-1">{signal.exchange || 'NSE'} • Signal #{signal.id?.slice(0, 8)}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button 
                onClick={fetchSignal}
                className="p-2 rounded-lg hover:bg-background-elevated transition-colors"
                title="Refresh"
              >
                <RefreshCw className="w-5 h-5 text-text-muted" />
              </button>
              
              {canExecute && signal.status === 'active' && (
                <button 
                  onClick={handleExecute}
                  disabled={executing}
                  className="px-6 py-3 bg-gradient-primary text-white rounded-xl font-medium hover:shadow-glow-md transition-all disabled:opacity-50"
                >
                  {executing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <Play className="w-4 h-4 inline mr-2" />
                      Execute Trade
                    </>
                  )}
                </button>
              )}
              
              {!canExecute && (
                <div className="text-sm text-text-muted">
                  {!profile?.broker_connected 
                    ? 'Connect broker to execute'
                    : 'Signal-only mode'}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Price Info */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="app-panel p-6"
            >
              <h2 className="text-xl font-bold text-text-primary mb-6">Price Information</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-text-muted text-sm mb-1">Entry Price</div>
                  <div className="text-xl font-bold text-text-primary font-mono">
                    ₹{signal.entry_price.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted text-sm mb-1">Current Price</div>
                  <div className={`text-xl font-bold font-mono ${isProfitable ? 'text-success' : 'text-danger'}`}>
                    ₹{currentPrice.toFixed(2)}
                    {livePrice && <span className="text-xs text-text-muted ml-1">LIVE</span>}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted text-sm mb-1">Stop Loss</div>
                  <div className="text-xl font-bold text-danger font-mono">
                    ₹{signal.stop_loss.toFixed(2)}
                  </div>
                </div>
                <div>
                  <div className="text-text-muted text-sm mb-1">Target</div>
                  <div className="text-xl font-bold text-success font-mono">
                    ₹{target1.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* P&L */}
              <div className="mt-6 p-4 rounded-xl bg-background-elevated border border-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-text-muted text-sm mb-1">Unrealized P&L (per 100 shares)</div>
                    <div className={`text-2xl font-bold font-mono ${isProfitable ? 'text-success' : 'text-danger'}`}>
                      {isProfitable ? '+' : ''}₹{pnl.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-text-muted text-sm mb-1">Return</div>
                    <div className={`text-2xl font-bold ${isProfitable ? 'text-success' : 'text-danger'}`}>
                      {pnlPercent > 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
                
                {/* Progress to target/SL */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-text-muted mb-1">
                    <span>SL: ₹{signal.stop_loss.toFixed(0)}</span>
                    <span>Entry: ₹{signal.entry_price.toFixed(0)}</span>
                    <span>Target: ₹{target1.toFixed(0)}</span>
                  </div>
                  <div className="w-full h-2 bg-background-elevated/80 rounded-full overflow-hidden relative">
                    <div 
                      className="absolute h-full bg-background-elevated" 
                      style={{ 
                        left: '0%',
                        width: `${entryPercent}%`
                      }}
                    />
                    <div 
                      className={`absolute h-full ${isProfitable ? 'bg-success' : 'bg-danger'}`}
                      style={{ 
                        left: `${entryPercent}%`,
                        width: `${pricePercent}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* AI Signal Summary */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="app-panel p-6"
            >
              <h2 className="text-xl font-bold text-text-primary mb-6">AI Signal Summary</h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="text-text-muted text-sm mb-1">Signal Strength</div>
                  <div className="text-2xl font-bold text-text-primary">{signal.confidence.toFixed(0)}%</div>
                  <div className="text-xs text-text-secondary mt-1">
                    {signal.confidence >= 75 ? 'High conviction' : signal.confidence >= 60 ? 'Qualified setup' : 'Monitor closely'}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="text-text-muted text-sm mb-1">AI Consensus</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {consensus !== null ? `${Math.round(consensus)}%` : 'N/A'}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">AI alignment</div>
                </div>
                <div className="p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="text-text-muted text-sm mb-1">Market Regime</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {signal.market_regime || 'Not specified'}
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="text-text-muted text-sm mb-1">Validity</div>
                  <div className="text-2xl font-bold text-text-primary">
                    {validUntil ? new Date(validUntil).toLocaleDateString() : 'Not specified'}
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    {generatedAt ? `Generated ${new Date(generatedAt).toLocaleDateString()}` : 'Realtime updates'}
                  </div>
                </div>
              </div>

              {/* AI Confluence */}
              {signal.strategy_confluence && (
                <div className="mt-4 p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-text-secondary">AI Confluence</span>
                    <span className="text-xl font-bold text-primary">{signal.strategy_confluence.toFixed(0)}%</span>
                  </div>
                  {signal.active_strategies && signal.active_strategies.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {signal.active_strategies.slice(0, 3).map((strategy, i) => (
                        <span key={i} className="px-2 py-1 rounded bg-primary/10 text-primary text-xs">
                          {strategy}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </motion.div>

            {/* Technical Analysis */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="app-panel p-6"
            >
              <h2 className="text-xl font-bold text-text-primary mb-6">Technical Analysis</h2>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="text-text-muted text-sm mb-1">RSI (14)</div>
                  <div className="text-2xl font-bold text-text-primary">{technicalAnalysis.rsi?.toFixed(1)}</div>
                  <div className={`text-xs mt-1 ${
                    technicalAnalysis.rsi > 70 ? 'text-danger' : 
                    technicalAnalysis.rsi < 30 ? 'text-success' : 
                    'text-text-secondary'
                  }`}>
                    {technicalAnalysis.rsi > 70 ? 'Overbought' : 
                     technicalAnalysis.rsi < 30 ? 'Oversold' : 'Neutral'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="text-text-muted text-sm mb-1">MACD</div>
                  <div className="text-2xl font-bold text-text-primary">{macdValue.toFixed(2)}</div>
                  <div className={`text-xs mt-1 ${
                    technicalAnalysis.macd?.histogram > 0 ? 'text-success' : 'text-danger'
                  }`}>
                    {technicalAnalysis.macd?.histogram > 0 ? 'Bullish' : 'Bearish'} Momentum
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="text-text-muted text-sm mb-1">Volume Ratio</div>
                  <div className="text-2xl font-bold text-text-primary">{volumeRatio.toFixed(1)}x</div>
                  <div className="text-xs text-text-secondary mt-1">
                    {volumeRatio > 1.5 ? 'High Volume' : 
                     volumeRatio < 0.5 ? 'Low Volume' : 'Average'}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-background-elevated border border-border/50">
                  <div className="text-text-muted text-sm mb-1">Risk:Reward</div>
                  <div className="text-2xl font-bold text-success">1:{signal.risk_reward?.toFixed(1)}</div>
                  <div className="text-xs text-text-secondary mt-1">
                    {signal.risk_reward >= 2 ? 'Favorable' : 'Moderate'}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Signal Status */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="app-panel p-6"
            >
              <h3 className="text-lg font-bold text-text-primary mb-4">Signal Status</h3>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Status</span>
                  <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                    signal.status === 'active' ? 'bg-success/20 text-success' :
                    signal.status === 'triggered' ? 'bg-blue-500/20 text-blue-400' :
                    signal.status === 'target_hit' ? 'bg-green-500/20 text-green-400' :
                    signal.status === 'stop_loss_hit' ? 'bg-red-500/20 text-red-400' :
                    'bg-background-elevated/60 text-text-secondary'
                  }`}>
                    {signal.status?.replace('_', ' ').toUpperCase()}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Created</span>
                  <span className="text-text-primary font-mono text-sm">
                    {generatedAt ? new Date(generatedAt).toLocaleString() : 'Not specified'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Confidence</span>
                  <span className="text-text-primary font-bold">{signal.confidence}%</span>
                </div>

                {signal.market_regime && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Market Regime</span>
                    <span className="text-text-primary font-medium">{signal.market_regime}</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Risk Management */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="app-panel p-6"
            >
              <h3 className="text-lg font-bold text-text-primary mb-4">Risk Management</h3>

              <div className="space-y-3">
                <div className="flex items-center gap-2 text-danger">
                  <Shield className="w-4 h-4" />
                  <span className="text-sm">Stop Loss at ₹{signal.stop_loss.toFixed(2)}</span>
                </div>

                <div className="flex items-center gap-2 text-success">
                  <Target className="w-4 h-4" />
                  <span className="text-sm">Target at ₹{target1.toFixed(2)}</span>
                </div>

                {signal.target_2 && (
                  <div className="flex items-center gap-2 text-success/70">
                    <Target className="w-4 h-4" />
                    <span className="text-sm">Target 2 at ₹{signal.target_2.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 text-text-secondary">
                  <BarChart3 className="w-4 h-4" />
                  <span className="text-sm">
                    Max Risk: ₹{((signal.entry_price - signal.stop_loss) * 100).toFixed(2)} (per 100)
                  </span>
                </div>

                <div className="flex items-center gap-2 text-text-secondary">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-sm">
                    Potential: ₹{((target1 - signal.entry_price) * 100).toFixed(2)} (per 100)
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Actions */}
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="app-panel p-6"
            >
              <h3 className="text-lg font-bold text-text-primary mb-4">Quick Actions</h3>

              <div className="space-y-3">
                {signal.status === 'active' && canExecute && (
                  <button 
                    onClick={handleExecute}
                    disabled={executing}
                    className="w-full px-4 py-3 bg-gradient-primary text-white rounded-xl font-medium hover:shadow-glow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    {tradingMode === 'semi_auto' ? 'Create Pending Trade' : 'Execute Trade'}
                  </button>
                )}

                <button 
                  onClick={handleAddToWatchlist}
                  className="w-full px-4 py-3 bg-background-elevated border border-border/50 text-text-primary rounded-xl font-medium hover:border-border/80 transition-all flex items-center justify-center gap-2"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  Add to Watchlist
                </button>

                <button className="w-full px-4 py-3 bg-background-elevated border border-border/50 text-text-primary rounded-xl font-medium hover:border-border/80 transition-all flex items-center justify-center gap-2">
                  <Bell className="w-4 h-4" />
                  Set Price Alert
                </button>
              </div>
              
              {!profile?.broker_connected && (
                <div className="mt-4 p-3 rounded-lg bg-warning/10 border border-warning/30">
                  <p className="text-xs text-warning">
                    Connect your broker in Settings to execute trades automatically.
                  </p>
                  <Link href="/settings" className="text-xs text-primary hover:underline mt-1 inline-block">
                    Go to Settings →
                  </Link>
                </div>
              )}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
