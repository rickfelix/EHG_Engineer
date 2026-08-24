-- SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001 (T-minus P1 — Evidence Layer)
-- Target DB: EHG_Engineer consolidated
--
-- @approved-by: Chairman, verbal at terminal 2026-08-24T12:43Z — "A on all" (11-item ceremony sitting presented by Adam 0549d739; scribe branch ceremony/20260824-sitting)
--   on record. See README.md ceremony guards: the approver header must match `git config user.email`
--   at apply time and is checked against the chairman-approval record, not merely present.
--
--   WHY chairman-gated rather than database/migrations/: this file creates a TABLE with TRIGGERS
--   and RLS POLICIES. isDelegatableForApply() (lib/migration/adam-delegated-apply.js) scopes
--   Adam's delegated apply to "additive-no-policy/rls" — a brand-new table is additive, but its
--   RLS policy and triggers are not, so this is chairman-path-only by construction.
--
-- ============================================================================
-- WHY THIS TABLE EXISTS, AND WHY IT IS NOT A RETROFIT OF eva_stage_gate_results
--
-- LEAD-phase premise verification (Explore + risk-agent c73332a0 + validation-agent 8bb1f901,
-- sub_agent_execution_results phase=LEAD) measured live against eva_stage_gate_results (1,796
-- rows) that the originally-chartered plan — add run_id/attempt_number columns and a matching
-- unique constraint to the EXISTING table — is not executable: the 930 legacy venture_id-NULL
-- rows collapse into only 46 distinct (stage_number,gate_type) groups (max 37/group), so a
-- backfilled unique constraint aborts on ~884 violations. Separately, the existing table has 5+
-- live consumers (checkGateDebt, v_venture_gate_debt, v_venture_state_canonical, recordGateOverride
-- at lib/eva/stage-execution-worker.js:852, the recordGateResult() UPSERT itself) that assume
-- today's overwrite-on-reevaluation semantics — an immutability trigger enabled on that table ahead
-- of a full cutover breaks all of them.
--
-- A prospective TESTING pass (row 6e4ca29e) further found the originally-proposed run_id concept
-- has no production analog: the only traversal-scoped function, eva-orchestrator.js run() (:1373),
-- is dead in production (its only live caller is a manual CLI, scripts/eva-run.js:34) — every real
-- gate-writing path (stage-execution-worker.js's polling daemon, eva-master-scheduler.js,
-- concurrent-venture-orchestrator.js) calls processStage() independently, per stage, surviving
-- daemon restarts with no in-memory run continuity. This table therefore identifies each row by a
-- fresh per-evaluation-call `attempt_id`, not a cross-stage "run" construct — cross-stage grouping
-- is explicitly out of scope for this SD (PRD FR-3 correction).
--
-- THIS TABLE DOES NOT TOUCH eva_stage_gate_results. No ALTER, no DROP, no data migration. Historical
-- rows in that table stay exactly as they are; this table covers evaluations going forward via a
-- dual-write (application code, not this migration) that leaves the old table's UPSERT path intact.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.eva_stage_gate_attempts (
  -- Row identity. Fresh per evaluation call (openAttempt()), never a cross-stage "run" id.
  attempt_id     UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

  venture_id     UUID NOT NULL REFERENCES public.ventures(id) ON DELETE CASCADE,
  stage_number   INTEGER NOT NULL CHECK (stage_number > 0),

  -- Mirrors the existing table's vocabulary for consistency with dual-write call sites.
  gate_type      TEXT NOT NULL CHECK (gate_type IN ('entry', 'exit', 'kill')),

  -- The anti-duplicate business key. Allocated atomically by open_eva_gate_attempt() below
  -- (pg_advisory_xact_lock-guarded SELECT-MAX+1) — never computed client-side, which would race
  -- under concurrent-venture-orchestrator's concurrent dispatch (TESTING F6).
  attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),

  -- ── ATTEMPT LIFECYCLE ────────────────────────────────────────────────────────────────────────
  -- NULL = in-flight/interrupted, visibly distinct from any finalized outcome. Populated ONLY by
  -- finalize_eva_gate_attempt() in one atomic UPDATE alongside evidence+evaluator (FR-2/FR-4).
  resolved_outcome TEXT CHECK (
    resolved_outcome IS NULL OR resolved_outcome IN (
      'machine_pass', 'machine_fail', 'override', 'chairman_adjudicated',
      'skip', 'cannot_evaluate', 'not_exercised'
    )
  ),

  -- Derived convenience flag, nullable (NOT the existing table's NOT-NULL-DEFAULT-false design,
  -- which forces every in-flight/non-machine attempt to read as a machine fail — TESTING F1/PRD FR-5).
  -- TRUE only for machine_pass; NULL while unresolved or for any non-machine-verdict outcome.
  passed         BOOLEAN,

  -- ── EVIDENCE, KEPT DISTINCT (TESTING F4) ────────────────────────────────────────────────────
  -- The existing table's `reasoning || JSON.stringify(metadata)` precedence at
  -- artifact-persistence-service.js:381 clobbers one with the other (317/400 sampled live notes
  -- values are already JSON, not prose). This table stores both, never one overwriting the other.
  reasoning      TEXT,
  metadata       JSONB,
  gate_criteria  JSONB,

  -- WHO/WHAT performed the evaluation (FR-4's "evidence+evaluator" requirement).
  evaluator      TEXT,

  -- ── DB-CLOCK TIMESTAMPS, NEVER WRITER-SUPPLIED ──────────────────────────────────────────────
  -- Precedent: venture_gate_attestations.computed_at — a writer-supplied timestamp is a
  -- backdating vector. opened_at marks row creation (in-flight start); finalized_at is set only
  -- by the one allowed NULL->final UPDATE.
  opened_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- ── CONSTRAINTS ──────────────────────────────────────────────────────────────────────────────
  -- VALIDATION (VERIFY phase): the PRD's acceptance criterion for this key listed `attempt_id`
  -- alongside the other three columns. Deliberately NOT included here: attempt_id is this row's
  -- own per-row UUID primary key, so a 4-column key that already contains it would be trivially
  -- unique on attempt_id alone -- both the duplicate-attempt-number rejection this constraint
  -- exists to prove (BEHAVIOURAL PROOF 2 below) and the "authoritative = highest finalized
  -- attempt_number for this (venture,stage,gate_type)" read pattern (PRD FR-3) depend on
  -- attempt_number being unique WITHOUT attempt_id in the key. The PRD's own criteria conflict on
  -- this point; the key as shipped is the one that makes both other criteria satisfiable.
  CONSTRAINT esga_unique_attempt UNIQUE (venture_id, stage_number, gate_type, attempt_number),

  -- A finalized row must carry finalized_at; an in-flight row must not.
  CONSTRAINT esga_finalized_at_matches_outcome CHECK (
    (resolved_outcome IS NULL AND finalized_at IS NULL)
    OR (resolved_outcome IS NOT NULL AND finalized_at IS NOT NULL)
  ),

  -- passed is meaningful ONLY for machine_pass/machine_fail; every other outcome (including NULL
  -- in-flight) must leave it NULL, so a reader can never misread "unresolved" as "failed".
  CONSTRAINT esga_passed_matches_outcome CHECK (
    (resolved_outcome = 'machine_pass' AND passed = true)
    OR (resolved_outcome = 'machine_fail' AND passed = false)
    OR (resolved_outcome NOT IN ('machine_pass', 'machine_fail') AND passed IS NULL)
    OR resolved_outcome IS NULL
  ),

  -- gate_criteria must be an object when present (mirrors the vga_findings_is_object precedent) —
  -- a bare scalar/array would satisfy a plain NOT-object check and store a shape no reader expects.
  CONSTRAINT esga_gate_criteria_is_object CHECK (
    gate_criteria IS NULL OR jsonb_typeof(gate_criteria) = 'object'
  ),
  CONSTRAINT esga_metadata_is_object CHECK (
    metadata IS NULL OR jsonb_typeof(metadata) = 'object'
  )
);

