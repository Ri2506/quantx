// ============================================================================
// QUANT X — ADMIN TRAINING RUNS PAGE (PR 129)
// ----------------------------------------------------------------------------
// Surfaces the unified training runner (PR 128) inside the admin command
// center. Lists discovered trainers, recent runs, and exposes a "Run all" /
// per-trainer trigger. Status polls every 3 seconds while a run is in flight.
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Play,
  Loader2,
  CheckCircle,
  AlertCircle,
  Cpu,
  Server,
  Clock,
  RefreshCw,
} from 'lucide-react'
import { api, handleApiError } from '@/lib/api'

type Trainer = { name: string; requires_gpu: boolean; depends_on: string[] }
type Report = {
  name: string
  status: 'ok' | 'skipped' | 'failed'
  duration_sec: number
  metrics: Record<string, any>
  error: string | null
  version: number | null
  promoted: boolean
}
type Run = {
  run_id: string
  status: 'running' | 'ok' | 'partial' | 'failed'
  started_at: string
  finished_at: string | null
  triggered_by: string
  params: { only?: string[] | null; skip_gpu?: boolean; promote?: boolean; dry_run?: boolean }
  reports: Report[]
  error: string | null
}
type LastVersion = {
  model_name: string
  version: number
  trained_at: string
  trained_by: string | null
  metrics: Record<string, any>
  is_prod: boolean
  is_shadow: boolean
}

