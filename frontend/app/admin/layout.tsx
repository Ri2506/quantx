// ============================================================================
// QUANT X - ADMIN LAYOUT (Intellectia.ai Design System)
// Clean sidebar with warning accent for admin distinction
// ============================================================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  Users,
  CreditCard,
  Activity,
  Shield,
  BarChart3,
  LogOut,
  Menu,
  X,
  Home,
  AlertTriangle,
  Target,
  Brain,
  Cpu,
} from 'lucide-react'

const adminNavItems = [
  { href: '/admin', label: 'Dashboard', icon: Home },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/signals', label: 'Signals', icon: Target },
  { href: '/admin/ml', label: 'ML Models', icon: Brain },
  // PR 129 — unified training pipeline
  { href: '/admin/training', label: 'Training', icon: Cpu },
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

  useEffect(() => {
    if (!loading) {
      checkAdminAccess()
    }
  }, [user, loading])

  const checkAdminAccess = async () => {
    try {
      if (!user?.email) {
        setIsAdmin(false)
        return
      }

      const API_BASE = process.env.NEXT_PUBLIC_API_URL || ''
      const token = (await supabase?.auth.getSession())?.data?.session?.access_token || ''
      const res = await fetch(`${API_BASE}/api/admin/verify`, {
        headers: { 'Authorization': `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setIsAdmin(data.is_admin === true)
      } else {
        setIsAdmin(false)
      }
    } catch (error) {
      console.error('Admin check failed:', error)
      setIsAdmin(false)
    }
  }

  if (loading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="loader-rings" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-down mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-d-text-muted mb-4">You don&apos;t have admin privileges.</p>
          <Link href="/dashboard" className="text-primary hover:underline">
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* Mobile sidebar toggle */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-d-bg-card rounded-lg text-white"
      >
        {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-d-border bg-d-bg transform transition-transform lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-d-border">
          <div className="w-8 h-8 rounded-lg bg-warning flex items-center justify-center">
            <Shield className="w-5 h-5 text-black" />
          </div>
          <div>
            <span className="text-xl font-bold text-white">Quant X</span>
            <span className="block text-xs text-warning font-semibold uppercase tracking-wider">Admin</span>
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
                className={`relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive
                    ? 'bg-warning/10 text-warning'
                    : 'text-d-text-muted hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-warning"
                  />
                )}
                <item.icon className="w-5 h-5" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User info & logout */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-d-border">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-warning flex items-center justify-center text-black font-bold">
              {profile?.full_name?.[0] || user?.email?.[0] || 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {profile?.full_name || 'Admin'}
              </p>
              <p className="text-xs text-d-text-muted truncate">{user?.email}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-d-border bg-white/[0.02] text-sm text-d-text-muted transition hover:bg-white/[0.04] hover:text-white"
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </Link>
            <button
              onClick={() => signOut()}
              className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-d-border bg-white/[0.02] text-sm text-d-text-muted transition hover:bg-down/10 hover:text-down hover:border-down/20"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="relative z-10 lg:pl-64">
        <div className="p-6 lg:p-8">{children}</div>
      </main>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}
