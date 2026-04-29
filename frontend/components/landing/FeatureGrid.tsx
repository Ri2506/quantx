'use client'

/**
 * FeatureGrid — 12 F1-F12 features from Step 1 §2, rendered as a
 * 4-column grid. Each card: model-color icon, feature name, 2-line
 * description, tier badge.
 *
 * Not data-driven — features are static product facts.
 */

import {
  Calendar,
  Crown,
  Flame,
  Gauge,
  LayoutGrid,
  MessagesSquare,
  Stethoscope,
  TrendingUp,
  Users,
  Wallet,
  Waypoints,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'

type Tier = 'Free' | 'Pro' | 'Elite'

interface Feature {
  key: string
  name: string
  description: string
  icon: LucideIcon
  color: string
  tier: Tier
}

const FEATURES: Feature[] = [
  {
    key: 'F1',
    name: 'Intraday signals',
    description: 'TickPulse reads 5-min NSE ticks · RegimeIQ regime gate · ToneScan sentiment filter.',
    icon: Zap, color: '#FEB113', tier: 'Pro',
  },
  {
    key: 'F2',
    name: 'Swing signals',
    description: 'SwingLens quantile forecast · AlphaRank alpha rank · RegimeIQ gate. 3-10 day holds.',
    icon: TrendingUp, color: '#5DCBD8', tier: 'Pro',
  },
  {
    key: 'F3',
    name: 'Momentum picks',
    description: 'Weekly top-10 from AlphaRank + HorizonCast ensemble. Auto-rotation.',
    icon: Flame, color: '#FF9900', tier: 'Pro',
  },
  {
    key: 'F4',
    name: 'Auto-trader',
    description: 'AutoPilot executes on your broker · Kelly sizing · VolCast risk overlay.',
    icon: Crown, color: '#FFD166', tier: 'Elite',
  },
  {
    key: 'F5',
    name: 'AI SIP',
    description: 'Monthly AlphaRank quality screen → AllocIQ optimizer · InsightAI review.',
    icon: Wallet, color: '#4FECCD', tier: 'Elite',
  },
  {
    key: 'F6',
    name: 'F&O strategies',
    description: 'VolCast forecast → auto-selects Iron Condor / Straddle / Spreads.',
    icon: LayoutGrid, color: '#8D5CFF', tier: 'Elite',
  },
  {
    key: 'F7',
    name: 'Portfolio Doctor',
    description: 'InsightAI 4-agent analysis: fundamental · management · promoter · peers.',
    icon: Stethoscope, color: '#00E5CC', tier: 'Pro',
  },
  {
    key: 'F8',
    name: 'Market regime',
    description: 'RegimeIQ detects bull · sideways · bear. Sizes every signal.',
    icon: Gauge, color: '#FF9900', tier: 'Free',
  },
  {
    key: 'F9',
    name: 'Earnings predictor',
    description: 'EarningsScout surprise model + ToneScan transcript tone + management guidance.',
    icon: Calendar, color: '#FEB113', tier: 'Pro',
  },
  {
    key: 'F10',
    name: 'Sector rotation',
    description: 'SectorFlow aggregates alpha per sector · FII/DII flow. Rotating-in / out lists.',
    icon: Waypoints, color: '#8D5CFF', tier: 'Pro',
  },
  {
    key: 'F11',
    name: 'Paper trading + league',
    description: 'Virtual ₹10L. Anonymized weekly leaderboard. Streak badges.',
    icon: Users, color: '#4FECCD', tier: 'Free',
  },
  {
    key: 'F12',
    name: 'Daily digest',
    description: 'Telegram + WhatsApp + email morning brief. Personalized to portfolio.',
    icon: MessagesSquare, color: '#05B878', tier: 'Free',
  },
]

const TIER_STYLE: Record<Tier, { bg: string; fg: string; border: string }> = {
  Free: { bg: 'rgba(142,142,142,0.12)', fg: '#DADADA', border: 'rgba(142,142,142,0.35)' },
  Pro: { bg: 'rgba(79,236,205,0.10)', fg: '#4FECCD', border: 'rgba(79,236,205,0.35)' },
  Elite: { bg: 'rgba(255,209,102,0.10)', fg: '#FFD166', border: 'rgba(255,209,102,0.45)' },
}

export default function FeatureGrid() {
  return (
    <section className="max-w-6xl mx-auto px-4 md:px-6 py-20">
      <div className="text-center mb-10">
        <h2 className="text-[30px] font-semibold text-white">
          12 AI features. Not 12 chatbot flavors.
        </h2>
        <p className="text-[13px] text-d-text-muted mt-2 max-w-2xl mx-auto">
          Each feature runs a named, trained engine with its own published accuracy. No
          black boxes, no chatbot fluff — every win and loss on the public{' '}
          <Link href="/track-record" className="text-primary hover:underline">track record</Link>
          {', live per-engine win rates on the '}
          <Link href="/models" className="text-primary hover:underline">model accuracy page</Link>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {FEATURES.map((f) => (
          <article
            key={f.key}
            className="relative rounded-xl border border-d-border bg-[#111520]/60 backdrop-blur-sm p-5 hover:border-d-border-hover transition-colors"
            style={{ borderLeft: `3px solid ${f.color}` }}
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className="w-8 h-8 rounded-md flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${f.color}18`, border: `1px solid ${f.color}35` }}
              >
                <f.icon className="w-4 h-4" style={{ color: f.color }} />
              </div>
              <TierBadge tier={f.tier} />
            </div>
            <h3 className="mt-3 text-[13px] font-semibold text-white flex items-center gap-1.5">
              <span className="text-[10px] text-d-text-muted numeric">{f.key}</span>
              {f.name}
            </h3>
            <p className="mt-1.5 text-[11px] text-d-text-secondary leading-relaxed">
              {f.description}
            </p>
          </article>
        ))}
      </div>
    </section>
  )
}

function TierBadge({ tier }: { tier: Tier }) {
  const s = TIER_STYLE[tier]
  return (
    <span
      className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5"
      style={{ backgroundColor: s.bg, color: s.fg, border: `1px solid ${s.border}` }}
    >
      {tier}
    </span>
  )
}
