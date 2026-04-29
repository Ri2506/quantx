'use client'

// ============================================================================
// ADVANCED STOCK CHART — TradingView lightweight-charts
// Professional candlestick charting with volume, MA, RSI, MACD overlays
// Real-time updates via WebSocket + polling fallback
// ============================================================================

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  createChart,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  type Time,
} from 'lightweight-charts'
import {
  TrendingUp, TrendingDown, RefreshCw, Zap,
  Activity, BarChart3, LineChart, CandlestickChart,
  Volume2, Target, AlertCircle, X, Gauge
} from 'lucide-react'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || ''

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

// ── Indicator math ──────────────────────────────────────────────────────────

function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    let s = 0
    for (let j = i - period + 1; j <= i; j++) s += closes[j]
    return s / period
  })
}

function calcEMA(data: number[], period: number): number[] {
  const ema: number[] = new Array(data.length)
  const k = 2 / (period + 1)
  let sum = 0
  for (let i = 0; i < Math.min(period, data.length); i++) sum += data[i]
  ema[period - 1] = sum / period
  for (let i = period; i < data.length; i++) ema[i] = data[i] * k + ema[i - 1] * (1 - k)
  for (let i = 0; i < period - 1; i++) ema[i] = ema[period - 1] ?? data[i]
  return ema
}

function calcRSI(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  for (let i = period; i < closes.length; i++) {
    let gains = 0, losses = 0
    for (let j = i - period + 1; j <= i; j++) {
      const d = closes[j] - closes[j - 1]
      if (d > 0) gains += d; else losses -= d
    }
    const ag = gains / period, al = losses / period
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al)
  }
  return out
}

