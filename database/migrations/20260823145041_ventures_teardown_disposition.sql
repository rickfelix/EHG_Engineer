-- Migration: ventures.teardown_disposition columns + kill/cancel disposition-default wiring
-- @approved-by: Chairman, verbal at terminal 2026-08-24T12:43Z — "A on all" (11-item ceremony sitting presented by Adam 0549d739; scribe branch ceremony/20260824-sitting)
-- SD: SD-LEO-INFRA-VENTURE-KILL-CANCEL-001
-- PRD: PRD-SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 (FR-1)
-- Sub-agent evidence:
--   - LEAD EXPLORE 3194859e-dd64-455f-8550-05479465cb79, VALIDATION bfd1beef-366e-4918-891b-50b088ff8d93
--   - PLAN TESTING dbd754fd-8135-4fa3-9010-b3bc197767c0
--   - EXEC SECURITY f30e26e7-61af-4021-b958-7e34cb97d1f7 (S1/S2: the first draft of this
--     migration copied kill_venture()/reject_chairman_decision() from the ORIGINAL
--     20260505224113_ventures_kill_log_and_rpc.sql migration file, which has since drifted
--     from the live functions -- reject_chairman_decision gained a 4th parameter
--     (p_stepup_token) and an authorization guard from two later SDs
--     (SD-FDBK-GEN-RESTRICT-APPROVE-CHAIRMAN-001, SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-C);
--     kill_venture gained an SD cascade-cancel step and a guarded eva_events insert
--     (SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001). A CREATE OR REPLACE using the stale 3-arg
--     reject_chairman_decision signature would have CREATED A NEW, UNGUARDED 3-arg overload
--     alongside the live 4-arg one rather than replacing it -- Postgres resolves function
--     identity on (name, argument TYPES), and PostgREST/named-arg callers would have been
--     routed to the new unguarded overload. This corrected version regenerates both function
--     bodies from pg_get_functiondef(oid) run against the live database (verified
--     independently by both SECURITY and the author, 2026-08-23) and adds ONLY the
--     teardown_disposition COALESCE clause on top -- everything else is copied verbatim.
--   - PLAN_VERIFICATION VALIDATION fb708e20-02dd-4e27-9da6-bf5b8dd20223 (V1): kill_venture()
--     and reject_chairman_decision() are not the only live paths that terminalize a venture --
--     fn_chairman_decide() (the PRIMARY programmatic chairman-decision path) has its own
--     independent kill-gate UPDATE branch, added below (section 4) via the same
--     verbatim-from-live methodology, so the disposition-default logic is not silently
--     bypassed by most real chairman decisions.
-- @chairman-gated
--
-- ⚠ THERE IS DELIBERATELY NO `-- @approved-by:` LINE IN THIS FILE.
--   This migration modifies three existing RPCs (CREATE OR REPLACE FUNCTION; two are SECURITY
--   DEFINER, fn_chairman_decide is not), which scripts/lib/migration-tier-classifier.mjs's
--   allow-list design intentionally does NOT cover -- function bodies can contain arbitrary
--   logic, so any CREATE/REPLACE FUNCTION fails closed to TIER-2 regardless of content. The
--   builder that authored this file holds none of the 3-factor chairman-gate credentials and
--   MUST NOT forge the attestation. The chairman adds the `@approved-by` line and runs:
--       node scripts/apply-migration.js database/migrations/20260823145041_ventures_teardown_disposition.sql --prod-deploy
--   Observable proof of application:
--       SELECT column_name FROM information_schema.columns
--       WHERE table_name = 'ventures' AND column_name LIKE 'teardown_disposition%';
--       -- Expected: 4 rows (previously 0).
--       SELECT proname, pronargs FROM pg_proc
--       WHERE proname IN ('kill_venture', 'reject_chairman_decision', 'fn_chairman_decide');
--       -- Expected: kill_venture pronargs=2, reject_chairman_decision pronargs=4,
--       -- fn_chairman_decide pronargs=5 (all unchanged from their pre-migration live
--       -- signatures -- verify against pg_get_functiondef BEFORE applying, not against this
--       -- migration's own comments, in case of further drift).
--
-- A chairman-commissioned architecture evaluation (Solomon eval S5-1/R4) found that when a
-- venture transitions to a terminal status (cancelled/killed), its deployment is neither
-- torn down nor explicitly retained -- it keeps running silently. VALIDATION found direct,
-- automated Cloud Run teardown is not executable from this repo/session (no gcloud CLI, no
-- GCP admin credentials, and the deploy-CREATE pipeline has never run in production). This
-- migration closes the VISIBILITY half: an explicit, chairman-reviewable disposition record.
-- Actual teardown execution is deferred to a credentialed follow-up SD.
--
-- TESTING F9: TEXT + CHECK, not a native enum -- this migration family already documents an
-- ALTER-TYPE-ordering hazard (see 20260505224113's own header) for enum types.
-- TESTING F2: kill_venture()'s signature is UNCHANGED -- CREATE OR REPLACE preserves it; the
-- existing UPDATE gains a COALESCE-style "set only if currently NULL" clause so a disposition
-- set by an earlier, separate action (e.g. a pre-emptive 'retained') is never overwritten.
--
-- PLAN_VERIFICATION VALIDATION V2 (fb708e20): NO EXPLICIT BEGIN/COMMIT -- scripts/apply-
-- migration.js already wraps the whole apply (advisory locks, before/after object-definition
-- capture, this SQL, the audit-row write, and the apply-token consumption UPDATE) in ONE outer
-- transaction on a single connection. An embedded BEGIN here is a harmless no-op warning, but
-- an embedded COMMIT would prematurely end that outer transaction -- everything after it
-- (the audit write, the token-consumption UPDATE) would then run outside the transaction the
-- error-path ROLLBACK assumes still covers them, silently breaking the atomicity the apply
-- tooling's audit trail depends on. Matches the companion migration's own explicit convention
-- (20260823145530_marketlens_teardown_disposition_CHAIRMAN_GATED.sql).

-- ──────────────────────────────────────────────────────────────────────────
-- 1. New columns on ventures
-- ──────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ventures
  ADD COLUMN IF NOT EXISTS teardown_disposition TEXT,
  ADD COLUMN IF NOT EXISTS teardown_disposition_reason TEXT,
  ADD COLUMN IF NOT EXISTS teardown_disposition_by TEXT,
  ADD COLUMN IF NOT EXISTS teardown_disposition_at TIMESTAMPTZ;

ALTER TABLE public.ventures
  ADD CONSTRAINT ventures_teardown_disposition_check
  CHECK (teardown_disposition IS NULL OR teardown_disposition IN ('pending_teardown', 'retained', 'torn_down'));

CREATE INDEX IF NOT EXISTS idx_ventures_teardown_disposition
  ON public.ventures (teardown_disposition)
  WHERE teardown_disposition IS NOT NULL;

-- ──────────────────────────────────────────────────────────────────────────
-- 2. kill_venture(): regenerated verbatim from the LIVE pg_get_functiondef(oid) (SECURITY
--    EXEC review f30e26e7) -- includes the SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001 cascade-
--    cancel step and the eva_ventures-guarded eva_events insert this SD's own earlier draft
--    accidentally dropped by copying from the stale original migration file instead.
--    Signature is UNCHANGED (no new parameter) -- CREATE OR REPLACE only.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.kill_venture(p_venture_id uuid, p_rationale text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_killer_uid UUID := auth.uid();
  v_kill_log_id UUID;
  v_sd_cancelled INT := 0;  -- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001
BEGIN
  -- A-1: Role check via canonical helper (chairman/admin/owner accepted)
  IF NOT public.fn_is_chairman() THEN
    RAISE EXCEPTION 'Only chairman or lead can reject a venture'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Length check (matches CHECK on table; defense-in-depth; cleaner error)
  IF length(p_rationale) < 20 THEN
    RAISE EXCEPTION 'Rationale must be at least 20 characters (got %)', length(p_rationale)
      USING ERRCODE = 'check_violation';
  END IF;

  -- A-3 + A-8 step 1: dual-state UPDATE on ventures
  UPDATE public.ventures
  SET
    status = 'cancelled',
    workflow_status = 'killed',
    killed_at = now(),
    kill_reason = p_rationale,
    -- SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-1: default to pending_teardown only when no
    -- disposition is already set (e.g. a pre-emptive 'retained' recorded before this kill) --
    -- COALESCE never overwrites an existing value.
    teardown_disposition = COALESCE(
      teardown_disposition,
      CASE WHEN deployment_url IS NOT NULL THEN 'pending_teardown' END
    ),
    updated_at = now()
  WHERE id = p_venture_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venture % not found', p_venture_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- SD-LEO-FEAT-CHAIRMAN-VENTURE-DELETE-001: cancel the venture's NON-TERMINAL
  -- strategic directives so a killed venture no longer leaves orphaned active SDs.
  UPDATE public.strategic_directives_v2
  SET
    status = 'cancelled',
    cancellation_reason = p_rationale,
    metadata = COALESCE(metadata, '{}'::jsonb)
               || jsonb_build_object('cancelled_due_to_venture', p_venture_id, 'cancelled_at', now()),
    updated_at = now()
  WHERE venture_id = p_venture_id
    AND status NOT IN ('completed', 'cancelled');
  GET DIAGNOSTICS v_sd_cancelled = ROW_COUNT;

  -- A-8 step 2: INSERT ventures_kill_log audit row
  INSERT INTO public.ventures_kill_log (venture_id, killed_by_user_id, rationale, metadata)
  VALUES (p_venture_id, v_killer_uid, p_rationale,
          jsonb_build_object('strategic_directives_cancelled', v_sd_cancelled))
  RETURNING id INTO v_kill_log_id;

  -- A-8 step 3 + A-2: emit eva_events row — GUARDED on the eva_ventures mirror.
  -- eva_events.eva_venture_id FKs to eva_ventures(id); ventures created outside the
  -- EVA pipeline have no mirror, so emit the event only when one exists. The kill
  -- must not be aborted just because the venture is not EVA-tracked.
  INSERT INTO public.eva_events (event_type, event_source, event_data, eva_venture_id)
  SELECT
    'status_change',
    'kill_venture_rpc',
    jsonb_build_object(
      'type', 'venture.killed',
      'venture_id', p_venture_id,
      'killed_by_user_id', v_killer_uid,
      'rationale', p_rationale,
      'killed_at', now(),
      'kill_log_id', v_kill_log_id,
      'strategic_directives_cancelled', v_sd_cancelled
    ),
    p_venture_id
  WHERE EXISTS (SELECT 1 FROM public.eva_ventures WHERE id = p_venture_id);

  -- A-8 step 4 + A-5: operations_audit_log governance trail
  INSERT INTO public.operations_audit_log (entity_type, entity_id, action, performed_by, severity, metadata)
  VALUES (
    'venture',
    p_venture_id::text,
    'kill',
    v_killer_uid,
    'warning',
    jsonb_build_object(
      'rationale', p_rationale,
      'kill_log_id', v_kill_log_id,
      'strategic_directives_cancelled', v_sd_cancelled,
      'sd_id', '5474573f-3fd9-43e5-8c9e-4584a0cedfdc'
    )
  );

  RETURN v_kill_log_id;
END;
$function$;

-- No GRANT statement here: CREATE OR REPLACE FUNCTION preserves the existing GRANT on the
-- unchanged (uuid, text) signature -- re-asserting it would be redundant and would push this
-- migration into TIER-2 classification for an unrelated reason (GRANT is unconditionally
-- forbidden top-level per scripts/lib/migration-tier-classifier.mjs). It is already TIER-2
-- for the FUNCTION statements themselves.

-- ──────────────────────────────────────────────────────────────────────────
-- 3. reject_chairman_decision(): regenerated verbatim from the LIVE pg_get_functiondef(oid)
--    (SECURITY EXEC review f30e26e7, S1 CRITICAL) -- the live signature is 4 parameters
--    (p_decision_id, p_rationale, p_decided_by, p_stepup_token), NOT the 3-parameter shape
--    this SD's first draft copied from the stale original migration file. A 3-arg
--    CREATE OR REPLACE would have created a SEPARATE, UNGUARDED overload alongside the live
--    4-arg one (Postgres keys function identity on argument TYPES) -- stripping the
--    auth.role()='service_role' OR fn_is_chairman() guard and the high-consequence step-up
--    token gate from two later SDs (SD-FDBK-GEN-RESTRICT-APPROVE-CHAIRMAN-001,
--    SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-C). Same teardown_disposition COALESCE clause
--    added to the kill-gate UPDATE branch only. Signature UNCHANGED (4 params, defaults
--    preserved on p_decided_by/p_stepup_token).
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_chairman_decision(p_decision_id uuid, p_rationale text, p_decided_by text DEFAULT NULL::text, p_stepup_token uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_decision RECORD;
  v_venture_id UUID;
  v_lifecycle_stage INTEGER;
  v_is_kill_gate BOOLEAN;
  v_new_status TEXT;
  v_user_uid UUID := auth.uid();
BEGIN
  -- (0) AUTHORIZATION GUARD (SD-FDBK-GEN-RESTRICT-APPROVE-CHAIRMAN-001) — preserved verbatim.
  IF NOT (auth.role() = 'service_role' OR public.fn_is_chairman()) THEN
    RAISE EXCEPTION 'Only chairmen or service_role may reject gate decisions'
      USING ERRCODE = '42501';
  END IF;

  SELECT venture_id, lifecycle_stage, consequence_level INTO v_decision
  FROM public.chairman_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chairman_decision % not found', p_decision_id;
  END IF;

  v_venture_id := v_decision.venture_id;
  v_lifecycle_stage := v_decision.lifecycle_stage;
  v_is_kill_gate := v_lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);

  -- SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-C: high-consequence step-up gate.
  IF (v_decision.consequence_level = 'high' OR v_lifecycle_stage = 24) THEN
    PERFORM fn_verify_and_consume_stepup_token(p_stepup_token, p_decision_id);
  END IF;

  IF v_is_kill_gate THEN
    UPDATE public.ventures
    SET status = 'cancelled',
        workflow_status = 'killed',
        killed_at = now(),
        kill_reason = p_rationale,
        -- SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-1: same disposition-default clause as
        -- kill_venture(), kept in sync (both are terminal-status disposition writers).
        teardown_disposition = COALESCE(
          teardown_disposition,
          CASE WHEN deployment_url IS NOT NULL THEN 'pending_teardown' END
        ),
        updated_at = now()
    WHERE id = v_venture_id;
    v_new_status := 'killed';
  ELSE
    UPDATE public.ventures
    SET status = 'cancelled',
        updated_at = now()
    WHERE id = v_venture_id;
    v_new_status := 'cancelled';
  END IF;

  -- status/decision/blocking writes preserved verbatim (live SD-MAN-FIX-FIX-REJECT-CHAIRMAN-001).
  UPDATE public.chairman_decisions
  SET status = 'rejected',
      decision = CASE WHEN v_is_kill_gate THEN 'kill' ELSE 'reject' END,
      rationale = COALESCE(p_rationale, 'Rejected by Chairman'),
      decided_by = COALESCE(p_decided_by, v_user_uid::text),
      decided_by_user_id = v_user_uid,
      blocking = false,
      updated_at = now()
  WHERE id = p_decision_id;

  -- SD-LEO-INFRA-CHAIRMAN-DECIDE-REJECT-AUDIT-TRAIL-001 FR-3: shared helper (was the inline 3 inserts).
  -- The helper is kill-gate-guarded internally (no-op off a kill gate).
  PERFORM public.fn_write_kill_audit_trail(
    v_venture_id, v_lifecycle_stage, p_rationale, v_user_uid, 'reject_chairman_decision', p_decision_id
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'decision_id', p_decision_id,
    'venture_id', v_venture_id,
    'lifecycle_stage', v_lifecycle_stage,
    'new_status', v_new_status,
    'is_kill_gate', v_is_kill_gate,
    'source', 'reject_chairman_decision'
  );
END;
$function$;

-- FR-3 (recording MarketLens's explicit pending_teardown disposition) is
-- DELIBERATELY NOT in this migration -- it is a live-data UPDATE on a
-- specific production row, which is unconditionally TIER-2 chairman-gated
-- per scripts/lib/migration-tier-classifier.mjs's FORBIDDEN_TOPLEVEL set,
-- regardless of how narrowly scoped the WHERE clause is. See the companion
-- migration 20260823145530_marketlens_teardown_disposition_CHAIRMAN_GATED.sql.

-- ──────────────────────────────────────────────────────────────────────────
-- 4. fn_chairman_decide(): PLAN_VERIFICATION finding V1 (VALIDATION, fb708e20) -- kill_venture()
--    and reject_chairman_decision() are not the only live paths that terminalize a venture.
--    fn_chairman_decide() is the PRIMARY programmatic chairman-decision path (called from
--    lib/chairman/decision-queue.mjs, scripts/chairman-decisions.mjs decide, and
--    lib/eva/eva-orchestrator.js) and has its own, independent kill-gate UPDATE branch that
--    this SD's earlier drafts missed entirely -- without this, most real chairman decisions
--    would silently bypass the disposition mechanism this SD exists to add. Regenerated
--    verbatim from LIVE pg_get_functiondef(oid) (same methodology as sections 2/3 above,
--    following the S1 lesson), with only the same teardown_disposition COALESCE clause added
--    to its kill-gate UPDATE branch. Signature UNCHANGED (5 params, defaults preserved on
--    p_rationale/p_force_stale). NOT SECURITY DEFINER in the live definition -- unchanged here.
-- ──────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_chairman_decide(p_decision_id uuid, p_action text, p_decided_by text, p_rationale text DEFAULT NULL::text, p_force_stale boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_decision RECORD;
  v_rows_updated INT;
  v_decision_value TEXT;
  v_is_kill_gate BOOLEAN;
  v_has_venture BOOLEAN;
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approved or rejected.', 'code', 'INVALID_ACTION');
  END IF;

  -- FR-1: LEFT JOIN. This is the whole null-safety fix; everything below is making the
  -- consequences of a NULL venture EXPLICIT rather than incidental.
  SELECT cd.*, v.updated_at AS venture_updated_at, v.name AS venture_name
  INTO v_decision
  FROM chairman_decisions cd
  LEFT JOIN ventures v ON v.id = cd.venture_id
  WHERE cd.id = p_decision_id
  FOR UPDATE OF cd;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision not found.', 'code', 'NOT_FOUND');
  END IF;

  v_has_venture := v_decision.venture_id IS NOT NULL;

  IF v_decision.status != 'pending' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Decision already %s by %s at %s.', v_decision.status, COALESCE(v_decision.decided_by, 'unknown'), v_decision.updated_at),
      'code', 'ALREADY_DECIDED',
      'current_status', v_decision.status,
      'decided_by', v_decision.decided_by,
      'decided_at', v_decision.updated_at
    );
  END IF;

  -- FR-2: semantics from TYPE, never from nullability. Unmapped raises rather than defaulting.
  v_decision_value := public.fn_chairman_decision_value(v_decision.decision_type, p_action);
  IF v_decision_value IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('decision_type "%s" has no semantic mapping. Add it to fn_chairman_decision_value rather than letting it inherit another type''s meaning.', v_decision.decision_type),
      'code', 'UNMAPPED_DECISION_TYPE',
      'decision_type', v_decision.decision_type
    );
  END IF;

  -- STALE_CONTEXT is a VENTURE-state check, so it is now gated on venture presence EXPLICITLY.
  -- Previously it read `venture_updated_at > created_at`, which under a LEFT JOIN evaluates to
  -- NULL for a venture-less row and is therefore not TRUE — the right outcome by accident. Relying
  -- on three-valued logic for a guard means the next reader must re-derive it to trust it.
  IF v_has_venture AND NOT p_force_stale AND v_decision.venture_updated_at > v_decision.created_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Venture "%s" state has changed since this decision was created. Review updated state before deciding.', v_decision.venture_name),
      'code', 'STALE_CONTEXT',
      'decision_created_at', v_decision.created_at,
      'venture_updated_at', v_decision.venture_updated_at,
      'venture_name', v_decision.venture_name
    );
  END IF;

  -- Write the COMPLETE triple — status AND decision AND blocking (preserved from the live version).
  UPDATE chairman_decisions
  SET status = p_action, decision = v_decision_value, blocking = false, decided_by = p_decided_by, rationale = COALESCE(p_rationale, rationale)
  WHERE id = p_decision_id AND status = 'pending';
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision was modified by another session.', 'code', 'CONCURRENT_MODIFICATION');
  END IF;

  -- The reject path touches ventures THREE times, and only the third genuinely needed a guard.
  -- The two UPDATEs are NULL-predicate no-ops, but PERFORM fn_write_kill_audit_trail(NULL, ...)
  -- would pass a NULL venture into the audit helper — either a constraint failure or a meaningless
  -- kill-audit row. The whole block is therefore branched on venture presence rather than left to
  -- no-op its way through.
  IF p_action = 'rejected' AND v_has_venture THEN
    v_is_kill_gate := v_decision.lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);
    IF v_is_kill_gate THEN
      UPDATE ventures
      SET status = 'cancelled',
          workflow_status = 'killed',
          killed_at = now(),
          kill_reason = p_rationale,
          -- SD-LEO-INFRA-VENTURE-KILL-CANCEL-001 FR-1 (PLAN_VERIFICATION V1): same
          -- disposition-default clause as kill_venture() and reject_chairman_decision(),
          -- kept in sync -- all three are terminal-status disposition writers.
          teardown_disposition = COALESCE(
            teardown_disposition,
            CASE WHEN deployment_url IS NOT NULL THEN 'pending_teardown' END
          ),
          updated_at = now()
      WHERE id = v_decision.venture_id;
    ELSE
      UPDATE ventures
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_decision.venture_id;
    END IF;

    PERFORM public.fn_write_kill_audit_trail(
      v_decision.venture_id, v_decision.lifecycle_stage, p_rationale, auth.uid(), 'fn_chairman_decide', p_decision_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'action', p_action,
    'decision', v_decision_value,
    'blocking', false,
    'decided_by', p_decided_by,
    'venture_name', v_decision.venture_name,   -- NULL for venture-less rows, truthfully
    'venture_less', NOT v_has_venture
  );
END;
$function$;

-- ──────────────────────────────────────────────────────────────────────────
-- Verification queries (run separately after applying)
-- ──────────────────────────────────────────────────────────────────────────
--
-- 1. Columns + constraint exist:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'ventures' AND column_name LIKE 'teardown_disposition%';
--   SELECT conname FROM pg_constraint WHERE conname = 'ventures_teardown_disposition_check';
--
-- 2. RPC signatures unchanged (no new overload -- re-verify against pg_get_functiondef
--    immediately before applying, in case of further drift since this migration was authored):
--   SELECT proname, pronargs FROM pg_proc
--   WHERE proname IN ('kill_venture', 'reject_chairman_decision', 'fn_chairman_decide');
--   -- Expected: kill_venture pronargs=2, reject_chairman_decision pronargs=4,
--   -- fn_chairman_decide pronargs=5 (all unchanged)
--
-- 3. Re-run note: ADD COLUMN uses IF NOT EXISTS (idempotent); ADD CONSTRAINT does NOT
--    (Postgres has no ADD CONSTRAINT IF NOT EXISTS) -- a second run will fail loudly on the
--    constraint with a clear "already exists" error rather than silently duplicating it.
--    This migration is intended as a one-shot apply, matching this repo's general convention.
