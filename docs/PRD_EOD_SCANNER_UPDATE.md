**PRD Update: EOD Scanner Flow (Next-Day Entry)**

**Summary**
This update changes signal generation to a single end‑of‑day (EOD) scan and uses the results for next‑day market open entries. Intraday 15‑minute scanning is disabled. PKScreener is used to filter the full NSE universe before the 20‑strategy engine runs.

**Revised Signal Flow**
1. End of day (after market close): run PKScreener on full NSE and filter by price, volume, and momentum.
2. Run 57 strategies on the filtered list and compute entry/SL/targets.
3. XGBoost + TFT provide confidence and metadata only (no hard gate).
4. Save signals for the next trading day date.
5. Next day open: execute entries for approved users.

**Schedule**
- 15:45 IST: EOD scanner runs and generates signals for the next trading day.
- 08:30 IST: broadcast the next‑day signals to users.
- No 15‑minute intraday runner.

**Universe & Filters**
- Universe: All NSE stocks (via PKScreener scan results).
- Filters: min price, max price, min volume, plus PKScreener scan logic (momentum/breakout/swing).
- Output: filtered candidate list (typically 150–400 stocks depending on filters).

**Transparency & Monitoring**
- `daily_universe` table stores the filtered candidates for each trade date.
- `eod_scan_runs` table stores run status, counts, and errors for monitoring.

**Recommended PKScreener Mode**
- Default: GitHub‑published daily PKScreener results (fast, stable, good for Railway/Vercel).
- Optional: Local PKScreener run (requires compute + longer runtime, better for custom scans).

**Infrastructure Guidance**
- Vercel: prefer GitHub PKScreener results (serverless constraints).
- Railway: either GitHub results or local PKScreener in a worker/cron service.

**Config Defaults**
- `EOD_SCAN_USE_PKS=true`
- `EOD_SCAN_SOURCE=github`
- `EOD_SCAN_TYPE=swing`
- `EOD_SCAN_MAX_STOCKS=300`
- `EOD_SCAN_MIN_PRICE=50`
- `EOD_SCAN_MAX_PRICE=10000`
- `EOD_SCAN_MIN_VOLUME=200000`
