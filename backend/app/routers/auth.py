import hashlib
import secrets
import string
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from app.config import settings
from app.database import get_db, now_iso, new_uuid
from app.models.schemas import (
    GeneratePairingCodeRequest,
    GeneratePairingCodeResponse,
    VerifyPairingCodeRequest,
    VerifyPairingCodeResponse,
    DeviceConnectionResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# In-memory rate limiter for pairing attempts (per IP)
_pairing_attempts: dict[str, list[float]] = defaultdict(list)


def _hash_code(code: str) -> str:
    """SHA-256 hash a pairing code for storage."""
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def _generate_device_token() -> str:
    """Generate a cryptographically random opaque device token."""
    return secrets.token_urlsafe(settings.DEVICE_TOKEN_BYTES)


def _hash_token(token: str) -> str:
    """SHA-256 hash a device token for storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _validate_supabase_jwt(token: str) -> str:
    """
    Validates a Supabase-issued JWT and returns the user_id (sub claim).
    Checks: signature, expiry, issuer structure.
    """
    if not settings.SUPABASE_JWT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Server authentication not configured. SUPABASE_JWT_SECRET is missing."
        )

    try:
        # Supabase JWTs use HS256 with the JWT secret from project settings
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={
                "require": ["sub", "exp", "iat"],
                "verify_exp": True,
                "verify_iat": True,
            },
            # Supabase issuer format: https://<project-ref>.supabase.co/auth/v1
            # We validate it's present and from supabase
            audience=None,  # Supabase doesn't set aud by default for user JWTs
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please sign in again.")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token missing user identity (sub claim).")

    # Validate issuer contains supabase if SUPABASE_URL is set
    iss = payload.get("iss", "")
    if settings.SUPABASE_URL and "supabase" not in iss:
        raise HTTPException(status_code=401, detail="Token issuer not recognized.")

    return user_id


def _validate_device_token(token: str, conn) -> str:
    """
    Validates a device token (used by Chrome extension) by checking its hash
    in the device_connections table. This is a synchronous check placeholder;
    actual validation happens in the async dependency.
    """
    # This is handled in the async get_current_user_id
    raise NotImplementedError


async def get_current_user_id(
    authorization: str = Header(None),
    x_device_token: str = Header(None, alias="X-Device-Token"),
    conn=Depends(get_db),
) -> str:
    """
    Extracts and validates user identity from request credentials.

    Authentication methods (in priority order):
    1. Supabase JWT in Authorization: Bearer <jwt> header
    2. Device token in X-Device-Token header (for paired Chrome extension)
    3. Development-only: Bearer <user_id> when APP_ENV=development

    Never falls back to a default user. Always rejects unauthenticated requests.
    """
    # Method 1: Device token (Chrome extension / Telegram device)
    if x_device_token:
        token_hash = _hash_token(x_device_token)
        cursor = await conn.execute(
            "SELECT user_id, is_active FROM device_connections WHERE token_hash = ?",
            (token_hash,)
        )
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="Invalid device token. Please re-pair your device.")
        if not row["is_active"]:
            raise HTTPException(status_code=401, detail="Device has been revoked. Please re-pair.")

        # Update last_used_at
        await conn.execute(
            "UPDATE device_connections SET last_used_at = ? WHERE token_hash = ?",
            (now_iso(), token_hash)
        )
        await conn.commit()
        return row["user_id"]

    # Method 2: Authorization header
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide a valid Bearer token or device token."
        )

    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Invalid Authorization header format. Use: Bearer <token>")

    token = parts[1].strip()

    # Try Supabase JWT validation first
    if settings.SUPABASE_JWT_SECRET:
        return _validate_supabase_jwt(token)

    # Development-only fallback: accept UUID-format bearer tokens
    if not settings.is_production:
        # Validate it looks like a UUID (basic check)
        import re
        uuid_pattern = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            re.IGNORECASE
        )
        if uuid_pattern.match(token):
            # Verify user exists in database
            cursor = await conn.execute(
                "SELECT user_id FROM profiles WHERE user_id = ?", (token,)
            )
            row = await cursor.fetchone()
            if row:
                return token
            raise HTTPException(
                status_code=401,
                detail="User not found. Invalid development token."
            )

    raise HTTPException(
        status_code=401,
        detail="Authentication failed. Please sign in through the dashboard."
    )


def _check_rate_limit(client_ip: str) -> None:
    """Rate-limit pairing attempts: max N per hour per IP."""
    now = time.time()
    cutoff = now - 3600
    attempts = _pairing_attempts[client_ip]
    # Prune old attempts
    _pairing_attempts[client_ip] = [t for t in attempts if t > cutoff]
    if len(_pairing_attempts[client_ip]) >= settings.PAIRING_MAX_ATTEMPTS_PER_HOUR:
        raise HTTPException(
            status_code=429,
            detail="Too many pairing attempts. Please try again later."
        )
    _pairing_attempts[client_ip].append(now)


@router.post("/pair/generate", response_model=GeneratePairingCodeResponse)
async def generate_pairing_code(
    req: GeneratePairingCodeRequest,
    user_id: str = Depends(get_current_user_id),
    conn=Depends(get_db),
):
    """Generates a secure 6-character pairing code valid for 5 minutes."""
    chars = string.ascii_uppercase + string.digits
    code = "".join(secrets.choice(chars) for _ in range(6))
    code_hash = _hash_code(code)

    expires_at = (
        datetime.now(timezone.utc) + timedelta(minutes=settings.PAIRING_CODE_EXPIRY_MINUTES)
    ).isoformat()

    # Invalidate any existing unused codes for this user+device_type
    await conn.execute(
        "UPDATE pairing_codes SET used_at = ? WHERE user_id = ? AND device_type = ? AND used_at IS NULL",
        (now_iso(), user_id, req.device_type),
    )

    await conn.execute(
        """
        INSERT INTO pairing_codes (id, user_id, code_hash, device_type, expires_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (new_uuid(), user_id, code_hash, req.device_type, expires_at),
    )
    await conn.commit()

    return GeneratePairingCodeResponse(
        code=code,
        device_type=req.device_type,
        expires_at=expires_at,
    )


@router.post("/pair/verify", response_model=VerifyPairingCodeResponse)
async def verify_pairing_code(
    req: VerifyPairingCodeRequest,
    request: Request,
    conn=Depends(get_db),
):
    """Verifies a pairing code atomically and issues a secure device token."""
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    clean_code = req.code.strip().upper()
    code_hash = _hash_code(clean_code)

    # Atomic: find unused, unexpired code and mark it used in one step
    now_dt = datetime.now(timezone.utc)
    now = now_iso()

    cursor = await conn.execute(
        """
        SELECT id, user_id, expires_at, used_at, device_type
        FROM pairing_codes
        WHERE code_hash = ? AND device_type = ? AND used_at IS NULL
        """,
        (code_hash, req.device_type),
    )
    row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=400, detail="Invalid or already used pairing code.")

    expires_dt = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if now_dt > expires_dt:
        raise HTTPException(
            status_code=400,
            detail="Pairing code has expired. Please generate a new one.",
        )

    matched_user_id = row["user_id"]

    # Mark code as used atomically
    result = await conn.execute(
        "UPDATE pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL",
        (now, row["id"]),
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=400, detail="Pairing code was already used.")

    # Generate secure device token
    device_token = _generate_device_token()
    device_token_hash = _hash_token(device_token)
    device_name = req.device_name or f"{req.device_type}-{now_dt.strftime('%Y%m%d')}"

    await conn.execute(
        """
        INSERT INTO device_connections (id, user_id, device_type, device_name, token_hash, is_active, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (new_uuid(), matched_user_id, req.device_type, device_name, device_token_hash, now, now),
    )

    # If device is telegram and chat_id is supplied, link the chat
    if req.device_type == "telegram" and req.chat_id:
        await conn.execute(
            """
            INSERT INTO telegram_connections (id, user_id, chat_id, connected_at, is_active)
            VALUES (?, ?, ?, ?, 1)
            ON CONFLICT(chat_id) DO UPDATE SET user_id = excluded.user_id, is_active = 1, connected_at = excluded.connected_at;
            """,
            (new_uuid(), matched_user_id, str(req.chat_id), now),
        )

    await conn.commit()

    # Fetch profile summary
    cursor_p = await conn.execute(
        "SELECT * FROM profiles WHERE user_id = ?", (matched_user_id,)
    )
    p_row = await cursor_p.fetchone()
    profile_data = dict(p_row) if p_row else {}

    return VerifyPairingCodeResponse(
        success=True,
        user_id=matched_user_id,
        token=device_token,
        message=f"{req.device_type.capitalize()} paired successfully.",
        profile=profile_data,
    )


@router.post("/extension/link", response_model=VerifyPairingCodeResponse)
async def link_extension(
    req: VerifyPairingCodeRequest,
    request: Request,
    conn=Depends(get_db),
):
    """Dedicated alias for Chrome extension pairing."""
    req.device_type = "extension"
    return await verify_pairing_code(req, request, conn)


@router.post("/telegram/link", response_model=VerifyPairingCodeResponse)
async def link_telegram(
    req: VerifyPairingCodeRequest,
    request: Request,
    conn=Depends(get_db),
):
    """Dedicated alias for Telegram linking."""
    req.device_type = "telegram"
    return await verify_pairing_code(req, request, conn)


@router.get("/devices", response_model=list[DeviceConnectionResponse])
async def list_connected_devices(
    user_id: str = Depends(get_current_user_id),
    conn=Depends(get_db),
):
    """Lists all connected devices for the authenticated user."""
    cursor = await conn.execute(
        "SELECT id, device_type, device_name, is_active, created_at, last_used_at FROM device_connections WHERE user_id = ? ORDER BY created_at DESC",
        (user_id,),
    )
    rows = await cursor.fetchall()
    return [DeviceConnectionResponse(**dict(r)) for r in rows]


@router.delete("/devices/{device_id}")
async def revoke_device(
    device_id: str,
    user_id: str = Depends(get_current_user_id),
    conn=Depends(get_db),
):
    """Revokes a connected device, invalidating its token."""
    result = await conn.execute(
        "UPDATE device_connections SET is_active = 0 WHERE id = ? AND user_id = ?",
        (device_id, user_id),
    )
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Device not found.")
    return {"success": True, "message": "Device revoked successfully."}
