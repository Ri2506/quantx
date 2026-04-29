// ============================================================================
// QUANT X - ADMIN PAYMENTS PAGE (Intellectia.ai Design System)
// Payment management and statistics
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  CreditCard,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  RotateCcw,
  DollarSign,
  TrendingUp,
  AlertCircle,
} from 'lucide-react'
import { PaymentStats } from '@/types/admin'
import { api, handleApiError } from '@/lib/api'

interface Payment {
  id: string
  user_id: string
  razorpay_order_id: string
  razorpay_payment_id?: string
  amount: number
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  billing_period: string
  created_at: string
  completed_at?: string
  user_profiles?: { email: string; full_name?: string }
  subscription_plans?: { display_name: string }
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [stats, setStats] = useState<PaymentStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)

  // Filters
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  // Stats period
  const [statsPeriod, setStatsPeriod] = useState(30)

  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true)

      const params: Record<string, any> = {
        page,
        page_size: pageSize,
      }
      if (statusFilter) params.status = statusFilter

      const data = await api.admin.getPayments(params) as any
      if (data) {
        setPayments(data.payments)
        setTotal(data.total)
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  const fetchStats = useCallback(async () => {
    try {
      const data = await api.admin.getPaymentStats(statsPeriod).catch(() => null)
      if (data) {
        setStats(data as unknown as PaymentStats)
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [statsPeriod])

  useEffect(() => {
    fetchPayments()
    fetchStats()
  }, [fetchPayments, fetchStats])

  // Kept for direct fetch in handleRefund (non-admin endpoint)
  const getToken = () => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('sb-access-token') || ''
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-up" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-down" />
      case 'refunded':
        return <RotateCcw className="w-4 h-4 text-warning" />
      default:
        return <Clock className="w-4 h-4 text-d-text-muted" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-up/10 text-up'
      case 'failed':
        return 'bg-down/10 text-down'
      case 'refunded':
        return 'bg-warning/10 text-warning'
      default:
        return 'bg-white/[0.04] text-d-text-muted'
    }
  }

  const handleRefund = async (paymentId: string) => {
    const reason = prompt('Enter refund reason:')
    if (!reason) return

    if (!confirm('Are you sure you want to initiate a refund?')) return

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/payments/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ payment_id: paymentId, reason }),
      })

      if (res.ok) {
        alert('Refund initiated successfully')
        fetchPayments()
        fetchStats()
      } else {
        alert('Failed to initiate refund')
      }
    } catch (err) {
      console.error('Refund error:', err)
      alert('Failed to initiate refund')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Payments</h1>
        <p className="text-d-text-muted mt-1">Payment transactions and revenue analytics</p>
      </div>

      {/* Stats Cards */}
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-d-text-muted">Total Revenue</p>
                <p className="text-2xl font-bold font-mono num-display text-up">
                  {'\u20B9'}{stats?.total_revenue.toLocaleString() || 0}
                </p>
                <p className="text-xs text-d-text-muted mt-1">Last {statsPeriod} days</p>
              </div>
              <div className="p-3 rounded-xl bg-up/10">
                <DollarSign className="w-6 h-6 text-up" />
              </div>
            </div>
          </div>

          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-d-text-muted">Completed</p>
                <p className="text-2xl font-bold text-white">
                  {stats?.completed_payments || 0}
                </p>
                <p className="text-xs text-d-text-muted mt-1">Successful payments</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/10">
                <CheckCircle className="w-6 h-6 text-primary" />
              </div>
            </div>
          </div>

          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-d-text-muted">Failed</p>
                <p className="text-2xl font-bold text-down">
                  {stats?.failed_payments || 0}
                </p>
                <p className="text-xs text-d-text-muted mt-1">Failed attempts</p>
              </div>
              <div className="p-3 rounded-xl bg-down/10">
                <XCircle className="w-6 h-6 text-down" />
              </div>
            </div>
          </div>

          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-d-text-muted">Refunds</p>
                <p className="text-2xl font-bold font-mono num-display text-warning">
                  {'\u20B9'}{stats?.refunds_amount.toLocaleString() || 0}
                </p>
                <p className="text-xs text-d-text-muted mt-1">{stats?.refunds_count || 0} refunds</p>
              </div>
              <div className="p-3 rounded-xl bg-warning/10">
                <RotateCcw className="w-6 h-6 text-warning" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2">
        {[7, 30, 90, 365].map((days) => (
          <button
            key={days}
            onClick={() => setStatsPeriod(days)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statsPeriod === days
                ? 'bg-warning text-black'
                : 'bg-white/[0.04] text-d-text-muted hover:bg-white/[0.06]'
            }`}
          >
            {days === 365 ? '1 Year' : `${days} Days`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div>
        <div className="glass-card p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2.5 bg-white/[0.04] border border-d-border rounded-lg text-white focus:outline-none focus:border-warning/60"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <button
              onClick={() => {
                fetchPayments()
                fetchStats()
              }}
              className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-d-text-muted transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Payments Table */}
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Plan</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Amount</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Order ID</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-d-text-muted uppercase">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-d-text-muted uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {payments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-white/[0.04] transition-colors">
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-white font-medium">
                            {payment.user_profiles?.full_name || 'N/A'}
                          </p>
                          <p className="text-d-text-muted text-sm">
                            {payment.user_profiles?.email}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-white">
                          {payment.subscription_plans?.display_name || '-'}
                        </span>
                        <p className="text-d-text-muted text-xs capitalize">{payment.billing_period}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-white font-medium font-mono num-display">
                          {'\u20B9'}{(payment.amount / 100).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(
                            payment.status
                          )}`}
                        >
                          {getStatusIcon(payment.status)}
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-4">
                        <code className="text-d-text-muted text-xs bg-white/[0.04] px-2 py-1 rounded">
                          {payment.razorpay_order_id?.slice(0, 15)}...
                        </code>
                      </td>
                      <td className="px-4 py-4 text-sm text-d-text-muted">
                        {new Date(payment.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {payment.status === 'completed' && (
                          <button
                            onClick={() => handleRefund(payment.id)}
                            className="text-xs text-warning hover:text-warning/80 transition-colors"
                          >
                            Refund
                          </button>
                        )}
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
              Showing {payments.length} of {total} payments
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-d-text-muted" />
              </button>
              <span className="text-sm text-d-text-muted">Page {page}</span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={payments.length < pageSize}
                className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-d-text-muted" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
