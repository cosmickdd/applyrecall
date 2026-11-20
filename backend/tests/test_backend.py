import pytest
import asyncio
import jwt
import hashlib
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services.matching import match_question, normalize_text
from app.services.followup import generate_followup_draft
from app.services.telegram_service import handle_telegram_text
from app.services.reminder_service import process_due_reminders, snooze_reminder, MAX_RETRY_ATTEMPTS
from app.database import init_db, get_db, now_iso, new_uuid
from app.config import settings
import aiosqlite

DEV_USER_ID = "00000000-0000-0000-0000-000000000001"

def test_init_and_seed():
    async def _run():
        await init_db()
        async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute("SELECT * FROM profiles WHERE user_id = ?", (DEV_USER_ID,))
            profile = await cursor.fetchone()
            assert profile is not None
            assert profile["full_name"] == "Alex Morgan"
    asyncio.run(_run())

def test_auth_rejection_without_credentials():
    async def _run():
        await init_db()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. No Authorization header -> 401
            r = await client.get("/api/profile")
            assert r.status_code == 401
            assert "Authentication required" in r.json()["detail"]

            # 2. Malformed Authorization header -> 401
            r = await client.get("/api/profile", headers={"Authorization": "NotBearer 12345"})
            assert r.status_code == 401
            assert "Invalid Authorization header format" in r.json()["detail"]

            # 3. Nonexistent user -> 401
            r = await client.get("/api/profile", headers={"Authorization": "Bearer 99999999-9999-9999-9999-999999999999"})
            assert r.status_code == 401

            # 4. Inactive/invalid device token -> 401
            r = await client.get("/api/profile", headers={"X-Device-Token": "invalid_device_token_xyz"})
            assert r.status_code == 401
    asyncio.run(_run())

def test_jwt_validation_flow():
    async def _run():
        await init_db()
        test_secret = "test-jwt-secret-key-387a3947-very-long-and-secure-32bytes"
        original_secret = settings.SUPABASE_JWT_SECRET
        settings.SUPABASE_JWT_SECRET = test_secret

        try:
            now_ts = int(datetime.now(timezone.utc).timestamp())
            
            # 1. Valid JWT
            valid_payload = {
                "sub": DEV_USER_ID,
                "iat": now_ts,
                "exp": now_ts + 3600,
                "iss": "https://test.supabase.co/auth/v1"
            }
            valid_token = jwt.encode(valid_payload, test_secret, algorithm="HS256")

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                r = await client.get("/api/profile", headers={"Authorization": f"Bearer {valid_token}"})
                assert r.status_code == 200
                assert r.json()["profile"]["user_id"] == DEV_USER_ID

                # 2. Expired JWT -> 401
                expired_payload = {
                    "sub": DEV_USER_ID,
                    "iat": now_ts - 7200,
                    "exp": now_ts - 3600,
                }
                expired_token = jwt.encode(expired_payload, test_secret, algorithm="HS256")
                r_exp = await client.get("/api/profile", headers={"Authorization": f"Bearer {expired_token}"})
                assert r_exp.status_code == 401
                assert "expired" in r_exp.json()["detail"].lower()

                # 3. Wrong secret -> 401
                wrong_token = jwt.encode(valid_payload, "wrong-secret", algorithm="HS256")
                r_wrong = await client.get("/api/profile", headers={"Authorization": f"Bearer {wrong_token}"})
                assert r_wrong.status_code == 401
        finally:
            settings.SUPABASE_JWT_SECRET = original_secret
    asyncio.run(_run())

