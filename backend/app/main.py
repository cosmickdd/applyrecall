import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.routers import auth, profile, answers, applications, reminders, dashboard, telegram_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: validate production requirements and initialize database schema
    settings.validate_production()
    await init_db()
    yield
    # Shutdown: close database connection pool
    if settings.use_postgres:
        from app.database import close_pg_pool
        await close_pg_pool()

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
