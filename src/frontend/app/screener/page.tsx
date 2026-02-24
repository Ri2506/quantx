// ============================================================================
// AI MARKET SCREENER - COMPLETE STOCK SCREENER APPLICATION
// Full integration with 43+ scanners and AI market intelligence
// Designed for NSE/BSE swing workflows
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Filter, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  RefreshCw, Zap, Target, BarChart3, Activity, Flame, Clock, Star,
  ChevronRight, ChevronDown, ChevronUp, X, Play, Pause, Settings,
  Volume2, Eye, AlertTriangle, CheckCircle2, Info, Bookmark, Share2,
  Download, Grid3X3, List, ArrowLeft, Bell, Moon, Sun, Menu, ExternalLink,
  Sparkles, Radio, Wifi, WifiOff, Database, Cpu, Globe2, Shield,
  LineChart, CandlestickChart, Layers, Box, Triangle, Circle, Square,
  Hexagon, Crosshair, ArrowRightLeft, DollarSign, Percent, Hash, Lock,
  Gauge, PieChart
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ============================================================================
// AI MARKET SCREENER MENU - ALL 43+ SCANNERS
// Professional AI-powered stock screening for Indian markets
// ============================================================================

const SCANNER_CATEGORIES = [
  {
    id: 'breakout',
    name: 'Breakout Scanners',
    icon: TrendingUp,
    color: 'from-emerald-500 to-green-600',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    description: 'Stocks breaking key resistance levels',
    scanners: [
      { id: 0, name: 'Full Screening', description: 'All patterns, indicators & breakouts', premium: false },
      { id: 1, name: 'Breakout (Consolidation)', description: 'Breaking out of consolidation zones', premium: false },
      { id: 4, name: 'Volume Breakout', description: 'Unusual volume with price breakout', premium: false },
      { id: 5, name: '52-Week High', description: 'Stocks at 52-week high', premium: false },
      { id: 6, name: '10-Day High', description: 'Stocks at 10-day high', premium: false },
      { id: 7, name: '52-Week Low', description: 'Reversal potential at 52W low', premium: false },
      { id: 20, name: 'ORB (Opening Range)', description: 'Opening range breakout', premium: true },
      { id: 33, name: 'Pivot Breakout', description: 'Breaking above pivot levels', premium: true },
    ]
  },
  {
    id: 'momentum',
    name: 'Momentum Scanners',
    icon: Zap,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    description: 'High momentum stocks with strong trends',
    scanners: [
      { id: 2, name: 'Top Gainers (>2%)', description: 'Biggest gainers today', premium: false },
      { id: 3, name: 'Top Losers (>2%)', description: 'Biggest losers today', premium: false },
      { id: 10, name: 'RSI Overbought (>70)', description: 'Strong momentum stocks', premium: false },
      { id: 17, name: 'Bull Momentum', description: 'Strong bullish momentum', premium: false },
      { id: 26, name: 'MACD Crossover', description: 'MACD bullish crossover', premium: true },
      { id: 30, name: 'Momentum Burst', description: 'Sudden momentum increase', premium: true },
      { id: 31, name: 'Trend Template', description: 'Mark Minervini setup', premium: true },
    ]
  },
  {
    id: 'volume',
    name: 'Volume Scanners',
    icon: BarChart3,
    color: 'from-cyan-500 to-sky-600',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    textColor: 'text-cyan-300',
    description: 'Unusual volume activity detection',
    scanners: [
      { id: 4, name: 'Volume Breakout', description: 'Price + Volume combo', premium: false },
      { id: 8, name: 'Volume Surge (>2.5x)', description: 'Unusual volume spike', premium: false },
      { id: 37, name: 'Delivery Volume', description: 'High delivery percentage', premium: true },
      { id: 38, name: 'Bulk Deals', description: 'Recent bulk deals', premium: true },
      { id: 39, name: 'Block Deals', description: 'Recent block deals', premium: true },
    ]
  },
  {
    id: 'reversal',
    name: 'Reversal Scanners',
    icon: ArrowRightLeft,
    color: 'from-orange-500 to-amber-600',
    bgColor: 'bg-orange-500/10',
    borderColor: 'border-orange-500/30',
    textColor: 'text-orange-400',
    description: 'Potential trend reversal setups',
    scanners: [
      { id: 9, name: 'RSI Oversold (<30)', description: 'Potential bounce candidates', premium: false },
      { id: 12, name: 'Bullish Engulfing', description: 'Strong reversal candle', premium: false },
      { id: 13, name: 'Bearish Engulfing', description: 'Bearish reversal pattern', premium: false },
      { id: 19, name: 'PSar Reversal', description: 'Parabolic SAR reversal', premium: true },
      { id: 24, name: 'Double Bottom', description: 'W-pattern reversal', premium: true },
      { id: 28, name: 'Inside Bar', description: 'Inside bar (NR) pattern', premium: false },
    ]
  },
  {
    id: 'patterns',
    name: 'Chart Patterns',
    icon: Triangle,
    color: 'from-amber-500 to-orange-600',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
    description: 'Classic technical chart patterns',
    scanners: [
      { id: 14, name: 'VCP Pattern', description: 'Volatility Contraction (Minervini)', premium: true },
      { id: 21, name: 'NR4 Pattern', description: 'Narrow Range 4-day', premium: false },
      { id: 22, name: 'NR7 Pattern', description: 'Narrow Range 7-day', premium: false },
      { id: 23, name: 'Cup & Handle', description: 'Classic bullish pattern', premium: true },
      { id: 24, name: 'Double Bottom', description: 'W-pattern reversal', premium: true },
      { id: 25, name: 'Head & Shoulders', description: 'Reversal pattern', premium: true },
    ]
  },
  {
    id: 'ma_strategies',
    name: 'MA Strategies',
    icon: LineChart,
    color: 'from-cyan-500 to-teal-600',
    bgColor: 'bg-cyan-500/10',
    borderColor: 'border-cyan-500/30',
    textColor: 'text-cyan-400',
    description: 'Moving average crossover strategies',
    scanners: [
      { id: 11, name: 'Short-term MA Cross', description: 'Price crossed 20 EMA', premium: false },
      { id: 15, name: 'Bull Crossover', description: '20 EMA crossing 50 EMA', premium: false },
      { id: 26, name: 'MACD Bullish', description: 'MACD crossover signal', premium: true },
      { id: 27, name: 'MACD Bearish', description: 'MACD bearish cross', premium: true },
      { id: 32, name: 'Super Trend', description: 'Super Trend indicator', premium: true },
    ]
  },
  {
    id: 'smart_money',
    name: 'Smart Money',
    icon: Target,
    color: 'from-yellow-500 to-orange-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/30',
    textColor: 'text-yellow-400',
    description: 'Smart money activity indicators',
    scanners: [
      { id: 36, name: 'FII/DII Data', description: 'Smart money buying/selling', premium: true },
      { id: 37, name: 'Delivery Volume', description: 'High delivery %', premium: true },
      { id: 38, name: 'Bulk Deals', description: 'Large block trades', premium: true },
      { id: 39, name: 'Block Deals', description: 'Large block activity', premium: true },
      { id: 35, name: 'Supply/Demand Zone', description: 'Key S/D zones', premium: true },
    ]
  },
  {
    id: 'fo_analysis',
    name: 'F&O Analysis',
    icon: Layers,
    color: 'from-red-500 to-rose-600',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/30',
    textColor: 'text-red-400',
    description: 'Futures & Options data analysis',
    scanners: [
      { id: 40, name: 'OI Analysis', description: 'Open Interest analysis', premium: true },
      { id: 41, name: 'Long Buildup', description: 'F&O long buildup', premium: true },
      { id: 42, name: 'Short Buildup', description: 'F&O short buildup', premium: true },
      { id: 36, name: 'FII/DII F&O', description: 'Smart money F&O data', premium: true },
    ]
  },
]

