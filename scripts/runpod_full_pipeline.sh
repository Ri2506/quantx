#!/usr/bin/env bash
# PR 212 — bulletproof end-to-end RunPod training pipeline.
#
# Designed for a fresh pod on:
#   runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04
#
# Idempotent — re-run safely. Total runtime ~7-9 hours, ~$5-6 of $15 budget
# at $0.69/hr secure cloud RTX 4090.
#
# Usage:
#   1. SSH/web terminal into the pod
#   2. Set env vars (paste once):
#        export SUPABASE_URL=...
#        export SUPABASE_ANON_KEY=...
#        export SUPABASE_SERVICE_ROLE_KEY=...
#        export B2_APPLICATION_KEY_ID=...
#        export B2_APPLICATION_KEY=...
#   3. Run:
#        bash scripts/runpod_full_pipeline.sh

set -euo pipefail

# ── 1. Sanity checks ───────────────────────────────────────────────────────
echo "=== Phase 1: sanity checks ==="
# Disable pipefail temporarily — `nvidia-smi | head` triggers SIGPIPE when
# head closes the pipe early, which `set -o pipefail` reports as failure.
set +o pipefail
nvidia-smi 2>&1 | head -20 || true
set -o pipefail

# Real GPU check via torch (works even if nvidia-smi pipe failed)
python -c "
try:
    import torch
    if not torch.cuda.is_available():
        print('CUDA not available — abort'); raise SystemExit(1)
    print('  GPU:', torch.cuda.get_device_name(0))
except ImportError:
    print('torch not yet installed — install phase will handle')" || true

for v in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY B2_APPLICATION_KEY_ID B2_APPLICATION_KEY; do
    if [ -z "${!v:-}" ]; then
        echo "MISSING ENV VAR: $v — abort"
        exit 1
    fi
done

# Aliases (some code reads these alternate names)
export SUPABASE_SERVICE_KEY="${SUPABASE_SERVICE_KEY:-$SUPABASE_SERVICE_ROLE_KEY}"
export B2_KEY_ID="${B2_KEY_ID:-$B2_APPLICATION_KEY_ID}"
export B2_BUCKET="${B2_BUCKET:-quantx-models}"
export B2_BUCKET_MODELS="${B2_BUCKET_MODELS:-quantx-models}"
echo "env vars OK"

# ── 2. Caches on /workspace volume (50GB) ──────────────────────────────────
echo "=== Phase 2: redirect caches to /workspace ==="
mkdir -p /workspace/.cache/{pip,huggingface,torch}
ln -sfn /workspace/.cache/pip /root/.cache/pip
ln -sfn /workspace/.cache/huggingface /root/.cache/huggingface
ln -sfn /workspace/.cache/torch /root/.cache/torch
mkdir -p /workspace/.qlib && ln -sfn /workspace/.qlib /root/.qlib
df -h /workspace
echo "caches redirected"

# ── 3. Repo ────────────────────────────────────────────────────────────────
echo "=== Phase 3: clone/pull repo ==="
cd /workspace
if [ ! -d quantx ]; then
    git clone https://github.com/Ri2506/quantx.git
fi
cd /workspace/quantx
git pull origin main
echo "on commit: $(git log --oneline -1)"

export PYTHONPATH="/workspace/quantx:${PYTHONPATH:-}"

# Save env vars for resume
cat > /workspace/.envrc <<EOF
export SUPABASE_URL="$SUPABASE_URL"
export SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
export SUPABASE_SERVICE_KEY="$SUPABASE_SERVICE_KEY"
export B2_APPLICATION_KEY_ID="$B2_APPLICATION_KEY_ID"
export B2_APPLICATION_KEY="$B2_APPLICATION_KEY"
export B2_KEY_ID="$B2_KEY_ID"
export B2_BUCKET="$B2_BUCKET"
export B2_BUCKET_MODELS="$B2_BUCKET_MODELS"
export PYTHONPATH="/workspace/quantx:\${PYTHONPATH:-}"
EOF
chmod 600 /workspace/.envrc

# ── 4. Install — clean order, dependency-safe ─────────────────────────────
echo "=== Phase 4: install upstream libraries ==="

# Skip if already installed AND torch can import cleanly
if python -c "import torch, qlib, pytorch_forecasting, lightning, timesfm, ml.data; assert torch.cuda.is_available()" 2>/dev/null; then
    echo "all libs already installed and torch.cuda works — skipping install phase"
else
    pip install --quiet --upgrade pip wheel

    # 4a. Pre-emptively reinstall blinker so subsequent installs don't try
    # to uninstall the distutils-installed system version (which always fails).
    echo "  pre-installing blinker (clears distutils block)..."
    pip install --quiet --ignore-installed blinker

    # 4b. Torch trio — the foundation. Pinned versions; force-reinstall to
    # ensure all CUDA libs land at the matching version.
    echo "  installing torch 2.4.1 + matched CUDA libs..."
    pip install --quiet --force-reinstall \
        "torch==2.4.1" "torchvision==0.19.1" "torchaudio==2.4.1" \
        --index-url https://download.pytorch.org/whl/cu124

    python -c "
