'use client'

const brands = [
  'Zerodha',
  'Angel One',
  'Upstox',
  'Fyers',
  'NSE',
  'BSE',
  'Groww',
  'ICICI Direct',
]

export default function BrandCarousel() {
  return (
    <section className="border-y border-[#334155]/30 bg-[#0d1017] py-8">
      <p className="mb-6 text-center text-xs font-medium uppercase tracking-widest text-white/30">
        Trusted by traders on India&apos;s top brokers
      </p>
      <div className="relative overflow-hidden mask-edge-fade">
        <div className="flex animate-marquee items-center gap-12 whitespace-nowrap">
          {[...brands, ...brands].map((brand, i) => (
            <span
              key={`${brand}-${i}`}
              className="inline-flex shrink-0 items-center gap-2 text-base font-medium tracking-tight text-white/40 grayscale hover:grayscale-0 opacity-40 hover:opacity-100 transition-all duration-300"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#00F0FF]/40" />
              {brand}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
