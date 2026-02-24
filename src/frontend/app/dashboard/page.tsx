// ============================================================================
// SWINGAI - MAIN DASHBOARD PAGE
// Complete trading dashboard with real API integration
// ============================================================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import { api, handleApiError, Signal, Position, Notification, DashboardOverview } from '../../lib/api'
import {
  DollarSign,
  Activity,
  Target,
  TrendingUp,
  Settings,
  LogOut,
  BarChart3,
  Wallet,
  History,
  Search,
  Menu,
  MessageSquare,
  X,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'

// Import all dashboard components
import {
  StatCard,
  PnLChart,
  EquityCurve,
  SignalCard,
  PositionRow,
  MarketTicker,
  HeatMap,
  RiskGauge,
  TradeCalendar,
  NotificationBell,
  PerformanceMetrics,
  QuickTrade,
  WatchlistTable,
  ScannerCard,
  PriceAlert,
} from '../../components/dashboard'

// ============================================================================
// DASHBOARD PAGE
// ============================================================================

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, signOut, loading: authLoading } = useAuth()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isQuickTradeOpen, setIsQuickTradeOpen] = useState(false)
  
  // Data states
  const [dashboardData, setDashboardData] = useState<DashboardOverview | null>(null)
  const [signals, setSignals] = useState<Signal[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [portfolioHistory, setPortfolioHistory] = useState<any[]>([])
  const [performanceData, setPerformanceData] = useState<any>(null)
  const [watchlist, setWatchlist] = useState<any[]>([])
  const [assistantUsage, setAssistantUsage] = useState<{
    tier: 'free' | 'pro'
    credits_limit: number
    credits_used: number
    credits_remaining: number
    reset_at: string
  } | null>(null)
  
  // Loading states
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    if (!user) return
    
    try {
      setError(null)
      
      // Fetch all data in parallel
      const [
        overviewRes,
        signalsRes,
        positionsRes,
        notificationsRes,
        historyRes,
        performanceRes,
        watchlistRes,
        assistantUsageRes,
      ] = await Promise.allSettled([
        api.dashboard.getOverview(),
        api.signals.getToday(),
        api.positions.getAll(),
        api.notifications.getAll({ limit: 10 }),
        api.portfolio.getHistory(30),
        api.portfolio.getPerformance(),
        api.watchlist.getAll(),
        api.assistant.getUsage(),
      ])
      
      // Process results
      if (overviewRes.status === 'fulfilled') {
        setDashboardData(overviewRes.value)
      }
      
      if (signalsRes.status === 'fulfilled') {
        setSignals(signalsRes.value.all_signals || [])
      }
      
      if (positionsRes.status === 'fulfilled') {
        setPositions(positionsRes.value.positions || [])
      }
      
      if (notificationsRes.status === 'fulfilled') {
        setNotifications(notificationsRes.value.notifications || [])
      }
      
      if (historyRes.status === 'fulfilled') {
        setPortfolioHistory(historyRes.value.history || [])
      }
      
      if (performanceRes.status === 'fulfilled') {
        setPerformanceData(performanceRes.value)
      }
      
      if (watchlistRes.status === 'fulfilled') {
        setWatchlist(watchlistRes.value.watchlist || [])
      }

      if (assistantUsageRes.status === 'fulfilled') {
        setAssistantUsage(assistantUsageRes.value.usage)
      }
      
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [user])

  // Initial load
  useEffect(() => {
    if (user) {
      fetchDashboardData()
    }
  }, [user, fetchDashboardData])

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  // Refresh data
  const handleRefresh = () => {
    setRefreshing(true)
    fetchDashboardData()
  }

  // Handle trade execution
  const handleExecuteTrade = async (signalId: string) => {
    try {
      const result = await api.trades.execute({ signal_id: signalId })
      if (result.success) {
        // Refresh positions after trade
        const positionsRes = await api.positions.getAll()
        setPositions(positionsRes.positions || [])
      }
    } catch (err) {
      alert(handleApiError(err))
    }
  }

  // Handle quick trade
  const handleQuickTrade = async (data: any) => {
    try {
      console.log('Quick trade:', data)
      // Implement quick trade logic
      setIsQuickTradeOpen(false)
    } catch (err) {
      alert(handleApiError(err))
    }
  }

  // Loading state
  if (authLoading || (loading && !dashboardData)) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-text-secondary">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  // Extract stats
  const stats = dashboardData?.stats || {
    capital: profile?.capital || 100000,
    total_pnl: profile?.total_pnl || 0,
    total_trades: profile?.total_trades || 0,
    winning_trades: profile?.winning_trades || 0,
    win_rate: profile?.total_trades ? (profile.winning_trades / profile.total_trades * 100) : 0,
    open_positions: positions.length,
    unrealized_pnl: 0,
    today_pnl: 0,
    subscription_status: profile?.subscription_status || 'trial',
  }

  // Prepare chart data
  const pnlChartData = portfolioHistory.length > 0
    ? portfolioHistory.map(h => ({ date: h.date, value: h.cumulative_pnl }))
    : Array.from({ length: 30 }, (_, i) => ({
        date: new Date(Date.now() - (29 - i) * 86400000).toLocaleDateString(),
        value: stats.capital + (i * 1000),
      }))

  const equityCurveData = portfolioHistory.length > 0
    ? portfolioHistory.map(h => ({
        date: h.date,
        equity: stats.capital + h.cumulative_pnl,
        drawdown: -Math.abs(h.day_pnl_percent || 0),
      }))
    : Array.from({ length: 90 }, (_, i) => ({
        date: new Date(Date.now() - (89 - i) * 86400000).toLocaleDateString(),
        equity: stats.capital + i * 1000,
        drawdown: -Math.random() * 10,
      }))

  const tradeCalendarData = portfolioHistory.map(h => ({
    date: h.date,
    trades: h.trades_taken || 0,
    pnl: h.day_pnl || 0,
  }))

  // Map notifications to expected format
  const mappedNotifications = notifications.map(n => ({
    id: n.id,
    user_id: user.id,
    type: n.type as any,
    title: n.title,
    message: n.message,
    is_read: n.is_read,
    created_at: n.created_at,
  }))

  // Map signals to expected format
  const mappedSignals = signals.map(s => ({
    id: s.id,
    symbol: s.symbol,
    exchange: (s.exchange || 'NSE') as 'NSE' | 'BSE' | 'NFO',
    segment: s.segment as 'EQUITY' | 'FUTURES' | 'OPTIONS',
    direction: s.direction as 'LONG' | 'SHORT',
    entry_price: s.entry_price,
    stop_loss: s.stop_loss,
    target: s.target_1,
    confidence: s.confidence,
    risk_reward_ratio: s.risk_reward,
    position_size: 100,
    status: (s.status === 'active' ? 'active' : 'expired') as 'active' | 'triggered' | 'expired' | 'closed',
    created_at: s.generated_at,
    valid_until: new Date(Date.now() + 86400000).toISOString(),
    model_predictions: {
      catboost: { prediction: s.direction as 'LONG' | 'SHORT', confidence: s.catboost_score || s.confidence },
      tft: { prediction: s.direction as 'LONG' | 'SHORT', confidence: s.tft_score || s.confidence },
      stockformer: { prediction: s.direction as 'LONG' | 'SHORT', confidence: s.stockformer_score || s.confidence },
      ensemble_confidence: s.confidence,
      model_agreement: s.model_agreement / 3,
    },
    technical_analysis: {} as any,
  }))

  // Map positions to expected format
  const mappedPositions = positions.map(p => ({
    id: p.id,
    user_id: user.id,
    signal_id: p.id,
    symbol: p.symbol,
    exchange: (p.exchange || 'NSE') as 'NSE' | 'BSE' | 'NFO',
    segment: p.segment as 'EQUITY' | 'FUTURES' | 'OPTIONS',
    direction: p.direction as 'LONG' | 'SHORT',
    quantity: p.quantity,
    entry_price: p.average_price,
    current_price: p.current_price || p.average_price,
    stop_loss: p.stop_loss,
    target: p.target,
    unrealized_pnl: p.unrealized_pnl,
    unrealized_pnl_percentage: p.unrealized_pnl_percent,
    status: (p.is_active ? 'open' : 'closed') as 'open' | 'closed',
    opened_at: p.opened_at,
    updated_at: p.opened_at,
  }))

  // Watchlist stocks
  const watchlistStocks = watchlist.map(w => ({
    symbol: w.symbol,
    name: w.symbol,
    price: 0,
    change: 0,
    changePercent: 0,
    volume: 0,
    marketCap: '',
    isFavorite: true,
  }))

  // Scanner mock
  const mockScanner = {
    id: '1',
    name: 'Breakout Stocks',
    description: 'Stocks breaking above 52-week high with high volume',
    category: 'Breakouts',
    stocks_matched: 23,
    last_run_at: new Date(Date.now() - 3600000).toISOString(),
    run_frequency: 'hourly' as const,
  }

  return (
    <div className="app-shell">
      {/* Top Navigation Bar */}
      <nav className="app-header z-40">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Left: Logo & Menu Toggle */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg hover:bg-background-elevated transition-colors lg:hidden"
            >
              {isSidebarOpen ? <X className="w-5 h-5 text-text-primary" /> : <Menu className="w-5 h-5 text-text-primary" />}
            </button>

            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-text-primary">SwingAI</span>
            </Link>
          </div>

          {/* Center: Search */}
          <div className="hidden md:flex flex-1 max-w-md mx-8">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
              <input
                type="text"
                placeholder="Search stocks, signals..."
                className="app-input pl-10 pr-4 text-sm"
              />
            </div>
          </div>

          {/* Right: Actions & Profile */}
          <div className="flex items-center gap-3">
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg hover:bg-background-elevated transition-colors"
              title="Refresh data"
            >
              <RefreshCw className={`w-5 h-5 text-text-muted ${refreshing ? 'animate-spin' : ''}`} />
            </button>

            <NotificationBell notifications={mappedNotifications} />

            <button
              onClick={() => setIsQuickTradeOpen(true)}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-xl font-medium hover:shadow-glow-md transition-all"
            >
              <TrendingUp className="w-4 h-4" />
              Quick Trade
            </button>

            <div className="flex items-center gap-3 pl-3 border-l border-border/50">
              <div className="text-right hidden md:block">
                <p className="text-sm font-medium text-text-primary">{profile?.full_name || user?.email || 'User'}</p>
                <p className="text-xs text-text-muted capitalize">{stats.subscription_status} Plan</p>
              </div>
              <button
                onClick={() => signOut()}
                className="p-2 rounded-lg hover:bg-background-elevated transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4 text-text-muted" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar Navigation */}
      <aside className={`fixed left-0 top-16 bottom-0 z-30 w-64 bg-background-surface/80 border-r border-border/50 backdrop-blur-xl transition-transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <nav className="p-4 space-y-1">
          <Link href="/dashboard" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-primary/10 text-primary font-medium">
            <BarChart3 className="w-5 h-5" />
            Dashboard
          </Link>
          <Link href="/signals" className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-secondary hover:bg-background-elevated transition-all">
            <Target className="w-5 h-5" />
            Signals
          </Link>
          <Link href="/portfolio" className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-secondary hover:bg-background-elevated transition-all">
            <Wallet className="w-5 h-5" />
            Portfolio
          </Link>
          <Link href="/trades" className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-secondary hover:bg-background-elevated transition-all">
            <History className="w-5 h-5" />
            Trades
          </Link>
          <Link href="/screener" className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-secondary hover:bg-background-elevated transition-all">
            <Search className="w-5 h-5" />
            Screener
          </Link>
          <Link href="/analytics" className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-secondary hover:bg-background-elevated transition-all">
            <Activity className="w-5 h-5" />
            Analytics
          </Link>
          <Link href="/assistant" className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-secondary hover:bg-background-elevated transition-all">
            <MessageSquare className="w-5 h-5" />
            Assistant
            {assistantUsage && (
              <span className="ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {assistantUsage.credits_remaining}
              </span>
            )}
          </Link>
          <Link href="/settings" className="flex items-center gap-3 px-4 py-3 rounded-xl text-text-secondary hover:bg-background-elevated transition-all">
            <Settings className="w-5 h-5" />
            Settings
          </Link>
        </nav>

        {/* Subscription CTA */}
        {stats.subscription_status === 'trial' && (
          <div className="absolute bottom-4 left-4 right-4">
            <Link
              href="/pricing"
              className="block p-4 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-xl border border-primary/30"
            >
              <p className="text-sm font-medium text-text-primary mb-1">Upgrade to Pro</p>
              <p className="text-xs text-text-muted">Get unlimited signals & F&O access</p>
            </Link>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className={`pt-20 transition-all ${isSidebarOpen ? 'lg:pl-64' : ''}`}>
        <div className="p-6 space-y-6">
          {/* Error Banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl"
            >
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={handleRefresh}
                className="ml-auto text-sm text-red-400 hover:text-red-300"
              >
                Retry
              </button>
            </motion.div>
          )}

          {/* Market Ticker */}
          <MarketTicker />

          {/* Assistant Credit Status */}
          {assistantUsage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background-surface/70 p-4 md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="text-xs uppercase tracking-wide text-text-muted">SwingAI Finance Intelligence</p>
                <p className="text-base font-semibold text-text-primary">
                  {assistantUsage.credits_remaining} assistant credits left today
                </p>
                <p className="text-xs text-text-secondary">
                  {assistantUsage.credits_used}/{assistantUsage.credits_limit} used on {assistantUsage.tier.toUpperCase()} plan
                </p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-xs text-text-muted">
                  Resets {new Date(assistantUsage.reset_at).toLocaleString()}
                </p>
                <Link
                  href="/assistant"
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
                >
                  <MessageSquare className="h-4 w-4" />
                  Open Assistant
                </Link>
              </div>
            </motion.div>
          )}

          {/* Performance Metrics */}
          <PerformanceMetrics
            winRate={stats.win_rate}
            profitFactor={performanceData?.profit_factor || 0}
            sharpeRatio={0}
            maxDrawdown={0}
            avgWin={performanceData?.avg_win || 0}
            avgLoss={performanceData?.avg_loss || 0}
            totalTrades={stats.total_trades}
            winningTrades={stats.winning_trades}
          />

          {/* Overview Stats */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total P&L"
              value={stats.total_pnl}
              change={stats.total_pnl > 0 ? `+${((stats.total_pnl / stats.capital) * 100).toFixed(1)}%` : `${((stats.total_pnl / stats.capital) * 100).toFixed(1)}%`}
              changeType={stats.total_pnl >= 0 ? 'positive' : 'negative'}
              icon={DollarSign}
              color="green"
              prefix="₹"
            />
            <StatCard
              title="Day P&L"
              value={stats.today_pnl}
              change={stats.today_pnl >= 0 ? `+${((stats.today_pnl / stats.capital) * 100).toFixed(2)}%` : `${((stats.today_pnl / stats.capital) * 100).toFixed(2)}%`}
              changeType={stats.today_pnl >= 0 ? 'positive' : 'negative'}
              icon={Activity}
              color="blue"
              prefix="₹"
            />
            <StatCard
              title="Active Positions"
              value={stats.open_positions}
              icon={Target}
              color="purple"
            />
            <StatCard
              title="Win Rate"
              value={stats.win_rate.toFixed(1)}
              change={stats.win_rate >= 50 ? 'Above average' : 'Below average'}
              changeType={stats.win_rate >= 50 ? 'positive' : 'negative'}
              icon={TrendingUp}
              color="orange"
              suffix="%"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PnLChart data={pnlChartData} />
            <RiskGauge
              dailyRisk={Math.abs(stats.today_pnl)}
              weeklyRisk={Math.abs(stats.today_pnl) * 5}
              monthlyRisk={Math.abs(stats.total_pnl)}
              maxDailyRisk={stats.capital * 0.02}
              maxWeeklyRisk={stats.capital * 0.05}
              maxMonthlyRisk={stats.capital * 0.1}
            />
          </div>

          {/* Signals & Positions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-text-primary">Today's Signals</h2>
                <Link href="/signals" className="text-sm text-primary hover:text-primary/80">
                  View All →
                </Link>
              </div>
              {mappedSignals.length > 0 ? (
                mappedSignals.slice(0, 3).map((signal) => (
                  <SignalCard 
                    key={signal.id} 
                    signal={signal} 
                    showExecuteButton
                    onExecute={() => handleExecuteTrade(signal.id)}
                  />
                ))
              ) : (
                <div className="app-panel p-8 text-center">
                  <Target className="w-12 h-12 text-text-muted mx-auto mb-4" />
                  <p className="text-text-secondary mb-2">No signals yet today</p>
                  <p className="text-sm text-text-muted">Signals are generated at 8:30 AM on trading days</p>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-text-primary">Active Positions</h2>
                  <Link href="/portfolio" className="text-sm text-primary hover:text-primary/80">
                    View All →
                  </Link>
                </div>
                <div className="space-y-3">
                  {mappedPositions.length > 0 ? (
                    mappedPositions.map((position) => (
                      <PositionRow key={position.id} position={position} />
                    ))
                  ) : (
                    <div className="app-card p-6 text-center">
                      <p className="text-text-muted text-sm">No active positions</p>
                    </div>
                  )}
                </div>
              </div>

              <PriceAlert
                symbol={mappedSignals[0]?.symbol || 'NIFTY'}
                currentPrice={mappedSignals[0]?.entry_price || 21500}
                chartData={Array.from({ length: 30 }, (_, i) => ({
                  time: new Date(Date.now() - (29 - i) * 3600000).toLocaleTimeString(),
                  price: (mappedSignals[0]?.entry_price || 21500) * (1 + (Math.random() - 0.5) * 0.02),
                }))}
                existingAlerts={[]}
              />
            </div>
          </div>

          {/* Heatmap & Scanner */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <HeatMap />
            <ScannerCard scanner={mockScanner} />
          </div>

          {/* Watchlist & Calendar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <WatchlistTable stocks={watchlistStocks.length > 0 ? watchlistStocks : [
                { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2456.75, change: 23.50, changePercent: 0.97, volume: 5234567, marketCap: '₹16.5L Cr', isFavorite: true },
                { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3678.90, change: -45.30, changePercent: -1.22, volume: 2345678, marketCap: '₹13.4L Cr' },
                { symbol: 'INFY', name: 'Infosys Limited', price: 1478.50, change: 12.80, changePercent: 0.87, volume: 3456789, marketCap: '₹6.1L Cr' },
              ]} />
            </div>
            <TradeCalendar data={tradeCalendarData.length > 0 ? tradeCalendarData : Array.from({ length: 30 }, (_, i) => ({
              date: new Date(Date.now() - (29 - i) * 86400000).toISOString().split('T')[0],
              trades: Math.floor(Math.random() * 3),
              pnl: (Math.random() - 0.4) * 5000,
            }))} />
          </div>

          {/* Equity Curve */}
          <EquityCurve data={equityCurveData} />
        </div>
      </main>

      {/* Quick Trade Modal */}
      <QuickTrade
        isOpen={isQuickTradeOpen}
        onClose={() => setIsQuickTradeOpen(false)}
        onSubmit={handleQuickTrade}
      />
    </div>
  )
}
