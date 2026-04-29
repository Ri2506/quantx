# Step 4 — Full UI/UX Design

> **2026-04-18 override:** Settings → Broker section redesigned per PR 6 — 3 direct-OAuth tiles (Zerodha / Upstox / Angel One), no OpenAlgo. See `memory/project_broker_strategy_2026_04_18.md`.

> Final step of 4. Design specs for every surface in the Swing AI master feature list (Step 1 §5), built on the existing Next.js 14 + Tailwind + Radix + Framer Motion + DM Sans/Mono + TradingView Lightweight Charts stack.
>
> **Locked constraints (from Steps 1-3):**
> - 3 tiers: Free / Pro ₹999 / Elite ₹1,999
> - Mobile deferred (web-only in v1)
> - Gemini 2.0 Flash for all LLM surfaces (Copilot, explanations, digests)
> - OpenAlgo single broker adapter
> - Pattern detection = Scanner Lab standalone (not AI alpha)
> - All 15 research-doc features + 12 synthesis features

---

## 0 — Framing

### Where we are (frontend audit findings, Step 1 §1.3)
- Design system is **cohesive** — DM Sans/Mono, 5-layer depth palette, 30+ keyframe animations, Radix primitives, Lucide icons. Not broken, over-decorated.
- Glassmorphism is **overused** — fine on landing (sells the product), too heavy on data-dense platform pages.
- Stubs: `/signals/[id]`, `/ai-intelligence`, `/my-strategies`, `/marketplace`, `/paper-trading`.
- Missing entirely: `/regime`, `/track-record`, `/models`, `/momentum`, `/sector-rotation`, `/fo-strategies`, `/earnings-calendar`, `/ai-portfolio`, `/auto-trader`, `/portfolio/doctor`, `/scanner-lab`, `/onboarding/risk-quiz`.
- Hero blob animations bleed into inner surfaces where they don't belong.
- Security issues (WebSocket token in URL, permissive CSP) addressed in Step 3.

### Where we go
- **Keep the design vocabulary** (DM Sans/Mono, 5-layer depth, Radix, Framer). Don't rebuild.
- **Trim decoration** from inner pages — glassmorphism/blobs only on landing + pricing.
- **Introduce trust-first surfaces** everywhere (model accuracy tags, track record links, regime banner always visible on dashboard).
- **AI voice = senior analyst.** No chatbot fluff. Dense, numeric, cited.

---

## 1 — Design Language

### The phrase that guides every decision
**"Bloomberg Terminal meets Linear meets Robinhood. Data-dense but calm. Trust-first. Dark-primary."**

- **Bloomberg** → numbers first, monospace, dense readable tables, no wasted pixels
- **Linear** → crisp type, snappy motion, keyboard-first, understated polish
- **Robinhood** → approachable consumer feel, gradient accents only where needed
- **Trust-first** → every AI number has a "how did we get here?" surface within 1 click

### Typography (keep existing, enforce consistently)
- **Primary (body):** DM Sans via `next/font` — 14px base, 16px on landing. Weights 400/500/600/700.
- **Numeric (critical — currently inconsistent):** DM Mono — every price, percentage, ratio, confidence, P&L, quantity renders in DM Mono. Zero exceptions. This is the single biggest visual upgrade we need.
- **Display:** DM Sans 600 at 40-64px for landing heroes + section headers. `letter-spacing: -0.02em`.
- **Utility sizes:**
  - caption: 11px / 1.4
  - body-sm: 13px / 1.5
  - body: 14px / 1.5
  - body-lg: 16px / 1.5
  - h3: 18px / 1.4 / 600
  - h2: 22px / 1.3 / 600
  - h1: 28px / 1.25 / 600
  - display: 40-64px / 1.1 / 600

### Color tokens (keep existing 5-layer depth, add semantic tokens)

Existing palette (from `tailwind.config.ts` + `globals.css`):
- L0 main: `#0A0D14` — body
- L1 wrap: `#111520` — card surface
- L2 hover: `#1C1E29` — elevated hover
- L3 line: `#2D303D` — border
- L4 wrap-line: `#43475B` — emphasized border
- Text: `#DADADA / #8E8E8E / #666666`
- Primary: `#4FECCD` (cyan-teal)
- Up: `#05B878` · Down: `#FF5947` · Warning: `#FEB113` · Orange: `#FF9900`

New semantic tokens (add to `tailwind.config.ts`):
- `surface-trading` = `#111520` with `border: 1px solid #2D303D` — replaces glass-card on all platform inner pages
- `surface-elevated` = `#1C1E29` — hover + modals
- `surface-muted` = `rgba(255,255,255,0.02)` — sparklines background, subtle section dividers
- `tier-free` = `#8E8E8E` · `tier-pro` = `#4FECCD` · `tier-elite` = linear-gradient 135deg #FFD166 to #FF9900 — tier badges across app
- `model-tft` = `#5DCBD8` · `model-qlib` = `#8D5CFF` · `model-lstm` = `#FEB113` · `model-finbert` = `#00E5CC` · `model-hmm` = `#FF9900` · `model-chronos` = `#E0B0FF` — model identity colors for consensus chips
- `regime-bull` = `#05B878` · `regime-sideways` = `#FEB113` · `regime-bear` = `#FF5947`

### Spacing + sizing (keep Tailwind defaults, add rules)
- 4/8/16/24/32/48/64 rhythm. Never 6, 10, 14.
- Cards: `p-5` on desktop (20px), `p-4` on tablet.
- Data tables: row height 44px, `px-4` cell padding, `py-0` vertical (centered via flex).
- Icon-only buttons: 32×32 min (tap target).

### Motion (keep Framer Motion, strip decoration)

**What moves, and why:**
- New signal arrives → slides in from right, 300ms `easeOut`. Subtle glow on new card for 1.5s then settles.
- Price tick updates → number pulse 200ms (scale 1 → 1.05 → 1) + color flash (up/down).
- Tab switch → content cross-fade 200ms.
- Regime banner change (bull → bear) → morph transition 600ms with color sweep.
- Modal enter → scale from 0.96 → 1 + fade, 250ms, `easeOut`.
- Sidebar collapse → 200ms width transition.
- Copilot panel slide → 300ms from right.

**What doesn't move:**
- Landing page blobs/mesh — **stay on landing only**.
- Decorative shimmer on data tables — remove (reads as "still loading" even when loaded).
- Hover card tilts — remove (tacky on data-dense surfaces).

### AI voice (across all copy)

Write like a senior analyst, not a chatbot:
- ✅ "TCS: pattern + TFT + LGBM all bullish. Last 30d WR for this pattern + ML combo: 61% on 47 signals."
- ❌ "Looks like a great opportunity! Our AI thinks you should consider buying TCS."
- ✅ "Regime shifted to Sideways at 11:32. Bear-sizing new entries to 50%."
- ❌ "Hey, just a heads up — markets seem choppy today!"

No emoji in critical UI. No "let me help you" preambles from Copilot. Numbers first, narrative second.

---

## 2 — Component Library

