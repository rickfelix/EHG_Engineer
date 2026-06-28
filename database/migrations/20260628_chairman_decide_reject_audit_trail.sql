-- @approved-by: codestreetlabs@gmail.com
--
-- 20260628_chairman_decide_reject_audit_trail.sql
-- SD-LEO-INFRA-CHAIRMAN-DECIDE-REJECT-AUDIT-TRAIL-001
--
-- fn_chairman_decide's 'rejected' branch wrote NONE of the kill-audit-trail that
-- reject_chairman_decision writes on kill-gate stages (ventures_kill_log + eva_events +
-- operations_audit_log) — so a chairman reject via the dashboard RPC left no governance kill record.
-- The audit logic was also duplicated. This migration:
--   FR-1: extracts ONE shared helper fn_write_kill_audit_trail (SECURITY DEFINER, kill-gate-guarded
--         [3,5,13,23], eva_events insert FK-guarded on eva_ventures existence so a reject can never
--         abort on that FK; ventures_kill_log + operations_audit_log always write).
--   FR-3: refactors reject_chairman_decision to call the helper (replaces only the inline audit block;
--         its auth guard + status/decision/blocking writes + return shape are UNCHANGED).
--   FR-2: fn_chairman_decide's reject branch now sets the venture terminal (status='cancelled', and on
--         a kill gate workflow_status='killed'/killed_at/kill_reason) and calls the SAME helper, so a
--         dashboard reject leaves the identical trail.
--   FR-4: the #5211 terminal-status (status='cancelled') + the trg_chairman_approval_unblock_orchestrator
--         unblock are preserved.
--
-- IMPORTANT: both CREATE OR REPLACE bodies below are RE-BASED on the CURRENT LIVE pg_get_functiondef
-- (not the older migration files), so applying this does NOT revert the live auth guard
-- (SD-FDBK-GEN-RESTRICT-APPROVE-CHAIRMAN-001) or the decision/blocking complete-triple writes. The ONLY
-- additions are: the helper, the helper PERFORM (replacing the inline audit block in reject), and the
-- reject-terminal + helper call in fn_chairman_decide.
--
-- CHAIRMAN-GATED APPLY (requires_chairman_apply): staged + tested via a rolled-back transaction; the
-- permanent apply is pre-staged for chairman GO at LEAD_FINAL.

BEGIN;

-- ── FR-1: shared kill-audit-trail helper (single source of truth) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_write_kill_audit_trail(
  p_venture_id      UUID,
  p_lifecycle_stage INTEGER,
  p_rationale       TEXT,
  p_decided_by      UUID,
  p_source          TEXT DEFAULT 'generic',
  p_decision_id     UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_kill_gate BOOLEAN;
  v_kill_log_id  UUID;
BEGIN
  v_is_kill_gate := p_lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);
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
  -- The legacy inline insert was unguarded, so a reject of a venture without an eva_ventures row would
  -- FK-abort the WHOLE reject (no kill recorded, decision not even resolved). Guard it: the lifecycle
  -- event writes when there is an eva lifecycle to attach it to; kill_log + operations_audit_log always
  -- write. A reject can never abort on this FK.
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
$$;

-- ── FR-3: reject_chairman_decision (LIVE body) refactored to call the shared helper ───────────
-- Re-based on live pg_get_functiondef: keeps the auth guard + status/decision/blocking writes verbatim;
-- ONLY the inline ventures_kill_log/eva_events/operations_audit_log block is replaced by the helper.
CREATE OR REPLACE FUNCTION public.reject_chairman_decision(p_decision_id uuid, p_rationale text, p_decided_by text DEFAULT NULL::text)
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

  SELECT venture_id, lifecycle_stage INTO v_decision
  FROM public.chairman_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'chairman_decision % not found', p_decision_id;
  END IF;

  v_venture_id := v_decision.venture_id;
  v_lifecycle_stage := v_decision.lifecycle_stage;
  v_is_kill_gate := v_lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);

  IF v_is_kill_gate THEN
    UPDATE public.ventures
    SET status = 'cancelled',
        workflow_status = 'killed',
        killed_at = now(),
        kill_reason = p_rationale,
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

-- ── FR-2: fn_chairman_decide (LIVE body) reject branch writes the trail via the shared helper ──
-- Re-based on live pg_get_functiondef: keeps v_decision_value + the COMPLETE (status,decision,blocking)
-- triple verbatim. ADDS the reject-terminal venture update (restoring/ensuring #5211 status='cancelled'
-- + kill columns on a kill gate) and the helper call. fn_chairman_decide has no auth guard live (the
-- dashboard RPC's own security model) — left as-is (no scope creep).
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
BEGIN
  IF p_action NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid action. Must be approved or rejected.', 'code', 'INVALID_ACTION');
  END IF;

  v_decision_value := CASE p_action WHEN 'approved' THEN 'proceed' WHEN 'rejected' THEN 'kill' END;

  SELECT cd.*, v.updated_at AS venture_updated_at, v.name AS venture_name
  INTO v_decision
  FROM chairman_decisions cd
  JOIN ventures v ON v.id = cd.venture_id
  WHERE cd.id = p_decision_id
  FOR UPDATE OF cd;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision not found.', 'code', 'NOT_FOUND');
  END IF;

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

  IF NOT p_force_stale AND v_decision.venture_updated_at > v_decision.created_at THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Venture "%s" state has changed since this decision was created. Review updated state before deciding.', v_decision.venture_name),
      'code', 'STALE_CONTEXT',
      'decision_created_at', v_decision.created_at,
      'venture_updated_at', v_decision.venture_updated_at,
      'venture_name', v_decision.venture_name
    );
  END IF;

  -- FR-1 (live): write the COMPLETE triple — status AND decision AND blocking.
  UPDATE chairman_decisions
  SET status = p_action, decision = v_decision_value, blocking = false, decided_by = p_decided_by, rationale = COALESCE(p_rationale, rationale)
  WHERE id = p_decision_id AND status = 'pending';
  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Decision was modified by another session.', 'code', 'CONCURRENT_MODIFICATION');
  END IF;

  -- SD-LEO-INFRA-CHAIRMAN-DECIDE-REJECT-AUDIT-TRAIL-001 (FR-2/FR-4): on reject, terminate the venture
  -- (status='cancelled' so the unblock trigger cannot resurrect it) and, on a KILL GATE, set the killed
  -- columns + write the kill-audit-trail via the shared helper (parity with reject_chairman_decision).
  IF p_action = 'rejected' THEN
    v_is_kill_gate := v_decision.lifecycle_stage = ANY (ARRAY[3, 5, 13, 23]);
    IF v_is_kill_gate THEN
      UPDATE ventures
      SET status = 'cancelled', workflow_status = 'killed', killed_at = now(), kill_reason = p_rationale, updated_at = now()
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
    'venture_name', v_decision.venture_name
  );
END;
$function$;

COMMIT;
