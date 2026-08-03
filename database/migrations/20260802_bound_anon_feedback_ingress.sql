-- PROVENANCE: everything from the "Migration:" line down is byte-identical to the artifact parked
-- at strategic_directives_v2.metadata.authored_migration_20260802.verbatim_sql (sha256 of the full
-- parked blob: f61c12f4d7433b83…). Only this header differs — the parked copy opened with a note
-- saying it was staged outside a worktree because PAT-CLMMULTI-002 resolved this session to the
-- wrong one of its two claims. That blocker is resolved (the second claim was released through
-- lib/claim/release-claim-both-surfaces.mjs, the sanctioned dual-surface helper), so the note is
-- no longer true and is replaced rather than shipped as a false statement.
--
-- WHY THIS FILE EXISTS AT ALL — the sharpest finding on this SD. The live policy this migration
-- creates was verified INSTALLED in the database and ABSENT from migration history: it exists
-- nowhere in database/migrations/. A rebuild from source would therefore silently reopen the
-- vulnerability. DB-versus-repo drift of a security policy is invisible to every gate that reads
-- only one of the two surfaces, which is why this is committed as a replayable migration.
--
-- Migration: bound the anon INSERT surface on public.feedback with a RESTRICTIVE policy
-- Date: 2026-08-02
-- SD: SD-LEO-FIX-BOUND-ANON-TELEGRAM-001
--
-- CHAIRMAN-RATIFIED: decision ec30093d, verbatim "A is the best option" — bind the anon telegram
-- feedback insert path to non-blocking, normal severity, and a rate limit.
--
-- *** THE RATIFIED WORDING NAMES TWO THINGS THAT DO NOT EXIST, AND THAT IS NOT A QUIBBLE. ***
-- MEASURED: public.feedback has NO `blocking` column (all 65 enumerated), and severity='normal' is
-- REJECTED by CHECK feedback_severity_check — identically to a nonsense control value. Legal
-- severities are critical, high, medium, low, or NULL. The acceptance as originally written could
-- never have passed: it asked for a readback of a column that is not there.
--
-- ADAM RULED (no fresh chairman verbal required): `blocking` was never meant to be a column. It is
-- a DERIVED expression — `(f.severity = 'critical') AS blocking` in the feedback arm of
-- chairman_unified_decisions (20260611_chairman_decision_queue.sql:193). So "non-blocking" MEANS
-- severity is not critical, and the unachievable "normal" maps onto the legal low-urgency values.
-- Naming real columns for the same effect is TRANSLATION, not reinterpretation. The discriminant,
-- worth carrying: did the EFFECT change, or only its EXPRESSION? Only the expression changed here.
--
-- WHY BOUNDING SEVERITY DOES MORE THAN DE-ESCALATE. Verified at source: feedback reaches
-- chairman_unified_decisions through exactly 1 of 7 UNION ALL branches, and that branch's WHERE is
--   WHERE f.severity = ANY (ARRAY['critical','high']) ...
-- so a row bounded to medium/low leaves the chairman queue ENTIRELY rather than arriving quieter.
--
-- *** WHY RESTRICTIVE AND NOT A TIGHTENING OF THE EXISTING POLICIES. ***
-- RLS OR-s permissive policies, so the WEAKEST one governs. public.feedback carries TWO permissive
-- anon INSERT policies — telegram_bot_insert_feedback (WITH CHECK source_type='telegram', and
-- nothing else) and venture_user_insert_feedback — and ZERO restrictive ones (catalog-confirmed via
-- pg_policy over the pooler, not inferred from migration text). Tightening one leaves the other open
-- and looks like a fix. A RESTRICTIVE policy ANDs with every permissive policy, so it closes both —
-- and any third that exists unmeasured or is added later. That property is also why this shape is
-- correct despite nobody being able to prove the count is exactly two.
--
-- THE DEFECT, RE-ESTABLISHED LIVE AS THE ANON ROLE (reading policy text establishes intent, never
-- behaviour). With the public anon key and source_type='telegram':
--   severity='critical'                                          -> LANDED
--   severity='critical' + category='chairman_decision_deferred'  -> LANDED
--   benign control (severity='medium')                           -> LANDED
-- The control matters: it proves the probe can produce a positive, without which no absence result
-- would mean anything. Each outcome confirmed by SERVICE-ROLE READBACK, never by the returned
-- status. Probe rows deleted, residual count verified 0.
--
-- CALIBRATION FOR WHOEVER READS THIS NEXT, because the word CRITICAL invites the wrong inference:
-- the ENTIRE telegram ingress is ONE historical row. The door is genuinely open and was
-- demonstrated open — but it has been walked through once in this system's history. This is not a
-- live intrusion and nobody should be woken for it.
--
-- SCOPE FENCE: anon INGRESS only. The READER side is already closed by
-- SD-FDBK-INFRA-DECISION-QUEUE-RETIREMENT-001 (multi-field provenance fence, forged row rejected at
-- the consumer). The write surface stayed open BY DESIGN of that fix; this is the write-side closure
-- and it does not reopen or fold in that work.
--
-- NOT APPLIED BY ITS AUTHOR. metadata.chairman_gated_ddl=true: an RLS/policy change is
-- permission-class and is NOT delegated-apply. The post-apply probe is the acceptance, never the
-- apply exit code.

