-- Add details column to system_events table for storing event metadata
-- Required by E2E tests in tests/e2e/agents/ directory

ALTER TABLE system_events ADD COLUMN IF NOT EXISTS details JSONB;

-- Comment for documentation
COMMENT ON COLUMN system_events.details IS 'JSONB column for storing event metadata, added for E2E test support';
