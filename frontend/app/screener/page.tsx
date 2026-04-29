'use client'

/**
 * /screener — DEPRECATED.
 *
 * Step 1 §6 locked decision: ``/screener`` + ``/pattern-detection`` were
 * merged into ``/scanner-lab`` (2-tab: Screeners · Patterns). This page
 * is a redirect shim kept for any stale bookmarks.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function ScreenerRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/scanner-lab?tab=screeners')
  }, [router])

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3 text-d-text-muted">
      <Loader2 className="w-5 h-5 text-primary animate-spin" />
      <p className="text-[12px]">
        Redirecting to{' '}
        <Link href="/scanner-lab" className="text-primary hover:underline">
          Scanner Lab
        </Link>
        …
      </p>
    </div>
  )
}
