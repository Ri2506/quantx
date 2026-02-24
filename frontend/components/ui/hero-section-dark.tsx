import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChevronRight } from 'lucide-react'

interface HeroSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string
  subtitle?: {
    regular: string
    gradient: string
  }
  description?: string
  ctaText?: string
  ctaHref?: string
  bottomImage?: {
    light: string
    dark: string
  }
  gridOptions?: {
    angle?: number
    cellSize?: number
    opacity?: number
    lightLineColor?: string
    darkLineColor?: string
  }
}

const RetroGrid = ({
  angle = 65,
  cellSize = 56,
  opacity = 0.35,
  lightLineColor = 'rgb(var(--border) / 0.3)',
  darkLineColor = 'rgb(var(--border) / 0.5)',
}: {
  angle?: number
  cellSize?: number
  opacity?: number
  lightLineColor?: string
  darkLineColor?: string
}) => {
  const gridStyles = {
    '--grid-angle': `${angle}deg`,
    '--cell-size': `${cellSize}px`,
    '--opacity': opacity,
    '--light-line': lightLineColor,
    '--dark-line': darkLineColor,
  } as React.CSSProperties

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden [perspective:200px]',
        'opacity-[var(--opacity)]'
      )}
      style={gridStyles}
    >
      <div className="absolute inset-0 [transform:rotateX(var(--grid-angle))]">
        <div className="animate-grid [background-image:linear-gradient(to_right,var(--light-line)_1px,transparent_0),linear-gradient(to_bottom,var(--light-line)_1px,transparent_0)] [background-repeat:repeat] [background-size:var(--cell-size)_var(--cell-size)] [height:300vh] [inset:0%_0px] [margin-left:-200%] [transform-origin:100%_0_0] [width:600vw] dark:[background-image:linear-gradient(to_right,var(--dark-line)_1px,transparent_0),linear-gradient(to_bottom,var(--dark-line)_1px,transparent_0)]" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background-primary via-background-primary/80 to-transparent to-90%" />
    </div>
  )
}

const HeroSection = React.forwardRef<HTMLDivElement, HeroSectionProps>(
  (
    {
      className,
      title = 'Proprietary Trading Intelligence',
      subtitle = {
        regular: 'Proprietary AI Market Intelligence for ',
        gradient: 'NSE/BSE swing traders.',
      },
      description = 'Our confidential engine scans 500+ Indian stocks every minute, delivering high-conviction swing setups with precise entry, stop-loss, and target levels.',
      ctaText = 'Start 7-Day Free Trial',
      ctaHref = '/signup',
      bottomImage,
      gridOptions,
      ...props
    },
    ref
  ) => {
    return (
      <div className={cn('relative', className)} ref={ref} {...props}>
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_28%_80%_at_50%_-20%,rgb(var(--accent)/0.2),rgb(var(--background-primary)/0))]" />
        <section className="relative mx-auto max-w-full">
          <RetroGrid {...gridOptions} />
          <div className="mx-auto max-w-screen-xl gap-12 px-4 py-28 md:px-8">
            <div className="mx-auto max-w-3xl space-y-5 text-center">
              <h1 className="group mx-auto w-fit rounded-3xl border border-border/60 bg-background-surface/70 px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                {title}
                <ChevronRight className="ml-2 inline h-4 w-4 transition duration-300 group-hover:translate-x-1" />
              </h1>
              <h2 className="mx-auto text-4xl font-semibold tracking-tight text-text-primary md:text-6xl">
                {subtitle.regular}
                <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">
                  {subtitle.gradient}
                </span>
              </h2>
              <p className="mx-auto max-w-2xl text-base text-text-secondary md:text-lg">
                {description}
              </p>
              <div className="flex items-center justify-center gap-x-3">
                <span className="relative inline-block overflow-hidden rounded-full p-[1.5px]">
                  <span className="absolute inset-[-1000%] animate-[spin_2.4s_linear_infinite] bg-[conic-gradient(from_90deg_at_50%_50%,rgb(var(--accent))_0%,rgb(var(--primary))_50%,rgb(var(--accent))_100%)]" />
                  <div className="inline-flex h-full w-full items-center justify-center rounded-full bg-background-surface/90 text-sm font-semibold text-text-primary shadow-[0_0_0_1px_rgb(var(--border)/0.6)] backdrop-blur-3xl">
                    <a
                      href={ctaHref}
                      className="inline-flex w-full items-center justify-center rounded-full border border-border/60 bg-background-primary/30 px-8 py-4 text-center transition hover:bg-background-elevated/70 sm:w-auto"
                    >
                      {ctaText}
                    </a>
                  </div>
                </span>
              </div>
            </div>
            {bottomImage ? (
              <div className="relative z-10 mx-6 mt-20">
                <img
                  src={bottomImage.light}
                  className="w-full rounded-2xl border border-border/60 shadow-[0_24px_80px_rgba(0,0,0,0.2)] dark:hidden"
                  alt="SwingAI platform preview"
                />
                <img
                  src={bottomImage.dark}
                  className="hidden w-full rounded-2xl border border-border/60 shadow-[0_24px_80px_rgba(0,0,0,0.45)] dark:block"
                  alt="SwingAI platform preview"
                />
              </div>
            ) : null}
          </div>
        </section>
      </div>
    )
  }
)
HeroSection.displayName = 'HeroSection'

export { HeroSection }
