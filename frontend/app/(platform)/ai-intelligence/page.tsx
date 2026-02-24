'use client'

import { useState, useEffect } from 'react'
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Target,
  BarChart3,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  LineChart,
  AlertTriangle,
  CheckCircle,
  Clock,
  Filter,
  ChevronRight,
} from 'lucide-react'

const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || ''

interface StockResult {
  symbol: string
  name: string
  current_price: number
  ltp: number
  change_percent: number
  rsi: number
  volume_ratio: number
  signal_reason?: string
  ai_score?: number
  momentum_score?: number
  breakout_score?: number
  breakout_probability?: number
  reversal_score?: number
  reversal_probability?: number
  trend?: string
}

interface NiftyPrediction {
  current_level: number
  change: number
  change_percent: number
  prediction: {
    direction: string
    predicted_level: number
    confidence: number
    signals: { bullish: number; total: number }
  }
  indicators: {
    rsi: number
    ma_5: number
    ma_10: number
    ma_20: number
  }
  support_levels: number[]
  resistance_levels: number[]
}

interface MarketRegime {
  regime: string
  description: string
  recommendation: string
  indicators: {
    nifty: number
    ma_20: number
    ma_50: number
    volatility_ratio: number
  }
}

interface TrendAnalysis {
  summary: {
    uptrend: number
    downtrend: number
    sideways: number
    total: number
  }
  uptrend: StockResult[]
  downtrend: StockResult[]
  sideways: StockResult[]
}

