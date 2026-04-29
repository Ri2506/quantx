'use client'

/**
 * Landing page (Step 4 §5.1.1 rebuild).
 *
 * 7-section layout:
 *   1. Nav bar (sticky)
 *   2. Hero — 100vh, headline + primary CTA + live chart placeholder
 *   3. TrackRecordBar — live 5-stat strip
 *   4. FeatureGrid — 12 F1-F12 cards
 *   5. HowItWorks — 5-step flow
 *   6. PricingPreview — 3 tier cards
 *   7. Footer (existing component)
 *
 * This is one of the few surfaces where Step 4 §7 allows glassmorphism
 * + blobs. Landing / pricing / auth are the only decorative exceptions.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, PlayCircle, Shield, TrendingUp, Zap } from 'lucide-react'

import LightNavbar from '@/components/landing/LightNavbar'
import Footer from '@/components/landing/Footer'
import BrandCarousel from '@/components/landing/BrandCarousel'
import TrackRecordBar from '@/components/landing/TrackRecordBar'
import FeatureGrid from '@/components/landing/FeatureGrid'
import HowItWorks from '@/components/landing/HowItWorks'
import PricingPreview from '@/components/landing/PricingPreview'
import { api } from '@/lib/api'


export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0A0D14] text-white overflow-x-hidden">
      <LightNavbar />

      {/* ── 2. Hero ── */}
      <section className="relative min-h-[100vh] flex items-center overflow-hidden pt-24 md:pt-0">
        {/* Decorative blobs (landing-only per Step 4 §7) */}
        <div
          aria-hidden
          className="absolute left-[-20%] top-[20%] w-[600px] h-[600px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(79,236,205,0.12) 0%, transparent 60%)' }}
        />
        <div
          aria-hidden
          className="absolute right-[-10%] bottom-[10%] w-[500px] h-[500px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(circle, rgba(141,92,255,0.10) 0%, transparent 60%)' }}
        />

        <div className="relative max-w-6xl w-full mx-auto px-4 md:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          {/* Left 55% */}
          <div className="lg:col-span-7">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-primary mb-5">
              <Shield className="w-3 h-3" />
              NSE-native · 12 AI models · Zero chatbot fluff
            </div>

            <h1 className="text-[40px] md:text-[56px] font-semibold leading-[1.05] tracking-tight">
              Institutional AI<br />
              <span className="text-primary">for Indian traders.</span>
            </h1>

            <p className="mt-5 text-[14px] md:text-[15px] text-d-text-secondary max-w-lg leading-relaxed">
              Eight proprietary engines — SwingLens · AlphaRank · HorizonCast · ToneScan · RegimeIQ —
              read the tape together. Every signal transparent, every number auditable.{' '}
              <strong className="text-white">3 tiers. Paper-trade free.</strong>
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-primary text-black rounded-md text-[13px] font-semibold hover:bg-primary-hover transition-colors"
              >
                Start free
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
              <Link
                href="/track-record"
                className="inline-flex items-center gap-1.5 px-5 py-2.5 border border-d-border rounded-md text-[13px] font-medium text-white hover:bg-white/[0.03] transition-colors"
              >
                <PlayCircle className="w-3.5 h-3.5" />
                See live track record
              </Link>
            </div>

            <div className="mt-8 flex items-center gap-5 text-[11px] text-d-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-up opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-up" />
                </span>
                Live since 2024
              </span>
              <span>·</span>
              <span>SEBI-compliant educational tool</span>
              <span>·</span>
              <span>Cancel anytime</span>
            </div>
          </div>

          {/* Right 45% — chart placeholder */}
          <div className="lg:col-span-5">
            <HeroChartPlaceholder />
          </div>
        </div>
      </section>

      {/* ── 3. TrackRecordBar ── */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 -mt-6 relative z-10">
        <TrackRecordBar />
      </section>

      {/* ── 4. FeatureGrid ── */}
      <FeatureGrid />

      {/* ── 5. HowItWorks ── */}
      <HowItWorks />

      {/* ── 6. PricingPreview ── */}
      <PricingPreview />

      {/* ── Social proof / press mentions ── */}
      <section className="max-w-6xl mx-auto px-4 md:px-6 pb-16">
        <p className="text-center text-[10px] uppercase tracking-wider text-d-text-muted mb-4">
          Trusted by traders across NSE, BSE + institutional desks
        </p>
        <BrandCarousel />
      </section>

      {/* ── Final CTA strip ── */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{ background: 'radial-gradient(ellipse at center, rgba(79,236,205,0.12) 0%, transparent 70%)' }}
        />
        <div className="relative max-w-4xl mx-auto px-4 md:px-6 py-20 text-center">
          <h2 className="text-[30px] font-semibold text-white">
            Start paper-trading in 40 seconds.
          </h2>
          <p className="text-[13px] text-d-text-muted mt-2 max-w-xl mx-auto">
            No broker required. No credit card. ₹10L virtual portfolio seeded at signup.
            Upgrade when you've beaten Nifty on paper — roughly half of our users do, by month 2.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-1.5 px-6 py-3 bg-primary text-black rounded-md text-[13px] font-semibold hover:bg-primary-hover transition-colors"
            >
              Start free
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link
              href="/models"
              className="inline-flex items-center gap-1.5 px-5 py-3 border border-d-border rounded-md text-[12px] text-white hover:bg-white/[0.03] transition-colors"
            >
              See live model accuracy
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}


