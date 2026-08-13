-- SD-FDBK-INFRA-MIGRATE-ANON-INGEST-001 — drop the dead, unbounded telegram anon-INSERT policy
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW — no @approved-by stamp exists for this file yet, deliberately, per the
-- convention established by database/chairman-gated/20260812_venture_ingest_key_binding.sql.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES AND DOES NOT CLOSE (CORRECTED TWICE — see below; this is the version that holds)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- public.feedback's telegram_bot_insert_feedback policy has WITH CHECK (source_type = 'telegram')
-- ONLY — no venture predicate, no feedback_type constraint. This file DROPs it.
--
-- SECOND CORRECTION (EXEC-phase DATABASE sub-agent finding, this session): the FIRST correction
-- (below, superseded) claimed anon_feedback_ingress_bounds would catch telegram-sourced writes
-- once this policy is dropped, and separately claimed it was PERMISSIVE and already permitted the
-- abuse this file targets. BOTH claims were wrong. MEASURED LIVE (the `permissive` column on
-- pg_policies, not assumed): anon_feedback_ingress_bounds is RESTRICTIVE, roles={public}. A
-- RESTRICTIVE policy never grants an INSERT by itself — it only narrows whatever a PERMISSIVE
-- policy already authorized (PERMISSIVE policies OR together; the RESTRICTIVE set then ANDs onto
-- that result). It was ALREADY constraining telegram_bot_insert_feedback's writes before this
-- file — measured: a telegram-tagged write with severity='critical' or
-- category='chairman_decision_deferred' was ALREADY refused pre-drop, attributed to
-- anon_feedback_ingress_bounds specifically, and telegram traffic was already capped at 50/hour by
-- that same policy's rate-limit CASE. "Zero rate-limit/content-bound protection at all" was false.
--
-- This DOES: remove the only anon-writable path on this table with NO VENTURE PREDICATE
-- WHATSOEVER. Pre-drop, any anon-key holder could write a row with an arbitrary or ABSENT
-- venture_id — no existence check, no ownership check — merely by tagging
-- source_type='telegram' (still subject to anon_feedback_ingress_bounds' content/rate bounds,
-- never subject to any venture check). Post-drop, the ONLY remaining permissive anon INSERT path
-- is venture_user_insert_feedback, whose WITH CHECK requires feedback_type LIKE 'user_%' AND
-- venture_id IS NOT NULL AND venture_exists_and_active(venture_id) AND a per-venture rate limit. A
-- bare telegram-shaped write with no venture_id is refused post-drop because NO permissive policy
-- authorizes it at all — not because it gets "routed through" the RESTRICTIVE policy, which was
-- never a fallback grant and structurally cannot become one.
--
-- This does NOT: prove true venture OWNERSHIP. venture_exists_and_active() checks only that the
-- venture_id EXISTS and is active — the same existence-only gap already present in
-- venture_user_insert_feedback today, UNCHANGED by this file (not anon_feedback_ingress_bounds —
-- see the correction above). An anon caller can still attribute a 'user_%' feedback row to any
-- real, active venture_id it can guess or discover; this file closes the "arbitrary/absent
-- venture_id, no check at all" hole, not spoofing against a real venture. That residual is tracked
-- and governed separately (routed to Adam, advisory 9d3ddfce) and is explicitly OUT OF SCOPE here.
--
-- FIRST CORRECTION (superseded by the above, kept for the record rather than deleted): originally
-- claimed this closes venture-ID spoofing outright; corrected mid-EXEC after a live pg_policies
-- read surfaced anon_feedback_ingress_bounds as a fourth policy, but misread its permissive/
-- restrictive column at the time.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY DROP POLICY, NOT REVOKE (TR-1 — testing-agent T-1, confirmed live before authoring this file)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- public.feedback has a SINGLE table-level anon-INSERT grant shared by TWO permissive anon INSERT
-- policies: telegram_bot_insert_feedback (dropped here) and venture_user_insert_feedback (left
-- untouched — still needs that grant). A REVOKE on the grant would break venture_user_insert_
-- feedback too. DROP POLICY removes only the telegram-specific permission; PostgreSQL requires at
-- least one remaining permissive policy to authorize any given row, so nothing opens up.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SAFETY PREMISE — live traffic re-measured at EXEC time (FR-2/US-002), not inherited from LEAD
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- source_type='telegram' rows in the trailing 30 days: 0 (measured_at 2026-08-13T06:40:59.686Z,
-- pooler connection, public.feedback). Matches the LEAD-phase snapshot and the coordinator's own
-- independent spot-check during PLAN. This is a genuinely dead surface.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- SCOPE OF THIS FILE — explicitly excluded, do not read this as closing either of these (FR-5/TR-4)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--   record_venture_error's existence-only venture_id validation — owned by SD-LEO-INFRA-RECORD-
--     VENTURE-ERROR-DEFINER-POSTURE-001, untouched by this file.
--   venture_user_insert_feedback's existence-only (not ownership) venture_id check — deliberately
--     left fully open; needs its own follow-on SD (auth.uid()-to-venture-membership design, not
--     filed yet), untouched by this file. THIS is the mechanism that makes "does not prove true
--     ownership" true above — not anon_feedback_ingress_bounds (see the correction above).
--   telegram_bot_select_feedback (the sibling anon SELECT policy) — survives this migration
--     unchanged. Not a new risk this file introduces: it already coexists with venture_user_
--     insert_feedback's INSERT path today, so this narrow DROP does not change that pre-existing
--     read exposure.
--   anon_feedback_ingress_bounds — RESTRICTIVE, roles={public}, untouched by this file. Continues
--     to bound severity/category/rate for every anon INSERT that reaches it, exactly as it did
--     before this file, including for venture_user_insert_feedback's own writes (which it already
--     covered, and still does).
--
-- Rollback: recreate the exact original policy (verbatim text below, foot of file). Additive-safe
-- to reverse in one pass — no other object depends on this policy's absence.
--
-- KNOWN, OUT-OF-SCOPE TOOLING GAP (peer precedent: database/chairman-gated/20260812_venture_
-- ingest_key_binding.sql's own header documents the identical exposure for itself): this file's
-- named DO $verify$ tag means scripts/lib/supabase-connection.js's splitPostgreSQLStatements()
-- would shred it into more fragments than its real statement count if ever run with
-- --split-statements (no caller in this repo passes that flag on the default apply path). Not
-- fixed here — shared mainline tooling, out of this SD's scope, flagged rather than silently
-- inherited without mention.

BEGIN;

-- Bounded wait for the ACCESS EXCLUSIVE lock DROP POLICY needs on public.feedback — this table's
-- own 2026-08-12 incident record (this SD family) is exactly an unbounded lock wait on this same
-- table turning into a live-writer-blocking queue. Fail fast and let the chairman re-run at a
-- quieter moment rather than queue indefinitely behind this transaction.
SET LOCAL lock_timeout = '2s';

-- SECURITY sub-agent finding (EXEC review, warning): the $verify$ block's sibling WITH CHECK
-- byte-exact string compare is deparsed by pg_get_expr, which schema-qualifies a function name
-- only when it is NOT visible under the session's search_path. Pinning it here makes that deparse
-- deterministic, so the compare cannot false-FAIL at chairman-apply time under a hardened
-- search_path (e.g. search_path='') or a role whose default omits public -- a false alarm at
-- exactly the moment (chairman ceremony) when pressure to delete or weaken the check is highest.
SET LOCAL search_path = public, pg_catalog;

-- ============================================================
-- 1. Drop the dead policy with no venture predicate. Policy-specific, never a table-level REVOKE
--    (TR-1).
-- ============================================================
DROP POLICY IF EXISTS telegram_bot_insert_feedback ON public.feedback;

-- ============================================================
-- 2. Self-verify: FIVE-way, mutation-resistant (TR-2, TS-4a/TS-4b) — CORRECTED (SECURITY sub-agent
--    finding, EXEC re-review, L2): this was "three-way" until (d) relrowsecurity and (e)
--    anon_feedback_ingress_bounds were added; a header undercounting its own assertions is the
--    same "measures less than it claims" defect this whole SD exists to fix, in miniature. A
--    one-sided check (only confirming the drop happened) cannot distinguish a correct surgical
--    removal from an accidental over-broad drop or a collaterally-revoked grant.
-- ============================================================
DO $verify$
DECLARE
  v_sibling_with_check TEXT;
BEGIN
  -- (a) The target policy must be gone (TS-4a: RAISEs if the DROP above did not actually apply).
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'feedback'
        AND policyname = 'telegram_bot_insert_feedback') <> 0 THEN
    RAISE EXCEPTION 'VERIFY FAILED: telegram_bot_insert_feedback still present in pg_policies';
  END IF;

  -- (b) The table-level anon-INSERT grant must remain PRESENT — venture_user_insert_feedback still
  --     needs it. A grant that went missing here means a REVOKE happened instead of a DROP POLICY,
  --     silently breaking the sibling policy's own reachability.
  IF has_table_privilege('anon', 'public.feedback', 'INSERT') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon lost table-level INSERT privilege on public.feedback — venture_user_insert_feedback would be unreachable';
  END IF;

  -- (c) The sibling policy must survive UNCHANGED — both presence and its exact WITH CHECK text
  --     (TS-4b: RAISEs if a typo'd policy name dropped or altered the sibling instead of/in
  --     addition to the target).
  SELECT with_check INTO v_sibling_with_check
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'feedback' AND policyname = 'venture_user_insert_feedback';

  IF v_sibling_with_check IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_user_insert_feedback is missing from pg_policies';
  END IF;

  IF v_sibling_with_check IS DISTINCT FROM
     '(((feedback_type)::text ~~ ''user_%''::text) AND (venture_id IS NOT NULL) AND venture_exists_and_active(venture_id) AND (NOT check_feedback_rate_limit(venture_id)))' THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_user_insert_feedback WITH CHECK text changed unexpectedly: %', v_sibling_with_check;
  END IF;

  -- (d) RLS must remain enabled on public.feedback (DATABASE sub-agent finding, EXEC review) —
  --     defense-in-depth, independent of the policy-level checks above. This file does not touch
  --     this setting, but if it were ever disabled elsewhere, every policy this file relies on
  --     staying in force (including venture_user_insert_feedback and anon_feedback_ingress_bounds)
  --     would stop being evaluated at all, silently.
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.feedback'::regclass) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: public.feedback does not have RLS enabled';
  END IF;

  -- (e) anon_feedback_ingress_bounds must remain present, RESTRICTIVE, AND still apply to INSERT
  --     (SECURITY sub-agent finding, EXEC re-review, L1: the cmd predicate was missing — a
  --     same-named policy re-created for a different cmd or with roles/predicates stripped could
  --     satisfy a name+permissive-only check while this file's stated posture became false) — this
  --     file's own header now relies on that policy continuing to bound severity/category/rate for
  --     every anon INSERT that reaches venture_user_insert_feedback; if it were ever silently
  --     dropped, re-scoped off INSERT, or flipped to PERMISSIVE, this file's stated safety posture
  --     would be false.
  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'feedback'
        AND policyname = 'anon_feedback_ingress_bounds' AND cmd = 'INSERT' AND permissive = 'RESTRICTIVE') <> 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon_feedback_ingress_bounds is missing, no longer applies to INSERT, or is no longer RESTRICTIVE';
  END IF;
END
$verify$;

-- PostgREST caches the schema; without this, the policy removal is correct in pg_catalog but not
-- yet reflected for real anon clients until PostgREST's own reload cycle catches up.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- ROLLBACK (manual, if needed — recreates the exact original policy, verbatim, from
-- database/migrations/20260223_telegram_bot_feedback_rls.sql:45-48):
-- ============================================================
-- CREATE POLICY telegram_bot_insert_feedback ON feedback
--   FOR INSERT
--   TO anon
--   WITH CHECK (source_type = 'telegram');
-- NOTIFY pgrst, 'reload schema';
