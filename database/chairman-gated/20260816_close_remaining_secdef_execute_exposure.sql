-- Close the remaining SECURITY DEFINER EXECUTE exposure: 16 functions (live-verified residual,
-- corrected from an original 42-function scan).
-- SD: SD-LEO-INFRA-CLOSE-REMAINING-SECURITY-001
-- Date: 2026-08-16
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- FR-4 (ALTER DEFAULT PRIVILEGES recurrence-prevention) DESCOPED to a follow-up migration —
-- EXEC-TO-PLAN review found the ADP statement does not reliably suppress anon EXECUTE on newly
-- created functions: a cross-transaction outcome check (a real probe function created in a
-- SEPARATE, post-COMMIT statement — not the same-transaction visibility question raised and ruled
-- out earlier) directly measured anon_exec=true on a function created after this migration's own
-- ADP REVOKE had committed. That is a genuine, unresolved defect in the ADP mechanism/statement
-- itself (or an environment-specific Postgres/Supabase interaction this session's tooling can't
-- diagnose further — no local Postgres available for empirical iteration), not a test-harness
-- artifact, and not something safe to ship inside a one-shot, non-re-enterable chairman-ceremony
-- transaction: a broken self-test here would abort Buckets A and B (proven correct, see below)
-- along with it every time the chairman applies. Two independent recurrence controls remain live
-- regardless of this descope: the FR-6 secdef-execute-revoke-lint (blocking CI, requires an
-- explicit PUBLIC-naming REVOKE alongside every new SECURITY DEFINER function) and
-- scripts/audit-rpc-execute-grants.mjs's completeness gate (measures the live catalog directly,
-- covering the lint's stated blind spot — a function created outside any migration file).
--
-- CHAIRMAN-GATED. Per the SD family convention this file is a DELIVERABLE, not an applied
-- change. It is inert until the approver header below is filled with the approving bare
-- email (must match git user.email — see scripts/lib/migration-guards.js APPROVED_BY_RE)
-- and applied via `node scripts/apply-migration.js --prod-deploy`.
--
-- @approved-by:
--   ^ INTENTIONALLY BLANK. checkApproverFactor() fails closed on a missing header, so this
--     migration cannot be applied by accident. Do NOT fill this in on the SD's behalf.
--     scripts/lib/migration-tier-classifier.mjs:44 (FORBIDDEN_TOPLEVEL) additionally classifies
--     every REVOKE/GRANT/ALTER DEFAULT PRIVILEGES statement below as Tier-2, so this migration
--     cannot auto-apply from database/migrations/ regardless of file placement — placement here
--     is for co-location with the paired rollback and acceptance-artifact files.
--
-- ============================================================================
-- MEASURED PRE-STATE (live catalog via exec_sql RPC, service-role REST — the Postgres pooler
-- credential is broken in this environment, signaled as a harness-bug, session 642532a6,
-- 2026-08-15/16 — not read from a migration file):
--
--   Bucket A (6, REVOKE FROM PUBLIC, anon, authenticated -> GRANT TO service_role):
--     fn_enforce_stage_advancement_artifact_gate()            anon=T auth=T public=T
--     fn_quick_fixes_validate_target_application()             anon=T auth=T public=T
--     fn_stage_artifact_precondition(uuid,integer)              anon=T auth=T public=T
--     fn_user_has_company_access(uuid)                          anon=T auth=T public=T
--     fn_verify_and_consume_stepup_token(uuid,uuid)             anon=T auth=T public=T
--     log_sd_mutation_audit()                                   anon=T auth=T public=T
--
--   Bucket B (10, REVOKE FROM PUBLIC, anon -> GRANT TO service_role, authenticated
--             (authenticated explicitly RE-GRANTED, never merely "left alone")):
--     approve_chairman_decision(uuid,text,text,approval_type_enum,uuid)  anon=T auth=T public=T
--     check_feedback_duplicate(uuid,text)                                anon=T auth=T public=F
--     claim_sd(text,text,text,boolean,integer)                           anon=T auth=T public=T
--     fn_is_service_role()                                               anon=T auth=T public=T
--     fn_list_chairman_webauthn_credentials()                            anon=T auth=T public=T
--     fn_user_has_venture_access(uuid)                                   anon=T auth=T public=T
--     fn_write_kill_audit_trail(uuid,integer,text,uuid,text,uuid)        anon=T auth=T public=T
--     get_gate_decision_status(uuid,integer)                             anon=T auth=T public=F
--     reject_chairman_decision(uuid,text,text,uuid)                      anon=T auth=T public=T
--     upsert_operator_cash_burn(numeric,numeric,numeric,numeric)         anon=T auth=T public=T
--
--   Bucket C (11, REVOKE NOTHING — untouched, verified byte-identical below): see the bucket
--     manifest at scripts/audit-rpc-execute-grants-buckets.json for the full list + reasons.
-- ============================================================================
--
-- READ BEFORE EDITING — this migration corrects a multi-round finding history (LEAD C1-C9,
-- PLAN DESIGN/DATABASE/STORIES, PLAN-TO-EXEC TESTING). Two bucket placements were CHANGED from
-- the SD's original scan, both live-verified during PLAN:
--
--   (1) fn_write_kill_audit_trail moved Bucket A -> B. It has a SECURITY INVOKER caller
--       (fn_chairman_decide, prosecdef=false) whose body PERFORMs fn_write_kill_audit_trail —
--       under invoker semantics the inner call runs AS THE CALLING ROLE, so revoking
--       authenticated would have broken fn_chairman_decide. The original "called only by SECDEF
--       fn, so it never needs authenticated" premise was false for this one function.
--
--   (2) is_chairman_role moved Bucket B -> C. It's referenced by a roles={public} policy on
--       archetype_benchmarks_admin (RLS enabled, anon holds table-level SELECT). roles={public}
--       includes anon, so the SD's own Bucket-C exclusion rule ("referenced by an anon/PUBLIC-
--       facing policy") applies — revoking anon here would have broken that policy.
--
-- Two functions (fn_quick_fixes_validate_target_application, fn_verify_and_consume_stepup_token)
-- have NO committed CREATE FUNCTION anywhere in this repo; their signatures below are confirmed
-- live (pg_get_function_identity_arguments), not derived from source.
--
-- CRITICAL: every REVOKE below names PUBLIC explicitly. anon/authenticated INHERIT PUBLIC's
-- grant — a REVOKE naming only anon/authenticated is a NO-OP for any function that also carries
-- a PUBLIC grant (14 of these 16 functions do, confirmed live). This is the single most
-- important correction this migration makes versus the SD's original description.
--
-- CRITICAL: PostgreSQL's proacl text form never contains the literal string "PUBLIC" — an empty
-- grantee renders as `=X/postgres`. All verify-block comparisons below use
-- has_function_privilege() directly, never a text match.
--
-- CRITICAL: all ACL drift comparisons use IS DISTINCT FROM, never the bare <> operator — <>
-- returns NULL (not TRUE) when either operand is NULL, so a naive comparison silently never
-- fires when a proacl read is NULL (a real state: SetDefaultACL deletes a pg_default_acl row
-- entirely when it equals acldefault(), which would otherwise defeat this exact drift check).
--
-- ON THE (REMOVED) ALTER DEFAULT PRIVILEGES STATEMENT — see the FR-4 descope note at the top of
-- this file. pg_default_acl for (postgres, public, functions) already carries ZERO PUBLIC items
-- today (measured); the open question was whether an ADP REVOKE ... FROM anon reliably suppresses
-- anon EXECUTE on NEW functions, and a direct cross-transaction outcome measurement found it does
-- not, reliably, in this environment — deferred to a follow-up migration for further diagnosis.
--
-- ============================================================================

