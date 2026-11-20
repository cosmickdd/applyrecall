import asyncio
import json
import logging
import re
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import aiosqlite
from app.config import settings

logger = logging.getLogger("applyrecall.database")

# Global asyncpg connection pool for PostgreSQL
_pg_pool = None

UUID_REGEX = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
ISO_DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$")


def now_iso() -> str:
    """Returns current UTC timestamp in ISO-8601 format."""
    return datetime.now(timezone.utc).isoformat()


def new_uuid() -> str:
    """Returns a new random UUID v4 string."""
    return str(uuid.uuid4())


def convert_placeholders_to_pg(query: str) -> str:
    """
    Converts SQLite '?' parameter placeholders to PostgreSQL '$1, $2, ...' placeholders.
    Safely ignores '?' characters inside:
    - Single-quoted string literals ('...') including escaped quotes ('' or \')
    - Double-quoted identifiers ("...") including escaped quotes ("" or \")
    - SQL single-line comments (-- ...)
    - SQL block comments (/* ... */)
    - PostgreSQL dollar-quoted strings ($tag$...$tag$ or $$...$$)
    """
    out: List[str] = []
    i = 0
    n = len(query)
    count = 0

    while i < n:
        ch = query[i]

        # 1. Line comments: -- ...
        if ch == "-" and i + 1 < n and query[i + 1] == "-":
            j = i + 2
            while j < n and query[j] != "\n":
                j += 1
            out.append(query[i:j])
            i = j
            continue

        # 2. Block comments: /* ... */
        if ch == "/" and i + 1 < n and query[i + 1] == "*":
            j = i + 2
            while j < n:
                if query[j] == "*" and j + 1 < n and query[j + 1] == "/":
                    j += 2
                    break
                j += 1
            out.append(query[i:j])
            i = j
            continue

        # 3. Dollar-quoted strings: $$...$$ or $tag$...$tag$
        if ch == "$":
            tag_match = re.match(r"(\$[a-zA-Z_0-9]*\$)", query[i:])
            if tag_match:
                tag = tag_match.group(1)
                tag_len = len(tag)
                end_idx = query.find(tag, i + tag_len)
                if end_idx != -1:
                    j = end_idx + tag_len
                    out.append(query[i:j])
                    i = j
                    continue

        # 4. Single-quoted string literal: '...'
        if ch == "'":
            j = i + 1
            while j < n:
                if query[j] == "'":
                    if j + 1 < n and query[j + 1] == "'":
                        j += 2  # Escaped single quote ''
                        continue
                    j += 1
                    break
                elif query[j] == "\\":
                    j += 2  # Escaped character \'
                    continue
                else:
                    j += 1
            out.append(query[i:j])
            i = j
            continue

        # 5. Double-quoted identifier: "..."
        if ch == '"':
            j = i + 1
            while j < n:
                if query[j] == '"':
                    if j + 1 < n and query[j + 1] == '"':
                        j += 2  # Escaped double quote ""
                        continue
                    j += 1
                    break
                elif query[j] == "\\":
                    j += 2
                    continue
                else:
                    j += 1
            out.append(query[i:j])
            i = j
            continue

        # 6. Parameter placeholder: ?
        if ch == "?":
            count += 1
            out.append(f"${count}")
            i += 1
            continue

        out.append(ch)
        i += 1

    return "".join(out)


def adapt_param_for_pg(val: Any) -> Any:
    """
    Converts a Python value into the exact native type expected by asyncpg/PostgreSQL.
    - String matching UUID pattern -> uuid.UUID
    - String matching ISO timestamp pattern -> timezone-aware datetime.datetime (UTC)
    - Dict or List -> JSON string
    - Pre-existing types (bool, int, float, str, None, datetime, uuid.UUID) preserved.
    """
    if val is None:
        return None
    if isinstance(val, (bool, int, float)):
        return val
    if isinstance(val, uuid.UUID):
        return val
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val
    if isinstance(val, str):
        # 1. UUID string check (36 chars)
        if len(val) == 36 and UUID_REGEX.match(val):
            try:
                return uuid.UUID(val)
            except ValueError:
                pass
        # 2. ISO datetime string check
        if len(val) >= 19 and ISO_DATE_REGEX.match(val):
            try:
                dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except ValueError:
                pass
        return val
    if isinstance(val, (dict, list)):
        return json.dumps(val)
    return val


