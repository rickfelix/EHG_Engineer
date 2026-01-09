-- ============================================================================
-- Migration: Fix 6 - Correct Type Mismatch in Governance Bypass Functions
-- ============================================================================
-- Issue: Fix 5 defined sd_id as UUID but strategic_directives_v2.id is VARCHAR(50)
-- Fix: Use TEXT type for sd_id to match actual table column type
-- Date: 2026-01-01
-- Author: LEO Protocol Process Improvement
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Drop existing table and functions if they exist with wrong types
-- ============================================================================

DROP TABLE IF EXISTS sd_governance_bypass_audit CASCADE;
DROP FUNCTION IF EXISTS is_valid_automation_bypass(JSONB, VARCHAR);
DROP FUNCTION IF EXISTS log_governance_bypass(UUID, VARCHAR, JSONB, JSONB, JSONB);
DROP FUNCTION IF EXISTS log_governance_bypass(TEXT, VARCHAR, JSONB, JSONB, JSONB);

-- ============================================================================
-- STEP 2: Create audit table with correct TEXT type for sd_id
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_governance_bypass_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id TEXT NOT NULL,  -- TEXT to match strategic_directives_v2.id (VARCHAR)
  trigger_name VARCHAR(100) NOT NULL,
  actor_role VARCHAR(50) NOT NULL,
  bypass_reason TEXT,
  automation_context JSONB,
  bypassed_at TIMESTAMPTZ DEFAULT NOW(),
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX IF NOT EXISTS idx_governance_bypass_sd ON sd_governance_bypass_audit(sd_id);
CREATE INDEX IF NOT EXISTS idx_governance_bypass_trigger ON sd_governance_bypass_audit(trigger_name);
CREATE INDEX IF NOT EXISTS idx_governance_bypass_actor ON sd_governance_bypass_audit(actor_role);

ALTER TABLE sd_governance_bypass_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bypass_audit_service_role ON sd_governance_bypass_audit;
CREATE POLICY bypass_audit_service_role ON sd_governance_bypass_audit
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS bypass_audit_read ON sd_governance_bypass_audit;
CREATE POLICY bypass_audit_read ON sd_governance_bypass_audit
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE sd_governance_bypass_audit IS
'Audit trail for governance trigger bypasses.
All bypass requests are logged for security review.
Fixed: sd_id is TEXT to match strategic_directives_v2.id (VARCHAR).';

-- ============================================================================
-- STEP 3: Helper function to validate automation bypass
-- ============================================================================

