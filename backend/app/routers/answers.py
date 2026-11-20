from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional
from app.database import get_db, now_iso, new_uuid
from app.routers.auth import get_current_user_id
from app.models.schemas import (
    AnswerCreate,
    AnswerUpdate,
    AnswerResponse,
    AnswerMatchRequest,
    AnswerMatchResponse
)
from app.services.matching import match_question

router = APIRouter(prefix="/answers", tags=["answers"])

@router.get("", response_model=List[AnswerResponse])
async def list_answers(
    scope: Optional[str] = Query(None, description="general, company, or application"),
    search: Optional[str] = Query(None, description="Search question, answer, or tags"),
    company: Optional[str] = Query(None, description="Filter by company"),
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Retrieves all answers in the student's answer library with filtering."""
    query = "SELECT * FROM answers WHERE user_id = ?"
    params = [user_id]
    
    if scope:
        query += " AND scope = ?"
        params.append(scope)
        
    if company:
        query += " AND lower(company) = ?"
        params.append(company.lower())
        
    if search:
        query += " AND (lower(question) LIKE ? OR lower(answer) LIKE ? OR lower(tags) LIKE ?)"
        s = f"%{search.lower()}%"
        params.extend([s, s, s])
        
    query += " ORDER BY updated_at DESC"
    
    cursor = await conn.execute(query, params)
    rows = await cursor.fetchall()
    return [AnswerResponse(**dict(r)) for r in rows]

@router.post("", response_model=AnswerResponse)
async def create_answer(
    req: AnswerCreate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Saves a new answer to the student's library."""
    ans_id = new_uuid()
    now = now_iso()
    
    # Scoping validation
    if req.scope == "company" and not req.company:
        raise HTTPException(status_code=400, detail="Company name is required for company-scoped answers.")
        
    await conn.execute("""
    INSERT INTO answers (id, user_id, question, answer, scope, company, role, tags, created_at, updated_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, (
        ans_id, user_id, req.question.strip(), req.answer.strip(),
        req.scope, req.company.strip() if req.company else None,
        req.role.strip() if req.role else None,
        req.tags.strip() if req.tags else None,
        now, now, now
    ))
    await conn.commit()
    
    cursor = await conn.execute("SELECT * FROM answers WHERE id = ?", (ans_id,))
    row = await cursor.fetchone()
    return AnswerResponse(**dict(row))

@router.patch("/{ans_id}", response_model=AnswerResponse)
async def update_answer(
    ans_id: str,
    req: AnswerUpdate,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Updates an existing answer in the library."""
    cursor = await conn.execute("SELECT * FROM answers WHERE id = ? AND user_id = ?", (ans_id, user_id))
    existing = await cursor.fetchone()
    if not existing:
        raise HTTPException(status_code=404, detail="Answer not found.")
        
    update_data = req.model_dump(exclude_unset=True)
    if not update_data:
        return AnswerResponse(**dict(existing))
        
    update_data["updated_at"] = now_iso()
    fields = [f"{k} = ?" for k in update_data.keys()]
    values = list(update_data.values())
    values.extend([ans_id, user_id])
    
    query = f"UPDATE answers SET {', '.join(fields)} WHERE id = ? AND user_id = ?"
    await conn.execute(query, values)
    await conn.commit()
    
    cursor = await conn.execute("SELECT * FROM answers WHERE id = ?", (ans_id,))
    updated_row = await cursor.fetchone()
    return AnswerResponse(**dict(updated_row))

@router.delete("/{ans_id}")
async def delete_answer(
    ans_id: str,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Deletes an answer from the library."""
    await conn.execute("DELETE FROM answers WHERE id = ? AND user_id = ?", (ans_id, user_id))
    await conn.commit()
    return {"success": True, "message": "Answer removed from library."}

@router.post("/match", response_model=AnswerMatchResponse)
async def match_answer_for_question(
    req: AnswerMatchRequest,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """
    Given a question and current job context (company, role), searches the student's
    approved answers and returns the best matching candidate, respecting strict scoping.
    """
    cursor = await conn.execute("SELECT * FROM answers WHERE user_id = ?", (user_id,))
    all_answers = [dict(r) for r in await cursor.fetchall()]
    
    matched, confidence, match_type, explanation = match_question(
        incoming_question=req.question,
        answers_pool=all_answers,
        target_company=req.company,
        target_role=req.role
    )
    
    if matched:
        # Update last_used_at timestamp
        now = now_iso()
        await conn.execute("UPDATE answers SET last_used_at = ? WHERE id = ?", (now, matched["id"]))
        await conn.commit()
        
        return AnswerMatchResponse(
            matched=True,
            answer=AnswerResponse(**matched),
            confidence=confidence,
            match_type=match_type,
            explanation=explanation
        )
        
    return AnswerMatchResponse(
        matched=False,
        confidence=0.0,
        match_type="none",
        explanation=explanation
    )
