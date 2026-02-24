// ============================================================================
// SWINGAI - ADMIN USER DETAIL PAGE
// Detailed user view with trading settings and activity
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  User,
  Mail,
  Phone,
  Calendar,
  CreditCard,
  TrendingUp,
  TrendingDown,
  Settings,
  History,
  AlertCircle,
  Ban,
  UserX,
  UserCheck,
  RefreshCw,
} from 'lucide-react'
import { UserDetailResponse } from '@/types/admin'

export default function UserDetailPage() {
  const params = useParams()
  const router = useRouter()
  const userId = params.id as string

  const [userData, setUserData] = useState<UserDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'trades' | 'payments' | 'activity'>('overview')

  useEffect(() => {
    fetchUserDetail()
  }, [userId])

  const fetchUserDetail = async () => {
    try {
      setLoading(true)
      setError(null)

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/admin/users/${userId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (res.ok) {
        setUserData(await res.json())
      } else {
        // Use mock data for development
        setUserData(getMockUserDetail())
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
      setUserData(getMockUserDetail())
    } finally {
      setLoading(false)
    }
  }

  const getToken = () => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('sb-access-token') || ''
  }

  const getMockUserDetail = (): UserDetailResponse => ({
    user: {
      id: userId,
      email: 'rajesh.kumar@example.com',
      full_name: 'Rajesh Kumar',
      phone: '+91 98765 43210',
      capital: 500000,
      trading_mode: 'semi_auto',
      subscription_status: 'active',
      subscription_plan: 'Pro',
      broker_connected: true,
      broker_name: 'zerodha',
      total_trades: 145,
      winning_trades: 89,
      total_pnl: 47500,
      created_at: '2024-01-15T10:30:00Z',
      last_login: '2025-08-15T09:15:00Z',
      last_active: '2025-08-15T14:30:00Z',
      is_suspended: false,
      is_banned: false,
    },
    trading_settings: {
      risk_profile: 'moderate',
      risk_per_trade: 2.5,
      max_positions: 5,
      fo_enabled: true,
      preferred_option_type: 'put_options',
      daily_loss_limit: 3,
      weekly_loss_limit: 7,
      monthly_loss_limit: 15,
      trailing_sl_enabled: true,
    },
    recent_activity: [
      { action: 'trade_executed', timestamp: '2025-08-15T14:30:00Z', details: 'Executed LONG on RELIANCE' },
      { action: 'login', timestamp: '2025-08-15T09:15:00Z', details: 'Login from Chrome/Windows' },
      { action: 'settings_updated', timestamp: '2025-08-14T18:00:00Z', details: 'Updated risk_per_trade' },
    ],
    payment_history: [
      { id: '1', amount: 199900, status: 'completed', created_at: '2025-07-15T10:00:00Z', subscription_plans: { display_name: 'Pro' } },
      { id: '2', amount: 199900, status: 'completed', created_at: '2025-06-15T10:00:00Z', subscription_plans: { display_name: 'Pro' } },
    ],
    positions: [
      { id: '1', symbol: 'RELIANCE', direction: 'LONG', quantity: 50, average_price: 2450, current_price: 2485, unrealized_pnl: 1750 },
      { id: '2', symbol: 'TCS', direction: 'LONG', quantity: 25, average_price: 3650, current_price: 3620, unrealized_pnl: -750 },
    ],
    trades: [
      { id: '1', symbol: 'INFY', direction: 'LONG', quantity: 100, entry_price: 1450, exit_price: 1495, net_pnl: 4500, status: 'closed', closed_at: '2025-08-14T15:00:00Z' },
      { id: '2', symbol: 'HDFC', direction: 'SHORT', quantity: 30, entry_price: 1680, exit_price: 1650, net_pnl: 900, status: 'closed', closed_at: '2025-08-13T14:30:00Z' },
    ],
  })

  const handleResetSubscription = async () => {
    const newStatus = prompt('Enter new subscription status (free, trial, active):')
    if (!newStatus || !['free', 'trial', 'active'].includes(newStatus)) {
      alert('Invalid status')
      return
    }

    const reason = prompt('Enter reason for reset:')
    if (!reason) return

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/admin/users/${userId}/reset-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ new_status: newStatus, reason }),
      })

      if (res.ok) {
        alert('Subscription reset successfully')
        fetchUserDetail()
      } else {
        alert('Failed to reset subscription')
      }
    } catch (err) {
      console.error('Reset error:', err)
      alert('Failed to reset subscription')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500"></div>
      </div>
    )
  }

  if (!userData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <p className="text-white text-lg">User not found</p>
        <Link href="/admin/users" className="text-red-500 hover:text-red-400 mt-2 inline-block">
          Back to Users
        </Link>
      </div>
    )
  }

  const { user, trading_settings, recent_activity, payment_history, positions, trades } = userData

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/admin/users"
          className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-400" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{user.full_name || 'User'}</h1>
          <p className="text-gray-400">{user.email}</p>
        </div>
        <button
          onClick={fetchUserDetail}
          className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Status Banner */}
      {(user.is_suspended || user.is_banned) && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 ${
            user.is_banned ? 'bg-red-500/10 border border-red-500/30' : 'bg-yellow-500/10 border border-yellow-500/30'
          }`}
        >
          {user.is_banned ? (
            <Ban className="w-5 h-5 text-red-500" />
          ) : (
            <UserX className="w-5 h-5 text-yellow-500" />
          )}
          <span className={user.is_banned ? 'text-red-400' : 'text-yellow-400'}>
            This user is {user.is_banned ? 'BANNED' : 'SUSPENDED'}
          </span>
        </div>
      )}

      {/* User Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Basic Info */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Basic Info</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-gray-500" />
              <span className="text-gray-300">{user.email}</span>
            </div>
            {user.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-gray-500" />
                <span className="text-gray-300">{user.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-gray-300">
                Joined {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard className="w-4 h-4 text-gray-500" />
              <span className="text-gray-300">
                {user.subscription_plan || user.subscription_status}
              </span>
            </div>
          </div>
        </div>

        {/* Trading Stats */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Trading Stats</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-400">Capital</span>
              <span className="text-white font-medium">₹{user.capital.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Trades</span>
              <span className="text-white font-medium">{user.total_trades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Win Rate</span>
              <span className="text-white font-medium">
                {user.total_trades > 0
                  ? ((user.winning_trades / user.total_trades) * 100).toFixed(1)
                  : 0}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total P&L</span>
              <span className={`font-medium ${user.total_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {user.total_pnl >= 0 ? '+' : ''}₹{user.total_pnl.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Trading Settings */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Trading Settings</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Mode</span>
              <span className="text-white capitalize">{user.trading_mode.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Risk Profile</span>
              <span className="text-white capitalize">{trading_settings.risk_profile}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Risk/Trade</span>
              <span className="text-white">{trading_settings.risk_per_trade}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">F&O Enabled</span>
              <span className={trading_settings.fo_enabled ? 'text-green-500' : 'text-gray-500'}>
                {trading_settings.fo_enabled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Broker</span>
              <span className="text-white capitalize">
                {user.broker_connected ? user.broker_name : 'Not connected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Admin Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleResetSubscription}
            className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm font-medium transition-colors"
          >
            Reset Subscription
          </button>
          {!user.is_banned && (
            <>
              {user.is_suspended ? (
                <button className="px-4 py-2 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-sm font-medium transition-colors">
                  Unsuspend User
                </button>
              ) : (
                <button className="px-4 py-2 bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30 rounded-lg text-yellow-400 text-sm font-medium transition-colors">
                  Suspend User
                </button>
              )}
              <button className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium transition-colors">
                Ban User
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-800">
        <div className="flex gap-4">
          {['overview', 'trades', 'payments', 'activity'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-red-500 text-red-500'
                  : 'border-transparent text-gray-400 hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6">
        {activeTab === 'overview' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Active Positions</h3>
            {positions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase">
                      <th className="pb-3">Symbol</th>
                      <th className="pb-3">Direction</th>
                      <th className="pb-3">Qty</th>
                      <th className="pb-3">Avg Price</th>
                      <th className="pb-3">Current</th>
                      <th className="pb-3">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {positions.map((pos: any) => (
                      <tr key={pos.id}>
                        <td className="py-3 text-white font-medium">{pos.symbol}</td>
                        <td className={`py-3 ${pos.direction === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>
                          {pos.direction}
                        </td>
                        <td className="py-3 text-gray-300">{pos.quantity}</td>
                        <td className="py-3 text-gray-300">₹{pos.average_price}</td>
                        <td className="py-3 text-gray-300">₹{pos.current_price}</td>
                        <td className={`py-3 font-medium ${pos.unrealized_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {pos.unrealized_pnl >= 0 ? '+' : ''}₹{pos.unrealized_pnl}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No active positions</p>
            )}
          </div>
        )}

        {activeTab === 'trades' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Recent Trades</h3>
            {trades.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase">
                      <th className="pb-3">Symbol</th>
                      <th className="pb-3">Direction</th>
                      <th className="pb-3">Qty</th>
                      <th className="pb-3">Entry</th>
                      <th className="pb-3">Exit</th>
                      <th className="pb-3">P&L</th>
                      <th className="pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {trades.map((trade: any) => (
                      <tr key={trade.id}>
                        <td className="py-3 text-white font-medium">{trade.symbol}</td>
                        <td className={`py-3 ${trade.direction === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>
                          {trade.direction}
                        </td>
                        <td className="py-3 text-gray-300">{trade.quantity}</td>
                        <td className="py-3 text-gray-300">₹{trade.entry_price}</td>
                        <td className="py-3 text-gray-300">₹{trade.exit_price}</td>
                        <td className={`py-3 font-medium ${trade.net_pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {trade.net_pnl >= 0 ? '+' : ''}₹{trade.net_pnl}
                        </td>
                        <td className="py-3 text-gray-500 text-sm">
                          {trade.closed_at ? new Date(trade.closed_at).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500">No trades found</p>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Payment History</h3>
            {payment_history.length > 0 ? (
              <div className="space-y-3">
                {payment_history.map((payment: any) => (
                  <div key={payment.id} className="flex justify-between items-center p-4 bg-gray-800/50 rounded-lg">
                    <div>
                      <p className="text-white font-medium">
                        {payment.subscription_plans?.display_name || 'Payment'}
                      </p>
                      <p className="text-gray-500 text-sm">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-medium">₹{(payment.amount / 100).toLocaleString()}</p>
                      <p className={`text-xs ${payment.status === 'completed' ? 'text-green-500' : 'text-yellow-500'}`}>
                        {payment.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No payments found</p>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
            {recent_activity.length > 0 ? (
              <div className="space-y-3">
                {recent_activity.map((activity: any, i: number) => (
                  <div key={i} className="flex items-start gap-4 p-4 bg-gray-800/50 rounded-lg">
                    <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                      <History className="w-5 h-5 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white">{activity.details}</p>
                      <p className="text-gray-500 text-sm capitalize">{activity.action.replace('_', ' ')}</p>
                    </div>
                    <p className="text-gray-500 text-sm">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No activity found</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
