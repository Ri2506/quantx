# Step 3 — Production App Architecture Upgrade

> **2026-04-18 override:** Broker strategy reversed — direct OAuth to Zerodha + Upstox + Angel One. OpenAlgo removed from the product entirely. Where this doc references OpenAlgo or `OpenAlgoAdapter`, treat it as superseded by `memory/project_broker_strategy_2026_04_18.md`.

> Step 3 of 4. Takes the features from Step 1 and the AI stack from Step 2 and figures out how the entire runtime holds together in production. Built on your existing FastAPI + Next.js + Supabase + Railway + Vercel + Gemini + Backblaze B2 + Colab Pro stack, with direct broker OAuth (Zerodha / Upstox / Angel One) in the trade-execution layer.
>
> **Guiding principle: stay monolithic until revenue says otherwise.** Solo founder doesn't need k8s, service meshes, or a microservices graph. Clear internal module boundaries inside a single FastAPI app. Migration path to true microservices is clean if we ever need it.
>
> **Locked constraints from Steps 1-2** (enforced throughout):
> - Gemini 2.0 Flash is the only LLM. OpenAlgo is the only broker adapter. Colab Pro for GPU training. Backblaze B2 + Postgres `model_versions` for registry. 3 tiers: Free / Pro / Elite. Pattern engine standalone. Mobile deferred.

---

## 0 — Where we are vs where we go

| Aspect | Current (per audits) | Target (Step 3) |
|---|---|---|
| Backend shape | ~20 services in `src/backend/services/`, some overlap, some stubs filled | ~14 cohesive modules with clear boundaries |
| ML code location | `ml/` folder (backend imports from it) + `src/backend/services/model_registry.py` | Consolidated under `src/backend/ai/` with sub-packages per layer |
| Broker integration | 3 SDKs wired (Zerodha / Angel / Upstox) + OAuth per broker | 1 OpenAlgo adapter, per-user OpenAlgo URL stored encrypted |
| LLM orchestration | Gemini via `AssistantService` only, no agent graphs | LangGraph over Gemini with 5 agent graphs + shared prompt registry |
| Model serving | `ModelRegistry` loads from hardcoded file paths; 4 models orphaned | ModelRegistry loads via B2 URIs from `model_versions` table, hot-reload on promotion |
| Real-time pipeline | `BrokerTickerManager` disabled by default; WebSocket broadcaster exists | Kite-via-OpenAlgo → Redis Streams → inference workers → Supabase Realtime → frontend |
| Scheduler | 12 APScheduler jobs | 22 jobs, organized by domain, retry-on-failure, Slack/Telegram alerts |
| Security | JWT signature verification DISABLED ([app.py:145](../src/backend/api/app.py)), admin routes rely on unverified email claim, WebSocket token in URL, permissive CSP | Signature verified, `is_admin` column, WebSocket bearer header, tight CSP |
| Observability | Logs only; no error tracking; no analytics | Sentry + PostHog + custom Signal Accuracy Dashboard in admin |
| CI/CD | GitHub Actions exist (ci.yml, deploy.yml, release-hardening-gates.yml) | Tightened: lint + typecheck + tests + secret scan + regression gates on model promotion |
| DB migrations | Multiple migration files in `infrastructure/database/migrations/` | One consolidated v1 migration for all Step-1/2/3 schema adds |

---

## 1 — Backend module redesign (monolith, clean boundaries)

**Goal:** every file has one reason to change, one owner concept. New engineers read three directory names and know where to look.

### Proposed layout

