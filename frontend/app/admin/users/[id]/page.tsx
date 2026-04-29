// ============================================================================
// QUANT X - ADMIN USER DETAIL PAGE
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
import { api, handleApiError } from '@/lib/api'

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

      const data = await api.admin.getUser(userId) as unknown as UserDetailResponse
      if (data) {
        setUserData(data)
      } else {
        setError('Failed to fetch user details')
      }
    } catch (err) {
      console.error('Failed to fetch user:', err)
      setError('Failed to connect to backend')
    } finally {
      setLoading(false)
    }
  }

  const handleResetSubscription = async () => {
    const newStatus = prompt('Enter new subscription status (free, trial, active):')
    if (!newStatus || !['free', 'trial', 'active'].includes(newStatus)) {
      alert('Invalid status')
      return
    }

    const reason = prompt('Enter reason for reset:')
    if (!reason) return

    try {
      await api.admin.resetSubscription(userId)
      alert('Subscription reset successfully')
      fetchUserDetail()
    } catch (err) {
      console.error('Reset error:', err)
      alert('Failed to reset subscription')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-down"></div>
      </div>
    )
  }

  if (!userData) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-down mx-auto mb-4" />
        <p className="text-white text-lg">User not found</p>
        <Link href="/admin/users" className="text-down hover:text-down mt-2 inline-block">
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
          className="p-2 bg-d-bg-elevated hover:bg-white/[0.06] rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-d-text-muted" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{user.full_name || 'User'}</h1>
          <p className="text-d-text-muted">{user.email}</p>
        </div>
        <button
          onClick={fetchUserDetail}
          className="p-2 bg-d-bg-elevated hover:bg-white/[0.06] rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-d-text-muted" />
        </button>
      </div>

      {/* Status Banner */}
      {(user.is_suspended || user.is_banned) && (
        <div
          className={`p-4 rounded-xl flex items-center gap-3 ${
            user.is_banned ? 'bg-down/10 border border-down/20' : 'bg-warning/10 border border-warning/20'
          }`}
        >
          {user.is_banned ? (
            <Ban className="w-5 h-5 text-down" />
          ) : (
            <UserX className="w-5 h-5 text-warning" />
          )}
          <span className={user.is_banned ? 'text-down' : 'text-warning'}>
            This user is {user.is_banned ? 'BANNED' : 'SUSPENDED'}
          </span>
        </div>
      )}

      {/* User Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Basic Info */}
        <div className="bg-d-bg-card rounded-2xl border border-d-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Basic Info</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-d-text-muted" />
              <span className="text-white/70">{user.email}</span>
            </div>
            {user.phone && (
              <div className="flex items-center gap-3">
                <Phone className="w-4 h-4 text-d-text-muted" />
                <span className="text-white/70">{user.phone}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-d-text-muted" />
              <span className="text-white/70">
                Joined {new Date(user.created_at).toLocaleDateString()}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CreditCard className="w-4 h-4 text-d-text-muted" />
              <span className="text-white/70">
                {user.subscription_plan || user.subscription_status}
              </span>
            </div>
          </div>
        </div>

        {/* Trading Stats */}
        <div className="bg-d-bg-card rounded-2xl border border-d-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Trading Stats</h3>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-d-text-muted">Capital</span>
              <span className="text-white font-medium font-mono num-display">₹{user.capital.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-d-text-muted">Total Trades</span>
              <span className="text-white font-medium">{user.total_trades}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-d-text-muted">Win Rate</span>
              <span className="text-white font-medium">
                {user.total_trades > 0
                  ? ((user.winning_trades / user.total_trades) * 100).toFixed(1)
                  : 0}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-d-text-muted">Total P&L</span>
              <span className={`font-medium font-mono num-display ${user.total_pnl >= 0 ? 'text-up' : 'text-down'}`}>
                {user.total_pnl >= 0 ? '+' : ''}₹{user.total_pnl.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Trading Settings */}
        <div className="bg-d-bg-card rounded-2xl border border-d-border p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Trading Settings</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-d-text-muted">Mode</span>
              <span className="text-white capitalize">{user.trading_mode.replace('_', ' ')}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-d-text-muted">Risk Profile</span>
              <span className="text-white capitalize">{trading_settings.risk_profile}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-d-text-muted">Risk/Trade</span>
              <span className="text-white">{trading_settings.risk_per_trade}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-d-text-muted">F&O Enabled</span>
              <span className={trading_settings.fo_enabled ? 'text-up' : 'text-d-text-muted'}>
                {trading_settings.fo_enabled ? 'Yes' : 'No'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-d-text-muted">Broker</span>
              <span className="text-white capitalize">
                {user.broker_connected ? user.broker_name : 'Not connected'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-d-bg-card rounded-2xl border border-d-border p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Admin Actions</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleResetSubscription}
            className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg text-primary text-sm font-medium transition-colors"
          >
            Reset Subscription
          </button>
          {!user.is_banned && (
            <>
              {user.is_suspended ? (
                <button className="px-4 py-2 bg-up/10 hover:bg-up/20 border border-up/20 rounded-lg text-up text-sm font-medium transition-colors">
                  Unsuspend User
                </button>
              ) : (
                <button className="px-4 py-2 bg-warning/10 hover:bg-warning/20 border border-warning/20 rounded-lg text-warning text-sm font-medium transition-colors">
                  Suspend User
                </button>
              )}
              <button className="px-4 py-2 bg-down/10 hover:bg-down/20 border border-down/20 rounded-lg text-down text-sm font-medium transition-colors">
                Ban User
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-d-border">
        <div className="flex gap-4">
          {['overview', 'trades', 'payments', 'activity'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-down text-down'
                  : 'border-transparent text-d-text-muted hover:text-white'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="bg-d-bg-card rounded-2xl border border-d-border p-6">
        {activeTab === 'overview' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Active Positions</h3>
            {positions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-d-text-muted uppercase">
                      <th className="pb-3">Symbol</th>
                      <th className="pb-3">Direction</th>
                      <th className="pb-3">Qty</th>
                      <th className="pb-3">Avg Price</th>
                      <th className="pb-3">Current</th>
                      <th className="pb-3">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-d-border">
                    {positions.map((pos: any) => (
                      <tr key={pos.id}>
                        <td className="py-3 text-white font-medium">{pos.symbol}</td>
                        <td className={`py-3 ${pos.direction === 'LONG' ? 'text-up' : 'text-down'}`}>
                          {pos.direction}
                        </td>
                        <td className="py-3 text-white/70">{pos.quantity}</td>
                        <td className="py-3 text-white/70 font-mono num-display">₹{pos.average_price}</td>
                        <td className="py-3 text-white/70 font-mono num-display">₹{pos.current_price}</td>
                        <td className={`py-3 font-medium font-mono num-display ${pos.unrealized_pnl >= 0 ? 'text-up' : 'text-down'}`}>
                          {pos.unrealized_pnl >= 0 ? '+' : ''}₹{pos.unrealized_pnl}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-d-text-muted">No active positions</p>
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
                    <tr className="text-left text-xs text-d-text-muted uppercase">
                      <th className="pb-3">Symbol</th>
                      <th className="pb-3">Direction</th>
                      <th className="pb-3">Qty</th>
                      <th className="pb-3">Entry</th>
                      <th className="pb-3">Exit</th>
                      <th className="pb-3">P&L</th>
                      <th className="pb-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-d-border">
                    {trades.map((trade: any) => (
                      <tr key={trade.id}>
                        <td className="py-3 text-white font-medium">{trade.symbol}</td>
                        <td className={`py-3 ${trade.direction === 'LONG' ? 'text-up' : 'text-down'}`}>
                          {trade.direction}
                        </td>
                        <td className="py-3 text-white/70">{trade.quantity}</td>
                        <td className="py-3 text-white/70 font-mono num-display">₹{trade.entry_price}</td>
                        <td className="py-3 text-white/70 font-mono num-display">₹{trade.exit_price}</td>
                        <td className={`py-3 font-medium font-mono num-display ${trade.net_pnl >= 0 ? 'text-up' : 'text-down'}`}>
                          {trade.net_pnl >= 0 ? '+' : ''}₹{trade.net_pnl}
                        </td>
                        <td className="py-3 text-d-text-muted text-sm">
                          {trade.closed_at ? new Date(trade.closed_at).toLocaleDateString() : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-d-text-muted">No trades found</p>
            )}
          </div>
        )}

        {activeTab === 'payments' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Payment History</h3>
            {payment_history.length > 0 ? (
              <div className="space-y-3">
                {payment_history.map((payment: any) => (
                  <div key={payment.id} className="flex justify-between items-center p-4 bg-white/[0.04] rounded-lg">
                    <div>
                      <p className="text-white font-medium">
                        {payment.subscription_plans?.display_name || 'Payment'}
                      </p>
                      <p className="text-d-text-muted text-sm">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-medium font-mono num-display">₹{(payment.amount / 100).toLocaleString()}</p>
                      <p className={`text-xs ${payment.status === 'completed' ? 'text-up' : 'text-warning'}`}>
                        {payment.status}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-d-text-muted">No payments found</p>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
            {recent_activity.length > 0 ? (
              <div className="space-y-3">
                {recent_activity.map((activity: any, i: number) => (
                  <div key={i} className="flex items-start gap-4 p-4 bg-white/[0.04] rounded-lg">
                    <div className="w-10 h-10 bg-d-bg-elevated rounded-full flex items-center justify-center">
                      <History className="w-5 h-5 text-d-text-muted" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white">{activity.details}</p>
                      <p className="text-d-text-muted text-sm capitalize">{activity.action.replace('_', ' ')}</p>
                    </div>
                    <p className="text-d-text-muted text-sm">
                      {new Date(activity.timestamp).toLocaleString()}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-d-text-muted">No activity found</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