class RecordWrapper:
    """
    Wraps an asyncpg.Record or dict, providing:
    - Dict key access: row["key"]
    - Attribute access: row.key
    - dict(row) conversion where UUIDs and datetimes are normalized to strings
      so downstream routers, serializers, and Pydantic models behave consistently.
    """

    def __init__(self, record: Any):
        if hasattr(record, "items"):
            raw = dict(record.items())
        elif hasattr(record, "keys"):
            raw = {k: record[k] for k in record.keys()}
        elif isinstance(record, dict):
            raw = dict(record)
        elif isinstance(record, (tuple, list)):
            raw = {i: v for i, v in enumerate(record)}
        else:
            try:
                raw = dict(record)
            except Exception:
                raw = {}

        self._data: Dict[Any, Any] = {}
        for k, v in raw.items():
            if isinstance(v, uuid.UUID):
                self._data[k] = str(v)
            elif isinstance(v, datetime):
                self._data[k] = v.isoformat()
            else:
                self._data[k] = v

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int) and key not in self._data:
            vals = list(self._data.values())
            return vals[key]
        return self._data[key]

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)

    def keys(self):
        return self._data.keys()

    def values(self):
        return self._data.values()

    def items(self):
        return self._data.items()

    def __contains__(self, key: str) -> bool:
        return key in self._data

    def __iter__(self):
        return iter(self._data)

    def __repr__(self) -> str:
        return repr(self._data)


class QueryResult:
    """Standardized query cursor/result interface across SQLite and PostgreSQL."""

    def __init__(self, rows: Optional[List[Any]] = None, rowcount: int = 0):
        self._rows = [r if isinstance(r, (RecordWrapper, aiosqlite.Row)) else RecordWrapper(r) for r in (rows or [])]
        self._index = 0
        self.rowcount = rowcount

    async def fetchone(self) -> Optional[Any]:
        if self._rows and self._index < len(self._rows):
            row = self._rows[self._index]
            self._index += 1
            return row
        return None

    async def fetchall(self) -> List[Any]:
        return self._rows


class PostgresConnectionWrapper:
    """
    Wraps an asyncpg Connection to expose a cursor-compatible interface
    identical to aiosqlite, with automatic parameter translation (? -> $n),
    type adaptation, and real transaction context managers.
    """

    def __init__(self, raw_conn):
        self._conn = raw_conn

    async def execute(self, query: str, parameters: Optional[Union[tuple, list]] = None) -> QueryResult:
        pg_query = convert_placeholders_to_pg(query.strip())
        args = [adapt_param_for_pg(p) for p in (parameters or [])]

        upper_query = pg_query.lstrip().upper()
        if upper_query.startswith("SELECT") or " RETURNING " in upper_query:
            records = await self._conn.fetch(pg_query, *args)
            return QueryResult(rows=records, rowcount=len(records))
        else:
            status = await self._conn.execute(pg_query, *args)
            rowcount = 0
            if status:
                parts = status.split()
                if parts and parts[-1].isdigit():
                    rowcount = int(parts[-1])
            return QueryResult(rows=[], rowcount=rowcount)

    async def fetchone(self, query: str, parameters: Optional[Union[tuple, list]] = None):
        res = await self.execute(query, parameters)
        return await res.fetchone()

    async def fetchall(self, query: str, parameters: Optional[Union[tuple, list]] = None):
        res = await self.execute(query, parameters)
        return await res.fetchall()

    @asynccontextmanager
    async def transaction(self):
        """Asynchronous context manager for explicit transactions with rollback on failure."""
        async with self._conn.transaction():
            yield self

    async def commit(self) -> None:
        """asyncpg autocommits outside explicit transactions; inside transactions context manager manages commit."""
        pass

    async def rollback(self) -> None:
        """Rolls back the current transaction."""
        if self._conn.is_in_transaction():
            await self._conn.execute("ROLLBACK;")

    async def set_session_user(self, user_id: str) -> None:
        """Sets transaction-local user identity for PostgreSQL RLS policies."""
        if user_id:
            adapted_id = str(adapt_param_for_pg(user_id))
            await self._conn.execute(f"SET LOCAL app.current_user_id = '{adapted_id}';")


