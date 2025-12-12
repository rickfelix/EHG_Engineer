-- Migration: Fix improvement_type column ambiguity
-- Date: 2025-12-11
-- Issue: Column reference "improvement_type" is ambiguous in extract_protocol_improvements_from_retro trigger
-- Root Cause: Local PL/pgSQL variable "improvement_type" shadows the table column of the same name
-- Fix: Prefix local variables with v_ per PostgreSQL best practices
-- Evidence: RETRO sub-agent fails with "column reference 'improvement_type' is ambiguous"
--           when storing retrospectives that contain protocol_improvements array

-- =====================================================================================
-- FIX: Rename local variables in extract_protocol_improvements_from_retro() function
-- =====================================================================================

CREATE OR REPLACE FUNCTION extract_protocol_improvements_from_retro()
RETURNS TRIGGER AS $$
DECLARE
  improvement_item JSONB;
  failure_item TEXT;
  existing_queue_id UUID;
  v_improvement_desc TEXT;    -- Prefixed with v_ to avoid column collision
  v_improvement_type TEXT;    -- Prefixed with v_ to avoid column collision
  v_target_phase TEXT;        -- Prefixed with v_ to avoid column collision
BEGIN
  -- Only process if retrospective has protocol_improvements array
  IF NEW.protocol_improvements IS NOT NULL AND jsonb_array_length(NEW.protocol_improvements) > 0 THEN

    -- Iterate through protocol_improvements array
    FOR improvement_item IN SELECT * FROM jsonb_array_elements(NEW.protocol_improvements)
    LOOP
      -- Extract fields from improvement item
      v_improvement_desc := improvement_item->>'improvement';
      v_improvement_type := CASE
        WHEN improvement_item->>'category' = 'validation' THEN 'VALIDATION_RULE'
        WHEN improvement_item->>'category' = 'checklist' THEN 'CHECKLIST_ITEM'
        WHEN improvement_item->>'category' = 'skill' THEN 'SKILL_UPDATE'
        WHEN improvement_item->>'category' = 'documentation' THEN 'PROTOCOL_SECTION'
        WHEN improvement_item->>'category' = 'sub_agent' THEN 'SUB_AGENT_CONFIG'
        WHEN improvement_item->>'category' = 'PLAN_ENFORCEMENT' THEN 'VALIDATION_RULE'
        WHEN improvement_item->>'category' = 'HANDOFF_ENFORCEMENT' THEN 'VALIDATION_RULE'
        WHEN improvement_item->>'category' = 'SUB_AGENT_AUTOMATION' THEN 'SUB_AGENT_CONFIG'
        WHEN improvement_item->>'category' = 'TESTING_ENFORCEMENT' THEN 'CHECKLIST_ITEM'
        WHEN improvement_item->>'category' = 'PROCESS_SIMPLIFICATION' THEN 'PROTOCOL_SECTION'
        ELSE 'PROTOCOL_SECTION' -- default
      END;

      v_target_phase := COALESCE(improvement_item->>'affected_phase', 'ALL');

      -- Check for existing similar improvement (consolidation)
      -- FIXED: Now uses v_improvement_type (variable) vs improvement_type (column)
      SELECT id INTO existing_queue_id
      FROM protocol_improvement_queue piq
      WHERE piq.description = v_improvement_desc
        AND piq.improvement_type = v_improvement_type
        AND piq.status IN ('PENDING', 'APPROVED')
      LIMIT 1;

      IF existing_queue_id IS NOT NULL THEN
        -- Update evidence count for existing improvement
        -- Note: Using reviewed_at since updated_at doesn't exist in schema
        UPDATE protocol_improvement_queue
        SET evidence_count = evidence_count + 1,
            reviewed_at = NOW()
        WHERE id = existing_queue_id;
      ELSE
        -- Insert new improvement
        INSERT INTO protocol_improvement_queue (
          source_retro_id,
          source_type,
          improvement_type,
          target_table,
          target_operation,
          payload,
          target_phase,
          description,
          evidence_count,
          auto_applicable
        ) VALUES (
          NEW.id,
          NEW.retro_type,
          v_improvement_type,
          -- Map improvement type to target table
          CASE v_improvement_type
            WHEN 'VALIDATION_RULE' THEN 'leo_validation_rules'
            WHEN 'CHECKLIST_ITEM' THEN 'leo_protocol_sections'
            WHEN 'SKILL_UPDATE' THEN 'leo_protocol_sections'
            WHEN 'PROTOCOL_SECTION' THEN 'leo_protocol_sections'
            WHEN 'SUB_AGENT_CONFIG' THEN 'leo_sub_agents'
          END,
          'INSERT', -- Default to INSERT, can be manually changed if needed
          improvement_item, -- Store full JSONB as payload
          v_target_phase,
          v_improvement_desc,
          1, -- Initial evidence count
          v_improvement_type IN ('CHECKLIST_ITEM') -- Only checklist items are auto-applicable
        );
      END IF;
    END LOOP;
  END IF;

  -- Also extract from failure_patterns if they indicate process issues
  IF NEW.failure_patterns IS NOT NULL AND array_length(NEW.failure_patterns, 1) > 0 THEN
    FOREACH failure_item IN ARRAY NEW.failure_patterns
    LOOP
      -- Only extract failure patterns that suggest protocol improvements
      IF failure_item ILIKE '%should have%' OR
         failure_item ILIKE '%missing validation%' OR
         failure_item ILIKE '%need checklist%' OR
         failure_item ILIKE '%protocol%' THEN

        -- Check for existing similar improvement
        SELECT id INTO existing_queue_id
        FROM protocol_improvement_queue
        WHERE description = failure_item
          AND status IN ('PENDING', 'APPROVED')
        LIMIT 1;

        IF existing_queue_id IS NOT NULL THEN
          -- Increment evidence count
          -- Note: Using reviewed_at since updated_at doesn't exist in schema
          UPDATE protocol_improvement_queue
          SET evidence_count = evidence_count + 1,
              reviewed_at = NOW()
          WHERE id = existing_queue_id;
        ELSE
          -- Insert as PROTOCOL_SECTION improvement (requires manual review)
          INSERT INTO protocol_improvement_queue (
            source_retro_id,
            source_type,
            improvement_type,
            target_table,
            target_operation,
            payload,
            target_phase,
            description,
            evidence_count,
            auto_applicable
          ) VALUES (
            NEW.id,
            NEW.retro_type,
            'PROTOCOL_SECTION',
            'leo_protocol_sections',
            'INSERT',
            jsonb_build_object(
              'failure_pattern', failure_item,
              'suggested_action', 'Add checklist item or validation rule to prevent this pattern'
            ),
            'ALL',
            failure_item,
            1,
            FALSE -- Failure patterns always need manual review
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================================
-- Grant necessary permissions
-- =====================================================================================
GRANT EXECUTE ON FUNCTION extract_protocol_improvements_from_retro() TO authenticated;
GRANT EXECUTE ON FUNCTION extract_protocol_improvements_from_retro() TO service_role;

-- =====================================================================================
-- Ensure trigger is properly attached (idempotent)
-- =====================================================================================
DROP TRIGGER IF EXISTS trg_extract_protocol_improvements ON retrospectives;

CREATE TRIGGER trg_extract_protocol_improvements
  AFTER INSERT OR UPDATE ON retrospectives
  FOR EACH ROW
  WHEN (NEW.protocol_improvements IS NOT NULL)
  EXECUTE FUNCTION extract_protocol_improvements_from_retro();

-- =====================================================================================
-- Verification comment
-- =====================================================================================
COMMENT ON FUNCTION extract_protocol_improvements_from_retro() IS
'Extracts protocol improvements from retrospectives and queues them for review.
Fixed 2025-12-11: Renamed local variables to v_* prefix to avoid column name ambiguity.
Root cause: PL/pgSQL variable "improvement_type" shadowed table column of same name,
causing "column reference is ambiguous" error on INSERT/UPDATE.';
