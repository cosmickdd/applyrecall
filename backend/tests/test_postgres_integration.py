import asyncio
import os
import uuid
import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
import asyncpg

from app.config import settings
from app.database import (
    PostgresConnectionWrapper,
    RecordWrapper,
    db_transaction,
    apply_migrations,
    now_iso,
    new_uuid,
    MIGRATION_ADVISORY_LOCK_ID
)
from app.services.telegram_service import TelegramSendResult
from app.services.reminder_service import (
    process_due_reminders,
    recover_stale_processing_reminders,
    TERMINAL_STATUSES
)

ADMIN_URL = os.environ.get("TEST_DATABASE_URL", "postgresql://postgres@127.0.0.1:5432/postgres")
APP_URL = "postgresql://applyrecall_app:applyrecall_secret_pw@127.0.0.1:5432/postgres"


async def check_pg_available() -> bool:
    try:
        conn = await asyncio.wait_for(asyncpg.connect(ADMIN_URL), timeout=2.0)
        await conn.close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.anyio


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def admin_conn():
    if not await check_pg_available():
        pytest.skip("PostgreSQL test database not available at " + ADMIN_URL)

    conn = await asyncpg.connect(ADMIN_URL)
    # Ensure applyrecall_app role exists
    await conn.execute("""
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'applyrecall_app') THEN
            CREATE ROLE applyrecall_app LOGIN PASSWORD 'applyrecall_secret_pw';
        END IF;
    END $$;
    GRANT CONNECT ON DATABASE postgres TO applyrecall_app;
    GRANT USAGE ON SCHEMA public TO applyrecall_app;
    """)
    # Clean up any leftover test data
    try:
        await conn.execute("""
        DELETE FROM reminders;
        DELETE FROM application_events;
        DELETE FROM application_answers;
        DELETE FROM applications;
        DELETE FROM telegram_connections;
        DELETE FROM pairing_codes;
        DELETE FROM device_connections;
        DELETE FROM answers;
        DELETE FROM projects;
        DELETE FROM experiences;
        DELETE FROM profiles;
        """)
    except Exception:
        pass
    yield conn
    await conn.close()


@pytest.fixture
async def app_conn(admin_conn):
    # Ensure permissions are granted
    await admin_conn.execute("""
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO applyrecall_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO applyrecall_app;
    """)
    conn = await asyncpg.connect(APP_URL)
    yield conn
    await conn.close()


class TestPostgresMigrations:
    """Test A: Migration Execution & Concurrency."""

    async def test_migration_execution_and_concurrency(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)

        # Apply migrations
        await apply_migrations(wrapper)

        # 1. Verify schema_migrations table exists and records rows with checksums
        rows = await admin_conn.fetch("SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;")
        assert len(rows) >= 2
        versions = [r["version"] for r in rows]
        assert "001" in versions
        assert "002" in versions
        for r in rows:
            assert r["checksum"] is not None
            assert len(r["checksum"]) == 64  # sha256 hex string

        # 2. Verify all core tables exist in PostgreSQL
        tables = await admin_conn.fetch("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' 
        ORDER BY table_name;
        """)
        table_names = {t["table_name"] for t in tables}
        expected_tables = {
            "schema_migrations", "profiles", "answers", "experiences", "projects",
            "applications", "application_answers", "application_events", "reminders",
            "device_connections", "pairing_codes", "telegram_connections", "telegram_processed_updates"
        }
        for expected in expected_tables:
            assert expected in table_names, f"Expected table {expected} was not created"

        # 3. Verify helper function get_current_user_id() exists
        fn = await admin_conn.fetchval("SELECT proname FROM pg_proc WHERE proname = 'get_current_user_id';")
        assert fn == "get_current_user_id"

        # 4. Verify RLS policies exist
        policies = await admin_conn.fetch("SELECT tablename, policyname FROM pg_policies;")
        assert len(policies) >= 11

        # 5. Test Advisory Lock Concurrency: Simulate two concurrent startups applying migrations
        conn1 = await asyncpg.connect(ADMIN_URL)
        conn2 = await asyncpg.connect(ADMIN_URL)
        try:
            w1 = PostgresConnectionWrapper(conn1)
            w2 = PostgresConnectionWrapper(conn2)
            results = await asyncio.gather(apply_migrations(w1), apply_migrations(w2), return_exceptions=True)
            for res in results:
                assert not isinstance(res, Exception), f"Concurrent migration failed with: {res}"
        finally:
            await conn1.close()
            await conn2.close()

        # 6. Verify idempotency: re-applying already-run migrations is a safe no-op
        count_before = await admin_conn.fetchval("SELECT count(*) FROM schema_migrations;")
        await apply_migrations(wrapper)
        count_after = await admin_conn.fetchval("SELECT count(*) FROM schema_migrations;")
        assert count_before == count_after


class TestPostgresTypeAdaptation:
    """Test B: Type Adaptation for PostgreSQL types (UUIDs, TIMESTAMPTZ, JSONB, scalars, nulls)."""

    async def test_uuid_and_timestamp_adaptation(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)
        
        test_uid = uuid.uuid4()
        test_app_id = uuid.uuid4()
        now_dt = datetime.now(timezone.utc)
        iso_str = now_dt.isoformat()

        # 1. First insert profile to satisfy foreign key applications_user_id_fkey
        await wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, 'Type Test User', 'type@example.com')",
            (uuid.uuid4(), test_uid)
        )

        # 2. Insert application using UUID object and ISO string
        await wrapper.execute(
            """
            INSERT INTO applications (id, user_id, company, position, status, applied_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (test_app_id, test_uid, "Acme Corp", "Backend Engineer", "Applied", iso_str, now_dt, iso_str)
        )

        # 3. Retrieve and verify via RecordWrapper
        row = await wrapper.fetchone("SELECT * FROM applications WHERE id = ?", (test_app_id,))
        assert row is not None
        assert row["id"] == str(test_app_id)
        assert row["user_id"] == str(test_uid)
        assert row["company"] == "Acme Corp"
        assert row["status"] == "Applied"
        assert isinstance(row["applied_at"], str)

        # 4. Retrieve using string UUID parameter (verifies string -> UUID adaptation in query)
        row_by_str = await wrapper.fetchone("SELECT * FROM applications WHERE id = ?", (str(test_app_id),))
        assert row_by_str is not None
        assert row_by_str["id"] == str(test_app_id)

        # Clean up
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (test_app_id,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))


