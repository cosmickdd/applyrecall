from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Dict, Any
from app.database import get_db, now_iso, new_uuid
from app.routers.auth import get_current_user_id
from app.models.schemas import (
    ApplicationCreate,
    ApplicationUpdate,
    ApplicationResponse,
    ConfirmAppliedRequest,
    ApplicationEventCreate,
    ApplicationEventResponse,
    FollowUpDraftRequest,
    FollowUpDraftResponse
)
from app.services.followup import generate_followup_draft

router = APIRouter(prefix="/applications", tags=["applications"])

@router.get("", response_model=List[ApplicationResponse])
async def list_applications(
    search: Optional[str] = Query(None, description="Search company or position"),
    status: Optional[str] = Query(None, description="Filter by application status"),
    source: Optional[str] = Query(None, description="Filter by source"),
    sort: Optional[str] = Query("newest", description="newest or oldest"),
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Retrieves all applications for the student."""
    query = "SELECT * FROM applications WHERE user_id = ?"
    params = [user_id]
    
    if status:
        query += " AND status = ?"
        params.append(status)
        
    if source:
        query += " AND lower(source) = ?"
        params.append(source.lower())
        
    if search:
        query += " AND (lower(company) LIKE ? OR lower(position) LIKE ?)"
        s = f"%{search.lower()}%"
        params.extend([s, s])
        
    if sort == "oldest":
        query += " ORDER BY created_at ASC"
    else:
        query += " ORDER BY created_at DESC"
        
    cursor = await conn.execute(query, params)
    rows = await cursor.fetchall()
    return [ApplicationResponse(**dict(r)) for r in rows]

@router.post("", response_model=ApplicationResponse)
async def create_application(
    req: ApplicationCreate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Creates a new application record (from Extension or Dashboard)."""
    # Check for existing pending application for same company and role to avoid duplicates
    cursor = await conn.execute(
        "SELECT * FROM applications WHERE user_id = ? AND lower(company) = ? AND lower(position) = ? LIMIT 1",
        (user_id, req.company.strip().lower(), req.position.strip().lower())
    )
    existing = await cursor.fetchone()
    if existing:
        return ApplicationResponse(**dict(existing))

    app_id = new_uuid()
    now = now_iso()
    applied_time = req.applied_at or (now if req.status == "Applied" else None)
    
    await conn.execute("""
    INSERT INTO applications (
        id, user_id, company, position, job_url, source, description,
        location, employment_type, status, applied_at, hr_email, notes,
        created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        app_id, user_id, req.company.strip(), req.position.strip(),
        req.job_url, req.source, req.description, req.location,
        req.employment_type, req.status or "Saved", applied_time,
        req.hr_email, req.notes, now, now
    ))
    
    # Log creation event
    await conn.execute("""
    INSERT INTO application_events (id, user_id, application_id, event_type, previous_value, new_value, description, created_at)
    VALUES (?, ?, ?, 'created', NULL, ?, 'Application record created.', ?)
    """, (new_uuid(), user_id, app_id, req.status or "Saved", now))
    
    await conn.commit()
    
    cursor = await conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,))
    row = await cursor.fetchone()
    return ApplicationResponse(**dict(row))

@router.get("/{app_id}", response_model=Dict[str, Any])
async def get_application_detail(
    app_id: str,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Retrieves full application details including timeline events, reminders, and saved answers."""
    cursor = await conn.execute("SELECT * FROM applications WHERE id = ? AND user_id = ?", (app_id, user_id))
    app_row = await cursor.fetchone()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found.")
        
    # Get events
    cursor_evts = await conn.execute(
        "SELECT * FROM application_events WHERE application_id = ? ORDER BY created_at ASC",
        (app_id,)
    )
    events = [dict(r) for r in await cursor_evts.fetchall()]
    
    # Get reminders
    cursor_rem = await conn.execute(
        "SELECT * FROM reminders WHERE application_id = ? ORDER BY reminder_at ASC",
        (app_id,)
    )
    reminders = [dict(r) for r in await cursor_rem.fetchall()]
    
    # Get answers linked to this application
    cursor_ans = await conn.execute(
        "SELECT * FROM application_answers WHERE application_id = ? ORDER BY created_at ASC",
        (app_id,)
    )
    answers = [dict(r) for r in await cursor_ans.fetchall()]
    
    return {
        "application": dict(app_row),
        "events": events,
        "reminders": reminders,
        "answers": answers
    }

@router.patch("/{app_id}", response_model=ApplicationResponse)
async def update_application(
    app_id: str,
    req: ApplicationUpdate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Updates an application. Automatically logs status change events."""
    cursor = await conn.execute("SELECT * FROM applications WHERE id = ? AND user_id = ?", (app_id, user_id))
    existing = await cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Application not found.")
        
    update_data = req.model_dump(exclude_unset=True)
    if not update_data:
        return ApplicationResponse(**dict(existing))
        
    now = now_iso()
    old_status = existing["status"]
    new_status = update_data.get("status")
    
    if new_status and new_status != old_status:
        # If moving to Applied and applied_at is empty, set it
        if new_status == "Applied" and not existing["applied_at"] and "applied_at" not in update_data:
            update_data["applied_at"] = now
            
        await conn.execute("""
        INSERT INTO application_events (id, user_id, application_id, event_type, previous_value, new_value, description, created_at)
        VALUES (?, ?, ?, 'status_change', ?, ?, ?, ?)
        """, (
            new_uuid(), user_id, app_id, old_status, new_status,
            f"Status changed from {old_status} to {new_status}.", now
        ))
        
    update_data["updated_at"] = now
    fields = [f"{k} = ?" for k in update_data.keys()]
    values = list(update_data.values())
    values.extend([app_id, user_id])
    
    query = f"UPDATE applications SET {', '.join(fields)} WHERE id = ? AND user_id = ?"
    await conn.execute(query, values)
    await conn.commit()
    
    cursor = await conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,))
    updated_row = await cursor.fetchone()
    return ApplicationResponse(**dict(updated_row))

@router.delete("/{app_id}")
async def delete_application(
    app_id: str,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Permanently deletes an application and cascading records."""
    await conn.execute("DELETE FROM applications WHERE id = ? AND user_id = ?", (app_id, user_id))
    await conn.commit()
    return {"success": True, "message": "Application deleted."}

@router.post("/{app_id}/confirm-applied", response_model=ApplicationResponse)
async def confirm_application_applied(
    app_id: str,
    req: ConfirmAppliedRequest,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """
    Called by the Chrome extension when the student clicks 'Yes, mark as applied'.
    Updates status to Applied, sets applied_at, schedules a follow-up reminder,
    and logs the confirmation event.
    """
    cursor = await conn.execute("SELECT * FROM applications WHERE id = ? AND user_id = ?", (app_id, user_id))
    app_row = await cursor.fetchone()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found.")
        
    now = now_iso()
    applied_time = req.applied_at or now
    old_status = app_row["status"]
    
    await conn.execute("""
    UPDATE applications 
    SET status = 'Applied', applied_at = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
    """, (applied_time, now, app_id, user_id))
    
    # Event
    await conn.execute("""
    INSERT INTO application_events (id, user_id, application_id, event_type, previous_value, new_value, description, created_at)
    VALUES (?, ?, ?, 'status_change', ?, 'Applied', 'Application submission confirmed by student.', ?)
    """, (new_uuid(), user_id, app_id, old_status, now))
    
    # Record answers linked to this application
    if req.used_answers:
        for ans in req.used_answers:
            ans_id = new_uuid()
            await conn.execute("""
            INSERT INTO application_answers (id, user_id, application_id, question, answer, source_answer_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (ans_id, user_id, app_id, ans.question.strip(), ans.answer.strip(), ans.source_answer_id, now))
            if ans.source_answer_id:
                await conn.execute("UPDATE answers SET last_used_at = ? WHERE id = ? AND user_id = ?", (now, ans.source_answer_id, user_id))

    # Create follow-up reminder (default 7 days) if requested
    if req.create_reminder:
        reminder_time = (datetime.now(timezone.utc) + timedelta(days=req.reminder_days)).isoformat()
        await conn.execute("""
        INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'follow_up', 'pending', ?, ?)
        """, (new_uuid(), user_id, app_id, reminder_time, now, now))
        
    await conn.commit()
    
    cursor = await conn.execute("SELECT * FROM applications WHERE id = ?", (app_id,))
    updated_row = await cursor.fetchone()
    return ApplicationResponse(**dict(updated_row))

@router.post("/{app_id}/answers")
async def add_application_answer(
    app_id: str,
    req: Dict[str, Any],
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Records an answer used in this application and updates last_used_at."""
    cursor = await conn.execute("SELECT id FROM applications WHERE id = ? AND user_id = ?", (app_id, user_id))
    if not await cursor.fetchone():
        raise HTTPException(status_code=404, detail="Application not found.")
        
    ans_id = new_uuid()
    now = now_iso()
    q = req.get("question", "").strip()
    a = req.get("answer", "").strip()
    source_id = req.get("source_answer_id")
    
    await conn.execute("""
    INSERT INTO application_answers (id, user_id, application_id, question, answer, source_answer_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (ans_id, user_id, app_id, q, a, source_id, now))
    
    if source_id:
        await conn.execute("UPDATE answers SET last_used_at = ? WHERE id = ? AND user_id = ?", (now, source_id, user_id))
        
    await conn.commit()
    return {"id": ans_id, "application_id": app_id, "question": q, "answer": a, "source_answer_id": source_id, "created_at": now}

@router.post("/{app_id}/events", response_model=ApplicationEventResponse)
async def add_application_event(
    app_id: str,
    req: ApplicationEventCreate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Appends a custom timeline event to an application."""
    evt_id = new_uuid()
    now = now_iso()
    await conn.execute("""
    INSERT INTO application_events (id, user_id, application_id, event_type, previous_value, new_value, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (evt_id, user_id, app_id, req.event_type, req.previous_value, req.new_value, req.description, now))
    await conn.commit()
    
    return ApplicationEventResponse(
        id=evt_id,
        user_id=user_id,
        application_id=app_id,
        event_type=req.event_type,
        previous_value=req.previous_value,
        new_value=req.new_value,
        description=req.description,
        created_at=now
    )

@router.post("/{app_id}/followup-draft", response_model=FollowUpDraftResponse)
async def get_followup_draft_for_application(
    app_id: str,
    req: FollowUpDraftRequest,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Generates a professional follow-up draft and composer links for this application."""
    cursor = await conn.execute("SELECT * FROM applications WHERE id = ? AND user_id = ?", (app_id, user_id))
    app_row = await cursor.fetchone()
    if not app_row:
        raise HTTPException(status_code=404, detail="Application not found.")
        
    # Get student name from profile
    cursor_p = await conn.execute("SELECT full_name FROM profiles WHERE user_id = ?", (user_id,))
    p_row = await cursor_p.fetchone()
    student_name = p_row["full_name"] if p_row else "Applicant"
    
    hr_target = req.hr_email or app_row["hr_email"]
    
    draft = generate_followup_draft(
        company=app_row["company"],
        position=app_row["position"],
        student_name=student_name,
        applied_date_str=app_row["applied_at"],
        hr_email=hr_target,
        recipient_name=req.recipient_name,
        extra_notes=req.notes
    )
    
    return FollowUpDraftResponse(**draft)
