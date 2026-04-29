'use client'

import { useEffect, useRef, useState } from 'react'

interface AnimatedCounterProps {
  target: number
  suffix?: string
  prefix?: string
  duration?: number
  className?: string
}

export default function AnimatedCounter({
  target,
  suffix = '',
  prefix = '',
  duration = 1500,
  className = '',
}: AnimatedCounterProps) {
  const [count, setCount] = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started) {
          setStarted(true)
        }
      },
      { threshold: 0.3 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [started])

  useEffect(() => {
    if (!started) return

    const startTime = performance.now()
    let raf: number

    const step = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // cubic ease-out
      setCount(Math.round(eased * target))

      if (progress < 1) {
        raf = requestAnimationFrame(step)
      }
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [started, target, duration])

  return (
    <span ref={ref} className={`font-mono tabular-nums ${className}`}>
      {prefix}{count.toLocaleString('en-IN')}{suffix}
    </span>
  )
}
