// ============================================================================
// QUANT X - ADMIN USERS PAGE (Intellectia.ai Design System)
// User management with search, filters, and actions
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
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
import { api, handleApiError } from '@/lib/api'
import { logger } from '@/lib/logger'

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

      const params: Record<string, string> = {
        page: page.toString(),
        page_size: pageSize.toString(),
      }

      if (search) params.search = search
      if (subscriptionFilter) params.subscription_status = subscriptionFilter
      if (suspendedFilter !== null) params.is_suspended = suspendedFilter.toString()

      const data = await api.admin.getUsers(params as any) as unknown as UserListResponse

      if (data) {
        setUsers(data.users)
        setTotal(data.total)
        setTotalPages(data.total_pages)
      } else {
        setError('Failed to fetch users')
      }
    } catch (err) {
      logger.error('Failed to fetch users:', err)
      setError('Failed to connect to backend')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, search, subscriptionFilter, suspendedFilter])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchUsers()
  }

  const handleSuspend = async (userId: string) => {
    const reason = prompt('Enter suspension reason:')
    if (!reason) return

    try {
      await api.admin.suspendUser(userId)
      alert('User suspended successfully')
      fetchUsers()
    } catch (err) {
      logger.error('Suspend error:', err)
      alert('Failed to suspend user')
    }
    setActionMenuOpen(null)
  }

  const handleUnsuspend = async (userId: string) => {
    if (!confirm('Are you sure you want to unsuspend this user?')) return

    try {
      await api.admin.unsuspendUser(userId)
      alert('User unsuspended successfully')
      fetchUsers()
    } catch (err) {
      logger.error('Unsuspend error:', err)
      alert('Failed to unsuspend user')
    }
    setActionMenuOpen(null)
  }

  const handleBan = async (userId: string) => {
    const reason = prompt('Enter ban reason (this action is permanent):')
    if (!reason) return

    if (!confirm('Are you SURE you want to BAN this user? This action cannot be undone.')) return

    try {
      await api.admin.banUser(userId)
      alert('User banned successfully')
      fetchUsers()
    } catch (err) {
      logger.error('Ban error:', err)
      alert('Failed to ban user')
    }
    setActionMenuOpen(null)
  }

  const handleExport = async () => {
    try {
      const csvData = await api.admin.exportUsers()
      const blob = new Blob([csvData as unknown as string], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      logger.error('Export error:', err)
      alert('Failed to export users')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white">Users</h1>
            <p className="text-d-text-muted mt-1">Manage user accounts and subscriptions</p>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-white text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-down/10 border border-down/20 rounded-xl p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-down" />
          <p className="text-down">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div>
        <div className="glass-card p-4">
          <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-d-text-muted" />
              <input
                type="text"
                placeholder="Search by email, name, or phone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.04] border border-d-border rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-warning/60"
              />
            </div>
            <select
              value={subscriptionFilter}
              onChange={(e) => {
                setSubscriptionFilter(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2.5 bg-white/[0.04] border border-d-border rounded-lg text-white focus:outline-none focus:border-warning/60"
            >
              {subscriptionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-6 py-2.5 bg-warning hover:bg-warning/90 rounded-lg text-black font-medium transition-colors"
            >
              Search
            </button>
            <button
              type="button"
              onClick={fetchUsers}
              className="p-2.5 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-d-text-muted transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      {/* Users Table */}
      <div>
        <div className="glass-card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="loader-rings" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase tracking-wider">
                      User
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase tracking-wider">
                      Subscription
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase tracking-wider">
                      Trading
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase tracking-wider">
                      P&L
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase tracking-wider">
                      Last Active
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-d-text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-white font-medium">{user.full_name || 'N/A'}</p>
                          <p className="text-d-text-muted text-sm">{user.email}</p>
                          {user.phone && <p className="text-d-text-muted text-xs">{user.phone}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                            user.subscription_status === 'active'
                              ? 'bg-up/10 text-up'
                              : user.subscription_status === 'trial'
                              ? 'bg-primary/10 text-primary'
                              : user.subscription_status === 'expired'
                              ? 'bg-down/10 text-down'
                              : 'bg-white/[0.04] text-d-text-muted'
                          }`}
                        >
                          {user.subscription_plan || user.subscription_status}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <div className="text-sm">
                          <p className="text-white">
                            {user.total_trades} trades ({user.winning_trades} wins)
                          </p>
                          <p className="text-d-text-muted">
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
                          className={`font-medium font-mono num-display ${
                            user.total_pnl >= 0 ? 'text-up' : 'text-down'
                          }`}
                        >
                          {user.total_pnl >= 0 ? '+' : ''}{'\u20B9'}{user.total_pnl.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        {user.is_banned ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-down/10 text-down rounded-full text-xs font-medium">
                            <Ban className="w-3 h-3" /> Banned
                          </span>
                        ) : user.is_suspended ? (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-warning/10 text-warning rounded-full text-xs font-medium">
                            <UserX className="w-3 h-3" /> Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-1 bg-up/10 text-up rounded-full text-xs font-medium">
                            <UserCheck className="w-3 h-3" /> Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-d-text-muted">
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
                            className="p-2 hover:bg-white/[0.06] rounded-lg transition-colors"
                          >
                            <MoreVertical className="w-4 h-4 text-d-text-muted" />
                          </button>
                          {actionMenuOpen === user.id && (
                            <div className="absolute right-0 mt-2 w-48 bg-white/[0.04] border border-d-border rounded-lg shadow-lg z-10">
                              <a
                                href={`/admin/users/${user.id}`}
                                className="flex items-center gap-2 px-4 py-2 text-sm text-d-text-muted hover:bg-white/[0.06] transition-colors"
                              >
                                <Eye className="w-4 h-4" /> View Details
                              </a>
                              {!user.is_banned && (
                                <>
                                  {user.is_suspended ? (
                                    <button
                                      onClick={() => handleUnsuspend(user.id)}
                                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-up hover:bg-white/[0.06] transition-colors"
                                    >
                                      <UserCheck className="w-4 h-4" /> Unsuspend
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleSuspend(user.id)}
                                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-warning hover:bg-white/[0.06] transition-colors"
                                    >
                                      <UserX className="w-4 h-4" /> Suspend
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleBan(user.id)}
                                    className="w-full flex items-center gap-2 px-4 py-2 text-sm text-down hover:bg-white/[0.06] transition-colors"
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.04]">
            <div className="text-sm text-d-text-muted">
              Showing {users.length} of {total} users
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-d-text-muted" />
              </button>
              <span className="text-sm text-d-text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-d-text-muted" />
              </button>
            </div>
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
