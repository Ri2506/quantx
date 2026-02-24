# SwingAI - AI-powered swing trading platform for Indian markets

Production-style SaaS platform for algorithmic swing trading signal generation, risk management, and broker-connected execution on NSE.

## What this repo includes
- **Backend**: FastAPI app with Supabase auth, Razorpay payments, signals/trades/portfolio APIs, per-user broker connection (Zerodha/Angel One/Upstox) with encrypted credentials, push notifications, watchlist, dashboard metrics, WebSocket support, and scheduler/realtime services.
- **Screener**: PKScreener integration with 40+ scanners (full routes) plus a fallback screener service.
- **Frontend**: Next.js 14 app with landing page, auth screens (email + Google OAuth), dashboard, signals, trades, portfolio, analytics, settings (with broker connection UI), screener, and pricing pages.
- **ML**: 6 algorithmic strategies (ConsolidationBreakout, TrendPullback, CandleReversal, BOSStructure, ReversalPatterns, VolumeReversal) with optional XGBoost/TFT model confirmations. Models are optional for beta — strategies work standalone at 100% weight.
- **Infrastructure**: Supabase schema, Docker setup, Railway/Vercel configs, CI workflows, and a local dev script.

## Subscription Plans

| Plan | Price | Signals/day | Positions | Mode | Notifications |
|------|-------|-------------|-----------|------|---------------|
| Free | ₹0 | 5 | 3 | View only | Email |
| Starter | ₹499/mo | 20 | 5 | Semi-auto | Email + Push |
| Pro | ₹1,499/mo | Unlimited | 15 | Full-auto | All channels |

## Current status (code-backed)
- Backend entrypoint is `src/backend/api/app.py`.
- Auth uses Supabase (email/password + Google OAuth). `frontend/` is wired to `AuthContext.tsx` with `signIn()`, `signUp()`, and `signInWithGoogle()`.
- Broker connections are per-user with Fernet-encrypted credentials stored in `broker_connections` table. OAuth flows for Zerodha/Upstox and manual credential entry for all 3 brokers.
- Market data supports TrueData (real-time) with yfinance fallback (delayed). Configured via `DATA_PROVIDER` env var.
- Signal generation (`src/backend/services/signal_generator.py`) uses 6 algorithmic strategies with confluence ranking and long-only equity outputs. XGBoost/TFT confirmations are optional.
- Scheduler runs EOD scan at 15:45 IST and pre-market broadcast at 08:30 IST when `ENABLE_SCHEDULER=true`.
- Trade execution supports paper trading (DB-only) and live trading (broker API via `BrokerFactory`). 14-day paper period before live eligibility.
- Payments via Razorpay with order creation, verification, and webhook support.
- Frontend uses Supabase auth and backend APIs; falls back to a mock user when Supabase env vars are missing (dev mode).

## Quick start (local)

```bash
# 1. Environment
cp .env.example .env

# 2. Backend
pip install -r requirements.txt
uvicorn src.backend.api.app:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

Or run both via:

```bash
./scripts/dev.sh
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API Docs: http://localhost:8000/api/docs

## Project structure

```
SwingAI/
├── src/
│   └── backend/              # FastAPI backend
│       ├── api/              # app.py (main) + broker_routes + screener_routes
│       ├── core/             # config, database, security
│       ├── middleware/       # logging, security headers, rate limiting
│       ├── services/         # signals, risk, F&O, brokers, screener, scheduler
│       ├── schemas/          # Pydantic request/response models
│       └── utils/
├── frontend/                  # Next.js 14 frontend (Vercel deploy source)
│   ├── app/                  # pages (dashboard, signals, screener, pricing, settings, etc.)
│   ├── components/           # dashboard + shared UI components
│   ├── contexts/             # AuthContext (Supabase)
│   ├── hooks/                # data hooks (useSignals, usePositions, useWebSocket)
│   └── lib/                  # API client + Supabase client
├── ml/                        # feature engineering + strategies + inference
│   ├── features/
│   ├── filters/
│   ├── models/
│   ├── strategies/           # 6 algorithmic strategies
│   ├── inference/
│   └── notebooks/
├── infrastructure/
│   └── database/             # Supabase schema + migrations
├── docs/                      # technical docs
├── scripts/                   # dev + QA helpers
├── .env.example               # environment variable template
├── Dockerfile                 # Docker build
├── docker-compose.yml         # Docker Compose (backend + Redis)
├── railway.toml               # Railway deploy config
├── vercel.json                # Vercel deploy config
└── requirements.txt
```

## Environment variables (backend)

See `.env.example` for the full list. Core variables:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
FRONTEND_URL=
DATA_PROVIDER=yfinance         # yfinance | truedata
TRUEDATA_USERNAME=
TRUEDATA_PASSWORD=
ENABLE_SCHEDULER=false
ENABLE_REDIS=false
REDIS_URL=redis://localhost:6379/0
```

Frontend variables live in Vercel or `.env.local`:

```env
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

## Documentation
- `docs/API_DOCUMENTATION.md` — Full API endpoint reference
- `docs/DEPLOYMENT_GUIDE.md` — Railway/Vercel/Supabase deploy steps
- `docs/DEPLOYMENT_GUIDE_UPDATED.md` — Extended deployment guide with broker + Razorpay setup
- `docs/SUPABASE_SETUP.md` — Database schema, scheduler, admin setup
- `docs/PROJECT_ANALYSIS.md` — Code-backed architecture analysis
- `docs/PRODUCTION_TEST_PLAN.md` — E2E test scripts
- `docs/PRD_EOD_SCANNER_UPDATE.md` — EOD signal flow design
- `docs/release/RELEASE_NOTES_2026-02-10.md` — Latest release notes
- `docs/release/ROLLBACK_RUNBOOK.md` — Rollback procedures
- `memory/PRD.md` — Product requirements document

## Tech stack
- **Backend**: FastAPI, Supabase (Auth + Postgres), Razorpay, APScheduler, TrueData/yfinance
- **Frontend**: Next.js 14, React, Tailwind CSS, Framer Motion, Supabase JS
- **ML/Strategies**: PyTorch, scikit-learn, XGBoost (optional), 6 algorithmic strategies via `ta` indicators
- **Brokers**: Zerodha KiteConnect, Angel One SmartAPI, Upstox API
- **Infrastructure**: Railway, Vercel, Supabase, Docker, GitHub Actions CI

## License
MIT
