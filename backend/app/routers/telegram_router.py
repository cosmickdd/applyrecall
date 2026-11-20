import hmac
from fastapi import APIRouter, Depends, Request, HTTPException, Header
from typing import Dict, Any, Optional
from app.config import settings
from app.database import get_db
from app.services.telegram_service import handle_telegram_text, send_telegram_message

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(None, alias="X-Telegram-Bot-Api-Secret-Token"),
    conn=Depends(get_db),
):
    """Receives webhook updates from Telegram Bot API with secret verification."""
    # Verify webhook secret if configured
    if settings.TELEGRAM_WEBHOOK_SECRET:
        if not x_telegram_bot_api_secret_token or not hmac.compare_digest(
            x_telegram_bot_api_secret_token, settings.TELEGRAM_WEBHOOK_SECRET
        ):
            raise HTTPException(status_code=403, detail="Invalid webhook secret.")

    data = await request.json()

    # Deduplicate updates using update_id
    update_id = data.get("update_id")
    if update_id:
        cursor = await conn.execute(
            "SELECT update_id FROM telegram_processed_updates WHERE update_id = ?",
            (update_id,),
        )
        if await cursor.fetchone():
            return {"status": "duplicate_ignored"}
        await conn.execute(
            "INSERT INTO telegram_processed_updates (update_id) VALUES (?)",
            (update_id,),
        )
        await conn.commit()

    message = data.get("message") or data.get("edited_message")
    if not message:
        return {"status": "ignored"}

    chat = message.get("chat", {})
    chat_id = str(chat.get("id"))
    text = message.get("text", "")

    if chat_id and text:
        reply = await handle_telegram_text(conn, chat_id, text)
        await send_telegram_message(chat_id, reply)

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
