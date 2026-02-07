-- RCA Auto-Trigger Enhancements
-- SD-LEO-ENH-ENHANCE-RCA-SUB-001
--
-- Adds new trigger_source values, root_cause_category values,
-- and issue_patterns fields for the auto-trigger system.
--
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE patterns)

-- ============================================================
-- 1. Add new trigger_source values to root_cause_reports
-- ============================================================
-- The existing CHECK constraint needs to be updated to include new values.
-- First drop the existing constraint, then re-create with expanded values.

DO $$
BEGIN
  -- Drop existing trigger_source check if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'root_cause_reports_trigger_source_check'
  ) THEN
    ALTER TABLE root_cause_reports DROP CONSTRAINT root_cause_reports_trigger_source_check;
  END IF;
END $$;

-- Re-create with expanded values (original + new)
ALTER TABLE root_cause_reports ADD CONSTRAINT root_cause_reports_trigger_source_check
  CHECK (trigger_source IN (
    -- Original values
    'QUALITY_GATE', 'CI_PIPELINE', 'RUNTIME', 'MANUAL', 'SUB_AGENT', 'TEST_FAILURE', 'HANDOFF_REJECTION',
    -- New values for auto-trigger system
    'API_FAILURE', 'MIGRATION_FAILURE', 'SCRIPT_CRASH', 'PRD_VALIDATION_FAILURE', 'STATE_MISMATCH',
    'TEST_RETRY_EXHAUSTED', 'AUTO_TRIGGER'
  ));

-- ============================================================
-- 2. Add new root_cause_category values
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'root_cause_reports_root_cause_category_check'
  ) THEN
    ALTER TABLE root_cause_reports DROP CONSTRAINT root_cause_reports_root_cause_category_check;
  END IF;
END $$;

ALTER TABLE root_cause_reports ADD CONSTRAINT root_cause_reports_root_cause_category_check
  CHECK (root_cause_category IN (
    -- Original values
    'CODE_DEFECT', 'CONFIG_ERROR', 'INFRASTRUCTURE', 'PROCESS_GAP',
    'REQUIREMENTS_AMBIGUITY', 'TEST_COVERAGE_GAP', 'DEPENDENCY_ISSUE',
    'ENVIRONMENTAL', 'UNKNOWN',
    -- New values for enhanced classification
    'DATA_QUALITY', 'ENCODING', 'CROSS_CUTTING', 'PROTOCOL_PROCESS', 'CONFIGURATION'
  ));

-- ============================================================
-- 3. Add classification fields to issue_patterns if not present
-- ============================================================
DO $$
BEGIN
  -- Add metadata JSONB column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issue_patterns' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE issue_patterns ADD COLUMN metadata jsonb DEFAULT '{}';
  END IF;

  -- Add source column if it doesn't exist (for auto_rca tracking)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'issue_patterns' AND column_name = 'source'
  ) THEN
    ALTER TABLE issue_patterns ADD COLUMN source text DEFAULT 'manual';
  END IF;
END $$;

-- ============================================================
-- 4. Add auto_trigger_config table for feature flags
-- ============================================================
CREATE TABLE IF NOT EXISTS rca_auto_trigger_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type text NOT NULL UNIQUE,
  enabled boolean DEFAULT true,
  rate_limit_per_minute integer DEFAULT 3,
  auto_create_fix_sd boolean DEFAULT false,
  recurrence_threshold integer DEFAULT 3,
  recurrence_window_days integer DEFAULT 14,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed default configurations for each trigger type
INSERT INTO rca_auto_trigger_config (trigger_type, enabled, rate_limit_per_minute, auto_create_fix_sd)
VALUES
  ('handoff_failure', true, 3, false),
  ('gate_validation_failure', true, 5, false),
  ('api_failure', true, 3, false),
  ('migration_failure', true, 2, false),
  ('script_crash', true, 3, false),
  ('test_failure_retry_exhausted', true, 3, false),
  ('prd_validation_failure', true, 5, false),
  ('state_mismatch', true, 3, false)
ON CONFLICT (trigger_type) DO NOTHING;

-- ============================================================
-- 5. RLS policies for rca_auto_trigger_config
-- ============================================================
ALTER TABLE rca_auto_trigger_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rca_auto_trigger_config' AND policyname = 'service_role_all_rca_config'
  ) THEN
    CREATE POLICY service_role_all_rca_config ON rca_auto_trigger_config
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rca_auto_trigger_config' AND policyname = 'authenticated_read_rca_config'
  ) THEN
    CREATE POLICY authenticated_read_rca_config ON rca_auto_trigger_config
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- ============================================================
-- 6. Create view for RCA trigger analytics
-- ============================================================
CREATE OR REPLACE VIEW v_rca_auto_trigger_summary AS
SELECT
  r.trigger_source,
  r.root_cause_category,
  r.status,
  count(*) as total_count,
  sum(r.recurrence_count) as total_recurrences,
  avg(r.confidence) as avg_confidence,
  max(r.created_at) as last_triggered,
  count(*) FILTER (WHERE r.status = 'RESOLVED') as resolved_count,
  count(*) FILTER (WHERE r.status IN ('OPEN', 'IN_REVIEW')) as open_count
FROM root_cause_reports r
WHERE r.metadata->>'auto_triggered' = 'true'
GROUP BY r.trigger_source, r.root_cause_category, r.status
ORDER BY total_count DESC;

-- Grant access to the view
GRANT SELECT ON v_rca_auto_trigger_summary TO authenticated;
GRANT ALL ON v_rca_auto_trigger_summary TO service_role;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- New capabilities:
-- 1. Extended trigger_source enum with 7 new values
-- 2. Extended root_cause_category with 5 new categories
-- 3. issue_patterns.metadata JSONB for auto-trigger tracking
-- 4. rca_auto_trigger_config table for per-type feature flags
-- 5. v_rca_auto_trigger_summary view for analytics
