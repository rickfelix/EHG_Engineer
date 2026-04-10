-- Migration: eva_friday_meetings
-- Date: 2026-04-10
-- Purpose: Session state persistence for Friday management review meetings
-- SD: SD-FRIDAY-MANAGEMENT-REVIEW-MEETING-ORCH-001

CREATE TABLE IF NOT EXISTS eva_friday_meetings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('waiting', 'active', 'paused', 'completed', 'abandoned')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  mood_inference JSONB,
  agenda JSONB,
  current_section_index INT DEFAULT 0,
  meeting_state JSONB,
  feedback JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_eva_friday_meetings_date ON eva_friday_meetings(meeting_date);
CREATE INDEX IF NOT EXISTS idx_eva_friday_meetings_status ON eva_friday_meetings(status);

ALTER TABLE eva_friday_meetings ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE eva_friday_meetings IS 'Stores session state for EVA Friday management review meetings';

-- Rollback:
-- DROP TABLE IF EXISTS eva_friday_meetings;
