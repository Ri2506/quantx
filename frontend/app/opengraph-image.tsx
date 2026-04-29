/**
 * Root OpenGraph image — PR 107 + PR 111 live data
 *
 * Renders the share-card every Twitter / WhatsApp / Slack / LinkedIn
 * crawler picks up when /quantx.app is shared. Programmatic so we
 * don't ship a PNG asset that drifts from the brand colors.
 *
 * PR 111 — fetches the same two public endpoints the landing hero
 * reads (regime + signal-of-the-day) so a share-card during a bull
 * regime with TCS at +3.21% reflects that, instead of repeating the
 * same generic stat strip every time. Cached 10 min so the same
 * card serves every Twitter crawl in a window without hammering
 * the API.
 */

import { ImageResponse } from 'next/og'

export const runtime = 'edge'
// PR 111 — 10-minute cache. Hero data refreshes a few times per
// market session; share-card crawlers (Twitter, WhatsApp, Slack)
// re-fetch every few hours, so this is a safe trade-off between
// freshness and API load.
export const revalidate = 600
export const alt = 'Quant X — AI swing trading intelligence for Indian markets'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'


type LiveData = {
  regime: { name: 'bull' | 'sideways' | 'bear'; conf: number } | null
  signal:
    | { kind: 'active'; symbol: string; direction: string; confidence: number }
    | { kind: 'closed_winner'; symbol: string; direction: string; pct: number }
    | null
}

const REGIME_COLORS: Record<string, string> = {
  bull: '#05B878',
  sideways: '#FEB113',
  bear: '#FF5947',
}


async function fetchLiveData(): Promise<LiveData> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''
  if (!apiUrl) return { regime: null, signal: null }

  // Both endpoints are public + CDN-cached server-side. Edge fetch
  // with a 3s budget so a slow upstream doesn't break OG generation
  // for every Twitter crawl.
  const fetchOpts: RequestInit = {
    headers: { 'Accept': 'application/json' },
    // Edge runtime auto-coalesces; revalidate above bounds re-fetch.
    next: { revalidate: 600 },
  }

  let regime: LiveData['regime'] = null
  let signal: LiveData['signal'] = null

  try {
    const [regRes, sotdRes] = await Promise.all([
      fetch(`${apiUrl}/api/public/regime/history?days=7`, fetchOpts).catch(() => null),
      fetch(`${apiUrl}/api/public/signal-of-the-day`, fetchOpts).catch(() => null),
    ])
    if (regRes?.ok) {
      const data = await regRes.json().catch(() => null)
      const cur = data?.current
      if (cur && typeof cur.regime === 'string') {
        const name = cur.regime.toLowerCase() as 'bull' | 'sideways' | 'bear'
        if (['bull', 'sideways', 'bear'].includes(name)) {
          const probKey = `prob_${name}` as 'prob_bull' | 'prob_sideways' | 'prob_bear'
          regime = { name, conf: Number(cur[probKey] || 0) }
        }
      }
    }
    if (sotdRes?.ok) {
      const data = await sotdRes.json().catch(() => null)
      if (data?.kind === 'active') {
        signal = {
          kind: 'active',
          symbol: String(data.symbol || ''),
          direction: String(data.direction || 'LONG'),
          confidence: Number(data.confidence || 0),
        }
      } else if (data?.kind === 'closed_winner') {
        signal = {
          kind: 'closed_winner',
          symbol: String(data.symbol || ''),
          direction: String(data.direction || 'LONG'),
          pct: Number(data.return_pct || 0),
        }
      }
    }
  } catch {
    // Silent — falls through to static stat strip.
  }

  return { regime, signal }
}


