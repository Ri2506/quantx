import Link from 'next/link'
import { Twitter, Linkedin, Youtube, Send, Instagram, Mail } from 'lucide-react'

/* ── Link columns ── */
const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Trading Signals', href: '/signals' },
      { label: 'Momentum Picks', href: '/momentum' },
      { label: 'Scanner Lab', href: '/scanner-lab' },
      { label: 'AI Assistant', href: '/assistant' },
      { label: 'Marketplace', href: '/marketplace' },
      { label: 'SwingMax Signal', href: '/swingmax-signal' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Documentation', href: '#' },
      { label: 'API Reference', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Changelog', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Contact', href: '#' },
      { label: 'Careers', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'Terms of Service', href: '/terms' },
      { label: 'Risk Disclosure', href: '#' },
      { label: 'Refund Policy', href: '#' },
    ],
  },
]

/* ── Social links ── */
const socials = [
  { icon: Twitter, href: '#', label: 'Twitter', color: '#1DA1F2' },
  { icon: Linkedin, href: '#', label: 'LinkedIn', color: '#0A66C2' },
  { icon: Youtube, href: '#', label: 'YouTube', color: '#FF0000' },
  { icon: Send, href: '#', label: 'Telegram', color: '#26A5E4' },
  { icon: Instagram, href: '#', label: 'Instagram', color: '#E4405F' },
  { icon: Mail, href: '#', label: 'Email', color: '#8E8E8E' },
]

export default function Footer() {
  return (
    <footer className="relative overflow-hidden bg-[#0A0D14]">
      {/* ── Gradient arc glow at top ── */}
      <div className="absolute top-0 inset-x-0 h-[350px] pointer-events-none overflow-hidden">
        {/* Bright top border line */}
        <div className="absolute top-0 inset-x-0 h-[2px]" style={{ background: 'linear-gradient(90deg, transparent 5%, #4FECCD 30%, #8D5CFF 50%, #0D8ED6 70%, transparent 95%)' }} />
        {/* Wide arc glow — high opacity */}
        <div className="absolute -top-[80px] left-1/2 -translate-x-1/2 w-[100%] h-[250px]" style={{ background: 'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(79,236,205,0.25) 0%, rgba(13,142,214,0.12) 40%, transparent 70%)' }} />
        {/* Center hot spot */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[50%] h-[120px]" style={{ background: 'radial-gradient(ellipse 80% 100% at 50% 0%, rgba(79,236,205,0.35) 0%, transparent 70%)' }} />
      </div>

      {/* ── SVG dot grid background ── */}
      <div className="footer-grid-bg" />

      {/* ── Main content ── */}
      <div className="relative z-10 mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 lg:px-8">
        {/* ── Top section: Logo/socials + Link columns ── */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-12">
          {/* Left: Brand + Socials */}
          <div className="md:col-span-3">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[#5DCBD8]">
                <span className="text-sm font-bold text-[#0A0D14]">Q</span>
              </div>
              <span className="text-lg font-semibold tracking-tight text-[#DADADA]">
                Quant X
              </span>
            </Link>

            <p className="mt-4 text-sm leading-relaxed text-[#8E8E8E]">
              AI-powered swing trading intelligence for Indian stock markets.
            </p>

            {/* Follow us on */}
            <p className="mt-6 text-xs font-medium text-[#8E8E8E]">Follow us on</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] border border-[#1C1E29] transition-all hover:bg-white/[0.08] hover:border-[#2D303D]"
                >
                  <s.icon className="h-4 w-4" style={{ color: s.color }} />
                </a>
              ))}
            </div>
          </div>

          {/* Right: Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 md:col-span-9">
            {columns.map((col) => (
              <div key={col.title}>
                <h4 className="mb-4 text-sm font-semibold text-[#DADADA]">
                  {col.title}
                </h4>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-sm text-[#8E8E8E] transition-colors hover:text-[#DADADA]"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* ── Exchange links ── */}
        <div className="mt-8 border-t border-[#1C1E29] pt-6">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs text-[#8E8E8E]">
            <span className="font-medium text-[#DADADA]">Important Links:</span>
            <a href="https://www.bseindia.com/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#DADADA]">BSE</a>
            <span className="text-[#2D303D]">|</span>
            <a href="https://www.nseindia.com/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#DADADA]">NSE</a>
            <span className="text-[#2D303D]">|</span>
            <a href="https://www.sebi.gov.in/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#DADADA]">SEBI</a>
            <span className="text-[#2D303D]">|</span>
            <a href="https://www.cdslindia.com/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#DADADA]">CDSL</a>
            <span className="text-[#2D303D]">|</span>
            <a href="https://scores.sebi.gov.in/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-[#DADADA]">SCORES</a>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs text-[#8E8E8E]">
            <span className="font-medium text-[#DADADA]">Important Information:</span>
            <Link href="/terms" className="transition-colors hover:text-[#DADADA]">Terms of Usage</Link>
            <span className="text-[#2D303D]">|</span>
            <Link href="/privacy" className="transition-colors hover:text-[#DADADA]">Privacy Policy</Link>
            <span className="text-[#2D303D]">|</span>
            <Link href="#" className="transition-colors hover:text-[#DADADA]">Risk Disclosure</Link>
            <span className="text-[#2D303D]">|</span>
            <Link href="#" className="transition-colors hover:text-[#DADADA]">Disclaimer</Link>
          </div>
        </div>

        {/* ── Legal / SEBI disclaimer ── */}
        <div className="mt-8 border-t border-[#1C1E29] pt-6">
          <p className="text-xs leading-relaxed text-[#666666]">
            &copy; {new Date().getFullYear()} Quant X. All rights reserved. SEBI Registered Research Analyst.
          </p>
          <p className="mt-3 max-w-4xl text-[11px] leading-[1.7] text-[#666666]">
            Trading and investment in securities market involves substantial risk of loss. Past performance of any strategy or model
            does not guarantee future results or returns. There is no assurance that the objectives of any strategy will be achieved.
            Quant X does not provide investment advice, personalized recommendations, or portfolio management services. Users are
            solely responsible for their investment decisions. All AI-generated signals are for informational purposes only and do
            not constitute buy/sell recommendations. Please read all scheme related documents carefully before investing.
          </p>
          <p className="mt-3 text-[11px] text-[#666666]">
            For any query / feedback / clarification, email at{' '}
            <a href="mailto:support@quantx.in" className="text-primary/80 hover:text-primary transition-colors">
              support@quantx.in
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
