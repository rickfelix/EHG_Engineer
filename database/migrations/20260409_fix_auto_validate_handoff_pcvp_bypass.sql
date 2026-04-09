-- =====================================================================
-- Migration: Add PCVP emergency bypass to auto_validate_handoff()
-- Date: 2026-04-09
-- Author: database-agent (Option 1 per smoke test findings)
-- =====================================================================
--
-- CONTEXT
-- -------
-- PR #2872 (merged) added 'PCVP_EMERGENCY_BYPASS' to the allowlist inside
-- enforce_handoff_system() so that the audit row inserted by
-- enforce_handoff_on_phase_transition()'s bypass path could be written.
-- That migration was:
--   database/migrations/20260409_fix_pcvp_emergency_bypass_allowlist.sql
--
-- However, a smoke test on a draft orchestrator child SD
-- (2026-04-09) revealed a second gate on the same INSERT that PR #2872 did
-- not cover: the BEFORE-INSERT trigger validate_handoff_trigger ->
-- auto_validate_handoff() runs on sd_phase_handoffs and hard-requires all
-- 7 mandatory handoff elements (executive_summary, completeness_report,
-- deliverables_manifest, key_decisions, known_issues, resource_utilization,
-- action_items) whenever NEW.status = 'accepted'.
--
-- The bypass INSERT in enforce_handoff_on_phase_transition() only populates
-- executive_summary -- by design, because the whole point of the bypass is
-- that no real handoff was performed. That caused elements 2-7 to fail and
-- the whole transaction to roll back, leaving the SD stuck.
--
-- FIX
-- ---
-- Add an early-return block at the top of auto_validate_handoff() that
-- consults the same session GUC used by the upstream trigger:
--     leo.bypass_completion_check = 'true'
-- If the GUC is set, skip 7-element validation and RETURN NEW.
--
-- This mirrors the pattern already in enforce_is_working_on_for_handoffs(),
-- including the defensive BEGIN/EXCEPTION wrapper so the function works
-- correctly when the GUC doesn't exist at all (the normal case).
--
-- SECURITY / TRACEABILITY
-- -----------------------
-- The GUC is a per-transaction, privileged opt-in. Anyone who set
-- leo.bypass_completion_check = 'true' has already declared emergency
-- intent upstream at enforce_handoff_on_phase_transition(). Validating the
-- minimal audit row they cannot populate is pure friction. Traceability is
-- fully preserved:
--   - enforce_handoff_system() still logs every attempt to handoff_audit_log
--   - The audit row still lands in sd_phase_handoffs with
--     handoff_type='BYPASS-COMPLETION' and created_by='PCVP_EMERGENCY_BYPASS'
--   - The governance_audit_trigger on strategic_directives_v2 still fires
--
-- PRESERVATION GUARANTEE
-- ----------------------
-- The body below contains the verbatim existing 7-element validation
-- logic. Only the early-return block at the top is new.
--
-- PAIRED WITH
-- -----------
-- - database/migrations/20260329_pcvp_phase1_close_bypass_holes.sql
--     (creates the leo.bypass_completion_check GUC contract)
-- - database/migrations/20260409_fix_pcvp_emergency_bypass_allowlist.sql
--     (PR #2872: allowlists PCVP_EMERGENCY_BYPASS in enforce_handoff_system)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.auto_validate_handoff()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  missing_elements TEXT[] := ARRAY[]::TEXT[];
  v_bypass TEXT;
BEGIN
  -- ===================================================================
  -- PCVP emergency bypass (added 2026-04-09)
  -- ===================================================================
  -- When leo.bypass_completion_check = 'true', skip 7-element validation.
  -- This is the downstream companion to the bypass path inside
  -- enforce_handoff_on_phase_transition(), which INSERTs a minimal audit
  -- row (executive_summary only) to record that a bypass occurred. Without
  -- this short-circuit, that INSERT is rejected here for missing elements
  -- 2-7, which rolls back the whole transaction and defeats the bypass.
  --
  -- Defensive BEGIN/EXCEPTION mirrors enforce_is_working_on_for_handoffs()
  -- so the function still works when the GUC doesn't exist.
  BEGIN
    v_bypass := current_setting('leo.bypass_completion_check', true);
    IF v_bypass = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Setting doesn't exist, continue with full validation
  END;

  -- ===================================================================
  -- Standard 7-element validation (unchanged)
  -- ===================================================================
  -- Only validate when status is 'accepted'
  IF NEW.status = 'accepted' THEN

    -- 1. Executive Summary (>50 chars)
    IF NEW.executive_summary IS NULL OR length(NEW.executive_summary) < 50 THEN
      missing_elements := array_append(missing_elements, '1. Executive Summary (need >50 chars)');
    END IF;

    -- 2. Completeness Report (not null, not empty JSONB)
    IF NEW.completeness_report IS NULL OR NEW.completeness_report::text = '{}' THEN
      missing_elements := array_append(missing_elements, '2. Completeness Report');
    END IF;

    -- 3. Deliverables Manifest (not null, not empty)
    IF NEW.deliverables_manifest IS NULL OR
       NEW.deliverables_manifest::text = '{}' OR
       NEW.deliverables_manifest::text = '[]' THEN
      missing_elements := array_append(missing_elements, '3. Deliverables Manifest');
    END IF;

    -- 4. Key Decisions (not null, not empty)
    IF NEW.key_decisions IS NULL OR
       NEW.key_decisions::text = '{}' OR
       NEW.key_decisions::text = '[]' THEN
      missing_elements := array_append(missing_elements, '4. Key Decisions & Rationale');
    END IF;

    -- 5. Known Issues (not null, not empty)
    IF NEW.known_issues IS NULL OR
       NEW.known_issues::text = '{}' OR
       NEW.known_issues::text = '[]' THEN
      missing_elements := array_append(missing_elements, '5. Known Issues & Risks');
    END IF;

    -- 6. Resource Utilization (not null, not empty JSONB)
    IF NEW.resource_utilization IS NULL OR NEW.resource_utilization::text = '{}' THEN
      missing_elements := array_append(missing_elements, '6. Resource Utilization');
    END IF;

    -- 7. Action Items (not null, not empty)
    IF NEW.action_items IS NULL OR
       NEW.action_items::text = '{}' OR
       NEW.action_items::text = '[]' THEN
      missing_elements := array_append(missing_elements, '7. Action Items for Receiver');
    END IF;

    -- If any elements are missing, raise exception
    IF array_length(missing_elements, 1) > 0 THEN
      RAISE EXCEPTION 'Cannot accept handoff: Missing required elements: %',
        array_to_string(missing_elements, ', ');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.auto_validate_handoff() IS
  'Validates that accepted handoffs contain all 7 mandatory LEO elements. '
  'Respects leo.bypass_completion_check session GUC for PCVP emergency bypass '
  '(see 20260409_fix_auto_validate_handoff_pcvp_bypass.sql and the paired '
  'bypass path in enforce_handoff_on_phase_transition).';

-- Rollback:
--   Restore the prior definition (without the GUC check) from the version
--   captured in .leo-validation/auto_validate_handoff.current.sql at the
--   time this migration was authored, or from git history prior to
--   2026-04-09.
