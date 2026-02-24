'use client'

import { motion } from 'framer-motion'
import { Eye, Zap, Shield, Brain, Target, BarChart3 } from 'lucide-react'
import { BentoGrid, BentoCard } from '@/components/ui/BentoGrid'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'

const features = [
  {
    icon: Eye,
    title: 'AI Neural Pattern Recognition',
    description:
      'Deep learning neural networks analyze multi-dimensional market data to identify institutional accumulation patterns before public breakouts.',
    span: 2 as const,
  },
  {
    icon: Shield,
    title: 'AI-Driven Risk Management',
    description:
      'Intelligent risk architecture with dynamic position sizing, portfolio-level exposure controls, and automated kill-switches.',
  },
  {
    icon: Brain,
    title: 'Adaptive AI Intelligence',
    description:
      'Self-learning systems detect and adapt to changing market regimes across trending, ranging, and volatile conditions.',
  },
  {
    icon: Zap,
    title: 'ML Signal Generation',
    description:
      'Advanced ML algorithms scan 500+ liquid NSE/BSE equities to deliver the highest-conviction setups with quantified edge.',
    span: 2 as const,
  },
  {
    icon: Target,
    title: 'Precision Entry Zones',
    description:
      'Probability-scored signals with precision entry zones, AI-optimized stops, and multi-target exits.',
  },
  {
    icon: BarChart3,
    title: 'Real-time Analytics',
    description:
      'Live portfolio surveillance, performance tracking, and systematic execution infrastructure.',
  },
]

export default function FeaturesSection() {
  return (
    <section id="intelligence" className="relative px-6 py-32">
      <div className="section-glow-divider absolute top-0 left-0 right-0" />

      <div className="container mx-auto">
        <ScrollReveal>
          <div className="mb-20 text-center">
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-neon-cyan/20 bg-neon-cyan/5 px-5 py-2"
            >
              <Brain className="h-4 w-4 text-neon-cyan" />
              <span className="text-xs font-semibold uppercase tracking-wider text-neon-cyan">
                Intelligence Architecture
              </span>
            </motion.div>
            <h2 className="mb-6 text-4xl font-bold md:text-5xl">
              <span className="gradient-text-accent">AI-Powered Intelligence</span>{' '}
              <span className="text-text-primary">Architecture</span>
            </h2>
            <p className="mx-auto max-w-3xl text-lg text-text-secondary">
              Advanced artificial intelligence and machine learning capabilities engineered for
              institutional-grade systematic alpha generation
            </p>
          </div>
        </ScrollReveal>

        <BentoGrid>
          {features.map((feature, index) => (
            <BentoCard
              key={feature.title}
              span={feature.span}
              index={index}
            >
              <Card3D spotlight>
                <div className="card-lift p-2">
                  <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-neon-cyan/10 border border-neon-cyan/20">
                    <feature.icon className="h-7 w-7 text-neon-cyan" />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold text-text-primary">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-text-secondary">
                    {feature.description}
                  </p>
                </div>
              </Card3D>
            </BentoCard>
          ))}
        </BentoGrid>
      </div>
    </section>
  )
}
