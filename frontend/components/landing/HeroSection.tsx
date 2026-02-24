'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, useScroll, useTransform } from 'framer-motion'
import { ArrowRight, Terminal, ChevronDown } from 'lucide-react'
import AnimatedText from '@/components/ui/AnimatedText'
import ScrollReveal from '@/components/ui/ScrollReveal'

export default function HeroSection() {
  const { scrollY } = useScroll()
  const backgroundY = useTransform(scrollY, [0, 600], [0, 180])
  const contentOpacity = useTransform(scrollY, [0, 400], [1, 0])
  const contentY = useTransform(scrollY, [0, 400], [0, 60])

  const [hasImage, setHasImage] = useState(false)

  useEffect(() => {
    // Check if hero image exists
    const img = new window.Image()
    img.onload = () => setHasImage(true)
    img.onerror = () => setHasImage(false)
    img.src = '/images/hero-aurora.webp'
  }, [])

  return (
    <section className="relative min-h-screen overflow-hidden">
      {/* Layer 0: Background Image with Parallax (if available) */}
      {hasImage && (
        <motion.div
          style={{ y: backgroundY }}
          className="parallax-bg"
        >
          <Image
            src="/images/hero-aurora.webp"
            alt=""
            fill
            className="object-cover object-center"
            priority
            quality={90}
          />
        </motion.div>
      )}

      {/* Layer 1: CSS Aurora (fallback or supplemental layer) */}
      <div className={`bg-aurora-tv absolute inset-0 pointer-events-none ${hasImage ? 'opacity-40' : ''}`} />

      {/* Layer 2: Dark Overlay for Text Readability */}
      <div className="hero-overlay" />

      {/* Layer 3: Existing Glow Orbs (reduced when image present) */}
      <div className={`bg-glow-layer absolute inset-0 pointer-events-none z-[3] ${hasImage ? 'opacity-30' : ''}`}>
        <div className="glow-orb glow-orb-cyan" />
        <div className="glow-orb glow-orb-purple" />
        <div className="glow-orb glow-orb-green" />
      </div>
      <div className="glow-stroke-top" style={{ zIndex: 3 }} />

      {/* Layer 4: Content */}
      <motion.div
        style={{ opacity: contentOpacity, y: contentY }}
        className="container relative z-10 mx-auto px-6 pt-32 pb-20"
      >
        <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-neon-cyan/30 bg-[rgba(12,18,32,0.7)] px-5 py-2.5"
            >
              <Terminal className="h-4 w-4 text-neon-cyan" />
              <span className="text-xs font-semibold uppercase tracking-wider text-neon-cyan">
                AI-Powered Neural Trading Platform
              </span>
            </motion.div>

            <AnimatedText
              text="AI-Powered Neural"
              animation="typewriter"
              as="h1"
              className="text-display-md font-bold leading-tight text-text-primary md:text-display-lg"
            />
            <AnimatedText
              text="Market Intelligence"
              animation="typewriter"
              as="h1"
              delay={0.4}
              className="mt-2 text-display-md font-bold leading-tight gradient-text-hero md:text-display-lg"
            />

            <ScrollReveal delay={0.6}>
              <p className="mt-8 max-w-xl mx-auto text-lg leading-relaxed text-text-secondary">
                Advanced AI and deep learning neural networks continuously analyze 500+ liquid Indian
                equities. Detect institutional accumulation patterns before public price discovery
                with probability-scored signals.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={0.8}>
              <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
                <Link
                  href="/signup"
                  className="btn-tv-gradient btn-press group inline-flex items-center justify-center gap-2 rounded-xl px-10 py-4 text-lg font-semibold"
                >
                  Start 7-Day Free Trial
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="#terminal"
                  className="gradient-border btn-press inline-flex items-center justify-center gap-2 rounded-xl px-8 py-4 text-lg font-medium text-text-primary transition-all hover:shadow-glow-sm"
                >
                  <span className="bg-space-void rounded-[19px] px-6 py-2">View Platform</span>
                </Link>
              </div>
            </ScrollReveal>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="mt-20 flex justify-center"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex flex-col items-center gap-2 text-text-secondary/50"
          >
            <span className="text-xs font-medium uppercase tracking-widest">Explore</span>
            <ChevronDown className="h-5 w-5" />
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  )
}
