import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Settings:
    PROJECT_NAME: str = "ApplyRecall"
    API_V1_STR: str = "/api"

    # Environment mode: "development" or "production"
    APP_ENV: str = os.getenv("APP_ENV", "development")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "")  # anon key
    SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    SQLITE_PATH: Path = BASE_DIR / "applyrecall.db"

    # Telegram
    TELEGRAM_BOT_TOKEN: str = os.getenv("TELEGRAM_BOT_TOKEN", "")
    TELEGRAM_WEBHOOK_URL: str = os.getenv("TELEGRAM_WEBHOOK_URL", "")
    TELEGRAM_WEBHOOK_SECRET: str = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")

    # Security — Supabase JWT verification
    SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

    # Pairing
    PAIRING_CODE_EXPIRY_MINUTES: int = 5
    PAIRING_MAX_ATTEMPTS_PER_HOUR: int = 10

    # Device token settings
    DEVICE_TOKEN_BYTES: int = 32  # 256-bit token

    # CORS — derived from env or defaults for dev
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    API_URL: str = os.getenv("API_URL", "http://localhost:8000")

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

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
        # Chrome extension origins are added per-request via middleware
        return list(set(origins))

settings = Settings()
