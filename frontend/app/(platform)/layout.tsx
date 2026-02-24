'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Search,
  Bell,
  User,
  Calculator,
  Shield,
  Command,
} from 'lucide-react'
import CalculatorModal from '@/components/CalculatorModal'
import FloatingDock from '@/components/FloatingDock'
import PageTransition from '@/components/ui/PageTransition'

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [calculatorType, setCalculatorType] = useState<'position' | 'risk' | null>(null)

  return (
    <div className="min-h-screen bg-space-void">
      {/* Subtle mesh gradient background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-space" />
        <div className="bg-mesh-gradient absolute inset-0 opacity-20" />
      </div>

      {/* Calculator Modals */}
      {calculatorType && (
        <CalculatorModal
          isOpen={!!calculatorType}
          onClose={() => setCalculatorType(null)}
          type={calculatorType}
        />
      )}

      {/* Minimal Top Bar */}
      <nav className="fixed top-0 z-50 w-full border-b border-white/[0.06] bg-space-void/80 backdrop-blur-2xl">
        <div className="mx-auto px-6">
          <div className="flex h-14 items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold gradient-text-professional">SwingAI</span>
            </Link>

            {/* Center: Search (Command Palette style) */}
            <div className="hidden md:flex flex-1 max-w-md mx-8">
              <button
                className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2 text-sm text-text-secondary transition hover:border-neon-cyan/30 hover:bg-white/[0.04]"
              >
                <Search className="h-4 w-4" />
                <span className="flex-1 text-left">Search stocks, signals...</span>
                <kbd className="flex items-center gap-1 rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-xs text-text-secondary">
                  <Command className="h-3 w-3" />K
                </kbd>
              </button>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalculatorType('position')}
                className="hidden items-center gap-2 rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 px-3 py-1.5 text-xs font-medium text-neon-cyan transition hover:bg-neon-cyan/10 lg:flex"
              >
                <Calculator className="h-3.5 w-3.5" />
                Position
              </button>
              <button
                onClick={() => setCalculatorType('risk')}
                className="hidden items-center gap-2 rounded-lg border border-neon-purple/20 bg-neon-purple/5 px-3 py-1.5 text-xs font-medium text-neon-purple transition hover:bg-neon-purple/10 lg:flex"
              >
                <Shield className="h-3.5 w-3.5" />
                Risk
              </button>

              <button className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-text-secondary transition hover:text-neon-cyan hover:border-neon-cyan/30">
                <Bell className="h-4 w-4" />
              </button>
              <Link
                href="/settings"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.06] text-text-secondary transition hover:text-neon-cyan hover:border-neon-cyan/30"
              >
                <User className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content with Page Transitions */}
      <main className="relative z-10 pt-14 pb-24 md:pb-16">
        <PageTransition>
          {children}
        </PageTransition>
      </main>

      {/* Floating Dock Navigation */}
      <FloatingDock />
    </div>
  )
}
