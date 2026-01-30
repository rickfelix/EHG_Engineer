-- Migration: Operational Integration Verification (OIV) Framework
-- Date: 2026-01-30
-- SD: SD-LEO-INFRA-OIV-001
-- Purpose: Create tables for OIV integration contracts and verification results
--
-- OIV validates that code artifacts are not only present but operationally integrated:
-- L1_FILE_EXISTS       - File exists on filesystem
-- L2_IMPORT_RESOLVES   - Import chain from trigger to target works
-- L3_EXPORT_EXISTS     - Expected function is exported (AST analysis)
-- L4_FUNCTION_CALLABLE - Function can be called (runtime dry-run)
-- L5_ARGS_COMPATIBLE   - Function signature matches caller expectations

-- ============================================================================
-- ENUM: oiv_checkpoint_level
-- Purpose: Defines the 5 verification levels for OIV
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oiv_checkpoint_level') THEN
    CREATE TYPE oiv_checkpoint_level AS ENUM (
      'L1_FILE_EXISTS',
      'L2_IMPORT_RESOLVES',
      'L3_EXPORT_EXISTS',
      'L4_FUNCTION_CALLABLE',
      'L5_ARGS_COMPATIBLE'
    );
  END IF;
END $$;

-- ============================================================================
-- ENUM: oiv_verification_mode
-- Purpose: Whether verification is static-only, runtime, or both
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oiv_verification_mode') THEN
    CREATE TYPE oiv_verification_mode AS ENUM (
      'static',
      'runtime',
      'both'
    );
  END IF;
END $$;

-- ============================================================================
-- ENUM: oiv_trigger_type
-- Purpose: What type of integration trigger this contract validates
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oiv_trigger_type') THEN
    CREATE TYPE oiv_trigger_type AS ENUM (
      'workflow',
      'sub_agent',
      'prd_hook',
      'handoff',
      'event',
      'api_route',
      'command'
    );
  END IF;
END $$;

-- ============================================================================
-- ENUM: oiv_result_status
-- Purpose: Result of an individual verification check
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oiv_result_status') THEN
    CREATE TYPE oiv_result_status AS ENUM (
      'PASS',
      'FAIL',
      'SKIP',
      'ERROR'
    );
  END IF;
END $$;

-- ============================================================================
-- TABLE: leo_integration_contracts
-- Purpose: Define expected integration points to verify
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_integration_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_key TEXT UNIQUE NOT NULL,  -- e.g., 'sub-agent-design-visual-polish'
  description TEXT NOT NULL,

  -- Trigger information
  trigger_type oiv_trigger_type NOT NULL,
  trigger_id TEXT NOT NULL,  -- Specific trigger (e.g., 'DESIGN', 'leo-create', 'add-prd-to-database')

  -- Entry point specification
  entry_point_file TEXT NOT NULL,       -- e.g., 'lib/sub-agents/design.js'
  entry_point_function TEXT NOT NULL,   -- e.g., 'execute'
  export_type TEXT DEFAULT 'named' CHECK (export_type IN ('named', 'default', 'cjs')),

  -- Import chain for L2 verification (array of import steps)
  import_chain JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"from": "lib/executor.js", "line": 178}, {"from": "lib/sub-agents/design.js", "exports": ["execute"]}]

  -- Expected function signature for L5 verification
  expected_params JSONB DEFAULT '[]'::jsonb,
  -- Example: [{"name": "context", "required": true}, {"name": "options", "required": false}]

  -- Verification settings
  checkpoint_level oiv_checkpoint_level NOT NULL DEFAULT 'L3_EXPORT_EXISTS',
  verification_mode oiv_verification_mode NOT NULL DEFAULT 'static',

  -- SD-Type applicability (which SD types this contract applies to)
  sd_type_scope TEXT[] DEFAULT ARRAY['feature', 'security']::TEXT[],
  -- NULL or empty = applies to all. Otherwise specific types.

  -- Gate integration
  gate_name TEXT,  -- Which handoff gate this belongs to (e.g., 'EXEC-TO-PLAN', 'Q')
  weight NUMERIC(4,3) DEFAULT 0.100 CHECK (weight >= 0 AND weight <= 1),

  -- Status
  is_active BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT DEFAULT 'SYSTEM'
);

-- ============================================================================
-- TABLE: leo_integration_verification_results
-- Purpose: Audit trail of verification runs with per-checkpoint breakdown
-- ============================================================================

