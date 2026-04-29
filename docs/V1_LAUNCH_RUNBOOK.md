# Quant X v1.0.0 — Launch Runbook

End-to-end checklist for cutting v1.0.0. Follow top-to-bottom on launch day.

---

## 0. Preconditions
- GPU box provisioned (1× A100 or equivalent — V100 OK for everything except FinRL-X 1M-step training).
- B2 (or equivalent S3-compatible) credentials in env: `B2_KEY_ID`, `B2_APP_KEY`, `B2_BUCKET`.
- Supabase prod project with `service_role` key + `anon` key wired into both API + frontend.
- Razorpay live keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`) configured.
- Gemini API key set: `GEMINI_API_KEY`.
- Telegram + WhatsApp + Resend creds set.

## 1. Apply migrations
```sh
psql $DATABASE_URL -f infrastructure/database/migrations/2026_04_29_pr123_ui_preferences.sql
psql $DATABASE_URL -f infrastructure/database/migrations/2026_04_29_pr134_autopilot_decisions.sql
psql $DATABASE_URL -f infrastructure/database/migrations/2026_04_29_pr154_training_runs.sql
```
The migrations are idempotent — a re-run is safe.

## 2. Deploy API + frontend (no traffic)
```sh
# API (Railway)
railway up --service api

# Frontend (Vercel)
vercel deploy --prod
```
At this point /admin/training and /admin/launch-readiness should return red across the model checks — that's expected, models haven't been trained yet.

## 3. Run unified training pipeline
SSH into the GPU box:
```sh
git clone <repo> && cd Swing_AI_Final
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-train.txt   # pulls full training stack

export B2_KEY_ID=... B2_APP_KEY=... B2_BUCKET=...
export DATABASE_URL=postgres://...

# Single E2E run. This trains every registered Trainer module
# (regime_hmm, lgbm_signal_gate, intraday_lstm, finrl_x_ppo/ddpg/a2c,
# vix_tft, options_rl, momentum_chronos, momentum_timesfm, earnings_xgb)
# and writes one model_versions row per artifact.
python -m ml.training.runner --all --promote
```
Expected wall-clock: ~4 hours on A100 (FinRL-X dominates at ~30 min × 3 algos).

Watch for:
- Each trainer logs an `OK` line with `oos_*` metric. Anything `failed` = stop and investigate.
- B2 upload errors are the most common failure mode (credential issues). Re-run the failed trainer with `--only <name>`.

## 4. Verify launch readiness
```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" $API/api/admin/launch-readiness
```
Every `ok: true`. Any `false` blocks the tag.

Manual smoke checks:
- Open `/admin/training` → all trainers show prod versions with green stat rows.
- Open `/dashboard` as a real user → SwingMax signals appear, regime banner reads correctly.
- Open `/auto-trader` → page loads, "Today's plan" panel populated after the next 15:50 IST tick.
- Place a test paper trade through `/swingmax-signal` → executes, position appears.

## 5. Flip traffic on
- Update Vercel domain to point at production deployment.
- Announce in #launch.
- Tag and ship:
```sh
git tag -a v1.0.0 -m "Quant X v1.0.0 — first public launch"
git push origin v1.0.0
```

## 6. First-week monitoring
- `/admin/system` — background job health.
- `/admin/training` — model drift (re-run any model whose primary metric drops > 10%).
- `/admin/experiments/summary` — A/B variant conversion rates (PR 148).
- `/admin/launch-readiness` — scheduled poll every 6 hours for the first 7 days.

## Rollback procedure
If anything goes catastrophically wrong post-launch:
```sh
# 1. Flip the global kill switch (admin UI → Kill Switch panel).
# 2. Revert Vercel deployment to the previous green build.
# 3. If a specific model is the issue: demote it.
psql $DATABASE_URL -c "UPDATE model_versions SET is_prod=FALSE WHERE model_name='<name>';"
# 4. Re-promote the previous prod version.
psql $DATABASE_URL -c "UPDATE model_versions SET is_prod=TRUE WHERE id='<prior_uuid>';"
```

The kill switch (PR 130 + PR 134) blocks all live execution — paper trading and read-only routes continue.
