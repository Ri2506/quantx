'use client'

/**
 * Premium feature card illustrations — smooth bezier SVG curves
 * with glassmorphic panels, gradient fills, and framer-motion.
 *
 * All chart paths use C/S/Q bezier commands — zero angular L zigzags.
 */

import React, { useRef, useId } from 'react'
import { motion, useInView, type Transition } from 'framer-motion'

/* ── Deterministic volume data ── */
const VOL_13 = [12, 18, 8, 20, 14, 10, 16, 12, 9, 17, 22, 25, 19]
const VOL_20 = [8, 14, 6, 16, 11, 9, 13, 10, 7, 12, 8, 15, 10, 8, 18, 22, 28, 20, 25, 17]

/* ── Shared draw transition ── */
const draw = (dur = 2, del = 0): Transition => ({
  pathLength: { duration: dur, delay: del, ease: [0.33, 1, 0.68, 1] },
  opacity: { duration: 0.3, delay: del },
})

/* ═══════════════════════════════════════════════════════════════
   1. AI TRADING SIGNALS
   Candlestick chart with glass BUY/EXIT cards
   ═══════════════════════════════════════════════════════════════ */
export function SignalIllustration() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const _ = useId()

  const candles = [
    { x: 28, o: 118, c: 86, h: 72, l: 130, up: true },
    { x: 50, o: 94, c: 110, h: 82, l: 120, up: false },
    { x: 72, o: 104, c: 82, h: 68, l: 116, up: true },
    { x: 94, o: 88, c: 100, h: 74, l: 110, up: false },
    { x: 116, o: 96, c: 72, h: 58, l: 106, up: true },
    { x: 138, o: 78, c: 62, h: 48, l: 90, up: true },
    { x: 160, o: 68, c: 80, h: 54, l: 92, up: false },
    { x: 182, o: 76, c: 56, h: 42, l: 88, up: true },
    { x: 204, o: 60, c: 48, h: 36, l: 72, up: true },
    { x: 226, o: 52, c: 44, h: 30, l: 64, up: true },
  ]

  return (
    <motion.svg ref={ref} viewBox="0 0 280 200" fill="none" className="w-full h-full"
      initial="hidden" animate={inView ? 'visible' : 'hidden'}>
      <defs>
        <linearGradient id={`${_}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F1520" /><stop offset="100%" stopColor="#0A0D14" />
        </linearGradient>
        <filter id={`${_}gl`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
        <filter id={`${_}ds`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,240,255,0.15)" />
        </filter>
      </defs>

      <rect width="280" height="200" rx="8" fill={`url(#${_}bg)`} />

      {/* Dot grid */}
      {Array.from({ length: 8 }, (__, r) =>
        Array.from({ length: 12 }, (___, c) => (
          <circle key={`${r}-${c}`} cx={18 + c * 22} cy={18 + r * 22} r="0.4" fill="#1C1E29" />
        ))
      )}

      {/* Grid lines */}
      {[55, 80, 105, 130].map(y => (
        <line key={y} x1="18" y1={y} x2="262" y2={y} stroke="#1C1E29" strokeWidth="0.5" />
      ))}

      {/* Y-axis labels */}
      {[{ y: 55, l: '₹252' }, { y: 80, l: '₹238' }, { y: 105, l: '₹224' }, { y: 130, l: '₹210' }].map((p, i) => (
        <motion.text key={i} x="14" y={p.y + 3} fill="#444" fontSize="5" fontFamily="'DM Mono', monospace" textAnchor="end"
          initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.2 + i * 0.08 }}>
          {p.l}
        </motion.text>
      ))}

      {/* Candlesticks */}
      {candles.map((c, i) => (
        <motion.g key={i}
          initial={{ opacity: 0, y: 5 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.4 + i * 0.06 }}>
          <line x1={c.x} y1={c.h} x2={c.x} y2={c.l} stroke={c.up ? '#00D26A' : '#E36262'} strokeWidth="1" opacity={0.5} />
          <rect x={c.x - 6} y={Math.min(c.o, c.c)} width={12} height={Math.abs(c.o - c.c) || 2}
            fill={c.up ? '#00D26A' : '#E36262'} rx="1.5" opacity={0.85} />
        </motion.g>
      ))}

      {/* BUY signal card */}
      <motion.g initial={{ opacity: 0, y: 8 }} animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ type: 'spring', stiffness: 100, damping: 14, delay: 1.6 }}>
        <circle cx={120} cy={112} r={20} fill="#00F0FF" opacity={0.06} filter={`url(#${_}gl)`} />
        <rect x="96" y="98" width="72" height="34" rx="6" fill="#10121D" fillOpacity="0.88"
          stroke="#00F0FF" strokeOpacity="0.25" strokeWidth="0.6" filter={`url(#${_}ds)`} />
        <motion.circle cx="106" cy="109" r="3.5" fill="#00F0FF"
          animate={{ opacity: [0.5, 1, 0.5], scale: [0.9, 1.1, 0.9] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} />
        <text x="113" y="112" fill="#00F0FF" fontSize="7" fontWeight="700" fontFamily="'DM Sans', sans-serif">BUY</text>
        <text x="138" y="112" fill="#646464" fontSize="5.5" fontFamily="'DM Mono', monospace">₹238.5</text>
        <text x="106" y="125" fill="#444" fontSize="5" fontFamily="'DM Mono', monospace">SL ₹232 · TGT ₹258</text>
      </motion.g>

      {/* EXIT signal card */}
      <motion.g initial={{ opacity: 0, y: 8 }} animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ type: 'spring', stiffness: 100, damping: 14, delay: 2.2 }}>
        <circle cx={208} cy={52} r={16} fill="#E36262" opacity={0.05} filter={`url(#${_}gl)`} />
        <rect x="182" y="40" width="60" height="30" rx="6" fill="#10121D" fillOpacity="0.88"
          stroke="#E36262" strokeOpacity="0.2" strokeWidth="0.6" />
        <motion.circle cx="192" cy="50" r="3" fill="#E36262"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }} />
        <text x="199" y="53" fill="#E36262" fontSize="6.5" fontWeight="700" fontFamily="'DM Sans', sans-serif">EXIT</text>
        <text x="199" y="64" fill="#444" fontSize="5" fontFamily="'DM Mono', monospace">+8.2% P&L</text>
      </motion.g>

      {/* SL / TGT dashed lines */}
      <motion.line x1="96" y1="130" x2="262" y2="130" stroke="#E36262" strokeWidth="0.5" strokeDasharray="3 2" opacity={0.3}
        initial={{ opacity: 0 }} animate={inView ? { opacity: 0.3 } : {}} transition={{ delay: 2, duration: 0.6 }} />
      <motion.line x1="96" y1="45" x2="178" y2="45" stroke="#00D26A" strokeWidth="0.5" strokeDasharray="3 2" opacity={0.3}
        initial={{ opacity: 0 }} animate={inView ? { opacity: 0.3 } : {}} transition={{ delay: 2.2, duration: 0.6 }} />

      {/* Bottom stats bar */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2.5 }}>
        <rect x="18" y="150" width="244" height="34" rx="6" fill="#10121D" fillOpacity="0.6"
          stroke="#1C1E29" strokeWidth="0.5" />
        {[
          { x: 30, label: 'Win Rate', val: '73%', color: '#00D26A' },
          { x: 90, label: 'Avg R:R', val: '1.83', color: '#00F0FF' },
          { x: 152, label: 'Signals', val: '12/day', color: '#DADADA' },
          { x: 214, label: 'Accuracy', val: '89%', color: '#9250FF' },
        ].map((s, i) => (
          <g key={i}>
            <text x={s.x} y="164" fill="#555" fontSize="4.5" fontFamily="'DM Mono', monospace">{s.label}</text>
            <text x={s.x} y="176" fill={s.color} fontSize="8" fontWeight="700" fontFamily="'DM Sans', sans-serif">{s.val}</text>
          </g>
        ))}
        {[80, 142, 204].map(x => (
          <line key={x} x1={x} y1="156" x2={x} y2="180" stroke="#1C1E29" strokeWidth="0.5" />
        ))}
      </motion.g>

      {/* LIVE badge */}
      <motion.g initial={{ opacity: 0, x: -5 }} animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ delay: 0.3 }}>
        <rect x="18" y="18" width="52" height="16" rx="4" fill="#00F0FF" fillOpacity="0.08"
          stroke="#00F0FF" strokeOpacity="0.15" strokeWidth="0.5" />
        <circle cx="27" cy="26" r="2" fill="#00F0FF" opacity="0.8" />
        <text x="33" y="29" fill="#00F0FF" fontSize="5.5" fontWeight="600" fontFamily="'DM Sans', sans-serif">LIVE</text>
      </motion.g>
    </motion.svg>
  )
}