CREATE TABLE IF NOT EXISTS leo_integration_verification_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,  -- Groups all checks from same verification run
  contract_id UUID REFERENCES leo_integration_contracts(id) ON DELETE CASCADE,
  contract_key TEXT NOT NULL,  -- Denormalized for faster queries

  -- SD context
  sd_id TEXT,  -- Strategic Directive being verified
  sd_type TEXT,  -- SD type at time of verification
  handoff_type TEXT,  -- e.g., 'EXEC-TO-PLAN'

  -- Per-checkpoint results
  l1_result oiv_result_status,
  l1_details JSONB DEFAULT '{}'::jsonb,

  l2_result oiv_result_status,
  l2_details JSONB DEFAULT '{}'::jsonb,

  l3_result oiv_result_status,
  l3_details JSONB DEFAULT '{}'::jsonb,

  l4_result oiv_result_status,
  l4_details JSONB DEFAULT '{}'::jsonb,

  l5_result oiv_result_status,
  l5_details JSONB DEFAULT '{}'::jsonb,

  -- Overall result
  final_status oiv_result_status NOT NULL,
  final_checkpoint oiv_checkpoint_level,  -- Which checkpoint was reached
  failure_checkpoint oiv_checkpoint_level,  -- Which checkpoint failed (if any)

  -- Score (0-100 based on how far verification got)
  score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),

  -- Error tracking
  error_message TEXT,
  remediation_hint TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Contracts lookup
CREATE INDEX IF NOT EXISTS idx_oiv_contracts_trigger_type ON leo_integration_contracts(trigger_type);
CREATE INDEX IF NOT EXISTS idx_oiv_contracts_trigger_id ON leo_integration_contracts(trigger_id);
CREATE INDEX IF NOT EXISTS idx_oiv_contracts_gate_name ON leo_integration_contracts(gate_name);
CREATE INDEX IF NOT EXISTS idx_oiv_contracts_is_active ON leo_integration_contracts(is_active);
CREATE INDEX IF NOT EXISTS idx_oiv_contracts_sd_type_scope ON leo_integration_contracts USING GIN (sd_type_scope);

-- Results lookup
CREATE INDEX IF NOT EXISTS idx_oiv_results_run_id ON leo_integration_verification_results(run_id);
CREATE INDEX IF NOT EXISTS idx_oiv_results_contract_id ON leo_integration_verification_results(contract_id);
CREATE INDEX IF NOT EXISTS idx_oiv_results_sd_id ON leo_integration_verification_results(sd_id);
CREATE INDEX IF NOT EXISTS idx_oiv_results_final_status ON leo_integration_verification_results(final_status);
CREATE INDEX IF NOT EXISTS idx_oiv_results_started_at ON leo_integration_verification_results(started_at);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE leo_integration_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE leo_integration_verification_results ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on leo_integration_contracts"
  ON leo_integration_contracts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access on leo_integration_verification_results"
  ON leo_integration_verification_results
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Anon role read access (for testing/debugging)
CREATE POLICY "Anon can read contracts"
  ON leo_integration_contracts
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can read and insert verification results"
  ON leo_integration_verification_results
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert verification results"
  ON leo_integration_verification_results
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated users full read access
CREATE POLICY "Authenticated users can read contracts"
  ON leo_integration_contracts
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read results"
  ON leo_integration_verification_results
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_oiv_contracts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_oiv_contracts_timestamp ON leo_integration_contracts;
CREATE TRIGGER trigger_update_oiv_contracts_timestamp
  BEFORE UPDATE ON leo_integration_contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_oiv_contracts_timestamp();

-- ============================================================================
-- HELPER FUNCTION: Get contracts for SD type
-- ============================================================================

