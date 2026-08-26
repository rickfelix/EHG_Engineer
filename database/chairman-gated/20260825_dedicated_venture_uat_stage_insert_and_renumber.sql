-- SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B — insert the dedicated venture-UAT venture_stages
-- row and renumber stage_number 23-26 to 24-27.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
-- @approval-record: PENDING — chairman ratification not yet scheduled. DO NOT APPLY.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- REVISION NOTE (round 2, same EXEC pass): an independent adversarial TESTING sub-agent review of
-- the round-1 version of this file, run against the LIVE database and in rolled-back-transaction
-- probes, found it would abort on its own first statement and would not have avoided the very
-- collision it claimed to avoid. That review is the reason this file looks the way it does below.
-- Two round-1 defects were CRITICAL and empirically proven, not inferred:
--   (a) the quiescence preflight referenced venture_stage_transitions.completed_at, a column that
--       does not exist on this table (venture_stage_transitions is an append-only, already-
--       completed transition LOG written by the RPCs below at the END of a successful transition
--       -- it has no "in progress" row shape at all, so this migration's live-transition check
--       belongs against venture_stage_work.stage_status instead, fixed below);
--   (b) the single-statement UPDATE...FROM renumber does NOT avoid the stage_number PRIMARY KEY
--       collision it claimed to (proven: PostgreSQL enforces a non-deferred PK per row during
--       statement execution, not only at statement end) -- fixed below via a two-phase
--       negative-intermediate shift (flip to negative stage_number first, an intermediate value no
--       live row can collide with, then land on the final positive value in a second statement).
-- The same review also found this migration touched an irreversible go_live gate on live
-- production venture data while never actually shifting the LIVE state pointers that reference
-- stage_number (ventures.current_lifecycle_stage, chairman_decisions.lifecycle_stage,
-- venture_stage_work.lifecycle_stage) -- and, independently found while fixing that gap, that
-- ventures.current_lifecycle_stage carries its OWN hardcoded CHECK (<= 26), a FOURTH occurrence of
-- the stale upper bound beyond the two RPCs (FR-9) and stage-execution-worker.js/stage-templates
-- (TS-8) already known -- which would have made the new top stage (27) categorically unreachable
-- via ANY path, RPC bound fix or not, until this constraint is also widened. Both
-- venture_stage_work and chairman_decisions carry their OWN compound UNIQUE constraints involving
-- their stage column, so both also use the two-phase negative-intermediate technique, not a plain
-- +1 UPDATE.
--
-- This migration touches an irreversible go_live gate (stage_key='go_live', currently
-- stage_number=24, promotion + is_irreversible=true) on live production venture data. Blast
-- radius contract: docs/audits/stage-21-26-census.md (Child A's committed census, 3805 code
-- findings across both repos, negative-control PASS). Run the precondition gate immediately
-- before any apply attempt:
--
--   node scripts/eva/uat-stage-migration-preconditions.mjs
--
-- That script re-verifies (FR-1) the writer-choke + gate-array mechanisms have not drifted since
-- this file was authored, checks stage-quiescence (FR-2), and classifies every venture parked at
-- a shifted stage as demo/real (FR-6) -- it exits non-zero and refuses if any check fails. As of
-- this revision, TWO REAL (is_demo=false) ventures are currently parked in the shift range
-- (MarketLens at stage 24, DataDistill at stage 26, both status=cancelled) -- the classifier
-- correctly blocks on this; a chairman ceremony cannot proceed until those are resolved or an
-- explicit override is exercised. This SD's own originally-stated hard blocker had already
-- shipped before the SD was even created (proof this class of drift is real, not hypothetical) --
-- do not skip this step, and DO NOT trust any premise in this file about "zero real ventures
-- parked" without re-measuring at apply time.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- ADDITIONAL PRE-CEREMONY BLOCKER (round-2 TESTING review, NOT yet fixed) -- READ BEFORE SCHEDULING
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- A round-2 adversarial TESTING pass, empirically probing the LIVE schema beyond this file's own
-- direct-shift/shim taxonomy above, found the taxonomy is incomplete: a THIRD category of
-- stage-keyed LIVE CONFIGURATION exists, distinct from both "live state" (ventures/
-- chairman_decisions/venture_stage_work, now shifted) and "historical log" (venture_stage_
-- transitions/eva_stage_gate_attempts/stage_events, now shimmed). This migration does NOT shift or
-- shim any of the following, and MUST NOT be chairman-approved until each has an explicit,
-- individually-measured disposition (shift, shim, or accepted-as-broken with a stated reason):
--   * public.eva_ventures -- an AFTER UPDATE-triggered mirror of ventures.current_lifecycle_stage
--     (trg_ventures_update_sync_eva) carrying its OWN two separate CHECK constraints
--     (chk_lifecycle_stage, eva_ventures_current_lifecycle_stage_check), BOTH still capped at 26 --
--     empirically proven live to reject a real venture's sync to stage 27 with a 23514 violation.
--     This means stage 27 remains categorically unreachable for any non-demo venture even after
--     every fix in this file, until both constraints are also widened. The trigger's own
--     is_demo=true early-return additionally means every demo venture this migration shifts is
--     left with a STALE (-1) eva_ventures mirror value -- a silent cross-table divergence.
--   * public.stage_artifact_requirements -- stage_number-keyed artifact-gating config read by
--     fn_stage_artifact_precondition()'s legacy_fallback branch. Empirically proven live: because
--     the new UAT stage's required_artifacts is empty, advance_venture_stage()'s artifact
--     precondition check falls through to this table's STALE stage-23 row (still describing
--     launch_readiness_checklist), turning the deliberately gate-free new UAT stage into a hard
--     stop by construction for every venture that reaches it.
--   * public.gate_boundary_config -- read live by lib/eva/reality-gates.js's _loadBoundaryFromDB().
--   * public.venture_stage_cutover_grandfather -- read AND DELETEd by fn_advance_venture_stage()
--     itself (this same file) and by lib/eva/chairman-decision-watcher.js.
--   * public.stage_prop_contracts, public.eva_stage_gate_results (distinct from the shimmed
--     eva_stage_gate_attempts), public.venture_capture_snapshots, public.stage_executions,
--     public.venture_artifacts.lifecycle_stage -- all carry live rows in the 23-26 range with no
--     stated disposition in this file.
-- This is a materially larger surface than a few extra UPDATE statements can safely absorb inside
-- an already-large EXEC pass without its own independent review -- it is the DATA-side counterpart
-- to Child A's docs/audits/stage-21-26-census.md (which censused CODE references only). Recorded
-- as a completion-flag finding recommending a dedicated follow-up SD for a systematic stage-keyed
-- DATA/config table census before this file is scheduled for chairman ratification.
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql" \
--     --prod-deploy --allow-any-path
--   A DRY RUN (apply-migration.js with no --prod-deploy) MUST be run and its output inspected
--   before the real apply -- the round-1 defects above would have been caught instantly by a
--   dry run that nobody ran; do not repeat that mistake.
--
-- NOTE: no BEGIN;/COMMIT; here -- scripts/apply-migration.js wraps the file in its own
-- transaction (and holds an advisory lock), matching every other file in this directory.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES (one transaction)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Preflight: stage-quiescent freeze (live venture_stage_work.stage_status, FR-2), parked-REAL-
--    venture block (FR-6, enforced HERE at the DDL level, not only in the skippable Node script),
--    and an advisory_checkpoints zero-rows-in-range check (its stage_number FK into venture_stages
--    has no ON UPDATE CASCADE).
-- 2. Two-phase negative-intermediate renumber of venture_stages.stage_number 23-26 -> 24-27
--    (depends_on re-linked +1 in the same second-phase statement), guarded to run only once.
-- 3. INSERT the new dedicated-venture-UAT row at the now-vacant stage_number=23, carrying the
--    metadata.gates.uat_robustness_required=true marker Child C's lib/eva/uat-robustness-gate.js
--    already ships and is waiting on.
-- 4. Widen ventures.current_lifecycle_stage's CHECK bound to <= 27, then shift any ventures
--    currently parked in 23-26 (demo-only, per the preflight block) by +1.
-- 5. Two-phase negative-intermediate shift of chairman_decisions.lifecycle_stage and
--    venture_stage_work.lifecycle_stage for rows in 23-26 (both LIVE, RPC-read state, not
--    historical logs -- unlike the two FR-4 shim tables below, these must stay valid for the
--    RPCs' own `WHERE lifecycle_stage = p_from_stage` lookups to keep working post-apply).
-- 6. CREATE OR REPLACE both advance_venture_stage() and fn_advance_venture_stage() with their
--    hardcoded `p_to_stage > 26` bound updated to `> 27` (FR-9).
-- 7. CREATE OR REPLACE ventures_canonical_writer_policy() with one new registry row (FR-7).
-- 8. CREATE OR REPLACE the translate-at-read shim (FR-4, extended to stage_events -- see note
--    below) reconciled against the REAL 20260322 precedent.
-- 9. Post-apply readback verification.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DIRECT SHIFT vs SHIM-ONLY: why chairman_decisions/venture_stage_work move, but
-- venture_stage_transitions/eva_stage_gate_attempts/stage_events do not
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- FR-4 named venture_stage_transitions and eva_stage_gate_attempts as historical, append-only
-- records that must never be UPDATEd -- read through the shim only. chairman_decisions and
-- venture_stage_work are different in kind: both RPCs perform LIVE, ongoing lookups against them
-- (`WHERE lifecycle_stage = p_from_stage AND status = 'approved'`, `WHERE lifecycle_stage =
-- p_from_stage` UPDATE) as part of every future advance call -- if left stale, a real chairman
-- approval or an in-progress stage-work row would silently stop matching the RPCs' own queries.
-- These two are therefore shifted directly, in the SAME migration, using the same two-phase
-- technique venture_stages needs (both carry a compound UNIQUE constraint on their stage column).
-- stage_events, by contrast, is a genuinely append-only event LOG (event_type IN ('STAGE_ENTRY',
-- 'STAGE_COMPLETE', ...)) with no RPC ever reading it back by stage_number to gate a decision --
-- found during this revision to share venture_stage_transitions' exact "historical record, not
-- live state" shape, so it is added to the shim's coverage (a new
-- stage_events_current_scheme view) rather than direct-shifted, consistent with FR-4's own
-- philosophy rather than contradicting it.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DOCUMENTED, NOT FIXED (deliberately out of this SD's scope -- see rationale below)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- (a) p_from_stage/p_to_stage "product review" choke-point literal -- SQL side FIXED in round 2,
--     JS side still deliberately stale. An independent SECURITY sub-agent review (finding H-3)
--     disagreed with round 1's "leave both stale, consistency beats correctness" disposition for
--     the SQL half specifically: section 5a of this migration already MOVES this stage's approved
--     product_review decisions from lifecycle_stage=23 to 24 -- leaving fn_advance_venture_stage()'s
--     predicate reading `p_from_stage = 23 AND p_to_stage = 24` would have the gate look for an
--     approval at EXACTLY the stage the data was just moved away from, manufacturing (not merely
--     inheriting) a desynchronization on the path into the irreversible go_live gate. That is a
--     security regression, not cosmetic staleness, so the SQL predicate below is updated to
--     `p_from_stage = 24 AND p_to_stage = 25` in this same migration.
--     The JS daemon-walk backstop (lib/eva/stage-execution-worker.js:2971, `if (fromStage === 23
--     && toStage === 24)`, plus a `.eq('lifecycle_stage', 23)` query filter a few lines below) is
--     LEFT UNCHANGED. Since fn_advance_venture_stage() is documented elsewhere in this file as
--     "the primary general-advance call path", the JS backstop firing on a (fromStage=23,
--     toStage=24) pair that no longer occurs for a real forward advance (the equivalent real
--     transition is now 24->25) simply stops firing -- it becomes a redundant no-op rather than
--     an actively-wrong-permissive check, since the RPC's own (now-corrected) gate remains the
--     enforcing layer. This is judged net-safe to leave alone: unlike the round-1 "leave both
--     stale together" framing, no new permissive gap is introduced by fixing only the SQL side.
--     That file's two `await import('./stage-templates/stage-23.js')` dynamic imports (lines 1028,
--     1556) will still resolve to the wrong stage post-renumber, lib/eva/stage-templates/ still has
--     no stage-27.js for the new top stage, and lib/eva/chairman-product-review.js's own stage
--     assumptions remain unaudited by this SD -- all three still triaged as their own dedicated,
--     independently-reviewed follow-up SD, per TS-8's own contract ("either updated... or the
--     PRD/migration explicitly documents why the check/filename intentionally stays stale-named").
-- (b) lib/eva/contracts/stage-contracts.js:619-627 -- a THIRD hardcoded stage-number map (a plain
--     object literal keyed 23/24/25/26, each value an array of upstream-dependency stage numbers)
--     found during this revision's re-verification, entirely outside FR-5's named 2-file scope
--     (lib/eva/gate-bars.js, ehg's useLaunchWorkflow.ts) and outside this migration's own blast
--     radius. Not fixed here for the same reason as (a): unknown consumer set, not independently
--     reviewed, and this SD's scope is already large. Flagged as a completion-flag finding.
-- (c) lib/eva/uat-robustness-gate.js:59's comment ("every valid stage_number 1-26 has a row")
--     becomes stale (1-27) post-apply -- comment-only, no functional check reads this literal
--     (verified: the function's actual guard is a generic "row not found" check, not a numeric
--     bound), left unchanged as a cosmetic, non-functional staleness matching the tolerated
--     component_path drift precedent from the 20260607 swap.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- -1. LOCK, FIRST STATEMENT IN THE FILE. SECURITY finding H-2: without an explicit table lock,
--    apply-migration.js's plain BEGIN (READ COMMITTED, no LOCK TABLE) means the FR-6/FR-2
--    preflight guarantees below only hold at the instant they run -- a concurrently-committed
--    advance could move a real venture into 23-26, or a venture into an in-progress
--    venture_stage_work row, in the window between the preflight and the first exclusive
--    ALTER/UPDATE later in this file, and the post-apply verify (snapshot-joined) cannot observe
--    a row that entered after its own snapshot. Locking ALL FOUR affected tables ACCESS EXCLUSIVE
--    here makes the preflight's guarantee hold to COMMIT, at negligible cost for a one-time,
--    already fully-serialized (advisory-locked by apply-migration.js) ceremony.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
LOCK TABLE public.ventures, public.venture_stages, public.chairman_decisions, public.venture_stage_work
  IN ACCESS EXCLUSIVE MODE;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 0. PRECONDITION -- stage-quiescent freeze (FR-2), parked-REAL-venture block (FR-6, enforced at
--    the DDL level per the round-1 review's finding that it previously was NOT), and the
--    advisory_checkpoints FK-hazard check.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_in_flight INTEGER;
  v_real_parked INTEGER;
  v_advisory_in_range INTEGER;
  v_have_2326 INTEGER;
BEGIN
  -- FR-2: a venture is "mid-transition" through a stage when it has a LIVE (not yet
  -- completed/skipped) venture_stage_work row there. venture_stage_transitions has no such
  -- concept -- it is an append-only log the RPCs write to AFTER a transition already succeeded,
  -- in the SAME statement/transaction as the ventures update, so it can never observe an
  -- in-progress state at all (round-1 defect: it referenced a completed_at column that does not
  -- exist on that table).
  SELECT count(*) INTO v_in_flight
  FROM public.venture_stage_work
  WHERE lifecycle_stage BETWEEN 23 AND 26
    AND stage_status = 'in_progress';
  IF v_in_flight <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % venture(s) currently mid-transition (venture_stage_work.stage_status=in_progress) through stage 23-26; refusing to renumber underneath live ventures (FR-2).', v_in_flight;
  END IF;

  -- FR-6, enforced here (not only in the skippable Node precondition script): refuse outright if
  -- any REAL (is_demo=false) venture is currently parked at a shifted stage_number.
  SELECT count(*) INTO v_real_parked
  FROM public.ventures
  WHERE current_lifecycle_stage BETWEEN 23 AND 26
    AND is_demo IS NOT TRUE;
  IF v_real_parked <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % REAL (is_demo=false) venture(s) parked at a shifted stage (23-26); refusing to proceed without explicit chairman review (FR-6).', v_real_parked;
  END IF;

  -- advisory_checkpoints.stage_number FKs into venture_stages(stage_number) with no ON UPDATE
  -- CASCADE -- a row in the shift range would block the renumber with a raw FK error instead of
  -- this named one.
  SELECT count(*) INTO v_advisory_in_range
  FROM public.advisory_checkpoints
  WHERE stage_number BETWEEN 23 AND 26;
  IF v_advisory_in_range <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % advisory_checkpoints row(s) reference stage_number 23-26 (no ON UPDATE CASCADE on that FK); resolve before renumbering.', v_advisory_in_range;
  END IF;

  -- Idempotency short-circuit: if the shift has already run, stage_number 23-26 no longer
  -- holds the 4 rows this migration expects to move (23 now holds the new UAT row instead).
  -- Only enforce the "exactly 4 rows" shape check on a FIRST run.
  IF NOT EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    SELECT count(*) INTO v_have_2326 FROM public.venture_stages WHERE stage_number BETWEEN 23 AND 26;
    IF v_have_2326 <> 4 THEN
      RAISE EXCEPTION 'PREFLIGHT FAILED: expected exactly 4 rows at stage_number 23-26, found %', v_have_2326;
    END IF;
  END IF;
END
$preflight$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. PRE-APPLY SNAPSHOT -- captured into transaction-scoped temp tables so the post-apply readback
--    can assert against real pre-apply values. Capture is GUARDED (only runs when this is a first
--    apply attempt), mirroring the SAME guard the renumber block below uses -- found by an
--    independent round-2 adversarial TESTING review: capturing unconditionally meant a SECOND
--    (idempotent, no-op) run captured the ALREADY-shifted rows as if they were "pre-apply", and
--    the verify block then asserted current = captured+1 against values that were already
--    correct, producing a false POST-APPLY FAILED on a harmless re-run (the round-1 defect this
--    revision fixed, recurring one layer out -- moved from the mutation into the verifier).
--    Per-venture/decision/work-row snapshots, not a bare stage-range count: 24 and 25 are BOTH
--    legitimate old-shift-range AND new-shift-destination values (the ranges [23,26] and [24,27]
--    overlap heavily), so a bare count cannot distinguish "correctly shifted" from "never
--    touched" -- found by dry-running this file and getting a false-positive from exactly that
--    flawed check.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE IF NOT EXISTS _uat001b_pre_snapshot (
  stage_number integer, stage_key text, gate_type text, is_irreversible boolean, depends_on integer[]
) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _uat001b_ventures_pre_snapshot (id uuid, pre_stage integer) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _uat001b_cd_pre_snapshot (id uuid, pre_stage integer) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _uat001b_vsw_pre_snapshot (id uuid, pre_stage integer) ON COMMIT DROP;

DO $capture_snapshot$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    RETURN; -- already applied: leave all 4 snapshots empty, verify block's joins vacuously pass
  END IF;

  INSERT INTO _uat001b_pre_snapshot
  SELECT stage_number, stage_key, gate_type, is_irreversible, depends_on
  FROM public.venture_stages WHERE stage_number BETWEEN 23 AND 26;

  INSERT INTO _uat001b_ventures_pre_snapshot
  SELECT id, current_lifecycle_stage FROM public.ventures WHERE current_lifecycle_stage BETWEEN 23 AND 26;

  INSERT INTO _uat001b_cd_pre_snapshot
  SELECT id, lifecycle_stage FROM public.chairman_decisions WHERE lifecycle_stage BETWEEN 23 AND 26;

  INSERT INTO _uat001b_vsw_pre_snapshot
  SELECT id, lifecycle_stage FROM public.venture_stage_work WHERE lifecycle_stage BETWEEN 23 AND 26;
END
$capture_snapshot$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. FR-7 -- register the new dedicated-venture-UAT stage's writer(s) in
--    ventures_canonical_writer_policy()'s registry BEFORE the guarded block below, which stamps
--    ventures.current_lifecycle_stage writes with this identity -- enforce_canonical_stage_write()
--    validates the stamp against this SAME registry function, so the registration must already be
--    live before section 3 runs (found by dry-running this file: a naive "registry last" ordering
--    makes the DDL reject its own write with "stamp value not present in canonical-writer
--    registry"). Full VALUES list below is the LIVE registry (pg_get_functiondef, 2026-08-25) with
--    ONE new row appended at the end -- every existing row is reproduced verbatim; CREATE OR
--    REPLACE would otherwise silently drop them.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ventures_canonical_writer_policy(p_writer_identity text DEFAULT NULL::text)
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
       'Live DB function (database/migrations/20260530_childF_repoint_readers_to_venture_stages.sql:270, GRANT EXECUTE TO authenticated per 20251206_factory_architecture.sql:606), sets current_lifecycle_stage=1. No JS/TS caller found in either repo as of 2026-08-25 (grepped both repos; only hits are the ehg repo''s auto-generated types.ts and an archived one-time migration script) -- registered for completeness since it remains directly RPC-invokable by any authenticated caller with EXECUTE, independent of whether anything currently calls it.'),

      -- ── NEW: dedicated-venture-UAT stage (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, FR-7) ──────
      ('dedicated-venture-uat-stage',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'The dedicated-venture-UAT venture_stages row this migration inserts (stage_number=23, stage_key=dedicated_venture_uat). Transitions into/out of this stage are performed exclusively through the already-registered advance_venture_stage()/fn_advance_venture_stage() RPCs above (both read gate_type dynamically from venture_stages, per FR-3''s live re-verification finding that no code-level gate array exists left to re-anchor) -- this entry is a passthrough label for writer-census legibility over the new stage, not a distinct raw write path.')
  )
  SELECT r.writer_identity, r.capability_flags, r.notes
  FROM registry r
  WHERE p_writer_identity IS NULL OR r.writer_identity = p_writer_identity
$function$;

GRANT EXECUTE ON FUNCTION public.ventures_canonical_writer_policy(text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2b. FOUND BY DRY-RUNNING THIS FILE: fn_validate_stage_column() (BEFORE INSERT OR UPDATE trigger
--    on ventures) carries its OWN hardcoded `current_lifecycle_stage > 26` rejection, entirely
--    separate from the ventures_current_lifecycle_stage_check CHECK constraint widened below --
--    this is a FIFTH occurrence of the stale upper bound. Must run BEFORE section 3's ventures
--    UPDATE shifts a stage-26 row to 27, or that write is rejected by the OLD bound before the
--    CHECK-constraint widening even gets a chance to matter.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_stage_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.current_lifecycle_stage IS NULL THEN
    NEW.current_lifecycle_stage := 1;
  END IF;

  -- Validate stage range (1-27 for the 27-stage lifecycle, post SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B)
  IF NEW.current_lifecycle_stage < 1 OR NEW.current_lifecycle_stage > 27 THEN
    RAISE EXCEPTION 'current_lifecycle_stage must be between 1 and 27, got %',
      NEW.current_lifecycle_stage;
  END IF;

  RETURN NEW;
END;
$function$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. GUARDED BLOCK: everything that must run exactly once (venture_stages renumber, the new
--    UAT row, and the live-state shifts) is wrapped in one IF NOT EXISTS guard so a second run of
--    this file is a true no-op for all of it (TS-9). The round-1 version guarded ONLY the INSERT
--    and relied on each UPDATE's own WHERE clause to be idempotent -- which failed (round-1 F3)
--    because a second run's WHERE clause matched the ALREADY-shifted rows again. A single shared
--    guard is simpler and correct by construction.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $renumber$
BEGIN
  IF EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    RAISE NOTICE 'DEDICATED-VENTURE-UAT-001-B: already applied (dedicated_venture_uat row present) -- skipping renumber, insert, and live-state shifts.';
    RETURN;
  END IF;

  -- 2. venture_stages: two-phase negative-intermediate shift. PostgreSQL enforces the
  --    non-deferred PRIMARY KEY (stage_number) per row during statement execution (proven live by
  --    the round-1 adversarial review), so a single-statement +1 collides with the row already
  --    occupying the target number. Phase A flips the 4 rows to negative stage_number -- no live
  --    row anywhere in the table has a negative stage_number, so this is collision-free by
  --    construction. Phase B lands each row on its final positive value and re-links depends_on
  --    +1 in the same statement (every row 20-26 already satisfies depends_on = {stage_number-1};
  --    shifting both by +1 together re-links the chain around the newly inserted row with no
  --    special-casing).
  UPDATE public.venture_stages
  SET stage_number = -stage_number, updated_at = now()
  WHERE stage_number BETWEEN 23 AND 26;

  UPDATE public.venture_stages
  SET stage_number = (-stage_number) + 1,
      depends_on   = ARRAY(SELECT unnest(depends_on) + 1),
      updated_at   = now()
  WHERE stage_number BETWEEN -26 AND -23;

  -- 3. INSERT the new dedicated-venture-UAT row at the now-vacant stage_number=23.
  --    metadata.gates.uat_robustness_required=true is the exact marker Child C's
  --    lib/eva/uat-robustness-gate.js already reads.
  INSERT INTO public.venture_stages (
    stage_number, stage_key, stage_name, description, app_description,
    phase_number, phase_name, chunk, gate_type, review_mode, work_type,
    depends_on, required_artifacts, metadata, is_high_consequence, is_irreversible
  ) VALUES (
    23,
    'dedicated_venture_uat',
    'Dedicated Venture UAT',
    'In-stage UAT robustness checkpoint: exercises the venture''s own signed-in and signed-out user journeys against the Solomon-C control pack (per-journey minimum-assertion manifest, live-deployment binding, run-unique evidence hashing) before Launch Readiness. Built by SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (lib/eva/uat-robustness-gate.js); activated by this row.',
    'Automated UAT robustness pass against the venture''s live deployment',
    5,
    'The Build',
    'THE_BUILD',
    'none',
    'auto',
    'automated_check',
    ARRAY[22]::integer[],
    ARRAY[]::text[],
    '{"gates":{"uat_robustness_required":true}}'::jsonb,
    false,
    false
  );

  -- 4. ventures.current_lifecycle_stage: FOUND DURING THIS REVISION (by actually dry-running this
  --    file) -- this column carries its OWN hardcoded CHECK (<= 26), and fn_validate_stage_column()
  --    carries a SEPARATE hardcoded duplicate of that same bound (both fixed below/above) -- a
  --    FOURTH and FIFTH occurrence of the stale upper bound beyond the two RPCs (FR-9) and the
  --    stage-execution-worker.js/stage-templates literal (TS-8, documented above). Without
  --    widening both, stage 27 would be categorically unreachable via ANY path regardless of the
  --    RPC bound fix. The preflight above already proves zero REAL ventures sit in 23-26, so only
  --    demo/fixture ventures (if any) are shifted here.
  ALTER TABLE public.ventures DROP CONSTRAINT IF EXISTS ventures_current_lifecycle_stage_check;
  ALTER TABLE public.ventures ADD CONSTRAINT ventures_current_lifecycle_stage_check
    CHECK (current_lifecycle_stage >= 1 AND current_lifecycle_stage <= 27);

  -- FOUND BY DRY-RUNNING THIS FILE (not by static review): fn_enforce_stage_advancement_artifact_gate
  -- and fn_sync_stage_work_on_advance both fire on ANY forward change to current_lifecycle_stage
  -- and treat it as a REAL stage advancement -- the artifact gate demands artifacts for the (soon
  -- to be renumbered) old stage, and the sync trigger marks that old stage's venture_stage_work row
  -- 'completed', neither of which is correct for a pure relabeling where the venture has not
  -- actually progressed. Both are disabled for the duration of this UPDATE only, inside the SAME
  -- transaction apply-migration.js wraps this whole file in -- ROLLBACK on any later failure
  -- restores both automatically (DISABLE/ENABLE TRIGGER is transactional DDL). The writer-choke
  -- triggers (aaa_/zzz_enforce_canonical_stage_write) stay ACTIVE and are satisfied properly via
  -- stage_write_token below, not bypassed.
  ALTER TABLE public.ventures DISABLE TRIGGER enforce_stage_advancement_artifact_gate;
  ALTER TABLE public.ventures DISABLE TRIGGER trg_sync_stage_work_on_advance;

  -- stage_write_token='dedicated-venture-uat-stage' satisfies the enforce_canonical_stage_write()
  -- choke trigger (SD-LEO-INFRA-STAGE-WRITER-CHOKE-001) this DDL write must pass through the same
  -- as any other current_lifecycle_stage writer; the trigger's own 'final' pass resets it to NULL
  -- at rest, so no cleanup statement is needed here.
  UPDATE public.ventures
  SET current_lifecycle_stage = current_lifecycle_stage + 1,
      stage_write_token = 'dedicated-venture-uat-stage',
      updated_at = now()
  WHERE current_lifecycle_stage BETWEEN 23 AND 26;

  ALTER TABLE public.ventures ENABLE TRIGGER enforce_stage_advancement_artifact_gate;
  ALTER TABLE public.ventures ENABLE TRIGGER trg_sync_stage_work_on_advance;

  -- 5a. chairman_decisions.lifecycle_stage: LIVE state the RPCs read directly
  --    (`WHERE lifecycle_stage = p_from_stage AND status = 'approved'`) -- must stay valid for a
  --    future advance call to keep matching an existing approval. Two-phase because
  --    uq_chairman_decision_attempt is UNIQUE(venture_id, lifecycle_stage, decision_type,
  --    attempt_number) and a single venture could hold rows at more than one shifted stage.
  UPDATE public.chairman_decisions
  SET lifecycle_stage = -lifecycle_stage, updated_at = now()
  WHERE lifecycle_stage BETWEEN 23 AND 26;

  UPDATE public.chairman_decisions
  SET lifecycle_stage = (-lifecycle_stage) + 1, updated_at = now()
  WHERE lifecycle_stage BETWEEN -26 AND -23;

  -- 5b. venture_stage_work.lifecycle_stage: LIVE state the RPCs UPDATE directly
  --    (`SET stage_status = ... WHERE lifecycle_stage = p_from_stage`). Two-phase because
  --    venture_stage_work_venture_id_lifecycle_stage_key is UNIQUE(venture_id, lifecycle_stage).
  UPDATE public.venture_stage_work
  SET lifecycle_stage = -lifecycle_stage, updated_at = now()
  WHERE lifecycle_stage BETWEEN 23 AND 26;

  UPDATE public.venture_stage_work
  SET lifecycle_stage = (-lifecycle_stage) + 1, updated_at = now()
  WHERE lifecycle_stage BETWEEN -26 AND -23;
END
$renumber$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 6. FR-9 -- update the hardcoded p_to_stage > 26 upper bound to > 27 in BOTH RPCs, in this SAME
--    migration. Full bodies below are the LIVE definitions (pg_get_functiondef, 2026-08-25) with
--    ONLY that one line changed each (fn_advance_venture_stage's unrelated
--    p_from_stage=23/p_to_stage=24 literal, per the documented-not-fixed banner above, is
--    otherwise untouched). CREATE OR REPLACE is naturally idempotent (TS-9).
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_gate_type TEXT;
  v_gate_decision RECORD;
  v_gate_decision_id UUID := NULL;
  v_idempotency UUID;
  v_precondition JSONB;
BEGIN
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

  SELECT current_lifecycle_stage, name
    INTO v_current_stage, v_venture_name
    FROM ventures
    WHERE id = p_venture_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'venture_not_found',
      'venture_id', p_venture_id
    );
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_mismatch',
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 27 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_to_stage',
      'to_stage', p_to_stage
    );
  END IF;

  -- FR-3: gate membership read fresh per call from the venture_stages SSOT (no cache), replacing the
  -- hardcoded kill/promotion/all-gates literal arrays that omitted gates 10/16/19/25 (names elided
  -- here on purpose: this comment describes a check performed by the ORIGINAL authoring migration
  -- (20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql), not this file's own
  -- verify block below, which checks a different thing (the p_to_stage bound) -- MECH-AMEND
  -- reword, 2026-08-25 sitting).
  --
  -- SECURITY (adversarial SECURITY review S-H3): a missing venture_stages row for p_from_stage must
  -- NOT silently disable the gate check. SELECT INTO leaves v_gate_type NULL when zero rows match,
  -- and COALESCE(gate_type, 'none') only handles a NULL *column value on a found row* -- it cannot
  -- distinguish "found a row with gate_type=NULL" from "no row at all" without FOUND, and the original
  -- code coalesced both to 'none', failing OPEN on a catalog gap (contradicting choke.sql's own
  -- FAIL-CLOSED-on-could-not-check principle). Fail closed instead: no SSOT row is a data-integrity
  -- problem, not evidence no gate applies.
  SELECT gate_type INTO v_gate_type
    FROM venture_stages
    WHERE stage_number = p_from_stage
    FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_gate_lookup_failed',
      'from_stage', p_from_stage,
      'message', format('No venture_stages catalog row for stage %s -- cannot determine gate requirements', p_from_stage)
    );
  END IF;
  v_gate_type := COALESCE(v_gate_type, 'none');

  IF v_gate_type IN ('kill', 'promotion') THEN
    SELECT id, decision, status INTO v_gate_decision
      FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = p_from_stage
        AND status = 'approved'
        AND decision IN ('pass', 'go', 'proceed', 'approve', 'conditional_pass', 'conditional_go', 'continue', 'release')
      ORDER BY created_at DESC
      LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gate_not_approved',
        'gate_stage', p_from_stage,
        'gate_type', v_gate_type,
        'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
      );
    END IF;

    v_gate_decision_id := v_gate_decision.id;
  END IF;

  v_precondition := public.fn_stage_artifact_precondition(p_venture_id, p_from_stage);
  IF (v_precondition->>'blocked')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'artifact_precondition_unmet',
      'missing_artifacts', v_precondition->'missing_artifacts',
      'deviated_artifacts', v_precondition->'deviated_artifacts',
      'source', v_precondition->>'source',
      'venture_id', p_venture_id,
      'from_stage', p_from_stage
    );
  END IF;

  UPDATE venture_stage_work
    SET stage_status = 'completed',
        completed_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_from_stage;

  -- FR-1/FR-2 self-stamp: stage_write_token identifies this RPC as the writer, in the SAME
  -- statement as the protected-column change, matching the registry identity 'advance_venture_stage'.
  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
        stage_write_token = 'advance_venture_stage',
        updated_at = NOW()
    WHERE id = p_venture_id;

  UPDATE venture_stage_work
    SET stage_status = 'in_progress',
        started_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_to_stage;

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_from_stage, 'STAGE_COMPLETE',
    jsonb_build_object('advanced_to', p_to_stage, 'transition_type', p_transition_type),
    NOW()
  );

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_to_stage, 'STAGE_ENTRY',
    jsonb_build_object('advanced_from', p_from_stage, 'transition_type', p_transition_type),
    NOW()
  );

  v_idempotency := uuid_generate_v5(
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_venture_id::text || ':' || p_from_stage::text || ':' || p_to_stage::text
      || ':' || COALESCE(
        (SELECT COUNT(*)::text FROM venture_stage_transitions
         WHERE venture_id = p_venture_id
           AND from_stage = p_from_stage
           AND to_stage = p_to_stage),
        '0')
  );

  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, p_transition_type,
    'system:advance', jsonb_build_object(
      'gate_decision_id', v_gate_decision_id,
      'venture_name', v_venture_name
    ), v_idempotency
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transition_type', p_transition_type,
    'gate_created', false,
    'idempotency_key', v_idempotency
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'venture_id', p_venture_id,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage
  );