/* ═══════════════════════════════════════════════════════════════
   2. PATTERN DETECTION
   Smooth oscillating price within converging triangle
   ═══════════════════════════════════════════════════════════════ */
export function PatternIllustration() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const _ = useId()

  return (
    <motion.svg ref={ref} viewBox="0 0 280 200" fill="none" className="w-full h-full"
      initial="hidden" animate={inView ? 'visible' : 'hidden'}>
      <defs>
        <linearGradient id={`${_}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F1520" /><stop offset="100%" stopColor="#0A0D14" />
        </linearGradient>
        <linearGradient id={`${_}tri`} x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#9250FF" stopOpacity="0.12" /><stop offset="100%" stopColor="#9250FF" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id={`${_}brk`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00F0FF" /><stop offset="50%" stopColor="#00F0FF" stopOpacity="0.6" /><stop offset="100%" stopColor="#00F0FF" stopOpacity="0.15" />
        </linearGradient>
        <filter id={`${_}gl`} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
        </filter>
        <filter id={`${_}ds`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(146,80,255,0.18)" />
        </filter>
        <radialGradient id={`${_}pt`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.4" />
          <stop offset="40%" stopColor="#00F0FF" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="280" height="200" rx="8" fill={`url(#${_}bg)`} />

      {/* Grid */}
      {[40, 65, 90, 115, 140].map(y => (
        <line key={y} x1="12" y1={y} x2="200" y2={y} stroke="#1C1E29" strokeWidth="0.5" />
      ))}

      {/* Triangle fill */}
      <motion.path d="M30 58 L12 145 L170 85 Z" fill={`url(#${_}tri)`}
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.8 }} />

      {/* Price path — smooth bezier oscillation within converging triangle */}
      <motion.path
        d="M14 140 C22 140, 26 65, 34 62 C42 59, 42 125, 50 128 C58 131, 58 70, 68 68 C78 66, 78 115, 88 118 C98 121, 98 76, 108 74 C118 72, 118 108, 128 110 C138 112, 138 82, 148 80 C158 78, 158 100, 164 98 C170 96, 170 88, 172 86"
        stroke="#DADADA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 0.9 } : {}}
        transition={draw(1.8, 0.4)} />

      {/* Trendlines — clean straight dashed lines */}
      <motion.line x1="30" y1="56" x2="172" y2="84" stroke="#9250FF" strokeWidth="1.5" strokeDasharray="5 3"
        initial={{ opacity: 0 }} animate={inView ? { opacity: 0.8 } : {}} transition={{ delay: 1.6, duration: 0.8 }} />
      <motion.line x1="12" y1="143" x2="172" y2="88" stroke="#9250FF" strokeWidth="1.5" strokeDasharray="5 3"
        initial={{ opacity: 0 }} animate={inView ? { opacity: 0.8 } : {}} transition={{ delay: 1.8, duration: 0.8 }} />

      {/* Breakout path — smooth upward curve with glow */}
      <motion.path
        d="M172 86 C180 78, 188 68, 196 58 C204 48, 208 44, 216 40"
        stroke={`url(#${_}brk)`} strokeWidth="2.5" strokeLinecap="round"
        filter={`url(#${_}gl)`}
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(0.8, 2.4)} />
      {/* Solid breakout on top */}
      <motion.path
        d="M172 86 C180 78, 188 68, 196 58 C204 48, 208 44, 216 40"
        stroke="#00F0FF" strokeWidth="1.8" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(0.8, 2.4)} />

      {/* Breakout glow orb */}
      <motion.g initial={{ opacity: 0, scale: 0.3 }} animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{ type: 'spring', stiffness: 80, damping: 10, delay: 2.6 }}>
        <circle cx="172" cy="86" r="24" fill={`url(#${_}pt)`} />
        <circle cx="172" cy="86" r="12" fill="#00F0FF" opacity="0.08" filter={`url(#${_}gl)`} />
        <motion.circle cx="172" cy="86" r="6" fill="#00F0FF" opacity="0.2"
          animate={{ scale: [1, 1.4, 1], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
        <circle cx="172" cy="86" r="3" fill="#00F0FF" />
      </motion.g>

      {/* Pattern label */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2 }}>
        <rect x="50" y="120" width="90" height="22" rx="6" fill="#9250FF" fillOpacity="0.12"
          stroke="#9250FF" strokeOpacity="0.25" strokeWidth="0.6" filter={`url(#${_}ds)`} />
        <text x="95" y="134" textAnchor="middle" fill="#9250FF" fontSize="8" fontWeight="700"
          fontFamily="'DM Sans', sans-serif">SYM TRIANGLE</text>
      </motion.g>

      {/* Right stats panel */}
      <motion.g initial={{ opacity: 0, x: 10 }} animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ type: 'spring', stiffness: 80, damping: 14, delay: 2.8 }}>
        <rect x="210" y="14" width="62" height="130" rx="8" fill="#10121D" fillOpacity="0.92"
          stroke="#1C1E29" strokeWidth="0.6" filter={`url(#${_}ds)`} />
        <rect x="210" y="14" width="62" height="22" rx="8" fill="#1C1E29" fillOpacity="0.4" />
        <text x="241" y="28" textAnchor="middle" fill="#DADADA" fontSize="7" fontWeight="600"
          fontFamily="'DM Sans', sans-serif">Analysis</text>
        <text x="218" y="50" fill="#666" fontSize="6" fontFamily="'DM Mono', monospace">Quality</text>
        <text x="218" y="64" fill="#00F0FF" fontSize="14" fontWeight="800" fontFamily="'DM Sans', sans-serif">92</text>
        <text x="246" y="64" fill="#00F0FF" fontSize="7" opacity="0.5" fontFamily="'DM Mono', monospace">/100</text>
        <line x1="218" y1="70" x2="264" y2="70" stroke="#1C1E29" strokeWidth="0.5" />
        <text x="218" y="82" fill="#666" fontSize="6" fontFamily="'DM Mono', monospace">ML Score</text>
        <text x="218" y="96" fill="#00D26A" fontSize="14" fontWeight="800" fontFamily="'DM Sans', sans-serif">0.87</text>
        <line x1="218" y1="102" x2="264" y2="102" stroke="#1C1E29" strokeWidth="0.5" />
        <text x="218" y="114" fill="#666" fontSize="6" fontFamily="'DM Mono', monospace">R:R Ratio</text>
        <text x="218" y="128" fill="#FEB113" fontSize="14" fontWeight="800" fontFamily="'DM Sans', sans-serif">2.4x</text>
      </motion.g>

      {/* Volume bars */}
      {VOL_13.map((h, i) => {
        const x = 14 + i * 15
        const ht = h * 0.9
        return (
          <motion.rect key={i} x={x} y={170 - ht} width={10} height={ht}
            fill={i >= 10 ? '#00F0FF' : '#2A2D3A'} opacity={i >= 10 ? 0.6 : 0.35} rx="1.5"
            initial={{ scaleY: 0 }} animate={inView ? { scaleY: 1 } : {}}
            transition={{ type: 'spring', stiffness: 160, damping: 20, delay: 0.3 + i * 0.04 }}
            style={{ transformOrigin: `${x + 5}px 170px` }} />
        )
      })}

      {/* Bottom bar */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.5 }}>
        <rect x="14" y="178" width="182" height="16" rx="5" fill="#10121D" fillOpacity="0.6" stroke="#1C1E29" strokeWidth="0.4" />
        <text x="22" y="189" fill="#888" fontSize="6" fontFamily="'DM Sans', sans-serif">RELIANCE · NSE · 10 patterns</text>
      </motion.g>
    </motion.svg>
  )
}

