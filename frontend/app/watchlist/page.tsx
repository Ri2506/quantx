// ============================================================================
// WATCHLIST PAGE - Track Your Favorite Stocks
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bookmark, BookmarkX, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  RefreshCw, ArrowLeft, Search, Trash2, Eye, Edit2, X, Check,
  Plus, AlertCircle, Target, LineChart, BarChart3
} from 'lucide-react'
import AdvancedStockChart from '@/components/AdvancedStockChart'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || ''

interface WatchlistItem {
  id: string
  symbol: string
  name: string
  current_price: number
  change_percent: number
  volume: number
  sector: string
  notes?: string
  target_price?: number
  stop_loss?: number
  added_at: string
}

export default function WatchlistPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [userId] = useState('ffb9e2ca-6733-4e84-9286-0aa134e6f57e') // Test user - replace with real auth
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ notes: '', target_price: '', stop_loss: '' })
  const [chartSymbol, setChartSymbol] = useState<string | null>(null)
  const [addSymbol, setAddSymbol] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetchWatchlist()
  }, [])

  const fetchWatchlist = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/${userId}`)
      const data = await res.json()

      if (data.success) {
        setWatchlist(data.watchlist || [])
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error)
    } finally {
      setLoading(false)
    }
  }

  const removeFromWatchlist = async (symbol: string) => {
    try {
      await fetch(`${API_BASE}/api/watchlist/${userId}/${symbol}`, { method: 'DELETE' })
      setWatchlist(prev => prev.filter(item => item.symbol !== symbol))
    } catch (error) {
      console.error('Error removing from watchlist:', error)
    }
  }

  const addToWatchlist = async () => {
    if (!addSymbol.trim()) return

    setAdding(true)
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, symbol: addSymbol.toUpperCase() })
      })
      const data = await res.json()

      if (data.success) {
        setAddSymbol('')
        fetchWatchlist() // Refresh to get full data
      }
    } catch (error) {
      console.error('Error adding to watchlist:', error)
    } finally {
      setAdding(false)
    }
  }

  const startEditing = (item: WatchlistItem) => {
    setEditingItem(item.symbol)
    setEditForm({
      notes: item.notes || '',
      target_price: item.target_price?.toString() || '',
      stop_loss: item.stop_loss?.toString() || ''
    })
  }

  const saveEdit = async (symbol: string) => {
    try {
      const params = new URLSearchParams()
      if (editForm.notes) params.append('notes', editForm.notes)
      if (editForm.target_price) params.append('target_price', editForm.target_price)
      if (editForm.stop_loss) params.append('stop_loss', editForm.stop_loss)

      await fetch(`${API_BASE}/api/watchlist/${userId}/${symbol}?${params}`, { method: 'PUT' })

      setWatchlist(prev => prev.map(item =>
        item.symbol === symbol
          ? {
              ...item,
              notes: editForm.notes || undefined,
              target_price: editForm.target_price ? parseFloat(editForm.target_price) : undefined,
              stop_loss: editForm.stop_loss ? parseFloat(editForm.stop_loss) : undefined
            }
          : item
      ))
      setEditingItem(null)
    } catch (error) {
      console.error('Error updating watchlist item:', error)
    }
  }

  const totalValue = watchlist.reduce((sum, item) => sum + (item.current_price || 0), 0)
  const gainers = watchlist.filter(item => (item.change_percent || 0) > 0).length
  const losers = watchlist.filter(item => (item.change_percent || 0) < 0).length

  return (
    <div className="min-h-screen bg-space-void text-text-primary" data-testid="watchlist-page">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-space-deep/50 via-space-void to-space-void pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-space-void/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/screener" className="flex items-center gap-2 text-text-secondary hover:text-text-primary">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-600">
                  <Bookmark className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">My Watchlist</h1>
                  <p className="text-xs text-text-secondary/50">{watchlist.length} stocks tracked</p>
                </div>
              </div>
            </div>

            <button
              onClick={fetchWatchlist}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Stats Cards */}
        <ScrollReveal delay={0}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card3D>
              <div className="glass-card-neu border border-white/[0.04] rounded-xl p-4">
                <div className="text-text-secondary text-sm mb-1">Total Stocks</div>
                <div className="text-2xl font-bold text-text-primary">{watchlist.length}</div>
              </div>
            </Card3D>
            <Card3D>
              <div className="glass-card-neu border border-white/[0.04] rounded-xl p-4">
                <div className="text-text-secondary text-sm mb-1">Gainers Today</div>
                <div className="text-2xl font-bold text-neon-green">{gainers}</div>
              </div>
            </Card3D>
            <Card3D>
              <div className="glass-card-neu border border-white/[0.04] rounded-xl p-4">
                <div className="text-text-secondary text-sm mb-1">Losers Today</div>
                <div className="text-2xl font-bold text-danger">{losers}</div>
              </div>
            </Card3D>
            <Card3D>
              <div className="glass-card-neu border border-white/[0.04] rounded-xl p-4">
                <div className="text-text-secondary text-sm mb-1">Avg Price</div>
                <div className="text-2xl font-bold text-text-primary">
                  {watchlist.length > 0 ? (totalValue / watchlist.length).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : 0}
                </div>
              </div>
            </Card3D>
          </div>
        </ScrollReveal>

        {/* Add Stock */}
        <ScrollReveal delay={0.1}>
          <div className="mb-6 flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary/50" />
              <input
                type="text"
                placeholder="Add stock to watchlist (e.g., RELIANCE)"
                value={addSymbol}
                onChange={(e) => setAddSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && addToWatchlist()}
                className="w-full pl-10 pr-4 py-3 glass-card-neu border border-white/[0.04] rounded-xl text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:border-neon-cyan/60"
                data-testid="add-stock-input"
              />
            </div>
            <button
              onClick={addToWatchlist}
              disabled={adding || !addSymbol.trim()}
              className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-600 rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
              data-testid="add-stock-btn"
            >
              {adding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add
            </button>
          </div>
        </ScrollReveal>

        {/* Watchlist Table */}
        <ScrollReveal delay={0.2}>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="loader-rings" />
            </div>
          ) : watchlist.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="p-4 rounded-2xl bg-neon-gold/10 border border-neon-gold/20 mb-4">
                <Bookmark className="w-12 h-12 text-neon-gold" />
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-2">No Stocks in Watchlist</h3>
              <p className="text-text-secondary max-w-md mb-4">
                Start adding stocks to track their performance. Use the search bar above or add from the screener.
              </p>
              <Link
                href="/screener"
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl font-medium flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                Go to Screener
              </Link>
            </div>
          ) : (
            <div className="glass-card-neu border border-white/[0.04] rounded-xl overflow-hidden">
              <table className="w-full">
                <thead className="bg-white/[0.02]">
                  <tr className="text-left text-sm text-text-secondary">
                    <th className="px-4 py-3 font-medium">Symbol</th>
                    <th className="px-4 py-3 font-medium">Price</th>
                    <th className="px-4 py-3 font-medium">Change</th>
                    <th className="px-4 py-3 font-medium hidden md:table-cell">Target / SL</th>
                    <th className="px-4 py-3 font-medium hidden lg:table-cell">Notes</th>
                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {watchlist.map((item) => {
                    const isPositive = (item.change_percent || 0) >= 0
                    const isEditing = editingItem === item.symbol

                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-white/[0.04] transition"
                        data-testid={`watchlist-row-${item.symbol}`}
                      >
                        <td className="px-4 py-4">
                          <div>
                            <div className="font-bold text-text-primary">{item.symbol}</div>
                            <div className="text-xs text-text-secondary/50 truncate max-w-[150px]">{item.name}</div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-semibold text-text-primary">
                            {item.current_price?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className={`flex items-center gap-1 ${isPositive ? 'text-neon-green' : 'text-danger'}`}>
                            {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            {Math.abs(item.change_percent || 0).toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          {isEditing ? (
                            <div className="flex gap-2">
                              <input
                                type="number"
                                placeholder="Target"
                                value={editForm.target_price}
                                onChange={(e) => setEditForm({ ...editForm, target_price: e.target.value })}
                                className="w-20 px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-sm text-text-primary"
                              />
                              <input
                                type="number"
                                placeholder="SL"
                                value={editForm.stop_loss}
                                onChange={(e) => setEditForm({ ...editForm, stop_loss: e.target.value })}
                                className="w-20 px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-sm text-text-primary"
                              />
                            </div>
                          ) : (
                            <div className="text-sm">
                              {item.target_price && (
                                <span className="text-neon-green mr-2">T: {item.target_price}</span>
                              )}
                              {item.stop_loss && (
                                <span className="text-danger">SL: {item.stop_loss}</span>
                              )}
                              {!item.target_price && !item.stop_loss && (
                                <span className="text-text-secondary/50">-</span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4 hidden lg:table-cell">
                          {isEditing ? (
                            <input
                              type="text"
                              placeholder="Notes"
                              value={editForm.notes}
                              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                              className="w-full px-2 py-1 bg-white/[0.04] border border-white/[0.06] rounded text-sm text-text-primary"
                            />
                          ) : (
                            <div className="text-sm text-text-secondary truncate max-w-[200px]">
                              {item.notes || '-'}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-end gap-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => saveEdit(item.symbol)}
                                  className="p-2 hover:bg-neon-green/10 rounded-lg text-neon-green"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setEditingItem(null)}
                                  className="p-2 hover:bg-white/[0.06] rounded-lg text-text-secondary"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => setChartSymbol(item.symbol)}
                                  className="p-2 hover:bg-neon-cyan/10 rounded-lg text-neon-cyan"
                                  title="View Chart"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => startEditing(item)}
                                  className="p-2 hover:bg-white/[0.06] rounded-lg text-text-secondary"
                                  title="Edit"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => removeFromWatchlist(item.symbol)}
                                  className="p-2 hover:bg-danger/10 rounded-lg text-danger"
                                  title="Remove"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </ScrollReveal>
      </div>

      {/* Stock Chart Modal */}
      <AnimatePresence>
        {chartSymbol && (
          <StockChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />
        )}
      </AnimatePresence>
    </div>
  )
}

// Use AdvancedStockChart component for modal
function StockChartModal({ symbol, onClose }: { symbol: string; onClose: () => void }) {
  return (
    <AdvancedStockChart
      symbol={symbol}
      isModal={true}
      onClose={onClose}
      showHeader={true}
      height="500px"
    />
  )
}
