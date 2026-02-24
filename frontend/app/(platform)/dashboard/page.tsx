'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Sparkles,
  Target,
  PieChart,
} from 'lucide-react'
import { BentoGrid, BentoCard } from '@/components/ui/BentoGrid'
import Card3D from '@/components/ui/Card3D'
import StatusDot from '@/components/ui/StatusDot'
import SkeletonLoader from '@/components/ui/SkeletonLoader'
import ScrollReveal from '@/components/ui/ScrollReveal'

interface MarketData {
  indices: {
    nifty50: { value: number; change: number; change_percent: number }
    sensex: { value: number; change: number; change_percent: number }
    banknifty: { value: number; change: number; change_percent: number }
  }
  market_status: string
  market_sentiment: string
}

interface Stock {
  symbol: string
  name: string
  current_price: number
  day_change_percent: number
  volume: string
  ai_score: number
}

function IndexCard({ name, data, delay }: { name: string; data: { value: number; change: number; change_percent: number }; delay: number }) {
  const isUp = data.change >= 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
    >
      <Card3D>
        <div className="glass-card-neu rounded-2xl p-6 border border-white/[0.04]">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-text-secondary">{name}</span>
            <StatusDot status="live" label="Live" />
          </div>
          <div className="text-3xl font-bold text-text-primary mb-1">
            {data.value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </div>
          <div className={`flex items-center gap-1 text-sm font-semibold ${isUp ? 'text-neon-green' : 'text-danger'}`}>
            {isUp ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {Math.abs(data.change).toFixed(2)} ({data.change_percent.toFixed(2)}%)
          </div>
        </div>
      </Card3D>
    </motion.div>
  )
}

export default function DashboardPage() {
  const [marketData, setMarketData] = useState<MarketData | null>(null)
  const [trendingStocks, setTrendingStocks] = useState<Stock[]>([])
  const [topGainers, setTopGainers] = useState<Stock[]>([])
  const [topLosers, setTopLosers] = useState<Stock[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMarketData()
  }, [])

  const fetchMarketData = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const [overviewRes, trendingRes, moversRes] = await Promise.all([
        fetch(`${apiUrl}/api/market/overview`),
        fetch(`${apiUrl}/api/market/trending?limit=6`),
        fetch(`${apiUrl}/api/market/top-movers`),
      ])

      const overview = await overviewRes.json()
      const trending = await trendingRes.json()
      const movers = await moversRes.json()

      setMarketData(overview)
      setTrendingStocks(trending.trending_stocks || [])
      setTopGainers(movers.gainers || [])
      setTopLosers(movers.losers || [])
    } catch (error) {
      console.error('Error fetching market data:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen px-6 py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <div className="skeleton-shimmer h-10 w-64 rounded-lg mb-3" />
            <div className="skeleton-shimmer h-5 w-96 rounded" />
          </div>
          <div className="grid gap-4 md:grid-cols-3 mb-8">
            {[1, 2, 3].map((i) => (
              <SkeletonLoader key={i} variant="stat" />
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <SkeletonLoader key={i} variant="card" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <ScrollReveal>
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold">
              <span className="gradient-text-professional">Market Dashboard</span>
            </h1>
            <p className="text-lg text-text-secondary flex items-center gap-2">
              Real-time NSE/BSE market data powered by AI intelligence
              <StatusDot status="live" label="Market Open" />
            </p>
          </div>
        </ScrollReveal>

        {/* Market Indices */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {marketData && (
            <>
              <IndexCard name="NIFTY 50" data={marketData.indices.nifty50} delay={0} />
              <IndexCard name="SENSEX" data={marketData.indices.sensex} delay={0.1} />
              <IndexCard name="BANK NIFTY" data={marketData.indices.banknifty} delay={0.2} />
            </>
          )}
        </div>

        {/* AI Top Picks - Bento Grid */}
        <section className="mb-8">
          <ScrollReveal>
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-text-primary">
                <span className="gradient-text-accent">AI Top Picks</span>
              </h2>
              <Link
                href="/stocks?filter=trending"
                className="btn-beam rounded-lg bg-neon-cyan/10 border border-neon-cyan/20 px-4 py-2 text-sm font-medium text-neon-cyan transition hover:bg-neon-cyan/20"
              >
                View All →
              </Link>
            </div>
          </ScrollReveal>

          <BentoGrid>
            {trendingStocks.map((stock, index) => (
              <BentoCard
                key={stock.symbol}
                index={index}
                span={index < 2 ? 2 : 1}
              >
                <Card3D spotlight>
                  <div className="p-1">
                    <div className="mb-3 flex items-start justify-between">
                      <div>
                        <div className="font-bold text-text-primary text-lg">{stock.symbol}</div>
                        <div className="text-xs text-text-secondary">{stock.name}</div>
                      </div>
                      <div className="flex items-center gap-1 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 px-2.5 py-1">
                        <Sparkles className="h-3 w-3 text-neon-cyan" />
                        <span className="text-xs font-semibold text-neon-cyan">{stock.ai_score}</span>
                      </div>
                    </div>
                    <div className="mb-2 text-3xl font-bold text-text-primary">₹{stock.current_price.toFixed(2)}</div>
                    <div className="flex items-center justify-between text-sm">
                      <div className={`flex items-center gap-1 font-semibold ${
                        stock.day_change_percent >= 0 ? 'text-neon-green' : 'text-danger'
                      }`}>
                        {stock.day_change_percent >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                        {Math.abs(stock.day_change_percent).toFixed(2)}%
                      </div>
                      <div className="text-text-secondary">Vol: {stock.volume}</div>
                    </div>
                  </div>
                </Card3D>
              </BentoCard>
            ))}
          </BentoGrid>
        </section>

        {/* Top Gainers & Losers */}
        <div className="grid gap-8 lg:grid-cols-2">
          <ScrollReveal direction="left">
            <section>
              <div className="mb-4 flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-neon-green" />
                <h2 className="text-2xl font-bold text-text-primary">Top Gainers</h2>
              </div>
              <div className="space-y-3">
                {topGainers.map((stock, index) => (
                  <motion.div
                    key={stock.symbol}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 transition hover:border-neon-green/30 hover:bg-white/[0.04]"
                  >
                    <div>
                      <div className="font-semibold text-text-primary">{stock.symbol}</div>
                      <div className="text-sm text-text-secondary">₹{stock.current_price.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-neon-green/10 border border-neon-green/20 px-3 py-1">
                      <ArrowUp className="h-4 w-4 text-neon-green" />
                      <span className="font-bold text-neon-green">{stock.day_change_percent.toFixed(2)}%</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          </ScrollReveal>

          <ScrollReveal direction="right">
            <section>
              <div className="mb-4 flex items-center gap-2">
                <TrendingDown className="h-6 w-6 text-danger" />
                <h2 className="text-2xl font-bold text-text-primary">Top Losers</h2>
              </div>
              <div className="space-y-3">
                {topLosers.map((stock, index) => (
                  <motion.div
                    key={stock.symbol}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-center justify-between rounded-xl border border-white/[0.04] bg-white/[0.02] p-4 transition hover:border-danger/30 hover:bg-white/[0.04]"
                  >
                    <div>
                      <div className="font-semibold text-text-primary">{stock.symbol}</div>
                      <div className="text-sm text-text-secondary">₹{stock.current_price.toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-2 rounded-full bg-danger/10 border border-danger/20 px-3 py-1">
                      <ArrowDown className="h-4 w-4 text-danger" />
                      <span className="font-bold text-danger">{Math.abs(stock.day_change_percent).toFixed(2)}%</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </section>
          </ScrollReveal>
        </div>

        {/* Quick Actions */}
        <section className="mt-8">
          <ScrollReveal>
            <h2 className="mb-4 text-2xl font-bold text-text-primary">Quick Actions</h2>
          </ScrollReveal>
          <div className="grid gap-4 md:grid-cols-4">
            {[
              { href: '/screener', icon: Sparkles, label: 'AI Screener', sub: '43+ Scanners', cls: 'bg-neon-cyan/10 border-neon-cyan/20 text-neon-cyan' },
              { href: '/signals', icon: Target, label: 'AI Signals', sub: 'Live Trades', cls: 'bg-neon-green/10 border-neon-green/20 text-neon-green' },
              { href: '/stocks', icon: BarChart3, label: 'All Stocks', sub: 'NSE/BSE', cls: 'bg-neon-purple/10 border-neon-purple/20 text-neon-purple' },
              { href: '/portfolio', icon: PieChart, label: 'Portfolio', sub: 'Track P&L', cls: 'bg-neon-gold/10 border-neon-gold/20 text-neon-gold' },
            ].map((item, i) => (
              <ScrollReveal key={item.href} delay={i * 0.1}>
                <Card3D>
                  <Link
                    href={item.href}
                    className="group flex items-center gap-3 glass-card-neu rounded-xl p-5 border border-white/[0.04] transition hover:border-neon-cyan/20"
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-lg border ${item.cls}`}>
                      <item.icon className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="font-semibold text-text-primary">{item.label}</div>
                      <div className="text-xs text-text-secondary">{item.sub}</div>
                    </div>
                  </Link>
                </Card3D>
              </ScrollReveal>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
