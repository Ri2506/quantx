'use client'

/**
 * /portfolio/doctor — F7 Portfolio Doctor (Pro+, Elite unlimited).
 *
 * Upload-or-broker flow → InsightAI 4-agent CoT per position →
 * composite portfolio score + risk flags + action recommendation.
 *
 * Persistence: ``portfolio_doctor_reports`` table (PR 34 migration).
 * Tier enforced at ``/api/portfolio/doctor/analyze`` by
 * ``RequireFeature("portfolio_doctor_pro")`` + monthly quota check.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Download,
  Loader2,
  PlusCircle,
  Sparkles,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react'

import AppLayout from '@/components/shared/AppLayout'
import {
  api,
  handleApiError,
  type DoctorReport,
  type DoctorRiskFlag,
  type DoctorPositionResult,
} from '@/lib/api'
import { publicLabel } from '@/lib/models'

type PositionDraft = {
  symbol: string
  weight: string   // user types percentages → converted on submit
}

const DEFAULT_DRAFT: PositionDraft = { symbol: '', weight: '' }


export default function PortfolioDoctorPage() {
  const [quota, setQuota] = useState<Awaited<ReturnType<typeof api.portfolioDoctor.quota>> | null>(null)
  const [history, setHistory] = useState<Awaited<ReturnType<typeof api.portfolioDoctor.reports>>>([])
  const [positions, setPositions] = useState<PositionDraft[]>([DEFAULT_DRAFT, { ...DEFAULT_DRAFT }])
  const [capital, setCapital] = useState<string>('')
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<DoctorReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const [q, h] = await Promise.all([
        api.portfolioDoctor.quota(),
        api.portfolioDoctor.reports(20).catch(() => []),
      ])
      setQuota(q)
      setHistory(h || [])
    } catch (err) {
      setError(handleApiError(err))
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const totalWeight = useMemo(
    () => positions.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0),
    [positions],
  )
  const weightOk = Math.abs(totalWeight - 100) < 0.5
  const canRun =
    !running && positions.length > 0 &&
    positions.every((p) => p.symbol.trim()) && weightOk

  const addPosition = () => setPositions((p) => [...p, { ...DEFAULT_DRAFT }])
  const removePosition = (i: number) =>
    setPositions((p) => (p.length > 1 ? p.filter((_, idx) => idx !== i) : p))
  const updatePos = (i: number, patch: Partial<PositionDraft>) =>
    setPositions((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const payload = {
        source: 'manual' as const,
        capital: capital ? Number(capital) : undefined,
        positions: positions.map((p) => ({
          symbol: p.symbol.trim().toUpperCase().replace(/\.NS$/, ''),
          weight: Math.max(0, Math.min(1, (parseFloat(p.weight) || 0) / 100)),
        })),
      }
      const r = await api.portfolioDoctor.analyze(payload)
      setReport(r)
      setQuota({ ...r.quota, engine: quota?.engine ?? publicLabel('cot_agents') })
      refresh()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setRunning(false)
    }
  }

  const reset = () => {
    setReport(null)
    setError(null)
  }

  // ---------- render

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-5">
        <PageHeader quota={quota} engine={quota?.engine} />

        {error && !report && (
          <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-3 text-[12px] text-down">
            {error}
          </div>
        )}

        {report ? (
          <ReportView report={report} onBack={reset} />
        ) : (
          <>
            {/* Quota banner */}
            {quota && <QuotaBanner quota={quota} />}

            <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 space-y-4">
                <HoldingsForm
                  positions={positions}
                  capital={capital}
                  setCapital={setCapital}
                  totalWeight={totalWeight}
                  weightOk={weightOk}
                  addPosition={addPosition}
                  removePosition={removePosition}
                  updatePos={updatePos}
                  canRun={canRun}
                  running={running}
                  onRun={run}
                />
              </div>
              <div className="space-y-4">
                <HistoryPanel history={history} onPick={async (id) => {
                  try {
                    const r = await api.portfolioDoctor.report(id)
                    setReport(r)
                  } catch (err) {
                    setError(handleApiError(err))
                  }
                }} />
              </div>
            </section>
          </>
        )}

        <p className="text-[10px] text-d-text-muted text-center">
          Portfolio Doctor is an educational review — not personalised investment advice.
          SEBI-compliant tool. Past model accuracy is not predictive of future results.
        </p>
      </div>
    </AppLayout>
  )
}


/* ───────────────────────── components ───────────────────────── */


function PageHeader({
  quota,
  engine,
}: {
  quota: { tier: string; runs_this_month: number; quota: number | null } | null
  engine?: string
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-primary" />
          Portfolio Doctor
          <span className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/40">
            Pro
          </span>
        </h1>
        <p className="text-[12px] text-d-text-muted mt-0.5">
          {engine || publicLabel('cot_agents')} runs four agents per holding — fundamentals · management · promoter · peer comparison — and rolls up to one portfolio score.
        </p>
      </div>
    </header>
  )
}