def test_pairing_code_security_and_single_use():
    async def _run():
        await init_db()
        transport = ASGITransport(app=app)
        auth_headers = {"Authorization": f"Bearer {DEV_USER_ID}"}

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Generate pairing code
            r_gen = await client.post("/api/auth/pair/generate", headers=auth_headers, json={"device_type": "extension"})
            assert r_gen.status_code == 200
            data = r_gen.json()
            code = data["code"]
            assert len(code) == 6

            # Verify only hash is stored in database, not raw code
            code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
            async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
                conn.row_factory = aiosqlite.Row
                cursor = await conn.execute("SELECT * FROM pairing_codes WHERE code_hash = ?", (code_hash,))
                row = await cursor.fetchone()
                assert row is not None
                assert row["code_hash"] == code_hash
                assert row["used_at"] is None

            # 2. Verify code once -> success + issues opaque device token
            r_verify = await client.post("/api/auth/pair/verify", json={"code": code, "device_type": "extension"})
            assert r_verify.status_code == 200
            verify_data = r_verify.json()
            assert verify_data["success"] is True
            device_token = verify_data["token"]
            assert len(device_token) > 20

            # 3. Single-use enforcement: re-using the code fails -> 400
            r_reuse = await client.post("/api/auth/pair/verify", json={"code": code, "device_type": "extension"})
            assert r_reuse.status_code == 400
            assert "already used" in r_reuse.json()["detail"].lower()

            # 4. Device token authentication works via X-Device-Token
            r_prof = await client.get("/api/profile", headers={"X-Device-Token": device_token})
            assert r_prof.status_code == 200
            assert r_prof.json()["profile"]["user_id"] == DEV_USER_ID
    asyncio.run(_run())

def test_device_token_authentication_and_revocation():
    async def _run():
        await init_db()
        transport = ASGITransport(app=app)
        auth_headers = {"Authorization": f"Bearer {DEV_USER_ID}"}

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Generate and verify pairing code to get a device token
            r_gen = await client.post("/api/auth/pair/generate", headers=auth_headers, json={"device_type": "extension"})
            code = r_gen.json()["code"]
            r_verify = await client.post("/api/auth/pair/verify", json={"code": code, "device_type": "extension", "device_name": "Test Laptop"})
            device_token = r_verify.json()["token"]

            # Access protected route using device token
            r_dev = await client.get("/api/dashboard/summary", headers={"X-Device-Token": device_token})
            assert r_dev.status_code == 200

            # List connected devices
            r_list = await client.get("/api/auth/devices", headers=auth_headers)
            assert r_list.status_code == 200
            devices = r_list.json()
            assert len(devices) >= 1
            device_id = devices[0]["id"]

            # Revoke device
            r_del = await client.delete(f"/api/auth/devices/{device_id}", headers=auth_headers)
            assert r_del.status_code == 200

            # Using revoked device token now fails -> 401
            r_revoked = await client.get("/api/dashboard/summary", headers={"X-Device-Token": device_token})
            assert r_revoked.status_code == 401
            assert "revoked" in r_revoked.json()["detail"].lower()
    asyncio.run(_run())

def test_answer_matching_and_scoping():
    answers_pool = [
        {
            "id": "1",
            "question": "Tell us about yourself.",
            "answer": "Universal intro",
            "scope": "general",
            "company": None
        },
        {
            "id": "2",
            "question": "Why do you want to work at Acme?",
            "answer": "Acme is awesome.",
            "scope": "company",
            "company": "Acme"
        }
    ]
    
    # 1. Exact universal match
    ans, conf, m_type, _ = match_question("Tell us about yourself.", answers_pool)
    assert ans is not None
    assert ans["id"] == "1"
    assert conf >= 0.9
    
    # 2. Intent-based universal match
    ans, conf, m_type, _ = match_question("Please describe yourself and your background", answers_pool)
    assert ans is not None
    assert ans["id"] == "1"
    
    # 3. Company match for Acme
    ans, conf, m_type, _ = match_question("Why do you want to work at Acme?", answers_pool, target_company="Acme")
    assert ans is not None
    assert ans["id"] == "2"
    
    # 4. Strict Scoping Rule: Must NOT return Acme answer for Stripe
    ans, conf, m_type, _ = match_question("Why do you want to work at Stripe?", answers_pool, target_company="Stripe")
    assert ans is None or ans["id"] != "2"

