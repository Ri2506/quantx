# Quant X

**AI-powered swing trading platform for Indian markets (NSE / BSE).**

Production-grade SaaS combining 11 trained ML models, 4-agent LLM orchestration, regime-aware risk management, and direct broker execution. Three tiers (Free / Pro ₹999 / Elite ₹1,999) with paper trading, live signals, AI auto-trader, and F&O strategy generation.

---

## Status

**v1.0 launch-ready.** 28 idempotent migrations + unified ML training runner + admin command center + launch checklist endpoint. Trainer modules ready to ship to GPU; see [docs/MODEL_TRAINING_GUIDE.md](docs/MODEL_TRAINING_GUIDE.md) and [docs/V1_LAUNCH_RUNBOOK.md](docs/V1_LAUNCH_RUNBOOK.md).

---

## Features (27 in v1)

### Research-doc features (F1–F12)

| # | Feature | Public name | Tier | Engine |
|---|---|---|---|---|
| F1 | AI Intraday Signals (5-min) | TickPulse | Pro | Bi-LSTM ONNX |
| F2 | AI Swing Signals (3-10d) | SwingLens | Free 1/d, Pro unlimited | TFT + Qlib + LGBM ensemble |
| F3 | AI Momentum Picks | HorizonCast | Pro | Qlib + TimesFM + Chronos zero-shot |
| F4 | AI Auto-Trader | AutoPilot | Elite | FinRL-X PPO + DDPG + A2C ensemble |
| F5 | AI SIP Portfolio | AllocIQ | Elite | Qlib quality + FinRobot CoT + PyPortfolioOpt |
| F6 | F&O Options Strategies | VolCast | Elite | VIX TFT + Options-RL PPO + Black-Scholes |
| F7 | Portfolio Doctor | InsightAI | Pro free / Elite unlimited | FinRobot 4-agent LangGraph |
| F8 | Market Regime Detector | RegimeIQ | Public + per-tier sizing | 3-state Gaussian HMM |
| F9 | Earnings Predictor | EarningsScout | Pro / Elite | XGBoost surprise model |
| F10 | Sector Rotation | SectorFlow | Pro | Qlib sector-level + FII/DII flow |
| F11 | Paper Trader + League | — | Free (full) | All signal models feed paper |
| F12 | Telegram + WhatsApp Digest | — | Free (TG) / Pro (WA) | Gemini summarizer |

### Bonus features (B1–B3)

- **B1 Counterpoint** — Bull/Bear LangGraph debate on high-stakes signals (Elite)
- **B2 FinAgent vision** — Multimodal chart + text fusion via Gemini Vision (Pro/Elite)
- **B3 Strategy Marketplace** — Browse/deploy AI strategies, revenue-share (Free/Pro/Elite)

### Synthesis features (N1–N12)

AI Copilot (N1), Per-Stock Dossier (N2), Public Track Record (N3), Public Models page (N4), Onboarding Risk Quiz (N5), Paper Trading League (N6), Kill Switch (N8), Admin Command Center (N9), Weekly Portfolio Review (N10), Alerts Studio (N11), Referral Loop (N12). N7 (AI Learning Module) is permanently out-of-scope.

---

## Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │           USER (Web · Telegram · WhatsApp)       │
                    └─────────────────────┬───────────────────────────┘
                                          │
                          ┌───────────────┼───────────────┐
                          ↓                               ↓
                  ┌──────────────┐                 ┌────────────────┐
                  │   Next.js    │                 │   Telegram /   │
                  │   (Vercel)   │                 │   WhatsApp Bot │
                  └──────┬───────┘                 └────────┬───────┘
                         │ REST + WebSocket                 │
                         ↓                                  ↓
              ┌──────────────────────────────────────────────────────┐
              │                  FastAPI (Railway)                    │
              │  ┌─────────────┬──────────────┬──────────────────┐  │
              │  │ Auth + JWT  │ Tier gating  │  Kill switch     │  │
              │  │ (Supabase)  │ (RequireFeat)│  (system_flags)  │  │
              │  ├─────────────┴──────────────┴──────────────────┤  │
              │  │ SignalGenerator · AutoPilotService             │  │
              │  │ TradeExecutionService · RiskManagementEngine   │  │
              │  │ PaperTradingService · NotificationService      │  │
              │  │ AssistantService (Gemini) · FinRobot agents    │  │
              │  │ APScheduler (22 jobs IST)                      │  │
              │  └─────────────────────────────────────────────────┘  │
              └────────┬────────────────────┬─────────────────────────┘
                       │                    │
            ┌──────────↓──────────┐   ┌─────↓──────────┐
            │  Supabase Postgres  │   │  Backblaze B2  │
            │  49 tables · RLS     │   │  Model artifacts│
            └─────────────────────┘   └────────────────┘
                       ↑
                       │ inference
            ┌──────────┴──────────────────┐
            │  ml/ — 11 trainer modules    │
            │  TFT · HMM · LSTM · LightGBM │
            │  XGBoost · FinRL-X (PPO+DDPG │
            │  +A2C) · TimesFM · Chronos   │
            │  ModelRegistry → model_versions
            └──────────────────────────────┘
