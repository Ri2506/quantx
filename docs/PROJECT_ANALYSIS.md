# SwingAI Project Analysis (Code-Backed)

This document reflects the current state of the codebase as it exists on disk. It is meant to be a deep but readable map of what is built, how it fits together, and where integrations are still placeholder-level.

## 1) Purpose and scope
SwingAI is a full-stack swing trading platform for Indian markets. It combines:
- A FastAPI backend for auth, signals, trading workflows, and portfolio data.
- A Next.js frontend for user-facing screens and dashboards.
- An ML/AI layer for signal inference and strategy selection (largely decoupled from the backend today).
- Infrastructure artifacts for Supabase, Railway, and Vercel.

## 2) Architecture at a glance

```
Frontend (Next.js) ──> Backend (FastAPI) ──> Supabase (Auth + Postgres)
         │                    │
         │                    ├─ SignalGenerator (PKScreener + ML inference)
         │                    ├─ Scheduler (APScheduler)
         │                    └─ Realtime services (WebSocket + optional Redis)
         │
         └─ Supabase Auth (client-side)

ML/AI (Modal endpoints) <── optional HTTP call from SignalGenerator
```

## 3) Data model (Supabase)
Defined in `infrastructure/database/complete_schema.sql`. Core tables and relationships:

- `subscription_plans`: Plans and limits (max_positions, pricing, etc).
- `user_profiles`: User trading settings and stats (linked to `auth.users` by `id`).
- `signals`: Daily signals (linked to `user_profiles` by `created_by` if needed).
- `trades`: Trade records referencing `signals`.
- `positions`: Open/closed positions referencing `trades`.
- `portfolio_history`: Daily performance rollups per user.
- `market_data`: Daily market snapshots (Nifty/VIX/etc).
- `notifications`: User-facing notification entries.
- `watchlist`: User watchlist + alert thresholds.
- `model_performance`: Model metrics for `/api/signals/performance`.

Important relationships:
- `trades.signal_id` -> `signals.id`
- `positions.trade_id` -> `trades.id`
- `user_profiles.subscription_plan_id` -> `subscription_plans.id`

## 4) Backend deep dive

### Entrypoint and configuration
- Main app: `src/backend/api/app.py`
- Settings: `src/backend/core/config.py` (env loading, feature flags)
- Legacy wrapper: `src/backend/api/main.py`
- Lifespan hooks initialize realtime + scheduler based on:
  - `ENABLE_REDIS` for Redis-backed WebSocket pub/sub
  - `ENABLE_SCHEDULER` for scheduled jobs

### Auth and profiles
- Auth uses Supabase JWT verification (`get_current_user` in `app.py`).
- Profiles are fetched via service-role key (`get_user_profile`) from `user_profiles`.
- Frontend signup creates `user_profiles` rows directly via Supabase client.

### Signal generation
File: `src/backend/services/signal_generator.py`
- Uses PKScreener CSV download for candidates (GitHub Actions artifacts).
- Falls back to a static list if PKScreener fetch fails.
- Computes features using simulated defaults if live feeds are missing.
- Optional ML inference call to `ML_INFERENCE_URL` (legacy fallback: `MODAL_INFERENCE_URL`).
- Saves generated signals to Supabase.

### Trade lifecycle
File: `src/backend/api/app.py`
- `POST /api/trades/execute`:
  - Validates subscription, trading mode, F&O permissions.
  - Calculates size from `capital` and `risk_per_trade`.
  - Creates `trades` row.
  - If `full_auto`, creates `positions` immediately.
  - If `semi_auto`, trade stays `pending` until approval.
- `POST /api/trades/{id}/approve`:
  - Opens a position and marks trade `open`.
- `POST /api/trades/{id}/close`:
  - Closes trade, computes PnL, marks position inactive.

Scheduler support:
- `src/backend/services/trade_execution_service.py` opens positions at the DB layer for scheduled jobs.

### Portfolio and stats
- `/api/portfolio` computes unrealized PnL from active positions.
- `/api/portfolio/history` reads `portfolio_history`.
- `/api/portfolio/performance` derives aggregated trade metrics.
- `/api/user/stats` aggregates trade and position stats for dashboards.

### Market data
- TrueData integration: `src/backend/services/truedata_client.py` (real-time tick data).
- Data provider factory: `src/backend/services/data_provider.py` with `market_data.py` routing to TrueData or yfinance based on `DATA_PROVIDER` env var.
- Market endpoints in `app.py` read live data when available or return fallback values.

### Broker integration
Files: `src/backend/services/broker_integration.py`, `src/backend/api/broker_routes.py`
- Contains adapter classes for Zerodha (KiteConnect), Angel One (SmartAPI), Upstox.
- `broker_routes.py` provides per-user connect/disconnect, OAuth initiate/callback, positions, holdings, and margin endpoints.
- Credentials are Fernet-encrypted and stored in the `broker_connections` table (composite key: user_id + broker_name).
- All broker routes use centralized settings from `src/backend/core/config.py`.