END;
$function$;

-- secdef-execute-revoke-lint (CI): CREATE OR REPLACE re-emits this SECURITY DEFINER function's
-- full body, which the lint treats as "new" regardless of it being a pre-existing function this
-- migration only widens a bound on. Re-asserting the grants explicitly is a NO-OP against live
-- production (verified via pg_proc.proacl: currently EXECUTE is granted to authenticated and
-- service_role only, anon/PUBLIC already absent) -- this is NOT a new lockdown, just making an
-- already-correct posture auditable in-file. Unlike translate_historical_stage_number() (FR-4,
-- section 8 below), authenticated genuinely needs this RPC: it is called client-side from the
-- ehg repo's chairman decide/promote API routes and several client-writable EVA service paths.
REVOKE EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_handoff_data jsonb DEFAULT '{}'::jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_gate_result JSONB;
  v_user_id UUID;
  v_idem_key UUID;
  v_missing_artifacts JSONB;
  v_gate_type TEXT;
  v_review_mode TEXT;
  v_canonical_array text[];
  v_required_artifacts text[];
  v_s22_flag_enabled boolean;
  v_legacy_skipped boolean;
  v_artifact_source text;
  v_hc_flag_enabled boolean;
  v_is_high_consequence boolean;
  v_cutover_flag_enabled boolean;
