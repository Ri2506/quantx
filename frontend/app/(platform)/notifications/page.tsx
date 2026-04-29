'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  Bell,
  Check,
  CheckCheck,
  TrendingUp,
  Shield,
  AlertTriangle,
  Info,
  Loader2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { Notification } from '@/types'

const TYPE_CONFIG: Record<string, { icon: typeof Bell; color: string; bg: string }> = {
  signal_new: { icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
  target_hit: { icon: TrendingUp, color: 'text-up', bg: 'bg-up/10' },
  stop_loss_hit: { icon: Shield, color: 'text-down', bg: 'bg-down/10' },
  risk_alert: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  position_update: { icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
  broker_disconnected: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
  system_alert: { icon: Info, color: 'text-d-text-muted', bg: 'bg-white/5' },
  subscription_expiring: { icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning/10' },
}

type FilterTab = 'all' | 'unread' | 'signals' | 'alerts'

const SIGNAL_TYPES = new Set(['signal_new', 'target_hit', 'stop_loss_hit', 'position_update'])
const ALERT_TYPES = new Set(['risk_alert', 'system_alert', 'broker_disconnected', 'subscription_expiring'])

function getTimeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 172800) return 'Yesterday'
  return `${Math.floor(seconds / 86400)}d ago`
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  if (date >= today) return 'Today'
  if (date >= yesterday) return 'Yesterday'
  if (date >= weekAgo) return 'This Week'
  return 'Earlier'
}

export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterTab>('all')

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.notifications.getAll({
        unread_only: filter === 'unread',
        limit: 100,
      })
      setNotifications(res.notifications || [])
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  const handleMarkRead = async (id: string) => {
    try {
      await api.notifications.markRead(id)
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
    } catch (err) {
      console.error('Failed to mark notification as read:', err)
    }
  }

  const handleMarkAllRead = async () => {
    try {
      await api.notifications.markAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch (err) {
      console.error('Failed to mark all as read:', err)
    }
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length

  // Filter notifications based on selected tab
  const displayed = useMemo(() => {
    switch (filter) {
      case 'unread':
        return notifications.filter((n) => !n.is_read)
      case 'signals':
        return notifications.filter((n) => SIGNAL_TYPES.has(n.type))
      case 'alerts':
        return notifications.filter((n) => ALERT_TYPES.has(n.type))
      default:
        return notifications
    }
  }, [notifications, filter])

  // Group notifications by date
  const groupedNotifications = useMemo(() => {
    const groups: Record<string, Notification[]> = {}
    const order = ['Today', 'Yesterday', 'This Week', 'Earlier']

    for (const n of displayed) {
      const group = getDateGroup(n.created_at)
      if (!groups[group]) groups[group] = []
      groups[group].push(n)
    }

    return order
      .filter((g) => groups[g]?.length)
      .map((label) => ({ label, items: groups[label] }))
  }, [displayed])

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: notifications.length },
    { key: 'unread', label: 'Unread', count: unreadCount },
    { key: 'signals', label: 'Signals' },
    { key: 'alerts', label: 'Alerts' },
  ]

  // Skeleton card for loading state
  const SkeletonNotification = () => (
    <div className="p-4 sm:p-5 animate-pulse">
      <div className="flex items-start gap-4">
        <div className="h-10 w-10 rounded-xl bg-white/5" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-48 rounded bg-white/10" />
          <div className="h-3 w-72 rounded bg-white/5" />
          <div className="h-3 w-16 rounded bg-white/5" />
        </div>
      </div>
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:px-6 md:py-8 space-y-6 relative overflow-hidden">
      <div className="aurora-purple absolute -top-10 right-1/4 opacity-40" />

      {/* ── Header ── */}
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5 border border-primary/20">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Notifications</h1>
            <p className="text-sm text-d-text-muted mt-0.5">
              Stay updated on signals, targets, and market alerts
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleMarkAllRead}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 text-sm font-medium text-primary bg-primary/10 border border-primary/20 rounded-xl hover:bg-primary/15 transition-colors"
          >
            <CheckCheck className="w-4 h-4" />
            <span className="hidden sm:inline">Mark All Read</span>
          </motion.button>
        )}
      </div>

      {/* ── Filter Tabs ── */}
      <div className="flex gap-2">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-colors ${
              filter === tab.key
                ? 'bg-white/10 text-white border border-d-border'
                : 'text-d-text-muted hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${
                filter === tab.key ? 'bg-primary/20 text-primary' : 'bg-white/5 text-d-text-muted'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Notifications List ── */}
      <div className="space-y-4">
        {loading ? (
          <div className="glass-card overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={i > 0 ? 'border-t border-d-border' : ''}>
                <SkeletonNotification />
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          /* ── Empty State ── */
          <div className="glass-card py-20 text-center">
            <div className="rounded-2xl bg-white/5 p-4 inline-block mb-4">
              <Bell className="w-10 h-10 text-d-text-muted opacity-50" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {filter === 'unread' ? 'All caught up' : 'No notifications yet'}
            </h3>
            <p className="text-sm text-d-text-muted max-w-xs mx-auto">
              {filter === 'unread'
                ? 'You have no unread notifications. Check back later for updates.'
                : 'Signals, alerts, and updates will appear here as they happen.'}
            </p>
          </div>
        ) : (
          /* ── Grouped Notification Cards ── */
          groupedNotifications.map((group) => (
            <div key={group.label}>
              <p className="text-xs font-semibold uppercase tracking-widest text-d-text-muted mb-2 px-1">
                {group.label}
              </p>
              <div className="glass-card overflow-hidden">
                <div className="divide-y divide-d-border">
                  {group.items.map((notification) => {
                    const config = TYPE_CONFIG[notification.type] || TYPE_CONFIG.system_alert
                    const Icon = config.icon

                    return (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className={`p-4 sm:p-5 hover:bg-white/[0.02] transition-colors cursor-pointer ${
                          !notification.is_read ? 'bg-primary/[0.03] border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'
                        }`}
                        onClick={() => {
                          if (notification.type === 'signal_new' && notification.data?.signal_id) router.push(`/signals/${notification.data.signal_id}`)
                          else if (notification.type === 'position_update' || notification.type === 'stop_loss_hit' || notification.type === 'target_hit') router.push('/trades')
                        }}
                      >
                        <div className="flex items-start gap-4">
                          {/* Type Icon */}
                          <div className={`flex-shrink-0 p-2.5 rounded-xl ${config.bg}`}>
                            <Icon className={`w-4 h-4 ${config.color}`} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <h3 className="text-sm font-semibold text-white truncate">
                                    {notification.title}
                                  </h3>
                                  {!notification.is_read && (
                                    <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                  )}
                                </div>
                                <p className="text-sm text-d-text-muted leading-relaxed line-clamp-2">
                                  {notification.message}
                                </p>
                                <span className="text-xs text-d-text-muted mt-2 block">
                                  {getTimeAgo(notification.created_at)}
                                </span>
                              </div>

                              {/* Mark Read Button */}
                              {!notification.is_read && (
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleMarkRead(notification.id)
                                  }}
                                  className="flex-shrink-0 p-2 rounded-lg hover:bg-white/5 transition-colors"
                                  title="Mark as read"
                                >
                                  <Check className="w-4 h-4 text-up" />
                                </motion.button>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