import torch, torch.onnx
assert torch.cuda.is_available(), 'CUDA not available'
print('  torch:', torch.__version__, '| CUDA:', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0))
"

    # 4c. Lightning + pytorch-forecasting (won't touch torch).
    echo "  installing pytorch-forecasting + lightning..."
    pip install --quiet "lightning>=2.0,<2.5"
    pip install --quiet pytorch-forecasting

    # 4d. TimesFM with --no-deps to prevent torch 2.11 upgrade. Then
    # manually install its non-torch dependencies.
    echo "  installing timesfm (Google) — no-deps to preserve torch 2.4..."
    pip install --quiet --no-deps "timesfm[torch]==1.2.7"
    pip install --quiet einshape utilsforecast jax jaxlib praxis paxml \
        2>&1 | tail -3 || true
    # The above are timesfm's runtime deps minus torch; some may be optional.

    # 4e. chronos-forecasting — also --no-deps to preserve torch
    echo "  installing chronos-forecasting (Amazon) — no-deps..."
    pip install --quiet --no-deps chronos-forecasting
    pip install --quiet "transformers>=4.30" accelerate "huggingface-hub<1.0"

    # 4f. pyqlib — may try to uninstall packages; use --no-deps + manual deps
    echo "  installing pyqlib (Microsoft)..."
    pip install --quiet --no-deps pyqlib
    pip install --quiet pyyaml gym fire ruamel.yaml mlflow plotly redis-py-cluster \
        2>&1 | tail -3 || true

    # 4g. Other ML deps — these are well-behaved, can use full deps.
    echo "  installing remaining ML deps..."
    pip install --quiet jugaad-data statsmodels lightgbm xgboost \
        supabase httpx pyarrow yfinance b2sdk hmmlearn \
        stable-baselines3 gymnasium scikit-learn \
        optuna optuna-integration \
        pandas-market-calendars korean-lunar-calendar exchange-calendars

    # 4h. Backend repo deps (best effort; --no-deps so they don't disturb torch)
    [ -f requirements-train.txt ] && pip install --quiet --no-deps -r requirements-train.txt 2>&1 | tail -3 || true

    # 4i. autogluon optional — chronos2_macro falls back to direct chronos.
    df -h / | head -2
    pip install --quiet "autogluon.timeseries>=1.1.0" 2>&1 | tail -3 \
        || echo "  autogluon skipped (chronos2_macro will use direct fallback)"

    # 4j. CRITICAL: re-pin torch trio at the end. Some upstream package
    # (autogluon or transformers) may have upgraded torch. Force back to
    # 2.4.1 with --no-deps so we don't disturb the ecosystem.
    echo "  re-pinning torch trio to 2.4.1 (some deps may have upgraded it)..."
    pip install --quiet --force-reinstall --no-deps \
        "torch==2.4.1" "torchvision==0.19.1" "torchaudio==2.4.1" \
        --index-url https://download.pytorch.org/whl/cu124
fi

# Final verify — abort if anything is still broken
python -c "
import torch, torch.onnx
assert torch.cuda.is_available(), 'CUDA not available'
import qlib, pytorch_forecasting, lightning, timesfm
import ml.data
print('all imports OK')
print('torch:', torch.__version__, '| CUDA:', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0))
print('qlib:', qlib.__version__)
"
echo "install OK"

# ── 5. Discovery sanity ────────────────────────────────────────────────────
echo "=== Phase 5: trainer discovery ==="
python -c "from ml.training.discovery import discover_sorted; t=discover_sorted(); print(f'{len(t)} trainers'); [print(' ', x.name) for x in t]"

# ── 6. Smoke test — verifies B2 + Supabase + GPU all working end-to-end ───
echo "=== Phase 6: smoke test (regime_hmm only, ~10s) ==="

# Pre-check B2 auth so we fail fast with a clear message
python -c "
from b2sdk.v2 import InMemoryAccountInfo, B2Api
import os
info = InMemoryAccountInfo()
api = B2Api(info)
api.authorize_account('production', os.environ['B2_APPLICATION_KEY_ID'], os.environ['B2_APPLICATION_KEY'])
print('  B2 auth OK')
"

# Pre-check Supabase connectivity
python -c "
from src.backend.core.config import settings
print('  Supabase URL ok:', 'abraylc' in (settings.SUPABASE_URL or ''))
print('  Supabase keys present:', bool(settings.SUPABASE_ANON_KEY) and bool(settings.SUPABASE_SERVICE_KEY))
"

