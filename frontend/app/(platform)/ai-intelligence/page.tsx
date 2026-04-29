'use client'

/**
 * /ai-intelligence — DEPRECATED in PR 76.
 *
 * Step 1 §3.3 locked decision: rebuild as public `/models` (N4 trust
 * surface) showing live per-engine accuracy. The legacy surface here
 * mixed seven different scanner features and leaked real model
 * architecture names (LightGBM / TFTPredictor / LGBMGate) into the
 * UI — both moves violate the locked engine-name moat (descriptive
 * brand names only — SwingLens, AlphaRank, RegimeIQ, etc.).
 *
 * The seven feature panels were duplicates of surfaces that already
 * have proper homes:
 *   * Nifty Prediction       → /dashboard RegimeBanner + /regime
 *   * Market Regime          → /regime (public)
 *   * Momentum Radar         → /scanner-lab Screeners tab
 *   * Breakout Scanner       → /scanner-lab Patterns tab
 *   * Reversal Scanner       → /scanner-lab Patterns tab
 *   * Trend Analysis         → /scanner-lab Screeners tab
 *   * Price Forecast (TFT)   → /stock/[symbol] dossier (SwingLens)
 *
 * This page now redirects to /models so anyone who landed here from
 * a stale link or bookmark ends up on the real public model surface.
 */

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function AiIntelligenceRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/models')
  }, [router])
  return (
    <div className="min-h-[40vh] flex items-center justify-center px-4">
      <p className="text-[12px] text-d-text-muted">
        Redirecting to Model Accuracy…
      </p>
    </div>
  )
}
