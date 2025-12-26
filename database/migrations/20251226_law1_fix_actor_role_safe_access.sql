-- ============================================================================
-- Migration: Fix Law 1 Actor Role - Safe Column Access
-- ============================================================================
-- Date: 2025-12-26
-- Purpose: Fix enforce_doctrine_of_constraint() to safely handle tables
--          that don't have created_by/updated_by columns
--
-- ROOT CAUSE ANALYSIS:
--   The original fix at 20251226_law1_fix_actor_role_check.sql still fails because
--   PostgreSQL evaluates NEW.created_by BEFORE COALESCE can provide a fallback.
--   When a column doesn't exist on the record type, PostgreSQL throws:
--   "record 'new' has no field 'created_by'"
--
-- TABLES WITH TRIGGER vs COLUMNS:
--   | Table                    | created_by | updated_by | Trigger |
--   |--------------------------|------------|------------|---------|
--   | strategic_directives_v2  | YES        | YES        | YES     |
--   | product_requirements_v2  | YES        | YES        | YES     |
--   | chairman_decisions       | NO         | NO         | YES     |
--   | leo_protocols            | YES        | NO         | YES     |
--   | leo_protocol_sections    | NO         | NO         | YES     |
--
-- FIX:
--   Use TG_TABLE_NAME to branch logic and only access columns that exist
--   on each specific table. This pattern is already used in the same
--   function for v_violation_type.
--
-- EVIDENCE:
--   - Explore agent analysis: abc0266, adef5c7, a20bf1e
--   - Pattern source: ops/checks/wsjf_recommendations_staging.sql (lines 26-35)
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION enforce_doctrine_of_constraint()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_role TEXT;
  v_violation_type TEXT;
  v_error_message TEXT;
  v_actor_id TEXT;
  v_sd_id TEXT;
  v_prd_id TEXT;
BEGIN
  -- ========================================================================
  -- SAFE ACTOR ROLE EXTRACTION
  -- Use TG_TABLE_NAME to only access columns that exist on each table
  -- ========================================================================
  v_actor_role := CASE TG_TABLE_NAME
    -- Tables with both created_by and updated_by
    WHEN 'strategic_directives_v2' THEN COALESCE(NEW.created_by, NEW.updated_by)
    WHEN 'product_requirements_v2' THEN COALESCE(NEW.created_by, NEW.updated_by)
    -- Tables with only created_by
    WHEN 'leo_protocols' THEN NEW.created_by
    -- Tables with NO actor columns (chairman_decisions, leo_protocol_sections)
    ELSE NULL
  END;

  -- Fallback to session variable or UNKNOWN
  v_actor_role := COALESCE(
    v_actor_role,
    current_setting('app.current_actor_role', true),
    'UNKNOWN'
  );

  -- ========================================================================
  -- ENFORCEMENT: Only block EXEC role
  -- ========================================================================
  IF v_actor_role != 'EXEC' THEN
    RETURN NEW;
  END IF;

  -- ========================================================================
  -- VIOLATION HANDLING
  -- ========================================================================

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

  -- Safe extraction of actor_id (for audit logging)
  v_actor_id := CASE TG_TABLE_NAME
    WHEN 'strategic_directives_v2' THEN COALESCE(NEW.created_by, NEW.updated_by)
    WHEN 'product_requirements_v2' THEN COALESCE(NEW.created_by, NEW.updated_by)
    WHEN 'leo_protocols' THEN NEW.created_by
    ELSE NULL
  END;

  -- Safe extraction of sd_id (for audit logging)
  v_sd_id := CASE TG_TABLE_NAME
    WHEN 'strategic_directives_v2' THEN NEW.id
    WHEN 'product_requirements_v2' THEN NEW.sd_id
    ELSE NULL
  END;

  -- Safe extraction of prd_id (for audit logging)
  v_prd_id := CASE TG_TABLE_NAME
    WHEN 'product_requirements_v2' THEN NEW.id
    ELSE NULL
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
    v_actor_id,
    v_sd_id,
    v_prd_id,
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

SAFE COLUMN ACCESS:
  Uses TG_TABLE_NAME branching to only access columns that exist on each table.
  Tables without created_by/updated_by fall back to session variable.

FIX HISTORY:
  - v1: Original used NEW.actor_role (column doesnt exist)
  - v2: Removed actor_role, still accessed NEW.created_by on all tables
  - v3 (THIS): Uses TG_TABLE_NAME to safely access table-specific columns

Part of EHG Immutable Laws v9.0.0 Manifesto.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '  Law 1 Trigger Fix - Safe Column Access';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'FIXED: enforce_doctrine_of_constraint() now uses TG_TABLE_NAME';
  RAISE NOTICE '       to safely access columns that exist on each table:';
  RAISE NOTICE '';
  RAISE NOTICE '  strategic_directives_v2  -> NEW.created_by, NEW.updated_by';
  RAISE NOTICE '  product_requirements_v2  -> NEW.created_by, NEW.updated_by';
  RAISE NOTICE '  leo_protocols            -> NEW.created_by';
  RAISE NOTICE '  chairman_decisions       -> (none, uses session var)';
  RAISE NOTICE '  leo_protocol_sections    -> (none, uses session var)';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables without actor columns fall back to:';
  RAISE NOTICE '  1. current_setting(app.current_actor_role)';
  RAISE NOTICE '  2. UNKNOWN (allows insert, only blocks EXEC)';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback, restore from:
-- database/migrations/20251226_law1_fix_actor_role_check.sql
-- (Note: that version still has the column access bug)
-- ============================================================================
