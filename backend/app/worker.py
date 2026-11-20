import asyncio
import logging
import aiosqlite
from datetime import datetime, timezone
from app.config import settings
from app.services.reminder_service import process_due_reminders

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("applyrecall_worker")

async def run_worker_cycle():
    """Runs a single reminder check pass over the database with error handling."""
    logger.info("Running reminder check cycle...")
    try:
        async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
            conn.row_factory = aiosqlite.Row
            await conn.execute("PRAGMA foreign_keys = ON;")
            results = await process_due_reminders(conn)
            if results:
                logger.info(f"Processed {len(results)} due reminder(s): {results}")
            else:
                logger.info("No due reminders to process.")
            return results
    except Exception as e:
        logger.error(f"Error during reminder check cycle: {e}", exc_info=True)
        return []

async def start_worker_loop(interval_seconds: int = 30):
    """Continuously runs the reminder worker in the background."""
    logger.info(f"Starting ApplyRecall background reminder worker (interval: {interval_seconds}s, env: {settings.APP_ENV})...")
    while True:
        try:
            await run_worker_cycle()
        except asyncio.CancelledError:
            logger.info("Worker loop received cancellation signal. Shutting down gracefully...")
            break
        except Exception as e:
            logger.error(f"Unexpected error in reminder worker loop: {e}", exc_info=True)
            
        await asyncio.sleep(interval_seconds)

if __name__ == "__main__":
    asyncio.run(start_worker_loop(interval_seconds=15))