### Keep from existing (audit confirmed solid)

- `AppLayout` (5-pillar nav) — keep, update pillars per Step 1 master feature list
- `SignalCard`, `RegimeBanner`, `AIPerformanceWidget`, `EquityCurve`, `PerformanceMetrics`, `QuickTrade` modal, `ConfidenceMeter`, `ModelScoreBadge`, `RiskGauge`, `PnLChart`
- `AdvancedStockChart` (TradingView Lightweight)
- `MarketTicker`, `NotificationBell`, `BentoGrid`, `ScrollReveal`
- `SkeletonCard`, `SpotTooltip`, `PillTabs`
- All 80 `ui/` shadcn primitives

### Upgrade (breaking changes to existing components)

- **`SignalCard`** — add `ModelConsensusChips` row showing TFT/Qlib/LSTM/FinBERT/HMM votes. Swap glass-card for `surface-trading`. Make all numbers DM Mono. Add "30d WR for this pattern" badge.
- **`RegimeBanner`** — always visible on dashboard top strip. Becomes active (shapes signals), not decorative. Click → opens `/regime` public page.
- **`ConfidenceMeter`** — radial now, upgrade to horizontal bar with model-contribution segments (hovering shows "TFT contributed +15, Qlib +12, FinBERT +8").
- **`AdvancedStockChart`** — add overlay layers: TFT quantile band, detected pattern (if Scanner Lab hits), regime shading as background.
- **`EquityCurve`** — add Nifty 50 benchmark line toggle. Drawdown subplot below main chart.

### New components (build in Step 3 migration work)

- **`ModelConsensusChips`** — horizontal chip row, 3 sizes (sm for cards, md for lists, lg for detail page). Each chip: model color + icon + vote (✓/✗) + score.
- **`ModelConsensusGrid`** — 4-column grid on signal detail, one card per voting model. Each card: model name, current score, last-30d accuracy, one-line prediction.
- **`TierBadge`** — Free/Pro/Elite pill. Used on feature gates + pricing + user profile.
- **`AICopilotPanel`** — persistent right-side slide-out. Context-aware (reads current route + selected signal/stock/portfolio).
- **`TrackRecordSparkline`** — 30-day per-model WR line, tiny (100×30px), embedded on signal cards.
- **`RegimeBadge`** — small inline variant of `RegimeBanner` for headers.
- **`SentimentChip`** — FinBERT score as colored pill (red-amber-green gradient).
- **`DebateTranscript`** — TradingAgents Bull/Bear/Risk/Trader display. Collapsible per agent.
- **`ExplanationMarkdown`** — Gemini-generated signal explanation render with numeric-slot highlighting (TFT +2.1% renders in `model-tft` color).
- **`KillSwitchButton`** — red "PAUSE ALL" floating action on dashboard when auto-trader active.
- **`OpenAlgoStatus`** — connection health pill for settings page.
- **`PaperLeagueLeaderboard`** — anonymized weekly standings with user's position highlighted.
- **`ModelAccuracyCard`** — model name + 7/30/90d WR + trend sparkline. Used on `/models` public page.
- **`SignalConsensusSparkline`** — chip row showing which models agreed over last N signals (positional dots).
- **`GemiVoicePanel`** — panel explaining a signal using Gemini CoT output, with structured subsections (What AI sees / Why now / What invalidates).

### Delete (dilutes the brand)

- `HeroChat` and `FloatingChat` on landing — replace with a single landing hero (see §4.1).
- `/tools` page + `CalculatorModal` — scoped out of master feature list.
- Random glass effect overlays on inner platform pages.

---

## 3 — Navigation + Layout Shell

### App shell anatomy (logged-in)

```
┌────────────────────────────────────────────────────────────────────────┐
│ TopStrip: Logo · Regime banner · Nifty ticker · Search · Bell · Avatar │
├──────────┬─────────────────────────────────────────────┬───────────────┤
│          │                                             │               │
│ Sidebar  │ Main content area                           │ Copilot       │
│ (5       │                                             │ panel         │
│  pillars)│                                             │ (collapsed    │
│          │                                             │  by default,  │
│ Cmd+K    │                                             │  slide from   │
│ search   │                                             │  right)       │
│          │                                             │               │
├──────────┴─────────────────────────────────────────────┴───────────────┤
│ Bottom: connection status · kill switch (if auto-trader) · tier badge  │
└────────────────────────────────────────────────────────────────────────┘
```

### Sidebar — 5 pillars (replaces existing nav)

| Pillar | Routes | Icon |
|---|---|---|
| **1. Command Center** | `/dashboard` (home), `/watchlist`, `/notifications` | `LayoutDashboard` |
| **2. Signals & Alpha** | `/swingmax-signal`, `/signals/[id]`, `/momentum`, `/sector-rotation`, `/earnings-calendar` | `TrendingUp` |
| **3. Scanner Lab** | `/scanner-lab` (Screeners + Patterns tabs) | `Radar` |
| **4. Portfolio & Trading** | `/portfolio` (includes merged /trades), `/paper-trading`, `/portfolio/doctor`, `/stock/[symbol]` | `Briefcase` |
| **5. AI Automation (Elite)** | `/auto-trader`, `/ai-portfolio`, `/fo-strategies`, `/marketplace`, `/my-strategies` | `Sparkles` |

Settings + Admin accessed via avatar menu, not sidebar.

Sidebar collapses to icon-only on <1280px. Bottom pinned section: "AI Copilot" toggle + user avatar.

### Copilot panel (right side, always accessible)

- Collapsed: 48px wide rail with Copilot icon.
- Expanded: 400px panel with chat interface.
- Context-aware — knows current route, selected entity (signal id, stock symbol, trade id).
- Keyboard shortcut: `⌘/` (Mac) or `Ctrl+/` (Win) to toggle.
- Tier-gated message counter shown in footer (Free 5/day remaining).

### Command palette (`Cmd+K`)

- Search: any route name, any stock symbol, any signal id, any setting.
- AI intent detection: "show me regime history" → deep-link to `/regime`; "buy RELIANCE" → opens QuickTrade modal pre-filled.
- Keyboard-first power-user shortcut.

---

## 4 — Page-by-page wireframes

All layouts assume desktop 1440px. Mobile versions documented in §8.

### 4.1 Landing `/` (public, acquisition)

**Purpose:** convert visitor → signup in <30 seconds, using live trust surfaces.

