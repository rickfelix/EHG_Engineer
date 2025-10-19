-- LEO Protocol Enhancement #4: Mandatory Handoff Creation
-- Purpose: Prevent phase transitions without proper handoffs
-- Root Cause Fixed: No handoffs recorded (no enforcement)
-- Date: 2025-10-10
-- Related SD: SD-AGENT-MIGRATION-001 had zero handoffs recorded

-- ============================================================================
-- FUNCTION: Enforce handoff on phase transition
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_handoff_on_phase_transition()
RETURNS TRIGGER AS $$
DECLARE
  required_handoff_type VARCHAR(50);
  handoff_exists BOOLEAN;
  recent_handoff RECORD;
BEGIN
  -- Only enforce if phase or status actually changed
  IF NEW.current_phase IS NOT DISTINCT FROM OLD.current_phase AND
     NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Determine required handoff based on phase transition
  IF NEW.current_phase = 'PLAN' AND OLD.current_phase = 'LEAD' THEN
    required_handoff_type := 'LEAD-to-PLAN';

  ELSIF NEW.current_phase = 'EXEC' AND OLD.current_phase = 'PLAN' THEN
    required_handoff_type := 'PLAN-to-EXEC';

  ELSIF NEW.current_phase = 'PLAN' AND OLD.current_phase = 'EXEC' THEN
    required_handoff_type := 'EXEC-to-PLAN';

  ELSIF NEW.current_phase = 'LEAD' AND OLD.current_phase = 'PLAN' AND NEW.status = 'pending_approval' THEN
    required_handoff_type := 'PLAN-to-LEAD';

  ELSE
    -- No specific handoff required for this transition
    RETURN NEW;
  END IF;

  -- Check if required handoff exists (created within last 24 hours to prevent stale handoffs)
  SELECT * INTO recent_handoff
  FROM sd_phase_handoffs
  WHERE sd_id = NEW.id
  AND handoff_type = required_handoff_type
  AND status = 'accepted'
  AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT 1;

  IF recent_handoff IS NULL THEN
    RAISE EXCEPTION E'LEO Protocol Violation: Phase transition blocked\n\n'
      'Phase: % → %\n'
      'Required handoff: %\n'
      'Status: Missing or not accepted\n\n'
      'ACTION REQUIRED:\n'
      '1. Run: node scripts/unified-handoff-system.js execute % %\n'
      '2. Ensure handoff includes all 7 mandatory elements\n'
      '3. Wait for handoff to be accepted\n'
      '4. Then retry phase transition',
      OLD.current_phase,
      NEW.current_phase,
      required_handoff_type,
      required_handoff_type,
      NEW.id
    USING HINT = 'Use unified handoff system to create required handoff';
  END IF;

  RAISE NOTICE 'Handoff verification passed: % (created %)',
    required_handoff_type,
    recent_handoff.created_at;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS enforce_handoff_trigger ON strategic_directives_v2;

-- Create trigger
CREATE TRIGGER enforce_handoff_trigger
  BEFORE UPDATE OF current_phase, status
  ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_handoff_on_phase_transition();

-- ============================================================================
-- FUNCTION: Check if handoff is complete (7 elements)
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
-- FUNCTION: Auto-validate handoff on insert/update
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_validate_handoff()
RETURNS TRIGGER AS $$
DECLARE
  validation JSONB;
BEGIN
  -- Run validation
  validation := validate_handoff_completeness(NEW.id);

  -- If handoff is being marked as 'accepted', ensure it's complete
  IF NEW.status = 'accepted' THEN
    IF NOT (validation->>'complete')::boolean THEN
      RAISE EXCEPTION E'Cannot accept handoff: Missing required elements\n\n%\n\n'
        'Complete these elements before accepting handoff',
        validation->'missing_elements'
      USING HINT = 'All 7 mandatory elements must be present';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS validate_handoff_trigger ON sd_phase_handoffs;

CREATE TRIGGER validate_handoff_trigger
  BEFORE INSERT OR UPDATE OF status
  ON sd_phase_handoffs
  FOR EACH ROW
  EXECUTE FUNCTION auto_validate_handoff();

-- ============================================================================
-- FUNCTION: Check recent handoffs for SD
-- ============================================================================

CREATE OR REPLACE FUNCTION get_sd_handoff_status(sd_id_param VARCHAR)
RETURNS JSONB AS $$
DECLARE
  handoff_summary JSONB;
BEGIN
  SELECT jsonb_object_agg(
    handoff_type,
    jsonb_build_object(
      'exists', true,
      'status', status,
      'created_at', created_at,
      'from_agent', from_agent,
      'to_agent', to_agent
    )
  ) INTO handoff_summary
  FROM (
    SELECT DISTINCT ON (handoff_type)
      handoff_type,
      status,
      created_at,
      from_agent,
      to_agent
    FROM sd_phase_handoffs
    WHERE sd_id = sd_id_param
    ORDER BY handoff_type, created_at DESC
  ) recent_handoffs;

  RETURN COALESCE(handoff_summary, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON FUNCTION enforce_handoff_on_phase_transition IS 'Trigger function that blocks phase transitions if required handoff is missing or not accepted within last 24 hours';
COMMENT ON FUNCTION validate_handoff_completeness IS 'Validates handoff has all 7 mandatory elements - used to block acceptance of incomplete handoffs';
COMMENT ON FUNCTION auto_validate_handoff IS 'Trigger function that validates handoff completeness before allowing status=accepted';
COMMENT ON FUNCTION get_sd_handoff_status IS 'Returns summary of all handoffs for an SD (useful for dashboard display)';

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'LEO Protocol Enhancement #4 applied successfully';
  RAISE NOTICE 'Function created: enforce_handoff_on_phase_transition()';
  RAISE NOTICE 'Function created: validate_handoff_completeness(handoff_id)';
  RAISE NOTICE 'Function created: auto_validate_handoff()';
  RAISE NOTICE 'Function created: get_sd_handoff_status(sd_id)';
  RAISE NOTICE 'Trigger created: enforce_handoff_trigger (blocks phase transitions)';
  RAISE NOTICE 'Trigger created: validate_handoff_trigger (blocks incomplete handoffs)';
  RAISE NOTICE 'Enforcement: Phase transitions without handoffs = DATABASE ERROR';
  RAISE NOTICE 'Enforcement: Handoffs without 7 elements cannot be accepted';
END $$;
