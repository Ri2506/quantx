# Swing AI — Master Design Prompt for Google Stitch AI

> Paste this entire document into Google Stitch AI as a single prompt. It describes the complete product — 40+ screens, every state, every flow. Stitch will generate a coherent design system instead of one-off screens.

---

## 0. What this product is

**Swing AI** is an India-focused AI trading SaaS for the NSE / BSE (stocks + F&O). It is for retail and prosumer Indian traders (not institutional) who want institutional-grade AI signals without writing code.

**What it does:**
- Generates daily swing-trading signals (3-10 day holds) on Nifty 500 stocks using an ensemble of AI models (Temporal Fusion Transformer, Qlib Alpha158 + LightGBM, LSTM intraday, FinBERT-India sentiment, HMM regime detector, FinRL-X reinforcement learning for auto-execution).
- Explains every signal in plain English via Google Gemini.
- Runs an AI copilot (like Cursor's) that answers questions anywhere in the app with full context of the user's portfolio + watchlist + today's signals.
- Auto-trades on the user's connected broker (Elite tier only) with kill-switch + VIX-aware risk overlay.
- Ships a paper-trading league with gamification (streaks, badges, leaderboard) as the free-to-paid conversion funnel.
- Scans 50+ technical setups (Scanner Lab) + 11 chart patterns (Pattern Scanner) as standalone Pro features.
- Delivers daily / weekly digests to WhatsApp + Telegram + email.

**Tagline:** _"Institutional AI for Indian traders."_

**The competitive angle:** Every signal is mathematical, every model is transparent (per-model accuracy shown publicly on `/models` page), every closed trade's P&L is public (`/track-record`). No "AI thinks this is great" hand-waving. Numbers first, narrative second.

---

## 1. Brand & visual language

### Personality
- **Voice:** senior sell-side analyst + ex-Bloomberg terminal operator. Dense, numeric, cited. Never chatbot-cute.
- **Feel:** professional trading desk, not consumer finance app. Closer to Bloomberg Terminal / Linear / TradingView Pro than Groww / IndMoney / Zerodha Kite.
- **Density:** data-rich. No generous white space on data surfaces. 44px row height on tables. Charts as default primary surface on most feature pages.

### Colors (locked — do not deviate)

**Depth palette (dark-first):**
- `L0 main` = `#0A0D14` — body background
- `L1 wrap` = `#111520` — card surface (primary panel color)
- `L2 hover` = `#1C1E29` — elevated / hover / modal
- `L3 line` = `#2D303D` — standard border
- `L4 wrap-line` = `#43475B` — emphasized border / focused input

**Text:**
- `text-primary` = `#DADADA` (body)
- `text-secondary` = `#8E8E8E` (meta)
- `text-muted` = `#666666` (placeholder)

**Semantic:**
- `primary` = `#4FECCD` (cyan-teal — brand accent, CTAs, links)
- `up` = `#05B878` (profit / bullish)
- `down` = `#FF5947` (loss / bearish)
- `warning` = `#FEB113`
- `orange` = `#FF9900`

**Model identity colors** (used on "model consensus chips" — see §3.1):
- `model-tft` = `#5DCBD8`
- `model-qlib` = `#8D5CFF`
- `model-lstm` = `#FEB113`
- `model-finbert` = `#00E5CC`
- `model-hmm` = `#FF9900`
- `model-chronos` = `#E0B0FF`

**Regime colors:**
- `regime-bull` = `#05B878`
- `regime-sideways` = `#FEB113`
- `regime-bear` = `#FF5947`

**Tier colors:**
- `tier-free` = `#8E8E8E`
- `tier-pro` = `#4FECCD`
- `tier-elite` = linear gradient `135deg #FFD166 → #FF9900`

### Typography

- **Primary typeface:** DM Sans (body, headings, UI chrome).
- **Numeric typeface:** DM Mono with `tabular-nums` and `-0.01em` letter-spacing. Use for every price, percentage, confidence, P&L, count, ratio. This is non-negotiable — numbers must line up vertically everywhere.
- **Type scale:** `11px / 12px / 13px / 14px (base) / 16px / 20px / 24px / 32px`. No other sizes.
- **Weights:** 400 regular, 500 medium, 700 bold. No 300 / 600.

### Spacing

- 4 / 8 / 16 / 24 / 32 / 48 / 64 rhythm only. Never 6 / 10 / 14.
- Card padding: `20px` desktop, `16px` tablet, `16px` mobile.
- Table row height: `44px`. Cell padding: `16px` horizontal, `0` vertical (flex-center).

### Surface rule (critical)

Platform inner pages use **flat `trading-surface` panels** (bg `#111520`, 1px border `#2D303D`, 8px radius). **No glassmorphism, no backdrop-blur, no gradient overlays on data surfaces.** Solid panels only.

Glassmorphism / blob backgrounds / mesh gradients are allowed only on:
- Landing page `/`
- Pricing page `/pricing`
- Auth pages (`/login`, `/signup`, `/forgot-password`, etc.)
- Modal scrims (the dimmed layer behind a modal)

### Motion

- New signal arrives → slides in from right, 300ms `easeOut`. Subtle 1.5s glow pulse, then settles.
- Price ticks → number pulse 200ms (scale 1 → 1.05 → 1) + brief color flash (green up, red down).
- Tab switch → 200ms cross-fade.
- Regime change (bull → bear) → 600ms morph with color sweep on banner.
- Modal enter → 250ms scale 0.96 → 1 + fade.
- Sidebar collapse → 200ms width.
- Copilot panel → 300ms slide from right.

**What does NOT move:** shimmer on data tables (reads as "still loading"). Hover card tilts. Parallax on dashboard. Blobs on any inner page.

### Iconography

Use `lucide-react` icons throughout. Size: `16px` in-line, `20px` in buttons, `24px` in headings, `32px` in empty states. Stroke weight `1.75px`.

---

## 2. Product structure

### Tiers (locked — 3 tiers only)

| Tier | Price | Positioning |
|---|---|---|
| **Free** | ₹0 | Paper trading + 1 signal/day + basic regime + assistant (5 msgs/day) |
| **Pro** | ₹999 / mo | Unlimited signals + full consensus + Scanner Lab + intraday + momentum + sector rotation + assistant (150 msgs/day) |
| **Elite** | ₹1,999 / mo | Pro + live auto-trader + AI SIP portfolio + F&O options + TradingAgents debate + unlimited Copilot |

### Primary navigation (5 pillars)

```
[ Dashboard ]   [ Signals ]   [ Portfolio ]   [ Scanner Lab ]   [ Models ]
```

Plus persistent right-side: **AI Copilot panel** (slide-out, context-aware, embedded on every page). Plus top-right: **Notifications bell** + **user menu** (avatar, tier badge, settings, logout).

### Every route in the app (build every one of these)

**Public (no auth):**
- `/` — Landing page (hero + live regime + today's top signal + 30-day track record + tier pricing preview + social proof)
- `/pricing` — Full pricing page with tier comparison
- `/regime` — Public market regime with 90-day timeline (F8 trust surface)
- `/track-record` — Every closed signal last 90 days with real P&L, wins AND losses (N3 trust surface)
- `/models` — Live per-model accuracy dashboard, sparklines, explainers (N4 trust surface)
- `/blog` — Market commentary articles (optional, low priority)

**Auth:**
- `/login` — email + password + "Sign in with Google"
- `/signup` — email + name + password + tier selection (default Free)
- `/forgot-password`
- `/verify-email`
- `/auth/callback` — OAuth return from Google
- `/broker/callback` — OAuth return from Zerodha / Upstox / Angel One

**Platform (signed in):**
- `/dashboard` — Command center: regime banner + today's signals + portfolio summary + watchlist + AI Copilot sidebar
- `/signals` — Signals feed: filter + sort + grid of SignalCards
- `/signals/[id]` — Signal detail: 4-column ModelConsensusGrid + chart + entry/exit levels + debate (if Elite) + explanation + execute button
- `/intraday` — Live intraday signals (F1) with 5-min LSTM stream
- `/momentum` — Weekly top-10 AI momentum picks (F3)
- `/fo-strategies` — F&O options strategy generator (F6, Elite)
- `/sector-rotation` — Sector heatmap + rotation dashboard (F10)
- `/earnings-calendar` — Upcoming earnings + AI predictions (F9)
- `/ai-portfolio` — AI SIP monthly rebalance (F5, Elite)
- `/auto-trader` — Elite auto-trader dashboard (F4, Elite)
- `/portfolio` — Holdings + closed trades + equity curve + diversification + P&L (trades merged in)
- `/portfolio/doctor` — Portfolio Doctor 4-agent report (F7)
- `/scanner-lab` — Two tabs: **Screeners** (50+ filters) + **Pattern Scanner** (11 patterns)
- `/watchlist` — User-curated symbol list with AI alerts + regime-aware warnings
- `/stock/[symbol]` — Full AI Dossier for a stock: every model's output + TradingView chart + fundamentals + news
- `/settings` — Profile, broker connect, notifications, risk profile, tier, kill-switch, alert studio
- `/notifications` — Notification center (read/unread)
- `/marketplace` — Browse community strategies (B3)
- `/marketplace/[slug]` — Strategy detail + backtest + deploy button
- `/my-strategies` — User's deployed strategies

**Admin (admin role only):**
- `/admin` — Admin command center home
- `/admin/users` — User list + per-user detail
- `/admin/users/[id]` — User cohort + trade history + tier + kill-switch override
- `/admin/signals` — Live signal monitoring
- `/admin/payments` — Razorpay payment ledger
- `/admin/system` — System health + scheduler job status + model drift
- `/admin/ml` — Model version management (promote / shadow / retire)

**Total: ~35-40 screens.** Each gets full spec below.

---

## 3. Component library (build once, reuse everywhere)

### 3.1 Primary data components

**`ModelConsensusChips`** — horizontal row of 4-6 chips. Each chip = model color dot + model short name + vote glyph (✓ bullish / ✗ bearish / — neutral) + score (0-100). Sizes: `sm` (card inline, 24px tall), `md` (signal list row, 32px tall), `lg` (detail page, 40px tall). On hover: tooltip with "TFT forecasts +2.1% in 5 days (last-30d accuracy: 58%)".

**`ModelConsensusGrid`** — 4-column grid, one card per model. Each card: model color stripe left, model name bold, current score huge DM Mono, last-30d accuracy as percent, tiny sparkline of last-30d predictions, one-line plain-English prediction. Used on signal detail page.

**`ConfidenceMeter`** — horizontal bar, 0-100 scale, filled proportionally. Segmented by model contribution (hover segment shows "TFT +15, Qlib +12, FinBERT +8, HMM +5"). Color shifts with value: red 0-40, amber 40-65, teal 65-85, gold 85-100.

**`RegimeBanner`** — always on top of dashboard. Shows `Bull` / `Sideways` / `Bear` with regime color, confidence percent, 1-line narrative ("Nifty in Bull regime — 94% prob bull next 5 days · VIX 14.2 (low)"), click → opens `/regime`. Bell icon on right for "regime changed at 11:32" alerts.

**`RegimeBadge`** — inline miniature variant for headers, cards, row cells.

**`SignalCard`** — the default signal cell. Top: symbol + sector chip + direction arrow. Middle: entry / stop / target prices in DM Mono, risk:reward ratio, confidence bar. Bottom: `ModelConsensusChips` (sm) + regime tag + "30d WR 58%" badge + execute button. Left edge: 3px color strip based on direction (teal long / red short).

**`TrackRecordSparkline`** — 100×30px line chart, 30-day win-rate per model. Color = model identity.

**`SignalConsensusSparkline`** — dot row showing last N signals where all models agreed (green dots) vs dissented (amber dots).

**`ExplanationMarkdown`** — Gemini-generated plain-English explanation. Renders with **numeric-slot highlighting**: every number is wrapped in its model's color (e.g., "TFT forecasts `+2.1%` in 5 days" — the `+2.1%` renders in `model-tft` color). Structure: "What AI sees" / "Why now" / "What invalidates" collapsible sections.

**`AdvancedStockChart`** — TradingView Lightweight Chart. Overlays: TFT quantile band (P10 / P50 / P90 dashed lines), detected pattern shading, regime background tint, buy/sell markers, stop/target horizontal lines. Dark theme only. Candlesticks default, line / area toggles available.

**`EquityCurve`** — portfolio value over time. Toggles: vs Nifty benchmark, vs SIP-equivalent (for comparison storytelling). Drawdown subplot below. Hover tooltip shows date + portfolio value + relative vs Nifty in DM Mono.

**`PerformanceMetrics`** — 2×3 grid of stat cards: Total P&L, Win Rate, Sharpe, Max Drawdown, Active Trades, Avg Holding Days. Each card: label top, big DM Mono number, tiny delta vs last period.

**`RiskGauge`** — circular gauge 0-100 with color zones (teal <30 conservative, amber 30-65 moderate, red >65 aggressive). Shows user's current risk profile + portfolio heat ratio.

**`PnLChart`** — calendar heatmap (like GitHub contribution grid) colored by daily P&L. Green shades for profit days, red for loss, dark for no-trade.

### 3.2 Tier & gate components

**`TierBadge`** — pill with tier name. Free = gray, Pro = teal, Elite = gold gradient. Used on user avatar, pricing, feature gates.

**`FeatureGate`** — if user tier too low, renders feature card with gate overlay: lock icon + "Upgrade to Elite to unlock" + inline Upgrade CTA. No hard redirects; keep context.

**`UpgradeModal`** — tier comparison table + Razorpay payment button. Opens from any FeatureGate click.

### 3.3 AI Copilot

**`AICopilotPanel`** — persistent right-side slide-out panel, collapsible. Default width 400px, full-height from below top-nav. Three-tab top: Chat / Tools / Context. Context tab shows: current route, selected signal / stock / portfolio the copilot has access to.

**Chat area:** message bubbles. User = right-aligned, bg `#1C1E29`. AI = left-aligned, bg transparent, model avatar (Gemini logo or "AI" hexagon). Code blocks in DM Mono. Inline buttons for structured actions ("Execute this signal", "Add to watchlist", "Show full chart").

**Input bar:** multi-line textarea + send button. Left of input: "@mention" chip to inject context (@TCS pulls TCS into context). Right: credit counter ("47 / 150 today").

**`GemiVoicePanel`** — embedded variant (not slide-out) for signal detail page. Shows Copilot's analysis of a specific signal with structured subsections.

### 3.4 Broker & connection

**`BrokerConnectTile`** — 3 tiles grid (Zerodha / Upstox / Angel One). Each: broker logo full-color, status pill (Connected green / Expired amber / Not connected gray), last-sync timestamp, `Connect` / `Disconnect` button. One-click → OAuth redirect.

**`OpenAlgoStatus`** — DEPRECATED. Do not use. Kept here only to flag: if you see this in old mocks, ignore.

### 3.5 Notification

**`NotificationBell`** — top nav icon with unread count badge. Click → dropdown panel with last 20 notifications, filtered by type (signal / trade / regime / system).

**`AlertStudio`** — settings page sub-surface. Toggle matrix: rows = event types (New signal / Signal triggered / SL hit / Target hit / Regime change / Kill switch fired / Auto-trade executed), columns = channels (In-app / Push / Telegram / WhatsApp / Email). Cells = checkboxes with a "quiet hours" time-range per channel.

### 3.6 Misc

**`KillSwitchButton`** — floating red "PAUSE ALL" FAB bottom-right of dashboard when auto-trader is active. Click → confirm modal → disables all open orders + auto-trade for 24 hours.

**`DebateTranscript`** — TradingAgents Bull/Bear/Risk/Trader output. 4 collapsible cards in sequence, each with agent name + avatar + their arguments + final vote. Final row: Trader verdict.

**`SentimentChip`** — small pill with FinBERT score (-1 to +1). Gradient from red (-1) through amber (0) to green (+1).

**`PaperLeagueLeaderboard`** — anonymized weekly leaderboard. Rows: rank, masked handle (e.g. "SwingT4xD4"), streak count, weekly P&L. User's row highlighted with gold border + "YOU".

**`ModelAccuracyCard`** — used on `/models` public page. Model name + color stripe + 7/30/90d WR bars + 30d sparkline + "last retrained 3 days ago" meta.

---

## 4. End-to-end user journey

### 4.1 First-time flow (acquisition → activation)

1. **Land on `/`** — sees live regime banner + today's #1 signal (blurred beyond title) + track record sparklines + "Start free" CTA.
2. **Click Start free** → `/signup`. Enters email + name + password. Default Free tier.
3. **Email verification** → check inbox → click link → `/verify-email` success → auto-redirect to onboarding.
4. **Onboarding quiz (N5 — 5 questions):** experience level, goal (wealth / income / learning), risk tolerance, monthly capital, preferred holding period. Submits → generates risk profile + recommended tier.
5. **Connect Telegram (optional, free)** → link to @SwingAIBot + chat ID auto-captured.
6. **First paper trade** — system seeds ₹10L paper portfolio. Onboarding modal: "Here's today's top signal: TCS. Want to paper-trade it?" → one-click executes paper buy.
7. **Dashboard unlocks** — full command center with regime banner + signal list + their paper portfolio + copilot sidebar.

### 4.2 Daily flow (returning free user)

1. 7:00 AM — Telegram morning brief arrives: "Regime: Bull (92%). Top 3 signals: TCS, RELIANCE, HDFCBANK. Portfolio update: +1.2% yesterday."
2. 9:30 AM — New signals appear on `/dashboard` and `/signals`. Push notification.
3. User clicks signal → `/signals/[id]` — reads model consensus + explanation + clicks "Paper-trade this".
4. Intraday → user opens app on phone → sees live regime + open positions with pulsing price ticks.
5. 3:30 PM — position closed with target hit → push notification + in-app toast. Auto-adds to `/track-record`.
6. 5:00 PM — Telegram evening summary + "You're on a 4-day streak. One more for a badge."

### 4.3 Conversion flow (free → Pro)

1. After 30 days paper trading, dashboard shows modal: "You've beaten Nifty by 4.3% on paper. Ready to trade live?"
2. User clicks → `/pricing` with "Your stats" highlighted against tier benefits.
3. Choose Pro → Razorpay checkout → back to dashboard with Pro badge + unlocked features.
4. Immediate new features surface: unlimited signals, intraday tab, Scanner Lab.

### 4.4 Elite flow (Pro → Elite)

1. User explores `/ai-portfolio` preview (blurred with FeatureGate).
2. Upgrades to Elite via tier comparison modal.
3. Settings → Connect Broker → clicks Zerodha tile → OAuth → returns with "Connected".
4. `/auto-trader` unlocks — user sets risk parameters → enables → receives first auto-trade execution next market open.
5. Elite-only features light up: TradingAgents debate on high-stakes signals, F&O strategies, AI SIP monthly rebalance.

### 4.5 Trust & safety flow

- Regime changes bull → bear at 11:32 → banner animates → notification "Bear regime detected. New signal sizes reduced to 50%."
- Any unusual loss → dashboard shows `KillSwitchButton` pulsing → one click pauses everything.
- Admin can globally kill-switch all users (admin screen).

---

## 5. Screen-by-screen specifications

For every screen: **Purpose**, **Layout grid**, **Content blocks**, **States** (loaded / empty / loading / error), **Copy tone**.

### 5.1 PUBLIC SCREENS

---

#### `/` Landing page

**Purpose:** Convert visitors to sign-ups. Prove track record. Demonstrate AI depth.

**Grid:** single-column scroll with 7 sections.

**Sections top to bottom:**

1. **Nav bar** (sticky, semi-transparent glass allowed): logo left · nav (Features, Pricing, Models, Track Record, Blog) · "Sign in" + "Start free" CTA right.

2. **Hero** — 100vh. Left half (55%): headline `Institutional AI for Indian traders.` subhead `12 AI models. 3 tiers. NSE + BSE. Paper-trade free.` Primary CTA `Start free →` + secondary `See live signals`. Right half (45%): live TradingView chart of Nifty with TFT quantile overlay + regime shading. Live "Market regime: Bull · Signal of the day: TCS +3.1% forecast" ticker strip at bottom.

3. **Track Record bar** — full width strip, dark card. 5 stat cells in a row: `Total signals 30d · 412` / `Win rate · 58.4%` / `Avg return · 2.1%` / `Best signal · +8.7% RELIANCE` / `Active regime · Bull 92%`. All DM Mono. Subcopy: `Every closed trade public. See /track-record.`

4. **12 features grid** — 4-column grid of feature cards (F1-F12). Each card: model icon (colored), feature name, 2-line description, tier badge (Free / Pro / Elite). Hover → slight border color shift to model color.

5. **"How it works" flow** — 5 horizontal steps with connecting lines: Sign up → Connect broker (optional) → AI scans NSE → You approve signals → Trade manually or auto. Illustrated, not photo.

6. **Pricing preview** — 3 tier cards side by side, "Pro most popular" label. Full pricing at `/pricing`.

7. **Social proof** — 3 customer quotes + media logos (Economic Times, LiveMint, Moneycontrol if featured).

8. **Footer** — links, legal, SEBI disclaimer, ©Swing AI 2026.

**States:** loaded only. Track record bar has a live-updating dot if websocket connected.

**Copy tone sample:**
- ✅ "TFT projects +2.1% on TCS in 5 days. Last 30d WR on this pattern: 61% over 47 signals."
- ❌ "TCS is a great buy right now!"

---

#### `/pricing`

**Purpose:** Tier selection + clear gate communication.

**Layout:** 3 tier columns side by side (mobile: stacked). Each column is a full card.

**Each tier card contents:**
- Tier name large
- Price with monthly / annual toggle (annual = 15% off)
- One-line positioning
- Feature checklist (~10 items per tier) with ✓ for included and `—` for not
- Primary CTA button: Free = `Start free`, Pro = `Upgrade to Pro`, Elite = `Upgrade to Elite`
- Fine print: "Cancel anytime · GST extra · SEBI disclaimer"

**Elite card:** gold gradient border + crown icon. "Most comprehensive" label.

**Comparison table** below cards: full feature matrix (every F1-F12 + B1-B3 + N1-N12) as rows × 3 tier columns. Collapsible by category.

**FAQ** section: 8-10 Q&As (Is it SEBI-registered? How is my money safe? Can I cancel anytime? Do I need a broker?).

---

#### `/regime` (PUBLIC trust surface)

**Purpose:** Prove the HMM regime model is working + drive SEO.

**Top card:** current regime banner large (fills width, 200px tall) with `Bull · 92% confidence` + timestamp + 1-line narrative. Background tinted with regime color.

**Timeline chart:** 90-day regime history. Horizontal bands colored by regime per day. Overlay: Nifty close line in white. Regime change markers with hover tooltips showing "Regime change detected 2026-03-15: Bull → Sideways. VIX spiked to 18.4."

**Strategy weights table:** "Here's how each regime shapes signal generation" — 3 rows (bull / sideways / bear) × 5 columns (TFT weight, Qlib weight, LGBM shadow, Position size, Confidence mult). DM Mono.

**Explainer:** 3 short paragraphs: What is a market regime? Why does it matter? How does our HMM work? (Link to `/models` for deeper detail).

---

#### `/track-record` (PUBLIC trust surface)

**Purpose:** Every closed signal, last 90 days, real P&L.

**Top stats strip:** `90d signals · 1,247` / `WR · 58.4%` / `Avg return · 2.1%` / `Sharpe · 1.74` / `Max drawdown · -4.2%`.

**Filters row:** segment (Equity / F&O), direction (All / Long / Short), model (All / TFT only / Qlib only / HMM only / Strategy only), date range slider.

**Signal list:** virtualized table. Columns: Symbol · Entry date · Entry price · Exit date · Exit price · P&L % · Holding days · Models that agreed · Result badge (Target / Stop / Expired). Row click → modal with full signal snapshot.

**Bottom disclaimer:** "Past performance ≠ future. SEBI registered as [TBD] · all figures before tax."

---

#### `/models` (PUBLIC trust surface)

**Purpose:** Per-model accuracy transparency.

**12-card grid:** one `ModelAccuracyCard` per model (TFT swing, LSTM intraday, Qlib LightGBM, TimesFM, Chronos, FinBERT-India, HMM regime, FinGPT HG-NC, FinRL-X, XGBoost earnings, BreakoutMetaLabeler, FinRobot CoT).

Each card:
- Model color stripe top
- Model name + full name tooltip
- Current version (e.g. `v2 · promoted 2026-04-14`)
- 7d / 30d / 90d WR as 3 mini bars
- 30-day sparkline of daily accuracy
- Last retrained date
- "Shadow" or "Production" badge

**Click model** → modal with full model card: training data, universe, retrain cadence, input features, output interpretation, link to research paper.

---

### 5.2 AUTH SCREENS

---

#### `/login`

**Layout:** two-column. Left 40%: form card. Right 60%: animated chart visualization (silent, looped).

**Form card contents:**
- Logo + "Welcome back"
- Email input
- Password input (eye toggle)
- "Forgot?" link right
- `Sign in` primary button
- Divider "OR"
- `Sign in with Google` button with Google logo
- Bottom: "New here? `Sign up →`"

**States:** loading (button spinner, disabled form), error (red banner above form: "Invalid credentials"), success (redirect).

---

#### `/signup`

Same 2-column layout. Form collects: email, name, password (with strength meter), tier pre-selected Free.

Below form: checkbox "I agree to Terms + SEBI disclaimer + risk disclosure".

On submit → verify-email screen.

---

#### `/forgot-password` / `/verify-email` / `/auth/callback`

Minimal forms with success/error banners. `/auth/callback` shows "Completing sign-in…" spinner + auto-redirect.

---

#### `/broker/callback`

**Purpose:** Return from Zerodha / Upstox / Angel OAuth.

- Full-screen success animation (3 seconds): checkmark draws in primary color, "Connected to [Broker]" below, "Redirecting…" subcopy.
- On error: red X + "Connection failed · Try again" + `Return to settings` button.

---

### 5.3 PLATFORM SCREENS

All platform screens share the **`AppLayout`** chrome:

**Top nav (56px tall):** logo left · pillar tabs (Dashboard / Signals / Portfolio / Scanner Lab / Models) · right-side (Notifications bell + Copilot toggle + user avatar with tier badge).

**Right slide-out:** `AICopilotPanel` (400px when open, 0 when closed).

---

#### `/dashboard`

**Purpose:** Command center. Everything important, one screen.

**Grid (desktop 1440px):** 12-col grid, 24px gutter.

**Top strip (full width):** `RegimeBanner` (200px tall).

**Row 1 (400px tall):**
- Col 1-8: **Today's signals** — horizontal scrollable carousel of `SignalCard`s (md size). "See all →" link.
- Col 9-12: **Portfolio snapshot** — `EquityCurve` (30-day) with total P&L stat + today's change + tier badge.

**Row 2 (320px tall):**
- Col 1-4: **AI Performance Widget** — 7/30/90d WR bars + model drift indicator.
- Col 5-8: **Watchlist** — table of 5 symbols with live prices pulsing.
- Col 9-12: **Market ticker** — Nifty / Bank Nifty / VIX / USD/INR / Gold with sparklines.

**Row 3 (280px tall):**
- Col 1-6: **Open positions** — rows of `PositionRow` components (symbol, entry, LTP, unrealized P&L, SL/Target, action).
- Col 7-12: **Active signals** — compact table view of all active (not yet triggered) signals.

**Row 4 (200px):**
- Col 1-4: **Sector rotation heatmap** (mini — link to full at `/sector-rotation`).
- Col 5-8: **Upcoming earnings** (next 7 days, filtered to user's watchlist).
- Col 9-12: **Recent paper league** — top 3 + user rank.

**Floating:** `KillSwitchButton` (bottom-right, only if auto-trader active).

**Empty states:**
- No positions: "Nothing open. Here are today's top signals →" with 3 SignalCards.
- No watchlist: "Add stocks to watch. AI will alert you on breakouts." + `Add stock` button.

**Mobile (< 768px):** everything stacks single-column. Signals carousel becomes vertical list. Right copilot panel becomes bottom-sheet activated by floating button.

---

#### `/signals`

**Top strip:** count + filters.

**Filters:** `Today` / `Week` / `Month` toggle · Segment (Equity / F&O) · Direction · Model agreement ≥ 3 · Tier gate visibility.

**Grid:** responsive cards (4 per row desktop, 2 tablet, 1 mobile). Each card = `SignalCard` (md).

**Sort:** default by confidence desc. Toggle: by time, by symbol A-Z, by R:R.

**Empty:** "No signals matching filters. Try widening." + reset button.

---

#### `/signals/[id]`

**Purpose:** Deep dive into one signal.

**Layout (desktop):** 3-column.

**Col 1 (wide, 8/12):**
- Header: symbol large · sector · direction arrow · confidence bar + percent
- `AdvancedStockChart` (450px tall) with all overlays
- `ModelConsensusGrid` (4 cards)
- `ExplanationMarkdown` — Gemini-generated narrative
- `DebateTranscript` (only if Elite + high-stakes signal triggered debate)
- Similar past signals (small grid of 4 closed signals with same pattern, P&L shown)

**Col 2 (narrow, 4/12):**
- `Execute` panel: entry / stop / target / R:R · position size input · total cost DM Mono · `Paper-trade` + `Live trade` buttons (Live gated to Elite + broker connected)
- Signal metadata: generated at, strategy name, regime at signal, lot size (F&O)
- Related stocks (2-3 from same sector)
- Alerts: checkbox to notify on trigger / target / SL

**Bottom (full-width):**
- `SignalConsensusSparkline`
- User's prior trades on this symbol (P&L table)

**States:** not-yet-triggered (amber badge), triggered (green pulse), target hit (✓ card), SL hit (✗ card), expired (gray).

---

#### `/intraday`

Similar layout to `/signals` but with LIVE WebSocket updates. Top strip: `Live · 127 subscribers seeing this` (social proof). Signals auto-slide in from right. Price ticks pulse. Tier gate: Pro+ only; Free sees 1 signal blurred.

---

#### `/momentum`

Weekly rotation. Top: "Week of 2026-04-15 · Updated Sunday 16:00 IST". 10 stock cards ranked by Qlib + TimesFM + Chronos ensemble. Each card: symbol, 1-week forecast %, rank, model consensus chip, `Add to watchlist` + `Paper trade` buttons. Below: last-week's picks with actual realized return (track record loop).

---

#### `/fo-strategies` (Elite)

**Strategy type grid:** 6 strategy cards (Bull Call Spread / Bear Put Spread / Iron Condor / Short Straddle / Long Straddle / Covered Call). Click → strategy detail.

**Strategy detail:** underlying (Nifty / BankNifty / FinNifty / stock) · expiry selection · strike picker · Greeks panel (Delta / Theta / Vega / Gamma) · P&L payoff chart · AI recommendation (FinRL output) · execute button.

---

#### `/sector-rotation`

**Top:** heatmap 11 NSE sectors × 5 timeframes (1d / 5d / 1m / 3m / YTD). Colored red → green by relative return.

**Below:** "Rotating In" list (top 3 sectors with momentum) / "Rotating Out" list (bottom 3). Each with 30-day sparkline + underlying narrative.

**FII/DII flow chart** (stacked bars).

---

#### `/earnings-calendar`

**Calendar grid:** week view with stock tickers on their earnings dates. Click a stock → pre-earnings modal with XGBoost surprise prediction, concall tone analysis (FinRobot), recommended pre-earnings strategy.

---

#### `/ai-portfolio` (Elite)

**Hero:** current AI SIP portfolio value + this-month's performance + next-rebalance countdown.

**Holdings table:** 10-15 stocks. Cols: symbol, target weight, current weight, drift (red if >2% off), AI confidence, last action.

**Next rebalance preview card:** "Next rebalance Oct 27. Proposed: ADD POLYCAB 4%, REMOVE ZOMATO, INCREASE TITAN +1%. Accept / Modify / Skip."

**Equity curve** vs Nifty benchmark.

**FinRobot analyst report** — 4 collapsible agent outputs (Fundamental / Management tone / Promoter holding / Peer comparison).

---

#### `/auto-trader` (Elite)

**Hero strip:** status (Active / Paused) · `KillSwitchButton` · daily P&L · last-execution timestamp.

**Config card:** max positions · max risk per trade · allowed segments · tier of aggressiveness slider (Conservative → Balanced → Aggressive).

**Recent auto-trades log:** table of last 50 executions with timestamp, symbol, action, reasoning ("AI reduced TCS 40% → 25% because VIX rose to 22").

**Weekly summary report card.**

**Emergency stop:** big red `Disable auto-trader` at bottom.

---

#### `/portfolio`

**Layout (3 tabs):**

1. **Holdings tab:** Table of current open positions + `EquityCurve` + diversification donut (sector breakdown).
2. **History tab:** Closed trades table (paginated). Filters: date, symbol, direction.
3. **Analytics tab:** `PerformanceMetrics` grid + `PnLChart` calendar heatmap + `RiskGauge`.

**Top strip:** total equity · today's change · month's change · vs Nifty · tier badge.

---

#### `/portfolio/doctor`

**Wizard:**

**Step 1:** Upload CSV OR connect broker (broker tiles).

**Step 2:** Processing animation (4 agents running in parallel, shown as 4 progress cards).

**Step 3:** Results. 4 agent reports, collapsible:
- **Fundamental Agent** — per-holding P/E, ROE, Debt/Equity flags.
- **Risk Agent** — concentration warnings, single-stock >10% alerts.
- **Sentiment Agent** — FinBERT flags on any holding with negative news flow.
- **Comparison Agent** — vs Nifty 500 benchmark, alpha/beta, sharpe.

**Bottom:** `Download PDF report` button · `Schedule monthly review` toggle.

---

#### `/scanner-lab` (Pro+)

**Tabs:** Screeners (50+ filters) / Pattern Scanner (11 patterns).

**Screeners tab:**
- Left sidebar: 8 filter categories (Volume / Momentum / Reversal / Breakout / MA / Fundamentals / Options / Custom)
- Right pane: results table (symbol, price, change, matched filter, volume, 52w range, action row)
- Top: search + sort + save-filter button (power-user)

**Pattern Scanner tab:**
- Top: filter by pattern type (Head & Shoulders / Cup & Handle / Bull Flag etc.)
- Grid: pattern result cards. Each card: symbol, mini chart with pattern highlighted, pattern type, BreakoutMetaLabeler confidence tag, "Add to watchlist" + "Full chart" actions.

---

#### `/watchlist`

**Table:** symbol, LTP pulse, day change, 5-min change, AI alert flags (icon row showing regime warning / signal matched / sentiment dip / earnings upcoming). Action: remove / set alert / open detail.

**Top right:** `Add symbol` input with autocomplete.

**Empty:** illustration + "Your watchlist is empty. Search for stocks to track."

---

#### `/stock/[symbol]` (AI Dossier)

**Purpose:** Everything we know about this stock, one page.

**Top:** symbol huge · LTP pulsing · day change · sector chip · add-to-watchlist star · `Trade` button.

**Row 1:** `AdvancedStockChart` full-width (600px tall) with all overlays.

**Row 2 — `ModelConsensusGrid`:** TFT forecast, Qlib rank, LSTM probability, FinBERT sentiment, HMM regime contribution, FinRobot analyst opinion (6 cards).

**Row 3 — Tabs:**
- **Technicals:** indicators table (RSI, MACD, ATR, ADX…) + support/resistance levels + computed score.
- **Fundamentals:** P/E, P/B, ROE, Debt/Equity, Dividend yield, 3y CAGR — all in DM Mono.
- **News:** last 20 headlines with FinBERT sentiment chip per headline.
- **Earnings:** last 8 quarters surprise table + next earnings countdown.
- **F&O:** options chain with Greeks (if F&O enabled).
- **Similar signals:** past signals on this stock with P&L.

**Right sidebar:** Copilot pinned to this stock's context (pre-loaded).

---

#### `/settings`

**Layout:** left-rail tabs, right pane content.

**Tabs:**
1. **Profile** — name, email, phone, avatar upload, delete account.
2. **Broker** — 3 broker tiles (Zerodha / Upstox / Angel One). Each tile = `BrokerConnectTile`. One-click OAuth. Status + last-sync + disconnect.
3. **Notifications** — `AlertStudio` (matrix of event × channel).
4. **Risk profile** — radio: Conservative / Moderate / Aggressive. Each has description + default position-size caps.
5. **Tier** — current tier card + upgrade/downgrade buttons + billing history (Razorpay linked invoices).
6. **Kill switch** — big red toggle + "Pause all for N hours" time picker.
7. **Security** — 2FA setup, active sessions list, change password.
8. **Data** — Download my data (GDPR), export trades CSV.

---

#### `/notifications`

**Layout:** two-column.

**Left (narrow):** filter list (All / Unread / Signals / Trades / Regime / System).

**Right (wide):** list of notifications, chronological. Each item: icon + title + body preview + timestamp + "mark read" toggle. Click → deep link to relevant screen.

---

#### `/marketplace` + `/marketplace/[slug]` + `/my-strategies`

**`/marketplace`:** grid of community strategy cards. Each card: strategy name, creator handle, 30-day WR, subscribers count, price per month (tier-gated), `View` button.

**`/marketplace/[slug]`:** strategy detail. Backtest chart · strategy rules explanation · creator bio · deploy button (Pro+) · subscriber count · reviews.

**`/my-strategies`:** deployed strategies list with per-strategy P&L · pause / resume / remove controls.

---

### 5.4 ADMIN SCREENS

---

#### `/admin` home

**4 stat cards:** MRR · Active users · Signals today · Kill-switch count.

**4 quick panels:** recent signups, recent trades, recent errors, pending payouts (marketplace).

---

#### `/admin/users`

Searchable paginated table. Columns: email, name, tier, signup date, last active, total P&L, kill-switch status, actions (view / impersonate / suspend).

---

#### `/admin/users/[id]`

Tabs: Profile / Trades / Signals / Payments / Support tickets / Logs.

Right sidebar: admin quick-actions (reset password, force tier change, add credits, force kill-switch).

---

#### `/admin/signals`

Live signal monitoring. Grid of today's signals with accuracy so far. Model agreement distribution chart. Ability to manually cancel a signal.

---

#### `/admin/payments`

Razorpay payment ledger. Refund controls. Failed payment retry. Revenue breakdown by tier.

---

#### `/admin/system`

Scheduler job status (last run, success/fail, duration). Model drift per model. DB health. WebSocket connection count. Error rate chart.

---

#### `/admin/ml`

Model versions table. For each model: current prod version, shadow versions, accuracy gates, promote / rollback buttons. Regression test UI (run regression on shadow, show diff vs prod, decide).

---

## 6. States & edge cases (build every one)

For every screen, design these states explicitly:

1. **Loading** — skeleton with shimmer (structural placeholder only, no content).
2. **Empty** — illustration + copy + primary CTA to fix.
3. **Error** — inline banner top of screen, red accent, retry button.
4. **No broker connected** — show inline card "Connect broker to enable live trades" on any screen where broker is required.
5. **Out of credits** — Copilot input shows "You've used your 5 free messages. Upgrade to Pro for 150/day." with upgrade link.
6. **Tier gate** — `FeatureGate` overlay.
7. **Offline** — top banner "You're offline. Reconnecting…" with spinner.
8. **Paper vs live** — persistent pill top-right when viewing positions: "PAPER" amber / "LIVE" teal.
9. **Bear regime warning** — banner variant on signal pages: "Bear regime active. Sizing reduced 50%."
10. **Kill-switch active** — global amber top strip: "All auto-trading paused. Resume or wait N hours."
11. **Market closed** — when market is closed, signals show `Market Closed · Next open Mon 9:15 AM` chip.
12. **SEBI disclaimer** — always footer: "Market investments are subject to risk. Past performance ≠ future."

---

## 7. Responsive rules

**Breakpoints:** 1440 desktop / 1024 tablet-landscape / 768 tablet-portrait / 375 mobile.

**Mobile-specific:**
- Top nav collapses to hamburger + logo + notification bell
- Pillar tabs move to bottom nav (5 icons)
- Copilot panel becomes bottom-sheet
- All grids become single-column
- Tables become cards (each row = card on mobile)
- Charts reduce to essentials (remove sub-overlays)
- Signal carousel becomes vertical scroll

**Min tap target:** 44×44px everywhere.

---

## 8. Accessibility

- All text contrast ≥ 4.5:1 (WCAG AA). Especially check teal on dark.
- DM Mono contrast vs `#111520` card bg — ensure ≥ 4.5:1.
- Every icon button has accessible label.
- All charts have text alternatives (stat summary card above the chart).
- Focus states: 2px `#4FECCD` outline with 2px offset.
- Keyboard nav: tab order follows reading order. Modals trap focus.

---

## 9. Dark mode

Dark is primary and default. Light mode is optional (deferred to later). Design only dark in this round unless specified.

---

## 10. Deliverables I expect from Stitch

For each screen:
1. Desktop artboard (1440px wide).
2. Tablet artboard (1024px).
3. Mobile artboard (375px).
4. All explicit states (loaded / loading / empty / error / + relevant tier gates).

Design system assets:
1. Color tokens (as Figma variables or CSS vars).
2. Type scale.
3. Spacing tokens.
4. Full component library (every component listed in §3) as reusable components with variants.

Export-ready:
- All icons as SVG.
- All illustrations as SVG.
- All charts as Recharts or TradingView Lightweight annotations.

---

## 11. Do not

- Do not use glassmorphism / backdrop-blur on any inner platform surface. Only landing / pricing / auth / modal scrim.
- Do not use emojis in critical UI (signals, trades, money amounts).
- Do not use light-mode pastels.
- Do not use Roboto / Inter / Poppins. DM Sans only.
- Do not use non-tabular numbers. DM Mono + tabular-nums for every number.
- Do not use hover card tilts, parallax scrolling, or decorative shimmer on data tables.
- Do not reference OpenAlgo anywhere — it's been removed from the product.
- Do not over-explain signals with cute copy. Senior analyst voice, numbers first.

---

## 12. One-line summary

> Design Swing AI as if Bloomberg Terminal and Linear had a baby raised by Robinhood in Mumbai. Dense, numeric, transparent. Every claim provable. Every number tabular. Dark. Fast. Indian.
