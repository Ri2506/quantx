'use client'

/**
 * FeatureComparisonMatrix — full feature × tier table on /pricing.
 *
 * Source of truth: Step 1 §5 (master feature list) + core/tiers.py
 * FEATURE_MATRIX. If a feature shows up here with the wrong tier, fix
 * it in both the backend FEATURE_MATRIX and this component.
 *
 * Grouped by category so the section is scannable — 27 features is
 * too many for a flat 27-row table.
 */

import { useState } from 'react'
import { Check, ChevronDown, Minus } from 'lucide-react'

type Tier = 'free' | 'pro' | 'elite'

/**
 * Each row = one feature. Values are:
 *   true   → included
 *   false  → excluded (rendered as Minus)
 *   string → custom copy (e.g. "5 msgs/day")
 */
interface Row {
  feature: string
  note?: string
  key: string
  free: true | false | string
  pro:  true | false | string
  elite: true | false | string
}

interface Group {
  label: string
  description?: string
  rows: Row[]
}

const GROUPS: Group[] = [
  {
    label: 'Core AI signals',
    rows: [
      { key: 'F2_signals', feature: 'Swing signals (F2)', note: '3-10 day holds', free: '1 / day', pro: 'Unlimited', elite: 'Unlimited + debate' },
      { key: 'F1_intraday', feature: 'Intraday signals (F1) · TickPulse', free: false, pro: true, elite: true },
      { key: 'F3_momentum', feature: 'Weekly momentum top-10 (F3)', free: false, pro: true, elite: true },
      { key: 'F8_regime', feature: 'Market regime (F8) · RegimeIQ', free: 'Banner', pro: 'Banner + size gate', elite: 'Full' },
      { key: 'model_consensus', feature: 'Engine consensus grid', free: 'Basic', pro: 'Full 4-engine', elite: 'Full + chart vision' },
      { key: 'N2_dossier', feature: 'AI Dossier per stock (N2)', free: 'Basic', pro: 'Full', elite: 'Full + vision on demand' },
    ],
  },
  {
    label: 'Paper trading + gamification',
    rows: [
      { key: 'F11_paper', feature: 'Paper portfolio (₹10L virtual)', free: true, pro: true, elite: true },
      { key: 'N6_league', feature: 'Paper League leaderboard', free: true, pro: true, elite: true },
      { key: 'achievements', feature: 'Streaks + badges', free: true, pro: true, elite: true },
    ],
  },
  {
    label: 'Research + AI Copilot',
    rows: [
      { key: 'N1_copilot', feature: 'AI Copilot chat (N1)', free: '5 msgs/day', pro: '150 msgs/day', elite: 'Unlimited' },
      { key: 'scanner_lab', feature: 'Scanner Lab (50+ filters + 11 patterns)', free: false, pro: true, elite: true },
      { key: 'F7_doctor', feature: 'Portfolio Doctor (F7)', free: '₹199 one-off', pro: 'Monthly included', elite: 'Unlimited reruns' },
      { key: 'F10_sector', feature: 'Sector rotation (F10)', free: false, pro: true, elite: true },
      { key: 'F9_earnings', feature: 'Earnings predictor (F9)', free: false, pro: 'Basic', elite: 'Pre-earnings strategy' },
      { key: 'N10_weekly', feature: 'AI weekly portfolio review (N10)', free: false, pro: true, elite: true },
      { key: 'B2_vision', feature: 'Chart-vision analysis (B2)', free: false, pro: 'On signals', elite: 'Any stock' },
    ],
  },
  {
    label: 'Live execution (broker required)',
    rows: [
      { key: 'broker_oauth', feature: 'One-click broker OAuth', free: true, pro: true, elite: true },
      { key: 'manual_live', feature: 'Manual live trading', free: false, pro: true, elite: true },
      { key: 'F4_auto', feature: 'AI Auto-trader (F4) · AutoPilot', free: false, pro: false, elite: true },
      { key: 'F5_sip', feature: 'AI SIP portfolio (F5)', free: false, pro: false, elite: true },
      { key: 'F6_fo', feature: 'F&O options strategies (F6)', free: false, pro: false, elite: true },
      { key: 'B1_debate', feature: 'Bull/Bear debate (B1) · Counterpoint', free: false, pro: false, elite: true },
    ],
  },
  {
    label: 'Alerts + delivery',
    rows: [
      { key: 'F12_telegram', feature: 'Telegram digest (F12)', free: true, pro: true, elite: true },
      { key: 'F12_whatsapp', feature: 'WhatsApp daily digest', free: false, pro: true, elite: true },
      { key: 'alert_studio', feature: 'Alert Studio (per-event / per-channel)', free: 'Basic', pro: 'Full studio', elite: 'Full studio' },
      { key: 'push_web', feature: 'Web push notifications', free: true, pro: true, elite: true },
      { key: 'email_alerts', feature: 'Email alerts', free: true, pro: true, elite: true },
    ],
  },
  {
    label: 'Marketplace',
    rows: [
      { key: 'marketplace_browse', feature: 'Browse community strategies (B3)', free: true, pro: true, elite: true },
      { key: 'marketplace_deploy', feature: 'Deploy a strategy', free: false, pro: true, elite: true },
      { key: 'marketplace_publish', feature: 'Publish + earn revenue share', free: false, pro: false, elite: true },
    ],
  },
  {
    label: 'Trust + safety',
    rows: [
      { key: 'public_track_record', feature: 'Public /track-record + /models', free: true, pro: true, elite: true },
      { key: 'kill_switch', feature: 'Kill switch', note: 'Per-user + global admin', free: true, pro: true, elite: true },
      { key: 'regime_gate', feature: 'Bear-regime size gate', free: true, pro: true, elite: true },
    ],
  },
]


