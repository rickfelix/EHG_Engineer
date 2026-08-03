-- STAGED, NOT APPLIED. This file lives in database/chairman-gated/ deliberately.
-- It is OUTSIDE the three directories BaseExecutor._checkAndExecutePendingMigrations scans
-- (database/migrations, database/manual-updates, supabase/migrations). Placing it in any of those
-- would auto-apply it: LEO_MIGRATION_TIER_GATE is unset in this repo, so the TIER-2 default-deny
-- classification is computed, logged, and changes nothing. A worker cannot put chairman-gated DDL
-- on an auto-applied path and still call it gated. See database/chairman-gated/README.md.
--
-- Amendment: add a source_type qualifier to clause (3) of anon_feedback_ingress_bounds
-- Date: 2026-08-03
-- SD: SD-LEO-FIX-BOUND-ANON-TELEGRAM-001 (completed) — this is its gap G2, carried as follow-on.
--
-- CHAIRMAN-APPROVED: Option A, verbatim "I approve the security amendment recommendation option A"
-- (SMS 2026-08-03 10:13:53Z, signature valid, on record via Adam). The APPLY still runs through the
-- chairman-gated ceremony with the approval row referenced. Approval to AUTHOR is not approval to
-- APPLY, and this file does not apply itself.
--
-- ============================================================================================
-- WHAT IS WRONG TODAY (the defect this amends)
-- ============================================================================================
-- The installed clause (3) counts telegram rows and is ANDed into a RESTRICTIVE policy that
-- applies to EVERY anon INSERT. So a limit keyed on TELEGRAM ingress gates the venture-user path
-- too — a path that has its own per-venture limit and never needed this one. An attacker posts ~50
-- individually-legal telegram rows and ALL anon feedback ingress stops for an hour. Cost: ~50
-- requests. The harmed path is not the attacker's own.
--
-- Found by the SECURITY sub-agent during EXEC review of the original SD, not by the policy's
-- author. Measured exposure at the time of approval: organic peaks of 1 telegram row/hour (all
-- time) and 9 venture-user rows/hour — so this is an adversarial lever, not an operational fault.
-- Real, but cold. That calibration is why it was routed for same-day ratification rather than
-- treated as an incident.
--
-- ============================================================================================
-- THE CURRENT PREDICATE, VERBATIM FROM THE CATALOG — so rollback is EXACT, not RECONSTRUCTED
-- ============================================================================================
-- Captured 2026-08-03 via pg_get_expr(p.polwithcheck, p.polrelid, true) on the LIVE policy, not
-- copied from the migration file. This matters: the file's text and the installed text differ in
-- normalisation (Postgres rewrites NOT IN as <> ALL(ARRAY[...]) and casts to ::text), so a rollback
-- reconstructed from the migration would not restore byte-identical state. Requirement (1) from
-- Adam, and the reason it was made a condition.
--
-- polname     : anon_feedback_ingress_bounds
-- polpermissive: false   (RESTRICTIVE)
-- polcmd      : 'a'      (INSERT)
-- table owner : postgres
--
-- WITH CHECK, exactly as installed:
--
--   (severity IS NULL OR (severity::text <> ALL (ARRAY['critical'::character varying, 'high'::character varying]::text[]))) AND category::text IS DISTINCT FROM 'chairman_decision_deferred'::text AND ( SELECT count(*) < 50
--      FROM feedback f
--     WHERE f.source_type::text = 'telegram'::text AND f.created_at > (now() - '01:00:00'::interval))
--
-- ROLLBACK — restores exactly the above. Run inside a transaction:
--
--   ALTER POLICY anon_feedback_ingress_bounds ON public.feedback
--       WITH CHECK (
--           (severity IS NULL OR severity NOT IN ('critical','high'))
--           AND (category IS DISTINCT FROM 'chairman_decision_deferred')
--           AND ( SELECT count(*) < 50
--                   FROM public.feedback f
--                  WHERE f.source_type = 'telegram'
--                    AND f.created_at > now() - interval '1 hour' )
--       );
--
-- (The rollback is written in source form rather than pasted from pg_get_expr because
-- pg_get_expr output is a rendering, not necessarily re-parseable input. Applying the rollback and
-- re-reading pg_get_expr must reproduce the verbatim block above — verify that, do not assume it.)

BEGIN;

