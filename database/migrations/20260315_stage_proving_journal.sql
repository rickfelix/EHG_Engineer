-- Migration: Create stage_proving_journal table
-- SD: SD-LEO-INFRA-STAGE-VENTURE-PROVING-001
-- Purpose: Tracks per-stage planned vs actual outcomes during venture proving assessments
-- Date: 2026-03-15

CREATE TABLE IF NOT EXISTS stage_proving_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id),
  stage_number INT NOT NULL CHECK (stage_number >= 0 AND stage_number <= 25),
  gate_stage INT,
  planned JSONB DEFAULT '{}',
  actual JSONB DEFAULT '{}',
  gaps JSONB DEFAULT '[]',
  enhancements JSONB DEFAULT '[]',
  chairman_decision TEXT CHECK (chairman_decision IN ('proceed', 'fix_first', 'skip', 'defer')),
  journal_notes TEXT,
  assessment_duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (venture_id, stage_number)
);

-- RLS
ALTER TABLE stage_proving_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON stage_proving_journal
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Update trigger
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON stage_proving_journal
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE stage_proving_journal IS 'Records per-stage assessment results from venture proving runs. Each entry captures Plan Agent, Reality Agent, Gap Analyst outputs and chairman decisions.';

-- Rollback SQL:
-- DROP TRIGGER IF EXISTS set_updated_at ON stage_proving_journal;
-- DROP POLICY IF EXISTS "service_role_all" ON stage_proving_journal;
-- DROP TABLE IF EXISTS stage_proving_journal;
