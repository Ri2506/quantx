'use client'

import { useEffect, useRef } from 'react'

/**
 * Algorithmic art: Constellation network — nodes drift gently and form
 * connections when close, evoking neural networks / data pipelines.
 * Lightweight alternative to TradingFlowField for smaller sections.
 */

interface ConstellationFieldProps {
  className?: string
  nodeCount?: number
  /** Maximum connection distance (px) */
  connectionDistance?: number
  /** Color as HSL hue (180 = cyan) */
  hue?: number
}

interface Node {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  pulsePhase: number
}

export default function ConstellationField({
  className = '',
  nodeCount = 40,
  connectionDistance = 150,
  hue = 180,
}: ConstellationFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const nodesRef = useRef<Node[]>([])
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

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

    // Seed-based init
    let seed = 7
    function seededRandom() {
      seed = (seed * 16807 + 0) % 2147483647
      return (seed - 1) / 2147483646
    }

    const rect = canvas.getBoundingClientRect()
    nodesRef.current = Array.from({ length: nodeCount }, () => ({
      x: seededRandom() * rect.width,
      y: seededRandom() * rect.height,
      vx: (seededRandom() - 0.5) * 0.3,
      vy: (seededRandom() - 0.5) * 0.3,
      radius: 1 + seededRandom() * 2,
      pulsePhase: seededRandom() * Math.PI * 2,
    }))

    function animate() {
      const w = canvas!.getBoundingClientRect().width
      const h = canvas!.getBoundingClientRect().height
      const t = (timeRef.current += 0.01)

      ctx!.clearRect(0, 0, w, h)

      const nodes = nodesRef.current

      // Update positions
      for (const node of nodes) {
        node.x += node.vx
        node.y += node.vy

        // Soft bounce off edges
        if (node.x < 0 || node.x > w) node.vx *= -1
        if (node.y < 0 || node.y > h) node.vy *= -1
        node.x = Math.max(0, Math.min(w, node.x))
        node.y = Math.max(0, Math.min(h, node.y))
      }

      // Draw connections
      const cd2 = connectionDistance * connectionDistance
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist2 = dx * dx + dy * dy
          if (dist2 < cd2) {
            const alpha = (1 - Math.sqrt(dist2) / connectionDistance) * 0.2
            ctx!.beginPath()
            ctx!.moveTo(nodes[i].x, nodes[i].y)
            ctx!.lineTo(nodes[j].x, nodes[j].y)
            ctx!.strokeStyle = `hsla(${hue}, 80%, 60%, ${alpha})`
            ctx!.lineWidth = 0.5
            ctx!.stroke()
          }
        }
      }

      // Draw nodes
      for (const node of nodes) {
        const pulse = 1 + Math.sin(t * 2 + node.pulsePhase) * 0.3
        const r = node.radius * pulse

        // Glow
        ctx!.beginPath()
        ctx!.arc(node.x, node.y, r * 4, 0, Math.PI * 2)
        ctx!.fillStyle = `hsla(${hue}, 80%, 60%, 0.04)`
        ctx!.fill()

        // Core
        ctx!.beginPath()
        ctx!.arc(node.x, node.y, r, 0, Math.PI * 2)
        ctx!.fillStyle = `hsla(${hue}, 80%, 70%, ${0.5 + pulse * 0.15})`
        ctx!.fill()
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [nodeCount, connectionDistance, hue])

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  )
}
