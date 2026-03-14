-- Migration: Advisory trigger for SD creation source validation
-- Purpose: Log a warning to audit_log when an SD is created without proper provenance
-- Context: RCA finding NC-002 - SDs created via direct DB insert bypass leo-create-sd.js governance
-- Advisory only: NEVER blocks INSERT, only logs for observability
--
-- Valid creation sources:
--   - 'leo-create-sd'              (standard governance pipeline)
--   - 'unified-handoff-system'     (phase handoff child creation)
--   - 'orchestrator-child-auto'    (orchestrator auto-child creation)
--   - 'ADMIN_OVERRIDE'             (explicit admin bypass)
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_sd_creation_source_advisory ON strategic_directives_v2;
--   DROP FUNCTION IF EXISTS check_sd_creation_source();

-- Step 1: Create the advisory trigger function
CREATE OR REPLACE FUNCTION check_sd_creation_source()
RETURNS TRIGGER AS $$
DECLARE
  v_created_via TEXT;
  v_valid_sources TEXT[] := ARRAY[
    'leo-create-sd',
    'unified-handoff-system',
    'orchestrator-child-auto',
    'ADMIN_OVERRIDE'
  ];
  v_sd_key TEXT;
  v_audit_log_exists BOOLEAN;
BEGIN
  -- Extract created_via from metadata JSONB (safely handle NULL metadata)
  v_created_via := COALESCE(NEW.metadata->>'created_via', 'MISSING');
  v_sd_key := COALESCE(NEW.sd_key, NEW.id, 'UNKNOWN');

  -- Only fire advisory logic if source is missing or not in valid list
  IF v_created_via = 'MISSING' OR NOT (v_created_via = ANY(v_valid_sources)) THEN

    -- Check if audit_log table exists (defensive: avoid breaking if table is dropped)
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'audit_log'
    ) INTO v_audit_log_exists;

    IF v_audit_log_exists THEN
      -- Log advisory warning to audit_log
      INSERT INTO audit_log (
        event_type,
        entity_type,
        entity_id,
        new_value,
        metadata,
        severity,
        created_by
      ) VALUES (
        'sd_creation_source_missing',
        'strategic_directive',
        v_sd_key,
        jsonb_build_object(
          'sd_key', v_sd_key,
          'created_via', v_created_via,
          'metadata_snapshot', NEW.metadata
        ),
        jsonb_build_object(
          'nc_code', 'NC-002',
          'description', 'SD created without valid provenance. Expected creation via leo-create-sd.js or other approved pipeline.',
          'valid_sources', to_jsonb(v_valid_sources),
          'detected_source', v_created_via,
          'trigger', 'trg_sd_creation_source_advisory'
        ),
        'warning',
        'trg_sd_creation_source_advisory'
      );
    ELSE
      -- Fallback: use RAISE NOTICE if audit_log does not exist
      RAISE NOTICE '[NC-002 ADVISORY] SD "%" created with unrecognized source: "%". Expected one of: leo-create-sd, unified-handoff-system, orchestrator-child-auto, ADMIN_OVERRIDE',
        v_sd_key, v_created_via;
    END IF;

  END IF;

  -- ALWAYS return NEW: this trigger must NEVER block an insert
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Add comment documenting the function
COMMENT ON FUNCTION check_sd_creation_source() IS
  'Advisory trigger function for NC-002: logs warning when SD is created without valid provenance (created_via metadata). Never blocks inserts.';

-- Step 3: Create the trigger (AFTER INSERT - advisory, does not modify the row)
-- Using AFTER INSERT because this is observational/logging only.
-- AFTER triggers cannot block the INSERT and run after the row is committed,
-- which is the correct semantic for advisory logging.
DROP TRIGGER IF EXISTS trg_sd_creation_source_advisory ON strategic_directives_v2;

CREATE TRIGGER trg_sd_creation_source_advisory
  AFTER INSERT ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION check_sd_creation_source();

-- Step 4: Add comment documenting the trigger
COMMENT ON TRIGGER trg_sd_creation_source_advisory ON strategic_directives_v2 IS
  'NC-002 Advisory: Logs warning to audit_log when SD is created without valid created_via metadata. Does NOT block inserts.';
