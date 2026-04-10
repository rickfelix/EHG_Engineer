-- Migration: eva_friday_decisions
-- Purpose: Friday Management Review Meeting decisions table
-- SD: SD-FRIDAY-MANAGEMENT-REVIEW-MEETING-ORCH-001
-- Date: 2026-04-10

CREATE TABLE IF NOT EXISTS eva_friday_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  decision_type TEXT NOT NULL CHECK (decision_type IN ('kill_sd', 'approve_proposal', 'redirect', 'defer', 'flag', 'custom')),
  description TEXT NOT NULL,
  target_entity_type TEXT, -- 'sd', 'proposal', 'okr', etc.
  target_entity_id TEXT,
  consequences JSONB, -- [{type: 'unblocks', entity: 'SD-456'}, {type: 'cancels_prd', entity: 'PRD-123'}]
  confirmed BOOLEAN DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  executed BOOLEAN DEFAULT false,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Service role only (no direct client access)
ALTER TABLE eva_friday_decisions ENABLE ROW LEVEL SECURITY;

-- Index on meeting_date for efficient lookups by meeting
CREATE INDEX IF NOT EXISTS idx_eva_friday_decisions_meeting_date ON eva_friday_decisions (meeting_date);

-- Index on decision_type for filtering
CREATE INDEX IF NOT EXISTS idx_eva_friday_decisions_type ON eva_friday_decisions (decision_type);

-- Index on target_entity for lookups by affected entity
CREATE INDEX IF NOT EXISTS idx_eva_friday_decisions_target ON eva_friday_decisions (target_entity_type, target_entity_id);

-- GIN index on consequences JSONB for querying side-effects
CREATE INDEX IF NOT EXISTS idx_eva_friday_decisions_consequences ON eva_friday_decisions USING GIN (consequences);

COMMENT ON TABLE eva_friday_decisions IS 'Chairman decisions made during Friday Management Review Meetings';
COMMENT ON COLUMN eva_friday_decisions.decision_type IS 'Type of decision: kill_sd, approve_proposal, redirect, defer, flag, or custom';
COMMENT ON COLUMN eva_friday_decisions.target_entity_type IS 'Entity type affected (sd, proposal, okr, etc.)';
COMMENT ON COLUMN eva_friday_decisions.target_entity_id IS 'Identifier of the affected entity (e.g., SD key or PRD ID)';
COMMENT ON COLUMN eva_friday_decisions.consequences IS 'Array of side-effects: [{type, entity}]';
COMMENT ON COLUMN eva_friday_decisions.confirmed IS 'Whether the chairman has confirmed this decision';
COMMENT ON COLUMN eva_friday_decisions.executed IS 'Whether the decision side-effects have been applied';

-- Rollback:
-- DROP TABLE IF EXISTS eva_friday_decisions;