// ------------------------------------------------------------- hero chart

const REGIME_COLORS: Record<string, { border: string; bg: string; text: string }> = {
  bull:     { border: 'rgba(5,184,120,0.30)',  bg: 'rgba(5,184,120,0.10)',  text: '#05B878' },
  sideways: { border: 'rgba(254,177,19,0.30)', bg: 'rgba(254,177,19,0.10)', text: '#FEB113' },
  bear:     { border: 'rgba(255,89,71,0.30)',  bg: 'rgba(255,89,71,0.10)',  text: '#FF5947' },
}

function HeroChartPlaceholder() {
  // PR 74 — replace hardcoded "22,843 / Bull 92% / TCS +3.1%" with live
  // public-endpoint data. All three reads are unauth + CDN-cached, so
  // the landing page stays cheap.
  // PR 108 — `best` now reads from /signal-of-the-day, which prefers an
  // active high-confidence signal from today and only falls back to the
  // best closed winner. Repeat visitors see fresh content.
  const [nifty, setNifty] = useState<{ last: number | null; pct: number | null } | null>(null)
  const [regime, setRegime] = useState<{ name: string; conf: number } | null>(null)
  const [best, setBest] = useState<
    | { kind: 'active'; symbol: string; direction: string; confidence: number }
    | { kind: 'closed_winner'; symbol: string; direction: string; pct: number }
    | null
  >(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const [idx, reg, sotd] = await Promise.all([
          api.publicTrust.indices().catch(() => null),
          api.publicTrust.regimeHistory(7).catch(() => null),
          api.publicTrust.signalOfTheDay().catch(() => null),
        ])
        if (!active) return
        if (idx) {
          const n = idx.indices.find((r) => r.key === 'nifty')
          if (n) setNifty({ last: n.last, pct: n.change_pct })
        }
        if (reg && (reg as any).current) {
          const r = (reg as any).current
          const confKey = `prob_${r.regime}` as 'prob_bull' | 'prob_sideways' | 'prob_bear'
          setRegime({ name: r.regime, conf: Number(r[confKey] || 0) })
        }
        if (sotd) {
          if (sotd.kind === 'active') {
            setBest({
              kind: 'active',
              symbol: sotd.symbol,
              direction: sotd.direction,
              confidence: sotd.confidence,
            })
          } else if (sotd.kind === 'closed_winner') {
            setBest({
              kind: 'closed_winner',
              symbol: sotd.symbol,
              direction: sotd.direction,
              pct: sotd.return_pct,
            })
          }
        }
      } catch {}
    })()
    return () => { active = false }
  }, [])

  const niftyUp = (nifty?.pct ?? 0) >= 0
  const regimeColors = regime ? REGIME_COLORS[regime.name] : null

  return (
    <div className="relative rounded-2xl border border-d-border bg-[#111520]/80 backdrop-blur-sm p-5 shadow-[0_30px_60px_rgba(0,0,0,0.4)]">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-d-text-muted">Nifty 50 · live</p>
          <p className="numeric text-[20px] font-semibold text-white mt-0.5">
            {nifty?.last != null
              ? nifty.last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : <span className="text-d-text-muted">--</span>}
            {nifty?.pct != null && (
              <span className={`text-[11px] font-medium ml-2 ${niftyUp ? 'text-up' : 'text-down'}`}>
                {niftyUp ? '+' : ''}{nifty.pct.toFixed(2)}%
              </span>
            )}
          </p>
        </div>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full border capitalize"
          style={
            regimeColors
              ? { borderColor: regimeColors.border, background: regimeColors.bg, color: regimeColors.text }
              : { borderColor: 'rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', color: '#8e8e8e' }
          }
        >
          {regime ? `${regime.name} · ${Math.round(regime.conf * 100)}%` : 'regime loading'}
        </span>
      </div>

      {/* Synthetic chart shape (SVG) */}
      <div className="relative h-[180px]">
        <svg viewBox="0 0 400 180" className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="heroGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4FECCD" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#4FECCD" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path
            d="M 0,140 L 20,135 L 40,138 L 60,128 L 80,120 L 100,125 L 120,110 L 140,95 L 160,105 L 180,85 L 200,78 L 220,72 L 240,80 L 260,60 L 280,55 L 300,50 L 320,45 L 340,35 L 360,30 L 380,22 L 400,20"
            stroke="#4FECCD"
            strokeWidth={2}
            fill="none"
          />
          <path
            d="M 0,140 L 20,135 L 40,138 L 60,128 L 80,120 L 100,125 L 120,110 L 140,95 L 160,105 L 180,85 L 200,78 L 220,72 L 240,80 L 260,60 L 280,55 L 300,50 L 320,45 L 340,35 L 360,30 L 380,22 L 400,20 L 400,180 L 0,180 Z"
            fill="url(#heroGrad)"
          />
          {/* SwingLens quantile band — dashed */}
          <path
            d="M 0,160 L 100,130 L 200,90 L 300,55 L 400,15"
            stroke="#5DCBD8"
            strokeWidth={1}
            strokeDasharray="4 4"
            fill="none"
            opacity={0.55}
          />
          <path
            d="M 0,110 L 100,100 L 200,60 L 300,28 L 400,-5"
            stroke="#5DCBD8"
            strokeWidth={1}
            strokeDasharray="4 4"
            fill="none"
            opacity={0.55}
          />
        </svg>
        <div className="absolute right-2 top-2 text-[9px] text-[#5DCBD8] numeric flex items-center gap-1">
          <TrendingUp className="w-2.5 h-2.5" />
          SwingLens p10 / p90 overlay
        </div>
      </div>

      {/* PR 108 — hero "today's best" card. Two shapes:
            - active: live high-confidence signal generated today
            - closed_winner: best closed winner over the last 7 days
          The endpoint picks; the landing just renders. Repeat visitors
          who saw the closed winner yesterday will see today's active
          pick when one exists. */}
      <div className="mt-4 p-3 rounded-lg border border-d-border bg-[#0A0D14] flex items-center gap-3">
        <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
        <div className="text-[11px] leading-tight min-w-0 flex-1">
          {best?.kind === 'active' ? (
            <>
              <p className="text-d-text-muted">Top signal today</p>
              <p className="text-white font-medium">
                {best.symbol}{' '}
                <span
                  className="numeric"
                  style={{ color: best.direction === 'LONG' ? '#05B878' : '#FF5947' }}
                >
                  {best.direction}
                </span>
                <span className="text-d-text-muted">
                  {' '}· conf <span className="numeric text-white">{best.confidence}</span>
                </span>
              </p>
            </>
          ) : best?.kind === 'closed_winner' ? (
            <>
              <p className="text-d-text-muted">Best closed signal · last 7 days</p>
              <p className="text-white font-medium">
                {best.symbol}{' '}
                <span className="numeric text-up">
                  {best.pct >= 0 ? '+' : ''}{best.pct.toFixed(2)}%
                </span>
                <span className="text-d-text-muted"> closed</span>
              </p>
            </>
          ) : (
            <>
              <p className="text-d-text-muted">Today's signal</p>
              <p className="text-d-text-muted">loading…</p>
            </>
          )}
        </div>
        <Link
          href={best?.kind === 'active' ? '/signals' : '/track-record'}
          className="text-[10px] text-primary hover:underline shrink-0"
        >
          {best?.kind === 'active' ? 'Unlock →' : 'See all →'}
        </Link>
      </div>
    </div>
  )
}
