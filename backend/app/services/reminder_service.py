import logging
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from app.config import settings
from app.database import now_iso, new_uuid, db_transaction
from app.services.telegram_service import send_telegram_message

logger = logging.getLogger("applyrecall.reminders")

TERMINAL_STATUSES = {"Rejected", "Withdrawn", "Offer"}
MAX_RETRY_ATTEMPTS = settings.MAX_RETRY_ATTEMPTS
RETRY_DELAYS_MINUTES = settings.RETRY_DELAYS_MINUTES  # [5, 20, 80]


async def recover_stale_processing_reminders(conn) -> int:
    """
    Recovers reminders that were claimed by a worker that crashed during processing.
    Recovers only genuinely expired leases:
    1. processing_expires_at has arrived and passed (<= now), OR
    2. processing_started_at is older than STALE_PROCESSING_TIMEOUT_MINUTES.
    Never reclaims active leases belonging to healthy workers.
    """
    now = now_iso()
    cutoff = (
        datetime.now(timezone.utc) - timedelta(minutes=settings.STALE_PROCESSING_TIMEOUT_MINUTES)
    ).isoformat()

    async with db_transaction(conn):
        cursor = await conn.execute(
            """
            UPDATE reminders
            SET status = 'pending', claim_token = NULL, worker_id = NULL,
                processing_started_at = NULL, processing_expires_at = NULL, updated_at = ?
            WHERE status = 'processing' AND (
                (processing_expires_at IS NOT NULL AND processing_expires_at <= ?)
                OR (processing_started_at IS NOT NULL AND processing_started_at <= ?)
                OR (processing_started_at IS NULL AND processing_expires_at IS NULL)
            )
            """,
            (now, now, cutoff)
        )
        recovered = cursor.rowcount if hasattr(cursor, "rowcount") else 0
        if recovered > 0:
            logger.warning(f"Recovered {recovered} stale processing reminder(s) back to pending.")
        return recovered


