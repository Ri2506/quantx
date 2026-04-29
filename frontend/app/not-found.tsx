'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, LayoutDashboard } from 'lucide-react'
import dynamic from 'next/dynamic'
import emptyChartData from '@/lib/lottie/empty-chart.json'

const LottieIcon = dynamic(() => import('@/components/ui/LottieIcon'), { ssr: false })

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0A0D14] p-6">
      {/* 5-layer depth background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0A0D14] via-[#111520] to-[#0A0D14]" />

      {/* Dot grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, #4FECCD 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Ambient glows */}
      <div className="pointer-events-none absolute left-1/3 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/[0.05] blur-[140px] animate-glow-breathe" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-[#8D5CFF]/[0.04] blur-[120px] animate-glow-breathe" style={{ animationDelay: '3s' }} />

      {/* Retro grid floor */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[35%] overflow-hidden opacity-10" style={{ perspective: '200px' }}>
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

      <div className="relative z-10 max-w-lg text-center">
        {/* Lottie empty chart animation */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto mb-6 w-56"
        >
          <LottieIcon data={emptyChartData} width={224} height={160} loop autoplay />
        </motion.div>

        {/* Glitch-style 404 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative mb-6 inline-block"
        >
          <h1 className="relative z-10 bg-gradient-to-br from-primary via-[#5DCBD8] to-[#8D5CFF] bg-clip-text font-mono text-[130px] font-black leading-none text-transparent sm:text-[160px] num-display tracking-tighter">
            404
          </h1>
          {/* Glow behind numbers */}
          <div className="absolute inset-0 bg-primary/[0.08] blur-[80px] rounded-full" />

          {/* Broken chart line decoration */}
          <svg width="240" height="40" viewBox="0 0 240 40" fill="none" className="absolute -bottom-1 left-1/2 -translate-x-1/2 opacity-40">
            <path d="M10 30 L35 20 L60 24 L85 12 L105 16" stroke="#4FECCD" strokeWidth="2" strokeLinecap="round">
              <animate attributeName="stroke-dashoffset" from="200" to="0" dur="2s" fill="freeze" />
            </path>
            <circle cx="105" cy="16" r="3" fill="#4FECCD" opacity="0.6">
              <animate attributeName="opacity" values="0;0.6" dur="2s" fill="freeze" />
            </circle>
            <path d="M115 20 L140 30 L165 22 L190 28 L215 32" stroke="#FF5947" strokeWidth="2" strokeLinecap="round" strokeDasharray="6 4" opacity="0.5" />
          </svg>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.25 }}
        >
          <h2 className="mb-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Page not found
          </h2>
          <p className="mb-10 text-sm leading-relaxed text-d-text-muted max-w-sm mx-auto">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Check the URL or head back to familiar territory.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex items-center justify-center gap-3"
        >
          <Link
            href="/"
            className="btn-primary spring-press rounded-[6px] px-6 py-2.5 text-sm inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Go home
          </Link>
          <Link
            href="/dashboard"
            className="spring-press rounded-[6px] border border-d-border bg-white/[0.02] px-6 py-2.5 text-sm font-medium text-d-text-secondary transition-all hover:bg-white/[0.06] hover:text-white hover:border-d-border-hover inline-flex items-center gap-2 shadow-md-1"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </motion.div>

        {/* Error code footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          className="mt-12 text-[10px] font-mono num-display text-d-text-muted/40 uppercase tracking-[0.2em]"
        >
          Error Code: 404 &middot; Not Found
        </motion.p>
      </div>
    </div>
  )
}
