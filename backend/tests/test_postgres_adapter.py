import uuid
import json
import pytest
import asyncio
import aiosqlite
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock

from app.database import (
    convert_placeholders_to_pg,
    adapt_param_for_pg,
    RecordWrapper,
    QueryResult,
    db_transaction,
    SqliteConnectionWrapper,
    now_iso,
    new_uuid
)
from app.config import settings
from app.services.telegram_service import (
    send_telegram_message,
    TelegramSendResult
)
from app.services.reminder_service import (
    process_due_reminders,
    recover_stale_processing_reminders,
    MAX_RETRY_ATTEMPTS,
    RETRY_DELAYS_MINUTES
)


class TestPlaceholderScanner:
    """Tests the state-machine query scanner for converting ? to $1, $2, etc."""

    def test_simple_placeholders(self):
        query = "SELECT * FROM users WHERE id = ? AND email = ?"
        converted = convert_placeholders_to_pg(query)
        assert converted == "SELECT * FROM users WHERE id = $1 AND email = $2"

    def test_ignores_question_marks_inside_single_quotes(self):
        query = "SELECT * FROM jobs WHERE title = 'Senior Engineer?' AND status = ?"
        converted = convert_placeholders_to_pg(query)
        assert converted == "SELECT * FROM jobs WHERE title = 'Senior Engineer?' AND status = $1"

    def test_handles_escaped_quotes_and_sql_doubled_quotes(self):
        query = r"SELECT * FROM logs WHERE desc = 'O''Reilly ? Question' AND code = ? AND note = 'It\'s ? working'"
        converted = convert_placeholders_to_pg(query)
        assert converted == r"SELECT * FROM logs WHERE desc = 'O''Reilly ? Question' AND code = $1 AND note = 'It\'s ? working'"

    def test_ignores_question_marks_inside_double_quotes(self):
        query = 'SELECT "column?name", id FROM users WHERE status = ?'
        converted = convert_placeholders_to_pg(query)
        assert converted == 'SELECT "column?name", id FROM users WHERE status = $1'

    def test_ignores_question_marks_inside_line_comments(self):
        query = """
        -- Why did we do this? Is it working?
        SELECT id FROM reminders WHERE user_id = ? -- comment ?
        AND status = ?
        """
        converted = convert_placeholders_to_pg(query)
        assert "WHERE user_id = $1" in converted
        assert "AND status = $2" in converted
        assert "-- Why did we do this? Is it working?" in converted

    def test_ignores_question_marks_inside_block_comments(self):
        query = "SELECT /* Is this ? needed */ * FROM profiles WHERE id = ?"
        converted = convert_placeholders_to_pg(query)
        assert converted == "SELECT /* Is this ? needed */ * FROM profiles WHERE id = $1"

    def test_ignores_question_marks_inside_dollar_quotes(self):
        query = "CREATE OR REPLACE FUNCTION test() RETURNS void AS $$ BEGIN -- what? END; $$ LANGUAGE plpgsql;"
        converted = convert_placeholders_to_pg(query)
        assert converted == query

        query_tag = "DO $code$ SELECT ? FROM dual; $code$; SELECT * FROM u WHERE id = ?"
        converted_tag = convert_placeholders_to_pg(query_tag)
        assert "$code$ SELECT ? FROM dual; $code$;" in converted_tag
        assert "WHERE id = $1" in converted_tag


class TestParamAdapter:
    """Tests parameter adaptation for PostgreSQL type safety (UUIDs, timestamps, JSON)."""

    def test_adapts_uuid_strings(self):
        u_str = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
        adapted = adapt_param_for_pg(u_str)
        assert isinstance(adapted, uuid.UUID)
        assert str(adapted) == u_str

    def test_adapts_iso_timestamps(self):
        ts_str = "2026-11-20T12:00:00Z"
        adapted = adapt_param_for_pg(ts_str)
        assert isinstance(adapted, datetime)
        assert adapted.tzinfo is not None

        ts_str_offset = "2026-11-20T12:00:00+00:00"
        adapted_offset = adapt_param_for_pg(ts_str_offset)
        assert isinstance(adapted_offset, datetime)

    def test_adapts_dict_and_list_to_json(self):
        data = {"role": "Engineer", "skills": ["Python", "PostgreSQL"]}
        adapted = adapt_param_for_pg(data)
        assert isinstance(adapted, str)
        assert json.loads(adapted) == data

        items = ["A", "B", "C"]
        adapted_items = adapt_param_for_pg(items)
        assert isinstance(adapted_items, str)
        assert json.loads(adapted_items) == items

    def test_preserves_scalars(self):
        assert adapt_param_for_pg(42) == 42
        assert adapt_param_for_pg(3.14) == 3.14
        assert adapt_param_for_pg(True) is True
        assert adapt_param_for_pg(None) is None
        assert adapt_param_for_pg("Just a normal string") == "Just a normal string"


