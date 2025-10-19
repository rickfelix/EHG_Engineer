-- Fix LEO Protocol Handoff Validation Bug
-- Issue: validate_handoff_completeness() returns 'complete: false' even when all 7 elements present
-- Root Cause: array_length([], 1) returns 0 (not NULL), so "IS NULL" check fails
-- Solution: Change to COALESCE(..., 0) = 0 check
-- Date: 2025-10-11
-- Related SD: SD-DOCUMENTATION-001

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

  -- Check 7 mandatory elements
  IF handoff.executive_summary IS NULL OR length(handoff.executive_summary) < 50 THEN
    missing_elements := array_append(missing_elements, '1. Executive Summary (need >50 chars)');
  END IF;

  IF handoff.completeness_report IS NULL OR handoff.completeness_report::text = '{}' THEN
    missing_elements := array_append(missing_elements, '2. Completeness Report');
  END IF;

  IF handoff.deliverables_manifest IS NULL OR handoff.deliverables_manifest::text = '{}' OR handoff.deliverables_manifest::text = '[]' THEN
    missing_elements := array_append(missing_elements, '3. Deliverables Manifest');
  END IF;

  IF handoff.key_decisions IS NULL OR handoff.key_decisions::text = '{}' OR handoff.key_decisions::text = '[]' THEN
    missing_elements := array_append(missing_elements, '4. Key Decisions & Rationale');
  END IF;

  IF handoff.known_issues IS NULL OR handoff.known_issues::text = '{}' OR handoff.known_issues::text = '[]' THEN
    missing_elements := array_append(missing_elements, '5. Known Issues & Risks');
  END IF;

  IF handoff.resource_utilization IS NULL OR handoff.resource_utilization::text = '{}' THEN
    missing_elements := array_append(missing_elements, '6. Resource Utilization');
  END IF;

  IF handoff.action_items IS NULL OR handoff.action_items::text = '{}' OR handoff.action_items::text = '[]' THEN
    missing_elements := array_append(missing_elements, '7. Action Items for Receiver');
  END IF;

  element_status := jsonb_build_object(
    'executive_summary', handoff.executive_summary IS NOT NULL AND length(handoff.executive_summary) >= 50,
    'completeness_report', handoff.completeness_report IS NOT NULL AND handoff.completeness_report::text != '{}',
    'deliverables_manifest', handoff.deliverables_manifest IS NOT NULL AND handoff.deliverables_manifest::text NOT IN ('{}', '[]'),
    'key_decisions', handoff.key_decisions IS NOT NULL AND handoff.key_decisions::text NOT IN ('{}', '[]'),
    'known_issues', handoff.known_issues IS NOT NULL AND handoff.known_issues::text NOT IN ('{}', '[]'),
    'resource_utilization', handoff.resource_utilization IS NOT NULL AND handoff.resource_utilization::text != '{}',
    'action_items', handoff.action_items IS NOT NULL AND handoff.action_items::text NOT IN ('{}', '[]')
  );

  -- FIX: Change from "IS NULL" to "= 0" check for empty array
  RETURN jsonb_build_object(
    'complete', COALESCE(array_length(missing_elements, 1), 0) = 0,
    'missing_elements', missing_elements,
    'element_status', element_status,
    'total_elements', 7,
    'complete_elements', 7 - COALESCE(array_length(missing_elements, 1), 0)
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_handoff_completeness IS 'Validates handoff has all 7 mandatory elements - FIXED: Empty array handling';
