-- Migration: Create constitutional_amendments table
-- Purpose: Track proposed amendments to protocol constitution rules
-- Date: 2026-02-20
-- SD: SD-EHG-ORCH-GOVERNANCE-STACK-001

-- 1. Create the constitutional_amendments table
CREATE TABLE IF NOT EXISTS constitutional_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code TEXT NOT NULL,
  original_text TEXT,
  proposed_text TEXT NOT NULL,
  rationale TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'rejected', 'archived')),
  proposed_by TEXT DEFAULT 'chairman',
  approved_by TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table comment
COMMENT ON TABLE constitutional_amendments IS 'Tracks proposed amendments to protocol constitution rules (protocol_constitution table)';

-- 3. Column comments
COMMENT ON COLUMN constitutional_amendments.rule_code IS 'References which CONST rule is being amended (e.g., CONST-001)';
COMMENT ON COLUMN constitutional_amendments.original_text IS 'Snapshot of the original rule_text at time of amendment proposal';
COMMENT ON COLUMN constitutional_amendments.proposed_text IS 'The new proposed text for the rule';
COMMENT ON COLUMN constitutional_amendments.rationale IS 'Justification for why the amendment is proposed';
COMMENT ON COLUMN constitutional_amendments.status IS 'Amendment lifecycle: draft -> active/rejected -> archived';
COMMENT ON COLUMN constitutional_amendments.proposed_by IS 'Who proposed the amendment (default: chairman)';
COMMENT ON COLUMN constitutional_amendments.approved_by IS 'Who approved the amendment (NULL until approved)';
COMMENT ON COLUMN constitutional_amendments.version IS 'Tracks amendment version number for the same rule_code';

-- 4. Create index on rule_code for filtering
CREATE INDEX IF NOT EXISTS idx_constitutional_amendments_rule_code
  ON constitutional_amendments (rule_code);

-- 5. Create updated_at trigger (reusing existing trigger_set_updated_at function)
CREATE TRIGGER set_constitutional_amendments_updated_at
  BEFORE UPDATE ON constitutional_amendments
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- 6. Enable Row Level Security
ALTER TABLE constitutional_amendments ENABLE ROW LEVEL SECURITY;

-- 7. Create service_role_all policy (same pattern as missions table)
CREATE POLICY service_role_all ON constitutional_amendments
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Rollback SQL (if needed):
-- DROP POLICY IF EXISTS service_role_all ON constitutional_amendments;
-- DROP TRIGGER IF EXISTS set_constitutional_amendments_updated_at ON constitutional_amendments;
-- DROP INDEX IF EXISTS idx_constitutional_amendments_rule_code;
-- DROP TABLE IF EXISTS constitutional_amendments;
