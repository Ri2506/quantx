'use client'

/**
 * /pattern-detection — DEPRECATED.
 *
 * Step 1 §6: merged into ``/scanner-lab`` as the "Patterns" tab.
 * Redirect shim for stale bookmarks.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'

export default function PatternDetectionRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/scanner-lab?tab=patterns')
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
