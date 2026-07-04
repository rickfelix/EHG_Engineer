-- 20260704_pattern_closure_prevention_gate.sql
-- SD-LEO-INFRA-009-LEAF-FORMALIZE-001 (C-009 leaf 2)
-- @approved-by: codestreetlabs@gmail.com
-- @chairman-gated: CREATE OR REPLACE FUNCTION is TIER-2 (chairman-gated) per the
-- migration-tier-classifier allow-list — staged here, not auto-applied. Apply via
-- `node scripts/apply-migration.js <path> --prod-deploy` with chairman sign-off.
--
-- Adds the same PREVENTION-REQUIRED closure gate to resolve_completed_sd_patterns()
-- that lib/governance/pattern-closure.js's closeIssuePatterns() applies at the JS
-- layer (SD-completion path cannot import a JS module, so this mirrors the rule
-- directly in SQL — a single flag source, chairman_dashboard_config.metadata.
-- pattern_registry_enforce_prevention_required, read identically by both).
--
-- Enforcement is OFF by default (flag absent/false): behavior is BYTE-IDENTICAL to
-- today (all assigned patterns for the completed SD resolve, matching
-- tests/integration/sd-completion-pattern-resolve.test.js). When an operator flips
-- the flag ON, only patterns carrying a non-empty prevention_checklist resolve;
-- the rest are left status='assigned' (never blocking SD completion — the trigger
-- wrapper already has an EXCEPTION WHEN OTHERS failure-isolation contract, and this
-- gate itself never raises, it just narrows the UPDATE's WHERE clause).

CREATE OR REPLACE FUNCTION public.resolve_completed_sd_patterns(p_sd_id text, p_sd_key text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_count INTEGER := 0;
  v_enforce BOOLEAN := false;
BEGIN
  SELECT COALESCE((metadata->>'pattern_registry_enforce_prevention_required')::boolean, false)
    INTO v_enforce
    FROM chairman_dashboard_config
    WHERE config_key = 'default';
  v_enforce := COALESCE(v_enforce, false);

  WITH updated AS (
    UPDATE issue_patterns
    SET status = 'resolved',
        resolution_date = now(),
        resolution_notes = COALESCE(resolution_notes, '') ||
          CASE WHEN resolution_notes IS NOT NULL AND resolution_notes != '' THEN '; ' ELSE '' END ||
          'Auto-resolved: assigned SD ' || COALESCE(p_sd_key, p_sd_id) || ' reached completed (closure-loop)',
        updated_at = now()
    WHERE status = 'assigned'
      AND assigned_sd_id IS NOT NULL
      AND assigned_sd_id IN (p_sd_id, p_sd_key)
      AND (
        NOT v_enforce
        OR (prevention_checklist IS NOT NULL AND jsonb_array_length(prevention_checklist) > 0)
      )
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$function$;