BEGIN;

-- Capture a fresh pre-transaction baseline into a temp table so the Bucket-C untouched-check and
-- the rollback-authoring step both read the SAME measured state, not two separately-timed reads.
CREATE TEMP TABLE _pre_migration_baseline AS
SELECT p.oid,
       'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS full_sig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
       has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = ANY(ARRAY[
    'fn_enforce_stage_advancement_artifact_gate','fn_quick_fixes_validate_target_application',
    'fn_stage_artifact_precondition','fn_user_has_company_access','fn_verify_and_consume_stepup_token',
    'log_sd_mutation_audit','approve_chairman_decision','check_feedback_duplicate','claim_sd',
    'fn_is_service_role','fn_list_chairman_webauthn_credentials','fn_user_has_venture_access',
    'fn_write_kill_audit_trail','get_gate_decision_status','reject_chairman_decision',
    'upsert_operator_cash_burn','check_feedback_rate_limit','fn_advance_pipeline_stage',
    'fn_is_chairman','fn_relay_insert_sms_candidate','is_leo_admin','lhe_pending_migration_applied',
    'record_venture_error','set_session_working_context','venture_exists_and_active',
    'is_chairman_role','fn_anon_ingress_prior_hour_count'
  ]);

-- --------------------------------------------------------------------------
-- BUCKET A (6): REVOKE FROM PUBLIC, anon, authenticated; GRANT TO service_role only.
-- --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_enforce_stage_advancement_artifact_gate()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_quick_fixes_validate_target_application()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_stage_artifact_precondition(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_user_has_company_access(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_verify_and_consume_stepup_token(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_sd_mutation_audit()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fn_enforce_stage_advancement_artifact_gate() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_quick_fixes_validate_target_application() TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_stage_artifact_precondition(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_user_has_company_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_verify_and_consume_stepup_token(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.log_sd_mutation_audit() TO service_role;

-- --------------------------------------------------------------------------
-- BUCKET B (10): REVOKE FROM PUBLIC, anon; explicitly RE-GRANT to authenticated (never merely
-- "leave it alone" — REVOKE ... FROM PUBLIC does not touch a separate authenticated grant, but
-- stating it explicitly makes the intent verifiable in the diff, not inferred).
-- --------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.approve_chairman_decision(uuid, text, text, approval_type_enum, uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_feedback_duplicate(uuid, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_sd(text, text, text, boolean, integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_is_service_role()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_list_chairman_webauthn_credentials()
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_user_has_venture_access(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_write_kill_audit_trail(uuid, integer, text, uuid, text, uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_gate_decision_status(uuid, integer)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_chairman_decision(uuid, text, text, uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_operator_cash_burn(numeric, numeric, numeric, numeric)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_chairman_decision(uuid, text, text, approval_type_enum, uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.check_feedback_duplicate(uuid, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sd(text, text, text, boolean, integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_is_service_role() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_list_chairman_webauthn_credentials() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_user_has_venture_access(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_write_kill_audit_trail(uuid, integer, text, uuid, text, uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.get_gate_decision_status(uuid, integer) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.reject_chairman_decision(uuid, text, text, uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_operator_cash_burn(numeric, numeric, numeric, numeric) TO service_role, authenticated;

-- --------------------------------------------------------------------------
-- RECURRENCE PREVENTION (ALTER DEFAULT PRIVILEGES): DESCOPED to a follow-up migration — see the
-- FR-4 descope note at the top of this file. A direct cross-transaction outcome measurement found
-- the ADP REVOKE does not reliably suppress anon EXECUTE on newly created functions in this
-- environment; shipping an unresolved self-test inside this one-shot chairman-ceremony transaction
-- would risk aborting Buckets A/B (proven correct below) along with it. Two independent recurrence
-- controls remain live: the FR-6 secdef-execute-revoke-lint and the audit-rpc-execute-grants
-- completeness gate.
-- --------------------------------------------------------------------------

-- --------------------------------------------------------------------------
-- VERIFY BLOCK: Bucket A/B reached their required state; Bucket C is byte-identical to the
-- captured pre-migration baseline. Aborts the whole transaction on any drift.
-- --------------------------------------------------------------------------
DO $verify$
DECLARE
  r RECORD;
  violations text[] := ARRAY[]::text[];
BEGIN
  -- Bucket A: anon/auth/public all false.
  FOR r IN
    SELECT p.oid, 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS a,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS u,
           has_function_privilege('public', p.oid, 'EXECUTE') AS pu
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'fn_enforce_stage_advancement_artifact_gate','fn_quick_fixes_validate_target_application',
      'fn_stage_artifact_precondition','fn_user_has_company_access','fn_verify_and_consume_stepup_token',
      'log_sd_mutation_audit'])
  LOOP
    IF r.a OR r.u OR r.pu THEN
      violations := violations || (r.sig || ': Bucket A anon=' || r.a::text || ' auth=' || r.u::text || ' public=' || r.pu::text);
    END IF;
  END LOOP;

  -- Bucket B: anon/public false, authenticated true.
  FOR r IN
    SELECT p.oid, 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS a,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS u,
           has_function_privilege('public', p.oid, 'EXECUTE') AS pu
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'approve_chairman_decision','check_feedback_duplicate','claim_sd','fn_is_service_role',
      'fn_list_chairman_webauthn_credentials','fn_user_has_venture_access','fn_write_kill_audit_trail',
      'get_gate_decision_status','reject_chairman_decision','upsert_operator_cash_burn'])
  LOOP
    IF r.a OR r.pu OR NOT r.u THEN
      violations := violations || (r.sig || ': Bucket B anon=' || r.a::text || ' auth=' || r.u::text || ' public=' || r.pu::text);
    END IF;
  END LOOP;

  -- Bucket C: byte-identical to the pre-migration baseline (IS DISTINCT FROM, never <>, so a
  -- NULL-vs-NULL or NULL-vs-value drift can never be silently missed).
  FOR r IN
    SELECT b.full_sig AS sig, b.anon_exec AS old_a, b.auth_exec AS old_u, b.public_exec AS old_pu,
           has_function_privilege('anon', b.oid, 'EXECUTE') AS new_a,
           has_function_privilege('authenticated', b.oid, 'EXECUTE') AS new_u,
           has_function_privilege('public', b.oid, 'EXECUTE') AS new_pu
    FROM _pre_migration_baseline b
    WHERE b.full_sig LIKE ANY(ARRAY[
      'public.check_feedback_rate_limit(%', 'public.fn_advance_pipeline_stage(%',
      'public.fn_is_chairman(%', 'public.fn_relay_insert_sms_candidate(%',
      'public.is_leo_admin(%', 'public.lhe_pending_migration_applied(%',
      'public.record_venture_error(%', 'public.set_session_working_context(%',
      'public.venture_exists_and_active(%', 'public.is_chairman_role(%',
      'public.fn_anon_ingress_prior_hour_count(%'])
  LOOP
    IF r.old_a IS DISTINCT FROM r.new_a OR r.old_u IS DISTINCT FROM r.new_u OR r.old_pu IS DISTINCT FROM r.new_pu THEN
      violations := violations || (r.sig || ': BUCKET C DRIFT — before anon=' || r.old_a::text || ' auth=' || r.old_u::text || ' public=' || r.old_pu::text
        || ' / after anon=' || r.new_a::text || ' auth=' || r.new_u::text || ' public=' || r.new_pu::text);
    END IF;
  END LOOP;

  IF array_length(violations, 1) > 0 THEN
    RAISE EXCEPTION 'VERIFY_BLOCK_FAILED: % violation(s): %', array_length(violations, 1), array_to_string(violations, ' | ');
  END IF;
END;
$verify$;

DROP TABLE _pre_migration_baseline;

COMMIT;

-- ============================================================================
-- ROLLBACK: see 20260816_close_remaining_secdef_execute_exposure_rollback.sql. That file
-- restores the exact pre-apply ACL from a baseline that MUST be re-captured immediately before
-- this migration is applied (not reused from the PLAN/EXEC-phase measurements above, since
-- sibling migrations may land first and shift the true state).
-- ============================================================================
