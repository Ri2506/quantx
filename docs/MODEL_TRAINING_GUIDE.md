# Quant X — End-to-End Model Training Guide

The single source of truth for the GPU operator. Per-feature requirements,
data sources, hyperparameters, expected wall-clock, eval metrics, and the
exact registry slot each artifact lands in.

---

## How the unified runner works

Every trainable model is a `Trainer` subclass under `ml/training/trainers/`.
`ml/training/runner.py` discovers them, topo-sorts by `depends_on`, and
trains each end-to-end:

```sh
# Full pipeline (production launch run):
python -m ml.training.runner --all --promote

# Single trainer:
python -m ml.training.runner --only intraday_lstm --promote

# Dry run (train + evaluate, skip B2 upload + DB write):
python -m ml.training.runner --all --dry-run

# CPU-only (skips GPU-marked trainers):
python -m ml.training.runner --all --skip-gpu

# Force CPU on a GPU trainer (laptop dev):
python -m ml.training.runner --only finrl_x_ppo --force-cpu

# JSON report:
python -m ml.training.runner --all --json > run.json

# List discovered trainers:
python -m ml.training.runner --list
```

Each trainer:
1. Pulls its data fresh from yfinance / NSE
2. Trains
3. Evaluates on a held-out window
4. Uploads artifact(s) to B2
5. Writes a `model_versions` row (with `is_prod=TRUE` if `--promote`)

Failure of one trainer does not stop the loop. Reports surface in
`/admin/training`.

---

## Hardware requirements

| Tier | What runs | Min spec |
|---|---|---|
| Full launch run | every trainer | 1× A100 (80 GB) or H100 |
| Acceptable | every trainer | 1× V100 (32 GB) — FinRL-X 1M-step training takes ~90 min/algo |
| CPU-only run | regime_hmm + lgbm_signal_gate + earnings_xgb + momentum_chronos + intraday_lstm + options_rl | 16 CPU, 32 GB RAM |
| **GPU-required (will skip on CPU):** | finrl_x_{ppo,ddpg,a2c} + momentum_timesfm + vix_tft | — |

---

## Environment setup

```sh
git clone <repo> && cd Swing_AI_Final
python3.12 -m venv .venv && source .venv/bin/activate

# Inference deps + training deps
pip install -r requirements.txt
pip install -r requirements-train.txt

# Optional: TimesFM via git+ (no PyPI wheel for Python 3.12 yet)
pip install "timesfm[torch] @ git+https://github.com/google-research/timesfm.git@master"

# Required env vars
export B2_KEY_ID=...
export B2_APP_KEY=...
export B2_BUCKET=quantx-models
export DATABASE_URL=postgres://...
export GIT_SHA=$(git rev-parse --short HEAD)
export TRAINED_BY="rishi-launch-run"
```

---

## Per-trainer reference

### 1. `regime_hmm` — F8 RegimeIQ

| Field | Value |
|---|---|
| Module | `ml.training.trainers.regime_hmm` |
| Architecture | 3-state Gaussian HMM (`hmmlearn`) |
| Inputs | yfinance `^NSEI` (Nifty 50) + `^INDIAVIX` daily, 2010-01-01 onwards |
| Features | `ret_5d`, `ret_20d`, `realized_vol_10d`, `vix_level`, `vix_5d_change` |
| Train window | All - last 252 days |
| OOS window | Last 252 days |
| Hyperparams | `n_components=3`, `n_iter=200`, `random_state=42` |
| GPU | Not required |
| Wall-clock | < 1 min |
| Primary eval | `oos_log_likelihood_per_obs` |
| Artifacts | `regime_hmm.pkl` |
| Registry slot | `regime_hmm` |
| Loaded by | `MarketRegimeDetector` everywhere; scheduler 8:15 IST job |
| Failure mode | yfinance returns empty Nifty/VIX series → re-run later |

### 2. `lgbm_signal_gate` — Signal classifier (3-class)

