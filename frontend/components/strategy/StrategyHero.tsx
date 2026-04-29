'use client'

import React from 'react'
import Breadcrumbs from './Breadcrumbs'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface StrategyHeroProps {
  breadcrumb: BreadcrumbItem[]
  title: string
  description: string
  imageSrc?: string
  imageAlt?: string
  learnMoreHref?: string
  children?: React.ReactNode
  className?: string
}

export default function StrategyHero({
  breadcrumb,
  title,
  description,
  learnMoreHref,
  children,
  className = '',
}: StrategyHeroProps) {
  return (
    <div className={`relative w-full overflow-hidden border-b border-d-border ${className}`}>
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-transparent" />
      <div className="aurora-cyan absolute -right-32 -top-32" />
      <div className="aurora-purple absolute -left-20 top-10" />

      <div className="relative mx-auto max-w-7xl px-4 py-6 md:py-10 lg:px-6">
        <Breadcrumbs items={breadcrumb} className="mb-4" />

        <h1 className="mb-3 text-2xl font-bold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">
          {title}
        </h1>

        <p className="mb-4 max-w-lg text-sm leading-relaxed text-d-text-secondary md:text-base">
          {description}
        </p>

        {learnMoreHref && (
          <a
            href={learnMoreHref}
            className="text-sm font-medium text-primary transition-colors hover:text-primary-hover"
          >
            Learn More &rarr;
          </a>
        )}

        {children}
      </div>
    </div>
  )
}
