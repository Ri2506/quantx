'use client'

/**
 * /auto-trader — F4 flagship dashboard (Elite).
 *
 * Step 4 §5.3 spec. Four sections top-to-bottom:
 *   1. Status strip       — enabled · paused · broker · regime · VIX band
 *   2. Config card        — risk profile slider + safety rails
 *   3. Recent trades log  — last-7d live auto-trader actions
 *   4. Emergency controls — pause toggle + kill switch
 *
 * Backend surface: ``api.autoTrader.*``. The FinRL-X engine that
 * *drives* these trades is F4 deferred work; this surface reads the
 * state it will populate.
 *
 * On HTTP 402 tier-gate the platform error-boundary renders the
 * UpgradeModal — nothing extra needed here.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  Gauge,
  PauseCircle,
  PlayCircle,
  Power,
  Settings2,
  ShieldAlert,
  TrendingUp,
  Zap,
} from 'lucide-react'

import { api } from '@/lib/api'
import { handleApiError } from '@/lib/api'

type Status = Awaited<ReturnType<typeof api.autoTrader.status>>
type Config = Status['config']
type TradeRow = Awaited<ReturnType<typeof api.autoTrader.trades>>[number]
type Weekly = Awaited<ReturnType<typeof api.autoTrader.weekly>>
type RebalanceRun = Awaited<ReturnType<typeof api.autoTrader.runs>>[number]

const VIX_BAND_COPY: Record<string, { label: string; color: string }> = {
  calm:      { label: 'Calm · VIX <15',       color: '#05B878' },
  normal:    { label: 'Normal · VIX 15-18',   color: '#4FECCD' },
  elevated:  { label: 'Elevated · VIX 18-22', color: '#FEB113' },
  high:      { label: 'High · VIX 22-27',     color: '#FF9900' },
  stressed:  { label: 'Stressed · VIX 27-35', color: '#FF5947' },
  panic:     { label: 'Panic · VIX >35',      color: '#D63434' },
}

const REGIME_COLORS: Record<string, string> = {
  bull:     '#05B878',
  sideways: '#FEB113',
  bear:     '#FF5947',
}


export default function AutoTraderPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [trades, setTrades] = useState<TradeRow[]>([])
  const [weekly, setWeekly] = useState<Weekly | null>(null)
  const [runs, setRuns] = useState<RebalanceRun[]>([])
  // PR 133 — today's plan + diagnostics; nullable until first /plan/today fetch.
  const [todayPlan, setTodayPlan] = useState<Awaited<ReturnType<typeof api.autoTrader.todayPlan>> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)
  const [killing, setKilling] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [draftCfg, setDraftCfg] = useState<Config | null>(null)

  const refresh = async () => {
    try {
      const [s, t, w, r, p] = await Promise.all([
        api.autoTrader.status(),
        api.autoTrader.trades(7).catch(() => []),
        api.autoTrader.weekly().catch(() => null),
        api.autoTrader.runs(10).catch(() => []),
        api.autoTrader.todayPlan().catch(() => null),
      ])
      setStatus(s)
      setDraftCfg(s.config)
      setTrades(t || [])
      setWeekly(w)
      setRuns(r || [])
      setTodayPlan(p)
      setError(null)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const onToggle = async () => {
    if (!status) return
    setToggling(true)
    try {
      await api.autoTrader.toggle(!status.enabled)
      await refresh()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setToggling(false)
    }
  }

  const onKill = async () => {
    if (!confirm('Emergency kill: close ALL live positions and pause auto-trader. Continue?')) return
    setKilling(true)
    try {
      await api.autoTrader.killSwitch()
      await refresh()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setKilling(false)
    }
  }

  const onSaveConfig = async () => {
    if (!draftCfg) return
    setSavingCfg(true)
    try {
      const updated = await api.autoTrader.updateConfig(draftCfg)
      setStatus((s) => (s ? { ...s, config: updated } : s))
      setDraftCfg(updated)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setSavingCfg(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-10">
        <div className="text-[13px] text-d-text-muted">Loading auto-trader…</div>
      </div>
    )
  }

  if (error || !status) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-10">
        <div className="rounded-lg border border-d-border bg-[#111520] p-5">
          <p className="text-[13px] text-down">{error || 'Failed to load'}</p>
        </div>
      </div>
    )
  }

  const dirty = draftCfg && JSON.stringify(draftCfg) !== JSON.stringify(status.config)
  const active = status.enabled && !status.paused
  const band = status.vix_band ? VIX_BAND_COPY[status.vix_band] : null

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* ── Title ── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
            <Bot className="w-5 h-5 text-primary" />
            Auto-Trader
            <span className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 bg-[rgba(255,209,102,0.10)] text-[#FFD166] border border-[rgba(255,209,102,0.45)]">
              Elite
            </span>
          </h1>
          <p className="text-[12px] text-d-text-muted mt-0.5">
            AutoPilot ensemble · daily rebalance 15:45 IST · RegimeIQ + VolCast risk overlay
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill active={active} paused={status.paused} enabled={status.enabled} />
        </div>
      </header>

      {/* ── 1. Status strip ── */}
      <section className="grid grid-cols-2 md:grid-cols-5 divide-x divide-d-border rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        <Cell label="Broker" value={status.broker_connected ? (status.broker_name || '—') : 'Not connected'}
              accent={status.broker_connected ? '#05B878' : '#FF5947'}
              sub={status.broker_connected ? 'Live' : 'Connect to trade'} />
        <Cell label="Open positions" value={String(status.open_positions)} />
        <Cell label="Today trades" value={String(status.today_trades)} />
        <Cell
          label="Today P&L"
          value={`${status.today_pnl_pct >= 0 ? '+' : ''}${status.today_pnl_pct.toFixed(2)}%`}
          accent={status.today_pnl_pct >= 0 ? '#05B878' : '#FF5947'}
        />
        <Cell
          label="Last rebalance"
          value={status.last_run_at ? new Date(status.last_run_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
          sub={status.last_run_at ? new Date(status.last_run_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : undefined}
        />
      </section>

      {/* ── Regime + VIX risk overlay ── */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Panel title="Market Regime" icon={TrendingUp}>
          {status.regime ? (
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-md flex items-center justify-center"
                style={{
                  background: `${REGIME_COLORS[status.regime.name] || '#4FECCD'}18`,
                  border: `1px solid ${REGIME_COLORS[status.regime.name] || '#4FECCD'}35`,
                }}
              >
                <Gauge className="w-5 h-5" style={{ color: REGIME_COLORS[status.regime.name] || '#4FECCD' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold text-white capitalize">
                  {status.regime.name}
                </p>
                <p className="text-[11px] text-d-text-muted numeric">
                  bull {(status.regime.prob_bull * 100).toFixed(0)}% ·
                  sideways {(status.regime.prob_sideways * 100).toFixed(0)}% ·
                  bear {(status.regime.prob_bear * 100).toFixed(0)}%
                </p>
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-d-text-muted">Regime not available</p>
          )}
        </Panel>

        <Panel title="VIX Risk Overlay" icon={ShieldAlert}>
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-white">
                {band ? band.label : 'VIX data unavailable'}
              </p>
              <p className="text-[11px] text-d-text-muted">
                Auto-trader will deploy <span className="numeric font-semibold" style={{ color: band?.color || '#4FECCD' }}>
                  {status.equity_scaler_pct}%
                </span> of equity capital · rest in cash
              </p>
            </div>
            <div className="w-24 h-2 bg-[#0A0D14] rounded-full overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${status.equity_scaler_pct}%`,
                  background: band?.color || '#4FECCD',
                }}
              />
            </div>
          </div>
        </Panel>
      </section>

      {/* ── 2. Config card ── */}
      {draftCfg && (
        <section className="rounded-xl border border-d-border bg-[#111520] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[14px] font-semibold text-white flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-primary" />
              Safety Rails
            </h2>
            {dirty && (
              <button
                onClick={onSaveConfig}
                disabled={savingCfg}
                className="px-4 py-1.5 bg-primary text-black rounded-md text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-60"
              >
                {savingCfg ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>

          {/* Risk profile radio */}
          <div className="mb-5">
            <label className="block text-[11px] uppercase tracking-wider text-d-text-muted mb-2">Risk profile</label>
            <div className="grid grid-cols-3 gap-2">
              {(['conservative', 'moderate', 'aggressive'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setDraftCfg({ ...draftCfg, risk_profile: p })}
                  className={`px-3 py-2 rounded-md text-[12px] font-medium border transition-colors ${
                    draftCfg.risk_profile === p
                      ? 'bg-primary/10 border-primary/50 text-primary'
                      : 'bg-[#0A0D14] border-d-border text-d-text-secondary hover:border-d-border-hover'
                  }`}
                >
                  <span className="capitalize">{p}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sliders */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <SliderField
              label="Max position size"
              sub="% of portfolio per holding"
              value={draftCfg.max_position_pct}
              min={1}
              max={25}
              step={0.5}
              unit="%"
              onChange={(v) => setDraftCfg({ ...draftCfg, max_position_pct: v })}
            />
            <SliderField
              label="Daily loss limit"
              sub="auto-pause below this drawdown"
              value={draftCfg.daily_loss_limit_pct}
              min={0.5}
              max={10}
              step={0.25}
              unit="%"
              onChange={(v) => setDraftCfg({ ...draftCfg, daily_loss_limit_pct: v })}
            />
            <SliderField
              label="Max concurrent positions"
              sub="positions open at once"
              value={draftCfg.max_concurrent_positions}
              min={1}
              max={30}
              step={1}
              unit=""
              onChange={(v) => setDraftCfg({ ...draftCfg, max_concurrent_positions: Math.round(v) })}
            />
          </div>

          <div className="mt-5 pt-4 border-t border-d-border flex items-center justify-between">
            <div>
              <p className="text-[12px] text-white font-medium">Allow F&O strategies</p>
              <p className="text-[10px] text-d-text-muted">Auto-trade options + futures (F6 engine)</p>
            </div>
            <Toggle
              on={draftCfg.allow_fno}
              onChange={(v) => setDraftCfg({ ...draftCfg, allow_fno: v })}
            />
          </div>
        </section>
      )}

      {/* ── Weekly summary ── */}
      {weekly && weekly.trades_closed > 0 && (
        <section className="rounded-xl border border-d-border bg-[#111520] p-5">
          <h2 className="text-[14px] font-semibold text-white mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            Last 7 days
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-[12px]">
            <Stat label="Trades" value={String(weekly.trades_executed)} />
            <Stat label="Closed" value={String(weekly.trades_closed)} />
            <Stat
              label="Win rate"
              value={`${(weekly.win_rate * 100).toFixed(0)}%`}
              accent={weekly.win_rate >= 0.5 ? '#05B878' : '#FEB113'}
            />
            <Stat
              label="Return"
              value={`${weekly.total_pnl_pct >= 0 ? '+' : ''}${weekly.total_pnl_pct.toFixed(2)}%`}
              accent={weekly.total_pnl_pct >= 0 ? '#05B878' : '#FF5947'}
            />
            <Stat
              label="Net P&L"
              value={`₹${(weekly.net_pnl / 1000).toFixed(1)}k`}
              accent={weekly.net_pnl >= 0 ? '#05B878' : '#FF5947'}
            />
          </div>
        </section>
      )}

      {/* ── PR 69 — Rebalance log: every tick the engine fires, even
              when no trade results. Empty by default until the F4
              FinRL-X scheduler job lands. ── */}
      <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        <div className="px-5 py-3 border-b border-d-border flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white">Rebalance log · last 10 ticks</h2>
          <span className="text-[10px] uppercase tracking-wider text-d-text-muted">
            Daily 15:45 IST
          </span>
        </div>
        {runs.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-[12px] text-d-text-muted">
              No rebalance ticks yet. The engine runs every weekday at 15:45 IST once auto-trading is enabled.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-d-border">
            {runs.map((r) => (
              <RebalanceRow key={r.id} r={r} />
            ))}
          </div>
        )}
      </section>

      {/* ── PR 133 — Today's plan + overlay diagnostics ── */}
      {todayPlan && todayPlan.ran_at && (
        <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
          <div className="px-5 py-3 border-b border-d-border flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-white">
              Today&rsquo;s plan
              {todayPlan.regime && (
                <span className="ml-2 text-[11px] text-d-text-muted capitalize">· {todayPlan.regime} regime</span>
              )}
            </h2>
            <span className="text-[11px] text-d-text-muted">
              {new Date(todayPlan.ran_at).toLocaleTimeString()}
            </span>
          </div>
          <div className="p-5 space-y-4">
            {todayPlan.diagnostics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
                {typeof todayPlan.diagnostics.vix_level === 'number' && (
                  <Stat label="VIX" value={todayPlan.diagnostics.vix_level.toFixed(2)} />
                )}
                {typeof todayPlan.diagnostics.vix_exposure_cap === 'number' && (
                  <Stat label="VIX exposure cap" value={`${(todayPlan.diagnostics.vix_exposure_cap * 100).toFixed(0)}%`} />
                )}
                {typeof todayPlan.diagnostics.applied_scale === 'number' && (
                  <Stat label="Scale applied" value={`${(todayPlan.diagnostics.applied_scale * 100).toFixed(0)}%`} />
                )}
                {typeof todayPlan.diagnostics.var_95_inr === 'number' && (
                  <Stat
                    label="95% VaR (1d)"
                    value={`₹${todayPlan.diagnostics.var_95_inr.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
                    accent={todayPlan.diagnostics.var_capped ? '#FEB113' : undefined}
                  />
                )}
              </div>
            )}
            {Object.keys(todayPlan.target_weights || {}).length > 0 ? (
              <ul className="divide-y divide-d-border rounded border border-d-border">
                {Object.entries(todayPlan.target_weights)
                  .filter(([, w]) => w > 0)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 12)
                  .map(([sym, w]) => (
                    <li key={sym} className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]">
                      <span className="font-mono text-white">{sym}</span>
                      <div className="flex-1 mx-3 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${Math.min(100, w * 100)}%` }} />
                      </div>
                      <span className="numeric text-d-text-muted w-12 text-right">{(w * 100).toFixed(1)}%</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-[12px] text-d-text-muted">
                AutoPilot decided to hold cash — every weight is below the trade-fire threshold.
              </p>
            )}
          </div>
        </section>
      )}

      {/* ── 3. Recent trades ── */}
      <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        <div className="px-5 py-3 border-b border-d-border flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white">Recent auto-trader actions · last 7 days</h2>
          <Link href="/trades" className="text-[11px] text-primary hover:underline">Full journal →</Link>
        </div>
        {trades.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[13px] text-d-text-muted">
              {status.enabled
                ? 'Auto-trader is on. No live trades in the last 7 days — waiting on the next signal gate.'
                : 'Auto-trader is off. Enable it above to let the AI execute live trades on your broker.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-d-border">
            {trades.map((t) => (
              <TradeRowView key={t.id} t={t} />
            ))}
          </div>
        )}
      </section>

      {/* ── 4. Emergency controls ── */}
      <section className="rounded-xl border border-[rgba(255,89,71,0.35)] bg-[#1a0b0b] p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-md bg-[rgba(255,89,71,0.15)] border border-[rgba(255,89,71,0.35)] flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-down" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-white">Emergency controls</h2>
            <p className="text-[12px] text-d-text-muted mt-0.5">
              Pause the AI or close everything instantly. Pausing leaves open positions alone.
              Kill switch closes all live positions and disables auto-trading until you re-enable.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={onToggle}
                disabled={toggling}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                  active
                    ? 'bg-[rgba(255,153,0,0.12)] border border-[rgba(255,153,0,0.45)] text-[#FF9900] hover:bg-[rgba(255,153,0,0.18)]'
                    : 'bg-primary text-black hover:bg-primary-hover'
                }`}
              >
                {active ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                {toggling ? '…' : active ? 'Pause auto-trader' : status.broker_connected ? 'Enable auto-trader' : 'Connect broker first'}
              </button>
              <button
                onClick={onKill}
                disabled={killing || status.open_positions === 0}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md text-[12px] font-semibold bg-down/10 border border-down/40 text-down hover:bg-down/20 disabled:opacity-60"
              >
                <Power className="w-4 h-4" />
                {killing ? '…' : 'Kill switch: close ALL positions'}
              </button>
              {!status.broker_connected && (
                <Link
                  href="/settings"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-d-border rounded-md text-[12px] text-white hover:bg-white/[0.03]"
                >
                  Connect broker →
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <p className="text-[10px] text-d-text-muted text-center">
        Auto-trader executes real orders through your connected broker. Past performance ≠ future results.
        You control all risk rails. SEBI-compliant educational tool.
      </p>
    </div>
  )
}


/* ───────────────────────── helpers ───────────────────────── */


function StatusPill({ active, paused, enabled }: { active: boolean; paused: boolean; enabled: boolean }) {
  if (paused) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border border-down/40 bg-down/10 text-down">
        <AlertTriangle className="w-3 h-3" />
        Kill switch active
      </span>
    )
  }
  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border border-up/40 bg-up/10 text-up">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-up opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-up" />
        </span>
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border border-d-border bg-[#0A0D14] text-d-text-muted">
      <PauseCircle className="w-3 h-3" />
      {enabled ? 'Paused' : 'Off'}
    </span>
  )
}


function Cell({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string | number
  sub?: string
  accent?: string
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-1">{label}</p>
      <p
        className="numeric text-[16px] font-semibold"
        style={{ color: accent || '#FFFFFF' }}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-d-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}


function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-d-border bg-[#111520] p-5">
      <p className="text-[10px] uppercase tracking-wider text-d-text-muted mb-3 flex items-center gap-1.5">
        <Icon className="w-3 h-3" />
        {title}
      </p>
      {children}
    </div>
  )
}


function SliderField({
  label,
  sub,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  sub: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-end justify-between mb-1">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-d-text-muted">{label}</p>
          <p className="text-[10px] text-d-text-muted">{sub}</p>
        </div>
        <p className="numeric text-[15px] font-semibold text-white">
          {value}{unit}
        </p>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-[9px] text-d-text-muted mt-0.5">
        <span>{min}{unit}</span>
        <span>{max}{unit}</span>
      </div>
    </div>
  )
}


function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        on ? 'bg-primary/70' : 'bg-d-border'
      }`}
      aria-pressed={on}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          on ? 'translate-x-5' : ''
        }`}
      />
    </button>
  )
}


function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-md bg-[#0A0D14] border border-d-border px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-d-text-muted">{label}</p>
      <p className="numeric text-[15px] font-semibold mt-0.5" style={{ color: accent || '#FFFFFF' }}>
        {value}
      </p>
    </div>
  )
}


function RebalanceRow({ r }: { r: RebalanceRun }) {
  const fired = r.trades_executed > 0
  const stamp = (() => {
    try {
      const d = new Date(r.ran_at)
      return `${d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
    } catch { return r.ran_at }
  })()
  const regimeColor = r.regime ? REGIME_COLORS[r.regime] : '#8e8e8e'
  const bandColor = r.vix_band && VIX_BAND_COPY[r.vix_band] ? VIX_BAND_COPY[r.vix_band].color : '#8e8e8e'
  return (
    <div className="px-5 py-3 hover:bg-white/[0.02] transition-colors">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="numeric text-[12px] text-white">{stamp}</span>
            {r.regime && (
              <span
                className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border capitalize"
                style={{ color: regimeColor, borderColor: `${regimeColor}55`, background: `${regimeColor}14` }}
              >
                {r.regime}
              </span>
            )}
            {r.vix_band && (
              <span
                className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border capitalize"
                style={{ color: bandColor, borderColor: `${bandColor}55`, background: `${bandColor}14` }}
              >
                {r.vix_band} · {r.equity_scaler_pct ?? '—'}%
              </span>
            )}
          </div>
          {r.summary && (
            <p className="text-[11px] text-d-text-secondary mt-1 leading-relaxed">{r.summary}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-wider text-d-text-muted">Trades fired</p>
          <p
            className="numeric text-[14px] font-semibold mt-0.5"
            style={{ color: fired ? '#05B878' : '#8e8e8e' }}
          >
            {r.trades_executed}/{r.actions_count}
          </p>
        </div>
      </div>
    </div>
  )
}


function TradeRowView({ t }: { t: TradeRow }) {
  const pnl = t.pnl_percent ?? 0
  const pnlColor = pnl >= 0 ? '#05B878' : '#FF5947'
  const closed = t.status === 'closed'
  return (
    <div className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-white">{t.symbol}</span>
          <span
            className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
              t.direction === 'LONG'
                ? 'bg-up/10 text-up border border-up/30'
                : 'bg-down/10 text-down border border-down/30'
            }`}
          >
            {t.direction}
          </span>
          <span className="text-[9px] uppercase tracking-wider text-d-text-muted">{t.status}</span>
        </div>
        <p className="text-[10px] text-d-text-muted mt-0.5 numeric">
          qty {t.quantity} ·
          {t.entry_price ? ` entry ₹${t.entry_price.toFixed(2)}` : ''}
          {closed && t.exit_price ? ` · exit ₹${t.exit_price.toFixed(2)}` : ''}
        </p>
      </div>
      {closed ? (
        <div className="text-right">
          <p className="numeric text-[13px] font-semibold" style={{ color: pnlColor }}>
            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
          </p>
          {t.net_pnl != null && (
            <p className="text-[10px] text-d-text-muted numeric">
              ₹{t.net_pnl.toFixed(0)}
            </p>
          )}
        </div>
      ) : (
        <CheckCircle className="w-4 h-4 text-primary" />
      )}
    </div>
  )
}
