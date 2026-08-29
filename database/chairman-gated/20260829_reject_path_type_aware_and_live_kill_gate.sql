-- SD-LEO-INFRA-REJECT-PATH-VENTURE-001 -- Reject-path venture kill: type-blind cancellation
-- side-effect + stale kill-gate literal in fn_chairman_decide (AltifyAI mechanical-kill root fix)
--
-- STAGED, NOT APPLIED. CREATE OR REPLACE on SECURITY-DEFINER-adjacent RPCs that execute a
-- chairman-reserved act (venture kill) is TIER-2 under the tiered auto-apply policy. The builder
-- stages; only the chairman applies, via the 3-factor ceremony (--prod-deploy + single-use token +
-- an @approved-by header matching git config user.email).
--
-- @approved-by: PENDING
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2026-08-29: venture 50763b6a (AltifyAI) was killed at 10:44:16.283732Z by the SAME transaction
-- that recorded Adam's REJECTION of a non-blocking gate_failure_escalation cancel-recommendation.
-- The rejecting seat's veto rationale was written into the venture as kill_reason -- the text
-- forbidding the kill became its recorded justification. Caught by worker Hotel-4 cross-check
-- 21:39Z; state restored by Adam 22:07Z with forensics preserved in
-- ventures.metadata.mechanical_kill_reversal_20260829.
--
-- TWO COMPOSED FAULTS, confirmed live via pg_get_functiondef (this SD's LEAD-phase Explore pass,
-- sub_agent_execution_results id 57492daa-0124-4ce8-8e89-7c1579d88104):
--
-- FAULT 1 -- TYPE/BLOCKING-BLIND KILL SIDE-EFFECT (polarity). chairman_decisions.decision holds a
-- RECOMMENDATION computed by fn_chairman_decision_value(decision_type, action); approve executes
-- it, reject must never execute it. fn_chairman_decide already computes v_decision_value at
-- accept-time (see the 08-03 migration's FR-2) but the venture-cancel/kill block never consults it
-- -- it fires on ANY `p_action = 'rejected' AND v_has_venture`, kill-gate or not. A rejected
-- gate_failure_escalation resolves decision_value='cancel' (an escalation-ITEM disposition per
-- fn_chairman_decision_value's own QUESTION/REVIEW/ESCALATION branch), yet the venture-side-effect
-- block cancels the VENTURE anyway. reject_chairman_decision() carries the identical fault
-- independently -- it never calls fn_chairman_decision_value at all.
--
-- FAULT 2 -- STALE KILL-GATE LITERAL, THREE SITES. `v_is_kill_gate := lifecycle_stage = ANY
-- (ARRAY[3, 5, 13, 23])` in fn_chairman_decide (line 216 of the 08-03 migration, matching the live
-- function), the identical literal in reject_chairman_decision, AND a FOURTH, previously-unnamed
-- occurrence in the shared helper fn_write_kill_audit_trail -- all pre-date the venture-UAT stage
-- renumber (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, live 2026-08-28/29). Live venture_stages
-- (gate_type='kill') is {3, 5, 13, 24}: stage 23 is now dedicated_venture_uat (gate_type=NONE) and
-- stage 24 is launch_readiness_gate (the real kill gate). Consequence: a reject at 23 fabricates a
-- full kill record (workflow_status=killed, killed_at, kill_reason, audit trail) at a stage with no
-- kill gate; a reject at the REAL kill gate 24 falls to the non-kill branch and produces NO audit
-- trail at all. The same stale literal fabricates a kill record where none belongs and suppresses
-- one where it does.
--
-- THIRD-RECURRENCE PREMISE -- why the 08-03 half-fix survived review. That migration made the
-- decision VOCABULARY type-honest (FR-2: v_decision_value keyed on decision_type, never a blind
-- 'kill' default) and left the venture SIDE-EFFECT type-blind: it corrected what the row SAYS and
-- not what it DOES. This SD closes both halves in the same function family, and closes the census
-- gap that let a chairman-gated function escape the stage-literal drift census entirely (see the
-- companion change to docs/architecture/stage-advancement-path-census.md).
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE FIX
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. fn_is_kill_gate_stage(p_lifecycle_stage): new helper, reads venture_stages.gate_type='kill'
--    LIVE. Replaces the ARRAY[3,5,13,23] literal at all 3 SQL sites below -- the class this SD's
--    own scope calls "TEETH-001 SC4 class-kill shape: never a hardcoded array".
-- 2. fn_chairman_decide: venture-cancel/kill block now gated on `v_decision_value = 'kill'` (the
--    value ALREADY computed at accept-time, FR-2 of 08-03) instead of unconditionally on
--    `p_action = 'rejected'`. A rejected gate_failure_escalation (decision_value='cancel') now
--    never reaches the venture block at all -- zero ventures.status write, matching the coordinator's
--    verbatim two-sided contract's non-blocking-escalation side.
-- 3. reject_chairman_decision: gains the same fn_chairman_decision_value(decision_type, action)
--    call fn_chairman_decide already had, gated identically.
-- 4. fn_write_kill_audit_trail: kill-gate check switched to the new live helper. Its existing
--    early-RETURN-NULL-when-not-a-kill-gate behavior is otherwise unchanged.
-- 5. kill_venture(): AUDITED, NOT MODIFIED. It performs an unconditional, fn_is_chairman()
--    -authorized explicit kill with no decision_type branching and no hardcoded stage array --
--    neither fault applies. Confirmed via pg_get_functiondef, not assumed.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- TWO-SIDED CONTRACT THIS FIX MUST SATISFY (coordinator's verbatim formulation)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- (a) A rejection on a genuine kill-gate decision MUST still cancel the venture with the full kill
--     record (workflow_status=killed, killed_at, kill_reason, audit trail).
-- (b) A rejection on a non-blocking gate_failure_escalation MUST NOT touch the venture at all.
-- See tests/database/reject-path-venture-kill-migration-shape.db.test.js for both sides, proven
-- against this file's own SQL text (the migration is chairman-gated and cannot be self-applied by
-- a worker session).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1. New live kill-gate helper -- replaces ARRAY[3,5,13,23] at all 3 call sites below.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_is_kill_gate_stage(p_lifecycle_stage integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.venture_stages
    WHERE stage_number = p_lifecycle_stage AND gate_type = 'kill'
  );
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2. fn_chairman_decide -- type-aware venture-touch guard + live kill-gate derivation.
--    Byte-for-byte the live 08-03 body EXCEPT: the `IF p_action = 'rejected' AND v_has_venture`
--    guard gains `AND v_decision_value = 'kill'`, and `v_is_kill_gate := ... ANY (ARRAY[3,5,13,23])`
--    becomes `v_is_kill_gate := public.fn_is_kill_gate_stage(v_decision.lifecycle_stage)`.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
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

  -- FR-1 (08-03): LEFT JOIN. This is the whole null-safety fix; everything below is making the
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

  -- FR-2 (08-03): semantics from TYPE, never from nullability. Unmapped raises rather than defaulting.
  v_decision_value := public.fn_chairman_decision_value(v_decision.decision_type, p_action);
  IF v_decision_value IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('decision_type "%s" has no semantic mapping. Add it to fn_chairman_decision_value rather than letting it inherit another type''s meaning.', v_decision.decision_type),
      'code', 'UNMAPPED_DECISION_TYPE',
      'decision_type', v_decision.decision_type
    );
  END IF;

  -- STALE_CONTEXT is a VENTURE-state check, so it is gated on venture presence EXPLICITLY.
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

  -- Write the COMPLETE triple -- status AND decision AND blocking (preserved from the live version).
  UPDATE chairman_decisions
  SET status = p_action, decision = v_decision_value, blocking = false, decided_by = p_decided_by, rationale = COALESCE(p_rationale, rationale)
  WHERE id = p_decision_id AND status = 'pending';
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision was modified by another session.', 'code', 'CONCURRENT_MODIFICATION');
  END IF;

  -- SD-LEO-INFRA-REJECT-PATH-VENTURE-001: the venture block now fires ONLY when the ALREADY-COMPUTED
  -- decision_value is 'kill' -- i.e. only for the venture-scoped decision_type set that
  -- fn_chairman_decision_value maps to 'kill' on reject. A rejected gate_failure_escalation
  -- (decision_value='cancel', an escalation-item disposition, not a venture disposition) now takes
  -- ZERO venture action. This is the AltifyAI mechanism, closed at its exact source.
  IF p_action = 'rejected' AND v_has_venture AND v_decision_value = 'kill' THEN
    v_is_kill_gate := public.fn_is_kill_gate_stage(v_decision.lifecycle_stage);
    IF v_is_kill_gate THEN
      UPDATE ventures
      SET status = 'cancelled',
          workflow_status = 'killed',
          killed_at = now(),
          kill_reason = p_rationale,
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
    'venture_name', v_decision.venture_name,
    'venture_less', NOT v_has_venture
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3. reject_chairman_decision -- gains the same type-aware guard fn_chairman_decide already had,
--    plus the live kill-gate helper. Everything else (auth guard, step-up gate, decision-row
--    write, audit-trail call) is byte-for-byte the live body.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
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
  v_decision_type TEXT;
  v_decision_value TEXT;
  v_is_kill_gate BOOLEAN;
  v_new_status TEXT;
  v_user_uid UUID := auth.uid();
BEGIN
  -- (0) AUTHORIZATION GUARD (SD-FDBK-GEN-RESTRICT-APPROVE-CHAIRMAN-001) -- preserved verbatim.
  IF NOT (auth.role() = 'service_role' OR public.fn_is_chairman()) THEN
    RAISE EXCEPTION 'Only chairmen or service_role may reject gate decisions'
      USING ERRCODE = '42501';
  END IF;

  SELECT venture_id, lifecycle_stage, consequence_level, decision_type INTO v_decision
  FROM public.chairman_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chairman_decision % not found', p_decision_id;
  END IF;

  v_venture_id := v_decision.venture_id;
  v_lifecycle_stage := v_decision.lifecycle_stage;
  v_decision_type := v_decision.decision_type;

  -- SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-C: high-consequence step-up gate. Preserved verbatim --
  -- evaluated on lifecycle_stage 24, which is the LIVE launch_readiness_gate kill stage (the
  -- literal `24` here was already correct; only the ARRAY[...,23] kill-gate check below was stale).
  IF (v_decision.consequence_level = 'high' OR v_lifecycle_stage = 24) THEN
    PERFORM fn_verify_and_consume_stepup_token(p_stepup_token, p_decision_id);
  END IF;

  -- SD-LEO-INFRA-REJECT-PATH-VENTURE-001: type-aware guard, mirroring fn_chairman_decide's fix --
  -- this function previously had NO decision_type test at all.
  v_decision_value := public.fn_chairman_decision_value(v_decision_type, 'rejected');

  IF v_venture_id IS NOT NULL AND v_decision_value = 'kill' THEN
    v_is_kill_gate := public.fn_is_kill_gate_stage(v_lifecycle_stage);
    IF v_is_kill_gate THEN
      UPDATE public.ventures
      SET status = 'cancelled',
          workflow_status = 'killed',
          killed_at = now(),
          kill_reason = p_rationale,
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
  ELSE
    v_is_kill_gate := false;
    v_new_status := NULL;
  END IF;

  -- status/decision/blocking writes preserved verbatim (live SD-MAN-FIX-FIX-REJECT-CHAIRMAN-001),
  -- except `decision` now reuses the already-computed, type-honest v_decision_value instead of a
  -- CASE keyed only on the (formerly stale) kill-gate check.
  UPDATE public.chairman_decisions
  SET status = 'rejected',
      decision = COALESCE(v_decision_value, 'reject'),
      rationale = COALESCE(p_rationale, 'Rejected by Chairman'),
      decided_by = COALESCE(p_decided_by, v_user_uid::text),
      decided_by_user_id = v_user_uid,
      blocking = false,
      updated_at = now()
  WHERE id = p_decision_id;

  -- SD-LEO-INFRA-CHAIRMAN-DECIDE-REJECT-AUDIT-TRAIL-001 FR-3: shared helper. Kill-gate-guarded
  -- internally via the now-live fn_is_kill_gate_stage helper (no-op off a kill gate).
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

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4. fn_write_kill_audit_trail -- kill-gate check switched to the live helper. Everything else
--    (the FK-guard fix from its own prior SD, insert shapes) is byte-for-byte the live body.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_write_kill_audit_trail(p_venture_id uuid, p_lifecycle_stage integer, p_rationale text, p_decided_by uuid, p_source text DEFAULT 'generic'::text, p_decision_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_kill_gate BOOLEAN;
  v_kill_log_id  UUID;
BEGIN
  v_is_kill_gate := public.fn_is_kill_gate_stage(p_lifecycle_stage);
  IF NOT v_is_kill_gate THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ventures_kill_log (venture_id, killed_by_user_id, rationale, metadata)
  VALUES (
    p_venture_id,
    p_decided_by,
    p_rationale,
    jsonb_build_object('source', p_source, 'decision_id', p_decision_id, 'lifecycle_stage', p_lifecycle_stage)
  )
  RETURNING id INTO v_kill_log_id;

  -- eva_events.eva_venture_id has an ENFORCED FK to eva_ventures (which does NOT mirror ventures 1:1).
  IF EXISTS (SELECT 1 FROM public.eva_ventures WHERE id = p_venture_id) THEN
    INSERT INTO public.eva_events (event_type, event_source, event_data, eva_venture_id)
    VALUES (
      'status_change',
      p_source || '_rpc',
      jsonb_build_object(
        'type', 'venture.killed',
        'venture_id', p_venture_id,
        'killed_by_user_id', p_decided_by,
        'rationale', p_rationale,
        'lifecycle_stage', p_lifecycle_stage,
        'decision_id', p_decision_id,
        'kill_log_id', v_kill_log_id
      ),
      p_venture_id
    );
  END IF;

  INSERT INTO public.operations_audit_log (entity_type, entity_id, action, performed_by, severity, metadata)
  VALUES (
    'venture',
    p_venture_id::text,
    'kill',
    p_decided_by,
    'warning',
    jsonb_build_object(
      'rationale', p_rationale,
      'source', p_source,
      'decision_id', p_decision_id,
      'lifecycle_stage', p_lifecycle_stage,
      'kill_log_id', v_kill_log_id
    )
  );

  RETURN v_kill_log_id;
END;
$function$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5. kill_venture() -- AUDITED, NOT MODIFIED (no CREATE OR REPLACE below; this is documentation).
-- Confirmed via pg_get_functiondef: fn_is_chairman()-authorized, unconditional explicit kill, no
-- decision_type branching, no hardcoded stage array. Neither Fault 1 nor Fault 2 applies. Its
-- purpose IS to kill (an operator/chairman explicitly calling "kill this venture"), unlike the
-- reject-path functions above where a kill is a SIDE-EFFECT of a decision whose type must first be
-- checked.
