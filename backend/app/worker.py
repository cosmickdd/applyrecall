import asyncio
import logging
import aiosqlite
from datetime import datetime, timezone
from app.config import settings
from app.services.reminder_service import process_due_reminders

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("applyrecall_worker")

async def run_worker_cycle():
    """Runs a single reminder check pass over the database."""
    logger.info("Running reminder check cycle...")
    async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON;")
        results = await process_due_reminders(conn)
        if results:
            logger.info(f"Processed {len(results)} due reminders: {results}")
        else:
            logger.info("No due reminders to process.")
        return results

async def start_worker_loop(interval_seconds: int = 30):
    """Continuously runs the reminder worker in the background."""
    logger.info(f"Starting ApplyRecall background reminder worker (interval: {interval_seconds}s)...")
    while True:
        try:
            await run_worker_cycle()
        except Exception as e:
            logger.error(f"Error in reminder worker loop: {e}", exc_info=True)
            
        await asyncio.sleep(interval_seconds)

if __name__ == "__main__":
    asyncio.run(start_worker_loop(interval_seconds=15))
