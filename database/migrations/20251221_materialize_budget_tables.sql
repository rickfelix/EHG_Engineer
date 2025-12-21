-- =====================================================
-- INDUSTRIAL HARDENING v3.0 - Materialize Budget Tables
-- Migration: 20251221_materialize_budget_tables.sql
-- SD Authority: Economic Circuit Breaker Audit
-- Purpose: Materialize venture_token_budgets and venture_phase_budgets tables
--          to enforce agent budget checks (currently bypassed with budgetRemaining: null)
-- =====================================================

-- =====================================================
-- CONTEXT: Economic Circuit Breaker Audit Discovery
-- =====================================================
-- The agent code (base-sub-agent.js, venture-ceo-runtime.js) references
-- venture_token_budgets table but it was DECLARED but NOT MATERIALIZED.
-- This causes budget enforcement to silently fail with budgetRemaining: null,
-- allowing agents to bypass token budget limits.
--
-- This migration creates the required budget infrastructure to enable
-- token-based resource governance for ventures.
-- =====================================================


-- =====================================================
-- 1. VENTURE TOKEN BUDGETS TABLE (Venture-Level)
-- =====================================================
-- Stores token budget allocation and consumption tracking per venture
-- Referenced by: lib/agents/base-sub-agent.js, lib/agents/venture-ceo-runtime.js

