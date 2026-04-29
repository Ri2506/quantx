'use client'

import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface FAQItem {
  question: string
  answer: string
}

interface FAQAccordionProps {
  items: FAQItem[]
  title?: string
  className?: string
}

export default function FAQAccordion({ items, title = 'Frequently Asked Questions', className = '' }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i)
  }

  return (
    <section className={`mx-auto w-full max-w-3xl ${className}`}>
      <h2 className="mb-8 text-2xl font-bold tracking-tight text-white md:text-3xl">{title}</h2>
      <div className="border-t border-d-border">
        {items.map((item, i) => {
          const isOpen = openIndex === i
          return (
            <div key={i} className="border-b border-d-border">
              <button
                onClick={() => toggle(i)}
                className="group flex w-full cursor-pointer items-center justify-between py-5 text-left"
              >
                <h3 className="flex-1 pr-4 text-sm font-medium text-white transition-colors group-hover:text-primary md:text-base">
                  {item.question}
                </h3>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-d-text-muted transition-transform duration-300 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <p className="pb-5 text-sm leading-relaxed text-d-text-secondary">
                  {item.answer}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
