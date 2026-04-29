'use client'

// ============================================================================
// BrokerConnectTile — single broker card used in Settings → Broker tab
// ============================================================================
// One-click OAuth for Zerodha + Upstox; credential modal for Angel One
// (SmartAPI has no OAuth redirect). Matches Step 4 §7 trading-surface rule.
// ============================================================================

import { CheckCircle2, Loader2, AlertCircle, Unlink, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

export type BrokerName = 'zerodha' | 'upstox' | 'angelone'
export type BrokerStatus =
  | 'not_connected'
  | 'connected'
  | 'expired'
  | 'error'
  | 'disconnected'

interface Props {
  broker: BrokerName
  status: BrokerStatus
  accountId?: string | null
  lastSyncedAt?: string | null
  busy?: boolean
  onConnect: () => void
  onDisconnect: () => void
}

const META: Record<BrokerName, { name: string; tagline: string; accent: string; logo: ReactNode }> = {
  zerodha: {
    name: 'Zerodha',
    tagline: 'Kite Connect · OAuth · ₹2,000/mo API (pay Zerodha)',
    accent: '#e85b2d',
    logo: <ZerodhaLogo />,
  },
  upstox: {
    name: 'Upstox',
    tagline: 'Upstox v2 · OAuth · Free API',
    accent: '#682F91',
    logo: <UpstoxLogo />,
  },
  angelone: {
    name: 'Angel One',
    tagline: 'SmartAPI · Credentials · Free API',
    accent: '#1E88E5',
    logo: <AngelLogo />,
  },
}

export default function BrokerConnectTile({
  broker,
  status,
  accountId,
  lastSyncedAt,
  busy,
  onConnect,
  onDisconnect,
}: Props) {
  const m = META[broker]
  const isConnected = status === 'connected'
  const isExpired = status === 'expired'

  return (
    <div
      className="trading-surface flex flex-col gap-4"
      style={{ borderLeft: `3px solid ${m.accent}` }}
      aria-label={`${m.name} broker connection`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-[#0A0D14] flex items-center justify-center p-1.5">
            {m.logo}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-white font-medium text-[14px]">{m.name}</span>
              <StatusPill status={status} />
            </div>
            <p className="text-d-text-muted text-[11px] mt-0.5 truncate">{m.tagline}</p>
          </div>
        </div>
      </div>

      {isConnected && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-d-text-muted border-t border-d-border pt-3">
          <span>
            <span className="text-d-text-secondary">Account</span>{' '}
            <span className="numeric text-white">{accountId || '—'}</span>
          </span>
          {lastSyncedAt && (
            <span>
              <span className="text-d-text-secondary">Last sync</span>{' '}
              <span className="numeric text-white">
                {new Date(lastSyncedAt).toLocaleString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  day: 'numeric',
                  month: 'short',
                })}
              </span>
            </span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        {isConnected || isExpired ? (
          <button
            onClick={onDisconnect}
            disabled={busy}
            className="flex items-center gap-1.5 text-[12px] text-down/80 border border-down/30 rounded-md px-3 py-1.5 hover:bg-down/10 hover:text-down transition-colors disabled:opacity-40"
          >
            <Unlink className="w-3.5 h-3.5" />
            Disconnect
          </button>
        ) : (
          <span />
        )}

        <button
          onClick={onConnect}
          disabled={busy}
          className={`flex items-center gap-1.5 text-[12px] font-medium rounded-md px-4 py-1.5 transition-colors disabled:opacity-40 ${
            isConnected
              ? 'border border-d-border text-d-text-secondary hover:bg-white/[0.03]'
              : 'bg-primary text-black hover:bg-primary-hover'
          }`}
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
          {isConnected ? 'Reconnect' : isExpired ? 'Reconnect' : 'Connect'}
        </button>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------------- pill

function StatusPill({ status }: { status: BrokerStatus }) {
  if (status === 'connected') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-up bg-up/10 border border-up/20 rounded-full px-2 py-0.5">
        <CheckCircle2 className="w-3 h-3" />
        Connected
      </span>
    )
  }
  if (status === 'expired') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-warning bg-warning/10 border border-warning/20 rounded-full px-2 py-0.5">
        <AlertCircle className="w-3 h-3" />
        Expired
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium text-down bg-down/10 border border-down/20 rounded-full px-2 py-0.5">
        <AlertCircle className="w-3 h-3" />
        Error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-d-text-muted border border-d-border rounded-full px-2 py-0.5">
      Not connected
    </span>
  )
}

// ---------------------------------------------------------------------- logos

function ZerodhaLogo() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
      <rect width="32" height="32" rx="4" fill="#e85b2d" />
      <text
        x="50%"
        y="55%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="DM Sans, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill="#fff"
      >
        Z
      </text>
    </svg>
  )
}

function UpstoxLogo() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
      <rect width="32" height="32" rx="4" fill="#682F91" />
      <text
        x="50%"
        y="55%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="DM Sans, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill="#fff"
      >
        U
      </text>
    </svg>
  )
}

function AngelLogo() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
      <rect width="32" height="32" rx="4" fill="#1E88E5" />
      <text
        x="50%"
        y="55%"
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily="DM Sans, sans-serif"
        fontWeight="700"
        fontSize="18"
        fill="#fff"
      >
        A
      </text>
    </svg>
  )
}
