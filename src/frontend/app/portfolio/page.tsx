// ============================================================================
// SWINGAI - PORTFOLIO PAGE
// Current positions overview with real-time P&L tracking
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError, Position } from '../../lib/api'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Target,
  X,
  Edit,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { EquityCurve } from '../../components/dashboard'

export default function PortfolioPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTab, setSelectedTab] = useState<'all' | 'equity' | 'futures' | 'options'>('all')
  const [closingPosition, setClosingPosition] = useState<string | null>(null)

  // Fetch positions from API
  const fetchPositions = useCallback(async () => {
    if (!user) return
    
    setLoading(true)
    try {
      const result = await api.positions.getOpen()
      setPositions(result.positions || [])
    } catch (err) {
      console.error('Failed to fetch positions:', err)
      // Use demo data for preview
      setPositions([
        {
          id: '1',
          user_id: '1',
          signal_id: '1',
          symbol: 'INFY',
          exchange: 'NSE',
          segment: 'EQUITY',
          direction: 'LONG',
          quantity: 100,
          entry_price: 1450.00,
          current_price: 1478.50,
          stop_loss: 1420.00,
          target: 1500.00,
          unrealized_pnl: 2850,
          unrealized_pnl_percentage: 1.97,
          status: 'open',
          opened_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: '2',
          user_id: '1',
          signal_id: '2',
          symbol: 'RELIANCE',
          exchange: 'NSE',
          segment: 'EQUITY',
          direction: 'LONG',
          quantity: 50,
          entry_price: 2456.75,
          current_price: 2468.30,
          stop_loss: 2400.00,
          target: 2550.00,
          unrealized_pnl: 577.50,
          unrealized_pnl_percentage: 0.47,
          status: 'open',
          opened_at: new Date(Date.now() - 3600000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: '3',
          user_id: '1',
          signal_id: '3',
          symbol: 'TCS',
          exchange: 'NSE',
          segment: 'EQUITY',
          direction: 'SHORT',
          quantity: 30,
          entry_price: 3678.90,
          current_price: 3672.15,
          stop_loss: 3720.00,
          target: 3600.00,
          unrealized_pnl: 202.50,
          unrealized_pnl_percentage: 0.18,
          status: 'open',
          opened_at: new Date(Date.now() - 7200000).toISOString(),
          updated_at: new Date().toISOString(),
        },
      ] as Position[])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchPositions()
  }, [fetchPositions])

  // Close position
  const closePosition = async (positionId: string) => {
    setClosingPosition(positionId)
    try {
      await api.positions.close(positionId)
      await fetchPositions()
    } catch (err) {
      alert(handleApiError(err))
    } finally {
      setClosingPosition(null)
    }
  }

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  if (authLoading || loading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!user) return null

  // Calculate portfolio stats
  const totalValue = positions.reduce((sum, pos) => sum + (pos.current_price * pos.quantity), 0)
  const totalPnL = positions.reduce((sum, pos) => sum + pos.unrealized_pnl, 0)
  const totalPnLPercent = (totalPnL / (totalValue - totalPnL)) * 100
  const longPositions = positions.filter(p => p.direction === 'LONG').length
  const shortPositions = positions.filter(p => p.direction === 'SHORT').length
  const dayPnL = totalPnL * 0.3 // Mock day P&L

  // Filter positions by segment
  const filteredPositions = selectedTab === 'all'
    ? positions
    : positions.filter(p => p.segment.toLowerCase() === selectedTab)

  // Mock equity curve data
  const equityCurveData = Array.from({ length: 90 }, (_, i) => ({
    date: new Date(Date.now() - (89 - i) * 86400000).toLocaleDateString(),
    equity: 100000 + i * 1000 + Math.random() * 5000,
    drawdown: -Math.random() * 15,
  }))

  return (
    <div className="app-shell">
      {/* Header */}
      <div className="app-header z-10">
        <div className="container mx-auto px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-text-primary mb-2">Portfolio</h1>
              <p className="text-text-secondary">Current positions and performance</p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="app-action"
              >
                Back to Dashboard
              </Link>
              <button
                onClick={fetchPositions}
                className="p-2 hover:bg-background-elevated rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
              </button>
              <Link
                href="/analytics"
                className="px-4 py-2 bg-gradient-primary text-white rounded-lg font-medium hover:shadow-glow-md transition-all"
              >
                View Analytics
              </Link>
            </div>
          </div>

          {/* Portfolio Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-gradient-to-br from-blue-600/20 to-blue-800/20 border border-blue-500/30"
            >
              <div className="flex items-center gap-2 text-blue-400 text-sm mb-1">
                <DollarSign className="w-4 h-4" />
                <span>Total Value</span>
              </div>
              <div className="text-2xl font-bold text-white font-mono">
                ₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className={`p-4 rounded-xl border ${
                totalPnL >= 0
                  ? 'bg-gradient-to-br from-green-600/20 to-green-800/20 border-green-500/30'
                  : 'bg-gradient-to-br from-red-600/20 to-red-800/20 border-red-500/30'
              }`}
            >
              <div className={`flex items-center gap-2 text-sm mb-1 ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPnL >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                <span>Total P&L</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${totalPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <div className={`text-sm mt-1 ${totalPnL >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                {totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="p-4 rounded-xl bg-background-elevated border border-border/50"
            >
              <div className="flex items-center gap-2 text-text-muted text-sm mb-1">
                <Activity className="w-4 h-4" />
                <span>Day P&L</span>
              </div>
              <div className={`text-2xl font-bold font-mono ${dayPnL >= 0 ? 'text-success' : 'text-danger'}`}>
                {dayPnL >= 0 ? '+' : ''}₹{dayPnL.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="p-4 rounded-xl bg-background-elevated border border-border/50"
            >
              <div className="flex items-center gap-2 text-text-muted text-sm mb-1">
                <Target className="w-4 h-4" />
                <span>Open Positions</span>
              </div>
              <div className="text-2xl font-bold text-text-primary">{positions.length}</div>
              <div className="text-xs text-text-secondary mt-1">
                {longPositions} Long • {shortPositions} Short
              </div>
            </motion.div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-2 mt-6">
            {(['all', 'equity', 'futures', 'options'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSelectedTab(tab)}
                className={`px-4 py-2 rounded-lg font-medium capitalize transition-all ${
                  selectedTab === tab
                    ? 'bg-primary text-white'
                    : 'bg-background-elevated text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Positions List */}
      <div className="container mx-auto px-6 py-8">
        <div className="space-y-6">
          {/* Positions Table */}
          <div className="app-panel overflow-hidden">
            <div className="p-6 border-b border-border/50">
              <h2 className="text-xl font-bold text-text-primary">Open Positions</h2>
            </div>

            {filteredPositions.length > 0 ? (
              <div className="divide-y divide-border/50">
                {filteredPositions.map((position, index) => (
                  <motion.div
                    key={position.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="p-6 hover:bg-background-elevated/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-xl font-bold text-text-primary">{position.symbol}</h3>
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              position.direction === 'LONG'
                                ? 'bg-success/20 text-success'
                                : 'bg-danger/20 text-danger'
                            }`}>
                              {position.direction}
                            </span>
                            <span className="px-2 py-1 rounded text-xs bg-background-elevated/80 text-text-secondary">
                              {position.segment}
                            </span>
                          </div>
                          <div className="text-sm text-text-muted mt-1">
                            {position.quantity} shares • Entry: ₹{position.entry_price.toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-sm text-text-muted mb-1">Current Price</div>
                          <div className="text-xl font-bold text-text-primary font-mono">
                            ₹{position.current_price.toFixed(2)}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm text-text-muted mb-1">P&L</div>
                          <div className={`text-xl font-bold font-mono ${
                            position.unrealized_pnl >= 0 ? 'text-success' : 'text-danger'
                          }`}>
                            {position.unrealized_pnl >= 0 ? '+' : ''}₹{position.unrealized_pnl.toFixed(2)}
                          </div>
                          <div className={`text-sm ${
                            position.unrealized_pnl >= 0 ? 'text-success' : 'text-danger'
                          }`}>
                            {position.unrealized_pnl_percentage >= 0 ? '+' : ''}{position.unrealized_pnl_percentage.toFixed(2)}%
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/signals/${position.signal_id}`}
                            className="p-2 rounded-lg bg-background-elevated border border-border/50 hover:border-border/80 transition-colors"
                          >
                            <Edit className="w-4 h-4 text-text-secondary" />
                          </Link>
                          <button
                            onClick={() => closePosition(position.id)}
                            disabled={closingPosition === position.id}
                            className="p-2 rounded-lg bg-danger/10 border border-danger/20 hover:bg-danger/20 transition-colors disabled:opacity-50"
                          >
                            {closingPosition === position.id ? (
                              <RefreshCw className="w-4 h-4 text-danger animate-spin" />
                            ) : (
                              <X className="w-4 h-4 text-danger" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Progress bars */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                          <span>To Target</span>
                          <span>₹{position.target.toFixed(2)}</span>
                        </div>
                        <div className="w-full h-2 bg-background-elevated/80 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-success to-green-400"
                            style={{
                              width: `${Math.min(100, ((position.current_price - position.entry_price) / (position.target - position.entry_price)) * 100)}%`
                            }}
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                          <span>To Stop Loss</span>
                          <span>₹{position.stop_loss.toFixed(2)}</span>
                        </div>
                        <div className="w-full h-2 bg-background-elevated/80 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-danger to-red-400"
                            style={{
                              width: `${100 - Math.min(100, Math.max(0, ((position.current_price - position.stop_loss) / (position.entry_price - position.stop_loss)) * 100))}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center">
                <Target className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
                <p className="text-text-muted mb-2">No open positions in this segment</p>
                <Link
                  href="/signals"
                  className="text-sm text-primary hover:text-primary-dark font-medium"
                >
                  Browse Signals
                </Link>
              </div>
            )}
          </div>

          {/* Equity Curve */}
          <EquityCurve data={equityCurveData} />
        </div>
      </div>
    </div>
  )
}
