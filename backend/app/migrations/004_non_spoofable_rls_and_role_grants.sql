-- Migration 004: Non-Spoofable Role Architecture & Granular Least-Privilege Grants
-- Completely removes spoofable GUC privilege flags (app.is_worker, app.is_system).
-- Establishes distinct database identities and enforces table-level column grants and role-specific RLS.

-- 1. Ensure distinct roles exist
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

-- 2. Schema and database usage grants
GRANT CONNECT ON DATABASE postgres TO applyrecall_migrator, applyrecall_app, applyrecall_worker;
GRANT USAGE, CREATE ON SCHEMA public TO applyrecall_migrator;
GRANT USAGE ON SCHEMA public TO applyrecall_app;
GRANT USAGE ON SCHEMA public TO applyrecall_worker;

-- 3. Application role grants (full DML on user tables, subject to RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO applyrecall_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO applyrecall_app;

-- 4. Worker role grants (STRICT LEAST PRIVILEGE)
-- Revoke all table access by default
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM applyrecall_worker;

-- Column-level SELECT on applications (for reminder composition & terminal status checks)
GRANT SELECT (id, user_id, company, position, status, applied_at) ON applications TO applyrecall_worker;

-- SELECT and outcome UPDATE on reminders
GRANT SELECT, UPDATE (status, attempts, last_attempt_at, error_message, next_retry_at, sent_at, claim_token, worker_id, processing_started_at, processing_expires_at, updated_at) ON reminders TO applyrecall_worker;

-- SELECT on telegram_connections to resolve destination chat_id
GRANT SELECT (user_id, chat_id, is_active) ON telegram_connections TO applyrecall_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO applyrecall_worker;

-- Explicitly revoke access to student profile, answers, and credentials from worker
REVOKE ALL ON profiles FROM applyrecall_worker;
REVOKE ALL ON answers FROM applyrecall_worker;
REVOKE ALL ON experiences FROM applyrecall_worker;
REVOKE ALL ON projects FROM applyrecall_worker;
REVOKE ALL ON application_answers FROM applyrecall_worker;
REVOKE ALL ON application_events FROM applyrecall_worker;
REVOKE ALL ON pairing_codes FROM applyrecall_worker;
REVOKE ALL ON device_connections FROM applyrecall_worker;

-- 5. Enable and Force RLS on all 11 user tables
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

-- 6. Helper function to resolve verified student user_id
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
BEGIN
    -- 1. Native Supabase Auth context
    IF current_setting('request.jwt.claim.sub', true) IS NOT NULL AND current_setting('request.jwt.claim.sub', true) <> '' THEN
        RETURN current_setting('request.jwt.claim.sub', true)::UUID;
    END IF;
    -- 2. Fallback to auth.uid() if defined in Supabase auth schema
    BEGIN
        RETURN auth.uid();
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;
    -- 3. Verified session user ID set transaction-locally by backend after JWT verification
    IF current_setting('app.current_user_id', true) IS NOT NULL AND current_setting('app.current_user_id', true) <> '' THEN
        RETURN current_setting('app.current_user_id', true)::UUID;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- 7. Drop all legacy policies that referenced app.is_worker or app.is_system
DO $$
BEGIN
    -- Profiles
    DROP POLICY IF EXISTS "Users can only access own profile" ON profiles;
    DROP POLICY IF EXISTS "Users can access their own profile" ON profiles;
    CREATE POLICY "Users can only access own profile" ON profiles
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Experiences
    DROP POLICY IF EXISTS "Users can only access own experiences" ON experiences;
    DROP POLICY IF EXISTS "Users can access their own experiences" ON experiences;
    CREATE POLICY "Users can only access own experiences" ON experiences
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Projects
    DROP POLICY IF EXISTS "Users can only access own projects" ON projects;
    DROP POLICY IF EXISTS "Users can access their own projects" ON projects;
    CREATE POLICY "Users can only access own projects" ON projects
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Answers (Answer Library: Worker has ZERO access)
    DROP POLICY IF EXISTS "Users can only access own answers" ON answers;
    DROP POLICY IF EXISTS "Users can access their own answers" ON answers;
    CREATE POLICY "Users can only access own answers" ON answers
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Applications: Owner full access; Worker SELECT only
    DROP POLICY IF EXISTS "Users can only access own applications" ON applications;
    DROP POLICY IF EXISTS "Users full access or worker read applications" ON applications;
    DROP POLICY IF EXISTS "Users can access their own applications" ON applications;
    CREATE POLICY "Users can only access own applications" ON applications
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    CREATE POLICY "Worker can view applications for reminders" ON applications
        FOR SELECT TO applyrecall_worker
        USING (true);

    -- Application Answers: Strictly owner only
    DROP POLICY IF EXISTS "Users can only access own application_answers" ON application_answers;
    DROP POLICY IF EXISTS "Users can access their own application answers" ON application_answers;
    CREATE POLICY "Users can only access own application_answers" ON application_answers
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Application Events: Owner full access
    DROP POLICY IF EXISTS "Users can only access own application_events" ON application_events;
    DROP POLICY IF EXISTS "Users can access their own application events" ON application_events;
    CREATE POLICY "Users can only access own application_events" ON application_events
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Reminders: Owner full access; Worker can claim and update
    DROP POLICY IF EXISTS "Users can only access own reminders" ON reminders;
    DROP POLICY IF EXISTS "Users and worker access reminders" ON reminders;
    DROP POLICY IF EXISTS "Users can access their own reminders" ON reminders;
    CREATE POLICY "Users can only access own reminders" ON reminders
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    CREATE POLICY "Worker can view and update reminders" ON reminders
        FOR ALL TO applyrecall_worker
        USING (true)
        WITH CHECK (true);

    -- Telegram Connections: Owner full access; Worker can view active chat IDs; App backend can link & lookup
    DROP POLICY IF EXISTS "Users can only access own telegram_connections" ON telegram_connections;
    DROP POLICY IF EXISTS "Users and system access telegram_connections" ON telegram_connections;
    DROP POLICY IF EXISTS "Users can access their own telegram connections" ON telegram_connections;
    CREATE POLICY "Users can only access own telegram_connections" ON telegram_connections
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    CREATE POLICY "Worker can view active telegram connections" ON telegram_connections
        FOR SELECT TO applyrecall_worker
        USING (is_active = TRUE);

    CREATE POLICY "App backend can lookup telegram connections" ON telegram_connections
        FOR SELECT TO applyrecall_app
        USING (true);

    CREATE POLICY "App backend can link telegram connections" ON telegram_connections
        FOR INSERT TO applyrecall_app
        WITH CHECK (true);

    CREATE POLICY "App backend can update telegram connections" ON telegram_connections
        FOR UPDATE TO applyrecall_app
        USING (true)
        WITH CHECK (true);

    -- Pairing Codes: Owner access; App backend can verify and consume
    DROP POLICY IF EXISTS "Users can only access own pairing_codes" ON pairing_codes;
    DROP POLICY IF EXISTS "Users and system access pairing_codes" ON pairing_codes;
    DROP POLICY IF EXISTS "Users can access their own pairing codes" ON pairing_codes;
    CREATE POLICY "Users can only access own pairing_codes" ON pairing_codes
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    CREATE POLICY "App backend can verify pairing codes" ON pairing_codes
        FOR SELECT TO applyrecall_app
        USING (true);

    CREATE POLICY "App backend can consume pairing codes" ON pairing_codes
        FOR UPDATE TO applyrecall_app
        USING (true)
        WITH CHECK (true);

    CREATE POLICY "App backend can generate pairing codes" ON pairing_codes
        FOR INSERT TO applyrecall_app
        WITH CHECK (true);

    -- Device Connections: Owner access; App backend can verify tokens and update last_used_at
    DROP POLICY IF EXISTS "Users can only access own device_connections" ON device_connections;
    DROP POLICY IF EXISTS "Users and system access device_connections" ON device_connections;
    DROP POLICY IF EXISTS "Users can access their own device connections" ON device_connections;
    CREATE POLICY "Users can only access own device_connections" ON device_connections
        FOR ALL TO applyrecall_app, authenticated
        USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    CREATE POLICY "App backend can verify device tokens" ON device_connections
        FOR SELECT TO applyrecall_app
        USING (true);

    CREATE POLICY "App backend can touch device tokens" ON device_connections
        FOR UPDATE TO applyrecall_app
        USING (true)
        WITH CHECK (true);

    CREATE POLICY "App backend can register device tokens" ON device_connections
        FOR INSERT TO applyrecall_app
        WITH CHECK (true);
END $$;
