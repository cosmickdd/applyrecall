"""
ApplyRecall Operational Management CLI

Provides administrative tools for:
- Telegram Bot Webhook lifecycle (register, inspect, remove)
- Database connectivity check and schema migration
- Reliability diagnostics

Usage:
    python -m app.cli register-webhook [--url URL] [--secret SECRET] [--drop-pending]
    python -m app.cli get-webhook-info
    python -m app.cli remove-webhook [--drop-pending]
    python -m app.cli db-check
    python -m app.cli migrate
"""

import sys
import json
import asyncio
import argparse
import httpx
from typing import Optional

from app.config import settings
from app.database import get_db_context, init_db, close_pg_pool

TELEGRAM_API_BASE = "https://api.telegram.org/bot"


async def register_webhook(url: Optional[str] = None, secret: Optional[str] = None, drop_pending: bool = False):
    """Registers the Telegram webhook endpoint with Telegram Bot API."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        print("ERROR: TELEGRAM_BOT_TOKEN is not set in environment or configuration.", file=sys.stderr)
        sys.exit(1)

    webhook_url = url or f"{settings.API_BASE_URL.rstrip('/')}/telegram/webhook" if settings.API_BASE_URL else None
    if not webhook_url:
        print("ERROR: No webhook URL provided and API_BASE_URL is not configured.", file=sys.stderr)
        print("Usage: python -m app.cli register-webhook --url https://your-domain.onrender.com/api/telegram/webhook", file=sys.stderr)
        sys.exit(1)

    if not webhook_url.startswith("https://"):
        print(f"ERROR: Telegram Bot API requires HTTPS for webhooks. Provided URL: {webhook_url}", file=sys.stderr)
        sys.exit(1)

    secret_token = secret or settings.TELEGRAM_WEBHOOK_SECRET
    payload = {
        "url": webhook_url,
        "drop_pending_updates": drop_pending,
        "allowed_updates": ["message", "edited_message"]
    }
    if secret_token:
        payload["secret_token"] = secret_token

    api_url = f"{TELEGRAM_API_BASE}{token}/setWebhook"
    print(f"Configuring Telegram webhook...")
    print(f"  Target URL: {webhook_url}")
    print(f"  Secret Token Configured: {'Yes' if secret_token else 'No'}")
    print(f"  Drop Pending Updates: {drop_pending}")

    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            resp = await client.post(api_url, json=payload)
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            if resp.status_code == 200 and data.get("ok"):
                print("SUCCESS: Webhook successfully set!")
                print(f"  Description: {data.get('description', 'OK')}")
            else:
                print(f"FAILED: Telegram API returned status {resp.status_code}:", file=sys.stderr)
                print(f"  Description: {data.get('description', resp.text)}", file=sys.stderr)
                sys.exit(1)

            # Verification step: immediately query getWebhookInfo
            info_url = f"{TELEGRAM_API_BASE}{token}/getWebhookInfo"
            info_resp = await client.get(info_url)
            info_data = info_resp.json() if info_resp.headers.get("content-type", "").startswith("application/json") else {}
            if info_data.get("ok"):
                res = info_data.get("result", {})
                print("\nLive Webhook Verification:")
                print(f"  Live URL: {res.get('url')}")
                print(f"  Has Custom Certificate: {res.get('has_custom_certificate')}")
                print(f"  Pending Update Count: {res.get('pending_update_count', 0)}")
                print(f"  Max Connections: {res.get('max_connections', 40)}")
                if res.get("last_error_date"):
                    print(f"  Last Error: {res.get('last_error_message')}")
        except Exception as e:
            print(f"Network error during webhook registration: {e}", file=sys.stderr)
            sys.exit(1)


async def get_webhook_info():
    """Fetches and displays current webhook status from Telegram."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        print("ERROR: TELEGRAM_BOT_TOKEN is not configured.", file=sys.stderr)
        sys.exit(1)

    api_url = f"{TELEGRAM_API_BASE}{token}/getWebhookInfo"
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(api_url)
            data = resp.json()
            if data.get("ok"):
                print(json.dumps(data["result"], indent=2))
            else:
                print(f"Error: {data.get('description')}", file=sys.stderr)
        except Exception as e:
            print(f"Network error: {e}", file=sys.stderr)
            sys.exit(1)