```
┌─────────────────────────────────────────────────────────────────────┐
│ LightNavbar: Logo · How it works · Pricing · Track record · Sign in │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│    HERO                                                              │
│    ┌──────────────────────┬──────────────────────────────────────┐  │
│    │ Headline (display):  │ LIVE WIDGET                          │  │
│    │ "10 AI models        │ ┌────────────────────────────────┐   │  │
│    │  trade NSE for you.  │ │ Regime: BULL (87% confidence)  │   │  │
│    │  You see every       │ │ Nifty 50: 22,450 +0.6%         │   │  │
│    │  number."            │ │ VIX: 14.2                      │   │  │
│    │                      │ │ ─────────────────────────────  │   │  │
│    │ Sub: "Transparent    │ │ Top signal today (live):       │   │  │
│    │ AI trading signals   │ │ TCS · Entry 3,420 · +4.4%      │   │  │
│    │ for Indian markets.  │ │ [TFT ✓] [Qlib ✓] [FinBERT ✓]   │   │  │
│    │ Paper trade free."   │ │ Confidence 74%                 │   │  │
│    │                      │ │ Last 30d this pattern: 61% WR  │   │  │
│    │ [Start free]         │ └────────────────────────────────┘   │  │
│    │ [See track record →] │ (updates every minute, real data)    │  │
│    └──────────────────────┴──────────────────────────────────────┘  │
│                                                                      │
│ Animated mesh-gradient BG (keep existing — sells the product)        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│    TRUST STRIP                                                       │
│    ┌────────┬────────┬────────┬────────┬────────┐                   │
│    │ 10 AI  │ Nifty  │ Every  │ Paper  │ India  │                   │
│    │ models │ 500    │ signal │ trade  │ VIX +  │                   │
│    │ voting │ universe│explained│ free  │regime │                   │
│    └────────┴────────┴────────┴────────┴────────┘                   │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│    HOW IT WORKS — 3 steps with real screenshots                     │
│    1. Paper trade with ₹10L virtual for 30 days                     │
│    2. See which signals hit, which missed (full track record)       │
│    3. Upgrade → auto-trade via OpenAlgo on your broker              │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│    SOCIAL PROOF — live track record strip                           │
│    "Last 30 days: 127 closed signals · 58% WR · +2.3% avg           │
│     (live updating, not backtested, receipts on /track-record)"     │
│    [Small mini-chart: equity curve of paper portfolio median user]   │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│    AI MODELS — bento grid of 10 model cards                         │
│    Each card: model name, icon, 1-line purpose, current live WR     │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│    PRICING PREVIEW — 3 tiers side-by-side (see §4.6)                │
├─────────────────────────────────────────────────────────────────────┤
│    Footer                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Principles:**
- Hero widget is LIVE — pulls from `/api/market/regime-public` + `/api/ai-performance` every 60s. Shows there's a real working product, not a mockup.
- One clear CTA: "Start free" → signup. Secondary: "See track record" → public page.
- No hero chat (current landing has `HeroChat` + `FloatingChat` — remove. Distracts.)

### 4.2 Public `/regime` (F8 + N3 trust)

**Purpose:** show AI's market read, publicly. SEO + social-proof page.

```
┌─────────────────────────────────────────────────────────┐
│ Navbar (light, public)                                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  CURRENT REGIME                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ BULL (87% confidence)                           │    │
│  │ detected 2026-04-18 · 08:15 IST                 │    │
│  │                                                 │    │
│  │ Probabilities:                                  │    │
│  │   Bull      ██████████████████░░  87%          │    │
│  │   Sideways  ███░░░░░░░░░░░░░░░░░  10%          │    │
│  │   Bear      █░░░░░░░░░░░░░░░░░░░   3%          │    │
│  │                                                 │    │
│  │ Macro covariates (Chronos-2):                   │    │
│  │   India VIX: 14.2   ↓                          │    │
│  │   FII 7d net: +₹8,420 Cr                       │    │
│  │   US 10Y: 4.2%      →                          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  90-DAY REGIME TIMELINE                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Nifty 50 chart with regime-colored background   │    │
│  │ (green=bull, amber=sideways, red=bear stripes)  │    │
│  │ X-axis: last 90 days                            │    │
│  │ Markers: last 5 regime transitions              │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  LAST REGIME CHANGES DETECTED                           │
│  ┌─────────────────────────────────────────────────┐    │
│  │ Date        From → To         How AI reacted   │    │
│  │ 2026-04-02  Bull → Sideways   Cut new entries  │    │
│  │ 2026-03-14  Sideways → Bull   Full exposure    │    │
│  │ 2026-02-28  Bear → Sideways   Resumed signals  │    │
│  │ ...                                             │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  WHAT THIS MEANS FOR YOUR TRADING                       │
│  (Gemini-generated plain-English 200-word explainer,    │
│   regenerated weekly by N10 job)                        │
│                                                         │
│  [Sign up free to trade in this regime →]               │
└─────────────────────────────────────────────────────────┘
```

Public, cached 5 min. Shareable OG image = the live banner + timeline snippet.

### 4.3 Public `/track-record` (N3)

**Purpose:** "here's every signal we've ever published, with real P&L. Wins AND losses."

```
┌─────────────────────────────────────────────────────────┐
│ Hero: "Every closed signal, last 90 days"               │
│ Big numbers:                                            │
│   58% win rate · 127 signals · +2.3% avg · ₹Nil fees    │
│   (real paper-traded results, not backtests)            │
├─────────────────────────────────────────────────────────┤
│ Filter bar: Timeframe · Sector · Signal type · Direction│
├─────────────────────────────────────────────────────────┤
│ Signals table (infinite scroll):                        │
│ Symbol │ Entry │ Exit │ Days │ P&L% │ Models │ Why closed│
│ TCS    │ 3420  │ 3580 │ 6    │ +4.7 │ TFT✓Q✓│ target    │
│ INFY   │ 1820  │ 1745 │ 9    │ -4.1 │ TFT✓L✗│ stop loss │
│ ...    │       │      │      │      │       │           │
├─────────────────────────────────────────────────────────┤
│ Per-model breakdown cards (small):                      │
│ TFT   58% · Qlib 62% · LSTM 54% · FinBERT 67%           │
│ (click any → /models deep dive)                         │
└─────────────────────────────────────────────────────────┘
```

Publicly indexable. This is the social proof moat.

### 4.4 Public `/models` (N4 Model Transparency)

**Purpose:** every model's live accuracy per timeframe. Nobody in Indian retail fintech ships this.

```
┌─────────────────────────────────────────────────────────┐
│ Title: "How each AI model is performing, live"         │
├─────────────────────────────────────────────────────────┤
│ 10 cards in a grid (one per model):                    │
│                                                         │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│ │ TFT (swing) │ │ Qlib Alpha  │ │ LSTM (intra)│        │
│ │             │ │             │ │             │        │
│ │ 7d  62% WR  │ │ 7d  58% IC  │ │ 7d  61% dir │        │
│ │ 30d 58% WR  │ │ 30d 0.057   │ │ 30d 57% dir │        │
│ │ 90d 55% WR  │ │ 90d 0.049   │ │ 90d 58% dir │        │
│ │             │ │             │ │             │        │
│ │ 〰〰〰〰〰 │ │ 〰〰〰〰〰 │ │ 〰〰〰〰〰 │        │
│ │  sparkline  │ │  sparkline  │ │  sparkline  │        │
│ │             │ │             │ │             │        │
│ │ Last trained│ │ Last trained│ │ Last trained│        │
│ │  2026-04-07 │ │  2026-04-18 │ │  2026-04-15 │        │
│ └─────────────┘ └─────────────┘ └─────────────┘        │
│ + 7 more                                                │
├─────────────────────────────────────────────────────────┤
│ METHODOLOGY NOTE (short):                               │
│ Models evaluated on out-of-sample signals, walk-forward │
│ with 0.15% transaction cost. See validate_patterns.py   │
│ on GitHub for full backtest protocol.                   │
└─────────────────────────────────────────────────────────┘
```

### 4.5 Public `/pricing`

3 tiers side-by-side. Feature matrix below.

```
┌─────────────────────────────────────────────────────────────────┐
│ 3 tier cards                                                    │
│ ┌───────────┬───────────────┬───────────────────────────┐       │
│ │  FREE     │  PRO ₹999/mo  │  ELITE ₹1,999/mo          │       │
│ │           │  ⭐ Popular    │  🏆 Auto-trading          │       │
│ │           │                │                           │       │
│ │ 1 signal  │ Unlimited      │ Everything in Pro +       │       │
│ │ /day      │ signals        │                           │       │
│ │ Paper     │ Intraday (F1)  │ Auto-Trader (FinRL-X)     │       │
│ │ trading   │ Momentum (F3)  │ AI SIP (F5)              │       │
│ │ Regime    │ Scanner Lab    │ F&O strategies (F6)      │       │
│ │ Model     │ Gemini Copilot │ TradingAgents debate      │       │
│ │ stats     │ Portfolio Dr.  │ Marketplace publish       │       │
│ │           │ Telegram digest│ Unlimited AI Copilot      │       │
│ │           │ Weekly review  │ Priority support          │       │
│ │           │                │                           │       │
│ │ [Start]   │ [Upgrade]      │ [Upgrade]                 │       │
│ └───────────┴───────────────┴───────────────────────────┘       │
│                                                                  │
│ Detailed feature matrix (all 27 features from Step 1 §5)        │
│ in 3-column table below.                                         │
└─────────────────────────────────────────────────────────────────┘
```

### 4.6 Auth flows (`/login`, `/signup`, `/forgot-password`, `/verify-email`)

Keep existing `AuthLayout` wrapper. Polish:
- Left 40%: glass-card with form.
- Right 60%: subtle animated chart visualization or testimonial rotator.
- No hero blobs — distracts from form focus.

Signup adds:
- Google OAuth button first (dominant path).
- Email/password secondary.
- Accepts terms + disclaimers inline ("not investment advice" structural, not hidden).

### 4.7 Onboarding `/onboarding/risk-quiz` (N5)

**First-time user flow after signup:**

```
Step 1 of 5: What's your goal?
  [ ] Beat inflation (long-term)
  [ ] Build wealth steadily
  [ ] Make monthly income
  [ ] Recover past losses
  [ ] Learn before trading