export default function AdminTrainingPage() {
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [runs, setRuns] = useState<Run[]>([])
  const [lastVersions, setLastVersions] = useState<LastVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [skipGpu, setSkipGpu] = useState(false)
  const [promote, setPromote] = useState(false)
  const [dryRun, setDryRun] = useState(true)

  const reload = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        api.admin.listTrainers(),
        api.admin.listTrainingRuns(),
      ])
      setTrainers(t.trainers)
      setRuns(r.runs)
      setLastVersions(r.last_versions)
      setError(null)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  // Poll while any run is in flight.
  useEffect(() => {
    const inFlight = runs.some((r) => r.status === 'running')
    if (!inFlight) return
    const id = setInterval(() => { void reload() }, 3000)
    return () => clearInterval(id)
  }, [runs, reload])

  const trigger = async (only?: string[]) => {
    setBusy(true)
    setError(null)
    try {
      await api.admin.triggerTrainingRun({
        only,
        skip_gpu: skipGpu,
        promote,
        dry_run: dryRun,
      })
      await reload()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setBusy(false)
    }
  }

  const toggleSelected = (name: string) => {
    const next = new Set(selected)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelected(next)
  }

  const lastByName = new Map(lastVersions.map((v) => [v.model_name, v]))

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Training pipeline</h1>
        <p className="text-sm text-d-text-muted">
          Unified runner discovers trainers under <code className="text-primary">ml/training/trainers/</code>.
          Each trainer trains, evaluates, and registers a new <code>model_versions</code> row.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-down/30 bg-down/[0.08] p-3 text-[13px] text-down flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Run config */}
      <div className="rounded-xl border border-d-border bg-d-bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-white">Run config</h2>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1 text-[12px] text-d-text-muted hover:text-white"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-[12px] text-white">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} className="accent-primary" />
            Dry run (no B2 upload, no DB write)
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={skipGpu} onChange={(e) => setSkipGpu(e.target.checked)} className="accent-primary" />
            Skip GPU trainers
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={promote} onChange={(e) => setPromote(e.target.checked)} className="accent-primary" />
            Promote on success
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => trigger()}
            disabled={busy}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-black text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Run all ({trainers.length})
          </button>
          <button
            type="button"
            onClick={() => trigger(Array.from(selected))}
            disabled={busy || selected.size === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-primary/40 text-primary text-[12px] font-semibold hover:bg-primary/[0.10] disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" />
            Run selected ({selected.size})
          </button>
        </div>
      </div>

      {/* Discovered trainers */}
      <div className="rounded-xl border border-d-border bg-d-bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-d-border">
          <h2 className="text-sm font-semibold text-white">Discovered trainers</h2>
        </div>
        <table className="w-full text-[12px]">
          <thead className="text-d-text-muted text-[10px] uppercase tracking-wider">
            <tr className="border-b border-d-border">
              <th className="px-5 py-2 w-8" />
              <th className="px-5 py-2 text-left">Name</th>
              <th className="px-5 py-2 text-left">Compute</th>
              <th className="px-5 py-2 text-left">Depends on</th>
              <th className="px-5 py-2 text-left">Last trained</th>
              <th className="px-5 py-2 text-left">Prod version</th>
            </tr>
          </thead>
          <tbody>
            {trainers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-d-text-muted">
                  No trainers discovered. Add files under <code>ml/training/trainers/</code>.
                </td>
              </tr>
            )}
            {trainers.map((t) => {
              const lv = lastByName.get(t.name)
              return (
                <tr key={t.name} className="border-b border-d-border last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(t.name)}
                      onChange={() => toggleSelected(t.name)}
                      className="accent-primary"
                    />
                  </td>
                  <td className="px-5 py-2.5 font-mono text-white">{t.name}</td>
                  <td className="px-5 py-2.5">
                    <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider"
                          style={{ color: t.requires_gpu ? '#FEB113' : '#8e8e8e' }}>
                      {t.requires_gpu ? <Server className="w-3 h-3" /> : <Cpu className="w-3 h-3" />}
                      {t.requires_gpu ? 'GPU' : 'CPU'}
                    </span>
                  </td>
                  <td className="px-5 py-2.5 text-d-text-muted">
                    {t.depends_on.length === 0 ? '—' : t.depends_on.join(', ')}
                  </td>
                  <td className="px-5 py-2.5 text-d-text-muted">
                    {lv ? new Date(lv.trained_at).toLocaleString() : 'never'}
                  </td>
                  <td className="px-5 py-2.5">
                    {lv ? (
                      <span className="font-mono text-white">
                        v{lv.version}
                        {lv.is_prod && <span className="ml-1 text-[10px] text-up">prod</span>}
                        {lv.is_shadow && <span className="ml-1 text-[10px] text-warning">shadow</span>}
                      </span>
                    ) : (
                      <span className="text-d-text-muted">—</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Recent runs */}
      <div className="rounded-xl border border-d-border bg-d-bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-d-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Recent runs</h2>
          <span className="text-[10px] text-d-text-muted">last 50</span>
        </div>
        {runs.length === 0 ? (
          <div className="p-8 text-center text-d-text-muted text-[13px]">
            No runs yet.
          </div>
        ) : (
          <ul className="divide-y divide-d-border">
            {runs.map((run) => <RunRow key={run.run_id} run={run} />)}
          </ul>
        )}
      </div>
    </div>
  )
}


function RunRow({ run }: { run: Run }) {
  const [open, setOpen] = useState(run.status === 'running')
  const StatusIcon = run.status === 'running' ? Loader2
    : run.status === 'ok' ? CheckCircle
    : run.status === 'partial' ? AlertCircle
    : AlertCircle
  const color = run.status === 'running' ? '#4FECCD'
    : run.status === 'ok' ? '#05B878'
    : run.status === 'partial' ? '#FEB113'
    : '#FF5947'

  return (
    <li className="px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <StatusIcon className={`w-4 h-4 ${run.status === 'running' ? 'animate-spin' : ''}`}
                      style={{ color }} />
          <div className="min-w-0">
            <p className="text-[13px] text-white">
              <span className="font-mono">{run.run_id.slice(0, 8)}</span>
              <span className="text-d-text-muted ml-2">· {run.triggered_by}</span>
            </p>
            <p className="text-[11px] text-d-text-muted flex items-center gap-2">
              <Clock className="w-3 h-3" />
              {new Date(run.started_at).toLocaleString()}
              {run.finished_at && (
                <span>· {((new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()) / 1000).toFixed(1)}s</span>
              )}
              {run.params.only && run.params.only.length > 0 && (
                <span>· only {run.params.only.length}</span>
              )}
              {run.params.dry_run && <span className="text-warning">· dry-run</span>}
              {run.params.promote && <span className="text-primary">· promote</span>}
            </p>
          </div>
        </div>
        <span className="text-[10px] uppercase tracking-wider"
              style={{ color }}>{run.status}</span>
      </button>
      {open && (
        <div className="mt-3 ml-7 space-y-1.5">
          {run.error && (
            <p className="text-[11px] text-down">{run.error}</p>
          )}
          {run.reports.map((rep) => (
            <div key={rep.name} className="text-[11px] flex flex-wrap items-baseline gap-2">
              <span className="font-mono text-white">{rep.name}</span>
              <span style={{ color: rep.status === 'ok' ? '#05B878' : rep.status === 'skipped' ? '#8e8e8e' : '#FF5947' }}>
                {rep.status}
              </span>
              <span className="text-d-text-muted">{rep.duration_sec.toFixed(1)}s</span>
              {rep.version != null && <span className="text-d-text-muted">v{rep.version}</span>}
              {rep.promoted && <span className="text-up">prod</span>}
              {rep.error && <span className="text-down">{rep.error}</span>}
              {Object.keys(rep.metrics).length > 0 && (
                <span className="text-d-text-muted font-mono text-[10px] truncate max-w-xl">
                  {JSON.stringify(rep.metrics)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </li>
  )
}
