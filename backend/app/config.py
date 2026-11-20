import os
import re
import urllib.parse
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

def _sanitize_dsn(dsn: str) -> str:
    """Normalizes postgres:// scheme and URL-encodes special characters in passwords."""
    if not dsn:
        return dsn
    if dsn.startswith("postgres://"):
        dsn = "postgresql://" + dsn[len("postgres://"):]
    # Match postgresql://user:password@host[:port]/database
    m = re.match(r"^(postgresql://[^:]+:)(.+)@([^@]+)$", dsn)
    if m:
        prefix, raw_pw, suffix = m.groups()
        if "@" in raw_pw:
            encoded_pw = urllib.parse.quote(raw_pw, safe="")
            dsn = f"{prefix}{encoded_pw}@{suffix}"
    return dsn

class Settings:
    PROJECT_NAME: str = "ApplyRecall"
    API_V1_STR: str = "/api"

    # Environment mode: "development" or "production"
    APP_ENV: str = os.getenv("APP_ENV", "development").lower()

    # Database — PostgreSQL (Supabase / Render) and SQLite (dev-only fallback)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "").strip()
    MIGRATION_DATABASE_URL: str = os.getenv("MIGRATION_DATABASE_URL", "").strip()
    WORKER_DATABASE_URL: str = os.getenv("WORKER_DATABASE_URL", "").strip()
    TEST_DATABASE_URL: str = os.getenv("TEST_DATABASE_URL", "").strip()
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "").strip()
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "").strip()  # anon key
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    SQLITE_PATH: Path = BASE_DIR / "applyrecall.db"

    # Telegram
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    TELEGRAM_WEBHOOK_URL: str = os.getenv("TELEGRAM_WEBHOOK_URL", "").strip()
    TELEGRAM_WEBHOOK_SECRET: str = os.getenv("TELEGRAM_WEBHOOK_SECRET", "").strip()

    # Security — Supabase JWT verification
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    JWT_AUDIENCE: str = os.getenv("JWT_AUDIENCE", "authenticated").strip()
    JWT_ALLOWED_ALGORITHMS: list[str] = ["HS256", "RS256", "ES256"]

    # Pairing
    PAIRING_CODE_EXPIRY_MINUTES: int = 5
    PAIRING_MAX_ATTEMPTS_PER_HOUR: int = 10

    # Device token settings
    DEVICE_TOKEN_BYTES: int = 32  # 256-bit token

    # Worker configuration
    ENABLE_EMBEDDED_WORKER: bool = os.getenv("ENABLE_EMBEDDED_WORKER", "false").lower() in ("true", "1", "yes")
    WORKER_INTERVAL_SECONDS: int = int(os.getenv("WORKER_INTERVAL_SECONDS", "15"))
    WORKER_BATCH_SIZE: int = int(os.getenv("WORKER_BATCH_SIZE", "10"))
    WORKER_LEASE_MINUTES: int = int(os.getenv("WORKER_LEASE_MINUTES", "5"))
    MAX_RETRY_ATTEMPTS: int = 4  # Initial attempt + 3 retries (5m, 20m, 80m)
    RETRY_DELAYS_MINUTES: list[int] = [5, 20, 80]
    STALE_PROCESSING_TIMEOUT_MINUTES: int = 10

    # CORS — derived from env or defaults for dev
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000").strip()
    API_URL: str = os.getenv("API_URL", "http://localhost:8000").strip()

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def use_postgres(self) -> bool:
        return bool(self.DATABASE_URL)

    @property
    def postgres_dsn(self) -> str:
        """Normalizes postgres:// scheme to postgresql:// for asyncpg and sanitizes credentials."""
        return _sanitize_dsn(self.DATABASE_URL)

    @property
    def migration_postgres_dsn(self) -> str:
        """DSN for schema migrations (applyrecall_migrator / admin)."""
        return _sanitize_dsn(self.MIGRATION_DATABASE_URL or self.DATABASE_URL)

    @property
    def worker_postgres_dsn(self) -> str:
        """DSN for background reminder worker (applyrecall_worker)."""
        return _sanitize_dsn(self.WORKER_DATABASE_URL or self.DATABASE_URL)

    @property
    def cors_origins(self) -> list[str]:
        origins = [
            self.FRONTEND_URL,
            self.API_URL,
        ]
        # In development, also allow common localhost variants
        if not self.is_production:
            origins.extend([
                "http://localhost:3000",
                "http://127.0.0.1:3000",
                "http://localhost:8000",
                "http://127.0.0.1:8000",
            ])
        # Filter empty strings
        return list(set(o for o in origins if o))

    def validate_production(self) -> None:
        """Ensures production never runs without mandatory database and security configs."""
        if self.is_production:
            if not self.DATABASE_URL:
                raise RuntimeError(
                    "CRITICAL CONFIGURATION ERROR: APP_ENV is set to 'production', but DATABASE_URL is not configured. "
                    "ApplyRecall requires Supabase PostgreSQL in production. SQLite fallback is strictly forbidden in production."
                )
            if not self.SUPABASE_URL:
                raise RuntimeError(
                    "CRITICAL CONFIGURATION ERROR: Production requires SUPABASE_URL for authenticating users and enforcing token issuer verification."
                )
            if not self.SUPABASE_JWT_SECRET and not self.SUPABASE_URL:
                raise RuntimeError(
                    "CRITICAL CONFIGURATION ERROR: Production requires SUPABASE_JWT_SECRET or SUPABASE_URL for JWT validation."
                )

settings = Settings()