| Field | Value |
|---|---|
| Module | `ml.training.trainers.lgbm_signal_gate` |
| Architecture | LightGBM 3-class (HOLD / BUY / SELL) |
| Inputs | yfinance NSE constituents (~50 stocks), daily OHLCV |
| Features | 15 OHLCV-derived (RSI, MACD, EMA20/50, ATR, volume_ratio, etc.) |
| Train window | TimeSeriesSplit 5-fold + final fit on all rows |
| Hyperparams | See `scripts/train_lgbm.py:LGBM_PARAMS` |
| GPU | Not required |
| Wall-clock | ~5 min for 50-stock universe |
| Primary eval | `cv_accuracy_mean` |
| Artifacts | `lgbm_signal_gate.txt` (native LightGBM text format) |
| Registry slot | `lgbm_signal_gate` |
| Loaded by | `LGBMGate` in `model_registry.py`; called by `SignalGenerator` |
| Failure mode | < 30 stocks downloaded → trainer aborts (yfinance throttling) |

### 3. `intraday_lstm` — F1 TickPulse

| Field | Value |
|---|---|
| Module | `ml.training.trainers.intraday_lstm` |
| Architecture | 2-layer Bidirectional LSTM, 128 hidden, dropout 0.2 → Linear(2×128, 3) |
| Inputs | yfinance `period=55d, interval=5m` over 18 NSE+BankNifty constituents |
| Features (8) | OHLCV + RSI(14) + VWAP + OBV — z-scored per symbol |
| Window | 12 × 5-min bars = 60-min context |
| Label | 3-class: bear / neutral / bull based on 30-min forward return vs 0.4σ |
| Train/OOS split | 80% / 20% chronological |
| Hyperparams | epochs=12, batch=256, lr=1e-3, AdamW |
| GPU | Recommended; CPU works (~10 min/epoch) |
| Wall-clock | ~25 min on V100 |
| Primary eval | `oos_accuracy` |
| Artifacts | `intraday_lstm.onnx` (opset 17, dynamic batch) |
| Registry slot | `intraday_lstm` |
| Loaded by | `IntradayLSTMPredictor` (onnxruntime); scheduler 5-min job |
| Failure mode | yfinance 5-min cap is 60d — re-run within window |

### 4. `finrl_x_ppo` / `finrl_x_ddpg` / `finrl_x_a2c` — F4 AutoPilot

Three separate trainers, blended at inference per `REGIME_WEIGHTS`.

| Field | Value |
|---|---|
| Module | `ml.training.trainers.finrl_x_ensemble` |
| Architecture | Stable-Baselines3 PPO + DDPG + A2C, MlpPolicy |
| Env | `ml.rl.NSETradingEnv` (Gymnasium) — daily-rebalance portfolio over 30 NSE blue chips |
| Action space | Box[0,1]^30 (target weights, cash = residual) |
| Observation | 5N + 4 = 154 dims (current weights, ret_5d, ret_20d, RSI, ATR%, VIX, regime one-hot) |
| Reward | next-day log return − transaction cost (0.13% L1) − drawdown penalty |
| Train window | 2018-01-01 → 2024-12-31 |
| OOS window | 2025-01-01 onwards |
| Timesteps | 1,000,000 per algo |
| Hyperparams | PPO: lr=3e-4, n_steps=2048, batch=128 · DDPG: lr=1e-3, buffer=200k · A2C: lr=7e-4, n_steps=8 |
| GPU | **Required** (~30 min/algo on A100, ~90 min on V100) |
| Wall-clock | ~90 min total (A100) / ~270 min (V100) |
| Primary eval | `ep_reward_train` (full walk-forward backtest comes from `ml/backtest/engine.py` post-promotion) |
| Artifacts | `model.zip` per algo |
| Registry slots | `finrl_x_ppo`, `finrl_x_ddpg`, `finrl_x_a2c` |
| Loaded by | `FinRLXEnsemble.load_prod()`; scheduler 15:50 IST `run_autopilot_rebalance` |
| Failure mode | OOM on V100 → reduce `n_steps` to 1024 in PPO |
| Notes | Inference always blends per regime: `REGIME_WEIGHTS["bull"] = {ppo:0.5, ddpg:0.3, a2c:0.2}`; bear regime applies `BEAR_POSITION_SCALE=0.5` cap |

