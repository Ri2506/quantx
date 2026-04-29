'use client'

/**
 * /signals/[id] — signal detail page (Step 4 §5.3 layout).
 *
 * 3-column desktop layout:
 *   Col 1 (8/12): header + chart + ModelConsensusGrid + ExplanationMarkdown
 *                 + DebateTranscript (Elite) + similar signals strip
 *   Col 2 (4/12): execute panel + metadata + alert toggles
 *   Bottom:       user's prior trades on this symbol
 *
 * Data flow:
 *   api.signals.getById(id) → signal row
 *   api.user.getTier()      → tier gate for debate button
 *   api.ai.debate(id, ...)  → Bull/Bear transcript (on-demand, Elite only)
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Bell,
  Clock,
  Gavel,
  Info,
  Loader2,
  Play,
  Shield,
  Zap,
} from 'lucide-react'

import { api } from '@/lib/api'
import type { Signal } from '@/types'
import AppLayout from '@/components/shared/AppLayout'
import ModelConsensusGrid from '@/components/signals/ModelConsensusGrid'
import ExplanationMarkdown from '@/components/signals/ExplanationMarkdown'
import DebateTranscript, { type DebatePayload } from '@/components/signals/DebateTranscript'
import QuickTrade from '@/components/dashboard/QuickTrade'
import ModelBadge from '@/components/ModelBadge'
import { publicLabel } from '@/lib/models'

// PR 33 + PR 35 — consolidated per-stock engine output, injected on the signal page too.
const AIDossierPanel = dynamic(() => import('@/components/stock/AIDossierPanel'), { ssr: false })
const ChartVisionCard = dynamic(() => import('@/components/stock/ChartVisionCard'), { ssr: false })

const AdvancedStockChart = dynamic(() => import('@/components/AdvancedStockChart'), { ssr: false })


// ----------------------------------------------------------------- helpers

const STATUS_META: Record<string, { label: string; cls: string; pulse?: boolean }> = {
  active:          { label: 'Active',        cls: 'bg-warning/10 border-warning/30 text-warning' },
  triggered:       { label: 'Triggered',     cls: 'bg-up/10 border-up/30 text-up', pulse: true },
  executed:        { label: 'Live',          cls: 'bg-up/10 border-up/30 text-up', pulse: true },
  target_hit:      { label: '✓ Target hit',  cls: 'bg-up/10 border-up/30 text-up' },
  stop_loss_hit:   { label: '✗ SL hit',      cls: 'bg-down/10 border-down/30 text-down' },
  sl_hit:          { label: '✗ SL hit',      cls: 'bg-down/10 border-down/30 text-down' },
  expired:         { label: 'Expired',       cls: 'bg-d-bg-elevated border-d-border text-d-text-muted' },
  cancelled:       { label: 'Cancelled',     cls: 'bg-d-bg-elevated border-d-border text-d-text-muted' },
}

function formatTimeAgo(iso?: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function num(v: any, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback
}


// -------------------------------------------------------------------- page

export default function SignalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [signal, setSignal] = useState<(Signal & Record<string, any>) | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [tier, setTier] = useState<'free' | 'pro' | 'elite'>('free')
  const [isAdmin, setIsAdmin] = useState(false)
  const [debate, setDebate] = useState<DebatePayload | null>(null)
  const [debateLoading, setDebateLoading] = useState(false)
  const [debateError, setDebateError] = useState<string | null>(null)
  const [showTrade, setShowTrade] = useState(false)

  // PR 35 — side engines attached to the signal's stock.
  const [earnings, setEarnings] = useState<Awaited<ReturnType<typeof api.earnings.symbol>> | null>(null)
  const [similar, setSimilar] = useState<Array<Signal & Record<string, any>>>([])

  // PR 82 — wire alert toggles to the global /api/alerts/preferences
  // matrix instead of pure local state that evaporates on reload. We
  // surface push (the universal channel) per Step 4 §C12 — the full
  // event×channel matrix lives at /alerts.
  const [alertOnTrigger, setAlertOnTrigger] = useState(true)
  const [alertOnTarget, setAlertOnTarget] = useState(true)
  const [alertOnSL, setAlertOnSL] = useState(true)
  const [alertsLoading, setAlertsLoading] = useState(true)
  const [alertsError, setAlertsError] = useState<string | null>(null)

  // ── Load signal + user tier ──
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await api.signals.getById(id)
        if (!cancelled) setSignal(data as any)
        try {
          const t = await api.user.getTier()
          if (!cancelled) { setTier(t.tier); setIsAdmin(t.is_admin) }
        } catch {}
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load signal')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [id])

  // PR 82 — load global alert prefs once. Push is the universal
  // channel; the full event×channel matrix lives at /alerts.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await api.alerts.preferences()
        if (cancelled) return
        const p = r.preferences || {}
        setAlertOnTrigger(Boolean(p.signal_triggered?.push ?? true))
        setAlertOnTarget(Boolean(p.target_hit?.push ?? true))
        setAlertOnSL(Boolean(p.sl_hit?.push ?? true))
      } catch (err: any) {
        // Pro-gated; Free users see the toggles but they're inert.
        if (!cancelled) setAlertsError(err?.message ? null : null)
      } finally {
        if (!cancelled) setAlertsLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  const persistAlert = async (event: 'signal_triggered' | 'target_hit' | 'sl_hit', enabled: boolean) => {
    try {
      await api.alerts.toggle(event, 'push', enabled)
      setAlertsError(null)
    } catch (err: any) {
      setAlertsError('Could not save — open Alerts Studio for full controls.')
    }
  }

  // ── PR 35 — lazy side-engine fetches once the signal has a symbol ──
  useEffect(() => {
    if (!signal?.symbol) return
    let cancelled = false
    const sym = signal.symbol.replace('.NS', '')
    ;(async () => {
      const [e, hist] = await Promise.all([
        api.earnings.symbol(sym).catch(() => null),
        api.signals.getHistory({ symbol: sym, limit: 6 } as any).catch(() => null),
      ])
      if (cancelled) return
      setEarnings(e)
      if (hist && Array.isArray((hist as any).signals)) {
        setSimilar(((hist as any).signals as any[]).filter((s) => s.id !== id).slice(0, 5))
      }
    })()
    return () => { cancelled = true }
  }, [signal?.symbol, id])

  const canDebate = isAdmin || tier === 'elite'

  const runDebate = async () => {
    if (!signal) return
    setDebateLoading(true)
    setDebateError(null)
    try {
      const res = await api.ai.debate(id, {
        stock_snapshot: { symbol: signal.symbol, last_close: num(signal.entry_price) },
      })
      setDebate(res as DebatePayload)
    } catch (e: any) {
      setDebateError(e?.message || 'Debate failed')
    } finally {
      setDebateLoading(false)
    }
  }

  // ── Loading / error / not-found states ──
  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      </AppLayout>
    )
  }
  if (error || !signal) {
    return (
      <AppLayout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <div className="trading-surface text-center">
            <p className="text-white font-medium">Signal unavailable</p>
            <p className="text-[12px] text-d-text-muted mt-1">{error || 'Not found'}</p>
            <button
              onClick={() => router.push('/signals')}
              className="mt-4 px-4 py-1.5 text-[12px] bg-primary text-black rounded-md"
            >
              Back to signals
            </button>
          </div>
        </div>
      </AppLayout>
    )
  }

  // ── Derive common view-model ──
  const entry = num(signal.entry_price)
  const stop = num(signal.stop_loss)
  const target = num((signal as any).target_1 ?? signal.target)
  const target2 = num((signal as any).target_2)
  const target3 = num((signal as any).target_3)
  const rr = num(signal.risk_reward_ratio ?? signal.risk_reward, 0)
  const isLong = signal.direction === 'LONG'
  const pctUpside = entry > 0 && target > 0 ? ((target - entry) / entry) * 100 : 0
  const pctRisk = entry > 0 && stop > 0 ? ((entry - stop) / entry) * 100 : 0
  const statusMeta = STATUS_META[signal.status] || STATUS_META.active
  const regime: string | undefined = (signal as any).regime_at_signal ?? signal.regime_context
  const reasons: string[] = (signal.reasons || []).filter((r) => !r.startsWith('Regime:'))
  const strategy = (signal.strategy_names?.[0] || (signal as any).strategy_name || '—')
  const explanation: string = (signal as any).explanation_text || ''

  return (
    <AppLayout>
      <div className="px-4 md:px-6 py-4 md:py-6 max-w-7xl mx-auto">
        {/* ── Breadcrumb ── */}
        <Link
          href="/signals"
          className="inline-flex items-center gap-1.5 text-[11px] text-d-text-muted hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to signals
        </Link>

        {/* ── Header strip ── */}
        <div className="mt-4 flex flex-wrap items-center gap-4 justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-baseline gap-2">
              <h1 className="text-[28px] font-semibold text-white">{signal.symbol}</h1>
              <span className="text-[11px] text-d-text-muted uppercase tracking-wider">
                {signal.exchange} · {signal.segment}
              </span>
            </div>
            <div
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${statusMeta.cls}`}
            >
              {statusMeta.pulse && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current" />
                </span>
              )}
              {statusMeta.label}
            </div>
            <div
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md border ${
                isLong ? 'border-up/30 bg-up/10 text-up' : 'border-down/30 bg-down/10 text-down'
              }`}
            >
              {isLong ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {signal.direction}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[11px] text-d-text-muted">Confidence</span>
            <ConfidenceBar value={signal.confidence} />
            <span className="numeric text-white text-[14px] font-medium">
              {Math.round(signal.confidence)}
            </span>
          </div>
        </div>

        {/* ── Regime warning (bear) ── */}
        {regime === 'bear' && (
          <div className="mt-3 p-3 rounded-md border border-warning/30 bg-warning/5 flex items-start gap-2">
            <Info className="w-4 h-4 text-warning shrink-0 mt-0.5" />
            <p className="text-[12px] text-warning/90 flex items-center gap-2 flex-wrap">
              Bear regime active — signal size reduced to <span className="numeric">50%</span> per
              <ModelBadge modelKey="regime_detector" size="xs" variant="soft" /> gate.
            </p>
          </div>
        )}

        {/* ── PR 35 — EarningsScout upcoming-earnings warning ── */}
        {earnings?.beat_prob != null && earnings.announce_date && (
          <div className="mt-3 p-3 rounded-md border border-[#FEB113]/30 bg-[#FEB113]/5 flex items-start gap-2">
            <Info className="w-4 h-4 text-[#FEB113] shrink-0 mt-0.5" />
            <p className="text-[12px] text-[#FEB113]/95 flex items-center gap-2 flex-wrap">
              <ModelBadge modelKey="earnings_predictor" size="xs" variant="soft" />
              Earnings{' '}
              <span className="numeric font-semibold">
                {new Date(earnings.announce_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
              </span>
              {' · beat probability '}
              <span className="numeric font-semibold">{Math.round(earnings.beat_prob * 100)}%</span>
              {earnings.direction && ` · ${earnings.direction.replace('_', ' ')}`}
            </p>
          </div>
        )}

        {/* ── PR 35 — AI Dossier panel (N2 engine consensus, tier-aware) ── */}
        <div className="mt-4">
          <AIDossierPanel symbol={signal.symbol.replace('.NS', '')} />
        </div>

        {/* PR 46 — Chart vision (B2). Pro gate enforced server-side;
            the signal symbol is guaranteed to be in the user's signal
            feed, so Pro users can invoke the standard endpoint. */}
        <div className="mt-4">
          <ChartVisionCard symbol={signal.symbol.replace('.NS', '')} />
        </div>

        {/* ── PR 35 — Post-debate verdict banner (Elite, once debate returns) ── */}
        {debate && (
          <VerdictBanner debate={debate} />
        )}

        {/* ── 3-column grid ── */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-5">
            {/* Chart */}
            <div className="trading-surface !p-0 overflow-hidden">
              <AdvancedStockChart symbol={signal.symbol} />
            </div>

            {/* Model consensus */}
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted mb-2">
                Model consensus
              </h3>
              <ModelConsensusGrid signal={signal as any} />
            </div>

            {/* Explanation */}
            <div>
              <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted mb-2">
                Why this signal
              </h3>
              <ExplanationMarkdown text={explanation || defaultExplanation(signal, reasons)} />
            </div>

            {/* Counterpoint debate (Elite) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted flex items-center gap-1.5">
                  <Gavel className="w-3 h-3" />
                  <ModelBadge modelKey="debate_engine" size="xs" variant="soft" />
                  {!canDebate && (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider bg-gradient-to-r from-[#FFD166] to-[#FF9900] text-black font-semibold">
                      Elite
                    </span>
                  )}
                </h3>
                {debateError && (
                  <span className="text-[11px] text-down">{debateError}</span>
                )}
              </div>
              {canDebate ? (
                <DebateTranscript data={debate} loading={debateLoading} onRun={runDebate} />
              ) : (
                <div className="trading-surface flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white text-[13px] font-medium">Elite feature</p>
                    <p className="text-[11px] text-d-text-muted mt-0.5">
                      {publicLabel('debate_engine')} runs a bull vs. bear review on every high-stakes signal.
                    </p>
                  </div>
                  <Link
                    href="/pricing"
                    className="px-3 py-1.5 text-[11px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover transition-colors"
                  >
                    Upgrade
                  </Link>
                </div>
              )}
            </div>

            {/* PR 35 — Similar signals strip (history for the same symbol) */}
            {similar.length > 0 && (
              <div>
                <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted mb-2">
                  Prior signals on {signal.symbol}
                </h3>
                <div className="space-y-1">
                  {similar.map((s) => <PriorSignalRow key={s.id} s={s} />)}
                </div>
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="lg:col-span-4 space-y-5">
            {/* Execute panel */}
            <div className="trading-surface space-y-3">
              <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted">Levels</h3>

              <KV label="Entry" value={entry} color="#DADADA" />
              <KV label="Stop loss" value={stop} color="#FF5947" suffix={pctRisk ? `−${pctRisk.toFixed(2)}%` : undefined} />
              <KV label="Target 1" value={target} color="#05B878" suffix={pctUpside ? `+${pctUpside.toFixed(2)}%` : undefined} />
              {target2 > 0 && <KV label="Target 2" value={target2} color="#05B878" />}
              {target3 > 0 && <KV label="Target 3" value={target3} color="#05B878" />}

              {rr > 0 && (
                <div className="pt-2 border-t border-d-border flex items-center justify-between">
                  <span className="text-[11px] text-d-text-muted">Risk : Reward</span>
                  <span className="numeric text-white text-[13px] font-medium">
                    1 : {rr.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <button
                  onClick={() => setShowTrade(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover transition-colors"
                >
                  <Play className="w-3.5 h-3.5" />
                  Paper-trade
                </button>
                <button
                  onClick={() => setShowTrade(true)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 text-[12px] font-medium border border-d-border text-white rounded-md hover:bg-white/[0.03] transition-colors"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Live trade
                </button>
              </div>
              <p className="text-[10px] text-d-text-muted">
                Live trade requires Elite + connected broker. Paper-trade is free.
              </p>
            </div>

            {/* Metadata */}
            <div className="trading-surface space-y-2">
              <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted">Signal meta</h3>
              <MetaRow icon={Clock} label="Generated" value={formatTimeAgo(signal.generated_at ?? signal.created_at)} />
              <MetaRow icon={Shield} label="Strategy" value={strategy} />
              <MetaRow icon={Info} label="Regime at signal" value={regime ? regime : '—'} />
              {signal.lot_size && <MetaRow icon={Info} label="Lot size" value={String(signal.lot_size)} />}
              {(signal as any).expiry_date && (
                <MetaRow icon={Clock} label="Expiry" value={(signal as any).expiry_date} />
              )}
              {signal.strike_price && <MetaRow icon={Info} label="Strike" value={`₹${signal.strike_price}`} />}
              {signal.option_type && <MetaRow icon={Info} label="Option" value={signal.option_type} />}
            </div>

            {/* Alerts — wires to global push prefs (PR 82) */}
            <div className="trading-surface space-y-2">
              <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted flex items-center gap-1.5">
                <Bell className="w-3 h-3" />
                Push alerts
              </h3>
              {alertsLoading ? (
                <p className="text-[11px] text-d-text-muted">Loading preferences…</p>
              ) : (
                <>
                  <AlertToggle
                    label="When triggered"
                    checked={alertOnTrigger}
                    onChange={(v) => { setAlertOnTrigger(v); persistAlert('signal_triggered', v) }}
                  />
                  <AlertToggle
                    label="When target hit"
                    checked={alertOnTarget}
                    onChange={(v) => { setAlertOnTarget(v); persistAlert('target_hit', v) }}
                  />
                  <AlertToggle
                    label="When stop loss hit"
                    checked={alertOnSL}
                    onChange={(v) => { setAlertOnSL(v); persistAlert('sl_hit', v) }}
                  />
                </>
              )}
              {alertsError && (
                <p className="text-[10px] text-down pt-1">{alertsError}</p>
              )}
              <p className="text-[10px] text-d-text-muted pt-1">
                Global setting — applies to every signal.{' '}
                <Link href="/alerts" className="text-primary hover:underline">Full Alerts Studio</Link>
                {' '}covers Telegram/WhatsApp/email channels.
              </p>
            </div>

            {/* Reasons / decisions */}
            {reasons.length > 0 && (
              <div className="trading-surface space-y-2">
                <h3 className="text-[11px] uppercase tracking-wider text-d-text-muted">
                  Decision factors
                </h3>
                <ul className="space-y-1">
                  {reasons.slice(0, 6).map((r, i) => (
                    <li key={i} className="text-[12px] text-d-text-primary leading-snug">
                      · {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ── Quick trade modal ── */}
        {showTrade && (
          <QuickTrade
            isOpen={showTrade}
            onClose={() => setShowTrade(false)}
            onSubmit={async () => { setShowTrade(false) }}
            initialSymbol={signal.symbol}
            initialDirection={signal.direction}
            initialEntryPrice={entry}
            initialStopLoss={stop}
            initialTarget={target}
          />
        )}
      </div>
    </AppLayout>
  )
}

// -------------------------------------------------------------- subcomponents

function ConfidenceBar({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value))
  let color = '#FF5947'
  if (v >= 40) color = '#FEB113'
  if (v >= 65) color = '#4FECCD'
  if (v >= 85) color = '#FFD166'
  return (
    <div className="h-2 w-24 rounded-full bg-d-bg-elevated overflow-hidden">
      <div className="h-full transition-all duration-300" style={{ width: `${v}%`, background: color }} />
    </div>
  )
}

function KV({
  label,
  value,
  color,
  suffix,
}: {
  label: string
  value: number
  color: string
  suffix?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-d-text-muted">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className="numeric text-[13px] font-medium" style={{ color }}>
          ₹{value.toFixed(2)}
        </span>
        {suffix && (
          <span className="numeric text-[10px] text-d-text-muted">{suffix}</span>
        )}
      </div>
    </div>
  )
}

function MetaRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-[11px] text-d-text-muted">
        <Icon className="w-3 h-3" />
        {label}
      </span>
      <span className="text-[12px] text-white truncate max-w-[200px]">{value}</span>
    </div>
  )
}

function AlertToggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-d-text-primary">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-d-bg-elevated'}`}
        aria-label={label}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white transition-transform mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  )
}

function defaultExplanation(signal: Signal, reasons: string[]): string {
  const dir = signal.direction === 'LONG' ? 'bullish' : 'bearish'
  const r = reasons.slice(0, 3).join('; ')
  return [
    `What AI sees: ${signal.symbol} triggered a ${dir} setup with ${Math.round(signal.confidence)}% confidence. ${r || 'Multi-factor technical alignment detected.'}`,
    '',
    `Why now: Entry at ₹${num(signal.entry_price).toFixed(2)} reflects the optimal risk-adjusted level given current regime + strategy confluence.`,
    '',
    `What invalidates: A close below ₹${num(signal.stop_loss).toFixed(2)} cancels the setup. Exit discipline on SL is mandatory.`,
  ].join('\n')
}


/* ───────────────────── PR 35 — verdict banner + prior-signal row ───────────────────── */


function VerdictBanner({ debate }: { debate: DebatePayload }) {
  const copy: Record<string, { label: string; color: string }> = {
    enter:     { label: 'Enter',        color: '#05B878' },
    half_size: { label: 'Enter · half', color: '#4FECCD' },
    wait:      { label: 'Wait',         color: '#FEB113' },
    skip:      { label: 'Skip',         color: '#FF5947' },
  }
  const meta = copy[debate.decision] || { label: debate.decision, color: '#DADADA' }
  return (
    <div
      className="mt-3 rounded-md border px-4 py-3 flex flex-wrap items-center justify-between gap-3"
      style={{ borderColor: `${meta.color}55`, background: `${meta.color}10` }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <ModelBadge modelKey="debate_engine" size="sm" variant="soft" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold" style={{ color: meta.color }}>
            Verdict: {meta.label}
            <span className="text-d-text-muted font-normal text-[11px] ml-2 numeric">
              conf {debate.confidence}%
            </span>
          </p>
          {debate.summary && (
            <p className="text-[11px] text-d-text-secondary mt-0.5 line-clamp-2">
              {debate.summary}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}


function PriorSignalRow({ s }: { s: Signal & Record<string, any> }) {
  const pnlPct = num(s.final_pnl_pct ?? s.pnl_percent)
  const status = s.status || 'unknown'
  const color =
    status === 'target_hit' ? '#05B878'
      : status === 'sl_hit' || status === 'stop_loss_hit' ? '#FF5947'
        : '#8e8e8e'
  return (
    <Link
      href={`/signals/${s.id}`}
      className="flex items-center gap-3 px-3 py-2 rounded-md bg-[#0A0D14] border border-d-border hover:border-d-border-hover transition-colors"
    >
      <span className="text-[10px] uppercase tracking-wider text-d-text-muted w-20">
        {s.direction}
      </span>
      <span className="text-[11px] text-d-text-secondary numeric w-24">
        {formatTimeAgo(s.created_at ?? s.generated_at)}
      </span>
      <span className="text-[11px] capitalize flex-1 truncate" style={{ color }}>
        {status.replace(/_/g, ' ')}
      </span>
      {Number.isFinite(pnlPct) && pnlPct !== 0 && (
        <span
          className="numeric text-[12px] font-semibold shrink-0"
          style={{ color: pnlPct >= 0 ? '#05B878' : '#FF5947' }}
        >
          {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
        </span>
      )}
    </Link>
  )
}