/* ═══════════════════════════════════════════════════════════════
   3. RISK MANAGEMENT
   Shield + gauge + metrics — all clean geometry
   ═══════════════════════════════════════════════════════════════ */
export function RiskIllustration() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const _ = useId()

  /* Precise shield path — smooth symmetrical beziers */
  const shieldOuter = "M140 20 C140 20, 190 35, 190 35 C190 35, 194 70, 188 100 C182 130, 158 150, 140 158 C122 150, 98 130, 92 100 C86 70, 90 35, 90 35 C90 35, 140 20, 140 20 Z"
  const shieldInner = "M140 36 C140 36, 176 48, 176 48 C176 48, 179 74, 174 96 C169 118, 152 134, 140 140 C128 134, 111 118, 106 96 C101 74, 104 48, 104 48 C104 48, 140 36, 140 36 Z"

  return (
    <motion.svg ref={ref} viewBox="0 0 280 200" fill="none" className="w-full h-full"
      initial="hidden" animate={inView ? 'visible' : 'hidden'}>
      <defs>
        <linearGradient id={`${_}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F1520" /><stop offset="100%" stopColor="#0A0D14" />
        </linearGradient>
        <radialGradient id={`${_}ha`} cx="0.5" cy="0.4" r="0.5">
          <stop offset="0%" stopColor="#FEB113" stopOpacity="0.18" />
          <stop offset="50%" stopColor="#FEB113" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#FEB113" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${_}sh`} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#FEB113" stopOpacity="0.08" /><stop offset="100%" stopColor="#FEB113" stopOpacity="0.01" />
        </linearGradient>
        <filter id={`${_}gla`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4" />
        </filter>
        <filter id={`${_}ds`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(254,177,19,0.15)" />
        </filter>
      </defs>

      <rect width="280" height="200" rx="8" fill={`url(#${_}bg)`} />

      {/* Dot grid */}
      {Array.from({ length: 8 }, (__, r) =>
        Array.from({ length: 12 }, (___, c) => (
          <circle key={`${r}-${c}`} cx={18 + c * 22} cy={18 + r * 22} r="0.4" fill="#1C1E29" />
        ))
      )}

      {/* Amber halo */}
      <circle cx="140" cy="78" r="70" fill={`url(#${_}ha)`} />

      {/* Shield — smooth bezier outline */}
      <motion.path d={shieldOuter}
        stroke="#FEB113" strokeWidth="1.8" fill={`url(#${_}sh)`}
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(1.5, 0.3)} />
      {/* Inner shield */}
      <motion.path d={shieldInner}
        fill="#FEB113" fillOpacity="0.04" stroke="#FEB113" strokeWidth="0.5" strokeOpacity="0.15"
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.5 }} />

      {/* Gauge */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.6 }}>
        {/* Background arc */}
        <path d="M112 90 A 32 32 0 0 1 168 90" stroke="#1C1E29" strokeWidth="5" strokeLinecap="round" fill="none" />
        {/* Red zone */}
        <path d="M112 90 A 32 32 0 0 1 120 74" stroke="#E36262" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.3" />
        {/* Green zone — glow layer */}
        <motion.path d="M130 68 A 32 32 0 0 1 160 74" stroke="#00D26A" strokeWidth="5" strokeLinecap="round" fill="none"
          filter={`url(#${_}gla)`}
          initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : {}} transition={draw(0.8, 2)} />
        {/* Green zone — solid layer */}
        <motion.path d="M130 68 A 32 32 0 0 1 160 74" stroke="#00D26A" strokeWidth="4" strokeLinecap="round" fill="none"
          initial={{ pathLength: 0 }} animate={inView ? { pathLength: 1 } : {}} transition={draw(0.8, 2)} />
        {/* Needle — spring physics */}
        <motion.line x1="140" y1="90" x2="155" y2="72" stroke="#DADADA" strokeWidth="1.8" strokeLinecap="round"
          initial={{ rotate: -90 }} animate={inView ? { rotate: 40 } : {}}
          transition={{ type: 'spring', stiffness: 50, damping: 8, delay: 2.3 }}
          style={{ transformOrigin: '140px 90px' }} />
        <circle cx="140" cy="90" r="3.5" fill="#DADADA" />
        <text x="140" y="108" textAnchor="middle" fill="#00D26A" fontSize="8" fontWeight="700" fontFamily="'DM Sans', sans-serif">LOW RISK</text>
      </motion.g>

      {/* Left metric cards */}
      {[
        { y: 16, label: 'Max Risk', val: '2%', color: '#00D26A' },
        { y: 52, label: 'Position', val: '₹5.2L', color: '#00F0FF' },
        { y: 88, label: 'Stop-Loss', val: '-1.8%', color: '#E36262' },
      ].map((m, i) => (
        <motion.g key={`l${i}`} initial={{ opacity: 0, x: -8 }} animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 0.8 + i * 0.2 }}>
          <rect x="10" y={m.y} width="68" height="28" rx="6" fill="#10121D" fillOpacity="0.9"
            stroke="#1C1E29" strokeWidth="0.6" filter={`url(#${_}ds)`} />
          <text x="18" y={m.y + 11} fill="#666" fontSize="5.5" fontFamily="'DM Mono', monospace">{m.label}</text>
          <text x="18" y={m.y + 23} fill={m.color} fontSize="10" fontWeight="800" fontFamily="'DM Sans', sans-serif">{m.val}</text>
        </motion.g>
      ))}

      {/* Right metric cards */}
      {[
        { y: 16, label: 'Drawdown', val: '-4.2%', color: '#FEB113' },
        { y: 52, label: 'Win Rate', val: '73%', color: '#00D26A' },
        { y: 88, label: 'Sharpe', val: '1.39', color: '#9250FF' },
      ].map((m, i) => (
        <motion.g key={`r${i}`} initial={{ opacity: 0, x: 8 }} animate={inView ? { opacity: 1, x: 0 } : {}}
          transition={{ type: 'spring', stiffness: 100, damping: 15, delay: 1 + i * 0.2 }}>
          <rect x="202" y={m.y} width="68" height="28" rx="6" fill="#10121D" fillOpacity="0.9"
            stroke="#1C1E29" strokeWidth="0.6" filter={`url(#${_}ds)`} />
          <text x="210" y={m.y + 11} fill="#666" fontSize="5.5" fontFamily="'DM Mono', monospace">{m.label}</text>
          <text x="210" y={m.y + 23} fill={m.color} fontSize="10" fontWeight="800" fontFamily="'DM Sans', sans-serif">{m.val}</text>
        </motion.g>
      ))}

      {/* Status pill */}
      <motion.g initial={{ opacity: 0, y: 5 }} animate={inView ? { opacity: 1, y: 0 } : {}} transition={{ delay: 2.8 }}>
        <rect x="48" y="130" width="184" height="26" rx="13" fill="#00D26A" fillOpacity="0.07"
          stroke="#00D26A" strokeOpacity="0.2" strokeWidth="0.6" />
        <motion.circle cx="66" cy="143" r="4" fill="#00D26A"
          animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
        <text x="76" y="147" fill="#00D26A" fontSize="8" fontWeight="600" fontFamily="'DM Sans', sans-serif">All Systems Protected</text>
      </motion.g>

      {/* Risk bar */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 3 }}>
        <rect x="32" y="168" width="216" height="6" rx="3" fill="#1C1E29" />
        <motion.rect x="32" y="168" width="56" height="6" rx="3" fill="#00D26A"
          initial={{ width: 0 }} animate={inView ? { width: 56 } : {}}
          transition={{ type: 'spring', stiffness: 80, damping: 15, delay: 3.2 }} />
        <text x="32" y="186" fill="#666" fontSize="6" fontFamily="'DM Sans', sans-serif">Risk Utilized: 26%</text>
        <text x="248" y="186" fill="#00D26A" fontSize="6" fontWeight="600" fontFamily="'DM Sans', sans-serif" textAnchor="end">SAFE</text>
      </motion.g>
    </motion.svg>
  )
}