Step 2 of 5: How much capital can you deploy?
  Slider: ₹5K ──●─────── ₹1Cr

Step 3 of 5: How would you react to a 20% drawdown?
  [ ] Sell everything
  [ ] Reduce exposure
  [ ] Hold and wait
  [ ] Buy the dip

Step 4 of 5: How much time can you spend per day?
  [ ] Zero — automate it
  [ ] 15 min evening review
  [ ] 1 hour daily
  [ ] Multiple hours

Step 5 of 5: Your AI-recommended setup:
  Risk profile: Balanced
  Suggested tier: Pro ₹999
  Initial paper portfolio: ₹10L
  First focus: Swing signals (F2) + Paper trading (F11)
  [ Start paper trading → ]
```

Stores answers in `user_profiles.risk_profile` + used by `SignalGenerator` to filter which signals surface by default.

### 4.8 `/dashboard` (C1 — home, logged-in)

Central command. Most-visited page. Has to land hard.

```
┌────────────────────────────────────────────────────────────────────────┐
│ Top: Regime banner (always visible, color-coded, click → /regime)      │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ QUICK STATS ROW (4 cards)                                              │
│ ┌─────────┬─────────┬─────────┬─────────┐                              │
│ │ Paper   │ Today's │ Live    │ Pending │                              │
│ │ portfolio│ signals │ positions│ trades │                              │
│ │ +2.1%   │ 7 new   │ 3 open  │ 2 auto  │                              │
│ └─────────┴─────────┴─────────┴─────────┘                              │
│                                                                         │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ MAIN GRID (2 cols on desktop)                                          │
│ ┌──────────────────────┬──────────────────────┐                        │
│ │ TODAY'S SIGNALS (top │ YOUR POSITIONS       │                        │
│ │ 3, all tiers see 1,  │ (live P&L, per-row   │                        │
│ │ Pro sees all)        │ quick-close)         │                        │
│ │                      │                      │                        │
│ │ [SignalCard × 3-N]   │ [PositionRow × N]    │                        │
│ │                      │                      │                        │
│ │ See all signals →    │ Manage portfolio →   │                        │
│ ├──────────────────────┼──────────────────────┤                        │
│ │ WATCHLIST            │ RECENT AI NOTES      │                        │
│ │ (user's symbols +    │ (AI Copilot recent   │                        │
│ │ regime-aware alerts) │ insights, closed     │                        │
│ │                      │ trade post-mortems)  │                        │
│ └──────────────────────┴──────────────────────┘                        │
│                                                                         │
├────────────────────────────────────────────────────────────────────────┤
│ EQUITY CURVE + PERFORMANCE METRICS                                      │
│ (Recharts area chart with Nifty 50 benchmark overlay)                  │
└────────────────────────────────────────────────────────────────────────┘

