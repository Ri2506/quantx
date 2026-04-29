'use client'

/**
 * /weekly-review — N10 AI Weekly Portfolio Review (Pro+).
 *
 * Sunday-generated 300-word personal review covering closed trades,
 * open positions, Nifty benchmark, and regime transitions — with
 * a forward-looking suggestion. History of the last 8 weeks is
 * browsable in the right rail.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CalendarDays,
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

import { api, handleApiError } from '@/lib/api'


type Review = Awaited<ReturnType<typeof api.weeklyReview.latest>>


export default function WeeklyReviewPage() {
  const [active, setActive] = useState<Review | null>(null)
  const [history, setHistory] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    try {
      const [latest, hist] = await Promise.all([
        api.weeklyReview.latest().catch(() => null),
        api.weeklyReview.history(8).catch(() => []),
      ])
      setHistory(hist || [])
      setActive(latest || (hist && hist[0]) || null)
      setError(null)
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const regenerate = async () => {
    setRegenerating(true)
    setError(null)
    try {
      const r = await api.weeklyReview.generate()
      setActive(r)
      refresh()
    } catch (err) {
      setError(handleApiError(err))
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-8 space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Weekly Review
            <span className="text-[9px] font-semibold tracking-wider uppercase rounded-full px-2 py-0.5 bg-primary/10 text-primary border border-primary/40">
              Pro
            </span>
          </h1>
          <p className="text-[12px] text-d-text-muted mt-0.5">
            A 300-word read every Sunday on your trades, the regime, and what to tune next.
          </p>
        </div>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-d-border text-[12px] text-white hover:bg-white/[0.03] disabled:opacity-60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
          {regenerating ? 'Generating…' : 'Regenerate this week'}
        </button>
      </header>

      {error && (
        <div className="rounded-md border border-down/40 bg-down/10 px-3 py-2 text-[12px] text-down">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-d-border bg-[#111520] p-6 text-center">
          <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" />
          <p className="text-[12px] text-d-text-muted mt-2">Loading your reviews…</p>
        </div>
      ) : !active ? (
        <EmptyState onGenerate={regenerate} generating={regenerating} />
      ) : (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <ReviewCard r={active} featured />
          </div>
          <aside className="space-y-3">
            <p className="text-[10px] uppercase tracking-wider text-d-text-muted">
              Last {Math.min(history.length, 8)} weeks
            </p>
            {history.length === 0 ? (
              <div className="rounded-lg border border-d-border bg-[#111520] p-4 text-[12px] text-d-text-muted">
                No prior reviews yet.
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((r) => (
                  <button
                    key={r.week_of}
                    onClick={() => setActive(r)}
                    className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      active?.week_of === r.week_of
                        ? 'bg-primary/10 border-primary/40'
                        : 'bg-[#111520] border-d-border hover:border-d-border-hover'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-white">
                        {formatWeek(r.week_of)}
                      </p>
                      <p
                        className="numeric text-[11px] font-semibold"
                        style={{ color: colorFor(r.week_return_pct) }}
                      >
                        {r.week_return_pct != null
                          ? `${r.week_return_pct >= 0 ? '+' : ''}${r.week_return_pct.toFixed(2)}%`
                          : '—'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </aside>
        </section>
      )}

      <p className="text-[10px] text-d-text-muted text-center">
        Reviews regenerate every Sunday at 08:00 IST. Educational — not investment advice.
      </p>
    </div>
  )
}


/* ───────────────────────── components ───────────────────────── */


function ReviewCard({ r, featured = false }: { r: Review; featured?: boolean }) {
  const w = r.week_return_pct
  const nifty = r.nifty_return_pct
  const diff = w != null && nifty != null ? w - nifty : null
  const beat = diff != null && diff > 0

  return (
    <article className="rounded-xl border border-d-border bg-[#111520] overflow-hidden">
      <header className="px-5 py-4 border-b border-d-border flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-d-text-muted flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3" />
            Week of {formatWeek(r.week_of)}
          </p>
          <p className="text-[10px] text-d-text-muted numeric mt-0.5">
            Generated {new Date(r.generated_at).toLocaleString('en-IN', {
              dateStyle: 'medium', timeStyle: 'short',
            })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Stat label="You" value={fmt(w)} accent={colorFor(w)} />
          <Stat label="Nifty" value={fmt(nifty)} accent={colorFor(nifty)} />
          {diff != null && (
            <Stat
              label={beat ? 'Beat by' : 'Trailed by'}
              value={`${Math.abs(diff).toFixed(2)}pts`}
              accent={beat ? '#05B878' : '#FF5947'}
            />
          )}
        </div>
      </header>
      <div className={`px-5 py-5 text-[14px] leading-relaxed text-d-text-primary ${featured ? '' : ''}`}>
        <Markdown source={r.content_markdown} />
      </div>
    </article>
  )
}


/* ───────────────────────── markdown ───────────────────────── */
//
// PR 77 — minimal inline markdown renderer. The weekly-review generator
// prompts Gemini for prose (Step 4 §5.3), but Gemini can still emit ##
// headings, bullets, and **bold** depending on inputs. The page used to
// render the raw text via `whitespace-pre-wrap`, leaving literal `**`
// and `##` visible. We avoid a full markdown dep — handle the four
// patterns the generator actually produces, treat everything else as
// plain text.

function Markdown({ source }: { source: string }) {
  const blocks = splitBlocks(source)
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => renderBlock(b, i))}
    </div>
  )
}


