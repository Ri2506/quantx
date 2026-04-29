export default function AppBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* L0→L1 depth gradient — 5-layer base */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #0A0D14 0%, #111520 50%, #0A0D14 100%)',
        }}
      />

      {/* Multi-layer ambient glow system */}
      <div className="absolute inset-0 app-bg-glow" />
      <div className="absolute inset-0 app-bg-grid" />

      {/* Breathing ambient orbs — subtler for deeper bg */}
      <div
        className="absolute -top-[200px] -left-[100px] h-[600px] w-[600px] rounded-full opacity-[0.025]"
        style={{
          background: 'radial-gradient(circle, rgba(79, 236, 205, 1) 0%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'ambient-breathe 12s ease-in-out infinite',
        }}
      />
      <div
        className="absolute -bottom-[150px] -right-[100px] h-[500px] w-[500px] rounded-full opacity-[0.018]"
        style={{
          background: 'radial-gradient(circle, rgba(141, 92, 255, 1) 0%, transparent 70%)',
          filter: 'blur(80px)',
          animation: 'ambient-breathe 12s ease-in-out infinite 6s',
        }}
      />

      {/* Subtle vignette for depth */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]" />
    </div>
  )
}
