'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Layers, Plus, Pause, Play, Settings2, Trash2, TrendingUp,
  TrendingDown, BarChart3, Clock, AlertTriangle, Zap, Eye,
  ChevronRight, RefreshCw,
} from 'lucide-react'
import SkeletonCard from '@/components/ui/SkeletonCard'
import EmptyState from '@/components/ui/EmptyState'
import { api, handleApiError } from '@/lib/api'
import type { StrategyDeployment, StrategyCatalog } from '@/types'

// ============================================================================
// HELPERS
// ============================================================================

const MODE_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  signal_only: { label: 'Signal Only', color: 'text-primary bg-primary/10', icon: Eye },
  semi_auto: { label: 'Semi-Auto', color: 'text-warning bg-warning/10', icon: Settings2 },
  full_auto: { label: 'Full Auto', color: 'text-up bg-up/10', icon: Zap },
}

const RISK_COLORS: Record<string, string> = {
  low: 'text-up',
  medium: 'text-warning',
  high: 'text-warning',
  very_high: 'text-down',
}

function formatPnl(val: number): string {
  const prefix = val >= 0 ? '+' : ''
  if (Math.abs(val) >= 100000) return `${prefix}${(val / 100000).toFixed(2)}L`
  if (Math.abs(val) >= 1000) return `${prefix}${(val / 1000).toFixed(1)}K`
  return `${prefix}${val.toFixed(0)}`
}

function formatCapital(val: number): string {
  if (val >= 100000) return `${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`
  return val.toString()
}

function timeAgo(dateStr?: string): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

// ============================================================================
// CAPITAL ALLOCATION BAR
// ============================================================================

