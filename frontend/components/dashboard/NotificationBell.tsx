// ============================================================================
// SWINGAI - NOTIFICATION BELL COMPONENT
// Animated notification bell with dropdown
// ============================================================================

'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Check, X, TrendingUp, Shield, AlertTriangle, Info } from 'lucide-react'
import { Notification } from '../../types'
import Link from 'next/link'

interface NotificationBellProps {
  notifications: Notification[]
  onMarkAsRead?: (id: string) => void
  onMarkAllAsRead?: () => void
  onDelete?: (id: string) => void
}

export default function NotificationBell({
  notifications,
  onMarkAsRead,
  onMarkAllAsRead,
  onDelete,
}: NotificationBellProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.is_read).length

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const getIcon = (type: string) => {
    switch (type) {
      case 'signal_new':
        return <TrendingUp className="w-4 h-4 text-primary" />
      case 'target_hit':
        return <TrendingUp className="w-4 h-4 text-success" />
      case 'stop_loss_hit':
        return <Shield className="w-4 h-4 text-danger" />
      case 'risk_alert':
        return <AlertTriangle className="w-4 h-4 text-warning" />
      default:
        return <Info className="w-4 h-4 text-text-muted" />
    }
  }

  const getTimeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000)
    if (seconds < 60) return 'Just now'
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    return `${Math.floor(seconds / 86400)}d ago`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl bg-background-elevated border border-gray-800 hover:border-gray-700 transition-all"
      >
        <Bell className="w-5 h-5 text-text-secondary" />

        {/* Badge */}
        {unreadCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-danger rounded-full flex items-center justify-center text-xs font-bold text-white"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.div>
        )}

        {/* Ping Animation */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-danger rounded-full animate-ping opacity-75" />
        )}
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="absolute right-0 mt-2 w-96 bg-background-elevated border border-gray-800 rounded-2xl shadow-2xl z-50"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div>
                <h3 className="text-sm font-bold text-text-primary">Notifications</h3>
                <p className="text-xs text-text-muted">{unreadCount} unread</p>
              </div>

              {unreadCount > 0 && onMarkAllAsRead && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={onMarkAllAsRead}
                  className="text-xs text-primary hover:text-primary-dark font-medium"
                >
                  Mark all read
                </motion.button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
                  <p className="text-sm text-text-muted">No notifications yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800">
                  {notifications.map((notification) => (
                    <motion.div
                      key={notification.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`p-4 hover:bg-background-surface transition-all ${
                        !notification.is_read ? 'bg-primary/5' : ''
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Icon */}
                        <div className="flex-shrink-0 p-2 rounded-lg bg-background-surface">
                          {getIcon(notification.type)}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className="text-sm font-bold text-text-primary truncate">
                              {notification.title}
                            </h4>
                            {!notification.is_read && (
                              <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1" />
                            )}
                          </div>

                          <p className="text-xs text-text-secondary line-clamp-2 mb-2">
                            {notification.message}
                          </p>

                          <div className="flex items-center justify-between">
                            <span className="text-xs text-text-muted">
                              {getTimeAgo(notification.created_at)}
                            </span>

                            <div className="flex items-center gap-1">
                              {!notification.is_read && onMarkAsRead && (
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => onMarkAsRead(notification.id)}
                                  className="p-1 rounded hover:bg-background-elevated transition-colors"
                                  title="Mark as read"
                                >
                                  <Check className="w-3 h-3 text-success" />
                                </motion.button>
                              )}

                              {onDelete && (
                                <motion.button
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => onDelete(notification.id)}
                                  className="p-1 rounded hover:bg-background-elevated transition-colors"
                                  title="Delete"
                                >
                                  <X className="w-3 h-3 text-danger" />
                                </motion.button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {notifications.length > 0 && (
              <div className="p-3 border-t border-gray-800 text-center">
                <Link
                  href="/notifications"
                  className="text-xs text-primary hover:text-primary-dark font-medium"
                  onClick={() => setIsOpen(false)}
                >
                  View all notifications
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
