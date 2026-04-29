'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../contexts/AuthContext'
import {
  LayoutDashboard,
  TrendingUp,
  Target,
  ScanLine,
  BarChart3,
  Bot,
  Briefcase,
  History,
  Eye,
  Settings,
  Wrench,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Crown,
  Menu,
  X,
  Store,
  FileCode,
  PlayCircle,
  Stethoscope,
  Sparkles,
  Settings2,
  Gift,
} from 'lucide-react'

/* ========================================================================== */
/* 5-PILLAR NAVIGATION                                                        */
/* ========================================================================== */

const navSections = [
  {
    title: 'Command Center',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/portfolio', label: 'Portfolio', icon: Briefcase },
      { href: '/portfolio/doctor', label: 'Portfolio Doctor', icon: Stethoscope, badge: 'Pro' },
      { href: '/weekly-review', label: 'Weekly Review', icon: Sparkles, badge: 'Pro' },
      { href: '/trades', label: 'Trades', icon: History },
      { href: '/watchlist', label: 'Watchlist', icon: Eye },
    ],
  },
  {
    title: 'Signals & Alpha',
    items: [
      { href: '/swingmax-signal', label: 'Signals', icon: TrendingUp, badge: 'AI' },
      { href: '/momentum', label: 'Momentum Picks', icon: Target, badge: 'AI' },
      { href: '/earnings-calendar', label: 'Earnings', icon: History, badge: 'AI' },
      { href: '/sector-rotation', label: 'Sector Rotation', icon: BarChart3, badge: 'Pro' },
    ],
  },
  {
    title: 'Scanner Engine',
    items: [
      { href: '/scanner-lab', label: 'Scanner Lab', icon: ScanLine },
      { href: '/stocks', label: 'Stocks', icon: BarChart3 },
    ],
  },
  {
    title: 'Strategy Lab',
    items: [
      { href: '/auto-trader', label: 'Auto-Trader', icon: Bot, badge: 'Elite' },
      { href: '/ai-portfolio', label: 'AI Portfolio', icon: Briefcase, badge: 'Elite' },
      { href: '/fo-strategies', label: 'F&O Strategies', icon: Target, badge: 'Elite' },
      { href: '/marketplace', label: 'Marketplace', icon: Store },
      { href: '/my-strategies', label: 'My Strategies', icon: FileCode },
      { href: '/paper-trading', label: 'Paper Trading', icon: PlayCircle },
    ],
  },
  {
    title: 'AI Suite',
    items: [
      { href: '/assistant', label: 'AI Assistant', icon: Bot, badge: 'AI' },
      { href: '/models', label: 'Model accuracy', icon: Bot },
    ],
  },
]

const bottomItems = [
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/alerts', label: 'Alerts Studio', icon: Settings2, badge: 'Pro' },
  { href: '/referrals', label: 'Referrals', icon: Gift },
  { href: '/settings', label: 'Settings', icon: Settings },
]

