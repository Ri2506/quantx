// ============================================================================
// SWINGAI - 2026 INSTITUTIONAL TRADING TERMINAL HOMEPAGE
// Cutting-edge design with layered glow backgrounds, beam-scan effects,
// 3D cards, mesh gradients, and animated typography
// ============================================================================

'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AnimatePresence, motion, useInView } from 'framer-motion'
import PricingSection from '@/components/ui/pricing-section-4'
import HeroSection from '@/components/landing/HeroSection'
import FeaturesSection from '@/components/landing/FeaturesSection'
import PerformanceSection from '@/components/landing/PerformanceSection'
import HowItWorksSection from '@/components/landing/HowItWorksSection'
import ScrollReveal from '@/components/ui/ScrollReveal'
import Card3D from '@/components/ui/Card3D'
import {
  ArrowRight,
  ArrowUp,
  ArrowDown,
  BarChart3,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Lock,
  Shield,
  Star,
  Target,
  Terminal,
  TrendingUp,
  Users,
  AlertTriangle,
} from 'lucide-react'

// ---- Live Market Ticker ----
const marketData = [
  { symbol: 'RELIANCE', price: 2847.50, change: 2.3, volume: '4.2M' },
  { symbol: 'TCS', price: 3678.90, change: 1.8, volume: '2.1M' },
  { symbol: 'INFY', price: 1523.45, change: -0.5, volume: '5.8M' },
  { symbol: 'HDFC', price: 2934.20, change: 3.1, volume: '3.4M' },
  { symbol: 'ICICI', price: 1089.75, change: 1.2, volume: '6.2M' },
]

