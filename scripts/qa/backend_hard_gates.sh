#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

echo "Running backend hard gates..."

python -c "from src.backend.services.signal_generator import SignalGenerator; print('SignalGenerator import OK')"
python -c "from ml.backtest.backtest_engine import BacktestEngine; BacktestEngine(); print('BacktestEngine init OK')"
python -c "from ml.backtest.comprehensive_backtest import ComprehensiveBacktestEngine; ComprehensiveBacktestEngine(); print('ComprehensiveBacktestEngine init OK')"

pytest -q \
  backend/tests/test_long_strategies.py \
  backend/tests/test_signal_save_contract.py \
  backend/tests/test_assistant_domain_guard.py \
  backend/tests/test_assistant_credit_limiter.py \
  backend/tests/test_assistant_news_context.py \
  backend/tests/test_assistant_api.py
python scripts/backtest_harness.py --help >/tmp/backtest_harness_help.txt

bash scripts/qa/drift_gate.sh
bash scripts/qa/frontend_execute_only_gate.sh

echo "Backend hard gates passed."
