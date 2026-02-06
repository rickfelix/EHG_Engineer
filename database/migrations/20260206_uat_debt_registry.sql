-- UAT Debt Registry
-- SD: SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001
-- US-005: Create UAT debt registry database table
--
-- Stores deferred human-judgment items, non-critical Vision QA findings,
-- and skipped/timeout outcomes with evidence for later /uat review.

BEGIN;

-- Main table
CREATE TABLE IF NOT EXISTS uat_debt_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('vision_qa', 'skip', 'manual')),
  category TEXT NOT NULL CHECK (category IN ('bug', 'accessibility', 'performance', 'ux_judgment', 'untested')),
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  confidence NUMERIC(3,2) CHECK (confidence >= 0.00 AND confidence <= 1.00),
  description TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  vision_qa_session_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'resolved', 'wontfix')),
  area TEXT,
  issue_signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_uat_debt_status_area ON uat_debt_registry (status, area);
CREATE INDEX IF NOT EXISTS idx_uat_debt_sd_id ON uat_debt_registry (sd_id);
CREATE INDEX IF NOT EXISTS idx_uat_debt_issue_signature ON uat_debt_registry (issue_signature) WHERE issue_signature IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_uat_debt_created_at ON uat_debt_registry (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uat_debt_session ON uat_debt_registry (vision_qa_session_id) WHERE vision_qa_session_id IS NOT NULL;

-- GIN index on evidence for JSONB queries
CREATE INDEX IF NOT EXISTS idx_uat_debt_evidence ON uat_debt_registry USING GIN (evidence);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_uat_debt_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_uat_debt_updated_at ON uat_debt_registry;
CREATE TRIGGER trg_uat_debt_updated_at
  BEFORE UPDATE ON uat_debt_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_uat_debt_updated_at();

-- RLS policies
ALTER TABLE uat_debt_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access on uat_debt_registry"
  ON uat_debt_registry
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE uat_debt_registry IS 'Stores deferred human-judgment testing items from Vision QA and /uat workflows. Part of Three-Tier Testing Architecture (SD-LEO-ENH-VISION-QA-AUTO-PROCEED-001).';

COMMENT ON COLUMN uat_debt_registry.sd_id IS 'Strategic Directive ID (TEXT, matches strategic_directives_v2.id)';

COMMIT;