```
src/backend/
├── api/                          # HTTP route handlers (thin — no business logic)
│   ├── app.py                    # FastAPI entrypoint + middleware registration
│   ├── auth_routes.py
│   ├── signals_routes.py
│   ├── trades_routes.py
│   ├── positions_routes.py
│   ├── portfolio_routes.py
│   ├── paper_routes.py
│   ├── broker_routes.py          # OpenAlgo connect/status/disconnect (not per-broker OAuth)
│   ├── market_routes.py
│   ├── screener_routes.py        # Scanner Lab backend
│   ├── watchlist_routes.py
│   ├── notifications_routes.py
│   ├── push_routes.py
│   ├── assistant_routes.py       # Gemini chat + Copilot
│   ├── regime_routes.py          # public regime endpoint (F8)
│   ├── track_record_routes.py    # public track record (N3)
│   ├── models_routes.py          # public model-accuracy stats (N4)
│   ├── momentum_routes.py        # F3
│   ├── sector_rotation_routes.py # F10
│   ├── fo_routes.py              # F6 F&O strategies
│   ├── earnings_routes.py        # F9
│   ├── ai_portfolio_routes.py    # F5 AI SIP
│   ├── auto_trader_routes.py     # F4
│   ├── portfolio_doctor_routes.py # F7
│   ├── marketplace_routes.py     # B3 (existing, wire frontend in Step 4)
│   ├── payments_routes.py
│   ├── admin_routes.py
│   └── websocket_routes.py       # /ws/* endpoints
│
├── core/                         # infra primitives — no business logic
│   ├── config.py                 # env-vars → settings singleton
│   ├── database.py               # Supabase client factory + RLS helpers
│   ├── auth.py                   # JWT verification + get_current_user + admin gate
│   ├── fernet.py                 # encryption for broker credentials
│   ├── logging.py                # structured JSON logging + correlation IDs
│   ├── rate_limit.py
│   ├── security_headers.py       # CSP + X-Frame + etc.
│   ├── errors.py                 # exception handlers + error envelopes
│   └── deps.py                   # FastAPI dependency functions (get_current_user, get_admin, etc.)
│
├── domain/                       # domain models + DTOs — Pydantic v2
│   ├── user.py                   # User, UserProfile, RiskProfile, Tier
│   ├── signal.py                 # Signal, TradeSignal, BreakoutSignal
│   ├── trade.py                  # Trade, ExecutionMode, OrderType
│   ├── position.py
│   ├── portfolio.py
│   ├── paper.py
│   ├── notification.py
│   ├── payment.py
│   ├── regime.py
│   └── market_context.py
│
├── ai/                           # ALL AI code, consolidated from ml/ + services
│   ├── engine.py                 # SignalGenerator replacement — multi-model ensemble orchestrator
│   ├── config.py                 # fusion weights: QLIB_WEIGHT, TFT_WEIGHT, LGBM_WEIGHT, HGNC_WEIGHT, etc.
│   │
│   ├── forecasting/              # L1 — TS foundation models
│   │   ├── timesfm_predictor.py
│   │   ├── chronos_predictor.py
│   │   └── ensemble.py           # weighted fusion across TimesFM + Chronos
│   │
│   ├── quant/                    # L2 — LightGBM, XGBoost
│   │   ├── qlib_engine.py        # main swing ranker
│   │   ├── qlib_sector.py
│   │   ├── qlib_quality.py       # F5 screener
│   │   ├── xgboost_earnings.py   # F9
│   │   └── nse_data_handler.py   # custom Qlib data handler for NSE
│   │
│   ├── deep/                     # L3 — TFT, LSTM, GRU
│   │   ├── tft_swing.py          # existing TFT, wired
│   │   ├── tft_vix.py            # F6 VIX forecaster
│   │   ├── lstm_intraday.py      # F1
│   │   └── onnx_serving.py       # shared ONNX inference utilities
│   │
│   ├── sentiment/                # L4 — FinBERT-India + Gemini-HGNC
│   │   ├── finbert_india.py
│   │   ├── gemini_hgnc.py        # replaces FinGPT HG-NC
│   │   ├── news_ingest.py        # RSS + NSE announcements
│   │   └── news_clustering.py
│   │
│   ├── agents/                   # L5 — LangGraph + Gemini
│   │   ├── gemini_client.py      # shared Gemini client (wraps existing AssistantService)
│   │   ├── prompts/              # Jinja2 templates
│   │   │   ├── explain_signal.j2
│   │   │   ├── weekly_review.j2
│   │   │   ├── digest_morning.j2
│   │   │   ├── digest_evening.j2
│   │   │   ├── finrobot_fundamental.j2
│   │   │   ├── finrobot_risk.j2
│   │   │   ├── finrobot_sentiment.j2
│   │   │   ├── finrobot_comparison.j2
│   │   │   ├── finrobot_earnings_transcript.j2
│   │   │   ├── tradingagents_bull.j2
│   │   │   ├── tradingagents_bear.j2
│   │   │   ├── tradingagents_risk.j2
│   │   │   ├── tradingagents_trader.j2
│   │   │   ├── copilot_system.j2
│   │   │   └── finagent_vision.j2
│   │   ├── finrobot_portfolio_doctor.py  # F7, 4-agent graph
│   │   ├── finrobot_ai_sip.py            # F5, fundamental-verification graph
│   │   ├── finrobot_earnings.py          # F9, transcript analyzer
│   │   ├── tradingagents_debate.py       # B1, 7-agent graph
│   │   ├── ai_copilot.py                 # N1, single-agent with tool-use
│   │   ├── finagent_vision.py            # B2, chart-image + text fusion via Gemini native vision
│   │   ├── signal_explainer.py           # per-signal explanation
│   │   ├── weekly_reviewer.py            # N10
│   │   └── digest_summarizer.py          # F12
│   │
│   ├── regime/                   # L6 — HMM + Chronos-2 covariates
│   │   ├── hmm_detector.py       # existing, wired
│   │   └── chronos_macro.py      # macro-covariate regime persistence
│   │
│   ├── portfolio_opt/            # L7 — PyPortfolioOpt
│   │   └── black_litterman.py
│   │
│   ├── rl/                       # L8 — Stable-Baselines3
│   │   ├── finrl_x_ensemble.py   # PPO + DDPG + A2C for F4
│   │   ├── options_ppo.py        # F6
│   │   └── env_adapter.py        # NSE env wrapper for FinRL-X
│   │
│   ├── patterns/                 # Scanner Lab only (NOT alpha — per Step 1 §3.1)
│   │   ├── engine.py             # moved from ml/features/patterns.py
│   │   ├── meta_labeler.py       # BreakoutMetaLabeler wrapper
│   │   └── indicators.py         # moved from ml/features/indicators.py
│   │
│   ├── registry/                 # model registry — B2 + Postgres
│   │   ├── model_registry.py     # load / promote / shadow / rollback
│   │   ├── b2_client.py          # thin Backblaze wrapper
│   │   └── versions.py           # Postgres `model_versions` table ORM
│   │
│   └── training/                 # helpers used by Colab notebooks
│       ├── data_loader.py        # yfinance + jugaad-data ingestion
│       ├── feature_engineering.py  # moved from services/, expanded w/ Alpha158
│       ├── evaluation.py         # walk-forward + transaction costs + IC + Sharpe
│       └── promote.py            # register new model version + shadow-mode flow
│
├── brokers/                      # OpenAlgo only (code kept, but singular)
│   ├── openalgo_adapter.py       # only active adapter
│   ├── broker_factory.py         # trivially wraps openalgo_adapter
│   ├── credentials.py            # Fernet-encrypted per-user OpenAlgo URL/key
│   └── _legacy/                  # Zerodha/Angel/Upstox code in case OpenAlgo ever fails
│       ├── zerodha.py
│       ├── angelone.py
│       └── upstox.py
│
├── data/                         # market data layer
│   ├── market_data.py            # MarketData facade (yfinance + Kite-via-OpenAlgo)
│   ├── yfinance_provider.py
│   ├── kite_provider.py          # via OpenAlgo
│   ├── jugaad_provider.py        # NSE bhavcopy fallback
│   ├── nse_announcements.py      # corporate actions, earnings calendar
│   ├── fii_dii.py                # FII/DII flow ingestion
│   ├── universe_screener.py
│   └── instrument_master.py
│
├── trading/                      # order execution + risk
│   ├── execution_service.py      # TradeExecutionService — paper + live
│   ├── risk_engine.py            # RiskManagementEngine + VIX overlay + Kelly
│   ├── fo_engine.py              # F&O contract selection, Greeks, options chain
│   ├── kill_switch.py            # per-user + global
│   └── position_manager.py
│
├── scheduler/                    # 22-job APScheduler setup
│   ├── scheduler_service.py      # registration + retry wrapper
│   ├── jobs/
│   │   ├── market_open.py        # 6:05, 6:10, 8:15, 8:30, 8:45, 9:15 jobs
│   │   ├── intraday.py           # 5-min LSTM inference during market hours
│   │   ├── eod_scan.py           # 15:40-15:55 jobs (Qlib + Chronos + TFT + signal gen)
│   │   ├── sentiment_refresh.py  # 16:30
│   │   ├── earnings_predictor.py # 17:00
│   │   ├── market_close.py       # 15:30 lifecycle
│   │   ├── paper_snapshot.py     # 23:00 daily
│   │   ├── ai_portfolio_rebalance.py  # monthly
│   │   ├── weekly_review.py      # Sunday 18:00
│   │   └── regime_update.py      # 8:15 + intraday on VIX spike
│   └── alerts.py                 # Telegram/Slack when job fails or skews
│
├── notifications/                # Telegram + WhatsApp + Email + Push
│   ├── telegram_bot.py
│   ├── whatsapp_business.py
│   ├── email_resend.py
│   ├── web_push.py               # VAPID
│   ├── in_app.py                 # DB notifications table
│   └── notification_service.py   # facade, routes by user preference + alert type
│
├── realtime/                     # live data pipelines
│   ├── kite_websocket.py         # OpenAlgo-proxied tick stream consumer
│   ├── redis_streams.py          # tick buffer for intraday LSTM
│   ├── supabase_realtime.py      # publish signal/trade/position events
│   └── websocket_manager.py      # per-user connection map + authenticated channels
│
├── payments/
│   ├── razorpay_client.py
│   ├── subscription_service.py   # tier upgrades/downgrades
│   └── webhook_handler.py        # signature verification + event router
│
├── integrations/                 # 3rd-party wrappers
│   ├── supabase.py               # client factory + retry + RLS helpers
│   ├── sentry.py
│   ├── posthog.py
│   └── openalgo.py               # HTTP/WebSocket client for user's OpenAlgo instance
│
├── middleware/                   # FastAPI middleware
│   ├── logging_middleware.py
│   ├── rate_limit_middleware.py
│   ├── security_headers_middleware.py
│   ├── correlation_id_middleware.py
│   └── tier_gate_middleware.py   # NEW — enforces tier-based route access
│
└── main.py                       # kept tiny — just imports app from api/app.py
```