function QuotaBanner({ quota }: { quota: { tier: string; runs_this_month: number; quota: number | null; remaining: number | null } }) {
  const unlimited = quota.quota === null
  const low = !unlimited && quota.remaining !== null && quota.remaining <= 0
  const color = low ? '#FF5947' : unlimited ? '#4FECCD' : '#FEB113'
  return (
    <section
      className="rounded-lg border px-4 py-2.5 flex flex-wrap items-center justify-between gap-3"
      style={{ borderColor: `${color}55`, background: `${color}10` }}
    >
      <p className="text-[12px]" style={{ color }}>
        {unlimited
          ? `Unlimited runs this month (tier: ${quota.tier})`
          : low
            ? `Monthly quota exhausted — ${quota.runs_this_month}/${quota.quota} used`
            : `${quota.runs_this_month}/${quota.quota} runs used this month — ${quota.remaining} remaining`}
      </p>
      {low && (
        <Link href="/pricing" className="text-[11px] font-semibold text-primary hover:underline">
          Upgrade to Elite for unlimited →
        </Link>
      )}
    </section>
  )
}


function HoldingsForm({
  positions,
  capital,
  setCapital,
  totalWeight,
  weightOk,
  addPosition,
  removePosition,
  updatePos,
  canRun,
  running,
  onRun,
}: {
  positions: PositionDraft[]
  capital: string
  setCapital: (v: string) => void
  totalWeight: number
  weightOk: boolean
  addPosition: () => void
  removePosition: (i: number) => void
  updatePos: (i: number, patch: Partial<PositionDraft>) => void
  canRun: boolean
  running: boolean
  onRun: () => void
}) {
  return (
    <div className="rounded-xl border border-d-border bg-[#111520] p-5">
      <h2 className="text-[14px] font-semibold text-white flex items-center gap-2 mb-3">
        <ClipboardList className="w-4 h-4 text-primary" />
        Your portfolio
      </h2>

      <div className="mb-4">
        <label className="block text-[10px] uppercase tracking-wider text-d-text-muted mb-1">
          Capital (optional)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-d-text-secondary">₹</span>
          <input
            type="number"
            min={0}
            value={capital}
            onChange={(e) => setCapital(e.target.value)}
            placeholder="500000"
            className="numeric flex-1 bg-[#0A0D14] border border-d-border rounded-md px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-primary/50"
          />
        </div>
      </div>

      <div className="space-y-2">
        {positions.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={p.symbol}
              onChange={(e) => updatePos(i, { symbol: e.target.value.toUpperCase() })}
              placeholder="TCS"
              className="flex-1 bg-[#0A0D14] border border-d-border rounded-md px-3 py-1.5 text-[13px] text-white focus:outline-none focus:border-primary/50"
            />
            <div className="relative w-28">
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={p.weight}
                onChange={(e) => updatePos(i, { weight: e.target.value })}
                placeholder="25"
                className="numeric w-full bg-[#0A0D14] border border-d-border rounded-md px-3 py-1.5 pr-6 text-[13px] text-white focus:outline-none focus:border-primary/50"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-d-text-muted">%</span>
            </div>
            <button
              onClick={() => removePosition(i)}
              disabled={positions.length <= 1}
              className="p-1.5 rounded-md border border-d-border text-d-text-muted hover:text-down hover:border-down/40 disabled:opacity-40 disabled:hover:text-d-text-muted disabled:hover:border-d-border"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addPosition}
        disabled={positions.length >= 30}
        className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline disabled:opacity-50"
      >
        <PlusCircle className="w-3 h-3" />
        Add holding ({positions.length}/30)
      </button>

      <div className="mt-4 pt-3 border-t border-d-border flex items-center justify-between">
        <p
          className="text-[11px] numeric"
          style={{ color: weightOk ? '#05B878' : '#FEB113' }}
        >
          Weights sum to {totalWeight.toFixed(1)}%
          {!weightOk && ' — must sum to 100% to run'}
        </p>
        <button
          onClick={onRun}
          disabled={!canRun}
          className="inline-flex items-center gap-2 px-5 py-2 bg-primary text-black rounded-md text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {running ? 'Analyzing…' : 'Run Doctor'}
        </button>
      </div>
    </div>
  )
}


