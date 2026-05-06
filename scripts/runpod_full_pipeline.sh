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
nvidia-smi | head -10 || { echo "GPU not detected"; exit 1; }

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

# ── 4. Install — clean order, no --ignore-installed ────────────────────────
echo "=== Phase 4: install upstream libraries ==="
pip install --quiet --upgrade pip wheel

# Don't try to upgrade system blinker — it's distutils-installed
# Just make sure our deps don't try to either.
pip install --quiet --no-cache-dir --break-system-packages \
    --upgrade --force-reinstall \
    "torch==2.4.1" "torchvision==0.19.1" "torchaudio==2.4.1" \
    --index-url https://download.pytorch.org/whl/cu124 \
    || pip install --quiet \
        "torch==2.4.1" "torchvision==0.19.1" "torchaudio==2.4.1" \
        --index-url https://download.pytorch.org/whl/cu124

# Verify torch BEFORE proceeding
python -c "import torch; assert torch.cuda.is_available(), 'CUDA not available'; print('torch:', torch.__version__, '| CUDA:', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0))"

# Install ML libs in dependency-safe order
pip install --quiet "lightning>=2.0,<2.5"
pip install --quiet pytorch-forecasting
pip install --quiet "timesfm[torch]==1.2.7"
pip install --quiet pyqlib
pip install --quiet chronos-forecasting jugaad-data statsmodels lightgbm xgboost

# Backend deps
[ -f requirements-train.txt ] && pip install --quiet -r requirements-train.txt --no-deps || true
pip install --quiet supabase httpx pandas pyarrow yfinance b2sdk hmmlearn \
    transformers stable-baselines3 gymnasium scikit-learn

# autogluon (optional, ~3GB) — if disk allows
df -h / | head -2
pip install --quiet "autogluon.timeseries>=1.1.0" 2>&1 | tail -3 || echo "autogluon skipped (disk/dep issue) — chronos2_macro will use direct fallback"

# Final verify
python -c "
import torch, qlib, pytorch_forecasting, lightning, timesfm
import ml.data
print('all imports OK')
print('torch:', torch.__version__, '| CUDA:', torch.cuda.is_available(), '|', torch.cuda.get_device_name(0))
print('qlib:', qlib.__version__)
"
echo "install OK"

# ── 5. Discovery sanity ────────────────────────────────────────────────────
echo "=== Phase 5: trainer discovery ==="
python -c "from ml.training.discovery import discover_sorted; t=discover_sorted(); print(f'{len(t)} trainers'); [print(' ', x.name) for x in t]"

# ── 6. Smoke test ──────────────────────────────────────────────────────────
echo "=== Phase 6: smoke test (regime_hmm only, ~10s) ==="
python -m ml.training.runner --only regime_hmm --promote 2>&1 | tee /workspace/quantx/smoke.log
if ! grep -q "ok=1" smoke.log; then
    echo "SMOKE FAILED — review smoke.log before proceeding"
    exit 1
fi
echo "smoke OK"

# ── 7. Backfills ───────────────────────────────────────────────────────────
echo "=== Phase 7: backfills (~30 min total) ==="
python scripts/backfill_fundamentals.py 2>&1 | tee /workspace/quantx/backfill_fund.log
python scripts/backfill_sentiment.py    2>&1 | tee /workspace/quantx/backfill_sent.log

# Skip FII/DII if jugaad-data archive unreachable (graceful — already handled)
python scripts/backfill_fii_dii.py 2>&1 | tee /workspace/quantx/backfill_fii.log || true

# ── 8. Qlib provider ───────────────────────────────────────────────────────
echo "=== Phase 8: Qlib NSE provider build (~15 min) ==="
rm -rf /root/.qlib/qlib_data/nse_data
python scripts/ingest_nse_to_qlib.py 2>&1 | tee /workspace/quantx/qlib_ingest.log

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