class SqliteConnectionWrapper:
    """
    Wraps an aiosqlite Connection to expose a cursor-compatible interface
    identical to PostgresConnectionWrapper, with transaction support.
    """

    def __init__(self, raw_conn):
        self._conn = raw_conn

    async def execute(self, query: str, parameters: Optional[Union[tuple, list]] = None) -> QueryResult:
        cursor = await self._conn.execute(query, parameters or ())
        rows = await cursor.fetchall() if query.strip().upper().startswith("SELECT") or " RETURNING " in query.strip().upper() else []
        return QueryResult(rows=rows, rowcount=cursor.rowcount)

    async def fetchone(self, query: str, parameters: Optional[Union[tuple, list]] = None):
        res = await self.execute(query, parameters)
        return await res.fetchone()

    async def fetchall(self, query: str, parameters: Optional[Union[tuple, list]] = None):
        res = await self.execute(query, parameters)
        return await res.fetchall()

    @asynccontextmanager
    async def transaction(self):
        """Asynchronous transaction context manager on SQLite with automatic commit/rollback."""
        try:
            yield self
            await self._conn.commit()
        except Exception:
            await self._conn.rollback()
            raise

    async def commit(self) -> None:
        await self._conn.commit()

    async def rollback(self) -> None:
        await self._conn.rollback()

    async def set_session_user(self, user_id: str) -> None:
        pass


@asynccontextmanager
async def db_transaction(conn):
    """
    Universal transaction context manager that works seamlessly across:
    - PostgresConnectionWrapper (asyncpg transaction)
    - SqliteConnectionWrapper (aiosqlite transaction)
    - Raw aiosqlite.Connection (for backward-compatibility in direct tests)
    - Raw asyncpg.Connection
    """
    if hasattr(conn, "transaction"):
        async with conn.transaction():
            yield conn
    else:
        try:
            yield conn
            await conn.commit()
        except Exception:
            if hasattr(conn, "rollback"):
                await conn.rollback()
            raise


async def get_pg_pool():
    """Initializes and returns the global asyncpg connection pool."""
    global _pg_pool
    if _pg_pool is None:
        import asyncpg

        logger.info("Initializing asyncpg connection pool for Supabase PostgreSQL...")
        dsn = settings.postgres_dsn

        ssl_mode = None
        if "sslmode=require" in dsn or "supabase.co" in dsn or settings.is_production:
            ssl_mode = "require"

        # Sanitize query string params for asyncpg
        clean_dsn = re.sub(r"[?&]sslmode=[^&]+", "", dsn).rstrip("?&")

        try:
            _pg_pool = await asyncpg.create_pool(
                dsn=clean_dsn,
                ssl=ssl_mode,
                min_size=2,
                max_size=10,
                timeout=10.0,
                command_timeout=30.0,
                max_inactive_connection_lifetime=300.0,
            )
            logger.info("asyncpg connection pool initialized successfully.")
        except Exception as e:
            # Mask credentials from error message
            safe_dsn = re.sub(r"://([^:]+):([^@]+)@", r"://\1:***@", clean_dsn)
            logger.error(f"Failed to connect to PostgreSQL at {safe_dsn}: {str(e)}")
            raise RuntimeError(f"Database connection failed. Unable to establish connection to PostgreSQL.") from e

    return _pg_pool


async def close_pg_pool():
    """Closes the asyncpg connection pool gracefully."""
    global _pg_pool
    if _pg_pool is not None:
        logger.info("Closing asyncpg connection pool...")
        await _pg_pool.close()
        _pg_pool = None
        logger.info("asyncpg connection pool closed.")


async def get_db():
    """
    FastAPI dependency yielding a database connection.
    Uses PostgreSQL (asyncpg pool) when configured, or SQLite in local development.
    Never falls back silently to SQLite in production.
    """
    if settings.is_production and not settings.use_postgres:
        settings.validate_production()

    if settings.use_postgres:
        pool = await get_pg_pool()
        async with pool.acquire() as raw_conn:
            yield PostgresConnectionWrapper(raw_conn)
    else:
        conn = await aiosqlite.connect(settings.SQLITE_PATH)
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON;")
        try:
            yield SqliteConnectionWrapper(conn)
        finally:
            await conn.close()


