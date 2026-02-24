# Release Notes - 2026-02-10

## Title

Confluence-Only Long Pipeline: Selector/Regime Removal Hardening Release

## Summary

This release finalizes the removal of selector/regime runtime dependencies and hardens the repo for safe rollout.
Live signal behavior is enforced as long-only (`LONG`) in equity (`EQUITY`) for the current pipeline.

## Highlights

1. Strategy and backtest alignment
- Runtime and backtests use `ml/strategies/confluence_ranker.py`.
- Legacy selector/regime paths were removed from active code.
- Backtest compatibility keeps `regime="NONE"` placeholders.

2. Frontend execution flow alignment
- Signal detail page remains execute-only (`trades.execute`).
- No approve/reject controls in signal detail workflow.
- Route behavior preserved:
  - `pending` -> `/trades`
  - `open` -> `/portfolio`

3. CI and QA hardening
- Added release hardening workflow:
  - `.github/workflows/release-hardening-gates.yml`
- Added reusable hard gate scripts under `scripts/qa/`.
- Added drift gate for forbidden selector/regime references.

4. Staging verification tooling
- Added staging signal cycle runner:
  - `scripts/staging/run_signal_cycle.py`
- Added staging signal contract verifier:
  - `scripts/staging/verify_signal_runtime.py`

5. Operational readiness docs
- `docs/release/RELEASE_HARDENING_CHECKLIST.md`
- `docs/release/ROLLBACK_RUNBOOK.md`
- `docs/release/NON_BLOCKING_WARNINGS.md`
- `docs/release/RC_BASELINE.md` (generated via script)

## API/Schema Impact

- No database schema migration.
- No breaking API contract changes introduced in this hardening phase.

## Known Non-Blocking Items

- Next.js `metadataBase` warning.
- Deprecated npm package warnings.
- Prisma postinstall warning guarded by `|| true`.

## Rollout Plan

1. Staging soak with runtime signal verification.
2. Production rollout after hard gates + staging checks pass.
3. Post-release monitoring for signal policy and execution flow.
