-- PCVP Phase 2: Automated Verification Module & Audit Trail
-- SD: SD-LEO-PROTOCOL-PCVP-COMPLETION-INTEGRITY-001-B
--
-- Creates:
-- 1. sd_verification_results table
-- 2. pcvp_verification_log table (INSERT-only RLS)

BEGIN;

-- ============================================================
-- 1. sd_verification_results - Stores verification outcomes
-- ============================================================
CREATE TABLE IF NOT EXISTS sd_verification_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sd_id VARCHAR NOT NULL REFERENCES strategic_directives_v2(id),
  verification_type VARCHAR(50) NOT NULL,  -- 'handoff_chain', 'pr_evidence', 'test_evidence', 'quality_gate'
  result VARCHAR(20) NOT NULL DEFAULT 'pending',  -- 'pass', 'fail', 'warn', 'pending'
  score INT CHECK (score >= 0 AND score <= 100),
  tier VARCHAR(20) NOT NULL DEFAULT 'standard',  -- 'high', 'standard', 'light'
  details JSONB DEFAULT '{}',
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  verified_by VARCHAR(100) DEFAULT 'PCVP_VERIFIER',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_svr_sd_id ON sd_verification_results(sd_id);
CREATE INDEX IF NOT EXISTS idx_svr_result ON sd_verification_results(result);
CREATE INDEX IF NOT EXISTS idx_svr_type ON sd_verification_results(verification_type);

-- ============================================================
-- 2. pcvp_verification_log - Immutable audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS pcvp_verification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sd_id VARCHAR NOT NULL,
  sd_key VARCHAR,
  event_type VARCHAR(50) NOT NULL,  -- 'completion_verified', 'completion_blocked', 'bypass_used', 'anomaly_detected'
  event_data JSONB DEFAULT '{}',
  verification_score INT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'PCVP_SYSTEM'
);

CREATE INDEX IF NOT EXISTS idx_pvl_sd_id ON pcvp_verification_log(sd_id);
CREATE INDEX IF NOT EXISTS idx_pvl_event_type ON pcvp_verification_log(event_type);
CREATE INDEX IF NOT EXISTS idx_pvl_created_at ON pcvp_verification_log(created_at);

-- INSERT-only RLS: no UPDATE or DELETE for non-admin roles
ALTER TABLE pcvp_verification_log ENABLE ROW LEVEL SECURITY;

-- Allow inserts for all authenticated/service roles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pcvp_log_insert_policy') THEN
    CREATE POLICY pcvp_log_insert_policy ON pcvp_verification_log FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'pcvp_log_select_policy') THEN
    CREATE POLICY pcvp_log_select_policy ON pcvp_verification_log FOR SELECT USING (true);
  END IF;
END $$;

-- No UPDATE policy = no updates allowed
-- No DELETE policy = no deletes allowed (except for postgres/admin role)

COMMIT;
