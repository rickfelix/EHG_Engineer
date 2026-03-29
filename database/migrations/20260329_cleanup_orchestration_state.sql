-- Migration: Create cleanup_orchestration_state table
-- SD: SD-LEO-INFRA-VENTURE-CLEANUP-ORCHESTRATOR-001-C
-- Purpose: Checkpoint table for idempotent credential revocation re-runs

CREATE TABLE IF NOT EXISTS cleanup_orchestration_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID,
  venture_name TEXT,
  credential_id INTEGER REFERENCES application_credentials(id) ON DELETE SET NULL,
  credential_type VARCHAR(100),
  provider TEXT NOT NULL,            -- 'github', 'vercel', 'supabase'
  phase TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'revoked', 'revocation_failed', 'skipped'
  attempt_count INTEGER DEFAULT 0,
  error_details TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for lookups during re-runs
CREATE INDEX IF NOT EXISTS idx_cos_venture_phase ON cleanup_orchestration_state(venture_id, phase);
CREATE INDEX IF NOT EXISTS idx_cos_credential ON cleanup_orchestration_state(credential_id);

-- Auto-update trigger
CREATE OR REPLACE FUNCTION trg_cleanup_orch_state_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_orchestration_state_updated ON cleanup_orchestration_state;
CREATE TRIGGER trg_cleanup_orchestration_state_updated
  BEFORE UPDATE ON cleanup_orchestration_state
  FOR EACH ROW EXECUTE FUNCTION trg_cleanup_orch_state_updated();

-- RLS policies
ALTER TABLE cleanup_orchestration_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY manage_cleanup_orchestration_state ON cleanup_orchestration_state
  FOR ALL USING (true) WITH CHECK (true);

-- IMPORTANT: This table must NOT be included in master_reset_portfolio()
-- It persists across resets so failed revocations can be retried
COMMENT ON TABLE cleanup_orchestration_state IS
  'Checkpoint table for credential revocation during master reset. Survives resets for retry capability.';
