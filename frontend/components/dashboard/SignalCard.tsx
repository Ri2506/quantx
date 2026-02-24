// ============================================================================
// SWINGAI - SIGNAL CARD COMPONENT
// Compact signal with quick-execute button
// ============================================================================

'use client'

import { motion } from 'framer-motion'
import { Signal } from '../../types'
import {
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  Clock,
  Play,
  Eye,
} from 'lucide-react'
import Link from 'next/link'

interface SignalCardProps {
  signal: Signal
  onExecute?: (signalId: string) => void
  showExecuteButton?: boolean
}

export default function SignalCard({
  signal,
  onExecute,
  showExecuteButton = true,
}: SignalCardProps) {
  const isLong = signal.direction === 'LONG'
  const riskRewardValue =
    typeof signal.risk_reward_ratio === 'number'
      ? signal.risk_reward_ratio
      : typeof signal.risk_reward === 'number'
      ? signal.risk_reward
      : null
  const targetPrice = signal.target ?? signal.target_1 ?? signal.target_2 ?? null
  const consensusRaw = signal.model_predictions?.model_agreement ?? signal.model_agreement
  const consensus =
    typeof consensusRaw === 'number'
      ? consensusRaw <= 1
        ? consensusRaw * 100
        : (consensusRaw / 3) * 100
      : null
  const createdAt = signal.created_at || signal.generated_at || signal.date || null

  // Calculate confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-success'
    if (confidence >= 60) return 'text-warning'
    return 'text-danger'
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.01, y: -2 }}
      transition={{ duration: 0.2 }}
      className="bg-background-surface/50 backdrop-blur-xl rounded-xl border border-gray-800 p-4 hover:border-gray-700 hover:shadow-lg transition-all group"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Direction Badge */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            className={`p-2 rounded-lg ${
              isLong ? 'bg-success/20' : 'bg-danger/20'
            }`}
          >
            {isLong ? (
              <TrendingUp className="w-5 h-5 text-success" />
            ) : (
              <TrendingDown className="w-5 h-5 text-danger" />
            )}
          </motion.div>

          <div>
            {/* Symbol & Segment */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-text-primary text-lg">
                {signal.symbol}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  signal.segment === 'EQUITY'
                    ? 'bg-blue-500/20 text-blue-400'
                    : signal.segment === 'FUTURES'
                    ? 'bg-purple-500/20 text-purple-400'
                    : 'bg-orange-500/20 text-orange-400'
                }`}
              >
                {signal.segment}
              </span>
            </div>

            {/* Direction Label */}
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`text-xs font-bold ${
                  isLong ? 'text-success' : 'text-danger'
                }`}
              >
                {signal.direction}
              </span>
              <span className="text-text-muted text-xs">•</span>
              <span className="text-text-secondary text-xs">
                {signal.exchange}
              </span>
            </div>
          </div>
        </div>

        {/* Confidence Badge */}
        <div className="flex flex-col items-end">
          <div
            className={`text-2xl font-bold font-mono ${getConfidenceColor(
              signal.confidence
            )}`}
          >
            {signal.confidence}%
          </div>
          <div className="text-xs text-text-muted">Confidence</div>
        </div>
      </div>

      {/* Price Details */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Entry */}
        <div className="bg-background-elevated rounded-lg p-3 border border-gray-800">
          <div className="flex items-center gap-1 mb-1">
            <Play className="w-3 h-3 text-text-muted" />
            <p className="text-xs text-text-muted">Entry</p>
          </div>
          <p className="text-sm font-bold text-text-primary font-mono">
            ₹{signal.entry_price.toLocaleString('en-IN')}
          </p>
        </div>

        {/* Stop Loss */}
        <div className="bg-danger/5 rounded-lg p-3 border border-danger/20">
          <div className="flex items-center gap-1 mb-1">
            <Shield className="w-3 h-3 text-danger" />
            <p className="text-xs text-danger">SL</p>
          </div>
          <p className="text-sm font-bold text-danger font-mono">
            ₹{signal.stop_loss.toLocaleString('en-IN')}
          </p>
        </div>

        {/* Target */}
        <div className="bg-success/5 rounded-lg p-3 border border-success/20">
          <div className="flex items-center gap-1 mb-1">
            <Target className="w-3 h-3 text-success" />
            <p className="text-xs text-success">Target</p>
          </div>
          <p className="text-sm font-bold text-success font-mono">
            {typeof targetPrice === 'number' ? `₹${targetPrice.toLocaleString('en-IN')}` : '—'}
          </p>
        </div>
      </div>

      {/* Risk/Reward & Consensus */}
      <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-800">
        <div className="flex items-center gap-4">
          {/* Risk/Reward */}
          <div>
            <p className="text-xs text-text-muted mb-1">R:R Ratio</p>
            <p className="text-sm font-bold text-text-primary">
              {riskRewardValue !== null ? `1:${riskRewardValue.toFixed(2)}` : '—'}
            </p>
          </div>

          {/* AI Consensus */}
          <div>
            <p className="text-xs text-text-muted mb-1">AI Consensus</p>
            <p className="text-sm font-bold text-text-primary">
              {consensus !== null ? `${Math.round(consensus)}%` : '—'}
            </p>
          </div>

          {/* Position Size */}
          <div>
            <p className="text-xs text-text-muted mb-1">Qty</p>
            <p className="text-sm font-bold text-text-primary">
              {signal.position_size ?? '—'}
            </p>
          </div>
        </div>

        {/* Time */}
        <div className="flex items-center gap-1 text-text-muted">
          <Clock className="w-3 h-3" />
          <span className="text-xs">
            {createdAt ? new Date(createdAt).toLocaleDateString() : '—'}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* View Details */}
        <Link
          href={`/signals/${signal.id}`}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-background-elevated rounded-lg border border-gray-800 hover:border-gray-700 transition-all group/btn"
        >
          <Eye className="w-4 h-4 text-text-muted group-hover/btn:text-text-primary transition-colors" />
          <span className="text-sm font-medium text-text-secondary group-hover/btn:text-text-primary transition-colors">
            View Details
          </span>
        </Link>

        {/* Execute Button */}
        {showExecuteButton && onExecute && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onExecute(signal.id)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-primary rounded-lg text-white font-medium shadow-glow-sm hover:shadow-glow-md transition-all"
          >
            <Play className="w-4 h-4" />
            Execute
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