```

---

## Quick start (local dev)

```bash
# 1. Clone + Python env
git clone https://github.com/Ri2506/quantx.git
cd quantx
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2. Environment
cp .env.example .env
# Fill in: SUPABASE_URL, SUPABASE_SERVICE_KEY, GEMINI_API_KEY, etc.

# 3. Apply DB migrations (idempotent)
psql "$DATABASE_URL" -f infrastructure/database/migrations/000_schema_migrations.sql
# ... or apply via Supabase dashboard, OR use the Supabase MCP

# 4. Run backend
uvicorn src.backend.api.app:app --reload --port 8000

# 5. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API docs: http://localhost:8000/api/docs

### Run tests

```bash
pytest tests/ -q
# 19/19 passing: trainer-discovery (12) + live-trade-eligibility (7)
```

### Train models (GPU box, one-shot)

```bash
pip install -r requirements-train.txt
python -m ml.training.runner --list      # 11 trainers
python -m ml.training.runner --all --promote
```

See [docs/MODEL_TRAINING_GUIDE.md](docs/MODEL_TRAINING_GUIDE.md) for full per-trainer requirements (data sources, hyperparameters, GPU specs, eval metrics, registry slots).

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 14 (App Router), React, Tailwind 3, Framer Motion, Supabase JS, SWR, TradingView Lightweight Charts |
| Backend | FastAPI, Supabase (Auth + Postgres + Realtime), APScheduler, Pydantic, JWT |
| ML — inference | PyTorch 2, ONNX Runtime, LightGBM, XGBoost, Stable-Baselines3, hmmlearn |
| ML — training (GPU only) | pytorch-forecasting, Chronos-Forecasting, Gymnasium, PyPortfolioOpt, scikit-learn, yfinance |
| LLM | Google Gemini 2.0 Flash (single LLM per project decision) |
| Brokers | Zerodha KiteConnect, Upstox v2, Angel One SmartAPI |
| Payments | Razorpay (subscriptions + webhook) |
| Notifications | Web Push (VAPID), Telegram Bot, WhatsApp Business API, Resend (email) |
| Storage | Backblaze B2 (model artifacts) |
| Hosting | Railway (API), Vercel (frontend), Supabase (DB) |
| Observability | Sentry, PostHog, custom training-runs admin UI |

---

## Project structure

```
quantx/
├── src/backend/                FastAPI service
│   ├── api/                   ~80 routes
│   ├── ai/
│   │   ├── agents/             FinRobot CoT + TradingAgents B/B + Copilot
│   │   ├── earnings/           XGBoost surprise model + transcript ingestion
│   │   ├── fo/                 F&O strategy generator + Greeks
│   │   ├── portfolio/          AI SIP rebalancer
│   │   ├── registry/           ModelRegistry (B2 + Postgres)
│   │   └── vision/             FinAgent multimodal
│   ├── core/                   config, security, tiers, database
│   ├── middleware/             tier_gate, rate_limit, csp, body_cap, sentry
│   ├── observability/          PostHog event enum + helpers
│   └── services/               25+ services (signal_generator, autopilot,
│                               trade_execution, risk_management, scheduler,
│                               assistant, push, broker, market_data, ...)
├── frontend/                   Next.js 14 app
│   ├── app/                    routes (auth, platform, admin, public)
│   ├── components/             50+ shared + tier-specific
│   ├── contexts/               AuthContext (Supabase)
│   ├── hooks/                  useSignals, usePositions, useWebSocket
│   └── lib/                    API client + helpers (abVariant, supabase, ...)
├── ml/                         ML codebase
│   ├── training/
│   │   ├── runner.py           unified end-to-end runner (CLI + API-callable)
│   │   ├── base.py             Trainer protocol
│   │   ├── discovery.py        topo-sort + auto-discovery
│   │   └── trainers/           11 trainer modules (one per model)
│   ├── rl/                     FinRL-X env + ensemble
│   ├── features/               indicators, patterns, volume_analysis (2k+ lines)
│   ├── strategies/             6 hand-coded strategies (Scanner Lab only)
│   ├── backtest/               full harness with transaction costs + heat
│   └── regime_detector.py      MarketRegimeDetector (HMM)
├── infrastructure/database/migrations/  28 idempotent SQL migrations
├── tests/                       pytest suite (12 trainer + 7 eligibility tests)
├── docs/
│   ├── MODEL_TRAINING_GUIDE.md  per-trainer reference (data, hyperparams, eval)
│   ├── V1_LAUNCH_RUNBOOK.md     end-to-end launch checklist
│   ├── SUPABASE_SETUP.md        DB setup + scheduler config
│   ├── STEP_2_AI_STACK_AND_MODELS.md
│   ├── STEP_3_PRODUCTION_ARCHITECTURE.md
│   └── STEP_4_UI_UX_DESIGN.md
├── scripts/                     dev helpers + RunPod launch script
├── pyproject.toml / requirements.txt / requirements-train.txt
├── pytest.ini
├── Dockerfile · railway.toml · vercel.json
└── .env.example
```