class TestPostgresTransactions:
    """Test C: Transactions & Rollbacks."""

    async def test_transaction_rollback_on_failure(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)
        test_uid = uuid.uuid4()
        app_id_1 = uuid.uuid4()
        app_id_2 = uuid.uuid4()

        # Create profile to satisfy FK
        await wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, 'Tx User', 'tx@example.com')",
            (uuid.uuid4(), test_uid)
        )

        # Test Rollback
        with pytest.raises(RuntimeError):
            async with db_transaction(wrapper):
                await wrapper.execute(
                    "INSERT INTO applications (id, user_id, company, position, status) VALUES (?, ?, ?, ?, ?)",
                    (app_id_1, test_uid, "Rollback Co", "Engineer", "Applied")
                )
                raise RuntimeError("Simulated transaction failure")

        # Verify app_id_1 was not inserted
        row = await wrapper.fetchone("SELECT id FROM applications WHERE id = ?", (app_id_1,))
        assert row is None, "Transaction was not rolled back on exception!"

        # Test Successful Commit
        async with db_transaction(wrapper):
            await wrapper.execute(
                "INSERT INTO applications (id, user_id, company, position, status) VALUES (?, ?, ?, ?, ?)",
                (app_id_2, test_uid, "Commit Co", "Engineer", "Applied")
            )

        row_committed = await wrapper.fetchone("SELECT id, company FROM applications WHERE id = ?", (app_id_2,))
        assert row_committed is not None
        assert row_committed["company"] == "Commit Co"

        # Clean up
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_id_2,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))