### 5. `momentum_timesfm` — F3 HorizonCast (TimesFM)

| Field | Value |
|---|---|
| Module | `ml.training.trainers.momentum_zero_shot` |
| HF model | `google/timesfm-1.0-200m-pytorch` |
| Approach | **Zero-shot** — no fine-tune; trainer only registers the pointer + calibration metrics |
| Calibration universe | RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK |
| Calibration window | 64-day context, 5-day forecast |
| GPU | Recommended for fast forecast; CPU works for calibration |
| Wall-clock | ~3 min (model download + 5-symbol calibration) |
| Primary eval | `directional_accuracy` |
| Artifacts | `timesfm_pointer.json` (HF model id + horizon + calibration JSON) |
| Registry slot | `momentum_timesfm` |
| Loaded by | F3 momentum predictor (PR 138 + existing `/momentum` page) |
| Failure mode | HF auth required; set `HF_TOKEN` env if rate-limited |

### 6. `momentum_chronos` — F3 HorizonCast (Chronos-Bolt)

| Field | Value |
|---|---|
| Module | `ml.training.trainers.momentum_zero_shot` |
| HF model | `amazon/chronos-bolt-base` |
| Approach | Zero-shot pointer + calibration |
| GPU | Not required |
| Wall-clock | ~5 min |
| Primary eval | `directional_accuracy` |
| Artifacts | `chronos_pointer.json` |
| Registry slot | `momentum_chronos` |

### 7. `vix_tft` — F6 VolCast (VIX forecaster)

| Field | Value |
|---|---|
| Module | `ml.training.trainers.vix_tft` |
| Architecture | Temporal Fusion Transformer (`pytorch-forecasting`) |
| Inputs | yfinance VIX + Nifty + USDINR + ^IRX (10Y proxy), daily, 2014 onwards |
| Target | India VIX (univariate, 10-day horizon) |
| Covariates | nifty, usdinr, yield_10y |
| Context length | 60 days |
| Hyperparams | hidden=64, attention_heads=4, dropout=0.1, lr=3e-4, max_epochs=30, QuantileLoss(7 quantiles) |
| GPU | **Required** (~25 min on V100) |
| Wall-clock | ~25 min |
| Primary eval | `directional_accuracy` (terminal point) |
| Artifacts | `vix_tft.ckpt` + `vix_tft_config.json` |
| Registry slot | `vix_tft` |
| Loaded by | F&O strategies recommender via `_load_vix_forecast` |

### 8. `options_rl` — F6 VolCast (strategy selector)

| Field | Value |
|---|---|
| Module | `ml.training.trainers.options_rl` |
| Architecture | Stable-Baselines3 PPO, MlpPolicy |
| Env | Synthetic 7-strategy options env (state: VIX now, VIX 5d ahead, regime, RV, theta, DTE) |
| Action space | Discrete(7): long_call · long_put · long_straddle · long_strangle · iron_condor · short_straddle · bull_call_spread |
| Reward shaping | Deterministic per regime/vol-band combination |
| Timesteps | 500,000 |
| Depends on | `vix_tft` (observation includes the forecast path) |
| GPU | Not required |
| Wall-clock | ~15 min CPU |
| Primary eval | `timesteps` (proxy; real eval via backtest harness) |
| Artifacts | `options_rl.zip` |
| Registry slot | `options_rl` |

### 9. `earnings_xgb` — F9 EarningsScout

| Field | Value |
|---|---|
| Module | `ml.training.trainers.earnings_xgb` |
| Architecture | XGBoost binary classifier (beat / miss) |
| Inputs | NSE earnings announcements (Supabase + yfinance/MoneyControl fallback) |
| Features | Historical beat/miss pattern, sector seasonality, promoter holding change, institutional buying, options skew |
| Hyperparams | See `src/backend/ai/earnings/training/trainer.py` |
| GPU | Not required |
| Wall-clock | ~3 min |
| Primary eval | `roc_auc` |
| Artifacts | XGBoost JSON + meta JSON |
| Registry slot | `earnings_xgb` |
| Loaded by | `services.earnings.predictor` |