CREATE INDEX IF NOT EXISTS eva_stage_gate_attempts_venture_stage_idx
  ON public.eva_stage_gate_attempts (venture_id, stage_number, gate_type, attempt_number DESC);

-- The "authoritative result" read path: highest finalized attempt per (venture,stage,gate_type).
CREATE INDEX IF NOT EXISTS eva_stage_gate_attempts_finalized_idx
  ON public.eva_stage_gate_attempts (venture_id, stage_number, gate_type, finalized_at DESC)
  WHERE resolved_outcome IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- FINALIZE-IMMUTABILITY TRIGGER. Fires on ANY UPDATE targeting an already-finalized row,
-- regardless of the caller's own WHERE clause (a row-level BEFORE UPDATE trigger evaluates every
-- row matched by the statement's WHERE, before the SET is applied) — so even a caller that bypasses
-- finalize_eva_gate_attempt() and issues a raw UPDATE cannot silently overwrite a finalized attempt.
-- service_role has rolbypassrls=TRUE (measured live, same as venture_gate_attestations' own
-- rationale) so RLS constrains nobody who can reach this table; a TRIGGER does.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.eva_stage_gate_attempts_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $freeze$
BEGIN
  IF OLD.resolved_outcome IS NOT NULL THEN
    -- TESTING F-A: a plain RAISE EXCEPTION defaults to SQLSTATE P0001 ('raise_exception') --
    -- IDENTICAL to the verify block's own "GUARD DID NOT FIRE" failure sentinel below. A
    -- WHEN raise_exception handler around the probe therefore catches BOTH the trigger firing
    -- correctly AND the verify block's own failure message, making the proof pass whether or not
    -- the trigger actually works. A custom ERRCODE distinguishes "the guard fired" from "the
    -- probe itself is reporting failure" so the two can never be confused by a generic handler.
    RAISE EXCEPTION
      USING
        ERRCODE = 'EV001',
        MESSAGE = format(
          'eva_stage_gate_attempts is immutable once finalized: attempt %s (venture %s, stage %s, %s) already resolved as %s at %s. Recovery is a NEW attempt (attempt_number+1), not an edit to this row.',
          OLD.attempt_id, OLD.venture_id, OLD.stage_number, OLD.gate_type, OLD.resolved_outcome, OLD.finalized_at
        );
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END
$freeze$;