class TestPostgresRLSIsolation:
    """Test D: Two-User Row Level Security Isolation as non-superuser."""

    async def test_two_user_rls_isolation(self, app_conn):
        # Verify app_conn is NOT superuser and has NO BYPASSRLS
        role_info = await app_conn.fetchrow(
            "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
        )
        assert role_info["rolsuper"] is False, "Test must run as non-superuser"
        assert role_info["rolbypassrls"] is False, "Test role must NOT have BYPASSRLS privilege"

        wrapper = PostgresConnectionWrapper(app_conn)

        user_a = str(uuid.uuid4())
        user_b = str(uuid.uuid4())
        app_a_id = str(uuid.uuid4())
        app_b_id = str(uuid.uuid4())
        ans_a_id = str(uuid.uuid4())
        ans_b_id = str(uuid.uuid4())

        # 1. Insert User A's data under User A's session context
        await wrapper.set_session_user(user_a)
        await wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, ?, ?)",
            (new_uuid(), user_a, "Alice Student", "alice@university.edu")
        )
        await wrapper.execute(
            "INSERT INTO applications (id, user_id, company, position, status) VALUES (?, ?, ?, ?, ?)",
            (app_a_id, user_a, "Stripe", "Backend Intern", "Applied")
        )
        await wrapper.execute(
            "INSERT INTO answers (id, user_id, question, answer, scope) VALUES (?, ?, ?, ?, ?)",
            (ans_a_id, user_a, "Why Stripe?", "I love payments infrastructure", "general")
        )

        # 2. Insert User B's data under User B's session context
        await wrapper.set_session_user(user_b)
        await wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, ?, ?)",
            (new_uuid(), user_b, "Bob Student", "bob@university.edu")
        )
        await wrapper.execute(
            "INSERT INTO applications (id, user_id, company, position, status) VALUES (?, ?, ?, ?, ?)",
            (app_b_id, user_b, "Databricks", "Data Intern", "Applied")
        )
        await wrapper.execute(
            "INSERT INTO answers (id, user_id, question, answer, scope) VALUES (?, ?, ?, ?, ?)",
            (ans_b_id, user_b, "Why Databricks?", "I love distributed computing", "general")
        )

        # 3. User A queries: must ONLY see User A's data
        await wrapper.set_session_user(user_a)

        profiles_a = await wrapper.fetchall("SELECT full_name, email FROM profiles")
        assert len(profiles_a) == 1
        assert profiles_a[0]["full_name"] == "Alice Student"

        apps_a = await wrapper.fetchall("SELECT company FROM applications")
        assert len(apps_a) == 1
        assert apps_a[0]["company"] == "Stripe"

        answers_a = await wrapper.fetchall("SELECT answer FROM answers")
        assert len(answers_a) == 1
        assert answers_a[0]["answer"] == "I love payments infrastructure"

        # 4. User A attempts to UPDATE User B's application -> 0 rows modified!
        update_result = await wrapper.execute(
            "UPDATE applications SET company = 'Hacked' WHERE id = ?",
            (app_b_id,)
        )
        assert update_result.rowcount == 0, "User A must not be able to modify User B's application!"

        # 5. User A attempts to DELETE User B's application -> 0 rows modified!
        delete_result = await wrapper.execute(
            "DELETE FROM applications WHERE id = ?",
            (app_b_id,)
        )
        assert delete_result.rowcount == 0, "User A must not be able to delete User B's application!"

        # 6. User B queries: User B's application is intact!
        await wrapper.set_session_user(user_b)
        app_b_row = await wrapper.fetchone("SELECT company FROM applications WHERE id = ?", (app_b_id,))
        assert app_b_row is not None
        assert app_b_row["company"] == "Databricks"

        # 7. Restricted Worker Context
        await wrapper.reset_contexts()
        await wrapper.set_worker_context(True)

        # Worker CANNOT read student profiles or answers
        w_profiles = await wrapper.fetchall("SELECT * FROM profiles")
        assert len(w_profiles) == 0, "Worker must NOT have access to student profiles!"

        w_answers = await wrapper.fetchall("SELECT * FROM answers")
        assert len(w_answers) == 0, "Worker must NOT have access to student answers!"

        # Worker CAN read application metadata for reminder notifications
        w_apps = await wrapper.fetchall("SELECT id, company, status FROM applications WHERE id IN (?, ?)", (app_a_id, app_b_id))
        assert len(w_apps) == 2, "Worker must have read access to applications for reminders!"

        # Worker CANNOT modify applications (PostgreSQL raises InsufficientPrivilegeError because WITH CHECK fails)
        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError):
            await wrapper.execute("UPDATE applications SET company = 'WorkerEdited' WHERE id = ?", (app_a_id,))

        # Clean up
        await wrapper.reset_contexts()
        await wrapper.set_session_user(user_a)
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_a_id,))
        await wrapper.execute("DELETE FROM answers WHERE id = ?", (ans_a_id,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (user_a,))

        await wrapper.set_session_user(user_b)
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_b_id,))
        await wrapper.execute("DELETE FROM answers WHERE id = ?", (ans_b_id,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (user_b,))


class TestPostgresWorkerConcurrency:
    """Test E: Worker Concurrency & Lease Isolation."""

    async def test_worker_concurrency_and_stale_recovery(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)
        test_uid = new_uuid()
        app_id = new_uuid()
        rem_id = new_uuid()
        now = now_iso()
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

        # Seed profile, application, telegram connection and pending reminder
        await wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, 'Worker Test User', 'worker@example.com')",
            (new_uuid(), test_uid)
        )
        chat_id = f"chat_{new_uuid()[:10]}"
        await wrapper.execute(
            "INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active) VALUES (?, ?, ?, ?, TRUE)",
            (new_uuid(), test_uid, chat_id, now)
        )
        await wrapper.execute(
            "INSERT INTO applications (id, user_id, company, position, status, applied_at) VALUES (?, ?, ?, ?, ?, ?)",
            (app_id, test_uid, "Concurrency Co", "Engineer", "Applied", now)
        )
        await wrapper.execute(
            """
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', 0, ?, ?)
            """,
            (rem_id, test_uid, app_id, past, now, now)
        )

        # 1. Process due reminders with mock telegram send
        with patch("app.services.reminder_service.send_telegram_message") as mock_send:
            mock_send.return_value = TelegramSendResult(True, "Sent OK")
            results = await process_due_reminders(wrapper, batch_size=5)

            our_results = [r for r in results if r["reminder_id"] == rem_id]
            assert len(our_results) == 1
            assert our_results[0]["action"] == "sent"

        # Verify reminder status is sent
        row = await wrapper.fetchone("SELECT status, claim_token FROM reminders WHERE id = ?", (rem_id,))
        assert row["status"] == "sent"
        assert row["claim_token"] is None

        # 2. Test Stale Recovery: Create reminder stuck in 'processing' with active lease vs expired lease
        rem_active = new_uuid()
        rem_expired = new_uuid()
        active_lease = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        expired_lease = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
        token_active = f"claim_{new_uuid()}"
        token_expired = f"claim_{new_uuid()}"

        await wrapper.execute(
            """
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, claim_token, worker_id,
                                   processing_started_at, processing_expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'processing', ?, 'worker-1', ?, ?, ?, ?)
            """,
            (rem_active, test_uid, app_id, past, token_active, now, active_lease, now, now)
        )
        await wrapper.execute(
            """
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, claim_token, worker_id,
                                   processing_started_at, processing_expires_at, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'processing', ?, 'worker-2', ?, ?, ?, ?)
            """,
            (rem_expired, test_uid, app_id, past, token_expired, past, expired_lease, past, past)
        )

        # Run stale recovery
        recovered = await recover_stale_processing_reminders(wrapper)
        assert recovered == 1, f"Expected exactly 1 expired reminder recovered, got {recovered}"

        # Verify active lease was NOT reclaimed
        row_active = await wrapper.fetchone("SELECT status, claim_token FROM reminders WHERE id = ?", (rem_active,))
        assert row_active["status"] == "processing"
        assert row_active["claim_token"] == token_active

        # Verify expired lease WAS recovered to 'pending' and claim_token cleared
        row_exp = await wrapper.fetchone("SELECT status, claim_token FROM reminders WHERE id = ?", (rem_expired,))
        assert row_exp["status"] == "pending"
        assert row_exp["claim_token"] is None

        # Clean up
        await wrapper.execute("DELETE FROM reminders WHERE id IN (?, ?, ?)", (rem_id, rem_active, rem_expired))
        await wrapper.execute("DELETE FROM telegram_connections WHERE user_id = ?", (test_uid,))
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))


