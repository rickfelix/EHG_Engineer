-- LEO Protocol v4.3.3 - SD Completeness Enforcement
-- Purpose: Prevent incomplete SDs from being created
-- Root Cause: SD-UI-PARITY-001 was missing key_principles at creation time
-- Fix: Add database trigger to validate required fields at INSERT/UPDATE

-- ============================================================================
-- FUNCTION: Validate SD completeness before insert/update
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_sd_completeness()
RETURNS TRIGGER AS $$
DECLARE
  missing_fields TEXT[] := ARRAY[]::TEXT[];
  error_message TEXT;
BEGIN
  -- =========================================================================
  -- LEO Protocol Required Fields (per sd-creation-template.js)
  -- =========================================================================

  -- REQUIRED FIELDS (database constraints - must have values)
  -- id, title, description, rationale, scope, category, priority, status
  -- These are already enforced by NOT NULL constraints

  -- STRONGLY RECOMMENDED FIELDS (LEO Protocol compliance)
  -- key_principles is required for LEAD-TO-PLAN handoff

  -- Only enforce key_principles when SD is being activated (not during initial draft creation)
  IF NEW.status IN ('active', 'in_progress', 'pending_approval') THEN
    -- Check key_principles
    IF NEW.key_principles IS NULL OR
       NEW.key_principles::text = '[]' OR
       NEW.key_principles::text = 'null' THEN
      missing_fields := array_append(missing_fields, 'key_principles');
    END IF;

    -- Check strategic_objectives
    IF NEW.strategic_objectives IS NULL OR
       NEW.strategic_objectives::text = '[]' OR
       NEW.strategic_objectives::text = 'null' THEN
      missing_fields := array_append(missing_fields, 'strategic_objectives');
    END IF;

    -- Check success_criteria
    IF NEW.success_criteria IS NULL OR
       NEW.success_criteria::text = '[]' OR
       NEW.success_criteria::text = 'null' THEN
      missing_fields := array_append(missing_fields, 'success_criteria');
    END IF;
  END IF;

  -- If there are missing fields, raise an error
  IF array_length(missing_fields, 1) > 0 THEN
    error_message := format(
      E'LEO Protocol Violation: SD Completeness Check Failed\n\n'
      'SD: %s\n'
      'Status: %s\n'
      'Missing Required Fields: %s\n\n'
      'ACTION REQUIRED:\n'
      '1. Add the missing fields before activating the SD\n'
      '2. Use the SD creation template: scripts/templates/sd-creation-template.js\n'
      '3. Refer to LEO Protocol documentation for field requirements',
      NEW.id,
      NEW.status,
      array_to_string(missing_fields, ', ')
    );

    RAISE EXCEPTION '%', error_message
    USING HINT = 'Update the SD to include all required fields before activating';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DROP existing trigger if it exists
-- ============================================================================

DROP TRIGGER IF EXISTS validate_sd_completeness_trigger ON strategic_directives_v2;

-- ============================================================================
-- CREATE trigger on strategic_directives_v2
-- ============================================================================

CREATE TRIGGER validate_sd_completeness_trigger
  BEFORE INSERT OR UPDATE OF status
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION validate_sd_completeness();

-- ============================================================================
-- VERIFICATION: Test the trigger with a simulated incomplete SD
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '
=============================================================================
SD COMPLETENESS ENFORCEMENT MIGRATION COMPLETE
=============================================================================

TRIGGER: validate_sd_completeness_trigger
  - Fires on INSERT and UPDATE of status
  - Validates key_principles, strategic_objectives, success_criteria
  - Only enforces when status is active, in_progress, or pending_approval
  - Draft SDs can be created without all fields (allows iterative creation)

ENFORCEMENT BEHAVIOR:
  - Draft → No validation (allows partial creation)
  - Draft → Active → VALIDATES (catches incomplete SDs)
  - Active → Any → VALIDATES (maintains completeness)

REQUIRED FIELDS FOR ACTIVATION:
  1. key_principles (JSONB array)
  2. strategic_objectives (JSONB array)
  3. success_criteria (JSONB array)

TEMPLATE REFERENCE:
  - scripts/templates/sd-creation-template.js
  - Lines 14-15: Documents strongly recommended fields
=============================================================================';
END $$;

-- ============================================================================
-- LOG the migration
-- ============================================================================

INSERT INTO leo_protocol_changes (
  protocol_id,
  change_type,
  description,
  changed_fields,
  change_reason,
  changed_by
) VALUES (
  'leo-v4-3-3-ui-parity',
  'enforcement_trigger',
  'SD Completeness Enforcement Trigger',
  '{"trigger": "validate_sd_completeness_trigger", "fields_validated": ["key_principles", "strategic_objectives", "success_criteria"]}',
  'Prevent incomplete SDs from being activated. Root cause: SD-UI-PARITY-001 was missing key_principles at creation time, caught at handoff instead of creation.',
  'SD-UI-PARITY-001-SYSTEMIC-FIX'
);
