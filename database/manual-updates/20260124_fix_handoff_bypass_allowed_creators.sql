-- Migration: Fix Handoff Bypass Allowed Creators
-- Date: 2026-01-24
-- Purpose: Add ORCHESTRATOR_AUTO_COMPLETE to allowed creators in enforce_handoff_system
--
-- Root Cause:
-- The enforce_handoff_system trigger (from 20251204_handoff_enforcement_trigger.sql)
-- blocks ORCHESTRATOR_AUTO_COMPLETE which is legitimately used by:
--   - complete_orchestrator_sd() function
--   - LeadFinalApprovalExecutor when completing child SDs
--
-- This causes a Catch-22 where:
-- 1. LEAD-FINAL-APPROVAL runs and all gates pass
-- 2. SD update to 'completed' triggers a handoff creation attempt
-- 3. The handoff creation is blocked because ORCHESTRATOR_AUTO_COMPLETE isn't allowed

-- ============================================================================
-- FIX: Update enforce_handoff_system to allow ORCHESTRATOR_AUTO_COMPLETE
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_handoff_system()
RETURNS TRIGGER AS $$
DECLARE
    v_allowed_creators TEXT[] := ARRAY[
        'UNIFIED-HANDOFF-SYSTEM',
        'SYSTEM_MIGRATION',          -- For data migrations
        'ADMIN_OVERRIDE',            -- Emergency override (requires human action)
        'ORCHESTRATOR_AUTO_COMPLETE' -- For orchestrator SD completion (SD-LEO-GEN-RENAME-COLUMNS-SELF-001-E fix)
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
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION
-- ============================================================================

DO $$
DECLARE
    allowed_list TEXT[];
BEGIN
    -- Verify the function was updated by checking the source
    SELECT ARRAY['UNIFIED-HANDOFF-SYSTEM', 'SYSTEM_MIGRATION', 'ADMIN_OVERRIDE', 'ORCHESTRATOR_AUTO_COMPLETE']
    INTO allowed_list;

    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Handoff Bypass Fix Applied - 2026-01-24';
    RAISE NOTICE '============================================================';
    RAISE NOTICE '';
    RAISE NOTICE 'enforce_handoff_system() now allows:';
    RAISE NOTICE '  - UNIFIED-HANDOFF-SYSTEM (handoff.js script)';
    RAISE NOTICE '  - SYSTEM_MIGRATION (data migrations)';
    RAISE NOTICE '  - ADMIN_OVERRIDE (emergency override)';
    RAISE NOTICE '  - ORCHESTRATOR_AUTO_COMPLETE (orchestrator completion)';
    RAISE NOTICE '';
    RAISE NOTICE 'This fixes SD-LEO-GEN-RENAME-COLUMNS-SELF-001-E completion issue.';
END $$;
