-- Rollback for 20260816_close_remaining_secdef_execute_exposure.sql.
-- SD: SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001
--
-- CRITICAL: the grant states below reflect the baseline measured 2026-08-15/16 during PLAN/EXEC
-- (see the forward migration's header + .artifacts/exec-live-baseline.json). If ANY time has
-- passed between that measurement and the forward migration's actual chairman-approved apply,
-- RE-CAPTURE the baseline immediately before running this rollback — do not trust this file's
-- hardcoded values if state may have drifted (e.g. a sibling migration landed in between).
--
-- Re-capture command (read-only, safe to run any time):
--   node scripts/one-off/exec-live-baseline-close-remaining-security-001.mjs
--
-- This restores PUBLIC + anon + authenticated EXECUTE to every one of the 16 functions the
-- forward migration touched. It does NOT touch Bucket C (the forward migration never touched it
-- either), and there is no ALTER DEFAULT PRIVILEGES to revert — see the forward migration's FR-4
-- descope note: the ADP statement was removed from this migration pair entirely at EXEC-TO-PLAN
-- after a cross-transaction outcome measurement found it did not reliably suppress anon EXECUTE on
-- new functions; deferred to a follow-up migration.
--
-- @approved-by:
--   ^ INTENTIONALLY BLANK, same chairman-gate discipline as the forward migration.

BEGIN;

-- --------------------------------------------------------------------------
-- BUCKET A (6): restore PUBLIC + anon + authenticated EXECUTE (all six carried public=true
-- pre-migration per the measured baseline).
-- --------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.fn_enforce_stage_advancement_artifact_gate() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_quick_fixes_validate_target_application() TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_stage_artifact_precondition(uuid, integer) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_has_company_access(uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_verify_and_consume_stepup_token(uuid, uuid) TO PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_sd_mutation_audit() TO PUBLIC, anon, authenticated;

-- --------------------------------------------------------------------------
-- BUCKET B (10): restore PUBLIC (where measured true pre-migration) + anon. authenticated was
-- never revoked by the forward migration, so no action needed for it here.
-- --------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.approve_chairman_decision(uuid, text, text, approval_type_enum, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_feedback_duplicate(uuid, text) TO anon; -- measured public=false pre-migration
GRANT EXECUTE ON FUNCTION public.claim_sd(text, text, text, boolean, integer) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_is_service_role() TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_list_chairman_webauthn_credentials() TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_user_has_venture_access(uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_write_kill_audit_trail(uuid, integer, text, uuid, text, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_gate_decision_status(uuid, integer) TO anon; -- measured public=false pre-migration
GRANT EXECUTE ON FUNCTION public.reject_chairman_decision(uuid, text, text, uuid) TO PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_operator_cash_burn(numeric, numeric, numeric, numeric) TO PUBLIC, anon;

-- --------------------------------------------------------------------------
-- VERIFY: every function this rollback touched matches its measured pre-migration grant state
-- exactly (not just "has some grants back") — using has_function_privilege(), never a text match
-- against proacl, and IS DISTINCT FROM semantics throughout (see forward migration header for why).
-- --------------------------------------------------------------------------
DO $verify_rollback$
DECLARE
  r RECORD;
  violations text[] := ARRAY[]::text[];
  expected_public boolean;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS a,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS u,
           has_function_privilege('public', p.oid, 'EXECUTE') AS pu
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'fn_enforce_stage_advancement_artifact_gate','fn_quick_fixes_validate_target_application',
      'fn_stage_artifact_precondition','fn_user_has_company_access','fn_verify_and_consume_stepup_token',
      'log_sd_mutation_audit','approve_chairman_decision','check_feedback_duplicate','claim_sd',
      'fn_is_service_role','fn_list_chairman_webauthn_credentials','fn_user_has_venture_access',
      'fn_write_kill_audit_trail','get_gate_decision_status','reject_chairman_decision',
      'upsert_operator_cash_burn'])
  LOOP
    expected_public := (r.proname NOT IN ('check_feedback_duplicate', 'get_gate_decision_status'));
    IF NOT r.a OR NOT r.u OR (r.pu IS DISTINCT FROM expected_public) THEN
      violations := violations || (r.sig || ': ROLLBACK INCOMPLETE — anon=' || r.a::text || ' auth=' || r.u::text || ' public=' || r.pu::text || ' (expected anon=true auth=true public=' || expected_public::text || ')');
    END IF;
  END LOOP;

  IF array_length(violations, 1) > 0 THEN
    RAISE EXCEPTION 'ROLLBACK_VERIFY_FAILED: % violation(s): %', array_length(violations, 1), array_to_string(violations, ' | ');
  END IF;
END;
$verify_rollback$;

COMMIT;
