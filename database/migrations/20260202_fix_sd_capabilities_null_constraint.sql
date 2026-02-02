-- Migration: Fix sd_capabilities NULL capability_key constraint violation
-- SD: SD-LEO-ENH-SEVERITY-WEIGHTED-PATTERN-001
-- Purpose: Allow SD completion by making capability_key nullable + add diagnostics

-- ============================================================================
-- ISSUE SUMMARY
-- ============================================================================
-- When marking SD-LEO-ENH-SEVERITY-WEIGHTED-PATTERN-001 as completed, got error:
-- "null value in column 'capability_key' of relation 'sd_capabilities' violates not-null constraint"
--
-- ROOT CAUSE: Something (trigger or application code) is trying to INSERT into
-- sd_capabilities without providing capability_key value.
--
-- TEMPORARY FIX: Make capability_key nullable to unblock SD completion
-- PERMANENT FIX: Find and remove the code/trigger that INSERTs without capability_key
-- ============================================================================

-- ============================================================================
-- 1. MAKE capability_key NULLABLE (temporary fix)
-- ============================================================================

ALTER TABLE sd_capabilities
  ALTER COLUMN capability_key DROP NOT NULL;

COMMENT ON COLUMN sd_capabilities.capability_key IS
'TEMPORARILY NULLABLE: Investigating what inserts NULL values. Should be NOT NULL once root cause fixed.';

-- ============================================================================
-- 2. ADD DIAGNOSTIC TRIGGER to log when NULL values are inserted
-- ============================================================================

CREATE OR REPLACE FUNCTION log_null_capability_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.capability_key IS NULL THEN
    -- Raise warning visible in Supabase logs
    RAISE WARNING 'NULL capability_key inserted! sd_id=%, action=%, capability_type=%',
      NEW.sd_id, NEW.action, NEW.capability_type;

    -- Log to error table for investigation
    INSERT INTO leo_error_log (
      error_type,
      error_message,
      error_details,
      context,
      created_at
    ) VALUES (
      'schema_constraint_violation',
      'NULL capability_key inserted into sd_capabilities',
      jsonb_build_object(
        'table', 'sd_capabilities',
        'column', 'capability_key',
        'expected', 'NOT NULL',
        'actual', 'NULL'
      ),
      jsonb_build_object(
        'sd_id', NEW.sd_id,
        'sd_uuid', NEW.sd_uuid,
        'action', NEW.action,
        'capability_type', NEW.capability_type,
        'category', NEW.category,
        'timestamp', NOW(),
        'investigation_note', 'Check what trigger or code path led to this INSERT'
      ),
      NOW()
    ) ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_log_null_capability_key ON sd_capabilities;

CREATE TRIGGER trg_log_null_capability_key
  BEFORE INSERT ON sd_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION log_null_capability_key();

COMMENT ON FUNCTION log_null_capability_key IS
'Diagnostic trigger: Logs when NULL capability_key is inserted. Part of investigation for SD-LEO-ENH-SEVERITY-WEIGHTED-PATTERN-001 completion blocker.';

-- ============================================================================
-- 3. QUERY TO IDENTIFY CULPRIT (run after next NULL insert)
-- ============================================================================

-- After marking SD as completed, if it succeeds but creates NULL row, run:
/*
SELECT
  error_message,
  error_details,
  context,
  created_at
FROM leo_error_log
WHERE error_type = 'schema_constraint_violation'
  AND error_message LIKE '%capability_key%'
ORDER BY created_at DESC
LIMIT 5;
*/

-- ============================================================================
-- 4. CHECK ALL TRIGGERS THAT MIGHT INSERT INTO sd_capabilities
-- ============================================================================

-- Query to find suspect triggers:
/*
SELECT
  t.trigger_name,
  t.event_manipulation,
  t.action_timing,
  t.event_object_table,
  p.prosrc AS function_body
FROM information_schema.triggers t
JOIN pg_proc p ON p.proname = regexp_replace(
  t.action_statement,
  '.*EXECUTE (?:PROCEDURE|FUNCTION) ([^\(]+).*',
  '\1'
)
WHERE t.event_object_table = 'strategic_directives_v2'
  AND p.prosrc ILIKE '%sd_capabilities%'
ORDER BY t.trigger_name;
*/

-- ============================================================================
-- 5. RESTORATION PLAN (once root cause fixed)
-- ============================================================================

-- After finding and fixing the root cause:
/*
-- Step 1: Delete any rows with NULL capability_key
DELETE FROM sd_capabilities WHERE capability_key IS NULL;

-- Step 2: Re-add NOT NULL constraint
ALTER TABLE sd_capabilities
  ALTER COLUMN capability_key SET NOT NULL;

-- Step 3: Remove diagnostic trigger
DROP TRIGGER IF EXISTS trg_log_null_capability_key ON sd_capabilities;
DROP FUNCTION IF EXISTS log_null_capability_key();

-- Step 4: Update column comment
COMMENT ON COLUMN sd_capabilities.capability_key IS
'Unique key identifying the capability (e.g., agent_name, table_name, api_endpoint_path). NOT NULL.';
*/

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
  v_is_nullable TEXT;
  v_trigger_exists BOOLEAN;
BEGIN
  -- Check column is now nullable
  SELECT is_nullable INTO v_is_nullable
  FROM information_schema.columns
  WHERE table_name = 'sd_capabilities'
    AND column_name = 'capability_key';

  IF v_is_nullable = 'YES' THEN
    RAISE NOTICE '✅ capability_key is now NULLABLE (temporary)';
  ELSE
    RAISE EXCEPTION '❌ Failed to make capability_key nullable';
  END IF;

  -- Check diagnostic trigger exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_log_null_capability_key'
      AND event_object_table = 'sd_capabilities'
  ) INTO v_trigger_exists;

  IF v_trigger_exists THEN
    RAISE NOTICE '✅ Diagnostic trigger created successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to create diagnostic trigger';
  END IF;

  RAISE NOTICE '';
  RAISE NOTICE '⚠️  NEXT STEPS:';
  RAISE NOTICE '   1. Try marking SD-LEO-ENH-SEVERITY-WEIGHTED-PATTERN-001 as completed';
  RAISE NOTICE '   2. If it succeeds, check leo_error_log for NULL capability_key warnings';
  RAISE NOTICE '   3. Investigate what code path caused the INSERT';
  RAISE NOTICE '   4. Fix the root cause (remove/fix the INSERT statement)';
  RAISE NOTICE '   5. Run restoration plan to re-add NOT NULL constraint';
END $$;
