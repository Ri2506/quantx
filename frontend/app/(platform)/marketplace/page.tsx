'use client'

import React, { useEffect, useState, useCallback } from 'react'
import {
  Layers, Search, TrendingUp, Shield, Zap, ArrowUpRight,
  Lock, Filter, ChevronRight, Star, BarChart3,
} from 'lucide-react'
import Link from 'next/link'
import PillTabs from '@/components/ui/PillTabs'
import SkeletonCard from '@/components/ui/SkeletonCard'
import EmptyState from '@/components/ui/EmptyState'
import GlowCard from '@/components/ui/GlowCard'
import RiskLevelBadge from '@/components/ui/RiskLevelBadge'
import GradientBorder from '@/components/ui/GradientBorder'
import { api, handleApiError } from '@/lib/api'
import type { StrategyCatalog, StrategyCategory } from '@/types'

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORY_TABS: { label: string; value: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Equity Swing', value: 'equity_swing' },
  { label: 'Options Buying', value: 'options_buying' },
  { label: 'Credit Spread', value: 'credit_spread' },
  { label: 'Short Strangle', value: 'short_strangle' },
  { label: 'Short Straddle', value: 'short_straddle' },
  { label: 'Equity Investing', value: 'equity_investing' },
]

const RISK_COLORS: Record<string, string> = {
  low: 'text-up bg-up/10',
  medium: 'text-warning bg-warning/10',
  high: 'text-warning bg-warning/10',
  very_high: 'text-down bg-down/10',
}

const RISK_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  very_high: 'Very High',
}

// PR 75 — tier matrix locked to Free / Pro ₹999 / Elite ₹1,999
// (Starter removed per locked decision). The legacy `starter` key is
// kept only as a fallback so any catalog row still tagged 'starter'
// renders as Pro instead of breaking.
const TIER_BADGES: Record<string, { label: string; color: string }> = {
  free:    { label: 'FREE',  color: 'text-up bg-up/10 border-up/20' },
  pro:     { label: 'PRO',   color: 'text-primary bg-primary/10 border-primary/20' },
  elite:   { label: 'ELITE', color: 'text-[#FFD166] bg-[rgba(255,209,102,0.10)] border-[rgba(255,209,102,0.45)]' },
  starter: { label: 'PRO',   color: 'text-primary bg-primary/10 border-primary/20' },
}

const SORT_OPTIONS = [
  { label: 'Popular', value: 'sort_order' },
  { label: 'Returns', value: '-backtest_total_return' },
  { label: 'Win Rate', value: '-backtest_win_rate' },
  { label: 'Sharpe', value: '-backtest_sharpe' },
  { label: 'Min Capital', value: 'min_capital' },
]

// ============================================================================
// HELPER
// ============================================================================

function formatReturn(val?: number | null): string {
  if (val == null) return '--'
  return `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`
}

function formatCapital(val: number): string {
  if (val >= 100000) return `${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`
  if (val >= 1000) return `${(val / 1000).toFixed(0)}K`
  return val.toString()
}

// ============================================================================
// STRATEGY CARD
// ============================================================================

/** Map risk_level (underscore) to RiskLevelBadge prop (hyphen). */
function toRiskBadgeLevel(level: string): 'low' | 'medium' | 'high' | 'very-high' {
  if (level === 'very_high') return 'very-high'
  if (level === 'high') return 'high'
  if (level === 'low') return 'low'
  return 'medium'
}