-- ALTER, not DROP+CREATE, and this is deliberate on a live security policy. DROP+CREATE would
-- leave the table with NO restrictive bound for the duration of the statement pair. Transaction
-- isolation makes that invisible to other sessions here, but the habit is wrong for permission
-- objects and the failure mode of getting it wrong (an error between DROP and CREATE, in a file
-- someone later runs statement-by-statement) is an open ingress. ALTER POLICY replaces the
-- predicate atomically and cannot leave the policy absent.
ALTER POLICY anon_feedback_ingress_bounds ON public.feedback
    WITH CHECK (
        -- (1) UNCHANGED. Not the chairman-queue severities.
        (severity IS NULL OR severity NOT IN ('critical', 'high'))

        -- (2) UNCHANGED. Not the chairman-deferral category.
        AND (category IS DISTINCT FROM 'chairman_decision_deferred')

        -- (3) AMENDED — this is the entire change. The window is now counted over rows sharing the
        --     INSERTING ROW'S source_type, instead of always over telegram. Each source_type gets
        --     its own 50/hour budget, so flooding one can no longer deny ingress to another.
        --
        --     *** THE SCOPING HERE IS THE ONE THING MOST LIKELY TO BE SILENTLY WRONG. ***
        --     The subquery aliases the same table as `f`. An UNQUALIFIED `source_type` inside it
        --     binds to `f.source_type` (innermost scope wins) — which would make the predicate
        --     `f.source_type IS NOT DISTINCT FROM f.source_type`, trivially TRUE for every row.
        --     The count would then be the FULL hourly population and the limit would still work by
        --     accident today, while meaning something completely different from what is written.
        --     `feedback.source_type` is therefore load-bearing: it is an OUTER reference to the row
        --     being inserted. Because the subquery aliased `feedback` to `f`, the bare name
        --     `feedback` is free inside it and resolves outward.
        --     VERIFIED READ-ONLY BEFORE STAGING, against live data: the correlated form returns
        --     distinct per-source counts (telegram=1, auto_capture=9979, manual_feedback=6417)
        --     rather than the 16580 table total, which is exactly what an outer binding produces
        --     and an inner binding could not. Post-condition 2 below re-asserts it at apply time.
        --
        --     IS NOT DISTINCT FROM, not `=`: source_type is nullable, and `=` would make the
        --     predicate NULL for a NULL source_type, failing the WITH CHECK and silently closing
        --     an ingress path this amendment is not meant to touch.
        AND (
            SELECT count(*) < 50
            FROM public.feedback f
            WHERE f.source_type IS NOT DISTINCT FROM feedback.source_type
              AND f.created_at > now() - interval '1 hour'
        )
    );

COMMENT ON POLICY anon_feedback_ingress_bounds ON public.feedback IS
'SD-LEO-FIX-BOUND-ANON-TELEGRAM-001 + G2 amendment 2026-08-03 (chairman Option A). RESTRICTIVE, so
it ANDs with every permissive anon INSERT policy. Bounds anon inserts away from the chairman queue:
severity not in (critical,high) because the queue arm admits exactly those two, and category is not
chairman_decision_deferred because the legitimate deferral writer stamps severity=low. Rate limit is
counted PER source_type of the inserting row (feedback.source_type is an outer reference, not the
subquery alias) so flooding one source cannot deny ingress to another - that cross-source denial was
the G2 defect. KNOWN, UNFIXED: the counting subquery runs as the inserting role and is subject to
that role SELECT RLS, so narrowing the anon SELECT policy makes this undercount and fail OPEN.';

-- ============================================================================================
-- POST-CONDITIONS, inside the transaction. An external suite cannot substitute: this repo's
-- vitest `db` project is gated to zero files when no non-production target is designated, so it
-- would report green having executed nothing. An assertion here cannot silently not-run.
-- These are STRUCTURAL. The BEHAVIOURAL acceptance is the companion probe (requirement 2 from
-- Adam) — see 20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs. Structure and
-- behaviour are different claims and this file only makes the first.
-- ============================================================================================
DO $$
DECLARE
    wc                      text;
    is_restrictive          boolean;
    permissive_insert_count integer;