class TestPostgresReminderStatusRace:
    """Test F: Reminder Application Status Race Protection."""

    async def test_terminal_status_cancels_reminder_pre_delivery(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)
        test_uid = new_uuid()
        app_id = new_uuid()
        rem_id = new_uuid()
        now = now_iso()
        past = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

        # Step 1: Insert profile, application and due reminder
        await wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, 'Race User', 'race@example.com')",
            (new_uuid(), test_uid)
        )
        chat_id = f"chat_{new_uuid()[:10]}"
        await wrapper.execute(
            "INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active) VALUES (?, ?, ?, ?, TRUE)",
            (new_uuid(), test_uid, chat_id, now)
        )
        await wrapper.execute(
            "INSERT INTO applications (id, user_id, company, position, status, applied_at) VALUES (?, ?, ?, ?, ?, ?)",
            (app_id, test_uid, "RaceTest Co", "Product Manager", "Applied", now)
        )
        await wrapper.execute(
            """
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', 0, ?, ?)
            """,
            (rem_id, test_uid, app_id, past, now, now)
        )

        # Step 2: Now simulate student updating application status to 'Offer'
        await wrapper.execute(
            "UPDATE applications SET status = 'Offer' WHERE id = ?",
            (app_id,)
        )

        # Step 3: Worker runs process_due_reminders
        with patch("app.services.reminder_service.send_telegram_message") as mock_send:
            results = await process_due_reminders(wrapper, batch_size=5)

            # Pre-delivery reload must detect terminal status 'Offer' and cancel reminder without sending Telegram
            our_results = [r for r in results if r["reminder_id"] == rem_id]
            assert len(our_results) == 1
            assert our_results[0]["action"] == "cancelled_terminal_status"
            assert our_results[0]["app_status"] == "Offer"
            mock_send.assert_not_called()

        # Verify in database: status is cancelled
        row = await wrapper.fetchone("SELECT status FROM reminders WHERE id = ?", (rem_id,))
        assert row["status"] == "cancelled"

        # Clean up
        await wrapper.execute("DELETE FROM reminders WHERE id = ?", (rem_id,))
        await wrapper.execute("DELETE FROM telegram_connections WHERE user_id = ?", (test_uid,))
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))
