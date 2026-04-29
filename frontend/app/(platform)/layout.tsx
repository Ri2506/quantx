'use client'

import { useState, FormEvent, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Search,
  Calculator,
  Shield,
  Command,
  Sparkles,
  Send,
  Loader2,
  X,
  BarChart3,
  LayoutDashboard,
  TrendingUp,
  ScanLine,
  Bot,
  Briefcase,
} from 'lucide-react'
import dynamic from 'next/dynamic'

const CalculatorModal = dynamic(() => import('@/components/CalculatorModal'), { ssr: false })
const CopilotProvider = dynamic(() => import('@/components/copilot/CopilotProvider'), { ssr: false })
const SystemHaltBanner = dynamic(() => import('@/components/shared/SystemHaltBanner'), { ssr: false })
const CopilotQuotaModal = dynamic(() => import('@/components/CopilotQuotaModal'), { ssr: false })
const NotificationBellMounted = dynamic(() => import('@/components/dashboard/NotificationBellMounted'), { ssr: false })
import AppLayout from '@/components/shared/AppLayout'
import { api } from '@/lib/api'
import { dispatchCopilotQuotaExhausted } from '@/components/CopilotQuotaModal'

const AppBackground = dynamic(() => import('@/components/ui/app-background'), { ssr: false })