class TestRecordWrapper:
    """Tests normalization of asyncpg rows to string-safe dicts for routers/serializers."""

    def test_normalizes_uuid_and_datetime(self):
        u = uuid.uuid4()
        now = datetime.now(timezone.utc)
        raw_row = {"id": u, "company": "Acme", "created_at": now, "count": 5}
        wrapped = RecordWrapper(raw_row)

        d = dict(wrapped)
        assert d["id"] == str(u)
        assert d["company"] == "Acme"
        assert d["created_at"] == now.isoformat()
        assert d["count"] == 5

        # Key and index access
        assert wrapped["id"] == str(u)
        assert wrapped.get("company") == "Acme"
        assert wrapped.get("missing", "default") == "default"


class TestTransactionRollback:
    """Tests that db_transaction correctly rolls back on errors."""

    @pytest.mark.anyio
    async def test_transaction_rollback_on_error(self):
        async with aiosqlite.connect(":memory:") as raw_conn:
            await raw_conn.execute("CREATE TABLE test_tx (id TEXT PRIMARY KEY, val TEXT);")
            await raw_conn.commit()

            conn = SqliteConnectionWrapper(raw_conn)

            # Insert initial row
            async with db_transaction(conn):
                await conn.execute("INSERT INTO test_tx (id, val) VALUES ('1', 'Initial');")

            # Verify initial insert succeeded
            cursor = await conn.execute("SELECT val FROM test_tx WHERE id = '1';")
            row = await cursor.fetchone()
            assert row[0] == "Initial"

            # Attempt failing transaction
            with pytest.raises(RuntimeError):
                async with db_transaction(conn):
                    await conn.execute("UPDATE test_tx SET val = 'Modified' WHERE id = '1';")
                    raise RuntimeError("Forced simulation error")

            # Verify that modification was rolled back
            cursor2 = await conn.execute("SELECT val FROM test_tx WHERE id = '1';")
            row2 = await cursor2.fetchone()
            assert row2[0] == "Initial"


