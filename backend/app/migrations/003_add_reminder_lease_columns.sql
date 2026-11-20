-- Migration 003: Add Reminder Lease and Concurrency Control Columns
-- Enables atomic claim token verification, worker identification, and processing lease timeouts.

ALTER TABLE reminders ADD COLUMN IF NOT EXISTS claim_token TEXT;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS worker_id TEXT;
ALTER TABLE reminders ADD COLUMN IF NOT EXISTS processing_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_reminders_claim_token ON reminders(claim_token);
CREATE INDEX IF NOT EXISTS idx_reminders_expires_at ON reminders(processing_expires_at);
