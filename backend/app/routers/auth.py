import secrets
import string
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Header
from app.config import settings
from app.database import get_db, now_iso, new_uuid
from app.models.schemas import (
    GeneratePairingCodeRequest,
    GeneratePairingCodeResponse,
    VerifyPairingCodeRequest,
    VerifyPairingCodeResponse
)

router = APIRouter(prefix="/auth", tags=["auth"])

def get_current_user_id(authorization: str = Header(None)) -> str:
    """
    Extracts user_id from Bearer token.
    Falls back to settings.DEFAULT_USER_ID for local convenience if no token or dev mode.
    """
    if not authorization:
        return settings.DEFAULT_USER_ID
    
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1].strip()
        # For our MVP token system, we allow Bearer <user_id> or test token
        if token.startswith("tok_"):
            return token.replace("tok_", "")
        if len(token) >= 20: # UUID format
            return token
            
    return settings.DEFAULT_USER_ID

@router.post("/pair/generate", response_model=GeneratePairingCodeResponse)
async def generate_pairing_code(
    req: GeneratePairingCodeRequest,
    user_id: str = Depends(get_current_user_id),
    conn = Depends(get_db)
):
    """Generates a secure 6-character pairing code valid for 15 minutes."""
    chars = string.ascii_uppercase + string.digits
    code = "".join(secrets.choice(chars) for _ in range(6))
    
    expires_at = (datetime.now(timezone.utc) + timedelta(minutes=settings.PAIRING_CODE_EXPIRY_MINUTES)).isoformat()
    
    await conn.execute("""
    INSERT INTO pairing_codes (id, user_id, code_hash, device_type, expires_at)
    VALUES (?, ?, ?, ?, ?)
    """, (new_uuid(), user_id, code, req.device_type, expires_at))
    await conn.commit()
    
    return GeneratePairingCodeResponse(
        code=code,
        device_type=req.device_type,
        expires_at=expires_at
    )

@router.post("/pair/verify", response_model=VerifyPairingCodeResponse)
async def verify_pairing_code(
    req: VerifyPairingCodeRequest,
    conn = Depends(get_db)
):
    """Verifies a pairing code and returns authentication token and profile summary."""
    clean_code = req.code.strip().upper()
    
    cursor = await conn.execute("""
    SELECT id, user_id, expires_at, used_at, device_type
    FROM pairing_codes
    WHERE code_hash = ? AND device_type = ?
    """, (clean_code, req.device_type))
    
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(status_code=400, detail="Invalid pairing code.")
        
    if row["used_at"]:
        raise HTTPException(status_code=400, detail="This pairing code has already been used.")
        
    now_dt = datetime.now(timezone.utc)
    expires_dt = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if now_dt > expires_dt:
        raise HTTPException(status_code=400, detail="Pairing code has expired. Please generate a new one.")
        
    matched_user_id = row["user_id"]
    now = now_iso()
    
    # Mark code as used
    await conn.execute("UPDATE pairing_codes SET used_at = ? WHERE id = ?", (now, row["id"]))
    
    # If device is telegram and chat_id is supplied
    if req.device_type == "telegram" and req.chat_id:
        await conn.execute("""
        INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active)
        VALUES (?, ?, ?, ?, 1)
        ON CONFLICT(chat_id) DO UPDATE SET user_id = excluded.user_id, is_active = 1;
        """, (new_uuid(), matched_user_id, str(req.chat_id), now))
        
    await conn.commit()
    
    # Fetch profile
    cursor_p = await conn.execute("SELECT * FROM profiles WHERE user_id = ?", (matched_user_id,))
    p_row = await cursor_p.fetchone()
    profile_data = dict(p_row) if p_row else {}
    
    token = f"tok_{matched_user_id}"
    return VerifyPairingCodeResponse(
        success=True,
        user_id=matched_user_id,
        token=token,
        message=f"{req.device_type.capitalize()} paired successfully.",
        profile=profile_data
    )

@router.post("/extension/link", response_model=VerifyPairingCodeResponse)
async def link_extension(req: VerifyPairingCodeRequest, conn = Depends(get_db)):
    """Dedicated alias for Chrome extension pairing."""
    req.device_type = "extension"
    return await verify_pairing_code(req, conn)

@router.post("/telegram/link", response_model=VerifyPairingCodeResponse)
async def link_telegram(req: VerifyPairingCodeRequest, conn = Depends(get_db)):
    """Dedicated alias for Telegram linking."""
    req.device_type = "telegram"
    return await verify_pairing_code(req, conn)
