'use client'

/**
 * PricingPreview — 3 tier cards per Step 4 §5.1.1 §6.
 *
 * Locked pricing: Free / Pro ₹999 / Elite ₹1,999. Each tier shows 5-6
 * bullet features and a primary CTA. Pro card gets "Most popular" tag.
 */

import Link from 'next/link'
import { Check, Crown, Sparkles } from 'lucide-react'

interface Tier {
  name: 'Free' | 'Pro' | 'Elite'
  price: string
  priceSub: string
  positioning: string
  bullets: string[]
  ctaLabel: string
  highlight?: 'popular' | 'gold'
}

const TIERS: Tier[] = [
  {
    name: 'Free',
    price: '₹0',
    priceSub: 'forever',
    positioning: 'Paper-trade every AI signal with virtual ₹10L.',
    bullets: [
      '1 swing signal per day',
      'Paper portfolio + league',
      'Market regime + track record',
      'Copilot 5 messages / day',
      'Telegram daily digest',
    ],
    ctaLabel: 'Start free',
  },
  {
    name: 'Pro',
    price: '₹999',
    priceSub: 'per month',
    positioning: 'Unlocks the full AI signal stack for serious retail.',
    bullets: [
      'Unlimited swing + intraday signals',
      'Scanner Lab (50+ filters + 11 patterns)',
      'Weekly momentum top-10 · sector rotation',
      'Copilot 150 msgs/day · WhatsApp digest',
      'Portfolio Doctor (monthly)',
    ],
    ctaLabel: 'Upgrade to Pro',
    highlight: 'popular',
  },
  {
    name: 'Elite',
    price: '₹1,999',
    priceSub: 'per month',
    positioning: 'Auto-executing flagships — connect broker, AI does the rest.',
    bullets: [
      'AutoPilot auto-trader (F4)',
      'AI SIP long-term portfolio (F5) · AllocIQ + InsightAI',
      'F&O options strategies (F6) · VolCast',
      'Counterpoint Bull/Bear debate on every signal',
      'Unlimited Copilot · chart-vision analysis',
    ],
    ctaLabel: 'Upgrade to Elite',
    highlight: 'gold',
  },
]

export default function PricingPreview() {
  return (
    <section className="max-w-6xl mx-auto px-4 md:px-6 py-20">
      <div className="text-center mb-10">
        <h2 className="text-[30px] font-semibold text-white">Simple pricing</h2>
        <p className="text-[13px] text-d-text-muted mt-2">
          Three tiers. No feature-unbundling tricks. Cancel anytime.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TIERS.map((t) => (
          <TierCard key={t.name} tier={t} />
        ))}
      </div>

      <p className="text-center mt-6 text-[11px] text-d-text-muted">
        Prices exclude GST. Full tier comparison on{' '}
        <Link href="/pricing" className="text-primary hover:underline">/pricing</Link>.
      </p>
    </section>
  )
}

function TierCard({ tier }: { tier: Tier }) {
  const isElite = tier.highlight === 'gold'
  const isPopular = tier.highlight === 'popular'

  const borderStyle: React.CSSProperties = isElite
    ? { borderImage: 'linear-gradient(135deg, #FFD166, #FF9900) 1', borderWidth: 2, borderStyle: 'solid' }
    : isPopular
    ? { borderColor: 'rgba(79,236,205,0.45)', borderWidth: 1 }
    : {}

  return (
    <div
      className="relative rounded-2xl bg-[#111520]/70 backdrop-blur-sm p-6 flex flex-col"
      style={borderStyle}
    >
      {isPopular && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-wider uppercase bg-primary text-black rounded-full px-2.5 py-0.5 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Most popular
        </span>
      )}
      {isElite && (
        <span
          className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-wider uppercase rounded-full px-2.5 py-0.5 flex items-center gap-1 text-black"
          style={{ background: 'linear-gradient(135deg, #FFD166, #FF9900)' }}
        >
          <Crown className="w-3 h-3" />
          Flagship
        </span>
      )}

      <h3 className="text-[14px] uppercase tracking-wider text-d-text-muted mb-1">
        {tier.name}
      </h3>
      <div className="flex items-baseline gap-1.5 mb-2">
        <span className="numeric text-[32px] font-semibold text-white">{tier.price}</span>
        <span className="text-[11px] text-d-text-muted">{tier.priceSub}</span>
      </div>
      <p className="text-[12px] text-d-text-secondary mb-4">{tier.positioning}</p>

      <ul className="space-y-2 flex-1 mb-6">
        {tier.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2 text-[12px] text-d-text-primary">
            <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
            {b}
          </li>
        ))}
      </ul>

      <Link
        href="/signup"
        className={`block text-center w-full py-2.5 text-[13px] font-semibold rounded-md transition-colors ${
          isElite
            ? 'text-black hover:opacity-90'
            : isPopular
            ? 'bg-primary text-black hover:bg-primary-hover'
            : 'border border-d-border text-white hover:bg-white/[0.03]'
        }`}
        style={isElite ? { background: 'linear-gradient(135deg, #FFD166, #FF9900)' } : undefined}
      >
        {tier.ctaLabel}
      </Link>
    </div>
  )
}