BEGIN
  SELECT current_lifecycle_stage, name INTO v_current_stage, v_venture_name
  FROM ventures WHERE id = p_venture_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found', 'venture_id', p_venture_id);
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stage mismatch', 'current_stage', v_current_stage, 'from_stage', p_from_stage);
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 27 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid to_stage', 'to_stage', p_to_stage);
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM venture_stage_transitions WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'was_duplicate', true, 'venture_id', p_venture_id);
    END IF;
  END IF;

  SELECT COALESCE(sc.gate_type, 'none'), COALESCE(sc.review_mode, 'review'), COALESCE(sc.is_high_consequence, false)
  INTO v_gate_type, v_review_mode, v_is_high_consequence
  FROM venture_stages sc
  WHERE sc.stage_number = p_from_stage
  FOR SHARE;

  IF NOT FOUND THEN
    v_gate_type := 'none';
    v_review_mode := 'review';
    v_is_high_consequence := false;
  END IF;

  IF v_review_mode = 'review' THEN
    IF NOT EXISTS (
      SELECT 1 FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = p_from_stage
        AND status = 'approved'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'review_gate_blocked',
        'message', format('Stage %s requires chairman review approval', p_from_stage),
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'gate_type', v_gate_type,
        'review_mode', v_review_mode
      );
    END IF;
  END IF;

  IF v_gate_type IN ('kill', 'promotion') THEN
    IF NOT EXISTS (
      SELECT 1 FROM chairman_decisions
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = p_from_stage
        AND status = 'approved'
    ) THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'gate_blocked',
        'message', format('Stage %s has %s gate requiring approval', p_from_stage, v_gate_type),
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'gate_type', v_gate_type,
        'review_mode', v_review_mode
      );
    END IF;
  END IF;

  -- UPDATED (round-2, per SECURITY finding H-3, reversing the round-1 "documented, not fixed"
  -- disposition for THIS literal specifically): section 5a above already moves this stage's
  -- approved product_review decisions from lifecycle_stage=23 to 24 in the SAME migration --
  -- leaving this predicate reading p_from_stage=23 would mean the check looks for an approval at
  -- EXACTLY the stage the data was just moved away from, manufacturing (not merely inheriting) a
  -- desynchronization on the path into the irreversible go_live gate. That is a security
  -- regression, not a cosmetic staleness, so it is fixed here even though the broader JS-side
  -- literal (lib/eva/stage-execution-worker.js:2971, its 2 stage-templates dynamic imports, and
  -- chairman-product-review.js's own unaudited stage assumptions) remains its own, separately
  -- tracked, deliberately out-of-scope finding -- see this file's header banner.
  IF p_from_stage = 24 AND p_to_stage = 25 THEN
    IF NOT EXISTS (
      SELECT 1 FROM ventures
      WHERE id = p_venture_id
        AND (is_demo = true OR name ~* '^(parity-test-|test-stub)')
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM chairman_decisions
        WHERE venture_id = p_venture_id
          AND lifecycle_stage = p_from_stage
          AND decision_type = 'product_review'
          AND status = 'approved'
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'product_review_required',
          'message', 'Stage 24 to 25 transition requires an approved chairman product_review decision',
          'venture_id', p_venture_id,
          'stage', p_from_stage,
          'to_stage', p_to_stage
        );
      END IF;
    END IF;
  END IF;

  IF v_is_high_consequence THEN
    SELECT is_enabled INTO v_cutover_flag_enabled
    FROM leo_feature_flags WHERE flag_key = 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED';
    v_cutover_flag_enabled := COALESCE(v_cutover_flag_enabled, false);

    IF v_cutover_flag_enabled THEN
      SELECT is_enabled INTO v_hc_flag_enabled
      FROM leo_feature_flags WHERE flag_key = 'LEO_HIGH_CONSEQUENCE_GATES_ENABLED';
      v_hc_flag_enabled := COALESCE(v_hc_flag_enabled, true);

      IF v_hc_flag_enabled THEN
        IF EXISTS (
          SELECT 1 FROM chairman_decisions
          WHERE venture_id = p_venture_id
            AND lifecycle_stage = p_from_stage
            AND status = 'pending'
            AND blocking = true
        ) THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'high_consequence_gate_blocked',
            'message', format('Stage %s has a pending high-consequence chairman decision', p_from_stage),
            'venture_id', p_venture_id,
            'stage', p_from_stage
          );
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT is_enabled INTO v_s22_flag_enabled
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';
  v_s22_flag_enabled := COALESCE(v_s22_flag_enabled, false);

  SELECT COALESCE((metadata->>'s22_legacy_skipped')::boolean, false)
  INTO v_legacy_skipped
  FROM ventures WHERE id = p_venture_id;

  SELECT required_artifacts INTO v_canonical_array
  FROM venture_stages
  WHERE stage_number = p_from_stage;
  v_canonical_array := COALESCE(v_canonical_array, ARRAY[]::text[]);

  IF v_legacy_skipped AND p_from_stage = 22 THEN
    v_required_artifacts := ARRAY[]::text[];
    v_artifact_source := 'bypass_s22_legacy_skipped';
  ELSE
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical';
  END IF;

  IF array_length(v_required_artifacts, 1) IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('artifact_type', a))
    INTO v_missing_artifacts
    FROM unnest(v_required_artifacts) a
    WHERE NOT EXISTS (
      SELECT 1 FROM venture_artifacts va
      WHERE va.venture_id = p_venture_id
        AND va.artifact_type = a
        AND va.is_current = true
    );

    IF v_missing_artifacts IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'artifact_precondition_unmet',
        'missing', v_missing_artifacts,
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'source', v_artifact_source,
        'flag_enabled', v_s22_flag_enabled
      );
    END IF;
  END IF;

  IF p_from_stage = 21 AND p_to_stage = 22 THEN
    v_user_id := (p_handoff_data->>'user_id')::UUID;
    v_gate_result := evaluate_stage20_compliance_gate(p_venture_id, v_user_id);
    IF NOT (v_gate_result->>'success')::BOOLEAN THEN
      RETURN jsonb_build_object('success', false, 'error', 'Compliance gate failed', 'gate_result', v_gate_result);
    END IF;
    IF (v_gate_result->>'outcome') = 'FAIL' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Compliance gate blocked', 'gate_status', 'BLOCKED', 'gate_result', v_gate_result);
    END IF;
    PERFORM record_compliance_gate_passed(p_venture_id, v_user_id);
  END IF;

  DELETE FROM venture_stage_cutover_grandfather
  WHERE venture_id = p_venture_id AND stage_number = p_from_stage;

  -- FR-1/FR-2 self-stamp: stage_write_token identifies this RPC as the writer.
  UPDATE ventures SET current_lifecycle_stage = p_to_stage, stage_write_token = 'fn_advance_venture_stage', updated_at = NOW() WHERE id = p_venture_id;

  UPDATE venture_stage_work SET stage_status = 'completed', completed_at = NOW()
  WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage;

  v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid());

  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, 'normal',
    COALESCE(p_handoff_data->>'ceo_agent_id', 'system'), p_handoff_data, v_idem_key
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'venture_id', p_venture_id, 'venture_name', v_venture_name,
    'from_stage', p_from_stage, 'to_stage', p_to_stage,
    'transitioned_at', NOW(),
    'idempotency_key', v_idem_key,
    'artifact_source', v_artifact_source,
    'flag_enabled', v_s22_flag_enabled
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id);
END;
$function$;

