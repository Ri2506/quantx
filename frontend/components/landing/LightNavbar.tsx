'use client'

import Link from 'next/link'
import { useEffect, useState, useRef } from 'react'
import {
  TrendingUp,
  ScanLine,
  BarChart3,
  Brain,
  Bot,
  Target,
  Store,
  Shield,
  Zap,
  ChevronDown,
} from 'lucide-react'
import { api } from '@/lib/api'

/* ── Product mega-menu items ── */
const productGroups = [
  {
    title: 'AI Signals',
    items: [
      { icon: TrendingUp, label: 'Trading Signals', desc: 'AI entry/exit with stop-loss', href: '/signals', color: '#00F0FF' },
      { icon: Target, label: 'Momentum Picks', desc: 'AlphaRank top-10 weekly', href: '/momentum', color: '#9250FF' },
      { icon: Zap, label: 'SwingMax Signal', desc: 'High-conviction setups', href: '/swingmax-signal', color: '#00F0FF' },
    ],
  },
  {
    title: 'Scanner Engine',
    items: [
      // PR 78 — /screener and /pattern-detection both merged into
      // /scanner-lab. Two-tab UI: Screeners + Patterns.
      { icon: ScanLine, label: 'Pattern Scanner', desc: '11 chart patterns, 1800+ stocks', href: '/scanner-lab?tab=patterns', color: '#0D8ED6' },
      { icon: BarChart3, label: 'Stock Screener', desc: '50+ real-time scanners', href: '/scanner-lab?tab=screeners', color: '#22c55e' },
      { icon: Brain, label: 'Stock Browser', desc: 'NSE-wide stock list with regime', href: '/stocks', color: '#FEB113' },
    ],
  },
  {
    title: 'Tools & AI',
    items: [
      { icon: Bot, label: 'AI Assistant', desc: 'Ask anything about markets', href: '/assistant', color: '#00F0FF' },
      { icon: Shield, label: 'Backtest Engine', desc: 'Validate on 2+ years of data', href: '/analytics', color: '#9250FF' },
      { icon: Store, label: 'Marketplace', desc: 'Community strategies', href: '/marketplace', color: '#0D8ED6' },
    ],
  },
]

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'FAQ', href: '#faq' },
]

type RegimeName = 'bull' | 'sideways' | 'bear'

const REGIME_PILL: Record<RegimeName, { label: string; color: string }> = {
  bull:     { label: 'Bull',     color: '#05B878' },
  sideways: { label: 'Sideways', color: '#FEB113' },
  bear:     { label: 'Bear',     color: '#FF5947' },
}

