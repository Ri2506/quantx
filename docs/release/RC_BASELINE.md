# RC Baseline Verification

- Generated: 2026-02-10 22:57:55 UTC
- Purpose: Capture release-candidate hard-gate results before rollout.

## Import SignalGenerator
```bash
python -c from\ src.backend.services.signal_generator\ import\ SignalGenerator\;\ print\(\'SignalGenerator\ import\ OK\'\) 
```
```text
SignalGenerator import OK
exit_code=0
```

## Import BacktestEngine
```bash
python -c from\ ml.backtest.backtest_engine\ import\ BacktestEngine\;\ BacktestEngine\(\)\;\ print\(\'BacktestEngine\ init\ OK\'\) 
```
```text
INFO:ml.backtest.backtest_engine:Loaded 57 strategies
BacktestEngine init OK
exit_code=0
```

## Import ComprehensiveBacktestEngine
```bash
python -c from\ ml.backtest.comprehensive_backtest\ import\ ComprehensiveBacktestEngine\;\ ComprehensiveBacktestEngine\(\)\;\ print\(\'ComprehensiveBacktestEngine\ init\ OK\'\) 
```
```text
INFO:ml.backtest.comprehensive_backtest:Loaded 57 strategies
ComprehensiveBacktestEngine init OK
exit_code=0
```

## Strategy Test Suite
```bash
pytest -q backend/tests/test_long_strategies.py backend/tests/test_signal_save_contract.py 
```
```text
.....                                                                    [100%]
=============================== warnings summary ===============================
../../../../Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/dateutil/tz/tz.py:37
  /Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/dateutil/tz/tz.py:37: DeprecationWarning: datetime.datetime.utcfromtimestamp() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.fromtimestamp(timestamp, datetime.UTC).
    EPOCH = datetime.datetime.utcfromtimestamp(0)

src/backend/core/config.py:11
  /Users/rishi/Downloads/Swing_AI_Final/src/backend/core/config.py:11: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
    class Settings(BaseSettings):

backend/tests/test_signal_save_contract.py::test_save_signals_preserves_required_contract_fields
  /Users/rishi/Downloads/Swing_AI_Final/src/backend/services/signal_generator.py:1140: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    "generated_at": datetime.utcnow().isoformat()

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
5 passed, 3 warnings in 4.30s
exit_code=0
```

## Backtest Harness Help
```bash
python scripts/backtest_harness.py --help 
```
```text
usage: backtest_harness.py [-h] [--symbol SYMBOL] [--symbols SYMBOLS]
                           [--universe-file UNIVERSE_FILE] [--period PERIOD]
                           [--start START] [--end END]
                           [--data-source {yfinance,nsepy}]
                           [--index-symbol INDEX_SYMBOL]
                           [--index-period INDEX_PERIOD]
                           [--yf-timeout YF_TIMEOUT] [--yf-proxy YF_PROXY]
                           [--yf-user-agent YF_USER_AGENT]
                           [--yf-impersonate YF_IMPERSONATE] [--yf-no-threads]
                           [--nsepy-chunk-days NSEPY_CHUNK_DAYS]
                           [--nsepy-insecure] [--nsepy-force-tls12]
                           [--nsepy-skip-symbolcount] [--nsepy-http-only]
                           [--nsepy-no-redirect] [--nsepy-archives]
                           [--min-confluence MIN_CONFLUENCE]
                           [--hold-days HOLD_DAYS] [--stop-mult STOP_MULT]
                           [--target-mult TARGET_MULT] [--fee FEE]
                           [--position-size POSITION_SIZE]
                           [--initial-capital INITIAL_CAPITAL] [--tune]
                           [--tune-hold-days TUNE_HOLD_DAYS]
                           [--tune-stop-mults TUNE_STOP_MULTS]
                           [--tune-target-mults TUNE_TARGET_MULTS]
                           [--tune-top TUNE_TOP] [--walk-forward]
                           [--robustness] [--wf-train-years WF_TRAIN_YEARS]
                           [--wf-test-years WF_TEST_YEARS]
                           [--wf-step-months WF_STEP_MONTHS]
                           [--sweep-pct SWEEP_PCT]

Strategy backtest harness

options:
  -h, --help            show this help message and exit
  --symbol SYMBOL       Symbol (e.g., RELIANCE.NS)
  --symbols SYMBOLS     Comma-separated symbols (e.g., RELIANCE,TCS,INFY)
  --universe-file UNIVERSE_FILE
                        Path to symbol list file
  --period PERIOD       History period (e.g., 2y, 5y)
  --start START         Start date YYYY-MM-DD (optional)
  --end END             End date YYYY-MM-DD (optional)
  --data-source {yfinance,nsepy}
                        OHLCV source
  --index-symbol INDEX_SYMBOL
                        Index symbol for RS benchmark (default ^NSEI)
  --index-period INDEX_PERIOD
                        Index history period (defaults to --period)
  --yf-timeout YF_TIMEOUT
                        yfinance request timeout (seconds)
  --yf-proxy YF_PROXY   Proxy URL for yfinance (e.g.,
                        http://user:pass@host:port)
  --yf-user-agent YF_USER_AGENT
                        Custom User-Agent for yfinance requests
  --yf-impersonate YF_IMPERSONATE
                        curl_cffi impersonate profile (e.g., chrome120)
  --yf-no-threads       Disable yfinance threading
  --nsepy-chunk-days NSEPY_CHUNK_DAYS
                        Chunk size (days) for nsepy requests
  --nsepy-insecure      Disable SSL verification for nsepy
  --nsepy-force-tls12   Force TLS1.2 for nsepy https calls
  --nsepy-skip-symbolcount
                        Use local symbol_count cache only
  --nsepy-http-only     Force HTTP endpoints for nsepy
  --nsepy-no-redirect   Disable redirects for nsepy requests
  --nsepy-archives      Use archives.nseindia.com endpoints
  --min-confluence MIN_CONFLUENCE
                        Min confluence (0-1)
  --hold-days HOLD_DAYS
                        Time exit in days
  --stop-mult STOP_MULT
                        Stop multiplier vs base risk (1.0 = baseline)
  --target-mult TARGET_MULT
                        Target multiplier vs base risk (2.0 = baseline)
  --fee FEE             Fee per side (e.g., 0.0001 = 0.01%)
  --position-size POSITION_SIZE
                        Position size as fraction of capital
  --initial-capital INITIAL_CAPITAL
                        Initial capital for PnL estimate
  --tune                Grid search hold-days/SL/TP multipliers
  --tune-hold-days TUNE_HOLD_DAYS
                        Hold-days list (csv or start:end:step)
  --tune-stop-mults TUNE_STOP_MULTS
                        Stop multipliers list (csv or start:end:step)
  --tune-target-mults TUNE_TARGET_MULTS
                        Target multipliers list (csv or start:end:step)
  --tune-top TUNE_TOP   Show top N tuning configs
  --walk-forward        Run walk-forward robustness test
  --robustness          Alias for --walk-forward
  --wf-train-years WF_TRAIN_YEARS
                        Walk-forward train window (years)
  --wf-test-years WF_TEST_YEARS
                        Walk-forward test window (years)
  --wf-step-months WF_STEP_MONTHS
                        Walk-forward step size (months)
  --sweep-pct SWEEP_PCT
                        Sweep percentage around base config (e.g., 0.2)
exit_code=0
```