CREATE TABLE IF NOT EXISTS venture_token_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL UNIQUE REFERENCES ventures(id) ON DELETE CASCADE,

  -- Budget allocation
  budget_allocated INTEGER NOT NULL DEFAULT 100000, -- 100k tokens default
  budget_remaining INTEGER NOT NULL DEFAULT 100000,

  -- Budget lifecycle
  budget_reset_at TIMESTAMPTZ, -- When budget was last reset
  budget_reset_reason TEXT, -- Reason for budget reset (e.g., 'new_phase', 'manual_adjustment')

  -- Budget warnings and thresholds
  warning_threshold_pct INTEGER DEFAULT 20 CHECK (warning_threshold_pct BETWEEN 1 AND 100), -- Warn at 20% remaining
  critical_threshold_pct INTEGER DEFAULT 10 CHECK (critical_threshold_pct BETWEEN 1 AND 100), -- Critical at 10% remaining
  last_warning_sent_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_venture_token_budgets_venture_id ON venture_token_budgets(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_token_budgets_remaining ON venture_token_budgets(budget_remaining);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_venture_token_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_venture_token_budgets_updated_at ON venture_token_budgets;
CREATE TRIGGER trigger_venture_token_budgets_updated_at
BEFORE UPDATE ON venture_token_budgets
FOR EACH ROW
EXECUTE FUNCTION update_venture_token_budgets_updated_at();

-- Budget validation trigger (prevent negative budgets)
CREATE OR REPLACE FUNCTION validate_venture_token_budget()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.budget_remaining < 0 THEN
    RAISE EXCEPTION 'BUDGET_EXHAUSTED: Venture % has exhausted token budget (remaining: %)',
      NEW.venture_id, NEW.budget_remaining;
  END IF;

  IF NEW.budget_remaining > NEW.budget_allocated THEN
    RAISE WARNING 'Budget remaining (%) exceeds allocation (%) for venture %',
      NEW.budget_remaining, NEW.budget_allocated, NEW.venture_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_venture_token_budget ON venture_token_budgets;
CREATE TRIGGER trigger_validate_venture_token_budget
BEFORE INSERT OR UPDATE ON venture_token_budgets
FOR EACH ROW
EXECUTE FUNCTION validate_venture_token_budget();

COMMENT ON TABLE venture_token_budgets IS 'INDUSTRIAL-HARDENING-v3.0: Venture-level token budget tracking. Enforces Economic Circuit Breaker policy. Default 100k tokens per venture.';
COMMENT ON COLUMN venture_token_budgets.budget_allocated IS 'Total tokens allocated to this venture (refreshed on budget reset)';
COMMENT ON COLUMN venture_token_budgets.budget_remaining IS 'Current remaining token balance. Decremented on each agent execution.';
COMMENT ON COLUMN venture_token_budgets.warning_threshold_pct IS 'Percentage remaining that triggers budget warning (default 20%)';
COMMENT ON COLUMN venture_token_budgets.critical_threshold_pct IS 'Percentage remaining that triggers critical alert (default 10%)';


-- =====================================================
-- 2. VENTURE PHASE BUDGETS TABLE (Phase-Level)
-- =====================================================
-- Stores token budget allocation per venture lifecycle phase
-- Enables granular budget tracking across 25 lifecycle stages
-- Fallback source for budget checks when venture-level budget not found

CREATE TABLE IF NOT EXISTS venture_phase_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venture_id UUID NOT NULL REFERENCES ventures(id) ON DELETE CASCADE,
  phase_name VARCHAR(50) NOT NULL, -- e.g., 'Stage 10', 'Stage 13', 'EXEC', 'PLAN'

  -- Budget allocation
  budget_allocated INTEGER NOT NULL DEFAULT 20000, -- 20k tokens per phase default
  budget_remaining INTEGER NOT NULL DEFAULT 20000,

  -- Phase metadata
  phase_started_at TIMESTAMPTZ DEFAULT NOW(),
  phase_completed_at TIMESTAMPTZ,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one budget per phase per venture
  UNIQUE(venture_id, phase_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_venture_phase_budgets_venture_id ON venture_phase_budgets(venture_id);
CREATE INDEX IF NOT EXISTS idx_venture_phase_budgets_phase_name ON venture_phase_budgets(phase_name);
CREATE INDEX IF NOT EXISTS idx_venture_phase_budgets_remaining ON venture_phase_budgets(budget_remaining);
CREATE INDEX IF NOT EXISTS idx_venture_phase_budgets_active ON venture_phase_budgets(venture_id, phase_name)
  WHERE phase_completed_at IS NULL;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_venture_phase_budgets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_venture_phase_budgets_updated_at ON venture_phase_budgets;
CREATE TRIGGER trigger_venture_phase_budgets_updated_at
BEFORE UPDATE ON venture_phase_budgets
FOR EACH ROW
EXECUTE FUNCTION update_venture_phase_budgets_updated_at();

-- Budget validation trigger (prevent negative budgets)
CREATE OR REPLACE FUNCTION validate_venture_phase_budget()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.budget_remaining < 0 THEN
    RAISE EXCEPTION 'PHASE_BUDGET_EXHAUSTED: Venture % phase % has exhausted token budget (remaining: %)',
      NEW.venture_id, NEW.phase_name, NEW.budget_remaining;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_validate_venture_phase_budget ON venture_phase_budgets;
CREATE TRIGGER trigger_validate_venture_phase_budget
BEFORE INSERT OR UPDATE ON venture_phase_budgets
FOR EACH ROW
EXECUTE FUNCTION validate_venture_phase_budget();

COMMENT ON TABLE venture_phase_budgets IS 'INDUSTRIAL-HARDENING-v3.0: Phase-level token budget tracking. Enables granular budget allocation across venture lifecycle stages. Default 20k tokens per phase.';
COMMENT ON COLUMN venture_phase_budgets.phase_name IS 'Lifecycle phase name (e.g., Stage 10, Stage 13, EXEC, PLAN). Maps to lifecycle_stage_config.stage_name.';
COMMENT ON COLUMN venture_phase_budgets.budget_allocated IS 'Total tokens allocated to this phase';
COMMENT ON COLUMN venture_phase_budgets.budget_remaining IS 'Current remaining token balance for this phase. Decremented on agent execution within phase.';


-- =====================================================
-- 3. SEED BUDGETS FOR EXISTING VENTURES
-- =====================================================
-- Create venture-level budgets for all existing ventures
-- that don't already have budget records

INSERT INTO venture_token_budgets (venture_id, budget_allocated, budget_remaining)
SELECT
  v.id AS venture_id,
  100000 AS budget_allocated, -- 100k tokens
  100000 AS budget_remaining
FROM ventures v
LEFT JOIN venture_token_budgets vtb ON v.id = vtb.venture_id
WHERE vtb.id IS NULL; -- Only insert if no budget exists

-- Log how many budgets were seeded
DO $$
DECLARE
  inserted_count INTEGER;
BEGIN
  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE '✅ Seeded venture_token_budgets for % existing ventures', inserted_count;
END $$;


-- =====================================================
-- 4. RLS POLICIES (Row Level Security)
-- =====================================================
-- Protect budget tables - only venture owners can view/modify their budgets

-- Enable RLS
ALTER TABLE venture_token_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE venture_phase_budgets ENABLE ROW LEVEL SECURITY;

-- Policy 1: Service role has full access (for system operations)
CREATE POLICY "service_role_full_access_venture_token_budgets" ON venture_token_budgets
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

CREATE POLICY "service_role_full_access_venture_phase_budgets" ON venture_phase_budgets
FOR ALL TO service_role
USING (true)
WITH CHECK (true);

-- Policy 2: Authenticated users can view budgets for ventures they own
-- (Requires ventures table to have owner_id or similar - adjust as needed)
-- For now, allowing all authenticated users to read (can be restricted later)
CREATE POLICY "authenticated_read_venture_token_budgets" ON venture_token_budgets
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "authenticated_read_venture_phase_budgets" ON venture_phase_budgets
FOR SELECT TO authenticated
USING (true);

-- Policy 3: Anonymous users can read (optional - remove if not needed)
CREATE POLICY "anon_read_venture_token_budgets" ON venture_token_budgets
FOR SELECT TO anon
USING (true);

CREATE POLICY "anon_read_venture_phase_budgets" ON venture_phase_budgets
FOR SELECT TO anon
USING (true);

COMMENT ON POLICY "service_role_full_access_venture_token_budgets" ON venture_token_budgets IS
  'Service role needs full access for budget enforcement in agent execution';
COMMENT ON POLICY "authenticated_read_venture_token_budgets" ON venture_token_budgets IS
  'Authenticated users can view all venture budgets (can be restricted to venture owners later)';


-- =====================================================
-- 5. GRANT PERMISSIONS
-- =====================================================
-- Grant access to authenticated users and service role

GRANT ALL ON venture_token_budgets TO authenticated;
GRANT ALL ON venture_phase_budgets TO authenticated;

GRANT ALL ON venture_token_budgets TO service_role;
GRANT ALL ON venture_phase_budgets TO service_role;

-- Grant usage on sequences (if any)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- =====================================================
-- 6. VERIFICATION QUERIES
-- =====================================================
-- Verify tables were created and seeded successfully

DO $$
DECLARE
  budget_count INTEGER;
  venture_count INTEGER;
BEGIN
  -- Check table exists
  SELECT COUNT(*) INTO budget_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('venture_token_budgets', 'venture_phase_budgets');

  IF budget_count = 2 THEN
    RAISE NOTICE '✅ Migration: Tables created successfully (venture_token_budgets, venture_phase_budgets)';
  ELSE
    RAISE WARNING '⚠️ Migration: Expected 2 tables, found %', budget_count;
  END IF;

  -- Check budget records were seeded
  SELECT COUNT(*) INTO budget_count
  FROM venture_token_budgets;

  SELECT COUNT(*) INTO venture_count
  FROM ventures;

  RAISE NOTICE '✅ Migration: % budget records created for % total ventures', budget_count, venture_count;

  -- Check indexes created
  SELECT COUNT(*) INTO budget_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('venture_token_budgets', 'venture_phase_budgets');

  RAISE NOTICE '✅ Migration: % indexes created', budget_count;

  -- Check RLS enabled
  SELECT COUNT(*) INTO budget_count
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('venture_token_budgets', 'venture_phase_budgets')
    AND rowsecurity = true;

  IF budget_count = 2 THEN
    RAISE NOTICE '✅ Migration: RLS enabled on both tables';
  ELSE
    RAISE WARNING '⚠️ Migration: RLS not fully enabled (expected 2, found %)', budget_count;
  END IF;
END $$;


-- =====================================================
-- 7. SAMPLE QUERY (for verification)
-- =====================================================
-- Test query to verify budget lookups work as expected

-- Sample: Get budget status for all ventures
DO $$
DECLARE
  sample_venture_id UUID;
  sample_budget_remaining INTEGER;
BEGIN
  SELECT venture_id, budget_remaining
  INTO sample_venture_id, sample_budget_remaining
  FROM venture_token_budgets
  LIMIT 1;

  IF sample_venture_id IS NOT NULL THEN
    RAISE NOTICE '✅ Sample query: Venture % has % tokens remaining',
      sample_venture_id, sample_budget_remaining;
  ELSE
    RAISE NOTICE 'ℹ️ No ventures found for sample query';
  END IF;
END $$;


-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Next steps:
-- 1. Verify agent code (base-sub-agent.js, venture-ceo-runtime.js) can query these tables
-- 2. Create venture_budget_transactions table for ledger tracking (future migration)
-- 3. Create venture_budget_warnings table for alert management (future migration)
-- 4. Implement budget deduction logic in agent execution pipeline
-- 5. Test Economic Circuit Breaker with budget exhaustion scenarios
-- =====================================================
