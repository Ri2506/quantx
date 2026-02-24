// ============================================================================
// SWINGAI - SCANNER CARD COMPONENT
// AI Screener scan results preview
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Scanner } from '../../types'
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  ChevronRight,
  Play,
} from 'lucide-react'

interface ScannerCardProps {
  scanner: Scanner
  onRun?: (scannerId: string) => void
  isRunning?: boolean
}

export default function ScannerCard({ scanner, onRun, isRunning = false }: ScannerCardProps) {
  const getCategoryColor = (category: string) => {
    switch (category.toLowerCase()) {
      case 'breakouts':
        return 'bg-success/10 text-success border-success/20'
      case 'reversals':
        return 'bg-warning/10 text-warning border-warning/20'
      case 'momentum':
        return 'bg-primary/10 text-primary border-primary/20'
      case 'volume':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20'
      case 'smart money':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
      case 'patterns':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20'
      default:
        return 'bg-gray-500/10 text-gray-400 border-gray-500/20'
    }
  }

  const getTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className="bg-background-surface/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4 hover:border-gray-700 hover:shadow-lg transition-all group"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          {/* Category Badge */}
          <div
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium mb-2 border ${getCategoryColor(
              scanner.category
            )}`}
          >
            <Activity className="w-3 h-3" />
            {scanner.category}
          </div>

          {/* Scanner Name */}
          <h3 className="text-lg font-bold text-text-primary mb-1 group-hover:text-primary transition-colors">
            {scanner.name}
          </h3>

          {/* Description */}
          <p className="text-sm text-text-secondary line-clamp-2">{scanner.description}</p>
        </div>

        {/* Run Button */}
        {onRun && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onRun(scanner.id)}
            disabled={isRunning}
            className="flex-shrink-0 p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Run scan now"
          >
            <Play className={`w-4 h-4 ${isRunning ? 'animate-spin' : ''}`} />
          </motion.button>
        )}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-800">
        <div>
          <p className="text-xs text-text-muted mb-1">Stocks Matched</p>
          <div className="flex items-center gap-2">
            <p className="text-2xl font-bold text-text-primary">{scanner.stocks_matched}</p>
            {scanner.stocks_matched > 0 && (
              <TrendingUp className="w-4 h-4 text-success" />
            )}
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-text-muted mb-1">Last Run</p>
          <div className="flex items-center gap-1 text-sm text-text-secondary">
            <Clock className="w-3 h-3" />
            {getTimeAgo(scanner.last_run_at)}
          </div>
        </div>

        <div className="text-right">
          <p className="text-xs text-text-muted mb-1">Frequency</p>
          <div
            className={`text-xs px-2 py-1 rounded-full font-medium ${
              scanner.run_frequency === 'realtime'
                ? 'bg-success/20 text-success'
                : scanner.run_frequency === 'hourly'
                ? 'bg-warning/20 text-warning'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {scanner.run_frequency}
          </div>
        </div>
      </div>

      {/* Preview Results */}
      {scanner.stocks_matched > 0 && (
        <div className="mb-4">
          <p className="text-xs text-text-muted mb-2">Top Matches:</p>
          <div className="flex flex-wrap gap-2">
            {/* Mock preview - in real app, would show actual symbols */}
            {['RELIANCE', 'TCS', 'INFY'].slice(0, 3).map((symbol) => (
              <div
                key={symbol}
                className="px-2 py-1 bg-background-elevated rounded text-xs font-medium text-text-primary border border-gray-800"
              >
                {symbol}
              </div>
            ))}
            {scanner.stocks_matched > 3 && (
              <div className="px-2 py-1 text-xs text-text-muted">
                +{scanner.stocks_matched - 3} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Results Link */}
      <Link
        href={`/screener/${scanner.id}`}
        className="flex items-center justify-between px-4 py-2 bg-background-elevated rounded-lg hover:bg-background-surface transition-all group/link"
      >
        <span className="text-sm font-medium text-text-secondary group-hover/link:text-text-primary transition-colors">
          View All Results
        </span>
        <ChevronRight className="w-4 h-4 text-text-muted group-hover/link:text-primary group-hover/link:translate-x-1 transition-all" />
      </Link>
    </motion.div>
  )
}
