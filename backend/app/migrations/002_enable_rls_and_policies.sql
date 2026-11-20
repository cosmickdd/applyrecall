-- Migration 002: Enable Row Level Security (RLS) and User Isolation Policies
-- Enforces strict user isolation across all multi-tenant tables.
-- Also forces RLS on table owners so that the backend application role cannot bypass policies.

-- 1. Enable and Force RLS across all 11 user-data tables
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

-- 2. Helper function to resolve the current active user ID
-- Prioritizes application-level transaction setting set via set_config('app.current_user_id', $1, true)
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
BEGIN
    -- 1. Check for application-level session user ID
    IF current_setting('app.current_user_id', true) IS NOT NULL AND current_setting('app.current_user_id', true) <> '' THEN
        RETURN current_setting('app.current_user_id', true)::UUID;
    END IF;
    -- 2. Check for Supabase Auth JWT sub claim
    IF current_setting('request.jwt.claim.sub', true) IS NOT NULL AND current_setting('request.jwt.claim.sub', true) <> '' THEN
        RETURN current_setting('request.jwt.claim.sub', true)::UUID;
    END IF;
    -- 3. Fallback to auth.uid() if defined by Supabase auth schema
    BEGIN
        RETURN auth.uid();
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Granular User Ownership and Restricted Worker Policies
DO $$
BEGIN
    -- Profiles: Strictly owner only (Worker has ZERO access)
    DROP POLICY IF EXISTS "Users can only access own profile" ON profiles;
    CREATE POLICY "Users can only access own profile" ON profiles
        FOR ALL USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Experiences: Strictly owner only
    DROP POLICY IF EXISTS "Users can only access own experiences" ON experiences;
    CREATE POLICY "Users can only access own experiences" ON experiences
        FOR ALL USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Projects: Strictly owner only
    DROP POLICY IF EXISTS "Users can only access own projects" ON projects;
    CREATE POLICY "Users can only access own projects" ON projects
        FOR ALL USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Answers (Answer Library): Strictly owner only (Worker has ZERO access)
    DROP POLICY IF EXISTS "Users can only access own answers" ON answers;
    CREATE POLICY "Users can only access own answers" ON answers
        FOR ALL USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Applications: Owner full access; Worker SELECT only for reminder composition
    DROP POLICY IF EXISTS "Users can only access own applications" ON applications;
    DROP POLICY IF EXISTS "Users full access or worker read applications" ON applications;
    CREATE POLICY "Users full access or worker read applications" ON applications
        FOR ALL USING (
            user_id = get_current_user_id() 
            OR current_setting('app.is_worker', true) = 'true'
        )
        WITH CHECK (user_id = get_current_user_id());

    -- Application Answers: Strictly owner only
    DROP POLICY IF EXISTS "Users can only access own application_answers" ON application_answers;
    CREATE POLICY "Users can only access own application_answers" ON application_answers
        FOR ALL USING (user_id = get_current_user_id())
        WITH CHECK (user_id = get_current_user_id());

    -- Application Events: Owner full access; Worker can append reminder event logs
    DROP POLICY IF EXISTS "Users can only access own application_events" ON application_events;
    CREATE POLICY "Users can only access own application_events" ON application_events
        FOR ALL USING (
            user_id = get_current_user_id() 
            OR current_setting('app.is_worker', true) = 'true'
        )
        WITH CHECK (
            user_id = get_current_user_id() 
            OR current_setting('app.is_worker', true) = 'true'
        );

    -- Reminders: Owner full access; Worker can SELECT, claim, and UPDATE reminder outcomes
    DROP POLICY IF EXISTS "Users can only access own reminders" ON reminders;
    DROP POLICY IF EXISTS "Users and worker access reminders" ON reminders;
    CREATE POLICY "Users and worker access reminders" ON reminders
        FOR ALL USING (
            user_id = get_current_user_id() 
            OR current_setting('app.is_worker', true) = 'true'
        )
        WITH CHECK (
            user_id = get_current_user_id() 
            OR current_setting('app.is_worker', true) = 'true'
        );

    -- Telegram Connections: Owner access; Worker / System lookup by chat_id
    DROP POLICY IF EXISTS "Users can only access own telegram_connections" ON telegram_connections;
    DROP POLICY IF EXISTS "Users and system access telegram_connections" ON telegram_connections;
    CREATE POLICY "Users and system access telegram_connections" ON telegram_connections
        FOR ALL USING (
            user_id = get_current_user_id() 
            OR current_setting('app.is_worker', true) = 'true'
            OR current_setting('app.is_system', true) = 'true'
        )
        WITH CHECK (
            user_id = get_current_user_id() 
            OR current_setting('app.is_system', true) = 'true'
        );

    -- Pairing Codes: Owner access; System lookup for pairing validation
    DROP POLICY IF EXISTS "Users can only access own pairing_codes" ON pairing_codes;
    DROP POLICY IF EXISTS "Users and system access pairing_codes" ON pairing_codes;
    CREATE POLICY "Users and system access pairing_codes" ON pairing_codes
        FOR ALL USING (
            user_id = get_current_user_id() 
            OR current_setting('app.is_system', true) = 'true'
        )
        WITH CHECK (
            user_id = get_current_user_id() 
            OR current_setting('app.is_system', true) = 'true'
        );

    -- Device Connections: Owner access; System lookup for device token authentication
    DROP POLICY IF EXISTS "Users can only access own device_connections" ON device_connections;
    DROP POLICY IF EXISTS "Users and system access device_connections" ON device_connections;
    CREATE POLICY "Users and system access device_connections" ON device_connections
        FOR ALL USING (
            user_id = get_current_user_id() 
            OR current_setting('app.is_system', true) = 'true'
        )
        WITH CHECK (
            user_id = get_current_user_id() 
            OR current_setting('app.is_system', true) = 'true'
        );
END $$;
