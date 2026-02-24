// ============================================================================
// SWINGAI - WATCHLIST TABLE COMPONENT
// Real-time sortable, filterable watchlist
// ============================================================================

'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Star,
  X,
  ArrowUpDown,
  Plus,
  Eye,
  Zap,
} from 'lucide-react'

interface WatchlistStock {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap: string
  isFavorite?: boolean
}

interface WatchlistTableProps {
  stocks: WatchlistStock[]
  onRemove?: (symbol: string) => void
  onToggleFavorite?: (symbol: string) => void
  onAddSignal?: (symbol: string) => void
  onViewChart?: (symbol: string) => void
}

type SortField = 'symbol' | 'price' | 'change' | 'changePercent' | 'volume'
type SortOrder = 'asc' | 'desc'

export default function WatchlistTable({
  stocks,
  onRemove,
  onToggleFavorite,
  onAddSignal,
  onViewChart,
}: WatchlistTableProps) {
  const [sortField, setSortField] = useState<SortField>('symbol')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [filter, setFilter] = useState<'all' | 'gainers' | 'losers'>('all')

  // Sort stocks
  const sortedStocks = [...stocks].sort((a, b) => {
    let aValue = a[sortField]
    let bValue = b[sortField]

    if (sortField === 'symbol') {
      return sortOrder === 'asc'
        ? aValue.toString().localeCompare(bValue.toString())
        : bValue.toString().localeCompare(aValue.toString())
    }

    return sortOrder === 'asc'
      ? Number(aValue) - Number(bValue)
      : Number(bValue) - Number(aValue)
  })

  // Filter stocks
  const filteredStocks = sortedStocks.filter((stock) => {
    if (filter === 'gainers') return stock.change > 0
    if (filter === 'losers') return stock.change < 0
    return true
  })

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-background-surface/50 backdrop-blur-xl rounded-2xl border border-gray-800 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-800">
        <div>
          <h3 className="text-lg font-bold text-text-primary">Watchlist</h3>
          <p className="text-sm text-text-secondary">{filteredStocks.length} stocks</p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === 'all'
                ? 'bg-primary text-white'
                : 'bg-background-elevated text-text-secondary hover:text-text-primary'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('gainers')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === 'gainers'
                ? 'bg-success text-white'
                : 'bg-background-elevated text-text-secondary hover:text-text-primary'
            }`}
          >
            Gainers
          </button>
          <button
            onClick={() => setFilter('losers')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === 'losers'
                ? 'bg-danger text-white'
                : 'bg-background-elevated text-text-secondary hover:text-text-primary'
            }`}
          >
            Losers
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-background-elevated">
            <tr>
              <th className="px-6 py-3 text-left">
                <button
                  onClick={() => handleSort('symbol')}
                  className="flex items-center gap-1 text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
                >
                  Symbol
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('price')}
                  className="flex items-center gap-1 ml-auto text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
                >
                  LTP
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('change')}
                  className="flex items-center gap-1 ml-auto text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
                >
                  Change
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('changePercent')}
                  className="flex items-center gap-1 ml-auto text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
                >
                  Change %
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <button
                  onClick={() => handleSort('volume')}
                  className="flex items-center gap-1 ml-auto text-xs font-medium text-text-muted hover:text-text-primary transition-colors"
                >
                  Volume
                  <ArrowUpDown className="w-3 h-3" />
                </button>
              </th>
              <th className="px-6 py-3 text-right">
                <span className="text-xs font-medium text-text-muted">Market Cap</span>
              </th>
              <th className="px-6 py-3 text-right">
                <span className="text-xs font-medium text-text-muted">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filteredStocks.map((stock, index) => {
              const isPositive = stock.change >= 0

              return (
                <motion.tr
                  key={stock.symbol}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="hover:bg-background-elevated/50 transition-colors group"
                >
                  {/* Symbol */}
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => onToggleFavorite?.(stock.symbol)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Star
                          className={`w-4 h-4 ${
                            stock.isFavorite
                              ? 'fill-warning text-warning'
                              : 'text-text-muted hover:text-warning'
                          }`}
                        />
                      </button>
                      <div>
                        <div className="font-bold text-text-primary">{stock.symbol}</div>
                        <div className="text-xs text-text-muted">{stock.name}</div>
                      </div>
                    </div>
                  </td>

                  {/* Price */}
                  <td className="px-6 py-4 text-right">
                    <div className="font-mono text-text-primary font-medium">
                      ₹{stock.price.toFixed(2)}
                    </div>
                  </td>

                  {/* Change */}
                  <td className="px-6 py-4 text-right">
                    <div
                      className={`font-mono font-medium ${
                        isPositive ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {isPositive ? '+' : ''}₹{stock.change.toFixed(2)}
                    </div>
                  </td>

                  {/* Change % */}
                  <td className="px-6 py-4 text-right">
                    <div
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-sm font-bold ${
                        isPositive
                          ? 'bg-success/20 text-success'
                          : 'bg-danger/20 text-danger'
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3 h-3" />
                      ) : (
                        <TrendingDown className="w-3 h-3" />
                      )}
                      {isPositive ? '+' : ''}
                      {stock.changePercent.toFixed(2)}%
                    </div>
                  </td>

                  {/* Volume */}
                  <td className="px-6 py-4 text-right">
                    <div className="text-text-secondary text-sm">
                      {(stock.volume / 1000000).toFixed(2)}M
                    </div>
                  </td>

                  {/* Market Cap */}
                  <td className="px-6 py-4 text-right">
                    <div className="text-text-secondary text-sm">{stock.marketCap}</div>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onViewChart && (
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => onViewChart(stock.symbol)}
                          className="p-2 rounded-lg hover:bg-background-surface transition-colors"
                          title="View Chart"
                        >
                          <Eye className="w-4 h-4 text-text-muted" />
                        </motion.button>
                      )}

                      {onAddSignal && (
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => onAddSignal(stock.symbol)}
                          className="p-2 rounded-lg hover:bg-background-surface transition-colors"
                          title="Add Signal"
                        >
                          <Zap className="w-4 h-4 text-primary" />
                        </motion.button>
                      )}

                      {onRemove && (
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => onRemove(stock.symbol)}
                          className="p-2 rounded-lg hover:bg-background-surface transition-colors"
                          title="Remove"
                        >
                          <X className="w-4 h-4 text-danger" />
                        </motion.button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Empty State */}
      {filteredStocks.length === 0 && (
        <div className="p-12 text-center">
          <Star className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
          <p className="text-text-muted mb-2">No stocks in watchlist</p>
          <button className="text-sm text-primary hover:text-primary-dark font-medium">
            <Plus className="w-4 h-4 inline mr-1" />
            Add stocks
          </button>
        </div>
      )}
    </motion.div>
  )
}
