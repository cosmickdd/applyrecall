import asyncio
import os
import uuid
import json
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, AsyncMock
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
WORKER_URL = "postgresql://applyrecall_worker:applyrecall_worker_secret_pw@127.0.0.1:5432/postgres"


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
    # Ensure migrations are applied first to ensure roles and tables exist
    wrapper = PostgresConnectionWrapper(conn)
    await apply_migrations(wrapper)

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
    conn = await asyncpg.connect(APP_URL)
    yield conn
    await conn.close()


@pytest.fixture
async def worker_conn(admin_conn):
    conn = await asyncpg.connect(WORKER_URL)
    yield conn
    await conn.close()


class TestPostgresMigrations:
    """Test A: Migration Execution, Concurrency, and Checksum Integrity."""

    async def test_migration_execution_and_concurrency(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)

        # Apply migrations
        await apply_migrations(wrapper)

        # 1. Verify schema_migrations table exists and records rows with checksums
        rows = await admin_conn.fetch("SELECT version, name, checksum FROM schema_migrations ORDER BY version ASC;")
        assert len(rows) >= 4, f"Expected at least 4 migrations, got {len(rows)}"
        versions = [r["version"] for r in rows]
        assert "001" in versions
        assert "002" in versions
        assert "003" in versions
        assert "004" in versions
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

        # 4. Verify RLS policies exist across all tables
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

    async def test_migration_checksum_tamper_detection(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)
        # Fetch the original checksum of 001
        orig = await admin_conn.fetchrow("SELECT checksum FROM schema_migrations WHERE version = '001';")
        assert orig is not None
        orig_checksum = orig["checksum"]

        # Tamper with the checksum in schema_migrations
        bogus_checksum = "a" * 64
        await admin_conn.execute("UPDATE schema_migrations SET checksum = $1 WHERE version = '001';", bogus_checksum)

        # Attempt to run apply_migrations — must fail with RuntimeError due to checksum mismatch
        try:
            with pytest.raises(RuntimeError, match="CRITICAL: Migration integrity violation"):
                await apply_migrations(wrapper)
        finally:
            # Restore the valid checksum
            await admin_conn.execute("UPDATE schema_migrations SET checksum = $1 WHERE version = '001';", orig_checksum)


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
    """Test D: Two-User Row Level Security Isolation under applyrecall_app."""

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

        # Clean up under respective sessions
        await wrapper.set_session_user(user_a)
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_a_id,))
        await wrapper.execute("DELETE FROM answers WHERE id = ?", (ans_a_id,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (user_a,))

        await wrapper.set_session_user(user_b)
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_b_id,))
        await wrapper.execute("DELETE FROM answers WHERE id = ?", (ans_b_id,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (user_b,))


class TestPostgresWorkerRoleSecurity:
    """Test E: Adversarial and Non-Spoofable Security of applyrecall_worker Role."""

    async def test_worker_role_properties_and_access_denials(self, worker_conn, app_conn):
        # 1. Verify worker role is non-superuser and has NO bypassrls
        role_info = await worker_conn.fetchrow(
            "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;"
        )
        assert role_info["rolname"] == "applyrecall_worker"
        assert role_info["rolsuper"] is False, "Worker must NOT be a superuser"
        assert role_info["rolbypassrls"] is False, "Worker must NOT have BYPASSRLS privilege"

        # 2. Worker attempts to SELECT from profiles -> InsufficientPrivilegeError
        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError, match="permission denied for table profiles"):
            await worker_conn.fetch("SELECT * FROM profiles;")

        # 3. Worker attempts to SELECT from answers -> InsufficientPrivilegeError
        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError, match="permission denied for table answers"):
            await worker_conn.fetch("SELECT * FROM answers;")

        # 4. Worker attempts to UPDATE applications -> InsufficientPrivilegeError
        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError, match="permission denied for table applications"):
            await worker_conn.execute("UPDATE applications SET company = 'Hacked';")

        # 5. Worker attempts to DELETE from applications -> InsufficientPrivilegeError
        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError, match="permission denied for table applications"):
            await worker_conn.execute("DELETE FROM applications;")

        # 6. Worker attempts to DELETE from reminders -> InsufficientPrivilegeError
        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError, match="permission denied for table reminders"):
            await worker_conn.execute("DELETE FROM reminders;")

        # 7. Non-spoofability test: Worker sets spoofable GUC flags (app.is_worker, app.is_system, app.current_user_id)
        # Even if worker tries to spoof these flags, PostgreSQL table/column privileges still deny access!
        await worker_conn.execute("SELECT set_config('app.is_worker', 'true', false);")
        await worker_conn.execute("SELECT set_config('app.is_system', 'true', false);")
        await worker_conn.execute(f"SELECT set_config('app.current_user_id', '{uuid.uuid4()}', false);")

        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError):
            await worker_conn.fetch("SELECT * FROM profiles;")

        with pytest.raises(asyncpg.exceptions.InsufficientPrivilegeError):
            await worker_conn.fetch("SELECT * FROM answers;")

    async def test_worker_positive_capabilities(self, worker_conn, app_conn):
        app_wrapper = PostgresConnectionWrapper(app_conn)
        worker_wrapper = PostgresConnectionWrapper(worker_conn)

        test_uid = str(uuid.uuid4())
        app_id = str(uuid.uuid4())
        rem_id = str(uuid.uuid4())
        chat_id = f"chat_{new_uuid()[:10]}"
        now = now_iso()
        past = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()

        # Seed data as student under app_conn
        await app_wrapper.set_session_user(test_uid)
        await app_wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, 'Worker Positive User', 'pos@example.com')",
            (new_uuid(), test_uid)
        )
        await app_wrapper.execute(
            "INSERT INTO applications (id, user_id, company, position, status, applied_at) VALUES (?, ?, ?, ?, ?, ?)",
            (app_id, test_uid, "Target Corp", "Platform Engineer", "Applied", now)
        )
        await app_wrapper.execute(
            "INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active) VALUES (?, ?, ?, ?, TRUE)",
            (new_uuid(), test_uid, chat_id, now)
        )
        await app_wrapper.execute(
            """
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', 0, ?, ?)
            """,
            (rem_id, test_uid, app_id, past, now, now)
        )

        # Worker tests its authorized capabilities:
        # 1. Read allowed application columns
        app_row = await worker_wrapper.fetchone(
            "SELECT id, company, position, status, applied_at FROM applications WHERE id = ?",
            (app_id,)
        )
        assert app_row is not None
        assert app_row["company"] == "Target Corp"
        assert app_row["position"] == "Platform Engineer"

        # 2. Read telegram_connections
        tc_row = await worker_wrapper.fetchone(
            "SELECT chat_id FROM telegram_connections WHERE user_id = ? AND is_active = TRUE",
            (test_uid,)
        )
        assert tc_row is not None
        assert tc_row["chat_id"] == chat_id

        # 3. Process due reminders through worker
        with patch("app.services.reminder_service.send_telegram_message") as mock_send:
            mock_send.return_value = TelegramSendResult(True, "Sent OK")
            results = await process_due_reminders(worker_wrapper, batch_size=5)

            our = [r for r in results if r["reminder_id"] == rem_id]
            assert len(our) == 1
            assert our[0]["action"] == "sent"

        # Clean up as student
        await app_wrapper.set_session_user(test_uid)
        await app_wrapper.execute("DELETE FROM reminders WHERE id = ?", (rem_id,))
        await app_wrapper.execute("DELETE FROM telegram_connections WHERE user_id = ?", (test_uid,))
        await app_wrapper.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        await app_wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))


