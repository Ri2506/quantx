'use client'

/**
 * SystemHaltBanner — renders a platform-wide ops banner when the
 * global kill switch is active. Polls ``/api/public/system/status``
 * every 30 seconds so users know within a minute when trading is
 * paused or resumed.
 *
 * Public endpoint — works for unauthed pages too if ever mounted there.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

import { api } from '@/lib/api'

const POLL_MS = 30_000


export default function SystemHaltBanner() {
  const [halted, setHalted] = useState(false)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const s = await api.publicTrust.systemStatus()
        if (!cancelled) setHalted(Boolean(s.trading_halted))
      } catch {
        // Silent — never display a banner on the happy path if the
        // status endpoint itself fails.
      }
    }

    check()
    const id = setInterval(check, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (!halted) return null

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 bg-[#FF5947] text-white px-4 py-2 flex items-center justify-center gap-2 shadow-md"
    >
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <p className="text-[12px] font-medium text-center">
        Trading is paused platform-wide while the team investigates.
        Paper trading and read-only surfaces remain available.
      </p>
    </div>
  )
}
