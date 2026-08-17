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
-- THIS IS NOT A NEUTRAL RESTORE. IT REVERTS TWO PARTS OF A ~1-DAY-OLD CHAIRMAN-RATIFIED DECISION.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql (SD-LEO-FIX-CLOSE-ANON-
-- VENTURE-001) deliberately dropped venture_user_insert_feedback so that EVERY direct-insert caller
-- would be forced onto the ownership-bound RPC (fn_submit_venture_user_feedback), closing an
-- existence-only (not ownership) venture_id spoofing vector. This file re-opens a DIRECT anon
-- INSERT path. It does NOT undo the RPC (fn_submit_venture_user_feedback and its
-- grants are left fully intact -- both mechanisms would coexist if this is applied), but it DOES
-- restore the exact class of exposure that migration closed, narrowed only by the predicate below.
--
-- REVERT #1 (the policy): restores an anon-reachable INSERT path onto public.feedback.
-- REVERT #2 (step 1b below, TESTING/SECURITY sub-agent finding, evidence 731d79a4-5498-4bd7-8628-
-- 427dbc31d3dc / 241fb047-1b4a-4795-b73b-8fa4c8ab2778): also restores anon's direct EXECUTE on
-- venture_exists_and_active(uuid) and check_feedback_rate_limit(uuid) -- 20260815 REVOKEd these as
-- its own named "MEDIUM-1" finding, an unauthenticated existence/rate-limit oracle. Without REVERT
-- #2 the policy from REVERT #1 is inert (every insert 42501s), so applying this file necessarily
-- means both -- the chairman brief must present BOTH as named reverts, not fold #2 silently into #1
-- as an implementation detail.
--
-- The chairman brief must present this explicitly as "revert these two specific protections,
-- yes/no" -- not as a generic bug fix. Its own header (line 41-47) already documents the residual
-- gap this file would reopen: an anon caller can still attribute a user_%-type row to any real,
-- active venture_id it can guess or discover (existence-only check, not ownership) -- unchanged by
-- this file either way, present under the RPC path too, tracked separately (advisory 9d3ddfce).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY TO anon ONLY -- EXEC-PHASE CORRECTION, this file originally scoped TO anon, authenticated
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The ORIGINAL venture_user_insert_feedback (database/migrations/20260401_venture_user_feedback_
-- channel.sql established it TO anon; re-created verbatim as TO anon in database/chairman-gated/
-- 20260815_..._DOWN.sql) was anon-only. Provenance correction (adversarial ship-gate review, PR
-- #7199): the specific WITH CHECK text this file restores -- venture_exists_and_active(venture_id)
-- -- is NOT 20260401's original form (an inline EXISTS subquery); it comes from
-- database/migrations/20260704f_fix_venture_user_feedback_ventures_visibility.sql, which superseded
-- 20260401's predicate before 20260815 dropped the policy. The substantive claim (this file's
-- WITH CHECK text is byte-identical to what was actually live at drop-time) is independently
-- confirmed correct -- the expected string at line 246 below matches
-- database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql:159 character-for-
-- character -- only the ancestor migration for the FORM of the predicate was cited imprecisely
-- (the anon-only ROLE SCOPE claim above is still correctly attributed to 20260401, which
-- 20260704f did not change). An earlier draft of this file widened TO anon, authenticated on the theory that
-- ehg/src/components/quality/FeedbackWidget.tsx -- which runs as `authenticated`, gated on
-- `if (!user) return null;` -- needed that scope to be admitted. Fresh EXEC-TO-PLAN TESTING and
-- SECURITY sub-agent evidence (rows 731d79a4-5498-4bd7-8628-427dbc31d3dc and
-- 241fb047-1b4a-4795-b73b-8fa4c8ab2778) independently disproved that theory by reading
-- FeedbackWidget.tsx's actual insert payload directly: it sets neither `venture_id` nor
-- `feedback_type` (confirmed at ehg/src/components/quality/FeedbackWidget.tsx:78-90), so it fails
-- this policy's WITH CHECK (`venture_id IS NOT NULL AND feedback_type LIKE 'user_%'`) at ANY role
-- scope -- widening to authenticated could not have fixed it. FeedbackWidget.tsx's own structural
-- gap (no venture_id, by design -- it is not a venture-scoped submission) is already correctly
-- identified in docs/reference/anon-write-contract.md's FR-4 design section, which proposes a
-- separate, purpose-built mechanism for exactly this caller. No OTHER identified caller needs
-- `authenticated` under this specific predicate either: apexniche-ai/src/ui/api/feedbackClient.ts:121
-- (the one caller confirmed to set both venture_id and feedback_type correctly) calls as `anon`, not
-- `authenticated`. Scope is therefore restored to the historical anon-only shape exactly -- not
-- because widening was found to be unsafe in itself, but because it had no demonstrated
-- beneficiary while carrying real, avoidable added exposure (see the grant-scope note in step 1b
-- below). If a real authenticated caller with a genuine venture_id + feedback_type is later
-- identified, widen this policy's TO clause and the step-1b grants together, in one change, with
-- that caller named -- do not restore `authenticated` speculatively.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- THE BOUNDING POLICY HAS ALREADY DRIFTED -- RE-PINNED HERE AS HYGIENE, NOT AS THIS FILE'S OWN
-- LOAD-BEARING SAFETY ARGUMENT (unlike an earlier draft, this policy is anon-only, and anon is
-- bounded by anon_feedback_ingress_bounds under EITHER its originally-specified TO anon scope or
-- its current live TO PUBLIC scope -- the re-pin below does not change what this specific policy
-- is bounded by)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- anon_feedback_ingress_bounds (RESTRICTIVE) is LIVE as TO PUBLIC (polroles={0}), not TO anon as its
-- originating migration (database/migrations/20260802_bound_anon_feedback_ingress.sql) specifies --
-- database/chairman-gated/20260804_ingress_bound_definer_basis.sql's DROP+CREATE silently omitted
-- the TO clause and defaulted to PUBLIC (finding: security-feedback-insert sub-agent, this SD). Step
-- 2 below re-asserts anon_feedback_ingress_bounds's TO PUBLIC scope EXPLICITLY, in this same
-- transaction, converting a documented accidental drift into an asserted invariant while this
-- migration is already touching this table's RLS configuration (also satisfies this SD's PRD FR-5
-- acceptance criterion "explicitly re-pins anon_feedback_ingress_bounds's TO clause"). This also
-- forecloses a future re-widening of THIS policy to include authenticated from silently inheriting
-- an unbounded gap the way an earlier draft of this very file almost did -- if `authenticated` is
-- ever added back to the policy above, re-verify this section's assumption still holds.
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
DROP POLICY IF EXISTS venture_user_insert_feedback_restore ON public.feedback;

