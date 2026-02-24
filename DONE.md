# SwingAI - Project Status

This document summarizes what is currently implemented in the codebase and what still needs integration work.

## Implemented (code present)

### Backend
- FastAPI app with auth, profiles, subscriptions, payments, signals, trades, positions, portfolio, market, broker, notifications, watchlist, dashboard, and WebSocket endpoints.
- PKScreener full routes plus a fallback screener service.
- Scheduler and realtime services are wired behind feature flags; scheduler uses a DB-level trade execution service.
- Risk management engine, F&O trading engine, and broker adapter classes (Zerodha/Angel One/Upstox).

### Frontend
- Next.js 14 app with landing page, auth screens, pricing, dashboard, signals, trades, portfolio, analytics, settings, and screener views.
- API client + React Query hooks wired to backend; Supabase auth with a dev-mode mock user fallback.

### ML/AI
- 70-feature engineering pipeline, hierarchical ensemble (5 models), regime detection, premium filters, dynamic risk manager, and 20 strategy implementations.
- Modal inference endpoints (v1 and v2), plus an enhanced signal generator under `ml/inference/`.

### Infrastructure
- Supabase schema for subscriptions, users, signals, trades, positions, portfolio history, notifications, and other core tables.
- Railway and Vercel configs.

## Integration gaps / TODOs
- Live market data is not wired; signal generation uses simulated features and scheduler price checks use stubs.
- Broker execution is not fully integrated; trade execution defaults to DB-level updates.
- WebSocket server only handles `ping`; channel subscriptions are not implemented yet. Clients must connect to `/ws/{token}` with a Supabase JWT.
- Enhanced AI core / v2 ensemble are not connected to the FastAPI signal generator; backend expects catboost/tft/stockformer scores.
- PKScreener full routes require the `pkscreener` package; otherwise the fallback screener is used.

## Suggested next steps
- Decide the primary inference path (backend generator vs Modal v2) and wire it end-to-end.
- Integrate a live market data feed and broker execution flow.
- Implement WebSocket channel subscriptions to align with the frontend hook.
