'use client'

/**
 * HowItWorks — 5-step horizontal flow per Step 4 §5.1.1 §5.
 *
 * Sign up → Connect broker (optional) → AI scans NSE → You approve →
 * Manual or auto trade.
 */

import { UserPlus, Link2, Cpu, CheckCheck, Send } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Step {
  icon: LucideIcon
  title: string
  body: string
  note?: string
}

const STEPS: Step[] = [
  {
    icon: UserPlus,
    title: 'Sign up free',
    body: 'Seeded with ₹10,00,000 paper portfolio. Takes 40 seconds. No broker required.',
  },
  {
    icon: Link2,
    title: 'Connect broker',
    body: 'Zerodha / Upstox / Angel One — one-click OAuth. Only needed when you go live.',
    note: 'Optional',
  },
  {
    icon: Cpu,
    title: 'AI scans NSE',
    body: 'SwingLens, AlphaRank and HorizonCast read every Nifty 500 stock at 15:40 IST. RegimeIQ gates the result, ToneScan cross-checks news.',
  },
  {
    icon: CheckCheck,
    title: 'Approve signals',
    body: 'Every signal arrives with SwingLens forecast + engine consensus + plain-English explanation.',
  },
  {
    icon: Send,
    title: 'Trade manually or auto',
    body: 'One-click paper or live. Elite users delegate execution to AutoPilot auto-trader.',
  },
]

export default function HowItWorks() {
  return (
    <section className="relative max-w-6xl mx-auto px-4 md:px-6 py-20">
      <div className="text-center mb-12">
        <h2 className="text-[30px] font-semibold text-white">How it works</h2>
        <p className="text-[13px] text-d-text-muted mt-2">
          From signup to first trade in under 5 minutes.
        </p>
      </div>

      <ol className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
        {/* Connector line — desktop only */}
        <div
          aria-hidden
          className="hidden md:block absolute top-6 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent"
        />
        {STEPS.map((step, i) => (
          <li key={step.title} className="relative">
            <div
              className="w-12 h-12 rounded-full border-2 border-primary/40 bg-[#0A0D14] flex items-center justify-center mx-auto relative"
              style={{ boxShadow: '0 0 0 6px rgba(79,236,205,0.04)' }}
            >
              <step.icon className="w-5 h-5 text-primary" />
              <span className="absolute -top-1.5 -right-1.5 numeric text-[10px] font-semibold bg-primary text-black rounded-full w-5 h-5 flex items-center justify-center">
                {i + 1}
              </span>
            </div>
            <div className="mt-4 text-center">
              <h3 className="text-[13px] font-semibold text-white">
                {step.title}
                {step.note && (
                  <span className="block text-[10px] font-normal text-d-text-muted mt-0.5 tracking-wider uppercase">
                    {step.note}
                  </span>
                )}
              </h3>
              <p className="mt-1.5 text-[11px] text-d-text-secondary leading-relaxed max-w-[200px] mx-auto">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