CREATE POLICY venture_user_insert_feedback_restore
    ON public.feedback
    AS PERMISSIVE
    FOR INSERT
    TO anon
    WITH CHECK (
        feedback_type LIKE 'user_%'
        AND venture_id IS NOT NULL
        AND venture_exists_and_active(venture_id)
        AND (NOT check_feedback_rate_limit(venture_id))
    );

COMMENT ON POLICY venture_user_insert_feedback_restore ON public.feedback IS
'SD-FDBK-FIX-CRITICAL-PUBLIC-FEEDBACK-001 Remedy B (staged alternative to completing the RPC
cutover). Reverts part of SD-LEO-FIX-CLOSE-ANON-VENTURE-001''s protection -- see this file''s own
header before applying. Scoped TO anon only, byte-identical to the historical shape (an earlier
draft widened TO authenticated for FeedbackWidget.tsx; corrected during EXEC-TO-PLAN once its
payload was confirmed to lack venture_id/feedback_type, so it cannot satisfy this policy at any
role scope -- see FR-4 for its actual mechanism). Bounded by feedback_type LIKE ''user_%''
(excludes venture_error rows, preserving tests/integration/venture-error-aggregation.db.test.js
TS-5) and by anon_feedback_ingress_bounds (RESTRICTIVE, re-pinned to TO PUBLIC in the same
migration, step 2 below) for severity/category/rate.';