// Page title mapping
const pageTitles: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/swingmax-signal': 'Signals',
  // PR 91 — /quantai-alpha-pick rebuilt as /momentum. Legacy path kept
  // so the redirect bounce shows the right title.
  '/quantai-alpha-pick': 'Momentum Picks',
  '/momentum': 'Momentum Picks',
  // PR 78 — /screener + /pattern-detection merged into /scanner-lab
  // (Step 1 §6 lock). The legacy paths still appear so a stale bookmark
  // gets a sensible page title during the redirect bounce.
  '/screener': 'Scanner Lab',
  '/pattern-detection': 'Scanner Lab',
  '/scanner-lab': 'Scanner Lab',
  '/marketplace': 'Strategy Marketplace',
  '/my-strategies': 'My Strategies',
  '/paper-trading': 'Paper Trading',
  '/assistant': 'AI Assistant',
  '/ai-intelligence': 'Model accuracy',
  '/models': 'Model accuracy',
  '/auto-trader': 'Auto-Trader',
  '/ai-portfolio': 'AI Portfolio',
  '/fo-strategies': 'F&O Strategies',
  '/earnings-calendar': 'Earnings Calendar',
  '/sector-rotation': 'Sector Rotation',
  '/weekly-review': 'Weekly Review',
  '/alerts': 'Alerts Studio',
  '/referrals': 'Referrals',
  '/tools': 'Tools',
  '/notifications': 'Notifications',
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  // PR 37 — first-login redirect to the risk-profile quiz. Once the
  // user's ``onboarding_completed`` is true, we stop checking.
  // PR 118 — read via cache helper so the same payload feeds the
  // /pricing and /settings recommendation banners without re-hitting
  // the endpoint per navigation.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { getOnboardingStatus } = await import('@/lib/onboardingStatusCache')
        const s = await getOnboardingStatus()
        if (cancelled || !s) return
        if (!s.completed) router.replace('/onboarding/risk-quiz')
      } catch {
        // Silent — user may not be authed yet; other flows handle it.
      }
    })()
    return () => { cancelled = true }
  }, [router])

  // PR 42 — referral attribution fallback. If the signup page stashed
  // ``pending_ref`` but couldn't attribute (e.g. session not ready),
  // retry here on first authed page load.
  useEffect(() => {
    let pending: string | null = null
    try { pending = localStorage.getItem('pending_ref') } catch { return }
    if (!pending) return
    ;(async () => {
      try {
        const { supabase } = await import('@/lib/supabase')
        const { data: { user } } = await supabase.auth.getUser()
        if (!user?.id) return
        await api.referrals.attribute({
          referred_user_id: user.id,
          code: pending!,
          referred_email: user.email ?? undefined,
        })
      } catch {
        /* non-fatal */
      } finally {
        try { localStorage.removeItem('pending_ref') } catch {}
      }
    })()
  }, [])

  const [calculatorType, setCalculatorType] = useState<'position' | 'risk' | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const searchInputRef2 = useRef<HTMLInputElement>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiQuery, setAiQuery] = useState('')
  const [aiReply, setAiReply] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const aiInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (aiOpen && aiInputRef.current) aiInputRef.current.focus()
  }, [aiOpen])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  useEffect(() => {
    if (searchOpen && searchInputRef2.current) searchInputRef2.current.focus()
  }, [searchOpen])

  const POPULAR_STOCKS = ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','BHARTIARTL','ITC','KOTAKBANK','LT','AXISBANK','MARUTI','WIPRO','HCLTECH','TATASTEEL','SUNPHARMA','BAJFINANCE','TITAN','ASIANPAINT','ADANIENT']

  // Register service worker + subscribe to Web Push
  useEffect(() => {
    async function setupPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
      try {
        const reg = await navigator.serviceWorker.register('/sw.js')
        const existing = await reg.pushManager.getSubscription()
        if (existing) return
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
        const resp = await fetch(`${apiBase}/api/push/vapid-key`)
        if (!resp.ok) return
        const { public_key } = await resp.json()
        if (!public_key) return
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(public_key) as BufferSource,
        })
        const { supabase } = await import('@/lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        await fetch(`${apiBase}/api/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify(sub.toJSON()),
        })
      } catch (err) {
        console.debug('Push subscription setup failed:', err)
      }
    }
    setupPush()
  }, [])

  const handleAiSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const q = aiQuery.trim()
    if (!q || aiLoading) return
    setAiLoading(true)
    setAiReply('')
    try {
      // PR 86 — pass current route + visible symbol/signal so the
      // Copilot can resolve "this stock" / "this signal" pronouns.
      const symbolMatch = pathname.match(/^\/stock\/([^/?#]+)/)
      const signalMatch = pathname.match(/^\/signals\/([^/?#]+)/)
      const res = await api.assistant.chat({
        message: q,
        history: [],
        page_context: {
          route: pathname,
          page_label: pageTitle || undefined,
          symbol: symbolMatch ? decodeURIComponent(symbolMatch[1]) : undefined,
          signal_id: signalMatch ? decodeURIComponent(signalMatch[1]) : undefined,
        },
      })
      setAiReply(res.reply)
    } catch (err: any) {
      // PR 68 — surface quota-exhausted via the global modal so the
      // floating widget matches the /assistant page behaviour.
      const msg = String(err?.message || err || '')
      if (msg.toLowerCase().includes('credits exhausted')) {
        try {
          const current = await api.assistant.getUsage()
          dispatchCopilotQuotaExhausted(current.usage)
          setAiReply('Daily Copilot credits exhausted — see upgrade options.')
        } catch {
          setAiReply('Daily Copilot credits exhausted.')
        }
      } else {
        setAiReply('Could not reach AI assistant. Try again later.')
      }
    } finally {
      setAiLoading(false)
    }
  }

  const pageTitle = pageTitles[pathname] || ''

  return (
    <AppLayout>
      {/* PR 48 — platform-wide trading halt banner (polls every 30s). */}
      <SystemHaltBanner />
      {/* PR 68 — global Copilot quota modal. Listens for the
          `copilot:quota_exhausted` event and renders the upgrade CTA. */}
      <CopilotQuotaModal />
      {/* Ambient background (glow + grid) */}
      <AppBackground />

      {/* Calculator Modals */}
      {calculatorType && (
        <CalculatorModal
          isOpen={!!calculatorType}
          onClose={() => setCalculatorType(null)}
          type={calculatorType}
        />
      )}

      {/* Top action bar — overlays AppLayout's main area */}
      <div className="fixed right-0 top-0 z-40 hidden h-14 items-center justify-end gap-2 px-6 lg:flex lg:left-60 glass-topbar">
        {/* Page title */}
        {pageTitle && (
          <h1 className="mr-auto text-sm font-bold tracking-tight text-white">{pageTitle}</h1>
        )}

        {/* Search */}
        <button onClick={() => setSearchOpen(true)} className="group flex items-center gap-3 rounded-[6px] border border-d-border bg-white/[0.03] px-4 py-2 text-sm text-d-text-muted transition-all hover:border-d-border-hover hover:bg-white/[0.05] spring-press">
          <Search className="h-4 w-4 transition-colors group-hover:text-primary" />
          <span className="hidden xl:inline">Search stocks, pages...</span>
          <span className="xl:hidden">Search...</span>
          <kbd className="flex items-center gap-1 rounded-md border border-d-border bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-d-text-muted font-mono">
            <Command className="h-3 w-3" />K
          </kbd>
        </button>

        {/* Calculators */}
        <button
          onClick={() => setCalculatorType('position')}
          className="spring-press flex items-center gap-1.5 rounded-[6px] border border-primary/20 bg-primary/[0.06] px-3 py-1.5 text-xs font-bold text-primary transition hover:bg-primary/[0.12] hover:border-primary/30"
        >
          <Calculator className="h-3.5 w-3.5" />
          Position
        </button>
        <button
          onClick={() => setCalculatorType('risk')}
          className="spring-press flex items-center gap-1.5 rounded-[6px] border border-[#8D5CFF]/20 bg-[#8D5CFF]/[0.06] px-3 py-1.5 text-xs font-bold text-[#8D5CFF] transition hover:bg-[#8D5CFF]/[0.12] hover:border-[#8D5CFF]/30"
        >
          <Shield className="h-3.5 w-3.5" />
          Risk
        </button>

        {/* PR 88 — global notification bell. Polls /api/notifications
            every 60s, deep-links each notification to its source. */}
        <NotificationBellMounted />

        {/* AI Quick Ask */}
        <button
          onClick={() => setAiOpen((v) => !v)}
          className={`spring-press flex h-8 w-8 items-center justify-center rounded-[6px] border transition-all ${
            aiOpen
              ? 'border-primary/40 bg-primary/10 text-primary shadow-[0_0_12px_rgba(79,236,205,0.15)]'
              : 'border-d-border text-d-text-muted hover:border-primary/30 hover:text-primary'
          }`}
          title="AI Quick Ask"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>

      {/* AI Quick-Ask Panel */}
      {aiOpen && (
        <div className="fixed right-4 top-16 z-50 w-full max-w-md animate-fade-in lg:top-16">
          <div className="glass-card rounded-xl border border-d-border-hover p-4 shadow-2xl shadow-black/40">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold text-white">AI Quick Ask</span>
              </div>
              <button onClick={() => setAiOpen(false)} className="text-d-text-muted transition hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAiSubmit} className="flex gap-2">
              <input
                ref={aiInputRef}
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                placeholder="Ask about markets, stocks..."
                className="glass-input flex-1"
                maxLength={500}
              />
              <button
                type="submit"
                disabled={aiLoading || !aiQuery.trim()}
                className="rounded-lg bg-primary px-3 py-2 font-semibold text-black transition-all disabled:opacity-50"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
            {aiReply && (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-d-border bg-d-bg p-3">
                <p className="whitespace-pre-wrap text-sm text-d-text-secondary">{aiReply}</p>
                <Link
                  href="/assistant"
                  className="mt-2 inline-block text-xs font-medium text-primary hover:underline"
                  onClick={() => setAiOpen(false)}
                >
                  Open full chat &rarr;
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Modal */}
      {searchOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] bg-black/70 backdrop-blur-md"
          onClick={() => setSearchOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-[12px] border border-d-border-hover bg-[#111520] p-0 shadow-[0_25px_60px_rgba(0,0,0,0.5),0_0_0_1px_rgba(28,30,41,0.8)] animate-fade-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-d-border px-5 py-4">
              <Search className="h-5 w-5 text-primary/60" />
              <input
                ref={searchInputRef2}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stocks, pages, features..."
                className="flex-1 bg-transparent text-[15px] text-white placeholder:text-d-text-muted outline-none font-medium"
              />
              <kbd className="rounded-md border border-d-border bg-white/[0.04] px-2 py-0.5 text-[10px] text-d-text-muted font-mono">ESC</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto p-2">
              {(() => {
                const pages = Object.entries(pageTitles).map(([href, title]) => ({ href, title, type: 'page' as const }))
                const stocks = POPULAR_STOCKS.map(s => ({ href: `/stock/${s}`, title: s, type: 'stock' as const }))
                const all = [...pages, ...stocks]
                const q = searchQuery.toLowerCase()
                const filtered = q ? all.filter(item => item.title.toLowerCase().includes(q)) : all.slice(0, 10)
                if (filtered.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.04]">
                        <Search className="h-5 w-5 text-d-text-muted" />
                      </div>
                      <p className="text-sm font-medium text-d-text-muted">No results found</p>
                      <p className="mt-1 text-xs text-d-text-muted/60">Try a different search term</p>
                    </div>
                  )
                }
                return filtered.map((item, idx) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => { setSearchOpen(false); setSearchQuery('') }}
                    className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm text-d-text-secondary transition-all hover:bg-primary/[0.06] hover:text-white group"
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${item.type === 'stock' ? 'bg-up/10' : 'bg-primary/10'}`}>
                      {item.type === 'stock' ? (
                        <BarChart3 className="h-3.5 w-3.5 text-up" />
                      ) : (
                        <Search className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                    <span className="font-medium">{item.title}</span>
                    <span className={`ml-auto rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      item.type === 'stock' ? 'bg-up/10 text-up' : 'bg-primary/10 text-primary'
                    }`}>
                      {item.type === 'stock' ? 'Stock' : 'Page'}
                    </span>
                  </Link>
                ))
              })()}
            </div>
            {/* Quick actions footer */}
            <div className="flex items-center gap-4 border-t border-d-border px-5 py-2.5">
              <span className="flex items-center gap-1.5 text-[10px] text-d-text-muted">
                <kbd className="rounded border border-d-border bg-white/[0.03] px-1 py-0.5 font-mono text-[9px]">&uarr;&darr;</kbd> Navigate
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-d-text-muted">
                <kbd className="rounded border border-d-border bg-white/[0.03] px-1 py-0.5 font-mono text-[9px]">&crarr;</kbd> Open
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Page Content */}
      <div className="relative z-10 pb-20 lg:pb-0">
        {children}
      </div>

      {/* PR 36 — Global AI Copilot (⌘/ to toggle, bottom-right floating trigger) */}
      <CopilotProvider />


      {/* Mobile Bottom Navigation — iOS-inspired tab bar */}
      <MobileBottomNav pathname={pathname} />
    </AppLayout>
  )
}


/* ───────────────────────── PR 110 — mobile bottom-nav badges ───────────────────────── */
//
// Polls /api/dashboard/overview once a minute to surface two counts:
//   * Notifications (unread) → red dot on Home tab
//   * Today's signals (count) → numeric badge on Signals tab
// The desktop topbar has the full NotificationBell — this is the
// mobile-only signal so a user on /portfolio sees "9 unread" without
// navigating to /dashboard.

function MobileBottomNav({ pathname }: { pathname: string }) {
  const [signalCount, setSignalCount] = useState(0)
  const [unreadNotifs, setUnreadNotifs] = useState(0)

  useEffect(() => {
    let active = true
    const fetchCounts = async () => {
      try {
        const overview = await api.dashboard.getOverview()
        if (!active) return
        const signals = (overview as any)?.recent_signals
        const notifs = (overview as any)?.notifications_count
        if (Array.isArray(signals)) setSignalCount(signals.length)
        if (typeof notifs === 'number') setUnreadNotifs(notifs)
      } catch {
        // Silent — bottom-nav badges are decorative; don't disturb the user.
      }
    }
    fetchCounts()
    const iv = window.setInterval(fetchCounts, 60_000)
    return () => {
      active = false
      window.clearInterval(iv)
    }
  }, [])

  const items: Array<{
    href: string
    icon: any
    label: string
    badge?: { kind: 'count' | 'dot'; value?: number }
  }> = [
    {
      href: '/dashboard',
      icon: LayoutDashboard,
      label: 'Home',
      badge: unreadNotifs > 0 ? { kind: 'dot' } : undefined,
    },
    {
      href: '/swingmax-signal',
      icon: TrendingUp,
      label: 'Signals',
      badge: signalCount > 0 ? { kind: 'count', value: signalCount } : undefined,
    },
    { href: '/scanner-lab', icon: ScanLine, label: 'Scanner' },
    { href: '/portfolio', icon: Briefcase, label: 'Portfolio' },
    { href: '/assistant', icon: Bot, label: 'AI' },
  ]

  return (
    <nav className="mobile-bottom-nav lg:hidden" aria-label="Mobile navigation">
      {items.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={isActive ? 'active' : ''}
          >
            <span className="relative inline-flex">
              <item.icon className={`h-5 w-5 ${isActive ? 'drop-shadow-[0_0_6px_rgba(79,236,205,0.5)]' : ''}`} />
              {item.badge?.kind === 'dot' && (
                <span
                  aria-label={`${unreadNotifs} unread`}
                  className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-down ring-2 ring-[#0A0D14]"
                />
              )}
              {item.badge?.kind === 'count' && (
                <span
                  aria-label={`${item.badge.value} signals`}
                  className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-black text-[9px] font-bold flex items-center justify-center ring-2 ring-[#0A0D14]"
                >
                  {item.badge.value && item.badge.value > 9 ? '9+' : item.badge.value}
                </span>
              )}
            </span>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