// AI Intelligence Features
const AI_FEATURES = [
  {
    id: 'nifty_prediction',
    name: 'AI Nifty Outlook',
    icon: LineChart,
    description: 'Directional bias with confidence score',
    endpoint: '/api/screener/ai/nifty-prediction',
  },
  {
    id: 'ml_signals',
    name: 'AI Momentum Radar',
    icon: Zap,
    description: 'Highest-quality trend continuations',
    endpoint: '/api/screener/ai/ml-signals',
  },
  {
    id: 'trend_forecast',
    name: 'AI Regime Map',
    icon: Layers,
    description: 'Multi-timeframe alignment snapshot',
    endpoint: '/api/screener/ai/trend-forecast/NIFTY',
  },
]

// ============================================================================
// COMPONENTS
// ============================================================================

function StockCard({ stock, index }: { stock: any; index: number }) {
  const isPositive = (stock.change_pct || stock.change || 0) >= 0
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="group relative bg-background-surface/70 backdrop-blur-sm border border-border/50 rounded-xl p-4 hover:border-border/80 transition-all hover:bg-background-elevated/70"
    >
      <div className={`absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity ${
        isPositive ? 'bg-green-500/5' : 'bg-red-500/5'
      }`} />
      
      <div className="relative z-10">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-lg font-bold text-white">{stock.symbol}</h3>
            <p className="text-xs text-text-muted truncate max-w-[120px]">{stock.name || stock.sector || stock.symbol}</p>
          </div>
          <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${
            isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(stock.change_pct || stock.change || 0).toFixed(2)}%
          </div>
        </div>
        
        <div className="text-2xl font-bold text-white mb-3">
          ₹{(stock.ltp || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-sm mb-3">
          <div className="bg-background-elevated/70 rounded-lg p-2">
            <div className="text-text-muted text-xs">Volume</div>
            <div className="text-white font-medium">{stock.volume || 'N/A'}</div>
          </div>
          <div className="bg-background-elevated/70 rounded-lg p-2">
            <div className="text-text-muted text-xs">RSI</div>
            <div className={`font-medium ${
              (stock.rsi || 50) > 70 ? 'text-red-400' : (stock.rsi || 50) < 30 ? 'text-green-400' : 'text-white'
            }`}>{stock.rsi || 50}</div>
          </div>
        </div>
        
        {stock.signal && (
          <div className={`w-full py-2 text-center rounded-lg text-sm font-medium ${
            stock.signal === 'Strong Buy' ? 'bg-green-500/20 text-green-400' :
            stock.signal === 'Buy' ? 'bg-emerald-500/20 text-emerald-400' :
            stock.signal === 'Hold' ? 'bg-yellow-500/20 text-yellow-400' :
            stock.signal === 'Sell' ? 'bg-orange-500/20 text-orange-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {stock.signal}
          </div>
        )}
        
        {stock.pattern && stock.pattern !== 'N/A' && (
          <div className="mt-2 flex items-center gap-1 text-xs text-text-secondary">
            <Triangle className="w-3 h-3" />
            {stock.pattern}
          </div>
        )}
        
        {(stock.target_1 || stock.stop_loss) && (
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            {stock.target_1 && (
              <div className="text-green-400">
                Target: ₹{stock.target_1.toLocaleString()}
              </div>
            )}
            {stock.stop_loss && (
              <div className="text-red-400">
                SL: ₹{stock.stop_loss.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

function AIFeatureCard({ feature, onClick, isLoading }: { feature: any; onClick: () => void; isLoading: boolean }) {
  const Icon = feature.icon
  return (
    <motion.button
      onClick={onClick}
      disabled={isLoading}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="w-full p-4 rounded-xl bg-gradient-to-br from-cyan-600/20 to-blue-600/20 border border-cyan-500/30 text-left hover:border-cyan-400/50 transition-all disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-cyan-500/20">
          <Icon className="w-5 h-5 text-cyan-300" />
        </div>
        <div>
          <div className="font-semibold text-white">{feature.name}</div>
          <div className="text-xs text-text-secondary">{feature.description}</div>
        </div>
        {isLoading && <RefreshCw className="w-4 h-4 text-cyan-300 animate-spin ml-auto" />}
      </div>
    </motion.button>
  )
}

function NiftyPredictionPanel({ data }: { data: any }) {
  if (!data) return null
  
  const ensemble = data.ensemble || {}
  
  return (
    <div className="bg-gradient-to-br from-cyan-900/30 to-blue-900/30 border border-cyan-500/30 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <LineChart className="w-6 h-6 text-cyan-300" />
        <h3 className="text-lg font-bold text-white">AI Nifty Outlook</h3>
      </div>
      
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-background-surface/70 rounded-lg p-4">
          <div className="text-text-secondary text-sm mb-1">Predicted Level</div>
          <div className="text-2xl font-bold text-white">{ensemble.prediction?.toLocaleString()}</div>
        </div>
        <div className="bg-background-surface/70 rounded-lg p-4">
          <div className="text-text-secondary text-sm mb-1">Direction</div>
          <div className={`text-2xl font-bold ${ensemble.direction === 'UP' ? 'text-green-400' : 'text-red-400'}`}>
            {ensemble.direction} {ensemble.direction === 'UP' ? '↑' : '↓'}
          </div>
        </div>
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-secondary">Confidence</span>
          <span className="text-white font-medium">{((ensemble.confidence || 0) * 100).toFixed(1)}%</span>
        </div>
        <div className="h-2 bg-background-elevated/80 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
            style={{ width: `${(ensemble.confidence || 0) * 100}%` }}
          />
        </div>
      </div>
      
      {data.support_levels && (
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-text-secondary mb-1">Support Levels</div>
            {data.support_levels.map((level: number, i: number) => (
              <div key={i} className="text-green-400">{level.toLocaleString()}</div>
            ))}
          </div>
          <div>
            <div className="text-text-secondary mb-1">Resistance Levels</div>
            {data.resistance_levels?.map((level: number, i: number) => (
              <div key={i} className="text-red-400">{level.toLocaleString()}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function ScreenerPage() {
  const router = useRouter()
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedScanner, setSelectedScanner] = useState<any | null>(null)
  const [results, setResults] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(true)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [isPremium] = useState(true)
  const [activeTab, setActiveTab] = useState<'scanners' | 'ai'>('scanners')
  const [aiData, setAiData] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [stocksCovered, setStocksCovered] = useState(1847)
  
  const runScan = useCallback(async (scanner: any) => {
    setSelectedScanner(scanner)
    setLoading(true)
    setResults([])
    
    try {
      const response = await fetch(`${API_BASE}/api/screener/scan/${scanner.id}`)
      const data = await response.json()
      
      if (data.success && data.results) {
        setResults(data.results)
        setLastUpdated(data.timestamp)
        setIsConnected(true)
        setStocksCovered(data.count || data.results.length)
      }
    } catch (error) {
      console.error('Scan failed:', error)
      setIsConnected(false)
    } finally {
      setLoading(false)
    }
  }, [])
  
  const runAIFeature = async (feature: any) => {
    setAiLoading(true)
    setAiData(null)
    
    try {
      const response = await fetch(`${API_BASE}${feature.endpoint}`)
      const data = await response.json()
      
      if (data.success) {
        setAiData({ type: feature.id, ...data.data })
      }
    } catch (error) {
      console.error('AI feature failed:', error)
    } finally {
      setAiLoading(false)
    }
  }
  
  const runSwingCandidates = async () => {
    setSelectedScanner({ id: 'ai', name: 'AI Swing Candidates' })
    setLoading(true)
    setResults([])
    
    try {
      const response = await fetch(`${API_BASE}/api/screener/swing-candidates?limit=30`)
      const data = await response.json()
      
      if (data.success && data.results) {
        setResults(data.results)
        setLastUpdated(data.timestamp)
      }
    } catch (error) {
      console.error('Swing candidates failed:', error)
    } finally {
      setLoading(false)
    }
  }
  
  const currentCategory = SCANNER_CATEGORIES.find(c => c.id === selectedCategory)

  return (
    <div className="app-shell">
      {/* Background */}
      <div className="fixed inset-0 bg-gradient-to-b from-background-surface/40 via-background-primary to-background-primary pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-green-900/10 via-transparent to-transparent pointer-events-none" />
      
      {/* Header */}
      <header className="app-header z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 text-text-secondary hover:text-text-primary">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600">
                  <Search className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold">AI Market Screener</h1>
                  <p className="text-xs text-text-muted">43+ Scanners • AI market intelligence filters</p>
                </div>
              </div>
            </div>
            
            <div className="flex-1 max-w-md hidden md:block">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Search scanners..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="app-input pl-10 pr-4 text-sm"
                />
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
                isConnected ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                {isConnected ? 'Live' : 'Offline'}
              </div>
              <Link href="/dashboard" className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-sm font-medium">
                Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>
      
      {/* Stats Bar */}
      <div className="border-b border-border/50 bg-background-surface/40 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-green-500" />
                <span className="text-text-secondary">Scanners:</span>
                <span className="font-semibold text-white">43+</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-blue-500" />
                <span className="text-text-secondary">NSE/BSE:</span>
                <span className="font-semibold text-white">1800+ stocks</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span className="text-text-secondary">AI Intelligence:</span>
                <span className="font-semibold text-white">Real-time AI filters</span>
              </div>
            </div>
            
            {/* Tab Switcher */}
            <div className="flex items-center gap-2 bg-background-elevated/80 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('scanners')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'scanners' ? 'bg-green-500 text-white' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                Scanners
              </button>
              <button
                onClick={() => setActiveTab('ai')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1 ${
                  activeTab === 'ai' ? 'bg-cyan-500 text-white' : 'text-text-secondary hover:text-text-primary'
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
          
          {/* Left Sidebar */}
          <div className="lg:col-span-3">
            <div className="sticky top-24 space-y-4">
              {activeTab === 'scanners' ? (
                <>
                  {/* AI Quick Scan */}
                  <motion.button
                    onClick={runSwingCandidates}
                    whileHover={{ scale: 1.02 }}
                    className="w-full p-4 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-white/20">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-bold">AI Swing Candidates</div>
                        <div className="text-xs text-white/70">AI-ranked high-conviction setups</div>
                      </div>
                    </div>
                  </motion.button>
                  
                  {/* Categories */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-text-muted uppercase px-1">Scanner Categories (43+)</h3>
                    {SCANNER_CATEGORIES.map(category => {
                      const Icon = category.icon
                      return (
                        <button
                          key={category.id}
                          onClick={() => setSelectedCategory(selectedCategory === category.id ? null : category.id)}
                          className={`w-full p-3 rounded-xl text-left transition-all ${
                            selectedCategory === category.id 
                              ? `bg-gradient-to-br ${category.color} border-2 border-white/20`
                              : `${category.bgColor} border ${category.borderColor} hover:border-white/20`
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className={`w-5 h-5 ${selectedCategory === category.id ? 'text-white' : category.textColor}`} />
                            <div className="flex-1">
                              <div className={`font-semibold ${selectedCategory === category.id ? 'text-white' : 'text-white'}`}>
                                {category.name}
                              </div>
                              <div className={`text-xs ${selectedCategory === category.id ? 'text-white/70' : 'text-text-muted'}`}>
                                {category.scanners.length} scanners
                              </div>
                            </div>
                            <ChevronRight className={`w-4 h-4 transition-transform ${
                              selectedCategory === category.id ? 'text-white rotate-90' : 'text-text-muted'
                            }`} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="text-xs font-semibold text-text-muted uppercase px-1">AI Intelligence Tools</h3>
                  {AI_FEATURES.map(feature => (
                    <AIFeatureCard
                      key={feature.id}
                      feature={feature}
                      onClick={() => runAIFeature(feature)}
                      isLoading={aiLoading}
                    />
                  ))}
                  
                  <div className="p-4 bg-cyan-900/20 border border-cyan-500/30 rounded-xl">
                    <div className="text-sm text-cyan-200 mb-2">AI guardrails:</div>
                    <div className="space-y-1 text-xs text-text-secondary">
                      <div>- Risk-first filters</div>
                      <div>- Liquidity-aware screening</div>
                      <div>- Regime-aware alignment</div>
                      <div>- Quality threshold gating</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
          
          {/* Scanner List (when category selected) */}
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
                    <button onClick={() => setSelectedCategory(null)} className="p-1 hover:bg-background-elevated/80 rounded">
                      <X className="w-4 h-4 text-text-muted" />
                    </button>
                  </div>
                  
                  <div className="space-y-2 max-h-[calc(100vh-200px)] overflow-y-auto pr-2">
                    {currentCategory.scanners.map(scanner => (
                      <button
                        key={scanner.id}
                        onClick={() => runScan(scanner)}
                        disabled={scanner.premium && !isPremium}
                        className={`w-full p-3 rounded-lg text-left transition-all ${
                          scanner.premium && !isPremium
                            ? 'bg-background-elevated/50 opacity-50 cursor-not-allowed'
                            : selectedScanner?.id === scanner.id
                              ? 'bg-blue-500/20 border border-blue-500/50'
                              : 'bg-background-elevated/70 hover:bg-background-elevated/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${selectedScanner?.id === scanner.id ? 'text-blue-400' : 'text-white'}`}>
                                {scanner.name}
                              </span>
                              {scanner.premium && (
                                <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-semibold rounded">PRO</span>
                              )}
                            </div>
                            <p className="text-xs text-text-muted mt-0.5">{scanner.description}</p>
                          </div>
                          {scanner.premium && !isPremium ? (
                            <Lock className="w-4 h-4 text-text-muted" />
                          ) : (
                            <Play className="w-4 h-4 text-text-secondary" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Results Panel */}
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
                        <h2 className="text-xl font-bold text-white">{selectedScanner.name}</h2>
                        <div className="flex items-center gap-3 text-sm text-text-muted mt-1">
                          <span>{results.length} stocks found</span>
                          {lastUpdated && (
                            <>
                              <span>•</span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(lastUpdated).toLocaleTimeString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <h2 className="text-xl font-bold text-white">Select a Scanner</h2>
                        <p className="text-sm text-text-muted mt-1">Choose from 43+ professional scanners</p>
                      </div>
                    )}
                  </div>
                  
                  {selectedScanner && (
                    <button
                      onClick={() => runScan(selectedScanner)}
                      disabled={loading}
                      className="flex items-center gap-2 px-4 py-2 bg-background-elevated/80 hover:bg-background-elevated rounded-lg text-sm disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                  )}
                </div>
                
                {/* Loading */}
                {loading && (
                  <div className="flex flex-col items-center justify-center py-20">
                    <div className="relative">
                      <div className="w-16 h-16 border-4 border-border/50 border-t-green-500 rounded-full animate-spin" />
                      <Search className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 text-green-500" />
                    </div>
                    <p className="mt-4 text-text-secondary">Scanning 1800+ stocks...</p>
                    <p className="text-sm text-text-muted">AI Stock Screener</p>
                  </div>
                )}
                
                {/* Empty State */}
                {!loading && !selectedScanner && (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="p-4 rounded-2xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/20 mb-4">
                      <Search className="w-12 h-12 text-green-500" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Ready to Scan</h3>
                    <p className="text-text-secondary max-w-md mb-4">
                      Access 43+ professional scanners including breakouts, momentum, patterns, and AI signal intelligence.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {['Breakouts', 'Momentum', 'VCP', 'Cup & Handle', 'AI Signals'].map(tag => (
                        <span key={tag} className="px-3 py-1 bg-background-elevated/80 rounded-full text-sm text-text-secondary">{tag}</span>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Results Grid */}
                {!loading && results.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {results.map((stock, index) => (
                      <StockCard key={stock.symbol} stock={stock} index={index} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <footer className="border-t border-border/50 mt-12">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Search className="w-4 h-4 text-green-500" />
              <span className="text-sm text-text-secondary">
                AI Market Screener • Full NSE/BSE Coverage • 43+ Scanners
              </span>
            </div>
            <div className="flex items-center gap-6 text-sm text-text-muted">
              <Link href="/pricing" className="hover:text-text-primary">Upgrade to Pro</Link>
              <a href="/dashboard" className="hover:text-text-primary flex items-center gap-1">
                Dashboard <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
