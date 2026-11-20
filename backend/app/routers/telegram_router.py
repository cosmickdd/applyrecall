from fastapi import APIRouter, Depends, Request, HTTPException
from typing import Dict, Any
from app.database import get_db
from app.services.telegram_service import handle_telegram_text, send_telegram_message

router = APIRouter(prefix="/telegram", tags=["telegram"])

@router.post("/webhook")
async def telegram_webhook(request: Request, conn = Depends(get_db)):
    """Receives webhook updates from Telegram Bot API."""
    data = await request.json()
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
async def simulate_telegram_message(request: Request, conn = Depends(get_db)):
    """
    Test/Simulation endpoint: allows testing Telegram bot conversations
    directly from tests, CLI, or the web dashboard.
    Payload: {"chat_id": "12345", "text": "/summary"}
    """
    data = await request.json()
    chat_id = str(data.get("chat_id", "simulated_chat_1"))
    text = data.get("text", "")
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required.")
        
    reply = await handle_telegram_text(conn, chat_id, text)
    return {
        "chat_id": chat_id,
        "input": text,
        "reply": reply
    }
