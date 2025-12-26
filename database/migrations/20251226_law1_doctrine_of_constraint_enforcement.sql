-- ============================================================================
-- Migration: Law 1 - Doctrine of Constraint Enforcement
-- ============================================================================
-- SD: SD-2025-12-26-MANIFESTO-HARDENING
-- Date: 2025-12-26
-- Author: Constitutional Audit (Claude Opus 4.5)
-- Purpose: Enforce that EXEC agents CANNOT create or modify governance artifacts
--
-- THE IMMUTABLE LAW:
--   "EXEC roles must be explicitly forbidden from strategic re-interpretation.
--    They execute; they do not think. Intelligence without authority is a bug."
--
-- ENFORCEMENT:
--   - Database triggers on governance tables reject EXEC writes
--   - system_events trigger blocks EXEC from logging governance-creation events
--   - All violations logged to audit table for compliance reporting
--
-- SAFETY:
--   - Idempotent (DROP IF EXISTS, CREATE OR REPLACE)
--   - Audit log captures all violation attempts
--   - Rollback instructions included
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: Create violation audit table
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctrine_constraint_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Violation details
  violation_type VARCHAR(50) NOT NULL,
    -- Values: 'SD_CREATE', 'SD_MODIFY', 'PRD_CREATE', 'PRD_MODIFY',
    --         'CHAIRMAN_DECISION', 'GOVERNANCE_EVENT'

  attempted_table VARCHAR(100) NOT NULL,
  attempted_operation VARCHAR(20) NOT NULL, -- INSERT, UPDATE, DELETE
  actor_role VARCHAR(50) NOT NULL,
  actor_id VARCHAR(100),

  -- Context
  sd_id VARCHAR(100),
  prd_id VARCHAR(100),
  payload JSONB DEFAULT '{}'::jsonb,

  -- Error details
  error_message TEXT NOT NULL,
  stack_trace TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  session_id TEXT,
  correlation_id UUID
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_doctrine_violations_created
  ON doctrine_constraint_violations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doctrine_violations_actor
  ON doctrine_constraint_violations(actor_role);
CREATE INDEX IF NOT EXISTS idx_doctrine_violations_type
  ON doctrine_constraint_violations(violation_type);

-- RLS
ALTER TABLE doctrine_constraint_violations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS doctrine_violations_service_role ON doctrine_constraint_violations;
CREATE POLICY doctrine_violations_service_role
  ON doctrine_constraint_violations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS doctrine_violations_authenticated_select ON doctrine_constraint_violations;
CREATE POLICY doctrine_violations_authenticated_select
  ON doctrine_constraint_violations FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE doctrine_constraint_violations IS
'Audit log for Doctrine of Constraint violations (Law 1).
Captures all attempts by EXEC agents to create/modify governance artifacts.
Part of EHG Immutable Laws v9.0.0 Manifesto enforcement.';

-- ============================================================================
-- PHASE 2: Create enforcement function for governance tables
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_doctrine_of_constraint()
RETURNS TRIGGER AS $$
DECLARE
  v_actor_role TEXT;
  v_violation_type TEXT;
  v_error_message TEXT;