### Migration from current structure to new

- `ml/features/patterns.py` → `src/backend/ai/patterns/engine.py`
- `ml/features/indicators.py` → `src/backend/ai/patterns/indicators.py` (indicators used by Scanner Lab only; signal pipeline gets its own via `ai/training/feature_engineering.py`)
- `ml/features/volume_analysis.py` → `src/backend/ai/patterns/volume_analysis.py`
- `ml/scanner.py` → DELETED (6 hand-coded strategies removed from default per Step 1)
- `ml/strategies/*` → moved to `src/backend/ai/patterns/_legacy_strategies/` for admin backtest reference only
- `ml/regime_detector.py` → `src/backend/ai/regime/hmm_detector.py`
- `ml/backtest/*` → `src/backend/ai/training/backtest/` (only called by Colab notebooks + admin backtest endpoints)
- `ml/models/*.pkl/.ckpt` → move to Backblaze B2; `model_versions` Postgres table points at B2 URIs
- `src/backend/services/signal_generator.py` → `src/backend/ai/engine.py`
- `src/backend/services/live_screener_engine.py` → `src/backend/api/screener_routes.py` + `src/backend/ai/patterns/scanner_lab_backend.py`
- `src/backend/services/quantai_engine.py` → folded into `src/backend/ai/quant/qlib_engine.py` (stays as LightGBM ranker; superseded by Qlib Alpha158 as main model)
- `src/backend/services/sentiment_engine.py` → `src/backend/ai/sentiment/` package (Gemini fallback preserved, FinBERT-India as primary)
- `src/backend/services/model_registry.py` → `src/backend/ai/registry/model_registry.py` with B2 + Postgres backend
- `src/backend/services/assistant/` → `src/backend/ai/agents/` (AssistantService becomes the `gemini_client.py` wrapper; embedded Copilot agent is an agent graph)
- `src/backend/services/broker_*.py` → `src/backend/brokers/`
- `src/backend/services/market_data.py` + providers → `src/backend/data/`
- `src/backend/services/scheduler.py` → `src/backend/scheduler/scheduler_service.py` + job modules
- `src/backend/services/push_service.py` → `src/backend/notifications/`
- `src/backend/services/realtime.py` → `src/backend/realtime/`
- `src/backend/services/fo_trading_engine.py` → `src/backend/trading/fo_engine.py`
- `src/backend/services/risk_management.py` → `src/backend/trading/risk_engine.py`
- `src/backend/services/trade_execution_service.py` → `src/backend/trading/execution_service.py`
- `src/backend/services/broker_ticker.py` → `src/backend/realtime/kite_websocket.py`

Keep a **one-PR-per-package** migration plan — don't try to do this as one giant PR. Order: registry → brokers → data → trading → ai/patterns → ai/sentiment → ai/quant → ai/deep → ai/agents → ai/forecasting → ai/regime → ai/rl → scheduler → notifications → realtime → api/*. Each PR moves files + updates imports + passes tests before merging.

### Why this shape, not microservices

- Single process, single deploy artifact. Easy to reason about.
- One DB, one Redis, one config. No cross-service auth.
- Imports enforce boundaries — Python's module system is the only "API contract" between modules.
- When a module needs to scale independently (e.g., `ai/agents/` if Gemini calls balloon), extract it to a worker process behind a queue — zero protocol redesign.

---

## 2 — Real-time data pipeline (F1 Intraday + signal push + auto-trader)

### The flow

```
User's own OpenAlgo instance
   │ (WebSocket, Kite protocol under the hood)
   ▼
OpenAlgoTickConsumer  (our backend, one worker)
   │  Subscribes to Nifty 50 + Bank Nifty + user's custom watchlist
   ▼
Redis Streams  ("ticks:{symbol}")
   │  5-min aggregation consumer
   ▼
BarAggregator  →  writes OHLCV 5-min bars to Postgres (tick_bars table)
   │
   ▼
IntradayLSTMWorker  (triggered every 5 min during market hours)
   │  Loads latest 60-bar window from tick_bars
   │  ONNX inference on Nifty 50 + Bank Nifty heavy
   │  Produces Signal{signal_type='intraday', ...}
   ▼
signals table (insert)  →  Supabase Realtime trigger
   │
   ▼
WebSocketManager  →  pushes NEW_SIGNAL event to user's open browser tabs
   ▼
Frontend /dashboard updates in < 500ms end-to-end
```

### Components

**OpenAlgoTickConsumer** (`src/backend/realtime/kite_websocket.py`):
- One long-lived process subscribing to OpenAlgo's Kite WebSocket bridge.
- Each user running their own OpenAlgo gives us their URL in settings — we connect with their auth.
- For v1 single-tenant backend scenario, a single shared OpenAlgo instance can feed all users (acceptable while user count < 1000).
- Reconnect with exponential backoff on disconnect. Auto-resubscribe to symbols of all online users.
- Writes raw ticks to Redis Streams only — no DB writes on hot path.

**BarAggregator** (same module):
- Consumer of Redis Streams, produces 5-min bars.
- Writes completed bars to Postgres `tick_bars(symbol, bar_time, open, high, low, close, volume)`.
- Keeps last 120 bars per symbol in Redis for fast LSTM feature building.

**IntradayLSTMWorker** (`src/backend/scheduler/jobs/intraday.py`):
- Scheduler-triggered every 5 min, market hours only (9:20 - 15:25 IST).
- Reads feature tensor from Redis (8 features × 60 bars × N symbols).
- ONNX inference (single batch across all symbols, <500ms CPU).
- Applies FinBERT-India sentiment gate (batch scoring of last hour news per symbol).
- Emits signals with entry/target/stop to `signals` table.

**Supabase Realtime publishing:**
- Supabase publishes row changes on `signals`, `trades`, `positions` tables automatically when Realtime is enabled per table (already supported in DB audit).
- Frontend subscribes via `@supabase/supabase-js` client — no custom WebSocket protocol needed for DB-event broadcast.

**Custom WebSocket channel** (`src/backend/realtime/websocket_manager.py`):
- For events that aren't DB rows: regime change pings, auto-trader activity summary, debate-agent thinking status.
- Authenticated per user via **bearer header** (not URL query param — fix the security issue flagged in frontend audit).
- Connection lifecycle managed in Redis (pod-agnostic, handles Railway restarts).

### Why Redis Streams (not Kafka, not RabbitMQ)

