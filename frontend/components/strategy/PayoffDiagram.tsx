'use client'

import React, { useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'

// ============================================================================
// TYPES
// ============================================================================

interface Leg {
  strike: number
  option_type: 'CE' | 'PE'
  direction: 'BUY' | 'SELL'
  lots: number
  entry_price: number
}

interface PayoffDiagramProps {
  legs: Leg[]
  spotPrice: number
  lotSize: number
  /** Optional: strategy name for display */
  label?: string
}

// ============================================================================
// PAYOFF CALCULATION
// ============================================================================

function calcLegPayoff(leg: Leg, priceAtExpiry: number, lotSize: number): number {
  const multiplier = leg.direction === 'BUY' ? 1 : -1
  const qty = leg.lots * lotSize

  let intrinsic: number
  if (leg.option_type === 'CE') {
    intrinsic = Math.max(0, priceAtExpiry - leg.strike)
  } else {
    intrinsic = Math.max(0, leg.strike - priceAtExpiry)
  }

  // P&L = (intrinsic - premium_paid) * multiplier * quantity
  return (intrinsic - leg.entry_price) * multiplier * qty
}

function calcTotalPayoff(legs: Leg[], priceAtExpiry: number, lotSize: number): number {
  return legs.reduce((sum, leg) => sum + calcLegPayoff(leg, priceAtExpiry, lotSize), 0)
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function PayoffDiagram({ legs, spotPrice, lotSize, label }: PayoffDiagramProps) {
  const data = useMemo(() => {
    if (!legs.length || spotPrice <= 0) return []

    // Determine price range: ±15% of spot, or cover all strikes ± buffer
    const strikes = legs.map((l) => l.strike)
    const minStrike = Math.min(...strikes, spotPrice)
    const maxStrike = Math.max(...strikes, spotPrice)
    const range = maxStrike - minStrike || spotPrice * 0.1
    const buffer = Math.max(range * 0.6, spotPrice * 0.08)
    const low = Math.floor((minStrike - buffer) / 10) * 10
    const high = Math.ceil((maxStrike + buffer) / 10) * 10
    const step = Math.max(1, Math.round((high - low) / 200))

    const points: { price: number; pnl: number }[] = []
    for (let p = low; p <= high; p += step) {
      points.push({ price: p, pnl: Math.round(calcTotalPayoff(legs, p, lotSize)) })
    }
    return points
  }, [legs, spotPrice, lotSize])

  const { maxProfit, maxLoss, breakevens } = useMemo(() => {
    if (!data.length) return { maxProfit: 0, maxLoss: 0, breakevens: [] as number[] }

    let maxP = -Infinity
    let maxL = Infinity
    const brkPts: number[] = []

    for (let i = 0; i < data.length; i++) {
      if (data[i].pnl > maxP) maxP = data[i].pnl
      if (data[i].pnl < maxL) maxL = data[i].pnl
      // Zero crossing detection
      if (i > 0 && data[i - 1].pnl * data[i].pnl < 0) {
        // Linear interpolation for breakeven
        const p1 = data[i - 1]
        const p2 = data[i]
        const brkPrice = p1.price + (p2.price - p1.price) * (-p1.pnl / (p2.pnl - p1.pnl))
        brkPts.push(Math.round(brkPrice))
      }
    }
    return {
      maxProfit: maxP === -Infinity ? 0 : maxP,
      maxLoss: maxL === Infinity ? 0 : maxL,
      breakevens: brkPts,
    }
  }, [data])

  if (!data.length) {
    return (
      <div className="glass-card p-5 text-center">
        <p className="text-sm text-white/40">No legs configured for payoff diagram</p>
      </div>
    )
  }

  return (
    <div className="glass-card p-5">
      <h3 className="text-sm font-semibold text-white mb-1 flex items-center gap-2">
        <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5l6-6 4 4 8-8M21 3h-6m6 0v6" />
        </svg>
        {label || 'Payoff at Expiry'}
      </h3>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-3 mb-4 mt-2">
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-up/10 border border-up/20 text-up">
          Max Profit: {maxProfit === Infinity ? '∞' : `₹${maxProfit.toLocaleString('en-IN')}`}
        </span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-down/10 border border-down/20 text-down">
          Max Loss: {maxLoss === -Infinity ? '∞' : `₹${Math.abs(maxLoss).toLocaleString('en-IN')}`}
        </span>
        {breakevens.map((be, i) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-white/50">
            BE: {be.toLocaleString('en-IN')}
          </span>
        ))}
      </div>

      {/* Chart */}
      <div className="h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="payoffProfit" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-primary, #4FECCD)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--chart-primary, #4FECCD)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="payoffLoss" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="var(--color-down, #FF5947)" stopOpacity={0.25} />
                <stop offset="100%" stopColor="var(--color-down, #FF5947)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="price"
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
              tickFormatter={(v: number) => v.toLocaleString('en-IN')}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.3)' }}
              tickFormatter={(v: number) => `₹${v >= 0 ? '' : '-'}${Math.abs(v) >= 1000 ? `${(Math.abs(v) / 1000).toFixed(1)}K` : Math.abs(v)}`}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(13,15,14,0.95)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'P&L']}
              labelFormatter={(label: number) => `Spot: ${label.toLocaleString('en-IN')}`}
            />

            {/* Zero line */}
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />

            {/* Spot price marker */}
            <ReferenceLine
              x={spotPrice}
              stroke="rgba(79,236,205,0.4)"
              strokeDasharray="4 4"
              label={{ value: 'Spot', position: 'top', fill: 'rgba(79,236,205,0.6)', fontSize: 10 }}
            />

            {/* Strike markers */}
            {legs.map((leg, i) => (
              <ReferenceLine
                key={i}
                x={leg.strike}
                stroke="rgba(255,255,255,0.1)"
                strokeDasharray="2 2"
              />
            ))}

            {/* Profit area (above zero) */}
            <Area
              type="monotone"
              dataKey="pnl"
              stroke="var(--chart-primary, #4FECCD)"
              fill="url(#payoffProfit)"
              strokeWidth={2}
              baseValue={0}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Leg summary */}
      <div className="mt-3 flex flex-wrap gap-2">
        {legs.map((leg, i) => (
          <span
            key={i}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${
              leg.direction === 'BUY'
                ? 'bg-up/5 border-up/15 text-up'
                : 'bg-down/5 border-down/15 text-down'
            }`}
          >
            {leg.direction} {leg.strike} {leg.option_type} @ ₹{leg.entry_price}
            {leg.lots > 1 ? ` ×${leg.lots}` : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
