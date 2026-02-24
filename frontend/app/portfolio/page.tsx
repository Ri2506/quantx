'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import Link from 'next/link'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  PieChart,
  BarChart3,
  Activity,
} from 'lucide-react'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'
import StatusDot from '@/components/ui/StatusDot'
import SkeletonLoader from '@/components/ui/SkeletonLoader'

interface Position {
  id: string
  symbol: string
  name: string
  quantity: number
  avg_price: number
  current_price: number
  pnl: number
  pnl_percent: number
  value: number
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Mock portfolio data
    const mockPositions: Position[] = [
      {
        id: '1',
        symbol: 'RELIANCE',
        name: 'Reliance Industries Ltd',
        quantity: 50,
        avg_price: 2780.00,
        current_price: 2847.50,
        pnl: 3375.00,
        pnl_percent: 2.43,
        value: 142375.00,
      },
      {
        id: '2',
        symbol: 'TCS',
        name: 'Tata Consultancy Services',
        quantity: 30,
        avg_price: 3650.00,
        current_price: 3678.90,
        pnl: 867.00,
        pnl_percent: 0.79,
        value: 110367.00,
      },
      {
        id: '3',
        symbol: 'INFY',
        name: 'Infosys Ltd',
        quantity: 100,
        avg_price: 1550.00,
        current_price: 1523.45,
        pnl: -2655.00,
        pnl_percent: -1.71,
        value: 152345.00,
      },
      {
        id: '4',
        symbol: 'HDFCBANK',
        name: 'HDFC Bank Ltd',
        quantity: 75,
        avg_price: 1650.00,
        current_price: 1678.00,
        pnl: 2100.00,
        pnl_percent: 1.70,
        value: 125850.00,
      },
    ]
    setPositions(mockPositions)
    setLoading(false)
  }, [])

  const totalValue = positions.reduce((sum, p) => sum + p.value, 0)
  const totalPnL = positions.reduce((sum, p) => sum + p.pnl, 0)
  const totalInvested = positions.reduce((sum, p) => sum + (p.avg_price * p.quantity), 0)
  const overallPnLPercent = (totalPnL / totalInvested) * 100

  if (loading) {
    return (
      <div className="min-h-screen bg-background-primary px-4 md:px-6 py-6 md:py-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8">
            <div className="skeleton-shimmer h-10 w-48 rounded-lg mb-3" />
            <div className="skeleton-shimmer h-5 w-72 rounded" />
          </div>
          <div className="mb-8 grid gap-4 grid-cols-2 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonLoader key={i} variant="stat" />
            ))}
          </div>
          <SkeletonLoader variant="table-row" lines={4} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background-primary px-4 md:px-6 py-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <ScrollReveal direction="up" delay={0}>
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="mb-2 text-3xl md:text-4xl font-bold text-text-primary">
                  <span className="gradient-text-professional">Portfolio</span>
                </h1>
                <div className="flex items-center gap-3">
                  <p className="text-lg text-text-secondary">
                    Track your holdings and performance
                  </p>
                  <StatusDot status="live" label="Live" />
                </div>
              </div>
              <Link
                href="/dashboard"
                className="w-fit rounded-lg border border-white/[0.04] bg-white/[0.02] px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/[0.04] hover:shadow-glow-sm"
              >
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </ScrollReveal>

        {/* Portfolio Summary */}
        <ScrollReveal direction="up" delay={0.1}>
          <div className="mb-8 grid gap-4 grid-cols-2 md:grid-cols-4">
            <Card3D>
              <div className="glass-card-neu rounded-xl border border-white/[0.04] p-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <Wallet className="h-4 w-4" />
                  Portfolio Value
                </div>
                <div className="text-3xl font-bold text-text-primary">₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
            </Card3D>
            <Card3D>
              <div className="glass-card-neu rounded-xl border border-white/[0.04] p-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <TrendingUp className="h-4 w-4" />
                  Total P&L
                </div>
                <div className={`text-3xl font-bold ${totalPnL >= 0 ? 'text-neon-green' : 'text-danger'}`}>
                  {totalPnL >= 0 ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
                <div className={`mt-1 flex items-center gap-1 text-sm ${totalPnL >= 0 ? 'text-neon-green' : 'text-danger'}`}>
                  {totalPnL >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                  {Math.abs(overallPnLPercent).toFixed(2)}%
                </div>
              </div>
            </Card3D>
            <Card3D>
              <div className="glass-card-neu rounded-xl border border-white/[0.04] p-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <PieChart className="h-4 w-4" />
                  Positions
                </div>
                <div className="text-3xl font-bold text-neon-cyan">{positions.length}</div>
              </div>
            </Card3D>
            <Card3D>
              <div className="glass-card-neu rounded-xl border border-white/[0.04] p-6">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text-secondary">
                  <BarChart3 className="h-4 w-4" />
                  Total Invested
                </div>
                <div className="text-3xl font-bold text-text-primary">₹{totalInvested.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              </div>
            </Card3D>
          </div>
        </ScrollReveal>

        {/* Holdings - Mobile Card View */}
        <div className="md:hidden">
          <ScrollReveal direction="up" delay={0.2}>
            <div className="space-y-3">
              <h2 className="text-xl font-bold text-text-primary mb-4">Holdings</h2>
              {positions.map((position, index) => (
                <motion.div
                  key={position.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="glass-card-neu rounded-2xl border border-white/[0.04] p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-semibold text-text-primary text-base">{position.symbol}</div>
                      <div className="text-xs text-text-secondary">{position.name}</div>
                    </div>
                    <div className={`flex items-center gap-1 text-sm font-bold ${position.pnl >= 0 ? 'text-neon-green' : 'text-danger'}`}>
                      {position.pnl >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {Math.abs(position.pnl_percent).toFixed(2)}%
                    </div>
                  </div>
                  <div className="text-xs text-text-secondary mb-2">
                    {position.quantity} x ₹{position.avg_price.toFixed(2)} → ₹{position.current_price.toFixed(2)}
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-xs text-text-secondary">Current Value</div>
                      <div className="text-lg font-bold text-text-primary">
                        ₹{position.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-text-secondary">P&L</div>
                      <div className={`font-bold ${position.pnl >= 0 ? 'text-neon-green' : 'text-danger'}`}>
                        {position.pnl >= 0 ? '+' : ''}₹{position.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </ScrollReveal>
        </div>

        {/* Holdings Table - Desktop */}
        <div className="hidden md:block">
          <ScrollReveal direction="up" delay={0.2}>
            <Card3D maxTilt={3}>
              <div className="overflow-hidden rounded-xl border border-white/[0.04] glass-card-neu">
                <div className="border-b border-white/[0.04] bg-white/[0.02] px-6 py-4">
                  <h2 className="text-xl font-bold text-text-primary">Holdings</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-white/[0.04] bg-white/[0.04]">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-text-secondary">Stock</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-text-secondary">Qty</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-text-secondary">Avg Price</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-text-secondary">LTP</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-text-secondary">Current Value</th>
                        <th className="px-6 py-4 text-right text-sm font-semibold text-text-secondary">P&L</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.04]">
                      {positions.map((position, index) => (
                        <motion.tr
                          key={position.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="transition-colors hover:bg-white/[0.04] hover:shadow-glow-sm"
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-text-primary">{position.symbol}</div>
                            <div className="text-sm text-text-secondary">{position.name}</div>
                          </td>
                          <td className="px-6 py-4 text-right font-medium text-text-primary">{position.quantity}</td>
                          <td className="px-6 py-4 text-right text-text-secondary">₹{position.avg_price.toFixed(2)}</td>
                          <td className="px-6 py-4 text-right font-medium text-text-primary">₹{position.current_price.toFixed(2)}</td>
                          <td className="px-6 py-4 text-right font-medium text-text-primary">
                            ₹{position.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className={`font-bold ${position.pnl >= 0 ? 'text-neon-green' : 'text-danger'}`}>
                              {position.pnl >= 0 ? '+' : ''}₹{position.pnl.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            </div>
                            <div className={`flex items-center justify-end gap-1 text-sm ${position.pnl >= 0 ? 'text-neon-green' : 'text-danger'}`}>
                              {position.pnl >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                              {Math.abs(position.pnl_percent).toFixed(2)}%
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card3D>
          </ScrollReveal>
        </div>
      </div>
    </div>
  )
}
