// ============================================================================
// STOCK DETAIL PAGE - Full Analysis with Advanced Real-time Charts
// ============================================================================

'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, TrendingUp, TrendingDown, Activity, BarChart3,
  Bookmark, BookmarkCheck, RefreshCw, Clock,
  ArrowUpRight, ArrowDownRight, Target,
  LineChart, Layers, Zap, Sparkles, Loader2, ChevronRight
} from 'lucide-react'
import dynamic from 'next/dynamic'
import { useAuth } from '@/contexts/AuthContext'
import { usePriceUpdates } from '@/hooks/useWebSocket'
import StatusDot from '@/components/ui/StatusDot'
import PillTabs from '@/components/ui/PillTabs'
import { api } from '@/lib/api'
import ErrorBoundary from '@/components/ErrorBoundary'

const AdvancedStockChart = dynamic(() => import('@/components/AdvancedStockChart'), {
  ssr: false,
  loading: () => (
    <div className="h-[450px] w-full flex items-center justify-center bg-d-bg-card rounded-lg border border-d-border">
      <div className="h-8 w-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  ),
})

// PR 33 — per-stock consolidated engine output (N2 AI Dossier).
const AIDossierPanel = dynamic(() => import('@/components/stock/AIDossierPanel'), {
  ssr: false,
})

// PR 46 — B2 chart vision (Elite = anywhere).
const ChartVisionCard = dynamic(() => import('@/components/stock/ChartVisionCard'), {
  ssr: false,
})

interface StockData {
  symbol: string
  name: string
  price: number
  change: number
  change_percent: number
  open: number
  high: number
  low: number
  volume: number
  prev_close?: number
  day_high?: number
  day_low?: number
  week_52_high?: number
  week_52_low?: number
  market_cap?: number
  pe_ratio?: number
  sector?: string
  industry?: string
}

interface TechnicalData {
  rsi: number
  macd: number
  macd_signal: number
  sma_20: number
  sma_50: number
  sma_200?: number
  trend: string
  volume_ratio: number
}

// Technical Indicator Card
function IndicatorCard({
  label,
  value,
  subValue,
  trend,
  icon: Icon
}: {
  label: string
  value: string | number
  subValue?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: any
}) {
  const trendColors = {
    up: 'text-up',
    down: 'text-down',
    neutral: 'text-d-text-muted'
  }

  return (
    <div className="glass-card rounded-xl border border-d-border p-4">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-primary/50" />}
        <span className="text-sm text-d-text-muted">{label}</span>
      </div>
      <div className={`text-xl font-bold count-up ${trend ? trendColors[trend] : 'text-white'}`}>
        {value}
      </div>
      {subValue && (
        <div className="text-xs text-d-text-muted mt-1">{subValue}</div>
      )}
    </div>
  )
}

export default function StockDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const symbol = (params.symbol as string)?.toUpperCase()

  const [stockData, setStockData] = useState<StockData | null>(null)
  const [technicals, setTechnicals] = useState<TechnicalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isInWatchlist, setIsInWatchlist] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [relatedStocks] = useState<{ symbol: string; price: number; change: number }[]>([])

  // WebSocket for real-time updates via hook
  const { prices: wsPrices, isConnected: wsConnected } = usePriceUpdates(symbol ? [symbol] : [])

  useEffect(() => {
    if (!symbol) return

    fetchStockData()
    checkWatchlist()

    // Polling fallback every 30 seconds (WebSocket is primary), visibility-aware
    const interval = setInterval(() => {
      if (!document.hidden) fetchStockData()
    }, 30000)

    return () => {
      clearInterval(interval)
    }
  }, [symbol])

  // Update stock data from WebSocket price updates
  useEffect(() => {
    const update = wsPrices?.[symbol]
    if (update) {
      setStockData((prev) =>
        prev
          ? {
              ...prev,
              price: update.ltp ?? prev.price,
              change: update.change ?? prev.change,
              change_percent: update.change_percentage ?? prev.change_percent,
            }
          : prev
      )
    }
  }, [wsPrices, symbol])

  const fetchStockData = async () => {
    try {
      // Fetch price data
      const priceData = await api.screener.getStockPrice(symbol)

      if ((priceData as any).success) {
        setStockData({
          symbol,
          name: (priceData as any).name || symbol,
          price: (priceData as any).price,
          change: (priceData as any).change,
          change_percent: (priceData as any).change_percent,
          open: (priceData as any).open,
          high: (priceData as any).high,
          low: (priceData as any).low,
          volume: (priceData as any).volume,
          prev_close: (priceData as any).prev_close,
          week_52_high: (priceData as any).week_52_high,
          week_52_low: (priceData as any).week_52_low,
          market_cap: (priceData as any).market_cap,
          pe_ratio: (priceData as any).pe_ratio,
          sector: (priceData as any).sector,
          industry: (priceData as any).industry
        })
        setLastUpdate(new Date())
      }

      // Fetch technicals
      const techData = await api.screener.getTechnicals(symbol)

      if ((techData as any).success) {
        setTechnicals({
          rsi: (techData as any).rsi,
          macd: (techData as any).macd,
          macd_signal: (techData as any).macd_signal,
          sma_20: (techData as any).sma_20,
          sma_50: (techData as any).sma_50,
          sma_200: (techData as any).sma_200,
          trend: (techData as any).trend,
          volume_ratio: (techData as any).volume_ratio
        })
      }
    } catch (error) {
      console.error('Error fetching stock data:', error)
    }
    setLoading(false)
  }

  const checkWatchlist = async () => {
    if (!user?.id) return
    try {
      const data = await api.watchlist.getAll()
      if (data.watchlist) {
        setIsInWatchlist(data.watchlist.some((item: any) => item.symbol === symbol))
      }
    } catch (error) {
      console.error('Error checking watchlist:', error)
    }
  }

  const toggleWatchlist = async () => {
    try {
      if (isInWatchlist) {
        await api.watchlist.remove(symbol)
        setIsInWatchlist(false)
      } else {
        await api.watchlist.add(symbol, 'EQUITY')
        setIsInWatchlist(true)
      }
    } catch (error) {
      console.error('Error toggling watchlist:', error)
    }
  }

  const fetchAiInsight = async () => {
    if (aiInsight || aiLoading) return
    setAiLoading(true)
    try {
      const data = await api.assistant.chat({
        message: `Give a brief 2-3 sentence analysis of ${symbol} stock. Include current technical outlook and key levels to watch.`,
        history: [],
        // PR 86 — explicit symbol context so any follow-up Copilot
        // turn (via the platform-layout floating chat) keeps grounding.
        page_context: {
          route: `/stock/${symbol}`,
          symbol: String(symbol),
        },
      })
      setAiInsight((data as any).reply || (data as any).response || 'Unable to generate insight at this time.')
    } catch (err: any) {
      // PR 68 — surface quota exhausted globally.
      const msg = String(err?.message || err || '')
      if (msg.toLowerCase().includes('credits exhausted')) {
        try {
          const { dispatchCopilotQuotaExhausted } = await import('@/components/CopilotQuotaModal')
          const current = await api.assistant.getUsage()
          dispatchCopilotQuotaExhausted(current.usage)
          setAiInsight('Daily Copilot credits exhausted — see upgrade options.')
        } catch {
          setAiInsight('Daily Copilot credits exhausted.')
        }
      } else {
        setAiInsight('AI insight unavailable. Please try again later.')
      }
    }
    setAiLoading(false)
  }

  // Fetch AI insight when switching to that tab
  useEffect(() => {
    if (activeTab === 'ai-insight' && !aiInsight && !aiLoading) {
      fetchAiInsight()
    }
  }, [activeTab])

  const isPositive = (stockData?.change || 0) >= 0

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="loader-rings"></div>
          <p className="text-d-text-muted mt-4">Loading {symbol}...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen text-white" data-testid="stock-detail-page">
      {/* Background ambient glow */}
      <div className="fixed top-0 left-1/4 w-[500px] h-[300px] bg-primary/[0.03] rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 glass-topbar">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button onClick={() => router.back()} className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold">{symbol}</h1>
                  <span className="px-2 py-1 bg-primary/10 text-primary text-xs rounded-full">NSE</span>
                  {wsConnected && (
                    <span className="flex items-center gap-1 px-2 py-1 bg-up/10 text-up text-xs rounded-full">
                      <span className="w-1.5 h-1.5 bg-up rounded-full animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-sm text-d-text-muted">{stockData?.name || symbol}</p>
                  <StatusDot status="live" label="Live" />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={toggleWatchlist}
                className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 text-sm font-medium ${
                  isInWatchlist
                    ? 'bg-warning/10 text-warning border border-warning/20'
                    : 'bg-white/[0.04] hover:bg-white/[0.06] border border-d-border'
                }`}
              >
                {isInWatchlist ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
                {isInWatchlist ? 'Watching' : 'Watch'}
              </button>
              <button
                onClick={fetchStockData}
                className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-full border border-d-border transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* PR 33 — AI Dossier panel (Greek-branded engine consensus) */}
        <div className="mb-6">
          <AIDossierPanel symbol={symbol as string} />
          <div className="mt-6">
            <ChartVisionCard symbol={symbol as string} anywhere />
          </div>
        </div>

        {/* Sub-nav PillTabs */}
        <div className="mb-6">
          <PillTabs
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'technical', label: 'Technical' },
              { value: 'ai-insight', label: 'AI Insight' },
            ]}
            activeTab={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {/* ============================================================ */}
        {/* OVERVIEW TAB                                                  */}
        {/* ============================================================ */}
        {activeTab === 'overview' && (
          <>
            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <IndicatorCard
                label="Trend"
                value={technicals?.trend || 'N/A'}
                trend={technicals?.trend?.includes('Up') ? 'up' : technicals?.trend?.includes('Down') ? 'down' : 'neutral'}
                icon={TrendingUp}
              />
              <IndicatorCard
                label="RSI (14)"
                value={technicals?.rsi?.toFixed(1) || 'N/A'}
                subValue={technicals?.rsi && technicals.rsi < 30 ? 'Oversold' : technicals?.rsi && technicals.rsi > 70 ? 'Overbought' : 'Neutral'}
                trend={technicals?.rsi && technicals.rsi < 30 ? 'up' : technicals?.rsi && technicals.rsi > 70 ? 'down' : 'neutral'}
                icon={Activity}
              />
              <IndicatorCard
                label="Volume"
                value={`${technicals?.volume_ratio?.toFixed(1) || 1}x`}
                subValue="vs 20-day avg"
                trend={technicals?.volume_ratio && technicals.volume_ratio > 1.5 ? 'up' : 'neutral'}
                icon={BarChart3}
              />
              <IndicatorCard
                label="Day Range"
                value={`₹${stockData?.low?.toFixed(0)} - ₹${stockData?.high?.toFixed(0)}`}
                subValue={`Open: ₹${stockData?.open?.toFixed(2)}`}
                icon={Target}
              />
            </div>

            {/* Advanced Stock Chart */}
            <div className="mb-6">
              <ErrorBoundary label="Chart">
                <AdvancedStockChart
                  symbol={symbol}
                  showHeader={true}
                  height="450px"
                />
              </ErrorBoundary>
            </div>

            {/* Key Statistics Grid */}
            <div className="glass-card rounded-xl border border-d-border p-6 mb-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Key Statistics
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <div className="text-d-text-muted text-sm">Open</div>
                  <div className="font-medium text-white">₹{stockData?.open?.toLocaleString('en-IN') || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-d-text-muted text-sm">Prev Close</div>
                  <div className="font-medium text-white">₹{stockData?.prev_close?.toLocaleString('en-IN') || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-d-text-muted text-sm">Day High</div>
                  <div className="font-medium text-up">₹{stockData?.high?.toLocaleString('en-IN') || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-d-text-muted text-sm">Day Low</div>
                  <div className="font-medium text-down">₹{stockData?.low?.toLocaleString('en-IN') || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-d-text-muted text-sm">52W High</div>
                  <div className="font-medium text-up">₹{stockData?.week_52_high?.toLocaleString('en-IN') || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-d-text-muted text-sm">52W Low</div>
                  <div className="font-medium text-down">₹{stockData?.week_52_low?.toLocaleString('en-IN') || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-d-text-muted text-sm">Volume</div>
                  <div className="font-medium text-white">{stockData?.volume?.toLocaleString('en-IN') || 'N/A'}</div>
                </div>
                <div>
                  <div className="text-d-text-muted text-sm">Market Cap</div>
                  <div className="font-medium text-white">
                    {stockData?.market_cap ? `₹${(stockData.market_cap / 10000000).toFixed(2)} Cr` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Company Info */}
            {(stockData?.sector || stockData?.market_cap) && (
              <div className="glass-card rounded-xl border border-d-border p-6 mb-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-primary" />
                  Company Info
                </h3>
                <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {stockData?.sector && (
                    <div>
                      <div className="text-d-text-muted text-sm">Sector</div>
                      <div className="font-medium">{stockData.sector}</div>
                    </div>
                  )}
                  {stockData?.industry && (
                    <div>
                      <div className="text-d-text-muted text-sm">Industry</div>
                      <div className="font-medium">{stockData.industry}</div>
                    </div>
                  )}
                  {stockData?.pe_ratio && (
                    <div>
                      <div className="text-d-text-muted text-sm">P/E Ratio</div>
                      <div className="font-medium">{stockData.pe_ratio.toFixed(2)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* ============================================================ */}
        {/* TECHNICAL TAB                                                 */}
        {/* ============================================================ */}
        {activeTab === 'technical' && (
          <>
            {/* Advanced Stock Chart */}
            <div className="mb-6">
              <ErrorBoundary label="Chart">
                <AdvancedStockChart
                  symbol={symbol}
                  showHeader={true}
                  height="450px"
                />
              </ErrorBoundary>
            </div>

            {/* Technical Indicators */}
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Key Levels */}
              <div className="glass-card rounded-xl border border-d-border p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  Key Levels
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">52 Week High</span>
                    <span className="font-medium text-up">
                      ₹{stockData?.week_52_high?.toLocaleString('en-IN') || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">52 Week Low</span>
                    <span className="font-medium text-down">
                      ₹{stockData?.week_52_low?.toLocaleString('en-IN') || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">SMA 20</span>
                    <span className="font-medium">₹{technicals?.sma_20?.toLocaleString('en-IN') || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">SMA 50</span>
                    <span className="font-medium">₹{technicals?.sma_50?.toLocaleString('en-IN') || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">SMA 200</span>
                    <span className="font-medium">₹{technicals?.sma_200?.toLocaleString('en-IN') || 'N/A'}</span>
                  </div>
                </div>
              </div>

              {/* MACD & Momentum */}
              <div className="glass-card rounded-xl border border-d-border p-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  Momentum Indicators
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">MACD</span>
                    <span className={`font-medium ${(technicals?.macd || 0) >= 0 ? 'text-up' : 'text-down'}`}>
                      {technicals?.macd?.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">Signal Line</span>
                    <span className="font-medium">{technicals?.macd_signal?.toFixed(2) || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">RSI (14)</span>
                    <span className={`font-medium ${
                      technicals?.rsi && technicals.rsi < 30 ? 'text-up' :
                      technicals?.rsi && technicals.rsi > 70 ? 'text-down' : 'text-white'
                    }`}>
                      {technicals?.rsi?.toFixed(2) || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">Trend</span>
                    <span className={`font-medium ${
                      technicals?.trend?.includes('Up') ? 'text-up' :
                      technicals?.trend?.includes('Down') ? 'text-down' : 'text-white'
                    }`}>
                      {technicals?.trend || 'N/A'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-d-text-muted">Volume Ratio</span>
                    <span className={`font-medium ${(technicals?.volume_ratio || 1) > 1.5 ? 'text-neon-gold' : 'text-white'}`}>
                      {technicals?.volume_ratio?.toFixed(2) || '1.00'}x
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ============================================================ */}
        {/* AI INSIGHT TAB                                                */}
        {/* ============================================================ */}
        {activeTab === 'ai-insight' && (
          <>
            {/* AI Insight Card */}
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 mb-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-2">AI Analysis — {symbol}</h3>
                  {aiLoading ? (
                    <div className="flex items-center gap-2 text-d-text-muted">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Generating AI insight...</span>
                    </div>
                  ) : (
                    <p className="text-white/70 leading-relaxed">{aiInsight}</p>
                  )}
                </div>
              </div>
              {!aiLoading && aiInsight && (
                <button
                  onClick={() => { setAiInsight(null); fetchAiInsight() }}
                  className="mt-4 ml-13 text-sm text-primary hover:text-primary-hover transition-colors flex items-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Regenerate
                </button>
              )}
            </div>

            {/* Quick Stats for context */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <IndicatorCard
                label="Trend"
                value={technicals?.trend || 'N/A'}
                trend={technicals?.trend?.includes('Up') ? 'up' : technicals?.trend?.includes('Down') ? 'down' : 'neutral'}
                icon={TrendingUp}
              />
              <IndicatorCard
                label="RSI (14)"
                value={technicals?.rsi?.toFixed(1) || 'N/A'}
                subValue={technicals?.rsi && technicals.rsi < 30 ? 'Oversold' : technicals?.rsi && technicals.rsi > 70 ? 'Overbought' : 'Neutral'}
                trend={technicals?.rsi && technicals.rsi < 30 ? 'up' : technicals?.rsi && technicals.rsi > 70 ? 'down' : 'neutral'}
                icon={Activity}
              />
              <IndicatorCard
                label="Volume"
                value={`${technicals?.volume_ratio?.toFixed(1) || 1}x`}
                subValue="vs 20-day avg"
                trend={technicals?.volume_ratio && technicals.volume_ratio > 1.5 ? 'up' : 'neutral'}
                icon={BarChart3}
              />
              <IndicatorCard
                label="Day Range"
                value={`₹${stockData?.low?.toFixed(0)} - ₹${stockData?.high?.toFixed(0)}`}
                subValue={`Open: ₹${stockData?.open?.toFixed(2)}`}
                icon={Target}
              />
            </div>

            {/* Chart */}
            <div className="mb-6">
              <ErrorBoundary label="Chart">
                <AdvancedStockChart
                  symbol={symbol}
                  showHeader={true}
                  height="450px"
                />
              </ErrorBoundary>
            </div>
          </>
        )}

        {/* ============================================================ */}
        {/* PEOPLE ALSO WATCH (shown on all tabs)                         */}
        {/* ============================================================ */}
        {relatedStocks.length > 0 && (
        <div className="mt-6 mb-20">
          <h3 className="font-semibold text-white mb-4">People Also Watch</h3>
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {relatedStocks
              .filter(s => s.symbol !== symbol)
              .map((stock) => (
              <Link
                key={stock.symbol}
                href={`/stock/${stock.symbol}`}
                className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-d-bg-card border border-d-border rounded-full hover:border-primary/30 transition-all"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                  {stock.symbol.slice(0, 2)}
                </div>
                <div>
                  <div className="text-sm font-medium text-white">{stock.symbol}</div>
                  <div className={`text-xs ${stock.change >= 0 ? 'text-up' : 'text-down'}`}>
                    {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(1)}%
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-d-text-muted" />
              </Link>
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