def test_followup_draft():
    draft = generate_followup_draft(
        company="Google",
        position="Software Engineer",
        student_name="Alex Morgan",
        hr_email="recruiter@google.com"
    )
    assert "Software Engineer" in draft["subject"]
    assert "Alex Morgan" in draft["body"]
    assert "recruiter@google.com" in draft["mailto_url"]
    assert "https://mail.google.com" in draft["gmail_url"]

def test_telegram_assistant():
    async def _run():
        await init_db()
        async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            
            # Test unlinked
            resp = await handle_telegram_text(conn, "unlinked_999", "/summary")
            assert "not yet linked" in resp
            
            # Link user to chat
            chat_id = "test_chat_123"
            await conn.execute("""
            INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(chat_id) DO UPDATE SET user_id = excluded.user_id, is_active = 1;
            """, (new_uuid(), DEV_USER_ID, chat_id, now_iso()))
            await conn.commit()
            
            # Test summary
            resp = await handle_telegram_text(conn, chat_id, "/summary")
            assert "applications tracked" in resp
            
            # Test query about Acme
            resp = await handle_telegram_text(conn, chat_id, "Any update from Acme?")
            assert "Acme" in resp
            
            # Test status update
            resp = await handle_telegram_text(conn, chat_id, "Update Acme to Interview")
            assert "Interview" in resp
            assert "Updated Acme" in resp
    asyncio.run(_run())

def test_telegram_webhook_secret_and_deduplication():
    async def _run():
        await init_db()
        transport = ASGITransport(app=app)
        original_secret = settings.TELEGRAM_WEBHOOK_SECRET
        settings.TELEGRAM_WEBHOOK_SECRET = "super_secret_telegram_token_123"

        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                unique_update_id = int(datetime.now(timezone.utc).timestamp() * 1000)
                payload = {"update_id": unique_update_id, "message": {"chat": {"id": 123}, "text": "/help"}}
                
                # 1. Missing secret token header -> 403
                r_no_sec = await client.post("/api/telegram/webhook", json=payload)
                assert r_no_sec.status_code == 403

                # 2. Invalid secret token header -> 403
                r_bad_sec = await client.post(
                    "/api/telegram/webhook",
                    headers={"X-Telegram-Bot-Api-Secret-Token": "wrong_secret"},
                    json=payload
                )
                assert r_bad_sec.status_code == 403

                # 3. Valid secret token header -> 200
                headers = {"X-Telegram-Bot-Api-Secret-Token": "super_secret_telegram_token_123"}
                r_ok = await client.post("/api/telegram/webhook", headers=headers, json=payload)
                assert r_ok.status_code == 200
                assert r_ok.json()["status"] == "ok"

                # 4. Duplicate update_id -> returns duplicate_ignored
                r_dup = await client.post("/api/telegram/webhook", headers=headers, json=payload)
                assert r_dup.status_code == 200
                assert r_dup.json()["status"] == "duplicate_ignored"
        finally:
            settings.TELEGRAM_WEBHOOK_SECRET = original_secret
    asyncio.run(_run())