/* ═══════════════════════════════════════════════════════════════
   4. BACKTESTING ENGINE
   Smooth equity curve with area fill + performance card
   ═══════════════════════════════════════════════════════════════ */
export function BacktestIllustration() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const _ = useId()

  /* Smooth equity curve — cubic beziers for silk-smooth line */
  const equityCurve = "M18 136 C32 134, 40 128, 52 124 C64 120, 68 118, 80 112 C92 106, 88 120, 96 108 C104 96, 108 94, 120 88 C132 82, 130 90, 140 78 C150 66, 154 62, 168 56 C182 50, 186 46, 200 40 C214 34, 222 30, 240 26 C250 24, 254 22, 258 22"
  const areaFill = equityCurve + " L258 145 L18 145 Z"
  /* Benchmark — gentle downslope */
  const benchmark = "M18 116 C50 114, 80 115, 110 113 C140 111, 170 109, 200 106 C220 104, 240 102, 258 100"

  return (
    <motion.svg ref={ref} viewBox="0 0 280 200" fill="none" className="w-full h-full"
      initial="hidden" animate={inView ? 'visible' : 'hidden'}>
      <defs>
        <linearGradient id={`${_}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F1520" /><stop offset="100%" stopColor="#0A0D14" />
        </linearGradient>
        <linearGradient id={`${_}ef`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.25" /><stop offset="40%" stopColor="#00F0FF" stopOpacity="0.08" /><stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
        </linearGradient>
        <filter id={`${_}gl`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
        </filter>
        <filter id={`${_}ds`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,240,255,0.15)" />
        </filter>
        <radialGradient id={`${_}pt`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.4" />
          <stop offset="40%" stopColor="#00F0FF" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="280" height="200" rx="8" fill={`url(#${_}bg)`} />

      {/* Dot grid */}
      {Array.from({ length: 8 }, (__, r) =>
        Array.from({ length: 12 }, (___, c) => (
          <circle key={`${r}-${c}`} cx={18 + c * 22} cy={18 + r * 22} r="0.4" fill="#1C1E29" />
        ))
      )}

      {/* Grid lines */}
      {[44, 72, 100, 128].map(y => (
        <line key={y} x1="14" y1={y} x2="260" y2={y} stroke="#1C1E29" strokeWidth="0.5" />
      ))}

      {/* Benchmark — smooth dashed */}
      <motion.path d={benchmark}
        stroke="#555" strokeWidth="1" strokeDasharray="4 3" opacity="0.5"
        initial={{ opacity: 0 }} animate={inView ? { opacity: 0.5 } : {}} transition={{ delay: 0.4 }} />

      {/* Equity curve — glow layer */}
      <motion.path d={equityCurve}
        stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"
        filter={`url(#${_}gl)`}
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(2.2, 0.5)} />
      {/* Equity curve — solid layer */}
      <motion.path d={equityCurve}
        stroke="#00F0FF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(2.2, 0.5)} />

      {/* Area fill */}
      <motion.path d={areaFill} fill={`url(#${_}ef)`}
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2.2, duration: 1 }} />

      {/* Endpoint glow */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2.5 }}>
        <circle cx="258" cy="22" r="18" fill={`url(#${_}pt)`} />
        <motion.circle cx="258" cy="22" r="7" fill="#00F0FF" opacity="0.12"
          animate={{ scale: [1, 1.6, 1], opacity: [0.08, 0.2, 0.08] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }} />
        <circle cx="258" cy="22" r="3" fill="#00F0FF" />
      </motion.g>

      {/* Performance card */}
      <motion.g initial={{ opacity: 0, x: 8 }} animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ type: 'spring', stiffness: 80, damping: 14, delay: 2.4 }}>
        <rect x="148" y="42" width="110" height="68" rx="8" fill="#10121D" fillOpacity="0.93"
          stroke="#1C1E29" strokeWidth="0.6" filter={`url(#${_}ds)`} />
        <rect x="148" y="42" width="110" height="18" rx="8" fill="#1C1E29" fillOpacity="0.3" />
        <text x="203" y="54" textAnchor="middle" fill="#DADADA" fontSize="7" fontWeight="600" fontFamily="'DM Sans', sans-serif">Performance</text>
        {[
          { y: 72, label: 'Profit Factor', val: '1.93', color: '#00D26A' },
          { y: 88, label: 'Win Rate', val: '73%', color: '#00F0FF' },
          { y: 104, label: 'Sharpe Ratio', val: '1.39', color: '#9250FF' },
        ].map((m, i) => (
          <g key={i}>
            <text x="156" y={m.y} fill="#666" fontSize="6" fontFamily="'DM Mono', monospace">{m.label}</text>
            <text x="250" y={m.y} fill={m.color} fontSize="9" fontWeight="800" fontFamily="'DM Sans', sans-serif" textAnchor="end">{m.val}</text>
            {i < 2 && <line x1="156" y1={m.y + 5} x2="250" y2={m.y + 5} stroke="#1C1E29" strokeWidth="0.4" />}
          </g>
        ))}
      </motion.g>

      {/* Legend */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.5 }}>
        <line x1="18" y1="16" x2="30" y2="16" stroke="#00F0FF" strokeWidth="2" />
        <text x="34" y="19" fill="#DADADA" fontSize="6" fontFamily="'DM Sans', sans-serif">Strategy</text>
        <line x1="80" y1="16" x2="92" y2="16" stroke="#555" strokeWidth="1" strokeDasharray="4 3" />
        <text x="96" y="19" fill="#666" fontSize="6" fontFamily="'DM Sans', sans-serif">Nifty 50</text>
      </motion.g>

      {/* Bottom stats */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2.8 }}>
        <rect x="14" y="156" width="252" height="36" rx="7" fill="#10121D" fillOpacity="0.6" stroke="#1C1E29" strokeWidth="0.5" />
        {[
          { x: 28, l: 'Total Return', v: '+187%', c: '#00D26A' },
          { x: 108, l: 'Max Drawdown', v: '-12.3%', c: '#E36262' },
          { x: 196, l: 'Total Trades', v: '284', c: '#DADADA' },
        ].map((s, i) => (
          <g key={i}>
            <text x={s.x} y="170" fill="#666" fontSize="5.5" fontFamily="'DM Mono', monospace">{s.l}</text>
            <text x={s.x} y="184" fill={s.c} fontSize="10" fontWeight="800" fontFamily="'DM Sans', sans-serif">{s.v}</text>
          </g>
        ))}
        {[98, 186].map(x => (
          <line key={x} x1={x} y1="162" x2={x} y2="186" stroke="#1C1E29" strokeWidth="0.5" />
        ))}
      </motion.g>
    </motion.svg>
  )
}

