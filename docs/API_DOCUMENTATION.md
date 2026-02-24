# SwingAI API Documentation

This document reflects the endpoints implemented in `src/backend/api/app.py`, broker routes in `src/backend/api/broker_routes.py`, and the screener routes under `src/backend/api/screener_routes.py` (with a fallback in `src/backend/services/screener_service.py`).

## Base URL

Local development:
- http://localhost:8000

OpenAPI:
- http://localhost:8000/api/openapi.json
- http://localhost:8000/api/docs

## Authentication

Most endpoints require a Supabase JWT:

```
Authorization: Bearer <access_token>
```

Tokens come from Supabase auth (email/password or Google OAuth). The backend verifies tokens via `supabase.auth.get_user(token)`.

## Core endpoints

### Health

- `GET /`
- `GET /health`
- `GET /api/health`

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/refresh` (refresh_token query param)
- `POST /api/auth/logout`
- `POST /api/auth/forgot-password` (email query param)
- `GET /api/auth/me` (returns current user info from JWT)

### User

- `GET /api/user/profile`
- `PUT /api/user/profile`
- `GET /api/user/stats`

### Subscription and payments (3 tiers: Free/Starter/Pro)

- `GET /api/plans`
- `POST /api/payments/create-order`
- `POST /api/payments/verify`
- `GET /api/payments/history`

### Signals
- `GET /api/signals/today` (optional: segment, direction)
- `GET /api/signals/{signal_id}`
- `GET /api/signals/history` (optional: from_date, to_date, status, segment, direction, limit)
- `GET /api/signals/performance` (optional: days)

Notes:
- `/api/signals/today` returns grouped arrays: `long_signals`, `short_signals`, `equity_signals`, `futures_signals`, `options_signals`, and `all_signals`.
- Premium gating applies on `signals`: users without an active/trial subscription only receive `is_premium=false` signals.

### Trades
- `GET /api/trades` (optional: status, segment, limit)
- `POST /api/trades/execute`
- `POST /api/trades/{trade_id}/approve`
- `POST /api/trades/{trade_id}/close`

Notes:
- `execute` sizes the trade using the user profile (capital, risk_per_trade, max_positions) and sets status to `pending` for `semi_auto` or `open` for `full_auto`.
- `approve` is used to execute a `pending` trade for `semi_auto` users.
- `close` accepts optional `exit_price` and `reason`.

### Portfolio
- `GET /api/portfolio`
- `GET /api/portfolio/history` (optional: days)
- `GET /api/portfolio/performance`

### Positions
- `GET /api/positions`
- `GET /api/positions/open`
- `GET /api/positions/{position_id}`
- `PUT /api/positions/{position_id}` (update stop_loss and/or target)
- `POST /api/positions/{position_id}/close`

Notes:
- `PUT /api/positions/{position_id}` only updates `stop_loss` and/or `target`.
- `POST /api/positions/{position_id}/close` accepts optional `exit_price` and `reason`.

### Market
- `GET /api/market/status`
- `GET /api/market/data`
- `GET /api/market/risk`

### Broker (per-user encrypted credentials)

- `POST /api/broker/connect` (manual credential entry for any broker)
- `POST /api/broker/disconnect`
- `GET /api/broker/status`
- `POST /api/broker/{broker}/auth/initiate` (OAuth flow for Zerodha/Upstox)
- `GET /api/broker/{broker}/auth/callback` (OAuth callback)
- `GET /api/broker/positions`
- `GET /api/broker/holdings`
- `GET /api/broker/margin`

### Notifications
- `GET /api/notifications` (optional: unread_only, limit)
- `POST /api/notifications/{notification_id}/read`
- `POST /api/notifications/read-all`

### Watchlist
- `GET /api/watchlist`
- `POST /api/watchlist`
- `DELETE /api/watchlist/{symbol}`

### Dashboard
- `GET /api/dashboard/overview`

## WebSocket

```
/ws/{token}
```

A lightweight WebSocket that accepts the Supabase access token in the path and responds to `ping`. Server-side channel subscriptions are not implemented yet; outbound broadcast helpers live in `src/backend/services/realtime.py`.

## Screener API

Two implementations can be registered. By default, the app tries the full PKScreener routes first and falls back to the simplified screener service if import fails.

### Full routes (when `src/backend/api/screener_routes.py` is active)
- `GET /api/screener/info`
- `GET /api/screener/menu`
- `GET /api/screener/scanners`
- `GET /api/screener/scanners/all`
- `GET /api/screener/scan/{scanner_id}`
- `GET /api/screener/scan/category/{category}`
- `GET /api/screener/ai/nifty-prediction`
- `GET /api/screener/ai/trend-forecast/{symbol}`
- `GET /api/screener/ai/ml-signals`
- `GET /api/screener/swing-candidates`
- `GET /api/screener/breakouts`
- `GET /api/screener/momentum`
- `GET /api/screener/vcp`
- `GET /api/screener/reversals`
- `GET /api/screener/institutional`
- `GET /api/screener/bullish-tomorrow`
- `GET /api/screener/volume-surge`
- `GET /api/screener/patterns/{pattern_type}`
- `GET /api/screener/fo/long-buildup`
- `GET /api/screener/fo/short-buildup`
- `GET /api/screener/smart-money/fii-dii`
- `POST /api/screener/backtest`

### Fallback routes (when the screener service is registered)
- `GET /api/screener/menu`
- `GET /api/screener/scanners`
- `GET /api/screener/scan/{scanner_id}`
- `GET /api/screener/swing-candidates`
- `GET /api/screener/breakouts`
- `GET /api/screener/vcp`
- `GET /api/screener/momentum`
- `GET /api/screener/reversals`
- `GET /api/screener/institutional`
- `GET /api/screener/bullish-tomorrow`

## Market Data

The backend supports two market data providers configured via the `DATA_PROVIDER` env var:

- `truedata` — Real-time tick data via TrueData Velocity SDK
- `yfinance` — Delayed data (15-20 min) via Yahoo Finance (default fallback)

## Subscription Plans

3 tiers served by `GET /api/plans`:

| Plan | Price (monthly) | Signals/day | Positions | Mode |
|------|----------------|-------------|-----------|------|
| Free | ₹0 | 5 | 3 | View only |
| Starter | ₹499 | 20 | 5 | Semi-auto |
| Pro | ₹1,499 | Unlimited | 15 | Full-auto |

## Notes

- Rate limiting is enforced by middleware (defaults to 60 requests/minute; configurable via env vars).
- Some endpoints return fallback or simulated data when live data sources are unavailable.
- Full screener routes require the `pkscreener` package; otherwise the fallback screener is used.
- Broker credentials are Fernet-encrypted per user. The `broker_connections` table uses a composite key of (user_id, broker_name).
