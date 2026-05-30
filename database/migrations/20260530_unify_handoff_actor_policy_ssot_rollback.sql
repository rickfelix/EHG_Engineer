-- =============================================================================
-- ROLLBACK for 20260530_unify_handoff_actor_policy_ssot.sql
-- SD-LEO-INFRA-ORCHESTRATOR-LAST-CHILD-001
-- @approved-by: rickfelix@example.com
--
-- Restores enforce_handoff_system + enforce_is_working_on_for_handoffs to their
-- pre-migration bodies (hardcoded divergent lists), recreates the dead
-- check_handoff_bypass(), and drops the SSOT handoff_actor_policy().
-- NOTE: rolling back re-introduces D1/D2/D3 (orchestrator last-child completion
-- will break again). Use only to revert a faulty deploy.
-- =============================================================================

BEGIN;

-- Restore enforce_handoff_system (original hardcoded allowlist)
CREATE OR REPLACE FUNCTION public.enforce_handoff_system()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_allowed_creators TEXT[] := ARRAY[
        'UNIFIED-HANDOFF-SYSTEM',
        'SYSTEM_MIGRATION',
        'ADMIN_OVERRIDE',
        'ORCHESTRATOR_AUTO_COMPLETE',
        'PCVP_EMERGENCY_BYPASS'
    ];
BEGIN
    INSERT INTO handoff_audit_log (
        attempted_by, sd_id, handoff_type, from_phase, to_phase,
        blocked, block_reason, request_metadata
    ) VALUES (
        COALESCE(NEW.created_by, 'NULL'),
        NEW.sd_id, NEW.handoff_type, NEW.from_phase, NEW.to_phase,
        NOT (COALESCE(NEW.created_by, '') = ANY(v_allowed_creators)),
        CASE
            WHEN COALESCE(NEW.created_by, '') = ANY(v_allowed_creators) THEN NULL
            ELSE format('Invalid created_by: %s. Must use handoff.js script.', COALESCE(NEW.created_by, 'NULL'))
        END,
        jsonb_build_object('trigger_time', NOW(), 'status', NEW.status, 'validation_score', NEW.validation_score)
    );

    IF COALESCE(NEW.created_by, '') = ANY(v_allowed_creators) THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'HANDOFF_BYPASS_BLOCKED: Direct handoff creation is not allowed.

To create a handoff, run:
  node scripts/handoff.js execute <TYPE> <SD-ID>

Where TYPE is one of:
  - LEAD-TO-PLAN
  - PLAN-TO-EXEC
  - EXEC-TO-PLAN
  - PLAN-TO-LEAD

Example:
  node scripts/handoff.js execute PLAN-TO-EXEC SD-EXAMPLE-001

Attempted created_by: %', COALESCE(NEW.created_by, 'NULL');
END;
$function$;

-- Restore enforce_is_working_on_for_handoffs (original hardcoded bypass list)
CREATE OR REPLACE FUNCTION public.enforce_is_working_on_for_handoffs()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_is_working_on BOOLEAN;
  v_sd_title TEXT;
  v_bypass_value TEXT;
BEGIN
  BEGIN
    v_bypass_value := current_setting('leo.bypass_working_on_check', true);
    IF v_bypass_value = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF NEW.created_by IN (
    'SYSTEM_MIGRATION',
    'ADMIN_OVERRIDE',
    'ORCHESTRATOR_GUARDIAN',
    'bypass_script',
    'SYSTEM_AUTO_COMPLETE'
  ) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('rejected', 'error') THEN
    RETURN NEW;
  END IF;

  SELECT is_working_on, title
  INTO v_is_working_on, v_sd_title
  FROM strategic_directives_v2
  WHERE id = NEW.sd_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF v_is_working_on IS NOT TRUE THEN
    RAISE EXCEPTION
      E'LEO Protocol Violation: Cannot create handoff for SD without active session claim\n\n'
      'SD: % (%)\n'
      'Handoff: %\n'
      'is_working_on: %\n\n'
      'ACTION REQUIRED:\n'
      '1. Claim the SD first: npm run sd:start %\n'
      '2. Or use created_by=''ADMIN_OVERRIDE'' for administrative operations\n'
      '3. Or SET LOCAL leo.bypass_working_on_check = ''true'' in a transaction',
      NEW.sd_id, COALESCE(v_sd_title, 'Unknown'),
      NEW.handoff_type,
      COALESCE(v_is_working_on::text, 'NULL'),
      NEW.sd_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Recreate the (dead) check_handoff_bypass()
CREATE OR REPLACE FUNCTION public.check_handoff_bypass()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.created_by = 'ORCHESTRATOR_AUTO_COMPLETE' THEN
    RETURN NEW;
  END IF;
  IF NEW.created_by IN ('HANDOFF_SYSTEM', 'LEO_EXECUTOR', 'UNIFIED_HANDOFF_SYSTEM') THEN
    RETURN NEW;
  END IF;
  IF NEW.created_by IS NULL OR NEW.created_by = 'LEO_AGENT' THEN
    RAISE EXCEPTION 'HANDOFF_BYPASS_BLOCKED: Direct handoff creation is not allowed.
To create a handoff, run:
  node scripts/handoff.js execute <TYPE> <SD-ID>
Where TYPE is one of:
  - LEAD-TO-PLAN
  - PLAN-TO-EXEC
  - EXEC-TO-PLAN
  - PLAN-TO-LEAD
Example:
  node scripts/handoff.js execute PLAN-TO-EXEC SD-EXAMPLE-001
Attempted created_by: %', COALESCE(NEW.created_by, 'NULL');
  END IF;
  RETURN NEW;
END;
$function$;

DROP FUNCTION IF EXISTS public.handoff_actor_policy(text);

COMMIT;