export default async function OgImage() {
  const { regime, signal } = await fetchLiveData()
  const regimeColor = regime ? REGIME_COLORS[regime.name] : '#4FECCD'

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(135deg, #0A0D14 0%, #131722 60%, #0A0D14 100%)',
          color: '#FFFFFF',
          padding: '80px',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Cyan accent blob */}
        <div
          style={{
            position: 'absolute',
            right: '-120px',
            top: '-80px',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(79,236,205,0.18) 0%, transparent 60%)',
          }}
        />
        {/* Purple accent blob */}
        <div
          style={{
            position: 'absolute',
            left: '-100px',
            bottom: '-100px',
            width: '420px',
            height: '420px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(141,92,255,0.14) 0%, transparent 60%)',
          }}
        />

        {/* PR 111 — live regime pill, top-right. Replaces the static
            "NSE-native" header chip when data is available. */}
        {regime && (
          <div
            style={{
              position: 'absolute',
              top: '60px',
              right: '60px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '999px',
              border: `1px solid ${regimeColor}55`,
              background: `${regimeColor}14`,
              color: regimeColor,
              fontSize: '20px',
              fontWeight: 600,
              textTransform: 'capitalize',
              letterSpacing: '-0.01em',
            }}
          >
            <span
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: regimeColor,
                display: 'flex',
              }}
            />
            {regime.name} regime · {Math.round(regime.conf * 100)}%
          </div>
        )}

        {/* Brand chip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #4FECCD 0%, #5DCBD8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              fontWeight: 700,
              color: '#0A0D14',
            }}
          >
            Q
          </div>
          <div
            style={{
              fontSize: '24px',
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            Quant X
          </div>
        </div>

        {/* Headline */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            marginTop: 'auto',
            position: 'relative',
            gap: '24px',
          }}
        >
          <div
            style={{
              fontSize: '78px',
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
            }}
          >
            Institutional AI
          </div>
          <div
            style={{
              fontSize: '78px',
              fontWeight: 600,
              lineHeight: 1.05,
              letterSpacing: '-0.02em',
              color: '#4FECCD',
            }}
          >
            for Indian traders.
          </div>
          <div
            style={{
              fontSize: '24px',
              color: 'rgba(255,255,255,0.65)',
              maxWidth: '900px',
              lineHeight: 1.4,
              marginTop: '8px',
            }}
          >
            Eight proprietary engines · public track record · paper-trade free
          </div>

          {/* PR 111 — bottom strip: live signal-of-the-day chip when
              available, otherwise the original static stat strip. */}
          {signal ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '20px',
                marginTop: '24px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '14px 22px',
                  borderRadius: '14px',
                  border: '1px solid rgba(79,236,205,0.30)',
                  background: 'rgba(79,236,205,0.08)',
                }}
              >
                <div
                  style={{
                    fontSize: '14px',
                    color: 'rgba(255,255,255,0.55)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {signal.kind === 'active' ? 'Top signal today' : 'Best closed · last 7d'}
                </div>
                <div
                  style={{
                    width: '1px',
                    height: '24px',
                    background: 'rgba(255,255,255,0.20)',
                  }}
                />
                <div
                  style={{
                    fontSize: '24px',
                    fontWeight: 600,
                    color: '#FFFFFF',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {signal.symbol}
                </div>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 600,
                    color: signal.direction === 'LONG' ? '#05B878' : '#FF5947',
                    letterSpacing: '0.04em',
                  }}
                >
                  {signal.kind === 'active'
                    ? `${signal.direction} · conf ${signal.confidence}`
                    : `${signal.pct >= 0 ? '+' : ''}${signal.pct.toFixed(2)}% closed`}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: '48px',
                marginTop: '24px',
                alignItems: 'center',
              }}
            >
              <Stat value="NSE" label="NSE-native" accent="#4FECCD" />
              <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.12)' }} />
              <Stat value="3 tiers" label="Free / Pro / Elite" accent="#FFFFFF" />
              <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.12)' }} />
              <Stat value="Public" label="Track record" accent="#5DCBD8" />
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  )
}


function Stat({ value, label, accent }: { value: string; label: string; accent: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ fontSize: '28px', fontWeight: 600, color: accent }}>{value}</div>
      <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}
