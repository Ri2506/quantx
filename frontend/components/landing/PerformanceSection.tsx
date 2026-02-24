'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import ScrollReveal from '@/components/ui/ScrollReveal'
import GradientBorder from '@/components/ui/GradientBorder'

function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  decimals = 0,
}: {
  value: number
  suffix?: string
  prefix?: string
  decimals?: number
}) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    const duration = 1600
    const steps = 60
    const increment = value / steps
    let current = 0
    const precision = Math.pow(10, decimals)

    const timer = setInterval(() => {
      current += increment
      if (current >= value) {
        setCount(value)
        clearInterval(timer)
      } else {
        setCount(Math.round(current * precision) / precision)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value, decimals])

  const formatted = count.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

  return (
    <span>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

const stats = [
  { label: 'Capital Under Management', value: 12.4, prefix: '₹', suffix: ' Cr', decimals: 1 },
  { label: 'Win Rate (180d)', value: 68.4, suffix: '%', decimals: 1 },
  { label: 'Average Risk:Reward', value: 2.8, suffix: ':1', decimals: 1 },
  { label: 'Active Traders', value: 1847, suffix: '+', decimals: 0 },
]

const performanceRows = [
  { metric: 'Total Signals Generated', ours: { value: 2847, suffix: '', decimals: 0 }, buyHold: 'N/A', manual: 'N/A' },
  { metric: 'Win Rate (180 days)', ours: { value: 68.4, suffix: '%', decimals: 1 }, buyHold: 'N/A', manual: '52.3%' },
  { metric: 'Average Profit per Trade', ours: { value: 3.8, suffix: '%', decimals: 1 }, buyHold: 'N/A', manual: '2.1%' },
  { metric: 'Average Risk:Reward', ours: { value: 2.8, suffix: ':1', decimals: 1 }, buyHold: 'N/A', manual: '1.6:1' },
  { metric: 'Maximum Drawdown', ours: { value: -8.2, suffix: '%', decimals: 1 }, buyHold: '-18.7%', manual: '-14.3%' },
  { metric: 'Sharpe Ratio', ours: { value: 1.87, suffix: '', decimals: 2 }, buyHold: '0.62', manual: '0.94' },
  { metric: 'Average Hold Period', ours: { value: 5.2, suffix: ' days', decimals: 1 }, buyHold: 'N/A', manual: '8.6 days' },
  { metric: 'Profit Factor', ours: { value: 1.92, suffix: '', decimals: 2 }, buyHold: 'N/A', manual: '1.28' },
]

export default function PerformanceSection() {
  return (
    <section id="performance" className="relative px-6 py-32">
      <div className="bg-mesh-gradient absolute inset-0 opacity-30 pointer-events-none" />

      <div className="container relative z-10 mx-auto">
        {/* Stats Row */}
        <div className="mb-24 grid grid-cols-2 gap-8 text-center md:grid-cols-4">
          {stats.map((stat, index) => (
            <ScrollReveal key={stat.label} delay={index * 0.1}>
              <div className="glass-card-neu rounded-2xl p-6">
                <div className="text-4xl font-bold text-text-primary md:text-5xl">
                  <AnimatedCounter
                    value={stat.value}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    decimals={stat.decimals}
                  />
                </div>
                <p className="mt-3 text-sm font-medium text-text-secondary">{stat.label}</p>
              </div>
            </ScrollReveal>
          ))}
        </div>

        {/* Performance Table */}
        <ScrollReveal>
          <div className="mb-16 text-center">
            <h2 className="mb-6 text-4xl font-bold md:text-5xl">
              <span className="gradient-text-professional-blue">Auditable Performance</span>{' '}
              <span className="text-text-primary">Metrics</span>
            </h2>
            <p className="mx-auto max-w-3xl text-lg text-text-secondary">
              180-day backtested and 90-day live-tracked performance data with institutional-grade verification
            </p>
          </div>
        </ScrollReveal>

        <ScrollReveal>
          <GradientBorder className="mx-auto max-w-5xl">
            <div className="overflow-hidden rounded-[19px]">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left">
                  <thead className="border-b border-white/[0.06] bg-background-elevated/50">
                    <tr>
                      <th className="px-6 py-4 text-sm font-semibold text-text-primary">Performance Metric</th>
                      <th className="px-6 py-4 text-sm font-semibold text-neon-cyan">SwingAI System</th>
                      <th className="px-6 py-4 text-sm font-semibold text-text-secondary">Buy & Hold</th>
                      <th className="px-6 py-4 text-sm font-semibold text-text-secondary">Manual Swing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {performanceRows.map((row) => (
                      <tr key={row.metric} className="transition-colors hover:bg-white/[0.02]">
                        <td className="px-6 py-4 font-medium text-text-primary">{row.metric}</td>
                        <td className="px-6 py-4 text-lg font-bold text-neon-cyan">
                          <AnimatedCounter
                            value={row.ours.value}
                            suffix={row.ours.suffix}
                            decimals={row.ours.decimals}
                          />
                        </td>
                        <td className="px-6 py-4 text-text-secondary">{row.buyHold}</td>
                        <td className="px-6 py-4 text-text-secondary">{row.manual}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </GradientBorder>
        </ScrollReveal>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="mt-8 text-center text-xs leading-relaxed text-text-secondary max-w-4xl mx-auto"
        >
          Performance data based on 180-day live forward testing with real market execution.
          Metrics calculated using actual signal generation and position sizing of 2-3% per trade with maximum 15% portfolio exposure.
          <br />
          <strong className="text-text-primary">
            Past performance does not guarantee future results. All trading involves substantial risk of capital loss.
          </strong>
        </motion.p>
      </div>
    </section>
  )
}
