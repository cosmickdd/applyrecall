import hashlib
import re
import httpx
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, Optional, List, Tuple
from app.config import settings
from app.database import now_iso, new_uuid, db_transaction
from app.services.followup import generate_followup_draft

TELEGRAM_API_BASE = "https://api.telegram.org/bot"

class TelegramSendResult(tuple):
    """
    Subclasses 2-tuple (success, detail) so existing code:
      sent, detail = await send_telegram_message(...)
    continues to work without any modification, while also exposing:
      result.retryable
      result.message_id
    """
    def __new__(cls, success: bool, detail: str, retryable: bool = False, message_id: Optional[int] = None):
        instance = super(TelegramSendResult, cls).__new__(cls, (success, detail))
        instance.success = success
        instance.detail = detail
        instance.retryable = retryable
        instance.message_id = message_id
        return instance


async def send_telegram_message(
    chat_id: str,
    text: str,
    reply_markup: Optional[Dict[str, Any]] = None,
    parse_mode: Optional[str] = "HTML"
) -> TelegramSendResult:
    """
    Sends a message via the official Telegram Bot API.
    Returns TelegramSendResult (subclasses tuple: (success: bool, detail: str)).
    Never simulates success when token is missing.
    Correctly classifies errors into retryable (429, 5xx, timeout) vs non-retryable (400, 401, 403).
    """
    if not settings.TELEGRAM_BOT_TOKEN:
        return TelegramSendResult(False, "TELEGRAM_BOT_TOKEN is not configured on the server.", retryable=False)

    if not chat_id or not str(chat_id).strip():
        return TelegramSendResult(False, "Missing recipient chat_id.", retryable=False)
        
    url = f"{TELEGRAM_API_BASE}{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": str(chat_id),
        "text": text,
        "parse_mode": parse_mode
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup
        
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            
            if resp.status_code == 200 and data.get("ok") is True:
                msg_id = data.get("result", {}).get("message_id")
                return TelegramSendResult(True, "Message delivered successfully.", retryable=False, message_id=msg_id)
            
            error_desc = data.get("description", f"Telegram API error {resp.status_code}")
            
            # Rate limited or server errors are retryable
            if resp.status_code == 429 or resp.status_code in (500, 502, 503, 504):
                return TelegramSendResult(False, f"Telegram API error {resp.status_code}: {error_desc}", retryable=True)
                
            # Client errors (400 bad request, 401 unauthorized, 403 bot blocked) are NOT retryable
            return TelegramSendResult(False, f"Telegram API error {resp.status_code}: {error_desc}", retryable=False)
    except (httpx.TimeoutException, httpx.NetworkError, httpx.ConnectError) as e:
        return TelegramSendResult(False, f"Telegram network error: {str(e)}", retryable=True)
    except Exception as e:
        return TelegramSendResult(False, f"Telegram unexpected error: {str(e)}", retryable=False)

async def get_user_by_chat_id(conn, chat_id: str) -> Optional[str]:
    cursor = await conn.execute(
        "SELECT user_id FROM telegram_connections WHERE chat_id = ? AND is_active = TRUE",
        (str(chat_id),)
    )
    row = await cursor.fetchone()
    return str(row["user_id"]) if row else None

