-- Migration: Create eva_updates table
-- Purpose: Store EVA weekly meeting updates with sections, coordinator data, decisions, and chairman notes
-- Date: 2026-03-13
-- Rollback: DROP TABLE IF EXISTS eva_updates CASCADE;

CREATE TABLE IF NOT EXISTS eva_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date DATE NOT NULL UNIQUE,
  sections JSONB DEFAULT '{}',
  coordinator JSONB DEFAULT '{}',
  decisions JSONB DEFAULT '{}',
  chairman_notes TEXT,
  digest TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE eva_updates IS 'Stores EVA weekly meeting updates including section reports, coordinator status, decisions, and chairman notes';
COMMENT ON COLUMN eva_updates.meeting_date IS 'Date of the EVA meeting (unique per day)';
COMMENT ON COLUMN eva_updates.sections IS 'JSONB object containing section-level reports and status';
COMMENT ON COLUMN eva_updates.coordinator IS 'JSONB object containing coordinator metrics and status';
COMMENT ON COLUMN eva_updates.decisions IS 'JSONB object containing decisions made during the meeting';
COMMENT ON COLUMN eva_updates.chairman_notes IS 'Free-text chairman observations and notes';
COMMENT ON COLUMN eva_updates.digest IS 'Condensed summary of the meeting for quick reference';
COMMENT ON COLUMN eva_updates.completed_at IS 'Timestamp when the meeting update was finalized';

-- Index for historical queries (descending date for recent-first access)
CREATE INDEX IF NOT EXISTS idx_eva_updates_meeting_date ON eva_updates (meeting_date DESC);

-- Row Level Security
ALTER TABLE eva_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON eva_updates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_eva_updates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_eva_updates_updated_at
  BEFORE UPDATE ON eva_updates
  FOR EACH ROW
  EXECUTE FUNCTION update_eva_updates_updated_at();