export default function AIIntelligencePage() {
  const [activeFeature, setActiveFeature] = useState<string>('nifty-prediction')
  const [loading, setLoading] = useState(false)
  const [niftyPrediction, setNiftyPrediction] = useState<NiftyPrediction | null>(null)
  const [marketRegime, setMarketRegime] = useState<MarketRegime | null>(null)
  const [momentumStocks, setMomentumStocks] = useState<StockResult[]>([])
  const [breakoutStocks, setBreakoutStocks] = useState<StockResult[]>([])
  const [reversalStocks, setReversalStocks] = useState<StockResult[]>([])
  const [trendAnalysis, setTrendAnalysis] = useState<TrendAnalysis | null>(null)
  const [universe, setUniverse] = useState('nifty500')
  const [lastUpdated, setLastUpdated] = useState<string>('')

  const aiFeatures = [
    { id: 'nifty-prediction', name: 'Nifty Prediction', icon: Brain, description: 'AI predicts market direction' },
    { id: 'market-regime', name: 'Market Regime', icon: Activity, description: 'Current market conditions' },
    { id: 'momentum-radar', name: 'Momentum Radar', icon: Zap, description: 'High momentum stocks' },
    { id: 'breakout-scanner', name: 'Breakout Scanner', icon: TrendingUp, description: 'Potential breakouts' },
    { id: 'reversal-scanner', name: 'Reversal Scanner', icon: Target, description: 'Reversal candidates' },
    { id: 'trend-analysis', name: 'Trend Analysis', icon: LineChart, description: 'Market-wide trends' },
  ]

  useEffect(() => {
    fetchFeatureData(activeFeature)
  }, [activeFeature, universe])

  const fetchFeatureData = async (feature: string) => {
    setLoading(true)
    try {
      let endpoint = ''
      switch (feature) {
        case 'nifty-prediction':
          endpoint = '/api/screener/ai/nifty-prediction'
          break
        case 'market-regime':
          endpoint = '/api/screener/ai/market-regime'
          break
        case 'momentum-radar':
          endpoint = `/api/screener/ai/momentum-radar?universe=${universe}&limit=20`
          break
        case 'breakout-scanner':
          endpoint = `/api/screener/ai/breakout-scanner?universe=${universe}&limit=20`
          break
        case 'reversal-scanner':
          endpoint = `/api/screener/ai/reversal-scanner?universe=${universe}&limit=20`
          break
        case 'trend-analysis':
          endpoint = `/api/screener/ai/trend-analysis?universe=${universe}&limit=30`
          break
      }

      const res = await fetch(`${API_URL}${endpoint}`)
      const data = await res.json()

      if (data.success) {
        switch (feature) {
          case 'nifty-prediction':
            setNiftyPrediction(data)
            break
          case 'market-regime':
            setMarketRegime(data)
            break
          case 'momentum-radar':
            setMomentumStocks(data.results || [])
            break
          case 'breakout-scanner':
            setBreakoutStocks(data.results || [])
            break
          case 'reversal-scanner':
            setReversalStocks(data.results || [])
            break
          case 'trend-analysis':
            setTrendAnalysis(data)
            break
        }
        setLastUpdated(data.timestamp || new Date().toISOString())
      }
    } catch (error) {
      console.error('Error fetching AI data:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(value)
  }

  const getRegimeColor = (regime: string) => {
    if (regime.includes('BULL')) return 'text-success'
    if (regime.includes('BEAR')) return 'text-danger'
    return 'text-warning'
  }

  const getRegimeIcon = (regime: string) => {
    if (regime.includes('BULL')) return <TrendingUp className="w-8 h-8" />
    if (regime.includes('BEAR')) return <TrendingDown className="w-8 h-8" />
    return <Activity className="w-8 h-8" />
  }

  return (
    <div className="min-h-screen bg-background pb-8" data-testid="ai-intelligence-page">
      {/* Header */}
      <div className="border-b border-border bg-background-card">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-xl">
                <Brain className="w-8 h-8 text-purple-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-text-primary">AI Intelligence</h1>
                <p className="text-text-secondary">Machine learning powered market analysis</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <select
                value={universe}
                onChange={(e) => setUniverse(e.target.value)}
                className="px-4 py-2 bg-background border border-border rounded-lg text-text-primary text-sm"
              >
                <option value="nifty50">Nifty 50</option>
                <option value="nifty500">Top 200 Stocks</option>
                <option value="all">All NSE (2200+)</option>
              </select>
              <button
                onClick={() => fetchFeatureData(activeFeature)}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-accent/10 text-accent rounded-lg hover:bg-accent/20 transition"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar - AI Features */}
          <div className="col-span-3">
            <div className="bg-background-card border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-4">
                AI Features
              </h3>
              <div className="space-y-2">
                {aiFeatures.map((feature) => (
                  <button
                    key={feature.id}
                    onClick={() => setActiveFeature(feature.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-lg transition ${
                      activeFeature === feature.id
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'hover:bg-background text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <feature.icon className="w-5 h-5" />
                    <div className="text-left">
                      <div className="font-medium text-sm">{feature.name}</div>
                      <div className="text-xs opacity-70">{feature.description}</div>
                    </div>
                  </button>
                ))}
              </div>

              {/* Last Updated */}
              {lastUpdated && (
                <div className="mt-6 pt-4 border-t border-border">
                  <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <Clock className="w-3 h-3" />
                    Updated: {new Date(lastUpdated).toLocaleTimeString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Main Content */}
          <div className="col-span-9">
            {loading ? (
              <div className="flex items-center justify-center h-96">
                <RefreshCw className="w-8 h-8 text-accent animate-spin" />
              </div>
            ) : (
              <>
                {/* Nifty Prediction */}
                {activeFeature === 'nifty-prediction' && niftyPrediction && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      {/* Current Level */}
                      <div className="bg-background-card border border-border rounded-xl p-6">
                        <div className="text-sm text-text-secondary mb-2">NIFTY 50</div>
                        <div className="text-3xl font-bold text-text-primary">
                          {niftyPrediction.current_level.toLocaleString()}
                        </div>
                        <div className={`flex items-center gap-1 mt-2 ${niftyPrediction.change >= 0 ? 'text-success' : 'text-danger'}`}>
                          {niftyPrediction.change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                          {niftyPrediction.change.toFixed(2)} ({niftyPrediction.change_percent.toFixed(2)}%)
                        </div>
                      </div>

                      {/* AI Prediction */}
                      <div className={`bg-background-card border rounded-xl p-6 ${
                        niftyPrediction.prediction.direction === 'BULLISH' ? 'border-success/50' : 
                        niftyPrediction.prediction.direction === 'BEARISH' ? 'border-danger/50' : 'border-warning/50'
                      }`}>
                        <div className="text-sm text-text-secondary mb-2">AI PREDICTION</div>
                        <div className={`text-2xl font-bold ${
                          niftyPrediction.prediction.direction === 'BULLISH' ? 'text-success' : 
                          niftyPrediction.prediction.direction === 'BEARISH' ? 'text-danger' : 'text-warning'
                        }`}>
                          {niftyPrediction.prediction.direction}
                        </div>
                        <div className="text-sm text-text-secondary mt-2">
                          Target: {niftyPrediction.prediction.predicted_level.toLocaleString()}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="text-xs text-text-secondary">Confidence:</div>
                          <div className="flex-1 h-2 bg-background rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${
                                niftyPrediction.prediction.direction === 'BULLISH' ? 'bg-success' : 
                                niftyPrediction.prediction.direction === 'BEARISH' ? 'bg-danger' : 'bg-warning'
                              }`}
                              style={{ width: `${niftyPrediction.prediction.confidence}%` }}
                            />
                          </div>
                          <div className="text-xs font-medium">{niftyPrediction.prediction.confidence}%</div>
                        </div>
                      </div>

                      {/* Indicators */}
                      <div className="bg-background-card border border-border rounded-xl p-6">
                        <div className="text-sm text-text-secondary mb-3">INDICATORS</div>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">RSI</span>
                            <span className={`font-medium ${niftyPrediction.indicators.rsi < 30 ? 'text-success' : niftyPrediction.indicators.rsi > 70 ? 'text-danger' : 'text-text-primary'}`}>
                              {niftyPrediction.indicators.rsi.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">MA 5</span>
                            <span className="text-text-primary">{niftyPrediction.indicators.ma_5.toFixed(0)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">MA 20</span>
                            <span className="text-text-primary">{niftyPrediction.indicators.ma_20.toFixed(0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Support/Resistance */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-background-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-2 text-success mb-4">
                          <CheckCircle className="w-5 h-5" />
                          <span className="font-semibold">Support Levels</span>
                        </div>
                        <div className="flex gap-4">
                          {niftyPrediction.support_levels.map((level, i) => (
                            <div key={i} className="px-4 py-2 bg-success/10 rounded-lg">
                              <div className="text-xs text-text-secondary">S{i + 1}</div>
                              <div className="text-lg font-bold text-success">{level.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-background-card border border-border rounded-xl p-6">
                        <div className="flex items-center gap-2 text-danger mb-4">
                          <AlertTriangle className="w-5 h-5" />
                          <span className="font-semibold">Resistance Levels</span>
                        </div>
                        <div className="flex gap-4">
                          {niftyPrediction.resistance_levels.map((level, i) => (
                            <div key={i} className="px-4 py-2 bg-danger/10 rounded-lg">
                              <div className="text-xs text-text-secondary">R{i + 1}</div>
                              <div className="text-lg font-bold text-danger">{level.toLocaleString()}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Market Regime */}
                {activeFeature === 'market-regime' && marketRegime && (
                  <div className="space-y-6">
                    <div className="bg-background-card border border-border rounded-xl p-8">
                      <div className="flex items-center gap-6">
                        <div className={`p-4 rounded-2xl ${
                          marketRegime.regime.includes('BULL') ? 'bg-success/15' : 
                          marketRegime.regime.includes('BEAR') ? 'bg-danger/15' : 'bg-warning/15'
                        } ${getRegimeColor(marketRegime.regime)}`}>
                          {getRegimeIcon(marketRegime.regime)}
                        </div>
                        <div>
                          <div className="text-sm text-text-secondary">Current Market Regime</div>
                          <div className={`text-3xl font-bold ${getRegimeColor(marketRegime.regime)}`}>
                            {marketRegime.regime.replace('_', ' ')}
                          </div>
                          <div className="text-text-secondary mt-1">{marketRegime.description}</div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-background-card border border-border rounded-xl p-6">
                        <h3 className="font-semibold text-text-primary mb-4">Market Indicators</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Nifty 50</span>
                            <span className="font-medium text-text-primary">{marketRegime.indicators.nifty.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">20 MA</span>
                            <span className={`font-medium ${marketRegime.indicators.nifty > marketRegime.indicators.ma_20 ? 'text-success' : 'text-danger'}`}>
                              {marketRegime.indicators.ma_20.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">50 MA</span>
                            <span className={`font-medium ${marketRegime.indicators.nifty > marketRegime.indicators.ma_50 ? 'text-success' : 'text-danger'}`}>
                              {marketRegime.indicators.ma_50.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-text-secondary">Volatility</span>
                            <span className={`font-medium ${marketRegime.indicators.volatility_ratio > 1 ? 'text-danger' : 'text-success'}`}>
                              {marketRegime.indicators.volatility_ratio.toFixed(2)}x
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-accent/10 to-primary/10 border border-accent/30 rounded-xl p-6">
                        <h3 className="font-semibold text-accent mb-4 flex items-center gap-2">
                          <Sparkles className="w-5 h-5" />
                          AI Recommendation
                        </h3>
                        <p className="text-text-primary text-lg">{marketRegime.recommendation}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Momentum Radar */}
                {activeFeature === 'momentum-radar' && (
                  <div className="bg-background-card border border-border rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-5 h-5 text-yellow-500" />
                        <h2 className="font-semibold text-text-primary">High Momentum Stocks</h2>
                      </div>
                      <span className="text-sm text-text-secondary">{momentumStocks.length} stocks found</span>
                    </div>
                    <div className="divide-y divide-border">
                      {momentumStocks.map((stock) => (
                        <div key={stock.symbol} className="p-4 hover:bg-background/50 transition">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-text-primary">{stock.symbol}</span>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium ${stock.change_percent >= 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                                  {stock.change_percent >= 0 ? '+' : ''}{stock.change_percent.toFixed(2)}%
                                </span>
                              </div>
                              <div className="text-sm text-text-secondary mt-1">{stock.signal_reason}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-text-primary">₹{stock.ltp?.toFixed(2)}</div>
                              <div className="text-xs text-text-secondary">
                                Score: <span className="text-accent font-medium">{stock.momentum_score}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {momentumStocks.length === 0 && (
                        <div className="p-12 text-center text-text-secondary">
                          No high momentum stocks found in current market conditions
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Breakout Scanner */}
                {activeFeature === 'breakout-scanner' && (
                  <div className="bg-background-card border border-border rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-success" />
                        <h2 className="font-semibold text-text-primary">Potential Breakouts</h2>
                      </div>
                      <span className="text-sm text-text-secondary">{breakoutStocks.length} stocks found</span>
                    </div>
                    <div className="divide-y divide-border">
                      {breakoutStocks.map((stock) => (
                        <div key={stock.symbol} className="p-4 hover:bg-background/50 transition">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-text-primary">{stock.symbol}</span>
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-success/15 text-success">
                                  Breakout Probability: {stock.breakout_probability}%
                                </span>
                              </div>
                              <div className="text-sm text-text-secondary mt-1">{stock.signal_reason}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-text-primary">₹{stock.ltp?.toFixed(2)}</div>
                              <div className="text-xs text-text-secondary">
                                Score: <span className="text-success font-medium">{stock.breakout_score}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {breakoutStocks.length === 0 && (
                        <div className="p-12 text-center text-text-secondary">
                          No breakout candidates found
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Reversal Scanner */}
                {activeFeature === 'reversal-scanner' && (
                  <div className="bg-background-card border border-border rounded-xl overflow-hidden">
                    <div className="p-4 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Target className="w-5 h-5 text-purple-500" />
                        <h2 className="font-semibold text-text-primary">Reversal Candidates</h2>
                      </div>
                      <span className="text-sm text-text-secondary">{reversalStocks.length} stocks found</span>
                    </div>
                    <div className="divide-y divide-border">
                      {reversalStocks.map((stock) => (
                        <div key={stock.symbol} className="p-4 hover:bg-background/50 transition">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-3">
                                <span className="font-bold text-text-primary">{stock.symbol}</span>
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/15 text-purple-400">
                                  Reversal Probability: {stock.reversal_probability}%
                                </span>
                              </div>
                              <div className="text-sm text-text-secondary mt-1">{stock.signal_reason}</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold text-text-primary">₹{stock.ltp?.toFixed(2)}</div>
                              <div className="text-xs text-text-secondary">
                                RSI: <span className={`font-medium ${stock.rsi < 30 ? 'text-success' : 'text-text-primary'}`}>{stock.rsi?.toFixed(1)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {reversalStocks.length === 0 && (
                        <div className="p-12 text-center text-text-secondary">
                          No reversal candidates found
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Trend Analysis */}
                {activeFeature === 'trend-analysis' && trendAnalysis && (
                  <div className="space-y-6">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-4 gap-4">
                      <div className="bg-background-card border border-border rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-text-primary">{trendAnalysis.summary.total}</div>
                        <div className="text-sm text-text-secondary">Total Scanned</div>
                      </div>
                      <div className="bg-success/10 border border-success/30 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-success">{trendAnalysis.summary.uptrend}</div>
                        <div className="text-sm text-success">Uptrend</div>
                      </div>
                      <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-danger">{trendAnalysis.summary.downtrend}</div>
                        <div className="text-sm text-danger">Downtrend</div>
                      </div>
                      <div className="bg-warning/10 border border-warning/30 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-warning">{trendAnalysis.summary.sideways}</div>
                        <div className="text-sm text-warning">Sideways</div>
                      </div>
                    </div>

                    {/* Uptrend Stocks */}
                    <div className="bg-background-card border border-success/30 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-border bg-success/5 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-success" />
                        <h3 className="font-semibold text-success">Uptrend Stocks ({trendAnalysis.uptrend.length})</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-2 p-4">
                        {trendAnalysis.uptrend.slice(0, 10).map((stock) => (
                          <div key={stock.symbol} className="flex items-center justify-between p-2 bg-background rounded-lg">
                            <span className="font-medium text-text-primary">{stock.symbol}</span>
                            <span className="text-sm text-success">+{stock.change_percent?.toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Downtrend Stocks */}
                    <div className="bg-background-card border border-danger/30 rounded-xl overflow-hidden">
                      <div className="p-4 border-b border-border bg-danger/5 flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-danger" />
                        <h3 className="font-semibold text-danger">Downtrend Stocks ({trendAnalysis.downtrend.length})</h3>
                      </div>
                      <div className="grid grid-cols-2 gap-2 p-4">
                        {trendAnalysis.downtrend.slice(0, 10).map((stock) => (
                          <div key={stock.symbol} className="flex items-center justify-between p-2 bg-background rounded-lg">
                            <span className="font-medium text-text-primary">{stock.symbol}</span>
                            <span className="text-sm text-danger">{stock.change_percent?.toFixed(2)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
