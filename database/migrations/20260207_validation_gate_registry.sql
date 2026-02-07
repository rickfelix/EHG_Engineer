-- ============================================================================
-- SD-LEO-INFRA-VALIDATION-GATE-REGISTRY-001
-- Validation Gate Registry - Database-First Gate Policy
--
-- Creates a database-backed policy table for validation gate applicability.
-- Replaces hardcoded SD-type gate exemptions with queryable policy rows.
-- ============================================================================

-- Step 1: Create applicability enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'gate_applicability') THEN
    CREATE TYPE gate_applicability AS ENUM ('REQUIRED', 'OPTIONAL', 'DISABLED');
  END IF;
END$$;

-- Step 2: Create the validation_gate_registry table
CREATE TABLE IF NOT EXISTS validation_gate_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_key VARCHAR(100) NOT NULL,
  sd_type VARCHAR(50),
  validation_profile VARCHAR(50),
  applicability gate_applicability NOT NULL DEFAULT 'REQUIRED',
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Step 3: Functional unique index to prevent duplicate policy rows
-- Uses COALESCE to handle NULL columns in uniqueness check
CREATE UNIQUE INDEX IF NOT EXISTS idx_gate_registry_unique_scope
  ON validation_gate_registry (gate_key, COALESCE(sd_type, '*'), COALESCE(validation_profile, '*'));

-- Step 4: Performance index for policy lookups by gate_key
CREATE INDEX IF NOT EXISTS idx_gate_registry_gate_key
  ON validation_gate_registry (gate_key);

-- Step 5: Performance index for lookups by sd_type
CREATE INDEX IF NOT EXISTS idx_gate_registry_sd_type
  ON validation_gate_registry (sd_type)
  WHERE sd_type IS NOT NULL;

-- Step 6: Check constraint - at least one of sd_type or validation_profile must be set
-- (or explicitly set to '*' for global policies)
ALTER TABLE validation_gate_registry
  DROP CONSTRAINT IF EXISTS chk_gate_registry_scope;
ALTER TABLE validation_gate_registry
  ADD CONSTRAINT chk_gate_registry_scope
  CHECK (sd_type IS NOT NULL OR validation_profile IS NOT NULL);

-- Step 7: Updated_at trigger
CREATE OR REPLACE FUNCTION update_gate_registry_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gate_registry_updated_at ON validation_gate_registry;
CREATE TRIGGER trg_gate_registry_updated_at
  BEFORE UPDATE ON validation_gate_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_gate_registry_updated_at();

-- Step 8: RLS Policy
ALTER TABLE validation_gate_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access_gate_registry" ON validation_gate_registry;
CREATE POLICY "service_role_full_access_gate_registry"
  ON validation_gate_registry
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_read_gate_registry" ON validation_gate_registry;
CREATE POLICY "authenticated_read_gate_registry"
  ON validation_gate_registry
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Step 9: Seed existing SD-type gate exemptions
-- These represent the current hardcoded exemptions in gate code
-- ============================================================================

-- UAT SD type exemptions
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES
  ('GATE1_DESIGN_DATABASE', 'uat', 'DISABLED', 'UAT SDs do not require DESIGN/DATABASE sub-agent validation per SD type policy'),
  ('GATE_PRD_EXISTS', 'uat', 'DISABLED', 'UAT SDs exempt from PRD requirement - FRICTION-ANALYSIS-001 identified this as unnecessary friction'),
  ('GATE_ARCHITECTURE_VERIFICATION', 'uat', 'DISABLED', 'UAT SDs do not require architecture verification - no code changes expected'),
  ('GATE_EXPLORATION_AUDIT', 'uat', 'DISABLED', 'UAT SDs skip exploration audit - testing-focused scope')
ON CONFLICT (gate_key, COALESCE(sd_type, '*'), COALESCE(validation_profile, '*')) DO NOTHING;

