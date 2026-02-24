'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface ScrollRevealProps {
  children: React.ReactNode
  className?: string
  direction?: 'up' | 'left' | 'right' | 'none'
  delay?: number
  duration?: number
  distance?: number
}

const directionMap = {
  up: { y: 40, x: 0 },
  left: { x: 40, y: 0 },
  right: { x: -40, y: 0 },
  none: { x: 0, y: 0 },
}

export default function ScrollReveal({
  children,
  className,
  direction = 'up',
  delay = 0,
  duration = 0.6,
  distance,
}: ScrollRevealProps) {
  const offset = directionMap[direction]
  const x = distance !== undefined ? (direction === 'left' ? distance : direction === 'right' ? -distance : 0) : offset.x
  const y = distance !== undefined && direction === 'up' ? distance : offset.y

  return (
    <motion.div
      initial={{ opacity: 0, x, y }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{
        duration,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(className)}
    >
      {children}
    </motion.div>
  )
}