async def handle_telegram_text(conn, chat_id: str, text: str) -> str:
    """
    Parses and handles Telegram conversational commands and queries.
    Friendly, short, informative and direct.
    Enforces authenticated user RLS context for all student queries and updates.
    """
    clean_text = text.strip()
    user_id = await get_user_by_chat_id(conn, chat_id)
    if user_id and hasattr(conn, "set_session_user"):
        await conn.set_session_user(user_id)
    
    # 1. Unauthenticated commands
    if clean_text.startswith("/start"):
        if user_id:
            return (
                "👋 <b>Welcome back to ApplyRecall!</b>\n\n"
                "Your account is connected. You can ask me:\n"
                "• <i>\"What's happening with my applications?\"</i>\n"
                "• <i>\"Any update from Acme?\"</i>\n"
                "• <i>\"Update Acme to interview\"</i>\n"
                "• <i>\"Draft a follow-up for Acme\"</i>\n"
                "• <i>\"Show my interviews\"</i>"
            )
        return (
            "👋 <b>Welcome to ApplyRecall!</b>\n\n"
            "I'm your personal job application assistant.\n\n"
            "To connect your account, open your ApplyRecall dashboard settings, "
            "generate a one-time Telegram pairing code, and send it here:\n\n"
            "<code>/link YOUR_CODE</code>"
        )
        
    if clean_text.startswith("/help"):
        return (
            "📌 <b>ApplyRecall Bot Commands</b>\n\n"
            "/summary - Application status overview\n"
            "/applications - List all active applications\n"
            "/reminders - Check pending follow-up reminders\n"
            "/link &lt;code&gt; - Connect your dashboard account\n\n"
            "<b>Conversational actions:</b>\n"
            "• <i>\"Any update from [Company]?\"</i>\n"
            "• <i>\"Update [Company] to [Status]\"</i>\n"
            "• <i>\"Draft a follow-up for [Company]\"</i>\n"
            "• <i>\"Remind me about [Company] tomorrow\"</i>"
        )

    if clean_text.startswith("/link"):
        parts = clean_text.split()
        if len(parts) < 2:
            return "Please provide your one-time code: <code>/link YOUR_CODE</code>"
        code = parts[1].strip().upper()
        code_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        
        # Verify code using the hash atomically
        cursor = await conn.execute(
            "SELECT id, user_id, expires_at, used_at FROM pairing_codes WHERE code_hash = ? AND device_type = 'telegram' AND used_at IS NULL",
            (code_hash,)
        )
        pairing = await cursor.fetchone()

        if not pairing:
            return "❌ Invalid or unrecognized code. Please generate a new pairing code from your Dashboard Settings."
            
        now_dt = datetime.now(timezone.utc)
        expires_dt = datetime.fromisoformat(pairing["expires_at"].replace("Z", "+00:00"))
        if now_dt > expires_dt:
            return "⚠️ This pairing code has expired. Please generate a new one from your dashboard."
            
        matched_user_id = str(pairing["user_id"])
        if hasattr(conn, "set_session_user"):
            await conn.set_session_user(matched_user_id)
        now = now_iso()
        
        # Mark code used atomically and bind telegram connection in a single transaction
        async with db_transaction(conn):
            result = await conn.execute(
                "UPDATE pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL",
                (now, pairing["id"])
            )
            if result.rowcount == 0:
                return "❌ This code has already been used. Please generate a fresh code from your dashboard."
            
            # Insert or update telegram connection
            await conn.execute("""
            INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active)
            VALUES (?, ?, ?, ?, TRUE)
            ON CONFLICT(chat_id) DO UPDATE SET user_id = excluded.user_id, is_active = TRUE, connected_at = excluded.connected_at;
            """, (new_uuid(), matched_user_id, str(chat_id), now))
        
        return "✅ <b>Account successfully linked!</b>\nApplyRecall is now connected to your personal application memory."

    # If user is not linked, reject other commands
    if not user_id:
        return (
            "🔒 Your Telegram is not yet linked to an ApplyRecall account.\n\n"
            "Generate a code from your <b>Web Dashboard > Settings</b> and send:\n"
            "<code>/link YOUR_CODE</code>"
        )

    # 2. Summary request
    lower_text = clean_text.lower()
    if clean_text.startswith("/summary") or "what's happening" in lower_text or "summary" in lower_text or "pending" in lower_text or "how many" in lower_text:
        cursor = await conn.execute(
            "SELECT status, count(*) as count FROM applications WHERE user_id = ? GROUP BY status",
            (user_id,)
        )
        rows = await cursor.fetchall()
        counts = {r["status"]: r["count"] for r in rows}
        total = sum(counts.values())
        
        awaiting = counts.get("Applied", 0) + counts.get("Saved", 0)
        interviews = counts.get("Interview", 0)
        rejected = counts.get("Rejected", 0)
        offers = counts.get("Offer", 0)
        
        # Pending reminders
        now_time = now_iso()
        cursor = await conn.execute(
            "SELECT count(*) as due_count FROM reminders WHERE user_id = ? AND status = 'pending' AND reminder_at <= ?",
            (user_id, now_time)
        )
        due_row = await cursor.fetchone()
        due_followups = due_row["due_count"] if due_row else 0
        
        return (
            f"Here's your current application summary.\n\n"
            f"<b>{total}</b> applications tracked.\n\n"
            f"• <b>{awaiting}</b> awaiting responses\n"
            f"• <b>{interviews}</b> interviews\n"
            f"• <b>{rejected}</b> rejected\n"
            f"• <b>{offers}</b> offers\n\n"
            f"You have <b>{due_followups}</b> follow-ups due."
        )

    # 3. List applications
    if clean_text.startswith("/applications") or "what applications" in lower_text or "list applications" in lower_text:
        cursor = await conn.execute(
            "SELECT company, position, status, applied_at FROM applications WHERE user_id = ? ORDER BY created_at DESC LIMIT 10",
            (user_id,)
        )
        apps = await cursor.fetchall()
        if not apps:
            return "You haven't saved any applications yet. Open a job in Chrome to save one!"
            
        lines = ["<b>Your recent applications:</b>\n"]
        for a in apps:
            lines.append(f"• <b>{a['company']}</b> — {a['position']} (<i>{a['status']}</i>)")
        return "\n".join(lines)

    # 4. Show interviews
    if "interview" in lower_text and ("show" in lower_text or "what" in lower_text or "my" in lower_text):
        cursor = await conn.execute(
            "SELECT company, position, notes FROM applications WHERE user_id = ? AND status = 'Interview'",
            (user_id,)
        )
        apps = await cursor.fetchall()
        if not apps:
            return "No interviews currently scheduled. Keep going!"
        lines = ["🎯 <b>Your active interviews:</b>\n"]
        for a in apps:
            lines.append(f"• <b>{a['company']}</b> — {a['position']}")
            if a["notes"]:
                lines.append(f"  <i>Note: {a['notes']}</i>")
        return "\n".join(lines)

    # 5. Check reminders
    if clean_text.startswith("/reminders") or "follow up on today" in lower_text or "reminders" in lower_text:
        cursor = await conn.execute("""
        SELECT r.id, r.reminder_at, a.company, a.position 
        FROM reminders r
        JOIN applications a ON r.application_id = a.id
        WHERE r.user_id = ? AND r.status = 'pending'
        ORDER BY r.reminder_at ASC LIMIT 5
        """, (user_id,))
        reminders = await cursor.fetchall()
        if not reminders:
            return "🎉 Nothing needs your attention right now! No pending follow-up reminders."
            
        lines = ["⏰ <b>Upcoming Follow-ups:</b>\n"]
        for r in reminders:
            dt = r["reminder_at"][:10]
            lines.append(f"• <b>{r['company']}</b> ({r['position']}) — Due: {dt}")
        return "\n".join(lines)

    # 6. Status update query: e.g. "Update Acme to interview" or "Update Razorpay to Interview"
    update_match = re.search(r"update\s+(.+?)\s+to\s+([a-zA-Z\s]+)", clean_text, re.IGNORECASE)
    if update_match:
        target_company = update_match.group(1).strip()
        new_status_raw = update_match.group(2).strip().capitalize()
        
        # Normalize status
        valid_statuses = {"Saved", "Applied", "Assessment", "Interview", "Offer", "Rejected", "Withdrawn"}
        matched_status = None
        for s in valid_statuses:
            if s.lower() == new_status_raw.lower():
                matched_status = s
                break
                
        if not matched_status:
            return f"Unknown status '{new_status_raw}'. Valid statuses are: Saved, Applied, Assessment, Interview, Offer, Rejected, Withdrawn."
            
        # Find matching applications — handle ambiguous matches cleanly
        cursor = await conn.execute(
            "SELECT id, company, position, status FROM applications WHERE user_id = ? AND lower(company) LIKE ?",
            (user_id, f"%{target_company.lower()}%")
        )
        apps = await cursor.fetchall()
        
        if not apps:
            return f"I couldn't find an application for '{target_company}'. Please check the company name."
        
        if len(apps) > 1:
            lines = [f"You have {len(apps)} applications matching '{target_company}'. Which one would you like to update?\n"]
            for i, a in enumerate(apps, 1):
                lines.append(f"{i}. <b>{a['company']}</b> — {a['position']} (<i>{a['status']}</i>)")
            lines.append(f"\nPlease be specific, e.g.: \"Update {apps[0]['company']} {apps[0]['position']} to {matched_status}\"")
            return "\n".join(lines)

        app = apps[0]
        old_status = app["status"]
        app_id = app["id"]
        
        # Update the application and log event in a single atomic transaction
        now = now_iso()
        async with db_transaction(conn):
            await conn.execute("UPDATE applications SET status = ?, updated_at = ? WHERE id = ?", (matched_status, now, app_id))
            
            # Log event in application_events
            await conn.execute("""
            INSERT INTO application_events (id, user_id, application_id, event_type, previous_value, new_value, description, created_at)
            VALUES (?, ?, ?, 'status_change', ?, ?, 'Status updated via Telegram Assistant', ?);
            """, (new_uuid(), user_id, app_id, old_status, matched_status, now))

            # If transition to terminal status (Rejected, Withdrawn, Offer), cancel pending/in-flight reminders
            if matched_status in {"Rejected", "Withdrawn", "Offer"}:
                await conn.execute("""
                UPDATE reminders
                SET status = 'cancelled', claim_token = NULL, processing_started_at = NULL, processing_expires_at = NULL, updated_at = ?
                WHERE application_id = ? AND status IN ('pending', 'snoozed', 'processing')
                """, (now, app_id))
        
        return (
            f"✅ <b>Updated {app['company']}!</b>\n\n"
            f"Role: {app['position']}\n"
            f"Previous status: {old_status}\n"
            f"New status: <b>{matched_status}</b>"
        )

    # 7. Follow-up draft generation: e.g. "Draft a follow-up for Acme"
    if "follow-up" in lower_text or "follow up" in lower_text:
        comp_match = re.search(r"for\s+(.+)", clean_text, re.IGNORECASE)
        target_company = comp_match.group(1).strip() if comp_match else ""
        if not target_company:
            # Try to extract company word
            words = [w for w in clean_text.split() if w.lower() not in ["draft", "a", "follow-up", "follow", "up", "for", "email"]]
            target_company = " ".join(words).strip()
            
        if target_company:
            cursor = await conn.execute(
                "SELECT id, company, position, applied_at, hr_email FROM applications WHERE user_id = ? AND lower(company) LIKE ? LIMIT 1",
                (user_id, f"%{target_company.lower()}%")
            )
            app = await cursor.fetchone()
            if app:
                cursor_profile = await conn.execute("SELECT full_name FROM profiles WHERE user_id = ?", (user_id,))
                p_row = await cursor_profile.fetchone()
                student_name = p_row["full_name"] if p_row else "Applicant"
                
                draft = generate_followup_draft(
                    company=app["company"],
                    position=app["position"],
                    student_name=student_name,
                    applied_date_str=app["applied_at"],
                    hr_email=app["hr_email"]
                )
                
                return (
                    f"✉️ <b>Follow-up draft for {app['company']} ({app['position']}):</b>\n\n"
                    f"<b>Subject:</b> {draft['subject']}\n\n"
                    f"<code>{draft['body']}</code>\n\n"
                    f"<i>(Never sent automatically. You can review and send directly via the dashboard or your mail client.)</i>"
                )

    # 8. Company query: e.g. "Any update from Acme?" or "When did I apply to Acme?"
    clean_words = [re.sub(r"[^\w]", "", w) for w in clean_text.split()]
    words = [w for w in clean_words if len(w) > 2 and w.lower() not in STOPWORDS_TG]
    if words:
        for candidate in words:
            cursor = await conn.execute(
                "SELECT id, company, position, status, applied_at FROM applications WHERE user_id = ? AND lower(company) LIKE ? LIMIT 1",
                (user_id, f"%{candidate.lower()}%")
            )
            app = await cursor.fetchone()
            if app:
                days_ago = ""
                if app["applied_at"]:
                    try:
                        app_dt = datetime.fromisoformat(app["applied_at"].replace("Z", "+00:00"))
                        now_dt = datetime.now(timezone.utc)
                        delta = (now_dt - app_dt).days
                        days_ago = f"You applied {delta} days ago."
                    except Exception:
                        pass
                        
                return (
                    f"Your last recorded status for <b>{app['company']}</b> is <b>{app['status']}</b>.\n\n"
                    f"Role: {app['position']}\n"
                    f"{days_ago} No new employer update has been recorded.\n\n"
                    f"Would you like me to prepare a follow-up? Reply: <i>\"Draft a follow-up for {app['company']}\"</i>"
                )

    # Fallback
    return (
        "I'm here to help with your applications. You can ask:\n"
        "• <i>\"What's happening with my applications?\"</i>\n"
        "• <i>\"Any update from [Company]?\"</i>\n"
        "• <i>\"Update [Company] to Interview\"</i>\n"
        "• <i>\"Draft a follow-up for [Company]\"</i>\n"
        "Type /help for all options."
    )

STOPWORDS_TG = {
    "any", "update", "from", "when", "did", "apply", "what", "is", "the", "status",
    "of", "my", "application", "at", "to", "for", "tell", "me", "about"
}