BEGIN
  -- Extract actor role from the record
  -- Check multiple possible column names for actor identification
  v_actor_role := COALESCE(
    NEW.created_by,
    NEW.updated_by,
    NEW.actor_role,
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

Part of EHG Immutable Laws v9.0.0 Manifesto.';

-- ============================================================================
-- PHASE 3: Apply triggers to governance tables
-- ============================================================================

-- Strategic Directives
DROP TRIGGER IF EXISTS trg_doctrine_constraint_sd ON strategic_directives_v2;
CREATE TRIGGER trg_doctrine_constraint_sd
  BEFORE INSERT OR UPDATE ON strategic_directives_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_doctrine_of_constraint();

-- Product Requirements
DROP TRIGGER IF EXISTS trg_doctrine_constraint_prd ON product_requirements_v2;
CREATE TRIGGER trg_doctrine_constraint_prd
  BEFORE INSERT OR UPDATE ON product_requirements_v2
  FOR EACH ROW
  EXECUTE FUNCTION enforce_doctrine_of_constraint();

-- Chairman Decisions (if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'chairman_decisions') THEN
    DROP TRIGGER IF EXISTS trg_doctrine_constraint_chairman ON chairman_decisions;
    CREATE TRIGGER trg_doctrine_constraint_chairman
      BEFORE INSERT OR UPDATE ON chairman_decisions
      FOR EACH ROW
      EXECUTE FUNCTION enforce_doctrine_of_constraint();
  END IF;
END $$;

-- LEO Protocols
DROP TRIGGER IF EXISTS trg_doctrine_constraint_protocols ON leo_protocols;
CREATE TRIGGER trg_doctrine_constraint_protocols
  BEFORE INSERT OR UPDATE ON leo_protocols
  FOR EACH ROW
  EXECUTE FUNCTION enforce_doctrine_of_constraint();

-- LEO Protocol Sections
DROP TRIGGER IF EXISTS trg_doctrine_constraint_sections ON leo_protocol_sections;
CREATE TRIGGER trg_doctrine_constraint_sections
  BEFORE INSERT OR UPDATE ON leo_protocol_sections
  FOR EACH ROW
  EXECUTE FUNCTION enforce_doctrine_of_constraint();

-- ============================================================================
-- PHASE 4: Enforce on system_events (governance event types)
-- ============================================================================

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
  -- Only check EXEC role
  IF NEW.actor_role != 'EXEC' THEN
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
They may only log implementation events (TASK_COMPLETED, TEST_PASSED, etc.)';

-- Apply to system_events
DROP TRIGGER IF EXISTS trg_doctrine_system_events ON system_events;
CREATE TRIGGER trg_doctrine_system_events
  BEFORE INSERT ON system_events
  FOR EACH ROW
  WHEN (NEW.actor_role = 'EXEC')
  EXECUTE FUNCTION enforce_doctrine_on_system_events();

-- ============================================================================
-- PHASE 5: Create compliance audit view
-- ============================================================================

CREATE OR REPLACE VIEW v_doctrine_compliance_summary AS
SELECT
  DATE_TRUNC('day', created_at) as violation_date,
  violation_type,
  actor_role,
  COUNT(*) as violation_count,
  COUNT(DISTINCT sd_id) as sds_affected,
  COUNT(DISTINCT prd_id) as prds_affected
FROM doctrine_constraint_violations
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 4 DESC;

COMMENT ON VIEW v_doctrine_compliance_summary IS
'Daily summary of Doctrine of Constraint violations.
Used for compliance reporting and identifying systematic bypasses.';

-- View: Recent violations for dashboard
CREATE OR REPLACE VIEW v_recent_doctrine_violations AS
SELECT
  id,
  violation_type,
  attempted_table,
  attempted_operation,
  actor_role,
  sd_id,
  prd_id,
  error_message,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600 as hours_ago
FROM doctrine_constraint_violations
ORDER BY created_at DESC
LIMIT 100;

COMMENT ON VIEW v_recent_doctrine_violations IS
'Recent Doctrine of Constraint violations for monitoring dashboard.';

-- ============================================================================
-- PHASE 6: Verification
-- ============================================================================

DO $$
DECLARE
  trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO trigger_count
  FROM information_schema.triggers
  WHERE trigger_name LIKE 'trg_doctrine_%';

  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║           LAW 1: DOCTRINE OF CONSTRAINT ENFORCEMENT                  ║';
  RAISE NOTICE '║                    DATABASE-LEVEL ENFORCEMENT                        ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'THE LAW:';
  RAISE NOTICE '  "EXEC roles must be explicitly forbidden from strategic re-interpretation.';
  RAISE NOTICE '   They execute; they do not think. Intelligence without authority is a bug."';
  RAISE NOTICE '';
  RAISE NOTICE 'ENFORCEMENT STATUS:';
  RAISE NOTICE '  Triggers installed: %', trigger_count;
  RAISE NOTICE '';
  RAISE NOTICE 'EXEC AGENTS ARE NOW DATABASE-FORBIDDEN FROM:';
  RAISE NOTICE '  [X] Creating Strategic Directives (strategic_directives_v2)';
  RAISE NOTICE '  [X] Modifying PRD scope (product_requirements_v2)';
  RAISE NOTICE '  [X] Recording Chairman Decisions (chairman_decisions)';
  RAISE NOTICE '  [X] Modifying LEO Protocols (leo_protocols, leo_protocol_sections)';
  RAISE NOTICE '  [X] Logging governance events (system_events)';
  RAISE NOTICE '';
  RAISE NOTICE 'VIOLATION AUDIT:';
  RAISE NOTICE '  All violations logged to: doctrine_constraint_violations';
  RAISE NOTICE '  Dashboard view: v_recent_doctrine_violations';
  RAISE NOTICE '  Compliance summary: v_doctrine_compliance_summary';
  RAISE NOTICE '';
  RAISE NOTICE 'This constraint exists at the SCHEMA LAYER.';
  RAISE NOTICE 'It CANNOT be bypassed by prompt engineering.';
  RAISE NOTICE '';
END $$;

COMMIT;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- DROP TRIGGER IF EXISTS trg_doctrine_constraint_sd ON strategic_directives_v2;
-- DROP TRIGGER IF EXISTS trg_doctrine_constraint_prd ON product_requirements_v2;
-- DROP TRIGGER IF EXISTS trg_doctrine_constraint_chairman ON chairman_decisions;
-- DROP TRIGGER IF EXISTS trg_doctrine_constraint_protocols ON leo_protocols;
-- DROP TRIGGER IF EXISTS trg_doctrine_constraint_sections ON leo_protocol_sections;
-- DROP TRIGGER IF EXISTS trg_doctrine_system_events ON system_events;
-- DROP FUNCTION IF EXISTS enforce_doctrine_of_constraint();
-- DROP FUNCTION IF EXISTS enforce_doctrine_on_system_events();
-- DROP VIEW IF EXISTS v_doctrine_compliance_summary;
-- DROP VIEW IF EXISTS v_recent_doctrine_violations;
-- DROP TABLE IF EXISTS doctrine_constraint_violations;
-- ============================================================================