-- ============================================================
-- 1b. Restore the EXECUTE grants this policy's WITH CHECK requires. RLS predicates evaluate as the
--     QUERYING role (not the function owner), even for a SECURITY DEFINER function -- so anon needs
--     direct EXECUTE on both, independent of what either function's own body is allowed to do
--     internally. database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql REVOKEd
--     both (lines 359-360) specifically because, at that time, the one policy needing them
--     (venture_user_insert_feedback) was being dropped in the same transaction ("MEDIUM-1", closing
--     an orphaned unauthenticated existence/rate-limit oracle). Restoring the policy without
--     restoring these grants leaves it silently inert: the DO $verify$ block below would still
--     PASS (it only reads catalog shape) while every real INSERT attempt fails 42501 -- caught by
--     TESTING sub-agent evidence 731d79a4-5498-4bd7-8628-427dbc31d3dc (static function-privilege
--     read) and independently by SECURITY sub-agent evidence 241fb047-1b4a-4795-b73b-8fa4c8ab2778
--     (live end-to-end INSERT attempt on a temp table, actually hit 42501).
--
--     Scoped to anon ONLY, matching this migration's own policy scope above -- this re-opens the
--     SAME narrow oracle exposure MEDIUM-1 closed, at the SAME historical risk level (not a new
--     one: this exact grant existed for anon from this policy's original creation until
--     20260815 revoked it as newly-orphaned). Deliberately NOT granting to authenticated: no
--     caller identified in this SD needs it (see the header section above), and doing so would be
--     a widening beyond the historical baseline with no offsetting benefit (SECURITY finding).
--     Deliberately NOT restoring check_feedback_rate_limit's historical anon+authenticated grant
--     in full either (20260815's own _DOWN.sql grants it to both) -- that broader historical grant
--     served some other authenticated-facing caller unrelated to this policy; this migration
--     restores only what THIS policy needs, not everything 20260815 touched.
--
--     ORDER-COUPLING WARNING (SECURITY sub-agent finding, evidence 71204b61-e78f-4231-8c9e-
--     89fa6f3728bd, live-verified against 5 grant-state scenarios): this file's verify check (e)
--     below will ABORT (safely, fail-closed, no partial apply -- never fail-open) if
--     20260815_venture_user_feedback_ownership_rpc_DOWN.sql has ALREADY been applied first (that
--     DOWN grants check_feedback_rate_limit TO anon, authenticated, which check (e)'s negative
--     authenticated assertion correctly rejects). If this file is ever applied out of the order
--     this SD's own decision package assumes, the abort message will say "authenticated holds
--     EXECUTE" without explaining WHY -- read this comment if that happens; it is not a bug in
--     this file, it is this file correctly refusing to compound onto an unexpected prior state.
-- ============================================================
GRANT EXECUTE ON FUNCTION public.venture_exists_and_active(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.check_feedback_rate_limit(uuid) TO anon;

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
  -- (a) The new policy must exist, PERMISSIVE, FOR INSERT, and scoped to EXACTLY {anon} -- not TO
  --     PUBLIC (which would also cover service_role's own dedicated policy redundantly and widen
  --     intent beyond what this file documents), and NOT including authenticated (this policy is
  --     deliberately anon-only -- see the header's EXEC-phase correction; a stray authenticated
  --     grant here would silently reopen the exact widening that correction removed).
  IF (
    SELECT count(*)
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname = 'feedback' AND c.relnamespace = 'public'::regnamespace
      AND p.polname = 'venture_user_insert_feedback_restore'
      AND p.polpermissive
      AND p.polcmd = 'a'
      AND NOT (0 = ANY(p.polroles))  -- must NOT be TO PUBLIC
      AND EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY(p.polroles) AND r.rolname = 'anon')
      AND NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY(p.polroles) AND r.rolname = 'authenticated')
      AND (SELECT count(*) FROM unnest(p.polroles)) = 1  -- exactly this one role, nothing extra
  ) <> 1 THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_user_insert_feedback_restore is missing, not PERMISSIVE/INSERT, or not scoped to exactly {anon}';
  END IF;

  -- (b) The WITH CHECK text must be exactly the documented predicate -- catches a typo or a
  --     silently-narrowed/widened clause. INSERT-only policies store their check in polwithcheck,
  --     not polqual (which is NULL for a pure INSERT policy).
  SELECT pg_get_expr(polwithcheck, polrelid) INTO v_new_policy_with_check
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = 'feedback' AND c.relnamespace = 'public'::regnamespace
    AND p.polname = 'venture_user_insert_feedback_restore';

  IF v_new_policy_with_check IS DISTINCT FROM
     '(((feedback_type)::text ~~ ''user_%''::text) AND (venture_id IS NOT NULL) AND venture_exists_and_active(venture_id) AND (NOT check_feedback_rate_limit(venture_id)))' THEN
    RAISE EXCEPTION 'VERIFY FAILED: venture_user_insert_feedback_restore WITH CHECK text changed unexpectedly: %', v_new_policy_with_check;
  END IF;

  -- (e) TESTING/SECURITY sub-agent finding (evidence 731d79a4 / 241fb047): a policy-shape-only
  --     verify cannot see whether the querying role can actually EXECUTE the two functions this
  --     WITH CHECK calls -- a policy can be catalog-perfect and still 42501 on every real insert.
  --     anon must hold EXECUTE on both (step 1b).
  IF has_function_privilege('anon', 'public.venture_exists_and_active(uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon lacks EXECUTE on venture_exists_and_active -- this policy''s WITH CHECK would 42501 on every real anon insert';
  END IF;
  IF has_function_privilege('anon', 'public.check_feedback_rate_limit(uuid)', 'EXECUTE') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon lacks EXECUTE on check_feedback_rate_limit -- this policy''s WITH CHECK would 42501 on every real anon insert';
  END IF;
  -- Negative authenticated assertion, SCOPED TO venture_exists_and_active ONLY (adversarial ship-gate
  -- review, PR #7199: an earlier draft also asserted authenticated lacks EXECUTE on
  -- check_feedback_rate_limit -- but step 1b's own comment above already acknowledges that
  -- function's historical anon+authenticated grant "served some other authenticated-facing caller
  -- unrelated to this policy" and deliberately does not touch it. A migration-wide assertion that
  -- authenticated must never hold that grant would abort THIS policy's apply for a reason that has
  -- nothing to do with this policy's own safety -- self-contradicting the acknowledgment two
  -- sections above. venture_exists_and_active has no such known legitimate other caller, so only it
  -- is asserted here (this policy never grants authenticated access, so it must not gain even this
  -- narrower function-call oracle -- defense in depth, mirrors 20260815's own TR-2/TR-3
  -- negative-assertion style at lines 402-404).
  IF has_function_privilege('authenticated', 'public.venture_exists_and_active(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'VERIFY FAILED: authenticated holds EXECUTE on venture_exists_and_active -- this policy is anon-only by design, authenticated should not gain this oracle';
  END IF;

  -- (f) Adversarial ship-gate review finding, PR #7199: checks (e) above assert the FUNCTION-level
  --     EXECUTE grants this WITH CHECK depends on, but not the TABLE-level INSERT grant every RLS
  --     policy also depends on -- Postgres checks the table-level GRANT before RLS policies are even
  --     evaluated, so a revoked table-level INSERT would make this policy catalog-perfect and still
  --     42501 on every real insert, the same failure class checks (e) exist to close, just one layer
  --     up. Both sibling migrations that touch this table's anon INSERT path already assert this
  --     explicitly (database/chairman-gated/20260813_revoke_telegram_bot_insert_feedback.sql:143,
  --     database/chairman-gated/20260815_venture_user_feedback_ownership_rpc.sql:377) -- this file
  --     had omitted the equivalent check until now.
  IF has_table_privilege('anon', 'public.feedback', 'INSERT') IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon lacks table-level INSERT on public.feedback -- this policy would never even be reached, regardless of its own WITH CHECK';
  END IF;

  -- (c) anon_feedback_ingress_bounds must remain RESTRICTIVE, apply to INSERT, and be scoped
  --     TO PUBLIC (the pin from step 2 must have taken effect). Not this file's own load-bearing
  --     safety argument (this policy is anon-only, and anon is bounded whether
  --     anon_feedback_ingress_bounds is TO PUBLIC or TO anon) -- this assertion instead guards the
  --     hygiene fix step 2 performs, and defends against a FUTURE re-widening of the policy above
  --     to include authenticated silently inheriting an unbounded gap.
  SELECT p.polpermissive, p.polcmd, (0 = ANY(p.polroles))
    INTO v_bounds_permissive, v_bounds_cmd, v_bounds_to_public
  FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = 'feedback' AND c.relnamespace = 'public'::regnamespace
    AND p.polname = 'anon_feedback_ingress_bounds';

  IF v_bounds_permissive IS DISTINCT FROM false OR v_bounds_cmd IS DISTINCT FROM 'a' OR v_bounds_to_public IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'VERIFY FAILED: anon_feedback_ingress_bounds is missing, no longer RESTRICTIVE, no longer applies to INSERT, or is not scoped TO PUBLIC (permissive=%, cmd=%, to_public=%) -- step 2''s re-pin did not take effect', v_bounds_permissive, v_bounds_cmd, v_bounds_to_public;
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
--   CONTROL (authenticated) same, as an authenticated session                            -> ABSENT
--                            (policy is anon-only by design -- see header's EXEC-phase correction;
--                             this is a deliberate negative control, not an oversight)
--   AC-1  feedback_type='venture_error' (TS-5 shape)                                     -> ABSENT
--   AC-2  severity='critical' or 'high'                                                  -> ABSENT
--   AC-3  category='chairman_decision_deferred', severity='low'                          -> ABSENT
--   AC-4  venture_id NULL or a nonexistent/inactive venture                              -> ABSENT
--   AC-5  exceed the per-venture rate limit                                              -> ABSENT
--         (relies on check_feedback_rate_limit's own pre-existing, unmodified behavior --
--          not independently live-probed by this SD's acceptance script; see its header)
--   AC-6  a service-role insert of category='chairman_decision_deferred' still SUCCEEDS
--         (service_role carries rolbypassrls=true, unaffected by any of the above)
--
-- ============================================================
-- ROLLBACK (manual, if needed -- see the paired _DOWN.sql for the executable version):
-- ============================================================
-- BEGIN;
-- REVOKE EXECUTE ON FUNCTION public.venture_exists_and_active(uuid) FROM PUBLIC, anon;
-- REVOKE EXECUTE ON FUNCTION public.check_feedback_rate_limit(uuid) FROM PUBLIC, anon;
-- DROP POLICY IF EXISTS venture_user_insert_feedback_restore ON public.feedback;
-- -- anon_feedback_ingress_bounds's TO PUBLIC scope is left as-is (rolling back the new policy does
-- -- not require reverting that pin -- TO PUBLIC was already the live state before this file ran).
-- NOTIFY pgrst, 'reload schema';
-- COMMIT;
