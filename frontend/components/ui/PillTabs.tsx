'use client'

import React from 'react'

interface Tab {
  label: string
  value: string
}

interface PillTabsProps {
  tabs: Tab[]
  activeTab: string
  onChange: (value: string) => void
  className?: string
  size?: 'sm' | 'md'
}

export default function PillTabs({ tabs, activeTab, onChange, className = '', size = 'md' }: PillTabsProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
  }

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onChange(tab.value)}
          className={`rounded-full font-medium transition-all duration-200 ${sizeClasses[size]} ${
            activeTab === tab.value
              ? 'bg-white/[0.08] text-white'
              : 'text-d-text-muted hover:text-white hover:bg-white/[0.04]'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
