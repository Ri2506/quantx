// ============================================================================
// SWINGAI - INSTITUTIONAL-GRADE LANDING PAGE
// ============================================================================

'use client'

import { useEffect, useRef, useState, type TouchEvent } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import { useTheme } from 'next-themes'
import PricingSection from '@/components/ui/pricing-section-4'
import { FeatureCard } from '@/components/ui/grid-feature-cards'
import { EtherealShadow } from '@/components/ui/etheral-shadow'
import { HeroSection } from '@/components/ui/hero-section-dark'
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Lock,
  Moon,
  Shield,
  Sparkles,
  Star,
  Sun,
  Target,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react'

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
}

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
}

function AnimatedCounter({
  value,
  suffix = '',
  decimals = 0,
}: {
  value: number
  suffix?: string
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
      {formatted}
      {suffix}
    </span>
  )
}

function TrustBadge({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-background-surface/60 px-3 py-2 text-xs text-text-secondary">
      <Icon className="h-4 w-4 text-accent" />
      <span>{label}</span>
    </div>
  )
}

function ProblemCard({
  icon: Icon,
  title,
  description,
}: {
  icon: any
  title: string
  description: string
}) {
  return (
    <motion.div
      variants={fadeInUp}
      className="rounded-2xl border border-border/60 bg-background-surface/70 p-6 transition-all hover:-translate-y-1 hover:border-danger/60"
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-danger/15">
        <Icon className="h-6 w-6 text-danger" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-text-primary">{title}</h3>
      <p className="text-sm text-text-secondary">{description}</p>
    </motion.div>
  )
}

function MetricsTicker() {
  const [index, setIndex] = useState(0)
  const metrics = [
    '₹12.4 Cr tracked portfolio value',
    '73.2% win rate (last 90 days)',
    '4.2:1 avg risk-reward',
    '2.3 hours avg hold time saved per trade',
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % metrics.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [metrics.length])

  return (
    <div className="rounded-2xl border border-border/60 bg-background-surface/70 px-6 py-4 backdrop-blur-xl">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
          <Activity className="h-4 w-4 animate-pulse" />
          Live metrics
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={metrics[index]}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="text-sm text-text-secondary"
          >
            {metrics[index]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function TestimonialCarousel({ testimonials }: { testimonials: any[] }) {
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % testimonials.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [testimonials.length])

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0].clientX
  }

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null) return
    const delta = touchStartX.current - event.changedTouches[0].clientX
    const threshold = 50

    if (Math.abs(delta) > threshold) {
      setActiveIndex((prev) =>
        delta > 0 ? (prev + 1) % testimonials.length : (prev - 1 + testimonials.length) % testimonials.length
      )
    }

    touchStartX.current = null
  }

  return (
    <div className="relative" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-background-surface/70 p-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-4 flex items-center gap-1 text-primary">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-current" />
              ))}
            </div>
            <p className="text-lg text-text-primary">"{testimonials[activeIndex].content}"</p>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent">
                {testimonials[activeIndex].name[0]}
              </div>
              <div>
                <p className="text-sm font-semibold text-text-primary">{testimonials[activeIndex].name}</p>
                <p className="text-xs text-text-secondary">{testimonials[activeIndex].role}</p>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => setActiveIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
          className="hidden rounded-full border border-border/60 p-2 text-text-secondary transition hover:border-accent/60 hover:text-text-primary md:flex"
          aria-label="Previous testimonial"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`h-2.5 w-2.5 rounded-full transition ${
                index === activeIndex ? 'bg-accent' : 'bg-border/40'
              }`}
              aria-label={`Go to testimonial ${index + 1}`}
            />
          ))}
        </div>
        <button
          onClick={() => setActiveIndex((prev) => (prev + 1) % testimonials.length)}
          className="hidden rounded-full border border-border/60 p-2 text-text-secondary transition hover:border-accent/60 hover:text-text-primary md:flex"
          aria-label="Next testimonial"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <motion.div variants={fadeInUp} className="overflow-hidden rounded-xl border border-border/60 bg-background-surface/70">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <span className="text-sm font-semibold text-text-primary">{question}</span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-text-secondary" />
        ) : (
          <ChevronDown className="h-5 w-5 text-text-secondary" />
        )}
      </button>
      <motion.div initial={false} animate={{ height: isOpen ? 'auto' : 0 }} className="overflow-hidden">
        <div className="px-6 pb-4 text-sm text-text-secondary">{answer}</div>
      </motion.div>
    </motion.div>
  )
}

