// ============================================================================
// SWINGAI - ADMIN USERS PAGE
// User management with search, filters, and actions
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Search,
  Filter,
  Download,
  MoreVertical,
  Ban,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Eye,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { UserListItem, UserListResponse } from '@/types/admin'

const subscriptionOptions = [
  { value: '', label: 'All Subscriptions' },
  { value: 'free', label: 'Free' },
  { value: 'trial', label: 'Trial' },
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  
  // Filters
  const [search, setSearch] = useState('')
  const [subscriptionFilter, setSubscriptionFilter] = useState('')
  const [suspendedFilter, setSuspendedFilter] = useState<boolean | null>(null)
  
  // UI State
  const [selectedUser, setSelectedUser] = useState<UserListItem | null>(null)
  const [actionMenuOpen, setActionMenuOpen] = useState<string | null>(null)
  const [showUserModal, setShowUserModal] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      })

      if (search) params.append('search', search)
      if (subscriptionFilter) params.append('subscription_status', subscriptionFilter)
      if (suspendedFilter !== null) params.append('is_suspended', suspendedFilter.toString())

      const res = await fetch(`${apiUrl}/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (res.ok) {
        const data: UserListResponse = await res.json()
        setUsers(data.users)
        setTotal(data.total)
        setTotalPages(data.total_pages)
      } else {
        // Use mock data for development
        setUsers(getMockUsers())
        setTotal(50)
        setTotalPages(3)
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
      setUsers(getMockUsers())
      setTotal(50)
      setTotalPages(3)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, subscriptionFilter, suspendedFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const getToken = () => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('sb-access-token') || ''
  }

  const getMockUsers = (): UserListItem[] => [
    {
      id: '1',
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
    {
      id: '2',
      email: 'priya.sharma@example.com',
      full_name: 'Priya Sharma',
      phone: '+91 87654 32109',
      capital: 250000,
      trading_mode: 'signal_only',
      subscription_status: 'trial',
      subscription_plan: 'Starter',
      broker_connected: false,
      broker_name: undefined,
      total_trades: 12,
      winning_trades: 7,
      total_pnl: 3200,
      created_at: '2025-08-10T14:20:00Z',
      last_login: '2025-08-14T18:45:00Z',
      last_active: '2025-08-14T19:00:00Z',
      is_suspended: false,
      is_banned: false,
    },
    {
      id: '3',
      email: 'amit.patel@example.com',
      full_name: 'Amit Patel',
      phone: '+91 76543 21098',
      capital: 1000000,
      trading_mode: 'full_auto',
      subscription_status: 'active',
      subscription_plan: 'Elite',
      broker_connected: true,
      broker_name: 'angelone',
      total_trades: 523,
      winning_trades: 312,
      total_pnl: 187500,
      created_at: '2023-06-20T08:00:00Z',
      last_login: '2025-08-15T08:00:00Z',
      last_active: '2025-08-15T15:45:00Z',
      is_suspended: false,
      is_banned: false,
    },
    {
      id: '4',
      email: 'suspended.user@example.com',
      full_name: 'Suspended User',
      phone: '+91 65432 10987',
      capital: 100000,
      trading_mode: 'signal_only',
      subscription_status: 'free',
      subscription_plan: 'Free',
      broker_connected: false,
      broker_name: undefined,
      total_trades: 5,
      winning_trades: 1,
      total_pnl: -2500,
      created_at: '2025-07-01T12:00:00Z',
      last_login: '2025-07-15T10:00:00Z',
      last_active: '2025-07-15T10:30:00Z',
      is_suspended: true,
      is_banned: false,
    },
  ]

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchUsers()
  }

  const handleSuspend = async (userId: string) => {
    const reason = prompt('Enter suspension reason:')
    if (!reason) return

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/admin/users/${userId}/suspend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ reason }),
      })

      if (res.ok) {
        alert('User suspended successfully')
        fetchUsers()
      } else {
        alert('Failed to suspend user')
      }
    } catch (err) {
      console.error('Suspend error:', err)
      alert('Failed to suspend user')
    }
    setActionMenuOpen(null)
  }

  const handleUnsuspend = async (userId: string) => {
    if (!confirm('Are you sure you want to unsuspend this user?')) return

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/admin/users/${userId}/unsuspend`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (res.ok) {
        alert('User unsuspended successfully')
        fetchUsers()
      } else {
        alert('Failed to unsuspend user')
      }
    } catch (err) {
      console.error('Unsuspend error:', err)
      alert('Failed to unsuspend user')
    }
    setActionMenuOpen(null)
  }

  const handleBan = async (userId: string) => {
    const reason = prompt('Enter ban reason (this action is permanent):')
    if (!reason) return

    if (!confirm('Are you SURE you want to BAN this user? This action cannot be undone.')) return

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/admin/users/${userId}/ban`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ reason }),
      })

      if (res.ok) {
        alert('User banned successfully')
        fetchUsers()
      } else {
        alert('Failed to ban user')
      }
    } catch (err) {
      console.error('Ban error:', err)
      alert('Failed to ban user')
    }
    setActionMenuOpen(null)
  }

  const handleExport = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const params = new URLSearchParams()
      if (subscriptionFilter) params.append('subscription_status', subscriptionFilter)

      const res = await fetch(`${apiUrl}/api/admin/users/export/csv?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        alert('Failed to export users')
      }
    } catch (err) {
      console.error('Export error:', err)
      alert('Failed to export users')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Users</h1>
          <p className="text-text-secondary mt-1">Manage user accounts and subscriptions</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-background-elevated/80 hover:bg-background-elevated rounded-lg text-text-secondary text-sm font-medium transition-colors"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="app-panel p-4">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
            <input
              type="text"
              placeholder="Search by email, name, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-background-elevated/80 border border-border/50 rounded-lg text-text-primary placeholder:text-text-muted focus:outline-none focus:border-red-500"
            />
          </div>
          <select
            value={subscriptionFilter}
            onChange={(e) => {
              setSubscriptionFilter(e.target.value)
              setPage(1)
            }}
            className="px-4 py-2.5 bg-background-elevated/80 border border-border/50 rounded-lg text-text-primary focus:outline-none focus:border-red-500"
          >
            {subscriptionOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="px-6 py-2.5 bg-red-500 hover:bg-red-600 rounded-lg text-text-primary font-medium transition-colors"
          >
            Search
          </button>
          <button
            type="button"
            onClick={fetchUsers}
            className="p-2.5 bg-background-elevated/80 hover:bg-background-elevated rounded-lg text-text-secondary transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Users Table */}
      <div className="bg-background-surface/80 rounded-2xl border border-border/50 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-red-500"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-background-elevated/70">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Subscription
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Trading
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    P&L
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Last Active
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-background-elevated/80/30 transition-colors">
                    <td className="px-4 py-4">
                      <div>
                        <p className="text-text-primary font-medium">{user.full_name || 'N/A'}</p>
                        <p className="text-text-secondary text-sm">{user.email}</p>
                        {user.phone && <p className="text-text-muted text-xs">{user.phone}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                          user.subscription_status === 'active'
                            ? 'bg-green-500/10 text-green-500'
                            : user.subscription_status === 'trial'
                            ? 'bg-blue-500/10 text-blue-500'
                            : user.subscription_status === 'expired'
                            ? 'bg-red-500/10 text-red-500'
                            : 'bg-background-elevated/60 text-text-muted'
                        }`}
                      >
                        {user.subscription_plan || user.subscription_status}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="text-sm">
                        <p className="text-text-primary">
                          {user.total_trades} trades ({user.winning_trades} wins)
                        </p>
                        <p className="text-text-muted">
                          Win rate:{' '}
                          {user.total_trades > 0
                            ? ((user.winning_trades / user.total_trades) * 100).toFixed(1)
                            : 0}
                          %
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`font-medium ${
                          user.total_pnl >= 0 ? 'text-green-500' : 'text-red-500'
                        }`}
                      >
                        {user.total_pnl >= 0 ? '+' : ''}₹{user.total_pnl.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {user.is_banned ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-500 rounded-full text-xs font-medium">
                          <Ban className="w-3 h-3" /> Banned
                        </span>
                      ) : user.is_suspended ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-500 rounded-full text-xs font-medium">
                          <UserX className="w-3 h-3" /> Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-medium">
                          <UserCheck className="w-3 h-3" /> Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm text-text-secondary">
                      {user.last_active
                        ? new Date(user.last_active).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="relative">
                        <button
                          onClick={() =>
                            setActionMenuOpen(actionMenuOpen === user.id ? null : user.id)
                          }
                          className="p-2 hover:bg-background-elevated rounded-lg transition-colors"
                        >
                          <MoreVertical className="w-4 h-4 text-text-secondary" />
                        </button>
                        {actionMenuOpen === user.id && (
                          <div className="absolute right-0 mt-2 w-48 bg-background-elevated/80 border border-border/50 rounded-lg shadow-lg z-10">
                            <a
                              href={`/admin/users/${user.id}`}
                              className="flex items-center gap-2 px-4 py-2 text-sm text-text-secondary hover:bg-background-elevated transition-colors"
                            >
                              <Eye className="w-4 h-4" /> View Details
                            </a>
                            {!user.is_banned && (
                              <>
                                {user.is_suspended ? (
                                  <button
                                    onClick={() => handleUnsuspend(user.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-green-400 hover:bg-background-elevated transition-colors"
                                  >
                                    <UserCheck className="w-4 h-4" /> Unsuspend
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleSuspend(user.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-yellow-400 hover:bg-background-elevated transition-colors"
                                  >
                                    <UserX className="w-4 h-4" /> Suspend
                                  </button>
                                )}
                                <button
                                  onClick={() => handleBan(user.id)}
                                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-background-elevated transition-colors"
                                >
                                  <Ban className="w-4 h-4" /> Ban User
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border/50">
          <div className="text-sm text-text-secondary">
            Showing {users.length} of {total} users
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="p-2 bg-background-elevated/80 hover:bg-background-elevated rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-text-secondary" />
            </button>
            <span className="text-sm text-text-secondary">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="p-2 bg-background-elevated/80 hover:bg-background-elevated rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-text-secondary" />
            </button>
          </div>
        </div>
      </div>

      {/* Click outside to close menu */}
      {actionMenuOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setActionMenuOpen(null)}
        />
      )}
    </div>
  )
}