export default function LightNavbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [productsOpen, setProductsOpen] = useState(false)
  // PR 80 — live regime tag for unauthenticated visitors. Cheap public
  // endpoint, CDN-cached, fetched once on mount.
  const [regime, setRegime] = useState<{ name: RegimeName; conf: number } | null>(null)
  // PR 117 — 30-day mini-timeline strip beneath the pill so unauth
  // visitors see regime *transitions* in one glance (not just today's
  // state). Rendered only on lg+ to avoid navbar crowding.
  // PR 119 — keep per-cell metadata so each square gets a hover
  // tooltip ("2026-04-12 · Bull · 87%") instead of a vague aggregate.
  const [history, setHistory] = useState<Array<{ name: RegimeName; date: string; conf: number }>>([])
  // PR 124 — per-session dismiss for the high-turnover pip.
  const [turnoverDismissed, setTurnoverDismissed] = useState(false)
  useEffect(() => {
    let active = true
    import('@/lib/turnoverDismiss').then(({ isTurnoverDismissed }) => {
      if (!active) return
      setTurnoverDismissed(isTurnoverDismissed())
    }).catch(() => {})
    return () => { active = false }
  }, [])
  const dropdownRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const r = await api.publicTrust.regimeHistory(30)
        if (!active) return
        const cur = (r as any)?.current
        if (cur && cur.regime) {
          const name = String(cur.regime).toLowerCase() as RegimeName
          if (['bull', 'sideways', 'bear'].includes(name)) {
            const confKey = `prob_${name}` as 'prob_bull' | 'prob_sideways' | 'prob_bear'
            setRegime({ name, conf: Number(cur[confKey] || 0) })
          }
        }
        const hist = Array.isArray((r as any)?.history) ? (r as any).history : []
        const cells = hist
          .slice(-30)
          .map((h: any) => {
            const name = String(h.regime || '').toLowerCase() as RegimeName
            if (!['bull', 'sideways', 'bear'].includes(name)) return null
            const confKey = `prob_${name}` as 'prob_bull' | 'prob_sideways' | 'prob_bear'
            return {
              name,
              date: String(h.detected_at || '').slice(0, 10),
              conf: Number(h[confKey] || 0),
            }
          })
          .filter((x: any): x is { name: RegimeName; date: string; conf: number } => x !== null)
        setHistory(cells)
      } catch {}
    })()
    return () => { active = false }
  }, [])

  const handleMouseEnter = () => {
    clearTimeout(timeoutRef.current)
    setProductsOpen(true)
  }

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setProductsOpen(false), 200)
  }

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#131722]/90 backdrop-blur-[57.5px] border-b border-slate-700/30'
          : 'bg-transparent'
      }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#5DCBD8]">
              <span className="text-sm font-bold text-[#131722]">Q</span>
            </div>
            <span className="text-lg font-semibold tracking-tight text-white">
              Quant X
            </span>
          </Link>

          {/* Desktop nav links */}
          <div className="hidden items-center gap-1 md:flex">
            {/* Products dropdown */}
            <div
              ref={dropdownRef}
              className="relative"
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                Products
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${productsOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Mega-menu dropdown */}
              {productsOpen && (
                <div className="absolute left-1/2 top-full -translate-x-1/2 pt-2">
                  <div className="w-[680px] rounded-2xl border border-slate-700/30 bg-[#131722] backdrop-blur-xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] p-6">
                    <div className="grid grid-cols-3 gap-6">
                      {productGroups.map((group) => (
                        <div key={group.title}>
                          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/30">
                            {group.title}
                          </p>
                          <div className="space-y-1">
                            {group.items.map((item) => (
                              <Link
                                key={item.label}
                                href={item.href}
                                onClick={() => setProductsOpen(false)}
                                className="group flex items-start gap-3 rounded-xl p-2.5 transition-all hover:bg-white/[0.04]"
                              >
                                <div
                                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                                  style={{ background: `${item.color}15`, border: `1px solid ${item.color}25` }}
                                >
                                  <item.icon className="h-4 w-4" style={{ color: item.color }} />
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                                    {item.label}
                                  </p>
                                  <p className="text-xs text-white/30 leading-relaxed">
                                    {item.desc}
                                  </p>
                                </div>
                              </Link>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Bottom bar */}
                    <div className="mt-5 flex items-center justify-between border-t border-white/[0.06] pt-4">
                      <p className="text-xs text-white/25">6 proprietary engines. 50+ scanners. 10 chart patterns.</p>
                      <Link
                        href="/dashboard"
                        onClick={() => setProductsOpen(false)}
                        className="text-xs font-medium text-primary transition-colors hover:text-primary-hover"
                      >
                        Open Dashboard &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden items-center gap-3 md:flex">
            {/* PR 80 — live regime pill. Hidden gracefully when the
                public endpoint hasn't responded yet so it never flashes.
                PR 117 — pill + 30-day mini-strip stacked vertically so
                unauth visitors see transitions, not just today's state. */}
            {regime && (
              <div className="hidden lg:flex flex-col items-center gap-1">
                <Link
                  href="/regime"
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold border transition-colors hover:opacity-80"
                  style={{
                    color: REGIME_PILL[regime.name].color,
                    borderColor: `${REGIME_PILL[regime.name].color}55`,
                    background: `${REGIME_PILL[regime.name].color}14`,
                  }}
                  title="Current market regime — click for the full /regime view"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                      style={{ background: REGIME_PILL[regime.name].color }}
                    />
                    <span
                      className="relative inline-flex rounded-full h-1.5 w-1.5"
                      style={{ background: REGIME_PILL[regime.name].color }}
                    />
                  </span>
                  {REGIME_PILL[regime.name].label} · <span className="numeric">{Math.round(regime.conf * 100)}%</span>
                </Link>
                {history.length >= 7 && (() => {
                  // PR 123 — high-turnover indicator (mirrors PR 122/3
                  // dashboard banner). Real estate is tight on the
                  // navbar so the warning is a compact amber pip with
                  // a hover tooltip rather than a sentence.
                  let transitions = 0
                  for (let i = 1; i < history.length; i++) {
                    if (history[i].name !== history[i - 1].name) transitions++
                  }
                  const highTurnover = transitions >= 3
                  return (
                    <>
                      {highTurnover && !turnoverDismissed && (
                        <span
                          className="text-[9px] font-semibold flex items-center gap-1 leading-none"
                          style={{ color: '#FEB113' }}
                          title={`High regime turnover — ${transitions} flips in last ${history.length}d. Read with caution, size lighter.`}
                        >
                          <span className="inline-block w-1 h-1 rounded-full"
                                style={{ background: '#FEB113' }} />
                          {transitions} flips · size lighter
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setTurnoverDismissed(true)
                              import('@/lib/turnoverDismiss').then(({ dismissTurnover }) => {
                                dismissTurnover()
                              }).catch(() => {})
                            }}
                            aria-label="Dismiss turnover warning"
                            className="ml-0.5 text-d-text-muted hover:text-white text-[11px] leading-none"
                          >
                            ×
                          </button>
                        </span>
                      )}
                  <Link
                    href="/regime"
                    className="flex gap-[1px] items-end h-[10px] pt-[4px] opacity-80 hover:opacity-100 transition-opacity"
                    aria-label="30-day regime timeline"
                  >
                    {history.map((c, idx) => {
                      // PR 120 — regime-change marker. Render a thin
                      // vertical white tick on cells where the regime
                      // flipped vs the prior session so transitions
                      // pop without hovering. First cell never shows
                      // a marker (no prior to compare against).
                      const changed = idx > 0 && history[idx - 1].name !== c.name
                      const prev = idx > 0 ? history[idx - 1] : null
                      return (
                        <span
                          key={idx}
                          className="relative block h-[6px] hover:scale-y-[2] transition-transform origin-bottom"
                          style={{
                            width: '3px',
                            background: REGIME_PILL[c.name].color,
                            opacity: 0.4 + (0.6 * (idx + 1)) / history.length,
                          }}
                          title={
                            (changed && prev
                              ? `↳ regime change · ${REGIME_PILL[prev.name].label} → ${REGIME_PILL[c.name].label} · `
                              : '') +
                            `${c.date || '—'} · ${REGIME_PILL[c.name].label} · ${Math.round(c.conf * 100)}% conf`
                          }
                        >
                          {changed && (
                            <>
                              <span
                                className="absolute inset-y-0 left-0 w-[1px]"
                                style={{ background: 'rgba(255,255,255,0.95)' }}
                              />
                              {/* PR 121 — downward chevron above cell. */}
                              <svg
                                aria-hidden
                                viewBox="0 0 6 5"
                                className="absolute -top-[4px] left-[-1px] w-[4px] h-[4px]"
                                style={{ color: REGIME_PILL[c.name].color }}
                              >
                                <polygon points="0,0 6,0 3,5" fill="currentColor" />
                              </svg>
                            </>
                          )}
                        </span>
                      )
                    })}
                  </Link>
                    </>
                  )
                })()}
              </div>
            )}
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-full bg-[#00F0FF] px-5 py-2 text-sm font-semibold text-[#131722] transition-all hover:shadow-glow-primary"
            >
              Start Free Trial
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/60 hover:text-white md:hidden"
            aria-label="Toggle menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-slate-700/30 bg-[#0d1017]/95 backdrop-blur-xl md:hidden">
          <div className="px-4 py-3">
            {/* Mobile product sections */}
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/25 px-3">Products</p>
            {productGroups.map((group) => (
              <div key={group.title} className="mb-2">
                {group.items.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
                  >
                    <item.icon className="h-4 w-4" style={{ color: item.color }} />
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}

            <div className="my-2 border-t border-slate-700/30" />

            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}

            <div className="mt-3 flex flex-col gap-2 border-t border-slate-700/30 pt-3">
              <Link
                href="/login"
                className="rounded-lg px-3 py-2.5 text-center text-sm font-medium text-white/60"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-full bg-[#00F0FF] px-5 py-2.5 text-center text-sm font-semibold text-[#131722]"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