BEGIN
    SELECT pg_get_expr(p.polwithcheck, p.polrelid, true), NOT p.polpermissive
      INTO wc, is_restrictive
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'feedback'
       AND c.relnamespace = 'public'::regnamespace
       AND p.polname = 'anon_feedback_ingress_bounds';

    IF wc IS NULL THEN
        RAISE EXCEPTION 'anon_feedback_ingress_bounds not found after ALTER — the policy this amendment edits does not exist.';
    END IF;

    -- 1. STILL RESTRICTIVE. ALTER POLICY cannot change this, which is precisely why it is asserted:
    --    the assertion is cheap and the property is the one that makes the whole policy do anything.
    IF is_restrictive IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'anon_feedback_ingress_bounds is no longer RESTRICTIVE — it would OR with the permissive anon INSERT policies and close nothing.';
    END IF;

    -- 2. THE CORRELATION LANDED. Guards the exact silent failure described at clause (3): if the
    --    outer reference had bound to the subquery alias, Postgres would render the predicate with
    --    `f.source_type IS NOT DISTINCT FROM f.source_type`. Assert the rendered expression
    --    references the OUTER table name inside the correlation, and does NOT contain the
    --    self-comparison form.
    IF wc !~ 'f\.source_type IS NOT DISTINCT FROM feedback\.source_type' THEN
        RAISE EXCEPTION 'clause (3) is not correlated to the inserting row: expected f.source_type IS NOT DISTINCT FROM feedback.source_type, got: %', wc;
    END IF;
    IF wc ~ 'f\.source_type IS NOT DISTINCT FROM f\.source_type' THEN
        RAISE EXCEPTION 'clause (3) correlation collapsed to a self-comparison (always TRUE) — the outer reference bound to the subquery alias.';
    END IF;

    -- 3. THE LIMIT IS STILL A LIMIT. Adam's stated worry, asserted structurally: narrowing the
    --    counting scope is exactly how a rate limit accidentally stops limiting. If the threshold
    --    were dropped or the comparison inverted while the qualifier was added, checks 1-2 would
    --    still pass. The behavioural half of this is the companion probe.
    IF wc !~ 'count\(\*\) < 50' THEN
        RAISE EXCEPTION 'clause (3) no longer carries the count(*) < 50 bound — the qualifier was added but the limit stopped limiting: %', wc;
    END IF;

    -- 4. THE OLD UNCONDITIONAL TELEGRAM KEY IS GONE. Without this, an amendment that ADDED the
    --    correlation while LEAVING the telegram filter in place would satisfy 1-3 and still gate
    --    every anon insert on telegram volume — i.e. G2 unfixed, with all assertions green.
    IF wc ~ 'f\.source_type::text = ''telegram''::text' THEN
        RAISE EXCEPTION 'clause (3) still filters on a literal telegram source_type — G2 is not fixed; the cross-source denial remains.';
    END IF;

    -- 5. A permissive ANON INSERT policy must STILL EXIST. Carried forward from the original
    --    migration, including its role filter: an unfiltered count reads 3 (two anon + one
    --    service_role) and would pass even with both anon policies dropped. `0 = ANY(polroles)`
    --    handles TO PUBLIC, which an inner join on pg_roles drops silently.
    SELECT count(*)
      INTO permissive_insert_count
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'feedback'
       AND c.relnamespace = 'public'::regnamespace
       AND p.polpermissive
       AND p.polcmd = 'a'
       AND ( 0 = ANY(p.polroles)
             OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY(p.polroles) AND r.rolname = 'anon') );

    IF permissive_insert_count < 1 THEN
        RAISE EXCEPTION 'no permissive ANON INSERT policy remains on public.feedback — a RESTRICTIVE policy alone denies everything.';
    END IF;
END $$;

COMMIT;

-- ============================================================================================
-- AFTER APPLY: run the behavioural acceptance. The apply exit code is NOT the acceptance.
--   node database/chairman-gated/20260803_bound_anon_ingress_source_type_qualifier_acceptance.mjs
--
-- It asserts, using the three-leg method (observe / service-role readback / re-attempt WITHOUT
-- RETURNING and read back again, because the two write forms diverge):
--   A. THE LIMIT STILL REJECTS past threshold for a single source_type  <- requirement (2)
--   B. a source_type UNDER threshold is still ACCEPTED while another is over  <- G2 actually fixed
--   C. clauses (1) and (2) are unchanged — severity and category bounds still refuse
--   D. a benign control still LANDS, without which no absence result above means anything
--
-- WHAT THIS AMENDMENT DOES NOT FIX, restated so it is not mistaken for closed:
--   - the counting subquery runs as the inserting role and is subject to that role's SELECT RLS,
--     so narrowing the anon SELECT policy still makes it undercount and FAIL OPEN;
--   - clause (1) still mirrors a constant that lives in a separately-editable view, which has
--     already been restructured once without this policy being consulted;
--   - public.record_venture_error() still reaches public.feedback outside RLS entirely.
-- ============================================================================================