async def process_due_reminders(
    conn,
    batch_size: Optional[int] = None,
    pre_delivery_hook: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Processes due reminders across the shared database (PostgreSQL or SQLite).
    Adheres strictly to production reliability and concurrency rules:
    1. Stale-claim recovery for crashed workers (recovering only expired leases).
    2. Bounded batch size (WORKER_BATCH_SIZE) with unique claim lease tokens and worker identification.
    3. Atomic claiming (FOR UPDATE SKIP LOCKED on PostgreSQL, atomic conditional check on SQLite).
    4. Immediate pre-delivery reload: re-checks lease validity and cancels if application reached terminal status.
    5. HTTP Telegram delivery executed outside database transactions (zero DB connection holding).
    6. Outcome recorded only by the active lease owner (WHERE id = ? AND claim_token = ?).
    7. Exponential retry schedule: 5m -> 20m -> 80m (4 total attempts).
    """
    now = now_iso()
    worker_id = f"worker-{new_uuid()[:8]}"
    limit = batch_size or settings.WORKER_BATCH_SIZE
    lease_duration = timedelta(minutes=settings.WORKER_LEASE_MINUTES)

    if hasattr(conn, "set_worker_context"):
        await conn.set_worker_context(True)

    try:
        # 1. Recover genuinely stale claims from crashed workers
        await recover_stale_processing_reminders(conn)

        claimed_items = []
        results = []

        # Phase 1: Atomic Claim inside Transaction 1
        async with db_transaction(conn):
            query = """
                SELECT r.id, r.user_id, r.application_id, r.reminder_at, r.type, r.status,
                       r.attempts, r.error_message,
                       a.company, a.position, a.status as app_status, a.applied_at,
                       tc.chat_id
                FROM reminders r
                JOIN applications a ON r.application_id = a.id
                LEFT JOIN telegram_connections tc ON r.user_id = tc.user_id AND tc.is_active = TRUE
                WHERE (
                    (r.status IN ('pending', 'snoozed') AND r.reminder_at <= ?)
                    OR (r.status = 'failed' AND r.attempts < ? AND (r.next_retry_at IS NULL OR r.next_retry_at <= ?))
                )
                ORDER BY r.reminder_at ASC
                LIMIT ?
            """
            if settings.use_postgres:
                query += " FOR UPDATE OF r SKIP LOCKED"

            cursor = await conn.execute(query, (now, MAX_RETRY_ATTEMPTS, now, limit))
            due_items = await cursor.fetchall()

            for item in due_items:
                r_id = str(item["id"])
                attempts = int(item["attempts"] or 0)
                app_status = item["app_status"]
                company = item["company"]

                # Check terminal status: cancel reminders for Rejected, Withdrawn, or Offer
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
                    logger.info(
                        f"[REMINDER_CANCELLED] worker_id={worker_id} reminder_id={r_id} "
                        f"terminal_status={app_status} reason=application_status_changed"
                    )
                    continue

                # Generate unique claim token and lease expiration
                claim_token = f"claim_{new_uuid()}"
                safe_tok = claim_token[:12] + "..." if len(claim_token) > 12 else claim_token
                claim_time = now_iso()
                expires_at = (datetime.now(timezone.utc) + lease_duration).isoformat()

                cursor_claim = await conn.execute(
                    """
                    UPDATE reminders 
                    SET status = 'processing', claim_token = ?, worker_id = ?,
                        processing_started_at = ?, processing_expires_at = ?, updated_at = ?
                    WHERE id = ? AND status IN ('pending', 'snoozed', 'failed')
                    """,
                    (claim_token, worker_id, claim_time, expires_at, claim_time, r_id)
                )
                if hasattr(cursor_claim, "rowcount") and cursor_claim.rowcount == 0:
                    # Concurrency check: another worker claimed it first
                    continue

                claimed_items.append((item, claim_token))
                safe_tok = claim_token[:12] + "..." if len(claim_token) > 12 else claim_token
                logger.info(
                    f"[WORKER_CLAIM] worker_id={worker_id} reminder_id={r_id} "
                    f"claim_token={safe_tok} claim_time={claim_time} lease_expires_at={expires_at} attempt={attempts}"
                )
        # Tx 1 commits here. All claimed_items are now locked in 'processing' status with unique claim_tokens.

        # Phase 2: Pre-Delivery Reload, Delivery & Outcome recording
        for item, claim_token in claimed_items:
            r_id = str(item["id"])
            attempts = int(item["attempts"] or 0)
            safe_tok = claim_token[:12] + "..." if len(claim_token) > 12 else claim_token

            # Controlled mid-flight testing hook (executed after claim, prior to delivery reload)
            if pre_delivery_hook is not None:
                await pre_delivery_hook(r_id, claim_token)

            # Step 2A: Reload reminder state and verify lease & terminal application status immediately before delivery
            fresh_item = None
            async with db_transaction(conn):
                cursor_fresh = await conn.execute(
                    """
                    SELECT r.id, r.status as reminder_status, r.claim_token, r.processing_expires_at,
                           a.status as app_status, a.company, a.position, a.applied_at,
                           tc.chat_id
                    FROM reminders r
                    JOIN applications a ON r.application_id = a.id
                    LEFT JOIN telegram_connections tc ON r.user_id = tc.user_id AND tc.is_active = TRUE
                    WHERE r.id = ?
                    """,
                    (r_id,)
                )
                fresh_item = await cursor_fresh.fetchone()
                if not fresh_item:
                    continue

                reminder_status = fresh_item["reminder_status"]
                fresh_claim_token = fresh_item["claim_token"]
                app_status = fresh_item["app_status"]
                company = fresh_item["company"]

                # If reminder is no longer processing or lease was lost/reclaimed
                if reminder_status != "processing" or fresh_claim_token != claim_token:
                    logger.info(f"Skipping reminder {r_id}: lease lost or status changed to {reminder_status}")
                    continue

                # Race condition guard: if application status changed to terminal (Offer, Rejected, Withdrawn)
                if app_status in TERMINAL_STATUSES:
                    now_cancel = now_iso()
                    await conn.execute(
                        """
                        UPDATE reminders 
                        SET status = 'cancelled', claim_token = NULL, worker_id = NULL,
                            processing_started_at = NULL, processing_expires_at = NULL, updated_at = ?
                        WHERE id = ? AND claim_token = ?
                        """,
                        (now_cancel, r_id, claim_token)
                    )
                    results.append({
                        "reminder_id": r_id,
                        "action": "cancelled_terminal_status",
                        "app_status": app_status,
                        "company": company
                    })
                    logger.info(
                        f"[REMINDER_CANCELLED] worker_id={worker_id} reminder_id={r_id} "
                        f"claim_token={safe_tok} terminal_status={app_status} reason=application_status_changed"
                    )
                    continue

            # Step 2B: Build message from fresh record
            position = fresh_item["position"]
            chat_id = fresh_item["chat_id"]
            applied_at = fresh_item["applied_at"]
            company = fresh_item["company"]
            app_status = fresh_item["app_status"]

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
            is_retryable = True

            # Step 2C: Dispatch HTTP outside database transaction
            if not chat_id:
                error_msg = "Student has not linked a Telegram account. Link Telegram via Settings to receive reminders."
                sent = False
                is_retryable = False
            else:
                res = await send_telegram_message(chat_id, msg)
                sent = res[0]
                if not sent:
                    error_msg = res[1]
                    is_retryable = getattr(res, "retryable", True)

            update_time = now_iso()

            # Step 2D: Record outcome atomically (matching claim_token so only active lease owner can update)
            async with db_transaction(conn):
                if sent:
                    await conn.execute("""
                        UPDATE reminders 
                        SET status = 'sent', sent_at = ?, attempts = ?, last_attempt_at = ?, 
                            processing_started_at = NULL, processing_expires_at = NULL, claim_token = NULL,
                            error_message = NULL, updated_at = ? 
                        WHERE id = ? AND claim_token = ?
                    """, (update_time, new_attempts, update_time, update_time, r_id, claim_token))

                    results.append({
                        "reminder_id": r_id,
                        "action": "sent",
                        "company": company,
                        "telegram_sent": True
                    })
                    logger.info(
                        f"[REMINDER_DELIVERY_SUCCESS] worker_id={worker_id} reminder_id={r_id} "
                        f"claim_token={safe_tok} attempt={new_attempts} result=sent"
                    )
                else:
                    if not is_retryable or new_attempts >= MAX_RETRY_ATTEMPTS:
                        err_text = f"Max retries ({MAX_RETRY_ATTEMPTS}) reached. {error_msg}" if new_attempts >= MAX_RETRY_ATTEMPTS else f"Non-retryable: {error_msg}"
                        await conn.execute("""
                            UPDATE reminders 
                            SET status = 'failed', attempts = ?, last_attempt_at = ?, 
                                processing_started_at = NULL, processing_expires_at = NULL, claim_token = NULL,
                                error_message = ?, next_retry_at = NULL, updated_at = ? 
                            WHERE id = ? AND claim_token = ?
                        """, (new_attempts, update_time, err_text, update_time, r_id, claim_token))

                        results.append({
                            "reminder_id": r_id,
                            "action": "failed_max_retries",
                            "company": company,
                            "error": error_msg
                        })
                        logger.error(
                            f"[REMINDER_DELIVERY_FAILED] worker_id={worker_id} reminder_id={r_id} "
                            f"claim_token={safe_tok} attempt={new_attempts} max_retries_reached=true error={error_msg}"
                        )
                    else:
                        delay_index = min(new_attempts - 1, len(RETRY_DELAYS_MINUTES) - 1)
                        retry_delay = RETRY_DELAYS_MINUTES[delay_index]
                        next_retry = (datetime.now(timezone.utc) + timedelta(minutes=retry_delay)).isoformat()

                        await conn.execute("""
                            UPDATE reminders 
                            SET status = 'failed', attempts = ?, last_attempt_at = ?, 
                                processing_started_at = NULL, processing_expires_at = NULL, claim_token = NULL,
                                error_message = ?, next_retry_at = ?, updated_at = ? 
                            WHERE id = ? AND claim_token = ?
                        """, (new_attempts, update_time, error_msg, next_retry, update_time, r_id, claim_token))

                        results.append({
                            "reminder_id": r_id,
                            "action": "failed_will_retry",
                            "company": company,
                            "attempt": new_attempts,
                            "next_retry": next_retry,
                            "error": error_msg
                        })
                        logger.warning(
                            f"[REMINDER_DELIVERY_RETRY] worker_id={worker_id} reminder_id={r_id} "
                            f"claim_token={safe_tok} attempt={new_attempts} next_retry_at={next_retry} error={error_msg}"
                        )

        return results
    finally:
        if hasattr(conn, "set_worker_context"):
            await conn.set_worker_context(False)


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
