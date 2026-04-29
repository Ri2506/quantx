'use client'

/**
 * /quantai-alpha-pick — DEPRECATED in PR 91.
 *
 * Step 1 §3.3 lock: rebuilt as /momentum (F3 spec). The new surface
 * uses the public engine names (AlphaRank, HorizonCast, RegimeIQ)
 * instead of the legacy "QuantAI" branding which leaked the
 * underlying architecture intent.
 *
 * This redirect shim handles stale bookmarks + sidebar links from
 * older sessions; live nav points to /momentum directly.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function QuantaiAlphaPickRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/momentum')
  }, [router])

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-d-text-muted">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
      <p className="text-[12px]">
        Redirecting to{' '}
        <Link href="/momentum" className="text-primary hover:underline">
          Momentum Picks
        </Link>
        …
      </p>
    </div>
  )
}
