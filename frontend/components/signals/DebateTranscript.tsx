'use client'

/**
 * DebateTranscript — TradingAgents Bull/Bear transcript display (B1).
 *
 * Called from the signal detail page's "Debate" tab (Elite). Reads the
 * transcript structure the backend returns from
 * ``POST /api/ai/debate/signal/{id}``:
 *
 *   {
 *     decision: "enter|skip|half_size|wait",
 *     confidence: 0..100,
 *     summary: "2-sentence verdict",
 *     transcript: {
 *       fundamentals: {...}, technical: {...}, sentiment: {...},
 *       manager_briefing: {...},
 *       bull: {verdict, confidence, argument, key_evidence},
 *       bear: {verdict, confidence, argument, key_evidence},
 *       risk: {size_multiplier, rationale, kill_switch_trigger},
 *       trader: {decision, confidence, summary},
 *     }
 *   }
 *
 * Each agent gets a collapsible card with its identity color. Final
 * row = Trader verdict pinned open.
 */

import { useState } from 'react'
import { ChevronDown, Gavel, Shield, TrendingUp, TrendingDown, Activity, FileText } from 'lucide-react'
import type { ReactNode } from 'react'

export interface DebatePayload {
  decision: 'enter' | 'skip' | 'half_size' | 'wait'
  confidence: number
  summary: string
  transcript: Record<string, any>
}

interface Props {
  data?: DebatePayload | null
  loading?: boolean
  onRun?: () => void
}

const AGENT_CARDS = [
  { key: 'fundamentals', name: 'Fundamentals Analyst', color: '#8D5CFF', icon: FileText },
  { key: 'technical', name: 'Technical Analyst', color: '#5DCBD8', icon: Activity },
  { key: 'sentiment', name: 'Sentiment Analyst', color: '#00E5CC', icon: TrendingUp },
  { key: 'manager_briefing', name: 'Debate Manager', color: '#FEB113', icon: Gavel },
  { key: 'bull', name: 'Bull Researcher', color: '#05B878', icon: TrendingUp },
  { key: 'bear', name: 'Bear Researcher', color: '#FF5947', icon: TrendingDown },
  { key: 'risk', name: 'Risk Manager', color: '#FF9900', icon: Shield },
] as const

export default function DebateTranscript({ data, loading, onRun }: Props) {
  if (loading) {
    return (
      <div className="trading-surface text-[12px] text-d-text-muted">
        Running 8-agent debate… <span className="numeric">~15s</span>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="trading-surface flex items-center justify-between gap-4">
        <div>
          <p className="text-white text-[13px] font-medium">Elite debate not run yet</p>
          <p className="text-[11px] text-d-text-muted mt-0.5">
            7 specialist agents + 1 manager analyze this signal.
          </p>
        </div>
        {onRun && (
          <button
            onClick={onRun}
            className="px-4 py-1.5 text-[12px] font-medium bg-primary text-black rounded-md hover:bg-primary-hover transition-colors"
          >
            Run debate
          </button>
        )}
      </div>
    )
  }

  const trader = data.transcript?.trader || {
    decision: data.decision,
    confidence: data.confidence,
    summary: data.summary,
  }

  return (
    <div className="space-y-3">
      {/* Trader verdict — pinned, no collapse */}
      <TraderCard
        decision={trader.decision || data.decision}
        confidence={trader.confidence || data.confidence}
        summary={trader.summary || data.summary}
      />

      {/* Per-agent collapsible cards */}
      <div className="space-y-2">
        {AGENT_CARDS.map((cfg) => {
          const payload = data.transcript?.[cfg.key]
          if (!payload) return null
          return (
            <AgentCard
              key={cfg.key}
              name={cfg.name}
              color={cfg.color}
              Icon={cfg.icon}
              payload={payload}
            />
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- trader card

function TraderCard({
  decision,
  confidence,
  summary,
}: {
  decision: string
  confidence: number
  summary: string
}) {
  const color = DECISION_COLOR[decision] || '#8E8E8E'
  return (
    <div
      className="trading-surface flex flex-col gap-2"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Gavel className="w-3.5 h-3.5 text-d-text-muted" />
          <span className="text-[10px] uppercase tracking-wider text-d-text-muted">
            Trader verdict
          </span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="px-2 py-0.5 text-[11px] font-medium rounded-full"
            style={{ color, backgroundColor: `${color}1A`, border: `1px solid ${color}40` }}
          >
            {decision.toUpperCase().replace('_', ' ')}
          </span>
          <span className="text-[11px] text-d-text-muted">
            conf <span className="numeric text-white">{Math.round(confidence)}</span>
          </span>
        </div>
      </div>
      <p className="text-[13px] text-d-text-primary leading-relaxed">{summary}</p>
    </div>
  )
}

// -------------------------------------------------------------- agent card

function AgentCard({
  name,
  color,
  Icon,
  payload,
}: {
  name: string
  color: string
  Icon: any
  payload: any
}) {
  const [open, setOpen] = useState(false)
  const stance: string | undefined = payload.stance || payload.verdict
  const conf: number | undefined = payload.confidence

  return (
    <div
      className="trading-surface !p-0 overflow-hidden"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="w-3.5 h-3.5 shrink-0" style={{ color }} />
          <span className="text-[12px] font-medium text-white truncate">{name}</span>
          {stance && (
            <span
              className="px-1.5 py-0.5 text-[10px] rounded font-medium"
              style={{ color, backgroundColor: `${color}12` }}
            >
              {stance.replace('_', ' ')}
            </span>
          )}
          {typeof conf === 'number' && (
            <span className="text-[10px] text-d-text-muted numeric">
              {Math.round(conf)}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-3 h-3 text-d-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2 border-t border-d-border">
          {renderAgentBody(payload)}
        </div>
      )}
    </div>
  )
}

function renderAgentBody(payload: any): ReactNode {
  if (!payload) return null
  const fields: ReactNode[] = []

  if (payload.argument) {
    fields.push(
      <p key="arg" className="text-[12px] text-d-text-primary mt-3 leading-relaxed">
        {payload.argument}
      </p>,
    )
  } else if (payload.rationale) {
    fields.push(
      <p key="rat" className="text-[12px] text-d-text-primary mt-3 leading-relaxed">
        {payload.rationale}
      </p>,
    )
  } else if (payload.briefing) {
    fields.push(
      <p key="brief" className="text-[12px] text-d-text-primary mt-3 leading-relaxed">
        {payload.briefing}
      </p>,
    )
  }

  const evidence = payload.key_evidence || payload.points || payload.top_supports || payload.top_objections
  if (Array.isArray(evidence) && evidence.length > 0) {
    fields.push(
      <ul key="ev" className="text-[11px] text-d-text-secondary list-disc list-inside space-y-0.5">
        {evidence.slice(0, 6).map((item: any, i: number) => (
          <li key={i}>{String(item)}</li>
        ))}
      </ul>,
    )
  }

  if (typeof payload.size_multiplier === 'number') {
    fields.push(
      <p key="sm" className="text-[11px] text-d-text-muted mt-2">
        Recommended size mult:{' '}
        <span className="numeric text-white">
          {(payload.size_multiplier * 100).toFixed(0)}%
        </span>
      </p>,
    )
  }
  if (payload.kill_switch_trigger) {
    fields.push(
      <p key="ks" className="text-[11px] text-down mt-1">
        Kill trigger: {payload.kill_switch_trigger}
      </p>,
    )
  }

  return fields
}

const DECISION_COLOR: Record<string, string> = {
  enter: '#05B878',
  half_size: '#FEB113',
  wait: '#8E8E8E',
  skip: '#FF5947',
}
