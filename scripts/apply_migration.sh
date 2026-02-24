#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL is not set."
  echo "Set it to your Supabase Postgres connection string."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
MIGRATION_FILE="${ROOT_DIR}/infrastructure/database/migrations/2026_02_05_prd_alignment.sql"

if [[ ! -f "$MIGRATION_FILE" ]]; then
  echo "ERROR: Migration file not found at $MIGRATION_FILE"
  exit 1
fi

psql "$SUPABASE_DB_URL" -f "$MIGRATION_FILE"

echo "✅ Migration applied successfully"