### Risk management and F&O engine
- `src/backend/services/risk_management.py` defines risk profiles and sizing logic.
- `src/backend/services/fo_trading_engine.py` includes lot sizes, margin, and Greeks.
- These are not currently invoked by `execute_trade` (which uses a simplified sizing model).

### Realtime and WebSocket
File: `src/backend/services/realtime.py`
- `ConnectionManager` handles active sockets and Redis pub/sub (optional).
- `NotificationService` provides broadcast helpers (signals, trades, alerts).
- WebSocket endpoint: `/ws/{token}` in `app.py`.
- Currently only responds to `ping`; client-initiated subscriptions are not handled yet.

### Screener integration
- Full PKScreener routes: `src/backend/api/screener_routes.py`
- Full integration service: `src/backend/services/pkscreener_full.py`
- Fallback screener: `src/backend/services/screener_service.py`
- The app tries full routes first, then falls back if imports fail.

## 5) Frontend deep dive

### App structure
- Next.js App Router under `frontend/app/`
- Pages include dashboard, signals, trades, portfolio, analytics, screener, pricing, settings, auth flows.

### API and data fetching
- API client: `frontend/lib/api.ts` (Axios + Supabase JWT)
- React Query hooks:
  - `frontend/hooks/useSignals.ts`
  - `frontend/hooks/usePositions.ts`
  - `frontend/hooks/useWebSocket.ts`

### Auth flow
- Supabase client: `frontend/lib/supabase.ts`
- Auth context: `frontend/contexts/AuthContext.tsx`
- Dev mode: if Supabase env vars are missing, UI uses a mock user/profile.

### Realtime hooks
- `useWebSocket` defaults to `NEXT_PUBLIC_WS_URL` or `ws://localhost:8000/ws`.
- The hook appends the Supabase JWT automatically (or replaces `{token}` if present in the URL).
- Backend expects `/ws/{token}` with a Supabase JWT in the path.
- Subscription messaging exists in the hook but is not implemented server-side yet.

## 6) ML/AI stack

### Enhanced AI core (not wired to backend)
Files under `ml/`:
- Feature engineering: `ml/features/`
- Filters and regimes: `ml/filters/`
- Ensemble model: `ml/models/hierarchical_ensemble.py`
- Strategies: `ml/strategies/` (57 strategies + selector)
- Enhanced generator: `ml/inference/enhanced_signal_generator.py`

### Modal inference endpoints
- v1: `ml/inference/modal_inference.py` (CatBoost + simulated scores)
- v2: `ml/inference/modal_inference_v2.py` (5-model ensemble)
- Backend uses `ML_INFERENCE_URL` when present, and expects catboost/tft/stockformer scores.

## 7) Runtime flows (current behavior)

### Daily signal generation (scheduler)
1. `SchedulerService.pre_market_scan` runs at 8:30 AM IST.
2. `SignalGenerator.generate_daily_signals` pulls PKScreener candidates.
3. Features are computed (simulated if no feed).
4. Optional ML inference call returns scores.
5. Signals are saved to Supabase.
6. Realtime broadcast (if enabled) publishes new signals.

### Manual trade execution (user-initiated)
1. User calls `POST /api/trades/execute`.
2. Backend calculates size and inserts a `trades` row.
3. For `full_auto`, a `positions` row is opened immediately.
4. For `semi_auto`, user must approve the trade.

### Scheduler-driven trade execution
1. Scheduler finds pending trades at 9:30 AM IST.
2. `TradeExecutionService` opens positions in the DB and marks trades `open`.

### Realtime notifications
- Notifications are sent via `NotificationService`, backed by in-memory or Redis broadcast.
- WebSocket clients receive messages when connected, but only `ping` is handled on the inbound path.

## 8) Known gaps and TODOs
- TrueData real-time data integration is wired (`src/backend/services/truedata_client.py`) but requires production credentials; yfinance is the active fallback.
- Broker adapter classes are wired into per-user routes; live execution needs integration testing with broker sandbox accounts.
- WebSocket channel subscriptions are not implemented in the backend (only `ping` handling).
- Push notification delivery (FCM/APNs) not yet built; UI toggles exist.
- Enhanced AI uses a default account value and empty portfolio context; it is not personalized per user.

## 9) Key files to explore
- Backend API: `src/backend/api/app.py`
- Scheduler: `src/backend/services/scheduler.py`
- Signal generation: `src/backend/services/signal_generator.py`
- Realtime: `src/backend/services/realtime.py`
- Screener routes: `src/backend/api/screener_routes.py`
- Frontend API client: `frontend/lib/api.ts`
- Frontend auth: `frontend/contexts/AuthContext.tsx`
- ML pipelines: `ml/inference/`, `ml/features/`, `ml/strategies/`
