-- Migration: 20260322_venture_fundamentals.sql
-- SD: SD-LEO-INFRA-EHG-VENTURE-FUNDAMENTALS-001
-- Purpose: Create venture_fundamentals and venture_compliance tables
--          for the EHG Venture Fundamentals Framework
-- Author: database-agent (claude-opus-4-6)
-- Date: 2026-03-22

-- =============================================================================
-- Table 1: venture_fundamentals
-- Runtime configuration and standards for each venture.
-- =============================================================================

CREATE TABLE IF NOT EXISTS venture_fundamentals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL,
  venture_name TEXT NOT NULL,
  tech_stack_version TEXT NOT NULL DEFAULT '1.0.0',
  slo_tier TEXT NOT NULL CHECK (slo_tier IN ('tier_0_infrastructure', 'tier_1_mvp', 'tier_2_post_pmf')),
  slo_targets JSONB NOT NULL DEFAULT '{}',
  isolation_tier TEXT NOT NULL DEFAULT 'pool' CHECK (isolation_tier IN ('pool', 'schema', 'separate_project')),
  shared_packages JSONB NOT NULL DEFAULT '[]',
  conformance_score INTEGER DEFAULT 0 CHECK (conformance_score >= 0 AND conformance_score <= 100),
  last_conformance_check TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint: one config per venture
ALTER TABLE venture_fundamentals
  ADD CONSTRAINT uq_venture_fundamentals_venture_id UNIQUE (venture_id);

-- Table comment
COMMENT ON TABLE venture_fundamentals IS 'Runtime configuration and standards for each EHG venture. Tracks tech stack version, SLO tier, isolation level, shared packages, and conformance scoring.';
COMMENT ON COLUMN venture_fundamentals.venture_id IS 'UUID of the venture this configuration belongs to';
COMMENT ON COLUMN venture_fundamentals.slo_tier IS 'Current SLO tier: tier_0_infrastructure (internal tooling), tier_1_mvp (pre-PMF), tier_2_post_pmf (production)';
COMMENT ON COLUMN venture_fundamentals.slo_targets IS 'JSONB object with SLO target values for the current tier (e.g., {"uptime": 99.9, "p95_latency_ms": 500})';
COMMENT ON COLUMN venture_fundamentals.isolation_tier IS 'Supabase isolation level: pool (shared), schema (isolated schema), separate_project (dedicated instance)';
COMMENT ON COLUMN venture_fundamentals.shared_packages IS 'JSONB array of @ehg/* packages and versions used by this venture';
COMMENT ON COLUMN venture_fundamentals.conformance_score IS 'Overall conformance score (0-100) from the latest audit';

-- =============================================================================
-- Table 2: venture_compliance
-- Tracks conformance checking results per venture.
-- =============================================================================

CREATE TABLE IF NOT EXISTS venture_compliance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL,
  check_type TEXT NOT NULL CHECK (check_type IN ('structure', 'dependencies', 'lint_config', 'tailwind_config', 'design_tokens', 'supabase_config', 'ci_cd', 'full_audit')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passing', 'failing', 'warning', 'skipped')),
  score INTEGER CHECK (score >= 0 AND score <= 100),
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  checked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite index for efficient queries by venture + check type
CREATE INDEX IF NOT EXISTS idx_venture_compliance_venture_check
  ON venture_compliance (venture_id, check_type);

-- Table comment
COMMENT ON TABLE venture_compliance IS 'Individual conformance check results per venture. Each row represents one check run (structure, dependencies, lint, etc.).';
COMMENT ON COLUMN venture_compliance.check_type IS 'Type of conformance check performed';
COMMENT ON COLUMN venture_compliance.status IS 'Check result: pending, passing, failing, warning, or skipped';
COMMENT ON COLUMN venture_compliance.score IS 'Numeric score (0-100) for this specific check';
COMMENT ON COLUMN venture_compliance.details IS 'JSONB object with specific findings and diagnostics from the check';
COMMENT ON COLUMN venture_compliance.checked_by IS 'What initiated the check: ci_gate, manual, or scheduled';

-- =============================================================================
-- Trigger: auto-update updated_at on venture_fundamentals
-- Reuses the existing update_updated_at_column() function.
-- =============================================================================

CREATE TRIGGER trg_venture_fundamentals_updated_at
  BEFORE UPDATE ON venture_fundamentals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- RLS: Enable Row Level Security on both tables
-- =============================================================================

ALTER TABLE venture_fundamentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_compliance ENABLE ROW LEVEL SECURITY;

-- Policy: service role has full access to venture_fundamentals
CREATE POLICY service_role_all_venture_fundamentals
  ON venture_fundamentals
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: service role has full access to venture_compliance
CREATE POLICY service_role_all_venture_compliance
  ON venture_compliance
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Policy: authenticated users can read venture_fundamentals
CREATE POLICY authenticated_select_venture_fundamentals
  ON venture_fundamentals
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: authenticated users can read venture_compliance
CREATE POLICY authenticated_select_venture_compliance
  ON venture_compliance
  FOR SELECT
  TO authenticated
  USING (true);

-- =============================================================================
-- Rollback SQL (for reference only, not auto-executed)
-- =============================================================================
-- DROP POLICY IF EXISTS authenticated_select_venture_compliance ON venture_compliance;
-- DROP POLICY IF EXISTS authenticated_select_venture_fundamentals ON venture_fundamentals;
-- DROP POLICY IF EXISTS service_role_all_venture_compliance ON venture_compliance;
-- DROP POLICY IF EXISTS service_role_all_venture_fundamentals ON venture_fundamentals;
-- ALTER TABLE venture_compliance DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE venture_fundamentals DISABLE ROW LEVEL SECURITY;
-- DROP TRIGGER IF EXISTS trg_venture_fundamentals_updated_at ON venture_fundamentals;
-- DROP INDEX IF EXISTS idx_venture_compliance_venture_check;
-- DROP TABLE IF EXISTS venture_compliance;
-- DROP TABLE IF EXISTS venture_fundamentals;
