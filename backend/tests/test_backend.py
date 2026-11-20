import pytest
import asyncio
from app.services.matching import match_question, normalize_text
from app.services.followup import generate_followup_draft
from app.services.telegram_service import handle_telegram_text
from app.services.reminder_service import process_due_reminders, snooze_reminder
from app.database import init_db, get_db, now_iso, new_uuid
from app.config import settings
import aiosqlite

def test_init_and_seed():
    async def _run():
        await init_db()
        async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            cursor = await conn.execute("SELECT * FROM profiles WHERE user_id = ?", (settings.DEFAULT_USER_ID,))
            profile = await cursor.fetchone()
            assert profile is not None
            assert profile["full_name"] == "Alex Morgan"
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
            """, (new_uuid(), settings.DEFAULT_USER_ID, chat_id, now_iso()))
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
            """, (rejected_app_id, settings.DEFAULT_USER_ID, now, now))
            
            # 2. Add due reminder for rejected app
            rem_rejected_id = new_uuid()
            await conn.execute("""
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', ?, ?)
            """, (rem_rejected_id, settings.DEFAULT_USER_ID, rejected_app_id, past_time, now, now))
            
            # 3. Create active applied application with due reminder
            active_app_id = new_uuid()
            await conn.execute("""
            INSERT INTO applications (id, user_id, company, position, status, created_at, updated_at)
            VALUES (?, ?, 'FutureTech', 'Junior Dev', 'Applied', ?, ?)
            """, (active_app_id, settings.DEFAULT_USER_ID, now, now))
            
            rem_active_id = new_uuid()
            await conn.execute("""
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, 'follow_up', 'pending', ?, ?)
            """, (rem_active_id, settings.DEFAULT_USER_ID, active_app_id, past_time, now, now))
            
            await conn.commit()
            
            # Process reminders
            results = await process_due_reminders(conn)
            
            # Verify rejected reminder was cancelled
            cursor = await conn.execute("SELECT status FROM reminders WHERE id = ?", (rem_rejected_id,))
            row = await cursor.fetchone()
            assert row["status"] == "cancelled"
            
            # Verify active reminder was marked completed (notified)
            cursor = await conn.execute("SELECT status, sent_at FROM reminders WHERE id = ?", (rem_active_id,))
            row = await cursor.fetchone()
            assert row["status"] == "completed"
            assert row["sent_at"] is not None
            
    asyncio.run(_run())

def test_user_privacy_isolation():
    async def _run():
        await init_db()
        user_a = settings.DEFAULT_USER_ID
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