DROP TRIGGER IF EXISTS eva_stage_gate_attempts_no_update_after_final ON public.eva_stage_gate_attempts;
CREATE TRIGGER eva_stage_gate_attempts_no_update_after_final
  BEFORE UPDATE ON public.eva_stage_gate_attempts
  FOR EACH ROW EXECUTE FUNCTION public.eva_stage_gate_attempts_freeze();

-- SECURITY (EXEC-TO-PLAN, SEC-M1): a default (ORIGIN-mode) trigger is suppressed by
-- `SET LOCAL session_replication_role = 'replica'` -- measured live: only `postgres` can set that
-- GUC (service_role/authenticated/anon all get 42501), so this is not an anon-writable path, but
-- `postgres` is the role every migration and one-off script in this harness connects as, and
-- restore/bulk-load tooling sets replica mode routinely and SILENTLY (no catalog trace -- measured
-- `has_parameter_privilege` and `pg_parameter_acl` both wrongly report this as already closed).
-- ENABLE ALWAYS makes the guard fire regardless of replication role, matching the identical fix
-- already applied and behaviourally verified on the sibling ledger table
-- (20260823_chairman_ratifications.sql:165-167).
ALTER TABLE public.eva_stage_gate_attempts ENABLE ALWAYS TRIGGER eva_stage_gate_attempts_no_update_after_final;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- ATOMIC WRITE FUNCTIONS. Both wrap their work in the calling transaction (no internal COMMIT),
-- so a caller that wraps open+finalize in one transaction gets a real atomic unit, and a caller
-- that does not still gets a race-safe individual call via the advisory lock.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.open_eva_gate_attempt(
  p_venture_id UUID,
  p_stage_number INTEGER,
  p_gate_type TEXT,
  p_evaluator TEXT DEFAULT NULL
) RETURNS TABLE(attempt_id UUID, attempt_number INTEGER)
LANGUAGE plpgsql
AS $open$
DECLARE
  v_attempt_id UUID := gen_random_uuid();
  v_attempt_number INTEGER;