CREATE OR REPLACE FUNCTION get_oiv_contracts_for_sd_type(p_sd_type TEXT)
RETURNS TABLE (
  contract_id UUID,
  contract_key TEXT,
  description TEXT,
  trigger_type oiv_trigger_type,
  trigger_id TEXT,
  entry_point_file TEXT,
  entry_point_function TEXT,
  export_type TEXT,
  import_chain JSONB,
  checkpoint_level oiv_checkpoint_level,
  verification_mode oiv_verification_mode,
  weight NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.contract_key,
    c.description,
    c.trigger_type,
    c.trigger_id,
    c.entry_point_file,
    c.entry_point_function,
    c.export_type,
    c.import_chain,
    c.checkpoint_level,
    c.verification_mode,
    c.weight
  FROM leo_integration_contracts c
  WHERE c.is_active = TRUE
    AND (
      c.sd_type_scope IS NULL
      OR array_length(c.sd_type_scope, 1) IS NULL
      OR p_sd_type = ANY(c.sd_type_scope)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- HELPER FUNCTION: Get OIV summary for a run
-- ============================================================================

CREATE OR REPLACE FUNCTION get_oiv_run_summary(p_run_id UUID)
RETURNS TABLE (
  contracts_total INTEGER,
  contracts_passed INTEGER,
  contracts_failed INTEGER,
  contracts_skipped INTEGER,
  overall_score NUMERIC,
  failed_contracts TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS contracts_total,
    COUNT(*) FILTER (WHERE final_status = 'PASS')::INTEGER AS contracts_passed,
    COUNT(*) FILTER (WHERE final_status = 'FAIL')::INTEGER AS contracts_failed,
    COUNT(*) FILTER (WHERE final_status = 'SKIP')::INTEGER AS contracts_skipped,
    ROUND(AVG(score), 2) AS overall_score,
    ARRAY_AGG(contract_key) FILTER (WHERE final_status = 'FAIL') AS failed_contracts
  FROM leo_integration_verification_results
  WHERE run_id = p_run_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE leo_integration_contracts IS 'OIV integration contracts defining expected code integration points to verify. Each contract specifies a file, function, and import chain that must be verifiable.';
COMMENT ON TABLE leo_integration_verification_results IS 'Audit trail of OIV verification runs with per-checkpoint breakdown (L1-L5). Links to contracts and SD context.';

COMMENT ON COLUMN leo_integration_contracts.contract_key IS 'Unique identifier for contract (e.g., sub-agent-design-visual-polish)';
COMMENT ON COLUMN leo_integration_contracts.trigger_type IS 'Type of integration: workflow, sub_agent, prd_hook, handoff, event, api_route, command';
COMMENT ON COLUMN leo_integration_contracts.trigger_id IS 'Specific trigger identifier (e.g., DESIGN, leo-create, add-prd-to-database)';
COMMENT ON COLUMN leo_integration_contracts.checkpoint_level IS 'Maximum verification depth: L1 (file) to L5 (args)';
COMMENT ON COLUMN leo_integration_contracts.sd_type_scope IS 'Which SD types this contract applies to. NULL/empty = all types.';
COMMENT ON COLUMN leo_integration_contracts.import_chain IS 'Array of import steps to verify for L2: [{"from": "file", "line": N}, ...]';

COMMENT ON COLUMN leo_integration_verification_results.run_id IS 'Groups all checks from same verification run for atomic reporting';
COMMENT ON COLUMN leo_integration_verification_results.final_checkpoint IS 'Highest checkpoint level successfully verified';
COMMENT ON COLUMN leo_integration_verification_results.failure_checkpoint IS 'Checkpoint level where verification failed (null if passed)';
COMMENT ON COLUMN leo_integration_verification_results.score IS 'Score 0-100: L1=20, L2=40, L3=60, L4=80, L5=100';

COMMENT ON FUNCTION get_oiv_contracts_for_sd_type IS 'Returns active contracts applicable to a given SD type. Used by OIVGate to load contracts.';
COMMENT ON FUNCTION get_oiv_run_summary IS 'Returns summary statistics for an OIV verification run.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
  table_exists BOOLEAN;
  enum_exists BOOLEAN;
BEGIN
  -- Check tables exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'leo_integration_contracts'
  ) INTO table_exists;

  IF NOT table_exists THEN
    RAISE EXCEPTION 'Migration failed: leo_integration_contracts table not created';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'leo_integration_verification_results'
  ) INTO table_exists;

  IF NOT table_exists THEN
    RAISE EXCEPTION 'Migration failed: leo_integration_verification_results table not created';
  END IF;

  -- Check enums exist
  SELECT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'oiv_checkpoint_level') INTO enum_exists;
  IF NOT enum_exists THEN
    RAISE EXCEPTION 'Migration failed: oiv_checkpoint_level enum not created';
  END IF;

  RAISE NOTICE 'OIV schema migration completed successfully';
  RAISE NOTICE 'Tables created: leo_integration_contracts, leo_integration_verification_results';
  RAISE NOTICE 'Enums created: oiv_checkpoint_level, oiv_verification_mode, oiv_trigger_type, oiv_result_status';
  RAISE NOTICE 'Functions created: get_oiv_contracts_for_sd_type, get_oiv_run_summary';
END $$;