function calcMACD(closes: number[]) {
  const e12 = calcEMA(closes, 12)
  const e26 = calcEMA(closes, 26)
  const macd = e12.map((v, i) => v - e26[i])
  const signal = calcEMA(macd, 9)
  const hist = macd.map((v, i) => v - signal[i])
  return { macd, signal, hist }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function AdvancedStockChart({
  symbol,
  showHeader = true,
  height = '500px',
  onClose,
  isModal = false,
}: AdvancedStockChartProps) {
  // State
  const [isLoading, setIsLoading] = useState(true)
  const [timeframe, setTimeframe] = useState('3M')
  const [chartType, setChartType] = useState<'area' | 'candle' | 'line'>('candle')
  const [showVolume, setShowVolume] = useState(true)
  const [showMA, setShowMA] = useState(false)
  const [showRSI, setShowRSI] = useState(false)
  const [showMACD, setShowMACD] = useState(false)
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null)
  const [isLive, setIsLive] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [noData, setNoData] = useState(false)

  // Refs
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const rsiContainerRef = useRef<HTMLDivElement>(null)
  const macdContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const rsiChartRef = useRef<IChartApi | null>(null)
  const macdChartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const ma20SeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const ma50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdLineRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdSignalRef = useRef<ISeriesApi<'Line'> | null>(null)
  const macdHistRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const rawDataRef = useRef<any[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const pollingRef = useRef<NodeJS.Timeout | null>(null)

  // Derived
  const isPositive = stockInfo ? stockInfo.change >= 0 : true

  // ── Chart creation ──────────────────────────────────────────────────────

  const chartOptions = useMemo(() => ({
    layout: {
      background: { type: ColorType.Solid as const, color: 'transparent' },
      textColor: '#6b7280',
      fontSize: 11,
    },
    grid: {
      vertLines: { color: 'rgba(31,41,55,0.3)' },
      horzLines: { color: 'rgba(31,41,55,0.3)' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: 'rgba(99,102,241,0.4)', width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: '#4f46e5' },
      horzLine: { color: 'rgba(99,102,241,0.4)', width: 1 as const, style: LineStyle.Dashed, labelBackgroundColor: '#4f46e5' },
    },
    rightPriceScale: {
      borderColor: 'rgba(31,41,55,0.5)',
      scaleMargins: { top: 0.05, bottom: 0.15 },
    },
    timeScale: {
      borderColor: 'rgba(31,41,55,0.5)',
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      barSpacing: 8,
    },
    handleScroll: { vertTouchDrag: false },
  }), [])

  // Destroy all charts
  const destroyCharts = useCallback(() => {
    chartRef.current?.remove()
    rsiChartRef.current?.remove()
    macdChartRef.current?.remove()
    chartRef.current = null
    rsiChartRef.current = null
    macdChartRef.current = null
    candleSeriesRef.current = null
    lineSeriesRef.current = null
    areaSeriesRef.current = null
    volumeSeriesRef.current = null
    ma20SeriesRef.current = null
    ma50SeriesRef.current = null
    rsiSeriesRef.current = null
    macdLineRef.current = null
    macdSignalRef.current = null
    macdHistRef.current = null
  }, [])

  // Build / rebuild chart
  const buildChart = useCallback(() => {
    destroyCharts()
    const container = chartContainerRef.current
    if (!container) return

    const chart = createChart(container, {
      ...chartOptions,
      width: container.clientWidth,
      height: container.clientHeight,
    })
    chartRef.current = chart

    // ── Main series based on chartType ──
    if (chartType === 'candle') {
      const cs = chart.addCandlestickSeries({
        upColor: '#22c55e',
        downColor: '#ef4444',
        borderUpColor: '#22c55e',
        borderDownColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
      })
      candleSeriesRef.current = cs
    } else if (chartType === 'line') {
      const ls = chart.addLineSeries({
        color: '#3b82f6',
        lineWidth: 2,
        crosshairMarkerRadius: 4,
      })
      lineSeriesRef.current = ls
    } else {
      const as = chart.addAreaSeries({
        topColor: 'rgba(59,130,246,0.4)',
        bottomColor: 'rgba(59,130,246,0.02)',
        lineColor: '#3b82f6',
        lineWidth: 2,
        crosshairMarkerRadius: 4,
      })
      areaSeriesRef.current = as
    }

    // Volume
    if (showVolume) {
      const vs = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      })
      chart.priceScale('volume').applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 },
      })
      volumeSeriesRef.current = vs
    }

    // MA overlays
    if (showMA) {
      ma20SeriesRef.current = chart.addLineSeries({ color: '#f59e0b', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
      ma50SeriesRef.current = chart.addLineSeries({ color: '#8b5cf6', lineWidth: 1, priceLineVisible: false, lastValueVisible: false })
    }

    // RSI sub-chart
    if (showRSI && rsiContainerRef.current) {
      const rc = createChart(rsiContainerRef.current, {
        ...chartOptions,
        width: rsiContainerRef.current.clientWidth,
        height: rsiContainerRef.current.clientHeight,
        rightPriceScale: { ...chartOptions.rightPriceScale, scaleMargins: { top: 0.05, bottom: 0.05 } },
      })
      rsiChartRef.current = rc
      rsiSeriesRef.current = rc.addLineSeries({ color: '#06b6d4', lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: true })
    }

    // MACD sub-chart
    if (showMACD && macdContainerRef.current) {
      const mc = createChart(macdContainerRef.current, {
        ...chartOptions,
        width: macdContainerRef.current.clientWidth,
        height: macdContainerRef.current.clientHeight,
        rightPriceScale: { ...chartOptions.rightPriceScale, scaleMargins: { top: 0.1, bottom: 0.1 } },
      })
      macdChartRef.current = mc
      macdLineRef.current = mc.addLineSeries({ color: '#22c55e', lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false })
      macdSignalRef.current = mc.addLineSeries({ color: '#ef4444', lineWidth: 2 as const, priceLineVisible: false, lastValueVisible: false })
      macdHistRef.current = mc.addHistogramSeries({ priceFormat: { type: 'volume' } })
    }

    // Sync crosshairs between main, RSI, MACD
    const allCharts = [chart, rsiChartRef.current, macdChartRef.current].filter(Boolean) as IChartApi[]
    if (allCharts.length > 1) {
      allCharts.forEach((src) => {
        src.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (!range) return
          allCharts.forEach((dst) => { if (dst !== src) dst.timeScale().setVisibleLogicalRange(range) })
        })
      })
    }
  }, [chartOptions, chartType, showVolume, showMA, showRSI, showMACD, destroyCharts])

  // Push data into series
  const setData = useCallback((raw: any[]) => {
    if (!raw || raw.length === 0) return
    rawDataRef.current = raw

    const times: Time[] = raw.map(r => {
      const d = new Date(r.date)
      return (d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')) as Time
    })
    const closes = raw.map(r => r.close)

    // Main series
    if (candleSeriesRef.current) {
      const candles: CandlestickData[] = raw.map((r, i) => ({
        time: times[i], open: r.open, high: r.high, low: r.low, close: r.close,
      }))
      candleSeriesRef.current.setData(candles)
    }
    if (lineSeriesRef.current) {
      lineSeriesRef.current.setData(raw.map((r, i) => ({ time: times[i], value: r.close })) as LineData[])
    }
    if (areaSeriesRef.current) {
      areaSeriesRef.current.setData(raw.map((r, i) => ({ time: times[i], value: r.close })) as LineData[])
    }

    // Volume
    if (volumeSeriesRef.current) {
      volumeSeriesRef.current.setData(raw.map((r, i) => ({
        time: times[i],
        value: r.volume,
        color: r.close >= r.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)',
      })) as HistogramData[])
    }

    // MAs
    if (ma20SeriesRef.current) {
      const ma20 = calcSMA(closes, 20)
      ma20SeriesRef.current.setData(
        ma20.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as LineData[]
      )
    }
    if (ma50SeriesRef.current) {
      const ma50 = calcSMA(closes, 50)
      ma50SeriesRef.current.setData(
        ma50.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as LineData[]
      )
    }

    // RSI
    if (rsiSeriesRef.current) {
      const rsi = calcRSI(closes)
      rsiSeriesRef.current.setData(
        rsi.map((v, i) => v !== null ? { time: times[i], value: v } : null).filter(Boolean) as LineData[]
      )
    }

    // MACD
    if (macdLineRef.current && macdSignalRef.current && macdHistRef.current) {
      const { macd, signal, hist } = calcMACD(closes)
      macdLineRef.current.setData(macd.map((v, i) => ({ time: times[i], value: v })) as LineData[])
      macdSignalRef.current.setData(signal.map((v, i) => ({ time: times[i], value: v })) as LineData[])
      macdHistRef.current.setData(hist.map((v, i) => ({
        time: times[i], value: v, color: v >= 0 ? 'rgba(34,197,94,0.6)' : 'rgba(239,68,68,0.6)',
      })) as HistogramData[])
    }

    // Fit content
    chartRef.current?.timeScale().fitContent()
    rsiChartRef.current?.timeScale().fitContent()
    macdChartRef.current?.timeScale().fitContent()
  }, [])

  // ── Fetch data ──────────────────────────────────────────────────────────

  const fetchChartData = useCallback(async () => {
    setIsLoading(true)
    setNoData(false)
    try {
      const periodMap: Record<string, string> = {
        '1D': '5d', '1W': '1mo', '1M': '1mo', '3M': '3mo', '6M': '6mo', '1Y': '1y', 'ALL': 'max',
      }
      const res = await fetch(`${API_BASE}/api/screener/prices/${symbol}/history?period=${periodMap[timeframe] || '3mo'}`)
      const data = await res.json()

      if (data.success && data.history?.length > 0) {
        setData(data.history)
      } else {
        setNoData(true)
      }

      // Current price
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
          open: priceData.open,
        })
      }
      setLastUpdate(new Date())
    } catch (err) {
      console.error('Chart fetch error:', err)
      setNoData(true)
    }
    setIsLoading(false)
  }, [symbol, timeframe, setData])

  // ── Real-time polling ───────────────────────────────────────────────────

  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/screener/prices/${symbol}`)
        const d = await res.json()
        if (d.success) {
          setStockInfo(prev => prev ? { ...prev, price: d.price, change: d.change, change_percent: d.change_percent } : prev)
          setLastUpdate(new Date())
          setIsLive(true)

          // Update last candle
          const raw = rawDataRef.current
          if (raw.length > 0 && candleSeriesRef.current) {
            const last = { ...raw[raw.length - 1] }
            last.close = d.price
            last.high = Math.max(last.high, d.price)
            last.low = Math.min(last.low, d.price)
            raw[raw.length - 1] = last
            const dt = new Date(last.date)
            const t = (dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')) as Time
            candleSeriesRef.current.update({ time: t, open: last.open, high: last.high, low: last.low, close: last.close })
          }
        }
      } catch { setIsLive(false) }
    }, 15000)
  }, [symbol])

  // ── WebSocket ───────────────────────────────────────────────────────────

  // PR 56 — direct /ws/prices/* endpoint was never wired on the backend
  // (would have failed CSP + never connected). Chart falls back to the
  // 15-second polling loop for live price updates. ``isLive`` stays
  // false because there's no true push channel here.
  const connectWS = useCallback(() => {
    // intentional no-op; see comment above.
  }, [])

  // ── Resize handler ──────────────────────────────────────────────────────

  useEffect(() => {
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
      if (rsiContainerRef.current && rsiChartRef.current) {
        rsiChartRef.current.applyOptions({ width: rsiContainerRef.current.clientWidth })
      }
      if (macdContainerRef.current && macdChartRef.current) {
        macdChartRef.current.applyOptions({ width: macdContainerRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // ── Build chart when options change ─────────────────────────────────────

  useEffect(() => {
    // Small delay to let containers render
    const t = setTimeout(() => {
      buildChart()
      if (rawDataRef.current.length > 0) setData(rawDataRef.current)
    }, 50)
    return () => { clearTimeout(t); destroyCharts() }
  }, [buildChart, setData, destroyCharts])

  // ── Fetch on symbol/timeframe change ────────────────────────────────────

  useEffect(() => {
    fetchChartData()
    startPolling()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
      if (wsRef.current) wsRef.current.close()
    }
  }, [fetchChartData, startPolling])

  // ── Period change info ──────────────────────────────────────────────────

  const periodChange = useMemo(() => {
    const raw = rawDataRef.current
    if (raw.length < 2) return 0
    return ((raw[raw.length - 1].close - raw[0].close) / raw[0].close) * 100
  }, [rawDataRef.current.length])

  // ── Timeframes ──────────────────────────────────────────────────────────

  const timeframes = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
    { label: '6M', value: '6M' },
    { label: '1Y', value: '1Y' },
  ]

  // ── Main chart height calculation ───────────────────────────────────────

  const mainH = showRSI || showMACD ? '60%' : '100%'
  const subH = showRSI && showMACD ? '18%' : '35%'

  // ── Render ──────────────────────────────────────────────────────────────

  const chartContent = (
    <div className={`relative ${isModal ? '' : 'rounded-2xl border border-d-border/50'} bg-[#111520] overflow-hidden`}>
      {/* Ambient glow */}
      <div className={`absolute inset-0 opacity-20 pointer-events-none ${isPositive ? 'bg-gradient-to-t from-green-500/10 via-transparent' : 'bg-gradient-to-t from-red-500/10 via-transparent'}`} />

      {/* Header */}
      {showHeader && (
        <div className="relative z-10 px-6 py-4 border-b border-d-border/50">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Stock info */}
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPositive ? 'bg-up/20' : 'bg-down/20'}`}>
                  <Activity className={`w-5 h-5 ${isPositive ? 'text-up' : 'text-down'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-white">{symbol}</h2>
                    <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded-full font-medium">NSE</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isLive ? (
                      <span className="flex items-center gap-1 text-xs text-up">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-up opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-up" />
                        </span>
                        LIVE
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-yellow-500">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Updating...
                      </span>
                    )}
                    {lastUpdate && <span className="text-xs text-gray-500">{lastUpdate.toLocaleTimeString('en-IN')}</span>}
                  </div>
                </div>
              </div>

              {stockInfo && (
                <div className="flex items-center gap-4 pl-6 border-l border-d-border">
                  <div>
                    <span className="text-2xl font-bold text-white">
                      ₹{stockInfo.price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <div className={`flex items-center gap-1 text-sm font-semibold ${isPositive ? 'text-up' : 'text-down'}`}>
                      {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      {isPositive ? '+' : ''}{stockInfo.change?.toFixed(2)} ({stockInfo.change_percent?.toFixed(2)}%)
                    </div>
                  </div>
                  <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${periodChange >= 0 ? 'bg-up/20 text-up' : 'bg-down/20 text-down'}`}>
                    {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}% ({timeframe})
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Chart type */}
              <div className="flex items-center bg-white/[0.04] rounded-xl p-1">
                {([
                  { t: 'area' as const, Icon: BarChart3, tip: 'Area' },
                  { t: 'line' as const, Icon: LineChart, tip: 'Line' },
                  { t: 'candle' as const, Icon: CandlestickChart, tip: 'Candlestick' },
                ] as const).map(({ t, Icon, tip }) => (
                  <button key={t} onClick={() => setChartType(t)} title={tip}
                    className={`p-2 rounded-lg transition-all ${chartType === t ? 'bg-blue-600 text-white' : 'text-d-text-muted hover:text-white'}`}>
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>

              {/* Indicators */}
              <div className="flex items-center gap-1 bg-white/[0.04] rounded-xl p-1">
                {([
                  { on: showVolume, toggle: () => setShowVolume(!showVolume), Icon: Volume2, color: 'bg-purple-600' },
                  { on: showMA, toggle: () => setShowMA(!showMA), Icon: Target, color: 'bg-purple-600' },
                  { on: showRSI, toggle: () => setShowRSI(!showRSI), Icon: Gauge, color: 'bg-cyan-600' },
                  { on: showMACD, toggle: () => setShowMACD(!showMACD), Icon: Activity, color: 'bg-cyan-600' },
                ] as const).map(({ on, toggle, Icon, color }, i) => (
                  <button key={i} onClick={toggle}
                    className={`p-2 rounded-lg transition-all ${on ? `${color} text-white` : 'text-d-text-muted hover:text-white'}`}>
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>

              {/* Timeframes */}
              <div className="flex items-center bg-white/[0.04] rounded-xl p-1">
                {timeframes.map(tf => (
                  <button key={tf.value} onClick={() => setTimeframe(tf.value)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                      timeframe === tf.value ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25' : 'text-d-text-muted hover:text-white hover:bg-gray-700/50'
                    }`}>
                    {tf.label}
                  </button>
                ))}
              </div>

              <button onClick={fetchChartData} className="p-2 bg-white/[0.04] hover:bg-gray-700 rounded-xl transition-all" title="Refresh">
                <RefreshCw className={`w-4 h-4 text-d-text-muted ${isLoading ? 'animate-spin' : ''}`} />
              </button>

              {onClose && (
                <button onClick={onClose} className="p-2 bg-white/[0.04] hover:bg-down/20 hover:text-down rounded-xl transition-all text-d-text-muted">
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
                <div className="w-16 h-16 border-4 border-blue-500/20 rounded-full animate-pulse" />
                <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-t-blue-500 rounded-full animate-spin" />
              </div>
              <p className="text-d-text-muted mt-4 text-sm">Loading chart data...</p>
            </div>
          </div>
        ) : noData ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <AlertCircle className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-d-text-muted">No chart data available</p>
              <button onClick={fetchChartData}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition flex items-center gap-2 mx-auto">
                <RefreshCw className="w-4 h-4" /> Retry
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col p-2">
            <div style={{ height: mainH, minHeight: 0 }} ref={chartContainerRef} className="w-full" />
            {showRSI && (
              <div className="mt-1">
                <div className="text-[10px] text-gray-500 px-2 mb-0.5">RSI (14)</div>
                <div style={{ height: subH, minHeight: 60 }} ref={rsiContainerRef} className="w-full" />
              </div>
            )}
            {showMACD && (
              <div className="mt-1">
                <div className="text-[10px] text-gray-500 px-2 mb-0.5">MACD (12, 26, 9)</div>
                <div style={{ height: subH, minHeight: 60 }} ref={macdContainerRef} className="w-full" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="relative z-10 px-6 py-3 border-t border-d-border/50 flex items-center justify-between text-xs text-gray-500 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-yellow-500" />
            TradingView Charts &middot; Real-time NSE data
          </span>
          {showMA && (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-500 rounded" /> MA20</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-purple-500 rounded" /> MA50</span>
            </span>
          )}
          {showRSI && <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-cyan-500 rounded" /> RSI</span>}
          {showMACD && (
            <span className="flex items-center gap-2">
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-up rounded" /> MACD</span>
              <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-down rounded" /> Signal</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 ${isPositive ? 'text-up' : 'text-down'}`}>
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
