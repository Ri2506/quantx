#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PATTERN='ml\.strategies\.strategy_selector|strategy_selector\.py|regime_detector\.py'
HITS_FILE="$(mktemp)"

cleanup() {
  rm -f "${HITS_FILE}"
}
trap cleanup EXIT

echo "Running drift gate for deleted selector/regime references..."

if command -v rg >/dev/null 2>&1; then
  if rg -n --glob '*.py' --glob '*.md' --glob '*.ts' --glob '*.tsx' "${PATTERN}" "${ROOT_DIR}" >"${HITS_FILE}"; then
    echo "Drift gate failed. Found forbidden references:"
    cat "${HITS_FILE}"
    exit 1
  fi
else
  if grep -RInE \
    --include='*.py' \
    --include='*.md' \
    --include='*.ts' \
    --include='*.tsx' \
    "${PATTERN}" "${ROOT_DIR}" >"${HITS_FILE}"; then
    echo "Drift gate failed. Found forbidden references:"
    cat "${HITS_FILE}"
    exit 1
  fi
fi

echo "Drift gate passed."
