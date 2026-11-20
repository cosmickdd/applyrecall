from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from app.database import now_iso, new_uuid
from app.services.telegram_service import send_telegram_message

TERMINAL_STATUSES = {"Rejected", "Withdrawn", "Offer"}

async def process_due_reminders(conn) -> List[Dict[str, Any]]:
    """
    Checks database for pending reminders whose scheduled time has arrived.
    Verifies that the associated application has not been marked Rejected, Withdrawn, or Offer.
    Sends notifications via Telegram, records send attempts, and prevents duplicates.
    """
    now = now_iso()
    
    # Query pending or snoozed reminders that are due
    cursor = await conn.execute("""
        SELECT r.id, r.user_id, r.application_id, r.reminder_at, r.type, r.status,
               a.company, a.position, a.status as app_status, a.applied_at,
               tc.chat_id
        FROM reminders r
        JOIN applications a ON r.application_id = a.id
        LEFT JOIN telegram_connections tc ON r.user_id = tc.user_id AND tc.is_active = 1
        WHERE (r.status = 'pending' OR r.status = 'snoozed')
          AND r.reminder_at <= ?
    """, (now,))
    
    due_items = await cursor.fetchall()
    results = []
    
    for item in due_items:
        r_id = item["id"]
        app_status = item["app_status"]
        company = item["company"]
        position = item["position"]
        chat_id = item["chat_id"]
        applied_at = item["applied_at"]
        
        # Rule: Never repeatedly notify a student about an application already marked Rejected, Withdrawn or Offer.
        if app_status in TERMINAL_STATUSES:
            # Mark reminder cancelled because application is in terminal state
            await conn.execute("UPDATE reminders SET status = 'cancelled', updated_at = ? WHERE id = ?", (now, r_id))
            results.append({
                "reminder_id": r_id,
                "action": "cancelled_terminal_status",
                "app_status": app_status,
                "company": company
            })
            continue

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
        if chat_id:
            sent = await send_telegram_message(chat_id, msg)
            
        # Update reminder record to avoid duplicates
        await conn.execute("""
            UPDATE reminders 
            SET status = 'completed', sent_at = ?, updated_at = ? 
            WHERE id = ?
        """, (now, now, r_id))
        
        results.append({
            "reminder_id": r_id,
            "action": "sent" if sent else "completed_no_telegram",
            "company": company,
            "telegram_sent": sent
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
