'use client'

/**
 * /ai-portfolio — F5 AI SIP (Elite) dashboard.
 *
 * Step 4 §5.3 spec: monthly-rebalanced quality portfolio of 6-20 stocks.
 * Qlib Alpha158 screen → Black-Litterman optimizer with TimesFM+Chronos
 * priors → 7% per-asset cap.
 *
 * Scheduler runs last Sunday of the month at 00:00 IST
 * (``ai_portfolio_monthly_rebalance``). This page reads what the loop
 * has produced and lets the user preview the next one.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Calendar,
  PieChart,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Target,
  Wallet,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'

type Status = Awaited<ReturnType<typeof api.aiPortfolio.status>>
type Holding = Awaited<ReturnType<typeof api.aiPortfolio.holdings>>[number]
type Proposal = Awaited<ReturnType<typeof api.aiPortfolio.proposal>>


export default function AiPortfolioPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toggling, setToggling] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [preview, setPreview] = useState<Proposal | null>(null)

  const refresh = async () => {
    try {
      const [s, h, p] = await Promise.all([
        api.aiPortfolio.status(),
        api.aiPortfolio.holdings().catch(() => []),
        api.aiPortfolio.proposal().catch(() => null),
      ])
      setStatus(s)
      setHoldings(h || [])
      setProposal(p)
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
      await api.aiPortfolio.toggle(!status.enabled)
      await refresh()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setToggling(false)
    }
  }

  const onPreview = async () => {
    setPreviewing(true)
    try {
      const p = await api.aiPortfolio.previewRebalance()
      setPreview(p)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setPreviewing(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-10">
        <div className="text-[13px] text-d-text-muted">Loading AI portfolio…</div>
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

  const nextDate = new Date(status.next_rebalance_at)
  const lastDate = status.last_rebalanced_at ? new Date(status.last_rebalanced_at) : null

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-6">
      {/* ── Header ── */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            AI Portfolio
            <span className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 bg-[rgba(255,209,102,0.10)] text-[#FFD166] border border-[rgba(255,209,102,0.45)]">
              Elite
            </span>
          </h1>
          <p className="text-[12px] text-d-text-muted mt-0.5">
            AlphaRank quality screen · AllocIQ optimizer · 6-20 positions · 7% per-asset cap · monthly rebalance
          </p>
        </div>
        <StatusPill enabled={status.enabled} />
      </header>

      {/* ── Status strip ── */}
      <section className="grid grid-cols-2 md:grid-cols-4 divide-x divide-d-border rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        <Cell
          label="Holdings"
          value={String(status.holdings_count)}
          sub={status.holdings_count ? 'positions' : 'awaiting seed'}
        />
        <Cell
          label="Last rebalance"
          value={lastDate ? lastDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
          sub={lastDate ? lastDate.toLocaleDateString('en-IN', { year: 'numeric' }) : 'never'}
        />
        <Cell
          label="Next rebalance"
          value={nextDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          sub="00:00 IST · last Sun"
          accent="#4FECCD"
        />
        <Cell
          label="Top position"
          value={status.top_position ? status.top_position.symbol : '—'}
          sub={status.top_position ? `${(status.top_position.target_weight * 100).toFixed(1)}%` : undefined}
        />
      </section>

      {/* PR 72 — Sector allocation breakdown */}
      {holdings.length > 0 && (
        <SectorAllocationCard holdings={holdings} />
      )}

      {/* ── Notes banner ── */}
      {status.notes.length > 0 && (
        <section className="rounded-lg border border-[rgba(254,177,19,0.35)] bg-[rgba(254,177,19,0.06)] px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-[#FEB113] mt-0.5 shrink-0" />
          <div className="text-[12px] text-d-text-secondary space-y-0.5">
            {status.notes.map((n, i) => (
              <p key={i}>{n}</p>
            ))}
          </div>
        </section>
      )}

      {/* ── Holdings ── */}
      <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        <div className="px-5 py-3 border-b border-d-border flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white flex items-center gap-2">
            <PieChart className="w-4 h-4 text-primary" />
            Current allocation
          </h2>
          {lastDate && (
            <span className="text-[10px] text-d-text-muted">
              as of {lastDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
        {holdings.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[13px] text-d-text-muted">
              {status.enabled
                ? 'Portfolio will be seeded on the next rebalance — last Sunday of the month, 00:00 IST.'
                : 'Enable AI Portfolio to join the monthly rebalance loop.'}
            </p>
            {!status.enabled && (
              <button
                onClick={onToggle}
                disabled={toggling}
                className="mt-4 px-4 py-2 bg-primary text-black rounded-md text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-60"
              >
                {toggling ? '…' : 'Enable AI Portfolio'}
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-d-border">
            {holdings.map((h) => <HoldingRowView key={h.symbol} h={h} />)}
          </div>
        )}
      </section>

      {/* ── Next rebalance preview ── */}
      <section className="rounded-xl border border-d-border bg-[#111520] p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Next rebalance · dry-run preview
          </h2>
          <button
            onClick={onPreview}
            disabled={previewing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-d-border text-[11px] text-white hover:bg-white/[0.03] disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${previewing ? 'animate-spin' : ''}`} />
            {previewing ? 'Computing…' : preview ? 'Refresh' : 'Run now'}
          </button>
        </div>
        {preview ? (
          <ProposalView p={preview} />
        ) : (
          <p className="text-[12px] text-d-text-muted">
            Click <span className="text-white">Run now</span> to compute what the next rebalance would propose with today's data.
            Does not change your portfolio.
          </p>
        )}
      </section>

      {/* ── Enable / disable loop ── */}
      <section className="rounded-xl border border-d-border bg-[#111520] p-5">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-white">Monthly rebalance loop</h2>
            <p className="text-[12px] text-d-text-muted mt-0.5">
              {status.enabled
                ? 'You are in the rebalance loop. Holdings update on the last Sunday of each month.'
                : 'Not subscribed — your portfolio will not rebalance until you enable.'}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={onToggle}
                disabled={toggling}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12px] font-semibold transition-colors disabled:opacity-60 ${
                  status.enabled
                    ? 'bg-[rgba(255,153,0,0.12)] border border-[rgba(255,153,0,0.45)] text-[#FF9900] hover:bg-[rgba(255,153,0,0.18)]'
                    : 'bg-primary text-black hover:bg-primary-hover'
                }`}
              >
                <PlayCircle className="w-4 h-4" />
                {toggling ? '…' : status.enabled ? 'Disable rebalance loop' : 'Enable AI Portfolio'}
              </button>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-d-text-muted">
                <Calendar className="w-3 h-3" />
                next run {nextDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </section>

      {proposal && holdings.length > 0 && proposal.metrics?.expected_annual_return != null && (
        <section className="rounded-xl border border-d-border bg-[#111520] p-5">
          <h2 className="text-[14px] font-semibold text-white mb-3">Portfolio metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            <MetricStat
              label="Expected annual"
              value={`${(Number(proposal.metrics.expected_annual_return) * 100).toFixed(1)}%`}
              accent="#05B878"
            />
            {proposal.metrics.volatility != null && (
              <MetricStat
                label="Volatility"
                value={`${(Number(proposal.metrics.volatility) * 100).toFixed(1)}%`}
              />
            )}
            {proposal.metrics.sharpe != null && (
              <MetricStat
                label="Sharpe"
                value={Number(proposal.metrics.sharpe).toFixed(2)}
                accent={Number(proposal.metrics.sharpe) >= 1 ? '#05B878' : '#FEB113'}
              />
            )}
            {proposal.metrics.expected_5d_return != null && (
              <MetricStat
                label="Expected 5d"
                value={`${(Number(proposal.metrics.expected_5d_return) * 100).toFixed(2)}%`}
                accent={Number(proposal.metrics.expected_5d_return) >= 0 ? '#05B878' : '#FF5947'}
              />
            )}
          </div>
        </section>
      )}

      <p className="text-[10px] text-d-text-muted text-center">
        AI Portfolio proposes allocations — execution happens on your connected broker or is displayed for manual action.
        Past performance ≠ future results. SEBI-compliant educational tool.
      </p>
    </div>
  )
}


/* ───────────────────────── helpers ───────────────────────── */


function StatusPill({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border border-up/40 bg-up/10 text-up">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-up opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-up" />
        </span>
        Subscribed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border border-d-border bg-[#0A0D14] text-d-text-muted">
      Off
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
      <p className="numeric text-[16px] font-semibold" style={{ color: accent || '#FFFFFF' }}>{value}</p>
      {sub && <p className="text-[10px] text-d-text-muted mt-0.5">{sub}</p>}
    </div>
  )
}


function HoldingRowView({ h }: { h: Holding }) {
  const target = h.target_weight * 100
  const cur = h.current_weight != null ? h.current_weight * 100 : null
  const drift = h.drift_pct
  const driftColor = drift == null ? '#8e8e8e' : Math.abs(drift) < 0.5 ? '#05B878' : Math.abs(drift) < 2 ? '#FEB113' : '#FF5947'
  return (
    <div className="px-5 py-3 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
      <div className="flex-1 min-w-0">
        <Link
          href={`/stock/${h.symbol.replace('.NS', '')}`}
          className="text-[13px] font-semibold text-white hover:text-primary"
        >
          {h.symbol.replace('.NS', '')}
        </Link>
        <div className="mt-1 relative h-1 bg-[#0A0D14] rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-primary/60"
            style={{ width: `${Math.min(target, 100)}%` }}
          />
        </div>
      </div>
      <div className="text-right shrink-0 w-20">
        <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Target</p>
        <p className="numeric text-[13px] font-semibold text-white">{target.toFixed(2)}%</p>
      </div>
      <div className="text-right shrink-0 w-20">
        <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Current</p>
        <p className="numeric text-[13px] font-semibold text-white">
          {cur != null ? `${cur.toFixed(2)}%` : '—'}
        </p>
      </div>
      <div className="text-right shrink-0 w-16">
        <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Drift</p>
        <p className="numeric text-[12px] font-semibold" style={{ color: driftColor }}>
          {drift == null ? '—' : `${drift >= 0 ? '+' : ''}${drift.toFixed(2)}%`}
        </p>
      </div>
      <div className="text-right shrink-0 w-12">
        <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Qty</p>
        <p className="numeric text-[12px] text-d-text-secondary">{h.qty}</p>
      </div>
    </div>
  )
}


function ProposalView({ p }: { p: Proposal }) {
  const rows = Object.entries(p.weights).sort((a, b) => b[1] - a[1])
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] mb-3">
        <MetricStat label="Candidates" value={String(p.n_candidates)} />
        <MetricStat label="Positions" value={String(p.n_positions)} />
        {p.metrics?.top_position && (
          <MetricStat
            label="Top"
            value={p.metrics.top_position.symbol?.replace('.NS', '') || '—'}
            sub={p.metrics.top_position.weight ? `${(p.metrics.top_position.weight * 100).toFixed(1)}%` : undefined}
          />
        )}
        {p.metrics?.expected_5d_return != null && (
          <MetricStat
            label="Expected 5d"
            value={`${(Number(p.metrics.expected_5d_return) * 100).toFixed(2)}%`}
            accent={Number(p.metrics.expected_5d_return) >= 0 ? '#05B878' : '#FF5947'}
          />
        )}
      </div>
      <div className="rounded-md bg-[#0A0D14] border border-d-border divide-y divide-d-border max-h-[280px] overflow-y-auto">
        {rows.map(([sym, w]) => (
          <div key={sym} className="px-3 py-2 flex items-center gap-3">
            <span className="text-[12px] text-white flex-1 min-w-0 truncate">{sym.replace('.NS', '')}</span>
            <div className="flex-1 relative h-1 bg-[#111520] rounded-full overflow-hidden max-w-[200px]">
              <div
                className="absolute top-0 left-0 h-full bg-primary/60"
                style={{ width: `${Math.min(w * 100, 100)}%` }}
              />
            </div>
            <span className="numeric text-[12px] text-white w-14 text-right">{(w * 100).toFixed(2)}%</span>
          </div>
        ))}
      </div>
      {p.notes.length > 0 && (
        <div className="mt-3 text-[10px] text-d-text-muted space-y-0.5">
          {p.notes.map((n, i) => (
            <p key={i}>· {n}</p>
          ))}
        </div>
      )}
    </div>
  )
}


function SectorAllocationCard({ holdings }: { holdings: Holding[] }) {
  // Roll up target_weight by sector; group missing/null sector under
  // "Uncategorized" rather than dropping it so the bar always sums to
  // 100%. Sort descending by weight for a clean cascading view.
  const buckets = useMemo(() => {
    const by: Record<string, number> = {}
    for (const h of holdings) {
      const key = h.sector || 'Uncategorized'
      by[key] = (by[key] || 0) + (h.target_weight || 0)
    }
    return Object.entries(by)
      .map(([sector, weight]) => ({ sector, weight }))
      .sort((a, b) => b.weight - a.weight)
  }, [holdings])

  if (buckets.length === 0) return null
  const total = buckets.reduce((s, b) => s + b.weight, 0) || 1

  // Static palette — wraps after 7 sectors, deterministic per-sector ordering.
  const palette = ['#4FECCD', '#7383FF', '#FEB113', '#05B878', '#FF7B5C', '#9973FF', '#21C1F2']
  const concentration = buckets[0].weight / total
  const concentrationLabel =
    concentration >= 0.55 ? { text: 'Highly concentrated', color: '#FF5947' } :
    concentration >= 0.40 ? { text: 'Sector-skewed',       color: '#FEB113' } :
                            { text: 'Diversified',          color: '#05B878' }

  return (
    <section className="rounded-xl border border-d-border bg-[#111520] p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[14px] font-semibold text-white flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" />
          Sector allocation
        </h2>
        <span
          className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border"
          style={{
            color: concentrationLabel.color,
            borderColor: `${concentrationLabel.color}55`,
            background: `${concentrationLabel.color}14`,
          }}
        >
          {concentrationLabel.text}
        </span>
      </div>

      {/* Stacked horizontal bar */}
      <div className="flex h-3 rounded-full overflow-hidden bg-[#0A0D14] border border-d-border">
        {buckets.map((b, i) => (
          <div
            key={b.sector}
            title={`${b.sector} · ${((b.weight / total) * 100).toFixed(1)}%`}
            style={{
              width: `${(b.weight / total) * 100}%`,
              background: palette[i % palette.length],
            }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {buckets.map((b, i) => (
          <div key={b.sector} className="flex items-center gap-2 text-[12px]">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: palette[i % palette.length] }}
            />
            <span className="text-d-text-secondary truncate flex-1">{b.sector}</span>
            <span className="numeric text-white">{((b.weight / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </section>
  )
}


function MetricStat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-md bg-[#0A0D14] border border-d-border px-3 py-2">
      <p className="text-[9px] uppercase tracking-wider text-d-text-muted">{label}</p>
      <p className="numeric text-[15px] font-semibold mt-0.5" style={{ color: accent || '#FFFFFF' }}>
        {value}
      </p>
      {sub && <p className="text-[9px] text-d-text-muted numeric">{sub}</p>}
    </div>
  )
}
