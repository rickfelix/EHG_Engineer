-- SD-VISION-TRANSITION-001C: Update Stage Constraints (40 → 25)
-- Venture Vision v2.0 Migration
-- Created: 2025-12-06
-- Purpose: Update all hardcoded 40-stage CHECK constraints to 25-stage model

-- ============================================
-- MIGRATION HEADER
-- ============================================
-- SD: SD-VISION-TRANSITION-001C
-- Parent SD: SD-VISION-TRANSITION-001
-- Description: Modify CHECK constraints to support new 25-stage Venture Vision v2.0 model
-- Rollback: Execute rollback section at bottom

-- ============================================
-- UPDATE compliance_violations CHECK CONSTRAINT
-- ============================================
-- Original: CHECK (stage_number BETWEEN 1 AND 40)
-- New: CHECK (stage_number BETWEEN 1 AND 25)

ALTER TABLE compliance_violations
  DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check;

ALTER TABLE compliance_violations
  ADD CONSTRAINT compliance_violations_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 25);

COMMENT ON CONSTRAINT compliance_violations_stage_number_check
  ON compliance_violations
  IS 'Venture Vision v2.0: Valid stage numbers are 1-25 (updated from 40-stage model)';

-- ============================================
-- UPDATE compliance_events CHECK CONSTRAINT
-- ============================================
-- Original: CHECK (stage_number BETWEEN 1 AND 40)
-- New: CHECK (stage_number BETWEEN 1 AND 25)

ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check;

ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 25);

COMMENT ON CONSTRAINT compliance_events_stage_number_check
  ON compliance_events
  IS 'Venture Vision v2.0: Valid stage numbers are 1-25 (updated from 40-stage model)';

-- ============================================
-- UPDATE compliance_checks DEFAULT
-- ============================================
-- Original: total_stages INTEGER NOT NULL DEFAULT 40
-- New: total_stages INTEGER NOT NULL DEFAULT 25

ALTER TABLE compliance_checks
  ALTER COLUMN total_stages SET DEFAULT 25;

COMMENT ON COLUMN compliance_checks.total_stages
  IS 'Venture Vision v2.0: Default 25 stages (updated from 40-stage model)';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify migration success:

-- Check compliance_violations constraint:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'compliance_violations'::regclass AND contype = 'c';

-- Check compliance_events constraint:
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'compliance_events'::regclass AND contype = 'c';

-- Check compliance_checks default:
-- SELECT column_name, column_default FROM information_schema.columns
-- WHERE table_name = 'compliance_checks' AND column_name = 'total_stages';

-- ============================================
-- ROLLBACK SECTION (if needed)
-- ============================================
/*
-- Rollback to 40-stage model:

ALTER TABLE compliance_violations
  DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check;
ALTER TABLE compliance_violations
  ADD CONSTRAINT compliance_violations_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 40);

ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check;
ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 40);

ALTER TABLE compliance_checks
  ALTER COLUMN total_stages SET DEFAULT 40;
*/
