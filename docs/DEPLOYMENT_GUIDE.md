# SwingAI Deployment Guide

This guide mirrors the repo structure in this workspace. The backend lives under `src/backend` and the frontend under `src/frontend`.

## Prerequisites
- Supabase project (Postgres + Auth)
- Razorpay account (for payments)
- Railway (backend)
- Vercel (frontend)
- Modal (ML inference)

## 1) Supabase (database)

1. Create a Supabase project.
2. In the SQL Editor, run `infrastructure/database/complete_schema.sql`.
3. Copy your project URL, anon key, and service role key.

## 2) Backend (Railway)

### Environment variables
Use `.env.example` as the source of truth. Core variables:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
FRONTEND_URL=
APP_ENV=production
SECRET_KEY=<random>
ML_INFERENCE_URL=
ENHANCED_ML_INFERENCE_URL=
ENABLE_SCHEDULER=false
ENABLE_REDIS=false
REDIS_URL=redis://localhost:6379/0
ENABLE_ENHANCED_AI=false
```

If you plan to use Redis-backed realtime services:

```
REDIS_URL=
ENABLE_REDIS=true
```

### Deploy
Railway uses the root repo. Example start command:

```
uvicorn src.backend.api.app:app --host 0.0.0.0 --port $PORT
```

`railway.toml` is already present; set your env vars in the Railway dashboard or via CLI.

## 3) Frontend (Vercel)

1. Import the repo into Vercel.
2. Set the root directory to `src/frontend`.
3. Add environment variables:

```
NEXT_PUBLIC_API_URL=https://<your-backend>
NEXT_PUBLIC_SUPABASE_URL=https://<your-supabase>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
NEXT_PUBLIC_WS_URL=ws://<your-backend>/ws
```

4. Deploy.

## 4) ML inference (Modal)

Two inference entrypoints exist:
- v1 (CatBoost + simulated scores): `ml/inference/modal_inference.py`
- v2 (5-model ensemble): `ml/inference/modal_inference_v2.py`

### Deploy v1

```
modal deploy ml/inference/modal_inference.py
```

Volume name: `swingai-models`

### Deploy v2

```
modal deploy ml/inference/modal_inference_v2.py
```

Volume name: `swingai-models-v2`

### Environment variables
`SignalGenerator` uses `ML_INFERENCE_URL`. `MODAL_INFERENCE_URL` is supported as a legacy fallback.

```
ML_INFERENCE_URL=https://<modal-endpoint>
```

## 5) Verification

- Backend health: `GET /api/health`
- API docs: `/api/docs`
- Frontend: open the Vercel URL

## Notes
- Scheduler and realtime services start via the FastAPI lifespan when `ENABLE_SCHEDULER` / `ENABLE_REDIS` are set.
- Several services fall back to simulated data if live feeds are not configured.
