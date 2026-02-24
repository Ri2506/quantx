'use client'

import React from 'react'
import { Lock, LineChart, Target } from 'lucide-react'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import FloatingIllustration from '@/components/ui/FloatingIllustration'

const steps = [
  {
    step: '01',
    title: 'Secure API Integration',
    description:
      'OAuth 2.0 authentication with your existing broker (Zerodha, Upstox, Angel One). Read-only by default with granular permission controls.',
    icon: Lock,
  },
  {
    step: '02',
    title: 'Continuous Market Intelligence',
    description:
      'Proprietary surveillance engine monitors price action, volume dynamics, order flow patterns, and momentum characteristics across the entire investable universe 24/7.',
    icon: LineChart,
  },
  {
    step: '03',
    title: 'Precision Execution',
    description:
      'Review probability-scored signals with complete trade specifications. One-click order placement or full automation with customizable risk parameters.',
    icon: Target,
  },
]

export default function HowItWorksSection() {
  return (
    <section id="how" className="relative px-6 py-32">
      <div className="section-glow-divider absolute top-0 left-0 right-0" />

      <div className="container mx-auto">
        <ScrollReveal>
          <div className="mb-20 text-center">
            <h2 className="mb-6 text-4xl font-bold md:text-5xl">
              <span className="gradient-text-accent">Implementation</span>{' '}
              <span className="text-text-primary">Protocol</span>
            </h2>
            <p className="mx-auto max-w-3xl text-lg text-text-secondary">
              From integration to systematic execution in three methodical steps
            </p>
          </div>
        </ScrollReveal>

        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Left: Steps */}
          <div className="space-y-8">
            {steps.map((item, index) => (
              <ScrollReveal key={item.step} delay={index * 0.15} direction="left">
                <Card3D>
                  <div className="glass-card-neu rounded-2xl p-8 group relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-neon-cyan/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="relative z-10 flex gap-6">
                      <div className="flex-shrink-0">
                        <span className="text-6xl font-bold text-white/[0.04]">{item.step}</span>
                      </div>
                      <div>
                        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-neon-cyan/10 border border-neon-cyan/20">
                          {React.createElement(item.icon, { className: 'h-6 w-6 text-neon-cyan' })}
                        </div>
                        <h3 className="mb-3 text-xl font-semibold text-text-primary">{item.title}</h3>
                        <p className="text-sm leading-relaxed text-text-secondary">{item.description}</p>
                      </div>
                    </div>
                  </div>
                </Card3D>
              </ScrollReveal>
            ))}
          </div>

          {/* Right: Illustration */}
          <ScrollReveal direction="right" delay={0.2}>
            <div className="relative hidden lg:block">
              <div className="absolute -inset-8 rounded-3xl bg-gradient-to-br from-neon-purple/10 via-transparent to-neon-cyan/10 blur-3xl" />
              <FloatingIllustration variant="network" className="relative w-full h-auto" />
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  )
}
