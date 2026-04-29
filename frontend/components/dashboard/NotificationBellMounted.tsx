'use client'

/**
 * NotificationBellMounted — PR 88
 *
 * Wired wrapper around `NotificationBell`. Owns:
 *   - Initial fetch + 60s background poll of /api/notifications
 *   - Mark-as-read + mark-all-read handlers
 *   - Type → route deep-link resolution
 *
 * Drop into the platform topbar; the presentational `NotificationBell`
 * stays prop-driven and reusable elsewhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { api } from '@/lib/api'
import type { Notification } from '@/types'
import NotificationBell from './NotificationBell'

const POLL_MS = 60_000


function resolveHref(n: Notification): string | null {
  const data = (n.data || {}) as Record<string, any>
  // Anything tied to a signal opens its detail page.
  if (typeof data.signal_id === 'string' && data.signal_id) {
    return `/signals/${data.signal_id}`
  }
  // Anything tied to a stock/symbol opens the dossier.
  if (typeof data.symbol === 'string' && data.symbol) {
    return `/stock/${encodeURIComponent(data.symbol.replace(/\.NS$/i, ''))}`
  }
  switch (n.type) {
    case 'signal_new':
    case 'target_hit':
    case 'stop_loss_hit':
    case 'position_update':
      return '/signals'
    case 'risk_alert':
      return '/portfolio'
    case 'broker_disconnected':
      return '/settings'
    case 'subscription_expiring':
      return '/pricing'
    case 'system_alert':
      return null
    default:
      return null
  }
}


export default function NotificationBellMounted() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const r = await api.notifications.getAll({ limit: 30 })
      if (!mountedRef.current) return
      setNotifications((r.notifications || []) as Notification[])
    } catch {
      // Silent — keep last-good state. Bell with no data is fine.
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    refresh()
    const iv = setInterval(refresh, POLL_MS)
    return () => {
      mountedRef.current = false
      clearInterval(iv)
    }
  }, [refresh])

  const handleMarkRead = useCallback(async (id: string) => {
    // Optimistic update first; reconcile on success.
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    try {
      await api.notifications.markRead(id)
    } catch {
      refresh()
    }
  }, [refresh])

  const handleMarkAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    try {
      await api.notifications.markAllRead()
    } catch {
      refresh()
    }
  }, [refresh])

  return (
    <NotificationBell
      notifications={notifications}
      onMarkAsRead={handleMarkRead}
      onMarkAllAsRead={handleMarkAllRead}
      getHref={resolveHref}
    />
  )
}