---

## Going state-of-the-art (Phase II — post-launch)

The Step 1 architectures are 2023-era. To upgrade to 2026 SOTA, add NEW trainer modules in `ml/training/trainers/` alongside existing ones, register them with `is_shadow=TRUE`, A/B vs prod, then promote.

| Slot | Current | SOTA upgrade | Why |
|---|---|---|---|
| `finrl_x_ppo` → `autopilot_recurrent_ppo` | PPO + MlpPolicy | RecurrentPPO + LSTM | Captures temporal dependencies in portfolio state; SB3-Contrib has it |
| `finrl_x_ddpg` → `autopilot_sac` | DDPG | SAC (Soft Actor-Critic) | Provably better sample efficiency; SB3 stable since 2.0 |
| `swing_tft` → `swing_patchtst` | TFT | PatchTST | SOTA on M4/ETT benchmarks 2024–2026 |
| `momentum_chronos` → `momentum_chronos2` | Chronos-Bolt Base | Chronos-2 (March 2025) | Same family, materially better perf |
| `intraday_lstm` → `intraday_xlstm` or `intraday_mamba` | Bi-LSTM | xLSTM / Mamba SSM | NeurIPS 2024 winners on long-context |
| `vix_tft` → `vix_chronos2` | TFT | Chronos-2 with macro covariates | Eliminates per-PR retrains |

**Process to add a SOTA trainer:**
1. Create `ml/training/trainers/<new_name>.py` subclassing `Trainer` with a different `name` slug.
2. Run `python -m ml.training.runner --only <new_name>` (no `--promote`) — registers with `is_prod=FALSE, is_shadow=FALSE`.
3. Manually flip `is_shadow=TRUE` in `model_versions` so prod traffic still uses the old version while shadow inference runs in parallel.
4. After 30+ days of shadow traffic, compare metrics on `model_rolling_performance`.
5. If SOTA wins materially, `python -m ml.training.runner --only <new_name> --promote` to flip prod.

---

## Phase H launch run — exact sequence

```sh
# On the GPU box:
ssh gpu-box
cd Swing_AI_Final && source .venv/bin/activate

# Confirm B2 + DB connectivity:
python -c "from src.backend.ai.registry import get_registry; print(get_registry().b2.bucket_name)"

# Smoke list:
python -m ml.training.runner --list

# Final dry run (no B2 / DB writes — validates every trainer):
python -m ml.training.runner --all --dry-run --json | tee dry.json

# Real run with promotion. ~4 hours on A100.
python -m ml.training.runner --all --promote --json | tee launch.json

# Confirm 11/11 trainers registered:
psql $DATABASE_URL -c "SELECT model_name, version, is_prod, trained_at FROM model_versions WHERE is_prod = TRUE ORDER BY trained_at DESC;"

# Hit /api/admin/launch-readiness — every check should be green.
curl -H "Authorization: Bearer $ADMIN_TOKEN" $API/api/admin/launch-readiness | jq
```

If `launch-readiness` returns `ready: true`, tag and ship:
```sh
git tag -a v1.0.0 -m "Quant X v1.0.0 — first public launch"
git push origin v1.0.0
```

---

## Operating cadence after v1.0.0

| Cadence | Trainer | Trigger |
|---|---|---|
| Weekly (Sat 03:00 IST) | `regime_hmm` | scheduler `hmm_weekly_retrain` |
| Monthly | `swing_tft` | scheduler `monthly_tft_retrain` (existing) |
| Quarterly | `lgbm_signal_gate`, `earnings_xgb`, `intraday_lstm` | manual `/admin/training` trigger |
| Semi-annual | `finrl_x_*`, `vix_tft`, `options_rl` | manual on regime shift |
| Zero-shot (no retrain) | `momentum_chronos`, `momentum_timesfm` | only re-register if HF model id changes |

The admin `/admin/training` UI exposes "Run all" and per-trainer "Run selected"
buttons — operations doesn't need to SSH the GPU box for routine retrains.
