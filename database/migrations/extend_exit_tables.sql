-- ============================================================================
-- Migration: Extend Exit Tables for Stage 9 Wiring
-- SD: SD-LEO-INFRA-EXTEND-EXIT-TABLES-001 (SD-A)
-- Date: 2026-03-15
-- Description:
--   1. ALTER venture_exit_profiles: add exit_context, review_period
--   2. Create composite unique index on (venture_id, exit_context)
--   3. Tighten RLS on venture_exit_profiles to owner-scoped
-- ============================================================================

-- Step 1: Add columns to venture_exit_profiles
ALTER TABLE venture_exit_profiles
  ADD COLUMN IF NOT EXISTS exit_context TEXT DEFAULT 'planning'
    CHECK (exit_context IN ('planning', 'readiness_assessment')),
  ADD COLUMN IF NOT EXISTS review_period TEXT;

COMMENT ON COLUMN venture_exit_profiles.exit_context IS 'Context in which the exit profile was created: planning (Stage 9) or readiness_assessment (later stages)';
COMMENT ON COLUMN venture_exit_profiles.review_period IS 'Review period label, e.g. Q1-2026, for tracking when the profile was assessed';

-- Step 2: Replace the existing current-profile index with a composite context-aware unique index
-- The old index enforced one current profile per venture; the new one enforces
-- one current profile per (venture, exit_context) pair, excluding superseded rows.
DROP INDEX IF EXISTS idx_exit_profiles_current;

CREATE UNIQUE INDEX idx_exit_profiles_current_context
  ON venture_exit_profiles (venture_id, exit_context)
  WHERE is_current = true;

-- Step 3: Tighten RLS — replace overly permissive authenticated policies with owner-scoped
-- Drop the old permissive policies
DROP POLICY IF EXISTS exit_profiles_select_authenticated ON venture_exit_profiles;
DROP POLICY IF EXISTS exit_profiles_insert_authenticated ON venture_exit_profiles;
DROP POLICY IF EXISTS exit_profiles_update_authenticated ON venture_exit_profiles;

-- Create owner-scoped policies: authenticated users can only access their own venture data
CREATE POLICY exit_profiles_select_owner ON venture_exit_profiles
  FOR SELECT TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY exit_profiles_insert_owner ON venture_exit_profiles
  FOR INSERT TO authenticated
  WITH CHECK (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

CREATE POLICY exit_profiles_update_owner ON venture_exit_profiles
  FOR UPDATE TO authenticated
  USING (venture_id IN (SELECT id FROM ventures WHERE created_by = auth.uid()));

-- Service role policy is preserved from the original migration (exit_profiles_service_role)

-- ============================================================================
-- ROLLBACK (if needed):
-- DROP POLICY IF EXISTS exit_profiles_update_owner ON venture_exit_profiles;
-- DROP POLICY IF EXISTS exit_profiles_insert_owner ON venture_exit_profiles;
-- DROP POLICY IF EXISTS exit_profiles_select_owner ON venture_exit_profiles;
-- CREATE POLICY exit_profiles_select_authenticated ON venture_exit_profiles FOR SELECT TO authenticated USING (true);
-- CREATE POLICY exit_profiles_insert_authenticated ON venture_exit_profiles FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY exit_profiles_update_authenticated ON venture_exit_profiles FOR UPDATE TO authenticated USING (true);
-- DROP INDEX IF EXISTS idx_exit_profiles_current_context;
-- CREATE UNIQUE INDEX idx_exit_profiles_current ON venture_exit_profiles(venture_id, is_current) WHERE is_current = true;
-- ALTER TABLE venture_exit_profiles DROP COLUMN IF EXISTS review_period;
-- ALTER TABLE venture_exit_profiles DROP COLUMN IF EXISTS exit_context;
-- ============================================================================
