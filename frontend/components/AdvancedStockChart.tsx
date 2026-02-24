'use client'

// ============================================================================
// ADVANCED STOCK CHART - Cutting Edge Real-time Trading Chart
// Features: WebSocket real-time updates, candlestick, area, volume bars
// Technical Indicators: RSI, MACD, Moving Averages, Pattern Recognition
// ============================================================================

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, ReferenceLine, CartesianGrid,
  LineChart as RechartsLineChart
} from 'recharts'
import {
  TrendingUp, TrendingDown, RefreshCw, Clock, Zap,
  Activity, BarChart3, LineChart, CandlestickChart,
  Maximize2, Volume2, Target, AlertCircle, X, Gauge
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || ''

interface ChartDataPoint {
  date: string
  fullDate: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  price: number
  ma20?: number
  ma50?: number
  rsi?: number
  macd?: number
  macdSignal?: number
  macdHistogram?: number
  pattern?: string
}

interface StockInfo {
  symbol: string
  price: number
  change: number
  change_percent: number
  volume?: number
  high?: number
  low?: number
  open?: number
}

interface AdvancedStockChartProps {
  symbol: string
  showHeader?: boolean
  height?: string
  onClose?: () => void
  isModal?: boolean
}

// Calculate RSI
function calculateRSI(data: ChartDataPoint[], period: number = 14): number[] {
  const rsiValues: number[] = []
  
  for (let i = 0; i < data.length; i++) {
    if (i < period) {
      rsiValues.push(50) // Default for insufficient data
      continue
    }
    
    let gains = 0
    let losses = 0
    
    for (let j = i - period + 1; j <= i; j++) {
      const change = data[j].close - data[j - 1].close
      if (change > 0) gains += change
      else losses -= change
    }
    
    const avgGain = gains / period
    const avgLoss = losses / period
    
    if (avgLoss === 0) {
      rsiValues.push(100)
    } else {
      const rs = avgGain / avgLoss
      rsiValues.push(100 - (100 / (1 + rs)))
    }
  }
  
  return rsiValues
}

// Calculate MACD
function calculateMACD(data: ChartDataPoint[]): { macd: number[], signal: number[], histogram: number[] } {
  const ema12 = calculateEMA(data.map(d => d.close), 12)
  const ema26 = calculateEMA(data.map(d => d.close), 26)
  
  const macdLine = ema12.map((val, i) => val - ema26[i])
  const signalLine = calculateEMA(macdLine, 9)
  const histogram = macdLine.map((val, i) => val - signalLine[i])
  
  return { macd: macdLine, signal: signalLine, histogram }
}

// Calculate EMA
function calculateEMA(data: number[], period: number): number[] {
  const ema: number[] = []
  const multiplier = 2 / (period + 1)
  
  // First EMA is SMA
  let sum = 0
  for (let i = 0; i < Math.min(period, data.length); i++) {
    sum += data[i]
  }
  ema[period - 1] = sum / period
  
  // Calculate rest of EMA
  for (let i = period; i < data.length; i++) {
    ema[i] = (data[i] - ema[i - 1]) * multiplier + ema[i - 1]
  }
  
  // Fill in early values with first calculated EMA
  for (let i = 0; i < period - 1; i++) {
    ema[i] = ema[period - 1] || data[i]
  }
  
  return ema
}

// Detect candlestick patterns
function detectPatterns(data: ChartDataPoint[]): string[] {
  const patterns: string[] = new Array(data.length).fill('')
  
  for (let i = 1; i < data.length; i++) {
    const curr = data[i]
    const prev = data[i - 1]
    const body = Math.abs(curr.close - curr.open)
    const upperWick = curr.high - Math.max(curr.close, curr.open)
    const lowerWick = Math.min(curr.close, curr.open) - curr.low
    const totalRange = curr.high - curr.low
    
    // Doji - small body relative to range
    if (body < totalRange * 0.1 && totalRange > 0) {
      patterns[i] = 'Doji'
      continue
    }
    
    // Hammer - small body at top, long lower wick
    if (body < totalRange * 0.3 && lowerWick > body * 2 && upperWick < body * 0.5) {
      patterns[i] = curr.close > curr.open ? 'Hammer 🔨' : 'Hanging Man'
      continue
    }
    
    // Shooting Star - small body at bottom, long upper wick  
    if (body < totalRange * 0.3 && upperWick > body * 2 && lowerWick < body * 0.5) {
      patterns[i] = 'Shooting Star ⭐'
      continue
    }
    
    // Engulfing patterns
    if (i > 0) {
      const prevBody = Math.abs(prev.close - prev.open)
      
      // Bullish Engulfing
      if (prev.close < prev.open && curr.close > curr.open && 
          curr.open < prev.close && curr.close > prev.open) {
        patterns[i] = 'Bullish Engulfing 🟢'
        continue
      }
      
      // Bearish Engulfing
      if (prev.close > prev.open && curr.close < curr.open && 
          curr.open > prev.close && curr.close < prev.open) {
        patterns[i] = 'Bearish Engulfing 🔴'
        continue
      }
    }
    
    // Strong momentum candles
    if (body > totalRange * 0.7) {
      patterns[i] = curr.close > curr.open ? 'Strong Bullish' : 'Strong Bearish'
    }
  }
  
  return patterns
}

// Calculate moving averages
function calculateMA(data: number[], period: number): number[] {
  return data.map((_, index) => {
    if (index < period - 1) return data[index]
    const slice = data.slice(index - period + 1, index + 1)
    return slice.reduce((acc, curr) => acc + curr, 0) / period
  })
}

export default function AdvancedStockChart({ 
  symbol, 
  showHeader = true, 
  height = "500px",
  onClose,
  isModal = false
}: AdvancedStockChartProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [timeframe, setTimeframe] = useState('1M')
  const [chartType, setChartType] = useState<'area' | 'candle' | 'line'>('area')
  const [showVolume, setShowVolume] = useState(true)
  const [showMA, setShowMA] = useState(false)
  const [showRSI, setShowRSI] = useState(false)
  const [showMACD, setShowMACD] = useState(false)
  const [showPatterns, setShowPatterns] = useState(false)
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Fetch chart data
  const fetchChartData = useCallback(async () => {
    setIsLoading(true)
    try {
      const periodMap: Record<string, string> = {
        '1D': '1d',
        '1W': '1w', 
        '1M': '1mo',
        '3M': '3mo',
        '6M': '6mo',
        '1Y': '1y',
        'ALL': 'max'
      }
      
      const res = await fetch(`${API_BASE}/api/screener/prices/${symbol}/history?period=${periodMap[timeframe] || '1mo'}`)
      const data = await res.json()
      
      if (data.success && data.history && data.history.length > 0) {
        let formattedData: ChartDataPoint[] = data.history.map((item: any) => ({
          date: new Date(item.date).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }),
          fullDate: new Date(item.date).toLocaleDateString('en-IN', { 
            weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' 
          }),
          open: parseFloat(item.open?.toFixed(2)) || 0,
          high: parseFloat(item.high?.toFixed(2)) || 0,
          low: parseFloat(item.low?.toFixed(2)) || 0,
          close: parseFloat(item.close?.toFixed(2)) || 0,
          volume: item.volume || 0,
          price: parseFloat(item.close?.toFixed(2)) || 0
        }))
        
        // Calculate technical indicators
        const closes = formattedData.map(d => d.close)
        const ma20 = calculateMA(closes, 20)
        const ma50 = calculateMA(closes, 50)
        const rsiValues = calculateRSI(formattedData)
        const { macd, signal, histogram } = calculateMACD(formattedData)
        const patterns = detectPatterns(formattedData)
        
        formattedData = formattedData.map((item, idx) => ({
          ...item,
          ma20: parseFloat(ma20[idx]?.toFixed(2)) || item.close,
          ma50: parseFloat(ma50[idx]?.toFixed(2)) || item.close,
          rsi: parseFloat(rsiValues[idx]?.toFixed(2)) || 50,
          macd: parseFloat(macd[idx]?.toFixed(2)) || 0,
          macdSignal: parseFloat(signal[idx]?.toFixed(2)) || 0,
          macdHistogram: parseFloat(histogram[idx]?.toFixed(2)) || 0,
          pattern: patterns[idx]
        }))
        
        setChartData(formattedData)
      }
      
      // Fetch current price
      const priceRes = await fetch(`${API_BASE}/api/screener/prices/${symbol}`)
      const priceData = await priceRes.json()
      if (priceData.success) {
        setStockInfo({
          symbol,
          price: priceData.price,
          change: priceData.change,
          change_percent: priceData.change_percent,
          volume: priceData.volume,
          high: priceData.high,
          low: priceData.low,
          open: priceData.open
        })
      }
      
      setLastUpdate(new Date())
    } catch (error) {
      console.error('Error fetching chart data:', error)
    }
    setIsLoading(false)
  }, [symbol, timeframe])

  // Real-time polling for price updates (more reliable than WebSocket in k8s)
  const startRealTimePolling = useCallback(() => {
    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
    }
    
    // Poll every 5 seconds for live prices
    pollingRef.current = setInterval(async () => {
      try {
        const priceRes = await fetch(`${API_BASE}/api/screener/prices/${symbol}`)
        const priceData = await priceRes.json()
        
        if (priceData.success) {
          setStockInfo(prev => ({
            ...prev!,
            symbol,
            price: priceData.price,
            change: priceData.change,
            change_percent: priceData.change_percent
          }))
          
          // Update last candle in chart
          setChartData(prev => {
            if (prev.length === 0) return prev
            const updated = [...prev]
            const lastCandle = { ...updated[updated.length - 1] }
            lastCandle.close = priceData.price
            lastCandle.price = priceData.price
            lastCandle.high = Math.max(lastCandle.high, priceData.price)
            lastCandle.low = Math.min(lastCandle.low, priceData.price)
            updated[updated.length - 1] = lastCandle
            return updated
          })
          
          setLastUpdate(new Date())
          setIsLive(true)
        }
      } catch (error) {
        console.error('Polling error:', error)
        setIsLive(false)
      }
    }, 5000)
  }, [symbol])

  // WebSocket connection for real-time updates (fallback)
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    
    try {
      // Construct WebSocket URL - try both ws and wss
      let wsUrl = API_BASE.replace('https://', 'wss://').replace('http://', 'ws://')
      
      // Add /api prefix if needed for ingress routing
      const clientId = `chart_${symbol}_${Date.now()}`
      wsRef.current = new WebSocket(`${wsUrl}/ws/prices/${clientId}`)
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected')
        setIsLive(true)
        // Subscribe to symbol
        wsRef.current?.send(JSON.stringify({
          action: 'subscribe',
          symbols: [symbol]
        }))
      }
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'price_update' && data.prices?.[symbol]) {
            const priceUpdate = data.prices[symbol]
            setStockInfo(prev => ({
              ...prev!,
              price: priceUpdate.price,
              change: priceUpdate.change,
              change_percent: priceUpdate.change_percent
            }))
            setLastUpdate(new Date())
            
            // Update last candle in chart
            setChartData(prev => {
              if (prev.length === 0) return prev
              const updated = [...prev]
              const lastCandle = { ...updated[updated.length - 1] }
              lastCandle.close = priceUpdate.price
              lastCandle.price = priceUpdate.price
              lastCandle.high = Math.max(lastCandle.high, priceUpdate.price)
              lastCandle.low = Math.min(lastCandle.low, priceUpdate.price)
              updated[updated.length - 1] = lastCandle
              return updated
            })
          }
        } catch (e) {
          console.error('WebSocket message error:', e)
        }
      }
      
      wsRef.current.onclose = () => {
        console.log('WebSocket closed, falling back to polling')
        setIsLive(false)
        // Don't auto-reconnect, use polling instead
      }
      
      wsRef.current.onerror = (error) => {
        console.log('WebSocket error, using polling fallback')
        setIsLive(false)
      }
    } catch (error) {
      console.error('WebSocket connection error:', error)
      setIsLive(false)
    }
  }, [symbol])

  useEffect(() => {
    fetchChartData()
    
    // Start real-time polling (more reliable)
    startRealTimePolling()
    
    // Also try WebSocket (bonus if it works)
    connectWebSocket()
    
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [fetchChartData, connectWebSocket, startRealTimePolling])

  const timeframes = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
  ]

  const isPositive = stockInfo ? stockInfo.change >= 0 : (chartData.length > 1 ? chartData[chartData.length - 1]?.close >= chartData[0]?.close : true)
  const minPrice = chartData.length > 0 ? Math.min(...chartData.map(d => d.low)) * 0.995 : 0
  const maxPrice = chartData.length > 0 ? Math.max(...chartData.map(d => d.high)) * 1.005 : 0
  const maxVolume = chartData.length > 0 ? Math.max(...chartData.map(d => d.volume)) : 0

  // Calculate period change
  const periodChange = chartData.length > 1 
    ? ((chartData[chartData.length - 1].close - chartData[0].close) / chartData[0].close * 100)
    : 0

  // Get latest RSI value
  const latestRSI = chartData.length > 0 ? chartData[chartData.length - 1].rsi || 50 : 50
  const rsiStatus = latestRSI < 30 ? 'Oversold' : latestRSI > 70 ? 'Overbought' : 'Neutral'
  const rsiColor = latestRSI < 30 ? 'text-green-400' : latestRSI > 70 ? 'text-red-400' : 'text-gray-400'

  // Get latest pattern
  const latestPattern = chartData.length > 0 ? chartData[chartData.length - 1].pattern : ''

  // Custom Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-900/98 backdrop-blur-xl border border-gray-700/50 rounded-2xl p-4 shadow-2xl min-w-[220px]"
        >
          <p className="text-gray-400 text-xs mb-3 font-medium">{data.fullDate}</p>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Open</span>
              <span className="text-white font-semibold">₹{data.open?.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">High</span>
              <span className="text-green-400 font-semibold">₹{data.high?.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Low</span>
              <span className="text-red-400 font-semibold">₹{data.low?.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center border-t border-gray-700/50 pt-2 mt-2">
              <span className="text-gray-500 text-sm">Close</span>
              <span className="text-white font-bold text-lg">₹{data.close?.toLocaleString('en-IN')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 text-sm">Volume</span>
              <span className="text-blue-400 font-medium">{(data.volume / 1000000).toFixed(2)}M</span>
            </div>
            {showRSI && (
              <div className="flex justify-between items-center border-t border-gray-700/50 pt-2 mt-2">
                <span className="text-gray-500 text-sm">RSI</span>
                <span className={`font-medium ${data.rsi < 30 ? 'text-green-400' : data.rsi > 70 ? 'text-red-400' : 'text-gray-300'}`}>
                  {data.rsi?.toFixed(1)}
                </span>
              </div>
            )}
            {showMACD && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500 text-sm">MACD</span>
                <span className={`font-medium ${data.macd > 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {data.macd?.toFixed(2)}
                </span>
              </div>
            )}
            {data.pattern && showPatterns && (
              <div className="border-t border-gray-700/50 pt-2 mt-2">
                <span className="text-xs text-amber-400 font-medium">{data.pattern}</span>
              </div>
            )}
          </div>
        </motion.div>
      )
    }
    return null
  }

  // Calculate chart height based on indicators
  const mainChartHeight = showRSI || showMACD ? "55%" : (showVolume ? "75%" : "100%")
  const indicatorHeight = showRSI && showMACD ? "18%" : "22%"
  const volumeHeight = "18%"

  const chartContent = (
    <div className={`relative ${isModal ? '' : 'rounded-2xl border border-gray-800/50'} bg-gradient-to-b from-gray-900/95 to-gray-950/95 backdrop-blur-xl overflow-hidden`}>
      {/* Ambient glow effect */}
      <div className={`absolute inset-0 opacity-20 pointer-events-none ${isPositive ? 'bg-gradient-to-t from-green-500/10 via-transparent' : 'bg-gradient-to-t from-red-500/10 via-transparent'}`} />
      
      {/* Header */}
      {showHeader && (
        <div className="relative z-10 px-6 py-4 border-b border-gray-800/50">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Stock Info */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPositive ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                  <Activity className={`w-5 h-5 ${isPositive ? 'text-green-400' : 'text-red-400'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">{symbol}</h2>
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full font-medium">NSE</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isLive ? (
                      <span className="flex items-center gap-1 text-xs text-green-400">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                        </span>
                        LIVE
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-yellow-500">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Updating...
                      </span>
                    )}
                    {lastUpdate && (
                      <span className="text-xs text-gray-500">
                        {lastUpdate.toLocaleTimeString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              
              {stockInfo && (
                <div className="flex items-center gap-4 pl-6 border-l border-gray-800">
                  <div>
                    <span className="text-2xl font-bold text-white">
                      ₹{stockInfo.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className={`flex items-center gap-1 text-sm font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                      {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {isPositive ? '+' : ''}{stockInfo.change?.toFixed(2)} ({stockInfo.change_percent?.toFixed(2)}%)
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${periodChange >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}% ({timeframe})
                  </div>
                </div>
              )}
              
              {/* RSI Badge */}
              {showRSI && (
                <div className={`px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-800/50 ${rsiColor}`}>
                  RSI: {latestRSI.toFixed(1)} • {rsiStatus}
                </div>
              )}
              
              {/* Pattern Badge */}
              {latestPattern && showPatterns && (
                <div className="px-3 py-1.5 rounded-lg text-sm font-medium bg-amber-500/20 text-amber-400">
                  {latestPattern}
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Chart Type */}
              <div className="flex items-center bg-gray-800/50 rounded-xl p-1">
                <button
                  onClick={() => setChartType('area')}
                  className={`p-2 rounded-lg transition-all ${chartType === 'area' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Area Chart"
                >
                  <BarChart3 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setChartType('line')}
                  className={`p-2 rounded-lg transition-all ${chartType === 'line' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Line Chart"
                >
                  <LineChart className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setChartType('candle')}
                  className={`p-2 rounded-lg transition-all ${chartType === 'candle' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Candlestick"
                >
                  <CandlestickChart className="w-4 h-4" />
                </button>
              </div>

              {/* Indicators */}
              <div className="flex items-center gap-1 bg-gray-800/50 rounded-xl p-1">
                <button
                  onClick={() => setShowVolume(!showVolume)}
                  className={`p-2 rounded-lg transition-all ${showVolume ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Volume"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowMA(!showMA)}
                  className={`p-2 rounded-lg transition-all ${showMA ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Moving Averages"
                >
                  <Target className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowRSI(!showRSI)}
                  className={`p-2 rounded-lg transition-all ${showRSI ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="RSI"
                >
                  <Gauge className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowMACD(!showMACD)}
                  className={`p-2 rounded-lg transition-all ${showMACD ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="MACD"
                >
                  <Activity className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowPatterns(!showPatterns)}
                  className={`p-2 rounded-lg transition-all ${showPatterns ? 'bg-amber-600 text-white' : 'text-gray-400 hover:text-white'}`}
                  title="Patterns"
                >
                  <Zap className="w-4 h-4" />
                </button>
              </div>

              {/* Timeframes */}
              <div className="flex items-center bg-gray-800/50 rounded-xl p-1">
                {timeframes.map((tf) => (
                  <button
                    key={tf.value}
                    onClick={() => setTimeframe(tf.value)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      timeframe === tf.value
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                        : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>

              {/* Refresh */}
              <button
                onClick={fetchChartData}
                className="p-2 bg-gray-800/50 hover:bg-gray-700 rounded-xl transition-all"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 text-gray-400 ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              {onClose && (
                <button
                  onClick={onClose}
                  className="p-2 bg-gray-800/50 hover:bg-red-500/20 hover:text-red-400 rounded-xl transition-all text-gray-400"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chart Area */}
      <div className="relative" style={{ height }}>
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-500/20 rounded-full animate-pulse"></div>
                <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
              </div>
              <p className="text-gray-400 mt-4 text-sm">Loading chart data...</p>
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-400">No chart data available</p>
              <button
                onClick={fetchChartData}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition flex items-center gap-2 mx-auto"
              >
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full p-4 flex flex-col">
            {/* Main Price Chart */}
            <div style={{ height: mainChartHeight }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.4}/>
                      <stop offset="50%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0.1}/>
                      <stop offset="100%" stopColor={isPositive ? "#22c55e" : "#ef4444"} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.3} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    interval="preserveStartEnd"
                  />
                  <YAxis 
                    domain={[minPrice, maxPrice]}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 10 }}
                    tickFormatter={(value) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                    width={65}
                    orientation="right"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  
                  {/* Moving Averages */}
                  {showMA && (
                    <>
                      <Line type="monotone" dataKey="ma20" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="MA20" />
                      <Line type="monotone" dataKey="ma50" stroke="#8b5cf6" strokeWidth={1.5} dot={false} name="MA50" />
                    </>
                  )}
                  
                  {/* Price */}
                  {chartType === 'area' ? (
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke={isPositive ? "#22c55e" : "#ef4444"}
                      strokeWidth={2}
                      fill="url(#colorPrice)"
                    />
                  ) : chartType === 'line' ? (
                    <Line 
                      type="monotone" 
                      dataKey="price" 
                      stroke={isPositive ? "#22c55e" : "#ef4444"}
                      strokeWidth={2}
                      dot={false}
                    />
                  ) : (
                    // Candlestick approximation using bar
                    <Bar 
                      dataKey="close" 
                      fill={isPositive ? "#22c55e" : "#ef4444"}
                      opacity={0.8}
                    />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            
            {/* RSI Indicator */}
            {showRSI && (
              <div style={{ height: indicatorHeight }} className="mt-2">
                <div className="text-xs text-gray-500 mb-1 px-2">RSI (14)</div>
                <ResponsiveContainer width="100%" height="85%">
                  <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.2} />
                    <XAxis dataKey="date" hide />
                    <YAxis 
                      domain={[0, 100]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6b7280', fontSize: 9 }}
                      width={65}
                      orientation="right"
                      ticks={[30, 50, 70]}
                    />
                    <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.5} />
                    <Line 
                      type="monotone" 
                      dataKey="rsi" 
                      stroke="#06b6d4"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {/* MACD Indicator */}
            {showMACD && (
              <div style={{ height: indicatorHeight }} className="mt-2">
                <div className="text-xs text-gray-500 mb-1 px-2">MACD (12, 26, 9)</div>
                <ResponsiveContainer width="100%" height="85%">
                  <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" opacity={0.2} />
                    <XAxis dataKey="date" hide />
                    <YAxis 
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6b7280', fontSize: 9 }}
                      width={65}
                      orientation="right"
                    />
                    <ReferenceLine y={0} stroke="#374151" strokeOpacity={0.5} />
                    <Bar 
                      dataKey="macdHistogram" 
                      fill="#6366f1"
                      opacity={0.6}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="macd" 
                      stroke="#22c55e"
                      strokeWidth={1.5}
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="macdSignal" 
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            
            {/* Volume Chart */}
            {showVolume && (
              <div style={{ height: volumeHeight }} className="mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" hide />
                    <YAxis 
                      domain={[0, maxVolume * 1.1]}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#6b7280', fontSize: 9 }}
                      tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                      width={65}
                      orientation="right"
                    />
                    <Bar 
                      dataKey="volume" 
                      fill="#3b82f6"
                      opacity={0.6}
                      radius={[2, 2, 0, 0]}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 px-6 py-3 border-t border-gray-800/50 flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-yellow-500" />
            Real-time NSE data (5s refresh)
          </span>
          {showMA && (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 rounded"></span> MA20</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 rounded"></span> MA50</span>
            </span>
          )}
          {showRSI && (
            <span className="flex items-center gap-1">
              <span className="w-3 h-0.5 bg-cyan-500 rounded"></span> RSI
            </span>
          )}
          {showMACD && (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-green-500 rounded"></span> MACD</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-500 rounded"></span> Signal</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 ${isPositive ? 'text-green-500' : 'text-red-500'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isPositive ? 'Bullish' : 'Bearish'} Trend
          </span>
        </div>
      </div>
    </div>
  )

  if (isModal) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-7xl"
          onClick={(e) => e.stopPropagation()}
        >
          {chartContent}
        </motion.div>
      </motion.div>
    )
  }

  return chartContent
}
