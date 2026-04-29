#!/usr/bin/env python3
"""
Run marketplace migration SQL against Supabase Postgres.

Usage:
  # Set your Supabase DB URL first (from Supabase Dashboard → Settings → Database → Connection string → URI)
  export DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres"

  # Or use individual env vars from .env
  export SUPABASE_URL="https://xxx.supabase.co"
  export SUPABASE_SERVICE_KEY="eyJ..."

  python scripts/run_migration.py                    # Run migration
  python scripts/run_migration.py --verify           # Only verify tables exist
  python scripts/run_migration.py --dry-run          # Print SQL without executing
"""

import os
import sys
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

MIGRATION_FILE = os.path.join(
    os.path.dirname(__file__), "..", "infrastructure", "database", "marketplace_migration.sql"
)


def run_via_psycopg2(database_url: str, sql: str, dry_run: bool = False):
    """Run migration via psycopg2 (direct Postgres connection)."""
    try:
        import psycopg2
    except ImportError:
        logger.error("psycopg2 not installed. Run: pip install psycopg2-binary")
        sys.exit(1)

    if dry_run:
        logger.info("=== DRY RUN — SQL to execute ===")
        print(sql[:3000] + "\n... (truncated)" if len(sql) > 3000 else sql)
        return

    logger.info(f"Connecting to Postgres...")
    conn = psycopg2.connect(database_url)
    conn.autocommit = True
    cur = conn.cursor()

    try:
        logger.info("Running marketplace migration...")
        cur.execute(sql)
        logger.info("Migration completed successfully!")

        # Verify
        cur.execute("SELECT COUNT(*) FROM public.strategy_catalog")
        count = cur.fetchone()[0]
        logger.info(f"strategy_catalog: {count} rows")

        cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'user_strategy_deployments'")
        exists = cur.fetchone()[0]
        logger.info(f"user_strategy_deployments table: {'exists' if exists else 'MISSING'}")

        cur.execute("SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'strategy_backtests'")
        exists = cur.fetchone()[0]
        logger.info(f"strategy_backtests table: {'exists' if exists else 'MISSING'}")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        raise
    finally:
        cur.close()
        conn.close()


def run_via_supabase_rpc(supabase_url: str, service_key: str, sql: str, dry_run: bool = False):
    """Run migration via Supabase REST API (uses service role key)."""
    if dry_run:
        logger.info("=== DRY RUN — SQL to execute ===")
        print(sql[:3000] + "\n... (truncated)" if len(sql) > 3000 else sql)
        return

    try:
        import httpx
    except ImportError:
        logger.error("httpx not installed. Run: pip install httpx")
        sys.exit(1)

    # Supabase exposes a Postgres REST endpoint at /rest/v1/rpc
    # But raw SQL requires the pg_net extension or direct DB connection.
    # The most reliable way is via the Supabase Management API or direct psql.

    # Try using the Supabase SQL endpoint (available in newer versions)
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
    }

    # Split SQL into statements and execute via rpc if available
    # This is a fallback — direct psycopg2 is preferred
    logger.warning(
        "Supabase REST API doesn't support raw SQL directly.\n"
        "Please run the migration via one of these methods:\n\n"
        "  1. Supabase Dashboard → SQL Editor → paste contents of:\n"
        f"     {os.path.abspath(MIGRATION_FILE)}\n\n"
        "  2. Direct Postgres connection:\n"
        "     export DATABASE_URL='postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'\n"
        "     python scripts/run_migration.py\n\n"
        "  3. Supabase CLI:\n"
        "     supabase db push --db-url $DATABASE_URL < infrastructure/database/marketplace_migration.sql\n"
    )


def verify_tables(database_url: str):
    """Verify migration tables exist and have expected data."""
    try:
        import psycopg2
    except ImportError:
        logger.error("psycopg2 not installed")
        sys.exit(1)

    conn = psycopg2.connect(database_url)
    cur = conn.cursor()

    checks = [
        ("strategy_catalog", "SELECT COUNT(*) FROM public.strategy_catalog"),
        ("user_strategy_deployments", "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'user_strategy_deployments'"),
        ("strategy_backtests", "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'strategy_backtests'"),
        ("signals.strategy_catalog_id", "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'signals' AND column_name = 'strategy_catalog_id'"),
        ("subscription_plans.max_strategies", "SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'subscription_plans' AND column_name = 'max_strategies'"),
    ]

    all_ok = True
    for name, query in checks:
        try:
            cur.execute(query)
            result = cur.fetchone()[0]
            status = "OK" if result > 0 else "MISSING"
            if status == "MISSING":
                all_ok = False
            logger.info(f"  {name}: {status} ({result})")
        except Exception as e:
            logger.error(f"  {name}: ERROR ({e})")
            all_ok = False

    # Check strategy categories
    try:
        cur.execute("SELECT category, COUNT(*) FROM public.strategy_catalog GROUP BY category ORDER BY category")
        rows = cur.fetchall()
        logger.info("\n  Strategy breakdown:")
        for cat, cnt in rows:
            logger.info(f"    {cat}: {cnt}")
    except Exception:
        pass

    cur.close()
    conn.close()

    if all_ok:
        logger.info("\nAll migration checks PASSED")
    else:
        logger.warning("\nSome checks FAILED — run the migration first")

    return all_ok


def main():
    parser = argparse.ArgumentParser(description="Run marketplace migration against Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Print SQL without executing")
    parser.add_argument("--verify", action="store_true", help="Only verify tables exist")
    args = parser.parse_args()

    # Load .env if available
    try:
        from dotenv import load_dotenv
        env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
        if os.path.exists(env_path):
            load_dotenv(env_path)
    except ImportError:
        pass

    # Read migration SQL
    if not os.path.exists(MIGRATION_FILE):
        logger.error(f"Migration file not found: {MIGRATION_FILE}")
        sys.exit(1)

    with open(MIGRATION_FILE, "r") as f:
        sql = f.read()

    logger.info(f"Loaded migration: {len(sql)} bytes from {MIGRATION_FILE}")

    # Determine connection method
    database_url = os.environ.get("DATABASE_URL", "")
    supabase_url = os.environ.get("SUPABASE_URL", "")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    if args.verify:
        if not database_url:
            logger.error("Set DATABASE_URL to verify. Example:\n  export DATABASE_URL='postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'")
            sys.exit(1)
        verify_tables(database_url)
        return

    if database_url:
        run_via_psycopg2(database_url, sql, dry_run=args.dry_run)
    elif supabase_url and service_key:
        run_via_supabase_rpc(supabase_url, service_key, sql, dry_run=args.dry_run)
    else:
        logger.error(
            "No database connection configured. Set one of:\n\n"
            "  Option 1 (preferred): Direct Postgres URL\n"
            "    export DATABASE_URL='postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres'\n\n"
            "  Option 2: Supabase credentials\n"
            "    Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env\n\n"
            "  Option 3: Copy-paste SQL in Supabase Dashboard\n"
            f"    File: {os.path.abspath(MIGRATION_FILE)}\n"
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