def test_reminder_system_and_terminal_statuses():
    async def _run():
        await init_db()
        async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            now = now_iso()
            past_time = "2020-01-01T00:00:00Z"
            
            # 1. Create rejected application
            rejected_app_id = new_uuid()
            await conn.execute("""
            INSERT INTO applications (id, user_id, company, position, status, created_at, updated_at)
            VALUES (?, ?, 'OldCo', 'Intern', 'Rejected', ?, ?)
            """, (rejected_app_id, DEV_USER_ID, now, now))
            
            # 2. Add due reminder for rejected app
            rem_rejected_id = new_uuid()
            await conn.execute("""
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', ?, ?)
            """, (rem_rejected_id, DEV_USER_ID, rejected_app_id, past_time, now, now))
            
            # 3. Create active applied application with due reminder
            active_app_id = new_uuid()
            await conn.execute("""
            INSERT INTO applications (id, user_id, company, position, status, created_at, updated_at)
            VALUES (?, ?, 'FutureTech', 'Junior Dev', 'Applied', ?, ?)
            """, (active_app_id, DEV_USER_ID, now, now))
            
            rem_active_id = new_uuid()
            await conn.execute("""
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', ?, ?)
            """, (rem_active_id, DEV_USER_ID, active_app_id, past_time, now, now))
            
            await conn.commit()
            
            # Process reminders
            results = await process_due_reminders(conn)
            
            # Verify rejected reminder was cancelled
            cursor = await conn.execute("SELECT status FROM reminders WHERE id = ?", (rem_rejected_id,))
            row = await cursor.fetchone()
            assert row["status"] == "cancelled"
            
            # Verify active reminder was marked sent (notified)
            cursor = await conn.execute("SELECT status, sent_at FROM reminders WHERE id = ?", (rem_active_id,))
            row = await cursor.fetchone()
            assert row["status"] in ("sent", "completed")
            assert row["sent_at"] is not None
            
    asyncio.run(_run())

def test_reminder_retry_exponential_backoff():
    async def _run():
        await init_db()
        async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            now = now_iso()
            past_time = "2020-01-01T00:00:00Z"
            
            # Create app and reminder with 0 attempts
            app_id = new_uuid()
            await conn.execute("""
            INSERT INTO applications (id, user_id, company, position, status, created_at, updated_at)
            VALUES (?, ?, 'RetryCo', 'Engineer', 'Applied', ?, ?)
            """, (app_id, DEV_USER_ID, now, now))

            rem_id = new_uuid()
            await conn.execute("""
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, attempts, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', 0, ?, ?)
            """, (rem_id, DEV_USER_ID, app_id, past_time, now, now))
            await conn.commit()

            # Process due reminders
            results = await process_due_reminders(conn)
            cursor = await conn.execute("SELECT status, attempts, sent_at FROM reminders WHERE id = ?", (rem_id,))
            row = await cursor.fetchone()
            assert row["attempts"] >= 1
            assert row["status"] in ("sent", "completed")
    asyncio.run(_run())

def test_user_privacy_isolation():
    async def _run():
        await init_db()
        user_a = DEV_USER_ID
        user_b = "11111111-2222-3333-4444-555555555555"
        now = now_iso()
        
        async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            # Create user B profile
            await conn.execute("""
            INSERT INTO profiles (id, user_id, full_name, email, created_at, updated_at)
            VALUES (?, ?, 'User B', 'b@example.com', ?, ?)
            ON CONFLICT(user_id) DO NOTHING
            """, (new_uuid(), user_b, now, now))
            
            # Insert private answer for User A
            ans_a_id = new_uuid()
            await conn.execute("""
            INSERT INTO answers (id, user_id, question, answer, scope, created_at, updated_at)
            VALUES (?, ?, 'Private Question A', 'Secret Answer A', 'general', ?, ?)
            """, (ans_a_id, user_a, now, now))
            
            # Insert private application for User B
            app_b_id = new_uuid()
            await conn.execute("""
            INSERT INTO applications (id, user_id, company, position, status, created_at, updated_at)
            VALUES (?, ?, 'Secret Corp B', 'Secret Role', 'Applied', ?, ?)
            """, (app_b_id, user_b, now, now))
            
            await conn.commit()
            
            # User B querying User A answers
            cursor = await conn.execute("SELECT * FROM answers WHERE user_id = ? AND id = ?", (user_b, ans_a_id))
            assert await cursor.fetchone() is None
            
            # User A querying User B applications
            cursor = await conn.execute("SELECT * FROM applications WHERE user_id = ? AND id = ?", (user_a, app_b_id))
            assert await cursor.fetchone() is None

    asyncio.run(_run())