Right side: AI Copilot rail (collapsed by default)
```

**Free tier:** same layout but with upgrade CTAs in place of Pro-only widgets.

**New signal arrives:** SignalCard slides in from right top with regime-colored glow for 1.5s. If `auto-trader enabled`, fade in badge "Auto-trader executing..." with progress.

### 4.9 `/swingmax-signal` (C2 signals list, F2)

```
┌────────────────────────────────────────────────────────────────────────┐
│ Title: "AI Swing Signals" + regime badge                               │
│ Filter bar: timeframe · sector · min confidence · model consensus     │
├────────────────────────────────────────────────────────────────────────┤
│ TABS: Active (12) │ Closed (today: 4) │ Historical                    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ Signal cards stacked:                                                  │
│ ┌──────────────────────────────────────────────────────────────────┐   │
│ │ TCS · INFY · Bull Flag breakout                   conf ██████ 74%│   │
│ │ Entry ₹3,420   Target ₹3,560 (+4.1%)   Stop ₹3,390 (-0.9%)     │   │
│ │ [TFT +2.1% ✓] [Qlib rank 92 ✓] [LSTM 0.68] [FinBERT +0.4] [Bull]│   │
│ │ Last 30d this pattern: 61% WR on 47 signals                     │   │
│ │ "Pattern + model consensus. FII buying banking 3 weeks..."      │   │
│ │                               [View details] [Add to paper]    │   │
│ └──────────────────────────────────────────────────────────────────┘   │
│ ... more cards                                                         │
└────────────────────────────────────────────────────────────────────────┘
```

Each card: symbol → bold DM Sans, numbers → DM Mono, models → color-coded chips.

### 4.10 `/signals/[id]` (flagship detail page — currently STUB)

This page is where trust is won or lost. Give it love.

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Back to signals · Symbol · Date · Status pill (Active/Target Hit/Stop)  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ TOP STRIP                                                               │
│ TCS · Tata Consultancy Services                                        │
│ Pattern detected: Bull Flag   ·   Generated: 2026-04-18 15:45 IST      │
│ Regime at entry: Bull (87% confidence)                                  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ CHART (75% width, TradingView Lightweight)                              │
│ - 6-month candles                                                       │
│ - Pattern overlay (if detected by Scanner Lab)                          │
│ - Entry / Target / Stop horizontal lines                                │
│ - TFT quantile band (shaded area for P10-P90)                          │
│                                                                          │
│ Side panel (25%): ENTRY DETAILS                                         │
│   Entry:  ₹3,420                                                        │
│   Target: ₹3,560 (+4.1%)                                                │
│   Stop:   ₹3,390 (-0.9%)                                                │
│   Hold:   5-8 days                                                      │
│   R:R:    4.6:1                                                         │
│   [Add to paper portfolio]                                              │
│   [Execute live (Pro)]                                                  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ MODEL CONSENSUS GRID (4 columns)                                        │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐            │
│ │ TFT        │ │ Qlib Alpha │ │ LSTM       │ │ FinBERT    │            │
│ │ (swing)    │ │ (cross-sec)│ │ (intraday) │ │ (sentiment)│            │
│ │            │ │            │ │            │ │            │            │
│ │ P50: +2.1% │ │ Rank: 92   │ │ Prob: 0.68 │ │ Score: +0.4│            │
│ │ P10: +0.3% │ │ (top 8%)   │ │ (bullish)  │ │ (positive) │            │
│ │ P90: +4.0% │ │            │ │            │ │            │            │
│ │            │ │            │ │            │ │            │            │
│ │ 30d acc    │ │ 30d IC     │ │ 30d dir    │ │ 30d WR     │            │
│ │ 58%        │ │ 0.057      │ │ 57%        │ │ 67%        │            │
│ │            │ │            │ │            │ │            │            │
│ │ ✓ Bullish  │ │ ✓ Bullish  │ │ ✓ Bullish  │ │ ✓ Positive │            │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘            │
│                                                                          │
│ MODEL CONSENSUS: 4/4 bullish. Regime gate passed.                       │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ WHY AI LIKES THIS TRADE (Gemini-generated, 3 paragraphs)                │
│                                                                          │
│ What the AI sees: [narrative 1]                                         │
│ Why this setup is favorable now: [narrative 2]                          │
│ What would invalidate this trade: [narrative 3]                         │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ SIMILAR HISTORICAL SETUPS (5 past signals same pattern + similar models)│
│ Clickable rows → past signal's closed P&L                               │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ [Elite only] DEBATE TRANSCRIPT (TradingAgents B1)                       │
│ ┌────────────────┬────────────────┐                                     │
│ │ BULL case      │ BEAR case      │                                     │
│ │ [3 paras]      │ [3 paras]      │                                     │
│ └────────────────┴────────────────┘                                     │
│ Risk Manager: [allocation recommendation]                                │
│ Trader: [final stance]                                                  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ [FinAgent Vision (B2)] — CHART READ BY AI                              │
│ "Gemini looked at your chart image and says: ..."                      │
│ (Pro: on high-confidence signals. Elite: on-demand.)                    │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ Disclaimer: Educational tool. Not investment advice. Past performance   │
│             does not indicate future returns.                           │
└─────────────────────────────────────────────────────────────────────────┘
```

This page is the heart of the product. If users trust this, they convert.

