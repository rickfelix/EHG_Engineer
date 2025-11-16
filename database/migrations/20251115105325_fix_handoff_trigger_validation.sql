-- LEO Protocol v4.3.0 - Fix Handoff Validation Trigger
-- SD: SD-STAGE4-AI-FIRST-UX-001
-- Issue: BEFORE INSERT trigger tries to SELECT row that doesn't exist yet
-- Fix: Validate NEW record directly instead of SELECTing from table

-- Replace the validation function to use NEW record directly
CREATE OR REPLACE FUNCTION auto_validate_handoff()
RETURNS TRIGGER AS $$
DECLARE
  missing_elements TEXT[] := ARRAY[]::TEXT[];
BEGIN
  -- Only validate when status is 'accepted'
  IF NEW.status = 'accepted' THEN

    -- 1. Executive Summary (>50 chars)
    IF NEW.executive_summary IS NULL OR length(NEW.executive_summary) < 50 THEN
      missing_elements := array_append(missing_elements, '1. Executive Summary (need >50 chars)');
    END IF;

    -- 2. Completeness Report (not null, not empty JSONB)
    IF NEW.completeness_report IS NULL OR NEW.completeness_report::text = '{}' THEN
      missing_elements := array_append(missing_elements, '2. Completeness Report');
    END IF;

    -- 3. Deliverables Manifest (not null, not empty)
    IF NEW.deliverables_manifest IS NULL OR
       NEW.deliverables_manifest::text = '{}' OR
       NEW.deliverables_manifest::text = '[]' THEN
      missing_elements := array_append(missing_elements, '3. Deliverables Manifest');
    END IF;

    -- 4. Key Decisions (not null, not empty)
    IF NEW.key_decisions IS NULL OR
       NEW.key_decisions::text = '{}' OR
       NEW.key_decisions::text = '[]' THEN
      missing_elements := array_append(missing_elements, '4. Key Decisions & Rationale');
    END IF;

    -- 5. Known Issues (not null, not empty)
    IF NEW.known_issues IS NULL OR
       NEW.known_issues::text = '{}' OR
       NEW.known_issues::text = '[]' THEN
      missing_elements := array_append(missing_elements, '5. Known Issues & Risks');
    END IF;

    -- 6. Resource Utilization (not null, not empty JSONB)
    IF NEW.resource_utilization IS NULL OR NEW.resource_utilization::text = '{}' THEN
      missing_elements := array_append(missing_elements, '6. Resource Utilization');
    END IF;

    -- 7. Action Items (not null, not empty)
    IF NEW.action_items IS NULL OR
       NEW.action_items::text = '{}' OR
       NEW.action_items::text = '[]' THEN
      missing_elements := array_append(missing_elements, '7. Action Items for Receiver');
    END IF;

    -- If any elements are missing, raise exception
    IF array_length(missing_elements, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot accept handoff: Missing required elements: %',
        array_to_string(missing_elements, ', ');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger remains the same (BEFORE INSERT OR UPDATE)
-- But now the validation function works correctly
-- because it validates NEW record instead of SELECTing

COMMENT ON FUNCTION auto_validate_handoff() IS
'LEO Protocol v4.3.0 - Fixed handoff validation (validates NEW record directly, no SELECT)';
