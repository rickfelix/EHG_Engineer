-- Close the anon-EXECUTE surface on the role-flag SECURITY DEFINER functions.
-- SD: SD-LEO-INFRA-CLOSE-ANON-EXECUTE-001
-- Date: 2026-09-05
--
-- SEVEN functions across four migration files carry no REVOKE/GRANT text at all, so PostgreSQL's
-- default PUBLIC EXECUTE grant applies:
--   set_solomon_flag/clear_solomon_flag       (database/migrations/20260630_role_handoff_atomic_solomon_flag.sql)
--   set_coordinator_flag/clear_coordinator_flag (database/migrations/20260614_role_handoff_atomic_coordinator_flag.sql)
--   set_adam_flag/clear_adam_flag             (database/migrations/20260615_role_handoff_atomic_adam_flag.sql)
--   set_session_awaiting_approval             (database/migrations/20260901_session_awaiting_approval_rpc.sql)
--
-- MEASURED PRE-STATE (LEAD-phase, live anon-key RPC probes + pg_proc queries, 2026-09-05):
--   set_solomon_flag/clear_solomon_flag:       LIVE, already safe (401/42501) -- ACL was set
--                                               out-of-band, outside migration text.
--   set_coordinator_flag/clear_coordinator_flag: LIVE, already safe (401/42501) -- same as solomon.
--   set_adam_flag/clear_adam_flag:              NOT LIVE (404) -- never applied, despite already
--                                               carrying a filled @approved-by stamp (verbal SMS,
--                                               2026-07-27, covering all three role-flag migrations
--                                               as a set). THIS is the genuinely urgent risk: a
--                                               future apply of that migration, unmodified, would
--                                               land anon-callable exactly as measured for the
--                                               other two before their out-of-band fix.
--   set_session_awaiting_approval:              LIVE. scripts/audit-rpc-execute-grants.mjs
--                                               (AUDIT_GRANTS_MODE=buckets) flags it as an
--                                               undeclared anon/PUBLIC-executable SECURITY DEFINER
--                                               function -- an internal worker-hook RPC with no
--                                               legitimate anon/authenticated caller.
--
-- DO NOT edit database/migrations/20260615_role_handoff_atomic_adam_flag.sql in place: it already
-- carries a filled @approved-by stamp for its CURRENT content (chairman approval given verbally,
-- covering the three-migration set as originally written) -- editing it would silently apply an
-- unreviewed DDL change under a stale approval. This migration instead REVOKEs/GRANTs on all
-- SEVEN functions from outside, guarded on existence via to_regprocedure() so it applies cleanly
-- whether or not the adam-flag pair has landed yet, and is safely re-runnable regardless of apply
-- order relative to that migration.
--
-- All seven are internal fleet-coordination RPCs (worker/session bookkeeping) with no legitimate
-- anon or authenticated caller -- REVOKE FROM PUBLIC, anon, authenticated; GRANT TO service_role
-- only (no re-grant branch, unlike the fdbk_error_capture-class functions this SD's PRD
-- deliberately does NOT touch here).
--
-- DATA-SAFETY: privilege-only. Modifies no rows, drops no functions. Reversible via the paired
-- GRANT-back statements in the _DOWN companion.
--
-- CHAIRMAN-GATED. Per the SD family convention this file is a DELIVERABLE, not an applied change.
--
-- @approved-by:
--   ^ INTENTIONALLY BLANK. Do NOT fill this in on the SD's behalf. Apply via
--     `node scripts/apply-migration.js --prod-deploy` once approved.
--     scripts/lib/migration-tier-classifier.mjs classifies REVOKE/GRANT statements as Tier-2, so
--     this migration cannot auto-apply from database/migrations/ regardless of placement.

BEGIN;

DO $revoke_grant$
DECLARE
  targets text[][] := ARRAY[
    ARRAY['public.set_solomon_flag(text)', 'set_solomon_flag(text)'],
    ARRAY['public.clear_solomon_flag(text)', 'clear_solomon_flag(text)'],
    ARRAY['public.set_coordinator_flag(text)', 'set_coordinator_flag(text)'],
    ARRAY['public.clear_coordinator_flag(text)', 'clear_coordinator_flag(text)'],
    ARRAY['public.set_adam_flag(text)', 'set_adam_flag(text)'],
    ARRAY['public.clear_adam_flag(text)', 'clear_adam_flag(text)'],
    ARRAY['public.set_session_awaiting_approval(text, boolean)', 'set_session_awaiting_approval(text, boolean)']
  ];
  t text[];
BEGIN
  FOREACH t SLICE 1 IN ARRAY targets
  LOOP
    IF to_regprocedure(t[1]) IS NOT NULL THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', t[1]);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', t[1]);
      RAISE NOTICE 'closed anon-EXECUTE: %', t[2];
    ELSE
      RAISE NOTICE 'skipped (not yet live): %', t[2];
    END IF;
  END LOOP;
END;
$revoke_grant$;

-- Verify: every function that EXISTS must measure anon/authenticated/public EXECUTE = false.
-- A function absent from pg_proc (the not-yet-applied adam pair, possibly) simply produces no
-- row and is not checked here -- this block only ever asserts about what actually exists.
DO $verify$
DECLARE
  r RECORD;
  violations text[] := ARRAY[]::text[];
BEGIN
  FOR r IN
    SELECT p.oid, 'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS sig,
           has_function_privilege('anon', p.oid, 'EXECUTE') AS a,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') AS u,
           has_function_privilege('public', p.oid, 'EXECUTE') AS pu
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = ANY(ARRAY[
      'set_solomon_flag', 'clear_solomon_flag', 'set_coordinator_flag', 'clear_coordinator_flag',
      'set_adam_flag', 'clear_adam_flag', 'set_session_awaiting_approval'])
  LOOP
    IF r.a OR r.u OR r.pu THEN
      violations := violations || (r.sig || ': anon=' || r.a::text || ' auth=' || r.u::text || ' public=' || r.pu::text);
    END IF;
  END LOOP;

  IF array_length(violations, 1) > 0 THEN
    RAISE EXCEPTION 'VERIFY_BLOCK_FAILED: % violation(s): %', array_length(violations, 1), array_to_string(violations, ' | ');
  END IF;
END;
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK: see 20260905_close_role_flag_secdef_execute_exposure_DOWN.sql. Re-grants PUBLIC,
-- anon, authenticated EXECUTE on every function that exists at rollback time -- the same
-- existence-guard pattern, in reverse.
-- ============================================================================
