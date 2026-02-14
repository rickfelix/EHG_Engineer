-- Migration: Validate integration_operationalization keys at insert/update time
-- Root cause: Manual PRD creation used descriptive key names that didn't match
-- validator expectations, causing GATE_INTEGRATION_SECTION_VALIDATION to report
-- 0% completeness despite data being present.
--
-- Systemic fix: Database trigger validates that when integration_operationalization
-- is non-null, it uses the canonical key names. This catches mismatches at write time
-- instead of at handoff time (much later in the workflow).

CREATE OR REPLACE FUNCTION validate_integration_section_keys()
RETURNS TRIGGER AS $$
DECLARE
  valid_keys TEXT[] := ARRAY['consumers', 'dependencies', 'data_contracts', 'runtime_config', 'observability_rollout'];
  actual_keys TEXT[];
  invalid_keys TEXT[];
  key TEXT;
BEGIN
  -- Only validate if integration_operationalization is being set/changed and is not null
  IF NEW.integration_operationalization IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get actual keys from the JSONB
  SELECT array_agg(k) INTO actual_keys
  FROM jsonb_object_keys(NEW.integration_operationalization) AS k;

  IF actual_keys IS NULL THEN
    RETURN NEW;  -- Empty object is fine
  END IF;

  -- Find any keys that aren't in the valid set
  invalid_keys := ARRAY[]::TEXT[];
  FOREACH key IN ARRAY actual_keys LOOP
    IF key != ALL(valid_keys) THEN
      invalid_keys := array_append(invalid_keys, key);
    END IF;
  END LOOP;

  IF array_length(invalid_keys, 1) > 0 THEN
    RAISE EXCEPTION 'integration_operationalization contains invalid keys: %. Valid keys are: consumers, dependencies, data_contracts, runtime_config, observability_rollout',
      array_to_string(invalid_keys, ', ');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop if exists to make idempotent
DROP TRIGGER IF EXISTS trg_validate_integration_section_keys ON product_requirements_v2;

CREATE TRIGGER trg_validate_integration_section_keys
  BEFORE INSERT OR UPDATE OF integration_operationalization ON product_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_integration_section_keys();

-- Add comment for discoverability
COMMENT ON FUNCTION validate_integration_section_keys() IS
  'Validates that integration_operationalization JSONB uses canonical key names (consumers, dependencies, data_contracts, runtime_config, observability_rollout). Prevents key mismatch that causes GATE_INTEGRATION_SECTION_VALIDATION to fail despite data being present.';