class TestReminderRetrySchedule:
    """Tests the complete [5m, 20m, 80m] retry schedule and 4-attempt limit."""

    def test_retry_intervals_and_max_attempts(self):
        assert MAX_RETRY_ATTEMPTS == 4
        assert RETRY_DELAYS_MINUTES == [5, 20, 80]

    @pytest.mark.anyio
    async def test_full_retry_progression(self):
        async with aiosqlite.connect(":memory:") as raw_conn:
            raw_conn.row_factory = aiosqlite.Row
            conn = SqliteConnectionWrapper(raw_conn)

            # Create tables
            await conn.execute("""
            CREATE TABLE applications (
                id TEXT PRIMARY KEY, user_id TEXT, company TEXT, position TEXT, status TEXT, applied_at TEXT
            );
            """)
            await conn.execute("""
            CREATE TABLE reminders (
                id TEXT PRIMARY KEY, user_id TEXT, application_id TEXT, reminder_at TEXT, type TEXT,
                status TEXT, attempts INT DEFAULT 0, last_attempt_at TEXT, next_retry_at TEXT,
                processing_started_at TEXT, claim_token TEXT, worker_id TEXT, processing_expires_at TEXT,
                error_message TEXT, created_at TEXT, updated_at TEXT
            );
            """)
            await conn.execute("""
            CREATE TABLE telegram_connections (
                id TEXT PRIMARY KEY, user_id TEXT, chat_id TEXT, connected_at TEXT, is_active INT
            );
            """)

            uid = "u1"
            aid = "app1"
            rid = "rem1"
            now = now_iso()
            past = "2020-01-01T00:00:00Z"

            await conn.execute("INSERT INTO applications VALUES (?, ?, 'RetryTest', 'Dev', 'Applied', ?)", (aid, uid, now))
            await conn.execute("INSERT INTO telegram_connections VALUES ('tc1', ?, '12345', ?, 1)", (uid, now))
            await conn.execute("""
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', 0, ?, ?)
            """, (rid, uid, aid, past, now, now))
            await conn.commit()

            # Attempt 1 fails -> attempt becomes 1, next_retry_at scheduled ~5m
            with patch("app.services.reminder_service.send_telegram_message") as mock_send:
                mock_send.return_value = TelegramSendResult(False, "Rate limited 429", retryable=True)
                res = await process_due_reminders(conn)
                assert len(res) == 1
                assert res[0]["action"] == "failed_will_retry"
                assert res[0]["attempt"] == 1

            row = await conn.fetchone("SELECT attempts, status, next_retry_at FROM reminders WHERE id = ?", (rid,))
            assert row["attempts"] == 1
            assert row["status"] == "failed"

            # Simulate clock forward past next_retry_at, Attempt 2 fails -> attempt becomes 2, next_retry_at ~20m
            await conn.execute("UPDATE reminders SET next_retry_at = ?", (past,))
            with patch("app.services.reminder_service.send_telegram_message") as mock_send:
                mock_send.return_value = TelegramSendResult(False, "Timeout", retryable=True)
                res = await process_due_reminders(conn)
                assert res[0]["attempt"] == 2

            row = await conn.fetchone("SELECT attempts, status FROM reminders WHERE id = ?", (rid,))
            assert row["attempts"] == 2

            # Simulate clock forward, Attempt 3 fails -> attempt becomes 3, next_retry_at ~80m
            await conn.execute("UPDATE reminders SET next_retry_at = ?", (past,))
            with patch("app.services.reminder_service.send_telegram_message") as mock_send:
                mock_send.return_value = TelegramSendResult(False, "Gateway 502", retryable=True)
                res = await process_due_reminders(conn)
                assert res[0]["attempt"] == 3

            row = await conn.fetchone("SELECT attempts, status FROM reminders WHERE id = ?", (rid,))
            assert row["attempts"] == 3

            # Simulate clock forward, Attempt 4 fails -> max retries reached! Permanent failure
            await conn.execute("UPDATE reminders SET next_retry_at = ?", (past,))
            with patch("app.services.reminder_service.send_telegram_message") as mock_send:
                mock_send.return_value = TelegramSendResult(False, "503 Unavailable", retryable=True)
                res = await process_due_reminders(conn)
                assert res[0]["action"] == "failed_max_retries"

            row = await conn.fetchone("SELECT attempts, status, next_retry_at, error_message FROM reminders WHERE id = ?", (rid,))
            assert row["attempts"] == 4
            assert row["status"] == "failed"
            assert row["next_retry_at"] is None
            assert "Max retries (4) reached" in row["error_message"]


class TestTelegramDeliveryClassification:
    """Tests Telegram error classification into retryable vs non-retryable."""

    @pytest.mark.anyio
    async def test_missing_token_or_chat_id(self):
        with patch.object(settings, "TELEGRAM_BOT_TOKEN", None):
            res = await send_telegram_message("123", "Hello")
            assert res.success is False
            assert res.retryable is False

        with patch.object(settings, "TELEGRAM_BOT_TOKEN", "fake_token"):
            res = await send_telegram_message("", "Hello")
            assert res.success is False
            assert res.retryable is False

    @pytest.mark.anyio
    async def test_rate_limit_and_server_errors_retryable(self):
        with patch.object(settings, "TELEGRAM_BOT_TOKEN", "fake_token"):
            with patch("httpx.AsyncClient.post") as mock_post:
                # 429 Too Many Requests
                mock_post.return_value = AsyncMock(status_code=429, headers={"content-type": "application/json"}, json=lambda: {"ok": False, "description": "Too Many Requests: retry after 5"})
                res = await send_telegram_message("123", "Hello")
                assert res.success is False
                assert res.retryable is True

                # 500 Internal Server Error
                mock_post.return_value = AsyncMock(status_code=500, headers={"content-type": "application/json"}, json=lambda: {"ok": False, "description": "Internal server error"})
                res2 = await send_telegram_message("123", "Hello")
                assert res2.success is False
                assert res2.retryable is True

                # 400 Bad Request (e.g. malformed markup) -> NOT retryable
                mock_post.return_value = AsyncMock(status_code=400, headers={"content-type": "application/json"}, json=lambda: {"ok": False, "description": "Bad Request: can't parse entities"})
                res3 = await send_telegram_message("123", "Hello")
                assert res3.success is False
                assert res3.retryable is False

                # 403 Forbidden (bot blocked by student) -> NOT retryable
                mock_post.return_value = AsyncMock(status_code=403, headers={"content-type": "application/json"}, json=lambda: {"ok": False, "description": "Forbidden: bot was blocked by the user"})
                res4 = await send_telegram_message("123", "Hello")
                assert res4.success is False
                assert res4.retryable is False