type Block =
  | { kind: 'h2'; text: string }
  | { kind: 'h3'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'para'; text: string }


function splitBlocks(source: string): Block[] {
  const lines = (source || '').split(/\r?\n/)
  const blocks: Block[] = []
  let buf: string[] = []
  let listBuf: string[] | null = null

  const flushPara = () => {
    if (buf.length) {
      blocks.push({ kind: 'para', text: buf.join(' ').trim() })
      buf = []
    }
  }
  const flushList = () => {
    if (listBuf && listBuf.length) {
      blocks.push({ kind: 'list', items: listBuf })
    }
    listBuf = null
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushList()
      continue
    }
    if (/^###\s+/.test(line)) {
      flushPara(); flushList()
      blocks.push({ kind: 'h3', text: line.replace(/^###\s+/, '') })
      continue
    }
    if (/^##\s+/.test(line)) {
      flushPara(); flushList()
      blocks.push({ kind: 'h2', text: line.replace(/^##\s+/, '') })
      continue
    }
    if (/^[-*]\s+/.test(line)) {
      flushPara()
      listBuf ??= []
      listBuf.push(line.replace(/^[-*]\s+/, ''))
      continue
    }
    flushList()
    buf.push(line)
  }
  flushPara()
  flushList()
  return blocks
}


function renderBlock(b: Block, key: number) {
  switch (b.kind) {
    case 'h2':
      return (
        <h3 key={key} className="text-[14px] font-semibold text-white mt-1">
          {renderInline(b.text)}
        </h3>
      )
    case 'h3':
      return (
        <h4 key={key} className="text-[12px] font-semibold uppercase tracking-wider text-d-text-muted mt-1">
          {renderInline(b.text)}
        </h4>
      )
    case 'list':
      return (
        <ul key={key} className="list-disc pl-5 space-y-1 marker:text-d-text-muted">
          {b.items.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>
      )
    case 'para':
      return <p key={key}>{renderInline(b.text)}</p>
  }
}


// Inline: bold + italic + simple. Splits on `**...**` first, then `*...*`
// so we can render both without depending on a full parser.
function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  let rest = text
  let i = 0
  while (rest.length > 0) {
    const boldIdx = rest.indexOf('**')
    const italicIdx = rest.search(/(?<!\*)\*(?!\*)/) // single `*` not part of `**`
    if (boldIdx === -1 && italicIdx === -1) {
      parts.push(rest)
      break
    }
    const useBold = boldIdx !== -1 && (italicIdx === -1 || boldIdx <= italicIdx)
    if (useBold) {
      const close = rest.indexOf('**', boldIdx + 2)
      if (close === -1) { parts.push(rest); break }
      if (boldIdx > 0) parts.push(rest.slice(0, boldIdx))
      parts.push(<strong key={`b-${i++}`} className="text-white">{rest.slice(boldIdx + 2, close)}</strong>)
      rest = rest.slice(close + 2)
    } else {
      const close = rest.slice(italicIdx + 1).search(/(?<!\*)\*(?!\*)/)
      if (close === -1) { parts.push(rest); break }
      const closeAbs = italicIdx + 1 + close
      if (italicIdx > 0) parts.push(rest.slice(0, italicIdx))
      parts.push(<em key={`i-${i++}`}>{rest.slice(italicIdx + 1, closeAbs)}</em>)
      rest = rest.slice(closeAbs + 1)
    }
  }
  return parts
}


function EmptyState({ onGenerate, generating }: { onGenerate: () => void; generating: boolean }) {
  return (
    <div className="rounded-xl border border-d-border bg-[#111520] p-8 text-center space-y-3">
      <TrendingUp className="w-6 h-6 text-primary mx-auto" />
      <p className="text-[14px] font-medium text-white">Your first weekly review is on its way</p>
      <p className="text-[12px] text-d-text-muted max-w-md mx-auto">
        The scheduler generates reviews every Sunday at 08:00 IST.
        You can also generate one right now — useful mid-week.
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="mt-2 inline-flex items-center gap-2 px-5 py-2 bg-primary text-black rounded-md text-[12px] font-semibold hover:bg-primary-hover disabled:opacity-60"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {generating ? 'Generating…' : 'Generate now'}
      </button>
    </div>
  )
}


function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="text-right min-w-[60px]">
      <p className="text-[9px] uppercase tracking-wider text-d-text-muted">{label}</p>
      <p className="numeric text-[13px] font-semibold mt-0.5" style={{ color: accent || '#FFFFFF' }}>
        {value}
      </p>
    </div>
  )
}


/* ───────────────────────── helpers ───────────────────────── */


function fmt(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}


function colorFor(v: number | null | undefined): string {
  if (v == null) return '#8e8e8e'
  if (v > 0) return '#05B878'
  if (v < 0) return '#FF5947'
  return '#DADADA'
}


function formatWeek(isoDate: string): string {
  const start = new Date(isoDate)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sm = start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  const em = end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  return `${sm} – ${em}`
}
