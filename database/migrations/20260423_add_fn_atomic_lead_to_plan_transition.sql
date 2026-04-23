-- ============================================================================
-- Migration: SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 2
--   Create fn_atomic_lead_to_plan_transition — atomic SD phase/status
--   promotion with advisory locking, idempotency via request_id, and
--   pre/post state capture in sd_transition_audit.
-- ============================================================================
-- Parent orchestrator : SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001
-- PRD                 : PRD-SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D
-- Template            : fn_atomic_exec_to_plan_transition (deployed schema)
-- Date                : 2026-04-23
-- ============================================================================
--
-- Mirrors the deployed EXEC-TO-PLAN atomic-transition function exactly
-- where possible. Differences vs EXEC-TO-PLAN version:
--   - Only promotes the SD (status/current_phase); does not touch PRD or
--     user stories (those promotions happen later in the workflow).
--   - transition_type = 'LEAD_TO_PLAN'.
--   - Target values: current_phase='PLAN_PRD', status='in_progress'.
--
-- Relies on existing `sd_transition_audit` table (deployed via
-- fn_atomic_exec_to_plan_transition migration). Does NOT create the table.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_atomic_lead_to_plan_transition(
  p_sd_id       TEXT,
  p_session_id  TEXT,
  p_request_id  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sd_uuid       UUID;
  v_pre_state     JSONB;
  v_post_state    JSONB;
  v_audit_id      UUID;
  v_request_id    TEXT;
  v_sd_row        RECORD;
  v_lock_acquired BOOLEAN;
BEGIN
  -- Generate request_id for idempotency if not provided.
  v_request_id := COALESCE(
    p_request_id,
    p_sd_id || '-' || p_session_id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT
  );

  -- Idempotency: prior success for this request_id returns immediately.
  SELECT id INTO v_audit_id
    FROM sd_transition_audit
   WHERE request_id = v_request_id
     AND status = 'completed';

  IF v_audit_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_hit', true,
      'message', 'Transition already completed',
      'audit_id', v_audit_id
    );
  END IF;

  -- Resolve SD UUID from id (legacy text) or sd_key.
  SELECT uuid_id INTO v_sd_uuid
    FROM strategic_directives_v2
   WHERE id = p_sd_id OR sd_key = p_sd_id
   LIMIT 1;

  IF v_sd_uuid IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'SD not found: ' || p_sd_id
    );
  END IF;

  -- Advisory lock scoped per-SD (transaction-scoped, auto-released).
  v_lock_acquired := pg_try_advisory_xact_lock(hashtext(p_sd_id));
  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Concurrent transition in progress',
      'code', 'CONCURRENT_LOCK'
    );
  END IF;

  -- Capture pre-state with row-level lock.
  SELECT id, status, current_phase, transition_version, progress
    INTO v_sd_row
    FROM strategic_directives_v2
   WHERE uuid_id = v_sd_uuid
   FOR UPDATE;

  v_pre_state := jsonb_build_object(
    'sd_id', p_sd_id,
    'sd_status', v_sd_row.status,
    'sd_phase', v_sd_row.current_phase,
    'sd_version', v_sd_row.transition_version,
    'sd_progress', v_sd_row.progress
  );

  -- Create audit record (in_progress).
  INSERT INTO sd_transition_audit (
    sd_id, transition_type, session_id, request_id, pre_state, status
  )
  VALUES (
    v_sd_uuid, 'LEAD_TO_PLAN', p_session_id, v_request_id,
    v_pre_state, 'in_progress'
  )
  RETURNING id INTO v_audit_id;

  -- ============================== ATOMIC PROMOTION ============================
  UPDATE strategic_directives_v2
     SET current_phase     = 'PLAN_PRD',
         status            = 'in_progress',
         transition_version = COALESCE(transition_version, 1) + 1,
         updated_at        = NOW()
   WHERE uuid_id = v_sd_uuid;
  -- ============================================================================

  v_post_state := jsonb_build_object(
    'sd_phase', 'PLAN_PRD',
    'sd_status', 'in_progress'
  );

  UPDATE sd_transition_audit
     SET status       = 'completed',
         post_state   = v_post_state,
         completed_at = NOW()
   WHERE id = v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'audit_id', v_audit_id,
    'pre_state', v_pre_state,
    'post_state', v_post_state
  );

EXCEPTION WHEN OTHERS THEN
  IF v_audit_id IS NOT NULL THEN
    UPDATE sd_transition_audit
       SET status       = 'failed',
           error_details = jsonb_build_object(
             'code', SQLSTATE,
             'message', SQLERRM,
             'detail', COALESCE(v_pre_state, '{}'::JSONB)
           ),
           completed_at = NOW()
     WHERE id = v_audit_id;
  END IF;
  RAISE;
END;
$function$;

COMMENT ON FUNCTION public.fn_atomic_lead_to_plan_transition IS
  'Atomic LEAD → PLAN_PRD promotion of a Strategic Directive. '
  'Mirrors fn_atomic_exec_to_plan_transition pattern: advisory-locked per '
  'SD, idempotent via request_id, pre/post state captured in '
  'sd_transition_audit, transactional rollback on exception. Added by '
  'SD-LEO-PROTOCOL-INFRASTRUCTURE-RELATIONSHIPAWARE-ORCH-001-D Fix 2.';