python -m ml.training.runner --only regime_hmm --promote 2>&1 | tee /workspace/quantx/smoke.log
if ! grep -q "ok=1" /workspace/quantx/smoke.log; then
    echo "SMOKE FAILED — review smoke.log before proceeding"
    exit 1
fi
echo "smoke OK — regime_hmm promoted, B2 + Supabase wired"

# ── 7. Backfills (idempotent — skip if cache already populated) ───────────
echo "=== Phase 7: backfills (~30 min total, idempotent) ==="

# Fundamentals — skip if cache already has >= 1500 rows
if python -c "
import pandas as pd
from pathlib import Path
p = Path('/workspace/quantx/ml/data/cache/fundamentals_pit.parquet')
if p.exists():
    df = pd.read_parquet(p)
    assert len(df) >= 1500, f'only {len(df)} rows'
    print(f'  fundamentals already cached: {len(df)} rows / {df.symbol.nunique()} syms — skip')
else:
    raise SystemExit(1)
" 2>/dev/null; then
    echo "  fundamentals backfill SKIP (cache populated)"
else
    python scripts/backfill_fundamentals.py 2>&1 | tee /workspace/quantx/backfill_fund.log
fi

# Sentiment — skip if cache has >= 300 unique symbols today
if python -c "
import pandas as pd
from pathlib import Path
from datetime import date
p = Path('/workspace/quantx/ml/data/cache/sentiment_history.parquet')
if p.exists():
    df = pd.read_parquet(p)
    today = pd.Timestamp(date.today())
    today_rows = df[df['date'] == today]
    assert today_rows['symbol'].nunique() >= 300, f'only {today_rows[\"symbol\"].nunique()} today'
    print(f'  sentiment already cached: {len(df)} rows total, {today_rows[\"symbol\"].nunique()} today — skip')
else:
    raise SystemExit(1)
" 2>/dev/null; then
    echo "  sentiment backfill SKIP (cache populated today)"
else
    python scripts/backfill_sentiment.py 2>&1 | tee /workspace/quantx/backfill_sent.log
fi

# FII/DII (best-effort — NSE archive often blocks; safe to fail)
python scripts/backfill_fii_dii.py 2>&1 | tee /workspace/quantx/backfill_fii.log || true

# ── 8. Qlib provider build (idempotent) ───────────────────────────────────
echo "=== Phase 8: Qlib NSE provider build (~15 min) ==="

# Skip if provider already has 200+ symbols
qlib_sym_count=$(ls /root/.qlib/qlib_data/nse_data/features/ 2>/dev/null | wc -l)
if [ "$qlib_sym_count" -ge 200 ]; then
    echo "  Qlib provider has $qlib_sym_count symbols — skip rebuild"
else
    rm -rf /root/.qlib/qlib_data/nse_data
    python scripts/ingest_nse_to_qlib.py 2>&1 | tee /workspace/quantx/qlib_ingest.log
fi

# ── 9. Full training ───────────────────────────────────────────────────────
echo "=== Phase 9: full --all training run (~5-6 hours) ==="
python -m ml.training.runner --all --promote --json 2>&1 | tee /workspace/quantx/runner.log

# ── 10. Summary ────────────────────────────────────────────────────────────
echo "=== Phase 10: summary ==="
python <<'PYEOF'
import json, re
try:
    with open('/workspace/quantx/runner.log') as f:
        text = f.read()
    m = re.search(r'\[\s*\{.*\}\s*\]', text, re.DOTALL)
    if not m:
        print("no JSON report found in runner.log"); raise SystemExit(0)
    reports = json.loads(m.group(0))
    print(f"\n{'trainer':<28} {'status':<8} {'sec':>7}  {'ver':<5} {'promo':<6} primary")
    print("-" * 80)
    for r in reports:
        v = f"v{r['version']}" if r.get('version') is not None else ""
        p = "PROD" if r.get('promoted') else ""
        m_ = r.get('metrics') or {}
        primary = f"{m_.get('primary_metric','?')}={m_.get('primary_value','?')}"
        print(f"{r['name']:<28} {r['status']:<8} {r.get('duration_sec',0):>7.0f}  {v:<5} {p:<6} {primary}")
        if r.get('error'): print(f"   ↳ {r['error'][:120]}")
    counts = {"ok":0, "skipped":0, "failed":0}
    for r in reports: counts[r.get('status','ok')] = counts.get(r.get('status','ok'),0)+1
    promoted = sum(1 for r in reports if r.get('promoted'))
    print("-" * 80)
    print(f"summary: ok={counts['ok']} skipped={counts['skipped']} failed={counts['failed']} promoted={promoted}")
except Exception as exc:
    print(f"summary parse failed: {exc}")
PYEOF

echo ""
echo "============================================================================"
echo "Training session complete. STOP THE POD NOW from RunPod console — \$0.69/hr"
echo "============================================================================"