/* ========================================================================== */
/* APP LAYOUT                                                                 */
/* ========================================================================== */

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { profile, signOut } = useAuth()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isPremium = profile?.subscription_status === 'active' || profile?.subscription_status === 'trial'

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  const NavLink = ({ href, label, icon: Icon, badge, onClick }: {
    href: string; label: string; icon: React.ElementType; badge?: string; onClick?: () => void
  }) => {
    const active = isActive(href)
    return (
      <Link
        href={href}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
        className={`sidebar-tooltip spring-press group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-200 ${
          active
            ? 'bg-primary/[0.08] text-white shadow-[inset_0_0_20px_rgba(79,236,205,0.04)]'
            : 'text-d-text-secondary hover:bg-white/[0.04] hover:text-white'
        }`}
        {...(collapsed ? { 'data-tip': label } : {})}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_8px_rgba(79,236,205,0.6),0_0_16px_rgba(79,236,205,0.3)]" />
        )}
        <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors duration-200 ${active ? 'text-primary drop-shadow-[0_0_6px_rgba(79,236,205,0.4)]' : 'text-d-text-muted group-hover:text-white'}`} />
        {!collapsed && <span className="font-medium">{label}</span>}
        {collapsed && <span className="sr-only">{label}</span>}
        {badge && !collapsed && (
          <span className="ml-auto rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary ring-1 ring-primary/20">
            {badge}
          </span>
        )}
      </Link>
    )
  }

  return (
    <div className="flex min-h-screen bg-d-bg">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      {/* ── DESKTOP SIDEBAR ── */}
      <aside
        aria-label="Main navigation"
        className={`glass-sidebar fixed left-0 top-0 z-50 hidden h-screen flex-col transition-all duration-300 lg:flex ${
          collapsed ? 'w-[72px]' : 'w-60'
        }`}
      >
        {/* Logo */}
        <div className="flex h-16 items-center border-b border-d-border px-4">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-[#5DCBD8] to-[#8D5CFF] shadow-[0_0_20px_rgba(79,236,205,0.2)] transition-shadow duration-300 group-hover:shadow-[0_0_30px_rgba(79,236,205,0.35)]">
              <span className="text-sm font-extrabold text-black tracking-tight">Q</span>
            </div>
            {!collapsed && (
              <div className="flex flex-col">
                <span className="text-[15px] font-bold tracking-tight text-white">Quant X</span>
                <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-primary/60">Trading Intelligence</span>
              </div>
            )}
          </Link>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {navSections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-d-text-muted">
                  {section.title}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink key={item.href} {...item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Upgrade CTA */}
        {!isPremium && !collapsed && (
          <div className="px-3 pb-3">
            <Link
              href="/pricing"
              className="group relative block overflow-hidden rounded-xl border border-primary/10 bg-gradient-to-br from-primary/[0.06] to-[#8D5CFF]/[0.04] p-4 transition-all hover:border-primary/25 hover:shadow-[0_0_30px_rgba(79,236,205,0.06)]"
            >
              <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/[0.06] blur-2xl transition-all group-hover:bg-primary/[0.1]" />
              <div className="relative">
                <div className="mb-2 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-white">Upgrade to Pro</span>
                </div>
                <p className="mb-3 text-xs text-d-text-muted">All scanners, auto-trading & more</p>
                <span className="btn-primary inline-block rounded-lg px-3 py-1.5 text-xs">
                  View Plans
                </span>
              </div>
            </Link>
          </div>
        )}

        {/* Bottom nav */}
        <div className="space-y-0.5 border-t border-d-border px-3 py-3">
          {bottomItems.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
          <button
            onClick={() => signOut()}
            aria-label="Sign out"
            className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-d-text-secondary transition-all hover:bg-down/10 hover:text-down"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0 text-d-text-muted group-hover:text-down" />
            {!collapsed && <span className="font-medium">Sign Out</span>}
          </button>
        </div>

        {/* User section */}
        {!collapsed && (
          <div className="border-t border-d-border px-3 py-3">
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-[#8D5CFF]/20 text-xs font-bold text-white ring-1 ring-white/10">
                {profile?.full_name?.charAt(0) || 'U'}
                {isPremium && (
                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-d-bg-sidebar" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {profile?.full_name || 'User'}
                </p>
                <p className="text-[10px] text-d-text-muted">
                  {isPremium ? (
                    <span className="inline-flex items-center gap-1 text-primary">
                      <Crown className="h-2.5 w-2.5" /> Pro
                    </span>
                  ) : 'Free Plan'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-d-border bg-d-bg-card text-d-text-muted transition-all hover:text-white"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </aside>

      {/* ── MOBILE HEADER ── */}
      <div className="glass-topbar fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between px-4 lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#5DCBD8]">
            <span className="text-[10px] font-bold text-black">Q</span>
          </div>
          <span className="text-base font-semibold text-white">Quant X</span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          className="rounded-lg p-2 text-d-text-muted transition-colors hover:text-white"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* ── MOBILE DRAWER ── */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 35 }}
              className="glass-sidebar fixed bottom-0 left-0 top-0 z-50 flex w-72 flex-col lg:hidden"
            >
              <div className="flex h-14 items-center justify-between border-b border-d-border px-4">
                <Link href="/dashboard" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#5DCBD8]">
                    <span className="text-[10px] font-bold text-black">Q</span>
                  </div>
                  <span className="text-base font-semibold text-white">Quant X</span>
                </Link>
                <button onClick={() => setMobileMenuOpen(false)} className="rounded-lg p-2 text-d-text-muted hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
                {navSections.map((section) => (
                  <div key={section.title}>
                    <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-d-text-muted">
                      {section.title}
                    </p>
                    <div className="space-y-0.5">
                      {section.items.map((item) => (
                        <NavLink key={item.href} {...item} onClick={() => setMobileMenuOpen(false)} />
                      ))}
                    </div>
                  </div>
                ))}
              </nav>

              <div className="space-y-0.5 border-t border-d-border px-3 py-3">
                {bottomItems.map((item) => (
                  <NavLink key={item.href} {...item} onClick={() => setMobileMenuOpen(false)} />
                ))}
                <button
                  onClick={() => { signOut(); setMobileMenuOpen(false) }}
                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-d-text-secondary hover:bg-down/10 hover:text-down"
                >
                  <LogOut className="h-[18px] w-[18px] text-d-text-muted group-hover:text-down" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── MAIN CONTENT ── */}
      <main
        id="main-content"
        className={`flex-1 transition-all duration-300 ${
          collapsed ? 'lg:ml-[72px]' : 'lg:ml-60'
        } pt-14 lg:pt-0`}
      >
        {children}
      </main>
    </div>
  )
}
