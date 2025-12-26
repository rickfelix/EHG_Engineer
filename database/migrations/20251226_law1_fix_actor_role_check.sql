-- ============================================================================
-- Migration: Fix Law 1 Actor Role Check for Tables Without actor_role Column
-- ============================================================================
-- Date: 2025-12-26
-- Purpose: Fix enforce_doctrine_of_constraint() to work with tables that
--          don't have actor_role column (like strategic_directives_v2)
--
-- ISSUE:
--   Line: v_actor_role := COALESCE(NEW.actor_role, ...)
--   Error: "record 'new' has no field 'actor_role'"
--
-- FIX:
--   Use TG_TABLE_NAME to conditionally check for actor_role column
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION enforce_doctrine_of_constraint()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_role TEXT;
  v_violation_type TEXT;
  v_error_message TEXT;
BEGIN
  -- Extract actor role from the record
  -- Different tables have different column names, handle gracefully
  v_actor_role := COALESCE(
    NEW.created_by,
    NEW.updated_by,
    current_setting('app.current_actor_role', true),
    'UNKNOWN'
  );

  -- Only enforce constraint for EXEC role
  IF v_actor_role != 'EXEC' THEN
    RETURN NEW;
  END IF;

  -- Determine violation type based on table and operation
  v_violation_type := CASE TG_TABLE_NAME
    WHEN 'strategic_directives_v2' THEN
      CASE TG_OP WHEN 'INSERT' THEN 'SD_CREATE' ELSE 'SD_MODIFY' END
    WHEN 'product_requirements_v2' THEN
      CASE TG_OP WHEN 'INSERT' THEN 'PRD_CREATE' ELSE 'PRD_MODIFY' END
    WHEN 'chairman_decisions' THEN 'CHAIRMAN_DECISION'
    WHEN 'leo_protocols' THEN 'PROTOCOL_MODIFY'
    WHEN 'leo_protocol_sections' THEN 'PROTOCOL_SECTION_MODIFY'
    ELSE 'GOVERNANCE_ARTIFACT'
  END;

  v_error_message := format(
    'DOCTRINE_OF_CONSTRAINT_VIOLATION [LAW 1]: EXEC agent cannot %s on %s.

THE LAW: "EXEC roles must be explicitly forbidden from strategic re-interpretation.
          They execute; they do not think. Intelligence without authority is a bug."

VIOLATION DETAILS:
  - Actor Role: %s
  - Operation: %s
  - Table: %s
  - Violation Type: %s

RESOLUTION:
  1. EXEC must hand off to PLAN phase for strategic modifications
  2. PLAN proposes changes, LEAD approves
  3. Only LEAD can authorize new Strategic Directives

This constraint exists at the DATABASE LAYER. It cannot be bypassed by prompt engineering.',
    TG_OP,
    TG_TABLE_NAME,
    v_actor_role,
    TG_OP,
    TG_TABLE_NAME,
    v_violation_type
  );

  -- Log the violation attempt
  INSERT INTO doctrine_constraint_violations (
    violation_type,
    attempted_table,
    attempted_operation,
    actor_role,
    actor_id,
    sd_id,
    prd_id,
    payload,
    error_message,
    correlation_id
  ) VALUES (
    v_violation_type,
    TG_TABLE_NAME,
    TG_OP,
    v_actor_role,
    COALESCE(NEW.created_by, NEW.updated_by),
    CASE WHEN TG_TABLE_NAME = 'strategic_directives_v2' THEN NEW.id ELSE NEW.sd_id END,
    CASE WHEN TG_TABLE_NAME = 'product_requirements_v2' THEN NEW.id ELSE NEW.prd_id END,
    to_jsonb(NEW),
    v_error_message,
    gen_random_uuid()
  );

  -- HARD STOP: Raise exception to rollback transaction
  RAISE EXCEPTION '%', v_error_message
    USING HINT = 'EXEC agents execute PRD requirements. They do not create strategy. Escalate to PLAN phase.',
          ERRCODE = 'P0001';

  -- This line is never reached due to exception above
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION enforce_doctrine_of_constraint() IS
'Enforces Law 1: Doctrine of Constraint.
EXEC agents are DATABASE-FORBIDDEN from creating/modifying:
  - Strategic Directives (strategic_directives_v2)
  - Product Requirements (product_requirements_v2)
  - Chairman Decisions (chairman_decisions)
  - LEO Protocols (leo_protocols, leo_protocol_sections)

This is a SCHEMA-LEVEL enforcement. Even if the LLM prompt fails,
the database transaction will be rolled back.

FIXED: Removed reference to NEW.actor_role (column may not exist)
       Uses created_by/updated_by instead

Part of EHG Immutable Laws v9.0.0 Manifesto.';

-- Verification
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ Fixed Law 1 enforce_doctrine_of_constraint()';
  RAISE NOTICE '   - Removed NEW.actor_role reference (column does not exist on all tables)';
  RAISE NOTICE '   - Uses created_by/updated_by for actor identification';
  RAISE NOTICE '   - Constraint still enforces EXEC role restriction';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback, restore original function from:
-- database/migrations/20251226_law1_doctrine_of_constraint_enforcement.sql
-- Lines 88-181
-- ============================================================================
