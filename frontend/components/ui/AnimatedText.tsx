'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface AnimatedTextProps {
  text: string
  className?: string
  animation?: 'reveal' | 'typewriter' | 'stagger'
  delay?: number
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span'
}

export default function AnimatedText({
  text,
  className,
  animation = 'stagger',
  delay = 0,
  as: Tag = 'h1',
}: AnimatedTextProps) {
  if (animation === 'reveal') {
    return (
      <div className="overflow-hidden">
        <motion.div
          initial={{ y: '100%' }}
          whileInView={{ y: 0 }}
          viewport={{ once: true }}
          transition={{
            duration: 0.6,
            delay,
            ease: [0.16, 1, 0.3, 1],
          }}
        >
          <Tag className={className}>{text}</Tag>
        </motion.div>
      </div>
    )
  }

  if (animation === 'typewriter') {
    const words = text.split(' ')
    return (
      <Tag className={className}>
        {words.map((word, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, filter: 'blur(4px)' }}
            whileInView={{ opacity: 1, filter: 'blur(0px)' }}
            viewport={{ once: true }}
            transition={{
              duration: 0.4,
              delay: delay + i * 0.08,
              ease: 'easeOut',
            }}
            className="inline-block mr-[0.25em]"
          >
            {word}
          </motion.span>
        ))}
      </Tag>
    )
  }

  // stagger — per character
  const chars = text.split('')
  return (
    <Tag className={cn('inline-flex flex-wrap', className)}>
      {chars.map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{
            duration: 0.3,
            delay: delay + i * 0.03,
            ease: [0.16, 1, 0.3, 1],
          }}
          className={char === ' ' ? 'w-[0.25em]' : undefined}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </Tag>
  )
}
