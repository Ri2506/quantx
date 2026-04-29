# Step 2 — AI Stack & Model Training Plan

> **2026-04-18 override:** Broker strategy reversed — direct OAuth to Zerodha + Upstox + Angel One. OpenAlgo removed from the product entirely. Where this doc references OpenAlgo or user-side broker hosting, treat it as superseded by `memory/project_broker_strategy_2026_04_18.md`.

> Step 2 of 4. Builds directly on Step 1 (Feature Decisions, locked 2026-04-18). Covers every named AI model for every feature in the master list — exact HuggingFace repo / library / version, training data + recipe, evaluation, deployment, retrain cadence, integration into existing Swing AI code.
>
> **Locked constraints from Step 1** (enforced throughout this doc):
> - Gemini 2.0 Flash is the **only** LLM (no GPT-4o, no Claude). Powers all agent work + explanations + summarization + vision.
> - OpenAlgo is the **only** broker adapter.
> - All 15 research-doc features IN v1 (F1-F12 + B1/B2/B3) + 12 synthesis (N1-N12).
> - Pattern engine is **standalone** (Scanner Lab Pattern tab), not alpha.
> - **Pre-trained in v1. Fine-tune from Month 2** on user-outcome data.
> - Mobile deferred. 3-tier structure (Free / Pro ₹999 / Elite ₹1,999).
>
> **Beginner-friendly training promise:** Rishi is a beginner ML engineer. Every "from-scratch" or "fine-tune" recipe in §2 lists concretely what Rishi executes on his laptop / Colab / Modal, and what I (the co-founder) review/debug. Nothing in this stack requires him to train a foundation model from scratch. The heaviest lifts are monthly fine-tunes on pre-trained checkpoints.

---

## 0 — Framing

### The 9-layer AI stack

Every AI feature in Swing AI consumes one or more of these layers:

| Layer | Purpose | Models |
|---|---|---|
| **L0 — LLM** | Agent reasoning + explanations + summarization + vision | Gemini 2.0 Flash (only) |
| **L1 — TS Foundation Models** | Zero-shot + fine-tuned price forecasting | Google TimesFM 200M; Amazon Chronos-Bolt (Base + Small); Amazon Chronos-2 |
| **L2 — Quantitative ML** | Cross-sectional alpha, event prediction | Qlib Alpha158 + LightGBM; XGBoost surprise; PyPortfolioOpt BL optimizer |
| **L3 — Deep Temporal** | Multi-step price + volatility forecasting | Temporal Fusion Transformer (pytorch-forecasting); 2-layer BiLSTM + GRU |
| **L4 — Sentiment + NLP** | News / filings / concall scoring | FinBERT-India v1 (Vansh180); FinGPT Forecaster HG-NC |
| **L5 — Agent Reasoning** | Orchestration of L0 into specialized agents | LangGraph over Gemini → FinRobot CoT pattern; TradingAgents Bull/Bear/Risk/Trader pattern |
| **L6 — Regime Detection** | Bull / Sideways / Bear state | hmmlearn GaussianHMM (existing trained) + Chronos-2 covariate layer |
| **L7 — Portfolio Optimization** | Weight construction | PyPortfolioOpt Markowitz + Black-Litterman |
| **L8 — RL (Auto-Trader)** | Portfolio weight policy learning | FinRL-X Ensemble: PPO + DDPG + A2C (Stable-Baselines3); Options-specific PPO |

### Mapping features → layers

| Feature | L0 LLM | L1 TS Foundation | L2 Quant | L3 Deep | L4 Sentiment | L5 Agents | L6 Regime | L7 Portfolio | L8 RL |
|---|---|---|---|---|---|---|---|---|---|
| F1 Intraday | ✓ (explain) | | | **BiLSTM** | **FinBERT** | | ✓ (gate) | | |
| F2 Swing | ✓ (explain) | | **Qlib** | **TFT** | **FinGPT HG-NC** | | ✓ (gate) | | |
| F3 Momentum | ✓ (digest) | **TimesFM+Chronos** | **Qlib** | | | | ✓ (gate) | | |
| F4 Auto-Trader | ✓ (report) | | **Qlib** (selector) | | | | ✓ (gate) | | **FinRL-X** |
| F5 AI SIP | ✓ (CoT) | | **Qlib Quality** | | ✓ (FinBERT) | **FinRobot** | ✓ (rebalance) | **BL optimizer** | |
| F6 F&O | | | | **TFT-VIX** | | | ✓ | | **Options-PPO** |
| F7 Portfolio Doctor | ✓ | | ✓ | | **FinBERT** | **FinRobot** | | | |
| F8 Regime | ✓ (explain) | **Chronos-2** (macro) | | | | | **HMM** (primary) | | |
| F9 Earnings | ✓ (transcript) | | **XGBoost** | | **FinBERT** | **FinRobot** | | | |
| F10 Sector Rotation | ✓ (narrative) | | **Qlib sector** | | | | ✓ | | |
| F11 Paper Coach | ✓ (explain) | (consumes all) | (consumes) | (consumes) | (consumes) | | | | |
| F12 Digest | ✓ (summary) | (consumes) | (consumes) | | (consumes) | | (consumes) | | |
| B1 TradingAgents | ✓ (7 agents) | | | | | **Bull/Bear debate** | | | |
| B2 FinAgent Vision | ✓ (Gemini vision) | | | | | ✓ (vision agent) | | | |
| B3 Marketplace | | | | | | | | | |
| N1 AI Copilot | ✓ (tool-use) | | | | | ✓ (tool agent) | | | |
| N10 Weekly Review | ✓ (narrative) | | (consumes) | | | | (consumes) | | |

Scanner Lab Pattern Scanner (standalone, not AI signal pipeline) uses `BreakoutMetaLabeler` (existing RandomForest) and the 11-type rule-based pattern engine. Scored separately.

---

## 1 — Per-model specifications

Each spec covers: purpose, library/version, HF repo, data source, training recipe, evaluation, inference deployment, retrain cadence, integration file-path, beginner workflow.

### 1.1 — Gemini 2.0 Flash (L0, shared across 14 features)

