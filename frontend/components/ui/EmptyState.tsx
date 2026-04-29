'use client'

import React from 'react'
import { Inbox } from 'lucide-react'
import { motion } from 'framer-motion'
import dynamic from 'next/dynamic'
import BeamButton from './BeamButton'

const LottieIcon = dynamic(() => import('./LottieIcon'), { ssr: false })

import emptyChartData from '@/lib/lottie/empty-chart.json'

interface EmptyStateProps {
  icon?: React.ReactNode
  illustration?: React.ReactNode
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
  onAction?: () => void
  className?: string
}

export default function EmptyState({
  icon,
  illustration,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`flex flex-col items-center justify-center py-16 text-center ${className}`}
    >
      {/* Lottie empty-chart animation (default) or custom illustration */}
      <div className="relative w-56 h-40 flex items-center justify-center mb-6">
        {/* Ambient glow */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/[0.06] via-[#8D5CFF]/[0.04] to-transparent blur-2xl" />
        <div className="relative z-10">
          {illustration || (
            <LottieIcon data={emptyChartData} width={220} height={160} loop autoplay />
          )}
        </div>
      </div>

      {/* Icon container with animated gradient border ring */}
      {icon && (
        <div className="relative mb-4">
          <div className="absolute -inset-[2px] rounded-full animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,#4FECCD,#8D5CFF,#4FECCD)] opacity-60 blur-[1px]" />
          <div className="relative w-16 h-16 rounded-full bg-white/[0.04] flex items-center justify-center text-d-text-muted">
            {icon}
          </div>
        </div>
      )}

      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-d-text-muted max-w-sm">{description}</p>
      )}
      {actionLabel && (
        <div className="mt-6">
          <BeamButton
            variant="secondary"
            size="sm"
            href={actionHref}
            onClick={onAction}
          >
            {actionLabel}
          </BeamButton>
        </div>
      )}
    </motion.div>
  )
}
