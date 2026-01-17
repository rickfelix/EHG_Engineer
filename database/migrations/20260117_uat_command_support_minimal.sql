-- Migration: UAT Command Support (Minimal - only missing columns)
-- SD: SD-UAT-DB-001
-- Run in Supabase SQL Editor

-- Add missing columns to uat_test_runs
ALTER TABLE uat_test_runs
ADD COLUMN IF NOT EXISTS quality_gate VARCHAR(10),
ADD COLUMN IF NOT EXISTS scenario_snapshot JSONB,
ADD COLUMN IF NOT EXISTS commit_sha VARCHAR(40),
ADD COLUMN IF NOT EXISTS build_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS executed_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS defects_found INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS quick_fixes_created INTEGER DEFAULT 0;

-- Add missing columns to uat_test_results
ALTER TABLE uat_test_results
ADD COLUMN IF NOT EXISTS source_type VARCHAR(30),
ADD COLUMN IF NOT EXISTS source_id UUID,
ADD COLUMN IF NOT EXISTS scenario_snapshot JSONB;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_uat_test_results_source_type ON uat_test_results(source_type);

-- Create quality gate view
CREATE OR REPLACE VIEW v_uat_readiness AS
SELECT
  r.id AS run_id,
  r.sd_id,
  r.status,
  r.triggered_by,
  COALESCE(r.passed, 0) AS passed_count,
  COALESCE(r.failed, 0) AS failed_count,
  COALESCE(r.total, 0) AS total_count,
  CASE
    WHEN COALESCE(r.total, 0) = 0 THEN 0
    ELSE ROUND((COALESCE(r.passed, 0)::NUMERIC / r.total::NUMERIC) * 100, 2)
  END AS pass_rate,
  CASE
    WHEN COALESCE(r.total, 0) > 0
      AND (COALESCE(r.passed, 0)::NUMERIC / r.total::NUMERIC) * 100 < 85 THEN 'RED'
    WHEN COALESCE(r.failed, 0) > 0 THEN 'YELLOW'
    ELSE 'GREEN'
  END AS quality_gate
FROM uat_test_runs r;
