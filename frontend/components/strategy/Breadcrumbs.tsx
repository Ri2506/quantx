'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[]
  className?: string
}

export default function Breadcrumbs({ items, className = '' }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex items-center gap-1.5 text-sm">
        {items.map((item, i) => {
          const isLast = i === items.length - 1
          return (
            <li key={i} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-white/30" />}
              {isLast || !item.href ? (
                <span className={isLast ? 'text-white font-medium' : 'text-d-text-muted'}>
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="text-d-text-muted hover:text-white transition-colors"
                >
                  {item.label}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
