# SwingAI - Product Requirements Document

## Overview
SwingAI is a SaaS algorithmic swing trading platform for the Indian stock market (NSE). It generates daily trading signals using algorithmic strategies, allows users to view/approve/auto-execute trades via connected brokers, and manages risk through automated position sizing and stop-loss tracking.

## Target Users
Indian retail traders who want algorithmic swing trading signals with optional semi-automatic or fully automatic trade execution via Zerodha, Angel One, or Upstox.

## Subscription Plans (3 Tiers)

| Feature | Free (₹0) | Starter (₹499/mo) | Pro (₹1,499/mo) |
|---------|-----------|-------------------|-----------------|
| Signals/day | 5 | 20 | Unlimited |
| Max positions | 3 | 5 | 15 |
| Trading mode | View only | Semi-auto | Full-auto |
| Equity trading | Yes | Yes | Yes |
| F&O trading | No | No | Yes |
| Notifications | Email | Email + Push | All channels |
| AI credits/day | 5 | Included | Included |
| Priority support | No | No | Yes |
| API access | No | No | Yes |

Payment: Razorpay (UPI, cards, net banking). Billing: monthly, quarterly, yearly.

## Signal Generation Pipeline
1. **15:45 IST (EOD Scan)**: PKScreener filters NSE universe by price, volume, momentum.
2. **6 Algorithmic Strategies** run on filtered stocks: ConsolidationBreakout, TrendPullback, CandleReversal, BOSStructure, ReversalPatterns, VolumeReversal.
3. **Confluence Ranking**: Stocks scored by number of strategies that agree. Entry, stop-loss, and targets computed.
4. **Filters**: Confidence ≥ 65%, Risk:Reward ≥ 1.5:1, long-only equity for beta.
5. **Signals saved** to Supabase for the next trading day.
6. **08:30 IST**: Signals broadcast to users.

ML models (XGBoost, TFT) are optional confirmations — not required for beta.

## Trade Execution Flow
- **Signal-only (Free)**: User views signals, trades manually via their broker.
- **Semi-auto (Starter)**: User approves/rejects each signal. Approved trades execute via connected broker.
- **Full-auto (Pro)**: Trades execute automatically when signals pass confidence threshold.
- **Paper trading**: All users start with 14 days of paper trading before live eligibility.

## Broker Integration
- Zerodha (KiteConnect): OAuth flow + API trading
- Angel One (SmartAPI): Manual credential entry + API trading
- Upstox: OAuth flow + API trading
- Per-user encrypted credentials (Fernet). Composite key: (user_id, broker_name).

## Tech Stack
- Backend: FastAPI + Supabase (Auth + Postgres) + Razorpay
- Frontend: Next.js 14 + Tailwind CSS + Framer Motion
- Market Data: TrueData (real-time) / yfinance (fallback)
- ML: PyTorch, scikit-learn, XGBoost (optional for beta)
- Infrastructure: Railway (backend), Vercel (frontend), Docker

## Design Theme
2026 Fintech Dark Mode:
- Deep space background (#04060e)
- Glassmorphism 2.0 panels with backdrop-blur
- Neon accent colors: Cyan (#00e5ff), Green (#00ff88), Purple (#8b5cf6), Gold (#fbbf24)
- Gradient typography with shimmer effects

## Current Beta Status
- Auth: Supabase email/password + Google OAuth (working)
- Payments: Razorpay integration (working)
- Signals: 6 algorithmic strategies via PKScreener + EOD scanner (working)
- Broker: Per-user connection with encrypted credentials (working)
- Market data: TrueData integration with yfinance fallback (working)
- Trade execution: Paper trading + semi-auto + full-auto (working, needs live broker testing)

## Backlog
### P1 — Beta Launch Blockers
- [ ] Push notification delivery service (FCM/APNs)
- [ ] Live broker sandbox testing (Zerodha/Angel/Upstox)
- [ ] TrueData production credentials

### P2 — Post-Launch
- [ ] WebSocket channel subscriptions for real-time price updates
- [ ] Enhanced AI core (v2 ensemble) integration
- [ ] Kill switch end-to-end testing

### P3 — Future
- [ ] PDF report generation
- [ ] Advanced portfolio analytics
- [ ] Mobile app / PWA
- [ ] Backtesting module

## Last Updated
February 24, 2026
