'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const LottieIcon = dynamic(() => import('@/components/ui/LottieIcon'), { ssr: false })

/* ── Types ── */
interface Engine {
  icon: LucideIcon
  name: string
  description: string
  color: string
}

interface EngineGroup {
  title: string
  subtitle: string
  engines: Engine[]
  cta: { label: string; href: string }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lottie: Record<string, any>
  accent: string
}

interface Props {
  engines: EngineGroup[]
}

/**
 * Stacked card deck.
 *
 * Desktop: each card is `position: sticky` with increasing `top` values.
 * As the user scrolls, cards stick and stack with progressive scale.
 * Mobile: simple vertical stack.
 */
export default function EngineStackedDeck({ engines }: Props) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  return (
    <div className={isMobile ? 'space-y-6' : ''}>
      {engines.map((group, i) => (
        <motion.div
          key={group.title}
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{
            type: 'spring',
            stiffness: 80,
            damping: 18,
            delay: isMobile ? i * 0.1 : 0,
          }}
          className={isMobile ? '' : 'engine-stack-item'}
          style={
            isMobile
              ? undefined
              : {
                  position: 'sticky' as const,
                  top: `${80 + i * 28}px`,
                  zIndex: engines.length - i,
                  transform: `scale(${1 - i * 0.025})`,
                  marginBottom: i < engines.length - 1 ? '-120px' : '0',
                }
          }
        >
          <div className="engine-card overflow-hidden">
            {/* Accent gradient top border */}
            <div
              className="h-[2px] w-full"
              style={{
                background: `linear-gradient(90deg, ${group.accent}, ${group.accent}40 40%, transparent 70%)`,
              }}
            />

            <div className="flex flex-col lg:flex-row lg:items-center gap-6 sm:gap-8 p-6 sm:p-8 lg:p-10">
              {/* Left: Text + Engine pills + CTA */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="h-2 w-2 rounded-full"
                    style={{ background: group.accent }}
                  />
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.2em]"
                    style={{ color: group.accent }}
                  >
                    {`Card ${i + 1} of ${engines.length}`}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-2">
                  {group.title}
                </h3>
                <p className="text-sm text-white/45 mb-6 max-w-md">{group.subtitle}</p>

                {/* Engine pills */}
                <div className="space-y-3.5 mb-6">
                  {group.engines.map((eng) => (
                    <div key={eng.name} className="flex items-start gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl mt-0.5"
                        style={{
                          background: `${eng.color}12`,
                          border: `1px solid ${eng.color}25`,
                        }}
                      >
                        <eng.icon className="h-4 w-4" style={{ color: eng.color }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{eng.name}</p>
                        <p className="text-xs text-white/40 mt-0.5 leading-relaxed">
                          {eng.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                <Link
                  href={group.cta.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-[#4FECCD]/30 bg-[#4FECCD]/[0.06] px-5 py-2.5 text-sm font-semibold text-[#4FECCD] transition-all hover:bg-[#4FECCD]/[0.14] hover:border-[#4FECCD]/50 hover:shadow-[0_0_20px_rgba(79,236,205,0.1)]"
                >
                  {group.cta.label}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              {/* Right: Lottie animation */}
              <div className="hidden lg:flex items-center justify-center w-[280px] h-[200px] shrink-0 rounded-2xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
                <LottieIcon data={group.lottie} width={280} height={200} loop autoplay />
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  )
}
