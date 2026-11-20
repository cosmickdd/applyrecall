-- Migration 002: Enable Row Level Security (RLS) and User Isolation Policies

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_connections ENABLE ROW LEVEL SECURITY;

-- Helper function to resolve the current active user ID from Supabase auth.uid() or session claim
CREATE OR REPLACE FUNCTION get_current_user_id() RETURNS UUID AS $$
BEGIN
    -- 1. Check for Supabase Auth JWT sub claim
    IF current_setting('request.jwt.claim.sub', true) IS NOT NULL AND current_setting('request.jwt.claim.sub', true) <> '' THEN
        RETURN current_setting('request.jwt.claim.sub', true)::UUID;
    END IF;
    -- 2. Check for application-level session user ID
    IF current_setting('app.current_user_id', true) IS NOT NULL AND current_setting('app.current_user_id', true) <> '' THEN
        RETURN current_setting('app.current_user_id', true)::UUID;
    END IF;
    -- 3. Fallback to auth.uid() if defined by Supabase auth schema
    BEGIN
        RETURN auth.uid();
    EXCEPTION WHEN OTHERS THEN
        RETURN NULL;
    END;
END;
$$ LANGUAGE plpgsql STABLE;

-- User ownership policies
DO $$
BEGIN
    DROP POLICY IF EXISTS "Users can only access own profile" ON profiles;
    CREATE POLICY "Users can only access own profile" ON profiles
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own experiences" ON experiences;
    CREATE POLICY "Users can only access own experiences" ON experiences
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own projects" ON projects;
    CREATE POLICY "Users can only access own projects" ON projects
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own answers" ON answers;
    CREATE POLICY "Users can only access own answers" ON answers
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own applications" ON applications;
    CREATE POLICY "Users can only access own applications" ON applications
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own application_answers" ON application_answers;
    CREATE POLICY "Users can only access own application_answers" ON application_answers
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own application_events" ON application_events;
    CREATE POLICY "Users can only access own application_events" ON application_events
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own reminders" ON reminders;
    CREATE POLICY "Users can only access own reminders" ON reminders
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own telegram_connections" ON telegram_connections;
    CREATE POLICY "Users can only access own telegram_connections" ON telegram_connections
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own pairing_codes" ON pairing_codes;
    CREATE POLICY "Users can only access own pairing_codes" ON pairing_codes
        FOR ALL USING (user_id = get_current_user_id());

    DROP POLICY IF EXISTS "Users can only access own device_connections" ON device_connections;
    CREATE POLICY "Users can only access own device_connections" ON device_connections
        FOR ALL USING (user_id = get_current_user_id());
END $$;
