'use client'

interface BackgroundBeamsProps {
  className?: string
}

export default function BackgroundBeams({ className = '' }: BackgroundBeamsProps) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      <svg
        className="absolute h-full w-full"
        viewBox="0 0 1200 800"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path
          d="M-100 600 Q 200 300 500 400 T 1100 200"
          stroke="url(#beam1)"
          strokeWidth="1"
          strokeOpacity="0.4"
          strokeDasharray="8 12"
          className="animate-[beam-dash_8s_linear_infinite]"
        />
        <path
          d="M-50 700 Q 300 400 600 500 T 1200 100"
          stroke="url(#beam2)"
          strokeWidth="0.8"
          strokeOpacity="0.3"
          strokeDasharray="6 14"
          className="animate-[beam-dash_12s_linear_infinite]"
        />
        <path
          d="M100 800 Q 400 350 700 450 T 1300 250"
          stroke="url(#beam3)"
          strokeWidth="0.6"
          strokeOpacity="0.2"
          strokeDasharray="4 16"
          className="animate-[beam-dash_15s_linear_infinite]"
        />
        <path
          d="M-200 500 Q 150 200 450 350 T 1050 50"
          stroke="url(#beam4)"
          strokeWidth="0.5"
          strokeOpacity="0.15"
          strokeDasharray="10 10"
          className="animate-[beam-dash_20s_linear_infinite]"
        />
        <defs>
          <linearGradient id="beam1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4FECCD" stopOpacity="0" />
            <stop offset="50%" stopColor="#4FECCD" stopOpacity="1" />
            <stop offset="100%" stopColor="#4FECCD" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#5DCBD8" stopOpacity="0" />
            <stop offset="50%" stopColor="#5DCBD8" stopOpacity="1" />
            <stop offset="100%" stopColor="#5DCBD8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8D5CFF" stopOpacity="0" />
            <stop offset="50%" stopColor="#8D5CFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#8D5CFF" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="beam4" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#4FECCD" stopOpacity="0" />
            <stop offset="40%" stopColor="#4FECCD" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#8D5CFF" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
      <style jsx>{`
        @keyframes beam-dash {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: -200; }
        }
      `}</style>
    </div>
  )
}
