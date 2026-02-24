# Supabase Setup Guide (SwingAI)

This is the complete Supabase checklist from a clean start to a running system.

## 1) Create Supabase Project
1. Create a new Supabase project.
2. Note the **Project URL** and **Service Role Key**.
3. In `Settings → API`, copy:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`

## 2) Configure Environment Variables

### Backend (.env for `src/backend`)
```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_KEY=...

# Optional but recommended
ADMIN_EMAILS=admin@example.com
ENABLE_SCHEDULER=true

# EOD Scanner Defaults
EOD_SCAN_USE_PKS=true
EOD_SCAN_SOURCE=github
EOD_SCAN_TYPE=swing
EOD_SCAN_MAX_STOCKS=300
EOD_SCAN_MIN_PRICE=50
EOD_SCAN_MAX_PRICE=10000
EOD_SCAN_MIN_VOLUME=200000

# F&O instruments (for futures shorts + full F&O universe)
FNO_INSTRUMENTS_FILE=data/fno_instruments.csv

# Model artifacts bucket
MODEL_STORAGE_BUCKET=models
XGBOOST_MODEL_PATH=models/xgboost_model.json
TFT_MODEL_PATH=models/tft_model.ckpt
TFT_CONFIG_PATH=models/tft_config.json
```

### Frontend (.env for `src/frontend`)
```
NEXT_PUBLIC_API_URL=https://<your-backend-domain>
```

## 3) Apply Database Schema

### Option A) Run SQL in Supabase SQL Editor (recommended for first-time)
Open **Supabase → SQL Editor**, then run the full schema:

```sql
-- Paste entire contents of:
-- infrastructure/database/complete_schema.sql
```

### Option B) Incremental migrations (if schema already exists)
In Supabase SQL Editor, run the **two migration files**:

```sql
-- Paste entire contents of:
-- infrastructure/database/migrations/2026_02_05_prd_alignment.sql
```

```sql
-- Paste entire contents of:
-- infrastructure/database/migrations/2026_02_05_eod_scanner.sql
```

### Option C) CLI script (if you prefer)
```
SUPABASE_DB_URL="..." scripts/apply_migration.sh infrastructure/database/complete_schema.sql
```

Or, incremental:
```
SUPABASE_DB_URL="..." scripts/apply_migration.sh infrastructure/database/migrations/2026_02_05_prd_alignment.sql
SUPABASE_DB_URL="..." scripts/apply_migration.sh infrastructure/database/migrations/2026_02_05_eod_scanner.sql
```

**Expected key tables created/updated**
- `subscription_plans` (3 plans: Free, Starter, Pro)
- `signals` (adds `strategy_names`, `tft_prediction`)
- `trades` (adds `execution_mode`, `broker_order_id`)
- `positions` (adds `execution_mode`)
- `broker_connections` (per-user encrypted credentials)
- `candles`, `features`
- `daily_universe`, `eod_scan_runs`
- `user_profiles` (adds paper/live flags, kill switch)

## 3A) Realtime Publication (Optional)
If you want Supabase Realtime on signals/positions/trades, run in SQL Editor:

```sql
alter publication supabase_realtime add table public.signals;
alter publication supabase_realtime add table public.trades;
alter publication supabase_realtime add table public.positions;
```

If you only need signals realtime, run only:
```sql
alter publication supabase_realtime add table public.signals;
```

## 4) Create Storage Bucket for Models (Optional - not required for beta)

ML models are optional for beta. The algorithmic strategies work without them.

If you want to enable ML model confirmations later:

1. In Supabase Storage, create a bucket named `models`.
2. Upload:
   - `xgboost_model.json`
   - `tft_model.ckpt`
   - `tft_config.json`

The backend will download these on startup if local files are missing.

## 5) Enable Realtime (Optional)
If you want realtime feeds:
1. Ensure Supabase Realtime is enabled for `signals` table.
2. The frontend listens via WebSocket/Supabase Realtime.

## 6) Scheduler (EOD Scan)
Scheduler runs in the backend process:
- **15:45 IST**: EOD scan (PKScreener → strategies → XGB/TFT → signals)
- **08:30 IST**: Pre‑market broadcast

Ensure:
```
ENABLE_SCHEDULER=true
```

## 7) Admin Access
Admin is verified via `ADMIN_EMAILS` env.
Set:
```
ADMIN_EMAILS=your-admin-email@example.com
```

Then access:
```
/admin/system
```
to see:
- EOD scan runs
- Daily universe
- System metrics

## 8) Verify End‑to‑End
1. Start backend, ensure `/api/health` shows `models` loaded.
2. Confirm `daily_universe` and `eod_scan_runs` are populated after 15:45 IST.
3. Confirm `signals` saved for the next trading day date.
4. Confirm `/admin/system` shows EOD scan info.

## 10) F&O Instrument Master (for futures shorts)
To enable **futures shorts** and a **full F&O universe**, place a broker instrument master CSV at:
```
data/fno_instruments.csv
```

The loader auto-detects common column names:
- `tradingsymbol` / `trading_symbol` / `symbol`
- `expiry` / `expiry_date`
- `lot_size` / `lotsize`
- `instrument_token` / `instrument_key` / `token`
- `exchange` / `segment`

If the file is missing, the system falls back to the built‑in partial F&O list.

## 9) Common Issues
- **No signals**: Check `STRATEGY_MIN_CONFLUENCE` and PKScreener filters.
- **No candidates**: Relax `EOD_SCAN_MIN_VOLUME` or `EOD_SCAN_MIN_PRICE`.
- **Model load failure**: Ensure model files are in the `models` bucket.
- **Scheduler not running**: Check `ENABLE_SCHEDULER=true`.