---

## Tier matrix (locked)

| Capability | Free | Pro ₹999 | Elite ₹1,999 |
|---|---|---|---|
| Swing signals | 1/day | unlimited | unlimited |
| Intraday signals | — | ✓ | ✓ |
| Momentum picks | — | ✓ | ✓ |
| AutoPilot live execution | — | — | ✓ |
| AI SIP portfolio | — | — | ✓ |
| F&O strategy generator | — | — | ✓ |
| Counterpoint debate | — | — | ✓ |
| Portfolio Doctor | one-off ₹199 | included | unlimited |
| Copilot (Gemini) | 5/day | 150/day | unlimited |
| WhatsApp digest | Telegram only | ✓ | ✓ |
| Scanner Lab | — | ✓ | ✓ |
| Paper trader + League | full | full | full |

---

## Documentation

| Doc | Purpose |
|---|---|
| [docs/MODEL_TRAINING_GUIDE.md](docs/MODEL_TRAINING_GUIDE.md) | Per-trainer reference: data, hyperparams, GPU specs, eval, registry slots. The single source of truth for the GPU operator. |
| [docs/V1_LAUNCH_RUNBOOK.md](docs/V1_LAUNCH_RUNBOOK.md) | End-to-end launch checklist: migrations → training → readiness → tag v1.0.0 |
| [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | DB schema, scheduler config, admin bootstrap |
| [docs/STEP_2_AI_STACK_AND_MODELS.md](docs/STEP_2_AI_STACK_AND_MODELS.md) | Model-by-model spec: HF repo, training recipe, deployment |
| [docs/STEP_3_PRODUCTION_ARCHITECTURE.md](docs/STEP_3_PRODUCTION_ARCHITECTURE.md) | Service boundaries, data layer, observability stack |
| [docs/STEP_4_UI_UX_DESIGN.md](docs/STEP_4_UI_UX_DESIGN.md) | Per-route UI spec, design language, motion design |
| [docs/SECURITY_BROKER_KEY_RECOVERY_RUNBOOK.md](docs/SECURITY_BROKER_KEY_RECOVERY_RUNBOOK.md) | Fernet key rotation procedure |

---

## Environment variables

See [.env.example](.env.example) for the full list. Production-critical:

```env
# Application
SECRET_KEY=                       # Fernet for broker-creds + session signing
APP_VERSION=v1.0.0

# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
SUPABASE_JWT_SECRET=              # required — JWT signature verification

# AI
GEMINI_API_KEY=                   # single LLM for everything

# Brokers
ZERODHA_API_KEY=
UPSTOX_API_KEY=
ANGEL_API_KEY=

# Payments
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Notifications
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
TELEGRAM_BOT_TOKEN=
WHATSAPP_API_TOKEN=
RESEND_API_KEY=

# Model registry (B2)
B2_KEY_ID=
B2_APP_KEY=
B2_BUCKET=quantx-models

# Observability
SENTRY_DSN=
POSTHOG_API_KEY=
```

Frontend variables (Vercel `.env.production` or Vercel dashboard):

```env
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_WS_URL=wss://api.quantx.in/ws
```

---

## Deployment

### Backend → Railway

```bash
railway up --service api
```

`railway.toml` configures the service. After first deploy, set every secret in `railway env`.

### Frontend → Vercel

```bash
vercel deploy --prod
```

`vercel.json` configures the framework. Add env vars in the Vercel dashboard or `vercel env add`.

### Database migrations

Apply once after backend deploy. Idempotent — re-runs safely.

```bash
for f in infrastructure/database/migrations/*.sql; do
  psql "$DATABASE_URL" -f "$f"
done
```

Or use the Supabase MCP / dashboard SQL editor — same effect.

### GPU training

Done once at launch + periodically thereafter. See [docs/V1_LAUNCH_RUNBOOK.md](docs/V1_LAUNCH_RUNBOOK.md) §3.

---

## License

Proprietary — © 2026 Rishi Karthikeyan. All rights reserved.

Contact: rishikarthikeyan.07@gmail.com
