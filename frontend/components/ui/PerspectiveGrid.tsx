'use client'

import { useEffect, useRef } from 'react'

/**
 * 3D perspective grid room — dark space with vanishing-point grid lines
 * on floor, ceiling, and walls, plus two glowing orbs.
 */
export default function PerspectiveGrid({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    let dpr = window.devicePixelRatio || 1

    function resize() {
      dpr = window.devicePixelRatio || 1
      const r = canvas!.getBoundingClientRect()
      canvas!.width = r.width * dpr
      canvas!.height = r.height * dpr
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    function drawGrid(
      ctx: CanvasRenderingContext2D,
      w: number,
      h: number,
      vpX: number,
      vpY: number,
      t: number
    ) {
      // Background
      ctx.fillStyle = '#0a0d14'
      ctx.fillRect(0, 0, w, h)

      const gridColor = 'rgba(255,255,255,0.14)'
      const gridColorFaint = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 0.7

      const cols = 20
      const rows = 14

      // ── FLOOR (bottom half → vanishing point) ──
      for (let i = 0; i <= cols; i++) {
        const xBottom = (i / cols) * w
        const progress = i / cols
        const alpha = 0.08 + Math.abs(progress - 0.5) * 0.1
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`
        ctx.beginPath()
        ctx.moveTo(xBottom, h)
        ctx.lineTo(vpX, vpY)
        ctx.stroke()
      }
      for (let j = 1; j <= rows; j++) {
        const ratio = j / rows
        const perspective = Math.pow(ratio, 1.8)
        const y = vpY + (h - vpY) * perspective
        const spread = perspective
        const x1 = vpX - (vpX) * spread * 1.3
        const x2 = vpX + (w - vpX) * spread * 1.3
        ctx.strokeStyle = gridColor
        ctx.beginPath()
        ctx.moveTo(x1, y)
        ctx.lineTo(x2, y)
        ctx.stroke()
      }

      // ── CEILING (top half → vanishing point) ──
      for (let i = 0; i <= cols; i++) {
        const xTop = (i / cols) * w
        const progress = i / cols
        const alpha = 0.07 + Math.abs(progress - 0.5) * 0.08
        ctx.strokeStyle = `rgba(255,255,255,${alpha})`
        ctx.beginPath()
        ctx.moveTo(xTop, 0)
        ctx.lineTo(vpX, vpY)
        ctx.stroke()
      }
      for (let j = 1; j <= rows; j++) {
        const ratio = j / rows
        const perspective = Math.pow(ratio, 1.8)
        const y = vpY - vpY * perspective
        const spread = perspective
        const x1 = vpX - vpX * spread * 1.3
        const x2 = vpX + (w - vpX) * spread * 1.3
        ctx.strokeStyle = gridColorFaint
        ctx.beginPath()
        ctx.moveTo(x1, y)
        ctx.lineTo(x2, y)
        ctx.stroke()
      }

      // ── LEFT WALL ──
      const wallRows = 10
      for (let j = 0; j <= wallRows; j++) {
        const yEdge = (j / wallRows) * h
        ctx.strokeStyle = gridColorFaint
        ctx.beginPath()
        ctx.moveTo(0, yEdge)
        ctx.lineTo(vpX, vpY)
        ctx.stroke()
      }
      for (let i = 1; i <= 8; i++) {
        const ratio = i / 8
        const p = Math.pow(ratio, 1.6)
        const x = vpX * (1 - p)
        const yTop = vpY - (vpY) * (1 - p) * 1.2
        const yBot = vpY + (h - vpY) * (1 - p) * 1.2
        ctx.strokeStyle = `rgba(255,255,255,0.07)`
        ctx.beginPath()
        ctx.moveTo(x, Math.max(0, yTop))
        ctx.lineTo(x, Math.min(h, yBot))
        ctx.stroke()
      }

      // ── RIGHT WALL ──
      for (let j = 0; j <= wallRows; j++) {
        const yEdge = (j / wallRows) * h
        ctx.strokeStyle = gridColorFaint
        ctx.beginPath()
        ctx.moveTo(w, yEdge)
        ctx.lineTo(vpX, vpY)
        ctx.stroke()
      }
      for (let i = 1; i <= 8; i++) {
        const ratio = i / 8
        const p = Math.pow(ratio, 1.6)
        const x = vpX + (w - vpX) * p
        const yTop = vpY - vpY * (1 - (1 - p)) * 0.8
        const yBot = vpY + (h - vpY) * (1 - (1 - p)) * 0.8
        ctx.strokeStyle = `rgba(255,255,255,0.07)`
        ctx.beginPath()
        ctx.moveTo(x, Math.max(0, yTop))
        ctx.lineTo(x, Math.min(h, yBot))
        ctx.stroke()
      }

      // ── GLOWING ORB 1 — blue/white (upper left) ──
      const orb1X = w * 0.22 + Math.sin(t * 0.5) * 8
      const orb1Y = h * 0.28 + Math.cos(t * 0.7) * 5
      const orb1Pulse = 1 + Math.sin(t * 1.5) * 0.15

      // Wide glow
      const g1w = ctx.createRadialGradient(orb1X, orb1Y, 0, orb1X, orb1Y, 160 * orb1Pulse)
      g1w.addColorStop(0, 'rgba(160, 200, 255, 0.15)')
      g1w.addColorStop(0.4, 'rgba(100, 160, 255, 0.04)')
      g1w.addColorStop(1, 'rgba(100, 160, 255, 0)')
      ctx.fillStyle = g1w
      ctx.fillRect(orb1X - 180, orb1Y - 180, 360, 360)

      // Outer bloom
      const g1 = ctx.createRadialGradient(orb1X, orb1Y, 0, orb1X, orb1Y, 70 * orb1Pulse)
      g1.addColorStop(0, 'rgba(200, 220, 255, 0.5)')
      g1.addColorStop(0.25, 'rgba(140, 180, 255, 0.2)')
      g1.addColorStop(0.6, 'rgba(100, 160, 255, 0.05)')
      g1.addColorStop(1, 'rgba(100, 160, 255, 0)')
      ctx.fillStyle = g1
      ctx.fillRect(orb1X - 80, orb1Y - 80, 160, 160)

      // Vertical streak (lens flare)
      ctx.fillStyle = 'rgba(200, 220, 255, 0.15)'
      ctx.fillRect(orb1X - 1.5, orb1Y - 60 * orb1Pulse, 3, 120 * orb1Pulse)
      ctx.fillStyle = 'rgba(200, 220, 255, 0.06)'
      ctx.fillRect(orb1X - 0.5, orb1Y - 90 * orb1Pulse, 1, 180 * orb1Pulse)

      // Horizontal streak
      ctx.fillStyle = 'rgba(200, 220, 255, 0.08)'
      ctx.fillRect(orb1X - 30 * orb1Pulse, orb1Y - 1, 60 * orb1Pulse, 2)

      // Core
      const g1c = ctx.createRadialGradient(orb1X, orb1Y, 0, orb1X, orb1Y, 8)
      g1c.addColorStop(0, 'rgba(255, 255, 255, 1)')
      g1c.addColorStop(0.4, 'rgba(200, 220, 255, 0.7)')
      g1c.addColorStop(1, 'rgba(100, 160, 255, 0)')
      ctx.beginPath()
      ctx.arc(orb1X, orb1Y, 8, 0, Math.PI * 2)
      ctx.fillStyle = g1c
      ctx.fill()

      // ── GLOWING ORB 2 — orange/amber (lower right) ──
      const orb2X = w * 0.78 + Math.cos(t * 0.4) * 6
      const orb2Y = h * 0.72 + Math.sin(t * 0.6) * 8
      const orb2Pulse = 1 + Math.sin(t * 1.2 + 1) * 0.2

      // Wide glow
      const g2w = ctx.createRadialGradient(orb2X, orb2Y, 0, orb2X, orb2Y, 140 * orb2Pulse)
      g2w.addColorStop(0, 'rgba(255, 120, 40, 0.12)')
      g2w.addColorStop(0.4, 'rgba(255, 80, 20, 0.03)')
      g2w.addColorStop(1, 'rgba(255, 80, 20, 0)')
      ctx.fillStyle = g2w
      ctx.fillRect(orb2X - 160, orb2Y - 160, 320, 320)

      // Outer bloom
      const g2 = ctx.createRadialGradient(orb2X, orb2Y, 0, orb2X, orb2Y, 60 * orb2Pulse)
      g2.addColorStop(0, 'rgba(255, 160, 70, 0.45)')
      g2.addColorStop(0.25, 'rgba(255, 120, 40, 0.15)')
      g2.addColorStop(0.6, 'rgba(255, 80, 20, 0.04)')
      g2.addColorStop(1, 'rgba(255, 80, 20, 0)')
      ctx.fillStyle = g2
      ctx.fillRect(orb2X - 70, orb2Y - 70, 140, 140)

      // Horizontal streak (lens flare)
      ctx.fillStyle = 'rgba(255, 160, 80, 0.12)'
      ctx.fillRect(orb2X - 70 * orb2Pulse, orb2Y - 1.5, 140 * orb2Pulse, 3)
      ctx.fillStyle = 'rgba(255, 160, 80, 0.04)'
      ctx.fillRect(orb2X - 110 * orb2Pulse, orb2Y - 0.5, 220 * orb2Pulse, 1)

      // Core
      const g2c = ctx.createRadialGradient(orb2X, orb2Y, 0, orb2X, orb2Y, 7)
      g2c.addColorStop(0, 'rgba(255, 220, 160, 1)')
      g2c.addColorStop(0.4, 'rgba(255, 140, 50, 0.6)')
      g2c.addColorStop(1, 'rgba(255, 80, 20, 0)')
      ctx.beginPath()
      ctx.arc(orb2X, orb2Y, 7, 0, Math.PI * 2)
      ctx.fillStyle = g2c
      ctx.fill()

      // ── Vignette overlay ──
      const vg = ctx.createRadialGradient(vpX, vpY, w * 0.2, vpX, vpY, w * 0.75)
      vg.addColorStop(0, 'rgba(10, 13, 20, 0)')
      vg.addColorStop(0.7, 'rgba(10, 13, 20, 0.15)')
      vg.addColorStop(1, 'rgba(10, 13, 20, 0.45)')
      ctx.fillStyle = vg
      ctx.fillRect(0, 0, w, h)
    }

    function animate() {
      const w = canvas!.getBoundingClientRect().width
      const h = canvas!.getBoundingClientRect().height
      timeRef.current += 0.008

      const vpX = w * 0.5
      const vpY = h * 0.42

      drawGrid(ctx!, w, h, vpX, vpY, timeRef.current)
      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    />
  )
}