class TestPostgresWorkerConcurrency:
    """Test F: True Worker Concurrency & Lease Isolation."""

    async def test_two_workers_concurrent_claiming(self, admin_conn):
        app_wrapper = PostgresConnectionWrapper(admin_conn)
        test_uid = new_uuid()
        app_id = new_uuid()
        now = now_iso()
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

        # Seed profile, telegram, application
        await app_wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, 'Concurrent User', 'c@example.com')",
            (new_uuid(), test_uid)
        )
        chat_id = f"chat_{new_uuid()[:10]}"
        await app_wrapper.execute(
            "INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active) VALUES (?, ?, ?, ?, TRUE)",
            (new_uuid(), test_uid, chat_id, now)
        )
        await app_wrapper.execute(
            "INSERT INTO applications (id, user_id, company, position, status, applied_at) VALUES (?, ?, ?, ?, ?, ?)",
            (app_id, test_uid, "Scale Corp", "Engineer", "Applied", now)
        )

        # Seed 6 pending reminders
        rem_ids = []
        for i in range(6):
            r_id = new_uuid()
            rem_ids.append(r_id)
            await app_wrapper.execute(
                """
                INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, attempts, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'follow_up', 'pending', 0, ?, ?)
                """,
                (r_id, test_uid, app_id, past, now, now)
            )

        # Establish two distinct worker connections
        w_conn1 = await asyncpg.connect(WORKER_URL)
        w_conn2 = await asyncpg.connect(WORKER_URL)
        w1_wrapper = PostgresConnectionWrapper(w_conn1)
        w2_wrapper = PostgresConnectionWrapper(w_conn2)

        try:
            with patch("app.services.reminder_service.send_telegram_message") as mock_send:
                mock_send.return_value = TelegramSendResult(True, "Delivered")

                # Concurrently run both workers
                res1, res2 = await asyncio.gather(
                    process_due_reminders(w1_wrapper, batch_size=6),
                    process_due_reminders(w2_wrapper, batch_size=6)
                )

                all_processed = res1 + res2
                our_processed = [r for r in all_processed if r["reminder_id"] in rem_ids]

                # Verify exactly 6 reminders were processed in total across both workers
                assert len(our_processed) == 6

                # Verify each reminder ID was processed exactly ONCE (zero duplicate sends)
                processed_ids = [r["reminder_id"] for r in our_processed]
                assert len(set(processed_ids)) == 6
                for r in our_processed:
                    assert r["action"] == "sent"
        finally:
            await w_conn1.close()
            await w_conn2.close()

            # Clean up
            await app_wrapper.execute("DELETE FROM reminders WHERE user_id = ?", (test_uid,))
            await app_wrapper.execute("DELETE FROM telegram_connections WHERE user_id = ?", (test_uid,))
            await app_wrapper.execute("DELETE FROM applications WHERE id = ?", (app_id,))
            await app_wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))

    async def test_stale_recovery_and_active_lease_protection(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)
        test_uid = new_uuid()
        app_id = new_uuid()
        now = now_iso()
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()

        await wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, 'Recovery User', 'rec@example.com')",
            (new_uuid(), test_uid)
        )
        await wrapper.execute(
            "INSERT INTO applications (id, user_id, company, position, status, applied_at) VALUES (?, ?, ?, ?, ?, ?)",
            (app_id, test_uid, "Stale Co", "Engineer", "Applied", now)
        )

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
        await wrapper.execute("DELETE FROM reminders WHERE id IN (?, ?)", (rem_active, rem_expired))
        await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_id,))
        await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))


