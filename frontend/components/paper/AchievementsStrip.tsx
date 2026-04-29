'use client'

/**
 * AchievementsStrip — compact horizontal strip of earned badges +
 * active streak, for the /paper-trading hero bar.
 */

import { Flame, Trophy, Award } from 'lucide-react'

interface Badge {
  key: string
  label: string
  tier: 'bronze' | 'silver' | 'gold'
}

interface Props {
  streakDays: number
  tradeCount: number
  totalReturnPct: number
  badges: Badge[]
}

const TIER_COLORS: Record<Badge['tier'], { bg: string; fg: string; border: string }> = {
  bronze: { bg: '#C68642', fg: '#FFFFFF', border: '#C6864240' },
  silver: { bg: '#C0C0C0', fg: '#111520', border: '#C0C0C040' },
  gold:   { bg: '#FFD166', fg: '#111520', border: '#FFD16640' },
}

export default function AchievementsStrip({
  streakDays,
  tradeCount,
  totalReturnPct,
  badges,
}: Props) {
  return (
    <div className="trading-surface flex flex-wrap items-center gap-4">
      <Stat icon={Flame} label="Streak" value={`${streakDays}d`} color={streakDays >= 3 ? '#FF9900' : '#8E8E8E'} />
      <Divider />
      <Stat icon={Trophy} label="Trades" value={String(tradeCount)} color="#4FECCD" />
      <Divider />
      <Stat
        icon={Award}
        label="Total"
        value={`${totalReturnPct >= 0 ? '+' : ''}${totalReturnPct.toFixed(2)}%`}
        color={totalReturnPct >= 0 ? '#05B878' : '#FF5947'}
      />
      <Divider />
      <div className="flex items-center gap-1.5 flex-wrap">
        {badges.length === 0 ? (
          <span className="text-[11px] text-d-text-muted">No badges yet — place your first paper trade to start.</span>
        ) : (
          badges.map((b) => {
            const t = TIER_COLORS[b.tier]
            return (
              <span
                key={b.key}
                className="inline-flex items-center gap-1 text-[10px] font-medium rounded-full px-2 py-0.5 border"
                style={{ backgroundColor: `${t.bg}18`, color: t.bg, borderColor: t.border }}
                title={`${b.label} (${b.tier})`}
              >
                {b.label}
              </span>
            )
          })
        )}
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3.5 h-3.5" style={{ color }} />
      <span className="text-[11px] text-d-text-muted">{label}</span>
      <span className="numeric text-[13px] font-medium" style={{ color }}>{value}</span>
    </div>
  )
}

function Divider() {
  return <span className="w-px h-4 bg-d-border" />
}
