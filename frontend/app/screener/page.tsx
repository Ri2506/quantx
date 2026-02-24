// ============================================================================
// AI MARKET SCREENER V2 - ALL 61 SCANNERS + WATCHLIST + CUSTOM CHARTS
// Full PKScreener integration with dynamic scanner fetching
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  RefreshCw, Zap, Target, BarChart3, Activity, Clock, Star,
  ChevronRight, ChevronDown, X, Play, Bookmark, BookmarkCheck,
  ArrowLeft, Sparkles, Database, Globe2, Shield, LineChart,
  Layers, Triangle, Cpu, ArrowRightLeft, Eye,
  Plus, Check, AlertCircle
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import StatusDot from '@/components/ui/StatusDot'

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || ''

// Icon mapping for categories
const CATEGORY_ICONS: { [key: string]: any } = {
  breakout: TrendingUp,
  momentum: Zap,
  reversal: ArrowRightLeft,
  patterns: Triangle,
  ma_signals: LineChart,
  technical: BarChart3,
  signals: Activity,
  consolidation: Layers,
  trend: TrendingUp,
  ml: Cpu,
  short_sell: TrendingDown,
}

const CATEGORY_COLORS: { [key: string]: { bg: string; border: string; text: string; gradient: string } } = {
  breakout: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', gradient: 'from-emerald-500 to-green-600' },
  momentum: { bg: 'bg-neon-cyan/10', border: 'border-neon-cyan/30', text: 'text-neon-cyan', gradient: 'from-blue-500 to-indigo-600' },
  reversal: { bg: 'bg-neon-gold/10', border: 'border-neon-gold/30', text: 'text-neon-gold', gradient: 'from-orange-500 to-amber-600' },
  patterns: { bg: 'bg-pink-500/10', border: 'border-pink-500/30', text: 'text-pink-400', gradient: 'from-pink-500 to-rose-600' },
  ma_signals: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', gradient: 'from-cyan-500 to-teal-600' },
  technical: { bg: 'bg-neon-purple/10', border: 'border-neon-purple/30', text: 'text-neon-purple', gradient: 'from-purple-500 to-violet-600' },
  signals: { bg: 'bg-neon-gold/10', border: 'border-neon-gold/30', text: 'text-neon-gold', gradient: 'from-yellow-500 to-orange-500' },
  consolidation: { bg: 'bg-white/[0.04]', border: 'border-white/[0.06]', text: 'text-text-secondary', gradient: 'from-gray-500 to-slate-600' },
  trend: { bg: 'bg-neon-green/10', border: 'border-neon-green/30', text: 'text-neon-green', gradient: 'from-green-500 to-emerald-600' },
  ml: { bg: 'bg-danger/10', border: 'border-danger/30', text: 'text-danger', gradient: 'from-red-500 to-rose-600' },
  short_sell: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', gradient: 'from-rose-500 to-red-600' },
}

// AI Intelligence Features
const AI_FEATURES = [
  { id: 'nifty_prediction', name: 'AI Nifty Outlook', icon: LineChart, description: 'Directional bias with confidence', endpoint: '/api/screener/ai/nifty-prediction' },
  { id: 'market_regime', name: 'Market Regime', icon: Layers, description: 'Bull/Bear regime analysis', endpoint: '/api/screener/ai/market-regime' },
  { id: 'trend_analysis', name: 'Trend Analysis', icon: TrendingUp, description: 'Uptrend/Downtrend breakdown', endpoint: '/api/screener/ai/trend-analysis' },
]

// ============================================================================
// COMPONENTS
// ============================================================================

interface StockCardProps {
  stock: any
  index: number
  onAddToWatchlist: (symbol: string) => void
  onViewChart: (symbol: string) => void
  isInWatchlist: boolean
}

