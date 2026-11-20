from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from app.database import now_iso, new_uuid
from app.services.telegram_service import send_telegram_message

TERMINAL_STATUSES = {"Rejected", "Withdrawn", "Offer"}
MAX_RETRY_ATTEMPTS = 3
BASE_RETRY_DELAY_MINUTES = 5  # 5 → 20 → 80 (exponential)

async def process_due_reminders(conn) -> List[Dict[str, Any]]:
    """
    Checks database for pending reminders whose scheduled time has arrived.
    Verifies that the associated application has not been marked Rejected, Withdrawn, or Offer.
    Uses proper lifecycle: pending → processing → sent/failed.
    Implements retry with exponential backoff.
    """
    now = now_iso()
    
    # Query pending or snoozed reminders that are due, or failed reminders ready for retry
    cursor = await conn.execute("""
        SELECT r.id, r.user_id, r.application_id, r.reminder_at, r.type, r.status,
               r.attempts, r.error_message,
               a.company, a.position, a.status as app_status, a.applied_at,
               tc.chat_id
        FROM reminders r
        JOIN applications a ON r.application_id = a.id
        LEFT JOIN telegram_connections tc ON r.user_id = tc.user_id AND tc.is_active = 1
        WHERE (
            (r.status IN ('pending', 'snoozed') AND r.reminder_at <= ?)
            OR (r.status = 'failed' AND r.attempts < ? AND (r.next_retry_at IS NULL OR r.next_retry_at <= ?))
        )
    """, (now, MAX_RETRY_ATTEMPTS, now))
    
    due_items = await cursor.fetchall()
    results = []
    
    for item in due_items:
        r_id = item["id"]
        app_status = item["app_status"]
        company = item["company"]
        position = item["position"]
        chat_id = item["chat_id"]
        applied_at = item["applied_at"]
        attempts = item["attempts"] or 0
        
        # Rule: Never repeatedly notify about terminal-status applications
        if app_status in TERMINAL_STATUSES:
            await conn.execute(
                "UPDATE reminders SET status = 'cancelled', updated_at = ? WHERE id = ?",
                (now, r_id)
            )
            results.append({
                "reminder_id": r_id,
                "action": "cancelled_terminal_status",
                "app_status": app_status,
                "company": company
            })
            continue

        # Mark as processing
        await conn.execute(
            "UPDATE reminders SET status = 'processing', updated_at = ? WHERE id = ?",
            (now, r_id)
        )

        # Calculate days since applied
        days_str = ""
        if applied_at:
            try:
                dt_applied = datetime.fromisoformat(applied_at.replace("Z", "+00:00"))
                days = (datetime.now(timezone.utc) - dt_applied).days
                days_str = f"You applied to {company} {days} days ago."
            except Exception:
                days_str = f"You applied to {company} recently."
        else:
            days_str = f"You applied to {company} recently."

        # Construct message
        msg = (
            f"🔔 <b>Follow-up Reminder</b>\n\n"
            f"{days_str}\n"
            f"Role: <b>{position}</b>\n"
            f"Current status: <i>{app_status}</i>\n\n"
            f"Would you like to follow up? Open your dashboard or reply:\n"
            f"<i>\"Draft a follow-up for {company}\"</i>"
        )
        
        sent = False
        error_msg = None
        new_attempts = attempts + 1

        if chat_id:
            try:
                sent = await send_telegram_message(chat_id, msg)
                if not sent:
                    error_msg = "Telegram API returned non-200 status"
            except Exception as e:
                error_msg = str(e)
                sent = False
        else:
            error_msg = "No active Telegram connection"
            
        if sent:
            # Success: mark as sent
            await conn.execute("""
                UPDATE reminders 
                SET status = 'sent', sent_at = ?, attempts = ?, last_attempt_at = ?, error_message = NULL, updated_at = ? 
                WHERE id = ?
            """, (now, new_attempts, now, now, r_id))
            results.append({
                "reminder_id": r_id,
                "action": "sent",
                "company": company,
                "telegram_sent": True
            })
        elif not chat_id:
            # No telegram — mark as sent but note no delivery channel
            await conn.execute("""
                UPDATE reminders 
                SET status = 'sent', sent_at = ?, attempts = ?, last_attempt_at = ?, 
                    error_message = 'No active Telegram connection', updated_at = ? 
                WHERE id = ?
            """, (now, new_attempts, now, now, r_id))
            results.append({
                "reminder_id": r_id,
                "action": "completed_no_telegram",
                "company": company,
                "telegram_sent": False
            })
        else:
            # Failed to send — schedule retry with exponential backoff
            if new_attempts >= MAX_RETRY_ATTEMPTS:
                # Max retries reached
                await conn.execute("""
                    UPDATE reminders 
                    SET status = 'failed', attempts = ?, last_attempt_at = ?, 
                        error_message = ?, updated_at = ? 
                    WHERE id = ?
                """, (new_attempts, now, f"Max retries reached. Last error: {error_msg}", now, r_id))
                results.append({
                    "reminder_id": r_id,
                    "action": "failed_max_retries",
                    "company": company,
                    "error": error_msg
                })
            else:
                # Schedule retry with exponential backoff
                retry_delay = BASE_RETRY_DELAY_MINUTES * (4 ** (new_attempts - 1))  # 5, 20, 80 minutes
                next_retry = (datetime.now(timezone.utc) + timedelta(minutes=retry_delay)).isoformat()
                await conn.execute("""
                    UPDATE reminders 
                    SET status = 'failed', attempts = ?, last_attempt_at = ?, 
                        error_message = ?, next_retry_at = ?, updated_at = ? 
                    WHERE id = ?
                """, (new_attempts, now, error_msg, next_retry, now, r_id))
                results.append({
                    "reminder_id": r_id,
                    "action": "failed_will_retry",
                    "company": company,
                    "next_retry": next_retry,
                    "attempt": new_attempts
                })
        
    await conn.commit()
    return results

async def snooze_reminder(conn, reminder_id: str, days: int = 1) -> bool:
    """Snoozes a reminder by specified days."""
    new_dt = (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()
    now = now_iso()
    await conn.execute("""
        UPDATE reminders 
        SET reminder_at = ?, status = 'snoozed', updated_at = ?
        WHERE id = ?
    """, (new_dt, now, reminder_id))
    await conn.commit()
    return True