BEGIN
  -- Advisory lock keyed on the business key (TESTING F6) — serializes concurrent openers for the
  -- SAME (venture,stage,gate_type) without blocking openers for a DIFFERENT key. hashtextextended's
  -- second argument (0) is a fixed seed, not a security salt — this is a lock key, not a hash used
  -- for any integrity purpose.
  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_venture_id::text || ':' || p_stage_number::text || ':' || p_gate_type, 0)
  );

  SELECT COALESCE(MAX(a.attempt_number), 0) + 1 INTO v_attempt_number
  FROM public.eva_stage_gate_attempts a
  WHERE a.venture_id = p_venture_id
    AND a.stage_number = p_stage_number
    AND a.gate_type = p_gate_type;

  INSERT INTO public.eva_stage_gate_attempts
    (attempt_id, venture_id, stage_number, gate_type, attempt_number, evaluator)
  VALUES
    (v_attempt_id, p_venture_id, p_stage_number, p_gate_type, v_attempt_number, p_evaluator);

  RETURN QUERY SELECT v_attempt_id, v_attempt_number;
END
$open$;

CREATE OR REPLACE FUNCTION public.finalize_eva_gate_attempt(
  p_attempt_id UUID,
  p_resolved_outcome TEXT,
  p_passed BOOLEAN DEFAULT NULL,
  p_reasoning TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_gate_criteria JSONB DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $finalize$
DECLARE
  v_updated INTEGER;
BEGIN
  -- The WHERE clause is a fast-path no-op guard for the common case (this function never touches
  -- an already-finalized row); the trigger above is the actual enforcement boundary for any OTHER
  -- caller that updates this table directly.
  UPDATE public.eva_stage_gate_attempts
  SET resolved_outcome = p_resolved_outcome,
      passed = p_passed,
      reasoning = p_reasoning,
      metadata = p_metadata,
      gate_criteria = p_gate_criteria,
      finalized_at = now()
  WHERE attempt_id = p_attempt_id
    AND resolved_outcome IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END
$finalize$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- POSTURE. eva_stage_gate_results (the sibling table) currently grants anon/authenticated full
-- INSERT/SELECT/UPDATE/DELETE/TRUNCATE (measured live, flagged separately as an out-of-scope
-- finding — this SD does not touch that table). This new table does NOT inherit that posture.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.eva_stage_gate_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS eva_stage_gate_attempts_service_role ON public.eva_stage_gate_attempts;
CREATE POLICY eva_stage_gate_attempts_service_role
  ON public.eva_stage_gate_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.eva_stage_gate_attempts FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.eva_stage_gate_attempts TO service_role;

-- SECURITY (EXEC-TO-PLAN, SEC-M2): `REVOKE ... FROM PUBLIC` alone does NOT remove a NAMED-role
-- grant. `pg_default_acl` grants `anon=X/postgres` (EXECUTE) on every newly created function by
-- default -- measured live post-apply: `has_function_privilege('anon', ...)` was TRUE for both
-- RPCs before this fix. Both functions are SECURITY INVOKER (confirmed via `SET LOCAL ROLE anon`:
-- calls die at 42501 on the underlying table, not at the function boundary), so this was not an
-- exploitable write path today -- but it left two unauthenticated PostgREST RPC endpoints
-- discoverable, and collapses the defense to a single layer (any future table-grant change or a
-- flip to SECURITY DEFINER turns this into a live write path with no new review). Revoke the named
-- roles explicitly, matching the table-level REVOKE two lines above.
REVOKE ALL ON FUNCTION public.open_eva_gate_attempt(UUID, INTEGER, TEXT, TEXT) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_eva_gate_attempt(UUID, TEXT, BOOLEAN, TEXT, JSONB, JSONB) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_eva_gate_attempt(UUID, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_eva_gate_attempt(UUID, TEXT, BOOLEAN, TEXT, JSONB, JSONB) TO service_role;

COMMENT ON TABLE public.eva_stage_gate_attempts IS
  'SD-LEO-INFRA-MINUS-EVIDENCE-LAYER-001. Durable, attributable, immutable-once-final evidence '
  'per gate-evaluation ATTEMPT (not a cross-stage run -- attempt_id is fresh per evaluation call; '
  'production code has no run-scoped identity to thread instead). Dual-written alongside '
  'eva_stage_gate_results, which this table never modifies. INSERT-per-attempt via '
  'open_eva_gate_attempt(); the one allowed NULL->final transition via finalize_eva_gate_attempt(); '
  'any other UPDATE against a finalized row is rejected by eva_stage_gate_attempts_no_update_after_final.';

COMMENT ON COLUMN public.eva_stage_gate_attempts.attempt_id IS
  'Fresh UUID per evaluation call. NOT a cross-stage run identity -- see table comment.';

COMMENT ON COLUMN public.eva_stage_gate_attempts.resolved_outcome IS
  'NULL = in-flight/interrupted. One of 7 canonical evaluation-disposition terms once finalized. '
  'Distinct from eva_stage_gate_results.resolved_outcome (SD-LEO-INFRA-S3-SOFT-GATE-REDESIGN-001), '
  'which is a different, orthogonal venture-outcome-calibration enum on a different table.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- VERIFY. Existential checks (constraints/triggers/functions present) plus BEHAVIOURAL proofs
-- (real INSERT/UPDATE attempts that MUST fail) — an existential check proves a name is in
-- pg_constraint, not that the predicate rejects anything.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_venture_id UUID;
  v_attempt_1 UUID;
  v_attempt_1_num INTEGER;
  v_attempt_2 UUID;
  v_attempt_2_num INTEGER;
  v_finalized BOOLEAN;
  v_reject_finalized BOOLEAN := false;
  v_reject_dup BOOLEAN := false;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.eva_stage_gate_attempts'::regclass
      AND tgname = 'eva_stage_gate_attempts_no_update_after_final' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: the finalize-immutability trigger did not land';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.eva_stage_gate_attempts'::regclass AND conname = 'esga_unique_attempt'
  ) THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: the (venture_id,stage_number,gate_type,attempt_number) unique constraint did not land';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'eva_stage_gate_attempts'
      AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  ) THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: a non-service grant is present on the new table';
  END IF;

  -- SECURITY (EXEC-TO-PLAN, SEC-M1 regression guard): a bare `REVOKE ... FROM PUBLIC` does not
  -- remove `pg_default_acl`'s named-role grant -- this check would have caught the pre-fix state,
  -- where `has_function_privilege('anon', ...)` measured TRUE on both RPCs despite the table-level
  -- REVOKE above being correct.
  IF has_function_privilege('anon', 'public.open_eva_gate_attempt(uuid,integer,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.open_eva_gate_attempt(uuid,integer,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.finalize_eva_gate_attempt(uuid,text,boolean,text,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.finalize_eva_gate_attempt(uuid,text,boolean,text,jsonb,jsonb)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: anon/authenticated retain EXECUTE on the RPC functions';
  END IF;

  -- SECURITY (EXEC-TO-PLAN, SEC-M2 regression guard): `pg_parameter_acl` cannot see this setting
  -- (measured: it reports empty even when the freeze trigger's ORIGIN mode is bypassable), so
  -- `pg_trigger.tgenabled` is the only reliable catalog check that the guard survives
  -- `SET LOCAL session_replication_role = 'replica'`.
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.eva_stage_gate_attempts'::regclass
      AND tgname = 'eva_stage_gate_attempts_no_update_after_final'
      AND tgenabled <> 'A'
  ) THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: the finalize-immutability trigger is not ENABLE ALWAYS (replica-mode bypassable)';
  END IF;

  SELECT id INTO v_venture_id FROM public.ventures LIMIT 1;
  IF v_venture_id IS NULL THEN
    RAISE NOTICE 'eva_stage_gate_attempts: no ventures row exists to run behavioural proofs against — skipping (existential checks above already passed)';
    RETURN;
  END IF;

  -- ── BEHAVIOURAL PROOF 1: open -> finalize -> re-update is rejected ──────────────────────────
  SELECT o.attempt_id, o.attempt_number INTO v_attempt_1, v_attempt_1_num
  FROM public.open_eva_gate_attempt(v_venture_id, 999, 'exit', 'verify-probe') o;

  IF EXISTS (SELECT 1 FROM public.eva_stage_gate_attempts WHERE attempt_id = v_attempt_1 AND resolved_outcome IS NOT NULL) THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: a freshly opened attempt was not in-flight (resolved_outcome not NULL)';
  END IF;

  v_finalized := public.finalize_eva_gate_attempt(v_attempt_1, 'machine_pass', true, 'verify probe', '{"probe":true}'::jsonb, NULL);
  IF NOT v_finalized THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: finalize_eva_gate_attempt did not update the freshly opened attempt';
  END IF;

  BEGIN
    UPDATE public.eva_stage_gate_attempts SET reasoning = 'tampered' WHERE attempt_id = v_attempt_1;
    -- Reached ONLY if the trigger failed to fire (the UPDATE above would otherwise have raised
    -- SQLSTATE EV001 and jumped straight to the handler). Deliberately left at the GENERIC
    -- default SQLSTATE (P0001) so it is NOT caught by the SQLSTATE-EV001-scoped handler below --
    -- it must propagate and abort the whole deploy, not be swallowed as if it were success.
    RAISE EXCEPTION 'eva_stage_gate_attempts: GUARD DID NOT FIRE — a finalized attempt was updated. The immutability guarantee is decorative; refusing to deploy.';
  EXCEPTION
    WHEN SQLSTATE 'EV001' THEN v_reject_finalized := true;
  END;
  IF NOT v_reject_finalized THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: finalize-immutability behavioural proof did not run as expected';
  END IF;

  -- ── BEHAVIOURAL PROOF 2: duplicate attempt_number is rejected ───────────────────────────────
  SELECT o.attempt_id, o.attempt_number INTO v_attempt_2, v_attempt_2_num
  FROM public.open_eva_gate_attempt(v_venture_id, 999, 'exit', 'verify-probe') o;

  IF v_attempt_2_num <> v_attempt_1_num + 1 THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: attempt_number did not increment (got %, expected %) — allocation is broken', v_attempt_2_num, v_attempt_1_num + 1;
  END IF;

  BEGIN
    INSERT INTO public.eva_stage_gate_attempts (venture_id, stage_number, gate_type, attempt_number, evaluator)
    VALUES (v_venture_id, 999, 'exit', v_attempt_2_num, 'verify-probe-dup');
    RAISE EXCEPTION 'eva_stage_gate_attempts: GUARD DID NOT FIRE — a duplicate (venture,stage,gate_type,attempt_number) was accepted. The unique constraint is decorative; refusing to deploy.';
  EXCEPTION
    WHEN unique_violation THEN v_reject_dup := true;
  END;
  IF NOT v_reject_dup THEN
    RAISE EXCEPTION 'eva_stage_gate_attempts: duplicate-attempt behavioural proof did not run as expected';
  END IF;

  -- Clean up the probe rows — this table is NOT append-only (unlike venture_gate_attestations),
  -- so a DELETE by a service-role probe is legitimate and does not defeat any guarantee.
  DELETE FROM public.eva_stage_gate_attempts WHERE attempt_id IN (v_attempt_1, v_attempt_2);
END
$verify$;

COMMIT;

-- ============================================================================
-- ROLLBACK — see 20260823_eva_stage_gate_attempts_DOWN.sql
--
-- APPLY (chairman ceremony; this file is NOT Adam-delegatable — it creates policies + triggers):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token> node scripts/apply-migration.js \
--     "database/chairman-gated/20260823_eva_stage_gate_attempts.sql" \
--     --prod-deploy --allow-any-path
-- ============================================================================