BEGIN;

-- Idempotent: re-running this migration must not fail on an existing policy.
DROP POLICY IF EXISTS anon_feedback_ingress_bounds ON public.feedback;

-- RESTRICTIVE — the whole point. A PERMISSIVE policy here would OR with the two existing anon
-- INSERT policies and change NOTHING while appearing to ship, which is the single most likely way
-- this fix could look correct and be inert. Asserted at the catalog in the post-condition below.
CREATE POLICY anon_feedback_ingress_bounds
    ON public.feedback
    AS RESTRICTIVE
    FOR INSERT
    TO anon
    WITH CHECK (
        -- (1) NOT the chairman-queue severities. This is the ratified "non-blocking, normal
        --     severity", expressed in the column that actually exists. Both values are named: the
        --     queue arm admits critical AND high, so closing only critical would leave the queue
        --     reachable. NULL is permitted because it is a legal severity and is what every live
        --     legitimate row currently carries — excluding it would break existing writers.
        (severity IS NULL OR severity NOT IN ('critical', 'high'))

        -- (2) NOT the chairman-deferral category. A SECOND, DISTINCT vector, not redundant with
        --     (1): the legitimate deferral writer stamps its rows at severity='low', so a
        --     severity-only bound would leave deferral-authority forgery completely open. This is
        --     the category Alpha-2's live exploit used to plant a row a real consumer honoured.
        --     IS DISTINCT FROM, not <>, so a NULL category cannot make the clause NULL and fail
        --     the check by accident.
        AND (category IS DISTINCT FROM 'chairman_decision_deferred')

        -- (3) Rate limit, keyed on the TELEGRAM INGRESS rather than venture_id.
        --     NOT a copy of the sibling predicate, deliberately. venture_user_insert_feedback keys
        --     its limit on check_feedback_rate_limit(venture_id) — and telegram rows carry
        --     venture_id on 0 of 1 rows, so keying on it would produce a predicate that always
        --     takes the same branch. That is not a rate limit. The window is implemented inline
        --     rather than by calling check_feedback_rate_limit(), which also removes a dependency
        --     whose signature could not be verified from the authoring side (unreadable through
        --     PostgREST, PGRST202). The chairman ratified "rate-limited"; the key is implementation,
        --     and this comment exists so it is never mistaken for a copy of the sibling.
        --
        --     *** THIS CLAUSE FAILS OPEN, AND NOTHING HERE CAN DETECT IT. READ BEFORE EDITING. ***
        --     The subquery is evaluated AS THE INSERTING ROLE, so it is itself subject to anon's
        --     SELECT RLS. It counts correctly today only because a permissive SELECT policy
        --     (telegram_bot_select_feedback, TO anon, USING source_type='telegram') happens to
        --     admit exactly the rows being counted. Tighten or drop that SELECT policy — an
        --     entirely plausible, apparently-unrelated hardening — and this subquery sees ZERO
        --     rows, count(*) < 50 becomes unconditionally TRUE, and the rate limit silently
        --     becomes a no-op. It fails OPEN: the limit stops limiting while every post-condition
        --     below still passes, because they assert the policy's SHAPE and never its BEHAVIOUR.
        --     The dependency is invisible from the SELECT policy's side, which is where the
        --     breaking edit would be made.
        --     NOT fixed in place, deliberately: this policy is already INSTALLED in the database
        --     (chairman-applied 2026-08-02) and this file is the catch-up commit for it. Changing
        --     the predicate here — e.g. routing the count through a SECURITY DEFINER function,
        --     which is the real fix — would make this migration stop reproducing production and
        --     would alter a ratified permission-class object without ratification. The fix belongs
        --     in its own chairman-gated work item; this comment exists so the coupling is not
        --     rediscovered by an outage. Found by the TESTING sub-agent at EXEC, not by the author.
        AND (
            SELECT count(*) < 50
            FROM public.feedback f
            WHERE f.source_type = 'telegram'
              AND f.created_at > now() - interval '1 hour'
        )
    );

