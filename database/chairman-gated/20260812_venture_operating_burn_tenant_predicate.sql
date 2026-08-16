-- STAGED, NOT APPLIED. This file lives in database/chairman-gated/ deliberately, per
-- database/chairman-gated/README.md: the handoff pipeline auto-applies anything dropped into
-- database/migrations, database/manual-updates, or supabase/migrations. This directory sits
-- outside all three scanned paths. A worker cannot place chairman-gated DDL on an auto-applied
-- path and still call it gated.
--
-- SD: SD-LEO-INFRA-VENTURE-BURN-RLS-TENANT-PREDICATE-001
-- Date: 2026-08-12
--
-- CHAIRMAN-APPROVED: S1 'A' (SMS, 2026-08-12T11:43:53Z, Adam packet item 3) authorizes the WORK
-- (staging this fix). It does not authorize the APPLY -- the apply still runs the full
-- chairman-gated ceremony below, per this repo's separation-of-duties convention (worker authors
-- and stages; the chairman's own terminal, under his own git identity, performs the apply).
--
-- @approved-by: codestreetlabs@gmail.com (transcribed by Adam per chairman ruling 2026-08-07; approval: chairman terminal 'run it' on Group 1, 2026-08-16 ceremony)
--                per apply-migration.js's self-consistency check (header email == invoker's git
--                email + a matching, unconsumed, <1h MIGRATION_APPLY_TOKEN). This file does not
--                apply itself.>
--
-- APPLY SEQUENCE (SECURITY review, evidence row 8d2a6a6f-dd80-43af-9ddf-17a7c4ad48ee, finding
-- S-7: --issue-token is a MODE flag, not combinable with --prod-deploy on the same invocation --
-- passing both together mints a token and exits without applying anything. This file also lives
-- outside database/migrations/, so resolveMigrationPath needs --allow-any-path or it is rejected.
-- Two separate commands, in order:
--   1) node scripts/apply-migration.js --issue-token
--      (prints a token to stdout; single-use, expires in 1h)
--   2) MIGRATION_APPLY_TOKEN=<token from step 1> node scripts/apply-migration.js \
--        "database/chairman-gated/20260812_venture_operating_burn_tenant_predicate.sql" \
--        --prod-deploy --allow-any-path
--
-- ============================================================================================
-- WHAT IS WRONG TODAY (verified live via pooler catalog query, worker acf9242e, signal 87404880)
-- ============================================================================================
-- policyname   : venture_operating_burn_auth_read
-- permissive   : PERMISSIVE
-- roles        : {authenticated}
-- cmd          : SELECT
-- qual (USING) : true
--
-- Any authenticated caller -- not just callers with legitimate access to a given venture -- can
-- read every row of public.venture_operating_burn, including infra_cost_usd, ai_cost_usd, and
-- their sync timestamps, for every venture. Introduced by SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1
-- in database/migrations/20260712_venture_operating_burn.sql:58-60 ("authenticated reads (future
-- dashboards)"), not a regression of a prior tenant-scoped state.
--
-- CURRENT IMPACT: the table holds 0 rows today (measured by both LEAD-phase VALIDATION and
-- PLAN-phase prospective TESTING). This is a zero-data / preventive fix -- the predicate is wrong
-- and must be closed, but there is no evidence of prior exfiltration through it, because there is
-- nothing behind it yet to exfiltrate. Do not read the framing below as describing an active leak.
--
-- ============================================================================================
-- ROLLBACK -- READ THIS BEFORE APPLYING
-- ============================================================================================
-- Per the established convention in this directory (see
-- 20260803_bound_anon_ingress_source_type_qualifier.sql's hard requirement): the rollback source
-- is a FRESH PRE-APPLY CAPTURE of live pg_policies state, taken by the applier in his own lane at
-- apply time -- NEVER a repo file, including this one. The block below (captured 2026-08-12,
-- authoring time, via the same pooler query the header above cites) is context for the reviewer,
-- not an authority to restore from. If a fresh capture at apply time disagrees with this block,
-- STOP the ceremony and report it -- that would mean the live policy changed outside migration
-- history a second time, which matters more than this fix does.
--
--   ROLLBACK SHAPE, reference only. Deliberately written as ALTER POLICY, not DROP+CREATE, for
--   two independent reasons: (1) atomicity for a real rollback ceremony, same rationale as the
--   20260803 precedent; (2) empirically discovered while authoring this file -- lintSql() does
--   NOT strip SQL comments before its regex scan, so a `CREATE POLICY ... USING (true)` snippet
--   written here, even inside a `--` comment, is indistinguishable to it from a real DDL statement
--   and would make the companion acceptance script report a false violation against the intended
--   NEW predicate below. ALTER POLICY syntax is invisible to lintSql() (it only matches
--   `CREATE\s+POLICY`), so writing the rollback reference this way is inert to the lint either way
--   -- which happens to be exactly the property this comment needs.
--     ALTER POLICY venture_operating_burn_auth_read ON public.venture_operating_burn
--       USING (true);
--     GRANT SELECT ON public.venture_operating_burn TO anon;
--
-- ============================================================================================
-- WHY DROP+CREATE, NOT ALTER POLICY (a deliberate departure from the 20260803 precedent's stated
-- preference for ALTER POLICY on a live security policy)
-- ============================================================================================
-- scripts/lint/rls-anon-tenant-predicate-lint.mjs's extractPolicies() -- the function FR-3's
-- acceptance script binds to directly -- matches ONLY `CREATE\s+POLICY` (verified by reading its
-- source, scripts/lint/rls-anon-tenant-predicate-lint.mjs:75). An ALTER POLICY statement is
-- invisible to it: lintSql() would return zero policies found and therefore zero violations --
-- a VACUOUS pass, not a real one, structurally identical to the directory-scanning blind spot
-- prospective TESTING already caught once in this same SD (evidence row
-- 651bb0f4-960e-4ff5-be5b-19b523c5aed4, finding T-1). Using DROP+CREATE keeps the new predicate
-- inside a statement shape the lint can actually see and score, which is the entire point of
-- FR-3. The atomicity concern ALTER POLICY exists to avoid (a moment with zero matching policy)
-- is addressed instead by wrapping DROP+CREATE in a single transaction below -- per the 20260803
-- file's own comment, transaction isolation makes any intermediate state invisible to every other
-- session; the risk that precedent was principally guarding against is a file "someone later runs
-- statement-by-statement," which this ceremony's tooling does not do.
-- ============================================================================================

BEGIN;

DROP POLICY IF EXISTS venture_operating_burn_auth_read ON public.venture_operating_burn;

-- The auth.role() = 'service_role' disjunct below is inert in practice for the service-role
-- consumer (lib/operator/venture-burn-substrate.js runs via createSupabaseServiceClient(), and
-- service_role carries BYPASSRLS in Supabase regardless of any policy) -- kept for idiom parity
-- with the two other live policies this fix copies
-- (database/migrations/20260713_legal_doc_producer_schema.sql:126-135,
-- database/migrations/20260712_feedback_authenticated_select_caller_venture_STAGED.sql:75-81).
-- The separate venture_operating_burn_service policy (FOR ALL TO service_role) is what actually
-- serves that consumer -- do not drop it in a future cleanup on the mistaken belief this disjunct
-- covers it.
--
-- SECURITY review (evidence row 8d2a6a6f-dd80-43af-9ddf-17a7c4ad48ee, finding S-5): this comment
-- was originally INSIDE the USING(...) parens. An unbalanced paren inside a comment there would
-- make extractParenBlock() return null for the whole USING clause, silently disarming the
-- acceptance script's lint check while extractPolicies() still reports a policy was found --
-- a check that looks like it ran but examined nothing. Moved above CREATE POLICY so the USING(...)
-- body contains only the executable predicate.
CREATE POLICY venture_operating_burn_auth_read ON public.venture_operating_burn
    FOR SELECT
    TO authenticated
    USING (
        auth.role() = 'service_role'
        OR public.fn_user_has_venture_access(venture_id)
    );

-- Schema-qualified per prospective TESTING's optional-hardening recommendation. The function is
-- resolved once, at CREATE POLICY time, to a bound OID -- this is defense-in-depth, not a runtime
-- requirement (search_path drift after creation cannot retarget an already-bound policy).

-- VALIDATION (row 3aff78d7-82dc-4cb8-815d-85488305798d) + prospective TESTING (row
-- 651bb0f4-960e-4ff5-be5b-19b523c5aed4, which read the full function body via
-- pg_get_functiondef) confirm public.fn_user_has_venture_access(uuid) resolves: chairman bypass
-- first, then FALSE if the venture's company_id IS NULL, else delegates to
-- fn_user_has_company_access. 76.8% of ventures (116/151, measured live) have company_id IS NULL
-- today -- non-chairman authenticated callers lose read access to exactly those ventures' burn
-- rows after this fix. That is the INTENDED tightening, not a regression: those callers had no
-- legitimate access before this fix either (USING (true) was the bug, not their prior access).

-- C4 (VALIDATION): anon holds a table-level SELECT grant that is inert under RLS today (no
-- anon-targeted policy exists, so RLS denies anon regardless of the grant) but is unnecessary
-- exposure surface. Revoked here as defense-in-depth, same security surface as the policy fix
-- above, not a scope expansion.
REVOKE SELECT ON public.venture_operating_burn FROM anon;

COMMENT ON POLICY venture_operating_burn_auth_read ON public.venture_operating_burn IS
'SD-LEO-INFRA-VENTURE-BURN-RLS-TENANT-PREDICATE-001. Replaces a USING(true) cross-tenant leak
(introduced by SD-APEXNICHE-AI-LEO-ORCH-SPRINT-2026-001-E1) with the established local idiom for
venture-scoped authenticated-role RLS: auth.role() = ''service_role'' OR
fn_user_has_venture_access(venture_id). Ventures with company_id IS NULL (76.8% at authoring time)
are chairman-only readable post-fix by design -- see fn_user_has_venture_access''s own bypass/deny
logic, not a bug in this policy. The service_role disjunct is inert for this TO authenticated
policy; venture_operating_burn_service (FOR ALL TO service_role) is the policy that actually
serves the service-role consumer.';

-- ============================================================================================
-- POST-CONDITIONS, inside the transaction. Structural claims only -- the behavioural half (that
-- fn_user_has_venture_access grants access to callers who should have it, not just denies callers
-- who shouldn't) cannot be asserted here: venture_operating_burn holds 0 rows today, so any
-- row-level probe would be fixture-blind and pass identically under the leaking or fixed policy
-- (prospective TESTING finding T-3). See the companion acceptance script for what CAN be checked
-- pre-apply.
-- ============================================================================================
DO $$
DECLARE
    live_qual          text;
    is_permissive       boolean;
    live_roles          oid[];
    anon_can_select     boolean;
    service_policy_count integer;
BEGIN
    -- polqual, not qual (verified live against information_schema.columns for pg_catalog.pg_policy
    -- before authoring this block -- pg_policies the VIEW exposes it as "qual", but pg_policy the
    -- CATALOG TABLE this DO block queries directly does not).
    SELECT pg_get_expr(p.polqual, p.polrelid, true), p.polpermissive, p.polroles
      INTO live_qual, is_permissive, live_roles
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'venture_operating_burn'
       AND c.relnamespace = 'public'::regnamespace
       AND p.polname = 'venture_operating_burn_auth_read';

    IF live_qual IS NULL THEN
        RAISE EXCEPTION 'venture_operating_burn_auth_read not found after CREATE — the DROP+CREATE pair did not leave a policy in place.';
    END IF;

    -- 1. STILL PERMISSIVE (never became RESTRICTIVE by accident) and still scoped to authenticated.
    IF is_permissive IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'venture_operating_burn_auth_read is no longer PERMISSIVE.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY(live_roles) AND r.rolname = 'authenticated') THEN
        RAISE EXCEPTION 'venture_operating_burn_auth_read no longer applies to the authenticated role: %', live_roles;
    END IF;

    -- 2. THE LEAK IS ACTUALLY GONE: the predicate is no longer the bare literal true.
    IF live_qual = 'true' THEN
        RAISE EXCEPTION 'venture_operating_burn_auth_read still resolves to USING (true) — the fix did not take.';
    END IF;

    -- 3. THE REPLACEMENT PREDICATE IS THE INTENDED ONE, not just "not true": must reference the
    --    tenant-access helper this fix is supposed to install.
    IF live_qual !~ 'fn_user_has_venture_access' THEN
        RAISE EXCEPTION 'venture_operating_burn_auth_read does not reference fn_user_has_venture_access — got: %', live_qual;
    END IF;

    -- 4. anon's table-level SELECT grant is actually gone (has_table_privilege reads the grant
    --    directly, independent of RLS, so this is a distinct assertion from 1-3).
    SELECT has_table_privilege('anon', 'public.venture_operating_burn', 'SELECT') INTO anon_can_select;
    IF anon_can_select THEN
        RAISE EXCEPTION 'anon still holds SELECT privilege on public.venture_operating_burn after REVOKE.';
    END IF;

    -- 5. THE SERVICE-ROLE PATH IS UNTOUCHED: venture_operating_burn_service must still exist, so
    --    lib/operator/venture-burn-substrate.js keeps working regardless of this policy's inert
    --    service_role disjunct.
    SELECT count(*) INTO service_policy_count
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'venture_operating_burn'
       AND c.relnamespace = 'public'::regnamespace
       AND p.polname = 'venture_operating_burn_service';
    IF service_policy_count < 1 THEN
        RAISE EXCEPTION 'venture_operating_burn_service policy is missing — the service-role consumer would break.';
    END IF;
END $$;

COMMIT;

-- ============================================================================================
-- AFTER APPLY: the apply exit code is not the acceptance, AND (EXEC-phase TESTING finding
-- T-EXEC-1, evidence row 72cebe20-9772-4075-97c2-d5dfdd0bf75e) the acceptance script's OWN exit
-- code cannot discriminate pre-apply from post-apply either -- both states print "PASS" and exit
-- 0, because both a genuine pre-apply baseline and a silently-no-op'd apply render the same
-- "still USING(true)" / "already carries the fixed predicate" branches without failing. Read the
-- PRINTED live qual line, not the exit code, to know which state you are in. Run the companion
-- acceptance script (20260812_venture_operating_burn_tenant_predicate_acceptance.mjs) both before
-- and after apply and confirm the printed qual actually changed from 'true' to the
-- fn_user_has_venture_access predicate.
-- ============================================================================================
