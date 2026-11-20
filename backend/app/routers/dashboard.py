from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from typing import Dict, Any, List
from app.database import get_db, now_iso
from app.routers.auth import get_current_user_id
from app.models.schemas import DashboardSummaryResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/summary", response_model=DashboardSummaryResponse)
async def get_dashboard_summary(
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Provides key metrics and connection statuses for the dashboard overview."""
    cursor_apps = await conn.execute(
        "SELECT status, count(*) as count FROM applications WHERE user_id = ? GROUP BY status",
        (user_id,)
    )
    rows = await cursor_apps.fetchall()
    pipeline = {
        "Saved": 0,
        "Applied": 0,
        "Assessment": 0,
        "Interview": 0,
        "Offer": 0,
        "Rejected": 0,
        "Withdrawn": 0
    }
    total = 0
    for r in rows:
        st = r["status"]
        c = r["count"]
        total += c
        if st in pipeline:
            pipeline[st] = c
            
    awaiting = pipeline["Applied"] + pipeline["Saved"]
    interviews = pipeline["Interview"]
    
    # Follow-ups due
    now = now_iso()
    cursor_rem = await conn.execute(
        "SELECT count(*) as due_count FROM reminders WHERE user_id = ? AND status IN ('pending', 'snoozed') AND reminder_at <= ?",
        (user_id, now)
    )
    rem_row = await cursor_rem.fetchone()
    followups_due = rem_row["due_count"] if rem_row else 0
    
    # Telegram connection check
    cursor_tg = await conn.execute(
        "SELECT id FROM telegram_connections WHERE user_id = ? AND is_active = TRUE LIMIT 1",
        (user_id,)
    )
    telegram_connected = bool(await cursor_tg.fetchone())
    
    # Extension connection check: check active device_connections or used pairing_codes
    cursor_dev = await conn.execute(
        "SELECT id FROM device_connections WHERE user_id = ? AND device_type = 'extension' AND is_active = TRUE LIMIT 1",
        (user_id,)
    )
    dev_row = await cursor_dev.fetchone()
    if dev_row:
        extension_connected = True
    else:
        cursor_ext = await conn.execute(
            "SELECT id FROM pairing_codes WHERE user_id = ? AND device_type = 'extension' AND used_at IS NOT NULL LIMIT 1",
            (user_id,)
        )
        extension_connected = bool(await cursor_ext.fetchone())
    
    return DashboardSummaryResponse(
        total_applications=total,
        awaiting_response=awaiting,
        interviews=interviews,
        follow_ups_due=followups_due,
        pipeline=pipeline,
        telegram_connected=telegram_connected,
        extension_connected=extension_connected
    )

@router.get("/activity", response_model=List[Dict[str, Any]])
async def get_dashboard_activity(
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Retrieves recent real application activity timeline."""
    cursor = await conn.execute("""
    SELECT e.*, a.company, a.position 
    FROM application_events e
    JOIN applications a ON e.application_id = a.id
    WHERE e.user_id = ?
    ORDER BY e.created_at DESC LIMIT 10
    """, (user_id,))
    rows = await cursor.fetchall()
    return [dict(r) for r in rows]
