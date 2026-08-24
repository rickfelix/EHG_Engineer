-- CAPTURED LIVE via pg_get_functiondef() at 2026-08-24T03:58:07.377Z
-- SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001 / FR-4 -- BEFORE artifact.
-- Source: live consolidated engineer DB. NOT copied from any migration file (a stale
-- migration-file copy of a live RPC caused a real authentication-bypass risk on a prior SD
-- this session -- see FR-4's description).
--
CREATE OR REPLACE FUNCTION public.fn_atomic_lead_to_plan_transition(p_sd_id text, p_session_id text, p_request_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
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
$function$

