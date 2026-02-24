'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface BentoGridProps {
  children: React.ReactNode
  className?: string
}

export function BentoGrid({ children, className }: BentoGridProps) {
  return (
    <div className={cn('bento-grid', className)}>
      {children}
    </div>
  )
}

interface BentoCardProps {
  children: React.ReactNode
  className?: string
  span?: 1 | 2
  tall?: boolean
  wide?: boolean
  featured?: boolean
  index?: number
}

export function BentoCard({
  children,
  className,
  span,
  tall,
  wide,
  featured,
  index = 0,
}: BentoCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{
        duration: 0.5,
        delay: index * 0.1,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        'glass-card-neu rounded-2xl p-6 transition-all duration-300',
        'hover:shadow-glass-lg hover:border-white/[0.08]',
        span === 2 && 'bento-span-2',
        tall && 'bento-tall',
        wide && 'bento-wide',
        featured && 'bento-featured',
        className
      )}
    >
      {children}
    </motion.div>
  )
}
