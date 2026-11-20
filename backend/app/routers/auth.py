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
from app.database import get_db, now_iso, new_uuid, db_transaction
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
    Checks:
    - Signature (HS256 with SUPABASE_JWT_SECRET or RS256/ES256 with Supabase JWKS)
    - Expiry (exp claim)
    - Issued-at (iat claim)
    - Audience (must be 'authenticated' as issued by Supabase Auth)
    - Issuer (must match Supabase project if SUPABASE_URL configured)
    - Subject (sub claim must be present and non-empty)
    """
    # 1. Decode unverified header to inspect algorithm and kid
    try:
        unverified_header = jwt.get_unverified_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Malformed JWT header structure.")

    alg = unverified_header.get("alg")
    if not alg or alg not in settings.JWT_ALLOWED_ALGORITHMS:
        raise HTTPException(
            status_code=401,
            detail=f"Unsupported signing algorithm '{alg}'. Allowed: {', '.join(settings.JWT_ALLOWED_ALGORITHMS)}"
        )

    # 2. Determine verification key
    key = None
    if alg == "HS256":
        if not settings.SUPABASE_JWT_SECRET:
            raise HTTPException(
                status_code=500,
                detail="Server authentication not configured. SUPABASE_JWT_SECRET is missing."
            )
        key = settings.SUPABASE_JWT_SECRET
    elif alg in ("RS256", "ES256"):
        if settings.SUPABASE_URL:
            try:
                jwks_url = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1/.well-known/jwks.json"
                jwks_client = jwt.PyJWKClient(jwks_url)
                signing_key = jwks_client.get_signing_key_from_jwt(token)
                key = signing_key.key
            except Exception as e:
                raise HTTPException(status_code=401, detail=f"Failed to resolve JWKS key: {str(e)}")
        else:
            raise HTTPException(
                status_code=500,
                detail="Asymmetric JWT verification requires configured SUPABASE_URL."
            )

    # 3. Decode and verify payload
    expected_issuer = f"{settings.SUPABASE_URL.rstrip('/')}/auth/v1" if settings.SUPABASE_URL else None
    decode_options = {
        "require": ["sub", "exp", "iat", "aud"],
        "verify_exp": True,
        "verify_iat": True,
        "verify_aud": True,
    }
    if expected_issuer:
        decode_options["verify_iss"] = True

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=[alg],
            audience=settings.JWT_AUDIENCE,
            issuer=expected_issuer,
            options=decode_options,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired. Please sign in again.")
    except jwt.InvalidAudienceError:
        raise HTTPException(status_code=401, detail=f"Invalid token audience. Expected '{settings.JWT_AUDIENCE}'.")
    except jwt.InvalidIssuerError:
        raise HTTPException(status_code=401, detail="Invalid token issuer.")
    except jwt.InvalidSignatureError:
        raise HTTPException(status_code=401, detail="Invalid token signature.")
    except jwt.MissingRequiredClaimError as e:
        raise HTTPException(status_code=401, detail=f"Token missing required claim: {str(e)}")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")

    user_id = payload.get("sub")
    if not user_id or not str(user_id).strip():
        raise HTTPException(status_code=401, detail="Token subject claim is missing or empty.")

    return str(user_id)


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
        # Use system context for pre-auth device token lookup
        if hasattr(conn, "set_system_context"):
            await conn.set_system_context(True)
        cursor = await conn.execute(
            "SELECT user_id, is_active FROM device_connections WHERE token_hash = ?",
            (token_hash,)
        )
        row = await cursor.fetchone()
        if hasattr(conn, "set_system_context"):
            await conn.set_system_context(False)

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
        user_id = str(row["user_id"])
        if hasattr(conn, "set_session_user"):
            await conn.set_session_user(user_id)
        return user_id

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

    # If the token is in JWT format (3 dot-separated base64 segments) or we are in production, validate JWT
    if token.count(".") == 2 or settings.is_production:
        user_id = _validate_supabase_jwt(token)
        if hasattr(conn, "set_session_user"):
            await conn.set_session_user(user_id)
        return user_id

    # In development mode, check if SUPABASE_JWT_SECRET is explicitly configured
    if settings.SUPABASE_JWT_SECRET:
        try:
            user_id = _validate_supabase_jwt(token)
            if hasattr(conn, "set_session_user"):
                await conn.set_session_user(user_id)
            return user_id
        except HTTPException:
            pass

    # Development-only fallback: accept UUID-format bearer tokens when user exists
    if not settings.is_production:
        import re
        uuid_pattern = re.compile(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            re.IGNORECASE
        )
        if uuid_pattern.match(token):
            cursor = await conn.execute(
                "SELECT user_id FROM profiles WHERE user_id = ?", (token,)
            )
            row = await cursor.fetchone()
            if row:
                if hasattr(conn, "set_session_user"):
                    await conn.set_session_user(token)
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

    if hasattr(conn, "set_system_context"):
        await conn.set_system_context(True)

    cursor = await conn.execute(
        """
        SELECT id, user_id, expires_at, used_at, device_type
        FROM pairing_codes
        WHERE code_hash = ? AND device_type = ? AND used_at IS NULL
        """,
        (code_hash, req.device_type),
    )
    row = await cursor.fetchone()

    if hasattr(conn, "set_system_context"):
        await conn.set_system_context(False)

    if not row:
        raise HTTPException(status_code=400, detail="Invalid or already used pairing code.")

    expires_dt = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    if now_dt > expires_dt:
        raise HTTPException(
            status_code=400,
            detail="Pairing code has expired. Please generate a new one.",
        )

    matched_user_id = str(row["user_id"])
    if hasattr(conn, "set_session_user"):
        await conn.set_session_user(matched_user_id)

    # Generate secure device token
    device_token = _generate_device_token()
    device_token_hash = _hash_token(device_token)
    device_name = req.device_name or f"{req.device_type}-{now_dt.strftime('%Y%m%d')}"

    # Atomic multi-step operation: consume code + register device (+ link telegram if applicable)
    async with db_transaction(conn):
        # Mark code as used atomically
        result = await conn.execute(
            "UPDATE pairing_codes SET used_at = ? WHERE id = ? AND used_at IS NULL",
            (now, row["id"]),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=400, detail="Pairing code was already used.")

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
                VALUES (?, ?, ?, ?, TRUE)
                ON CONFLICT(chat_id) DO UPDATE SET user_id = excluded.user_id, is_active = TRUE, connected_at = excluded.connected_at;
                """,
                (new_uuid(), matched_user_id, str(req.chat_id), now),
            )

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
        "UPDATE device_connections SET is_active = FALSE WHERE id = ? AND user_id = ?",
        (device_id, user_id),
    )
    await conn.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Device not found.")
    return {"success": True, "message": "Device revoked successfully."}
