import type { Config } from 'tailwindcss'
import flattenColorPalette from 'tailwindcss/lib/util/flattenColorPalette'

function addVariablesForColors({ addBase, theme }: any) {
  const allColors = flattenColorPalette(theme('colors'))
  const newVars = Object.fromEntries(
    Object.entries(allColors).map(([key, val]) => [`--${key}`, val])
  )

  addBase({
    ':root': newVars,
  })
}

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Deep Space Theme Colors
        background: {
          primary: 'rgb(var(--background-primary) / <alpha-value>)',
          surface: 'rgb(var(--background-surface) / <alpha-value>)',
          elevated: 'rgb(var(--background-elevated) / <alpha-value>)',
        },
        // Deep space specific colors
        space: {
          void: '#04060e',
          deep: '#080c18',
          nebula: '#0c1220',
          star: '#ffffff',
        },
        // Neon accent colors for 2026 fintech
        neon: {
          cyan: '#00e5ff',
          green: '#00ff88',
          purple: '#8b5cf6',
          pink: '#f472b6',
          gold: '#fbbf24',
        },
        // TradingView-inspired palette
        tv: {
          blue: {
            DEFAULT: '#0057FF',
            primary: '#0057FF',
            dark: '#003E8B',
            deeper: '#002F9A',
          },
          green: '#028901',
          red: '#D00D00',
          orange: '#F97C00',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        'primary-dark': 'rgb(var(--primary) / 0.85)',
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        success: 'rgb(var(--success) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
        // Glass colors
        glass: {
          light: 'rgba(255, 255, 255, 0.06)',
          medium: 'rgba(255, 255, 255, 0.1)',
          border: 'rgba(255, 255, 255, 0.08)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1.1' }],
        '6xl': ['3.75rem', { lineHeight: '1.1' }],
        '7xl': ['4.5rem', { lineHeight: '1' }],
        '8xl': ['6rem', { lineHeight: '1' }],
        // TradingView-inspired display sizes with tighter tracking
        'display-sm': ['2.5rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display-md': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['4.5rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
        'display-xl': ['5.5rem', { lineHeight: '0.95', letterSpacing: '-0.03em' }],
      },
      spacing: {
        '0': '0px',
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '7': '28px',
        '8': '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
        '32': '128px',
      },
      backgroundImage: {
        // Deep space gradients
        'gradient-space': 'linear-gradient(180deg, #04060e 0%, #080c18 50%, #0c1220 100%)',
        'gradient-nebula': 'radial-gradient(ellipse 80% 50% at 20% 40%, rgba(0, 229, 255, 0.08) 0%, transparent 50%), radial-gradient(ellipse 60% 80% at 80% 20%, rgba(139, 92, 246, 0.06) 0%, transparent 50%)',
        'gradient-aurora': 'radial-gradient(ellipse 150% 80% at 50% 120%, rgba(0, 229, 255, 0.15) 0%, transparent 50%), radial-gradient(ellipse 100% 60% at 30% -20%, rgba(139, 92, 246, 0.12) 0%, transparent 50%)',
        // Neon gradients
        'gradient-primary': 'linear-gradient(135deg, #00e5ff 0%, #00ff88 100%)',
        'gradient-accent': 'linear-gradient(135deg, #00e5ff 0%, #8b5cf6 100%)',
        'gradient-success': 'linear-gradient(135deg, #00ff88 0%, #22c55e 100%)',
        'gradient-danger': 'linear-gradient(135deg, #ff4757 0%, #ef4444 100%)',
        'gradient-gold': 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        // Glass gradient
        'gradient-glass': 'linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.02) 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'fade-in-up': 'fadeInUp 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'ticker': 'ticker 30s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'grid': 'grid 18s linear infinite',
        'aurora': 'aurora 60s linear infinite',
        'spotlight': 'spotlight 2s ease 0.75s 1 forwards',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease-in-out infinite',
        'starfield': 'starfield 100s linear infinite',
        // 2026 Enhanced Animations
        'mesh': 'meshFlow 20s ease-in-out infinite',
        'blob': 'blobMorph 8s ease-in-out infinite',
        'border-rotate': 'borderRotate 4s linear infinite',
        'shimmer-sweep': 'shimmerSweep 1.5s ease-in-out infinite',
        'slide-up-stagger': 'slideUpStagger 0.5s ease-out forwards',
        'beam-scan': 'beamScan 3s ease-in-out infinite',
        'glow-drift': 'glowDrift 30s ease-in-out infinite',
        'ring-spin': 'ringSpin 2s linear infinite',
        'status-pulse': 'statusPulse 2s ease-in-out infinite',
        'dock-bounce': 'dockBounce 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'number-tick': 'numberTick 0.3s ease-out',
        'reveal-up': 'revealUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'reveal-left': 'revealLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'reveal-right': 'revealRight 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        ticker: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        grid: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(60px)' },
        },
        aurora: {
          from: { backgroundPosition: '50% 50%, 50% 50%' },
          to: { backgroundPosition: '350% 50%, 350% 50%' },
        },
        spotlight: {
          '0%': { opacity: '0', transform: 'translate(-72%, -62%) scale(0.5)' },
          '100%': { opacity: '1', transform: 'translate(-50%, -40%) scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 229, 255, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 229, 255, 0.6)' },
        },
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        starfield: {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-2000px)' },
        },
        // 2026 Enhanced Keyframes
        meshFlow: {
          '0%': { backgroundPosition: '0% 0%' },
          '25%': { backgroundPosition: '50% 25%' },
          '50%': { backgroundPosition: '100% 50%' },
          '75%': { backgroundPosition: '50% 75%' },
          '100%': { backgroundPosition: '0% 0%' },
        },
        blobMorph: {
          '0%, 100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
          '50%': { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%' },
        },
        borderRotate: {
          to: { '--border-angle': '360deg' } as any,
        },
        shimmerSweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        slideUpStagger: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        beamScan: {
          '0%': { left: '-100%', opacity: '0' },
          '10%': { opacity: '1' },
          '90%': { opacity: '1' },
          '100%': { left: '200%', opacity: '0' },
        },
        glowDrift: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(-5%, 8%) scale(1.05)' },
          '66%': { transform: 'translate(3%, -5%) scale(0.95)' },
        },
        ringSpin: {
          to: { transform: 'rotate(360deg)' },
        },
        statusPulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.4)', opacity: '0.7' },
        },
        dockBounce: {
          '0%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-8px)' },
          '100%': { transform: 'translateY(0)' },
        },
        numberTick: {
          '0%': { transform: 'translateY(-100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        revealUp: {
          '0%': { opacity: '0', transform: 'translateY(40px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        revealLeft: {
          '0%': { opacity: '0', transform: 'translateX(40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        revealRight: {
          '0%': { opacity: '0', transform: 'translateX(-40px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
        '2xl': '40px',
      },
      boxShadow: {
        // Glow shadows
        'glow-sm': '0 0 10px rgba(0, 229, 255, 0.3)',
        'glow-md': '0 0 20px rgba(0, 229, 255, 0.4)',
        'glow-lg': '0 0 30px rgba(0, 229, 255, 0.5)',
        'glow-success': '0 0 20px rgba(0, 255, 136, 0.4)',
        'glow-danger': '0 0 20px rgba(255, 71, 87, 0.4)',
        // Glass shadows
        'glass': '0 8px 32px -4px rgba(0, 0, 0, 0.4), inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
        'glass-lg': '0 16px 48px -8px rgba(0, 0, 0, 0.5), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        // Soft elevation
        'soft': '0 4px 24px -1px rgba(0, 0, 0, 0.3)',
        'soft-lg': '0 8px 32px -4px rgba(0, 0, 0, 0.4), 0 16px 64px -8px rgba(0, 0, 0, 0.2)',
        // Inner glow
        'inner-glow': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.05)',
        'inner-glow-lg': 'inset 0 2px 4px 0 rgba(255, 255, 255, 0.06)',
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
    },
  },
  plugins: [addVariablesForColors],
}

export default config
