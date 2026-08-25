-- SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 — STEP 3 of 4: the canonical-writer choke on
-- public.ventures.current_lifecycle_stage.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
-- @approval-record: PENDING — chairman ratification not yet scheduled.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Everything in this file is proven against an EPHEMERAL vanilla PostgreSQL narrow stub
-- (tests/ddl/ventures-canonical-writer-choke-ddl.db.test.js), never against the real table. If this
-- file is ever found APPLIED without an @approved-by line above, that is itself a policy violation.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- APPLY-TIME REQUIREMENT — lock_timeout. NOT OPTIONAL.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CREATE TRIGGER takes an ACCESS EXCLUSIVE lock on ventures, blocking READS as well as writes.
-- service_role/postgres have no lock_timeout configured. The applying session MUST run, before any
-- statement below:
--
--     SET lock_timeout = '3s';
--
-- SQLSTATE 55P03 on apply means the guard worked; retry in a quiet window.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PRE-APPLY BLOCKER — every registered writer below must be VERIFIED LIVE stamping, first
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Applying this file before every writer below is actually deployed and observed stamping breaks
-- that writer instantly (SVCW1-class rejection on every one of its ventures.current_lifecycle_stage
-- writes).
--
-- CORRECTION (PLAN_VERIFICATION, VALIDATION finding B4): an earlier version of this checklist
-- pointed at `SELECT ... FROM ventures_canonical_writer_policy() WHERE capability_flags->>
-- 'stamp_wired' IS NOT TRUE`. That query is STRUCTURALLY INCAPABLE of ever finding anything --
-- capability_flags is a hardcoded literal inside this file's own VALUES list (every entry says
-- true), so it always returns zero rows regardless of whether step 2 is actually deployed. It
-- would read as "all clear" even if step 2 never shipped. There is no query against this
-- registry that can observe deployed-code reality; the registry describes intent, not fact. Use
-- the two checks below instead, each against something that CAN actually be wrong:
--
-- (a) The 4 DB-resident RPCs -- their LIVE function body is directly inspectable and IS the
--     ground truth (this genuinely catches "step 2 migration not yet applied"):
--
--   SELECT proname,
--          pg_get_functiondef(p.oid) LIKE '%stage_write_token = ''' || proname || '''%' AS self_stamped
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND proname IN ('advance_venture_stage', 'advance_venture_to_stage', 'fn_advance_venture_stage', 'rescan_stage_20');
--
--   Every row must show self_stamped = true. If any is false, step 2's migration has not applied to
--   this function yet -- do not proceed.
--
-- (b) The 5 JS/script writers (stage-execution-worker.js, venture-ceo-handlers.js,
--     saga-coordinator.js, eva-run.js, run-canary-probe.mjs) are APPLICATION CODE, not database
--     state -- no SQL query can observe whether the running process was built from a commit that
--     includes this SD's self-stamp changes. Confirm by DEPLOYMENT ARTIFACT, not inference: the EVA
--     daemon process's running commit SHA (or its most recent restart timestamp, cross-referenced
--     against this SD's merge commit) must be AT OR AFTER the merge of this SD's own EHG_Engineer
--     PR. If the daemon has not restarted onto post-merge code, its self-stamps do not exist yet
--     regardless of what main contains. Prefer directly exercising one real writer against a
--     staging/canary venture and confirming via `SELECT stage_write_token FROM ventures WHERE id =
--     <fixture>` immediately after the call (before the guard's own at-rest NULL-out fires) over
--     trusting a deploy timestamp alone.
--     The ehg-repo promote.ts route needed NO separate PR from this SD -- SD-LEO-INFRA-VENTURES-
--     CLIENT-WRITE-001's already-merged rickfelix/ehg#797 independently routed it (and 4 other
--     client-side call sites) through advance_venture_stage first. This SD's own promote.ts PR
--     (rickfelix/ehg#799) became a redundant no-op diff once #797 landed and was closed rather than
--     merged (2026-08-25) -- verified by resolving its merge conflict against origin/main and
--     confirming the file was byte-identical either way.
--
-- STEP 2 (20260825_ventures_stage_rpcs_self_stamp.sql + the paired JS/TS code deploys across both
-- EHG_Engineer and the ehg repo) MUST already be live before this file applies. This file's own
-- $precondition$ block only checks the COLUMN exists (step 1) — it cannot see whether step 2's code
-- is actually deployed, which is why this remains a human pre-apply checklist item, not a machine
-- gate — but the human checklist above now checks things that can genuinely be false.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EXPLICIT NON-COVERAGE — this is a CHOKE POINT, NOT AN ABSOLUTE BARRIER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Does not defend against: (1) an owner-role ALTER TABLE ... DISABLE TRIGGER bypass; (2) CI/operators
-- running psql directly against production; (3) a service_role caller that reverse-engineers and
-- copies an exact registry stamp string (that caller already has rolbypassrls=true and DISABLE
-- TRIGGER access, so forging a stamp gains it nothing new). Existing content-safety coverage
-- (enforce_stage_advancement_artifact_gate, live since 2026-07-11) is UNCHANGED by this file — it
-- guards artifact completeness for every forward advance regardless of writer identity; this file
-- adds the missing writer-IDENTITY axis only.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY TWO TRIGGERS, BOTH DOING FULL VALIDATION (PLAN-phase prospective TESTING finding
-- c60dbfef-ca0b-4675-bc40-f0eb851e6be8, F2/TS-7) — measured, not reasoned
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- aaa_ ALONE IS NOT SUFFICIENT. trg_validate_stage_column (BEFORE INSERT OR UPDATE, unconditional,
-- fn_validate_stage_column) coerces NEW.current_lifecycle_stage from NULL to 1 whenever a row with a
-- NULL stage is updated for ANY reason -- live-verified 2026-08-25 via pg_get_functiondef. Under
-- Postgres's byte-order (COLLATE "C") same-timing trigger ordering, aaa_ fires FIRST among all BEFORE
-- UPDATE triggers on public.ventures (before this coercion runs) and zzz_ fires LAST (after it). A
-- client writing an unrelated column on a NULL-stage row therefore reaches aaa_ with
-- NEW.current_lifecycle_stage IS DISTINCT FROM OLD.current_lifecycle_stage evaluating FALSE (NULL vs
-- NULL) -- aaa_ passes it with no stamp required. Only zzz_, re-checking the FINAL NEW after
-- trg_validate_stage_column's coercion, sees NULL -> 1 as a genuine change and requires a stamp.
-- Unlike the strategic_directives_v2 choke (whose second-trigger case was a same-table SIBLING
-- deriving a value), this one is caused by a mid-chain trigger the guard does not own or modify --
-- BOTH triggers must therefore run the IDENTICAL full validation logic, not merely "aaa_ + a NULL-at-
-- rest cleanup". zzz_ additionally performs the NULL-at-rest reset, matching the R5 convention.
--
-- Guard condition uses IS DISTINCT FROM, NEVER Postgres's UPDATE OF <col> syntax: UPDATE OF fires
-- when a column is MENTIONED in the SET clause, not when its value actually changes, and supabase-js
-- sends whole patch objects -- UPDATE OF would false-reject writes carrying an unchanged stage value.
--
-- FAIL-CLOSED on could-not-check: if the registry lookup itself errors, Postgres's BEFORE-trigger
-- semantics abort the whole UPDATE. That is the correct behavior for a hard DB-level guarantee.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- FR-5 — COMPOSITION WITH SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001's STAGED CLIENT-AXIS GUARD
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- That SD's ventures_block_client_governance_write_trg (database/chairman-gated/
-- 20260824_ventures_rls_integrity_repair.sql, ALSO staged-unapplied) blocks a client-role
-- (authenticated/anon) raw write of current_lifecycle_stage. Its trigger name starts with 'v', which
-- sorts AFTER aaa_ under COLLATE "C" -- so once THIS choke is live, a client-authenticated write
-- (which by construction carries no valid registry-matched stage_write_token) is refused by aaa_
-- FIRST and NEVER reaches that guard. Trigger name-collation order, not migration-apply order or
-- documented intent, is what actually governs composition here (a prospective TESTING correction --
-- the original PRD draft's "document apply order" mitigation had zero mechanical effect). This means
-- a single composed test cannot verify the client-axis guard's own logic is correct in isolation; it
-- will always appear to "work" because aaa_ masks it. Each guard's rejection logic must be verified
-- via an ISOLATION test (the other trigger temporarily disabled) -- see TS-6a/TS-6b in
-- tests/ddl/ventures-canonical-writer-choke-ddl.db.test.js. Once this choke is live, the client-axis
-- guard is effectively redundant for the identity-choke's own coverage (every path it would refuse is
-- already refused by aaa_/zzz_ for lacking a valid stamp) but is NOT removed here -- it remains a
-- second, independent layer of defense-in-depth against a caller that somehow forges a stamp, and
-- reconciling/removing it is out of this SD's scope.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — see companion 20260825_ventures_canonical_writer_choke_DOWN.sql (MODE 1: drops both
-- triggers + both functions, RETAINS the column and RPC self-stamps -- safe, no writer-side change).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- APPLY (chairman ceremony; two separate invocations):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260825_ventures_canonical_writer_choke.sql" \
--     --prod-deploy --allow-any-path
--
-- ROLLBACK FILE: 20260825_ventures_canonical_writer_choke_DOWN.sql
-- DDL PROOF:     tests/ddl/ventures-canonical-writer-choke-ddl.db.test.js
--
-- NOTE: no BEGIN;/COMMIT; here -- scripts/apply-migration.js wraps the file in its own transaction.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. PRECONDITION — the stamp column must ALREADY exist (step 1)
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ventures'
       AND column_name = 'stage_write_token'
  ) THEN
    RAISE EXCEPTION
      'ventures canonical-writer choke: ventures.stage_write_token does not exist. Apply '
      'database/chairman-gated/20260825_ventures_stage_write_token_column.sql FIRST (step 1 of 4), '
      'then re-run this ceremony.';
  END IF;
END
$precondition$;


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE REGISTRY — single source of truth for "who may write ventures.current_lifecycle_stage"
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- Modeled on sd_canonical_writer_policy()'s SSOT pattern (inline VALUES clause, no backing table).
-- Calling with p_writer_identity => NULL returns the whole registry; with a value, 0 or 1 rows (the
-- guard's EXISTS() predicate). capability_flags.stamp_wired is queryable on purpose -- see the
-- PRE-APPLY BLOCKER note above.
CREATE OR REPLACE FUNCTION public.ventures_canonical_writer_policy(p_writer_identity text DEFAULT NULL)
 RETURNS TABLE(writer_identity text, capability_flags jsonb, notes text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH registry(writer_identity, capability_flags, notes) AS (
    VALUES
      -- ── DB-RESIDENT RPCs (self-stamping wired in step 2, 20260825_ventures_stage_rpcs_self_stamp.sql)
      ('advance_venture_stage'::text,
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC. Frontend-initiated + EVA-initiated forward advance. Also closes the promotion-gate array gap (FR-3) via the venture_stages SSOT read.'::text),
      ('advance_venture_to_stage',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC. Single-stage-advance path used by orchestrator bootstrap flows.'),
      ('rescan_stage_20',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC. Stage 20->21 auto-advance on terminal-SD + deployment-artifact verification.'),
      ('fn_advance_venture_stage',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC, the EVA-daemon-path advance. Discovered mid-EXEC (not in the original writer census): lib/eva/artifact-persistence-service.js''s advanceStage() -- documented there as the primary general-advance call path -- calls this function, not advance_venture_stage.'),

      -- ── EVA STAGE MACHINERY (JS, self-stamping wired in step 2's code deploy) ──────────────────
      ('stage-execution-worker.js',
       '{"surface":"eva_daemon","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'lib/eva/stage-execution-worker.js. ONE identity covering all 3 write call sites (forward advance in _advanceStage, and the two chairman-gate/high-consequence revert-to-review-stage sites) -- all are the same daemon-walk authority, not distinct writers.'),
      ('venture-ceo-handlers.js',
       '{"surface":"eva_agent","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'lib/agents/venture-ceo/handlers.js _updateVentureProgress (line ~665). Ad-hoc CEO-runtime forward advance, gated by checkStageArtifactPrecondition (SD-LEO-INFRA-MINUS-GATE-SSOT-001 FR-5) before this SD; now also stamped.'),
      ('saga-coordinator.js',
       '{"surface":"eva_compensation","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'lib/eva/saga-coordinator.js createStageCompensation(). Revert-only (backward) compensation write for a failed saga step -- registered distinctly, not folded into stage-execution-worker.js, since it is a genuinely different call path with its own authority to revert.'),
      ('eva-run.js',
       '{"surface":"operator_tool","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'scripts/eva-run.js --stage flag. Operator-invoked manual stage override before an orchestration run.'),
      ('run-canary-probe.mjs',
       '{"surface":"operator_tool","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'scripts/canary/run-canary-probe.mjs deterministic full-pass reset (stage -> 1) on the fenced canary venture fixture.'),
      ('reconciliation-packet-apply.mjs',
       '{"surface":"operator_tool","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'scripts/reconciliation-packet-apply.mjs (SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 FR-4). Applies a frozen-then-ratified stage value via advance_venture_stage/advance_venture_to_stage -- itself calls a registered RPC rather than writing raw, so this identity is a passthrough label for audit legibility, never used to bypass the RPCs'' own checks.'),

      -- ── ehg REPO (routed through advance_venture_stage in step 2, not a raw write) ─────────────
      ('ehg:promote.ts',
       '{"surface":"api_route","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/pages/api/v2/ventures/[id]/promote.ts, Stage 0->1 promotion. Routed through supabase.rpc(''advance_venture_stage'') (matching src/lib/ventures/advanceStage.ts''s existing pattern) rather than a raw client-authenticated .update() -- the identity here is advance_venture_stage''s own stamp; this registry row exists for the writer-inventory census, not as a separate stamping caller. Landed via SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 (rickfelix/ehg#797), independently of this SD -- verified live on origin/main 2026-08-25.'),

      -- ── ehg REPO writer found by a parallel multi-agent census after this SD's initial writer
      -- inventory (PLAN_VERIFICATION, post-handoff) -- missed by the original 19-path count because
      -- scripts/lint/stage-advancement-chokepoint-lint.mjs's RUNTIME_DIRS is EHG_Engineer-relative
      -- and cannot see the ehg repo at all, and the LEAD-phase census only checked promote.ts there.
      ('stage24-go-live-route.ts',
       '{"surface":"api_route","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo app/api/stage24/[ventureId]/go-live/route.ts performLaunch(), Stage 23->24 launch. Uses the SERVICE ROLE (bypasses RLS entirely) for a compound write (launched_at + current_lifecycle_stage=24 + deployment_url + an idempotency guard on launched_at IS NULL) -- the highest-severity of the found gaps, since a service_role write has no RLS fallback to fail safely into and would 500 on every launch the instant this choke arms unregistered.'),

      -- ── ehg REPO writers CENSUSED, now PASSTHROUGH callers of the registered RPC (not raw
      -- writers): SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 independently routed all 4 of these
      -- through advance_venture_stage (rickfelix/ehg, merged into origin/main 2026-08-25) while
      -- this SD's own writer-completeness fix branch was open -- discovered when resolving that
      -- branch's merge conflict against origin/main. Same passthrough shape as
      -- reconciliation-packet-apply.mjs above: stamp_wired:true because none of these performs a
      -- raw, bypass-capable write anymore, not because they carry their own stamp.
      ('chairman-decide.ts',
       '{"surface":"api_route","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/pages/api/v2/chairman/decide.ts, "proceed" decision branch. Routed through supabase.rpc(''advance_venture_stage'') by SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 -- no longer a raw write.'),
      ('evaRollback.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/services/evaRollback.ts, rollback-to-previous-stage. Routed through supabase.rpc(''advance_venture_stage'', p_transition_type=''rollback'') by SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 -- no longer a raw write.'),
      ('evaStateMachines.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/services/evaStateMachines.ts, state-machine stage-advance. Routed through supabase.rpc(''advance_venture_stage'', p_transition_type=''automatic'') by SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 -- no longer a raw write.'),
      ('recursionEngine.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/services/recursionEngine.ts updateWorkflowState(). Routed through supabase.rpc(''advance_venture_stage'', p_transition_type=''rollback'') by SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 -- no longer a raw write.'),

      -- ── ehg REPO writers CENSUSED but genuinely NOT self-stamped: live-verified RLS-BLOCKED
      -- TODAY (public.ventures has exactly two policies -- "Allow service_role to manage ventures"
      -- ALL and "authenticated_read_ventures" SELECT -- no authenticated UPDATE policy exists at
      -- all), so every write below already 0-rows-silently under RLS before it can ever reach this
      -- guard's BEFORE UPDATE trigger. stamp_wired:false is accurate, not a gap: stamping a write
      -- that RLS already filters out has no effect, and these rows exist for census completeness
      -- (this SD's own stated purpose) rather than to authorize a reachable write path. Unlike the
      -- 4 above, SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 deliberately left these two unchanged (its
      -- own README: "no derivable from-stage / initialization-only writes"). If RLS posture on
      -- ventures ever changes to add an authenticated UPDATE policy, these become real gaps and
      -- must be revisited -- audited 2026-08-25.
      ('scaffoldStage1',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'ehg repo src/services/ventures.ts scaffoldStage1(), venture-initialization write (stage=1). Anon-key browser client, only imported from .tsx components/hooks. RLS-blocked today (see class note above).'),
      ('useVentureData.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'ehg repo src/hooks/useVentureData.ts useUpdateVenture(), conditional stage write inside a general venture-edit mutation. React Query hook, browser-only by construction. RLS-blocked today (see class note above) -- in fact the WHOLE mutation is blocked, not just the stage field, a separate pre-existing bug unrelated to this SD.'),
      ('initialize_venture_stages',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'Live DB function (database/migrations/20260530_childF_repoint_readers_to_venture_stages.sql:270, GRANT EXECUTE TO authenticated per 20251206_factory_architecture.sql:606), sets current_lifecycle_stage=1. No JS/TS caller found in either repo as of 2026-08-25 (grepped both repos; only hits are the ehg repo''s auto-generated types.ts and an archived one-time migration script) -- registered for completeness since it remains directly RPC-invokable by any authenticated caller with EXECUTE, independent of whether anything currently calls it.')
  )
  SELECT r.writer_identity, r.capability_flags, r.notes
  FROM registry r
  WHERE p_writer_identity IS NULL OR r.writer_identity = p_writer_identity
$function$;

-- service_role only: every write path above runs as service_role (EVA daemon, RPCs are SECURITY
-- DEFINER but the GUARD runs as the invoker's role at UPDATE time via PostgREST, which for every
-- registered writer here is service_role). anon/authenticated are deliberately excluded from this
-- function's own grant -- but that grant is orthogonal to what actually stops a client write today.
-- CORRECTION (adversarial SECURITY review S-H4): this guard alone does NOT refuse a client write "for
-- lacking a valid stamp" the way the original comment here claimed -- a stamp is a free-text column
-- value, and nothing prevents a client from supplying one it read out of this very registry unless
-- something else blocks the write first. What actually stops anon/authenticated from reaching
-- current_lifecycle_stage today is that public.ventures currently has NO authenticated UPDATE RLS
-- policy at all -- a fact this guard does not create and must not be read as providing. The staged
-- (also unapplied) SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 migration is what ADDS an authenticated
-- UPDATE policy in the first place, gated by its own ventures_block_client_governance_write_trg
-- (see FR-5 composition notes below) -- this SD's own guard is a writer-IDENTITY check, not a
-- client-authorization boundary, and must not be relied on as one.
GRANT EXECUTE ON FUNCTION public.ventures_canonical_writer_policy(text) TO service_role;


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE GUARD — ONE function, TWO triggers (aaa_ first, zzz_ last, both full-validation)
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_canonical_stage_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_protected_changed boolean;
BEGIN
  v_protected_changed := NEW.current_lifecycle_stage IS DISTINCT FROM OLD.current_lifecycle_stage;

  IF v_protected_changed THEN
    IF NEW.stage_write_token IS NULL THEN
      RAISE EXCEPTION 'missing canonical-writer stamp on protected-column write'
        USING ERRCODE = 'SVCW1',
              DETAIL  = format(
                'guard=%s venture=%s current_lifecycle_stage:%s->%s',
                TG_NAME, NEW.id, OLD.current_lifecycle_stage, NEW.current_lifecycle_stage),
              HINT    = 'Set stage_write_token to your registry identity in the SAME UPDATE statement. Enumerate valid identities with: SELECT writer_identity FROM public.ventures_canonical_writer_policy();';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.ventures_canonical_writer_policy(NEW.stage_write_token)
    ) THEN
      RAISE EXCEPTION 'stamp value not present in canonical-writer registry'
        USING ERRCODE = 'SVCW1',
              DETAIL  = format('guard=%s venture=%s rejected_identity=%L', TG_NAME, NEW.id, NEW.stage_write_token),
              HINT    = 'Enumerate valid identities with: SELECT writer_identity FROM public.ventures_canonical_writer_policy();';
    END IF;
  END IF;

  -- NULL-at-rest cleanup, unconditional so a coordination-only write that happens to carry a stamp
  -- never leaves a valid value at rest for the next unstamped write to inherit.
  IF TG_ARGV[0] = 'final' THEN
    NEW.stage_write_token := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS aaa_enforce_canonical_stage_write ON public.ventures;
DROP TRIGGER IF EXISTS zzz_enforce_canonical_stage_write_final ON public.ventures;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- AT-REST RESET — required for re-apply-after-rollback safety, a no-op on first apply
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $reset_at_rest$
DECLARE
  v_cleared bigint;
  v_left    bigint;
BEGIN
  UPDATE public.ventures
     SET stage_write_token = NULL
   WHERE stage_write_token IS NOT NULL;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  SELECT count(*) INTO v_left
    FROM public.ventures WHERE stage_write_token IS NOT NULL;
  IF v_left <> 0 THEN
    RAISE EXCEPTION 'ventures canonical-writer choke: % row(s) still carry a stamp at rest after the reset — the guard would re-arm blind. Refusing to deploy.', v_left;
  END IF;

  IF v_cleared > 0 THEN
    RAISE NOTICE 'ventures canonical-writer choke: cleared % inherited at-rest stamp(s) before arming the guard (expected only on a re-apply after a MODE 1 rollback).', v_cleared;
  END IF;
END
$reset_at_rest$;

-- aaa_ sorts first among ALL BEFORE ROW triggers on public.ventures under COLLATE "C" byte order
-- (live-verified 2026-08-25 against the 12 existing BEFORE triggers on this table -- earliest
-- existing name is auto_populate_company_id_trigger, 'a'+'a' < 'a'+'u'). No existing trigger name
-- begins with a digit or uppercase letter.
CREATE TRIGGER aaa_enforce_canonical_stage_write
  BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_stage_write('early');

-- zzz_ sorts last (latest existing name is update_ventures_updated_at, 'z' > 'u'). This is the one
-- that observes the FINAL NEW tuple after trg_validate_stage_column's mid-chain NULL->1 coercion, and
-- the only one that nulls the stamp at rest.
CREATE TRIGGER zzz_enforce_canonical_stage_write_final
  BEFORE UPDATE ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public.enforce_canonical_stage_write('final');

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3b. INSERT-time reset — closes the "insert with a stamp, then coast on it" bypass
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- enforce_canonical_stage_write() dereferences OLD and cannot run on INSERT (OLD is unassigned for
-- an INSERT-row trigger). Without this, a caller could INSERT a row with stage_write_token already
-- set to a valid registry identity; a later BEFORE-UPDATE NEW inherits any column absent from the
-- UPDATE's SET clause, so an unstamped UPDATE of current_lifecycle_stage on that row would still see
-- a non-NULL OLD.stage_write_token and could be crafted to pass -- one free bypass per inserted row,
-- contradicting the "structurally NULL at rest" invariant in 20260825_ventures_stage_write_token_column.sql.
CREATE OR REPLACE FUNCTION public.reset_stage_write_token_on_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  NEW.stage_write_token := NULL;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS aaa_reset_canonical_stage_write_token_insert ON public.ventures;

CREATE TRIGGER aaa_reset_canonical_stage_write_token_insert
  BEFORE INSERT ON public.ventures
  FOR EACH ROW EXECUTE FUNCTION public.reset_stage_write_token_on_insert();


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 4. Post-apply verification — the trigger sort bound, no UPDATE OF usage
-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- NOTE: this file does NOT self-check "stamp_wired" against the registry above -- that registry is
-- a hardcoded VALUES list in THIS SAME FILE, so any such check would be tautological (always true)
-- and would read as a machine gate while verifying nothing. The real pre-apply check is the human
-- one in the header above (query ventures_canonical_writer_policy() against the LIVE, already-
-- deployed step-2 code, not this file's own literal text).
DO $verify$
DECLARE
  v_min_before_trigger text;
  v_max_before_trigger text;
BEGIN
  SELECT min(t.tgname), max(t.tgname)
    INTO v_min_before_trigger, v_max_before_trigger
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'ventures' AND NOT t.tgisinternal
     AND t.tgtype & 1 = 1    -- ROW-level (excludes statement-level triggers)
     AND t.tgtype & 2 = 2    -- BEFORE
     AND t.tgtype & 16 = 16; -- UPDATE

  IF v_min_before_trigger <> 'aaa_enforce_canonical_stage_write' THEN
    RAISE EXCEPTION 'ventures canonical-writer choke: aaa_enforce_canonical_stage_write does not sort first among BEFORE UPDATE triggers (found: %). A trigger with a lower-sorting name was added after this file was authored — the FR-2/TR-3 ordering guarantee no longer holds.', v_min_before_trigger;
  END IF;
  IF v_max_before_trigger <> 'zzz_enforce_canonical_stage_write_final' THEN
    RAISE EXCEPTION 'ventures canonical-writer choke: zzz_enforce_canonical_stage_write_final does not sort last among BEFORE UPDATE triggers (found: %).', v_max_before_trigger;
  END IF;
END
$verify$;
