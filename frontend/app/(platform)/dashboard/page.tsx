'use client'

/**
 * /dashboard — command center (Step 4 §5.3 rebuild).
 *
 * 12-col grid layout:
 *
 *   Top strip (full width): RegimeBanner
 *
 *   Row 1 (signals + equity):
 *     col 1-8 — Today's signals carousel
 *     col 9-12 — Equity curve + total P&L stat
 *
 *   Row 2 (performance / watchlist / market):
 *     col 1-4 — AI performance widget (7/30/90d WR)
 *     col 5-8 — Watchlist (top 8 symbols)
 *     col 9-12 — Market ticker (Nifty / BankNifty / VIX)
 *
 *   Row 3 (open + active):
 *     col 1-6 — Open positions
 *     col 7-12 — Active signals table
 *
 *   Row 4 (retention panels):
 *     col 1-4 — Sector rotation mini
 *     col 5-8 — Upcoming earnings (7d)
 *     col 9-12 — Paper league top-3 + your rank
 *
 *   Floating: KillSwitchButton (bottom-right, conditional on auto_trader_enabled)
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CircleDollarSign,
  Flame,
  Loader2,
  Plus,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react'

import AppLayout from '@/components/shared/AppLayout'
import { RegimeBanner } from '@/components/dashboard/RegimeBanner'
import SignalCard from '@/components/dashboard/SignalCard'
import EquityCurve from '@/components/dashboard/EquityCurve'
import WatchlistTable from '@/components/dashboard/WatchlistTable'
import MarketTicker from '@/components/dashboard/MarketTicker'
import IndexTickerStrip from '@/components/dashboard/IndexTickerStrip'
import { dispatchCopilotOpen } from '@/components/copilot/CopilotProvider'
import PositionRow from '@/components/dashboard/PositionRow'
import { AIPerformanceWidget } from '@/components/dashboard/AIPerformanceWidget'
import { api } from '@/lib/api'
import type { Signal } from '@/types'


// ---------------------------------------------------------------- types

interface WatchSymbol {
  symbol: string
  price: number
  change: number
}


// ---------------------------------------------------------------- page

export default function DashboardPage() {
  const [signals, setSignals] = useState<Signal[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [portfolio, setPortfolio] = useState<Record<string, any> | null>(null)
  const [equity, setEquity] = useState<{ date: string; equity: number; drawdown: number }[]>([])
  const [watchlist, setWatchlist] = useState<WatchSymbol[]>([])
  const [league, setLeague] = useState<Awaited<ReturnType<typeof api.paper.getLeague>> | null>(null)
  const [tier, setTier] = useState<'free' | 'pro' | 'elite' | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [autoTraderEnabled, setAutoTraderEnabled] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [sigs, poss, port, wl, lg, t, prof] = await Promise.all([
          api.signals.getToday().catch(() => ({ all_signals: [] } as any)),
          api.positions.getAll().catch(() => ({ positions: [] } as any)),
          api.portfolio.getSummary().catch(() => null),
          // PR 90 — switch from getAll() (raw symbol list) to live()
          // (PR 39 enriched endpoint with last_price + change_pct +
          // engines snapshot). The previous mapping read fields the
          // basic endpoint never returned, so price/change rendered 0.
          api.watchlist.live().catch(() => ({ items: [] } as any)),
          api.paper.getLeague(1).catch(() => null),
          api.user.getTier().catch(() => null),
          api.user.getProfile().catch(() => null),
        ])
        setSignals(((sigs as any)?.all_signals || []).slice(0, 8))
        setPositions(((poss as any)?.positions || []).slice(0, 6))
        setPortfolio(port as any)
        const liveItems = ((wl as any)?.items || []) as Array<any>
        setWatchlist(
          liveItems.slice(0, 8).map((it) => {
            const last = Number(it.last_price ?? 0)
            const pct = Number(it.change_pct ?? 0)
            // Derive absolute price change from pct + last so the
            // existing change column renders correctly without an
            // extra backend field.
            const absChange = last && pct ? (last * pct) / 100 : 0
            return {
              symbol: String(it.symbol || ''),
              name: it.engines?.regime ? `Regime: ${it.engines.regime}` : '',
              price: last,
              change: absChange,
              changePercent: pct,
              volume: 0,         // not in live() response; hidden via column tweak
              marketCap: '\u2014',
              isFavorite: false,
            }
          })
        )
        setLeague(lg as any)
        if (t) { setTier(t.tier); setIsAdmin(t.is_admin) }
        setAutoTraderEnabled(Boolean((prof as any)?.auto_trader_enabled))

        // Build equity curve from paper snapshots if available, else synthesize
        // from portfolio history.
        const eq = await api.paper.getEquityCurve(30).catch(() => null)
        if (eq && Array.isArray((eq as any).points) && (eq as any).points.length > 0) {
          setEquity((eq as any).points.map((p: any) => ({
            date: p.snapshot_date,
            equity: Number(p.equity),
            drawdown: Number(p.drawdown_pct || 0),
          })))
        } else {
          setEquity([])
        }
      } catch (e) {
        // best-effort; per-section errors handled below
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const totalPnl = Number(portfolio?.total_pnl ?? 0)
  const totalPnlPct = Number(portfolio?.total_pnl_percentage ?? 0)
  const dayPnl = Number(portfolio?.day_pnl ?? 0)
  const portfolioValue = Number(portfolio?.total_capital ?? 0)

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-5 max-w-[1440px] mx-auto space-y-5">
        {/* PR 66 — live index ticker strip */}
        <IndexTickerStrip />

        {/* Top strip: RegimeBanner */}
        <RegimeBanner />

        {/* PR 87 — discoverable Copilot CTA. The slide-out panel lives
            in CopilotProvider and was previously only reachable via a
            small floating bot button. This tile makes the feature
            obvious on day one with three quick-start prompts. */}
        <CopilotCTA />

        {/* Row 1: Today's signals + Equity curve */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-8 space-y-3">
            <SectionHeader
              title="Today's signals"
              count={signals.length}
              link={{ href: '/signals', label: 'See all' }}
            />
            {signals.length === 0 ? (
              <EmptyPanel
                icon={Zap}
                title="No signals yet today"
                body="AI scans NSE All at 08:30 IST. Signals land from there."
                cta={{ href: '/signals', label: 'Browse past signals' }}
              />
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory">
                {signals.map((s) => (
                  <div key={s.id} className="shrink-0 w-[320px] snap-start">
                    <SignalCard signal={s} showExecuteButton={false} />
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="lg:col-span-4 trading-surface flex flex-col">
            <SectionHeader
              title="Portfolio"
              right={tier && (
                <span className="text-[10px] px-2 py-0.5 border border-d-border rounded-full text-d-text-muted uppercase tracking-wider">
                  {isAdmin ? 'Admin' : tier}
                </span>
              )}
            />
            <div className="mt-2">
              <div className="flex items-baseline gap-2">
                <span className="numeric text-[24px] font-semibold text-white">
                  ₹{Math.round(portfolioValue).toLocaleString('en-IN')}
                </span>
                <span
                  className="numeric text-[12px] font-medium"
                  style={{ color: totalPnlPct >= 0 ? '#05B878' : '#FF5947' }}
                >
                  {totalPnlPct >= 0 ? '+' : ''}{totalPnlPct.toFixed(2)}%
                </span>
              </div>
              <p className="text-[11px] text-d-text-muted mt-0.5">
                Today{' '}
                <span
                  className="numeric"
                  style={{ color: dayPnl >= 0 ? '#05B878' : '#FF5947' }}
                >
                  {dayPnl >= 0 ? '+' : ''}₹{Math.round(Math.abs(dayPnl)).toLocaleString('en-IN')}
                </span>
              </p>
            </div>
            <div className="mt-3 -mx-2">
              {equity.length > 0 ? (
                <EquityCurve data={equity} />
              ) : (
                <div className="h-[180px] flex items-center justify-center text-[11px] text-d-text-muted">
                  Start paper trading to see an equity curve.
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Row 2: AI perf / Watchlist / Market */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4">
            <AIPerformanceWidget />
          </div>
          <div className="lg:col-span-4">
            <div className="flex items-center justify-between mb-2">
              <SectionHeader title="Watchlist" count={watchlist.length} />
              <Link
                href="/watchlist"
                className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" />
                Add
              </Link>
            </div>
            {watchlist.length === 0 ? (
              <EmptyPanel
                icon={Plus}
                title="Empty watchlist"
                body="Add stocks to track. AI alerts you on breakouts + regime-aware warnings."
                cta={{ href: '/watchlist', label: 'Add symbol' }}
              />
            ) : (
              <WatchlistTable
                stocks={watchlist as any}
                onRemove={async (symbol) => {
                  // PR 90 — wire remove. Optimistic; reload on failure.
                  setWatchlist((prev) => prev.filter((w: any) => w.symbol !== symbol))
                  try {
                    await api.watchlist.remove(symbol)
                  } catch {
                    const r = await api.watchlist.live().catch(() => ({ items: [] }))
                    const items = (r as any).items || []
                    setWatchlist(items.slice(0, 8).map((it: any) => ({
                      symbol: String(it.symbol || ''),
                      name: it.engines?.regime ? `Regime: ${it.engines.regime}` : '',
                      price: Number(it.last_price ?? 0),
                      change: (Number(it.last_price ?? 0) * Number(it.change_pct ?? 0)) / 100,
                      changePercent: Number(it.change_pct ?? 0),
                      volume: 0,
                      marketCap: '\u2014',
                      isFavorite: false,
                    })))
                  }
                }}
                onViewChart={(symbol) => {
                  if (typeof window !== 'undefined') {
                    window.location.href = `/stock/${encodeURIComponent(symbol.replace(/\.NS$/, ''))}`
                  }
                }}
              />
            )}
          </div>
          <div className="lg:col-span-4">
            <SectionHeader title="Market" />
            <MarketTicker />
          </div>
        </div>

        {/* Row 3: Positions + Active signals */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <section className="lg:col-span-6">
            <SectionHeader
              title="Open positions"
              count={positions.length}
              link={{ href: '/portfolio', label: 'Portfolio →' }}
            />
            {positions.length === 0 ? (
              <EmptyPanel
                icon={TrendingUp}
                title="Nothing open"
                body="No active positions. Execute a paper trade from today's signals to get started."
                cta={{ href: '/signals', label: "See today's signals" }}
              />
            ) : (
              <div className="space-y-2 mt-2">
                {positions.map((p: any) => (
                  <PositionRow key={p.id || p.symbol} position={p as any} />
                ))}
              </div>
            )}
          </section>

          <section className="lg:col-span-6">
            <SectionHeader
              title="Active signals"
              count={signals.length}
              link={{ href: '/signals', label: 'All signals →' }}
            />
            {signals.length === 0 ? (
              <div className="trading-surface text-center py-10 text-[12px] text-d-text-muted">
                No active signals right now.
              </div>
            ) : (
              <div className="trading-surface !p-0 overflow-hidden mt-2">
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead className="text-d-text-muted border-b border-d-border">
                      <tr>
                        <th className="text-left px-3 py-2 font-normal">Symbol</th>
                        <th className="text-right px-2 py-2 font-normal">Entry</th>
                        <th className="text-right px-2 py-2 font-normal">Target</th>
                        <th className="text-right px-2 py-2 font-normal">SL</th>
                        <th className="text-right px-2 py-2 font-normal">Conf</th>
                        <th className="text-right px-3 py-2 font-normal"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {signals.slice(0, 10).map((s) => (
                        <tr key={s.id} className="border-b border-d-border last:border-0 hover:bg-white/[0.02] transition-colors">
                          <td className="px-3 py-2 text-white font-medium">{s.symbol}</td>
                          <td className="px-2 py-2 text-right numeric text-d-text-primary">₹{Number(s.entry_price).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right numeric text-up">₹{Number((s.target_1 ?? s.target ?? 0) || 0).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right numeric text-down">₹{Number(s.stop_loss).toFixed(2)}</td>
                          <td className="px-2 py-2 text-right numeric text-white">{Math.round(s.confidence)}</td>
                          <td className="px-3 py-2 text-right">
                            <Link href={`/signals/${s.id}`} className="text-[11px] text-primary hover:underline">
                              Open →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Row 4: Sector rotation / Earnings / Paper league */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 trading-surface">
            <SectionHeader
              title="Sector rotation"
              link={{ href: '/sector-rotation', label: 'Full view →' }}
            />
            <p className="text-[11px] text-d-text-muted mt-1">
              SectorFlow refreshes nightly. Open the full dashboard for
              rotating-in / rotating-out lists.
            </p>
            <Link
              href="/sector-rotation"
              className="mt-3 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ArrowRight className="w-3 h-3" /> Open rotation tracker
            </Link>
          </div>

          <div className="lg:col-span-4 trading-surface">
            <SectionHeader
              title="Upcoming earnings"
              link={{ href: '/earnings-calendar', label: 'Calendar →' }}
            />
            <div className="mt-2 flex items-center gap-2 text-[11px] text-d-text-muted">
              <Calendar className="w-3 h-3" />
              Next 7 days — wiring lands with F9 feature PR.
            </div>
            <Link
              href="/earnings-calendar"
              className="mt-3 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              <ArrowRight className="w-3 h-3" /> See earnings calendar
            </Link>
          </div>

          <div className="lg:col-span-4 trading-surface">
            <SectionHeader
              title="Paper League"
              link={{ href: '/paper-trading', label: 'Leaderboard →' }}
            />
            {league && league.top_20.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {league.top_20.slice(0, 3).map((row) => (
                  <div
                    key={row.handle}
                    className="flex items-center justify-between text-[12px]"
                  >
                    <span className="flex items-center gap-1.5">
                      <Flame
                        className="w-3 h-3"
                        style={{ color: row.rank === 1 ? '#FFD166' : row.rank === 2 ? '#C0C0C0' : '#C68642' }}
                      />
                      <span className="font-mono text-white">{row.handle}</span>
                    </span>
                    <span
                      className="numeric font-medium"
                      style={{ color: row.return_pct >= 0 ? '#05B878' : '#FF5947' }}
                    >
                      {row.return_pct >= 0 ? '+' : ''}{row.return_pct.toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-d-text-muted mt-1">
                League opens at end of first week. Keep paper-trading.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Floating kill-switch FAB */}
      {autoTraderEnabled && <KillSwitchFab />}
    </AppLayout>
  )
}


// ------------------------------------------------------------- subcomponents

function SectionHeader({
  title,
  count,
  link,
  right,
}: {
  title: string
  count?: number
  link?: { href: string; label: string }
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted">
          {title}
        </h3>
        {typeof count === 'number' && count > 0 && (
          <span className="numeric text-[10px] px-1.5 py-0.5 bg-d-bg-elevated border border-d-border rounded-full text-d-text-secondary">
            {count}
          </span>
        )}
      </div>
      {link && (
        <Link
          href={link.href}
          className="text-[11px] text-d-text-muted hover:text-primary transition-colors"
        >
          {link.label}
        </Link>
      )}
      {right}
    </div>
  )
}

function EmptyPanel({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: any
  title: string
  body: string
  cta?: { href: string; label: string }
}) {
  return (
    <div className="trading-surface flex flex-col items-start gap-2">
      <div className="w-8 h-8 rounded-md bg-d-bg-elevated border border-d-border flex items-center justify-center">
        <Icon className="w-4 h-4 text-d-text-muted" />
      </div>
      <h4 className="text-[13px] font-medium text-white">{title}</h4>
      <p className="text-[11px] text-d-text-muted leading-snug">{body}</p>
      {cta && (
        <Link
          href={cta.href}
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <ArrowRight className="w-3 h-3" />
          {cta.label}
        </Link>
      )}
    </div>
  )
}

function KillSwitchFab() {
  const [firing, setFiring] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const fire = async () => {
    setFiring(true)
    try {
      await api.trades.killSwitch().catch(() => null)
    } finally {
      setFiring(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-down text-white font-semibold text-[12px] shadow-[0_8px_24px_rgba(255,89,71,0.35)] hover:bg-down/90 transition-colors"
        title="Pause all auto-trading"
      >
        <AlertTriangle className="w-3.5 h-3.5" />
        Pause all
      </button>

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => !firing && setConfirmOpen(false)}
        >
          <div
            className="trading-surface max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-white flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-down" />
              Activate kill switch
            </h3>
            <p className="text-[12px] text-d-text-secondary mt-2 leading-relaxed">
              This cancels pending orders and halts the auto-trader immediately. Open
              positions are <strong>not</strong> liquidated — manage them from the
              Portfolio page.
            </p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={firing}
                className="flex-1 py-2 text-[12px] border border-d-border text-d-text-secondary rounded-md hover:bg-white/[0.03] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={fire}
                disabled={firing}
                className="flex-1 py-2 text-[12px] bg-down text-white font-semibold rounded-md hover:bg-down/90 transition-colors disabled:opacity-50"
              >
                {firing ? (
                  <span className="inline-flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Firing…</span>
                ) : (
                  'Fire kill switch'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


/* ───────────────────────── PR 87 — Copilot CTA tile ───────────────────────── */


function CopilotCTA() {
  // Three quick-start prompts that exercise the Copilot's tool use and
  // the new page_context plumbing (PR 86). Designed to be useful on
  // day one — answer questions a new user is likely to have without
  // them needing to invent a prompt.
  const prompts = [
    "What does today's market regime mean for my swing trades?",
    'Summarize the highest-confidence signals on my watchlist.',
    "Why was my last losing trade flagged a stop-out?",
  ]
  return (
    <section
      className="relative rounded-xl border border-d-border overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, rgba(79,236,205,0.07) 0%, rgba(79,236,205,0.02) 60%, transparent 100%)',
      }}
    >
      <div className="px-4 py-4 md:px-5 md:py-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-md bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-semibold text-white flex items-center gap-2 flex-wrap">
            AI Copilot
            <span className="text-[10px] text-d-text-muted font-normal">
              press <kbd className="font-mono px-1 py-0.5 rounded bg-[#0A0D14] border border-d-border text-d-text-muted">⌘/</kbd> to open
            </span>
          </p>
          <p className="text-[11px] text-d-text-muted mt-0.5">
            Page-aware. Knows your portfolio, watchlist, and current regime.
          </p>
        </div>
        <button
          onClick={() => dispatchCopilotOpen()}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-black rounded-md text-[12px] font-semibold hover:bg-primary-hover transition-colors"
        >
          Ask Copilot
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
      <div className="px-4 pb-3 md:px-5 flex flex-wrap gap-2 border-t border-d-border pt-3">
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => dispatchCopilotOpen(p)}
            className="text-[11px] text-d-text-secondary border border-d-border bg-[#0A0D14] hover:border-primary/40 hover:text-white rounded-full px-3 py-1.5 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>
    </section>
  )
}
