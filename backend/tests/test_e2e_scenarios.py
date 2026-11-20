import asyncio
import pytest
import aiosqlite
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.config import settings
from app.database import init_db, now_iso, new_uuid

def test_full_cross_surface_workflow():
    async def _run():
        await init_db()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Authorization": f"Bearer {settings.DEFAULT_USER_ID}"}
            
            # 1. Health check
            r = await client.get("/health")
            assert r.status_code == 200
            assert r.json()["status"] == "healthy"
            
            # 2. Profile fetch (Test 1 data)
            r = await client.get("/api/profile", headers=headers)
            assert r.status_code == 200
            p_data = r.json()
            assert p_data["profile"]["first_name"] == "Alex"
            assert "Stanford" in p_data["profile"]["college"]
            
            # 3. Answer Match (Test 2: Universal answer reuse)
            r = await client.post("/api/answers/match", headers=headers, json={
                "question": "Tell us about your background and interests.",
                "company": "Acme",
                "role": "Software Engineer"
            })
            assert r.status_code == 200
            match_res = r.json()
            assert match_res["matched"] is True
            assert "Stanford University" in match_res["answer"]["answer"]
            
            # 4. Unknown question save on the go (Test 3)
            r = await client.post("/api/answers", headers=headers, json={
                "question": "What motivates you to work in an early-stage startup?",
                "answer": "I thrive on autonomy, rapid product iteration, and having a direct impact on customers.",
                "scope": "general",
                "tags": "startup,culture"
            })
            assert r.status_code == 200
            new_ans = r.json()
            assert new_ans["question"] == "What motivates you to work in an early-stage startup?"
            
            # 5. Future reuse of the newly saved answer (Test 4)
            r = await client.post("/api/answers/match", headers=headers, json={
                "question": "Why an early stage startup?",
                "company": "NextGen",
                "role": "Founding Engineer"
            })
            assert r.status_code == 200
            match_res_2 = r.json()
            assert match_res_2["matched"] is True
            assert "autonomy" in match_res_2["answer"]["answer"]
            
            # 6. Job recognition & context creation (Test 5)
            r = await client.post("/api/applications", headers=headers, json={
                "company": "Datadog",
                "position": "Infrastructure Engineer",
                "job_url": "https://datadoghq.com/careers/infra",
                "source": "Direct",
                "status": "Saved"
            })
            assert r.status_code == 200
            app_data = r.json()
            app_id = app_data["id"]
            assert app_data["company"] == "Datadog"
            
            # 7. Application submission confirmation (Test 6)
            r = await client.post(f"/api/applications/{app_id}/confirm-applied", headers=headers, json={
                "create_reminder": True,
                "reminder_days": 7
            })
            assert r.status_code == 200
            conf_data = r.json()
            assert conf_data["status"] == "Applied"
            assert conf_data["applied_at"] is not None
            
            # Check timeline events
            r = await client.get(f"/api/applications/{app_id}", headers=headers)
            assert r.status_code == 200
            app_detail = r.json()
            assert len(app_detail["events"]) >= 2
            assert len(app_detail["reminders"]) >= 1
            
            # 8. Telegram status update (Test 7)
            # Link telegram chat
            chat_id = "e2e_student_telegram"
            r_pair = await client.post("/api/auth/pair/generate", headers=headers, json={"device_type": "telegram"})
            pair_code = r_pair.json()["code"]
            
            # Simulate student sending "/link <code>"
            r_link = await client.post("/api/telegram/simulate", json={"chat_id": chat_id, "text": f"/link {pair_code}"})
            assert "successfully linked" in r_link.json()["reply"]
            
            # Student asks for summary
            r_sum = await client.post("/api/telegram/simulate", json={"chat_id": chat_id, "text": "/summary"})
            assert "applications tracked" in r_sum.json()["reply"]
            
            # Student updates Datadog status to Interview
            r_up = await client.post("/api/telegram/simulate", json={"chat_id": chat_id, "text": "Update Datadog to Interview"})
            assert "Updated Datadog" in r_up.json()["reply"]
            
            # Verify status in backend
            r_verify = await client.get(f"/api/applications/{app_id}", headers=headers)
            assert r_verify.json()["application"]["status"] == "Interview"
            
            # 9. Follow-up draft generation (Test 9)
            r_draft = await client.post(f"/api/applications/{app_id}/followup-draft", headers=headers, json={
                "hr_email": "recruiting@datadoghq.com"
            })
            assert r_draft.status_code == 200
            draft = r_draft.json()
            assert "Infrastructure Engineer" in draft["subject"]
            assert "Alex Morgan" in draft["body"]
            assert "recruiting@datadoghq.com" in draft["mailto_url"]
            assert "mail.google.com" in draft["gmail_url"]
            
            # 10. Dashboard summary and activity verification
            r_dash = await client.get("/api/dashboard/summary", headers=headers)
            assert r_dash.status_code == 200
            dash = r_dash.json()
            assert dash["total_applications"] >= 4
            assert dash["interviews"] >= 2
            assert dash["telegram_connected"] is True
            
    asyncio.run(_run())