## Backend Hard Gates Script
```bash
bash scripts/qa/backend_hard_gates.sh 
```
```text
Running backend hard gates...
SignalGenerator import OK
INFO:ml.backtest.backtest_engine:Loaded 57 strategies
BacktestEngine init OK
INFO:ml.backtest.comprehensive_backtest:Loaded 57 strategies
ComprehensiveBacktestEngine init OK
.....                                                                    [100%]
=============================== warnings summary ===============================
../../../../Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/dateutil/tz/tz.py:37
  /Library/Frameworks/Python.framework/Versions/3.12/lib/python3.12/site-packages/dateutil/tz/tz.py:37: DeprecationWarning: datetime.datetime.utcfromtimestamp() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.fromtimestamp(timestamp, datetime.UTC).
    EPOCH = datetime.datetime.utcfromtimestamp(0)

src/backend/core/config.py:11
  /Users/rishi/Downloads/Swing_AI_Final/src/backend/core/config.py:11: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.12/migration/
    class Settings(BaseSettings):

backend/tests/test_signal_save_contract.py::test_save_signals_preserves_required_contract_fields
  /Users/rishi/Downloads/Swing_AI_Final/src/backend/services/signal_generator.py:1140: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
    "generated_at": datetime.utcnow().isoformat()

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
5 passed, 3 warnings in 3.49s
Running drift gate for deleted selector/regime references...
Drift gate passed.
Checking execute-only signal detail flow...
Execute-only gate passed.
Backend hard gates passed.
exit_code=0
```