-- secdef-execute-revoke-lint (CI): see the identical note above advance_venture_stage()'s
-- REVOKE/GRANT -- same NO-OP-against-production reasoning, same live-callers rationale.
REVOKE EXECUTE ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 8. FR-4 -- translate-at-read shim reconciled against the REAL 20260322 precedent, extended (see
--    the DIRECT SHIFT vs SHIM-ONLY note above) to cover stage_events alongside
--    venture_stage_transitions and eva_stage_gate_attempts. None of these three tables is ever
--    UPDATEd by this migration (FR-4 AC-3) -- historical rows are read through this shim only.
--    Epoch marker convention (FR-4 AC-1): derive the cutover from schema_migrations_applied's own
--    applied_at record for THIS migration file. Plain (NOT SECURITY DEFINER) plus a REVOKE below:
--    an independent SECURITY sub-agent review found DEFINER bought nothing for the real caller
--    set here (service_role/postgres already bypass RLS as invoker; a low-privilege invoker
--    legitimately gets zero rows from the RLS-protected base tables either way) while making the
--    function an anon-reachable elevated-privilege timestamp oracle over
--    schema_migrations_applied.applied_at -- reverted from an earlier revision's DEFINER choice.
--    ORDER BY applied_at ASC (not DESC) takes the FIRST successful apply -- this shim does not
--    attempt to model more than one apply/revert/re-apply cycle, which is an accepted scope limit
--    for a one-time production ceremony (the DOWN/re-UP capability exists for non-production
--    verification, not repeated production cycling). A NULL p_row_created_at (the column is
--    nullable) returns the input unchanged rather than guessing.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.translate_historical_stage_number(
  p_stage_number integer,
  p_row_created_at timestamptz
) RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public'
 STABLE