**Purpose:** Single LLM for all agent reasoning (FinRobot CoT, TradingAgents debate), trade explanations (F11), weekly portfolio review (N10), digest summarization (F12), AI Copilot (N1), FinAgent vision (B2 via Gemini's native multimodal). Sentiment fallback too.

**Library / version:** `google-genai>=1.57.0` (already in `requirements.txt` per [requirements.txt](../requirements.txt)). Model IDs used: `gemini-2.0-flash-exp` (primary), `gemini-2.0-flash-thinking-exp` (for complex CoT debate reasoning in B1 high-stakes signals).

**No training required** — API-served pre-trained model.

**Data fed in per call:** structured prompt with signal row fields (entry, target, stop, TFT/Qlib/LSTM/FinBERT scores, regime), portfolio context (for copilot), raw news headlines (for digest), chart image (for B2 FinAgent). **Never feed free-form text back into numeric outputs** — all numbers in responses must be substituted from structured inputs, prompts use Jinja templates that lock numeric slots.

**Inference:**
- All calls via existing `AssistantService` Gemini wrapper at [src/backend/services/assistant/assistant_service.py:44](../src/backend/services/assistant/assistant_service.py). Extend the same client for all other Gemini tasks — one rate-limit pool, one key, one cost meter.
- Rate limit: 10 RPM per existing `sentiment_engine.py:71-72` config. Raise to 60 RPM on paid tier; add exponential backoff + cache by `signal_id` for explanations.
- Async + batched where possible. Morning digest batches all users' digests into one loop to respect RPM.

**Caching strategy:**
- Per-signal explanations: compute once on signal insert, cache in `signals.explanation_text` column (already exists in schema). Never regenerate unless signal row mutates.
- Weekly portfolio reviews: compute Sunday night, store in new `user_weekly_reviews(user_id, week_of, content)` table.
- FinAgent vision: cache by `symbol + date_snapshot_window`.

**Integration touchpoints:**
- New service `src/backend/services/llm_tasks.py` — thin dispatcher over `AssistantService.client` that routes task types (explainer / reviewer / digest / agent / vision) to the right prompt template.
- New file `src/backend/services/prompts/` — Jinja2 templates for each prompt type. One file per task: `explain_signal.j2`, `weekly_review.j2`, `digest_morning.j2`, `digest_evening.j2`, `finrobot_fundamental.j2`, `finrobot_risk.j2`, `finrobot_sentiment.j2`, `finrobot_comparison.j2`, `tradingagents_bull.j2`, `tradingagents_bear.j2`, `tradingagents_risk.j2`, `tradingagents_trader.j2`, `copilot_system.j2`, `finagent_vision.j2`.

**What Rishi does:**
1. Validate the 14 prompt templates against sample signals (I write drafts, you read + tweak for tone/correctness).
2. Nothing else — no training.

**What I do:**
1. Write the dispatcher + templates with examples.
2. Engineer the `copilot_system.j2` tool-use specification (list all 80 APIs copilot can call, per `frontend/lib/api.ts` namespace).

---

### 1.2 — Google TimesFM 200M (L1, zero-shot — F3)

**Purpose:** Zero-shot multi-horizon price forecasts for F3 AI Momentum Picks. No NSE-specific training needed in v1 — the model was pre-trained on 100B real-world time points and transfers to NSE out-of-the-box.

**Library / version:** `timesfm>=1.2.0` + `pytorch>=2.1.0`. HF repo `google/timesfm-1.0-200m-pytorch`.

**Model size:** 200M params. Inference on CPU in ~200ms per 500-stock batch (ONNX-converted). No GPU needed for inference.

**Training:** None in v1 (zero-shot). Month 2+ optional fine-tune — see §3.

**Inference recipe:**
```python
# src/backend/services/forecast_engine.py
import timesfm
tfm = timesfm.TimesFmTorch(
    hparams=timesfm.TimesFmHparams(
        backend="cpu", per_core_batch_size=32,
        horizon_len=15, input_patch_len=32,
        output_patch_len=128, num_layers=20, context_len=512,
    ),
    checkpoint=timesfm.TimesFmCheckpoint(huggingface_repo_id="google/timesfm-1.0-200m-pytorch"),
)
forecasts, quantiles = tfm.forecast(inputs=[past_close_series], freq=[0])
# forecasts: [1, 15] — 15-day ahead
# quantiles: [1, 15, 10] — 10 quantile bands
```

**Data in:** 512 trailing daily closes per symbol (≥2 years), from `MarketData` service (existing Kite/yfinance providers).

**Data out:** 1/5/10/15-day ahead point forecast + 10 quantile bands. Persisted to new `forecast_scores(symbol, date, horizon_days, timesfm_p10, timesfm_p50, timesfm_p90, computed_at)` table.

**Evaluation:**
- Walk-forward on Nifty 500 × 2022-2025.
- Metric: MAPE per horizon, directional accuracy (sign of p50-today vs sign of actual return).
- Target: ≥55% directional accuracy at 5-day horizon (zero-shot claim from TimesFM paper).

**Deployment:** ONNX export from PyTorch checkpoint. Serve via FastAPI microservice on Railway CPU. Batched nightly.

**Retrain cadence:** None in v1. Month 4+ LoRA fine-tune on NSE residuals if directional accuracy < 55%.

**Integration:**
- New file `src/backend/services/forecast_engine.py` — wraps TimesFM + Chronos into ensemble forecaster.
- Called by `SignalGenerator.generate_signals()` for F2/F3 features at [signal_generator.py:40](../src/backend/services/signal_generator.py) (to be added in enrichment loop).
- Called by scheduler job `forecast_nightly` at 15:50 IST (5 min after Qlib).
- New columns on `signals` table: `timesfm_p50`, `timesfm_direction` (migration file `infrastructure/database/migrations/20260419_timesfm.sql`).

**What Rishi does:**
1. `pip install timesfm` in the project venv.
2. Run the one-liner inference test notebook I'll write on RELIANCE.NS to verify forecast output.
3. Commit the ONNX-converted checkpoint to `ml/models/timesfm_200m.onnx` or download on first run.

**What I do:** Wrap the forecaster + scheduler + DB migration.

---

### 1.3 — Amazon Chronos-Bolt + Chronos-2 (L1, zero-shot + fine-tune — F3 + F8)

**Purpose:**
- **Chronos-Bolt Base** (205M): faster zero-shot forecaster, paired with TimesFM for F3 ensemble. CPU-friendly.
- **Chronos-2** (120M): macro-aware variant — takes India VIX, INR/USD, FII net flow, US 10Y yield as **covariates**. Used for F8 regime persistence forecasting (how long will current regime last) and F3 macro-conditioned momentum.

**Library / version:** `autogluon.timeseries>=1.1.0` (preferred — wraps Chronos with AutoGluon's API) OR direct `amazon-chronos>=2.0.0`. HF repos: `amazon/chronos-bolt-base`, `amazon/chronos-bolt-small` (fallback), `amazon/chronos-2` (when publicly released on HF; as of 2026-01 it's behind waitlist — fallback to `chronos-t5-large` until available).

**Model size:** Chronos-Bolt Base 205M, Chronos-2 120M. Both CPU-inferable.

**Training:**
- **Zero-shot in v1.** No training required for Chronos-Bolt.
- **10-minute NSE fine-tune** for Chronos-Bolt (optional, Month 1-2): AutoGluon's `TimeSeriesPredictor(prediction_length=10).fit(train_data=nse_df, presets="chronos_bolt", time_limit=600)`. Uses LoRA internally.
- **Chronos-2 covariate fit**: runs zero-shot with India VIX / FII / FX / UST10Y as known-future covariates. See [autogluon.timeseries](https://auto.gluon.ai/stable/tutorials/timeseries/forecasting-chronos.html).

**Data in:**
- **Chronos-Bolt:** 512 trailing daily closes, Nifty 500 universe, 10-year history from yfinance.
- **Chronos-2:** same + covariate frame (VIX from NSE/Kite, INR/USD from yfinance `INR=X`, FII flow from existing `NSEData` service, UST10Y from yfinance `^TNX`).

**Evaluation:** same protocol as TimesFM (§1.2). Expected ensemble lift (TimesFM + Chronos-Bolt): +3-5 pp directional accuracy over single-model per research-doc §Tier A.

**Deployment:** AutoGluon models serve natively via their `predict()` API; wrap in FastAPI endpoint. Chronos-2 too large for Railway free tier — deploy on Modal serverless GPU (pay-per-call, ~$0.60/hr A10G) OR HuggingFace Inference Endpoint.

**Retrain cadence:** Monthly fine-tune of Chronos-Bolt on last 30 days NSE (AutoGluon handles).

**Integration:** Same `forecast_engine.py` as §1.2. `ensemble_forecast = 0.4 * timesfm_p50 + 0.4 * chronos_bolt_p50 + 0.2 * chronos_2_p50`. Persisted to `forecast_scores` table columns `chronos_bolt_p50`, `chronos_2_p50`, `ensemble_p50`.

**What Rishi does:**
1. `pip install autogluon.timeseries`.
2. Run the AutoGluon tutorial notebook (10 lines) on RELIANCE.NS to verify fine-tune works.
3. No separate GPU provider needed — Chronos-2 fits in Colab Pro A100 memory and runs in your retrain notebook.

**What I do:** Ensemble wrapper, covariate ingestion pipeline for Chronos-2, CPU inference path for Railway.

---

### 1.4 — Qlib Alpha158 + LightGBM (L2, fine-tune — F2 / F3 / F5 / F10)

**Purpose:** Cross-sectional alpha factor ranking. **This is the single biggest quant-ML asset in the stack.** Qlib's built-in `Alpha158` handler generates 158 technical alpha factors vectorized across Nifty 500 in ~4 min CPU. LightGBM trained to predict next-5-day cross-sectional ranks.

**Library / version:** `pyqlib>=0.9.5`, `lightgbm>=4.3.0`.

**Model size:** LightGBM with 1000 boosting rounds + max_depth=8 + num_leaves=127 (exact spec from research-doc §Qlib LightGBM Alpha Pipeline). ~80MB artifact.

**Training recipe (the heaviest new-work in v1):**
1. Build NSE data handler — Qlib ships with CSI300 + SP500 by default; we need custom `QlibNSEDataHandler` that reads from our existing `MarketData` service. Code path: `ml/qlib_nse_handler.py` (new, ~200 LOC).
2. Daily OHLCV from yfinance `.NS` tickers (10-year history, Nifty 500 universe from `data/nse_all_symbols.json`).
3. Run `qrun ml/qlib_configs/alpha158_lightgbm.yaml` — one-file config per research-doc:
```yaml
model:
  class: LGBModel
  kwargs:
    learning_rate: 0.05
    colsample_bytree: 0.8
    max_depth: 8
    num_leaves: 127
    n_estimators: 1000
dataset:
  class: DatasetH
  kwargs:
    handler:
      class: Alpha158     # 158 technical factors built-in
      module_path: qlib.contrib.data.handler
    segments:
      train: ["2015-01-01", "2023-12-31"]
      valid: ["2024-01-01", "2024-06-30"]
      test: ["2024-07-01", "2026-04-01"]
```
4. ~30 min CPU training on Railway's shared box; monthly retrain.

**Data in:** 158 Alpha factors per (symbol, date). **Label**: forward 5-day cross-sectional rank of return.

**Data out:** percentile rank 0-100 per stock per day.

**Evaluation:**
- IC (Information Coefficient) — target 0.05+ (industry standard).
- Long-only top-decile backtest — target 15%+ annualized excess over Nifty 50.
- Walk-forward, 1-year OOS, transaction costs applied (0.15% round-trip per research-doc §Indian config).

**Sector variant for F10:** aggregate the Alpha158 features to sector level (11 NSE sectors), train a separate LightGBM for sector momentum. Same recipe, different `segments` and handler aggregation step.

**Quality screener variant for F5 AI SIP:** a different LightGBM trained on fundamental features (ROE, D/E, EPS CAGR, P/E vs sector) + 158 technical features, with label = forward 1-year Sharpe. Runs monthly.

**Deployment:** LightGBM predicts via native CPU — no GPU. Result cached nightly in new `alpha_scores(symbol, date, qlib_rank, qlib_score_raw, top_factors jsonb)` table. Served from DB at read time.

**Retrain cadence:** Daily rolling retrain for main ranker (cheap on CPU); monthly for sector + quality variants.

**Integration:**
- `src/backend/services/qlib_engine.py` — new service wrapping Qlib batch inference.
- Called from `SignalGenerator` for F2 candidate gating (only top-25% Qlib rank → candidates for TFT), from `forecast_engine.py` for F3, from new `sector_rotation_service.py` for F10.
- Scheduler: `qlib_nightly_job` at 15:40 IST (5 min before EOD scan). Already reserved in Step 1.
- Config weights in [src/backend/core/config.py:98-100](../src/backend/core/config.py): `QLIB_WEIGHT = 0.25` (ensemble fusion with TFT + LSTM + FinBERT).
- **Qlib LightGBM replaces both the retired legacy orphans** — `lgbm_signal_gate.txt` (15 MB, likely overfit) and `quantai_ranker.txt` (5.8 MB, obsoleted by Alpha158's 158-factor superiority). Those 2 files retire during PR 7 after Qlib v1 ships live.

**What Rishi does:**
1. `pip install pyqlib`.
2. Run `qrun alpha158_lightgbm.yaml` once with my supervision to validate it completes on your machine and produces sensible IC.
3. Commit the trained model to `ml/models/qlib_lightgbm_alpha158.pkl`.

**What I do:** Write `QlibNSEDataHandler`, the config YAML, the `qlib_engine.py` wrapper, the sector + quality LightGBM variants, and the migration for `alpha_scores` table.

---

### 1.5 — XGBoost Earnings Surprise Model (L2, from-scratch — F9)

**Purpose:** Binary classifier — "will company X beat consensus EPS at the upcoming announcement?" Trained on 10 years of NSE earnings history.

**Library / version:** `xgboost>=2.0.0`.

**Features (~25):**
- Last 4 quarters beat/miss pattern (one-hot).
- Revenue YoY growth last 4 quarters.
- Analyst estimate revisions in last 30 days (count of upgrades / downgrades).
- Promoter holding change last 90 days.
- Institutional buying 2 weeks pre-earnings (from `NSEData.fii_dii_activity`).
- Sector seasonality index (sector median beat-rate for this calendar quarter).
- Management-commentary sentiment from last concall transcript (scored by FinBERT-India §1.8).
- India VIX at announcement date.

**Data source:**
- Earnings history: `jugaad-data` (NSE corporate actions) + MoneyControl scrape + company IR sections.
- Concall transcripts: MoneyControl earnings call archive, Screener.in summaries.

**Training recipe:**
- 10-year training window, walk-forward with monthly retrain.
- XGBoost: `max_depth=5, n_estimators=300, learning_rate=0.05, subsample=0.8, colsample_bytree=0.8`.
- Target: label = 1 if actual EPS ≥ consensus × 1.03 (3%+ beat), else 0.
- Class weighting for imbalance (historical beat rate ~55% on Nifty 500).

**Evaluation:**
- AUC-ROC target: 0.65+.
- Calibration: use Platt scaling post-hoc so predicted probabilities are meaningful.

**Deployment:** Native XGBoost CPU inference, <50ms per symbol. Runs 3 days before each announcement.

**Retrain cadence:** Monthly on new earnings data.

**Integration:**
- New service `src/backend/services/earnings_predictor.py`.
- Scheduler `earnings_predictor_job` at 17:00 IST daily — fetches upcoming earnings calendar (next 3 days), runs prediction + generates pre-earnings strategy recommendation.
- New table `earnings_predictions(symbol, announce_date, beat_prob, evidence_json, strategy_recommendation, computed_at)`.
- Output surfaces on new `/earnings-calendar` frontend route (Pro tier for basic, Elite for strategy-recs).

**What Rishi does:**
1. Help me label the training set if any data is ambiguous (expect 2-3 days of data QA work).
2. Run the notebook to train + validate.

**What I do:** Data ingestion pipeline, training script, FastAPI service.

---

### 1.6 — Temporal Fusion Transformer (L3, RETRAIN from scratch + F6 VIX variant)

**Honest status of existing `tft_model.ckpt`:** The checkpoint in the repo was trained with `hidden_size=32`, `attention_heads=2`, on only 100 NSE stocks, no published walk-forward OOS metrics. **This is not production-grade** — industry-standard finance TFT runs `hidden_size=64-256` and trains on the full tradeable universe. We will register this as **shadow-mode v1** to validate pipeline wiring, then **retrain v2 from scratch in Weeks 1-2 on Colab Pro** with proper hyperparameters and validation protocol. v2 becomes production after regression gate passes.

**Purpose:**
- **F2 swing signal TFT (v2, retrained)** — 5-day ahead closing price with P10/P50/P90 quantiles.
- **F6 VIX TFT** (new) — same architecture, trained on India VIX + macro covariates. Predicts VIX 5-10 days ahead → drives F&O option-strategy selection.

**Library / version:** `pytorch-forecasting>=1.0.0` (existing), `pytorch-lightning>=2.1.0`.

**Model spec (v2 retrain — both variants):**
- `MAX_ENCODER_LENGTH=120` (6 months daily lookback)
- `MAX_PREDICTION_LENGTH=5` (for F2) or `10` (for F6)
- **`HIDDEN_SIZE=128`** (upgraded from 32 in existing checkpoint — the existing was under-parameterized)
- **`ATTENTION_HEAD_SIZE=4`** (upgraded from 2)
- `DROPOUT=0.2`
- Quantile loss: outputs P10/P50/P90
- **Universe: Nifty 500** (upgraded from 100 in existing checkpoint)
- **Train/valid/test: 2015-2023 / 2024 / 2025+** with 0.15% transaction cost applied in evaluation

**Features (existing F2 per [scripts/train_tft.py](../scripts/train_tft.py)):**
- Time-varying: close, open, high, low, volume, RSI14, MACD, EMA20, EMA50, ATR14, volume_ratio, BB_percent
- Known-future: day-of-week, day-of-month, earnings_date_distance (for F2 new), India_VIX (known-at-prediction)
- Static: symbol, sector, market_cap_bucket (small/mid/large)

**Training recipe:**
- **F2 v2 (retrain from scratch, Weeks 1-2):** 3 Colab Pro GPU-hours. Shadow-mode promotion: existing v1 checkpoint runs in parallel, `signals_shadow` logs diff. Once v2 OOS WR > v1 WR by ≥3 pp on last 30 days (regression gate), flip v2 to `is_prod=true`.
- **F6 VIX variant:** train from scratch once, then monthly fine-tune. 10 years India VIX daily + Nifty 50 + FII flow + US VIX covariates. 3 Colab Pro GPU-hours initial.
- **Monthly cadence (both variants after v2 launch):** hot-start fine-tune, 2 GPU-hours.

**Evaluation:**
- Quantile loss (pinball loss) on OOS window.
- Calibration: 10% of actuals should fall below P10, 90% below P90.
- Directional accuracy on P50: target 58%+ at 5-day.

**Deployment:** Export to ONNX for CPU serving (pytorch-forecasting supports this). ~300ms per 500-stock batch. `TFTPredictor` class already exists in [src/backend/services/model_registry.py:81](../src/backend/services/model_registry.py) — wire it.

**Retrain cadence:** Monthly fine-tune on Modal (both variants).

**Integration:**
- **F2:** modify [signal_generator.py:40+](../src/backend/services/signal_generator.py) — in the enrichment loop for each candidate, call `self.tft_predictor.predict_for_stock(df, symbol)`, attach `tft_p10 / p50 / p90` to signal. DB columns already exist.
- **F6:** new service `src/backend/services/vix_forecaster.py` that owns the VIX TFT and serves to F&O strategy generator. New scheduler job `vix_tft_nightly` at 15:55 IST.

**What Rishi does:**
1. Run the retrain notebook once a month (Colab Pro A100, 2 GPU-hours — included in $10/mo flat).
2. Validate forecasts look sane.

**What I do:** Wire existing F2 TFT end-to-end (this is a 1-2 day change). Write VIX-variant training script + fine-tune loop.

---

### 1.7 — LSTM + GRU (L3, from-scratch — F1 intraday)

**Purpose:** Intraday 30-60 min directional prediction per stock. Drives F1 intraday signals for Nifty 50 + Bank Nifty heavy stocks.

**Library / version:** `torch>=2.1.0`. Architecture specified in research-doc §F1 verbatim: 2-layer Bidirectional LSTM, 128 hidden units, dropout 0.2.

**Architecture (verbatim from ULTRA DEEP RESEARCH §F1):**
```python
class IntradayLSTM(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(
            input_size=8,      # [open, high, low, close, volume, RSI14, VWAP, OBV]
            hidden_size=128,
            num_layers=2,
            bidirectional=True,
            dropout=0.2,
            batch_first=True,
        )
        self.fc = nn.Linear(128 * 2, 2)  # direction_prob + expected_pct_move
    def forward(self, x):  # x: [batch, 60, 8]
        out, _ = self.lstm(x)
        return self.fc(out[:, -1, :])
```

**Training data:**
- 5 years × ~50 symbols (Nifty 50 + top F&O) × 5-min bars = ~3.5M bars per symbol.
- Rolling 60-bar window (last 5 hours) → predict next 30-60 min direction + magnitude.
- Source: Kite Connect historical API (5-min bars available) via existing `KiteDataProvider`.

**Training recipe:**
- AdamW optimizer, lr=1e-4, batch_size=256, 30 epochs, early stop at patience=5.
- Loss: BCE (direction) + Huber (magnitude), equal-weighted.
- Cross-stock training — one model for all Nifty-50 symbols (symbol as categorical embedding).
- ~6 GPU-hours initial train on Colab Pro A100 (one-time).

**Evaluation:**
- Directional accuracy on OOS last 6 months: target 60%+ (research-doc claim).
- Sharpe of simulated strategy (buy when prob >0.65, hold 30 min): target 1.5+.

**Deployment:**
- ONNX export → CPU inference in <50ms per symbol per 5-min tick.
- Real-time 5-min tick ingestion via existing `BrokerTickerManager` + Kite WebSocket ([broker_ticker.py](../src/backend/services/broker_ticker.py)). Must set `ENABLE_BROKER_TICKER=true` in production config ([core/config.py:81](../src/backend/core/config.py)).
- Scheduler: new 5-min interval job `intraday_lstm_inference` during market hours (9:15-15:30 IST), skips outside window.

**Retrain cadence:** Weekly (Sunday evening) on past week's data. LoRA-style fine-tune — hot-start from latest checkpoint, 5 epochs on new week's bars, <1 GPU-hour.

**Integration:**
- New service `src/backend/services/intraday_lstm.py`.
- New scheduler job (every 5 min, market hours only).
- New WebSocket channel `intraday_signals` published via existing `Realtime` broadcaster.
- DB: `signals.signal_type = 'intraday'` (column already exists per schema audit).

**What Rishi does:**
1. Run initial training notebook once on Colab Pro (6 GPU-hours, included in $10/mo flat).
2. Run the weekly LSTM retrain cell every Sunday — 1 GPU-hour each time, takes 5 min of your attention to kick off + review metrics.

**What I do:** PyTorch model + data pipeline + Colab training notebook + ONNX export + FastAPI microservice + WebSocket wiring.

---

### 1.8 — FinBERT-India v1 (L4, zero-shot + fine-tune — F1 / F7 / F9 / F12)

**Purpose:** Sentiment classification on Indian financial news headlines, NSE announcements, earnings concall transcripts, analyst reports. Powers F1 gate, F7 per-holding sentiment, F9 analyst-report scoring, F12 digest curation.

**Library / version:** `transformers>=4.40.0` (existing for TFT), `onnxruntime>=1.18.0`. HF repo **`Vansh180/FinBERT-India-v1`** (fine-tuned from `prosusai/finbert` on Indian financial news — exact model from research docs).

**Model size:** ~110M params (BERT-base). CPU inference ~200ms per headline via ONNX.

**Training:**
- **Zero-shot in v1.** Pre-trained by Vansh180 on Indian news; use as-is.
- **Month 2+ fine-tune:** collect user trade outcomes + headlines seen before trade → label (profitable vs not) → LoRA fine-tune. ~10K labeled headlines per retrain. 1 GPU-hour on Modal.

**Data in:** Raw text (headline, announcement body, transcript paragraph).

**Data out:** `{positive: float, neutral: float, negative: float}` sentiment distribution. Single scalar score: `positive - negative`, range [-1, +1].

**Evaluation:**
- F1 score on held-out Indian financial news (claimed 63-75% per research-doc §Tier C).
- Backtest uplift: WR lift on F2 signals when sentiment-gated vs not (target: +5pp).

**Deployment:**
- ONNX export from HF checkpoint (straightforward via `optimum.onnxruntime`).
- Self-hosted on Railway CPU. Batched nightly — all symbols × 5 latest headlines = ~2,500 inferences ≈ 8 min per day.
- Fallback: if self-hosting breaks, route to HuggingFace Inference Endpoint ($9/mo dedicated endpoint).

**Retrain cadence:** Quarterly base retrain; monthly LoRA fine-tune on user-outcome data (Month 2+).

**Integration:**
- Existing `sentiment_engine.py` at [src/backend/services/sentiment_engine.py:56+](../src/backend/services/sentiment_engine.py) is **already implemented** (Gemini + Google News RSS + keyword fallback). **Upgrade**: add FinBERT-India as primary scorer; Gemini as fallback for rate-limit / nuance cases.
- News ingestion: extend existing RSS pipeline to NSE announcements API + MoneyControl + Economic Times + Business Standard.
- Scheduler `refresh_sentiment_job` at 16:30 IST (after market close, before next-day signal generation).
- New columns on `signals.finbert_sentiment` (float -1..+1) — requires migration.
- New table `news_sentiment(symbol, date, mean_score, headline_count, sample_headlines jsonb)`.

**What Rishi does:**
1. `pip install optimum[onnxruntime] transformers`.
2. Run the ONNX conversion script once (5 min).
3. Validate 10 sample headlines classify correctly.

**What I do:** Integrate into existing `sentiment_engine.py`, news ingestion pipeline, DB migration, scheduler wiring.

---

### 1.9 — Gemini-HGNC (L4, zero-shot — F2 + F12) [replaces FinGPT HG-NC]

**Decision locked (2026-04-18):** Research doc proposed FinGPT HG-NC (7B LLaMA2 + LoRA). We implement the **exact same HG-NC algorithm using Gemini 2.0 Flash** instead. Same algorithm, 40× cheaper, one fewer infra dependency. AMA benchmark ([Deep Research §6](research-docs)) already established: **agent architecture matters more than LLM choice.** FinGPT stays available as an opt-in fallback if Gemini ever proves insufficient.

**Purpose:** News clustering + high-granularity daily price context → stock movement prediction. Tertiary confirmation for F2 swing signals and F12 digest curation.

**Library / version:** `google-genai>=1.57.0` (already installed). Model: `gemini-2.0-flash-exp`.

**No training.** Zero-shot via Gemini API.

**Inference algorithm (HG-NC = News Clustering + High-Granularity price context):**
1. Collect last 5 days of news headlines per symbol.
2. Embed headlines using FinBERT-India's `[CLS]` token (we already host this model per §1.8) — cheap cosine clustering without calling Gemini.
3. Identify top 3 topic clusters.
4. For each cluster: compute cluster summary (Gemini call) + cluster impact on recent returns (rule-based).
5. Build structured prompt including: 3 cluster summaries, last 30-day price series as ASCII sparkline + summary stats, current regime, sector trend.
6. Single Gemini call → up-probability [0, 1] + 3 reasoning bullet points.

**Data in:** Last 30 days OHLCV + last 5 days clustered news per symbol.

**Data out:** `{ up_prob: float, reasons: list[str] }`.

**Evaluation:** Directional accuracy OOS 6 months. Research-doc target 63.2%. If we fall short by >3 pp, flip on FinGPT fallback for top-10 candidates only.

**Deployment:**
- Pure Gemini API call (~50K tokens input per call). Cost: ~$0.004 per inference.
- Runs nightly for top-50 Qlib candidates only (not full Nifty 500) → ~$0.20/day → ~$6/month.
- Cached per `(symbol, date)` — never re-computed same day.

**Retrain cadence:** None. Zero-shot API.

**Integration:**
- New service `src/backend/services/agents/gemini_hgnc.py`.
- Called from `SignalGenerator` for F2 top-50 candidates only (after Qlib ranking).
- Fusion weight in `config.py`: `HGNC_WEIGHT = 0.10` (tertiary confirmation, matching research-doc's FINGPT_WEIGHT).
- Optional FinGPT fallback behind feature flag `ENABLE_FINGPT_HGNC=false` (off by default).

**What Rishi does:** Nothing for v1. Month 3 review: compare Gemini-HGNC directional accuracy vs research-doc's FinGPT-HGNC baseline (63.2%). If Gemini lags by >3pp, flip fallback on.

**What I do:** Implement HG-NC algorithm in Gemini prompt, write clustering pipeline, write cost-monitoring dashboard widget.

---

### 1.10 — FinRL-X Ensemble PPO+DDPG+A2C (L8, from-scratch — F4 Auto-Trader)

**Purpose:** Reinforcement learning portfolio manager. Generates daily target portfolio weight vector across Nifty 500 top-25%-by-Qlib-rank. Per research-doc: live paper +19.76% / Sharpe 1.96 / Win Rate 64.89% over Oct 2025-Mar 2026.

**Library / version:** `stable-baselines3>=2.3.0`, `finrl-x>=0.4.0` (FinRL-X wraps SB3 with weight-centric env). Install from GitHub: `pip install git+https://github.com/AI4Finance-Foundation/FinRL-X.git`.

**Architecture (verbatim from research-doc §Tier D / §F4):**
- **Ensemble**: PPO (50%) + DDPG (30%) + A2C (20%). Weights dynamic per regime.
- **Action space**: continuous target weights, ℝⁿ where n = 125 (top 25% of Nifty 500).
- **Observation space**: per-stock Alpha158 features + portfolio state + regime one-hot + VIX.
- **Reward**: Sharpe ratio of portfolio returns with penalty for transaction costs + turnover.

**Training:**
- Historical backtest window: 2015-2023 train, 2024 validate, 2025+ test.
- **4 GPU-hours initial train per agent** on Colab Pro A100 × 3 agents = 12 GPU-hours total (~$7-10). One-time.
- Monthly fine-tune on rolling 1-month new data: 1 GPU-hour per agent per month.

**Evaluation:**
- Out-of-sample Sharpe on 2024-2026 — target 1.5+.
- Max drawdown ≤ 15%.
- Win rate ≥ 55%.
- Compare vs equal-weight top-25 Qlib baseline — RL must outperform by 3+ pp annualized.

**Deployment:**
- Inference is fast (one forward pass per rebalance per agent). CPU-friendly after training.
- Hot-loaded by `src/backend/services/finrl_x_engine.py`.
- Daily rebalance job at 15:45 IST — agent emits target weights → `TradeExecutionService` computes diffs vs current portfolio → OpenAlgo executes orders.

**Retrain cadence:** Monthly (1 hour per agent).

**Integration:**
- New service `src/backend/services/finrl_x_engine.py`.
- Wires into existing `TradeExecutionService` which already supports paper + live via `BrokerFactory`. After Step 1's OpenAlgo migration, `BrokerFactory` → `OpenAlgoAdapter` only.
- Uses `MarketRegimeDetector` output to weight ensemble (bull → PPO heavy, bear → DDPG heavy).
- Risk overlay (VIX rules from Step 1 §F4) applied AFTER RL weights — regime + VIX can override RL to more cash.
- Kill switch at `user_profiles.kill_switch_active` already exists — auto-trader checks per user per rebalance.

**What Rishi does:**
1. Understand the PPO vs DDPG vs A2C trade-offs (I'll write a 2-page explainer).
2. Run the initial training notebook once on Colab Pro (one evening, 12 GPU-hours — included in $10/mo flat).
3. Monthly 3-hour retrain in your Sunday ritual.
4. Monitor first month of paper runs to validate agent isn't doing anything stupid.

**What I do:** FinRL-X env adapter for NSE data, Colab training notebook, inference service, rebalance scheduler, OpenAlgo integration, kill-switch plumbing.

---

### 1.11 — Options-specific PPO (L8, from-scratch — F6)

**Purpose:** RL agent that picks options strategy (Bull Call Spread / Bear Put Spread / Iron Condor / Short Straddle / Long Straddle / Covered Call) given TFT VIX forecast + direction forecast + current options chain.

**Library / version:** `stable-baselines3>=2.3.0`.

**Environment:**
- State: VIX forecast, direction forecast, current VIX level, days-to-expiry of nearest weekly, current options chain Greeks.
- Action: discrete — which strategy to deploy (6 categorical actions) + continuous — lot size scaling.
- Reward: realized P&L over trade lifetime (simulated expiry payoff) minus commission.

**Training data:** 5 years NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, SENSEX historical options chains. Source: NSE bhavcopy (daily settlement) via `jugaad-data`.

**Training recipe:** 2 GPU-hours on Colab Pro A100.

**Evaluation:**
- Sharpe of simulated strategy — target 1.2+.
- Max drawdown ≤ 10% of deployed margin.

**Deployment:** Same as FinRL-X — CPU inference after GPU training.

**Retrain cadence:** Monthly.

**Integration:**
- New service `src/backend/services/options_rl_engine.py`.
- Consumes existing [fo_trading_engine.py](../src/backend/services/fo_trading_engine.py) (partial) for options chain + Greeks.
- Outputs strategy → frontend `/fo-strategies` page (Elite tier) + optional auto-execute for Elite users with OpenAlgo + F&O enabled.

---

### 1.12 — Hidden Markov Model Regime Detector (L6, existing — F8)

**Purpose:** Market regime classification (Bull / Sideways / Bear) for Nifty 50. Already trained and loaded at startup per code audit, but **not wired into signal gating.**

**Library / version:** `hmmlearn>=0.3.0`.

**Model:** GaussianHMM, 3 states, features = [5d return, 20d return, 10d realized vol, VIX level, VIX 5d change]. Pre-trained and persisted at [ml/models/regime_hmm.pkl](../ml/models/regime_hmm.pkl).

**Action needed (minimal):**
- Wire `MarketRegimeDetector.predict_regime()` output into:
  - `SignalGenerator` — attach `regime_at_signal` to every new signal.
  - Size-gating — if bear regime and signal direction is LONG, multiply confidence × 0.6, position size × 0.5.
  - Public `/regime` page — display current state + 90-day history.
  - `FinRL-X` ensemble weight adjustment per regime.

**Retrain cadence:** Weekly — extend trailing window. CPU only, <5 min.

**Integration:**
- Existing scheduler job `update_market_regime` at 8:15 AM IST. Enhance: add write-through to new `regime_history(regime, prob_bull, prob_sideways, prob_bear, vix, nifty_close, detected_at)` table for timeline.

**What Rishi does:** Nothing — it's trained, just needs wiring.

**What I do:** Wire inference path + DB migration.

---

### 1.13 — Chronos-2 Macro-Aware Covariate Forecaster (L1+L6, zero-shot — F8)

Covered in §1.3 — reused for F8 regime-persistence forecasting.

Specific use: predict probability that current regime persists next 5 / 10 / 20 days, conditioned on India VIX + FII net flow + RBI rate forward expectation + US 10Y yield covariates. Gives F8 a "regime confidence with forward horizon" output that HMM alone cannot provide.

---

### 1.14 — PyPortfolioOpt Black-Litterman (L7, no training — F5 AI SIP)

**Purpose:** Portfolio weight optimizer that combines AI return forecasts (from Qlib) with equilibrium market returns to avoid over-concentration.

**Library / version:** `PyPortfolioOpt>=1.5.5`.

**Inputs:**
- AI return forecasts (Qlib LightGBM 5-day forecast per selected stock).
- Historical covariance matrix (252-day rolling).
- Market cap weights (equilibrium prior).
- Confidence matrix Ω (derived from Qlib IC and Chronos quantile spread).

**Output:** Optimal weights that maximize Sharpe ratio subject to `w_i ≤ 0.07` (7% single-stock cap per research-doc).

**No training.** Pure optimizer.

**Integration:**
- New service `src/backend/services/ai_portfolio_manager.py`.
- Monthly rebalance cron (last Sunday of month, 00:00 IST).
- Writes to new `ai_portfolio_holdings(user_id, symbol, target_weight, last_rebalanced_at)` table.
- User sees proposed rebalance in app, one-click accept → auto paper trade (v1) / auto live trade via OpenAlgo (Elite tier).

---

### 1.15 — BreakoutMetaLabeler (existing, Pattern Scanner standalone)

Already trained ([ml/models/breakout_meta_labeler.pkl](../ml/models/breakout_meta_labeler.pkl), 732 KB, RF n=500 depth=3). **Per Step 1 §3.1.1, this lives in the Pattern Scanner tab only. NOT in AI signal pipeline.**

**Action needed:** Expose as a "confidence tag" on detected patterns in the Scanner Lab Pattern Scanner UI. No changes to the model itself in v1. Month 2+ fine-tune on user outcomes if Pattern Scanner gets traction.

---

### 1.16 — LangGraph Agent Pattern (L5, for FinRobot / TradingAgents / AI Copilot)

**Not a model — an orchestration pattern.** All agent-based features (F5 FinRobot, F7 Portfolio Doctor FinRobot, F9 Earnings FinRobot transcript, B1 TradingAgents, N1 AI Copilot) use **LangGraph over Gemini 2.0 Flash** with different agent graph definitions.

**Library / version:** `langgraph>=0.2.0`, `langchain-google-genai>=1.0.0`.

**Agent graphs by feature:**

**F5 / F7 FinRobot CoT (4 agents):**
- FundamentalAgent: fetches earnings, revenue, margins from MoneyControl / Screener.in; scores earnings quality.
- RiskAgent: computes concentration + single-stock risk + VaR given portfolio.
- SentimentAgent: consumes FinBERT-India output + last 30 days news; flags deteriorating sentiment.
- ComparisonAgent: benchmarks portfolio risk-adjusted returns vs Nifty 500.
- Graph: all 4 parallel → ExplainerAgent (synthesizer) → output.

**B1 TradingAgents (7 agents):**
- FundamentalsAnalyst, TechnicalAnalyst, SentimentAnalyst (each reads respective data).
- BullResearcher + BearResearcher (each reads above three outputs, makes opposing case).
- RiskManager (reads portfolio state + both researcher outputs, sets exposure limits).
- Trader (synthesizes debate + risk, emits BUY/SELL/HOLD + position size).
- Graph: 3 analysts parallel → Bull/Bear parallel (both see all 3) → RiskManager → Trader.
- Triggered only for signals where position size > 2% of paper portfolio, OR regime is transitioning.

**N1 AI Copilot (single agent + tool calls):**
- System prompt: "You are a senior quant analyst embedded in Rishi's trading app."
- Tools: all 80 backend APIs (from [lib/api.ts](../frontend/lib/api.ts)) — Copilot can call `get_signals_today()`, `get_user_portfolio()`, `explain_signal(id)`, `get_regime()`, etc.
- Runs on every platform page.

**Integration:**
- New folder `src/backend/services/agents/` with one file per agent graph.
- Shared Gemini client from existing `AssistantService`.
- Output cached in `signals.explanation_text` (FinRobot explanations), `signal_debates` new table (TradingAgents), per-session conversation cache (Copilot).

**What Rishi does:**
- Read + tweak prompts for tone / accuracy (you know Indian markets better than the LLM).
- No training.

**What I do:** Graph definitions, tool wiring, prompt engineering.

---

## 2 — Complete Training Schedule

| Model | Train Schedule | Time | Compute |
|---|---|---|---|
| Gemini 2.0 Flash | No training | — | API-served |
| TimesFM 200M | No training v1; Month 4+ LoRA if needed | 2 hrs | Colab Pro (A100) |
| Chronos-Bolt | Monthly 10-min fine-tune | 10 min | Colab Pro |
| Chronos-2 | Monthly covariate re-calibrate | 20 min | Colab Pro |
| Qlib Alpha158 LightGBM (swing) | Daily rolling retrain | 30 min | Railway CPU (automated) |
| Qlib sector variant | Monthly | 15 min | Railway CPU (automated) |
| Qlib quality variant (F5) | Monthly | 20 min | Railway CPU (automated) |
| XGBoost earnings-surprise | Monthly | 15 min | Railway CPU (automated) |
| TFT F2 (existing) | Monthly fine-tune | 2 hrs | Colab Pro |
| TFT F6 VIX variant | Monthly fine-tune | 1 hr | Colab Pro |
| LSTM + GRU intraday | Weekly fine-tune | 1 hr | Colab Pro |
| FinBERT-India | Quarterly base + Monthly LoRA (Month 2+) | 1 hr | Colab Pro |
| Gemini-HGNC (replaces FinGPT HG-NC) | None (zero-shot via API) | — | Gemini API |
| FinRL-X PPO+DDPG+A2C | Monthly | 3 hrs | Colab Pro |
| Options-PPO | Monthly | 2 hrs | Colab Pro |
| HMM regime | Weekly | 5 min | Railway CPU (automated) |
| BreakoutMetaLabeler | Month 2+ quarterly | 30 min | Railway CPU (automated) |

**Manual retrain ritual (Rishi's calendar):**
- **Every Sunday 10 AM** (~30 min): open Colab retrain notebook → run "weekly" cells (LSTM + HMM review) → verify metrics → push to B2 → promote via `model_versions.is_prod`.
- **1st Sunday of each month** (~2 hrs): run "monthly" cells (TFT × 2, FinRL-X ensemble, Options-PPO, Chronos, XGBoost earnings, Qlib variants, optional FinBERT LoRA from Month 2).
- **1st Sunday of each quarter** (~1 hr extra): FinBERT full base retrain.
- **Automated (no Rishi involvement):** Daily Qlib rolling retrain, HMM weekly auto, all inference jobs.

**Total GPU compute: ~15 hours/month on Colab Pro A100 (well within Pro plan's usage allowance). Cost: $10/month flat.** CPU jobs run free on Railway.

---

## 3 — Month 2+ Fine-Tuning Strategy (the Data Moat)

v1 ships with pre-trained checkpoints. Starting Month 2, every closed paper + live trade writes an outcome row:

```sql
create table model_outcomes (
  signal_id uuid references signals,
  user_id uuid references auth.users,
  entry_at timestamptz,
  exit_at timestamptz,
  exit_reason text,     -- target / stop / time / manual
  pnl_pct numeric,
  holding_days integer,

  -- Inputs at entry for retraining
  tft_p50_at_entry numeric,
  qlib_rank_at_entry integer,
  lstm_prob_at_entry numeric,
  finbert_score_at_entry numeric,
  regime_at_entry text,
  chart_image_path text,   -- for PatternCNN training Month 4+
  news_headlines_at_entry jsonb,

  -- Outcome labels for each model
  tft_correct boolean,
  qlib_correct boolean,
  lstm_correct boolean,
  finbert_correct boolean,

  computed_at timestamptz default now()
);
```

**Monthly fine-tune jobs** consume this table as training data:
- FinBERT-India: label = "did sentiment correctly predict trade outcome?" — 10K rows per month @ 100 users.
- TFT: label = actual realized return vs P50 forecast — regression fine-tune.
- BreakoutMetaLabeler: retrain RF with new closed-pattern outcomes.
- Qlib LightGBM: append to rolling training window.

**Month 4+ unlock: PatternCNN.** Once we have 50K+ user trades with `chart_image_path` stored, train vision model per Step 1 §3.1 Phase v2. Expected compute: 8 GPU-hours once, monthly 1-hour fine-tune.

**This is the Layer 1 Data Moat from ULTRA DEEP RESEARCH** — competitors can clone the models but cannot replicate our proprietary NSE-retail-outcome labels without running a trading platform for a year.

---

## 4 — Training Infrastructure (solo-founder optimized, ~$20/mo all-in)

### Compute — Colab Pro + Railway CPU only

- **Google Colab Pro ($10/month fixed)** — all GPU training. Gives Rishi unlimited A100 sessions at flat rate. One unified "retrain" notebook with cells for each model. Rishi opens notebook weekly (for LSTM) + monthly (for everything else), runs cells for whatever's due, pushes new model artifacts to Backblaze B2, bumps version in `model_versions` Postgres table. 15-30 min ritual.
- **Railway CPU** — all CPU jobs (Qlib daily retrain, HMM weekly, XGBoost monthly, all inference). Shared with backend workload. Free / hobby tier.
- **No Modal, no MLflow server, no persistent GPU.** Defer those to when revenue justifies operational complexity. Migration path is clean: `model_versions` → MLflow when we want it, Colab notebook → Modal jobs when we want automation.

### Model registry — Backblaze B2 + tiny Postgres table

Instead of MLflow server, **a 50-line Postgres table + B2 bucket**:

```sql
create table model_versions (
  id uuid primary key default gen_random_uuid(),
  model_name text not null,      -- 'tft_swing' / 'lstm_intraday' / 'finrl_x_ppo' / etc.
  version integer not null,
  artifact_uri text not null,    -- b2://swingai-models/tft_swing/v14/model.ckpt
  trained_at timestamptz not null default now(),
  trained_by text,               -- 'rishi-manual' / 'github-actions' / etc.
  metrics jsonb,                 -- { "directional_acc": 0.58, "ic": 0.047, "sharpe": 1.74 }
  git_sha text,                  -- commit of training script
  is_prod boolean default false, -- exactly one per model_name
  is_shadow boolean default false, -- A/B shadow model
  notes text,
  unique (model_name, version)
);
create index on model_versions (model_name, trained_at desc);
create index on model_versions (model_name) where is_prod = true;
```

**Usage:**
- `ModelRegistry.load('tft_swing')` queries the `is_prod=true` row → downloads artifact from B2 URI → caches locally → serves.
- `ModelRegistry.promote(model_name, version)` flips `is_prod` atomically.
- `ModelRegistry.shadow(model_name, version)` enables shadow mode — new model runs in parallel with prod, logs predictions to `signals_shadow` for A/B diff, no user impact until promoted.

Simpler than MLflow. Exactly what a solo founder needs. Upgrade path: when we have 10+ models + 3+ engineers, swap the `model_versions` table for MLflow backend (the ModelRegistry interface stays identical).

**Storage cost:** ~5 GB total across all models + training datasets = $0.50/month on B2.

### Data pipeline
- **Price data:** yfinance `.NS` (daily EOD, free) + Kite via OpenAlgo (intraday 5-min, delivered through user's broker connection — we never pay for our own feed).
- **Bhavcopy / corporate actions:** `jugaad-data>=0.24` (already in `requirements.txt`).
- **News:** `feedparser>=6.0.0` (already installed) over NSE announcements + MoneyControl RSS + Economic Times RSS + Business Standard RSS.
- **Fundamentals:** scrape Screener.in + BSE / NSE corporate filing sections (I write the scrapers).
- **Earnings transcripts:** MoneyControl earnings call archive.
- **Storage:** regular Supabase Postgres free tier for v1. **No TimescaleDB extension yet.** Flip to TimescaleDB only when intraday tick query latency exceeds 500 ms OR paying user count crosses 100 — whichever comes first. At v1 scale, regular Postgres handles tick data fine.

### Secrets / config additions
- `B2_APPLICATION_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BUCKET_MODELS`, `B2_BUCKET_TRAINING_DATA`.
- `OPENALGO_URL` (per-user, encrypted via existing Fernet pattern).
- `GEMINI_API_KEY` (already configured).
- **Dropped:** `ZERODHA_*`, `ANGEL_*`, `UPSTOX_*`, `KITE_ADMIN_*`, `OPENAI_*`, `ANTHROPIC_*`, `MODAL_TOKEN*`, `MLFLOW_TRACKING_URI`.

### Total monthly cost (AI stack only, v1 beta)

| Item | Cost | Notes |
|---|---|---|
| Colab Pro | ₹830 / $10 | All GPU training sessions |
| Backblaze B2 (5 GB) | ₹40 / $0.50 | Model artifacts |
| Gemini 2.0 Flash API | ₹250-400 / $3-5 | ~500 explanations/day + agent runs + digests |
| HuggingFace Inference (FinBERT fallback only, optional) | ₹0 | Self-hosted via ONNX on Railway; endpoint only if self-host breaks |
| Railway Hobby (backend + CPU jobs) | ₹500-1,700 / $5-20 | Shared with app workload |
| Supabase | ₹0 | Free tier |
| Vercel | ₹0 | Free tier |
| OpenAlgo hosting | ₹0 | Users self-host their own |
| **Total AI stack monthly** | **~₹1,700 / ~$20** | At <100 users scale |

When we cross 500 users the Gemini bill grows (more explanations + more digests) but stays cheap — Flash is the cheapest frontier LLM. 5,000 users ≈ $40/month Gemini. Still under $100/month total AI stack.

---

## 5 — Beginner-Friendly Training Workflow (for Rishi)

### The rhythm
- **Daily (automated):** Qlib + HMM CPU jobs run on Railway. Nothing to do.
- **Weekly (Sunday 10 AM IST, 30 min hands-on):**
  - LSTM weekly retrain: push button in admin panel → Modal runs 1-hour job → new model promoted to prod via MLflow staging → validate forecasts look sane → approve.
  - HMM weekly retrain: automatic, just glance at regime dashboard.
- **Monthly (1st Sunday of month, 2-3 hours hands-on):**
  - TFT monthly fine-tune (F2 + F6): push button → Modal runs ~3 hours total → review MLflow metrics (pinball loss, directional accuracy) → approve promotion.
  - Qlib monthly retrain (swing + sector + quality): push button → Railway CPU 1 hour → approve.
  - XGBoost earnings monthly retrain: push button → 15 min → approve.
  - FinRL-X monthly retrain: push button → Modal 3 hours → approve after walk-forward OOS validation.
  - Options-PPO monthly: same pattern.
- **Quarterly (4 hrs hands-on):**
  - FinBERT base retrain if drift detected.

### What I ship to make this possible
- **Admin panel** (part of Step 3) with "Retrain X" buttons — each triggers Modal job via webhook + reports progress.
- **MLflow UI** — see metrics + compare runs.
- **Pre-flight check** — before promoting a new model to prod, run it on the last 30 days of signals and compare WR to incumbent. Only promote if non-regressive.
- **Rollback button** — one click to previous MLflow version if new model misbehaves.
- **Slack/Telegram webhook** — job status notifications so you don't need to watch dashboards.

### What Rishi explicitly does NOT do in v1
- Train foundation models from scratch. Not needed.
- Write CUDA kernels. Not needed.
- Manually label data. Only FinBERT quality labels Month 2+, and even then 50 samples to verify — not bulk labeling.
- Manage GPU cluster / k8s / anything operationally complex. Modal handles it.
- Write model architectures from paper. I write every `.py` file; you read + approve.

### What Rishi learns through this (as a bonus)
By month 6, having run 100+ training jobs and reviewed MLflow metrics, you'll know:
- Intuitively what Sharpe / WR / directional accuracy numbers are realistic.
- How to debug a retrain that regresses (feature drift vs data bug vs hyperparam).
- When to trust a model vs override with manual rules.

This is the "beginner ML engineer with my help" promise made real.

---

## 6 — Deployment + Inference Architecture

### Serving tiers

| Latency budget | Method | Models |
|---|---|---|
| <50ms | ONNX on Railway CPU | LSTM, FinBERT-India, TFT, BreakoutMetaLabeler |
| <200ms | LightGBM native on Railway CPU | Qlib (all variants), XGBoost earnings |
| <500ms | AutoGluon on Railway CPU | TimesFM, Chronos-Bolt |
| <2s | Gemini 2.0 Flash API | All agent + explanation + vision tasks |
| <5s | Modal serverless GPU (on-demand) | Chronos-2, FinGPT HG-NC (if enabled), FinRL-X inference batch |
| Async / queued | Modal GPU job | All training runs |

### Caching strategy
- **Per-signal model scores**: compute once, store in `signals` row (columns already designed in schema).
- **Per-day market-wide** (regime, VIX forecast, Qlib ranks, sentiment per symbol): compute nightly, persist to dedicated tables (`regime_history`, `forecast_scores`, `alpha_scores`, `news_sentiment`), serve from DB.
- **Per-user** (copilot conversations, portfolio reviews): Redis if `ENABLE_REDIS=true`, else in-memory per pod.
- **LLM responses**: cache keyed by `(prompt_hash + input_data_hash)` — any deterministic Gemini call cached 24h.

### Real-time data pipeline (for F1 intraday)
```
Kite Connect WebSocket  → existing BrokerTickerManager
    ↓ (5-min aggregation)
Redis buffer (last 60 bars per Nifty-50 symbol)
    ↓ (on-demand)
IntradayLSTM inference (ONNX, <50ms)
    ↓
Signal writer → signals table (signal_type='intraday')
    ↓ (publish)
Supabase Realtime / WebSocket channel 'intraday_signals'
    ↓
Frontend: /dashboard + /swingmax-signal intraday tab update in real-time
```

---

## 7 — What This Changes in the Existing Repo

New files (~35 new modules, mostly thin wrappers):
- `src/backend/services/llm_tasks.py`
- `src/backend/services/prompts/` (14 Jinja templates)
- `src/backend/services/forecast_engine.py` (TimesFM + Chronos ensemble)
- `src/backend/services/qlib_engine.py`
- `ml/qlib_nse_handler.py`
- `ml/qlib_configs/alpha158_lightgbm.yaml`
- `ml/qlib_configs/alpha158_sector.yaml`
- `ml/qlib_configs/quality_screener.yaml`
- `src/backend/services/earnings_predictor.py`
- `src/backend/services/vix_forecaster.py`
- `src/backend/services/intraday_lstm.py`
- `src/backend/services/fingpt_hgnc.py` (or alias to Gemini-HGNC)
- `src/backend/services/finrl_x_engine.py`
- `src/backend/services/options_rl_engine.py`
- `src/backend/services/ai_portfolio_manager.py`
- `src/backend/services/agents/finrobot_portfolio_doctor.py`
- `src/backend/services/agents/finrobot_earnings.py`
- `src/backend/services/agents/finrobot_ai_sip.py`
- `src/backend/services/agents/tradingagents_debate.py`
- `src/backend/services/agents/ai_copilot.py`
- `scripts/train_qlib_lightgbm.py`
- `scripts/train_xgboost_earnings.py`
- `scripts/train_intraday_lstm.py`
- `scripts/train_finrl_x.py`
- `scripts/train_options_rl.py`
- `scripts/train_tft_vix.py`
- `scripts/finetune_finbert_india.py`
- `scripts/finetune_tft_monthly.py`
- `infrastructure/database/migrations/20260419_ai_stack_v1.sql` (one migration for all new columns + tables)

Upgrades to existing files:
- [src/backend/services/signal_generator.py](../src/backend/services/signal_generator.py) — rewrite `generate_signals()` as multi-model ensemble orchestrator calling all L1-L8 layers.
- [src/backend/services/model_registry.py](../src/backend/services/model_registry.py) — MLflow-backed with versioning.
- [src/backend/services/sentiment_engine.py](../src/backend/services/sentiment_engine.py) — add FinBERT-India primary path.
- [src/backend/services/scheduler.py](../src/backend/services/scheduler.py) — 22 jobs total (up from 12; adds: qlib nightly, chronos nightly, timesfm nightly, finbert refresh, earnings predictor, paper snapshot, monthly rebalance jobs, 5-min intraday LSTM, vix TFT nightly).
- [src/backend/services/broker_integration.py](../src/backend/services/broker_integration.py) — OpenAlgo-only (per Step 1).
- [src/backend/services/feature_engineering.py](../src/backend/services/feature_engineering.py) — expand to include Qlib Alpha158 features.
- [src/backend/services/trade_execution_service.py](../src/backend/services/trade_execution_service.py) — add FinRL-X weight-vector diff execution path.

Deletions (mostly from Step 1 removals):
- Direct Zerodha/Angel/Upstox SDK wiring (code moved to `_legacy/`).
- `ensemble_meta_learner.pkl` orphan.
- OpenAI / Anthropic dependencies.

---

## 8 — Locked Decisions (Step 2 final)

All six questions answered 2026-04-18. Solo-founder-optimized, cost-conscious stack:

| Decision | Choice | Rationale |
|---|---|---|
| **Model registry** | Backblaze B2 + Postgres `model_versions` table | No MLflow server to babysit. 50 lines of code. B2 5 GB costs $0.50/mo. Clean upgrade path to MLflow later. |
| **GPU training** | Google Colab Pro ($10/mo flat) | Unlimited A100 sessions. No per-hour billing. Rishi runs one unified retrain notebook weekly/monthly. Simpler than Modal for a solo founder. Modal migration available when automation needed. |
| **Database** | Regular Supabase Postgres (no TimescaleDB yet) | Free tier handles v1 tick volume. Flip to TimescaleDB when tick query latency > 500 ms OR >100 paying users. |
| **HG-NC model** | Gemini-HGNC (replaces FinGPT HG-NC) | Same algorithm, 40× cheaper. Gemini 2.0 Flash is already our LLM. AMA benchmark: architecture matters more than LLM. FinGPT kept as feature-flagged fallback. |
| **PatternCNN** | Deferred to Month 4+ | Needs 50K+ user-outcome-labeled chart images. Locked. |
| **Retrain cadence** | Weekly LSTM, monthly TFT/RL/XGBoost/Chronos, quarterly FinBERT base | Per research doc. Matches Colab Pro capacity. |

### Orphan model disposition (locked 2026-04-18)

Honest audit of the 4 trained models currently loaded but never wired:

| Orphan | Verdict | Disposition |
|---|---|---|
| `tft_model.ckpt` | Under-parameterized (hidden_size=32, 100-stock universe) | **Shadow v1, retrain v2 Weeks 1-2** (hidden_size=128, Nifty 500, proper walk-forward). v2 → prod after regression gate. |
| `regime_hmm.pkl` | Small, mathematically appropriate. HMMs don't benefit from bigger architectures. | **Ship live on Day 4 (PR 4)** — only orphan trusted for immediate production. |
| `lgbm_signal_gate.txt` | 15 MB suggests overfit, 3-class hard labels are statistically noisy. | **Shadow-mode only. Retire PR 7** after Qlib Alpha158 ships. Not worth retraining — Qlib covers it. |
| `quantai_ranker.txt` | 15 hand-picked features vs. Qlib's 158 factors. Obsoleted by design. | **Shadow-mode only. Retire PR 7** after Qlib Alpha158 ships. |
| `breakout_meta_labeler.pkl` | Shallow RF, marginal +8pp lift. | **Fine as-is for Scanner Lab UI tag** (not alpha pipeline per Step 1 §3.1.1). No change. |

**Implication for Day 1-21 rollout** (detailed in Step 3 §11 revised):
- PR 4 wires HMM live (immediate user-visible regime on dashboard + `/regime` public page).
- TFT/LGBM/QuantAI enter shadow mode (scores logged to `signals_shadow` for A/B diff, no user impact).
- Week 1-2: Colab Pro retrains TFT v2 + fresh Qlib Alpha158 from scratch.
- Day 21 (PR 6): TFT v2 + Qlib v1 promoted to prod after regression gate. This is when AI signals become real.
- PR 7: LGBMGate + QuantAI Ranker retired.

### v1 AI stack budget (total all-in)

| Line item | Monthly cost | Notes |
|---|---|---|
| Colab Pro | $10 | All GPU training |
| Gemini 2.0 Flash API | $3-6 | All LLM + Gemini-HGNC + vision |
| Backblaze B2 | $0.50 | Model artifacts |
| Railway Hobby | $5-20 | Backend + CPU retrains |
| Supabase | $0 | Free tier |
| Vercel | $0 | Free tier |
| **Total** | **~$20-35/month** | Sub-$50/mo at v1 beta scale |

When the app scales past 1,000 users, the Gemini bill becomes the dominant line (still cheap — Flash is the cheapest frontier model). Target: <$150/month total AI stack at 5,000 users.

### Ready for Step 3

All Step 2 decisions locked. Writing **Step 3 — Production App Architecture Upgrade** next when you say go:
- Service boundary redesign (~20 services → ~14 cleaner ones)
- New AI Engine microservice structure (forecasting / sentiment / regime / agents / RL / explanations / vision)
- Real-time data pipeline (Kite WebSocket via OpenAlgo → Redis → Supabase Realtime → frontend)
- LLM orchestration via LangGraph (all agents) + prompt-template registry
- Model serving strategy (ONNX CPU inference, Railway hosted, optional HF Inference fallback)
- Observability: Sentry + PostHog + custom Signal Accuracy Dashboard
- Security hardening: JWT signature verification, admin role gating, WebSocket auth via header, tighter CSP, rate limits
- CI/CD + deploy pipeline (GitHub Actions → Railway / Vercel / Backblaze for model uploads)
- Scheduler upgrade (~22 jobs total, IST timezone, retry-on-failure)
- DB migrations consolidated into one v1 migration

Say **"Step 3"** when you're ready.
