-- SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001 -- Remedy B (the flagged alternative; Remedy A,
-- completing the RPC cutover + key provisioning, is the coordinator-designated PRIMARY remedy --
-- see database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql, which this file
-- deliberately does NOT touch, and this SD's own decision-package documentation).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- AWAITING CHAIRMAN REVIEW -- no @approved-by stamp exists for this file yet, deliberately, per the
-- convention established by database/chairman-gated/20260812_venture_ingest_key_binding.sql and
-- every sibling file in this directory. This file is prepared to decision-ready per coordinator
-- directives ee1428c3 / 1a579946 / 6d709e3b; it is NOT a recommendation to apply it over Remedy A.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THIS IS NOT A NEUTRAL RESTORE. IT REVERTS PART OF A ~1-DAY-OLD CHAIRMAN-RATIFIED DECISION.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql (SD-LEO-FIX-CLOSE-ANON-
-- VENTURE-001) deliberately dropped venture_user_insert_feedback so that EVERY direct-insert caller
-- would be forced onto the ownership-bound RPC (fn_submit_venture_user_feedback), closing an
-- existence-only (not ownership) venture_id spoofing vector. This file re-opens a DIRECT anon/
-- authenticated INSERT path. It does NOT undo the RPC (fn_submit_venture_user_feedback and its
-- grants are left fully intact -- both mechanisms would coexist if this is applied), but it DOES
-- restore the exact class of exposure that migration closed, narrowed only by the predicate below.
-- The chairman brief must present this explicitly as "revert this specific protection, yes/no" --
-- not as a generic bug fix. Its own header (line 41-47) already documents the residual gap this
-- file would reopen: an anon caller can still attribute a user_%-type row to any real, active
-- venture_id it can guess or discover (existence-only check, not ownership) -- unchanged by this
-- file either way, present under the RPC path too, tracked separately (advisory 9d3ddfce).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY TO anon, authenticated (NOT anon-only, unlike the policy this replaces)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The ORIGINAL venture_user_insert_feedback (database/migrations/20260401_venture_user_feedback_
-- channel.sql, re-created verbatim as TO anon in database/chairman-gated/20260815_..._DOWN.sql) was
-- anon-only. Re-applying that exact scope would NOT fix the live incident this SD investigates:
-- ehg/src/components/quality/FeedbackWidget.tsx gates on `if (!user) return null;` and its Supabase
-- client therefore runs its insert as the `authenticated` role, never `anon` (independently
-- confirmed live by two sub-agents this session -- security-feedback-insert's catalog read and
-- explore-feedback-insert's live pg_policies query both found zero permissive INSERT policy
-- reaches authenticated either). Scoping this new policy TO anon, authenticated is a DELIBERATE,
-- documented widening beyond the historical shape, made because the SD's own originating incident
-- (FeedbackWidget.tsx) cannot be fixed by an anon-only restore. This widening is exactly why the
-- role-scope pin below (on anon_feedback_ingress_bounds) is load-bearing, not optional -- see next
-- section.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE BOUNDING POLICY HAS ALREADY DRIFTED -- THIS FILE MUST NOT RELY ON ITS CURRENT ACCIDENTAL SCOPE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- anon_feedback_ingress_bounds (RESTRICTIVE) is LIVE as TO PUBLIC (polroles={0}), not TO anon as its
-- originating migration (database/migrations/20260802_bound_anon_feedback_ingress.sql) specifies --
-- database/chairman-gated/20260804_ingress_bound_definer_basis.sql's DROP+CREATE silently omitted
-- the TO clause and defaulted to PUBLIC (finding: security-feedback-insert sub-agent, this SD).
-- TO PUBLIC happens to already cover `authenticated`, which is WHY this file's TO anon,authenticated
-- widening is bounded by severity/category/rate TODAY -- but only by accident. If anon_feedback_
-- ingress_bounds's role scope is ever "corrected" back to TO anon (a plausible, superficially-
-- reasonable future edit by someone who has not read this file), this new permissive policy would
-- become COMPLETELY UNBOUNDED for authenticated callers -- full chairman-decision-queue forgery
-- (severity critical/high, category=chairman_decision_deferred) for any signed-up user. Step 2 below
-- re-asserts anon_feedback_ingress_bounds's TO PUBLIC scope EXPLICITLY, in this same transaction, so
-- this file's safety argument does not depend on an unrelated policy's scope never drifting again
-- silently. If a future chairman decision deliberately narrows anon_feedback_ingress_bounds to
-- TO anon only, this policy's own TO clause must be revisited in the SAME change -- flagged here so
-- that dependency is not rediscovered by an outage the way this SD's own root cause was.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY feedback_type LIKE 'user_%' IS NON-NEGOTIABLE (regression test dependency, not house style)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- tests/integration/venture-error-aggregation.db.test.js TS-5 (line 126-144) asserts that an anon
-- raw INSERT with feedback_type='venture_error' (forging occurrence_count/error_hash to bypass the
-- record_venture_error RPC's storm-suppression) is REJECTED. This policy's feedback_type LIKE
-- 'user_%' predicate excludes 'venture_error' rows by construction (byte-identical to the
-- historical shape), so TS-5 continues to pass under this policy exactly as it does today (today it
-- passes because ALL anon inserts are refused; post-apply it must still pass because THIS SPECIFIC
-- shape is refused, not because inserts are refused wholesale). Narrowing this predicate is not a
-- style choice available to a future editor without re-verifying TS-5 explicitly.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS DOES NOT CLOSE (explicitly out of scope, do not read this file as addressing any of these)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--   Existence-only (not ownership) venture_id validation -- unchanged, same gap as the RPC path,
--     tracked separately (advisory 9d3ddfce), not reopened or closed by this file either way.
--   record_venture_error()'s SECURITY DEFINER anon+authenticated EXECUTE, unconstrained by ANY RLS
--     policy including this one and anon_feedback_ingress_bounds -- pre-existing, live, unfixed
--     (gap G1 in database/migrations/20260802_bound_anon_feedback_ingress.sql), not this file's job.
--   The 3 per-caller non-RLS schema bugs this SD's own census found (FeedbackWidget.tsx /
--     ErrorCaptureProvider.tsx insert a non-existent `created_by` column; apexniche-ai's client omits
--     the NOT-NULL `type` field) -- fixing this RLS gap does NOT make those callers work end-to-end
--     on its own; see this SD's FR-6 / QF-20260808-552 for the code-side fixes.
--   venture_ingest_keys provisioning -- irrelevant to this file specifically (Remedy A's concern),
--     included here only so a reader comparing both remedies has the full picture in one place.
--
-- Rollback: the paired _DOWN.sql file drops this policy and reverts anon_feedback_ingress_bounds's
-- TO clause to whatever it re-asserts here, in one pass.

BEGIN;

-- Bounded wait for the ACCESS EXCLUSIVE lock CREATE POLICY / ALTER POLICY need on public.feedback --
-- same rationale and precedent as both sibling migrations in this directory (this table's own
-- 2026-08-12 incident record is exactly an unbounded lock wait on this table turning into a
-- live-writer-blocking queue). Fail fast; let the chairman re-run at a quieter moment.
SET LOCAL lock_timeout = '5s';

-- Deterministic deparse of pg_get_expr() in the verify block below, matching the sibling files'
-- own SEC finding (a schema-qualified function name only appears when NOT visible under
-- search_path, which would make a byte-exact WITH CHECK compare false-FAIL under a hardened
-- search_path at chairman-apply time).
SET LOCAL search_path = public, pg_catalog;

-- ============================================================
-- 1. Restore a scoped permissive INSERT policy. Idempotent (re-running must not fail on an
--    existing policy of this name).
-- ============================================================
DROP POLICY IF EXISTS venture_user_insert_feedback_authenticated_restore ON public.feedback;

CREATE POLICY venture_user_insert_feedback_authenticated_restore
    ON public.feedback
    AS PERMISSIVE
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (
        feedback_type LIKE 'user_%'
        AND venture_id IS NOT NULL
        AND venture_exists_and_active(venture_id)
        AND (NOT check_feedback_rate_limit(venture_id))
    );

COMMENT ON POLICY venture_user_insert_feedback_authenticated_restore ON public.feedback IS
'SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001 Remedy B (staged alternative to completing the RPC
cutover). Reverts part of SD-LEO-FIX-CLOSE-ANON-VENTURE-001''s protection -- see this file''s own
header before applying. Scoped TO anon,authenticated (widened beyond the historical anon-only
shape) because FeedbackWidget.tsx runs as authenticated. Bounded by feedback_type LIKE ''user_%''
(excludes venture_error rows, preserving tests/integration/venture-error-aggregation.db.test.js
TS-5) and by anon_feedback_ingress_bounds (RESTRICTIVE, re-pinned to TO PUBLIC in the same
migration, step 2 below) for severity/category/rate.';

