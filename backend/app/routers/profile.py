from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from typing import Dict, Any, List
from app.database import get_db, now_iso, new_uuid
from app.routers.auth import get_current_user_id, ensure_profile_exists
from app.services.resume_parser import MAX_RESUME_BYTES, extract_resume_text, parse_resume
from app.models.schemas import (
    ProfileUpdate,
    ProfileResponse,
    ExperienceCreate,
    ExperienceResponse,
    ProjectCreate,
    ProjectResponse
)

router = APIRouter(prefix="/profile", tags=["profile"])

@router.get("", response_model=Dict[str, Any])
async def get_profile(user_id: str = Depends(get_current_user_id), conn = Depends(get_db)):
    """Retrieves the complete profile, experiences, and projects for the student."""
    await ensure_profile_exists(conn, user_id)
    cursor = await conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,))
    p_row = await cursor.fetchone()
    if not p_row:
        raise HTTPException(status_code=404, detail="Profile not found.")
        
    profile = dict(p_row)
    
    # Get experiences
    cursor_exp = await conn.execute(
        "SELECT * FROM experiences WHERE user_id = ? ORDER BY start_date DESC",
        (user_id,)
    )
    exp_rows = await cursor_exp.fetchall()
    experiences = [dict(r) for r in exp_rows]
    
    # Get projects
    cursor_proj = await conn.execute(
        "SELECT * FROM projects WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,)
    )
    proj_rows = await cursor_proj.fetchall()
    projects = [dict(r) for r in proj_rows]
    
    return {
        "profile": profile,
        "experiences": experiences,
        "projects": projects
    }

@router.patch("", response_model=Dict[str, Any])
async def update_profile(
    req: ProfileUpdate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Updates student profile fields."""
    await ensure_profile_exists(conn, user_id)
    cursor = await conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,))
    existing = await cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Profile not found.")
        
    update_data = req.model_dump(exclude_unset=True)
    if not update_data:
        return {"profile": dict(existing), "message": "No changes provided"}
        
    update_data["updated_at"] = now_iso()
    
    # Auto compute full_name if first_name / last_name provided
    if "first_name" in update_data or "last_name" in update_data:
        fn = update_data.get("first_name", existing["first_name"] or "")
        ln = update_data.get("last_name", existing["last_name"] or "")
        update_data["full_name"] = f"{fn} {ln}".strip()

    fields = [f"{k} = ?" for k in update_data.keys()]
    values = list(update_data.values())
    values.append(user_id)
    
    query = f"UPDATE profiles SET {', '.join(fields)} WHERE user_id = ?"
    await conn.execute(query, values)
    await conn.commit()
    
    cursor = await conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,))
    updated_row = await cursor.fetchone()
    return {"profile": dict(updated_row), "message": "Profile updated successfully."}

@router.post("/resume-autofill", response_model=Dict[str, Any])
async def resume_autofill(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id)
):
    """Reads an uploaded resume and returns the profile fields found in it.

    The dashboard uses the response to prefill the profile form, so students do not
    have to retype details that every application asks for anyway.
    """
    data = await file.read()
    if len(data) > MAX_RESUME_BYTES:
        raise HTTPException(
            status_code=413,
            detail="Resume is larger than 5 MB. Please upload a smaller file."
        )

    try:
        text = extract_resume_text(file.filename or "", data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if len(text.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="We could not read any text from that resume. If it is a scanned PDF, upload a text-based PDF, DOCX, or TXT file instead."
        )

    fields = parse_resume(text)
    return {
        "fields": fields,
        "detected_fields": len(fields),
        "source_filename": file.filename,
    }

@router.post("/experiences", response_model=ExperienceResponse)
async def add_experience(
    req: ExperienceCreate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Adds a new work or internship experience."""
    await ensure_profile_exists(conn, user_id)
    exp_id = new_uuid()
    now = now_iso()
    await conn.execute("""
    INSERT INTO experiences (id, user_id, company, position, description, start_date, end_date, is_current, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        exp_id, user_id, req.company, req.position, req.description,
        req.start_date, req.end_date, bool(req.is_current), now
    ))
    await conn.commit()
    
    return ExperienceResponse(
        id=exp_id,
        user_id=user_id,
        company=req.company,
        position=req.position,
        description=req.description,
        start_date=req.start_date,
        end_date=req.end_date,
        is_current=req.is_current,
        created_at=now
    )

@router.delete("/experiences/{exp_id}")
async def delete_experience(
    exp_id: str,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Removes an experience entry."""
    await conn.execute("DELETE FROM experiences WHERE id = ? AND user_id = ?", (exp_id, user_id))
    await conn.commit()
    return {"success": True, "message": "Experience deleted."}

@router.post("/projects", response_model=ProjectResponse)
async def add_project(
    req: ProjectCreate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Adds a project entry."""
    await ensure_profile_exists(conn, user_id)
    proj_id = new_uuid()
    now = now_iso()
    await conn.execute("""
    INSERT INTO projects (id, user_id, name, description, project_url, technologies, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (proj_id, user_id, req.name, req.description, req.project_url, req.technologies, now))
    await conn.commit()
    
    return ProjectResponse(
        id=proj_id,
        user_id=user_id,
        name=req.name,
        description=req.description,
        project_url=req.project_url,
        technologies=req.technologies,
        created_at=now
    )

@router.delete("/projects/{proj_id}")
async def delete_project(
    proj_id: str,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Removes a project entry."""
    await conn.execute("DELETE FROM projects WHERE id = ? AND user_id = ?", (proj_id, user_id))
    await conn.commit()
    return {"success": True, "message": "Project deleted."}

@router.get("/export")
async def export_all_user_data(
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Exports all student data (profile, answers, applications, reminders, events)."""
    p = await conn.execute("SELECT * FROM profiles WHERE user_id = ?", (user_id,))
    profile = await p.fetchone()
    
    ans = await conn.execute("SELECT * FROM answers WHERE user_id = ?", (user_id,))
    answers = [dict(r) for r in await ans.fetchall()]
    
    apps = await conn.execute("SELECT * FROM applications WHERE user_id = ?", (user_id,))
    applications = [dict(r) for r in await apps.fetchall()]
    
    rems = await conn.execute("SELECT * FROM reminders WHERE user_id = ?", (user_id,))
    reminders = [dict(r) for r in await rems.fetchall()]
    
    evts = await conn.execute("SELECT * FROM application_events WHERE user_id = ?", (user_id,))
    events = [dict(r) for r in await evts.fetchall()]
    
    return {
        "exported_at": now_iso(),
        "user_id": user_id,
        "profile": dict(profile) if profile else None,
        "answers": answers,
        "applications": applications,
        "reminders": reminders,
        "events": events
    }

@router.delete("/account")
async def delete_account(
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Deletes all user records permanently."""
    await conn.execute("DELETE FROM profiles WHERE user_id = ?", (user_id,))
    await conn.commit()
    return {"success": True, "message": "Account and all associated records deleted."}
