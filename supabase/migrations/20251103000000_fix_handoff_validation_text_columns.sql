-- Fix handoff validation to properly handle TEXT columns
-- Bug: auto_validate_handoff() was treating TEXT columns as JSONB
-- Root Cause: Validation checks like "::text = '{}'" don't work for TEXT fields
-- Date: 2025-11-03
-- Related Issue: PLAN→EXEC handoff creation blocked with NULL validation error

-- ============================================================================
-- FUNCTION: Fixed validation for TEXT columns
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_validate_handoff()
RETURNS TRIGGER AS $$
DECLARE
  validation JSONB;
  missing_elements TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Check 7 mandatory elements (all are TEXT type)
  -- Element 1: Executive Summary (need >50 chars)
  IF NEW.executive_summary IS NULL OR length(trim(NEW.executive_summary)) < 50 THEN
    missing_elements := array_append(missing_elements, '1. Executive Summary (need >50 chars)');
  END IF;

  -- Element 2: Deliverables Manifest (need meaningful content)
  IF NEW.deliverables_manifest IS NULL OR length(trim(NEW.deliverables_manifest)) < 10 THEN
    missing_elements := array_append(missing_elements, '2. Deliverables Manifest');
  END IF;

  -- Element 3: Key Decisions (need meaningful content)
  IF NEW.key_decisions IS NULL OR length(trim(NEW.key_decisions)) < 10 THEN
    missing_elements := array_append(missing_elements, '3. Key Decisions & Rationale');
  END IF;

  -- Element 4: Known Issues (need meaningful content)
  IF NEW.known_issues IS NULL OR length(trim(NEW.known_issues)) < 10 THEN
    missing_elements := array_append(missing_elements, '4. Known Issues & Risks');
  END IF;

  -- Element 5: Resource Utilization (need meaningful content)
  IF NEW.resource_utilization IS NULL OR length(trim(NEW.resource_utilization)) < 10 THEN
    missing_elements := array_append(missing_elements, '5. Resource Utilization');
  END IF;

  -- Element 6: Action Items (need meaningful content)
  IF NEW.action_items IS NULL OR length(trim(NEW.action_items)) < 10 THEN
    missing_elements := array_append(missing_elements, '6. Action Items for Receiver');
  END IF;

  -- Element 7: Completeness Report (can be NULL for pending handoffs)
  IF NEW.completeness_report IS NULL OR length(trim(NEW.completeness_report)) < 10 THEN
    missing_elements := array_append(missing_elements, '7. Completeness Report');
  END IF;

  -- Build validation result
  validation := jsonb_build_object(
    'complete', array_length(missing_elements, 1) IS NULL,
    'missing_elements', missing_elements,
    'total_elements', 7,
    'complete_elements', 7 - COALESCE(array_length(missing_elements, 1), 0)
  );

  -- Store validation results in handoff record
  NEW.validation_details := validation;
  NEW.validation_passed := (validation->>'complete')::boolean;
  NEW.validation_score := ((7 - COALESCE(array_length(missing_elements, 1), 0))::float / 7.0 * 100.0)::integer;

  -- If handoff is being marked as 'accepted', ensure it's complete
  IF NEW.status = 'accepted' THEN
    IF NOT (validation->>'complete')::boolean THEN
      RAISE EXCEPTION E'Cannot accept handoff: Missing required elements\n\n%\n\n'
        'Complete these elements before accepting handoff',
        jsonb_pretty(validation->'missing_elements')
      USING HINT = 'All 7 mandatory elements must be present and have meaningful content (>10 chars)';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Updated completeness validation
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_handoff_completeness(handoff_id UUID)
RETURNS JSONB AS $$
DECLARE
  handoff RECORD;
  missing_elements TEXT[] := ARRAY[]::TEXT[];
  element_status JSONB;
BEGIN
  -- Get handoff
  SELECT * INTO handoff FROM sd_phase_handoffs WHERE id = handoff_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'complete', false,
      'error', 'Handoff not found'
    );
  END IF;

  -- Check 7 mandatory elements (TEXT columns)
  IF handoff.executive_summary IS NULL OR length(trim(handoff.executive_summary)) < 50 THEN
    missing_elements := array_append(missing_elements, '1. Executive Summary (need >50 chars)');
  END IF;

  IF handoff.deliverables_manifest IS NULL OR length(trim(handoff.deliverables_manifest)) < 10 THEN
    missing_elements := array_append(missing_elements, '2. Deliverables Manifest');
  END IF;

  IF handoff.key_decisions IS NULL OR length(trim(handoff.key_decisions)) < 10 THEN
    missing_elements := array_append(missing_elements, '3. Key Decisions & Rationale');
  END IF;

  IF handoff.known_issues IS NULL OR length(trim(handoff.known_issues)) < 10 THEN
    missing_elements := array_append(missing_elements, '4. Known Issues & Risks');
  END IF;

  IF handoff.resource_utilization IS NULL OR length(trim(handoff.resource_utilization)) < 10 THEN
    missing_elements := array_append(missing_elements, '5. Resource Utilization');
  END IF;

  IF handoff.action_items IS NULL OR length(trim(handoff.action_items)) < 10 THEN
    missing_elements := array_append(missing_elements, '6. Action Items for Receiver');
  END IF;

  IF handoff.completeness_report IS NULL OR length(trim(handoff.completeness_report)) < 10 THEN
    missing_elements := array_append(missing_elements, '7. Completeness Report');
  END IF;

  element_status := jsonb_build_object(
    'executive_summary', handoff.executive_summary IS NOT NULL AND length(trim(handoff.executive_summary)) >= 50,
    'deliverables_manifest', handoff.deliverables_manifest IS NOT NULL AND length(trim(handoff.deliverables_manifest)) >= 10,
    'key_decisions', handoff.key_decisions IS NOT NULL AND length(trim(handoff.key_decisions)) >= 10,
    'known_issues', handoff.known_issues IS NOT NULL AND length(trim(handoff.known_issues)) >= 10,
    'resource_utilization', handoff.resource_utilization IS NOT NULL AND length(trim(handoff.resource_utilization)) >= 10,
    'action_items', handoff.action_items IS NOT NULL AND length(trim(handoff.action_items)) >= 10,
    'completeness_report', handoff.completeness_report IS NOT NULL AND length(trim(handoff.completeness_report)) >= 10
  );

  RETURN jsonb_build_object(
    'complete', array_length(missing_elements, 1) IS NULL,
    'missing_elements', missing_elements,
    'element_status', element_status,
    'total_elements', 7,
    'complete_elements', 7 - COALESCE(array_length(missing_elements, 1), 0)
  );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Handoff validation fix applied successfully';
  RAISE NOTICE 'Fixed: auto_validate_handoff() now properly validates TEXT columns';
  RAISE NOTICE 'Fixed: validate_handoff_completeness() now properly validates TEXT columns';
  RAISE NOTICE 'Change: Using length(trim(column)) >= N instead of ::text = "{}"';
  RAISE NOTICE 'Result: Handoff validation will now work correctly';
END $$;

COMMENT ON FUNCTION auto_validate_handoff IS 'FIXED 2025-11-03: Validates TEXT columns using length() instead of JSONB comparison';
COMMENT ON FUNCTION validate_handoff_completeness IS 'FIXED 2025-11-03: Validates TEXT columns using length() instead of JSONB comparison';