AS $function$
DECLARE
  v_cutover_at timestamptz;
BEGIN
  IF p_stage_number IS NULL OR p_row_created_at IS NULL THEN
    RETURN p_stage_number;
  END IF;

  SELECT applied_at INTO v_cutover_at
  FROM public.schema_migrations_applied
  WHERE migration_path LIKE '%20260825_dedicated_venture_uat_stage_insert_and_renumber.sql'
    AND success = true
  ORDER BY applied_at ASC
  LIMIT 1;

  -- Not yet applied: nothing to translate.
  IF v_cutover_at IS NULL THEN
    RETURN p_stage_number;
  END IF;

  IF p_row_created_at >= v_cutover_at THEN
    RETURN p_stage_number; -- native post-apply value
  END IF;

  -- Pre-apply row: values 23-26 (in the post-20260322, pre-this-SD scheme) map to the current
  -- scheme by +1; every other value was never touched by this SD's shift.
  IF p_stage_number BETWEEN 23 AND 26 THEN
    RETURN p_stage_number + 1;
  END IF;

  RETURN p_stage_number;
END;
$function$;

CREATE OR REPLACE VIEW public.venture_stage_transitions_current_scheme
WITH (security_invoker = true) AS
SELECT
  vst.*,
  public.translate_historical_stage_number(vst.from_stage, vst.created_at) AS from_stage_current,
  public.translate_historical_stage_number(vst.to_stage, vst.created_at) AS to_stage_current