/* ═══════════════════════════════════════════════════════════════
   5. SMART SCREENER
   Data table with scan line, score bars
   ═══════════════════════════════════════════════════════════════ */
export function ScreenerIllustration() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const _ = useId()

  const rows = [
    { sym: 'RELIANCE', sig: 'Breakout', sc: 92, c: '#00F0FF', hot: true },
    { sym: 'TCS', sig: 'Bull Flag', sc: 87, c: '#00D26A', hot: true },
    { sym: 'HDFCBANK', sig: 'Neutral', sc: 45, c: '#555', hot: false },
    { sym: 'INFY', sig: 'IHS', sc: 81, c: '#9250FF', hot: true },
    { sym: 'BAJFIN', sig: 'Wedge', sc: 78, c: '#00F0FF', hot: false },
    { sym: 'SBIN', sig: 'Cup&Hndl', sc: 88, c: '#00D26A', hot: true },
  ]

  return (
    <motion.svg ref={ref} viewBox="0 0 280 200" fill="none" className="w-full h-full"
      initial="hidden" animate={inView ? 'visible' : 'hidden'}>
      <defs>
        <linearGradient id={`${_}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F1520" /><stop offset="100%" stopColor="#0A0D14" />
        </linearGradient>
        <filter id={`${_}ds`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="rgba(88,55,251,0.1)" />
        </filter>
        <linearGradient id={`${_}scan`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0" />
          <stop offset="50%" stopColor="#00F0FF" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="280" height="200" rx="8" fill={`url(#${_}bg)`} />

      {/* Header */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.2 }}>
        <rect x="12" y="10" width="256" height="22" rx="5" fill="#1C1E29" fillOpacity="0.5"
          stroke="#1C1E29" strokeWidth="0.4" filter={`url(#${_}ds)`} />
        {[
          { x: 22, t: 'SYMBOL' }, { x: 88, t: 'SIGNAL' }, { x: 155, t: 'SCORE' }, { x: 210, t: 'CONF' }, { x: 248, t: '•••' },
        ].map((h, i) => (
          <text key={i} x={h.x} y="24" fill="#555" fontSize="5" fontWeight="600" fontFamily="'DM Mono', monospace">{h.t}</text>
        ))}
      </motion.g>

      {/* Data rows */}
      {rows.map((r, i) => (
        <motion.g key={i}
          initial={{ opacity: 0, y: 4 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ type: 'spring', stiffness: 140, damping: 18, delay: 0.5 + i * 0.1 }}>
          {r.hot && <rect x="12" y={36 + i * 23} width="256" height="21" rx="3" fill={r.c} fillOpacity="0.02" />}
          <line x1="12" y1={36 + i * 23} x2="268" y2={36 + i * 23} stroke="#1C1E29" strokeWidth="0.3" />
          <text x="22" y={50 + i * 23} fill="#DADADA" fontSize="6" fontWeight="600" fontFamily="'DM Sans', sans-serif">{r.sym}</text>
          <rect x="84" y={40 + i * 23} width={r.sig.length * 5.5 + 8} height="14" rx="3.5" fill={r.c} fillOpacity="0.08"
            stroke={r.c} strokeOpacity="0.15" strokeWidth="0.4" />
          <text x={88 + (r.sig.length * 5.5 + 8) / 2 - 4} y={50 + i * 23} fill={r.c} fontSize="5" fontWeight="600" fontFamily="'DM Mono', monospace">{r.sig}</text>
          <rect x="155" y={45 + i * 23} width="35" height="4" rx="2" fill="#1C1E29" />
          <motion.rect x="155" y={45 + i * 23} height="4" rx="2"
            fill={r.sc > 80 ? '#00D26A' : r.sc > 60 ? '#FEB113' : '#444'}
            initial={{ width: 0 }} animate={inView ? { width: r.sc * 0.35 } : {}}
            transition={{ type: 'spring', stiffness: 80, damping: 15, delay: 0.9 + i * 0.1 }} />
          <text x="195" y={50 + i * 23} fill="#DADADA" fontSize="5.5" fontFamily="'DM Mono', monospace">{r.sc}</text>
          <text x="218" y={50 + i * 23} fill={r.sc > 80 ? '#00D26A' : '#555'} fontSize="5" fontFamily="'DM Mono', monospace">
            {r.sc > 85 ? 'High' : r.sc > 70 ? 'Med' : 'Low'}
          </text>
          {r.hot && (
            <motion.circle cx="255" cy={47 + i * 23} r="3" fill={r.c} opacity="0.6"
              animate={{ opacity: [0.3, 0.8, 0.3] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }} />
          )}
        </motion.g>
      ))}

      {/* Scan line */}
      <motion.rect x="12" y="36" width="256" height="18" rx="2" fill={`url(#${_}scan)`}
        animate={{ y: [36, 160, 36] }}
        transition={{ duration: 4.5, ease: [0.45, 0, 0.55, 1], repeat: Infinity }} />

      {/* Bottom bar */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.8 }}>
        <rect x="12" y="178" width="256" height="16" rx="4" fill="#10121D" fillOpacity="0.5" stroke="#1C1E29" strokeWidth="0.4" />
        <text x="20" y="189" fill="#555" fontSize="4.5" fontFamily="'DM Mono', monospace">4 of 1,847 matches</text>
        <rect x="195" y="181" width="68" height="10" rx="3" fill="#00F0FF" fillOpacity="0.06" stroke="#00F0FF" strokeOpacity="0.1" strokeWidth="0.4" />
        <text x="229" y="189" textAnchor="middle" fill="#00F0FF" fontSize="4.5" fontWeight="600" fontFamily="'DM Sans', sans-serif">50+ Scanners</text>
      </motion.g>
    </motion.svg>
  )
}

