# SwingAI - Project Status

This document summarizes what is currently implemented in the codebase and what still needs work.

## Implemented (code present and wired)

### Backend

- FastAPI app with auth, profiles, subscriptions, payments, signals, trades, positions, portfolio, market, broker, notifications, watchlist, dashboard, and WebSocket endpoints.
- Supabase JWT authentication with `get_current_user` and `get_user_profile` dependency injection.
- Per-user broker connections with Fernet-encrypted credentials for Zerodha, Angel One, and Upstox. OAuth flows for Zerodha/Upstox and manual credential entry for all 3.
- TrueData real-time market data integration with yfinance fallback. Factory pattern via `DATA_PROVIDER` env var.
- Trade execution pipeline: paper trading (DB-only), semi-auto (approve then execute), full-auto (immediate). 14-day paper trading requirement before live trading eligibility.
- PKScreener full routes plus a fallback screener service.
- Scheduler (APScheduler) for EOD scan at 15:45 IST and pre-market broadcast at 08:30 IST.
- Risk management engine, F&O trading engine, and broker adapter classes.
- 3-tier subscription model (Free/Starter/Pro) with Razorpay payments.
- AI assistant with per-plan credit limits (5 credits/day for free tier).

### Frontend

- Next.js 14 app with landing page, auth screens (email/password + Google OAuth), pricing (3-tier Razorpay checkout), dashboard, signals, trades, portfolio, analytics, settings (profile + trading + broker + push notifications), and screener views.
- Auth flow uses Supabase native OAuth — `AuthContext.tsx` provides `signIn()`, `signUp()`, `signInWithGoogle()`, `signOut()`, and `refreshProfile()`.
- Settings page with 4 tabs: Profile, Trading Preferences, Broker Connection, and Notifications (push-based, no Telegram).
- API client + React Query hooks wired to backend; Supabase auth with a dev-mode mock user fallback.

### ML/AI (Beta: Strategies Only)

- 6 algorithmic strategies: ConsolidationBreakout, TrendPullback, CandleReversal, BOSStructure, ReversalPatterns, VolumeReversal.
- Confluence-based signal ranking with confidence scoring.
- XGBoost and TFT model integrations are optional — code gracefully falls back to 100% strategy weight when models are absent.
- 70-feature engineering pipeline and Modal inference endpoints exist but are not required for beta.

### Infrastructure

- Supabase schema for subscriptions (3 plans), users, signals, trades, positions, portfolio history, notifications, broker connections, and other core tables.
- Docker setup (Dockerfile + docker-compose.yml) for backend + Redis.
- Railway and Vercel configs.
- GitHub Actions CI for backend.
- `.env.example` files for backend and frontend.

## Integration gaps / TODOs for production

### P1 - High Priority

- WebSocket server only handles `ping`; channel subscriptions for real-time price updates not yet implemented.
- Push notification delivery service (FCM/APNs) not yet built — UI toggle exists but backend delivery is a stub.
- TrueData credentials needed for real-time market data in production (currently falls back to yfinance delayed data).

### P2 - Medium Priority

- Live broker execution integration testing with real broker sandbox accounts.
- Kill switch and position monitoring (code exists but needs end-to-end testing).
- Enhanced AI core / v2 ensemble not connected to the production signal generator.

### P3 - Future

- PDF report generation for trade history.
- Advanced portfolio analytics and performance attribution.
- Mobile app or PWA.
- Backtesting module with historical data.