### 4.11 `/paper-trading` (C10 + N6 F11 upgraded)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Top: Paper portfolio value · today's P&L · week P&L · month P&L        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ EQUITY CURVE (big, hero)                                                │
│ - Your curve vs Nifty 50 benchmark                                      │
│ - Max drawdown shaded                                                   │
│ - Period selector: 1W / 1M / 3M / ALL                                  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 3 TABS                                                                  │
│ ┌──────────┬──────────┬──────────┐                                     │
│ │ Open     │ Closed   │ League   │                                     │
│ │ positions│ trades   │ (weekly) │                                     │
│ └──────────┴──────────┴──────────┘                                     │
│                                                                          │
│ OPEN POSITIONS (rows, with live price + P&L + close button)             │
│                                                                          │
│ CLOSED TRADES (rows + Gemini 2-sentence post-mortem on each)            │
│ "TCS hit target in 6 days. Pattern + TFT + LGBM agreed. Sentiment      │
│  turned positive day 2. +4.7% realized."                                │
│                                                                          │
│ PAPER LEAGUE (anonymized weekly leaderboard, Pro+)                      │
│ 1. @trader_2841   +12.4% this week                                      │
│ 2. You            +8.1%                                                 │
│ 3. @trader_8920   +7.3%                                                 │
│ (Weekly reset Monday 00:00 IST. Achievements unlocked this week: 🏅×3)  │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ ACHIEVEMENTS STRIP (subtle, bottom)                                     │
│ 🏆 First profitable week · 🎯 5/5 swing signals hit · ...               │
└─────────────────────────────────────────────────────────────────────────┘
```

Paper trader is the acquisition engine — must feel polished.

### 4.12 `/stock/[symbol]` (C6 Per-Stock AI Dossier, N2)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Symbol · Company · Sector · Market cap · Current price + % day change  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ TOP: Interactive TradingView chart (full width)                         │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ 4-COLUMN AI DOSSIER (stacked cards)                                     │
│                                                                          │
│ 1. TECHNICAL            2. QUANT              3. SENTIMENT              │
│    Pattern: Bull Flag      Qlib rank: 92        FinBERT 30d: +0.34      │
│    TFT 5d: +2.1%           Quality score: 78    Headlines flagged: 2    │
│    LSTM intraday: 0.68     Chronos: +3.4%       Top news: [list]        │
│                                                                          │
│ 4. FUNDAMENTAL (FinRobot)                                               │
│    ROE 22% · D/E 0.3 · EPS CAGR 18% · P/E 28 (sector median 32)        │
│    Management tone (last concall): +0.68 (positive)                     │
│    Earnings in 12 days · XGBoost beat prob: 71%                         │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│ AI VERDICT (Gemini synthesis)                                           │
│ "Overall: bullish. 4/5 models agree, regime supportive, earnings       │
│  pre-catalyst. Watch: if earnings miss (29% chance), pattern          │
│  invalidates."                                                          │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ RECENT SIGNALS ON THIS STOCK (chronological list with P&L)              │
├─────────────────────────────────────────────────────────────────────────┤
│ [Add to watchlist] [Set price alert] [Paper trade] [Open in Scanner]    │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.13 `/scanner-lab` (C7 — 50+ screeners + Pattern Scanner)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Title: "Scanner Lab" + Pro tier badge                                   │
├─────────────────────────────────────────────────────────────────────────┤
│ 2 TABS                                                                  │
│ ┌─────────────────┬─────────────────┐                                   │
│ │ Screeners (50)  │ Pattern Scanner │                                   │
│ └─────────────────┴─────────────────┘                                   │
│                                                                          │
│ TAB A — Screeners                                                       │
│ ┌──────────────┬──────────────────────────────────────────┐             │
│ │ Categories   │ Results table                            │             │
│ │ · Breakouts  │ Symbol · Price · Change · RSI · Volume   │             │
│ │ · Momentum   │ ...                                      │             │
│ │ · RSI        │                                          │             │
│ │ · MA cross   │ [Add to watchlist] [Open stock page]     │             │
│ │ · FII/DII    │                                          │             │
│ │ · OI changes │                                          │             │
│ │ · ...        │                                          │             │
│ └──────────────┴──────────────────────────────────────────┘             │
│                                                                          │
│ TAB B — Pattern Scanner                                                 │
│ Filter: pattern type · sector · market cap · min ML confidence          │
│                                                                          │
│ Cards grid:                                                             │
│ ┌───────────────────────────────┐                                       │
│ │ RELIANCE · Bull Flag · 74%    │                                       │
│ │ [mini chart with pattern overlay]│                                   │
│ │ ML confidence: 0.72           │                                       │
│ │ Detected: today · Duration: 18d│                                      │
│ └───────────────────────────────┘                                       │
│                                                                          │
│ IMPORTANT BANNER (top of tab B):                                        │
│ "Pattern Scanner is a discovery tool. For AI-ranked alpha, see          │
│  Signals & Alpha pillar."                                               │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

The banner makes the Step-1 positioning explicit.

### 4.14 Other core routes (brief specs)

**`/watchlist` (C9):** existing table, add AI alerts column (regime warnings, signal fires, sentiment flips). Pro+ unlimited symbols, Free 5 symbols.

**`/notifications`:** existing bell dropdown drives this full page. Filter by type (signals / trades / system / AI notes). Mark all read.

**`/portfolio` (merged /trades):** tabs: Holdings / Closed trades / P&L timeline / Risk view. Includes AI Portfolio section for Elite users. Charts: equity curve, allocation donut, sector split, drawdown.

**`/portfolio/doctor` (F7):** wizard:
1. Upload CSV or connect OpenAlgo read-only
2. FinRobot 4-agent analysis runs (~30s with progress bar showing each agent)
3. Report: overall score, risks found, strong holdings, AI suggestions
4. Download PDF, share link

**`/momentum` (F3):** weekly top-10 AI Momentum Picks. Each row: stock, AI score, expected return, hold period, models agreeing.

**`/sector-rotation` (F10):** 11 NSE sectors, color-coded as Rotating-In / Out / Neutral. FII/DII flow chart per sector. Click sector → drill to top stocks in that sector.

**`/earnings-calendar` (F9):** upcoming earnings next 14 days. Each stock: XGBoost beat probability, FinBERT on recent news, suggested pre-earnings strategy (Pro: basic prediction / Elite: full strategy).

**`/fo-strategies` (F6 Elite):** weekly Nifty/BankNifty strategy recommendations. Each: strategy name (Bull Call Spread / Iron Condor / etc.), market view, VIX forecast, legs with strikes + premiums, Greeks dashboard, max profit/loss, probability of profit.

**`/auto-trader` (F4 Elite):** flagship dashboard:
- Active / Paused toggle (huge red kill-switch button)
- Today's AI actions: "Bought 20 TCS · Reduced INFY by 30% · Increased RELIANCE" (plain English narration)
- Current portfolio weights vs target weights
- Regime + VIX overlay active
- Weekly report: "Your AI traded 4 stocks · Portfolio +1.2% · VIX spike detected Tuesday, moved 20% to cash"
- Settings: max position size, daily loss limit, OpenAlgo connection status

**`/ai-portfolio` (F5 Elite):** monthly rebalanced portfolio of 15-20 quality stocks. Holdings list with quality scores. Next rebalance date. Monthly rebalance reports (markdown, generated by Gemini).

**`/marketplace`, `/marketplace/[slug]`, `/my-strategies` (B3):**
- Browse/search strategies (Free tier can browse).
- Detail page: creator, backtest equity curve, deploy button (Pro+).
- My strategies: deployed strategies, pause/resume/delete.
- Elite can create + publish own strategies.

### 4.15 `/settings`

Tabs:
- **Profile** — email, phone, avatar, name
- **Trading Prefs** — risk profile (editable), capital, max positions, preferred strategies
- **Broker** — OpenAlgo URL + API key (encrypted display), connection status (healthy/error), test connection button
- **Notifications** — Telegram bot connect (QR code to bot), WhatsApp number + verify, email prefs, web push toggle, alert studio (granular per-event)
- **Subscription** — current tier, usage, upgrade/downgrade, billing history, Razorpay portal
- **Risk Control** — kill switch (pause all), per-tier loss limits, daily/weekly/monthly caps
- **Data & Privacy** — export my data, delete account, API tokens

### 4.16 `/admin/*` (admin-only, see Step 3 security)

- `/admin` — system health, MRR, signal generation stats
- `/admin/users` — user management
- `/admin/payments` — transactions
- `/admin/signals` — signal review + per-model WR charts
- `/admin/ml` — **Signal Accuracy Dashboard**, model retrain triggers, rollback buttons, A/B shadow mode toggle
- `/admin/system` — manual scan trigger, kill switch global, database health, scheduler job history, Gemini cost dashboard

---

## 5 — AI Copilot panel (N1)

Right-side slide-out, always accessible. Keyboard: `⌘/`.

```
┌───────────────────────────────────┐
│ AI Copilot                    [×] │
├───────────────────────────────────┤
│ Context: /signals/abc123 (TCS)    │
│                                   │
│ Chat history...                   │
│                                   │
│ User: Why did AI pick TCS?        │
│                                   │
│ Copilot: TCS has 4/4 model        │
│ agreement:                        │
│ · TFT forecasts +2.1% over 5d     │
│ · Qlib ranks it in top 8%         │
│ · LSTM intraday prob 0.68         │
│ · FinBERT reading news: +0.4      │
│ Regime is bull-supportive. Pattern│
│ is bull flag (61% historical WR). │
│ Biggest risk: earnings in 12 days.│
│                                   │
│ [cites: signal-abc123, stock-tcs] │
│                                   │
│ ─────────────────────────────     │
│ Messages left today: 142/150 (Pro)│
│ ┌─────────────────────────────┐   │
│ │ Ask about this signal...    │   │
│ └─────────────────────────────┘   │
│ [Send ↵]    [⌘↵ for new line]    │
└───────────────────────────────────┘
```

**Tools Copilot can call** (defined in system prompt):
- `get_signal(id)` · `explain_signal(id)` · `get_stock_dossier(symbol)` · `get_portfolio()` · `get_paper_portfolio()` · `get_regime()` · `get_track_record(days)` · `get_model_accuracy(model, days)` · `get_watchlist()` · `get_notifications(unread)` · `search_stocks(query)` · `get_similar_historical_signals(id)`

**Citation requirement:** every numeric claim Copilot makes must cite the tool call that produced it. Rendered as small clickable links.

---

## 6 — Email + Telegram + WhatsApp templates

### Morning Telegram Digest (7:00 AM IST, daily)

```
🌅 Your AI Trading Brief · Mon 21 Apr

Regime: ⚠️ Caution (transitioning to sideways)
Nifty: 22,450 (+0.3% expected today)
India VIX: 18.2 (elevated)

━━━━━━━━━━━━━━━━━━

📊 Today's signals (3 new):

1. TCS · Bull Flag · 74% conf
   Entry ₹3,420 / Target ₹3,560 / Stop ₹3,390

2. BAJFINANCE · Cup & Handle · 71%
   Entry ₹7,200 / Target ₹7,560 / Stop ₹7,050

3. HDFCBANK · Ascending Triangle · 68%
   Entry ₹1,780 / Target ₹1,860 / Stop ₹1,750

━━━━━━━━━━━━━━━━━━

💼 Your portfolio: +₹4,230 week (+1.8%)
🤖 Auto-trader: normal · 3 positions open

Full details: [app link]
Reply /pause to mute digest · /stop to kill switch
```

### Evening Telegram Summary (5:00 PM IST, daily)

```
🌙 Market Close · Mon 21 Apr

Nifty closed: 22,480 (+0.13%)
Regime end-of-day: Bull (maintained)

━━━━━━━━━━━━━━━━━━

📈 Signals closed today:
· TCS +4.7% (target hit) ✓
· INFY -4.1% (stop hit) ✗

📊 Your P&L today: +₹1,840 (+0.8%)

🔭 Tomorrow's outlook: [Gemini 1-line]

Full details: [app link]
```

### WhatsApp version: same content, more emoji-forward, shorter (160 chars preferred segments, rich media for chart snippets).

### Weekly review email (Sunday 6 PM IST)

```
Subject: Your Week in Swing AI — +2.3% vs Nifty +0.4%

[Personalized Gemini 300-word review from N10]
[Equity curve image]
[Top wins this week · Top losses this week]
[What AI learned about your trading style]
[Next week's focus]

View full report in app: [link]
```

---

## 7 — Motion design system (complete inventory)

| Event | Duration | Easing | What moves |
|---|---|---|---|
| Page route change | 200ms | `ease-out` | Content opacity + slight y-shift |
| New signal arrives | 300ms | `ease-out` | Card slides in from right + glow 1.5s |
| Price tick update | 200ms | `ease-out` | Number pulse + color flash |
| Tab switch | 200ms | `ease-in-out` | Cross-fade content |
| Regime change | 600ms | `ease-in-out` | Banner color morph + pulse |
| Modal open | 250ms | `ease-out` | Scale 0.96 → 1 + fade in |
| Modal close | 150ms | `ease-in` | Fade out + slight scale |
| Sidebar collapse | 200ms | `ease-in-out` | Width transition |
| Copilot slide | 300ms | `ease-out` | X-transform + fade |
| Skeleton shimmer | 1.5s | `linear` | Gradient sweep (only while loading) |
| Signal chip vote flip | 200ms | `ease-in-out` | Color transition + scale bump |
| Landing blobs | 20-60s | Custom CB | Only on `/` |
| Toast | 400ms in, 300ms out | `ease-out/in` | Slide from bottom-right |
| Kill switch button | 200ms | `ease-out` | Red pulse on hover, scale 1.02 |

All easing curves available via Tailwind's existing config. No new dependencies.

---

## 8 — Responsive design (web-only v1)

Breakpoints (existing Tailwind defaults):
- `sm: 640px` · `md: 768px` · `lg: 1024px` · `xl: 1280px` · `2xl: 1536px`

### Layout rules per breakpoint

**`2xl` (1536+)**: everything visible — sidebar + main + Copilot + admin charts.

**`xl` (1280-1536)**: Copilot collapsed to 48px rail by default. Main content uses full remaining width.

**`lg` (1024-1280)**: Sidebar collapses to icons. Copilot hidden (accessible via ⌘/ shortcut).

**`md` (768-1024)**: Tablet mode. Sidebar becomes hamburger top-left. Main content single column. Data tables horizontally scroll.

**`sm` (<768px)**: **not a launch target** (mobile deferred per Step 1). Render a simple landing redirect for now: "Desktop/tablet only. Mobile app coming soon." with email capture for wait-list.

---

## 9 — Accessibility + dark mode

### Dark mode (primary)

Already enforced (`<html class="dark">` in `app/layout.tsx`). Keep.

### Light mode (v1.1, not blocking launch)

- Invert palette but keep brand colors.
- `#FAFAFA → #EDEDEF → #DADADD → #AAAAB0` layers.
- Text `#1A1A1A / #555555 / #8E8E8E`.
- Up/Down colors unchanged.
- Document later; not v1 critical.

### Accessibility P0 (before public launch)

- **Contrast:** `text-d-text-muted #8E8E8E` on `surface-trading #111520` = 4.7:1 — meets WCAG AA body (4.5:1). Secondary text borderline. Bump muted to `#A0A0A6` on critical surfaces.
- **Keyboard navigation:** Radix primitives give us most of this. Audit: tab order on signal cards, focus trap in modals, `Esc` closes modals + Copilot.
- **Screen reader:** `aria-label` on every icon button. Numeric cell content announced as "42.5 percent" not "42.5%" (easily handled via `visually-hidden` supplement).
- **Color-only information:** every up/down chart has arrow icon + `↑/↓` text, not just color. Regime states have text labels + colors.
- **Reduced motion:** respect `prefers-reduced-motion` — disable non-essential animations.

### Accessibility P1

- High-contrast mode.
- Font-size multiplier in settings.

---

## 10 — What this changes in existing frontend code

### Files to delete

- `frontend/components/landing/HeroChat.tsx`
- `frontend/components/landing/FloatingChat.tsx`
- `frontend/app/(platform)/tools/page.tsx` + `CalculatorModal`
- `frontend/app/stocks/page.tsx` (merged into `/stock/[symbol]`)
- `frontend/app/trades/page.tsx` (merged into `/portfolio`)
- `frontend/app/(platform)/ai-intelligence/page.tsx` (replaced by public `/models`)
- `frontend/app/assistant/page.tsx` (embedded Copilot replaces)
- `frontend/app/quantai-alpha-pick/page.tsx` (replaced by `/momentum`)
- `frontend/app/pattern-detection/page.tsx` (merged into `/scanner-lab` tab)

### Routes to build (ordered by priority for Step 3 migration PRs)

Priority 1 — public trust surfaces + signal flagship:
- `/` landing redesign (hero widget live-updating)
- `/regime` public
- `/track-record` public
- `/models` public
- `/signals/[id]` (flagship detail page with model consensus grid)

Priority 2 — core engagement rebuild:
- `/dashboard` redesign
- `/paper-trading` major upgrade
- `/stock/[symbol]` AI Dossier upgrade
- `/scanner-lab` (merging screener + pattern-detection)
- `/onboarding/risk-quiz` new

Priority 3 — AI Copilot:
- Embedded panel on all platform pages

Priority 4 — feature-specific pages:
- `/momentum`, `/sector-rotation`, `/earnings-calendar`
- `/portfolio/doctor`
- `/settings` expansion

Priority 5 — Elite tier:
- `/auto-trader`, `/ai-portfolio`, `/fo-strategies`

Priority 6 — Marketplace wiring (backend ready):
- `/marketplace`, `/marketplace/[slug]`, `/my-strategies` frontend wire-up

Priority 7 — admin hardening:
- `/admin/ml` Signal Accuracy Dashboard
- `/admin/system` kill switch + scheduler monitor
- Role guard in middleware.ts

### Style system touch-ups

- Add `.trading-surface` utility in `globals.css` (`bg-[#111520] border border-[#2D303D] rounded-lg p-5`).
- Add `.numeric` utility (`font-mono tabular-nums tracking-tight`). Apply to every `<span>` wrapping a number.
- Audit and remove `.glass-card` from inner platform pages (replace with `.trading-surface`).
- Audit and remove blob BG divs from all routes except `/` and `/pricing`.

### New Framer Motion animations to ship

- Signal card arrival (slide + glow).
- Number pulse on price ticks.
- Regime banner morph.
- Copilot panel slide.

Skip everything else. Resist decorative animation requests — always ask "what does this communicate?"

---

## 11 — Implementation order (integrated with Step 3 PRs)

Step 4 work runs **in parallel with Step 3 backend migration**. Mapping:

| Frontend PR | Depends on Backend PR | Gives |
|---|---|---|
| Strip glass on inner pages + add `.trading-surface` | — | Visual cleanup, Day 1 |
| `/models` public page | Step 3 signal-accuracy-aggregator job | Trust surface |
| `/regime` public page | Step 3 regime wiring + regime_history table | Trust surface |
| `/track-record` public | — (reads existing `signals` table) | Trust surface |
| `/signals/[id]` rebuild | Step 3 wire TFT/Qlib/LSTM/FinBERT into SignalGenerator + explanation | Flagship page |
| `/dashboard` redesign | Step 3 real-time pipeline | Core retention |
| `/paper-trading` upgrade | Step 3 paper_snapshots table + Gemini post-mortems | Acquisition |
| AI Copilot panel | Step 3 LangGraph agents | Feature parity |
| `/scanner-lab` merge | — (backend exists) | Reduction of surface |
| `/onboarding/risk-quiz` | Step 3 user_profiles.risk_profile column | Activation |
| `/auto-trader` | Step 3 FinRL-X engine + OpenAlgo | Elite upsell |
| `/ai-portfolio` | Step 3 PyPortfolioOpt + rebalance job | Elite upsell |
| `/fo-strategies` | Step 3 Options-PPO + VIX TFT | Elite upsell |
| `/portfolio/doctor` | Step 3 FinRobot agent | Pro feature |
| `/momentum`, `/sector-rotation`, `/earnings-calendar` | Step 3 respective services | Pro retention |
| `/marketplace` wire-up | — (backend exists) | B3 feature |
| Mobile "coming soon" page | — | Public launch guard |
| Admin `/admin/ml` dashboard | Step 3 model_performance table | Operational |

---

## 12 — Wrap (Step 4 ends the plan)

All 4 steps written + locked. Plan set:

- **Step 1 — Feature Decisions** — 15 research-doc + 12 synthesis features, 3 tiers, OpenAlgo only, Gemini only, pattern engine standalone.
- **Step 2 — AI Stack & Models** — every model specified with HF repo / training recipe / Colab-Pro-based retrain cadence. ~$20-35/mo v1 AI budget.
- **Step 3 — Production Architecture** — monolithic FastAPI with clean modules, 22 scheduler jobs, real-time pipeline, LangGraph agents, security hardening, observability, one consolidated DB migration, 16-20 PR migration sequence.
- **Step 4 — Full UI/UX Design (this doc)** — design language, component library upgrades, every route wireframed, Copilot panel, digest templates, motion system, accessibility, implementation ordering.

**Files for reference:**
- `/Users/rishi/.claude/plans/system-role-you-glimmering-riddle.md` — Step 1
- `docs/STEP_2_AI_STACK_AND_MODELS.md` — Step 2
- `docs/STEP_3_PRODUCTION_ARCHITECTURE.md` — Step 3
- `docs/STEP_4_UI_UX_DESIGN.md` — Step 4 (this file)

**When ready to start building, the first 5 concrete PRs to ship (revised 2026-04-18 after orphan audit):**

1. **PR 1 — P0 security:** JWT signature verification fix + `is_admin` column + admin route guard. (Step 3 P0 fixes. One day.)
2. **PR 2 — Consolidated v1 DB migration** applied to Supabase. (Step 3 §9 migration file. Half day.)
3. **PR 3 — ModelRegistry → B2 + Postgres `model_versions`** + move 5 existing artifacts (TFT, HMM, LGBM, QuantAI, BreakoutMetaLabeler) to B2. HMM registered as `is_prod=true`. TFT/LGBM/QuantAI registered as `is_shadow=true` pending retraining (the existing checkpoints are under-parameterized / overfit — not production-grade per audit). (Two days.)
4. **PR 4 — Wire models into SignalGenerator.** HMM goes **LIVE** (gates every signal size + confidence, drives public `/regime` page and dashboard banner). TFT + LGBM + QuantAI run in **SHADOW MODE ONLY** — scores written to `signals_shadow` for A/B diff logging, never affect user-facing confidence. Validates end-to-end pipeline wiring. (Three days.)
5. **PR 5 — Strip glassmorphism** from platform inner pages + apply `.trading-surface` + `.numeric` utilities. (One day visual cleanup. Immediately reads as production-grade.)

**Parallel during Weeks 1-2 (Rishi's Colab ritual, not PRs):**
- Retrain **TFT v2 from scratch** — `hidden_size=128` (was 32), `attention_heads=4` (was 2), Nifty 500 universe (was 100 stocks), walk-forward 2015-2023/2024/2025+ with 0.15% cost applied.
- Verify **HMM** OOS 2024-2025 regime labels.
- Fresh **Qlib Alpha158** train — this model replaces both LGBMGate and QuantAI Ranker (they're obsoleted, not retrained).

**Day 21 — PR 6:** promote TFT v2 + Qlib Alpha158 to `is_prod=true` after regression gate (new model must not drop WR >3pp vs incumbent on last 30 days). **This is when user-facing AI signals become real alpha.**

**Day 22 — PR 7:** retire LGBMGate + QuantAI Ranker from active codepaths.

After PRs 1-7 land, the next 25+ PRs follow the migration sequence in Step 3 §11 + frontend priority table in Step 4 §11.

This is the plan. Let's go build.