- Single Redis instance on Railway $5/mo tier.
- Streams give us consumer groups, replay, and TTL without a separate message broker.
- Throughput budget: 50 symbols × 300 ticks/min = 15K ticks/min — well within Redis capacity.
- Migration to Kafka is possible when throughput crosses 1M ticks/min, which won't happen at v1 scale.

### Fallback when Redis is down

- OpenAlgoTickConsumer buffers in memory for 30s then drops; logs warning to Sentry.
- IntradayLSTMWorker skips the cycle if Redis unavailable; resumes on next 5-min tick.
- Signal pipeline continues for EOD (non-intraday) features since they read directly from Postgres.

---

## 3 — LLM orchestration (LangGraph over Gemini)

All 5 agent graphs + 3 standalone Gemini tasks (signal explainer, weekly review, digest summarizer) share:

**Single Gemini client** (`src/backend/ai/agents/gemini_client.py`):
- Wraps `google-genai` library.
- Pool rate-limit tracking (Gemini Flash: 60 RPM paid tier, 10 RPM free; we budget at 30 RPM to leave headroom).
- Exponential backoff on 429s.
- Token accounting: every call logs `(task_type, input_tokens, output_tokens, cost_usd)` to `gemini_call_log` table → powers cost dashboard in admin.
- Cache layer: keyed by `hash(prompt + input_data)`; TTL 24h for deterministic tasks (explanations, weekly reviews), no cache for agent debate.

**Shared prompt registry** (`src/backend/ai/agents/prompts/`):
- 15 Jinja2 templates (listed in Step 2 §1.1).
- Every template has a **schema lock** — the prompt lists exact numeric slots that must be substituted from structured input; LLM never generates those numbers.
- Version-controlled in git; changes require a PR that includes a regression test against 20 golden signals.

**Agent graphs** (LangGraph `StateGraph`):

**F7 Portfolio Doctor** — 4 parallel analysts → synthesizer:
```
[User uploads CSV or connects OpenAlgo]
   │
   ▼ (parallel)
┌─ FundamentalAgent (scrapes Screener.in, scores each holding)
├─ RiskAgent (concentration + VaR + beta)
├─ SentimentAgent (FinBERT-India scores per holding)
└─ ComparisonAgent (vs Nifty 500 risk-adjusted)
   │
   ▼
ExplainerAgent (synthesizes 4 outputs → markdown report)
   │
   ▼
WeasyPrint → PDF → Backblaze B2 upload → signed download URL
```

**B1 TradingAgents Bull/Bear Debate** (triggered only for position size > 2% of portfolio or regime transitioning):
```
[Signal row in DB]
   │
   ▼ (parallel)
┌─ FundamentalsAnalyst
├─ TechnicalAnalyst
└─ SentimentAnalyst  (all three read signal + model scores)
   │
   ▼ (parallel, both see all 3 above)
┌─ BullResearcher (makes case FOR)
└─ BearResearcher (makes case AGAINST)
   │
   ▼
RiskManager (reads portfolio state + both researcher outputs)
   │
   ▼
Trader (final synthesis → debate_transcript + final stance)
   │
   ▼
signal_debates table row
```

**F5 FinRobot AI SIP** — fundamental verification graph (similar shape, 3 agents).

**F9 FinRobot Earnings Transcript** — single-pass Gemini call with transcript + analyst reports + historical beat/miss context → forecast.

**N1 AI Copilot** — single agent with tool-use:
- System prompt: "You are a senior quant analyst embedded in Rishi's trading app."
- Tools defined: `get_signals_today()`, `get_user_portfolio()`, `explain_signal(id)`, `get_regime()`, `get_stock_dossier(symbol)`, `get_paper_pnl()`, `get_watchlist()` — all thin wrappers over our own API.
- Conversation history in Redis, 1-hour TTL.
- Per-tier message limits enforced (Free 5/day, Pro 150/day, Elite unlimited).

### Token + cost budget

| Task | Calls/day at 100 users | Tokens/call | Cost/day |
|---|---|---|---|
| Signal explanations | ~500 | 2K input + 500 output | $0.40 |
| Weekly reviews | 100/7 ≈ 15 | 3K + 1K | $0.05 |
| Digest summary | 100 × 2 = 200 | 1K + 500 | $0.15 |
| AI Copilot (N1) | ~200 messages | 2K + 500 | $0.15 |
| Gemini-HGNC (top-50 candidates) | 50 | 5K + 500 | $0.20 |
| TradingAgents debate (Elite only, ~10% of signals) | ~30 | 15K + 3K | $0.80 |
| FinRobot Portfolio Doctor (Pro on-demand) | ~20 reports × 4 agents | 2K + 500 | $0.20 |
| FinAgent Vision (B2, on-demand) | ~50 | 3K + text + image | $0.30 |
| **Daily total** | | | **~$2.30** |
| **Monthly at 100 users** | | | **~$70** |

At 1,000 users: ~$400/mo Gemini spend. Still cheap. Frontier-model alternatives (GPT-4o / Claude 3.5 Sonnet) would be 10-20× more expensive — validates the Gemini-only decision.

### Fallback when Gemini is unavailable

- Signal explanations: fall back to deterministic template that cites model scores (`"Pattern: bull_flag. TFT +2.1%. LGBM buy 0.72. HMM: Bull."`).
- Weekly review: skip this week; send "manual review coming Sunday" email.
- Copilot: return `"I'm temporarily offline — try again in a minute."` rather than failing hard.
- HGNC: skip the sentiment gate; trust TFT + Qlib + LSTM ensemble.
- TradingAgents debate: skip debate, show "Debate unavailable — proceeding without it."

All fallback paths defined in a single `AgentFallbackPolicy` class — easy to audit and tune.

---

## 4 — Model serving + ModelRegistry

### The registry (B2 + Postgres)

`src/backend/ai/registry/model_registry.py`:

```python
class ModelRegistry:
    def __init__(self, db, b2_client, local_cache_dir="/tmp/swingai-models"):
        self.db = db
        self.b2 = b2_client
        self.cache = local_cache_dir
        self._loaded = {}  # in-process cache

    async def load(self, model_name: str, version: int | None = None):
        """Returns model object. Downloads from B2 on first call, caches locally."""
        if model_name in self._loaded:
            return self._loaded[model_name]
        # Query model_versions for is_prod=true (or specific version)
        row = await self.db.fetch_one(
            "SELECT version, artifact_uri FROM model_versions "
            "WHERE model_name = :m AND (version = :v OR (:v IS NULL AND is_prod = true)) "
            "ORDER BY version DESC LIMIT 1",
            {"m": model_name, "v": version}
        )
        local_path = self._download_if_missing(row["artifact_uri"])
        self._loaded[model_name] = self._deserialize(model_name, local_path)
        return self._loaded[model_name]

    async def promote(self, model_name: str, version: int, user: str):
        """Atomically flip is_prod. Also runs pre-flight regression check."""
        passed, metrics = await self._preflight_regression(model_name, version)
        if not passed:
            raise ValueError(f"Regression check failed: {metrics}")
        await self.db.execute_in_transaction([
            "UPDATE model_versions SET is_prod = false WHERE model_name = :m",
            "UPDATE model_versions SET is_prod = true WHERE model_name = :m AND version = :v",
        ], {"m": model_name, "v": version})
        # Invalidate in-process cache on all pods via Redis pubsub
        await self._broadcast_reload(model_name)

    async def shadow(self, model_name: str, version: int):
        """Enable A/B shadow — new model runs in parallel with prod, logs predictions to
        signals_shadow for diff analysis. No user impact until promoted."""
        ...

    async def rollback(self, model_name: str):
        """Flip is_prod back to previous version."""
        ...
```

