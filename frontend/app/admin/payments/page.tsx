// ============================================================================
// SWINGAI - ADMIN PAYMENTS PAGE
// Payment management and statistics
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
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
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'

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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: pageSize.toString(),
      })
      if (statusFilter) params.append('status', statusFilter)

      const res = await fetch(`${apiUrl}/api/admin/payments?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (res.ok) {
        const data = await res.json()
        setPayments(data.payments)
        setTotal(data.total)
      } else {
        setPayments(getMockPayments())
        setTotal(50)
      }
    } catch (err) {
      console.error('Failed to fetch payments:', err)
      setPayments(getMockPayments())
      setTotal(50)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, statusFilter])

  const fetchStats = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const res = await fetch(`${apiUrl}/api/admin/payments/stats?days=${statsPeriod}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      })

      if (res.ok) {
        setStats(await res.json())
      } else {
        setStats(getMockStats())
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err)
      setStats(getMockStats())
    }
  }, [statsPeriod])

  useEffect(() => {
    fetchPayments()
    fetchStats()
  }, [fetchPayments, fetchStats])

  const getToken = () => {
    if (typeof window === 'undefined') return ''
    return localStorage.getItem('sb-access-token') || ''
  }

  const getMockPayments = (): Payment[] => [
    {
      id: '1',
      user_id: 'user-1',
      razorpay_order_id: 'order_abc123',
      razorpay_payment_id: 'pay_xyz789',
      amount: 199900,
      status: 'completed',
      billing_period: 'monthly',
      created_at: '2025-08-15T10:30:00Z',
      completed_at: '2025-08-15T10:31:00Z',
      user_profiles: { email: 'rajesh.kumar@example.com', full_name: 'Rajesh Kumar' },
      subscription_plans: { display_name: 'Pro' },
    },
    {
      id: '2',
      user_id: 'user-2',
      razorpay_order_id: 'order_def456',
      amount: 99900,
      status: 'pending',
      billing_period: 'monthly',
      created_at: '2025-08-15T09:00:00Z',
      user_profiles: { email: 'priya.sharma@example.com', full_name: 'Priya Sharma' },
      subscription_plans: { display_name: 'Starter' },
    },
    {
      id: '3',
      user_id: 'user-3',
      razorpay_order_id: 'order_ghi789',
      razorpay_payment_id: 'pay_fail123',
      amount: 499900,
      status: 'failed',
      billing_period: 'monthly',
      created_at: '2025-08-14T15:00:00Z',
      user_profiles: { email: 'amit.patel@example.com', full_name: 'Amit Patel' },
      subscription_plans: { display_name: 'Elite' },
    },
    {
      id: '4',
      user_id: 'user-4',
      razorpay_order_id: 'order_jkl012',
      razorpay_payment_id: 'pay_ref456',
      amount: 199900,
      status: 'refunded',
      billing_period: 'monthly',
      created_at: '2025-08-10T12:00:00Z',
      completed_at: '2025-08-10T12:01:00Z',
      user_profiles: { email: 'refund.user@example.com', full_name: 'Refund User' },
      subscription_plans: { display_name: 'Pro' },
    },
  ]

  const getMockStats = (): PaymentStats => ({
    period_days: statsPeriod,
    total_revenue: 487500,
    completed_payments: 325,
    failed_payments: 18,
    refunds_count: 7,
    refunds_amount: 13500,
    net_revenue: 474000,
  })

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-neon-green" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-danger" />
      case 'refunded':
        return <RotateCcw className="w-4 h-4 text-neon-gold" />
      default:
        return <Clock className="w-4 h-4 text-text-secondary" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-neon-green/10 text-neon-green'
      case 'failed':
        return 'bg-danger/10 text-danger'
      case 'refunded':
        return 'bg-neon-gold/10 text-neon-gold'
      default:
        return 'bg-white/[0.04] text-text-secondary'
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
      <ScrollReveal>
        <div>
          <h1 className="text-3xl font-bold text-text-primary">Payments</h1>
          <p className="text-text-secondary mt-1">Payment transactions and revenue analytics</p>
        </div>
      </ScrollReveal>

      {/* Stats Cards */}
      <ScrollReveal delay={0.1}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Total Revenue</p>
                  <p className="text-2xl font-bold text-neon-green">
                    ₹{stats?.total_revenue.toLocaleString() || 0}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">Last {statsPeriod} days</p>
                </div>
                <div className="p-3 rounded-xl bg-neon-green/10">
                  <DollarSign className="w-6 h-6 text-neon-green" />
                </div>
              </div>
            </motion.div>
          </Card3D>

          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Completed</p>
                  <p className="text-2xl font-bold text-text-primary">
                    {stats?.completed_payments || 0}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">Successful payments</p>
                </div>
                <div className="p-3 rounded-xl bg-neon-cyan/10">
                  <CheckCircle className="w-6 h-6 text-neon-cyan" />
                </div>
              </div>
            </motion.div>
          </Card3D>

          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Failed</p>
                  <p className="text-2xl font-bold text-danger">
                    {stats?.failed_payments || 0}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">Failed attempts</p>
                </div>
                <div className="p-3 rounded-xl bg-danger/10">
                  <XCircle className="w-6 h-6 text-danger" />
                </div>
              </div>
            </motion.div>
          </Card3D>

          <Card3D>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card-neu rounded-2xl border border-white/[0.04] p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-text-secondary">Refunds</p>
                  <p className="text-2xl font-bold text-neon-gold">
                    ₹{stats?.refunds_amount.toLocaleString() || 0}
                  </p>
                  <p className="text-xs text-text-secondary mt-1">{stats?.refunds_count || 0} refunds</p>
                </div>
                <div className="p-3 rounded-xl bg-neon-gold/10">
                  <RotateCcw className="w-6 h-6 text-neon-gold" />
                </div>
              </div>
            </motion.div>
          </Card3D>
        </div>
      </ScrollReveal>

      {/* Period Selector */}
      <div className="flex gap-2">
        {[7, 30, 90, 365].map((days) => (
          <button
            key={days}
            onClick={() => setStatsPeriod(days)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statsPeriod === days
                ? 'bg-neon-gold text-space-void'
                : 'bg-white/[0.04] text-text-secondary hover:bg-white/[0.06]'
            }`}
          >
            {days === 365 ? '1 Year' : `${days} Days`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <ScrollReveal delay={0.05}>
        <div className="glass-card-neu rounded-2xl border border-white/[0.04] p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2.5 bg-white/[0.04] border border-white/[0.06] rounded-lg text-text-primary focus:outline-none focus:border-neon-gold/60"
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
              className="px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-text-secondary transition-colors flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </ScrollReveal>

      {/* Payments Table */}
      <ScrollReveal delay={0.15}>
        <Card3D maxTilt={2}>
          <div className="glass-card-neu rounded-2xl border border-white/[0.04] overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="loader-rings" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/[0.02]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">User</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Plan</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Order ID</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase">Date</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {payments.map((payment) => (
                      <tr key={payment.id} className="hover:bg-white/[0.04] transition-colors">
                        <td className="px-4 py-4">
                          <div>
                            <p className="text-text-primary font-medium">
                              {payment.user_profiles?.full_name || 'N/A'}
                            </p>
                            <p className="text-text-secondary text-sm">
                              {payment.user_profiles?.email}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-text-primary">
                            {payment.subscription_plans?.display_name || '-'}
                          </span>
                          <p className="text-text-secondary text-xs capitalize">{payment.billing_period}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-text-primary font-medium">
                            ₹{(payment.amount / 100).toLocaleString()}
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
                          <code className="text-text-secondary text-xs bg-white/[0.04] px-2 py-1 rounded">
                            {payment.razorpay_order_id?.slice(0, 15)}...
                          </code>
                        </td>
                        <td className="px-4 py-4 text-sm text-text-secondary">
                          {new Date(payment.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-4 text-right">
                          {payment.status === 'completed' && (
                            <button
                              onClick={() => handleRefund(payment.id)}
                              className="text-xs text-neon-gold hover:text-neon-gold/80 transition-colors"
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
              <div className="text-sm text-text-secondary">
                Showing {payments.length} of {total} payments
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-text-secondary" />
                </button>
                <span className="text-sm text-text-secondary">Page {page}</span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={payments.length < pageSize}
                  className="p-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-text-secondary" />
                </button>
              </div>
            </div>
          </div>
        </Card3D>
      </ScrollReveal>
    </div>
  )
}
