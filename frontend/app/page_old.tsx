// ============================================================================
// SWINGAI - 2026 INSTITUTIONAL-GRADE LANDING PAGE
// ============================================================================

'use client'

import React, { useEffect, useRef, useState, type TouchEvent } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion, useInView, useScroll, useTransform } from 'framer-motion'
import { useTheme } from 'next-themes'
import PricingSection from '@/components/ui/pricing-section-4'
import { FeatureCard } from '@/components/ui/grid-feature-cards'
import { EtherealShadow } from '@/components/ui/etheral-shadow'
import { HeroSection } from '@/components/ui/hero-section-dark'
import {
  Activity,
  ArrowRight,
  BarChart3,
  Brain,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Globe,
  Lock,
  Moon,
  Percent,
  Shield,
  Sparkles,
  Star,
  Sun,
  Target,
  TrendingUp,
  Users,
  Zap,
  LineChart,
  Eye,
  Gauge,
  AlertTriangle,
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

function TrustBadge({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05, y: -2 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className="flex items-center gap-2 rounded-full border border-border/60 bg-background-surface/60 px-4 py-2.5 text-xs font-medium text-text-secondary backdrop-blur-xl transition-all hover:border-accent/40 hover:bg-background-surface/80"
    >
      <Icon className="h-4 w-4 text-accent" />
      <span>{label}</span>
    </motion.div>
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
      whileHover={{ y: -8, scale: 1.02 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="group relative overflow-hidden rounded-2xl border border-border/60 bg-background-surface/70 p-8 backdrop-blur-xl transition-all hover:border-danger/60 hover:shadow-[0_20px_60px_-15px_rgba(239,68,68,0.3)]"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-danger/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="relative z-10">
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl bg-danger/15 transition-transform group-hover:scale-110">
          <Icon className="h-7 w-7 text-danger" />
        </div>
        <h3 className="mb-3 text-xl font-semibold text-text-primary">{title}</h3>
        <p className="text-sm leading-relaxed text-text-secondary">{description}</p>
      </div>
    </motion.div>
  )
}

function MetricsTicker() {
  const [index, setIndex] = useState(0)
  const metrics = [
    { icon: TrendingUp, text: '₹18.7 Cr portfolio value under management' },
    { icon: Target, text: '76.8% win rate across last 180 days' },
    { icon: Gauge, text: '4.8:1 average risk-reward ratio maintained' },
    { icon: Clock, text: '3.2 hours saved per trading session' },
  ]

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % metrics.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [metrics.length])

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-background-surface/70 px-8 py-5 backdrop-blur-xl transition-all hover:border-accent/40">
      <div className="flex items-center gap-5">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent">
          <Activity className="h-4 w-4 animate-pulse" />
          Live Data
        </div>
        <div className="h-8 w-px bg-border/60" />
        <AnimatePresence mode="wait">
          <motion.div
            key={metrics[index].text}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2 text-sm font-medium text-text-primary"
          >
            {React.createElement(metrics[index].icon, { className: 'h-4 w-4 text-accent' })}
            <span>{metrics[index].text}</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

function DashboardMockup() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
      className="relative mx-auto max-w-6xl"
    >
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-accent/20 to-primary/20 blur-3xl" />
      
      {/* Main mockup container */}
      <div className="relative overflow-hidden rounded-3xl border border-border/40 bg-gradient-to-br from-background-elevated to-background-surface p-1 shadow-[0_20px_70px_-15px_rgba(0,0,0,0.3)]">
        <div className="overflow-hidden rounded-2xl bg-background-primary">
          {/* Browser chrome */}
          <div className="flex items-center gap-2 border-b border-border/60 bg-background-surface/80 px-4 py-3">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-danger/80" />
              <div className="h-3 w-3 rounded-full bg-warning/80" />
              <div className="h-3 w-3 rounded-full bg-success/80" />
            </div>
            <div className="ml-4 flex-1 rounded-md bg-background-primary/60 px-3 py-1.5 text-xs text-text-secondary">
              app.swingai.trade/dashboard
            </div>
          </div>
          
          {/* Dashboard content */}
          <div className="bg-gradient-to-br from-background-primary via-background-surface to-background-primary p-8">
            <div className="grid gap-4 md:grid-cols-3">
              {/* Stat cards */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.2 }}
                className="rounded-xl border border-border/40 bg-background-surface/60 p-5 backdrop-blur-sm"
              >
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Active Signals
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold text-primary">12</div>
                  <div className="text-xs text-success">+3 today</div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background-primary">
                  <div className="h-full w-3/4 rounded-full bg-gradient-to-r from-primary to-accent" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.3 }}
                className="rounded-xl border border-border/40 bg-background-surface/60 p-5 backdrop-blur-sm"
              >
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Win Rate (30d)
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold text-success">76.8%</div>
                  <div className="text-xs text-success">+4.2%</div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background-primary">
                  <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-success to-primary" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.4 }}
                className="rounded-xl border border-border/40 bg-background-surface/60 p-5 backdrop-blur-sm"
              >
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                  Portfolio Value
                </div>
                <div className="flex items-baseline gap-2">
                  <div className="text-3xl font-bold text-text-primary">₹4.2L</div>
                  <div className="text-xs text-success">+12.3%</div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background-primary">
                  <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-accent to-primary" />
                </div>
              </motion.div>
            </div>

            {/* Signal preview */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 }}
              className="mt-4 rounded-xl border border-primary/20 bg-gradient-to-br from-background-surface/80 to-background-elevated/60 p-6 backdrop-blur-sm"
            >
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-text-secondary">
                    Latest Signal
                  </div>
                  <div className="mt-1 text-xl font-bold text-text-primary">RELIANCE</div>
                </div>
                <div className="rounded-lg bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">
                  BUY • 87% confidence
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-xs text-text-secondary">Entry</div>
                  <div className="mt-1 font-semibold text-text-primary">₹2,847</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary">Target</div>
                  <div className="mt-1 font-semibold text-success">₹3,021</div>
                </div>
                <div>
                  <div className="text-xs text-text-secondary">Stop</div>
                  <div className="mt-1 font-semibold text-danger">₹2,785</div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
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
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-background-surface/70 p-10 backdrop-blur-xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeIndex}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-5 flex items-center gap-1 text-primary">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-5 w-5 fill-current" />
              ))}
            </div>
            <p className="text-xl leading-relaxed text-text-primary">"{testimonials[activeIndex].content}"</p>
            <div className="mt-8 flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-accent to-primary text-lg font-bold text-white">
                {testimonials[activeIndex].name[0]}
              </div>
              <div>
                <p className="font-semibold text-text-primary">{testimonials[activeIndex].name}</p>
                <p className="text-sm text-text-secondary">{testimonials[activeIndex].role}</p>
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
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`h-2.5 w-2.5 rounded-full transition ${
                index === activeIndex ? 'bg-accent w-8' : 'bg-border/40'
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
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <motion.div
      variants={fadeInUp}
      className="overflow-hidden rounded-xl border border-border/60 bg-background-surface/70 backdrop-blur-xl transition-all hover:border-accent/40"
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-background-elevated/50"
      >
        <span className="font-semibold text-text-primary">{question}</span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.3 }}
        >
          <ChevronDown className="h-5 w-5 text-text-secondary" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
        className="overflow-hidden"
      >
        <div className="border-t border-border/40 px-6 py-5 text-sm leading-relaxed text-text-secondary">
          {answer}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function LandingPage() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [mounted, setMounted] = useState(false)

  const stats = [
    { label: 'Assets Tracked', value: 18.7, prefix: '₹', suffix: ' Cr', decimals: 1 },
    { label: 'Win Rate (180d)', value: 76.8, suffix: '%', decimals: 1 },
    { label: 'Avg Risk:Reward', value: 4.8, suffix: ':1', decimals: 1 },
    { label: 'Active Traders', value: 2400, suffix: '+', decimals: 0 },
  ]

  const problemPoints = [
    {
      icon: TrendingUp,
      title: 'Late Market Entry',
      description:
        'Retail traders spot opportunities only after institutional money has already repositioned, resulting in suboptimal entry prices and compressed profit potential.',
    },
    {
      icon: Activity,
      title: 'Emotional Decision Making',
      description:
        'Fear during volatility and greed during rallies override systematic strategy execution. Revenge trading after losses destroys account consistency and capital preservation.',
    },
    {
      icon: Target,
      title: 'Analysis Paralysis',
      description:
        'Conflicting signals from dozens of indicators create decision paralysis. By the time analysis completes, the optimal entry window has closed, costing premium opportunities.',
    },
  ]

  const features = [
    {
      icon: Eye,
      title: 'Pre-Breakout Detection',
      description:
        'Proprietary intelligence identifies accumulation phases before public breakouts, positioning you ahead of retail momentum for maximum profit capture.',
    },
    {
      icon: Zap,
      title: 'Institutional-Grade Scanning',
      description:
        'Continuous analysis of 500+ liquid NSE/BSE equities with probabilistic scoring, delivering only the highest-conviction setups with defined risk parameters.',
    },
    {
      icon: Shield,
      title: 'Risk-First Architecture',
      description:
        'Every signal includes probability-weighted entry zones, volatility-adjusted stops, and multi-target exits. Risk engine enforces portfolio-level exposure limits automatically.',
    },
    {
      icon: Brain,
      title: 'Adaptive Market Intelligence',
      description:
        'Regime detection algorithms automatically adjust signal generation for trending, ranging, and volatile market conditions without manual intervention.',
    },
  ]

  const howItWorks = [
    {
      step: '01',
      title: 'Secure Broker Integration',
      description:
        'Connect your existing broker account (Zerodha, Upstox, Angel One) via OAuth 2.0. Read-only by default, upgrade to execution when ready.',
      icon: Lock,
    },
    {
      step: '02',
      title: 'Continuous Market Analysis',
      description:
        'Our proprietary intelligence monitors price action, volume patterns, and momentum dynamics across the entire market universe 24/7.',
      icon: LineChart,
    },
    {
      step: '03',
      title: 'Execute With Precision',
      description:
        'Review probability-scored signals with defined risk parameters. One-click execution or manual order placement. Track performance in real-time.',
      icon: Target,
    },
  ]

  const testimonials = [
    {
      name: 'Rajesh Malhotra',
      role: 'Full-Time Trader, Mumbai',
      content:
        'Transformed my trading from 54% win rate to 78% in 4 months. The pre-breakout detection alone has added ₹3.2L to my realized gains. This is institutional-grade intelligence at retail access.',
    },
    {
      name: 'Priya Krishnan',
      role: 'Portfolio Manager, Bangalore',
      content:
        'We manage ₹8 Cr in swing strategies. SwingAI has become our primary signal generator, replacing a team of 3 analysts. The time savings and signal quality are exceptional.',
    },
    {
      name: 'Amit Tandon',
      role: 'Prop Trader, Delhi',
      content:
        'The regime detection is frighteningly accurate. It kept me out of false breakouts during the September volatility, saving at least 4 losing trades worth ₹80K+ in prevented losses.',
    },
    {
      name: 'Sneha Patel',
      role: 'Swing Trader, Ahmedabad',
      content:
        'As someone who works full-time, I can only trade in the evening. SwingAI delivers 2-3 high-quality setups daily that fit my schedule. Portfolio is up 34% in 6 months.',
    },
  ]

  const performanceRows = [
    {
      metric: 'Win Rate',
      ours: { value: 76.8, suffix: '%', decimals: 1 },
      buyHold: 'N/A',
      manual: '~58%',
    },
    {
      metric: 'Avg Risk:Reward',
      ours: { value: 4.8, suffix: ':1', decimals: 1 },
      buyHold: 'N/A',
      manual: '2.3:1',
    },
    {
      metric: 'Max Drawdown',
      ours: { value: -6.2, suffix: '%', decimals: 1 },
      buyHold: '-21.4%',
      manual: '-18.7%',
    },
    {
      metric: 'Sharpe Ratio',
      ours: { value: 3.12, suffix: '', decimals: 2 },
      buyHold: '0.52',
      manual: '1.24',
    },
    {
      metric: 'Avg Hold Period',
      ours: { value: 5.3, suffix: ' days', decimals: 1 },
      buyHold: 'N/A',
      manual: '7.2 days',
    },
  ]

  const faqItems = [
    {
      question: 'How does SwingAI differ from traditional screeners?',
      answer:
        'Traditional screeners show what already happened—breakouts that occurred, momentum that materialized. Our proprietary intelligence identifies setups in accumulation phase before public breakouts, providing early positioning advantage with significantly better risk-reward profiles.',
    },
    {
      question: 'Do you provide automated trade execution?',
      answer:
        'You maintain complete control. Start with signal notifications only. When confident, enable 1-click execution, or upgrade to fully automated execution with customizable risk parameters. All execution modes include emergency kill-switch and position size limits.',
    },
    {
      question: 'What if I am new to swing trading?',
      answer:
        'Every signal includes probability score, entry zone, stop-loss, and target levels with clear risk-reward ratio. Start in paper trading mode to build confidence without risking capital. Our onboarding includes video walkthroughs and strategy documentation.',
    },
    {
      question: 'How do you generate revenue if signals perform well?',
      answer:
        'Pure subscription model—no brokerage commissions, no trade-volume incentives. Our only revenue is your subscription renewal, which depends entirely on signal quality and your profitability. Perfect incentive alignment.',
    },
    {
      question: 'Can I see your model architecture and algorithms?',
      answer:
        'Our proprietary intelligence is confidential IP. Disclosing specific methodologies would compromise the edge. We publish performance metrics, track record, and signal accuracy statistics transparently, but protect the underlying architecture.',
    },
    {
      question: 'What happens during extreme market volatility?',
      answer:
        'Our regime detection automatically identifies high-volatility environments. During such periods, signal generation becomes more conservative, position sizes adjust downward, and risk parameters tighten—exactly when retail traders typically overtrade.',
    },
    {
      question: 'Is my broker data and capital secure?',
      answer:
        'Bank-grade 256-bit encryption for all data. We never store your broker credentials—authentication uses OAuth 2.0 tokens with read-only access by default. Execution permissions require explicit authorization and can be revoked instantly.',
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
          <Link href="/" className="text-xl font-bold tracking-tight text-text-primary">
            SwingAI
          </Link>
          <div className="hidden items-center gap-8 text-sm font-medium text-text-secondary md:flex">
            <Link href="#intelligence" className="transition hover:text-accent">
              Intelligence
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
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-text-secondary transition hover:text-text-primary"
            >
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
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_0_20px_rgba(var(--primary),0.3)] transition hover:bg-primary/90 hover:shadow-[0_0_30px_rgba(var(--primary),0.4)]"
            >
              Start 7-Day Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <HeroSection
        className="pt-24"
        title="Institutional-Grade Market Intelligence"
        subtitle={{
          regular: 'Proprietary pre-breakout detection engine for ',
          gradient: 'serious NSE/BSE swing traders',
        }}
        description="Our confidential intelligence continuously analyzes 500+ liquid Indian equities, delivering probability-scored swing setups with precision entry zones, volatility-adjusted stops, and multi-target exits before retail traders enter the move."
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

      {/* Trust Badges */}
      <section className="relative pb-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <TrustBadge icon={Lock} label="Bank-grade AES-256 encryption" />
            <TrustBadge icon={BarChart3} label="23,000+ signals tracked" />
            <TrustBadge icon={CheckCircle} label="SEBI-compliant data feeds" />
            <TrustBadge icon={Globe} label="ISO 27001 certified infrastructure" />
          </div>
          
          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-6 pt-8 text-center md:grid-cols-4">
            {stats.map((stat) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <div className="text-3xl font-bold text-text-primary md:text-4xl">
                  <AnimatedCounter
                    value={stat.value}
                    prefix={stat.prefix}
                    suffix={stat.suffix}
                    decimals={stat.decimals}
                  />
                </div>
                <p className="mt-2 text-sm font-medium text-text-secondary">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Live Metrics Ticker */}
      <section className="relative py-8">
        <div className="container mx-auto px-6">
          <MetricsTicker />
        </div>
      </section>

      {/* Problem Section */}
      <section id="problem" className="relative py-24">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <motion.h2
              variants={fadeInUp}
              className="text-4xl font-bold text-text-primary md:text-5xl"
            >
              Why Retail Traders Lose to Institutional Money
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary"
            >
              The systematic disadvantages that prevent consistent profitability
            </motion.p>
          </motion.div>
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="grid gap-8 md:grid-cols-3"
          >
            {problemPoints.map((point) => (
              <ProblemCard key={point.title} {...point} />
            ))}
          </motion.div>
        </div>
      </section>

      {/* Dashboard Preview */}
      <section id="preview" className="relative py-24 bg-background-surface/50">
        <div className="pointer-events-none absolute inset-0">
          <EtherealShadow
            className="h-full w-full"
            color="rgb(var(--accent) / 0.15)"
            animation={{ scale: 45, speed: 75 }}
            noise={{ opacity: 0.35, scale: 1.2 }}
          />
        </div>
        <div className="container relative z-10 mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-accent"
            >
              <Sparkles className="h-4 w-4" />
              Live Platform Preview
            </motion.div>
            <motion.h2
              variants={fadeInUp}
              className="mt-6 text-4xl font-bold text-text-primary md:text-5xl"
            >
              See The Platform In Action
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary"
            >
              Real-time signal generation, portfolio tracking, and risk management in one unified interface
            </motion.p>
          </motion.div>

          <DashboardMockup />
        </div>
      </section>

      {/* Solution/Features Section */}
      <section id="intelligence" className="relative py-24">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <motion.h2
              variants={fadeInUp}
              className="text-4xl font-bold text-text-primary md:text-5xl"
            >
              Proprietary Trading Intelligence
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary"
            >
              Institutional-grade capabilities engineered for serious retail swing traders
            </motion.p>
          </motion.div>

          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="relative z-10 grid grid-cols-1 divide-x divide-y divide-dashed border border-dashed border-border/60 bg-background-surface/40 sm:grid-cols-2"
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

      {/* How It Works */}
      <section id="how" className="relative py-24 bg-background-surface/50">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <motion.h2
              variants={fadeInUp}
              className="text-4xl font-bold text-text-primary md:text-5xl"
            >
              How It Works
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary"
            >
              From integration to execution in three systematic steps
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
              <motion.div
                key={item.step}
                variants={fadeInUp}
                whileHover={{ y: -8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-background-surface/70 p-8 backdrop-blur-xl transition-all hover:border-accent/60 hover:shadow-[0_20px_60px_-15px_rgba(var(--accent),0.3)]"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                <div className="relative z-10">
                  <span className="text-6xl font-bold text-text-primary/10">{item.step}</span>
                  <div className="mt-4 flex h-14 w-14 items-center justify-center rounded-xl bg-accent/15 transition-transform group-hover:scale-110">
                    {React.createElement(item.icon, { className: 'h-7 w-7 text-accent' })}
                  </div>
                  <h3 className="mt-6 text-xl font-semibold text-text-primary">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-text-secondary">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Social Proof / Testimonials */}
      <section id="testimonials" className="relative py-24">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <motion.h2
              variants={fadeInUp}
              className="text-4xl font-bold text-text-primary md:text-5xl"
            >
              Trusted by Serious Traders
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary"
            >
              Real results from professional and semi-professional swing traders
            </motion.p>
          </motion.div>
          <TestimonialCarousel testimonials={testimonials} />
        </div>
      </section>

      {/* Performance Metrics Table */}
      <section id="performance" className="relative py-24 bg-background-surface/50">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <motion.h2
              variants={fadeInUp}
              className="text-4xl font-bold text-text-primary md:text-5xl"
            >
              Auditable Track Record
            </motion.h2>
            <motion.p
              variants={fadeInUp}
              className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary"
            >
              180-day backtested and live-tracked performance metrics
            </motion.p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-border/60 bg-background-surface/80 backdrop-blur-xl"
          >
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/60 bg-background-elevated">
                  <tr>
                    <th className="px-6 py-4 font-semibold text-text-primary">Metric</th>
                    <th className="px-6 py-4 font-semibold text-primary">SwingAI</th>
                    <th className="px-6 py-4 font-semibold text-text-secondary">Buy & Hold</th>
                    <th className="px-6 py-4 font-semibold text-text-secondary">Manual Swing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {performanceRows.map((row) => (
                    <tr key={row.metric} className="transition-colors hover:bg-background-elevated/50">
                      <td className="px-6 py-4 font-medium text-text-primary">{row.metric}</td>
                      <td className="px-6 py-4 font-semibold text-primary">
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
          </motion.div>
          
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="mt-6 text-center text-xs text-text-secondary"
          >
            Performance data based on 180-day backtest (Jan 2024 - Jun 2024) and 90-day live tracking (Jul 2024 - Sep 2024).
            <br />
            Past performance does not guarantee future results. All trading involves risk of capital loss.
          </motion.p>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="relative">
        <PricingSection />
      </section>

      {/* FAQ */}
      <section id="faq" className="relative py-24">
        <div className="container mx-auto px-6">
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="mb-16 text-center"
          >
            <motion.h2
              variants={fadeInUp}
              className="text-4xl font-bold text-text-primary md:text-5xl"
            >
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

      {/* Risk Disclaimer Section (Regulatory Requirement) */}
      <section className="relative border-t border-border/60 bg-background-surface/80 py-16">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mx-auto max-w-4xl"
          >
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-warning/15">
                <AlertTriangle className="h-5 w-5 text-warning" />
              </div>
              <h3 className="text-xl font-semibold text-text-primary">Important Risk Disclosure</h3>
            </div>
            <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
              <p>
                <strong className="text-text-primary">Trading in equity markets involves substantial risk of loss.</strong> SwingAI provides trading signals and analytical tools based on proprietary algorithms and market data analysis. These signals are not guarantees of profit and should not be considered financial advice.
              </p>
              <p>
                Past performance, whether backtested or live-tracked, does not guarantee future results. Market conditions change, and historical patterns may not repeat. You should only trade with capital you can afford to lose entirely.
              </p>
              <p>
                SwingAI is a technology platform providing trading intelligence tools. We are not SEBI-registered investment advisors. All trading decisions remain your sole responsibility. Consult a licensed financial advisor before making investment decisions based on your individual financial situation and risk tolerance.
              </p>
              <p>
                By using SwingAI, you acknowledge these risks and agree that the company, its officers, and employees bear no liability for trading losses incurred while using the platform.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative py-24">
        <div className="container mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-background-surface via-background-elevated to-background-surface p-16 text-center"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary),0.15),transparent_70%)]" />
            <div className="relative z-10">
              <h2 className="text-4xl font-bold text-text-primary md:text-5xl">
                Start Trading With Institutional Intelligence
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-lg text-text-secondary">
                7-day full platform access. Cancel anytime. Zero commitment.
              </p>
              <Link
                href="/signup"
                className="mt-10 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-10 py-5 text-lg font-semibold text-primary-foreground shadow-[0_0_40px_rgba(var(--primary),0.4)] transition hover:bg-primary/90 hover:shadow-[0_0_60px_rgba(var(--primary),0.5)]"
              >
                Start 7-Day Free Trial <ArrowRight className="h-5 w-5" />
              </Link>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-success" /> Bank-grade encryption
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" /> SEBI-compliant data
                </span>
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-success" /> Razorpay secured
                </span>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 bg-background-surface/50 py-16">
        <div className="container mx-auto px-6">
          <div className="grid gap-12 md:grid-cols-5">
            <div className="md:col-span-2">
              <p className="text-2xl font-bold text-text-primary">SwingAI</p>
              <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                Institutional-grade swing trading intelligence for the Indian equity markets. Built by traders, for traders.
              </p>
              <div className="mt-6 flex items-center gap-3 text-sm text-text-secondary">
                <Users className="h-5 w-5 text-accent" />
                <span>Trusted by 2,400+ active swing traders</span>
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary">Platform</h4>
              <ul className="mt-4 space-y-3 text-sm text-text-secondary">
                <li>
                  <Link href="#intelligence" className="transition hover:text-text-primary">
                    Intelligence
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
                <li>
                  <Link href="/screener" className="transition hover:text-text-primary">
                    Screener
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary">Company</h4>
              <ul className="mt-4 space-y-3 text-sm text-text-secondary">
                <li>
                  <Link href="/about" className="transition hover:text-text-primary">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="transition hover:text-text-primary">
                    Contact
                  </Link>
                </li>
                <li>
                  <Link href="/careers" className="transition hover:text-text-primary">
                    Careers
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary">Legal</h4>
              <ul className="mt-4 space-y-3 text-sm text-text-secondary">
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
          <div className="mt-12 flex flex-col gap-4 border-t border-border/60 pt-8 text-xs text-text-secondary md:flex-row md:items-center md:justify-between">
            <span>© 2025 SwingAI Technologies Private Limited. All rights reserved.</span>
            <span className="text-center md:text-right">
              Securities trading involves risk of capital loss. Consult a licensed advisor before investing.
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
