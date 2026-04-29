// ============================================================================
// QUANT X - ADMIN SYSTEM HEALTH PAGE (Intellectia.ai Design System)
// System monitoring and health dashboard
// ============================================================================

'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Activity,
  Database,
  Server,
  Wifi,
  Clock,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Users,
  Target,
  TrendingUp,
  Cpu,
  HardDrive,
  Globe,
  Loader2,
  Power,
  ShieldAlert,
  History,
  FileText,
  User,
} from 'lucide-react'
import { SystemHealth } from '@/types/admin'
import { api, handleApiError } from '@/lib/api'

export default function AdminSystemPage() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true)

      const data = await api.admin.getSystemHealth().catch(() => null)
      if (data) {
        setHealth(data as unknown as SystemHealth)
      }
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Failed to fetch health:', err)
      setLastRefresh(new Date())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(fetchHealth, 30000) // Refresh every 30 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh, fetchHealth])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'running':
        return <CheckCircle className="w-5 h-5 text-up" />
      case 'degraded':
        return <AlertCircle className="w-5 h-5 text-warning" />
      case 'error':
      case 'stopped':
        return <XCircle className="w-5 h-5 text-down" />
      default:
        return <AlertCircle className="w-5 h-5 text-d-text-muted" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
      case 'running':
        return 'text-up bg-up/10 border-up/20'
      case 'degraded':
        return 'text-warning bg-warning/10 border-warning/20'
      case 'error':
      case 'stopped':
        return 'text-down bg-down/10 border-down/20'
      default:
        return 'text-d-text-muted bg-white/[0.04] border-d-border'
    }
  }

  if (loading && !health) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="loader-rings"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">System Health</h1>
            <p className="text-d-text-muted mt-1 flex items-center gap-2">
              Real-time system monitoring and status
              <span className="inline-flex items-center gap-1.5 text-up text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-up animate-pulse" />
                Live
              </span>
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-d-text-muted">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-d-border bg-white/[0.04] text-warning focus:ring-warning"
              />
              Auto-refresh (30s)
            </label>
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 text-d-text-muted ${loading ? 'animate-spin' : ''}`} />
              <span className="text-d-text-muted">Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Last Refresh */}
      {lastRefresh && (
        <p className="text-xs text-d-text-muted">
          Last updated: {lastRefresh.toLocaleTimeString()}
        </p>
      )}

      {/* Overall Status */}
      <div>
        <div
          className={`rounded-2xl border p-6 ${getStatusColor(health?.status || 'error')}`}
        >
          <div className="flex items-center gap-4">
            {getStatusIcon(health?.status || 'error')}
            <div>
              <h2 className="text-xl font-bold">System Status: {health?.status?.toUpperCase()}</h2>
              <p className="text-sm opacity-80">
                Last checked: {health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Service Status Grid */}
      <div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Database */}
          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center justify-between mb-4">
              <Database className="w-8 h-8 text-primary" />
              {getStatusIcon(health?.database || 'error')}
            </div>
            <h3 className="text-lg font-semibold text-white">Database</h3>
            <p className="text-sm text-d-text-muted mt-1 capitalize">
              {health?.database || 'Unknown'}
            </p>
          </div>

          {/* Redis */}
          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center justify-between mb-4">
              <Server className="w-8 h-8 text-down" />
              {getStatusIcon(health?.redis || 'disabled')}
            </div>
            <h3 className="text-lg font-semibold text-white">Redis</h3>
            <p className="text-sm text-d-text-muted mt-1 capitalize">
              {health?.redis || 'Unknown'}
            </p>
          </div>

          {/* Scheduler */}
          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center justify-between mb-4">
              <Clock className="w-8 h-8 text-purple-500" />
              {getStatusIcon(health?.scheduler_status || 'stopped')}
            </div>
            <h3 className="text-lg font-semibold text-white">Scheduler</h3>
            <p className="text-sm text-d-text-muted mt-1 capitalize">
              {health?.scheduler_status || 'Unknown'}
            </p>
            {health?.last_signal_run && (
              <p className="text-xs text-d-text-muted mt-2">
                Last run: {new Date(health.last_signal_run).toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* WebSocket */}
          <div className="glass-card hover:border-primary transition-colors p-6">
            <div className="flex items-center justify-between mb-4">
              <Wifi className="w-8 h-8 text-up" />
              <span className="text-2xl font-bold text-up">
                {health?.active_websocket_connections || 0}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-white">WebSocket</h3>
            <p className="text-sm text-d-text-muted mt-1">Active connections</p>
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div>
        <div className="glass-card hover:border-primary transition-colors p-6">
          <h2 className="text-lg font-semibold text-white mb-6">System Metrics</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <p className="text-2xl font-bold text-white">
                {health?.metrics.total_users.toLocaleString() || 0}
              </p>
              <p className="text-sm text-d-text-muted">Total Users</p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-up/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <TrendingUp className="w-6 h-6 text-up" />
              </div>
              <p className="text-2xl font-bold text-white">
                {health?.metrics.active_subscribers.toLocaleString() || 0}
              </p>
              <p className="text-sm text-d-text-muted">Active Subscribers</p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Target className="w-6 h-6 text-purple-500" />
              </div>
              <p className="text-2xl font-bold text-white">
                {health?.metrics.today_signals || 0}
              </p>
              <p className="text-sm text-d-text-muted">Today&apos;s Signals</p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-warning/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Activity className="w-6 h-6 text-warning" />
              </div>
              <p className="text-2xl font-bold text-white">
                {health?.metrics.today_trades || 0}
              </p>
              <p className="text-sm text-d-text-muted">Today&apos;s Trades</p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 bg-down/10 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Globe className="w-6 h-6 text-down" />
              </div>
              <p className="text-2xl font-bold text-white">
                {health?.metrics.active_positions || 0}
              </p>
              <p className="text-sm text-d-text-muted">Active Positions</p>
            </div>
          </div>
        </div>
      </div>

      {/* Environment Info */}
      <div>
        <div className="glass-card hover:border-primary transition-colors p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Environment</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-white/[0.02] rounded-lg">
              <p className="text-sm text-d-text-muted">API URL</p>
              <code className="text-white text-sm">
                {process.env.NEXT_PUBLIC_API_URL || 'Not configured'}
              </code>
            </div>
            <div className="p-4 bg-white/[0.02] rounded-lg">
              <p className="text-sm text-d-text-muted">Environment</p>
              <code className="text-white text-sm">
                {process.env.NODE_ENV || 'development'}
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <div className="glass-card hover:border-primary transition-colors p-6">
          <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => window.open('/api/docs', '_blank')}
              className="px-4 py-2 bg-primary/10 hover:bg-primary/20 border border-primary/20 rounded-lg text-primary text-sm font-medium transition-colors"
            >
              API Documentation
            </button>
            <button
              onClick={() => window.open('/api/health', '_blank')}
              className="px-4 py-2 bg-up/10 hover:bg-up/20 border border-up/20 rounded-lg text-up text-sm font-medium transition-colors"
            >
              Health Endpoint
            </button>
            <button
              onClick={fetchHealth}
              className="px-4 py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-d-text-muted text-sm font-medium transition-colors"
            >
              Force Refresh
            </button>
          </div>
        </div>

        {/* PR 47 — N9 Command Center expansions */}
        <div className="mt-6 space-y-6">
          <GlobalKillSwitchPanel />
          {/* PR 89 — manual operations. Backend has /admin/scan/trigger
              but nothing was calling it — operators had no way to fire
              a fresh scan after fixing a data issue or covering a
              missed scheduler run. */}
          <ManualOperationsPanel />
          <SchedulerJobsPanel />
          <AuditLogPanel />
        </div>
      </div>
    </div>
  )
}


/* ───────────────────── PR 89 — manual operations ───────────────────── */


function ManualOperationsPanel() {
  const [running, setRunning] = useState(false)
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string; at: string } | null>(null)

  const triggerScan = async () => {
    if (running) return
    if (!confirm('Trigger a fresh signal scan now? This re-runs the full pipeline on Nifty 500.')) {
      return
    }
    setRunning(true)
    try {
      const r = await api.admin.triggerScan()
      const msg = (r && (r.message || r.detail || JSON.stringify(r))) || 'Scan started'
      setLastResult({ ok: true, message: String(msg).slice(0, 200), at: new Date().toISOString() })
    } catch (err) {
      setLastResult({ ok: false, message: handleApiError(err), at: new Date().toISOString() })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Manual operations</h3>
          <p className="text-sm text-d-text-muted mt-1">
            Out-of-band triggers for ops recovery. Every action is recorded in the audit log below.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={triggerScan}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-warning/10 border border-warning/30 text-warning rounded-lg text-sm font-medium hover:bg-warning/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw className={`w-4 h-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Scanning…' : 'Trigger signal scan now'}
        </button>
      </div>

      {lastResult && (
        <div
          className="mt-4 px-4 py-3 rounded-lg border text-sm"
          style={{
            borderColor: lastResult.ok ? 'rgba(5,184,120,0.30)' : 'rgba(255,89,71,0.30)',
            background: lastResult.ok ? 'rgba(5,184,120,0.06)' : 'rgba(255,89,71,0.06)',
            color: lastResult.ok ? '#05B878' : '#FF5947',
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">
              {lastResult.ok ? 'Scan triggered' : 'Trigger failed'}
            </span>
            <span className="text-[11px] text-d-text-muted numeric">
              {new Date(lastResult.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <p className="text-[12px] mt-1 opacity-90 break-words">{lastResult.message}</p>
        </div>
      )}

      <p className="text-[11px] text-d-text-muted mt-4">
        Use after fixing a data-source issue or covering a missed scheduler run. Live signals
        published by this run go through the same regime gate + risk overlay as scheduled scans.
      </p>
    </div>
  )
}


/* ───────────────────── PR 47 — Global kill switch ───────────────────── */


type KillSwitchState = Awaited<ReturnType<typeof api.admin.getGlobalKillSwitch>>


function GlobalKillSwitchPanel() {
  const [state, setState] = useState<KillSwitchState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const refresh = useCallback(async () => {
    try {
      const r = await api.admin.getGlobalKillSwitch()
      setState(r)
      setReason(r.reason || '')
      setError(null)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const flip = async (nextActive: boolean) => {
    const action = nextActive ? 'ACTIVATE' : 'CLEAR'
    const confirmMsg = nextActive
      ? `Activate GLOBAL kill switch? This halts every order-placing path across ALL users.\n\nReason: ${reason.trim() || '(none provided — please add one)'}`
      : 'Clear the global kill switch? Trading resumes platform-wide.'
    if (!confirm(confirmMsg)) return
    if (nextActive && !reason.trim()) {
      alert('Reason is required when activating.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const r = await api.admin.setGlobalKillSwitch(nextActive, reason.trim() || null)
      setState({ ...(state || {}), ...r } as KillSwitchState)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setSaving(false)
    }
  }

  const active = state?.active || false
  const color = active ? '#FF5947' : '#05B878'

  return (
    <div
      className="rounded-xl border p-5"
      style={{
        borderColor: `${color}55`,
        background: `${color}0A`,
        borderLeftWidth: 3,
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldAlert className={`w-5 h-5 ${active ? 'text-down' : 'text-primary'}`} />
            Global kill switch
          </h2>
          <p className="text-xs text-d-text-muted mt-0.5">
            Platform-wide trading halt. Once active, every order-placing path
            stops until an admin clears it.
          </p>
        </div>
        {loading ? (
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
        ) : (
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase rounded-full px-2.5 py-1 border"
            style={{ color, borderColor: `${color}55`, background: `${color}14` }}
          >
            <span className="relative flex h-2 w-2">
              {active && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-60" />
              )}
              <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
            </span>
            {active ? 'ACTIVE — trading halted' : 'Inactive — normal ops'}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-down/40 bg-down/10 px-3 py-2 text-[12px] text-down">
          {error}
        </div>
      )}

      {state && state.updated_at && (
        <p className="text-[10px] text-d-text-muted mb-3 numeric">
          Last update: {new Date(state.updated_at).toLocaleString('en-IN')}
          {state.updated_by && ` · by ${state.updated_by.slice(0, 8)}…`}
        </p>
      )}

      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={active ? 'Current reason (edit before clearing if needed)' : 'Why are you activating? (required)'}
          disabled={saving}
          className="flex-1 bg-[#0A0D14] border border-d-border rounded-md px-3 py-2 text-[12px] text-white focus:outline-none focus:border-primary/50 disabled:opacity-60"
        />
        {active ? (
          <button
            onClick={() => flip(false)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-black text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-60"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            Clear kill switch
          </button>
        ) : (
          <button
            onClick={() => flip(true)}
            disabled={saving || !reason.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-down/15 border border-down/40 text-down text-[12px] font-semibold hover:bg-down/25 disabled:opacity-40"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5" />}
            Activate kill switch
          </button>
        )}
      </div>

      {state?.description && (
        <p className="text-[10px] text-d-text-muted mt-3">{state.description}</p>
      )}
    </div>
  )
}


/* ───────────────────── PR 47 — Scheduler jobs history ───────────────────── */


type SchedulerData = Awaited<ReturnType<typeof api.admin.getSchedulerJobs>>


function SchedulerJobsPanel() {
  const [data, setData] = useState<SchedulerData | null>(null)
  const [loading, setLoading] = useState(true)
  const [jobFilter, setJobFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'' | 'ok' | 'failed' | 'skipped'>('')

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.admin.getSchedulerJobs({
        job_id: jobFilter || undefined,
        status: statusFilter || undefined,
        limit: 100,
      })
      setData(r)
    } catch (err) {
      console.warn('scheduler jobs fetch failed:', handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [jobFilter, statusFilter])

  useEffect(() => {
    refresh()
  }, [refresh])

  const jobIds = data ? Array.from(new Set(data.rows.map((r) => r.job_id))).sort() : []

  return (
    <div className="glass-card hover:border-primary transition-colors p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          Scheduler job runs
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="bg-[#0A0D14] border border-d-border rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-primary/50"
          >
            <option value="">All jobs</option>
            {jobIds.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-[#0A0D14] border border-d-border rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-primary/50"
          >
            <option value="">All statuses</option>
            <option value="ok">ok</option>
            <option value="failed">failed</option>
            <option value="skipped">skipped</option>
          </select>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-d-border text-[11px] text-white hover:bg-white/[0.03] disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Latest-by-job summary strip */}
      {data && data.latest_by_job.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 mb-4">
          {data.latest_by_job.slice(0, 12).map((j) => {
            const color =
              j.status === 'ok' ? '#05B878'
              : j.status === 'failed' ? '#FF5947'
              : '#FEB113'
            return (
              <div
                key={j.job_id}
                className="px-3 py-2 rounded-md border"
                style={{ borderColor: `${color}40`, background: `${color}0A` }}
              >
                <p className="text-[11px] font-medium text-white truncate">{j.job_id}</p>
                <p className="text-[9px] text-d-text-muted numeric mt-0.5">
                  {new Date(j.started_at).toLocaleString('en-IN', {
                    dateStyle: 'short', timeStyle: 'short',
                  })}
                </p>
                <p className="text-[10px] numeric mt-0.5" style={{ color }}>
                  {j.status}{j.items_processed != null ? ` · ${j.items_processed}` : ''}
                </p>
              </div>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="text-center py-6">
          <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <p className="text-[12px] text-d-text-muted text-center py-6">
          No scheduler job runs yet. Rows appear after the first cron fires.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-d-border text-[10px] uppercase tracking-wider text-d-text-muted">
                <th className="text-left px-3 py-2 font-medium">Job</th>
                <th className="text-left px-3 py-2 font-medium">Started</th>
                <th className="text-right px-3 py-2 font-medium">Duration</th>
                <th className="text-right px-3 py-2 font-medium">Items</th>
                <th className="text-right px-3 py-2 font-medium">Status</th>
                <th className="text-left px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const color =
                  r.status === 'ok' ? '#05B878'
                  : r.status === 'failed' ? '#FF5947'
                  : '#FEB113'
                const dur =
                  r.finished_at && r.started_at
                    ? Math.max(0, (new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000)
                    : null
                return (
                  <tr key={r.id} className="border-b border-d-border/50 hover:bg-white/[0.02]">
                    <td className="px-3 py-2 font-medium text-white">{r.job_id}</td>
                    <td className="px-3 py-2 text-d-text-secondary numeric text-[11px]">
                      {new Date(r.started_at).toLocaleString('en-IN', {
                        dateStyle: 'short', timeStyle: 'medium',
                      })}
                    </td>
                    <td className="px-3 py-2 text-right numeric text-[11px] text-d-text-secondary">
                      {dur == null ? '—' : `${dur.toFixed(1)}s`}
                    </td>
                    <td className="px-3 py-2 text-right numeric text-[11px] text-d-text-secondary">
                      {r.items_processed ?? '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className="text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-d-text-secondary max-w-[280px] truncate">
                      {r.err_msg
                        ? <span className="text-down">{r.err_msg}</span>
                        : r.metadata
                          ? <code className="text-[10px] text-d-text-muted">{JSON.stringify(r.metadata).slice(0, 120)}</code>
                          : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <p className="text-[10px] text-d-text-muted mt-3 text-right">
          {data.count} rows · fetched {new Date(data.computed_at).toLocaleTimeString('en-IN')}
        </p>
      )}
    </div>
  )
}


/* ───────────────────── PR 49 — Admin audit log panel ───────────────────── */


type AuditData = Awaited<ReturnType<typeof api.admin.getAuditLog>>


function AuditLogPanel() {
  const [data, setData] = useState<AuditData | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState<string>('')
  const [targetTypeFilter, setTargetTypeFilter] = useState<string>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.admin.getAuditLog({
        action: actionFilter || undefined,
        target_type: targetTypeFilter || undefined,
        limit: 100,
      })
      setData(r)
    } catch (err) {
      console.warn('audit-log fetch failed:', handleApiError(err))
    } finally {
      setLoading(false)
    }
  }, [actionFilter, targetTypeFilter])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <div className="glass-card hover:border-primary transition-colors p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Admin audit log
          </h2>
          <p className="text-xs text-d-text-muted mt-0.5">
            One row per admin mutation — click any row to expand payload + client info.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="bg-[#0A0D14] border border-d-border rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-primary/50"
          >
            <option value="">All actions</option>
            {(data?.actions || []).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <select
            value={targetTypeFilter}
            onChange={(e) => setTargetTypeFilter(e.target.value)}
            className="bg-[#0A0D14] border border-d-border rounded-md px-2 py-1 text-[11px] text-white focus:outline-none focus:border-primary/50"
          >
            <option value="">All targets</option>
            <option value="user">user</option>
            <option value="tier">tier</option>
            <option value="ml_model">ml_model</option>
            <option value="scheduler_job">scheduler_job</option>
            <option value="system_flag">system_flag</option>
            <option value="signal">signal</option>
            <option value="payment">payment</option>
            <option value="other">other</option>
          </select>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-1 rounded-md border border-d-border text-[11px] text-white hover:bg-white/[0.03] disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-6">
          <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <p className="text-[12px] text-d-text-muted text-center py-6">
          No audit rows for the current filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-d-border text-[10px] uppercase tracking-wider text-d-text-muted">
                <th className="text-left px-3 py-2 font-medium">When</th>
                <th className="text-left px-3 py-2 font-medium">Actor</th>
                <th className="text-left px-3 py-2 font-medium">Action</th>
                <th className="text-left px-3 py-2 font-medium">Target</th>
                <th className="text-left px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const expanded = expandedId === r.id
                return (
                  <>
                    <tr
                      key={r.id}
                      className="border-b border-d-border/50 hover:bg-white/[0.02] cursor-pointer"
                      onClick={() => setExpandedId(expanded ? null : r.id)}
                    >
                      <td className="px-3 py-2 numeric text-[11px] text-d-text-secondary whitespace-nowrap">
                        {new Date(r.created_at).toLocaleString('en-IN', {
                          dateStyle: 'short', timeStyle: 'medium',
                        })}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-white">
                        <span className="inline-flex items-center gap-1">
                          <User className="w-3 h-3 text-d-text-muted" />
                          {r.actor_email || (r.actor_id ? r.actor_id.slice(0, 8) + '…' : 'system')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px]">
                        <code className="text-primary text-[11px]">{r.action}</code>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-d-text-secondary">
                        <span className="text-d-text-muted">{r.target_type}</span>
                        {r.target_id && <span className="ml-1">· {r.target_id.slice(0, 24)}</span>}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-d-text-muted numeric">
                        {r.ip_address || '—'}
                      </td>
                    </tr>
                    {expanded && (
                      <tr key={`${r.id}-expanded`} className="bg-[#0A0D14]">
                        <td colSpan={5} className="px-6 py-3">
                          <div className="space-y-2 text-[11px]">
                            {r.payload && Object.keys(r.payload).length > 0 && (
                              <div>
                                <p className="text-[9px] uppercase tracking-wider text-d-text-muted mb-1">Payload</p>
                                <pre className="p-2 rounded bg-[#111520] border border-d-border text-[10px] text-d-text-secondary overflow-x-auto">
{JSON.stringify(r.payload, null, 2)}
                                </pre>
                              </div>
                            )}
                            {r.user_agent && (
                              <div>
                                <p className="text-[9px] uppercase tracking-wider text-d-text-muted mb-1">User agent</p>
                                <p className="text-[10px] text-d-text-secondary break-all">{r.user_agent}</p>
                              </div>
                            )}
                            <p className="text-[9px] text-d-text-muted">Row id: <code>{r.id}</code></p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-d-text-muted mt-3 text-right">
            {data.count} rows · fetched {new Date(data.computed_at).toLocaleTimeString('en-IN')}
          </p>
        </div>
      )}
    </div>
  )
}
