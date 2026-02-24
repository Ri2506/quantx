# SwingAI - AI-powered swing trading platform for Indian markets

Production-style stack for signal generation, risk management, and broker workflows.

## What this repo includes
- Backend: FastAPI app with Supabase auth/profile, Razorpay payments, signals/trades/portfolio APIs, broker connection storage, notifications, watchlist, dashboard metrics, WebSocket support, and optional scheduler/realtime services.
- Screener: PKScreener integration with 40+ scanners (full routes) plus a fallback screener service.
- Frontend: Next.js 14 app with landing page, auth screens, dashboard, signals, trades, portfolio, analytics, settings, and screener UI.
- ML: 70-feature engineering pipeline, 57 strategy implementations, confluence-only strategy ranking, long-only signal generation, premium filters, and Modal inference endpoints (v1 and v2).
- Infrastructure: Supabase schema, Railway/Vercel configs, and a local dev script.

## Current status (code-backed)
- Backend entrypoint is `src/backend/api/app.py` (the older `src/backend/api/main.py` is a thin wrapper).
- Signal generation (`src/backend/services/signal_generator.py`) is strategy-first with confluence ranking and long-only equity outputs, with XGBoost/TFT confirmations layered into confidence.
- Scheduler and realtime services start in the FastAPI lifespan when `ENABLE_SCHEDULER` / `ENABLE_REDIS` are set; trade execution defaults to a DB-level fallback when broker execution is not wired.
- WebSocket endpoint is `/ws/{token}` (Supabase JWT in path) with basic ping handling; realtime broadcast hooks exist in `src/backend/services/realtime.py`.
- Enhanced AI core can be enabled with `ENABLE_ENHANCED_AI` (uses `ENHANCED_ML_INFERENCE_URL` for v2 inference); the standard pipeline remains the fallback.
- ML training artifacts are not in the repo; `ml/notebooks/` contains a training notebook, while Modal inference expects model files to be uploaded to a Modal volume.
- Frontend uses Supabase auth and backend APIs; it falls back to a mock user when Supabase env vars are missing (dev mode).

## Quick start (local)

```bash
# 1. Environment
cp .env.example .env

# 2. Backend
pip install -r requirements.txt
uvicorn src.backend.api.app:app --reload --port 8000

# 3. Frontend (new terminal)
cd src/frontend
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
│   ├── backend/              # FastAPI backend
│   │   ├── api/              # app.py (main entrypoint) + screener routes
│   │   ├── core/             # config, database, security
│   │   ├── middleware/       # logging, security headers, rate limiting
│   │   ├── services/         # signals, risk, F&O, brokers, screener, scheduler
│   │   ├── schemas/          # Pydantic request/response models
│   │   └── utils/
│   └── frontend/             # Next.js 14 frontend
│       ├── app/              # pages (dashboard, signals, screener, etc.)
│       ├── components/       # dashboard + shared UI components
│       ├── contexts/         # auth
│       ├── hooks/            # data hooks
│       └── lib/              # API client + Supabase
├── ml/                        # feature engineering + strategies + inference
│   ├── features/
│   ├── filters/
│   ├── models/
│   ├── strategies/
│   ├── inference/
│   └── notebooks/
├── infrastructure/
│   └── database/             # Supabase schema
├── docs/                      # technical docs
├── scripts/                   # dev helper
├── railway.toml               # Railway deploy config
├── vercel.json                # Vercel deploy config
└── requirements.txt
```

## Environment variables (backend)

See `.env.example` for the full list. The core variables are:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
FRONTEND_URL=
ML_INFERENCE_URL=
ENHANCED_ML_INFERENCE_URL=
ENABLE_SCHEDULER=false
ENABLE_REDIS=false
REDIS_URL=redis://localhost:6379/0
ENABLE_ENHANCED_AI=false
```

Frontend variables live in Vercel or `.env.local`:

```env
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

## Documentation
- `START_HERE.md`
- `docs/PROJECT_ANALYSIS.md`
- `docs/DEPLOYMENT_GUIDE.md`
- `docs/API_DOCUMENTATION.md`
- `docs/ENHANCED_AI_CORE_V2.md`
- `docs/MODEL_DEPLOYMENT.md`
- `docs/STRATEGIES_SYSTEM.md`
- `docs/release/RELEASE_HARDENING_CHECKLIST.md`
- `docs/release/ROLLBACK_RUNBOOK.md`
- `docs/release/RELEASE_NOTES_2026-02-10.md`
- `FINAL_STRUCTURE.md`
- `DONE.md`

## Tech stack
- Backend: FastAPI, Supabase, Razorpay, APScheduler
- Frontend: Next.js 14, React, Tailwind CSS, Framer Motion
- ML: PyTorch, scikit-learn, CatBoost, XGBoost, feature engineering via `ta`
- Infrastructure: Railway, Vercel, Supabase, Modal

## License
MIT
