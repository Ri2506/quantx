// ============================================================================
// SWINGAI - APP LAYOUT COMPONENT
// Consistent navigation sidebar for authenticated pages
// ============================================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard,
  Brain,
  Search,
  Briefcase,
  BarChart3,
  History,
  Settings,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Zap,
  Crown,
  User,
  Menu,
  X,
} from 'lucide-react'

// ============================================================================
// NAVIGATION ITEMS
// ============================================================================

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/signals', label: 'AI Signals', icon: Brain, highlight: true },
  { href: '/screener', label: 'Screener', icon: Search },
  { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/trades', label: 'Trade History', icon: History },
]

const bottomNavItems = [
  { href: '/settings', label: 'Settings', icon: Settings },
]

// ============================================================================
// APP LAYOUT
// ============================================================================

interface AppLayoutProps {
  children: React.ReactNode
}

export default function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname()
  const { user, profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isPremium = profile?.subscription_status === 'active' || profile?.subscription_status === 'trial'

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed left-0 top-0 h-screen bg-[#0d0d14] border-r border-white/5 transition-all duration-300 z-50 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <span className="text-xl font-bold text-white">SwingAI</span>
            )}
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                } ${item.highlight && !isActive ? 'bg-gradient-to-r from-emerald-500/5 to-blue-500/5' : ''}`}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : ''}`} />
                {!collapsed && (
                  <span className="font-medium">{item.label}</span>
                )}
                {item.highlight && !collapsed && (
                  <span className="ml-auto px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded">
                    AI
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        {/* Upgrade CTA */}
        {!isPremium && !collapsed && (
          <div className="p-4">
            <Link
              href="/pricing"
              className="block p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20"
            >
              <div className="flex items-center gap-2 mb-2">
                <Crown className="w-5 h-5 text-amber-400" />
                <span className="font-semibold text-white">Upgrade to Pro</span>
              </div>
              <p className="text-xs text-gray-400 mb-3">
                Unlock AI scanners and execution tools
              </p>
              <span className="inline-block px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium rounded-lg">
                View Plans
              </span>
            </Link>
          </div>
        )}

        {/* Bottom nav */}
        <div className="p-4 border-t border-white/5 space-y-1">
          {bottomNavItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <item.icon className="w-5 h-5" />
                {!collapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            )
          })}
          
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <LogOut className="w-5 h-5" />
            {!collapsed && <span className="font-medium">Sign Out</span>}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 bg-[#0d0d14] border border-white/10 rounded-full flex items-center justify-center text-gray-400 hover:text-white transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </aside>

      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-[#0d0d14] border-b border-white/5 z-50 flex items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">SwingAI</span>
        </Link>
        
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-gray-400 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="lg:hidden fixed inset-0 top-16 bg-[#0d0d14] z-40 p-4"
          >
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
              
              <div className="pt-4 border-t border-white/5 mt-4">
                {bottomNavItems.map((item) => {
                  const isActive = pathname === item.href
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                        isActive
                          ? 'bg-white/10 text-white'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      <item.icon className="w-5 h-5" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  )
                })}
                
                <button
                  onClick={() => {
                    signOut()
                    setMobileMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </nav>

            {!isPremium && (
              <div className="absolute bottom-4 left-4 right-4">
                <Link
                  href="/pricing"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block p-4 rounded-xl bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Crown className="w-5 h-5 text-amber-400" />
                    <span className="font-semibold text-white">Upgrade to Pro</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Unlock all scanners & auto-trading
                  </p>
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          collapsed ? 'lg:ml-20' : 'lg:ml-64'
        } pt-16 lg:pt-0`}
      >
        {children}
      </main>
    </div>
  )
}
