-- ============================================================================
-- Migration: Fix Law 1 Actor Role - Use IF-ELSIF for Safe Column Access
-- ============================================================================
-- Date: 2025-12-26
-- Purpose: Fix enforce_doctrine_of_constraint() to use IF-ELSIF instead of CASE
--          PostgreSQL evaluates all CASE branches during planning, causing
--          column reference errors even for branches that won't execute
--
-- ROOT CAUSE:
--   CASE statements in PL/pgSQL are evaluated at plan time, not runtime.
--   Even with TG_TABLE_NAME branching, PostgreSQL validates NEW.created_by
--   exists on ALL branches, causing "record new has no field" errors.
--
-- FIX:
--   Use IF-ELSIF-ELSE structure which only evaluates the matching branch.
--   This is the standard pattern for polymorphic triggers in PostgreSQL.
--
-- EVIDENCE:
--   Error: "record 'new' has no field 'created_by'"
--   Where: "PL/pgSQL assignment 'v_actor_role := CASE TG_TABLE_NAME...'"
--   This proves PostgreSQL checks all CASE branches regardless of condition.
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
  -- Use IF-ELSIF to only evaluate columns that exist on current table
  -- ========================================================================
  IF TG_TABLE_NAME = 'strategic_directives_v2' THEN
    v_actor_role := COALESCE(NEW.created_by, NEW.updated_by);
  ELSIF TG_TABLE_NAME = 'product_requirements_v2' THEN
    v_actor_role := COALESCE(NEW.created_by, NEW.updated_by);
  ELSIF TG_TABLE_NAME = 'leo_protocols' THEN
    v_actor_role := NEW.created_by;
  ELSE
    -- Tables with NO actor columns (chairman_decisions, leo_protocol_sections)
    v_actor_role := NULL;
  END IF;

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
  IF TG_TABLE_NAME = 'strategic_directives_v2' THEN
    v_actor_id := COALESCE(NEW.created_by, NEW.updated_by);
  ELSIF TG_TABLE_NAME = 'product_requirements_v2' THEN
    v_actor_id := COALESCE(NEW.created_by, NEW.updated_by);
  ELSIF TG_TABLE_NAME = 'leo_protocols' THEN
    v_actor_id := NEW.created_by;
  ELSE
    v_actor_id := NULL;
  END IF;

  -- Safe extraction of sd_id (for audit logging)
  IF TG_TABLE_NAME = 'strategic_directives_v2' THEN
    v_sd_id := NEW.id;
  ELSIF TG_TABLE_NAME = 'product_requirements_v2' THEN
    v_sd_id := NEW.sd_id;
  ELSE
    v_sd_id := NULL;
  END IF;

  -- Safe extraction of prd_id (for audit logging)
  IF TG_TABLE_NAME = 'product_requirements_v2' THEN
    v_prd_id := NEW.id;
  ELSE
    v_prd_id := NULL;
  END IF;

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
  Uses IF-ELSIF branching (NOT CASE) to only access columns that exist.
  CASE statements are evaluated at plan time and check all branches.
  IF-ELSIF only evaluates the matching branch at runtime.

FIX HISTORY:
  - v1: Original used NEW.actor_role (column doesn''t exist)
  - v2: Removed actor_role, still accessed NEW.created_by on all tables
  - v3: Used CASE TG_TABLE_NAME (still evaluated all branches at plan time)
  - v4 (THIS): Uses IF-ELSIF for true runtime branching

Part of EHG Immutable Laws v9.0.0 Manifesto.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '  Law 1 Trigger Fix - IF-ELSIF Safe Access';
  RAISE NOTICE '============================================================';
  RAISE NOTICE '';
  RAISE NOTICE 'FIXED: enforce_doctrine_of_constraint() now uses IF-ELSIF';
  RAISE NOTICE '       instead of CASE for safe column access:';
  RAISE NOTICE '';
  RAISE NOTICE '  IF TG_TABLE_NAME = ''strategic_directives_v2'' THEN';
  RAISE NOTICE '    v_actor_role := COALESCE(NEW.created_by, NEW.updated_by)';
  RAISE NOTICE '  ELSIF TG_TABLE_NAME = ''product_requirements_v2'' THEN';
  RAISE NOTICE '    v_actor_role := COALESCE(NEW.created_by, NEW.updated_by)';
  RAISE NOTICE '  ELSIF TG_TABLE_NAME = ''leo_protocols'' THEN';
  RAISE NOTICE '    v_actor_role := NEW.created_by';
  RAISE NOTICE '  ELSE';
  RAISE NOTICE '    v_actor_role := NULL  -- chairman_decisions, leo_protocol_sections';
  RAISE NOTICE '  END IF';
  RAISE NOTICE '';
  RAISE NOTICE 'Why IF-ELSIF:';
  RAISE NOTICE '  - CASE evaluates all branches at plan time';
  RAISE NOTICE '  - IF-ELSIF only evaluates matching branch at runtime';
  RAISE NOTICE '  - PostgreSQL standard for polymorphic triggers';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback, restore from:
-- database/migrations/20251226_law1_fix_actor_role_safe_access.sql
-- (Note: that version uses CASE which has plan-time evaluation issues)
-- ============================================================================
