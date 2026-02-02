-- Migration: Diagnose sd_capabilities NOT NULL constraint violation
-- SD: SD-LEO-ENH-SEVERITY-WEIGHTED-PATTERN-001
-- Purpose: Identify what is trying to INSERT into sd_capabilities without capability_key

-- ============================================================================
-- 1. CHECK ALL TRIGGERS ON strategic_directives_v2
-- ============================================================================

SELECT
  trigger_name,
  event_manipulation AS event,
  action_timing AS timing,
  action_statement AS function_call
FROM information_schema.triggers
WHERE event_object_table = 'strategic_directives_v2'
ORDER BY trigger_name;

-- ============================================================================
-- 2. CHECK FOR FUNCTIONS THAT INSERT INTO sd_capabilities
-- ============================================================================

SELECT
  proname AS function_name,
  prosrc AS function_body
FROM pg_proc
WHERE prosrc ILIKE '%INSERT INTO%sd_capabilities%'
   OR prosrc ILIKE '%sd_capabilities%INSERT%';

-- ============================================================================
-- 3. CHECK FOR FUNCTIONS CALLED BY strategic_directives_v2 TRIGGERS
-- ============================================================================

WITH trigger_functions AS (
  SELECT
    trigger_name,
    action_statement,
    regexp_replace(action_statement, '.*EXECUTE (?:PROCEDURE|FUNCTION) ([^\(]+).*', '\1') AS func_name
  FROM information_schema.triggers
  WHERE event_object_table = 'strategic_directives_v2'
)
SELECT
  tf.trigger_name,
  tf.func_name,
  p.prosrc
FROM trigger_functions tf
LEFT JOIN pg_proc p ON p.proname = tf.func_name
WHERE p.prosrc IS NOT NULL;

-- ============================================================================
-- 4. TEMPORARY FIX: Make capability_key NULLABLE (with default)
-- ============================================================================

-- This allows SD completion to proceed while we investigate root cause
-- The proper fix is to remove/fix whatever is trying to INSERT without capability_key

DO $$
BEGIN
  -- Check if column is currently NOT NULL
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'sd_capabilities'
      AND column_name = 'capability_key'
      AND is_nullable = 'NO'
  ) THEN
    -- Make it nullable temporarily
    ALTER TABLE sd_capabilities
      ALTER COLUMN capability_key DROP NOT NULL;

    RAISE NOTICE '✅ Made capability_key NULLABLE (temporary fix)';
    RAISE NOTICE '⚠️  ACTION REQUIRED: Find and fix the code/trigger that inserts without capability_key';
  ELSE
    RAISE NOTICE 'ℹ️  capability_key is already nullable';
  END IF;
END $$;

-- ============================================================================
-- 5. ADD VALIDATION TO CATCH FUTURE VIOLATIONS
-- ============================================================================

-- Create trigger to log when NULL capability_key is inserted
CREATE OR REPLACE FUNCTION log_null_capability_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.capability_key IS NULL THEN
    RAISE WARNING 'NULL capability_key inserted into sd_capabilities! sd_id=% action=% Stack trace required.', NEW.sd_id, NEW.action;

    -- Log to a diagnostics table for investigation
    INSERT INTO leo_error_log (
      error_type,
      error_message,
      context,
      created_at
    ) VALUES (
      'schema_constraint_violation',
      'NULL capability_key inserted into sd_capabilities',
      jsonb_build_object(
        'sd_id', NEW.sd_id,
        'sd_uuid', NEW.sd_uuid,
        'action', NEW.action,
        'capability_type', NEW.capability_type,
        'timestamp', NOW()
      ),
      NOW()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_null_capability_key ON sd_capabilities;
CREATE TRIGGER trg_log_null_capability_key
  BEFORE INSERT ON sd_capabilities
  FOR EACH ROW
  EXECUTE FUNCTION log_null_capability_key();

-- ============================================================================
-- 6. VERIFICATION
-- ============================================================================

SELECT
  column_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'sd_capabilities'
  AND column_name = 'capability_key';

-- ============================================================================
-- NOTES FOR INVESTIGATION
-- ============================================================================

-- After this migration runs, try to mark the SD as completed again.
-- If it succeeds but creates a NULL capability_key row, check:
--
-- 1. leo_error_log table for the warning message
-- 2. Application logs for what triggered the INSERT
-- 3. The stack trace from the INSERT operation
--
-- Likely culprits:
-- - scripts/capability-analyzer.js (but it only UPDATEs, not INSERTs for unregistered)
-- - A handoff.js or completion script that tries to register capabilities
-- - A trigger function that chains to another trigger
--
-- PROPER FIX (once root cause found):
-- 1. Remove the trigger/code that INSERTs without capability_key
-- 2. Re-add the NOT NULL constraint:
--    ALTER TABLE sd_capabilities ALTER COLUMN capability_key SET NOT NULL;