/* ═══════════════════════════════════════════════════════════════
   6. PORTFOLIO TRACKING
   Smooth multi-curve chart with P&L cards + holdings
   ═══════════════════════════════════════════════════════════════ */
export function PortfolioIllustration() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const _ = useId()

  /* Smooth bezier curves */
  const mainCurve = "M18 126 C36 124, 48 118, 66 112 C84 106, 78 114, 96 104 C114 94, 120 90, 138 82 C156 74, 162 68, 180 60 C198 52, 206 48, 222 42 C238 36, 246 34, 254 32"
  const areaFill = mainCurve + " L254 132 L18 132 Z"
  const stockA = "M18 118 C40 116, 58 112, 80 108 C102 104, 110 102, 132 96 C154 90, 162 86, 184 80 C206 74, 218 70, 234 66"
  const stockB = "M18 124 C36 128, 52 122, 72 126 C92 130, 100 120, 120 116 C140 112, 150 108, 172 104 C194 100, 210 98, 234 94"

  return (
    <motion.svg ref={ref} viewBox="0 0 280 200" fill="none" className="w-full h-full"
      initial="hidden" animate={inView ? 'visible' : 'hidden'}>
      <defs>
        <linearGradient id={`${_}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F1520" /><stop offset="100%" stopColor="#0A0D14" />
        </linearGradient>
        <linearGradient id={`${_}pf`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.2" /><stop offset="40%" stopColor="#00F0FF" stopOpacity="0.06" /><stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
        </linearGradient>
        <filter id={`${_}gl`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
        </filter>
        <filter id={`${_}ds`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="rgba(0,240,255,0.12)" />
        </filter>
        <radialGradient id={`${_}pt`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.4" />
          <stop offset="40%" stopColor="#00F0FF" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="280" height="200" rx="8" fill={`url(#${_}bg)`} />

      {/* Dot grid */}
      {Array.from({ length: 8 }, (__, r) =>
        Array.from({ length: 12 }, (___, c) => (
          <circle key={`${r}-${c}`} cx={18 + c * 22} cy={18 + r * 22} r="0.4" fill="#1C1E29" />
        ))
      )}

      {/* Top P&L cards */}
      {[
        { x: 14, w: 82, label: 'Total P&L', val: '+18.4%', color: '#00D26A' },
        { x: 104, w: 72, label: 'Positions', val: '12', color: '#DADADA' },
        { x: 184, w: 82, label: "Today's P&L", val: '+₹8.4K', color: '#00F0FF' },
      ].map((c, i) => (
        <motion.g key={i} initial={{ opacity: 0, y: -6 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ type: 'spring', stiffness: 100, damping: 14, delay: 2 + i * 0.15 }}>
          <rect x={c.x} y="8" width={c.w} height="34" rx="7" fill="#10121D" fillOpacity="0.92"
            stroke="#1C1E29" strokeWidth="0.6" filter={`url(#${_}ds)`} />
          <text x={c.x + 8} y="22" fill="#666" fontSize="5.5" fontFamily="'DM Mono', monospace">{c.label}</text>
          <text x={c.x + 8} y="36" fill={c.color} fontSize="12" fontWeight="800" fontFamily="'DM Sans', sans-serif">{c.val}</text>
        </motion.g>
      ))}

      {/* Grid lines */}
      {[60, 82, 104, 126].map(y => (
        <line key={y} x1="14" y1={y} x2="260" y2={y} stroke="#1C1E29" strokeWidth="0.5" />
      ))}

      {/* Portfolio curve — glow */}
      <motion.path d={mainCurve}
        stroke="#00F0FF" strokeWidth="2.5" strokeLinecap="round" fill="none"
        filter={`url(#${_}gl)`}
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(2, 0.3)} />
      {/* Portfolio curve — solid */}
      <motion.path d={mainCurve}
        stroke="#00F0FF" strokeWidth="1.8" strokeLinecap="round" fill="none"
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(2, 0.3)} />

      {/* Area fill */}
      <motion.path d={areaFill} fill={`url(#${_}pf)`}
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.8, duration: 1 }} />

      {/* Stock sub-curves — smooth */}
      <motion.path d={stockA}
        stroke="#9250FF" strokeWidth="1.2" fill="none" opacity="0.5"
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 0.5 } : {}}
        transition={draw(1.8, 0.6)} />
      <motion.path d={stockB}
        stroke="#FEB113" strokeWidth="1.2" fill="none" opacity="0.5"
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 0.5 } : {}}
        transition={draw(1.8, 0.9)} />

      {/* Endpoint glow */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2 }}>
        <circle cx="254" cy="32" r="18" fill={`url(#${_}pt)`} />
        <motion.circle cx="254" cy="32" r="7" fill="#00F0FF" opacity="0.12"
          animate={{ scale: [1, 1.6, 1], opacity: [0.08, 0.2, 0.08] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }} />
        <circle cx="254" cy="32" r="3" fill="#00F0FF" />
      </motion.g>

      {/* Legend */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.8 }}>
        {[
          { x: 18, stroke: '#00F0FF', w: 2, label: 'Portfolio', fc: '#DADADA' },
          { x: 90, stroke: '#9250FF', w: 1.2, label: 'RELIANCE', fc: '#888' },
          { x: 170, stroke: '#FEB113', w: 1.2, label: 'HDFCBANK', fc: '#888' },
        ].map((l, i) => (
          <g key={i}>
            <line x1={l.x} y1="142" x2={l.x + 12} y2="142" stroke={l.stroke} strokeWidth={l.w} />
            <text x={l.x + 16} y="145" fill={l.fc} fontSize="6" fontFamily="'DM Sans', sans-serif">{l.label}</text>
          </g>
        ))}
      </motion.g>

      {/* Bottom holdings */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2.6 }}>
        <rect x="14" y="156" width="252" height="36" rx="7" fill="#10121D" fillOpacity="0.6" stroke="#1C1E29" strokeWidth="0.5" />
        {[
          { x: 24, sym: 'RELIANCE', pnl: '+12.4%', c: '#00D26A' },
          { x: 88, sym: 'TCS', pnl: '+8.7%', c: '#00D26A' },
          { x: 142, sym: 'HDFC', pnl: '+3.2%', c: '#00D26A' },
          { x: 200, sym: 'INFY', pnl: '-1.8%', c: '#E36262' },
        ].map((h, i) => (
          <g key={i}>
            <text x={h.x} y="171" fill="#DADADA" fontSize="6" fontWeight="600" fontFamily="'DM Sans', sans-serif">{h.sym}</text>
            <text x={h.x} y="184" fill={h.c} fontSize="8" fontWeight="700" fontFamily="'DM Sans', sans-serif">{h.pnl}</text>
          </g>
        ))}
        {[80, 134, 192].map(x => (
          <line key={x} x1={x} y1="162" x2={x} y2="186" stroke="#1C1E29" strokeWidth="0.5" />
        ))}
      </motion.g>
    </motion.svg>
  )
}

