'use client'

import React from 'react'

interface SkeletonCardProps {
  lines?: number
  className?: string
  showAvatar?: boolean
}

export default function SkeletonCard({ lines = 3, className = '', showAvatar = false }: SkeletonCardProps) {
  return (
    <div className={`glass-card p-5 animate-pulse ${className}`}>
      {showAvatar && (
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-white/5" />
          <div className="flex-1">
            <div className="h-4 bg-white/5 rounded w-24 mb-2" />
            <div className="h-3 bg-white/5 rounded w-16" />
          </div>
        </div>
      )}
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-white/5 rounded mb-3 last:mb-0"
          style={{ width: `${85 - i * 15}%` }}
        />
      ))}
    </div>
  )
}

export function SkeletonChart({ className = '' }: { className?: string }) {
  return (
    <div className={`glass-card p-5 animate-pulse ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="h-5 bg-white/5 rounded w-32" />
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 w-10 bg-white/5 rounded-full" />
          ))}
        </div>
      </div>
      <div className="h-[250px] bg-white/5 rounded-lg" />
    </div>
  )
}
