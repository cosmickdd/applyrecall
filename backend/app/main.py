import os
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from app.config import settings
from app.database import init_db
from app.routers import auth, profile, answers, applications, reminders, dashboard, telegram_router

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: validate production requirements and initialize database schema
    settings.validate_production()
    await init_db()
    worker_task = None
    if settings.ENABLE_EMBEDDED_WORKER:
        from app.worker import start_worker_loop
        worker_task = asyncio.create_task(start_worker_loop(interval_seconds=settings.WORKER_INTERVAL_SECONDS))
    yield
    if worker_task:
        worker_task.cancel()
        try:
            await worker_task
        except (asyncio.CancelledError, Exception):
            pass
    # Shutdown: close database connection pools
    if settings.use_postgres:
        from app.database import close_all_pg_pools
        await close_all_pg_pools()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Backend API for ApplyRecall — The intelligent job application memory & assistant",
    version="1.1.0",
    lifespan=lifespan
)

# CORS configuration — specific origins, not wildcard
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Device-Token", "X-Telegram-Bot-Api-Secret-Token"],
    # Allow chrome-extension:// origins dynamically
    allow_origin_regex=r"^chrome-extension://[a-z]{32}$",
)

# Security headers middleware
app.add_middleware(SecurityHeadersMiddleware)

# Mount all routers
app.include_router(auth.router, prefix="/api")
app.include_router(profile.router, prefix="/api")
app.include_router(answers.router, prefix="/api")
app.include_router(applications.router, prefix="/api")
app.include_router(reminders.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api")
app.include_router(telegram_router.router, prefix="/api")

@app.get("/")
async def root():
    return {
        "product": "ApplyRecall",
        "tagline": "Apply once. Remember everything. Stay in control.",
        "status": "online",
        "docs": "/docs"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
