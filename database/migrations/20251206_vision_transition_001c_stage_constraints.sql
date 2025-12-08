-- SD-VISION-TRANSITION-001C: Venture Vision v2.0 Stage Constraints
-- Migration: Update stage constraints from 40 to 25 stages
-- Context: Venture Vision v2.0 consolidates from 40-stage to 25-stage framework
-- Repository: EHG_Engineer
-- Database: dedlbzhpgkmetvhbkyzq (consolidated)

-- Verification: Check current constraints before migration
DO $$
BEGIN
  RAISE NOTICE 'Pre-migration verification...';
  RAISE NOTICE 'Current compliance_violations constraint: %',
    (SELECT pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conname = 'compliance_violations_stage_number_check');
  RAISE NOTICE 'Current compliance_events constraint: %',
    (SELECT pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conname = 'compliance_events_stage_number_check');
  RAISE NOTICE 'Current compliance_checks.total_stages default: %',
    (SELECT column_default
     FROM information_schema.columns
     WHERE table_name = 'compliance_checks' AND column_name = 'total_stages');
END $$;

-- 1. Update compliance_violations constraint
ALTER TABLE compliance_violations
  DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check;

ALTER TABLE compliance_violations
  ADD CONSTRAINT compliance_violations_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 25);

-- 2. Update compliance_events constraint
ALTER TABLE compliance_events
  DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check;

ALTER TABLE compliance_events
  ADD CONSTRAINT compliance_events_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 25);

-- 3. Update compliance_checks default
ALTER TABLE compliance_checks
  ALTER COLUMN total_stages SET DEFAULT 25;

-- Post-migration verification
DO $$
BEGIN
  RAISE NOTICE 'Post-migration verification...';
  RAISE NOTICE 'Updated compliance_violations constraint: %',
    (SELECT pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conname = 'compliance_violations_stage_number_check');
  RAISE NOTICE 'Updated compliance_events constraint: %',
    (SELECT pg_get_constraintdef(oid)
     FROM pg_constraint
     WHERE conname = 'compliance_events_stage_number_check');
  RAISE NOTICE 'Updated compliance_checks.total_stages default: %',
    (SELECT column_default
     FROM information_schema.columns
     WHERE table_name = 'compliance_checks' AND column_name = 'total_stages');
END $$;

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Migration complete: Stage constraints updated from 40 to 25';
END $$;