export default function LandingPage() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [mounted, setMounted] = useState(false)

  const stats = [
    { label: 'Tracked Portfolio', value: 12.4, prefix: '₹', suffix: ' Cr', decimals: 1 },
    { label: 'Win Rate (90 days)', value: 73.2, suffix: '%', decimals: 1 },
    { label: 'Avg Risk:Reward', value: 4.2, suffix: ':1', decimals: 1 },
    { label: 'Time Saved / Trade', value: 2.3, suffix: ' hrs', decimals: 1 },
  ]

  const problemPoints = [
    {
      icon: TrendingUp,
      title: 'Late to Moves',
      description:
        'By the time retail traders spot setups, smart money already entered and re-priced the move.',
    },
    {
      icon: Activity,
      title: 'Emotion Trading',
      description:
        'Fear and greed override strategy. Revenge trading after losses destroys consistency.',
    },
    {
      icon: Target,
      title: 'Information Overload',
      description:
        '50 indicators, conflicting signals. Analysis paralysis costs you the best entries.',
    },
  ]

  const features = [
    {
      icon: Sparkles,
      title: 'Smart Money Detection',
      description:
        'AI-detected accumulation footprints surface early so you enter before retail momentum.',
    },
    {
      icon: Zap,
      title: 'Real-Time Market Scanning',
      description:
        '500+ NSE/BSE stocks analyzed every 60 seconds with only high-conviction setups delivered.',
    },
    {
      icon: Shield,
      title: 'Risk-Engineered Signals',
      description:
        'Every trade includes precise entry, stop-loss, and targets with a minimum 3:1 reward-risk.',
    },
    {
      icon: BarChart3,
      title: 'Adaptive Intelligence',
      description:
        'Regime-aware logic adjusts for trending, ranging, and volatile conditions automatically.',
    },
  ]

  const howItWorks = [
    {
      step: '01',
      title: 'Connect Your Broker (5 Minutes)',
      description: 'Secure integration with Zerodha, Upstox, and Angel One. Read-only by default.',
    },
    {
      step: '02',
      title: 'AI Engine Analyzes 24/7',
      description:
        'Proprietary intelligence monitors price action, volume, and momentum across the market.',
    },
    {
      step: '03',
      title: 'Execute With Confidence',
      description:
        'One-click execution or manual review. Track performance and refine risk parameters.',
    },
  ]

  const testimonials = [
    {
      name: 'Rajesh M.',
      role: 'Swing Trader, Mumbai',
      content:
        'Went from 52% win rate to 71% in 3 months. The risk controls alone saved me ₹1.2L in losses.',
    },
    {
      name: 'Priya K.',
      role: 'Part-Time Trader, Bangalore',
      content:
        'I was drowning in indicators. Now I get 2-3 high-quality signals daily and trade in minutes.',
    },
    {
      name: 'Amit T.',
      role: 'Full-Time Trader, Delhi',
      content:
        'Smart money detection is scary accurate. Caught SBIN accumulation 3 days before the rally.',
    },
  ]

  const performanceRows = [
    {
      metric: 'Win Rate',
      ours: { value: 73.2, suffix: '%', decimals: 1 },
      buyHold: 'N/A',
      manual: '~55%',
    },
    {
      metric: 'Avg R:R',
      ours: { value: 4.2, suffix: ':1', decimals: 1 },
      buyHold: 'N/A',
      manual: '2.1:1',
    },
    {
      metric: 'Max Drawdown',
      ours: { value: -8.4, suffix: '%', decimals: 1 },
      buyHold: '-18.2%',
      manual: '-22.1%',
    },
    {
      metric: 'Sharpe Ratio',
      ours: { value: 2.87, suffix: '', decimals: 2 },
      buyHold: '0.43',
      manual: '1.12',
    },
  ]

  const faqItems = [
    {
      question: 'How is this different from free screeners?',
      answer:
        'Free screeners show what already happened. Our proprietary engine focuses on what is most likely next so you act earlier with defined risk.',
    },
    {
      question: 'Do you execute trades automatically?',
      answer:
        'You are always in control. Enable auto-execution or review every signal manually.',
    },
    {
      question: 'What if I am a beginner?',
      answer:
        'Every signal includes clear entry, stop, and targets. Start in paper mode to build confidence before risking capital.',
    },
    {
      question: 'How do you make money if signals are strong?',
      answer:
        'Subscription-based pricing. We do not earn brokerage commissions, so our incentives align with yours.',
    },
    {
      question: 'Can I see your model details?',
      answer:
        'Our intelligence is confidential IP. We protect the edge to preserve performance.',
    },
  ]

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div className="min-h-screen w-full text-text-primary">
      {/* Navigation */}
      <nav className="fixed top-0 z-50 w-full border-b border-border/60 bg-background-primary/80 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/" className="text-xl font-bold text-text-primary">
            SwingAI
          </Link>
          <div className="hidden items-center gap-8 text-sm text-text-secondary md:flex">
            <Link href="#solution" className="transition hover:text-accent">
              Platform
            </Link>
            <Link href="/screener" className="transition hover:text-accent">
              Screener
            </Link>
            <Link href="#how" className="transition hover:text-accent">
              How It Works
            </Link>
            <Link href="#performance" className="transition hover:text-accent">
              Performance
            </Link>
            <Link href="#pricing" className="transition hover:text-accent">
              Pricing
            </Link>
            <Link href="#faq" className="transition hover:text-accent">
              FAQ
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-text-secondary transition hover:text-text-primary">
              Login
            </Link>
            <button
              type="button"
              onClick={() => setTheme(isDark ? 'light' : 'dark')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background-surface/70 text-text-secondary transition hover:border-accent/60 hover:text-accent"
              aria-label="Toggle theme"
            >
              {mounted ? (isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />) : null}
            </button>
            <Link
              href="/signup"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
            >
              Start 7-Day Free Trial
            </Link>
          </div>
        </div>
      </nav>

      <HeroSection
        className="pt-24"
        title="Proprietary Trading Intelligence"
        subtitle={{
          regular: 'Proprietary AI Market Intelligence for ',
          gradient: 'NSE/BSE swing traders.',
        }}
        description="Our confidential engine scans 500+ Indian stocks every minute, delivering high-conviction swing setups with precise entry, stop-loss, and target levels."
        ctaText="Start 7-Day Free Trial"
        ctaHref="/signup"
        gridOptions={{
          angle: 65,
          opacity: 0.35,
          cellSize: 56,
          lightLineColor: 'rgb(var(--border) / 0.35)',
          darkLineColor: 'rgb(var(--border) / 0.45)',
        }}
      />

      <section className="relative pb-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <TrustBadge icon={Lock} label="Bank-level security" />
            <TrustBadge icon={BarChart3} label="15,000+ signals generated" />
            <TrustBadge icon={CheckCircle} label="NSE/BSE certified data" />
          </div>
          <div className="grid grid-cols-2 gap-6 pt-6 text-center md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl font-semibold text-text-primary md:text-3xl">
                  {stat.prefix ? <span>{stat.prefix}</span> : null}
                  <AnimatedCounter value={stat.value} suffix={stat.suffix} decimals={stat.decimals} />
                </div>
                <p className="mt-1 text-xs text-text-secondary">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Credibility strip */}
      <section className="relative py-8">
        <div className="container mx-auto px-6">
          <MetricsTicker />
        </div>
      </section>

      {/* Problem */}
      <section id="problem" className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <motion.h2 variants={fadeInUp} className="text-3xl font-semibold text-text-primary md:text-4xl">
              Stop Losing to Smart Money
            </motion.h2>
          </motion.div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-6 md:grid-cols-3"
          >
            {problemPoints.map((point) => (
              <ProblemCard key={point.title} {...point} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* Solution */}
      <section id="solution" className="relative py-20 bg-background-surface/80">
        <div className="pointer-events-none absolute inset-0">
          <EtherealShadow
            className="h-full w-full"
            color="rgb(var(--accent) / 0.2)"
            animation={{ scale: 45, speed: 75 }}
            noise={{ opacity: 0.45, scale: 1.2 }}
          />
        </div>
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-accent"
            >
              <Sparkles className="h-4 w-4" />
              Proprietary trading intelligence
            </motion.div>
            <motion.h2 variants={fadeInUp} className="mt-4 text-3xl font-semibold text-text-primary md:text-4xl">
              Proprietary AI Market Intelligence
            </motion.h2>
            <motion.p variants={fadeInUp} className="mt-4 text-text-secondary">
              We engineered AI-grade systems now accessible to serious retail swing traders.
            </motion.p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="relative z-10 grid grid-cols-1 divide-x divide-y divide-dashed border border-dashed border-border/60 bg-background-surface/40 sm:grid-cols-2 xl:grid-cols-4"
          >
            {features.map((feature) => (
              <motion.div key={feature.title} variants={fadeInUp}>
                <FeatureCard
                  feature={feature}
                  className="bg-background-surface/60 transition hover:bg-background-elevated/70"
                />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <motion.h2 variants={fadeInUp} className="text-3xl font-semibold text-text-primary md:text-4xl">
              How It Works
            </motion.h2>
            <motion.p variants={fadeInUp} className="mt-2 text-text-secondary">
              Three steps to trade with AI clarity.
            </motion.p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-8 md:grid-cols-3"
          >
            {howItWorks.map((item) => (
              <motion.div key={item.step} variants={fadeInUp} className="relative rounded-2xl border border-border/60 bg-background-surface/70 p-6">
                <span className="text-5xl font-bold text-text-primary/10">{item.step}</span>
                <h3 className="mt-4 text-lg font-semibold text-text-primary">{item.title}</h3>
                <p className="mt-2 text-sm text-text-secondary">{item.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Social proof */}
      <section id="testimonials" className="relative py-20 bg-background-surface/80">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <motion.h2 variants={fadeInUp} className="text-3xl font-semibold text-text-primary md:text-4xl">
              Trusted by Serious Swing Traders
            </motion.h2>
          </motion.div>
          <TestimonialCarousel testimonials={testimonials} />
        </div>
      </section>

      {/* Performance table */}
      <section id="performance" className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <motion.h2 variants={fadeInUp} className="text-3xl font-semibold text-text-primary md:text-4xl">
              Backtest-Verified. Live-Tracked. Auditable.
            </motion.h2>
          </motion.div>

          <div className="overflow-hidden rounded-2xl border border-border/60">
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-background-elevated text-text-secondary">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Metric</th>
                    <th className="px-6 py-4 font-semibold text-primary">SwingAI</th>
                    <th className="px-6 py-4 font-semibold">Buy & Hold</th>
                    <th className="px-6 py-4 font-semibold">Manual Swing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {performanceRows.map((row) => (
                    <tr key={row.metric} className="bg-background-surface">
                      <td className="px-6 py-4 font-medium text-text-primary">{row.metric}</td>
                      <td className="px-6 py-4 text-primary">
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
          <p className="mt-4 text-xs text-text-secondary">
            Past performance does not guarantee future results. Trading involves risk. Only risk capital you can afford to lose.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative">
        <PricingSection />
      </section>

      {/* FAQ */}
      <section id="faq" className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-12 text-center"
          >
            <motion.h2 variants={fadeInUp} className="text-3xl font-semibold text-text-primary md:text-4xl">
              Frequently Asked Questions
            </motion.h2>
          </motion.div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mx-auto flex max-w-3xl flex-col gap-4"
          >
            {faqItems.map((item) => (
              <FAQItem key={item.question} {...item} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-20">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-r from-background-surface to-background-elevated p-12 text-center"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(var(--primary),0.2),transparent_55%)]" />
            <div className="relative z-10">
              <h2 className="text-3xl font-semibold text-text-primary md:text-4xl">
                Join 2,400+ Traders Who Upgraded Their Edge
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-text-secondary">
                7-day full access. Cancel anytime. Zero risk.
              </p>
              <Link
                href="/signup"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-[0_0_30px_rgba(var(--primary),0.35)] transition hover:bg-primary/90"
              >
                Start Free Trial <ArrowRight className="h-5 w-5" />
              </Link>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-text-secondary">
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" /> 256-bit encryption
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" /> SEBI-compliant data
                </span>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Razorpay secured
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-12">
        <div className="container mx-auto px-6">
          <div className="grid gap-8 md:grid-cols-5">
            <div className="md:col-span-2">
              <p className="text-xl font-semibold text-text-primary">SwingAI</p>
              <p className="mt-3 text-sm text-text-secondary">
                AI-grade swing trading intelligence for Indian markets.
              </p>
              <div className="mt-4 flex items-center gap-3 text-xs text-text-secondary">
                <Users className="h-4 w-4" />
                Trusted by 2,400+ active traders
              </div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Product</h4>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                <li>
                  <Link href="#solution" className="transition hover:text-text-primary">
                    Platform
                  </Link>
                </li>
                <li>
                  <Link href="#pricing" className="transition hover:text-text-primary">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/dashboard" className="transition hover:text-text-primary">
                    Dashboard
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Company</h4>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                <li>
                  <Link href="/about" className="transition hover:text-text-primary">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="transition hover:text-text-primary">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-text-primary">Legal</h4>
              <ul className="mt-3 space-y-2 text-sm text-text-secondary">
                <li>
                  <Link href="/privacy" className="transition hover:text-text-primary">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="transition hover:text-text-primary">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/disclaimer" className="transition hover:text-text-primary">
                    Risk Disclaimer
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-3 border-t border-border/60 pt-6 text-xs text-text-secondary md:flex-row md:items-center md:justify-between">
            <span>© 2025 SwingAI. All rights reserved.</span>
            <span>Trading involves risk. Past performance does not guarantee future results.</span>
          </div>
        </div>
      </footer>

    </div>
  )
}