function HistoryPanel({
  history,
  onPick,
}: {
  history: Awaited<ReturnType<typeof api.portfolioDoctor.reports>>
  onPick: (id: string) => void
}) {
  return (
    <div className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
      <div className="px-5 py-3 border-b border-d-border">
        <p className="text-[13px] font-semibold text-white">Recent reports</p>
        <p className="text-[10px] text-d-text-muted">last 20 Doctor runs</p>
      </div>
      {history.length === 0 ? (
        <div className="p-6 text-center text-[12px] text-d-text-muted">
          No prior reports yet.
        </div>
      ) : (
        <div className="divide-y divide-d-border max-h-[500px] overflow-y-auto">
          {history.map((r) => (
            <button
              key={r.id}
              onClick={() => onPick(r.id)}
              className="w-full text-left px-5 py-3 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-white numeric">
                  {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                <span
                  className="numeric text-[12px] font-semibold"
                  style={{ color: colorForScore(r.composite_score) }}
                >
                  {r.composite_score}/100
                </span>
              </div>
              <p className="text-[10px] text-d-text-muted mt-0.5">
                {r.position_count} positions · {r.action.replace('_', ' ')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


function ReportView({ report, onBack }: { report: DoctorReport; onBack: () => void }) {
  const color = colorForScore(report.composite_score)
  const high = report.risk_flags.filter((f) => f.severity === 'high')
  const medium = report.risk_flags.filter((f) => f.severity === 'medium')

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-[12px] text-d-text-secondary hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          New analysis
        </button>
        {/* PR 67 — print → save-as-PDF. Browser print dialog
            handles PDF generation natively; the print stylesheet
            below hides nav + form chrome so the report prints clean. */}
        <button
          onClick={() => {
            if (typeof window !== 'undefined') window.print()
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-d-border bg-[#0A0D14] text-[11px] text-white hover:bg-white/[0.03]"
        >
          <Download className="w-3.5 h-3.5" />
          Download PDF
        </button>
      </div>

      {/* Composite strip */}
      <section
        className="rounded-xl border p-5"
        style={{
          borderColor: `${color}55`,
          background: `${color}10`,
          borderLeftWidth: 3,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-d-text-muted">
              Composite portfolio score
            </p>
            <p className="numeric text-[40px] font-semibold mt-1" style={{ color }}>
              {report.composite_score}
              <span className="text-[18px] text-d-text-muted font-normal">/100</span>
            </p>
          </div>
          <div className="min-w-[160px]">
            <p className="text-[10px] uppercase tracking-wider text-d-text-muted">Action</p>
            <p className="text-[15px] font-semibold text-white mt-1 capitalize">
              {report.action.replace('_', ' ')}
            </p>
          </div>
          <div className="min-w-[120px]">
            <p className="text-[10px] uppercase tracking-wider text-d-text-muted">Generated</p>
            <p className="text-[13px] text-white numeric mt-1">
              {new Date(report.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}{' '}
              {new Date(report.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
        <p className="mt-4 text-[13px] text-d-text-secondary leading-relaxed">
          {report.narrative}
        </p>
      </section>

      {/* Risk flags */}
      {report.risk_flags.length > 0 && (
        <section className="rounded-xl border border-d-border bg-[#111520] p-5">
          <h3 className="text-[14px] font-semibold text-white flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-[#FEB113]" />
            Risk flags
          </h3>
          <div className="space-y-2">
            {[...high, ...medium].map((f, i) => <RiskFlagRow key={i} f={f} />)}
          </div>
        </section>
      )}

      {/* Per-position grid */}
      <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        <div className="px-5 py-3 border-b border-d-border flex items-center justify-between">
          <h3 className="text-[14px] font-semibold text-white">
            Per-holding scores · {report.per_position.length} positions
          </h3>
          <p className="text-[10px] text-d-text-muted">
            sorted by weakest first
          </p>
        </div>
        <div className="divide-y divide-d-border">
          {[...report.per_position]
            .sort((a, b) => a.composite_score - b.composite_score)
            .map((p) => <PositionRow key={p.symbol} p={p} />)}
        </div>
      </section>
    </div>
  )
}


function RiskFlagRow({ f }: { f: DoctorRiskFlag }) {
  const sev = f.severity
  const color = sev === 'high' ? '#FF5947' : sev === 'medium' ? '#FEB113' : '#8e8e8e'
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md border border-d-border bg-[#0A0D14]">
      <span
        className="mt-0.5 text-[9px] font-semibold tracking-wider uppercase rounded-full px-1.5 py-0.5 border"
        style={{ color, borderColor: `${color}55`, background: `${color}14` }}
      >
        {sev}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-white leading-snug">{f.message}</p>
        <p className="text-[10px] text-d-text-muted mt-0.5 capitalize">{f.kind.replace('_', ' ')}</p>
      </div>
    </div>
  )
}


function PositionRow({ p }: { p: DoctorPositionResult }) {
  const color = colorForScore(p.composite_score)
  return (
    <div className="px-5 py-3 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/stock/${p.symbol}`}
            className="text-[13px] font-semibold text-white hover:text-primary"
          >
            {p.symbol}
          </Link>
          <span className="text-[10px] text-d-text-muted numeric">
            {(p.weight * 100).toFixed(1)}% of portfolio
          </span>
          <span
            className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border"
            style={{ color, borderColor: `${color}55`, background: `${color}14` }}
          >
            {p.action}
          </span>
        </div>
        {p.narrative && (
          <p className="text-[11px] text-d-text-secondary mt-1 leading-relaxed">
            {p.narrative}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-[9px] uppercase tracking-wider text-d-text-muted">Score</p>
        <p className="numeric text-[16px] font-semibold" style={{ color }}>
          {p.composite_score}
        </p>
      </div>
    </div>
  )
}


function colorForScore(score: number): string {
  if (score >= 70) return '#05B878'
  if (score >= 55) return '#4FECCD'
  if (score >= 40) return '#FEB113'
  return '#FF5947'
}
