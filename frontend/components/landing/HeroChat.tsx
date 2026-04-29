'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowUp,
  BarChart3,
  Brain,
  ScanLine,
  TrendingUp,
  Shield,
  Paperclip,
} from 'lucide-react'

const suggestions = [
  { text: 'Analyze RELIANCE swing setup', icon: ScanLine },
  { text: 'Top breakout stocks today', icon: TrendingUp },
  { text: 'Nifty 50 market outlook', icon: BarChart3 },
  { text: 'Best risk-reward setups', icon: Shield },
  { text: 'AI alpha picks this week', icon: Brain },
]

export default function HeroChat() {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const router = useRouter()

  const handleSubmit = () => {
    if (query.trim()) {
      router.push(`/assistant?q=${encodeURIComponent(query.trim())}`)
    }
  }

  const handleSuggestion = (text: string) => {
    router.push(`/assistant?q=${encodeURIComponent(text)}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-2xl"
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute -inset-20 rounded-full opacity-40 blur-[100px] transition-opacity duration-700"
        style={{
          background: 'radial-gradient(circle, rgba(0,240,255,0.12) 0%, rgba(13,142,214,0.06) 50%, transparent 70%)',
          opacity: focused ? 0.6 : 0.3,
        }}
      />

      {/* Chat container */}
      <div
        className={`relative rounded-2xl border bg-[#0f1219] backdrop-blur-xl transition-all duration-500 ${
          focused
            ? 'border-[#00F0FF]/25 shadow-[0_0_80px_rgba(0,240,255,0.08),0_8px_32px_rgba(0,0,0,0.4)]'
            : 'border-[#1e2433] shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
        }`}
      >
        {/* Input area */}
        <div className="p-4 sm:p-5">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder="What do you want to analyze?"
            rows={2}
            className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-white placeholder:text-white/20 outline-none"
          />

          {/* Bottom bar: attach + send */}
          <div className="mt-3 flex items-center justify-between">
            <button className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-white/20 transition-colors hover:text-white/40">
              <Paperclip className="h-4 w-4" />
            </button>

            <button
              onClick={handleSubmit}
              disabled={!query.trim()}
              className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-300 ${
                query.trim()
                  ? 'bg-[#00F0FF] text-[#0f1219] shadow-[0_0_16px_rgba(0,240,255,0.3)] hover:shadow-[0_0_24px_rgba(0,240,255,0.4)]'
                  : 'bg-white/[0.06] text-white/20'
              }`}
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Suggestion pills — floating below */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="mt-4 flex flex-wrap items-center justify-center gap-2"
      >
        {suggestions.map((s) => (
          <button
            key={s.text}
            onClick={() => handleSuggestion(s.text)}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3.5 py-1.5 text-[13px] text-white/30 backdrop-blur-sm transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white/50"
          >
            <s.icon className="h-3 w-3 opacity-50" />
            {s.text}
          </button>
        ))}
      </motion.div>
    </motion.div>
  )
}
