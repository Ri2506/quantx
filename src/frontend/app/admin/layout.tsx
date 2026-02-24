// ============================================================================
// SWINGAI - ADMIN LAYOUT
// Shared layout for all admin pages
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import {
  Users,
  CreditCard,
  Activity,
  Settings,
  Shield,
  BarChart3,
  LogOut,
  Menu,
  X,
  Home,
  AlertTriangle,
  Target,
} from 'lucide-react'

const adminNavItems = [
  { href: '/admin', label: 'Dashboard', icon: Home },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/signals', label: 'Signals', icon: Target },
  { href: '/admin/system', label: 'System Health', icon: Activity },
]

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { user, profile, loading, signOut } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)

  // Check admin access
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/login?redirect=/admin')
        return
      }

      // For now, we'll check admin status via API
      // In production, this would be a proper admin check
      checkAdminAccess()
    }
  }, [user, loading, router])

  const checkAdminAccess = async () => {
    try {
      const token = localStorage.getItem('supabase.auth.token')
      // For development, allow access if user exists
      // In production, call /api/admin/verify endpoint
      setIsAdmin(true) // Temporary for development
    } catch (error) {
      console.error('Admin check failed:', error)
      setIsAdmin(false)
    }
  }

  if (loading || isAdmin === null) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-text-primary mb-2">Access Denied</h1>
          <p className="text-text-secondary mb-4">You don't have admin privileges.</p>
          <Link href="/dashboard" className="text-blue-500 hover:text-blue-400">
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-background-elevated/80 rounded-lg text-text-primary border border-border/50"
      >
        {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-background-surface/90 border-r border-border/50 backdrop-blur-xl transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border/50">
          <Shield className="w-8 h-8 text-red-500" />
          <div>
            <span className="text-xl font-bold text-text-primary">SwingAI</span>
            <span className="block text-xs text-red-500 font-semibold">ADMIN</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {adminNavItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/admin' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-red-500/10 text-red-500'
                    : 'text-text-secondary hover:bg-background-elevated/60 hover:text-text-primary'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User info & logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/50">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-red-500 to-orange-600 flex items-center justify-center text-text-primary font-bold">
              {profile?.full_name?.[0] || user?.email?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {profile?.full_name || 'Admin'}
              </p>
              <p className="text-xs text-text-muted truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-background-elevated/80 hover:bg-background-elevated rounded-lg text-sm text-text-secondary transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </Link>
            <button
              onClick={() => signOut()}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-background-elevated/80 hover:bg-red-500/20 hover:text-red-500 rounded-lg text-sm text-text-secondary transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:pl-64">
        <div className="p-6 lg:p-8">{children}</div>
      </main>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
