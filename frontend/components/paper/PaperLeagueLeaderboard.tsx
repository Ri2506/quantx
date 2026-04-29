'use client'

/**
 * PaperLeagueLeaderboard — anonymized weekly ranking (N6).
 *
 * Backend returns hashed handles (``Swing<6-hex>``) so no user identity
 * leaks. If the logged-in user's handle is in the list we highlight
 * their row with gold accent.
 */

import { Medal, Crown } from 'lucide-react'

interface Row {
  rank: number
  handle: string
  return_pct: number
  final_equity: number
  snapshots: number
}

interface Props {
  rows: Row[]
  currentUserHandle?: string
}

export default function PaperLeagueLeaderboard({ rows, currentUserHandle }: Props) {
  if (!rows.length) {
    return (
      <div className="trading-surface text-[12px] text-d-text-muted text-center py-6">
        League opens at the end of the first week. Keep paper-trading.
      </div>
    )
  }

  return (
    <div className="trading-surface !p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-d-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="w-3.5 h-3.5 text-primary" />
          <span className="text-[12px] font-medium text-white">Paper League</span>
          <span className="text-[10px] text-d-text-muted uppercase tracking-wider">
            weekly · anonymized
          </span>
        </div>
        <span className="text-[10px] text-d-text-muted">Top 20</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="text-d-text-muted border-b border-d-border">
            <tr>
              <th className="text-left px-5 py-2.5 font-normal w-12">#</th>
              <th className="text-left px-2 py-2.5 font-normal">Handle</th>
              <th className="text-right px-2 py-2.5 font-normal">Return</th>
              <th className="text-right px-5 py-2.5 font-normal">Equity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isMe = currentUserHandle && r.handle === currentUserHandle
              return (
                <tr
                  key={r.handle}
                  className={`border-b border-d-border last:border-0 ${
                    isMe ? 'bg-[#FFD16610]' : 'hover:bg-white/[0.02]'
                  } transition-colors`}
                  style={isMe ? { boxShadow: 'inset 2px 0 0 #FFD166' } : {}}
                >
                  <td className="px-5 py-2.5">
                    <RankCell rank={r.rank} />
                  </td>
                  <td className="px-2 py-2.5 font-mono text-[12px] text-white">
                    {r.handle}{isMe && <span className="ml-2 text-[10px] font-bold text-[#FFD166]">YOU</span>}
                  </td>
                  <td
                    className="px-2 py-2.5 text-right numeric font-medium"
                    style={{ color: r.return_pct >= 0 ? '#05B878' : '#FF5947' }}
                  >
                    {r.return_pct >= 0 ? '+' : ''}{r.return_pct.toFixed(2)}%
                  </td>
                  <td className="px-5 py-2.5 text-right numeric text-d-text-primary">
                    ₹{r.final_equity.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RankCell({ rank }: { rank: number }) {
  if (rank === 1) return <Medal className="w-4 h-4" style={{ color: '#FFD166' }} />
  if (rank === 2) return <Medal className="w-4 h-4" style={{ color: '#C0C0C0' }} />
  if (rank === 3) return <Medal className="w-4 h-4" style={{ color: '#C68642' }} />
  return <span className="numeric text-[12px] text-d-text-muted">#{rank}</span>
}
