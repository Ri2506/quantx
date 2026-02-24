'use client'

import { useState, useEffect } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ShoppingCart,
  History,
  Trophy,
  RefreshCw,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  PieChart,
  AlertCircle,
  Check,
  X
} from 'lucide-react'

// ============================================================
// 📈 PAPER TRADING PAGE
// Practice trading with ₹10 Lakh virtual money!
// ============================================================

// Get API URL from environment
const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || ''

// Simple user state (in real app, use auth context)
const DEMO_USER_ID = 'demo-user-123' // Will be replaced with real auth

interface Holding {
  symbol: string
  quantity: number
  avg_price: number
  live_price: number
  invested: number
  current_value: number
  pnl: number
  pnl_percent: number
}

interface Order {
  id: string
  symbol: string
  action: 'BUY' | 'SELL'
  quantity: number
  price: number
  total_value: number
  status: string
  created_at: string
}

interface Portfolio {
  cash_balance: number
  holdings: Holding[]
  total_invested: number
  total_current_value: number
  total_pnl: number
  total_pnl_percent: number
  portfolio_value: number
}

interface StockPrice {
  symbol: string
  price: number
  name: string
  change: number
  change_percent: number
}

export default function PaperTradingPage() {
  // State
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'portfolio' | 'trade' | 'history' | 'leaderboard'>('portfolio')
  
  // Trade form state
  const [searchSymbol, setSearchSymbol] = useState('')
  const [stockPrice, setStockPrice] = useState<StockPrice | null>(null)
  const [tradeAction, setTradeAction] = useState<'BUY' | 'SELL'>('BUY')
  const [quantity, setQuantity] = useState(1)
  const [orderStatus, setOrderStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [orderLoading, setOrderLoading] = useState(false)

  // User registration (simple)
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [showRegister, setShowRegister] = useState(false)

  // Fetch portfolio on load
  useEffect(() => {
    // Check if user exists in localStorage
    const savedUserId = localStorage.getItem('swingai_user_id')
    if (savedUserId) {
      setUserId(savedUserId)
      fetchPortfolio(savedUserId)
      fetchOrders(savedUserId)
    } else {
      setShowRegister(true)
      setLoading(false)
    }
  }, [])

  // Register/Login user
  const handleRegister = async () => {
    if (!userEmail) return
    
    try {
      const res = await fetch(`${API_URL}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      })
      
      const data = await res.json()
      
      if (data.success && data.user) {
        localStorage.setItem('swingai_user_id', data.user.id)
        setUserId(data.user.id)
        setShowRegister(false)
        fetchPortfolio(data.user.id)
        fetchOrders(data.user.id)
      } else {
        setOrderStatus({ type: 'error', message: data.detail || 'Registration failed' })
      }
    } catch {
      setOrderStatus({ type: 'error', message: 'Could not connect to server' })
    }
  }

  // Fetch portfolio
  const fetchPortfolio = async (uid: string) => {
    try {
      const res = await fetch(`${API_URL}/api/paper/portfolio/${uid}`)
      const data = await res.json()
      setPortfolio(data)
    } catch (e) {
      console.error('Error fetching portfolio:', e)
    } finally {
      setLoading(false)
    }
  }

  // Fetch orders
  const fetchOrders = async (uid: string) => {
    try {
      const res = await fetch(`${API_URL}/api/paper/orders/${uid}`)
      const data = await res.json()
      setOrders(data.orders || [])
    } catch (e) {
      console.error('Error fetching orders:', e)
    }
  }

  // Search stock price
  const searchStock = async () => {
    if (!searchSymbol) return
    
    setSearchLoading(true)
    setStockPrice(null)
    
    try {
      const res = await fetch(`${API_URL}/api/paper/price/${searchSymbol.toUpperCase()}`)
      const data = await res.json()
      
      if (data.price) {
        setStockPrice(data)
      } else {
        setOrderStatus({ type: 'error', message: `Stock ${searchSymbol} not found` })
      }
    } catch {
      setOrderStatus({ type: 'error', message: 'Could not fetch stock price' })
    } finally {
      setSearchLoading(false)
    }
  }

  // Place order
  const placeOrder = async () => {
    if (!userId || !stockPrice || quantity <= 0) return
    
    setOrderLoading(true)
    setOrderStatus(null)
    
    try {
      const res = await fetch(`${API_URL}/api/paper/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          symbol: stockPrice.symbol,
          action: tradeAction,
          quantity: quantity,
          order_type: 'MARKET'
        })
      })
      
      const data = await res.json()
      
      if (data.success) {
        setOrderStatus({ 
          type: 'success', 
          message: `${tradeAction} order executed! ${quantity} shares of ${stockPrice.symbol} at ₹${data.executed_price}` 
        })
        // Refresh data
        fetchPortfolio(userId)
        fetchOrders(userId)
        // Reset form
        setQuantity(1)
      } else {
        setOrderStatus({ type: 'error', message: data.detail || 'Order failed' })
      }
    } catch {
      setOrderStatus({ type: 'error', message: 'Could not place order' })
    } finally {
      setOrderLoading(false)
    }
  }

  // Reset account
  const resetAccount = async () => {
    if (!userId) return
    if (!confirm('Are you sure? This will reset your balance to ₹10,00,000 and clear all holdings.')) return
    
    try {
      await fetch(`${API_URL}/api/paper/reset/${userId}`, { method: 'POST' })
      fetchPortfolio(userId)
      fetchOrders(userId)
      setOrderStatus({ type: 'success', message: 'Account reset successfully!' })
    } catch {
      setOrderStatus({ type: 'error', message: 'Could not reset account' })
    }
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(amount)
  }

  // Registration modal
  if (showRegister) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="bg-background-card border border-border rounded-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <TrendingUp className="w-8 h-8 text-accent" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">Start Paper Trading</h1>
            <p className="text-text-secondary">
              Practice trading with ₹10,00,000 virtual money. No real money involved!
            </p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Enter your email to start
              </label>
              <input
                type="email"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                placeholder="trader@example.com"
                className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent"
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
              />
            </div>
            
            <button
              onClick={handleRegister}
              disabled={!userEmail}
              className="w-full py-3 bg-accent hover:bg-accent/90 text-white font-semibold rounded-lg transition disabled:opacity-50"
            >
              Start Trading
            </button>
          </div>
          
          <p className="text-xs text-text-secondary text-center mt-4">
            This is paper trading only. No real money is used.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-accent animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background pb-8" data-testid="paper-trading-page">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-accent/20 via-primary/20 to-accent/20 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-center gap-2 text-sm">
            <AlertCircle className="w-4 h-4 text-accent" />
            <span className="text-text-primary font-medium">Paper Trading Mode</span>
            <span className="text-text-secondary">- Virtual money only, no real trades</span>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Portfolio Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-background-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-accent/15 rounded-lg">
                <Wallet className="w-5 h-5 text-accent" />
              </div>
              <span className="text-sm text-text-secondary">Portfolio Value</span>
            </div>
            <p className="text-2xl font-bold text-text-primary">
              {formatCurrency(portfolio?.portfolio_value || 0)}
            </p>
          </div>

          <div className="bg-background-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-success/15 rounded-lg">
                <DollarSign className="w-5 h-5 text-success" />
              </div>
              <span className="text-sm text-text-secondary">Cash Balance</span>
            </div>
            <p className="text-2xl font-bold text-text-primary">
              {formatCurrency(portfolio?.cash_balance || 0)}
            </p>
          </div>

          <div className="bg-background-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/15 rounded-lg">
                <PieChart className="w-5 h-5 text-primary" />
              </div>
              <span className="text-sm text-text-secondary">Invested</span>
            </div>
            <p className="text-2xl font-bold text-text-primary">
              {formatCurrency(portfolio?.total_invested || 0)}
            </p>
          </div>

          <div className="bg-background-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-2 rounded-lg ${(portfolio?.total_pnl || 0) >= 0 ? 'bg-success/15' : 'bg-danger/15'}`}>
                {(portfolio?.total_pnl || 0) >= 0 ? 
                  <ArrowUpRight className="w-5 h-5 text-success" /> : 
                  <ArrowDownRight className="w-5 h-5 text-danger" />
                }
              </div>
              <span className="text-sm text-text-secondary">Total P&L</span>
            </div>
            <p className={`text-2xl font-bold ${(portfolio?.total_pnl || 0) >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatCurrency(portfolio?.total_pnl || 0)}
              <span className="text-sm ml-2">
                ({portfolio?.total_pnl_percent?.toFixed(2) || 0}%)
              </span>
            </p>
          </div>
        </div>

        {/* Status Message */}
        {orderStatus && (
          <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
            orderStatus.type === 'success' ? 'bg-success/15 border border-success/30' : 'bg-danger/15 border border-danger/30'
          }`}>
            {orderStatus.type === 'success' ? 
              <Check className="w-5 h-5 text-success" /> : 
              <X className="w-5 h-5 text-danger" />
            }
            <span className={orderStatus.type === 'success' ? 'text-success' : 'text-danger'}>
              {orderStatus.message}
            </span>
            <button 
              onClick={() => setOrderStatus(null)}
              className="ml-auto text-text-secondary hover:text-text-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-border">
          {[
            { id: 'portfolio', label: 'Portfolio', icon: PieChart },
            { id: 'trade', label: 'Trade', icon: ShoppingCart },
            { id: 'history', label: 'History', icon: History },
            { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-3 font-medium transition border-b-2 -mb-[2px] ${
                activeTab === tab.id
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
              data-testid={`tab-${tab.id}`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
          
          <button
            onClick={resetAccount}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm text-danger hover:bg-danger/10 rounded-lg transition"
          >
            <RefreshCw className="w-4 h-4" />
            Reset Account
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'portfolio' && (
          <div className="bg-background-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Your Holdings</h2>
            </div>
            
            {portfolio?.holdings && portfolio.holdings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background">
                    <tr className="text-left text-sm text-text-secondary">
                      <th className="px-4 py-3">Stock</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Avg Price</th>
                      <th className="px-4 py-3 text-right">LTP</th>
                      <th className="px-4 py-3 text-right">Invested</th>
                      <th className="px-4 py-3 text-right">Current</th>
                      <th className="px-4 py-3 text-right">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings.map((holding) => (
                      <tr key={holding.symbol} className="border-t border-border hover:bg-background/50">
                        <td className="px-4 py-4">
                          <span className="font-medium text-text-primary">{holding.symbol}</span>
                        </td>
                        <td className="px-4 py-4 text-right text-text-primary">{holding.quantity}</td>
                        <td className="px-4 py-4 text-right text-text-secondary">₹{holding.avg_price.toFixed(2)}</td>
                        <td className="px-4 py-4 text-right text-text-primary">₹{holding.live_price.toFixed(2)}</td>
                        <td className="px-4 py-4 text-right text-text-secondary">{formatCurrency(holding.invested)}</td>
                        <td className="px-4 py-4 text-right text-text-primary">{formatCurrency(holding.current_value)}</td>
                        <td className={`px-4 py-4 text-right font-medium ${holding.pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                          {formatCurrency(holding.pnl)}
                          <span className="text-xs ml-1">({holding.pnl_percent.toFixed(2)}%)</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <PieChart className="w-12 h-12 text-text-secondary/30 mx-auto mb-4" />
                <p className="text-text-secondary">No holdings yet. Start trading!</p>
                <button
                  onClick={() => setActiveTab('trade')}
                  className="mt-4 px-6 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 transition"
                >
                  Place Your First Trade
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'trade' && (
          <div className="max-w-2xl mx-auto">
            <div className="bg-background-card border border-border rounded-xl p-6">
              <h2 className="text-lg font-semibold text-text-primary mb-6">Place Order</h2>
              
              {/* Stock Search */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-text-secondary mb-2">
                  Search Stock
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
                    <input
                      type="text"
                      value={searchSymbol}
                      onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                      placeholder="Enter stock symbol (e.g., RELIANCE, TCS)"
                      className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-lg text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-accent"
                      onKeyDown={(e) => e.key === 'Enter' && searchStock()}
                    />
                  </div>
                  <button
                    onClick={searchStock}
                    disabled={searchLoading || !searchSymbol}
                    className="px-6 py-3 bg-accent text-white rounded-lg hover:bg-accent/90 transition disabled:opacity-50"
                  >
                    {searchLoading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Search'}
                  </button>
                </div>
              </div>

              {/* Stock Price Card */}
              {stockPrice && (
                <div className="bg-background border border-border rounded-xl p-4 mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-xl font-bold text-text-primary">{stockPrice.symbol}</h3>
                      <p className="text-sm text-text-secondary">{stockPrice.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-text-primary">₹{stockPrice.price.toFixed(2)}</p>
                      <p className={`text-sm font-medium ${stockPrice.change >= 0 ? 'text-success' : 'text-danger'}`}>
                        {stockPrice.change >= 0 ? '+' : ''}{stockPrice.change.toFixed(2)} ({stockPrice.change_percent.toFixed(2)}%)
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Order Form */}
              {stockPrice && (
                <>
                  {/* Buy/Sell Toggle */}
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setTradeAction('BUY')}
                      className={`flex-1 py-3 rounded-lg font-semibold transition ${
                        tradeAction === 'BUY'
                          ? 'bg-success text-white'
                          : 'bg-background border border-border text-text-secondary hover:border-success hover:text-success'
                      }`}
                    >
                      <TrendingUp className="w-5 h-5 inline mr-2" />
                      BUY
                    </button>
                    <button
                      onClick={() => setTradeAction('SELL')}
                      className={`flex-1 py-3 rounded-lg font-semibold transition ${
                        tradeAction === 'SELL'
                          ? 'bg-danger text-white'
                          : 'bg-background border border-border text-text-secondary hover:border-danger hover:text-danger'
                      }`}
                    >
                      <TrendingDown className="w-5 h-5 inline mr-2" />
                      SELL
                    </button>
                  </div>

                  {/* Quantity */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-4 py-3 bg-background border border-border rounded-lg text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  {/* Order Summary */}
                  <div className="bg-background rounded-xl p-4 mb-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-text-secondary">Price per share</span>
                      <span className="text-text-primary">₹{stockPrice.price.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-text-secondary">Quantity</span>
                      <span className="text-text-primary">{quantity}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-text-secondary">Estimated charges</span>
                      <span className="text-text-primary">~₹{(stockPrice.price * quantity * 0.001).toFixed(2)}</span>
                    </div>
                    <div className="border-t border-border my-3"></div>
                    <div className="flex justify-between font-semibold">
                      <span className="text-text-primary">Total</span>
                      <span className="text-text-primary">
                        ₹{(stockPrice.price * quantity * (tradeAction === 'BUY' ? 1.001 : 0.999)).toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Place Order Button */}
                  <button
                    onClick={placeOrder}
                    disabled={orderLoading}
                    className={`w-full py-4 rounded-xl font-semibold text-white transition ${
                      tradeAction === 'BUY'
                        ? 'bg-success hover:bg-success/90'
                        : 'bg-danger hover:bg-danger/90'
                    } disabled:opacity-50`}
                    data-testid="place-order-btn"
                  >
                    {orderLoading ? (
                      <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      `${tradeAction} ${quantity} share${quantity > 1 ? 's' : ''} of ${stockPrice.symbol}`
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-background-card border border-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-border">
              <h2 className="text-lg font-semibold text-text-primary">Order History</h2>
            </div>
            
            {orders.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-background">
                    <tr className="text-left text-sm text-text-secondary">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Stock</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3 text-right">Qty</th>
                      <th className="px-4 py-3 text-right">Price</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id} className="border-t border-border hover:bg-background/50">
                        <td className="px-4 py-4 text-sm text-text-secondary">
                          {new Date(order.created_at).toLocaleDateString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </td>
                        <td className="px-4 py-4 font-medium text-text-primary">{order.symbol}</td>
                        <td className="px-4 py-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            order.action === 'BUY' ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                          }`}>
                            {order.action}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-text-primary">{order.quantity}</td>
                        <td className="px-4 py-4 text-right text-text-secondary">₹{order.price?.toFixed(2)}</td>
                        <td className="px-4 py-4 text-right text-text-primary">
                          {order.total_value ? formatCurrency(order.total_value) : '-'}
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 rounded text-xs font-medium bg-success/15 text-success">
                            {order.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center">
                <History className="w-12 h-12 text-text-secondary/30 mx-auto mb-4" />
                <p className="text-text-secondary">No orders yet</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="bg-background-card border border-border rounded-xl p-6">
            <div className="text-center py-12">
              <Trophy className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-text-primary mb-2">Leaderboard Coming Soon!</h2>
              <p className="text-text-secondary">
                Compete with other paper traders and see who has the best returns.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
