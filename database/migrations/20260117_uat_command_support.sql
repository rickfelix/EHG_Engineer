-- Migration: UAT Command Support
-- SD: SD-UAT-DB-001
-- Purpose: Extend existing uat_test_runs and uat_test_results tables for /uat command
-- Based on triangulated design (AntiGravity 8/10, OpenAI 7/10)

-- ============================================================
-- PHASE 1: Extend uat_test_runs table
-- ============================================================

-- Add columns to uat_test_runs for /uat command support
ALTER TABLE uat_test_runs
ADD COLUMN IF NOT EXISTS sd_id VARCHAR(50),
ADD COLUMN IF NOT EXISTS triggered_by VARCHAR(100) DEFAULT 'MANUAL',
ADD COLUMN IF NOT EXISTS commit_sha VARCHAR(40),
ADD COLUMN IF NOT EXISTS build_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS executed_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS scenario_snapshot JSONB,
ADD COLUMN IF NOT EXISTS quality_gate VARCHAR(10),
ADD COLUMN IF NOT EXISTS defects_found INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS quick_fixes_created INTEGER DEFAULT 0;

-- Add index for sd_id lookups
CREATE INDEX IF NOT EXISTS idx_uat_test_runs_sd_id ON uat_test_runs(sd_id);

-- Add index for triggered_by lookups
CREATE INDEX IF NOT EXISTS idx_uat_test_runs_triggered_by ON uat_test_runs(triggered_by);

-- ============================================================
-- PHASE 2: Extend uat_test_results table
-- ============================================================

-- Add columns to uat_test_results for scenario tracking
ALTER TABLE uat_test_results
ADD COLUMN IF NOT EXISTS source_type VARCHAR(30),
ADD COLUMN IF NOT EXISTS source_id UUID,
ADD COLUMN IF NOT EXISTS scenario_snapshot JSONB;

-- Add index for source_type lookups
CREATE INDEX IF NOT EXISTS idx_uat_test_results_source_type ON uat_test_results(source_type);

-- ============================================================
-- PHASE 3: Create v_uat_readiness view
-- ============================================================

-- Quality gate logic per triangulation reviews:
-- GREEN:  0 failures AND 0 blocked-critical AND pass_rate >= 85%
-- YELLOW: Has failures OR blocked non-critical BUT pass_rate >= 85%
-- RED:    pass_rate < 85% OR any blocked-critical

CREATE OR REPLACE VIEW v_uat_readiness AS
SELECT
  r.id AS run_id,
  r.sd_id,
  r.status,
  r.triggered_by,
  r.started_at,
  r.completed_at,
  COALESCE(r.passed, 0) AS passed_count,
  COALESCE(r.failed, 0) AS failed_count,
  COALESCE(r.skipped, 0) AS skipped_count,
  COALESCE(r.total, 0) AS total_count,
  -- Calculate pass rate as percentage
  CASE
    WHEN COALESCE(r.total, 0) = 0 THEN 0
    ELSE ROUND((COALESCE(r.passed, 0)::NUMERIC / r.total::NUMERIC) * 100, 2)
  END AS pass_rate,
  -- Count blocked-critical results
  (
    SELECT COUNT(*)
    FROM uat_test_results res
    WHERE res.test_run_id = r.id
    AND res.status = 'blocked'
    AND (res.error_message ILIKE '%critical%' OR res.error_message ILIKE '%blocker%')
  ) AS blocked_critical_count,
  -- Calculate quality gate
  CASE
    -- RED: pass_rate < 85% OR any blocked-critical
    WHEN COALESCE(r.total, 0) > 0
      AND (COALESCE(r.passed, 0)::NUMERIC / r.total::NUMERIC) * 100 < 85 THEN 'RED'
    WHEN (
      SELECT COUNT(*)
      FROM uat_test_results res
      WHERE res.test_run_id = r.id
      AND res.status = 'blocked'
      AND (res.error_message ILIKE '%critical%' OR res.error_message ILIKE '%blocker%')
    ) > 0 THEN 'RED'
    -- YELLOW: Has failures OR blocked non-critical, BUT pass_rate >= 85%
    WHEN COALESCE(r.failed, 0) > 0 THEN 'YELLOW'
    WHEN (
      SELECT COUNT(*)
      FROM uat_test_results res
      WHERE res.test_run_id = r.id
      AND res.status = 'blocked'
    ) > 0 THEN 'YELLOW'
    -- GREEN: 0 failures, 0 blocked, >= 85% pass rate
    ELSE 'GREEN'
  END AS quality_gate,
  -- Summary for display
  CASE
    WHEN COALESCE(r.total, 0) = 0 THEN 'No tests executed'
    WHEN COALESCE(r.failed, 0) = 0 AND COALESCE(r.skipped, 0) = 0 THEN 'All tests passed'
    ELSE
      COALESCE(r.passed, 0)::TEXT || ' passed, ' ||
      COALESCE(r.failed, 0)::TEXT || ' failed, ' ||
      COALESCE(r.skipped, 0)::TEXT || ' skipped'
  END AS summary
FROM uat_test_runs r
WHERE r.status IS NOT NULL;

-- Grant permissions (if RLS is enabled)
GRANT SELECT ON v_uat_readiness TO authenticated;

-- ============================================================
-- VERIFICATION
-- ============================================================

-- Verify columns were added
DO $$
BEGIN
  -- Check uat_test_runs columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uat_test_runs' AND column_name = 'sd_id'
  ) THEN
    RAISE EXCEPTION 'Column sd_id not found in uat_test_runs';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uat_test_runs' AND column_name = 'quality_gate'
  ) THEN
    RAISE EXCEPTION 'Column quality_gate not found in uat_test_runs';
  END IF;

  -- Check uat_test_results columns
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'uat_test_results' AND column_name = 'source_type'
  ) THEN
    RAISE EXCEPTION 'Column source_type not found in uat_test_results';
  END IF;

  RAISE NOTICE 'Migration completed successfully';
END $$;