function StockCard({ stock, index, onAddToWatchlist, onViewChart, isInWatchlist }: StockCardProps) {
  const isPositive = (stock.change_percent || stock.change_pct || 0) >= 0
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02 }}
      className="group relative glass-card-neu backdrop-blur-sm border border-white/[0.04] rounded-xl p-4 hover:border-white/[0.06] transition-all hover:bg-white/[0.02] cursor-pointer"
      data-testid={`stock-card-${stock.symbol}`}
      onClick={() => window.location.href = `/stock/${stock.symbol}`}
    >
      <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity ${
        isPositive ? 'bg-neon-green/5' : 'bg-danger/5'
      }`} />
      
      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-text-primary">{stock.symbol}</h3>
            <p className="text-xs text-text-secondary truncate max-w-[120px]">{stock.name || stock.sector || '-'}</p>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
            isPositive ? 'bg-neon-green/10 text-neon-green' : 'bg-danger/10 text-danger'
          }`}>
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(stock.change_percent || stock.change_pct || 0).toFixed(2)}%
          </div>
        </div>
        
        {/* Price */}
        <div className="text-2xl font-bold text-text-primary mb-3">
          ₹{(stock.current_price || stock.ltp || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </div>
        
        {/* Metrics */}
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div className="bg-white/[0.02] rounded-lg p-2">
            <div className="text-text-secondary text-xs">RSI</div>
            <div className={`font-medium ${
              (stock.rsi || 50) > 70 ? 'text-danger' : (stock.rsi || 50) < 30 ? 'text-neon-green' : 'text-text-primary'
            }`}>{stock.rsi?.toFixed(1) || '-'}</div>
          </div>
          <div className="bg-white/[0.02] rounded-lg p-2">
            <div className="text-text-secondary text-xs">Volume</div>
            <div className="text-text-primary font-medium">{stock.volume_ratio ? `${stock.volume_ratio}x` : '-'}</div>
          </div>
        </div>
        
        {/* Signal/Reason */}
        {(stock.reason || stock.trend) && (
          <div className="text-xs text-text-secondary mb-3 truncate">
            {stock.reason || stock.trend}
          </div>
        )}
        
        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onViewChart(stock.symbol) }}
            className="flex-1 flex items-center justify-center gap-1 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-sm text-text-primary transition"
          >
            <Eye className="w-4 h-4" />
            Chart
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onAddToWatchlist(stock.symbol) }}
            className={`flex items-center justify-center gap-1 py-2 px-3 rounded-lg text-sm transition ${
              isInWatchlist 
                ? 'bg-neon-gold/10 text-neon-gold' 
                : 'bg-white/[0.04] hover:bg-white/[0.06] text-text-primary'
            }`}
            data-testid={`watchlist-btn-${stock.symbol}`}
          >
            {isInWatchlist ? <BookmarkCheck className="w-4 h-4" /> : <Bookmark className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

import AdvancedStockChart from '@/components/AdvancedStockChart'

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

function NiftyPredictionPanel({ data }: { data: any }) {
  if (!data) return null
  
  const prediction = data.prediction || {}
  
  return (
    <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-neon-purple/30 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <LineChart className="w-6 h-6 text-neon-purple" />
        <h3 className="text-lg font-bold text-text-primary">AI Nifty Outlook</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="glass-card-neu rounded-lg p-4">
          <div className="text-text-secondary text-sm mb-1">Current Level</div>
          <div className="text-2xl font-bold text-text-primary">{data.current_level?.toLocaleString()}</div>
        </div>
        <div className="glass-card-neu rounded-lg p-4">
          <div className="text-text-secondary text-sm mb-1">Direction</div>
          <div className={`text-2xl font-bold ${prediction.direction === 'BULLISH' ? 'text-neon-green' : prediction.direction === 'BEARISH' ? 'text-danger' : 'text-neon-gold'}`}>
            {prediction.direction} {prediction.direction === 'BULLISH' ? '↑' : prediction.direction === 'BEARISH' ? '↓' : '→'}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="glass-card-neu rounded-lg p-4">
          <div className="text-text-secondary text-sm mb-1">Confidence</div>
          <div className="text-xl font-bold text-text-primary">{prediction.confidence?.toFixed(1) || 0}%</div>
        </div>
        <div className="glass-card-neu rounded-lg p-4">
          <div className="text-text-secondary text-sm mb-1">Change</div>
          <div className={`text-xl font-bold ${(data.change_percent || 0) >= 0 ? 'text-neon-green' : 'text-danger'}`}>
            {data.change_percent?.toFixed(2)}%
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ScreenerPage() {
  // Scanner state
  const [categories, setCategories] = useState<{ [key: string]: any }>({})
  const [totalScanners, setTotalScanners] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedScanner, setSelectedScanner] = useState<any | null>(null)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  
  // Watchlist state
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [userId] = useState('ffb9e2ca-6733-4e84-9286-0aa134e6f57e') // Test user - replace with real auth
  
  // Chart state
  const [chartSymbol, setChartSymbol] = useState<string | null>(null)
  
  // AI state
  const [activeTab, setActiveTab] = useState<'scanners' | 'ai'>('scanners')
  const [aiData, setAiData] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)
  
  // Real-time price updates
  const [priceUpdateTime, setPriceUpdateTime] = useState<Date | null>(null)

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories()
    fetchWatchlist()
    
    // Auto-refresh AI Swing on load
    runSwingCandidates()
  }, [])
  
  // Real-time price polling every 30 seconds
  useEffect(() => {
    if (results.length === 0) return
    
    const interval = setInterval(() => {
      refreshPrices()
    }, 30000) // Update every 30 seconds
    
    return () => clearInterval(interval)
  }, [results])
  
  const refreshPrices = async () => {
    if (results.length === 0) return
    
    try {
      const symbols = results.map(r => r.symbol).join(',')
      const res = await fetch(`${API_BASE}/api/screener/prices/live?symbols=${symbols}`)
      const data = await res.json()
      
      if (data.success && data.prices) {
        // Update results with new prices
        setResults(prev => prev.map(stock => {
          const newPrice = data.prices.find((p: any) => p.symbol === stock.symbol)
          if (newPrice) {
            return {
              ...stock,
              current_price: newPrice.price,
              ltp: newPrice.price,
              change_percent: newPrice.change_percent,
              change: newPrice.change,
            }
          }
          return stock
        }))
        setPriceUpdateTime(new Date())
      }
    } catch (error) {
      console.error('Error refreshing prices:', error)
    }
  }

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/screener/pk/categories`)
      const data = await res.json()
      
      if (data.success) {
        setCategories(data.categories || {})
        setTotalScanners(data.total_scanners || 0)
      }
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const fetchWatchlist = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/${userId}`)
      const data = await res.json()
      
      if (data.success) {
        setWatchlist(data.watchlist?.map((item: any) => item.symbol) || [])
      }
    } catch (error) {
      console.error('Error fetching watchlist:', error)
    }
  }

  const runScan = async (scanner: any) => {
    setSelectedScanner(scanner)
    setLoading(true)
    setResults([])
    
    try {
      const res = await fetch(
        `${API_BASE}/api/screener/pk/scan/batch?scanner_id=${scanner.id}&universe=nifty50&limit=50`,
        { method: 'POST' }
      )
      const data = await res.json()
      
      if (data.success) {
        setResults(data.results || [])
        setLastUpdated(data.timestamp || new Date().toISOString())
      }
    } catch (error) {
      console.error('Scan failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const runSwingCandidates = async () => {
    setSelectedScanner({ id: 'ai', name: 'AI Swing Candidates' })
    setLoading(true)
    setResults([])
    
    try {
      const res = await fetch(`${API_BASE}/api/screener/swing-candidates?limit=30`)
      const data = await res.json()
      
      if (data.success) {
        setResults(data.results || [])
        setLastUpdated(data.timestamp || new Date().toISOString())
      }
    } catch (error) {
      console.error('Swing candidates failed:', error)
    } finally {
      setLoading(false)
    }
  }

  const runAIFeature = async (feature: any) => {
    setAiLoading(true)
    setAiData(null)
    
    try {
      const res = await fetch(`${API_BASE}${feature.endpoint}`)
      const data = await res.json()
      
      if (data.success) {
        setAiData({ type: feature.id, ...data })
      }
    } catch (error) {
      console.error('AI feature failed:', error)
    } finally {
      setAiLoading(false)
    }
  }

  const addToWatchlist = async (symbol: string) => {
    if (watchlist.includes(symbol)) {
      // Remove from watchlist
      try {
        await fetch(`${API_BASE}/api/watchlist/${userId}/${symbol}`, { method: 'DELETE' })
        setWatchlist(prev => prev.filter(s => s !== symbol))
      } catch (error) {
        console.error('Error removing from watchlist:', error)
      }
    } else {
      // Add to watchlist
      try {
        await fetch(`${API_BASE}/api/watchlist/add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: userId, symbol })
        })
        setWatchlist(prev => [...prev, symbol])
      } catch (error) {
        console.error('Error adding to watchlist:', error)
      }
    }
  }

  const currentCategory = selectedCategory ? categories[selectedCategory] : null

  return (
    <div className="min-h-screen bg-black text-text-primary" data-testid="screener-page">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-space-void/50 via-black to-black pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-neon-green/10 via-transparent to-transparent pointer-events-none" />
      
      {/* Header */}
      <ScrollReveal>
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/[0.04]">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 text-text-secondary hover:text-text-primary">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
                  <Search className="w-5 h-5 text-text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">AI Market Screener</h1>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-text-secondary">{totalScanners} Scanners • PKScreener Powered</p>
                    <StatusDot status="live" label="Live" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link href="/watchlist" className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-sm">
                <Bookmark className="w-4 h-4 text-neon-gold" />
                <span className="hidden sm:inline">Watchlist</span>
                {watchlist.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-neon-gold/10 text-neon-gold text-xs rounded-full">
                    {watchlist.length}
                  </span>
                )}
              </Link>
              <Link href="/dashboard" className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-sm font-medium">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>
      </ScrollReveal>
      
      {/* Stats Bar */}
      <div className="border-b border-white/[0.04] glass-card-neu">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-neon-green" />
                <span className="text-text-secondary">Scanners:</span>
                <span className="font-semibold text-text-primary">{totalScanners}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-neon-cyan" />
                <span className="text-text-secondary">Categories:</span>
                <span className="font-semibold text-text-primary">{Object.keys(categories).length}</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-neon-purple" />
                <span className="text-text-secondary">Universe:</span>
                <span className="font-semibold text-text-primary">NSE 2200+</span>
              </div>
            </div>
            
            <div className="flex items-center gap-2 bg-white/[0.04] rounded-lg p-1">
              <button
                onClick={() => setActiveTab('scanners')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'scanners' ? 'bg-neon-green text-space-void' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Scanners
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'ai' ? 'bg-neon-purple text-space-void' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Sparkles className="w-3 h-3" />
                AI Intelligence
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-12 gap-6">
          
          {/* Sidebar */}
          <div className="lg:col-span-3">
            <div className="sticky top-24 space-y-4">
              {activeTab === 'scanners' ? (
                <>
                  {/* AI Quick Scan */}
                  <motion.button
                    onClick={runSwingCandidates}
                    whileHover={{ scale: 1.02 }}
                    className="w-full p-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-text-primary text-left"
                    data-testid="ai-swing-btn"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/20">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold">AI Swing Candidates</div>
                        <div className="text-xs text-white/70">Best setups ranked by AI</div>
                      </div>
                    </div>
                  </motion.button>
                  
                  {/* Dynamic Categories from API */}
                  <ScrollReveal delay={0.1}>
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-text-secondary uppercase px-1">
                      Scanner Categories ({totalScanners} scanners)
                    </h3>
                    {Object.entries(categories).map(([catKey, category]: [string, any]) => {
                      const Icon = CATEGORY_ICONS[catKey] || Target
                      const colors = CATEGORY_COLORS[catKey] || CATEGORY_COLORS.technical

                      return (
                        <Card3D key={catKey}>
                        <button
                          onClick={() => setSelectedCategory(selectedCategory === catKey ? null : catKey)}
                          className={`w-full p-3 rounded-xl text-left transition-all ${
                            selectedCategory === catKey
                              ? `bg-gradient-to-br ${colors.gradient} border-2 border-white/20`
                              : `${colors.bg} border ${colors.border} hover:border-white/20`
                          }`}
                          data-testid={`category-${catKey}`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className={`w-5 h-5 ${selectedCategory === catKey ? 'text-text-primary' : colors.text}`} />
                            <div className="flex-1">
                              <div className={`font-semibold ${selectedCategory === catKey ? 'text-text-primary' : 'text-text-primary'}`}>
                                {category.name}
                              </div>
                              <div className={`text-xs ${selectedCategory === catKey ? 'text-white/70' : 'text-text-secondary'}`}>
                                {category.scanners?.length || 0} scanners
                              </div>
                            </div>
                            <ChevronRight className={`w-4 h-4 transition-transform ${
                              selectedCategory === catKey ? 'text-text-primary rotate-90' : 'text-text-secondary'
                            }`} />
                          </div>
                        </button>
                        </Card3D>
                      )
                    })}
                  </div>
                  </ScrollReveal>
                </>
              ) : (
                <>
                  <h3 className="text-xs font-semibold text-text-secondary uppercase px-1">AI Intelligence Tools</h3>
                  {AI_FEATURES.map(feature => {
                    const Icon = feature.icon
                    return (
                      <motion.button
                        key={feature.id}
                        onClick={() => runAIFeature(feature)}
                        disabled={aiLoading}
                        whileHover={{ scale: 1.02 }}
                        className="w-full p-4 rounded-xl bg-gradient-to-br from-purple-600/20 to-blue-600/20 border border-neon-purple/30 text-left hover:border-neon-purple/50 transition-all disabled:opacity-50"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-neon-purple/10">
                            <Icon className="w-5 h-5 text-neon-purple" />
                          </div>
                          <div>
                            <div className="font-semibold text-text-primary">{feature.name}</div>
                            <div className="text-xs text-text-secondary">{feature.description}</div>
                          </div>
                          {aiLoading && <RefreshCw className="w-4 h-4 text-neon-purple animate-spin ml-auto" />}
                        </div>
                      </motion.button>
                    )
                  })}
                </>
              )}
            </div>
          </div>
          
          {/* Scanner List */}
          <AnimatePresence mode="wait">
            {selectedCategory && currentCategory && (
              <motion.div
                key="scanner-list"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="lg:col-span-3"
              >
                <div className="sticky top-24 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-text-secondary">{currentCategory.name}</h3>
                    <button onClick={() => setSelectedCategory(null)} className="p-1 hover:bg-white/[0.04] rounded">
                      <X className="w-4 h-4 text-text-secondary" />
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
                    {currentCategory.scanners?.map((scanner: any) => (
                      <button
                        key={scanner.id}
                        onClick={() => runScan(scanner)}
                        className={`w-full p-3 rounded-lg text-left transition-all ${
                          selectedScanner?.id === scanner.id
                            ? 'bg-neon-cyan/10 border border-neon-cyan/50'
                            : 'bg-white/[0.02] hover:bg-white/[0.06]'
                        }`}
                        data-testid={`scanner-${scanner.id}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <span className={`font-medium ${selectedScanner?.id === scanner.id ? 'text-neon-cyan' : 'text-text-primary'}`}>
                              {scanner.name}
                            </span>
                            {scanner.menu_code && (
                              <p className="text-xs text-text-secondary mt-0.5">{scanner.menu_code}</p>
                            )}
                          </div>
                          <Play className="w-4 h-4 text-text-secondary" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Results */}
          <div className={`${selectedCategory ? 'lg:col-span-6' : 'lg:col-span-9'}`}>
            {activeTab === 'ai' && aiData ? (
              <NiftyPredictionPanel data={aiData} />
            ) : (
              <>
                {/* Results Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    {selectedScanner ? (
                      <div>
                        <h2 className="text-xl font-bold text-text-primary">{selectedScanner.name}</h2>
                        <div className="flex items-center gap-3 text-sm text-text-secondary mt-1">
                          <span>{results.length} stocks found</span>
                          {lastUpdated && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(lastUpdated).toLocaleTimeString()}
                            </span>
                          )}
                          {priceUpdateTime && (
                            <span className="flex items-center gap-1 text-neon-green">
                              <span className="w-2 h-2 bg-neon-green rounded-full animate-pulse" />
                              Live • {priceUpdateTime.toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h2 className="text-xl font-bold text-text-primary">AI Swing Candidates</h2>
                        <p className="text-sm text-text-secondary mt-1">{results.length} stocks • Real-time prices</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={refreshPrices}
                      disabled={loading || results.length === 0}
                      className="flex items-center gap-2 px-3 py-2 bg-neon-green/10 hover:bg-neon-green/20 rounded-lg text-sm text-neon-green disabled:opacity-50"
                      title="Refresh prices"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Live
                    </button>
                    {selectedScanner && (
                      <button
                        onClick={() => runScan(selectedScanner)}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-sm disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        Rescan
                      </button>
                    )}
                  </div>
                </div>
                
                {/* Loading */}
                {loading && (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="loader-rings"></div>
                    <p className="mt-4 text-text-secondary">Scanning stocks...</p>
                  </div>
                )}
                
                {/* Empty State */}
                {!loading && !selectedScanner && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-neon-green/10 to-emerald-500/10 border border-neon-green/20 mb-4">
                      <Search className="w-12 h-12 text-neon-green" />
                    </div>
                    <h3 className="text-xl font-bold text-text-primary mb-2">Ready to Scan</h3>
                    <p className="text-text-secondary max-w-md mb-4">
                      Access {totalScanners} professional scanners including breakouts, momentum, ML signals, and more.
                    </p>
                  </div>
                )}
                
                {/* Results Grid */}
                {!loading && results.length > 0 && (
                  <ScrollReveal delay={0.15}>
                  <Card3D maxTilt={2}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {results.map((stock, index) => (
                      <StockCard
                        key={stock.symbol}
                        stock={stock}
                        index={index}
                        onAddToWatchlist={addToWatchlist}
                        onViewChart={setChartSymbol}
                        isInWatchlist={watchlist.includes(stock.symbol)}
                      />
                    ))}
                  </div>
                  </Card3D>
                  </ScrollReveal>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Stock Chart Modal */}
      <AnimatePresence>
        {chartSymbol && (
          <StockChartModal symbol={chartSymbol} onClose={() => setChartSymbol(null)} />
        )}
      </AnimatePresence>
      
      {/* Footer */}
      <footer className="border-t border-white/[0.04] mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4 text-neon-green" />
              <span className="text-sm text-text-secondary">
                AI Market Screener • PKScreener Powered • {totalScanners} Scanners
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-text-secondary">
              <Link href="/watchlist" className="hover:text-text-primary flex items-center gap-1">
                <Bookmark className="w-3 h-3" />
                Watchlist
              </Link>
              <Link href="/dashboard" className="hover:text-text-primary flex items-center gap-1">
                Dashboard <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