async def remove_webhook(drop_pending: bool = False):
    """Deletes the registered webhook from Telegram Bot API."""
    token = settings.TELEGRAM_BOT_TOKEN
    if not token:
        print("ERROR: TELEGRAM_BOT_TOKEN is not configured.", file=sys.stderr)
        sys.exit(1)

    api_url = f"{TELEGRAM_API_BASE}{token}/deleteWebhook"
    payload = {"drop_pending_updates": drop_pending}
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.post(api_url, json=payload)
            data = resp.json()
            if data.get("ok"):
                print(f"SUCCESS: Webhook removed. ({data.get('description', 'OK')})")
            else:
                print(f"Failed: {data.get('description')}", file=sys.stderr)
        except Exception as e:
            print(f"Network error: {e}", file=sys.stderr)
            sys.exit(1)


async def check_database():
    """Tests database connectivity and inspects table counts."""
    print("Testing ApplyRecall database connectivity...")
    print(f"  Environment: {settings.APP_ENV}")
    print(f"  Engine: {'PostgreSQL (Supabase)' if settings.use_postgres else 'SQLite (Local Dev)'}")

    try:
        async with get_db_context() as conn:
            cursor = await conn.execute("SELECT 1 as test_val;")
            row = await cursor.fetchone()
            val = row["test_val"] if hasattr(row, "__getitem__") else row[0]
            print(f"  Database Ping: OK (returned {val})")

            # Check key tables
            tables = ["users", "profiles", "applications", "application_events", "answers", "reminders", "pairing_codes", "device_connections", "telegram_connections"]
            print("\nTable Row Counts:")
            for tbl in tables:
                try:
                    c = await conn.execute(f"SELECT count(*) as count FROM {tbl};")
                    r = await c.fetchone()
                    cnt = r["count"] if hasattr(r, "__getitem__") else r[0]
                    print(f"  • {tbl:25}: {cnt} rows")
                except Exception as err:
                    print(f"  • {tbl:25}: [Table missing or error: {err}]")

            # Check migrations table if present
            try:
                c = await conn.execute("SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC;")
                m_rows = await c.fetchall()
                print("\nApplied Migrations:")
                for m in m_rows:
                    print(f"  • {m['version']} - {m['name']} ({m['applied_at']})")
            except Exception:
                print("\nApplied Migrations: (schema_migrations table not initialized yet)")

    except Exception as e:
        print(f"\nDATABASE CONNECTION FAILED: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if settings.use_postgres:
            await close_pg_pool()


async def run_migrations():
    """Initializes schema and runs any pending migrations."""
    print("Initializing database schema and migrations...")
    try:
        await init_db()
        print("SUCCESS: Database schema and migrations applied successfully.")
    except Exception as e:
        print(f"FAILED: Migration error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if settings.use_postgres:
            await close_pg_pool()


def main():
    parser = argparse.ArgumentParser(description="ApplyRecall Management CLI")
    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # register-webhook
    rw_parser = subparsers.add_parser("register-webhook", help="Register Telegram webhook with Telegram Bot API")
    rw_parser.add_argument("--url", type=str, help="Public HTTPS URL for the webhook (e.g. https://api.applyrecall.com/api/telegram/webhook)")
    rw_parser.add_argument("--secret", type=str, help="Secret token for X-Telegram-Bot-Api-Secret-Token validation")
    rw_parser.add_argument("--drop-pending", action="store_true", help="Drop pending Telegram updates before registering")

    # get-webhook-info
    subparsers.add_parser("get-webhook-info", help="Retrieve current Telegram webhook registration info")

    # remove-webhook
    rem_parser = subparsers.add_parser("remove-webhook", help="Delete Telegram webhook registration")
    rem_parser.add_argument("--drop-pending", action="store_true", help="Drop pending Telegram updates")

    # db-check
    subparsers.add_parser("db-check", help="Verify database connection, inspect tables and migration status")

    # migrate
    subparsers.add_parser("migrate", help="Execute schema migrations against current database")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    if args.command == "register-webhook":
        asyncio.run(register_webhook(url=args.url, secret=args.secret, drop_pending=args.drop_pending))
    elif args.command == "get-webhook-info":
        asyncio.run(get_webhook_info())
    elif args.command == "remove-webhook":
        asyncio.run(remove_webhook(drop_pending=args.drop_pending))
    elif args.command == "db-check":
        asyncio.run(check_database())
    elif args.command == "migrate":
        asyncio.run(run_migrations())


if __name__ == "__main__":
    main()
