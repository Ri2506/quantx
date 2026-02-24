'use client'

import { cn } from '@/lib/utils'

interface FloatingIllustrationProps {
  variant?: 'trading' | 'chart' | 'data' | 'network'
  className?: string
}

export default function FloatingIllustration({
  variant = 'trading',
  className,
}: FloatingIllustrationProps) {
  if (variant === 'trading') {
    return (
      <svg
        viewBox="0 0 500 400"
        fill="none"
        className={cn('animate-float', className)}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Candlesticks */}
        <rect x="60" y="140" width="12" height="120" rx="2" fill="rgba(0, 255, 136, 0.2)" stroke="rgba(0, 255, 136, 0.5)" strokeWidth="1" />
        <line x1="66" y1="120" x2="66" y2="280" stroke="rgba(0, 255, 136, 0.4)" strokeWidth="1.5" />
        <rect x="100" y="100" width="12" height="100" rx="2" fill="rgba(0, 255, 136, 0.25)" stroke="rgba(0, 255, 136, 0.5)" strokeWidth="1" />
        <line x1="106" y1="80" x2="106" y2="220" stroke="rgba(0, 255, 136, 0.4)" strokeWidth="1.5" />
        <rect x="140" y="160" width="12" height="80" rx="2" fill="rgba(255, 71, 87, 0.2)" stroke="rgba(255, 71, 87, 0.5)" strokeWidth="1" />
        <line x1="146" y1="130" x2="146" y2="260" stroke="rgba(255, 71, 87, 0.4)" strokeWidth="1.5" />
        <rect x="180" y="120" width="12" height="90" rx="2" fill="rgba(0, 255, 136, 0.25)" stroke="rgba(0, 255, 136, 0.5)" strokeWidth="1" />
        <line x1="186" y1="90" x2="186" y2="230" stroke="rgba(0, 255, 136, 0.4)" strokeWidth="1.5" />
        <rect x="220" y="80" width="12" height="110" rx="2" fill="rgba(0, 255, 136, 0.3)" stroke="rgba(0, 255, 136, 0.6)" strokeWidth="1" />
        <line x1="226" y1="60" x2="226" y2="210" stroke="rgba(0, 255, 136, 0.4)" strokeWidth="1.5" />
        <rect x="260" y="130" width="12" height="70" rx="2" fill="rgba(255, 71, 87, 0.2)" stroke="rgba(255, 71, 87, 0.5)" strokeWidth="1" />
        <line x1="266" y1="110" x2="266" y2="220" stroke="rgba(255, 71, 87, 0.4)" strokeWidth="1.5" />

        {/* Trend line with glow */}
        <path
          d="M60 250 Q130 180, 186 150 Q240 120, 300 90 Q360 60, 440 40"
          stroke="url(#trendGrad)"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d="M60 250 Q130 180, 186 150 Q240 120, 300 90 Q360 60, 440 40"
          stroke="url(#trendGrad)"
          strokeWidth="8"
          fill="none"
          strokeLinecap="round"
          opacity="0.15"
          filter="blur(6px)"
        />

        {/* Signal markers */}
        <circle cx="186" cy="150" r="6" fill="rgba(0, 229, 255, 0.3)" stroke="rgba(0, 229, 255, 0.8)" strokeWidth="1.5">
          <animate attributeName="r" values="6;8;6" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="300" cy="90" r="6" fill="rgba(0, 255, 136, 0.3)" stroke="rgba(0, 255, 136, 0.8)" strokeWidth="1.5">
          <animate attributeName="r" values="6;8;6" dur="2.5s" repeatCount="indefinite" />
        </circle>

        {/* Grid lines */}
        {[80, 140, 200, 260, 320].map((y) => (
          <line key={y} x1="40" y1={y} x2="460" y2={y} stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
        ))}

        <defs>
          <linearGradient id="trendGrad" x1="60" y1="250" x2="440" y2="40">
            <stop offset="0%" stopColor="#00e5ff" />
            <stop offset="100%" stopColor="#00ff88" />
          </linearGradient>
        </defs>
      </svg>
    )
  }

  if (variant === 'chart') {
    return (
      <svg
        viewBox="0 0 500 400"
        fill="none"
        className={cn('animate-float', className)}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Area chart */}
        <path
          d="M40 300 L100 240 L160 260 L220 180 L280 200 L340 120 L400 100 L460 60"
          stroke="url(#chartLine)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M40 300 L100 240 L160 260 L220 180 L280 200 L340 120 L400 100 L460 60 L460 350 L40 350 Z"
          fill="url(#chartFill)"
        />

        {/* Data points */}
        {[[100,240],[160,260],[220,180],[280,200],[340,120],[400,100],[460,60]].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r="4" fill="#04060e" stroke="#00e5ff" strokeWidth="2" />
        ))}

        <defs>
          <linearGradient id="chartLine" x1="40" y1="300" x2="460" y2="60">
            <stop offset="0%" stopColor="#00e5ff" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
          <linearGradient id="chartFill" x1="250" y1="60" x2="250" y2="350">
            <stop offset="0%" stopColor="rgba(0, 229, 255, 0.15)" />
            <stop offset="100%" stopColor="rgba(0, 229, 255, 0)" />
          </linearGradient>
        </defs>
      </svg>
    )
  }

  if (variant === 'data') {
    return (
      <svg
        viewBox="0 0 500 400"
        fill="none"
        className={cn('animate-float', className)}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Data flow visualization */}
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect
              x={80 + i * 75}
              y={160 - i * 15}
              width="50"
              height="80"
              rx="8"
              fill="rgba(0, 229, 255, 0.05)"
              stroke="rgba(0, 229, 255, 0.2)"
              strokeWidth="1"
            />
            <rect
              x={88 + i * 75}
              y={240 - i * 15 - (20 + i * 10)}
              width="34"
              height={20 + i * 10}
              rx="4"
              fill={`rgba(0, 229, 255, ${0.15 + i * 0.08})`}
            />
          </g>
        ))}

        {/* Connection lines */}
        <path d="M130 200 Q170 170, 155 160" stroke="rgba(139, 92, 246, 0.3)" strokeWidth="1" fill="none" strokeDasharray="4 4" />
        <path d="M205 185 Q245 155, 230 145" stroke="rgba(139, 92, 246, 0.3)" strokeWidth="1" fill="none" strokeDasharray="4 4" />
        <path d="M280 170 Q320 140, 305 130" stroke="rgba(139, 92, 246, 0.3)" strokeWidth="1" fill="none" strokeDasharray="4 4" />

        {/* Floating orbs */}
        <circle cx="120" cy="120" r="3" fill="rgba(0, 255, 136, 0.6)">
          <animate attributeName="cy" values="120;110;120" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="300" cy="80" r="2" fill="rgba(0, 229, 255, 0.6)">
          <animate attributeName="cy" values="80;70;80" dur="4s" repeatCount="indefinite" />
        </circle>
        <circle cx="400" cy="100" r="2.5" fill="rgba(139, 92, 246, 0.6)">
          <animate attributeName="cy" values="100;90;100" dur="3.5s" repeatCount="indefinite" />
        </circle>
      </svg>
    )
  }

  // network variant
  return (
    <svg
      viewBox="0 0 500 400"
      fill="none"
      className={cn('animate-float', className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Network nodes */}
      {[
        [250, 200], [150, 120], [350, 120], [100, 250], [400, 250],
        [200, 300], [300, 300], [150, 200], [350, 200],
      ].map(([cx, cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={i === 0 ? 12 : 6} fill={i === 0 ? 'rgba(0, 229, 255, 0.2)' : 'rgba(0, 229, 255, 0.1)'} stroke={i === 0 ? 'rgba(0, 229, 255, 0.6)' : 'rgba(0, 229, 255, 0.3)'} strokeWidth="1.5" />
          {i === 0 && (
            <circle cx={cx} cy={cy} r="18" fill="none" stroke="rgba(0, 229, 255, 0.15)" strokeWidth="1">
              <animate attributeName="r" values="14;20;14" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
            </circle>
          )}
        </g>
      ))}

      {/* Connection lines */}
      {[
        [250, 200, 150, 120], [250, 200, 350, 120], [250, 200, 100, 250],
        [250, 200, 400, 250], [250, 200, 200, 300], [250, 200, 300, 300],
        [150, 120, 100, 250], [350, 120, 400, 250], [150, 200, 200, 300],
        [350, 200, 300, 300],
      ].map(([x1, y1, x2, y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(0, 229, 255, 0.1)" strokeWidth="1" />
      ))}
    </svg>
  )
}
