-- ==============================================================================
-- APPLYRECALL DATABASE SCHEMA CONSOLIDATED SNAPSHOT (v1.2.0)
-- 
-- CANONICAL MIGRATION NOTICE:
-- The authoritative, version-controlled schema definition for ApplyRecall is
-- maintained in versioned migration files in: backend/app/migrations/*.sql
-- Production databases must be provisioned and updated using the migration CLI:
--   python -m app.cli migrate
--
-- This file provides an all-in-one consolidated reference snapshot for Supabase SQL Editor.
-- ==============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 0. Provision Roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'applyrecall_migrator') THEN
        CREATE ROLE applyrecall_migrator LOGIN PASSWORD 'applyrecall_migrator_secret_pw';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'applyrecall_app') THEN
        CREATE ROLE applyrecall_app LOGIN PASSWORD 'applyrecall_secret_pw';
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'applyrecall_worker') THEN
        CREATE ROLE applyrecall_worker LOGIN PASSWORD 'applyrecall_worker_secret_pw';
    END IF;
END $$;

-- 1. Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL,
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
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Experiences Table
CREATE TABLE IF NOT EXISTS experiences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    position TEXT NOT NULL,
    description TEXT,
    start_date TEXT,
    end_date TEXT,
    is_current BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Projects Table
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    project_url TEXT,
    technologies TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Answers Table (Answer Library)
CREATE TABLE IF NOT EXISTS answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('general', 'company', 'application')),
    company TEXT,
    role TEXT,
    tags TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- 5. Applications Table
CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    position TEXT NOT NULL,
    job_url TEXT,
    source TEXT,
    description TEXT,
    location TEXT,
    employment_type TEXT,
    status TEXT NOT NULL DEFAULT 'Saved' CHECK (status IN ('Saved', 'Applied', 'Assessment', 'Interview', 'Offer', 'Rejected', 'Withdrawn')),
    applied_at TIMESTAMPTZ,
    hr_email TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Application Answers Table
CREATE TABLE IF NOT EXISTS application_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    source_answer_id UUID REFERENCES answers(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Application Events Table (Audit timeline)
CREATE TABLE IF NOT EXISTS application_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    previous_value TEXT,
    new_value TEXT,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Reminders Table (with lease tokens and retry progression)
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    reminder_at TIMESTAMPTZ NOT NULL,
    type TEXT DEFAULT 'follow_up',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'snoozed', 'cancelled')),
    sent_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,
    last_attempt_at TIMESTAMPTZ,
    error_message TEXT,
    next_retry_at TIMESTAMPTZ,
    processing_started_at TIMESTAMPTZ,
    claim_token TEXT,
    worker_id TEXT,
    processing_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Telegram Connections Table
CREATE TABLE IF NOT EXISTS telegram_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    chat_id TEXT NOT NULL UNIQUE,
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- 10. Pairing Codes Table (Stores SHA-256 hash of one-time codes)
CREATE TABLE IF NOT EXISTS pairing_codes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    device_type TEXT NOT NULL CHECK (device_type IN ('extension', 'telegram')),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ
);

-- 11. Device Connections Table (Stores SHA-256 hash of device tokens)
CREATE TABLE IF NOT EXISTS device_connections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    device_type TEXT NOT NULL CHECK (device_type IN ('extension', 'telegram')),
    device_name TEXT,
    token_hash TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

-- 12. Telegram Processed Updates Table (Deduplication)
CREATE TABLE IF NOT EXISTS telegram_processed_updates (
    update_id BIGINT PRIMARY KEY,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_answers_user_id ON answers(user_id);
CREATE INDEX IF NOT EXISTS idx_answers_scope ON answers(user_id, scope);
CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id);
CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(user_id, status);
CREATE INDEX IF NOT EXISTS idx_reminders_status_claim ON reminders(status, reminder_at, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_claim_token ON reminders(claim_token);
CREATE INDEX IF NOT EXISTS idx_reminders_expires_at ON reminders(processing_expires_at);
CREATE INDEX IF NOT EXISTS idx_events_app_id ON application_events(application_id);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_id ON telegram_connections(chat_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_hash ON pairing_codes(code_hash, expires_at);
CREATE INDEX IF NOT EXISTS idx_device_token_hash ON device_connections(token_hash);
CREATE INDEX IF NOT EXISTS idx_device_user_id ON device_connections(user_id);

-- Enable and Force Row Level Security (RLS) on all 11 tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences FORCE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers FORCE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;
ALTER TABLE application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_answers FORCE ROW LEVEL SECURITY;
ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_events FORCE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders FORCE ROW LEVEL SECURITY;
ALTER TABLE telegram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_connections FORCE ROW LEVEL SECURITY;
ALTER TABLE pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE device_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_connections FORCE ROW LEVEL SECURITY;

-- Helper function to resolve verified student user_id
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
BEGIN
    IF current_setting('request.jwt.claim.sub', true) IS NOT NULL AND current_setting('request.jwt.claim.sub', true) <> '' THEN
        RETURN current_setting('request.jwt.claim.sub', true)::UUID;
    END IF;
    BEGIN
        RETURN auth.uid();
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    IF current_setting('app.current_user_id', true) IS NOT NULL AND current_setting('app.current_user_id', true) <> '' THEN
        RETURN current_setting('app.current_user_id', true)::UUID;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Permissions and Role-Based Policies
GRANT CONNECT ON DATABASE postgres TO applyrecall_migrator, applyrecall_app, applyrecall_worker;
GRANT USAGE ON SCHEMA public TO applyrecall_migrator, applyrecall_app, applyrecall_worker;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO applyrecall_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO applyrecall_app;

-- Worker role privileges (STRICT LEAST PRIVILEGE)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM applyrecall_worker;
GRANT SELECT (id, user_id, company, position, status, applied_at) ON applications TO applyrecall_worker;
GRANT SELECT, UPDATE (status, attempts, last_attempt_at, error_message, next_retry_at, sent_at, claim_token, worker_id, processing_started_at, processing_expires_at, updated_at) ON reminders TO applyrecall_worker;
GRANT SELECT (user_id, chat_id, is_active) ON telegram_connections TO applyrecall_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO applyrecall_worker;

-- Policies (with dynamic idempotent cleanup)
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN (
              'profiles', 'experiences', 'projects', 'answers', 
              'applications', 'application_answers', 'application_events', 
              'reminders', 'telegram_connections', 'pairing_codes', 'device_connections'
          )
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I;', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;

    -- Student ownership policies
    CREATE POLICY "Users can only access own profile" ON profiles FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own experiences" ON experiences FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own projects" ON projects FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own answers" ON answers FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own applications" ON applications FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own application_answers" ON application_answers FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own application_events" ON application_events FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own reminders" ON reminders FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own telegram_connections" ON telegram_connections FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own pairing_codes" ON pairing_codes FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());
    CREATE POLICY "Users can only access own device_connections" ON device_connections FOR ALL TO applyrecall_app, authenticated USING (user_id = get_current_user_id()) WITH CHECK (user_id = get_current_user_id());

    -- Worker policies
    CREATE POLICY "Worker can view applications for reminders" ON applications FOR SELECT TO applyrecall_worker USING (true);
    CREATE POLICY "Worker can view and update reminders" ON reminders FOR ALL TO applyrecall_worker USING (true) WITH CHECK (true);
    CREATE POLICY "Worker can view active telegram connections" ON telegram_connections FOR SELECT TO applyrecall_worker USING (is_active = TRUE);

    -- Backend API pre-auth policies
    CREATE POLICY "App backend can lookup telegram connections" ON telegram_connections FOR SELECT TO applyrecall_app USING (true);
    CREATE POLICY "App backend can link telegram connections" ON telegram_connections FOR INSERT TO applyrecall_app WITH CHECK (true);
    CREATE POLICY "App backend can update telegram connections" ON telegram_connections FOR UPDATE TO applyrecall_app USING (true) WITH CHECK (true);

    CREATE POLICY "App backend can verify pairing codes" ON pairing_codes FOR SELECT TO applyrecall_app USING (true);
    CREATE POLICY "App backend can consume pairing codes" ON pairing_codes FOR UPDATE TO applyrecall_app USING (true) WITH CHECK (true);
    CREATE POLICY "App backend can generate pairing codes" ON pairing_codes FOR INSERT TO applyrecall_app WITH CHECK (true);

    CREATE POLICY "App backend can verify device tokens" ON device_connections FOR SELECT TO applyrecall_app USING (true);
    CREATE POLICY "App backend can touch device tokens" ON device_connections FOR UPDATE TO applyrecall_app USING (true) WITH CHECK (true);
    CREATE POLICY "App backend can register device tokens" ON device_connections FOR INSERT TO applyrecall_app WITH CHECK (true);
END $$;
