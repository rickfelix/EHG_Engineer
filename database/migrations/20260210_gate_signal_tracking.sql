-- Migration: Intermediate Gate Signal Tracking
-- SD: SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-D
-- Purpose: Track per-gate survival signals linking profile+version to venture outcomes

-- Create evaluation_profile_outcomes table
CREATE TABLE IF NOT EXISTS evaluation_profile_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES evaluation_profiles(id) ON DELETE SET NULL,
  profile_version INTEGER,
  venture_id UUID NOT NULL,
  gate_boundary TEXT NOT NULL,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('pass', 'fail', 'review', 'skip')),
  outcome JSONB NOT NULL DEFAULT '{}',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_epo_profile_id ON evaluation_profile_outcomes(profile_id);
CREATE INDEX IF NOT EXISTS idx_epo_venture_id ON evaluation_profile_outcomes(venture_id);
CREATE INDEX IF NOT EXISTS idx_epo_boundary ON evaluation_profile_outcomes(gate_boundary);
CREATE INDEX IF NOT EXISTS idx_epo_profile_boundary ON evaluation_profile_outcomes(profile_id, gate_boundary);

-- RLS
ALTER TABLE evaluation_profile_outcomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "epo_read_all" ON evaluation_profile_outcomes FOR SELECT USING (true);
CREATE POLICY "epo_write_service" ON evaluation_profile_outcomes FOR ALL USING (true) WITH CHECK (true);

-- Add profile_id to venture_briefs
ALTER TABLE venture_briefs
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES evaluation_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_venture_briefs_profile_id ON venture_briefs(profile_id);

COMMENT ON TABLE evaluation_profile_outcomes IS 'Per-gate survival signals linking evaluation profile+version to venture outcomes at tracked boundaries';
COMMENT ON COLUMN evaluation_profile_outcomes.gate_boundary IS 'Stage boundary key (e.g. "5->6", "stage_3", "graduation")';
COMMENT ON COLUMN evaluation_profile_outcomes.signal_type IS 'Gate outcome signal: pass, fail, review, or skip';
COMMENT ON COLUMN evaluation_profile_outcomes.outcome IS 'Detailed outcome data including scores, reasons, and metadata';
COMMENT ON COLUMN venture_briefs.profile_id IS 'Evaluation profile active when this brief was created (nullable for pre-profile briefs)';
