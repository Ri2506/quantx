'use client'

import React, { useState, useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowUp,
  ArrowDown,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  Sparkles,
  BarChart3,
} from 'lucide-react'
import Card3D from '@/components/ui/Card3D'
import ScrollReveal from '@/components/ui/ScrollReveal'

// Sample NSE/BSE stock data
const featuredStocks = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2847.50, change: 2.3, volume: '4.2M', logo: '🏢' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3678.90, change: 1.8, volume: '2.1M', logo: '💻' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank', price: 1678.45, change: -0.5, volume: '5.8M', logo: '🏦' },
  { symbol: 'INFY', name: 'Infosys', price: 1523.45, change: 3.1, volume: '3.4M', logo: '🔷' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', price: 1089.75, change: 1.2, volume: '6.2M', logo: '🏦' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', price: 2456.80, change: -1.1, volume: '1.8M', logo: '🧴' },
]

const trendingStocks = [
  { symbol: 'ADANIENT', name: 'Adani Enterprises', price: 2387.20, change: 5.4, volume: '8.2M', aiScore: 87 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', price: 6789.30, change: 3.8, volume: '1.9M', aiScore: 82 },
  { symbol: 'AXISBANK', name: 'Axis Bank', price: 1123.45, change: -2.1, volume: '4.5M', aiScore: 75 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki', price: 12456.80, change: 4.2, volume: '0.8M', aiScore: 91 },
  { symbol: 'LT', name: 'Larsen & Toubro', price: 3567.90, change: 2.7, volume: '2.3M', aiScore: 84 },
  { symbol: 'WIPRO', name: 'Wipro', price: 456.70, change: -1.3, volume: '7.1M', aiScore: 78 },
]

const allStocks = [
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', price: 2847.50, change: 65.30, changePercent: 2.35, volume: '4.2M', high52w: 2968.50, low52w: 2223.30, aiScore: 88 },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', price: 3678.90, change: 65.20, changePercent: 1.80, volume: '2.1M', high52w: 4078.90, low52w: 3101.05, aiScore: 85 },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', price: 1678.45, change: -8.40, changePercent: -0.50, volume: '5.8M', high52w: 1794.50, low52w: 1363.55, aiScore: 82 },
  { symbol: 'INFY', name: 'Infosys Ltd', price: 1523.45, change: 45.90, changePercent: 3.11, volume: '3.4M', high52w: 1694.90, low52w: 1195.05, aiScore: 86 },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', price: 1089.75, change: 12.90, changePercent: 1.20, volume: '6.2M', high52w: 1257.80, low52w: 892.50, aiScore: 84 },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', price: 2456.80, change: -27.40, changePercent: -1.10, volume: '1.8M', high52w: 2855.05, low52w: 2172.00, aiScore: 79 },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel Ltd', price: 1547.30, change: 38.70, changePercent: 2.57, volume: '3.9M', high52w: 1702.90, low52w: 897.75, aiScore: 87 },
  { symbol: 'SBIN', name: 'State Bank of India', price: 789.65, change: -5.35, changePercent: -0.67, volume: '12.4M', high52w: 912.40, low52w: 543.20, aiScore: 81 },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', price: 6789.30, change: 248.50, changePercent: 3.80, volume: '1.9M', high52w: 7830.80, low52w: 5698.45, aiScore: 82 },
  { symbol: 'ADANIENT', name: 'Adani Enterprises Ltd', price: 2387.20, change: 122.40, changePercent: 5.40, volume: '8.2M', high52w: 3743.90, low52w: 1954.65, aiScore: 87 },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank Ltd', price: 1834.55, change: -12.25, changePercent: -0.66, volume: '2.7M', high52w: 2065.10, low52w: 1543.85, aiScore: 83 },
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', price: 3567.90, change: 93.80, changePercent: 2.70, volume: '2.3M', high52w: 3919.90, low52w: 2816.50, aiScore: 84 },
  { symbol: 'AXISBANK', name: 'Axis Bank Ltd', price: 1123.45, change: -24.15, changePercent: -2.10, volume: '4.5M', high52w: 1339.65, low52w: 901.15, aiScore: 75 },
  { symbol: 'ITC', name: 'ITC Ltd', price: 456.70, change: 8.90, changePercent: 1.99, volume: '9.8M', high52w: 512.50, low52w: 385.25, aiScore: 80 },
  { symbol: 'MARUTI', name: 'Maruti Suzuki India Ltd', price: 12456.80, change: 502.30, changePercent: 4.20, volume: '0.8M', high52w: 13680.00, low52w: 9737.65, aiScore: 91 },
]