/* ═══════════════════════════════════════════════════════════════
   7. PATTERN DETECTION (Large / Featured)
   Extended bento hero card version — smooth beziers
   ═══════════════════════════════════════════════════════════════ */
export function PatternDetectionLarge() {
  const ref = useRef<SVGSVGElement>(null)
  const inView = useInView(ref, { once: true, margin: '-60px' })
  const _ = useId()

  /* Smooth price oscillation within converging triangle — wider canvas */
  const pricePath = "M14 148 C24 148, 30 100, 40 96 C50 92, 50 135, 62 132 C74 129, 74 92, 86 90 C98 88, 98 125, 112 122 C126 119, 126 88, 140 86 C154 84, 154 114, 168 112 C182 110, 182 88, 194 86 C206 84, 206 98, 212 96 C218 94, 218 88, 220 86"
  const breakoutPath = "M220 86 C230 76, 240 66, 252 56 C264 46, 270 42, 280 38"

  return (
    <motion.svg ref={ref} viewBox="0 0 400 220" fill="none" className="w-full h-full"
      initial="hidden" animate={inView ? 'visible' : 'hidden'}>
      <defs>
        <linearGradient id={`${_}bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0F1520" /><stop offset="100%" stopColor="#0A0D14" />
        </linearGradient>
        <linearGradient id={`${_}brk`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#00F0FF" /><stop offset="100%" stopColor="#00F0FF" stopOpacity="0.2" />
        </linearGradient>
        <linearGradient id={`${_}af`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9250FF" stopOpacity="0.06" /><stop offset="100%" stopColor="#9250FF" stopOpacity="0" />
        </linearGradient>
        <filter id={`${_}gl`} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
        </filter>
        <filter id={`${_}ds`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(146,80,255,0.15)" />
        </filter>
        <radialGradient id={`${_}ht`}>
          <stop offset="0%" stopColor="#00F0FF" stopOpacity="0.35" />
          <stop offset="50%" stopColor="#00F0FF" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#00F0FF" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="400" height="220" rx="8" fill={`url(#${_}bg)`} />

      {/* Dot grid */}
      {Array.from({ length: 9 }, (__, r) =>
        Array.from({ length: 18 }, (___, c) => (
          <circle key={`${r}-${c}`} cx={14 + c * 22} cy={14 + r * 22} r="0.4" fill="#1C1E29" />
        ))
      )}

      {/* Grid lines */}
      {[38, 65, 92, 119, 146].map(y => (
        <line key={y} x1="12" y1={y} x2="290" y2={y} stroke="#1C1E29" strokeWidth="0.4" />
      ))}

      {/* Triangle fill */}
      <motion.path d="M36 60 L14 150 L222 86 Z" fill={`url(#${_}af)`}
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2 }} />

      {/* Price path — smooth bezier */}
      <motion.path d={pricePath}
        stroke="#DADADA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 0.9 } : {}}
        transition={draw(1.8, 0.3)} />

      {/* Trendlines — clean straight lines */}
      <motion.line x1="36" y1="58" x2="222" y2="84" stroke="#9250FF" strokeWidth="1.5" strokeDasharray="5 3"
        initial={{ opacity: 0 }} animate={inView ? { opacity: 0.7 } : {}} transition={{ delay: 1.6, duration: 0.7 }} />
      <motion.line x1="14" y1="150" x2="222" y2="88" stroke="#9250FF" strokeWidth="1.5" strokeDasharray="5 3"
        initial={{ opacity: 0 }} animate={inView ? { opacity: 0.7 } : {}} transition={{ delay: 1.8, duration: 0.7 }} />

      {/* Breakout — smooth curve with glow */}
      <motion.path d={breakoutPath}
        stroke={`url(#${_}brk)`} strokeWidth="2.5" strokeLinecap="round"
        filter={`url(#${_}gl)`}
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(1, 2.4)} />
      <motion.path d={breakoutPath}
        stroke="#00F0FF" strokeWidth="1.8" strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }} animate={inView ? { pathLength: 1, opacity: 1 } : {}}
        transition={draw(1, 2.4)} />

      {/* Breakout glow orb */}
      <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={inView ? { opacity: 1, scale: 1 } : {}}
        transition={{ type: 'spring', stiffness: 100, damping: 12, delay: 2.6 }}>
        <circle cx="220" cy="86" r="26" fill={`url(#${_}ht)`} />
        <circle cx="220" cy="86" r="12" fill="#00F0FF" opacity="0.06" filter={`url(#${_}gl)`} />
        <motion.circle cx="220" cy="86" r="6" fill="#00F0FF" opacity="0.15"
          animate={{ scale: [1, 1.3, 1], opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }} />
        <circle cx="220" cy="86" r="3" fill="#00F0FF" />
      </motion.g>

      {/* Pattern label */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 2 }}>
        <rect x="80" y="102" width="90" height="22" rx="6" fill="#9250FF" fillOpacity="0.1"
          stroke="#9250FF" strokeOpacity="0.2" strokeWidth="0.5" filter={`url(#${_}ds)`} />
        <text x="125" y="116" textAnchor="middle" fill="#9250FF" fontSize="8" fontWeight="700"
          fontFamily="'DM Sans', sans-serif">SYM TRIANGLE</text>
      </motion.g>

      {/* Volume bars */}
      {VOL_20.map((h, i) => {
        const x = 14 + i * 14
        return (
          <motion.rect key={i} x={x} y={198 - h * 0.6} width={9} height={h * 0.6}
            fill={i >= 14 ? '#00F0FF' : '#333'} opacity={i >= 14 ? 0.5 : 0.2} rx="1.5"
            initial={{ scaleY: 0 }} animate={inView ? { scaleY: 1 } : {}}
            transition={{ type: 'spring', stiffness: 160, damping: 20, delay: 0.2 + i * 0.03 }}
            style={{ transformOrigin: `${x + 4.5}px 198px` }} />
        )
      })}

      {/* Stats panel */}
      <motion.g initial={{ opacity: 0, x: 8 }} animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ type: 'spring', stiffness: 80, damping: 14, delay: 2.8 }}>
        <rect x="296" y="18" width="92" height="120" rx="8" fill="#10121D" fillOpacity="0.92"
          stroke="#1C1E29" strokeWidth="0.6" filter={`url(#${_}ds)`} />
        <rect x="296" y="18" width="92" height="20" rx="8" fill="#1C1E29" fillOpacity="0.3" />
        <text x="342" y="31" textAnchor="middle" fill="#DADADA" fontSize="7" fontWeight="600" fontFamily="'DM Sans', sans-serif">Analysis</text>
        {[
          { y: 50, l: 'Quality', v: '92/100', c: '#00F0FF' },
          { y: 68, l: 'ML Score', v: '0.87', c: '#00D26A' },
          { y: 86, l: 'R:R Ratio', v: '2.4x', c: '#FEB113' },
          { y: 104, l: 'Win Rate', v: '70%', c: '#9250FF' },
          { y: 122, l: 'Confidence', v: 'High', c: '#00D26A' },
        ].map((m, i) => (
          <g key={i}>
            <text x="304" y={m.y} fill="#555" fontSize="5" fontFamily="'DM Mono', monospace">{m.l}</text>
            <text x="380" y={m.y} fill={m.c} fontSize="7" fontWeight="700" fontFamily="'DM Sans', sans-serif" textAnchor="end">{m.v}</text>
            {i < 4 && <line x1="304" y1={m.y + 6} x2="380" y2={m.y + 6} stroke="#1C1E29" strokeWidth="0.3" />}
          </g>
        ))}
      </motion.g>

      {/* Info bar */}
      <motion.g initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.5 }}>
        <rect x="296" y="150" width="92" height="40" rx="6" fill="#10121D" fillOpacity="0.6" stroke="#1C1E29" strokeWidth="0.4" />
        <text x="304" y="164" fill="#555" fontSize="5" fontFamily="'DM Mono', monospace">RELIANCE · NSE</text>
        <text x="304" y="175" fill="#DADADA" fontSize="6" fontWeight="600" fontFamily="'DM Sans', sans-serif">₹2,847.50</text>
        <text x="304" y="185" fill="#00D26A" fontSize="5" fontFamily="'DM Mono', monospace">+2.3% today</text>
      </motion.g>
    </motion.svg>
  )
}