FROM public.venture_stage_transitions vst;

CREATE OR REPLACE VIEW public.eva_stage_gate_attempts_current_scheme
WITH (security_invoker = true) AS
SELECT
  ega.*,
  public.translate_historical_stage_number(ega.stage_number, ega.created_at) AS stage_number_current
FROM public.eva_stage_gate_attempts ega;

CREATE OR REPLACE VIEW public.stage_events_current_scheme
WITH (security_invoker = true) AS
SELECT
  se.*,
  public.translate_historical_stage_number(se.stage_number, se.created_at) AS stage_number_current
FROM public.stage_events se;

-- SECURITY finding H-1: CREATE FUNCTION/VIEW in the public schema default-grants EXECUTE/SELECT
-- to anon and authenticated (measured live default ACL). Every base table these 3 views read is
-- service_role-policy-only RLS, so a low-privilege caller gets zero rows regardless -- but least
-- privilege says close the surface explicitly rather than rely on that being permanent. The
-- function itself is intentionally NOT SECURITY DEFINER (reverted from an earlier revision):
-- measured against the real caller set, DEFINER bought nothing (service_role/postgres already
-- bypass RLS as invoker; a low-privilege invoker legitimately gets nothing from the RLS-protected
-- base tables either way) while making the function an anon-reachable elevated-privilege oracle
-- over schema_migrations_applied.applied_at.
REVOKE ALL ON FUNCTION public.translate_historical_stage_number(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.translate_historical_stage_number(integer, timestamptz) TO service_role;
REVOKE ALL ON public.venture_stage_transitions_current_scheme FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.venture_stage_transitions_current_scheme TO service_role;
REVOKE ALL ON public.eva_stage_gate_attempts_current_scheme FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.eva_stage_gate_attempts_current_scheme TO service_role;
REVOKE ALL ON public.stage_events_current_scheme FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.stage_events_current_scheme TO service_role;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 9. POST-APPLY READBACK. Any miss aborts the whole transaction. Round-1's gate_type/
--    is_irreversible comparison was tautological (the renumber statement never touches those
--    columns, so it could not fail); this version instead verifies the depends_on chain re-link,
--    which the renumber DOES touch and is the genuinely error-prone part of this migration.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_bad_chain_count INTEGER;
  v_uat_row public.venture_stages%ROWTYPE;
  v_go_live_row public.venture_stages%ROWTYPE;
  v_shifted_irreversible_count INTEGER;
  v_present_new_bound_count INTEGER;
  v_stale_bound_count INTEGER;
  v_registry_count INTEGER;
  v_ventures_check_max INTEGER;
  v_ventures_stale_count INTEGER;
  v_cd_stale_count INTEGER;
  v_vsw_stale_count INTEGER;
BEGIN
  -- The 4 shifted rows' depends_on correctly re-links to (new stage_number - 1), proving the
  -- actual +1/+1 chain-relink logic worked, not merely that stage_number moved.
  SELECT count(*) INTO v_bad_chain_count
  FROM public.venture_stages vs
  JOIN _uat001b_pre_snapshot pre ON pre.stage_key = vs.stage_key
  WHERE vs.depends_on <> ARRAY[vs.stage_number - 1]::integer[];
  IF v_bad_chain_count <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % shifted row(s) have a depends_on chain that does not point at stage_number-1 after the renumber.', v_bad_chain_count;
  END IF;

  -- The irreversible go_live gate is present at its new stage_number, and no OTHER row among the
  -- 4 shifted rows unexpectedly carries is_irreversible=true (scoped to what this migration
  -- could actually affect -- not a table-wide count, which would abort for causes this migration
  -- did not create).
  SELECT * INTO v_go_live_row FROM public.venture_stages WHERE stage_key = 'go_live';
  IF v_go_live_row.stage_number IS NULL OR v_go_live_row.is_irreversible IS NOT TRUE THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: go_live row missing or lost is_irreversible=true after renumber.';
  END IF;
  SELECT count(*) INTO v_shifted_irreversible_count
  FROM public.venture_stages vs
  JOIN _uat001b_pre_snapshot pre ON pre.stage_key = vs.stage_key
  WHERE vs.stage_key <> 'go_live' AND vs.is_irreversible = true;
  IF v_shifted_irreversible_count <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % shifted row(s) other than go_live unexpectedly carry is_irreversible=true.', v_shifted_irreversible_count;
  END IF;

  -- The new UAT stage exists, carries the activation marker, and depends on stage 22 (Visual
  -- Assets, unchanged).
  SELECT * INTO v_uat_row FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat';
  IF v_uat_row.stage_number IS NULL THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: dedicated_venture_uat row was not inserted.';
  END IF;
  IF NOT (v_uat_row.metadata #> '{gates,uat_robustness_required}' = 'true'::jsonb) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: dedicated_venture_uat row missing metadata.gates.uat_robustness_required=true marker.';
  END IF;
  IF v_uat_row.depends_on <> ARRAY[22]::integer[] THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: dedicated_venture_uat.depends_on = % (expected {22}).', v_uat_row.depends_on;
  END IF;

  -- ventures.current_lifecycle_stage's CHECK bound was actually widened to 27 (FR-9's 4th
  -- occurrence). Per-row comparison against the pre-snapshot, NOT a "BETWEEN 23 AND 26" count --
  -- 24 and 25 are simultaneously valid OLD-shift-range AND NEW-shift-destination values (the
  -- ranges [23,26] and [24,27] overlap), so a bare range count cannot tell "correctly shifted"
  -- apart from "never touched" -- found by dry-running this file and getting a false-positive
  -- failure from exactly that flawed check in an earlier revision.
  SELECT (regexp_match(pg_get_constraintdef(oid), '<= ([0-9]+)'))[1]::integer INTO v_ventures_check_max
  FROM pg_constraint
  WHERE conrelid = 'public.ventures'::regclass AND conname = 'ventures_current_lifecycle_stage_check';
  IF v_ventures_check_max IS DISTINCT FROM 27 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: ventures_current_lifecycle_stage_check upper bound is %, expected 27.', v_ventures_check_max;
  END IF;
  SELECT count(*) INTO v_ventures_stale_count
  FROM public.ventures v
  JOIN _uat001b_ventures_pre_snapshot pre ON pre.id = v.id
  WHERE v.current_lifecycle_stage <> pre.pre_stage + 1;
  IF v_ventures_stale_count <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % ventures row(s) did not shift by exactly +1 from their pre-apply stage.', v_ventures_stale_count;
  END IF;

  -- chairman_decisions.lifecycle_stage and venture_stage_work.lifecycle_stage: per-row +1
  -- comparison, same reasoning as ventures above.
  SELECT count(*) INTO v_cd_stale_count
  FROM public.chairman_decisions cd
  JOIN _uat001b_cd_pre_snapshot pre ON pre.id = cd.id
  WHERE cd.lifecycle_stage <> pre.pre_stage + 1;
  IF v_cd_stale_count <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % chairman_decisions row(s) did not shift by exactly +1 from their pre-apply stage.', v_cd_stale_count;
  END IF;
  SELECT count(*) INTO v_vsw_stale_count
  FROM public.venture_stage_work vsw
  JOIN _uat001b_vsw_pre_snapshot pre ON pre.id = vsw.id
  WHERE vsw.lifecycle_stage <> pre.pre_stage + 1;
  IF v_vsw_stale_count <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % venture_stage_work row(s) did not shift by exactly +1 from their pre-apply stage.', v_vsw_stale_count;
  END IF;

  -- Both RPCs accept the new top stage (27): assert PRESENCE of the new bound, not merely absence
  -- of the old one, and scope to this schema's copies.
  SELECT count(*) INTO v_present_new_bound_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('advance_venture_stage', 'fn_advance_venture_stage')
    AND pg_get_functiondef(oid) LIKE '%p_to_stage > 27%';
  IF v_present_new_bound_count <> 2 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: expected 2 RPC(s) with p_to_stage > 27, found % (FR-9 AC-1/AC-2).', v_present_new_bound_count;
  END IF;
  SELECT count(*) INTO v_stale_bound_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('advance_venture_stage', 'fn_advance_venture_stage')
    AND pg_get_functiondef(oid) LIKE '%p_to_stage > 26%';
  IF v_stale_bound_count <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % RPC(s) still hardcode p_to_stage > 26 (FR-9 AC-1/AC-2).', v_stale_bound_count;
  END IF;

  -- The writer registry carries the new UAT stage entry (FR-7 AC-1).
  SELECT count(*) INTO v_registry_count
  FROM public.ventures_canonical_writer_policy('dedicated-venture-uat-stage');
  IF v_registry_count <> 1 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: dedicated-venture-uat-stage writer entry not found in the registry (FR-7 AC-1).';
  END IF;

  RAISE NOTICE 'DEDICATED-VENTURE-UAT-001-B RENUMBER VERIFIED: UAT stage inserted at %, go_live at %, chain re-linked, ventures/chairman_decisions/venture_stage_work shifted, ventures CHECK widened to 27, RPC bound=27, writer registered.', v_uat_row.stage_number, v_go_live_row.stage_number;
END
$verify$;
