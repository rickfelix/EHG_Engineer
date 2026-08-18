-- STAGED, NOT APPLIED. This file lives in database/chairman-gated/ deliberately, per
-- database/chairman-gated/README.md: the handoff pipeline auto-applies anything dropped into
-- database/migrations, database/manual-updates, or supabase/migrations. This directory sits
-- outside all three scanned paths. A worker cannot place chairman-gated DDL on an auto-applied
-- path and still call it gated.
--
-- SD: SD-MAN-INFRA-VENTURE-CRACK-GATE-001 (FR-4 / TR-3)
-- Date: 2026-08-18
--
-- @approved-by: codestreetlabs@gmail.com
-- Chairman VERBAL approval 2026-08-18 ~10:2xZ, at-terminal morning sitting: "approve item 1"
-- (item 1 = this file, presented as TOP of the sitting packet with rec+rationale; packet capture
-- feedback 4b17aa18). Adam-scribed under the ratified chairman-verbal ceremony (worker-transcribe
-- ruling 5d86e2e3; verbal-suffices-for-gated-applies standing rule), stamped by the applier
-- identity per checkApproverFactor self-consistency.
--
-- ============================================================================================
-- WHAT IS WRONG TODAY (verified live via pooler catalog query, worker Golf-3 (session
-- 29175888-1a98-4fb7-9d18-1bcf78c12477), signals 52695e53/7178f834/e46e7b6c)
-- ============================================================================================
-- policyname   : venture_stage_work_modify
-- permissive   : PERMISSIVE
-- cmd          : SELECT   (polcmd='r')
-- roles        : NULL     (= PUBLIC -- applies to every role, including anon, not just
--                           authenticated)
-- qual (USING) : true
--
-- A SEPARATE, CORRECTLY-SCOPED policy already exists and already covers this exact case:
--   venture_stage_work_select_policy : PERMISSIVE, SELECT, TO authenticated,
--                                       USING (fn_user_has_venture_access(venture_id))
-- Because RLS policies for the same command are PERMISSIVE-OR'd together, the presence of
-- venture_stage_work_modify makes the correctly-scoped policy irrelevant for SELECT: any anon or
-- authenticated caller through the normal PostgREST/anon-key API path can already read every row
-- of venture_stage_work today, for every venture, regardless of company/chairman access.
--
-- FILE-VS-LIVE DISAGREEMENT (documented per this directory's established convention -- see the
-- 20260803 precedent's "any file-vs-live disagreement is a BLOCKING finding" doctrine): the
-- ORIGINATING migration, database/migrations/20251206_factory_architecture.sql:254-255, defines
-- this policy as `FOR ALL USING (true)` (i.e. intended to cover INSERT/UPDATE/DELETE too, not
-- just SELECT). The LIVE catalog shows polcmd='r' (SELECT only) -- narrower than the file. A
-- repo-wide grep for the literal policy name found no other migration that touched it, so this
-- is either an undocumented live ALTER POLICY run outside migration history (the same class of
-- drift the chairman-gated README already documents for public.session_coordination), or a
-- schema-sync tool silently narrowed it at some point. The apply-time re-capture below is what
-- actually governs -- if it disagrees with either this file or the 20251206 origin, STOP and
-- report it rather than proceeding.
--
-- CURRENT IMPACT: venture_stage_work holds 546 rows today (measured), all currently reachable
-- by an unauthenticated caller through this policy. sd_id is populated on 0 of the 546 rows
-- (this SD's own FR-4 is the first real writer of that column), so no deploy-authorization
-- decision anywhere in the codebase currently depends on this table's contents -- this is a
-- data-exposure fix (venture_id, lifecycle_stage, work_type, sd_id-once-populated for 546 rows),
-- not (yet) an authorization-bypass fix. FR-4 is what would make it the latter if this policy
-- were left in place, which is why this fix is a hard precondition, not a nice-to-have.
--
-- ============================================================================================
-- ROLLBACK -- READ THIS BEFORE APPLYING
-- ============================================================================================
-- Per the established convention in this directory: the rollback source is a FRESH PRE-APPLY
-- CAPTURE of live pg_policies + grants state, taken by the applier at apply time -- NEVER a repo
-- file, including this one. The block below (captured 2026-08-18, authoring time, via a direct
-- pg_policy + information_schema.role_table_grants query through
-- lib/supabase-connection.js's createDatabaseClient('engineer')) is context for the reviewer,
-- not an authority to restore from.
--
--   ROLLBACK SHAPE, reference only (recreates the policy exactly as found live at authoring
--   time -- NOT as the 20251206 origin file defines it, since live is what this fix actually
--   changes):
--     CREATE POLICY venture_stage_work_modify ON public.venture_stage_work
--       FOR SELECT USING (true);
--     GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.venture_stage_work TO anon;
-- ============================================================================================

BEGIN;

-- DROP, not ALTER: venture_stage_work_modify is being removed entirely (its one and only live
-- purpose, an unrestricted PUBLIC SELECT, is fully superseded by venture_stage_work_select_policy
-- which already exists and is already correctly scoped) -- there is nothing to narrow it INTO,
-- unlike the venture_operating_burn precedent which replaced one predicate with another on the
-- same policy name.
DROP POLICY IF EXISTS venture_stage_work_modify ON public.venture_stage_work;

-- anon's table-level grants are now either INERT under RLS (SELECT/INSERT/UPDATE/DELETE -- no
-- remaining permissive policy targets anon for any of these commands, so RLS default-denies) or,
-- for TRUNCATE specifically, NOT inert at all: PostgreSQL does not apply RLS to TRUNCATE, so the
-- grant alone is sufficient to allow it regardless of any policy on this table. Revoked here as
-- defense-in-depth, same pattern as the venture_operating_burn precedent's anon SELECT revoke,
-- extended to the full grant set since none of it is needed for this table's real (service-role
-- and application-server) consumers.
REVOKE SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON public.venture_stage_work FROM anon;

-- ============================================================================================
-- POST-CONDITIONS, inside the transaction.
-- ============================================================================================
DO $$
DECLARE
    modify_policy_count      integer;
    select_policy_count      integer;
    select_policy_roles      oid[];
    select_policy_qual       text;
    anon_select               boolean;
    anon_insert               boolean;
    anon_update               boolean;
    anon_delete               boolean;
    anon_truncate             boolean;
BEGIN
    -- 1. venture_stage_work_modify is actually gone.
    SELECT count(*) INTO modify_policy_count
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'venture_stage_work'
       AND c.relnamespace = 'public'::regnamespace
       AND p.polname = 'venture_stage_work_modify';
    IF modify_policy_count > 0 THEN
        RAISE EXCEPTION 'venture_stage_work_modify still exists after DROP.';
    END IF;

    -- 2. venture_stage_work_select_policy is untouched and still correctly scoped -- this fix
    --    must not have collaterally removed the ONE policy that legitimately serves SELECT.
    -- CEREMONY FIX 2026-08-18 (apply-time, Adam-scribed, disclosed in readback): the original
    -- check read polroles via (array_agg(p.polroles))[1] — array_agg over an oid[] column builds
    -- a 2-D array, and single-subscript indexing a 2-D array yields NULL, so the check raised
    -- '<NULL>' against a policy the acceptance --baseline had just shown correct ({authenticated}).
    -- Verification logic only; the action statements above are byte-identical to the approved file.
    SELECT count(*), min(pg_get_expr(p.polqual, p.polrelid, true))
      INTO select_policy_count, select_policy_qual
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
     WHERE c.relname = 'venture_stage_work'
       AND c.relnamespace = 'public'::regnamespace
       AND p.polname = 'venture_stage_work_select_policy';
    IF select_policy_count <> 1 THEN
        RAISE EXCEPTION 'venture_stage_work_select_policy is missing or duplicated after this fix (count=%).', select_policy_count;
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM pg_policy p
          JOIN pg_class c ON c.oid = p.polrelid
          JOIN pg_roles r ON r.oid = ANY(p.polroles)
         WHERE c.relname = 'venture_stage_work'
           AND c.relnamespace = 'public'::regnamespace
           AND p.polname = 'venture_stage_work_select_policy'
           AND r.rolname = 'authenticated'
    ) THEN
        RAISE EXCEPTION 'venture_stage_work_select_policy no longer applies to authenticated.';
    END IF;
    IF select_policy_qual !~ 'fn_user_has_venture_access' THEN
        RAISE EXCEPTION 'venture_stage_work_select_policy no longer references fn_user_has_venture_access -- got: %', select_policy_qual;
    END IF;

    -- 3. anon no longer holds ANY of the five revoked table-level privileges.
    SELECT has_table_privilege('anon', 'public.venture_stage_work', 'SELECT') INTO anon_select;
    SELECT has_table_privilege('anon', 'public.venture_stage_work', 'INSERT') INTO anon_insert;
    SELECT has_table_privilege('anon', 'public.venture_stage_work', 'UPDATE') INTO anon_update;
    SELECT has_table_privilege('anon', 'public.venture_stage_work', 'DELETE') INTO anon_delete;
    SELECT has_table_privilege('anon', 'public.venture_stage_work', 'TRUNCATE') INTO anon_truncate;
    IF anon_select OR anon_insert OR anon_update OR anon_delete OR anon_truncate THEN
        RAISE EXCEPTION 'anon still holds a revoked privilege on venture_stage_work after REVOKE (select=%, insert=%, update=%, delete=%, truncate=%).',
            anon_select, anon_insert, anon_update, anon_delete, anon_truncate;
    END IF;

    -- 4. The other four legitimate policies (insert/update/delete/service-facing) are untouched
    --    by name -- this fix must be scoped to exactly the one over-permissive policy.
    IF (SELECT count(*) FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
         WHERE c.relname = 'venture_stage_work' AND c.relnamespace = 'public'::regnamespace
           AND p.polname IN ('venture_stage_work_insert_policy', 'venture_stage_work_update_policy', 'venture_stage_work_delete_policy')) <> 3 THEN
        RAISE EXCEPTION 'One or more of venture_stage_work_{insert,update,delete}_policy is missing -- this fix must not touch them.';
    END IF;
END $$;

COMMENT ON TABLE public.venture_stage_work IS
'SD-MAN-INFRA-VENTURE-CRACK-GATE-001 (FR-4/TR-3, 2026-08-18): venture_stage_work_modify (an
unrestricted PUBLIC SELECT USING(true) policy, plus anon table-level SELECT/INSERT/UPDATE/
DELETE/TRUNCATE grants) was dropped/revoked -- it duplicated and defeated the already-correct
venture_stage_work_select_policy (authenticated, fn_user_has_venture_access). This is a
precondition for FR-4 treating rows in this table as a deploy-authorization source; see this
SD''s PRD TR-3 and risk register.';

COMMIT;

-- ============================================================================================
-- AFTER APPLY: the apply exit code is not the acceptance. Run the companion acceptance script
-- (20260818_venture_stage_work_drop_public_select_acceptance.mjs) in --baseline mode BEFORE
-- apply (must show the leak) and --verify mode AFTER apply (must show it closed) -- read the
-- printed policy/grant state, not just the exit code, per this directory's established
-- convention (both a genuine pre-apply state and a silently-no-op'd apply can otherwise look
-- identical to a bare exit-code check).
-- ============================================================================================
