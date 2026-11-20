from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from app.database import get_db, now_iso, new_uuid
from app.routers.auth import get_current_user_id
from app.models.schemas import ReminderCreate, ReminderUpdate, ReminderResponse
from app.services.reminder_service import snooze_reminder

router = APIRouter(prefix="/reminders", tags=["reminders"])

@router.get("", response_model=List[ReminderResponse])
async def list_reminders(
    status: Optional[str] = Query(None, description="pending, completed, snoozed, cancelled"),
    tab: Optional[str] = Query(None, description="today, upcoming, snoozed, completed"),
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Retrieves reminders for the student with application details."""
    query = """
    SELECT r.*, a.company, a.position 
    FROM reminders r
    JOIN applications a ON r.application_id = a.id
    WHERE r.user_id = ?
    """
    params = [user_id]
    now = now_iso()
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_end = (datetime.now(timezone.utc).replace(hour=23, minute=59, second=59, microsecond=999999)).isoformat()
    
    if tab == "today":
        query += " AND r.status IN ('pending', 'snoozed', 'processing') AND r.reminder_at <= ?"
        params.append(today_end)
    elif tab == "upcoming":
        query += " AND r.status IN ('pending', 'snoozed', 'processing') AND r.reminder_at > ?"
        params.append(today_end)
    elif tab == "snoozed":
        query += " AND r.status = 'snoozed'"
    elif tab == "completed":
        query += " AND r.status IN ('sent', 'completed')"
    elif status:
        query += " AND r.status = ?"
        params.append(status)
        
    query += " ORDER BY r.reminder_at ASC"
    
    cursor = await conn.execute(query, params)
    rows = await cursor.fetchall()
    return [ReminderResponse(**dict(r)) for r in rows]

@router.post("", response_model=ReminderResponse)
async def create_reminder(
    req: ReminderCreate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Schedules a new reminder for an application."""
    # Validate application belongs to user
    cursor = await conn.execute("SELECT id, company, position FROM applications WHERE id = ? AND user_id = ?", (req.application_id, user_id))
    app_row = await cursor.fetchone()
    if not app_row:
        raise HTTPException(status_code=404, detail="Associated application not found.")
        
    rem_id = new_uuid()
    now = now_iso()
    
    await conn.execute("""
    INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    """, (rem_id, user_id, req.application_id, req.reminder_at, req.type or "follow_up", now, now))
    await conn.commit()
    
    cursor = await conn.execute("""
    SELECT r.*, a.company, a.position 
    FROM reminders r
    JOIN applications a ON r.application_id = a.id
    WHERE r.id = ?
    """, (rem_id,))
    row = await cursor.fetchone()
    return ReminderResponse(**dict(row))

@router.patch("/{rem_id}", response_model=ReminderResponse)
async def update_reminder(
    rem_id: str,
    req: ReminderUpdate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Updates status or reschedules a reminder."""
    cursor = await conn.execute("SELECT * FROM reminders WHERE id = ? AND user_id = ?", (rem_id, user_id))
    existing = await cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Reminder not found.")
        
    update_data = req.model_dump(exclude_unset=True)
    if not update_data:
        cursor_full = await conn.execute("""
        SELECT r.*, a.company, a.position 
        FROM reminders r JOIN applications a ON r.application_id = a.id WHERE r.id = ?
        """, (rem_id,))
        return ReminderResponse(**dict(await cursor_full.fetchone()))
        
    update_data["updated_at"] = now_iso()
    fields = [f"{k} = ?" for k in update_data.keys()]
    values = list(update_data.values())
    values.extend([rem_id, user_id])
    
    query = f"UPDATE reminders SET {', '.join(fields)} WHERE id = ? AND user_id = ?"
    await conn.execute(query, values)
    await conn.commit()
    
    cursor_full = await conn.execute("""
    SELECT r.*, a.company, a.position 
    FROM reminders r JOIN applications a ON r.application_id = a.id WHERE r.id = ?
    """, (rem_id,))
    return ReminderResponse(**dict(await cursor_full.fetchone()))

@router.post("/{rem_id}/snooze", response_model=ReminderResponse)
async def snooze_reminder_endpoint(
    rem_id: str,
    days: int = Query(1, description="Days to snooze"),
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Snoozes a reminder by specified days (defaults to 1 day)."""
    cursor = await conn.execute("SELECT * FROM reminders WHERE id = ? AND user_id = ?", (rem_id, user_id))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Reminder not found.")
        
    await snooze_reminder(conn, rem_id, days=days)
    
    cursor_full = await conn.execute("""
    SELECT r.*, a.company, a.position 
    FROM reminders r JOIN applications a ON r.application_id = a.id WHERE r.id = ?
    """, (rem_id,))
    return ReminderResponse(**dict(await cursor_full.fetchone()))

@router.post("/check-now")
async def trigger_reminder_check(
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Manually triggers an immediate evaluation of due reminders."""
    from app.services.reminder_service import process_due_reminders
    results = await process_due_reminders(conn)
    return {"status": "ok", "processed": len(results), "details": results}

@router.delete("/{rem_id}")
async def delete_reminder(
    rem_id: str,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Deletes a reminder."""
    await conn.execute("DELETE FROM reminders WHERE id = ? AND user_id = ?", (rem_id, user_id))
    await conn.commit()
    return {"success": True, "message": "Reminder deleted."}
