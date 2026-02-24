# Rollback Runbook (No DB Migration Path)

## Scope

This runbook covers rollback for the confluence-only long pipeline release.
No schema migration is part of this release, so rollback is deployment-level and DB-safe.

## Triggers

Rollback if any of the following occurs post-release:
- Signal generation produces non-`LONG` or non-`EQUITY` records
- Critical runtime errors in `src/backend/services/signal_generator.py`
- Frontend execution path breakage on `/signals` or `/signals/[id]`
- Sustained API error spike after deploy

## Preconditions

- Previous stable backend artifact/tag is known.
- Previous stable frontend deployment is known.
- Previous stable ML Modal deployment is known.
- On-call channel and owner are assigned.

## Rollback Steps

1. Freeze new deploys.
- Pause auto-deploy pipelines temporarily.

2. Roll back backend service.
- Redeploy previous stable backend image/tag (Railway or equivalent).
- Validate `/api/health` and core signal endpoints.

3. Roll back frontend service.
- Promote/redeploy previous stable Vercel build.
- Validate `/signals`, `/signals/[id]`, `/trades`, `/portfolio`.

4. Roll back ML inference deployment if needed.
- Redeploy prior Modal function revision for inference endpoint(s).
- Validate model health and inference responses.

5. Data safety confirmation.
- No DB migration rollback required.
- Confirm staging/prod DB connectivity and writes are normal.

## Post-Rollback Verification

- Run hard gates locally or in CI:
  - `bash scripts/qa/backend_hard_gates.sh`
  - `bash scripts/qa/frontend_hard_gates.sh frontend true`
- Run drift gate:
  - `bash scripts/qa/drift_gate.sh`
- Verify recent signals for policy:
  - `python scripts/staging/verify_signal_runtime.py --date YYYY-MM-DD --min-count 1`

## Communication Template

- Status: `Rollback initiated` / `Rollback completed`
- Start time (UTC), end time (UTC)
- Impact summary (API/UI/Signal generation)
- Root symptom observed
- Current state after rollback
- Follow-up owner and ETA for fix-forward

## Fix-Forward Requirements

- Root-cause identified and documented.
- Re-run release hardening checklist.
- Staging soak completed before next production attempt.