COMMENT ON POLICY anon_feedback_ingress_bounds ON public.feedback IS
'SD-LEO-FIX-BOUND-ANON-TELEGRAM-001. RESTRICTIVE, so it ANDs with every permissive anon INSERT
policy rather than OR-ing beside them - a permissive policy here would change nothing. Bounds anon
inserts away from the chairman decision queue: severity not in (critical,high) because the queue arm
admits exactly those two, and category is not chairman_decision_deferred because the legitimate
deferral writer stamps severity=low, so a severity-only bound would leave forgery open. Rate limit is
keyed on the telegram ingress, NOT on venture_id - telegram rows never populate it.';

-- *** POST-CONDITIONS INSIDE THE TRANSACTION. ***
-- Deliberately not an external test: an E2E suite asserting this would run against whatever it is
-- pointed at, and in this repo the vitest `db` project is gated to zero files when no non-production
-- target is designated — so it would report green having executed nothing. An assertion inside the
-- transaction cannot silently not-run: if it fails, the migration rolls back.
DO $$
DECLARE
    is_restrictive          boolean;
    permissive_insert_count integer;
BEGIN
    -- 1. THE POLICY MUST BE RESTRICTIVE. Created permissive, it would OR with the existing two,
    --    close nothing, and every probe of a legitimate insert would still pass — a fix that ships
    --    looking correct and is inert. pg_policy.polpermissive is the only place this is visible;
    --    it cannot be inferred from behaviour on the positive path.
    SELECT NOT p.polpermissive
      INTO is_restrictive
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'feedback'
       AND c.relnamespace = 'public'::regnamespace
       AND p.polname = 'anon_feedback_ingress_bounds';

    IF is_restrictive IS DISTINCT FROM true THEN
        RAISE EXCEPTION
          'anon_feedback_ingress_bounds is not RESTRICTIVE — it would OR with the existing permissive anon INSERT policies and close nothing.';
    END IF;

    -- 2. A permissive ANON INSERT policy must STILL EXIST. This migration BOUNDS the existing
    --    ingress; it must not have removed it. A RESTRICTIVE policy alone denies everything, so if
    --    the permissives were gone the legitimate telegram and venture-user paths would be closed
    --    entirely — worse than the defect, and invisible to check (1).
    --
    --    *** THE ROLE FILTER IS LOAD-BEARING AND ITS ABSENCE WAS A REAL BUG IN THIS FILE. ***
    --    An earlier revision counted permissive INSERT policies WITHOUT filtering by role. Measured
    --    at the catalog: public.feedback carries THREE permissive INSERT policies — two on anon
    --    (telegram_bot_insert_feedback, venture_user_insert_feedback) and one on service_role
    --    (insert_feedback_policy). So the unfiltered count would have stayed >= 1 even if BOTH anon
    --    policies were dropped, and this assertion would have passed while anon ingress was
    --    completely closed — the precise failure it exists to catch. polcmd='a' is INSERT,
    --    confirmed against a known INSERT policy rather than assumed from convention.
    --    *** AND THE ROLE TEST HANDLES `TO PUBLIC`, WHICH AN INNER JOIN ON pg_roles SILENTLY DROPS. ***
    --    A policy created TO PUBLIC has polroles = {0}. Oid 0 matches no pg_roles row, so
    --    `JOIN pg_roles r ON r.oid = ANY(p.polroles)` produces NO row for it — while the policy
    --    DOES apply to anon. An inner join would therefore have under-counted in the FAILING
    --    direction: it could read 0 and abort a migration that was perfectly fine.
    --    MEASURED: no policy on public.feedback is TO PUBLIC today (all seven carry explicit role
    --    oids), so both forms return 2 and the hazard is LATENT rather than live. Stated here
    --    explicitly so the next reader does not have to re-derive the worry.
    --    CONTROL, because "no PUBLIC policy exists" is not evidence the test would catch one:
    --    against a synthetic TO PUBLIC policy, `0 = ANY(polroles)` detects it and the rolname join
    --    finds zero rows — confirming both that the hazard is real and that this form closes it.
    SELECT count(*)
      INTO permissive_insert_count
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'feedback'
       AND c.relnamespace = 'public'::regnamespace
       AND p.polpermissive
       AND p.polcmd = 'a'          -- 'a' = INSERT (verified at the catalog)
       AND (
             0 = ANY(p.polroles)   -- TO PUBLIC: applies to anon
             OR EXISTS (SELECT 1 FROM pg_roles r
                         WHERE r.oid = ANY(p.polroles) AND r.rolname = 'anon')
           );

    IF permissive_insert_count < 1 THEN
        RAISE EXCEPTION
          'no permissive ANON INSERT policy remains on public.feedback — a RESTRICTIVE policy alone denies everything, so legitimate anon ingress would be closed.';
    END IF;
