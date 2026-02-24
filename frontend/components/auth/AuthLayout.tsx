'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { TrendingUp } from 'lucide-react'
import MeshGradientBg from '@/components/ui/MeshGradientBg'

interface AuthLayoutProps {
  children: React.ReactNode
  title?: string
  subtitle?: string
  illustrationVariant?: string
  backgroundImage?: string
}

export default function AuthLayout({
  children,
  title = 'AI-Powered Trading Intelligence',
  subtitle = 'Advanced stock screening and swing trading signals for the Indian market.',
  illustrationVariant = 'data',
  backgroundImage,
}: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex bg-space-void">
      {/* Left side - Branding with mesh gradient + illustration */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        {backgroundImage ? (
          <>
            <Image src={backgroundImage} alt="" fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-space-void/80 via-space-void/40 to-transparent z-[1]" />
            <div className="relative z-10 flex flex-col justify-between h-full p-12">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3">
                <motion.div
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                  className="w-10 h-10 rounded-lg bg-gradient-to-r from-neon-cyan to-neon-green flex items-center justify-center shadow-glow-sm"
                >
                  <TrendingUp className="w-6 h-6 text-space-void" />
                </motion.div>
                <span className="text-2xl font-bold gradient-text-professional">SwingAI</span>
              </Link>

              {/* Content */}
              <div>
                <h1 className="text-4xl font-bold text-text-primary mb-4">{title}</h1>
                <p className="text-lg text-text-secondary max-w-md">{subtitle}</p>
              </div>

              <p className="text-text-secondary text-sm">
                © 2025 SwingAI Technologies. All rights reserved.
              </p>
            </div>
          </>
        ) : (
          <MeshGradientBg intensity="high" withOrbs className="absolute inset-0">
            <div className="relative z-10 flex flex-col justify-between h-full p-12">
              {/* Logo */}
              <Link href="/" className="flex items-center gap-3">
                <motion.div
                  whileHover={{ scale: 1.05, rotate: 5 }}
                  transition={{ type: 'spring', stiffness: 400 }}
                  className="w-10 h-10 rounded-lg bg-gradient-to-r from-neon-cyan to-neon-green flex items-center justify-center shadow-glow-sm"
                >
                  <TrendingUp className="w-6 h-6 text-space-void" />
                </motion.div>
                <span className="text-2xl font-bold gradient-text-professional">SwingAI</span>
              </Link>

              {/* Content */}
              <div>
                <h1 className="text-4xl font-bold text-text-primary mb-4">{title}</h1>
                <p className="text-lg text-text-secondary max-w-md">{subtitle}</p>
              </div>

              <p className="text-text-secondary text-sm">
                © 2025 SwingAI Technologies. All rights reserved.
              </p>
            </div>
          </MeshGradientBg>
        )}
      </div>

      {/* Right side - Auth form */}
      <div className="flex-1 flex items-center justify-center p-8 relative">
        <div className="absolute inset-0 bg-gradient-space" />
        <div className="w-full max-w-md relative z-10">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-neon-cyan to-neon-green flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-space-void" />
            </div>
            <span className="text-2xl font-bold gradient-text-professional">SwingAI</span>
          </div>

          {children}
        </div>
      </div>
    </div>
  )
}