@asynccontextmanager
async def get_db_context():
    """
    Context manager for background workers, Telegram bot, and scripts
    to acquire a database connection outside of HTTP request lifecycles.
    """
    if settings.is_production and not settings.use_postgres:
        settings.validate_production()

    if settings.use_postgres:
        pool = await get_pg_pool()
        async with pool.acquire() as raw_conn:
            yield PostgresConnectionWrapper(raw_conn)
    else:
        conn = await aiosqlite.connect(settings.SQLITE_PATH)
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON;")
        try:
            yield SqliteConnectionWrapper(conn)
        finally:
            await conn.close()


async def apply_migrations(conn):
    """
    Applies versioned SQL migrations from backend/app/migrations/*.sql
    in transactional, idempotent sequence.
    """
    # Create migration tracking table
    await conn.execute("""
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    cursor = await conn.execute("SELECT version FROM schema_migrations;")
    applied_rows = await cursor.fetchall()
    applied_versions = {r["version"] for r in applied_rows}

    migrations_dir = Path(__file__).resolve().parent / "migrations"
    if not migrations_dir.exists():
        logger.warning(f"Migrations directory not found at {migrations_dir}")
        return

    migration_files = sorted(migrations_dir.glob("*.sql"))
    for mig_file in migration_files:
        version = mig_file.name.split("_")[0]
        if version in applied_versions:
            continue

        logger.info(f"Applying database migration: {mig_file.name}...")
        sql_content = mig_file.read_text(encoding="utf-8")

        async with conn.transaction():
            # Run migration commands
            for statement in sql_content.split(";"):
                stmt = statement.strip()
                if stmt:
                    await conn.execute(stmt)

            # Record in schema_migrations
            now = now_iso()
            await conn.execute(
                "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)",
                (version, mig_file.name, now)
            )

        logger.info(f"Successfully applied migration: {mig_file.name}")


async def init_db():
    """
    Initializes database schema, applies migrations, and seeds development data.
    Runs against Supabase PostgreSQL or local SQLite based on configuration.
    """
    if settings.is_production:
        settings.validate_production()

    if settings.use_postgres:
        pool = await get_pg_pool()
        async with pool.acquire() as raw_conn:
            wrapper = PostgresConnectionWrapper(raw_conn)
            await apply_migrations(wrapper)
    else:
        await _init_sqlite_schema()


async def _init_sqlite_schema():
    """Initializes tables and migrations on SQLite (for isolated local dev & testing)."""
    conn = await aiosqlite.connect(settings.SQLITE_PATH)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA foreign_keys = ON;")

    try:
        # 1. Profiles
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            full_name TEXT,
            first_name TEXT,
            last_name TEXT,
            email TEXT,
            phone TEXT,
            city TEXT,
            country TEXT,
            college TEXT,
            degree TEXT,
            branch TEXT,
            graduation_year TEXT,
            linkedin_url TEXT,
            portfolio_url TEXT,
            github_url TEXT,
            summary TEXT,
            timezone TEXT DEFAULT 'UTC',
            created_at TEXT,
            updated_at TEXT
        );
        """)

        # 2. Experiences
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS experiences (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            company TEXT NOT NULL,
            position TEXT NOT NULL,
            description TEXT,
            start_date TEXT,
            end_date TEXT,
            is_current INTEGER DEFAULT 0,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 3. Projects
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            project_url TEXT,
            technologies TEXT,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 4. Answers
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS answers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            scope TEXT NOT NULL CHECK (scope IN ('general', 'company', 'application')),
            company TEXT,
            role TEXT,
            tags TEXT,
            created_at TEXT,
            updated_at TEXT,
            last_used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 5. Applications
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            company TEXT NOT NULL,
            position TEXT NOT NULL,
            job_url TEXT,
            source TEXT,
            description TEXT,
            location TEXT,
            employment_type TEXT,
            status TEXT NOT NULL DEFAULT 'Saved' CHECK (status IN ('Saved', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Withdrawn')),
            applied_at TEXT,
            hr_email TEXT,
            notes TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 6. Application Answers
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS application_answers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            application_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            source_answer_id TEXT,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        """)

        # 7. Application Events
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS application_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            application_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            previous_value TEXT,
            new_value TEXT,
            description TEXT,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        """)

        # 8. Reminders
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            application_id TEXT NOT NULL,
            reminder_at TEXT NOT NULL,
            type TEXT DEFAULT 'follow_up',
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'completed', 'failed', 'snoozed', 'cancelled')),
            sent_at TEXT,
            attempts INTEGER DEFAULT 0,
            last_attempt_at TEXT,
            error_message TEXT,
            next_retry_at TEXT,
            processing_started_at TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        """)

        # 9. Telegram Connections
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            chat_id TEXT NOT NULL UNIQUE,
            connected_at TEXT,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 10. Pairing Codes
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS pairing_codes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            device_type TEXT NOT NULL CHECK (device_type IN ('extension', 'telegram')),
            expires_at TEXT NOT NULL,
            used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 11. Device Connections
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS device_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            device_type TEXT NOT NULL CHECK (device_type IN ('extension', 'telegram')),
            device_name TEXT,
            token_hash TEXT NOT NULL UNIQUE,
            is_active INTEGER DEFAULT 1,
            created_at TEXT,
            last_used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 12. Telegram Processed Updates
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_processed_updates (
            update_id INTEGER PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('received', 'processing', 'processed', 'failed')),
            created_at TEXT,
            processed_at TEXT
        );
        """)

        # Indexes
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_answers_user_id ON answers(user_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_answers_scope ON answers(user_id, scope);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(user_id, status);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status, reminder_at);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_events_app ON application_events(application_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_pairing_code ON pairing_codes(code_hash, expires_at);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_device_token ON device_connections(token_hash);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_device_user ON device_connections(user_id);")

        # Migrate reminders table if columns missing
        cursor_rem_cols = await conn.execute("PRAGMA table_info(reminders);")
        rem_cols = [row[1] for row in await cursor_rem_cols.fetchall()]
        if "attempts" not in rem_cols:
            await conn.execute("ALTER TABLE reminders ADD COLUMN attempts INTEGER DEFAULT 0;")
        if "last_attempt_at" not in rem_cols:
            await conn.execute("ALTER TABLE reminders ADD COLUMN last_attempt_at TEXT;")
        if "error_message" not in rem_cols:
            await conn.execute("ALTER TABLE reminders ADD COLUMN error_message TEXT;")
        if "next_retry_at" not in rem_cols:
            await conn.execute("ALTER TABLE reminders ADD COLUMN next_retry_at TEXT;")
        if "processing_started_at" not in rem_cols:
            await conn.execute("ALTER TABLE reminders ADD COLUMN processing_started_at TEXT;")

        # Migrate telegram_processed_updates if columns missing
        cursor_tg_cols = await conn.execute("PRAGMA table_info(telegram_processed_updates);")
        tg_cols = [row[1] for row in await cursor_tg_cols.fetchall()]
        if "status" not in tg_cols:
            await conn.execute("ALTER TABLE telegram_processed_updates ADD COLUMN status TEXT DEFAULT 'processing';")
        if "created_at" not in tg_cols:
            await conn.execute("ALTER TABLE telegram_processed_updates ADD COLUMN created_at TEXT;")
        if "processed_at" not in tg_cols:
            await conn.execute("ALTER TABLE telegram_processed_updates ADD COLUMN processed_at TEXT;")

        # Seed default student user ONLY in development mode
        if not settings.is_production:
            dev_user_id = "00000000-0000-0000-0000-000000000001"
            cursor = await conn.execute("SELECT user_id FROM profiles WHERE user_id = ?", (dev_user_id,))
            row = await cursor.fetchone()
            if not row:
                now = now_iso()
                await conn.execute("""
                INSERT INTO profiles (
                    id, user_id, full_name, first_name, last_name, email, phone, city, country,
                    college, degree, branch, graduation_year, linkedin_url, portfolio_url, github_url,
                    summary, timezone, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, "Alex Morgan", "Alex", "Morgan", "alex.morgan@university.edu", "+1 (555) 234-5678",
                    "San Francisco", "United States", "Stanford University", "B.S. in Computer Science",
                    "Computer Science", "2025", "https://linkedin.com/in/alexmorgan-dev",
                    "https://alexmorgan.dev", "https://github.com/alexmorgan",
                    "Aspiring software engineer passionate about distributed systems, developer tooling, and modern web applications. Strong background in Python, TypeScript, and React.",
                    "America/Los_Angeles", now, now
                ))

                # Seed experiences
                await conn.execute("""
                INSERT INTO experiences (id, user_id, company, position, description, start_date, end_date, is_current, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, "Stripe", "Software Engineering Intern",
                    "Built resilient payment retry pipelines, improved latency by 14% on checkout flows.",
                    "2024-06-01", "2024-08-31", 0, now
                ))

                # Seed projects
                await conn.execute("""
                INSERT INTO projects (id, user_id, name, description, project_url, technologies, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, "DevCache",
                    "High-performance distributed in-memory cache written in Go with raft consensus.",
                    "https://github.com/alexmorgan/devcache", "Go, Raft, gRPC", now
                ))

                # Seed Universal & Company Answers
                answers_seed = [
                    (
                        new_uuid(), dev_user_id,
                        "Tell us about yourself.",
                        "I am a final-year Computer Science student at Stanford University with industry experience as a Software Engineering Intern at Stripe. I love building reliable, developer-friendly backend services and web applications. Outside of class, I maintain open-source tooling and lead the collegiate ACM systems group.",
                        "general", None, None, "intro,overview", now, now, now
                    ),
                    (
                        new_uuid(), dev_user_id,
                        "What are your greatest strengths?",
                        "My greatest strengths are rapid technical learning, pragmatic problem-solving, and clear cross-functional communication. When working on distributed systems at Stripe, I quickly navigated unfamiliar legacy codebases, identified bottleneck queries, and documented patterns for the wider engineering team.",
                        "general", None, None, "strengths,skills", now, now, now
                    ),
                    (
                        new_uuid(), dev_user_id,
                        "Why should we hire you?",
                        "You should hire me because I deliver high-velocity, reliable code that directly improves user experience. I take ownership end-to-end, learn systems fast, and take pride in crafting clean architecture that scales without unnecessary complexity.",
                        "general", None, None, "hire,value", now, now, now
                    ),
                    (
                        new_uuid(), dev_user_id,
                        "Why do you want to work at Acme?",
                        "I have followed Acme's recent innovations in developer experience and distributed workflows with great admiration. The opportunity to contribute to high-impact products alongside an exceptional engineering team makes Acme my top choice.",
                        "company", "Acme Corp", None, "company,culture", now, now, now
                    )
                ]

                for ans in answers_seed:
                    await conn.execute("""
                    INSERT INTO answers (id, user_id, question, answer, scope, company, role, tags, created_at, updated_at, last_used_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """, ans)

                # Seed Sample Application
                sample_app_id = new_uuid()
                await conn.execute("""
                INSERT INTO applications (
                    id, user_id, company, position, job_url, source, description,
                    location, employment_type, status, applied_at, hr_email, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    sample_app_id, dev_user_id, "Acme Corp", "Full-Stack Software Engineer",
                    "https://boards.greenhouse.io/acme/jobs/12345", "greenhouse.io",
                    "We are seeking an enthusiastic full-stack engineer to build core product workflows.",
                    "San Francisco, CA (Hybrid)", "Full-Time", "Applied", now,
                    "talent@acme.example.com", "Initial interview scheduled for next week.", now, now
                ))

                # Seed Timeline event
                await conn.execute("""
                INSERT INTO application_events (id, user_id, application_id, event_type, previous_value, new_value, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, sample_app_id, "status_change",
                    "Saved", "Applied", "Confirmed application submission via Chrome extension.", now
                ))

                # Seed sample reminder
                due_reminder_time = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
                await conn.execute("""
                INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'follow_up', 'pending', ?, ?);
                """, (
                    new_uuid(), dev_user_id, sample_app_id, due_reminder_time, now, now
                ))

        await conn.commit()
    finally:
        await conn.close()
