-- Migration: Add PCVP_EMERGENCY_BYPASS to enforce_handoff_system allowlist
-- Discovered during: Pareto reframe session (2026-04-09), attempting to mark
--   SD-NARRATIVE-KNOWLEDGE-TO-ENFORCED-ORCH-001-@ as completed.
--
-- Root cause:
--   The PCVP bypass path in enforce_handoff_on_phase_transition
--   (database/migrations/20260329_pcvp_phase1_close_bypass_holes.sql:18-139)
--   inserts an audit row into sd_phase_handoffs with:
--       created_by = 'PCVP_EMERGENCY_BYPASS'
--   But enforce_handoff_system() did not list this value in its v_allowed_creators
--   array, causing the insert to be rejected with HANDOFF_BYPASS_BLOCKED. This
--   made the leo.bypass_completion_check session variable effectively unusable
--   for any orchestrator child completion that required an audit-only transition.
--
-- Fix:
--   Add 'PCVP_EMERGENCY_BYPASS' to the allowlist so the PCVP audit row insert
--   succeeds. The bypass still requires the caller to set
--   leo.bypass_completion_check = 'true' in the same transaction, so human
--   intent is still asserted — this only closes the allowlist gap.

CREATE OR REPLACE FUNCTION public.enforce_handoff_system()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_allowed_creators TEXT[] := ARRAY[
        'UNIFIED-HANDOFF-SYSTEM',
        'SYSTEM_MIGRATION',          -- For data migrations
        'ADMIN_OVERRIDE',            -- Emergency override (requires human action)
        'ORCHESTRATOR_AUTO_COMPLETE', -- For orchestrator SD completion (SD-LEO-GEN-RENAME-COLUMNS-SELF-001-E fix)
        'PCVP_EMERGENCY_BYPASS'      -- For leo.bypass_completion_check path (20260329_pcvp_phase1_close_bypass_holes.sql)
    ];
BEGIN
    -- Log the attempt (always, regardless of outcome)
    INSERT INTO handoff_audit_log (
        attempted_by,
        sd_id,
        handoff_type,
        from_phase,
        to_phase,
        blocked,
        block_reason,
        request_metadata
    ) VALUES (
        COALESCE(NEW.created_by, 'NULL'),
        NEW.sd_id,
        NEW.handoff_type,
        NEW.from_phase,
        NEW.to_phase,
        NOT (COALESCE(NEW.created_by, '') = ANY(v_allowed_creators)),
        CASE
            WHEN COALESCE(NEW.created_by, '') = ANY(v_allowed_creators) THEN NULL
            ELSE format('Invalid created_by: %s. Must use handoff.js script.', COALESCE(NEW.created_by, 'NULL'))
        END,
        jsonb_build_object(
            'trigger_time', NOW(),
            'status', NEW.status,
            'validation_score', NEW.validation_score
        )
    );

    -- Check if creator is allowed
    IF COALESCE(NEW.created_by, '') = ANY(v_allowed_creators) THEN
        -- Allowed - proceed with insert
        RETURN NEW;
    END IF;

    -- Not allowed - raise exception with helpful message
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

-- Verification query (run after migration):
-- SELECT 'PCVP_EMERGENCY_BYPASS' = ANY(
--     (SELECT string_to_array(
--         substring(pg_get_functiondef(oid) from 'ARRAY\[([^\]]+)\]'),
--         ','
--     )) FROM pg_proc WHERE proname = 'enforce_handoff_system'
-- ) AS bypass_allowed;
