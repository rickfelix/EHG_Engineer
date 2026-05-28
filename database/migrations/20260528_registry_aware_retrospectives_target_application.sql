-- ============================================================================
-- MIGRATION: Registry-aware retrospectives.check_target_application
-- SD-LEO-INFRA-VENTURE-REPO-AWARE-001 (CronGenius first-venture pilot, Track-2)
-- ============================================================================
-- Purpose: Replace the static CHECK (target_application = ANY (ARRAY['EHG','EHG_Engineer']))
--          with a trigger that validates target_application against the authoritative
--          `applications` registry table, so ANY registered app (including ventures
--          like 'CronGenius') is accepted with NO per-venture migration. This is the
--          single NON-bypassable blocker that stopped CronGenius child A's LEAD-FINAL
--          retrospective.
--
-- Safety:  PURE LOOSENING. Today's constraint only allows 'EHG'/'EHG_Engineer'; every
--          currently-succeeding insert writes one of those two. Both are short-circuited
--          to RETURN NEW *before* the applications query, so no currently-valid insert can
--          break (fail-open for platform values). The trigger only ACCEPTS MORE (registered
--          ventures) and rejects exactly what the old CHECK already rejected (unregistered).
--          Reversible — see ROLLBACK at the bottom.
--
-- Matching: case/separator-insensitive, mirroring lib/repo-paths.js normalizeAppName
--           (lowercase + strip non-alphanumeric), so 'CronGenius'/'crongenius'/'cron-genius'
--           all resolve.
-- ============================================================================

-- 1) Drop the static two-value CHECK (the venture-blocking constraint).
ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS check_target_application;

-- 2) Registry-aware validation function.
CREATE OR REPLACE FUNCTION validate_retrospective_target_application()
RETURNS trigger AS $$
BEGIN
  -- Platform repos are always valid (also present in applications); checked FIRST so
  -- platform retrospective writes never depend on the applications query (fail-open).
  IF NEW.target_application IN ('EHG', 'EHG_Engineer') THEN
    RETURN NEW;
  END IF;

  -- Registry-aware: accept any active registered application (case/separator-insensitive).
  IF EXISTS (
    SELECT 1 FROM applications
    WHERE status = 'active'
      AND regexp_replace(lower(name), '[^a-z0-9]', '', 'g')
        = regexp_replace(lower(NEW.target_application), '[^a-z0-9]', '', 'g')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'retrospectives.target_application "%" is not a registered application. Register it in the applications table (the registry source of truth) or use a registered application name.', NEW.target_application
    USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

-- 3) (Re)create the BEFORE INSERT OR UPDATE trigger. OF target_application limits UPDATE
--    firing to changes of that column (no surprise re-validation on unrelated updates).
DROP TRIGGER IF EXISTS trg_validate_retrospective_target_application ON retrospectives;
CREATE TRIGGER trg_validate_retrospective_target_application
  BEFORE INSERT OR UPDATE OF target_application ON retrospectives
  FOR EACH ROW
  EXECUTE FUNCTION validate_retrospective_target_application();

-- 4) Invariants — fail the migration LOUDLY if the change did not take.
DO $$
BEGIN
  -- 4a. The old static CHECK must be gone.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_target_application' AND conrelid = 'retrospectives'::regclass
  ) THEN
    RAISE EXCEPTION 'INVARIANT FAILED: static check_target_application still present on retrospectives';
  END IF;

  -- 4b. The validation trigger must exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_validate_retrospective_target_application'
      AND tgrelid = 'retrospectives'::regclass
  ) THEN
    RAISE EXCEPTION 'INVARIANT FAILED: validation trigger not created on retrospectives';
  END IF;

  -- 4c. Regression safety: every distinct existing target_application value must still be
  --     accepted by the new rule (platform short-circuit OR registered in applications).
  IF EXISTS (
    SELECT 1
    FROM (SELECT DISTINCT target_application AS ta FROM retrospectives) r
    WHERE r.ta NOT IN ('EHG', 'EHG_Engineer')
      AND NOT EXISTS (
        SELECT 1 FROM applications a
        WHERE a.status = 'active'
          AND regexp_replace(lower(a.name), '[^a-z0-9]', '', 'g')
            = regexp_replace(lower(r.ta), '[^a-z0-9]', '', 'g')
      )
  ) THEN
    RAISE EXCEPTION 'INVARIANT FAILED: an existing retrospectives.target_application value would be rejected by the new rule (regression)';
  END IF;

  RAISE NOTICE 'OK: registry-aware retrospectives.target_application validation installed; all existing values remain valid';
END $$;

-- ============================================================================
-- ROLLBACK (manual):
--   DROP TRIGGER IF EXISTS trg_validate_retrospective_target_application ON retrospectives;
--   DROP FUNCTION IF EXISTS validate_retrospective_target_application();
--   ALTER TABLE retrospectives ADD CONSTRAINT check_target_application
--     CHECK (target_application = ANY (ARRAY['EHG','EHG_Engineer']));
-- ============================================================================
