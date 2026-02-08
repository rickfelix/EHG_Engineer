-- Migration: Sync type_change_reason column and governance_metadata JSONB field
-- Date: 2026-02-07
-- Author: RCA Agent
-- Related: PAT-DATA-REDUNDANCY-001, type_change_reason_rca.md

-- Purpose: Prevent future incidents where type_change_reason is set in only one location
--          (either column OR JSONB field) causing trigger validation failures.

-- Background:
-- Multiple triggers check type_change_reason in different locations:
-- - enforce_sd_type_change_governance checks the COLUMN
-- - enforce_sd_type_change_explanation checks the JSONB field
-- This sync trigger ensures both are always in sync.

CREATE OR REPLACE FUNCTION sync_type_change_reason()
RETURNS TRIGGER AS $$
BEGIN
  -- If column is set/updated, copy to JSONB
  IF NEW.type_change_reason IS DISTINCT FROM OLD.type_change_reason THEN
    NEW.governance_metadata := jsonb_set(
      COALESCE(NEW.governance_metadata, '{}'::jsonb),
      '{type_change_reason}',
      to_jsonb(NEW.type_change_reason)
    );
  END IF;

  -- If JSONB is set/updated, copy to column
  IF (NEW.governance_metadata->>'type_change_reason') IS DISTINCT FROM (OLD.governance_metadata->>'type_change_reason') THEN
    NEW.type_change_reason := NEW.governance_metadata->>'type_change_reason';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_type_change_reason() IS
'Bidirectional sync between type_change_reason column and governance_metadata.type_change_reason JSONB field. Prevents validation failures from setting only one location.';

-- Create trigger with alphabetically EARLY name to run before validation triggers
-- trg_aaa prefix ensures it runs before trg_enforce_sd_type_change_*
DROP TRIGGER IF EXISTS trg_aaa_sync_type_change_reason ON strategic_directives_v2;
CREATE TRIGGER trg_aaa_sync_type_change_reason
  BEFORE UPDATE ON strategic_directives_v2
  FOR EACH ROW
  WHEN (
    -- Only run when sd_type is changing
    OLD.sd_type IS DISTINCT FROM NEW.sd_type
    AND (
      -- And type_change_reason is set in either location
      NEW.type_change_reason IS NOT NULL
      OR NEW.governance_metadata->>'type_change_reason' IS NOT NULL
    )
  )
  EXECUTE FUNCTION sync_type_change_reason();

COMMENT ON TRIGGER trg_aaa_sync_type_change_reason ON strategic_directives_v2 IS
'Runs BEFORE validation triggers to ensure type_change_reason is synced between column and JSONB field. Alphabetically early name (aaa) ensures execution order.';

-- Verification query
-- Uncomment to test:
-- SELECT
--   t.tgname AS trigger_name,
--   p.proname AS function_name
-- FROM pg_trigger t
-- JOIN pg_proc p ON t.tgfoid = p.oid
-- JOIN pg_class c ON t.tgrelid = c.oid
-- WHERE c.relname = 'strategic_directives_v2'
--   AND t.tgtype & 2 = 2  -- BEFORE
--   AND t.tgtype & 4 = 4  -- UPDATE
--   AND (t.tgname LIKE '%type%' OR t.tgname = 'trg_aaa_sync_type_change_reason')
-- ORDER BY t.tgname;

-- Expected trigger execution order (alphabetically):
-- 1. trg_aaa_sync_type_change_reason (NEW - this migration)
-- 2. trg_enforce_sd_type_change_explanation
-- 3. trg_enforce_sd_type_change_governance
-- 4. trg_enforce_sd_type_change_risk
-- 5. trg_enforce_type_change_timing
