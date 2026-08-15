-- SD-LEO-INFRA-HOURLY-DRIVE-SCORE-001 FR-5 — widen drive_reports.cadence to admit 'hourly'.
--
-- Chairman-directed (SMS 2026-08-12 19:16Z): "I think hourly makes sense, especially if it
-- helps make any adjustments towards improved drive performance". This migration is the DB-side
-- half of that widening; lib/drive-loop/compose-report.js's CADENCES allowlist is the code-side
-- half, and they are pinned equal by tests/unit/drive-loop/vocabulary-drift.test.js.
--
-- IDEMPOTENT / SELF-HEALING, matching the house style established by 20260803_drive_reports.sql:
-- DROP CONSTRAINT IF EXISTS then re-ADD, so re-running this migration repairs a constraint that
-- was manually altered rather than merely asserting it is correct.
--
-- CHAIRMAN-GATED APPLY. This file ships on main; applying it to the live database goes through
-- scripts/apply-migration.js --prod-deploy per this repo's convention (see
-- 20260803_drive_reports.sql's own COMMENT ON TABLE, which documents the same gate for the base
-- table). Until applied, the live CHECK constraint still reads
-- CHECK (cadence IN ('scheduled', 'on_demand')) and an hourly-cadence insert will fail with
-- 23514 -- this is why the hourly sweep itself is gated behind HOURLY_SWEEP_ENABLED (TR-2),
-- decoupling code deploy from schema apply timing.
--
-- The constraint name (drive_reports_cadence_check) is Postgres's auto-generated name for the
-- original UNNAMED inline CHECK in 20260803_drive_reports.sql's CREATE TABLE -- confirmed against
-- the live database by this SD's own LEAD-phase validation-agent evidence, not assumed.

DO $widen_cadence$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.drive_reports'::regclass
      AND conname = 'drive_reports_cadence_check'
  ) THEN
    ALTER TABLE public.drive_reports DROP CONSTRAINT drive_reports_cadence_check;
  END IF;

  ALTER TABLE public.drive_reports
    ADD CONSTRAINT drive_reports_cadence_check
    CHECK (cadence IN ('scheduled', 'on_demand', 'hourly'));
END
$widen_cadence$;

-- SELF-VERIFY, extracted by tests/ddl/drive-reports-hourly-cadence-ddl.db.test.js rather than
-- re-typed, per this repo's own documented anti-drift pattern (drive-reports-ddl.db.test.js's
-- VERIFY_BLOCK precedent).
DO $verify_hourly_cadence$
DECLARE
  check_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO check_def
  FROM pg_constraint
  WHERE conrelid = 'public.drive_reports'::regclass
    AND conname = 'drive_reports_cadence_check';

  ASSERT check_def IS NOT NULL, 'drive_reports_cadence_check is missing after widening';
  ASSERT check_def LIKE '%hourly%', 'drive_reports_cadence_check does not admit hourly: ' || check_def;
  ASSERT check_def LIKE '%scheduled%', 'drive_reports_cadence_check lost scheduled: ' || check_def;
  ASSERT check_def LIKE '%on_demand%', 'drive_reports_cadence_check lost on_demand: ' || check_def;
END
$verify_hourly_cadence$;
