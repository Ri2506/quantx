'use client'

/**
 * /alerts — N11 Alerts Studio (Pro).
 *
 * Event × channel matrix. Each cell is a toggle switch; a "Test" button
 * per channel header fires a live notification down that pipe.
 *
 * Channel connection status bar at the top shows which channels are
 * usable right now (telegram/whatsapp/email setup). Disconnected
 * channels grey out their column but toggles still persist.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Bell,
  Check,
  CheckCircle2,
  Loader2,
  Mail,
  MessageCircle,
  Send,
  Settings2,
  Smartphone,
  XCircle,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'


type Prefs = Awaited<ReturnType<typeof api.alerts.preferences>>
type ChannelKey = 'push' | 'telegram' | 'whatsapp' | 'email'

const CHANNELS: ChannelKey[] = ['push', 'telegram', 'whatsapp', 'email']

const CHANNEL_META: Record<ChannelKey, { label: string; icon: any; hint: string }> = {
  push:     { label: 'Web Push',  icon: Bell,           hint: 'Browser notifications' },
  telegram: { label: 'Telegram',  icon: Send,           hint: 'Bot message' },
  whatsapp: { label: 'WhatsApp',  icon: MessageCircle,  hint: 'Business API (Pro only)' },
  email:    { label: 'Email',     icon: Mail,           hint: 'Resend-delivered' },
}


export default function AlertsStudioPage() {
  const [data, setData] = useState<Prefs | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<ChannelKey | null>(null)
  const [testResult, setTestResult] = useState<{ channel: ChannelKey; delivered: boolean; detail: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    try {
      const r = await api.alerts.preferences()
      setData(r)
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

  const channelStatusByKey = useMemo(() => {
    const m: Record<string, Prefs['channels'][number]> = {}
    for (const c of data?.channels ?? []) m[c.channel] = c
    return m
  }, [data])

  const toggle = async (event: string, channel: ChannelKey, enabled: boolean) => {
    const key = `${event}:${channel}`
    setSaving(key)

    // Optimistic update — revert on failure.
    setData((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        preferences: {
          ...prev.preferences,
          [event]: { ...prev.preferences[event], [channel]: enabled },
        },
      }
    })

    try {
      const r = await api.alerts.toggle(event, channel, enabled)
      setData(r)
      setError(null)
    } catch (err) {
      setError(handleApiError(err))
      // Revert.
      await refresh()
    } finally {
      setSaving(null)
    }
  }

  const runTest = async (channel: ChannelKey) => {
    setTesting(channel)
    setTestResult(null)
    try {
      const r = await api.alerts.test(channel)
      setTestResult({ channel, delivered: r.delivered, detail: r.detail })
    } catch (err) {
      setTestResult({ channel, delivered: false, detail: handleApiError(err) })
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10">
        <Loader2 className="w-5 h-5 text-primary animate-spin" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-10">
        <div className="rounded-lg border border-down/40 bg-down/10 px-4 py-3 text-[13px] text-down">
          {error}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 space-y-5">
      {/* Header */}
      <header>
        <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          Alerts Studio
          <span className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/40">
            Pro
          </span>
        </h1>
        <p className="text-[12px] text-d-text-muted mt-0.5">
          Choose which events reach you through which channel. Test each pipe before relying on it.
        </p>
      </header>

      {error && (
        <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-[12px] text-down">
          {error}
        </div>
      )}

      {/* Channel connection strip */}
      <section className="grid grid-cols-2 md:grid-cols-4 divide-x divide-d-border rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        {CHANNELS.map((ch) => {
          const meta = CHANNEL_META[ch]
          const status = channelStatusByKey[ch]
          const connected = status?.connected ?? false
          const Icon = meta.icon
          return (
            <div key={ch} className="px-4 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white">
                  <Icon className="w-3 h-3 text-primary" />
                  {meta.label}
                </span>
                {connected ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-up" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-d-text-muted" />
                )}
              </div>
              <p className="text-[10px] text-d-text-muted truncate">
                {status?.detail || meta.hint}
              </p>
              <button
                onClick={() => runTest(ch)}
                disabled={testing === ch || !connected}
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {testing === ch ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Send test →'}
              </button>
              {testResult?.channel === ch && (
                <p
                  className="text-[9px] mt-1 numeric"
                  style={{ color: testResult.delivered ? '#05B878' : '#FEB113' }}
                >
                  {testResult.delivered ? '✓ Delivered' : testResult.detail}
                </p>
              )}
            </div>
          )
        })}
      </section>

      {/* Matrix */}
      <section className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
        <div className="px-5 py-3 border-b border-d-border">
          <p className="text-[13px] font-semibold text-white">Event × channel routing</p>
          <p className="text-[10px] text-d-text-muted">Toggle any cell to save — changes apply within a minute.</p>
        </div>

        {/* Desktop: table; mobile: stacked rows */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-d-border">
                <th className="text-left px-5 py-2.5 text-[10px] uppercase tracking-wider text-d-text-muted font-medium">
                  Event
                </th>
                {CHANNELS.map((ch) => {
                  const meta = CHANNEL_META[ch]
                  const status = channelStatusByKey[ch]
                  const connected = status?.connected ?? false
                  return (
                    <th
                      key={ch}
                      className="text-center px-3 py-2.5 text-[10px] uppercase tracking-wider font-medium"
                    >
                      <span className={`inline-flex items-center gap-1 ${connected ? 'text-white' : 'text-d-text-muted'}`}>
                        {meta.label}
                      </span>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {data.events.map((ev) => (
                <tr key={ev.key} className="border-b border-d-border last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <p className="text-[13px] text-white font-medium">{ev.label}</p>
                    <p className="text-[10px] text-d-text-muted mt-0.5">{ev.description}</p>
                  </td>
                  {CHANNELS.map((ch) => {
                    const on = !!data.preferences[ev.key]?.[ch]
                    const key = `${ev.key}:${ch}`
                    return (
                      <td key={ch} className="px-3 py-3 text-center">
                        <Toggle
                          on={on}
                          loading={saving === key}
                          onChange={(v) => toggle(ev.key, ch, v)}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile: one event per card */}
        <div className="md:hidden divide-y divide-d-border">
          {data.events.map((ev) => (
            <div key={ev.key} className="px-4 py-3">
              <p className="text-[13px] text-white font-medium">{ev.label}</p>
              <p className="text-[10px] text-d-text-muted mt-0.5 mb-2">{ev.description}</p>
              <div className="grid grid-cols-2 gap-2">
                {CHANNELS.map((ch) => {
                  const meta = CHANNEL_META[ch]
                  const on = !!data.preferences[ev.key]?.[ch]
                  const key = `${ev.key}:${ch}`
                  return (
                    <div
                      key={ch}
                      className="flex items-center justify-between px-3 py-2 rounded-md bg-[#0A0D14] border border-d-border"
                    >
                      <span className="text-[11px] text-d-text-secondary">{meta.label}</span>
                      <Toggle
                        on={on}
                        loading={saving === key}
                        onChange={(v) => toggle(ev.key, ch, v)}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-[10px] text-d-text-muted text-center">
        Need to connect a new channel?{' '}
        <Link href="/settings" className="text-primary hover:underline">Open Settings</Link>.
      </p>
    </div>
  )
}


/* ───────────────────────── components ───────────────────────── */


function Toggle({
  on,
  loading,
  onChange,
}: {
  on: boolean
  loading?: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={loading}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        loading ? 'opacity-60' : ''
      } ${on ? 'bg-primary' : 'bg-[#242838]'}`}
      aria-pressed={on}
    >
      {loading ? (
        <Loader2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white animate-spin" />
      ) : (
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            on ? 'translate-x-4' : 'translate-x-0'
          }`}
        >
          {on && (
            <Check className="w-2.5 h-2.5 text-primary absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
          )}
        </span>
      )}
    </button>
  )
}