export default function StocksPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({
    key: 'symbol',
    direction: 'asc',
  })
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Filter stocks based on search
  const filteredStocks = useMemo(() => {
    return allStocks.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stock.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [searchQuery])

  // Sort stocks
  const sortedStocks = useMemo(() => {
    const sorted = [...filteredStocks]
    sorted.sort((a, b) => {
      const aValue = a[sortConfig.key as keyof typeof a]
      const bValue = b[sortConfig.key as keyof typeof b]
      
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue
      }
      
      return sortConfig.direction === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue))
    })
    return sorted
  }, [filteredStocks, sortConfig])

  // Paginate stocks
  const paginatedStocks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return sortedStocks.slice(startIndex, startIndex + itemsPerPage)
  }, [sortedStocks, currentPage])

  const totalPages = Math.ceil(sortedStocks.length / itemsPerPage)

  const handleSort = (key: string) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  return (
    <div className="min-h-screen bg-background-primary pb-20 pt-24">
      {/* Hero Section */}
      <ScrollReveal>
      <section className="border-b border-border/60 bg-gradient-to-br from-background-surface to-background-primary px-6 py-12">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 backdrop-blur-xl"
          >
            <BarChart3 className="h-4 w-4 text-accent" />
            <span className="text-xs font-semibold uppercase tracking-wider text-accent">
              NSE/BSE Market Intelligence
            </span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-4 text-5xl font-bold text-text-primary"
          >
            All Indian Stocks
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="max-w-3xl text-lg text-text-secondary"
          >
            Complete list of NSE and BSE stocks with real-time prices, AI-powered insights, and institutional-grade
            analysis. Discover high-conviction trading opportunities powered by advanced machine learning algorithms.
          </motion.p>
        </div>
      </section>
      </ScrollReveal>

      {/* Featured Stocks */}
      <section className="border-b border-border/60 px-6 py-12">
        <div className="container mx-auto">
          <h2 className="mb-8 text-2xl font-bold text-text-primary">
            <span className="gradient-text-professional">Largest Indian Stocks</span>
          </h2>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {featuredStocks.map((stock, index) => (
              <motion.div
                key={stock.symbol}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="group cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-background-surface/80 to-background-elevated/60 p-6 backdrop-blur-xl transition-all hover:border-accent/40 hover:shadow-[0_10px_40px_-10px_rgba(var(--accent),0.3)]"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-3xl">{stock.logo}</span>
                      <div>
                        <div className="text-sm font-semibold text-text-secondary">{stock.symbol}</div>
                        <div className="text-xs text-text-muted">{stock.name}</div>
                      </div>
                    </div>
                  </div>
                  <div
                    className={`flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                      stock.change >= 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                    }`}
                  >
                    {stock.change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(stock.change).toFixed(2)}%
                  </div>
                </div>

                <div className="mb-2 text-3xl font-bold text-text-primary">₹{stock.price.toFixed(2)}</div>
                <div className="text-xs text-text-secondary">Volume: {stock.volume}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trending Stocks */}
      <section className="border-b border-border/60 px-6 py-12">
        <div className="container mx-auto">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-text-primary">
              <span className="gradient-text-accent">Trending Stocks</span>
            </h2>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <TrendingUp className="h-4 w-4 text-accent" />
              <span>Most watched by traders</span>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {trendingStocks.map((stock, index) => (
              <motion.div
                key={stock.symbol}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                className="group cursor-pointer overflow-hidden rounded-xl border border-border/60 bg-gradient-to-br from-background-surface/80 to-background-elevated/60 p-5 backdrop-blur-xl transition-all hover:border-primary/40 hover:shadow-[0_10px_40px_-10px_rgba(var(--primary),0.3)]"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-text-primary">{stock.symbol}</div>
                    <div className="text-xs text-text-secondary">{stock.name}</div>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-1">
                    <Sparkles className="h-3 w-3 text-accent" />
                    <span className="text-xs font-semibold text-accent">AI {stock.aiScore}</span>
                  </div>
                </div>

                <div className="mb-2 text-2xl font-bold text-text-primary">₹{stock.price.toFixed(2)}</div>

                <div className="flex items-center justify-between text-sm">
                  <div
                    className={`flex items-center gap-1 font-semibold ${
                      stock.change >= 0 ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {stock.change >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                    {Math.abs(stock.change).toFixed(2)}%
                  </div>
                  <div className="text-text-secondary">Vol: {stock.volume}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* All Stocks Table */}
      <section className="px-6 py-12">
        <div className="container mx-auto">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-text-primary">
              <span className="gradient-text-professional-blue">All NSE/BSE Stocks</span>
            </h2>
            <div className="text-sm text-text-secondary">{allStocks.length} stocks listed</div>
          </div>

          {/* Search Bar */}
          <ScrollReveal delay={0.05}>
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-secondary" />
              <input
                type="text"
                placeholder="Search by symbol or company name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border/60 bg-background-surface/60 py-3 pl-12 pr-4 text-text-primary placeholder-text-secondary backdrop-blur-xl transition focus:border-accent/60 focus:outline-none"
              />
            </div>
          </div>
          </ScrollReveal>

          {/* Table */}
          <ScrollReveal delay={0.1}>
          <Card3D maxTilt={2}>
          <div className="overflow-hidden rounded-xl border border-border/60 bg-background-surface/80 backdrop-blur-xl">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-border/60 bg-background-elevated/50">
                  <tr>
                    <th
                      onClick={() => handleSort('symbol')}
                      className="cursor-pointer px-6 py-4 text-left text-sm font-semibold text-text-primary transition hover:text-accent"
                    >
                      <div className="flex items-center gap-2">
                        Company <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('price')}
                      className="cursor-pointer px-6 py-4 text-right text-sm font-semibold text-text-primary transition hover:text-accent"
                    >
                      <div className="flex items-center justify-end gap-2">
                        Price <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('change')}
                      className="cursor-pointer px-6 py-4 text-right text-sm font-semibold text-text-primary transition hover:text-accent"
                    >
                      <div className="flex items-center justify-end gap-2">
                        Change <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('changePercent')}
                      className="cursor-pointer px-6 py-4 text-right text-sm font-semibold text-text-primary transition hover:text-accent"
                    >
                      <div className="flex items-center justify-end gap-2">
                        Change % <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                    <th
                      onClick={() => handleSort('volume')}
                      className="cursor-pointer px-6 py-4 text-right text-sm font-semibold text-text-primary transition hover:text-accent"
                    >
                      <div className="flex items-center justify-end gap-2">
                        Volume <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                    <th className="px-6 py-4 text-right text-sm font-semibold text-text-primary">52-Week Range</th>
                    <th
                      onClick={() => handleSort('aiScore')}
                      className="cursor-pointer px-6 py-4 text-center text-sm font-semibold text-text-primary transition hover:text-accent"
                    >
                      <div className="flex items-center justify-center gap-2">
                        AI Score <ArrowUpDown className="h-4 w-4" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {paginatedStocks.map((stock) => (
                    <motion.tr
                      key={stock.symbol}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="cursor-pointer transition-colors hover:bg-background-elevated/50"
                    >
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-semibold text-text-primary">{stock.symbol}</div>
                          <div className="text-xs text-text-secondary">{stock.name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-text-primary">
                        ₹{stock.price.toFixed(2)}
                      </td>
                      <td
                        className={`px-6 py-4 text-right font-medium ${
                          stock.change >= 0 ? 'text-success' : 'text-danger'
                        }`}
                      >
                        {stock.change >= 0 ? '+' : ''}
                        {stock.change.toFixed(2)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                            stock.changePercent >= 0 ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                          }`}
                        >
                          {stock.changePercent >= 0 ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )}
                          {Math.abs(stock.changePercent).toFixed(2)}%
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-text-secondary">{stock.volume}</td>
                      <td className="px-6 py-4 text-right text-xs text-text-secondary">
                        <div>H: ₹{stock.high52w.toFixed(2)}</div>
                        <div>L: ₹{stock.low52w.toFixed(2)}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1">
                          <Sparkles className="h-3 w-3 text-accent" />
                          <span className="text-sm font-semibold text-accent">{stock.aiScore}</span>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-border/60 px-6 py-4">
              <div className="text-sm text-text-secondary">
                Showing {(currentPage - 1) * itemsPerPage + 1} to{' '}
                {Math.min(currentPage * itemsPerPage, sortedStocks.length)} of {sortedStocks.length} stocks
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background-surface/60 text-text-secondary transition hover:border-accent/60 hover:text-accent disabled:opacity-50 disabled:hover:border-border/60 disabled:hover:text-text-secondary"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = i + 1
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-medium transition ${
                          currentPage === pageNum
                            ? 'bg-accent text-accent-foreground'
                            : 'text-text-secondary hover:text-accent'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 bg-background-surface/60 text-text-secondary transition hover:border-accent/60 hover:text-accent disabled:opacity-50 disabled:hover:border-border/60 disabled:hover:text-text-secondary"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
          </Card3D>
          </ScrollReveal>
        </div>
      </section>
    </div>
  )
}