END $$;

COMMIT;

-- VERIFICATION AFTER APPLY — the acceptance is this probe, NOT the apply exit code.
-- Run every one AS THE ANON ROLE, and decide landed-vs-refused ONLY by a service-role readback.
--
-- *** USE THE THREE-LEG METHOD. AN ERROR CODE NEVER DECIDES LANDED-VS-REFUSED. ***
--   leg 1  observe what the client reports (an error code, or none)
--   leg 2  SERVICE-ROLE READBACK — the only thing that establishes whether the row exists
--   leg 3  re-attempt the IDENTICAL write WITHOUT RETURNING (a bare insert), then read back AGAIN
--
-- Leg 3 is not belt-and-braces, it is the leg that catches the dangerous case: the two variants
-- DIVERGE. A bare .insert() can return 201 with the row PERSISTED while the .insert().select()
-- form of the same write reports an error. A probe suite built only from the RETURNING variant
-- therefore proves only that RETURNING refused — never that the write did. Every refusal claimed
-- below must hold under BOTH variants, and the control must LAND under both.
--
-- Do not reintroduce the older framing, which held that a 42501 could not be trusted BECAUSE the
-- RETURNING clause had failed the read policy. That framing was carried through several rounds of
-- this SD's own evidence and is REFUTED — see
-- strategic_directives_v2.metadata.method_correction_20260803. It misnames the hazard, and the
-- misnaming matters: it points at the READ policy and so invites a fix there, while the actual
-- divergence is between the two WRITE forms. The correction previously lived only in SD metadata
-- and did not travel with this file — which is exactly how it got repeated. It travels now.
--
-- Probe rows must be OTHERWISE VALID and differ ONLY in the field under test — NOT NULL and CHECK
-- constraints are evaluated BEFORE the RLS WITH CHECK, so a malformed probe never reaches the policy
-- and returns a misleading error. This is a TEMPLATE, not a caution: the caution was already written
-- into this SD and was hit three times anyway. Include a nonsense control value; if it fails
-- identically to the real values, the probe never reached the policy and every result is void.
--
--   CONTROL  severity='medium', ordinary category  -> must LAND (proves the probe can pass at all)
--   AC-2     severity='critical'                    -> must be ABSENT on readback
--   AC-2     severity='high'                        -> must be ABSENT on readback
--   AC-3     category='chairman_decision_deferred' WITH severity='low'
--                                                  -> must be ABSENT. Severity is legal here ON
--                                                     PURPOSE, so this can only pass if the category
--                                                     clause is doing the work.
--   AC-4     no row exists carrying the attempted values silently rewritten to legal ones
--   AC-5     exceed the window -> the over-limit row ABSENT on readback
--   AC-6     a SERVICE-ROLE insert of category='chairman_decision_deferred' still SUCCEEDS
--            (service_role carries rolbypassrls=true, so the legitimate writer is unaffected)
--
--
-- ============================================================================================
-- KNOWN GAPS — found at EXEC review by the SECURITY and TESTING sub-agents, NOT by the author.
-- None is fixed here: the executable SQL above is deliberately frozen to reproduce the policy
-- already installed in production, and editing a ratified permission-class object without
-- ratification is the larger error. They are recorded IN THE FILE because this SD exists because
-- security knowledge that lived in only one place did not travel.
-- ============================================================================================
--
-- G1. "ANON CANNOT REACH THE CHAIRMAN QUEUE" IS NOT ESTABLISHED — a channel bypasses RLS entirely.
--     public.record_venture_error() is SECURITY DEFINER, owned by postgres (rolbypassrls=true), on
--     a table with relforcerowsecurity=false — RLS bypassed twice over — and EXECUTE is granted to
--     anon. Its storm branch inserts severity='high' with status='new', which satisfies the queue
--     arm exactly. NO RLS policy on public.feedback can constrain it, including this one.
--     Assessed NOT critical: severity is hard-coded, category is never set, inserts are
--     ON CONFLICT-deduped, the text is boilerplate, the venture UUIDs are not anon-enumerable, and
--     it has never fired. So it cannot produce the demonstrated exploit — but the stronger claim
--     "anon cannot reach the chairman decision queue" is false as stated, and is not this policy's
--     to make.
--
-- G2. THIS POLICY INTRODUCES AN AVAILABILITY REGRESSION. Clause (3) carries NO source_type
--     qualifier, so a limit keyed on TELEGRAM ingress now gates EVERY anon INSERT — including the
--     venture-user path, which has its own per-venture limit and never needed this one. An
--     attacker can post 50 individually-legal telegram rows and deny ALL anon feedback ingress for
--     an hour, at a cost of ~50 requests. The sibling limit this one deliberately does not copy is
--     per-venture and therefore cannot be weaponised this way; this one is global. A source_type
--     qualifier on clause (3) is the fix, and it needs ratification because it changes a ratified
--     predicate.
--
-- G3. CLAUSE (1) MIRRORS A CONSTANT THAT LIVES IN A SEPARATELY-EDITABLE VIEW, AND THAT VIEW HAS
--     ALREADY MOVED. The ('critical','high') pair is a copy of the queue arm's WHERE. Widen that
--     arm and anon reaches the queue again while every post-condition above stays green — they
--     assert this policy's SHAPE and can never see the view. This is not hypothetical: the queue
--     has ALREADY been restructured since the 20260611_chairman_decision_queue.sql:193 citation in
--     the header above — chairman_unified_decisions is now a thin filter over the newer
--     chairman_all_decision_signals — and this policy was not consulted when that happened. The
--     arm survived byte-identical by luck, not by a guard. Nothing records the dependency in
--     either direction; treat the header's line citation as stale provenance, not a live pointer.
--
-- G4. THE POST-CONDITIONS ASSERT SHAPE, NEVER BEHAVIOUR, and run only inside the creating
--     transaction — so they catch authoring errors in THIS file and nothing afterwards. Check 2's
--     `< 1` threshold in particular still passes if telegram_bot_insert_feedback alone is dropped,
--     which would close the very ingress path it exists to protect. Drift detection for this
--     policy does not exist; the in-repo instrument to extend is
--     scripts/breakage/active-breakage-canary.mjs, which needs a two-arm shape here because benign
--     anon inserts are SUPPOSED to land.
