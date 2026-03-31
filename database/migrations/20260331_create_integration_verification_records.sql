-- Migration: Create integration_verification_records table
-- SD: SD-LEO-INFRA-INTEGRATION-VERIFICATION-ENFORCEMENT-001
-- Purpose: Persist per-SD verification outcomes from integration gates

CREATE TABLE IF NOT EXISTS integration_verification_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sd_id VARCHAR(50) NOT NULL REFERENCES strategic_directives_v2(id),
  gate_name TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('pass', 'fail', 'skip', 'error')),
  score INTEGER DEFAULT 0,
  max_score INTEGER DEFAULT 100,
  gaps_found JSONB DEFAULT '[]'::jsonb,
  details JSONB DEFAULT '{}'::jsonb,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ivr_sd_id ON integration_verification_records(sd_id);
CREATE INDEX IF NOT EXISTS idx_ivr_gate_name ON integration_verification_records(gate_name);
CREATE INDEX IF NOT EXISTS idx_ivr_checked_at ON integration_verification_records(checked_at DESC);

-- RLS policies
ALTER TABLE integration_verification_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on integration_verification_records"
  ON integration_verification_records
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated read on integration_verification_records"
  ON integration_verification_records
  FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE integration_verification_records IS 'Audit trail of integration verification gate outcomes per SD';