## Src Frontend Hard Gates
```bash
bash scripts/qa/frontend_hard_gates.sh frontend true
```
```text
Running frontend hard gates in frontend...
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm warn deprecated @humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead
npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated @humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead
npm warn deprecated @supabase/auth-helpers-shared@0.6.3: This package is now deprecated - please use the @supabase/ssr package instead.
npm warn deprecated @supabase/auth-helpers-react@0.4.2: This package is now deprecated - please use the @supabase/ssr package instead.
npm warn deprecated @supabase/auth-helpers-nextjs@0.9.0: This package is now deprecated - please use the @supabase/ssr package instead.
npm warn deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.
npm warn deprecated next@14.1.0: This version has a security vulnerability. Please upgrade to a patched version. See https://nextjs.org/blog/security-update-2025-12-11 for more details.

> swingai-frontend@2.0.0 postinstall
> prisma generate || true

sh: prisma: command not found

added 594 packages, and audited 595 packages in 30s

166 packages are looking for funding
  run `npm fund` for details

6 vulnerabilities (1 moderate, 4 high, 1 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.

> swingai-frontend@2.0.0 build
> NODE_OPTIONS='--require ./scripts/force-wasm.js' next build

   ▲ Next.js 14.1.0

   Creating an optimized production build ...
 ✓ Compiled successfully
   Linting and checking validity of types ...
   Collecting page data ...
   Generating static pages (0/21) ...

 ⚠ metadata.metadataBase is not set for resolving social open graph or twitter images, using "http://localhost:3000". See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase

 ⚠ metadata.metadataBase is not set for resolving social open graph or twitter images, using "http://localhost:3000". See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase

 ⚠ metadata.metadataBase is not set for resolving social open graph or twitter images, using "http://localhost:3000". See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase

 ⚠ metadata.metadataBase is not set for resolving social open graph or twitter images, using "http://localhost:3000". See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase

 ⚠ metadata.metadataBase is not set for resolving social open graph or twitter images, using "http://localhost:3000". See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase

 ⚠ metadata.metadataBase is not set for resolving social open graph or twitter images, using "http://localhost:3000". See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase

 ⚠ metadata.metadataBase is not set for resolving social open graph or twitter images, using "http://localhost:3000". See https://nextjs.org/docs/app/api-reference/functions/generate-metadata#metadatabase
   Generating static pages (5/21) 
   Generating static pages (10/21) 
   Generating static pages (15/21) 
 ✓ Generating static pages (21/21) 
   Finalizing page optimization ...
   Collecting build traces ...

Route (app)                              Size     First Load JS
┌ ○ /                                    17.1 kB         153 kB
├ ○ /_not-found                          886 B          85.3 kB
├ ○ /admin                               4.46 kB         126 kB
├ ○ /admin/payments                      4.58 kB         126 kB
├ ○ /admin/signals                       4.05 kB         125 kB
├ ○ /admin/system                        5.13 kB         126 kB
├ ○ /admin/users                         5.58 kB          90 kB
├ λ /admin/users/[id]                    5.81 kB        97.1 kB
├ ○ /analytics                           4.26 kB         149 kB
├ ○ /dashboard                           5.18 kB         331 kB
├ ○ /forgot-password                     2.85 kB         208 kB
├ ○ /login                               4.71 kB         210 kB
├ ○ /portfolio                           2.9 kB          329 kB
├ ○ /pricing                             4.15 kB         130 kB
├ ○ /screener                            10.6 kB         139 kB
├ ○ /settings                            5.63 kB         187 kB
├ ○ /signals                             6.56 kB         188 kB
├ λ /signals/[id]                        5.12 kB         191 kB
├ ○ /signup                              8.25 kB         213 kB
├ ○ /trades                              3.63 kB         185 kB
└ ○ /verify-email                        1.34 kB         129 kB
+ First Load JS shared by all            84.5 kB
  ├ chunks/69-4e10c0a4adea7f23.js        29.1 kB
  ├ chunks/fd9d1056-632421989ba959f4.js  53.4 kB
  └ other shared chunks (total)          2.01 kB


○  (Static)   prerendered as static content
λ  (Dynamic)  server-rendered on demand using Node.js

Frontend hard gates passed for frontend.
exit_code=0
```

## Legacy Frontend Hard Gates
```bash
bash scripts/qa/frontend_hard_gates.sh frontend false 
```
```text
Running frontend hard gates in frontend...
npm warn deprecated inflight@1.0.6: This module is not supported, and leaks memory. Do not use it. Check out lru-cache if you want a good and tested way to coalesce async requests by a key value, which is much more comprehensive and powerful.
npm warn deprecated @humanwhocodes/config-array@0.13.0: Use @eslint/config-array instead
npm warn deprecated rimraf@3.0.2: Rimraf versions prior to v4 are no longer supported
npm warn deprecated glob@7.2.3: Glob versions prior to v9 are no longer supported
npm warn deprecated @humanwhocodes/object-schema@2.0.3: Use @eslint/object-schema instead
npm warn deprecated @supabase/auth-helpers-shared@0.6.3: This package is now deprecated - please use the @supabase/ssr package instead.
npm warn deprecated @supabase/auth-helpers-react@0.4.2: This package is now deprecated - please use the @supabase/ssr package instead.
npm warn deprecated @supabase/auth-helpers-nextjs@0.9.0: This package is now deprecated - please use the @supabase/ssr package instead.
npm warn deprecated eslint@8.57.1: This version is no longer supported. Please see https://eslint.org/version-support for other options.
npm warn deprecated next@14.1.0: This version has a security vulnerability. Please upgrade to a patched version. See https://nextjs.org/blog/security-update-2025-12-11 for more details.

> swingai-frontend@2.0.0 postinstall
> prisma generate || true

sh: prisma: command not found

added 596 packages, and audited 597 packages in 37s

166 packages are looking for funding
  run `npm fund` for details

6 vulnerabilities (1 moderate, 4 high, 1 critical)

To address issues that do not require attention, run:
  npm audit fix

To address all issues (including breaking changes), run:
  npm audit fix --force

Run `npm audit` for details.
Frontend hard gates passed for frontend.
exit_code=0
```

## Drift Gate
```bash
bash scripts/qa/drift_gate.sh 
```
```text
Running drift gate for deleted selector/regime references...
Drift gate passed.
exit_code=0
```