export default function FeatureComparisonMatrix() {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(GROUPS.map((g, i) => [g.label, i < 3]))
  )

  const toggle = (label: string) =>
    setOpenGroups((s) => ({ ...s, [label]: !s[label] }))

  return (
    <section className="max-w-6xl mx-auto px-4 md:px-6 py-16">
      <div className="text-center mb-8">
        <h2 className="text-[24px] font-semibold text-white">Full feature comparison</h2>
        <p className="text-[12px] text-d-text-muted mt-1.5">
          Every feature, every tier. If it isn&apos;t here, it isn&apos;t in the product yet.
        </p>
      </div>

      <div className="rounded-2xl border border-d-border bg-[#111520]/70 backdrop-blur-sm overflow-hidden">
        {/* Sticky header row */}
        <div className="grid grid-cols-[1fr_90px_90px_90px] md:grid-cols-[2fr_120px_120px_120px] gap-2 px-4 md:px-6 py-3 border-b border-d-border sticky top-0 bg-[#111520]/95 backdrop-blur-sm z-10">
          <span className="text-[11px] uppercase tracking-wider text-d-text-muted">Feature</span>
          <TierHeaderCell label="Free" />
          <TierHeaderCell label="Pro" highlight="popular" />
          <TierHeaderCell label="Elite" highlight="gold" />
        </div>

        {GROUPS.map((group) => {
          const open = openGroups[group.label]
          return (
            <div key={group.label} className="border-b border-d-border last:border-0">
              <button
                onClick={() => toggle(group.label)}
                className="w-full flex items-center justify-between gap-2 px-4 md:px-6 py-3 text-left hover:bg-white/[0.02] transition-colors"
              >
                <span className="text-[12px] font-semibold text-white">
                  {group.label}
                  <span className="ml-2 text-[10px] text-d-text-muted numeric font-normal">
                    {group.rows.length}
                  </span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-d-text-muted transition-transform ${open ? '' : '-rotate-90'}`}
                />
              </button>

              {open && (
                <div className="pb-2">
                  {group.rows.map((row) => (
                    <div
                      key={row.key}
                      className="grid grid-cols-[1fr_90px_90px_90px] md:grid-cols-[2fr_120px_120px_120px] gap-2 px-4 md:px-6 py-2.5 items-center text-[12px] border-t border-d-border/60 first:border-t-0"
                    >
                      <div className="min-w-0">
                        <span className="text-d-text-primary">{row.feature}</span>
                        {row.note && (
                          <span className="block text-[10px] text-d-text-muted mt-0.5">
                            {row.note}
                          </span>
                        )}
                      </div>
                      <ValueCell value={row.free} tier="free" />
                      <ValueCell value={row.pro} tier="pro" />
                      <ValueCell value={row.elite} tier="elite" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}


// -------------------------------------------------------- header cells

function TierHeaderCell({ label, highlight }: { label: string; highlight?: 'popular' | 'gold' }) {
  const color =
    highlight === 'gold'
      ? 'linear-gradient(135deg, #FFD166, #FF9900)'
      : highlight === 'popular'
      ? '#4FECCD'
      : '#8E8E8E'
  const textColor = highlight === 'gold' ? '#FFD166' : highlight === 'popular' ? '#4FECCD' : '#DADADA'
  return (
    <span className="text-center">
      <span className="block text-[11px] uppercase tracking-wider font-semibold" style={{ color: textColor }}>
        {label}
      </span>
      {highlight && (
        <span
          className="block mx-auto mt-1 h-[2px] w-10"
          style={{ background: typeof color === 'string' && color.startsWith('linear') ? color : color }}
        />
      )}
    </span>
  )
}


function ValueCell({
  value,
  tier,
}: {
  value: true | false | string
  tier: Tier
}) {
  if (value === true) {
    const color = tier === 'free' ? '#8E8E8E' : tier === 'pro' ? '#4FECCD' : '#FFD166'
    return (
      <span className="text-center">
        <Check className="inline-block w-3.5 h-3.5" style={{ color }} />
      </span>
    )
  }
  if (value === false) {
    return (
      <span className="text-center">
        <Minus className="inline-block w-3.5 h-3.5 text-d-text-muted/50" />
      </span>
    )
  }
  // Custom string
  const color =
    tier === 'free' ? '#DADADA' : tier === 'pro' ? '#4FECCD' : '#FFD166'
  return (
    <span className="text-center block text-[11px] font-medium" style={{ color }}>
      {value}
    </span>
  )
}
