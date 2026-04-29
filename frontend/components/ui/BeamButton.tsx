'use client'

import React from 'react'
import Link from 'next/link'

interface BeamButtonProps {
  children: React.ReactNode
  href?: string
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  fullWidth?: boolean
}

export default function BeamButton({
  children,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled = false,
  type = 'button',
  fullWidth = false,
}: BeamButtonProps) {
  const sizeClasses = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-7 py-3 text-sm',
    lg: 'px-10 py-4 text-base',
  }

  const variantClasses = {
    primary: 'bg-primary text-black font-semibold hover:bg-primary-hover btn-beam',
    secondary: 'border border-primary text-primary font-semibold hover:bg-primary/10',
    ghost: 'text-white/80 font-medium hover:bg-white/[0.08] hover:text-white',
  }

  const base = `inline-flex items-center justify-center gap-2 rounded-pill transition-all duration-300 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${fullWidth ? 'w-full' : ''} ${className}`

  if (href && !disabled) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    )
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={base}
    >
      {children}
    </button>
  )
}
