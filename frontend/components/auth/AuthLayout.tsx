'use client'

import Link from 'next/link'

interface AuthLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

export default function AuthLayout({
  children,
  title = 'AI-Powered Trading Intelligence',
  subtitle = 'Advanced stock screening and swing trading signals for the Indian market.',
}: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-[#0A0D14]">
      {/* Left decorative panel — premium deep-space design */}
      <div className="relative hidden overflow-hidden lg:flex lg:w-[45%]">
        {/* Background gradient — L0 to L1 depth */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A0D14] via-[#111520] to-[#1C1E29]" />

        {/* Dot grid pattern */}
        <div className="absolute inset-0 bg-dot-grid-dark mask-radial-fade opacity-20" />

        {/* Ambient teal glow */}
        <div className="absolute top-[20%] left-[15%] h-[500px] w-[500px] rounded-full bg-primary/[0.08] blur-[120px] animate-glow-breathe" />

        {/* Ambient purple glow */}
        <div className="absolute bottom-[10%] right-[10%] h-[350px] w-[350px] rounded-full bg-[#8D5CFF]/[0.06] blur-[100px] animate-glow-breathe" style={{ animationDelay: '3s' }} />

        {/* Decorative candlestick chart */}
        <svg
          className="absolute left-[12%] top-[32%] opacity-[0.06]"
          width="320"
          height="200"
          viewBox="0 0 320 200"
          fill="none"
        >
          {[30, 70, 110, 150, 190, 230, 270].map((x, i) => {
            const h = [70, 100, 50, 120, 75, 95, 60][i]
            const top = [55, 25, 70, 15, 50, 30, 60][i]
            const green = i % 2 === 0
            return (
              <g key={x}>
                <line x1={x} y1={top - 14} x2={x} y2={top + h + 14} stroke={green ? '#4FECCD' : '#FF5947'} strokeWidth="1.5" />
                <rect x={x - 8} y={top} width="16" height={h} rx="3" fill={green ? '#4FECCD' : '#FF5947'} />
              </g>
            )
          })}
          {/* Trend line */}
          <path d="M30 95 Q110 40, 190 55 Q230 62, 270 30" stroke="#4FECCD" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.4" />
        </svg>

        {/* Retro grid floor */}
        <div className="absolute inset-x-0 bottom-0 h-[40%] overflow-hidden opacity-15" style={{ perspective: '200px' }}>
          <div className="absolute inset-0" style={{ transform: 'rotateX(65deg)', transformOrigin: '50% 0%' }}>
            <div
              className="h-[300vh] w-[600vw] ml-[-200%]"
              style={{
                backgroundImage: 'linear-gradient(to right, rgba(79,236,205,0.08) 1px, transparent 0), linear-gradient(to bottom, rgba(79,236,205,0.08) 1px, transparent 0)',
                backgroundSize: '56px 56px',
              }}
            />
          </div>
        </div>

        <div className="relative z-10 flex h-full flex-col justify-between p-10 xl:p-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-[#5DCBD8] to-[#8D5CFF] shadow-[0_0_20px_rgba(79,236,205,0.25)] transition-shadow group-hover:shadow-[0_0_30px_rgba(79,236,205,0.4)]">
              <span className="text-sm font-extrabold text-black">Q</span>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold tracking-tight text-white">Quant X</span>
              <span className="text-[9px] font-medium uppercase tracking-[0.15em] text-primary/50">Trading Intelligence</span>
            </div>
          </Link>

          {/* Main text */}
          <div>
            <h1 className="mb-5 text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">
              {title}
            </h1>
            <p className="max-w-sm text-base leading-relaxed text-white/45">
              {subtitle}
            </p>

            {/* Social proof */}
            <div className="mt-10 flex items-center gap-8">
              {[
                { value: '73%+', label: 'Win Rate' },
                { value: '6', label: 'AI Models' },
                { value: '1,800+', label: 'Stocks' },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="num-display text-xl font-bold text-primary">{stat.value}</p>
                  <p className="mt-0.5 text-[10px] font-medium uppercase tracking-wider text-white/35">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/25">
            &copy; {new Date().getFullYear()} Quant X Technologies. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right form panel — L1 surface */}
      <div className="flex flex-1 items-center justify-center bg-[#111520] p-6 sm:p-8">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 flex items-center justify-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-[#5DCBD8] to-[#8D5CFF] shadow-[0_0_16px_rgba(79,236,205,0.2)]">
              <span className="text-sm font-extrabold text-black">Q</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-white">
              Quant X
            </span>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