class TestPostgresReminderStatusRace:
    """Test G: Controlled Mid-Flight Status Race Protection."""

    @pytest.mark.parametrize("terminal_status", ["Offer", "Rejected", "Withdrawn"])
    async def test_mid_flight_terminal_status_cancels_reminder_pre_delivery(self, admin_conn, terminal_status):
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
            (app_id, test_uid, "Terminal Race Co", "Senior Dev", "Applied", now)
        )
        await wrapper.execute(
            """
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', 0, ?, ?)
            """,
            (rem_id, test_uid, app_id, past, now, now)
        )

        # Hook that simulates student updating the application status mid-flight (after claim, before delivery)
        async def mid_flight_hook(reminder_id, claim_token):
            # Student updates application to terminal status
            student_conn = await asyncpg.connect(ADMIN_URL)
            try:
                await student_conn.execute(
                    "UPDATE applications SET status = $1 WHERE id = $2",
                    terminal_status, uuid.UUID(app_id)
                )
            finally:
                await student_conn.close()

        # Connect worker
        w_conn = await asyncpg.connect(WORKER_URL)
        w_wrapper = PostgresConnectionWrapper(w_conn)

        try:
            with patch("app.services.reminder_service.send_telegram_message") as mock_send:
                results = await process_due_reminders(w_wrapper, batch_size=5, pre_delivery_hook=mid_flight_hook)

                # Pre-delivery reload must detect terminal status and cancel reminder WITHOUT dispatching to Telegram
                our_results = [r for r in results if r["reminder_id"] == rem_id]
                assert len(our_results) == 1
                assert our_results[0]["action"] == "cancelled_terminal_status"
                assert our_results[0]["app_status"] == terminal_status
                mock_send.assert_not_called()

            # Verify in database: status is cancelled
            row = await wrapper.fetchone("SELECT status, claim_token FROM reminders WHERE id = ?", (rem_id,))
            assert row["status"] == "cancelled"
            assert row["claim_token"] is None
        finally:
            await w_conn.close()
            # Clean up
            await wrapper.execute("DELETE FROM reminders WHERE id = ?", (rem_id,))
            await wrapper.execute("DELETE FROM telegram_connections WHERE user_id = ?", (test_uid,))
            await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_id,))
            await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))

    async def test_mid_flight_non_terminal_status_proceeds_to_delivery(self, admin_conn):
        wrapper = PostgresConnectionWrapper(admin_conn)
        test_uid = new_uuid()
        app_id = new_uuid()
        rem_id = new_uuid()
        now = now_iso()
        past = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()

        await wrapper.execute(
            "INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, 'Non-Terminal User', 'nonterm@example.com')",
            (new_uuid(), test_uid)
        )
        chat_id = f"chat_{new_uuid()[:10]}"
        await wrapper.execute(
            "INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active) VALUES (?, ?, ?, ?, TRUE)",
            (new_uuid(), test_uid, chat_id, now)
        )
        await wrapper.execute(
            "INSERT INTO applications (id, user_id, company, position, status, applied_at) VALUES (?, ?, ?, ?, ?, ?)",
            (app_id, test_uid, "Active Application Co", "Frontend Dev", "Applied", now)
        )
        await wrapper.execute(
            """
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', 0, ?, ?)
            """,
            (rem_id, test_uid, app_id, past, now, now)
        )

        # Hook that simulates student updating to another non-terminal status ('Interview')
        async def non_terminal_hook(reminder_id, claim_token):
            student_conn = await asyncpg.connect(ADMIN_URL)
            try:
                await student_conn.execute(
                    "UPDATE applications SET status = 'Interview' WHERE id = $1",
                    uuid.UUID(app_id)
                )
            finally:
                await student_conn.close()

        w_conn = await asyncpg.connect(WORKER_URL)
        w_wrapper = PostgresConnectionWrapper(w_conn)

        try:
            with patch("app.services.reminder_service.send_telegram_message") as mock_send:
                mock_send.return_value = TelegramSendResult(True, "Delivered")
                results = await process_due_reminders(w_wrapper, batch_size=5, pre_delivery_hook=non_terminal_hook)

                our_results = [r for r in results if r["reminder_id"] == rem_id]
                assert len(our_results) == 1
                assert our_results[0]["action"] == "sent"
                mock_send.assert_called_once()

            # Verify in database: status is sent
            row = await wrapper.fetchone("SELECT status, claim_token FROM reminders WHERE id = ?", (rem_id,))
            assert row["status"] == "sent"
            assert row["claim_token"] is None
        finally:
            await w_conn.close()
            # Clean up
            await wrapper.execute("DELETE FROM reminders WHERE id = ?", (rem_id,))
            await wrapper.execute("DELETE FROM telegram_connections WHERE user_id = ?", (test_uid,))
            await wrapper.execute("DELETE FROM applications WHERE id = ?", (app_id,))
            await wrapper.execute("DELETE FROM profiles WHERE user_id = ?", (test_uid,))
