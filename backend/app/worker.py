import asyncio
import logging
from datetime import datetime, timezone
from app.config import settings
from app.database import init_db, get_worker_db_context, close_all_pg_pools
from app.services.reminder_service import process_due_reminders

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("applyrecall_worker")

async def run_worker_cycle():
    """Runs a single reminder check pass over the shared database (PostgreSQL or SQLite)."""
    logger.info("Running reminder check cycle...")
    try:
        async with get_worker_db_context() as conn:
            results = await process_due_reminders(conn)
            if results:
                logger.info(f"Processed {len(results)} due reminder(s): {results}")
            else:
                logger.info("No due reminders to process.")
            return results
    except Exception as e:
        logger.error(f"Error during reminder check cycle: {e}", exc_info=True)
        return []

async def start_worker_loop(interval_seconds: int = 15):
    """Continuously runs the reminder worker in the background."""
    # Ensure production environment validity & database schema initialization
    settings.validate_production()
    await init_db()
    
    logger.info(
        f"Starting ApplyRecall background reminder worker "
        f"(interval: {interval_seconds}s, env: {settings.APP_ENV}, db: {'PostgreSQL' if settings.use_postgres else 'SQLite'})..."
    )
    try:
        while True:
            try:
                await run_worker_cycle()
            except asyncio.CancelledError:
                logger.info("Worker loop received cancellation signal. Shutting down gracefully...")
                break
            except Exception as e:
                logger.error(f"Unexpected error in reminder worker cycle: {e}", exc_info=True)
                
            await asyncio.sleep(interval_seconds)
    finally:
        if settings.use_postgres:
            await close_all_pg_pools()

if __name__ == "__main__":
    asyncio.run(start_worker_loop(interval_seconds=settings.WORKER_INTERVAL_SECONDS))