function LiveMarketTicker() {
  // Static data — no interval needed for demo
  const tickerData = [...marketData, ...marketData]

  return (
    <div className="w-full overflow-hidden border-b border-white/[0.04] bg-[rgba(4,6,14,0.85)]">
      <div className="ticker-marquee py-2.5">
        {tickerData.map((stock, i) => (
          <div key={`${stock.symbol}-${i}`} className="ticker-item">
            <span className="text-xs font-bold tracking-wide text-text-secondary">{stock.symbol}</span>
            <span className="text-sm font-semibold text-text-primary font-mono">
              ₹{stock.price.toFixed(2)}
            </span>
            <span className={`flex items-center gap-1 text-xs font-bold ${stock.change >= 0 ? 'text-[#028901]' : 'text-[#D00D00]'}`}>
              {stock.change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---- Trading Terminal Preview ----
function TradingTerminalPreview() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-100px' })
  const [candleData] = useState(
    Array.from({ length: 30 }, (_, i) => ({
      x: i,
      open: 2800 + Math.random() * 100,
      close: 2800 + Math.random() * 100,
      high: 2900 + Math.random() * 50,
      low: 2750 + Math.random() * 50,
    }))
  )

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 40, scale: 0.95 }}
      animate={isInView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto max-w-7xl"
    >
      <div className="absolute -inset-4 bg-gradient-to-tr from-neon-cyan/20 via-neon-purple/15 to-neon-green/10 blur-3xl" />

      <div className="gradient-border relative">
        <div className="overflow-hidden rounded-[19px] bg-gradient-to-br from-[rgb(8,12,24)] to-[rgb(14,19,33)]">
          {/* Terminal Header */}
          <div className="flex items-center justify-between border-b border-white/5 bg-background-surface/30 px-6 py-4 ">
            <div className="flex items-center gap-4">
              <div className="flex gap-2">
                <div className="h-3 w-3 rounded-full bg-danger/80" />
                <div className="h-3 w-3 rounded-full bg-warning/80" />
                <div className="h-3 w-3 rounded-full bg-success/80" />
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <Terminal className="h-4 w-4 text-neon-cyan" />
                <span>SwingAI Trading Terminal</span>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-neon-green/10 border border-neon-green/20 px-3 py-1">
              <span className="status-dot status-live" />
              <span className="text-xs font-medium text-neon-green">Live Market Data</span>
            </div>
          </div>

          {/* Terminal Content */}
          <div className="p-6">
            <div className="grid gap-4 lg:grid-cols-3">
              {[
                { label: 'Active Signals', value: '14', sub: '+5 today', pct: '82%', Icon: TrendingUp },
                { label: 'Win Rate (30d)', value: '78.4%', sub: '+5.2%', pct: '78%', Icon: Target },
                { label: 'Portfolio Value', value: '₹5.8L', sub: '+14.7%', pct: '71%', Icon: BarChart3 },
              ].map((card, i) => (
                <motion.div
                  key={card.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2 + i * 0.1 }}
                  className="glass-card-neu rounded-xl p-5 border border-white/[0.04]"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neon-cyan/20">
                      <card.Icon className="h-4 w-4 text-neon-cyan" />
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      {card.label}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-3xl font-bold text-text-primary">{card.value}</div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-success">
                      <ArrowUp className="h-3 w-3" />
                      {card.sub}
                    </div>
                  </div>
                  <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={isInView ? { width: card.pct } : {}}
                      transition={{ delay: 0.5 + i * 0.1, duration: 1 }}
                      className="h-full rounded-full bg-gradient-to-r from-neon-cyan to-neon-green"
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Live Signal */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5 }}
              className="mt-4 overflow-hidden rounded-xl border border-neon-cyan/20 bg-gradient-to-br from-neon-cyan/5 to-transparent "
            >
              <div className="border-b border-white/[0.04] bg-background-surface/30 px-5 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="status-dot status-live" />
                    <span className="text-sm font-semibold text-text-primary">Latest Signal</span>
                  </div>
                  <div className="rounded-full bg-neon-green/10 border border-neon-green/20 px-3 py-1 text-xs font-bold text-neon-green">
                    BUY - 89% CONFIDENCE
                  </div>
                </div>
              </div>
              <div className="p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-text-secondary">SYMBOL</div>
                    <div className="text-2xl font-bold text-text-primary">RELIANCE</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-text-secondary">CURRENT PRICE</div>
                    <div className="text-2xl font-bold text-text-primary">₹2,847.50</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {[
                    { label: 'Entry Zone', value: '₹2,820-2,850', cls: 'bg-neon-cyan/10 border-neon-cyan/20 text-neon-cyan' },
                    { label: 'Target', value: '₹3,020', cls: 'bg-neon-green/10 border-neon-green/20 text-neon-green' },
                    { label: 'Stop Loss', value: '₹2,780', cls: 'bg-danger/10 border-danger/20 text-danger' },
                    { label: 'Risk:Reward', value: '1:2.57', cls: 'bg-neon-purple/10 border-neon-purple/20 text-neon-purple' },
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="mb-1 text-xs font-medium text-text-secondary">{item.label}</div>
                      <div className={`rounded-lg border px-3 py-2 text-center ${item.cls}`}>
                        <div className="text-sm font-bold">{item.value}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Mini Chart */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.6 }}
              className="mt-4 rounded-xl border border-white/[0.04] bg-background-surface/30 p-4 "
            >
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
                Price Action - Last 30 Sessions
              </div>
              <div className="flex h-24 items-end justify-between gap-1">
                {candleData.slice(-20).map((candle, i) => {
                  const isUp = candle.close > candle.open
                  const height = ((candle.high - candle.low) / 150) * 100
                  const bodyHeight = ((Math.abs(candle.close - candle.open)) / 150) * 100
                  return (
                    <motion.div
                      key={i}
                      initial={{ scaleY: 0 }}
                      animate={isInView ? { scaleY: 1 } : {}}
                      transition={{ delay: 0.7 + i * 0.02 }}
                      className="relative flex-1"
                      style={{ height: `${height}%` }}
                    >
                      <div
                        className={`absolute bottom-0 left-1/2 w-px ${isUp ? 'bg-neon-green/40' : 'bg-danger/40'}`}
                        style={{ height: '100%', transform: 'translateX(-50%)' }}
                      />
                      <div
                        className={`absolute bottom-0 left-0 w-full rounded-sm ${isUp ? 'bg-neon-green' : 'bg-danger'}`}
                        style={{ height: `${bodyHeight}%` }}
                      />
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ---- Testimonial Carousel ----
const testimonials = [
  {
    name: 'Rajesh Kumar',
    role: 'Full-Time Trader, Mumbai',
    content: 'After 3 months of paper trading, went live with real capital. Win rate improved from my manual 48% to 64% with SwingAI signals. The risk management framework helped me cut losses faster and let winners run longer.',
  },
  {
    name: 'Priya Sharma',
    role: 'Investment Analyst, Bangalore',
    content: 'Use it alongside my fundamental research. The AI signals help with entry timing on stocks I already like. Not perfect—had some losses during the August volatility—but overall positive edge in my swing trades.',
  },
  {
    name: 'Amit Verma',
    role: 'Part-Time Trader, Delhi',
    content: 'Working full-time, can only trade in evenings. SwingAI gives 2-3 setups daily that fit my schedule. Win rate around 62% over 4 months. Portfolio up 18%, which beats my previous manual trading results.',
  },
  {
    name: 'Sneha Patel',
    role: 'Systematic Trader, Ahmedabad',
    content: 'The signal quality varies—some weeks are great, others just break even. But the risk parameters keep losses small. Over 5 months, net positive with manageable drawdowns. Worth the subscription for the time saved.',
  },
]

function TestimonialCarousel() {
  const [activeIndex, setActiveIndex] = useState(0)

  return (
    <div className="relative">
      <Card3D>
        <div className="glass-card-neu relative overflow-hidden rounded-2xl p-10">
          <div className="glow-stroke-top" />
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIndex}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              <div className="mb-5 flex items-center gap-1 text-neon-gold">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-current" />
                ))}
              </div>
              <p className="text-xl leading-relaxed text-text-primary">"{testimonials[activeIndex].content}"</p>
              <div className="mt-8 flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-neon-cyan to-neon-green text-lg font-bold text-space-void">
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
      </Card3D>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={() => setActiveIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
          className="hidden rounded-full border border-white/[0.06] bg-white/[0.02] p-2 text-text-secondary transition hover:border-neon-cyan/40 hover:text-text-primary md:flex"
          aria-label="Previous"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          {testimonials.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`h-2.5 rounded-full transition-all ${
                index === activeIndex ? 'w-8 bg-neon-cyan shadow-glow-sm' : 'w-2.5 bg-white/10'
              }`}
              aria-label={`Go to testimonial ${index + 1}`}
            />
          ))}
        </div>
        <button
          onClick={() => setActiveIndex((prev) => (prev + 1) % testimonials.length)}
          className="hidden rounded-full border border-white/[0.06] bg-white/[0.02] p-2 text-text-secondary transition hover:border-neon-cyan/40 hover:text-text-primary md:flex"
          aria-label="Next"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

// ---- FAQ Item ----
function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02]  transition-all hover:border-neon-cyan/20">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-white/[0.02]"
      >
        <span className="font-semibold text-text-primary">{question}</span>
        <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.3 }}>
          <ChevronDown className="h-5 w-5 text-text-secondary" />
        </motion.div>
      </button>
      <motion.div
        initial={false}
        animate={{ height: isOpen ? 'auto' : 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden"
      >
        <div className="border-t border-white/[0.04] px-6 py-5 text-sm leading-relaxed text-text-secondary">
          {answer}
        </div>
      </motion.div>
    </div>
  )
}

const faqItems = [
  {
    question: 'How does SwingAI differentiate from conventional screening platforms?',
    answer: 'Traditional screeners display historical data—breakouts that materialized, momentum that developed. Our proprietary intelligence identifies institutional accumulation during pre-breakout consolidation phases, enabling strategic positioning before public price discovery.',
  },
  {
    question: 'What execution modes are supported?',
    answer: 'Three tiers: (1) Signal notifications only—review and execute manually; (2) One-click execution—pre-approved orders with single-click placement; (3) Full automation—systematic execution with customizable risk parameters and emergency override controls.',
  },
  {
    question: 'Is SwingAI suitable for traders new to systematic strategies?',
    answer: 'Every signal includes probability score, entry zone, stop-loss, target levels, and risk-reward ratio. Begin in paper trading mode to develop confidence without capital risk. Comprehensive onboarding with documentation and tutorials.',
  },
  {
    question: 'How does the system perform during market volatility?',
    answer: 'Regime detection algorithms automatically identify high-volatility environments and implement conservative signal filters, reduced position sizing, tightened stop-losses, and increased probability thresholds.',
  },
  {
    question: 'What security measures protect my data and capital access?',
    answer: 'Bank-grade AES-256 encryption. OAuth 2.0 authentication—we never have access to your passwords. Read-only API access by default. Execution permissions require explicit authorization and can be instantly revoked.',
  },
]

// ============================================================================
// MAIN LANDING PAGE
// ============================================================================
export default function LandingPage() {
  const [mounted, setMounted] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    setMounted(true)
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="relative min-h-screen w-full overflow-x-hidden text-text-primary">
      {/* Deep Space Background */}
      <div className="fixed inset-0 z-0 bg-gradient-space" />

      {/* Content */}
      <div className="relative z-10">
        {/* Navigation — transparent on hero, solid on scroll */}
        <nav className={`fixed top-0 z-50 w-full transition-all duration-300 ${
          scrolled
            ? 'border-b border-white/[0.06] bg-space-void/90 backdrop-blur-2xl shadow-lg'
            : 'bg-transparent'
        }`}>
          <div className="container mx-auto flex items-center justify-between px-6 py-4">
            <Link href="/" className="text-xl font-bold tracking-tight">
              <span className="gradient-text-professional">SwingAI</span>
            </Link>
            <div className="hidden items-center gap-8 text-sm font-medium text-text-secondary md:flex">
              <Link href="#intelligence" className="link-animate transition hover:text-neon-cyan">Intelligence</Link>
              <Link href="#terminal" className="link-animate transition hover:text-neon-cyan">Platform</Link>
              <Link href="#performance" className="link-animate transition hover:text-neon-cyan">Performance</Link>
              <Link href="#pricing" className="link-animate transition hover:text-neon-cyan">Pricing</Link>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="link-animate text-sm font-medium text-text-secondary transition hover:text-text-primary">
                Login
              </Link>
              <Link
                href="/signup"
                className="btn-tv-gradient btn-press rounded-lg px-5 py-2.5 text-sm font-semibold"
              >
                Start Free Trial
              </Link>
            </div>
          </div>
          {/* Market Ticker Strip — shows when scrolled */}
          {scrolled && <LiveMarketTicker />}
        </nav>

        {/* Hero */}
        <HeroSection />

        {/* Trust Badges */}
        <section className="relative px-6 py-8">
          <div className="container mx-auto">
            <div className="flex flex-wrap items-center justify-center gap-4">
              {[
                { icon: Lock, label: 'SSL encrypted data', color: 'text-neon-green' },
                { icon: BarChart3, label: '2,847+ signals tracked', color: 'text-neon-cyan' },
                { icon: CheckCircle, label: 'NSE/BSE real-time feeds', color: 'text-neon-green' },
                { icon: Globe, label: 'Cloud infrastructure', color: 'text-neon-cyan' },
              ].map((badge, i) => (
                <ScrollReveal key={badge.label} delay={i * 0.1}>
                  <div className="flex items-center gap-2 rounded-full border border-white/[0.06] bg-white/[0.02] px-4 py-2.5 text-xs font-medium text-text-secondary ">
                    <badge.icon className={`h-4 w-4 ${badge.color}`} />
                    <span>{badge.label}</span>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* Trading Terminal Preview */}
        <section id="terminal" className="relative px-6 py-24">
          <div className="container mx-auto">
            <ScrollReveal>
              <div className="mb-16 text-center">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-neon-cyan/20 bg-neon-cyan/5 px-5 py-2 ">
                  <Terminal className="h-4 w-4 text-neon-cyan" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-neon-cyan">
                    Live Trading Terminal
                  </span>
                </div>
                <h2 className="mb-6 text-4xl font-bold md:text-5xl">
                  <span className="gradient-text-professional">Institutional-Grade</span>{' '}
                  <span className="text-text-primary">Execution Platform</span>
                </h2>
                <p className="mx-auto max-w-3xl text-lg text-text-secondary">
                  Real-time signal generation, portfolio surveillance, and systematic execution
                  infrastructure in a unified professional trading terminal
                </p>
              </div>
            </ScrollReveal>
            <TradingTerminalPreview />
          </div>
        </section>

        {/* Features (Bento Grid) */}
        <FeaturesSection />

        {/* How It Works */}
        <HowItWorksSection />

        {/* Testimonials */}
        <section id="testimonials" className="relative px-6 py-32">
          <div className="container mx-auto">
            <ScrollReveal>
              <div className="mb-16 text-center">
                <h2 className="mb-6 text-4xl font-bold md:text-5xl">
                  <span className="text-text-primary">Trusted by</span>{' '}
                  <span className="gradient-text-professional">Systematic Traders</span>
                </h2>
                <p className="mx-auto max-w-3xl text-lg text-text-secondary">
                  Real performance outcomes from professional and semi-professional market participants
                </p>
              </div>
            </ScrollReveal>
            <div className="mx-auto max-w-4xl">
              <TestimonialCarousel />
            </div>
          </div>
        </section>

        {/* Performance */}
        <PerformanceSection />

        {/* Pricing */}
        <section id="pricing" className="relative">
          <div className="section-glow-divider absolute top-0 left-0 right-0" />
          <PricingSection />
        </section>

        {/* FAQ */}
        <section id="faq" className="relative px-6 py-32">
          <div className="container mx-auto">
            <ScrollReveal>
              <div className="mb-16 text-center">
                <h2 className="mb-6 text-4xl font-bold text-text-primary md:text-5xl">
                  Frequently Asked Questions
                </h2>
              </div>
            </ScrollReveal>
            <div className="mx-auto flex max-w-4xl flex-col gap-4">
              {faqItems.map((item, i) => (
                <ScrollReveal key={item.question} delay={i * 0.05}>
                  <FAQItem {...item} />
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        {/* Risk Disclaimer */}
        <section className="relative border-t border-white/[0.06] px-6 py-20">
          <div className="container mx-auto">
            <ScrollReveal>
              <div className="mx-auto max-w-5xl">
                <div className="mb-8 flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-warning/15">
                    <AlertTriangle className="h-6 w-6 text-warning" />
                  </div>
                  <h3 className="text-2xl font-bold text-text-primary">Regulatory Risk Disclosure</h3>
                </div>
                <div className="space-y-4 text-sm leading-relaxed text-text-secondary">
                  <p>
                    <strong className="text-text-primary">
                      Systematic trading in equity markets involves substantial risk of capital loss.
                    </strong>{' '}
                    SwingAI provides algorithmic trading signals and analytical infrastructure. These signals represent
                    probabilistic assessments, not guarantees of profitability.
                  </p>
                  <p>
                    Historical performance does not guarantee future results. Market microstructure evolves, correlation
                    patterns shift, and volatility regimes change. You should trade only with risk capital.
                  </p>
                  <p>
                    SwingAI operates as a technology infrastructure provider. We are not SEBI-registered investment
                    advisors. All trading decisions remain your sole responsibility.
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative px-6 py-24">
          <div className="container mx-auto">
            <div className="relative rounded-3xl overflow-hidden">
              <Image src="/images/cta-aurora.webp" alt="" fill className="object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-space-void/60" />
              <div className="gradient-border rounded-3xl">
                <div className="relative overflow-hidden rounded-[19px] p-16 text-center">
                  <div className="relative z-10">
                    <h2 className="mb-6 text-4xl font-bold md:text-5xl">
                      <span className="gradient-text-elegant">Deploy Institutional</span>{' '}
                      <span className="text-text-primary">Intelligence Today</span>
                    </h2>
                    <p className="mx-auto mb-10 max-w-2xl text-lg text-text-secondary">
                      7-day unrestricted platform access. Cancel anytime. Zero long-term commitment required.
                    </p>
                    <Link
                      href="/signup"
                      className="btn-tv-gradient btn-press inline-flex items-center justify-center gap-2 rounded-xl px-10 py-5 text-lg font-semibold"
                    >
                      Start 7-Day Free Trial <ArrowRight className="h-5 w-5" />
                    </Link>
                    <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-text-secondary">
                      <span className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-neon-green" /> AES-256 encryption
                      </span>
                      <span className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-neon-green" /> SEBI-compliant data
                      </span>
                      <span className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-neon-green" /> ISO 27001 certified
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/[0.06] px-6 py-16">
          <div className="container mx-auto">
            <div className="grid gap-12 md:grid-cols-5">
              <div className="md:col-span-2">
                <p className="text-2xl font-bold gradient-text-professional">SwingAI</p>
                <p className="mt-4 text-sm leading-relaxed text-text-secondary">
                  Institutional-grade systematic trading intelligence for the Indian equity markets.
                  Engineered by quantitative researchers for serious market participants.
                </p>
                <div className="mt-6 flex items-center gap-3 text-sm text-text-secondary">
                  <Users className="h-5 w-5 text-neon-cyan" />
                  <span>Trusted by 2,400+ systematic traders and institutions</span>
                </div>
              </div>
              <div>
                <h4 className="mb-4 font-semibold text-text-primary">Platform</h4>
                <ul className="space-y-3 text-sm text-text-secondary">
                  <li><Link href="#intelligence" className="transition hover:text-neon-cyan">Intelligence</Link></li>
                  <li><Link href="#terminal" className="transition hover:text-neon-cyan">Terminal</Link></li>
                  <li><Link href="#pricing" className="transition hover:text-neon-cyan">Pricing</Link></li>
                  <li><Link href="/dashboard" className="transition hover:text-neon-cyan">Dashboard</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="mb-4 font-semibold text-text-primary">Company</h4>
                <ul className="space-y-3 text-sm text-text-secondary">
                  <li><Link href="/about" className="transition hover:text-neon-cyan">About</Link></li>
                  <li><Link href="/contact" className="transition hover:text-neon-cyan">Contact</Link></li>
                  <li><Link href="/careers" className="transition hover:text-neon-cyan">Careers</Link></li>
                </ul>
              </div>
              <div>
                <h4 className="mb-4 font-semibold text-text-primary">Legal</h4>
                <ul className="space-y-3 text-sm text-text-secondary">
                  <li><Link href="/privacy" className="transition hover:text-neon-cyan">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="transition hover:text-neon-cyan">Terms of Service</Link></li>
                  <li><Link href="/disclaimer" className="transition hover:text-neon-cyan">Risk Disclaimer</Link></li>
                </ul>
              </div>
            </div>
            <div className="mt-12 flex flex-col gap-4 border-t border-white/[0.06] pt-8 text-xs text-text-secondary md:flex-row md:items-center md:justify-between">
              <span>© 2025 SwingAI Technologies Private Limited. All rights reserved.</span>
              <span className="text-center md:text-right">
                Systematic trading involves substantial risk. Consult licensed advisors before investing.
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  )
}