function CapitalBar({ deployments }: { deployments: StrategyDeployment[] }) {
  const totalAllocated = deployments.reduce((sum, d) => sum + d.allocated_capital, 0)
  const segments = deployments.map((d) => ({
    name: d.strategy_catalog?.name || 'Unknown',
    amount: d.allocated_capital,
    pct: totalAllocated > 0 ? (d.allocated_capital / totalAllocated) * 100 : 0,
    pnl: d.total_pnl,
  }))

  const colors = [
    'bg-primary', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500',
    'bg-rose-500', 'bg-cyan-500', 'bg-lime-500', 'bg-pink-500',
  ]

  return (
    <div className="rounded-2xl border border-d-border bg-white/[0.02] p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white">Capital Allocation</h3>
        <span className="text-xs text-d-text-muted">Total: {formatCapital(totalAllocated)}</span>
      </div>

      {/* Bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-white/[0.04] mb-3">
        {segments.map((seg, i) => (
          <div
            key={i}
            className={`${colors[i % colors.length]} transition-all duration-500`}
            style={{ width: `${seg.pct}%` }}
            title={`${seg.name}: ${formatCapital(seg.amount)}`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${colors[i % colors.length]}`} />
            <span className="text-[10px] text-d-text-muted">{seg.name}</span>
            <span className="text-[10px] text-d-text-muted">{formatCapital(seg.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// DEPLOYMENT CARD
// ============================================================================

function DeploymentCard({
  deployment,
  onPause,
  onResume,
  onDeactivate,
}: {
  deployment: StrategyDeployment
  onPause: (id: string) => void
  onResume: (id: string) => void
  onDeactivate: (id: string) => void
}) {
  const strat = deployment.strategy_catalog
  const mode = MODE_LABELS[deployment.trade_mode] || MODE_LABELS.signal_only
  const ModeIcon = mode.icon
  const winRate = deployment.total_trades > 0
    ? ((deployment.winning_trades / deployment.total_trades) * 100).toFixed(1)
    : '0'
  const pnlPct = deployment.allocated_capital > 0
    ? ((deployment.total_pnl / deployment.allocated_capital) * 100).toFixed(1)
    : '0'

  return (
    <div className={`glass-card p-5 transition-all duration-300 ${
      deployment.is_paused
        ? 'opacity-60'
        : 'hover:border-primary/15'
    }`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Link
              href={`/marketplace/${strat?.slug || ''}`}
              className="text-sm font-semibold text-white hover:text-primary transition-colors truncate"
            >
              {strat?.name || 'Unknown Strategy'}
            </Link>
            {deployment.is_paused && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-warning/10 text-warning uppercase">
                Paused
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${mode.color}`}>
              <ModeIcon className="w-3 h-3" />
              {mode.label}
            </span>
            <span className="text-[10px] text-d-text-muted capitalize">
              {strat?.category?.replace(/_/g, ' ')} &middot; {strat?.segment}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-2">
          {deployment.is_paused ? (
            <button
              onClick={() => onResume(deployment.id)}
              className="p-1.5 rounded-lg hover:bg-up/10 text-d-text-muted hover:text-up transition-colors"
              title="Resume"
            >
              <Play className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => onPause(deployment.id)}
              className="p-1.5 rounded-lg hover:bg-warning/10 text-d-text-muted hover:text-warning transition-colors"
              title="Pause"
            >
              <Pause className="w-4 h-4" />
            </button>
          )}
          <Link
            href={`/marketplace/${strat?.slug || ''}`}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] text-d-text-muted hover:text-white transition-colors"
            title="Configure"
          >
            <Settings2 className="w-4 h-4" />
          </Link>
          <button
            onClick={() => onDeactivate(deployment.id)}
            className="p-1.5 rounded-lg hover:bg-down/10 text-d-text-muted hover:text-down transition-colors"
            title="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        <div>
          <p className="text-[10px] text-d-text-muted uppercase tracking-wider">P&L</p>
          <p className={`text-sm font-bold font-mono num-display ${deployment.total_pnl >= 0 ? 'text-up' : 'text-down'}`}>
            {formatPnl(deployment.total_pnl)}
          </p>
          <p className={`text-[10px] font-mono num-display ${deployment.total_pnl >= 0 ? 'text-up/60' : 'text-down/60'}`}>
            {Number(pnlPct) >= 0 ? '+' : ''}{pnlPct}%
          </p>
        </div>
        <div>
          <p className="text-[10px] text-d-text-muted uppercase tracking-wider">Trades</p>
          <p className="text-sm font-bold font-mono num-display text-white">{deployment.total_trades}</p>
          <p className="text-[10px] text-d-text-muted">
            W:{deployment.winning_trades} L:{deployment.losing_trades}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-d-text-muted uppercase tracking-wider">Win Rate</p>
          <p className="text-sm font-bold font-mono num-display text-white">{winRate}%</p>
        </div>
        <div>
          <p className="text-[10px] text-d-text-muted uppercase tracking-wider">Capital</p>
          <p className="text-sm font-bold font-mono num-display text-white">{formatCapital(deployment.allocated_capital)}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-d-border">
        <div className="flex items-center gap-1.5 text-[10px] text-d-text-muted">
          <Clock className="w-3 h-3" />
          Last signal: {timeAgo(deployment.last_signal_at)}
        </div>
        <Link
          href={`/marketplace/${strat?.slug || ''}`}
          className="flex items-center gap-1 text-[10px] text-primary/60 hover:text-primary transition-colors"
        >
          View Details <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
    </div>
  )
}

// ============================================================================
// MY STRATEGIES PAGE
// ============================================================================

export default function MyStrategiesPage() {
  const [deployments, setDeployments] = useState<StrategyDeployment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchDeployments = useCallback(async () => {
    try {
      const data = await api.marketplace.getMyStrategies()
      setDeployments(data.deployments || [])
    } catch (err) {
      console.error('Failed to fetch deployments:', handleApiError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchDeployments()
  }, [fetchDeployments])

  async function handlePause(id: string) {
    try {
      await api.marketplace.updateDeployment(id, { is_paused: true })
      setDeployments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, is_paused: true } : d)),
      )
    } catch (err) {
      console.error('Pause failed:', handleApiError(err))
    }
  }

  async function handleResume(id: string) {
    try {
      await api.marketplace.updateDeployment(id, { is_paused: false })
      setDeployments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, is_paused: false } : d)),
      )
    } catch (err) {
      console.error('Resume failed:', handleApiError(err))
    }
  }

  async function handleDeactivate(id: string) {
    if (!confirm('Remove this strategy deployment? You can re-deploy anytime.')) return
    try {
      await api.marketplace.deactivateDeployment(id)
      setDeployments((prev) => prev.filter((d) => d.id !== id))
    } catch (err) {
      console.error('Deactivate failed:', handleApiError(err))
    }
  }

  // Summary stats
  const totalPnl = deployments.reduce((s, d) => s + d.total_pnl, 0)
  const totalTrades = deployments.reduce((s, d) => s + d.total_trades, 0)
  const totalCapital = deployments.reduce((s, d) => s + d.allocated_capital, 0)
  const activeCount = deployments.filter((d) => !d.is_paused).length

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
      {/* ================================================================ */}
      {/* HEADER */}
      {/* ================================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">My Strategies</h1>
          <p className="text-sm text-d-text-muted mt-0.5">
            {activeCount} Active &middot; Total P&L:{' '}
            <span className={totalPnl >= 0 ? 'text-up' : 'text-down'}>
              {formatPnl(totalPnl)}
            </span>
            {' '}&middot; Capital: {formatCapital(totalCapital)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setRefreshing(true); fetchDeployments() }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-d-border text-xs text-d-text-muted hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <Link
            href="/marketplace"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Strategy
          </Link>
        </div>
      </div>

      {/* ================================================================ */}
      {/* SUMMARY STATS */}
      {/* ================================================================ */}
      {deployments.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="glass-card p-4 text-center">
            <p className="text-[10px] text-d-text-muted uppercase tracking-wider mb-1">Total P&L</p>
            <p className={`text-xl font-bold font-mono num-display ${totalPnl >= 0 ? 'text-up' : 'text-down'}`}>
              {formatPnl(totalPnl)}
            </p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-[10px] text-d-text-muted uppercase tracking-wider mb-1">Total Trades</p>
            <p className="text-xl font-bold font-mono num-display text-white">{totalTrades}</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-[10px] text-d-text-muted uppercase tracking-wider mb-1">Active Strategies</p>
            <p className="text-xl font-bold font-mono num-display text-white">{activeCount}</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-[10px] text-d-text-muted uppercase tracking-wider mb-1">Allocated Capital</p>
            <p className="text-xl font-bold font-mono num-display text-white">{formatCapital(totalCapital)}</p>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* CAPITAL ALLOCATION */}
      {/* ================================================================ */}
      {deployments.length > 1 && <CapitalBar deployments={deployments} />}

      {/* ================================================================ */}
      {/* DEPLOYMENT CARDS */}
      {/* ================================================================ */}
      <div className="relative overflow-hidden">
        <div className="aurora-cyan absolute -top-20 left-1/4 opacity-50" />
      </div>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : deployments.length === 0 ? (
        <EmptyState
          icon={<Layers className="w-10 h-10 text-d-text-muted" />}
          title="No strategies deployed"
          description="Browse the marketplace and deploy your first algo strategy."
          actionLabel="Browse Marketplace"
          actionHref="/marketplace"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {deployments.map((d) => (
            <DeploymentCard
              key={d.id}
              deployment={d}
              onPause={handlePause}
              onResume={handleResume}
              onDeactivate={handleDeactivate}
            />
          ))}
        </div>
      )}

    </div>
  )
}
