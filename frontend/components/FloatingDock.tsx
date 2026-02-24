'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BarChart3,
  Sparkles,
  Target,
  TrendingUp,
  Brain,
  Briefcase,
  Calculator,
  Settings,
  LayoutGrid,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const dockItems = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart3 },
  { name: 'AI Screener', href: '/screener', icon: Sparkles },
  { name: 'AI Intelligence', href: '/ai-intelligence', icon: Brain },
  { name: 'Signals', href: '/signals', icon: Target },
  { name: 'Stocks', href: '/stocks', icon: TrendingUp },
  { name: 'Paper Trading', href: '/paper-trading', icon: Briefcase },
  { name: 'Tools', href: '/tools', icon: Calculator },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function FloatingDock() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const [lastScrollY, setLastScrollY] = useState(0)

  const handleScroll = useCallback(() => {
    const currentScrollY = window.scrollY
    if (currentScrollY > lastScrollY && currentScrollY > 100) {
      setVisible(false)
    } else {
      setVisible(true)
    }
    setLastScrollY(currentScrollY)
  }, [lastScrollY])

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  return (
    <>
      {/* Desktop Floating Dock */}
      <div
        className={cn(
          'floating-dock hidden md:flex',
          !visible && 'hidden'
        )}
      >
        {dockItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn('dock-item', isActive && 'active')}
            >
              <Icon className="h-5 w-5" />
              <span className="dock-tooltip">{item.name}</span>
              {isActive && (
                <motion.div
                  layoutId="dock-active"
                  className="absolute inset-0 rounded-[14px] bg-white/[0.06]"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </Link>
          )
        })}
      </div>

      {/* Mobile Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden items-center justify-around border-t border-white/[0.06] bg-[rgba(8,12,24,0.92)] backdrop-blur-xl px-2 py-2 safe-area-bottom">
        {dockItems.slice(0, 5).map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-3 py-1 rounded-lg transition-colors',
                isActive ? 'text-neon-cyan' : 'text-white/40'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          )
        })}
      </div>
    </>
  )
}
