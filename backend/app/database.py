import aiosqlite
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from app.config import settings

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def new_uuid() -> str:
    return str(uuid.uuid4())

async def get_db():
    conn = await aiosqlite.connect(settings.SQLITE_PATH)
    conn.row_factory = aiosqlite.Row
    await conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
    finally:
        await conn.close()

async def init_db():
    """Initializes tables in SQLite mirroring the Supabase schema."""
    async with aiosqlite.connect(settings.SQLITE_PATH) as conn:
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA foreign_keys = ON;")
        
        # 1. Profiles
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            user_id TEXT UNIQUE NOT NULL,
            full_name TEXT,
            first_name TEXT,
            last_name TEXT,
            email TEXT,
            phone TEXT,
            city TEXT,
            country TEXT,
            college TEXT,
            degree TEXT,
            branch TEXT,
            graduation_year TEXT,
            linkedin_url TEXT,
            portfolio_url TEXT,
            github_url TEXT,
            summary TEXT,
            timezone TEXT DEFAULT 'UTC',
            created_at TEXT,
            updated_at TEXT
        );
        """)
        
        # 2. Experiences
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS experiences (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            company TEXT NOT NULL,
            position TEXT NOT NULL,
            description TEXT,
            start_date TEXT,
            end_date TEXT,
            is_current INTEGER DEFAULT 0,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)
        
        # 3. Projects
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            project_url TEXT,
            technologies TEXT,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)
        
        # 4. Answers
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS answers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            scope TEXT NOT NULL CHECK (scope IN ('general', 'company', 'application')),
            company TEXT,
            role TEXT,
            tags TEXT,
            created_at TEXT,
            updated_at TEXT,
            last_used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)
        
        # 5. Applications
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS applications (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            company TEXT NOT NULL,
            position TEXT NOT NULL,
            job_url TEXT,
            source TEXT,
            description TEXT,
            location TEXT,
            employment_type TEXT,
            status TEXT NOT NULL DEFAULT 'Saved' CHECK (status IN ('Saved', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Withdrawn')),
            applied_at TEXT,
            hr_email TEXT,
            notes TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)
        
        # 6. Application Answers
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS application_answers (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            application_id TEXT NOT NULL,
            question TEXT NOT NULL,
            answer TEXT NOT NULL,
            source_answer_id TEXT,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        """)
        
        # 7. Application Events
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS application_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            application_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            previous_value TEXT,
            new_value TEXT,
            description TEXT,
            created_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        """)
        
        # 8. Reminders (with retry support)
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS reminders (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            application_id TEXT NOT NULL,
            reminder_at TEXT NOT NULL,
            type TEXT DEFAULT 'follow_up',
            status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'snoozed', 'cancelled')),
            sent_at TEXT,
            attempts INTEGER DEFAULT 0,
            last_attempt_at TEXT,
            error_message TEXT,
            next_retry_at TEXT,
            created_at TEXT,
            updated_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
            FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
        );
        """)
        
        # 9. Telegram Connections
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            chat_id TEXT NOT NULL UNIQUE,
            connected_at TEXT,
            is_active INTEGER DEFAULT 1,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)
        
        # 10. Pairing Codes (stores hash, not raw code)
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS pairing_codes (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            code_hash TEXT NOT NULL,
            device_type TEXT NOT NULL CHECK (device_type IN ('extension', 'telegram')),
            expires_at TEXT NOT NULL,
            used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 11. Device Connections (secure device tokens)
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS device_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            device_type TEXT NOT NULL CHECK (device_type IN ('extension', 'telegram')),
            device_name TEXT,
            token_hash TEXT NOT NULL UNIQUE,
            is_active INTEGER DEFAULT 1,
            created_at TEXT,
            last_used_at TEXT,
            FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
        );
        """)

        # 12. Processed Telegram updates (deduplication)
        await conn.execute("""
        CREATE TABLE IF NOT EXISTS telegram_processed_updates (
            update_id INTEGER PRIMARY KEY
        );
        """)
        
        # Create indexes
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_answers_user_id ON answers(user_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_answers_scope ON answers(user_id, scope);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(user_id, status);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status, reminder_at);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_events_app ON application_events(application_id);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_pairing_code ON pairing_codes(code_hash, expires_at);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_device_token ON device_connections(token_hash);")
        await conn.execute("CREATE INDEX IF NOT EXISTS idx_device_user ON device_connections(user_id);")

        # Migrate reminders table if check constraint or columns missing from earlier schema
        cursor_sql = await conn.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='reminders'")
        sql_row = await cursor_sql.fetchone()
        if sql_row and "'sent'" not in sql_row[0]:
            await conn.execute("ALTER TABLE reminders RENAME TO _reminders_old;")
            await conn.execute("""
            CREATE TABLE reminders (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                application_id TEXT NOT NULL,
                reminder_at TEXT NOT NULL,
                type TEXT DEFAULT 'follow_up',
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'completed', 'failed', 'snoozed', 'cancelled')),
                sent_at TEXT,
                attempts INTEGER DEFAULT 0,
                last_attempt_at TEXT,
                error_message TEXT,
                next_retry_at TEXT,
                created_at TEXT,
                updated_at TEXT,
                FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE,
                FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
            );
            """)
            await conn.execute("""
            INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, sent_at, created_at, updated_at)
            SELECT id, user_id, application_id, reminder_at, type, status, sent_at, created_at, updated_at FROM _reminders_old;
            """)
            await conn.execute("DROP TABLE _reminders_old;")
        else:
            cursor_rem_cols = await conn.execute("PRAGMA table_info(reminders);")
            rem_cols = [row[1] for row in await cursor_rem_cols.fetchall()]
            if "attempts" not in rem_cols:
                await conn.execute("ALTER TABLE reminders ADD COLUMN attempts INTEGER DEFAULT 0;")
            if "last_attempt_at" not in rem_cols:
                await conn.execute("ALTER TABLE reminders ADD COLUMN last_attempt_at TEXT;")
            if "error_message" not in rem_cols:
                await conn.execute("ALTER TABLE reminders ADD COLUMN error_message TEXT;")
            if "next_retry_at" not in rem_cols:
                await conn.execute("ALTER TABLE reminders ADD COLUMN next_retry_at TEXT;")

        # Seed default student user ONLY in development mode
        if not settings.is_production:
            dev_user_id = "00000000-0000-0000-0000-000000000001"
            cursor = await conn.execute("SELECT user_id FROM profiles WHERE user_id = ?", (dev_user_id,))
            row = await cursor.fetchone()
            if not row:
                now = now_iso()
                await conn.execute("""
                INSERT INTO profiles (
                    id, user_id, full_name, first_name, last_name, email, phone, city, country,
                    college, degree, branch, graduation_year, linkedin_url, portfolio_url, github_url,
                    summary, timezone, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, "Alex Morgan", "Alex", "Morgan", "alex.morgan@university.edu", "+1 (555) 234-5678",
                    "San Francisco", "United States", "Stanford University", "B.S. in Computer Science",
                    "Computer Science", "2025", "https://linkedin.com/in/alexmorgan-dev",
                    "https://alexmorgan.dev", "https://github.com/alexmorgan",
                    "Aspiring software engineer passionate about distributed systems, developer tooling, and modern web applications. Strong background in Python, TypeScript, and React.",
                    "America/Los_Angeles", now, now
                ))
                
                # Seed experiences
                await conn.execute("""
                INSERT INTO experiences (id, user_id, company, position, description, start_date, end_date, is_current, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, "Stripe", "Software Engineering Intern",
                    "Built resilient payment retry pipelines, improved latency by 14% on checkout flows.",
                    "2024-06-01", "2024-08-31", 0, now
                ))
                
                # Seed projects
                await conn.execute("""
                INSERT INTO projects (id, user_id, name, description, project_url, technologies, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, "DevCache",
                    "High-performance distributed in-memory cache written in Go with raft consensus.",
                    "https://github.com/alexmorgan/devcache", "Go, Raft, gRPC", now
                ))
                
                # Seed Universal & Company Answers
                answers_seed = [
                    (
                        new_uuid(), dev_user_id,
                        "Tell us about yourself.",
                        "I am a final-year Computer Science student at Stanford University with industry experience as a Software Engineering Intern at Stripe. I love building reliable, developer-friendly backend services and web applications. Outside of class, I maintain open-source tooling and lead the collegiate ACM systems group.",
                        "general", None, None, "intro,overview", now, now, now
                    ),
                    (
                        new_uuid(), dev_user_id,
                        "What are your greatest strengths?",
                        "My greatest strengths are rapid technical learning, pragmatic problem-solving, and clear cross-functional communication. When working on distributed systems at Stripe, I quickly navigated unfamiliar legacy codebases, identified bottleneck queries, and documented patterns for the wider engineering team.",
                        "general", None, None, "strengths,skills", now, now, now
                    ),
                    (
                        new_uuid(), dev_user_id,
                        "Why should we hire you?",
                        "I combine strong theoretical computer science foundations with real-world production experience. I take ownership of projects from design to deployment, prioritize code quality and test coverage, and bring genuine enthusiasm and curiosity to collaborative teams.",
                        "general", None, None, "pitch,hire", now, now, now
                    ),
                    (
                        new_uuid(), dev_user_id,
                        "Why do you want to work at Acme?",
                        "Acme is pioneering cloud infrastructure reliability in ways that directly align with my passion for resilient distributed systems. Your open-source architectural writings have been an inspiration, and I would love to contribute directly to scaling Acme's core streaming engine.",
                        "company", "Acme", None, "acme,culture", now, now, now
                    )
                ]
                
                for a in answers_seed:
                    await conn.execute("""
                    INSERT INTO answers (id, user_id, question, answer, scope, company, role, tags, created_at, updated_at, last_used_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """, a)
                    
                # Seed applications
                app1_id = new_uuid()
                app2_id = new_uuid()
                app3_id = new_uuid()
                
                await conn.execute("""
                INSERT INTO applications (id, user_id, company, position, job_url, source, description, location, employment_type, status, applied_at, hr_email, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    app1_id, dev_user_id, "Acme", "Software Engineer - Backend",
                    "https://acme.example/jobs/backend-intern", "Acme Careers",
                    "Join our distributed backend infrastructure team building scalable microservices.",
                    "San Francisco, CA / Remote", "Full-time", "Applied",
                    "2026-11-12T10:00:00Z", "careers@acme.example",
                    "Applied through Acme careers portal. Standard 7-day follow-up window.",
                    "2026-11-12T10:00:00Z", now
                ))
                
                await conn.execute("""
                INSERT INTO applications (id, user_id, company, position, job_url, source, description, location, employment_type, status, applied_at, hr_email, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    app2_id, dev_user_id, "Razorpay", "Platform Engineer",
                    "https://razorpay.com/careers/platform", "LinkedIn",
                    "Working on core payment gateway resilience and high-throughput transaction processing.",
                    "Bengaluru, India / Remote", "Full-time", "Interview",
                    "2026-11-05T14:30:00Z", "talent@razorpay.com",
                    "Technical phone screen cleared. Next interview scheduled.",
                    "2026-11-05T14:30:00Z", now
                ))
                
                await conn.execute("""
                INSERT INTO applications (id, user_id, company, position, job_url, source, description, location, employment_type, status, applied_at, hr_email, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    app3_id, dev_user_id, "Linear", "Product Engineer",
                    "https://linear.app/careers/product-engineer", "Direct",
                    "Crafting high-speed collaborative project management workflows.",
                    "San Francisco, CA", "Full-time", "Applied",
                    "2026-11-15T09:00:00Z", "jobs@linear.app",
                    "Submitted with portfolio link.",
                    "2026-11-15T09:00:00Z", now
                ))
                
                # Seed timeline events
                await conn.execute("""
                INSERT INTO application_events (id, user_id, application_id, event_type, previous_value, new_value, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, app1_id, "status_change", "Saved", "Applied",
                    "Application submitted via Chrome Extension.", "2026-11-12T10:00:00Z"
                ))
                await conn.execute("""
                INSERT INTO application_events (id, user_id, application_id, event_type, previous_value, new_value, description, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, app2_id, "status_change", "Applied", "Interview",
                    "Recruiter reached out for technical interview.", "2026-11-14T11:00:00Z"
                ))
                
                # Seed a reminder for Acme follow-up
                await conn.execute("""
                INSERT INTO reminders (id, user_id, application_id, reminder_at, type, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    new_uuid(), dev_user_id, app1_id,
                    "2026-11-19T09:00:00Z", "follow_up", "pending",
                    "2026-11-12T10:00:00Z", now
                ))
                
        await conn.commit()