### Serving latency targets per layer

| Layer | Model | Deploy | Latency target |
|---|---|---|---|
| L1 | TimesFM | ONNX CPU on Railway (batch nightly) | <500ms |
| L1 | Chronos-Bolt | AutoGluon CPU (batch nightly) | <500ms |
| L1 | Chronos-2 | HF Inference Endpoint (on-demand) OR Colab cron | <2s |
| L2 | Qlib LightGBM (swing/sector/quality) | native LightGBM CPU | <50ms |
| L2 | XGBoost earnings | native CPU | <50ms |
| L3 | TFT swing + TFT VIX | ONNX CPU | <300ms |
| L3 | LSTM intraday | ONNX CPU | <50ms |
| L4 | FinBERT-India | ONNX CPU self-hosted | <200ms |
| L4 | Gemini-HGNC | Gemini API | <2s |
| L5 | LangGraph agents | Gemini API | 2-10s per agent |
| L6 | HMM regime | hmmlearn CPU | <10ms |
| L7 | PyPortfolioOpt BL | CPU | <100ms |
| L8 | FinRL-X inference | CPU (after Colab training) | <100ms |
| L8 | Options PPO | CPU | <100ms |

Everything except Chronos-2 and LangGraph agents fits on Railway CPU. Total inference infrastructure = Railway Hobby $5-20/mo.

### Hot reload on promotion

When admin promotes a new model version via MLflow-alternative registry:
1. `ModelRegistry.promote()` updates `is_prod` flag.
2. Publishes Redis pubsub message `model:reload:{model_name}`.
3. All backend pods subscribe to this channel; on message, clear local cache for that model name.
4. Next request triggers re-download from B2.
5. Zero downtime.

---

## 5 — Scheduler (22 jobs, organized by domain)

All jobs run in Asia/Kolkata timezone. APScheduler with AsyncIOScheduler + SQLAlchemyJobStore (persists across restarts). Each job wrapped in:

- **Retry policy:** 3 retries with exponential backoff for transient errors (DB unavailable, API 5xx).
- **Circuit breaker:** if a job fails 5 times in a row, alert via Telegram + stop scheduling until manually re-enabled.
- **Idempotency:** every job checks whether it already ran for the target timestamp (e.g., EOD scan for today) before writing.
- **Observability:** each job run emits a Sentry breadcrumb + PostHog event + row in `scheduler_job_runs(job_name, triggered_at, status, duration_ms, error, items_processed)`.

### Job list

| # | Name | Trigger | Writes to | Notes |
|---|---|---|---|---|
| 1 | `kite_admin_token_refresh` | 6:05 AM IST weekdays | `broker_connections` | Keeps shared Kite admin token alive |
| 2 | `regime_update_morning` | 8:15 AM IST weekdays | `regime_history` | HMM regime detection |
| 3 | `pre_market_scan` | 8:30 AM IST weekdays | `signals` | Generates pre-market swing signals |
| 4 | `auto_create_trades_from_signals` | 8:45 AM IST weekdays | `trades` | For auto-trader users |
| 5 | `market_open_check` | 9:15 AM IST weekdays | `signals.market_context` | VIX + advances/declines snapshot |
| 6 | `execute_pending_trades` | 9:30 AM IST weekdays | `positions`, `trades` | First execution bar |
| 7 | `intraday_lstm_inference` | every 5 min 9:20-15:25 weekdays | `signals` (intraday) | F1 real-time |
| 8 | `position_monitor` | every 5 min 9:30-15:25 weekdays | `positions`, `trades` | SL/target/trailing |
| 9 | `regime_intraday_recheck` | triggered on VIX spike > 10% | `regime_history` | Intra-day regime flip detection |
| 10 | `market_close_handler` | 15:30 IST weekdays | `signals`, `positions`, `trades` | Expire + close |
| 11 | `qlib_nightly` | 15:40 IST weekdays | `alpha_scores` | Qlib Alpha158 rank Nifty 500 |
| 12 | `eod_scan` | 15:45 IST weekdays | `signals`, `daily_universe`, `eod_scan_runs` | F2 swing signal generation |
| 13 | `tft_nightly_forecast` | 15:50 IST weekdays | `forecast_scores` | F2 TFT inference |
| 14 | `chronos_timesfm_nightly` | 15:50 IST weekdays | `forecast_scores` | L1 ensemble |
| 15 | `vix_tft_nightly` | 15:55 IST weekdays | `vix_forecasts` | F6 VIX forecast |
| 16 | `sentiment_refresh` | 16:30 IST weekdays | `news_sentiment` | FinBERT scoring per symbol |
| 17 | `earnings_predictor` | 17:00 IST daily | `earnings_predictions` | F9 XGBoost for next-3-day earnings |
| 18 | `sector_rotation_compute` | 17:15 IST weekdays | `sector_scores` | F10 |
| 19 | `telegram_digest_morning` | 7:00 AM IST daily | Telegram messages | F12 |
| 20 | `telegram_digest_evening` | 17:00 IST daily | Telegram messages | F12 |
| 21 | `paper_portfolio_snapshot` | 23:00 IST daily | `paper_snapshots` | F11 equity curve |
| 22 | `weekly_review_generator` | Sunday 18:00 IST | `user_weekly_reviews` | N10 per-user Gemini review |
| + | `ai_portfolio_rebalance` | Last Sunday of month 00:00 IST | `ai_portfolio_holdings` | F5 AI SIP monthly rebalance |
| + | `daily_qlib_rolling_retrain` | 02:00 IST daily | `model_versions` (auto) | Cheap CPU retrain |
| + | `hmm_weekly_retrain` | Sunday 01:00 IST | `model_versions` | HMM weekly update |
| + | `cleanup_old_data` | Monday 03:00 IST | DELETE old rows | Trim ticks > 30d, logs > 90d |

Removed (per Step 1 OpenAlgo-only): `refresh_user_broker_tokens` (6:10 AM) — OpenAlgo handles internally.

### Alerting

Every job emits structured log. On failure:
- Sentry captures exception with full traceback + job metadata.
- Telegram bot sends admin message: `⚠️ Job failed: qlib_nightly (2026-04-19) — retry 3/3`.
- PostHog event lets us chart job reliability over time.

---

## 6 — Security hardening

### P0 fixes (blocker-before-production)

1. **JWT signature verification.** Fix `app.py:145`.
   - Set `SUPABASE_JWT_SECRET` in production env.
   - Update `core/auth.py:get_current_user()` to call `jwt.decode(..., options={"verify_signature": True})`.
   - Add regression test: malformed JWT → 401.

