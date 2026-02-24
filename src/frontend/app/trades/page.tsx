// ============================================================================
// SWINGAI - TRADES PAGE
// Trade history with filters, P&L tracking, and analytics
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError, Trade } from '../../lib/api'
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Filter,
  Download,
  Calendar,
  Search,
  RefreshCw,
  ChevronDown,
  X,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
} from 'lucide-react'

// ============================================================================
// TRADES PAGE
// ============================================================================

export default function TradesPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  
  // Data states
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [segmentFilter, setSegmentFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Fetch trades
  const fetchTrades = useCallback(async () => {
    if (!user) return
    
    setLoading(true)
    setError(null)
    
    try {
      const filters: any = { limit: 100 }
      if (statusFilter) filters.status = statusFilter
      if (segmentFilter) filters.segment = segmentFilter
      
      const result = await api.trades.getAll(filters)
      setTrades(result.trades || [])
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [user, statusFilter, segmentFilter])

  useEffect(() => {
    fetchTrades()
  }, [fetchTrades])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  if (authLoading) {
    return (
      <div className="app-shell flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
      </div>
    )
  }

  if (!user) return null

  // Filter trades by search
  const filteredTrades = trades.filter(trade => 
    trade.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Calculate stats
  const closedTrades = trades.filter(t => t.status === 'closed')
  const winners = closedTrades.filter(t => (t.net_pnl || 0) > 0)
  const losers = closedTrades.filter(t => (t.net_pnl || 0) < 0)
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.net_pnl || 0), 0)
  const winRate = closedTrades.length > 0 ? (winners.length / closedTrades.length * 100) : 0

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open':
        return <Clock className="w-4 h-4 text-blue-400" />
      case 'closed':
        return <CheckCircle className="w-4 h-4 text-green-400" />
      case 'cancelled':
        return <XCircle className="w-4 h-4 text-red-400" />
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-400" />
      default:
        return <AlertCircle className="w-4 h-4 text-text-muted" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30'
      case 'closed':
        return 'bg-green-500/10 text-green-400 border-green-500/30'
      case 'cancelled':
        return 'bg-red-500/10 text-red-400 border-red-500/30'
      case 'pending':
        return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
      default:
        return 'bg-background-elevated/60 text-text-muted border-border/50'
    }
  }

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header z-20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/dashboard" className="p-2 hover:bg-background-elevated rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5 text-text-secondary" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">Trade History</h1>
                <p className="text-sm text-text-muted">View and analyze your trades</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors ${
                  showFilters ? 'bg-primary/10 border-primary text-primary' : 'border-border/50 text-text-secondary hover:border-border/80'
                }`}
              >
                <Filter className="w-4 h-4" />
                Filters
              </button>
              <button
                onClick={fetchTrades}
                className="p-2 hover:bg-background-elevated rounded-lg transition-colors"
              >
                <RefreshCw className={`w-5 h-5 text-text-secondary ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="app-card p-4">
            <p className="text-sm text-text-muted mb-1">Total Trades</p>
            <p className="text-2xl font-bold text-text-primary">{trades.length}</p>
          </div>
          <div className="app-card p-4">
            <p className="text-sm text-text-muted mb-1">Win Rate</p>
            <p className={`text-2xl font-bold ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {winRate.toFixed(1)}%
            </p>
          </div>
          <div className="app-card p-4">
            <p className="text-sm text-text-muted mb-1">Winners</p>
            <p className="text-2xl font-bold text-green-400">{winners.length}</p>
          </div>
          <div className="app-card p-4">
            <p className="text-sm text-text-muted mb-1">Total P&L</p>
            <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ₹{totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        {/* Filters Panel */}
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="app-card p-4 mb-6"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by symbol..."
                    className="w-full pl-10 pr-4 py-2 bg-background-elevated border border-border/50 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 bg-background-elevated border border-border/50 rounded-lg text-text-primary focus:outline-none focus:border-primary"
              >
                <option value="">All Status</option>
                <option value="open">Open</option>
                <option value="closed">Closed</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
              </select>
              
              <select
                value={segmentFilter}
                onChange={(e) => setSegmentFilter(e.target.value)}
                className="px-4 py-2 bg-background-elevated border border-border/50 rounded-lg text-text-primary focus:outline-none focus:border-primary"
              >
                <option value="">All Segments</option>
                <option value="EQUITY">Equity</option>
                <option value="FUTURES">Futures</option>
                <option value="OPTIONS">Options</option>
              </select>

              {(statusFilter || segmentFilter || searchQuery) && (
                <button
                  onClick={() => {
                    setStatusFilter('')
                    setSegmentFilter('')
                    setSearchQuery('')
                  }}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4" />
                  Clear
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <p className="text-red-400">{error}</p>
          </div>
        )}

        {/* Trades Table */}
        <div className="app-panel overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
              <p className="text-text-muted">Loading trades...</p>
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-background-elevated rounded-full flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-text-muted" />
              </div>
              <p className="text-text-secondary mb-2">No trades found</p>
              <p className="text-sm text-text-muted">Your trade history will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-background-elevated">
                  <tr>
                    <th className="text-left px-6 py-4 text-sm font-medium text-text-muted">Symbol</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-text-muted">Direction</th>
                    <th className="text-left px-6 py-4 text-sm font-medium text-text-muted">Segment</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-text-muted">Qty</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-text-muted">Entry</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-text-muted">Exit</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-text-muted">P&L</th>
                    <th className="text-center px-6 py-4 text-sm font-medium text-text-muted">Status</th>
                    <th className="text-right px-6 py-4 text-sm font-medium text-text-muted">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filteredTrades.map((trade) => (
                    <motion.tr
                      key={trade.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="hover:bg-background-elevated/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{trade.symbol}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`flex items-center gap-1 ${trade.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.direction === 'LONG' ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                          <span className="text-sm font-medium">{trade.direction}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-text-secondary">{trade.segment}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-text-primary">{trade.quantity}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-text-primary">₹{trade.entry_price.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {trade.exit_price ? (
                          <span className="text-text-primary">₹{trade.exit_price.toFixed(2)}</span>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {trade.net_pnl !== undefined && trade.net_pnl !== null ? (
                          <div>
                            <span className={`font-medium ${trade.net_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {trade.net_pnl >= 0 ? '+' : ''}₹{trade.net_pnl.toFixed(0)}
                            </span>
                            {trade.pnl_percent !== undefined && (
                              <p className={`text-xs ${trade.pnl_percent >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                                {trade.pnl_percent >= 0 ? '+' : ''}{trade.pnl_percent.toFixed(2)}%
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-muted">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(trade.status)}`}>
                            {getStatusIcon(trade.status)}
                            {trade.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm text-text-muted">
                          {new Date(trade.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: '2-digit',
                          })}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
