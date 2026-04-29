# PR 3 — Model Registry Deploy Steps

> Run these once after PR 2 migration has been applied and PR 3 code is deployed. ~10 minutes.

## 1. Create the B2 bucket + application key

1. Sign in to Backblaze B2 → **Buckets** → **Create a Bucket**
   - Name: `swingai-models`
   - Files: **Private**
   - Default encryption: **SSE-B2**
2. **App Keys** → **Add a New Application Key**
   - Name: `swingai-model-registry`
   - Bucket: `swingai-models` (scoped, not master)
   - Type: **Read and Write**
3. Copy `keyID` and `applicationKey` — you only see `applicationKey` once.

## 2. Set the env vars

**Local `.env`:**
```
B2_APPLICATION_KEY_ID=<keyID>
B2_APPLICATION_KEY=<applicationKey>
B2_BUCKET_MODELS=swingai-models
MODEL_CACHE_DIR=.model_cache
```

**Railway production:** same three vars via `railway variables set`.

## 3. Install b2sdk

```bash
pip install -r requirements.txt
```

## 4. Run the migration

```bash
python scripts/upload_existing_models_to_b2.py --git-sha $(git rev-parse HEAD)
```

Expected output: 5 models registered at v1, 8 files uploaded total.

Re-run with `--force` if you need to overwrite. Use `--only regime_hmm` to migrate a single model.

## 5. Verify

Spot-check the table:
```sql
select model_name, version, is_prod, is_shadow, trained_by, artifact_uri
  from public.model_versions
  order by model_name;
```

Expected rows:
| model_name | version | is_prod | is_shadow |
|---|---|---|---|
| breakout_meta_labeler | 1 | true | false |
| lgbm_signal_gate | 1 | false | true |
| quantai_ranker | 1 | false | true |
| regime_hmm | 1 | true | false |
| tft_swing | 1 | false | true |

B2 side: the bucket should contain `<model_name>/v1/<filename>` for each file.

## 6. Smoke-test registry.resolve()

```bash
python -c "
from src.backend.ai.registry import get_registry
reg = get_registry()
path = reg.resolve('regime_hmm')
print('regime_hmm files:', list(path.iterdir()))
"
```

First run downloads from B2, second run hits the local cache.

## Rollback

If something goes wrong:
```sql
delete from public.model_versions where trained_by = 'pr3-migration';
```
Then delete the B2 bucket contents via the Backblaze UI. The `ml/models/` on-disk artifacts are untouched, so the app keeps running on disk-path loaders until PR 4 switches to the registry.
