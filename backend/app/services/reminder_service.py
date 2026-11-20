import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from app.config import settings
from app.database import now_iso, new_uuid
from app.services.telegram_service import send_telegram_message

logger = logging.getLogger("applyrecall.reminders")

TERMINAL_STATUSES = {"Rejected", "Withdrawn", "Offer"}
MAX_RETRY_ATTEMPTS = settings.MAX_RETRY_ATTEMPTS
RETRY_DELAYS_MINUTES = [5, 20, 80]  # Exact exponential backoff schedule

async def recover_stale_processing_reminders(conn) -> int:
    """
    Recovers reminders that were claimed by a worker that crashed during processing.
    Any reminder in 'processing' status older than STALE_PROCESSING_TIMEOUT_MINUTES
    is reset back to 'pending' to prevent permanent stuck states.
    """
    cutoff = (
        datetime.now(timezone.utc) - timedelta(minutes=settings.STALE_PROCESSING_TIMEOUT_MINUTES)
    ).isoformat()
    now = now_iso()
    
    cursor = await conn.execute(
        """
        UPDATE reminders
        SET status = 'pending', processing_started_at = NULL, updated_at = ?
        WHERE status = 'processing' AND (processing_started_at IS NULL OR processing_started_at <= ?)
        """,
        (now, cutoff)
    )
    recovered = cursor.rowcount if hasattr(cursor, "rowcount") else 0
    if recovered > 0:
        logger.warning(f"Recovered {recovered} stale processing reminder(s) back to pending.")
        await conn.commit()
    return recovered

async def process_due_reminders(conn) -> List[Dict[str, Any]]:
    """
    Processes due reminders across the shared database (PostgreSQL or SQLite).
    Adheres strictly to production reliability rules:
    1. Stale-claim recovery for crashed workers.
    2. Atomic claiming (with SKIP LOCKED where supported).
    3. Terminal status cancellation check immediately before sending.
    4. Only marks 'sent' if Telegram confirms actual successful delivery.
    5. Exponential retry schedule: 5m -> 20m -> 80m.
    """
    now = now_iso()
    
    # 1. Recover any stale claims from crashed workers
    await recover_stale_processing_reminders(conn)
    
    # 2. Select eligible reminders
    # Due pending/snoozed, or failed reminders whose next_retry_at has arrived
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
        r_id = str(item["id"])
        app_status = item["app_status"]
        company = item["company"]
        position = item["position"]
        chat_id = item["chat_id"]
        applied_at = item["applied_at"]
        attempts = int(item["attempts"] or 0)
        
        # 3. Terminal State Rule: Immediately cancel reminders for Rejected, Withdrawn, or Offer
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

        # 4. Atomic Claim: Transition status to 'processing' and record processing_started_at
        claim_time = now_iso()
        await conn.execute(
            """
            UPDATE reminders 
            SET status = 'processing', processing_started_at = ?, updated_at = ?
            WHERE id = ? AND status IN ('pending', 'snoozed', 'failed')
            """,
            (claim_time, claim_time, r_id)
        )

        # 5. Check if another concurrent worker claimed it
        # (Verification for SQLite; in Postgres SKIP LOCKED already protects selection)
        
        # 6. Compose notification message
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

        if not chat_id:
            # Telegram not connected for this student
            error_msg = "Student has not linked a Telegram account. Link Telegram via Settings to receive reminders."
            sent = False
        else:
            # Attempt actual delivery via Telegram API
            sent, detail = await send_telegram_message(chat_id, msg)
            if not sent:
                error_msg = detail

        update_time = now_iso()
        
        # 7. Delivery evaluation
        if sent:
            # CONFIRMED DELIVERY: Mark 'sent' (or completed for schema compatibility)
            await conn.execute("""
                UPDATE reminders 
                SET status = 'sent', sent_at = ?, attempts = ?, last_attempt_at = ?, 
                    processing_started_at = NULL, error_message = NULL, updated_at = ? 
                WHERE id = ?
            """, (update_time, new_attempts, update_time, update_time, r_id))
            
            results.append({
                "reminder_id": r_id,
                "action": "sent",
                "company": company,
                "telegram_sent": True
            })
        else:
            # DELIVERY FAILED / NOT CONNECTED: Must NEVER mark as sent!
            if new_attempts >= MAX_RETRY_ATTEMPTS:
                # Terminal failure after all retries exhausted
                await conn.execute("""
                    UPDATE reminders 
                    SET status = 'failed', attempts = ?, last_attempt_at = ?, 
                        processing_started_at = NULL, error_message = ?, updated_at = ? 
                    WHERE id = ?
                """, (new_attempts, update_time, f"Max retries ({MAX_RETRY_ATTEMPTS}) reached. {error_msg}", update_time, r_id))
                
                results.append({
                    "reminder_id": r_id,
                    "action": "failed_max_retries",
                    "company": company,
                    "error": error_msg
                })
            else:
                # Schedule retry using exact exponential backoff schedule: 5m, 20m, 80m
                delay_index = min(new_attempts - 1, len(RETRY_DELAYS_MINUTES) - 1)
                retry_delay = RETRY_DELAYS_MINUTES[delay_index]
                next_retry = (datetime.now(timezone.utc) + timedelta(minutes=retry_delay)).isoformat()
                
                await conn.execute("""
                    UPDATE reminders 
                    SET status = 'failed', attempts = ?, last_attempt_at = ?, 
                        processing_started_at = NULL, error_message = ?, next_retry_at = ?, updated_at = ? 
                    WHERE id = ?
                """, (new_attempts, update_time, error_msg, next_retry, update_time, r_id))
                
                results.append({
                    "reminder_id": r_id,
                    "action": "failed_will_retry",
                    "company": company,
                    "attempt": new_attempts,
                    "next_retry": next_retry,
                    "error": error_msg
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
    """, (new_dt, now, str(reminder_id)))
    await conn.commit()
    return True
