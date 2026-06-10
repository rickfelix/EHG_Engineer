-- @approved-by:codestreetlabs@gmail.com
-- =============================================================================
-- ROLLBACK for 20260610_flag_registry_lifecycle_consistency.sql
-- (SD-FDBK-INFRA-RECONCILE-LEO-FEATURE-001)
--
-- Restores the original trigger wiring (generic shared trigger_set_updated_at)
-- and drops the CHECK + the review-aware function. The 3-row data reconcile is
-- deliberately NOT reverted: lifecycle_state='enabled' on the three named flags
-- matches their genuinely-live reality regardless of the schema objects.
-- NO BEGIN/COMMIT: apply-migration.js wraps the file in one transaction.
-- =============================================================================

-- 1. Repoint the trigger back to the generic shared function.
DROP TRIGGER IF EXISTS set_updated_at_leo_feature_flags ON leo_feature_flags;
CREATE TRIGGER set_updated_at_leo_feature_flags
  BEFORE UPDATE ON leo_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- 2. Drop the review-aware function (no longer referenced).
DROP FUNCTION IF EXISTS trigger_set_updated_at_flags_review_aware();

-- 3. Drop the consistency CHECK.
ALTER TABLE leo_feature_flags
  DROP CONSTRAINT IF EXISTS chk_flag_lifecycle_enabled_consistency;

-- Post-condition: original generic trigger is back in place.
DO $$
DECLARE
  fn name;
BEGIN
  SELECT p.proname INTO fn
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'leo_feature_flags'
     AND t.tgname = 'set_updated_at_leo_feature_flags';
  IF fn IS DISTINCT FROM 'trigger_set_updated_at' THEN
    RAISE EXCEPTION 'rollback post-condition failed: trigger points at %, expected trigger_set_updated_at', fn;
  END IF;
END $$;