CREATE OR REPLACE FUNCTION is_valid_automation_bypass(
  p_governance_metadata JSONB,
  p_trigger_name VARCHAR
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_context JSONB;
  v_bypass BOOLEAN;
  v_actor_role VARCHAR;
  v_valid_roles VARCHAR[] := ARRAY['LEO_ORCHESTRATOR', 'SYSTEM_MIGRATION', 'ADMIN'];
BEGIN
  -- Get automation_context
  v_context := p_governance_metadata->'automation_context';

  IF v_context IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check bypass flag
  v_bypass := COALESCE((v_context->>'bypass_governance')::boolean, false);
  IF NOT v_bypass THEN
    RETURN FALSE;
  END IF;

  -- Validate actor_role
  v_actor_role := v_context->>'actor_role';
  IF v_actor_role IS NULL OR NOT (v_actor_role = ANY(v_valid_roles)) THEN
    RAISE WARNING 'FIX 6: Invalid actor_role for bypass: % (valid: LEO_ORCHESTRATOR, SYSTEM_MIGRATION, ADMIN)',
      COALESCE(v_actor_role, 'NULL');
    RETURN FALSE;
  END IF;

  -- Valid bypass request
  RAISE NOTICE 'FIX 6: Governance bypass approved for % (actor: %, trigger: %)',
    v_context->>'bypass_reason', v_actor_role, p_trigger_name;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION is_valid_automation_bypass(JSONB, VARCHAR) IS
'Validates automation bypass requests for governance triggers.
Returns TRUE if bypass is valid (has bypass_governance=true and valid actor_role).';

-- ============================================================================
-- STEP 4: Helper function to log bypass (with TEXT type for sd_id)
-- ============================================================================

CREATE OR REPLACE FUNCTION log_governance_bypass(
  p_sd_id TEXT,  -- TEXT to match strategic_directives_v2.id
  p_trigger_name VARCHAR,
  p_governance_metadata JSONB,
  p_old_values JSONB DEFAULT NULL,
  p_new_values JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_context JSONB;
BEGIN
  v_context := p_governance_metadata->'automation_context';

  INSERT INTO sd_governance_bypass_audit (
    sd_id,
    trigger_name,
    actor_role,
    bypass_reason,
    automation_context,
    old_values,
    new_values
  ) VALUES (
    p_sd_id,
    p_trigger_name,
    COALESCE(v_context->>'actor_role', 'UNKNOWN'),
    v_context->>'bypass_reason',
    v_context,
    p_old_values,
    p_new_values
  );
END;
$$;

COMMENT ON FUNCTION log_governance_bypass(TEXT, VARCHAR, JSONB, JSONB, JSONB) IS
'Logs governance bypass events to audit table.
Fixed: p_sd_id is TEXT to match strategic_directives_v2.id (VARCHAR).';

-- ============================================================================
-- STEP 5: Update orphan protection trigger with bypass
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_orphan_protection()
RETURNS TRIGGER AS $$
DECLARE
  orphan_check JSONB;
  orphaned_deliverables INTEGER;
  orphaned_stories INTEGER;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS DISTINCT FROM NEW.sd_type THEN

    -- Check for automation bypass
    IF is_valid_automation_bypass(NEW.governance_metadata, 'orphan_protection') THEN
      -- Log bypass and allow
      PERFORM log_governance_bypass(
        NEW.id::TEXT,
        'orphan_protection',
        NEW.governance_metadata,
        jsonb_build_object('sd_type', OLD.sd_type),
        jsonb_build_object('sd_type', NEW.sd_type)
      );
      RETURN NEW;
    END IF;

    -- Check for orphaned work (if function exists)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'check_orphaned_work') THEN
      orphan_check := check_orphaned_work(NEW.id, OLD.sd_type, NEW.sd_type);

      IF (orphan_check->>'has_orphans')::BOOLEAN THEN
        orphaned_deliverables := COALESCE(jsonb_array_length(orphan_check->'deliverables'), 0);
        orphaned_stories := COALESCE(jsonb_array_length(orphan_check->'user_stories'), 0);

        IF orphaned_deliverables > 0 THEN
          RAISE EXCEPTION E'SD_TYPE_CHANGE_ORPHAN_BLOCKED: Type change from "%" to "%" would orphan % completed deliverable(s).\nUse automation bypass: governance_metadata.automation_context.bypass_governance=true',
            OLD.sd_type, NEW.sd_type, orphaned_deliverables;
        END IF;

        IF orphaned_stories > 0 THEN
          RAISE EXCEPTION E'SD_TYPE_CHANGE_ORPHAN_BLOCKED: Type change from "%" to "%" would orphan % validated user stor(y/ies).\nUse automation bypass: governance_metadata.automation_context.bypass_governance=true',
            OLD.sd_type, NEW.sd_type, orphaned_stories;
        END IF;
      END IF;

      NEW.governance_metadata := jsonb_set(
        COALESCE(NEW.governance_metadata, '{}'::jsonb),
        '{orphan_check}',
        orphan_check
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Update type change risk trigger with bypass
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_sd_type_change_risk()
RETURNS TRIGGER AS $$
DECLARE
  risk_result JSONB;
  risk_level TEXT;
  risk_score INTEGER;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS DISTINCT FROM NEW.sd_type THEN

    -- Check for automation bypass
    IF is_valid_automation_bypass(NEW.governance_metadata, 'type_change_risk') THEN
      PERFORM log_governance_bypass(
        NEW.id::TEXT,
        'type_change_risk',
        NEW.governance_metadata,
        jsonb_build_object('sd_type', OLD.sd_type),
        jsonb_build_object('sd_type', NEW.sd_type)
      );
      RETURN NEW;
    END IF;

    -- Get risk assessment (if function exists)
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'assess_sd_type_change_risk') THEN
      risk_result := assess_sd_type_change_risk(NEW.id, OLD.sd_type, NEW.sd_type);
      risk_level := risk_result->>'risk_level';
      risk_score := (risk_result->>'total_score')::integer;

      NEW.governance_metadata := jsonb_set(
        COALESCE(NEW.governance_metadata, '{}'::jsonb),
        '{risk_assessment}',
        risk_result
      );

      IF risk_level = 'HIGH' THEN
        IF NOT COALESCE((NEW.governance_metadata->'risk_acknowledged')::boolean, false) THEN
          RAISE EXCEPTION E'SD_TYPE_CHANGE_HIGH_RISK: Type change from "%" to "%" has HIGH risk (score: %).\nSet governance_metadata.risk_acknowledged = true or use automation bypass.',
            OLD.sd_type, NEW.sd_type, risk_score;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 7: Update type change timing trigger with bypass
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_type_change_timing()
RETURNS TRIGGER AS $$
DECLARE
  sd_phase TEXT;
  sd_progress INTEGER;
  has_handoffs BOOLEAN;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS DISTINCT FROM NEW.sd_type THEN

    -- Check for automation bypass
    IF is_valid_automation_bypass(NEW.governance_metadata, 'type_change_timing') THEN
      PERFORM log_governance_bypass(
        NEW.id::TEXT,
        'type_change_timing',
        NEW.governance_metadata,
        jsonb_build_object('sd_type', OLD.sd_type, 'phase', OLD.current_phase),
        jsonb_build_object('sd_type', NEW.sd_type)
      );
      RETURN NEW;
    END IF;

    sd_phase := COALESCE(OLD.current_phase, 'LEAD');
    sd_progress := COALESCE(OLD.progress, 0);

    -- Check for existing handoffs
    SELECT EXISTS (
      SELECT 1 FROM sd_phase_handoffs WHERE sd_id = NEW.id::varchar
    ) INTO has_handoffs;

    -- Block type changes after PLAN phase has handoffs
    IF has_handoffs AND sd_phase NOT IN ('LEAD', 'DRAFT') THEN
      RAISE EXCEPTION E'SD_TYPE_CHANGE_TIMING_BLOCKED: Cannot change type from "%" to "%" after handoffs created.\nUse automation bypass if intentional.',
        OLD.sd_type, NEW.sd_type;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 8: Update type change explanation trigger with bypass
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_sd_type_change_explanation()
RETURNS TRIGGER AS $$
DECLARE
  has_explanation BOOLEAN;
BEGIN
  -- Only check if sd_type is actually changing
  IF OLD.sd_type IS DISTINCT FROM NEW.sd_type THEN

    -- Check for automation bypass
    IF is_valid_automation_bypass(NEW.governance_metadata, 'type_change_explanation') THEN
      PERFORM log_governance_bypass(
        NEW.id::TEXT,
        'type_change_explanation',
        NEW.governance_metadata,
        jsonb_build_object('sd_type', OLD.sd_type),
        jsonb_build_object('sd_type', NEW.sd_type)
      );
      RETURN NEW;
    END IF;

    -- Check for explanation in governance_metadata
    has_explanation := (
      NEW.governance_metadata->>'type_change_reason' IS NOT NULL
      AND LENGTH(NEW.governance_metadata->>'type_change_reason') > 10
    );

    IF NOT has_explanation THEN
      RAISE EXCEPTION E'SD_TYPE_CHANGE_EXPLANATION_REQUIRED: Type change from "%" to "%" requires explanation.\n\nAdd governance_metadata.type_change_reason with explanation (min 10 chars).\nOr use automation bypass with governance_metadata.automation_context',
        OLD.sd_type, NEW.sd_type;
    END IF;

    -- Store the change record
    NEW.governance_metadata := jsonb_set(
      COALESCE(NEW.governance_metadata, '{}'::jsonb),
      '{type_change_history}',
      COALESCE(NEW.governance_metadata->'type_change_history', '[]'::jsonb) ||
        jsonb_build_object(
          'from', OLD.sd_type,
          'to', NEW.sd_type,
          'reason', NEW.governance_metadata->>'type_change_reason',
          'changed_at', NOW()
        )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 9: Create view for recent bypasses
-- ============================================================================

DROP VIEW IF EXISTS v_recent_governance_bypasses;
CREATE OR REPLACE VIEW v_recent_governance_bypasses AS
SELECT
  sd_id,
  trigger_name,
  actor_role,
  bypass_reason,
  bypassed_at,
  old_values,
  new_values
FROM sd_governance_bypass_audit
ORDER BY bypassed_at DESC
LIMIT 100;

COMMENT ON VIEW v_recent_governance_bypasses IS
'Recent governance trigger bypasses for security review';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║   FIX 6: GOVERNANCE BYPASS TYPE FIX APPLIED                          ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
  RAISE NOTICE 'FIXED: sd_id now uses TEXT type to match strategic_directives_v2.id';
  RAISE NOTICE '';
  RAISE NOTICE 'BYPASS MECHANISM:';
  RAISE NOTICE '  governance_metadata.automation_context = {';
  RAISE NOTICE '    "bypass_governance": true,';
  RAISE NOTICE '    "actor_role": "LEO_ORCHESTRATOR",';
  RAISE NOTICE '    "bypass_reason": "Creating child SDs..."';
  RAISE NOTICE '  }';
  RAISE NOTICE '';
END $$;

COMMIT;