2. **Admin role gating.**
   - Add `is_admin BOOLEAN DEFAULT false` column to `user_profiles` (migration).
   - `core/deps.py:get_admin()` dependency — raises 403 if `user.is_admin == false`.
   - Every `api/admin_routes.py` route uses `Depends(get_admin)`.
   - Frontend `middleware.ts` matches: checks `profile.is_admin` before rendering `/admin/*`.
   - Bootstrap: Rishi's email hardcoded to `is_admin=true` on first deploy via migration, or via admin-email env var matching.

3. **WebSocket auth via bearer header.**
   - Current: token passed in URL (shows up in server logs, browser history, CDN caches).
   - New: `Sec-WebSocket-Protocol` header carries JWT; verified server-side before accept.
   - Frontend hook `useWebSocket` updated to pass token in header.

4. **Broker credential encryption integrity.**
   - `BROKER_ENCRYPTION_KEY` loss = unrecoverable user credentials ([config.py:270](../src/backend/core/config.py) warning).
   - Store encryption key in Railway's managed secrets + backup to 1Password or similar.
   - Document recovery procedure.

### P1 hardening (ship within first month)

5. **Tighter CSP.**
   - Drop `script-src 'unsafe-inline'` if possible; audit any inline `<script>` in landing/marketing pages.
   - Keep `'unsafe-eval'` only if TradingView embed requires it (it does per audit).
   - Nonce-based inline scripts for OAuth callback pages.

6. **Tier gate middleware.**
   - New `middleware/tier_gate_middleware.py`.
   - Each route declares required tier via decorator: `@requires_tier("pro")`.
   - Middleware checks `user.tier` against required → 403 if insufficient.
   - Covers all Pro-only + Elite-only features in Step 1 §5.

7. **Rate limiting per tier.**
   - Current: flat 60/min per IP.
   - New: `(Free: 30/min, Pro: 120/min, Elite: 300/min)` per user (not IP).
   - Implemented in `middleware/rate_limit_middleware.py` using Redis counters.

8. **Webhook signature verification.**
   - Razorpay webhook already signed; verify in every handler ([payment_routes.py](../src/backend/api/payments_routes.py)). Audit confirms this is done — keep enforced.

9. **Supabase RLS audit.**
   - Every user-owned table must have `auth.uid() = user_id` RLS.
   - Service-role-only tables (signals, regime_history, model_performance, model_versions): no user-read policy except authenticated read for public content (track record).

10. **Secret rotation runbook.**
    - Document procedure for rotating `SUPABASE_JWT_SECRET`, `BROKER_ENCRYPTION_KEY`, `GEMINI_API_KEY`, `RAZORPAY_KEY_SECRET`, `SENTRY_DSN`.
    - GitHub Actions secret rotation reminder every 90 days.

### P2 (post-launch)

11. Audit log table for all admin actions (`admin_audit_log`).
12. 2FA for admin accounts.
13. OpenAlgo URL scope validation (prevent SSRF).

---

## 7 — Observability

Three tools, all on free or near-free tiers:

### Sentry (errors)

- `@sentry_sdk.capture_exception` via existing integration ([app.py:52-64](../src/backend/api/app.py)).
- Sample rate 0.1 for traces, 1.0 for errors.
- User context attached (user_id, tier) so error triage is fast.
- Release tags on every deploy — lets us correlate errors to releases.
- Cost: **free** at v1 scale (5K events/month).

### PostHog (analytics)

- New integration at `src/backend/integrations/posthog.py`.
- Server-side events: `signal_generated`, `signal_clicked`, `paper_trade_placed`, `tier_upgraded`, `kill_switch_triggered`, `copilot_message`.
- Client-side events via `posthog-js`: `page_viewed`, `watchlist_added`, `signal_detail_opened`.
- User funnels: onboarding → first paper trade → first signal-triggered trade → payment.
- Feature flags (A/B model comparisons, new UI rollouts).
- Cost: **free** up to 1M events/month.

### Custom Signal Accuracy Dashboard