-- ============================================================
-- 2. Re-pin anon_feedback_ingress_bounds's role scope EXPLICITLY, so this policy's safety argument
--    does not depend on that policy's CURRENT scope (TO PUBLIC) being an accident nobody documented
--    versus a deliberate, asserted invariant. ALTER POLICY ... TO is idempotent -- safe to re-run
--    even if the scope was never touched.
-- ============================================================
ALTER POLICY anon_feedback_ingress_bounds ON public.feedback TO PUBLIC;

-- ============================================================
-- 3. Self-verify: mirrors the sibling files' multi-assertion doctrine (a one-sided check that only
--    confirms the new policy exists cannot distinguish a correct, scoped restore from an
--    accidental over-broad one).
-- ============================================================
DO $verify$
DECLARE
  v_new_policy_with_check TEXT;
  v_bounds_permissive     BOOLEAN;
  v_bounds_cmd            TEXT;
  v_bounds_to_public      BOOLEAN;
BEGIN
  -- (a) The new policy must exist, PERMISSIVE, FOR INSERT, and scoped to EXACTLY {anon, authenticated}
  --     -- not TO PUBLIC (which would also cover service_role's own dedicated policy redundantly and
  --     widen intent beyond what this file documents), and not narrower than authenticated (which
  --     would silently fail to fix FeedbackWidget.tsx, the SD's own originating incident).
  IF (
    SELECT count(*)
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'feedback' AND c.relnamespace = 'public'::regnamespace
      AND p.polname = 'venture_user_insert_feedback_authenticated_restore'
      AND p.polpermissive
      AND p.polcmd = 'a'
      AND NOT (0 = ANY(p.polroles))  -- must NOT be TO PUBLIC
      AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY(p.polroles) AND r.rolname = 'anon')
      AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY(p.polroles) AND r.rolname = 'authenticated')
      AND (SELECT count(*) FROM unnest(p.polroles)) = 2  -- exactly these two, nothing extra
  ) <> 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_user_insert_feedback_authenticated_restore is missing, not PERMISSIVE/INSERT, or not scoped to exactly {anon, authenticated}';
  END IF;

  -- (b) The WITH CHECK text must be exactly the documented predicate -- catches a typo or a
  --     silently-narrowed/widened clause. INSERT-only policies store their check in polwithcheck,
  --     not polqual (which is NULL for a pure INSERT policy).
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_new_policy_with_check
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = 'feedback' AND c.relnamespace = 'public'::regnamespace
    AND p.polname = 'venture_user_insert_feedback_authenticated_restore';

  IF v_new_policy_with_check IS DISTINCT FROM
     '(((feedback_type)::text ~~ ''user_%''::text) AND (venture_id IS NOT NULL) AND venture_exists_and_active(venture_id) AND (NOT check_feedback_rate_limit(venture_id)))' THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_user_insert_feedback_authenticated_restore WITH CHECK text changed unexpectedly: %', v_new_policy_with_check;
  END IF;

  -- (c) anon_feedback_ingress_bounds must remain RESTRICTIVE, apply to INSERT, and be scoped
  --     TO PUBLIC (the pin from step 2 must have taken effect -- this is the load-bearing check
  --     this whole file's safety argument depends on).
  SELECT p.polpermissive, p.polcmd, (0 = ANY(p.polroles))
    INTO v_bounds_permissive, v_bounds_cmd, v_bounds_to_public
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = 'feedback' AND c.relnamespace = 'public'::regnamespace
    AND p.polname = 'anon_feedback_ingress_bounds';

  IF v_bounds_permissive IS DISTINCT FROM false OR v_bounds_cmd IS DISTINCT FROM 'a' OR v_bounds_to_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon_feedback_ingress_bounds is missing, no longer RESTRICTIVE, no longer applies to INSERT, or is not scoped TO PUBLIC (permissive=%, cmd=%, to_public=%) -- this new policy would be UNBOUNDED for authenticated callers if this assertion fails', v_bounds_permissive, v_bounds_cmd, v_bounds_to_public;
  END IF;

  -- (d) RLS must remain enabled on public.feedback (defense in depth, independent of the
  --     policy-level checks above -- matches the sibling files' own doctrine).
  IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.feedback'::regclass) IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: public.feedback does not have RLS enabled';
  END IF;
END
$verify$;

-- PostgREST caches the schema; without this, the policy change is correct in pg_catalog but not
-- yet reflected for real anon/authenticated clients until PostgREST's own reload cycle catches up.
NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- POST-APPLY VERIFICATION (the acceptance is this probe, never the apply exit code -- matching
-- both sibling files' doctrine). See the paired _acceptance.mjs for the executable version.
-- ============================================================
-- Three-leg method (per database/chairman-gated/20260802_bound_anon_feedback_ingress.sql's own
-- doctrine): (1) observe the client-reported status, (2) service-role readback establishes whether
-- the row actually exists, (3) re-attempt the IDENTICAL write WITHOUT RETURNING (a bare insert),
-- read back again -- a probe built only from the RETURNING variant proves only that RETURNING
-- refused, never that the write did.
--
--   CONTROL (anon)          feedback_type='user_bug', legal venture_id, severity=medium -> LANDS
--   CONTROL (authenticated) same, as an authenticated session                            -> LANDS
--   AC-1  feedback_type='venture_error' (TS-5 shape)                                     -> ABSENT
--   AC-2  severity='critical' or 'high'                                                  -> ABSENT
--   AC-3  category='chairman_decision_deferred', severity='low'                          -> ABSENT
--   AC-4  venture_id NULL or a nonexistent/inactive venture                              -> ABSENT
--   AC-5  exceed the per-venture rate limit                                              -> ABSENT
--   AC-6  a service-role insert of category='chairman_decision_deferred' still SUCCEEDS
--         (service_role carries rolbypassrls=true, unaffected by any of the above)
--
-- ============================================================
-- ROLLBACK (manual, if needed -- see the paired _DOWN.sql for the executable version):
-- ============================================================
-- BEGIN;
-- DROP POLICY IF EXISTS venture_user_insert_feedback_authenticated_restore ON public.feedback;
-- -- anon_feedback_ingress_bounds's TO PUBLIC scope is left as-is (rolling back the new policy does
-- -- not require reverting that pin -- TO PUBLIC was already the live state before this file ran).
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
