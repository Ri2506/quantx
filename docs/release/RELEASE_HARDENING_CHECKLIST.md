# Release Hardening Checklist (Confluence-Only Long Pipeline)

## Release Candidate Freeze

- [ ] Create RC branch:
  - `git checkout -b rc/2026-02-confluence-long-only`
- [ ] Create annotated RC tag:
  - `git tag -a rc-2026-02-confluence-long-only -m "Confluence-only long pipeline hardening RC"`
- [ ] Optional helper script:
  - `bash scripts/release/create_rc_ref.sh 2026-02-confluence-long-only`
- [ ] Capture baseline command outputs:
  - `bash scripts/release/capture_rc_baseline.sh`
- [ ] Confirm baseline report exists:
  - `docs/release/RC_BASELINE.md`

## Hard CI Gates (Must Pass)

- [ ] Backend hard gates:
  - `bash scripts/qa/backend_hard_gates.sh`
- [ ] Frontend hard gates:
  - `bash scripts/qa/frontend_hard_gates.sh frontend true`
- [ ] Drift gate:
  - `bash scripts/qa/drift_gate.sh`
- [ ] GitHub workflow green:
  - `.github/workflows/release-hardening-gates.yml`
- [ ] Branch protection requires `Release Hardening Gates` status before merge/deploy.

## Staging Runtime Verification

- [ ] Run one signal cycle in staging:
  - Intraday example:
    - `python scripts/staging/run_signal_cycle.py --mode intraday --save --require-signals`
  - EOD example:
    - `python scripts/staging/run_signal_cycle.py --mode eod --save --require-signals`
- [ ] Verify staged signals contract:
  - `python scripts/staging/verify_signal_runtime.py --date YYYY-MM-DD --min-count 1`
- [ ] Confirm:
  - All records are `direction=LONG`
  - All records are `segment=EQUITY`
  - No reason string includes `regime`
  - Required fields are present: `target_1`, `target_2`, `risk_reward`, `model_agreement`, `generated_at`, `strategy_names`

## Backtest Regression

- [ ] Backtest harness sanity:
  - `python scripts/backtest_harness.py --help`
- [ ] Backtest smoke (1-3 symbols):
  - `SYMBOLS=RELIANCE,TCS,INFY PERIOD=1y bash scripts/qa/backtest_smoke.sh`
- [ ] Confirm output compatibility:
  - `regime` placeholder remains `"NONE"` in backtest outputs

## Frontend Workflow QA

- [ ] Execute-only gate:
  - `bash scripts/qa/frontend_execute_only_gate.sh`
- [ ] Manual UI checks:
  - `/signals` loads and actions are execution-oriented
  - `/signals/[id]` has no approve/reject controls
  - `pending` execution routes to `/trades`
  - `open` execution routes to `/portfolio`

## Operational Readiness

- [ ] Review non-blocking warnings:
  - `docs/release/NON_BLOCKING_WARNINGS.md`
- [ ] Review rollback procedure:
  - `docs/release/ROLLBACK_RUNBOOK.md`
- [ ] Publish release notes:
  - `docs/release/RELEASE_NOTES_2026-02-10.md`
- [ ] Stage rollout:
  - Staging soak -> production rollout -> post-release monitoring
