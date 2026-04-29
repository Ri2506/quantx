'use client'

import { useEffect, useRef, useCallback } from 'react'

/**
 * Algorithmic art: Perlin-noise flow field with trading-themed particles.
 * Particles stream like candlestick data flowing through AI pipelines.
 * Uses seeded PRNG for deterministic startup, pure canvas — no p5.js dependency.
 */

interface TradingFlowFieldProps {
  className?: string
  /** Number of flowing particles */
  particleCount?: number
  /** Base hue: 180 = cyan (matches brand) */
  baseHue?: number
  /** Overall opacity multiplier */
  opacity?: number
  /** Speed multiplier */
  speed?: number
}

// Seeded PRNG (mulberry32) for deterministic art
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Simplified Perlin-like noise using smooth gradient interpolation
function createNoise(seed: number) {
  const rng = mulberry32(seed)
  const perm = Array.from({ length: 512 }, () => Math.floor(rng() * 256))

  function fade(t: number) {
    return t * t * t * (t * (t * 6 - 15) + 10)
  }
  function lerp(a: number, b: number, t: number) {
    return a + t * (b - a)
  }
  function grad(hash: number, x: number, y: number) {
    const h = hash & 3
    const u = h < 2 ? x : -x
    const v = h === 0 || h === 3 ? y : -y
    return u + v
  }

  return function noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255
    const yi = Math.floor(y) & 255
    const xf = x - Math.floor(x)
    const yf = y - Math.floor(y)
    const u = fade(xf)
    const v = fade(yf)

    const aa = perm[(perm[xi] + yi) & 511]
    const ab = perm[(perm[xi] + yi + 1) & 511]
    const ba = perm[(perm[(xi + 1) & 255] + yi) & 511]
    const bb = perm[(perm[(xi + 1) & 255] + yi + 1) & 511]

    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v
    )
  }
}

interface Particle {
  x: number
  y: number
  prevX: number
  prevY: number
  vx: number
  vy: number
  life: number
  maxLife: number
  hueOffset: number
  size: number
  type: 'flow' | 'spark'
}

export default function TradingFlowField({
  className = '',
  particleCount = 120,
  baseHue = 180,
  opacity = 1,
  speed = 1,
}: TradingFlowFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const timeRef = useRef(0)
  const noiseRef = useRef(createNoise(42))

  const initParticle = useCallback(
    (w: number, h: number, rng: () => number): Particle => {
      const isSpark = rng() < 0.15
      return {
        x: rng() * w,
        y: rng() * h,
        prevX: 0,
        prevY: 0,
        vx: 0,
        vy: 0,
        life: rng() * 200,
        maxLife: 200 + rng() * 300,
        hueOffset: (rng() - 0.5) * 60,
        size: isSpark ? 1 + rng() * 2 : 0.5 + rng() * 1.2,
        type: isSpark ? 'spark' : 'flow',
      }
    },
    []
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const rng = mulberry32(42)
    const noise = noiseRef.current
    let dpr = window.devicePixelRatio || 1

    function resize() {
      dpr = window.devicePixelRatio || 1
      const rect = canvas!.getBoundingClientRect()
      canvas!.width = rect.width * dpr
      canvas!.height = rect.height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener('resize', resize)

    // Initialize particles
    const rect = canvas.getBoundingClientRect()
    particlesRef.current = Array.from({ length: particleCount }, () =>
      initParticle(rect.width, rect.height, rng)
    )

    function animate() {
      const w = canvas!.getBoundingClientRect().width
      const h = canvas!.getBoundingClientRect().height
      const t = (timeRef.current += 0.003 * speed)

      // Fade trail effect
      ctx!.fillStyle = 'rgba(10, 13, 20, 0.06)'
      ctx!.fillRect(0, 0, w, h)

      const particles = particlesRef.current

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]

        // Noise-driven flow field
        const noiseScale = 0.003
        const angle =
          noise(p.x * noiseScale, p.y * noiseScale + t) * Math.PI * 4
        // Secondary noise for turbulence
        const turbulence =
          noise(p.x * noiseScale * 2 + 100, p.y * noiseScale * 2 + t * 0.5) *
          0.5

        const targetVx = Math.cos(angle) * (1.2 + turbulence) * speed
        const targetVy = Math.sin(angle) * (0.8 + turbulence * 0.6) * speed

        // Smooth velocity (inertia)
        p.vx += (targetVx - p.vx) * 0.04
        p.vy += (targetVy - p.vy) * 0.04

        p.prevX = p.x
        p.prevY = p.y
        p.x += p.vx
        p.y += p.vy
        p.life++

        // Life-based alpha: fade in, sustain, fade out
        const lifeRatio = p.life / p.maxLife
        let alpha: number
        if (lifeRatio < 0.1) alpha = lifeRatio / 0.1
        else if (lifeRatio > 0.85) alpha = (1 - lifeRatio) / 0.15
        else alpha = 1
        alpha *= opacity

        // Recycle dead or out-of-bounds particles
        if (p.life >= p.maxLife || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
          const np = initParticle(w, h, rng)
          // Spawn from edges for continuous flow
          if (rng() < 0.5) {
            np.x = rng() < 0.5 ? -5 : w + 5
            np.y = rng() * h
          } else {
            np.x = rng() * w
            np.y = rng() < 0.5 ? -5 : h + 5
          }
          np.prevX = np.x
          np.prevY = np.y
          np.life = 0
          particles[i] = np
          continue
        }

        // Color: cyan-to-purple spectrum based on particle position + noise
        const hue = baseHue + p.hueOffset + noise(p.x * 0.001, p.y * 0.001) * 40
        const sat = p.type === 'spark' ? 90 : 70
        const light = p.type === 'spark' ? 70 : 55

        if (p.type === 'spark') {
          // Sparks: glowing dots
          ctx!.beginPath()
          ctx!.arc(p.x, p.y, p.size * (0.8 + Math.sin(p.life * 0.1) * 0.3), 0, Math.PI * 2)
          ctx!.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.8})`
          ctx!.fill()

          // Glow
          ctx!.beginPath()
          ctx!.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2)
          ctx!.fillStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.12})`
          ctx!.fill()
        } else {
          // Flow particles: thin trailing lines
          ctx!.beginPath()
          ctx!.moveTo(p.prevX, p.prevY)
          ctx!.lineTo(p.x, p.y)
          ctx!.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${alpha * 0.5})`
          ctx!.lineWidth = p.size
          ctx!.lineCap = 'round'
          ctx!.stroke()
        }
      }

      // Subtle grid overlay pulse (trading grid aesthetic)
      const gridAlpha = 0.015 + Math.sin(t * 2) * 0.005
      ctx!.strokeStyle = `rgba(0, 240, 255, ${gridAlpha})`
      ctx!.lineWidth = 0.5
      const gridSize = 80
      for (let x = 0; x < w; x += gridSize) {
        ctx!.beginPath()
        ctx!.moveTo(x, 0)
        ctx!.lineTo(x, h)
        ctx!.stroke()
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx!.beginPath()
        ctx!.moveTo(0, y)
        ctx!.lineTo(w, y)
        ctx!.stroke()
      }

      animRef.current = requestAnimationFrame(animate)
    }

    // Clear canvas fully on first frame
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [particleCount, baseHue, opacity, speed, initParticle])

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      style={{ mixBlendMode: 'screen' }}
    />
  )
}
