-- ============================================================================
-- Migration: Fix Law 1 System Events Trigger - Remove WHEN Clause
-- ============================================================================
-- Date: 2025-12-26
-- Purpose: Fix system_events trigger that fails when actor_role is not provided
--
-- ISSUE:
--   The WHEN clause on trg_doctrine_system_events causes error:
--   "record 'new' has no field 'actor_role'" when INSERT doesn't include actor_role
--
-- FIX:
--   Remove WHEN clause and handle NULL actor_role inside trigger function
-- ============================================================================

BEGIN;

-- Drop and recreate trigger WITHOUT the WHEN clause
DROP TRIGGER IF EXISTS trg_doctrine_system_events ON system_events;

CREATE TRIGGER trg_doctrine_system_events
  BEFORE INSERT ON system_events
  FOR EACH ROW
  EXECUTE FUNCTION enforce_doctrine_on_system_events();

-- Update the function to handle NULL actor_role
CREATE OR REPLACE FUNCTION enforce_doctrine_on_system_events()
RETURNS TRIGGER AS $$
DECLARE
  v_forbidden_events TEXT[] := ARRAY[
    'SD_CREATED',
    'SD_MODIFIED',
    'SD_SCOPE_EXPANDED',
    'PRD_CREATED',
    'PRD_MODIFIED',
    'PRD_SCOPE_EXPANDED',
    'STRATEGIC_PIVOT',
    'DIRECTIVE_ISSUED',
    'CHAIRMAN_DECISION_CREATED',
    'PROTOCOL_MODIFIED'
  ];
  v_error_message TEXT;
BEGIN
  -- Only check if actor_role is explicitly 'EXEC'
  -- NULL or other values are allowed
  IF NEW.actor_role IS NULL OR NEW.actor_role != 'EXEC' THEN
    RETURN NEW;
  END IF;

  -- Check if event type is forbidden for EXEC
  IF NEW.event_type = ANY(v_forbidden_events) THEN
    v_error_message := format(
      'DOCTRINE_OF_CONSTRAINT_VIOLATION [LAW 1]: EXEC agent cannot log governance event "%s".

THE LAW: "EXEC executes PRD requirements. It does not create strategy."

Event type "%s" requires LEAD or PLAN authority.
EXEC agents may only log implementation events (e.g., TASK_COMPLETED, TEST_PASSED, CODE_COMMITTED).

RESOLUTION: Hand off to PLAN phase for strategic decisions.',
      NEW.event_type,
      NEW.event_type
    );

    -- Log violation
    INSERT INTO doctrine_constraint_violations (
      violation_type,
      attempted_table,
      attempted_operation,
      actor_role,
      sd_id,
      prd_id,
      payload,
      error_message
    ) VALUES (
      'GOVERNANCE_EVENT',
      'system_events',
      'INSERT',
      'EXEC',
      NEW.sd_id,
      NEW.prd_id,
      jsonb_build_object('event_type', NEW.event_type, 'payload', NEW.payload),
      v_error_message
    );

    RAISE EXCEPTION '%', v_error_message
      USING HINT = 'EXEC agents log implementation events only. Governance events require LEAD/PLAN.',
            ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION enforce_doctrine_on_system_events() IS
'Enforces Law 1 on system_events table.
EXEC agents cannot log governance-creation events like SD_CREATED, PRD_MODIFIED, etc.
They may only log implementation events (TASK_COMPLETED, TEST_PASSED, etc.)

FIXED: Handles NULL actor_role gracefully (allows non-EXEC events)';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Fixed Law 1 system_events trigger';
  RAISE NOTICE '   - Removed WHEN clause that caused actor_role errors';
  RAISE NOTICE '   - NULL actor_role is now allowed (non-EXEC events)';
  RAISE NOTICE '   - Only EXEC + forbidden event types are blocked';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback, restore original trigger from:
-- database/migrations/20251226_law1_doctrine_of_constraint_enforcement.sql
-- Lines 317-322
-- ============================================================================