function StrategyCard({ strategy }: { strategy: StrategyCatalog }) {
  const tier = TIER_BADGES[strategy.tier_required] || TIER_BADGES.free
  const hasDrawdown = strategy.backtest_max_drawdown != null

  const cardContent = (
    <div className="relative h-full p-5">
      {/* Featured badge */}
      {strategy.is_featured && (
        <div className="absolute -top-px -right-px">
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-bl-xl rounded-tr-2xl bg-orange/10 border-b border-l border-orange/20">
            <Star className="w-3 h-3 text-orange fill-orange" />
            <span className="text-[10px] font-semibold text-orange uppercase tracking-wider">Featured</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate group-hover:text-primary transition-colors">
            {strategy.name}
          </h3>
          <p className="text-xs text-d-text-muted mt-0.5 capitalize">
            {strategy.category.replace(/_/g, ' ')} &middot; {strategy.segment}
          </p>
        </div>
        <span className={`shrink-0 ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${tier.color}`}>
          {tier.label}
        </span>
      </div>

      {/* Description */}
      <p className="text-xs text-d-text-muted line-clamp-2 mb-4 min-h-[32px]">
        {strategy.description}
      </p>

      {/* Stats grid */}
      <div className={`grid ${hasDrawdown ? 'grid-cols-4' : 'grid-cols-3'} gap-3 mb-4`}>
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Return</p>
          <p className={`text-sm font-bold font-mono num-display ${(strategy.backtest_total_return ?? 0) >= 0 ? 'text-up' : 'text-down'}`}>
            {formatReturn(strategy.backtest_total_return)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Win Rate</p>
          <p className="text-sm font-bold font-mono num-display text-white">
            {strategy.backtest_win_rate != null ? `${strategy.backtest_win_rate}%` : '--'}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Sharpe</p>
          <p className="text-sm font-bold font-mono num-display text-white">
            {strategy.backtest_sharpe != null ? strategy.backtest_sharpe.toFixed(2) : '--'}
          </p>
        </div>
        {hasDrawdown && (
          <div>
            <p className="text-[10px] text-white/30 uppercase tracking-wider">Drawdown</p>
            <p className="text-sm font-bold font-mono num-display text-down">
              {strategy.backtest_max_drawdown!.toFixed(1)}%
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-d-border">
        <div className="flex items-center gap-2">
          <RiskLevelBadge level={toRiskBadgeLevel(strategy.risk_level)} />
          <span className="text-[10px] text-white/30">
            Min: {formatCapital(strategy.min_capital)}
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  )

  const wrappedCard = (
    <Link href={`/marketplace/${strategy.slug}`} className="group block h-full">
      <GlowCard className="h-full">
        {cardContent}
      </GlowCard>
    </Link>
  )

  if (strategy.is_featured) {
    return <GradientBorder className="rounded-2xl">{wrappedCard}</GradientBorder>
  }

  return wrappedCard
}

// ============================================================================
// MARKETPLACE PAGE
// ============================================================================

export default function MarketplacePage() {
  const [strategies, setStrategies] = useState<StrategyCatalog[]>([])
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const [category, setCategory] = useState('all')
  const [sortBy, setSortBy] = useState('sort_order')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [riskFilter, setRiskFilter] = useState<string>('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const fetchStrategies = useCallback(async () => {
    setLoading(true)
    try {
      const filters: Record<string, string> = { sort_by: sortBy }
      if (category !== 'all') filters.category = category
      if (debouncedSearch.trim()) filters.search = debouncedSearch.trim()
      if (riskFilter) filters.risk_level = riskFilter
      const data = await api.marketplace.getStrategies(filters)
      setStrategies(data.strategies || [])
      setCategoryCounts(data.category_counts || {})
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to fetch strategies:', handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [category, sortBy, debouncedSearch, riskFilter])

  useEffect(() => {
    fetchStrategies()
  }, [fetchStrategies])

  // Add counts to tabs
  const tabsWithCounts = CATEGORY_TABS.map((tab) => ({
    ...tab,
    label:
      tab.value === 'all'
        ? `All (${total})`
        : `${tab.label} (${categoryCounts[tab.value] || 0})`,
  }))

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 pb-20">
      {/* ================================================================ */}
      {/* HERO */}
      {/* ================================================================ */}
      <div className="relative overflow-hidden rounded-2xl border border-d-border bg-[#111520] p-6 md:p-8 mb-6">
        <div className="relative z-10 flex items-start gap-4">
          <div className="hidden md:flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20">
            <Layers className="w-7 h-7 text-primary" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-1">Strategy Marketplace</h1>
            <p className="text-sm md:text-base text-d-text-muted max-w-2xl">
              {total} algo strategies across equity swing trading, options buying, credit spreads, strangles and more.
              Browse, backtest, and deploy on autopilot.
            </p>
          </div>
          <Link
            href="/my-strategies"
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
          >
            <BarChart3 className="w-4 h-4" />
            My Strategies
          </Link>
        </div>

        {/* Quick stats */}
        <div className="relative z-10 flex flex-wrap gap-4 mt-5">
          {[
            { icon: TrendingUp, label: 'Equity', count: (categoryCounts.equity_swing || 0) + (categoryCounts.equity_investing || 0) },
            { icon: Zap, label: 'Options', count: (categoryCounts.options_buying || 0) + (categoryCounts.credit_spread || 0) + (categoryCounts.short_strangle || 0) + (categoryCounts.short_straddle || 0) },
            { icon: Shield, label: 'Free', count: strategies.filter((s) => s.tier_required === 'free').length },
          ].map((stat) => (
            <div key={stat.label} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-d-border">
              <stat.icon className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-d-text-secondary font-medium">{stat.count} {stat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ================================================================ */}
      {/* FILTERS */}
      {/* ================================================================ */}
      <div className="space-y-4 mb-6">
        {/* Category tabs */}
        <div className="overflow-x-auto scrollbar-hide -mx-4 px-4">
          <PillTabs
            tabs={tabsWithCounts}
            activeTab={category}
            onChange={(val: string) => setCategory(val)}
          />
        </div>

        {/* Search + sort + risk */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search strategies..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-d-border rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary/30 transition-colors"
            />
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-2 bg-white/[0.04] border border-d-border rounded-lg text-sm text-d-text-secondary focus:outline-none focus:border-primary/30 appearance-none cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </select>

          {/* Risk filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="px-3 py-2 bg-white/[0.04] border border-d-border rounded-lg text-sm text-d-text-secondary focus:outline-none focus:border-primary/30 appearance-none cursor-pointer"
          >
            <option value="">All Risk</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="very_high">Very High</option>
          </select>
        </div>
      </div>

      {/* ================================================================ */}
      {/* STRATEGY GRID */}
      {/* ================================================================ */}
      <div className="relative overflow-hidden">
        <div className="aurora-cyan absolute -top-20 left-1/4 opacity-50" />
      </div>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <EmptyState
          icon={<Layers className="w-10 h-10 text-white/20" />}
          title="No strategies found"
          description="Try adjusting your filters or search query."
        />
      ) : (
        <>
          {/* Featured section */}
          {category === 'all' && strategies.some((s) => s.is_featured) && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-d-text-muted uppercase tracking-wider mb-3">Featured Strategies</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {strategies
                  .filter((s) => s.is_featured)
                  .map((s) => (
                    <StrategyCard key={s.id} strategy={s} />
                  ))}
              </div>
            </div>
          )}

          {/* All strategies */}
          <div>
            {category === 'all' && strategies.some((s) => s.is_featured) && (
              <h2 className="text-sm font-semibold text-d-text-muted uppercase tracking-wider mb-3">All Strategies</h2>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {strategies
                .filter((s) => category !== 'all' || !s.is_featured)
                .map((s) => (
                  <StrategyCard key={s.id} strategy={s} />
                ))}
            </div>
          </div>
        </>
      )}

    </div>
  )
}
