import hmac
import logging
from fastapi import APIRouter, Depends, Request, HTTPException, Header
from typing import Dict, Any, Optional
from app.config import settings
from app.database import get_db, now_iso
from app.services.telegram_service import handle_telegram_text, send_telegram_message

logger = logging.getLogger("applyrecall.telegram_router")
router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(None, alias="X-Telegram-Bot-Api-Secret-Token"),
    conn=Depends(get_db),
):
    """
    Receives webhook updates from Telegram Bot API with constant-time secret verification
    and transactional idempotency lifecycle (received -> processing -> processed / failed).
    """
    # 1. Webhook secret verification (Mandatory in production)
    if settings.is_production and not settings.TELEGRAM_WEBHOOK_SECRET:
        raise HTTPException(status_code=500, detail="TELEGRAM_WEBHOOK_SECRET must be configured in production.")

    if settings.TELEGRAM_WEBHOOK_SECRET:
        if not x_telegram_bot_api_secret_token or not hmac.compare_digest(
            x_telegram_bot_api_secret_token, settings.TELEGRAM_WEBHOOK_SECRET
        ):
            raise HTTPException(status_code=403, detail="Invalid or missing webhook secret token.")

    data = await request.json()
    update_id = data.get("update_id")

    # 2. Idempotency Check & Transactional Lifecycle
    if update_id is not None:
        cursor = await conn.execute(
            "SELECT update_id, status FROM telegram_processed_updates WHERE update_id = ?",
            (update_id,),
        )
        existing = await cursor.fetchone()
        if existing:
            st = existing["status"] if isinstance(existing, dict) or hasattr(existing, "__getitem__") else existing[1]
            if st == "processed":
                return {"status": "duplicate_ignored", "update_id": update_id}
            elif st == "processing":
                return {"status": "in_progress", "update_id": update_id}

        # Mark update as processing
        now = now_iso()
        await conn.execute(
            "INSERT INTO telegram_processed_updates (update_id, status, created_at) VALUES (?, 'processing', ?)"
            " ON CONFLICT(update_id) DO UPDATE SET status = 'processing';",
            (update_id, now),
        )
        await conn.commit()

    message = data.get("message") or data.get("edited_message")
    if not message:
        if update_id is not None:
            await conn.execute(
                "UPDATE telegram_processed_updates SET status = 'processed', processed_at = ? WHERE update_id = ?",
                (now_iso(), update_id),
            )
            await conn.commit()
        return {"status": "ignored"}

    chat = message.get("chat", {})
    chat_id = str(chat.get("id"))
    text = message.get("text", "")

    if chat_id and text:
        try:
            reply = await handle_telegram_text(conn, chat_id, text)
            await send_telegram_message(chat_id, reply)

            # Mark update permanently processed upon successful completion
            if update_id is not None:
                await conn.execute(
                    "UPDATE telegram_processed_updates SET status = 'processed', processed_at = ? WHERE update_id = ?",
                    (now_iso(), update_id),
                )
                await conn.commit()
        except Exception as e:
            logger.error(f"Error processing Telegram update {update_id}: {e}", exc_info=True)
            if update_id is not None:
                await conn.execute(
                    "UPDATE telegram_processed_updates SET status = 'failed' WHERE update_id = ?",
                    (update_id,),
                )
                await conn.commit()
            raise HTTPException(status_code=500, detail="Failed to process Telegram update.")

    return {"status": "ok"}


@router.post("/simulate")
async def simulate_telegram_message(
    request: Request,
    conn=Depends(get_db),
):
    """
    Test/Simulation endpoint: allows testing Telegram bot conversations
    directly from tests, CLI, or the web dashboard.
    ONLY available in development mode.
    Payload: {"chat_id": "12345", "text": "/summary"}
    """
    if settings.is_production:
        raise HTTPException(
            status_code=403,
            detail="Telegram simulation is not available in production.",
        )

    data = await request.json()
    chat_id = str(data.get("chat_id", "simulated_chat_1"))
    text = data.get("text", "")

    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")

    reply = await handle_telegram_text(conn, chat_id, text)
    return {
        "chat_id": chat_id,
        "input": text,
        "reply": reply,
    }
