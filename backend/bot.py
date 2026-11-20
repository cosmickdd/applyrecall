import asyncio
import logging
import httpx
import aiosqlite
from app.config import settings
from app.database import init_db
from app.services.telegram_service import handle_telegram_text, send_telegram_message

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("applyrecall_bot")

async def run_bot_polling():
    """Runs Telegram long polling for incoming updates."""
    if not settings.TELEGRAM_BOT_TOKEN:
        logger.warning("TELEGRAM_BOT_TOKEN is not set. Bot polling will run in mock demonstration mode.")
        logger.info("To test Telegram interactively, you can also use the /api/telegram/simulate API endpoint.")
        return

    logger.info("Starting ApplyRecall Telegram Bot polling...")
    offset = 0
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/getUpdates"
    
    await init_db()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            try:
                resp = await client.get(url, params={"offset": offset, "timeout": 20})
                if resp.status_code == 200:
                    data = resp.json()
                    updates = data.get("result", [])
                    for update in updates:
                        offset = update["update_id"] + 1
                        msg = update.get("message") or update.get("edited_message")
                        if not msg:
                            continue
                        chat_id = str(msg.get("chat", {}).get("id"))
                        text = msg.get("text", "")
                        
                        if chat_id and text:
                            async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
                                conn.row_factory = aiosqlite.Row
                                reply = await handle_telegram_text(conn, chat_id, text)
                            await send_telegram_message(chat_id, reply)
            except Exception as e:
                logger.error(f"Error during Telegram update polling: {e}")
                await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(run_bot_polling())