- Admin-only page `/admin/ml` (already stub).
- Pulls from new `model_performance(model_name, window_days, win_rate, avg_pnl_pct, signal_count, computed_at)` table.
- Computed nightly by `signal_accuracy_aggregator` job (a sub-task of job #21 `paper_portfolio_snapshot`).
- Views: per-model last 7/30/90 day WR + Sharpe. Drift detection (alerts if WR drops 10+ pp vs 90-day baseline).

### Uptime

- UptimeRobot free tier: 50 monitors.
- Targets: landing page, `/api/health`, `/api/signals/today`, `/api/market/regime-public`, frontend root.
- Alert to Telegram admin channel.

---

## 8 — CI/CD

Existing files in `.github/workflows/`: `ci.yml`, `deploy.yml`, `release-hardening-gates.yml`, `frontend-ci.yml`, `backend-ci.yml`. Upgrade:

### On pull request (runs in parallel)

1. **Backend** (`backend-ci.yml`):
   - Lint: `ruff check`, `black --check`.
   - Type-check: `mypy src/backend`.
   - Tests: `pytest src/backend/tests` (unit + integration).
   - Security: `bandit`, `pip-audit` (CVE scan).
   - Coverage ≥ 70% gate.

2. **Frontend** (`frontend-ci.yml`):
   - Lint: `eslint`, `prettier --check`.
   - Type-check: `tsc --noEmit`.
   - Build: `next build` (catches SSR issues).
   - Playwright smoke: login + dashboard render.

3. **Secret scan**: `gitleaks` on all PRs.

4. **Docker build check** (if we add Docker later): builds the image without deploying.

### On merge to main

1. **Auto-deploy backend** to Railway via GitHub → Railway integration.
2. **Auto-deploy frontend** to Vercel via GitHub → Vercel integration.
3. **DB migrations**: `supabase db push` if `infrastructure/database/migrations/` changed.

### Model promotion gates

When Rishi commits a notebook-generated model to the registry:
1. GitHub Action uploads artifact to Backblaze B2 (configured via secrets).
2. Creates row in `model_versions` with `is_prod = false` (shadow only).
3. Runs pre-flight regression check: loads new model, compares predictions vs incumbent on last 30 days of signals. Must not regress more than 3pp WR.
4. Posts regression metrics to PR as a comment.
5. Rishi manually approves + flips `is_prod` via admin UI.

### Release gates (from `release-hardening-gates.yml`)

Existing release gate workflow probably enforces e2e tests + manual approval. Keep + extend with:
- Lighthouse score regression (<-5 points blocks).
- Database migration preview (pg-dry-run catches breaking schema changes).
- Error rate baseline (5xx in last 24h must be < 0.1%).

---

## 9 — Consolidated v1 database migration

One SQL file: `infrastructure/database/migrations/20260419_v1_ai_stack.sql`.

Consolidates every schema change from Steps 1-3:

```sql
-- User profile additions
alter table user_profiles add column if not exists is_admin boolean default false;
alter table user_profiles add column if not exists tier text default 'free' check (tier in ('free','pro','elite'));
alter table user_profiles add column if not exists openalgo_url text;  -- encrypted via Fernet
alter table user_profiles add column if not exists openalgo_api_key text;  -- encrypted
alter table user_profiles add column if not exists telegram_chat_id text;
alter table user_profiles add column if not exists telegram_verified boolean default false;
alter table user_profiles add column if not exists whatsapp_phone text;
alter table user_profiles add column if not exists whatsapp_verified boolean default false;
alter table user_profiles add column if not exists auto_trader_enabled boolean default false;
alter table user_profiles add column if not exists ai_portfolio_enabled boolean default false;

-- Signals additions
alter table signals add column if not exists tft_p10 numeric;
alter table signals add column if not exists tft_p50 numeric;
alter table signals add column if not exists tft_p90 numeric;
alter table signals add column if not exists lgbm_buy_prob numeric;
alter table signals add column if not exists qlib_score numeric;
alter table signals add column if not exists qlib_rank integer;
alter table signals add column if not exists timesfm_p50 numeric;
alter table signals add column if not exists chronos_p50 numeric;
alter table signals add column if not exists hgnc_up_prob numeric;
alter table signals add column if not exists finbert_sentiment numeric;
alter table signals add column if not exists regime_at_signal text;
alter table signals add column if not exists explanation_text text;
alter table signals add column if not exists explanation_generated_at timestamptz;

-- New tables
create table if not exists regime_history (
  id uuid primary key default gen_random_uuid(),
  regime text not null check (regime in ('bull','sideways','bear')),
  prob_bull numeric, prob_sideways numeric, prob_bear numeric,
  vix numeric, nifty_close numeric,
  detected_at timestamptz not null default now()
);
create index on regime_history (detected_at desc);

create table if not exists alpha_scores (
  symbol text, date date, qlib_rank integer, qlib_score_raw numeric,
  top_factors jsonb, primary key (symbol, date)
);

create table if not exists forecast_scores (
  symbol text, date date, horizon_days integer,
  timesfm_p50 numeric, chronos_p50 numeric, ensemble_p50 numeric,
  primary key (symbol, date, horizon_days)
);

create table if not exists vix_forecasts (
  date date primary key, horizon_days integer,
  tft_p10 numeric, tft_p50 numeric, tft_p90 numeric,
  computed_at timestamptz default now()
);

create table if not exists news_sentiment (
  symbol text, date date, mean_score numeric, headline_count integer,
  sample_headlines jsonb, primary key (symbol, date)
);

create table if not exists sector_scores (
  sector text, date date, momentum_score numeric, fii_flow_7d numeric,
  rotating text check (rotating in ('in','out','neutral')),
  primary key (sector, date)
);

create table if not exists earnings_predictions (
  symbol text, announce_date date, beat_prob numeric,
  evidence jsonb, strategy_recommendation text,
  computed_at timestamptz default now(),
  primary key (symbol, announce_date)
);

-- Paper trading
create table if not exists paper_portfolios (
  user_id uuid primary key references auth.users,
  cash numeric not null default 1000000,
  created_at timestamptz default now()
);
create table if not exists paper_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  signal_id uuid references signals,
  symbol text, qty integer, entry_price numeric,
  entry_date timestamptz default now(), status text default 'open'
);
create table if not exists paper_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  position_id uuid references paper_positions,
  action text check (action in ('buy','sell')),
  qty integer, price numeric,
  executed_at timestamptz default now()
);
create table if not exists paper_snapshots (
  user_id uuid references auth.users,
  snapshot_date date, equity numeric, cash numeric, drawdown_pct numeric,
  primary key (user_id, snapshot_date)
);

-- AI Portfolio (F5)
create table if not exists ai_portfolio_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  symbol text, target_weight numeric, current_weight numeric,
  last_rebalanced_at timestamptz
);

-- TradingAgents debates (B1)
create table if not exists signal_debates (
  signal_id uuid primary key references signals,
  bull_case text, bear_case text, risk_assessment text, trader_verdict text,
  generated_at timestamptz default now()
);

-- Weekly reviews (N10)
create table if not exists user_weekly_reviews (
  user_id uuid references auth.users,
  week_of date, content text,
  generated_at timestamptz default now(),
  primary key (user_id, week_of)
);

-- Tick bars for intraday
create table if not exists tick_bars (
  symbol text, bar_time timestamptz,
  open numeric, high numeric, low numeric, close numeric, volume bigint,
  primary key (symbol, bar_time)
);
create index on tick_bars (symbol, bar_time desc);

-- Model registry (Step 2 locked)
create table if not exists model_versions (
  id uuid primary key default gen_random_uuid(),
  model_name text not null, version integer not null,
  artifact_uri text not null,
  trained_at timestamptz default now(), trained_by text,
  metrics jsonb, git_sha text,
  is_prod boolean default false, is_shadow boolean default false,
  notes text,
  unique (model_name, version)
);
create index on model_versions (model_name, trained_at desc);
create index on model_versions (model_name) where is_prod = true;

-- Model performance tracking
create table if not exists model_performance (
  id uuid primary key default gen_random_uuid(),
  model_name text, window_days integer,
  win_rate numeric, avg_pnl_pct numeric, signal_count integer,
  computed_at timestamptz default now()
);

-- Gemini call log (cost accounting)
create table if not exists gemini_call_log (
  id uuid primary key default gen_random_uuid(),
  task_type text, user_id uuid,
  input_tokens integer, output_tokens integer,
  cost_usd numeric, latency_ms integer,
  called_at timestamptz default now()
);
create index on gemini_call_log (called_at desc);

-- Scheduler job tracking
create table if not exists scheduler_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text, triggered_at timestamptz default now(),
  status text, duration_ms integer, error text,
  items_processed integer
);
create index on scheduler_job_runs (job_name, triggered_at desc);

-- RLS policies
alter table paper_portfolios enable row level security;
alter table paper_positions enable row level security;
alter table paper_trades enable row level security;
alter table paper_snapshots enable row level security;
alter table ai_portfolio_holdings enable row level security;
alter table user_weekly_reviews enable row level security;

create policy "users own paper portfolios" on paper_portfolios
  for all using (auth.uid() = user_id);
create policy "users own paper positions" on paper_positions
  for all using (auth.uid() = user_id);
create policy "users own paper trades" on paper_trades
  for all using (auth.uid() = user_id);
create policy "users own paper snapshots" on paper_snapshots
  for all using (auth.uid() = user_id);
create policy "users own ai portfolio" on ai_portfolio_holdings
  for all using (auth.uid() = user_id);
create policy "users own weekly reviews" on user_weekly_reviews
  for all using (auth.uid() = user_id);

-- Signals readable by authenticated users
create policy "authenticated read signals" on signals
  for select using (auth.role() = 'authenticated');

-- Public read for trust-surface tables
create policy "public read regime" on regime_history for select using (true);
create policy "public read model perf" on model_performance for select using (true);
```

Apply via `supabase db push` from Railway deploy step.

---

## 10 — Tier-gated route enforcement

**How each Step-1 §5 feature maps to route access:**

```python
# middleware/tier_gate_middleware.py
TIER_RANK = {"free": 0, "pro": 1, "elite": 2}

def requires_tier(min_tier: str):
    """FastAPI dependency that 403s if user.tier < min_tier."""
    async def checker(user = Depends(get_current_user)):
        if TIER_RANK[user.tier] < TIER_RANK[min_tier]:
            raise HTTPException(403, f"Requires {min_tier} tier")
        return user
    return checker

# Usage in routes
@router.get("/api/signals/intraday")
async def get_intraday_signals(user = Depends(requires_tier("pro"))):
    ...
```

**Signal-count gating** (Free users see only top-1 signal/day): implemented inside the handler, not the middleware — reads tier, applies `LIMIT 1` or unlimited.

**Copilot message gating**: Redis counter per user per day, enforced in `agents/ai_copilot.py`.

---

## 11 — Migration sequencing (revised 2026-04-18 after orphan audit)

**Option B locked:** ship HMM live immediately, TFT/LGBM/QuantAI in shadow-mode until retrained. Real production AI signals land on Day 21 (PR 6), not Day 1.

16-20 small PRs over ~5 weeks. Each PR independently reviewable + deployable.

### Foundation wave (Days 1-7)
1. **PR 1 — P0 security fixes** (JWT signature + `is_admin` column + admin route guard). 1 day. Blocker for everything else.
2. **PR 2 — Consolidated v1 DB migration**. ½ day. Idempotent.
3. **PR 3 — ModelRegistry → B2 + Postgres `model_versions`** + move 5 existing artifacts (TFT, HMM, LGBM, QuantAI, BreakoutMetaLabeler) to B2 and register. All orphans registered with `is_shadow=true, is_prod=false` except HMM which gets `is_prod=true`. 2 days.
4. **PR 4 — Wire models into SignalGenerator.** HMM **LIVE** (gates every new signal's size + confidence, drives public `/regime`). TFT + LGBM + QuantAI in **SHADOW MODE ONLY** — scores computed and written to `signals_shadow` table for A/B diff logging, never affect user-facing confidence. Validates end-to-end pipeline wiring. 3 days.
5. **PR 5 — UI trim** (strip glassmorphism from platform inner pages, add `.trading-surface` + `.numeric` utilities). 1 day visual cleanup — immediately reads as production-grade.

### Retraining wave (runs in parallel during PR 3-5, Weeks 1-2)
Not PRs — this is Rishi's Colab Pro ritual running during dev hours:
- **Week 1 (Sunday, 3 Colab GPU-hours):** TFT v2 retrain from scratch — `hidden_size=128`, `attention_heads=4`, Nifty 500 universe, 2015-2023 train / 2024 valid / 2025+ test, 0.15% transaction cost in eval.
- **Week 1 (0.1 hrs CPU):** HMM verify OOS 2024-2025 regime transitions labelled correctly. If wrong, re-fit.
- **Week 2 (0.5 hrs CPU):** Fresh Qlib Alpha158 LightGBM train per Step 2 §1.4. This model **replaces both LGBMGate and QuantAI Ranker** — they're obsoleted, not retrained.
- Artifacts uploaded to B2 with new version numbers. Registered as `is_shadow=true` pending regression gate.

### Promotion wave (Day 18-21)
6. **PR 6 — Promote retrained models to prod.** Gate: new model OOS WR on last 30 days must not regress more than 3 pp vs incumbent. TFT v2 → `is_prod=true`. Qlib Alpha158 → `is_prod=true`. This is when **AI signals actually become real alpha** for users. 1 day including regression review.
7. **PR 7 — Retire legacy orphans.** LGBMGate + QuantAI Ranker deleted from active codepaths, `model_versions.is_retired=true`, artifact files moved to B2 `retired/` prefix. ½ day.

### Build-out wave (Days 22+)
8. **PR 8 — OpenAlgo adapter** + broker_routes collapse. Replaces direct Zerodha/Angel/Upstox SDK wiring. 2 days.
9. **PR 9-14 — LangGraph agents** (one PR per graph). FinRobot Portfolio Doctor first, then TradingAgents debate, then AI Copilot, then FinRobot AI SIP, then FinRobot Earnings, then FinAgent Vision. ~2 days each.
10. **PR 15-20 — New scheduler jobs** (Qlib nightly, Chronos/TimesFM nightly, FinBERT refresh, intraday LSTM, etc.). Small PRs.
11. **PR 21 — Real-time pipeline** (OpenAlgo WebSocket → Redis Streams → LSTM intraday worker → Supabase Realtime). 4-5 days.
12. **PR 22-28 — Directory restructure** (`src/backend/services/` → `ai/`, `brokers/`, `data/`, `trading/`, `scheduler/`, `notifications/`, `realtime/`). `git mv` preserves history, one PR per package. 1 day each.
13. **PR 29 — Tier gate middleware** + apply to routes. 1 day.
14. **PR 30 — Observability** (Sentry + PostHog + admin Signal Accuracy Dashboard). 2 days.
15. **PR 31 — CI/CD gates** (regression checks on model promotion, coverage floor). 1 day.
16. **PR 32+ — Frontend route building** for stub pages + new pages. Overlaps with Step 4. Multiple PRs.
17. **PR final — Legacy cleanup.** Old 6 strategies moved to `_legacy/`, direct broker SDKs deleted, unused stubs removed.

Run tests in CI per PR. Deploy each PR to staging first (Railway preview environments), then main on green.

---

## 12 — Ready for Step 4

Architecture decided. Everything in `src/backend/ai/` has a home. Every runtime concern (real-time, scheduler, LLM orchestration, model serving, security, observability, CI/CD) has a concrete plan.

**Step 4 — Full UI/UX Design** is next when you say go. That one covers:
- Design language brief (Bloomberg × Linear × Robinhood + trust-first)
- Component library upgrade (what we keep, what we add)
- Motion design system per surface
- Every route in Step 1 §5 Master Feature List given a wireframe-level spec:
  - Public: `/`, `/regime`, `/track-record`, `/models`, `/pricing`
  - Auth: `/login`, `/signup`, `/onboarding/risk-quiz`, `/verify-email`, `/forgot-password`
  - Core: `/dashboard`, `/swingmax-signal`, `/signals/[id]`, `/paper-trading`, `/stock/[symbol]`, `/scanner-lab`, `/watchlist`, `/notifications`
  - Retention: `/portfolio`, `/portfolio/doctor`, `/sector-rotation`, `/momentum`, `/earnings-calendar`
  - Elite: `/auto-trader`, `/ai-portfolio`, `/fo-strategies`
  - Marketplace: `/marketplace`, `/marketplace/[slug]`, `/my-strategies`
  - Settings: `/settings` with tabs for broker/telegram/risk/tier/alerts/kill-switch
  - Admin: `/admin/*`
- AI Copilot side panel design
- Onboarding flow
- Email + Telegram + WhatsApp digest templates
- Mobile-responsive audit (web-only, per Step 1)
- Accessibility + dark mode spec

Say **"Step 4"** when ready.