-- Documentation SD type exemptions
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES
  ('GATE1_DESIGN_DATABASE', 'documentation', 'DISABLED', 'Documentation SDs do not require DESIGN/DATABASE validation - no code changes'),
  ('GATE1_DESIGN_DATABASE', 'docs', 'DISABLED', 'Docs SDs do not require DESIGN/DATABASE validation - no code changes'),
  ('GATE_ARCHITECTURE_VERIFICATION', 'documentation', 'DISABLED', 'Documentation SDs skip architecture verification'),
  ('GATE_ARCHITECTURE_VERIFICATION', 'docs', 'DISABLED', 'Docs SDs skip architecture verification'),
  ('GATE_EXPLORATION_AUDIT', 'documentation', 'DISABLED', 'Documentation SDs skip exploration audit'),
  ('GATE_EXPLORATION_AUDIT', 'docs', 'DISABLED', 'Docs SDs skip exploration audit')
ON CONFLICT (gate_key, COALESCE(sd_type, '*'), COALESCE(validation_profile, '*')) DO NOTHING;

-- Infrastructure SD type exemptions
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES
  ('GATE1_DESIGN_DATABASE', 'infrastructure', 'DISABLED', 'Infrastructure SDs do not require DESIGN/DATABASE sub-agent validation per NON_CODE category'),
  ('GATE_EXPLORATION_AUDIT', 'infrastructure', 'DISABLED', 'Infrastructure SDs skip exploration audit per NON_CODE category')
ON CONFLICT (gate_key, COALESCE(sd_type, '*'), COALESCE(validation_profile, '*')) DO NOTHING;

-- Process SD type exemptions
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES
  ('GATE1_DESIGN_DATABASE', 'process', 'DISABLED', 'Process SDs do not require DESIGN/DATABASE validation - no code changes'),
  ('GATE_ARCHITECTURE_VERIFICATION', 'process', 'DISABLED', 'Process SDs skip architecture verification'),
  ('GATE_EXPLORATION_AUDIT', 'process', 'DISABLED', 'Process SDs skip exploration audit')
ON CONFLICT (gate_key, COALESCE(sd_type, '*'), COALESCE(validation_profile, '*')) DO NOTHING;

-- Orchestrator SD type exemptions
INSERT INTO validation_gate_registry (gate_key, sd_type, applicability, reason)
VALUES
  ('GATE1_DESIGN_DATABASE', 'orchestrator', 'DISABLED', 'Orchestrator SDs delegate work to children - no direct code changes'),
  ('GATE_ARCHITECTURE_VERIFICATION', 'orchestrator', 'DISABLED', 'Orchestrator SDs skip architecture verification - delegated to children'),
  ('GATE_EXPLORATION_AUDIT', 'orchestrator', 'DISABLED', 'Orchestrator SDs skip exploration audit - delegated to children')
ON CONFLICT (gate_key, COALESCE(sd_type, '*'), COALESCE(validation_profile, '*')) DO NOTHING;

-- ============================================================================
-- Step 10: Comment on table for documentation
-- ============================================================================
COMMENT ON TABLE validation_gate_registry IS 'Database-first policy for validation gate applicability per SD type and validation profile. Part of SD-LEO-INFRA-VALIDATION-GATE-REGISTRY-001.';
COMMENT ON COLUMN validation_gate_registry.gate_key IS 'Identifier of the validation gate (e.g., GATE_PRD_EXISTS, GATE1_DESIGN_DATABASE)';
COMMENT ON COLUMN validation_gate_registry.sd_type IS 'SD type this policy applies to (NULL = any type, use with validation_profile for specificity)';
COMMENT ON COLUMN validation_gate_registry.validation_profile IS 'Validation profile this policy applies to (NULL = any profile)';
COMMENT ON COLUMN validation_gate_registry.applicability IS 'Whether the gate is REQUIRED, OPTIONAL, or DISABLED for this scope';
COMMENT ON COLUMN validation_gate_registry.reason IS 'Audit trail: why this policy exists (references SD/issue/decision)';
