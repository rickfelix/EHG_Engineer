-- Fix fn_atomic_exec_to_plan_transition: 'verification' is not valid in strategic_directives_v2_status_check
-- Change SD status from 'verification' to 'active' (SD remains active during verification phase)
-- PRD status 'verification' is correct and unchanged.

CREATE OR REPLACE FUNCTION public.fn_atomic_exec_to_plan_transition(p_sd_id text, p_prd_id text, p_session_id text, p_request_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_sd_uuid UUID;
  v_prd_uuid UUID;
  v_pre_state JSONB;
  v_post_state JSONB;
  v_audit_id UUID;
  v_request_id TEXT;
  v_sd_row RECORD;
  v_prd_row RECORD;
  v_lock_acquired BOOLEAN;
  v_stories_updated INTEGER;
BEGIN
  -- Generate request_id for idempotency if not provided
  v_request_id := COALESCE(p_request_id, p_sd_id || '-' || p_session_id || '-' || EXTRACT(EPOCH FROM NOW())::TEXT);

  -- Check for duplicate request (idempotency)
  SELECT id INTO v_audit_id
  FROM sd_transition_audit
  WHERE request_id = v_request_id AND status = 'completed';

  IF v_audit_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent_hit', true,
      'message', 'Transition already completed',
      'audit_id', v_audit_id
    );
  END IF;

  -- Resolve SD UUID from id or sd_key
  SELECT uuid_id INTO v_sd_uuid
  FROM strategic_directives_v2
  WHERE id = p_sd_id OR sd_key = p_sd_id
  LIMIT 1;

  IF v_sd_uuid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'SD not found: ' || p_sd_id);
  END IF;

  -- Resolve PRD UUID if provided
  IF p_prd_id IS NOT NULL AND p_prd_id != '' THEN
    SELECT uuid_id INTO v_prd_uuid
    FROM product_requirements_v2
    WHERE prd_id = p_prd_id OR uuid_id::TEXT = p_prd_id
    LIMIT 1;
  END IF;

  -- Acquire advisory lock (transaction-scoped, auto-releases on commit/rollback)
  v_lock_acquired := pg_try_advisory_xact_lock(hashtext(p_sd_id));

  IF NOT v_lock_acquired THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Concurrent transition in progress',
      'code', 'CONCURRENT_LOCK'
    );
  END IF;

  -- Capture pre-state
  SELECT id, status, current_phase, transition_version, progress
  INTO v_sd_row
  FROM strategic_directives_v2
  WHERE uuid_id = v_sd_uuid
  FOR UPDATE; -- Row-level lock

  v_pre_state := jsonb_build_object(
    'sd_id', p_sd_id,
    'sd_status', v_sd_row.status,
    'sd_phase', v_sd_row.current_phase,
    'sd_version', v_sd_row.transition_version,
    'sd_progress', v_sd_row.progress
  );

  -- Add PRD state if exists
  IF v_prd_uuid IS NOT NULL THEN
    SELECT prd_id, status, phase
    INTO v_prd_row
    FROM product_requirements_v2
    WHERE uuid_id = v_prd_uuid
    FOR UPDATE;

    v_pre_state := v_pre_state || jsonb_build_object(
      'prd_id', p_prd_id,
      'prd_status', v_prd_row.status,
      'prd_phase', v_prd_row.phase
    );
  END IF;

  -- Create audit record (in_progress)
  INSERT INTO sd_transition_audit (sd_id, transition_type, session_id, request_id, pre_state, status)
  VALUES (v_sd_uuid, 'EXEC_TO_PLAN', p_session_id, v_request_id, v_pre_state, 'in_progress')
  RETURNING id INTO v_audit_id;

  -- === ATOMIC TRANSITIONS START ===

  -- Step 1: Update user stories to validated/completed
  -- FIX: Cast v_sd_uuid to text because user_stories.sd_id is varchar(50), not UUID
  UPDATE user_stories
  SET
    status = CASE WHEN status = 'in_progress' THEN 'completed' ELSE status END,
    implementation_status = 'validated',
    updated_at = NOW()
  WHERE sd_id = v_sd_uuid::text
  AND status IN ('in_progress', 'draft', 'ready');

  GET DIAGNOSTICS v_stories_updated = ROW_COUNT;

  -- Step 2: Update PRD status to verification
  IF v_prd_uuid IS NOT NULL THEN
    UPDATE product_requirements_v2
    SET
      status = 'verification',
      phase = 'verification',
      updated_at = NOW()
    WHERE uuid_id = v_prd_uuid;
  END IF;

  -- Step 3: Update SD phase to EXEC_COMPLETE
  -- FIX: Use 'active' instead of 'verification' (not valid in strategic_directives_v2_status_check)
  UPDATE strategic_directives_v2
  SET
    current_phase = 'EXEC_COMPLETE',
    status = 'active',
    transition_version = COALESCE(transition_version, 1) + 1,
    updated_at = NOW()
  WHERE uuid_id = v_sd_uuid;

  -- === ATOMIC TRANSITIONS END ===

  -- Capture post-state
  v_post_state := jsonb_build_object(
    'sd_phase', 'EXEC_COMPLETE',
    'sd_status', 'active',
    'prd_status', 'verification',
    'stories_updated', v_stories_updated
  );

  -- Update audit record to completed
  UPDATE sd_transition_audit
  SET
    status = 'completed',
    post_state = v_post_state,
    completed_at = NOW()
  WHERE id = v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'audit_id', v_audit_id,
    'stories_updated', v_stories_updated,
    'pre_state', v_pre_state,
    'post_state', v_post_state
  );

EXCEPTION WHEN OTHERS THEN
  -- Log error to audit table
  IF v_audit_id IS NOT NULL THEN
    UPDATE sd_transition_audit
    SET
      status = 'failed',
      error_details = jsonb_build_object(
        'code', SQLSTATE,
        'message', SQLERRM,
        'detail', COALESCE(v_pre_state, '{}'::JSONB)
      ),
      completed_at = NOW()
    WHERE id = v_audit_id;
  END IF;

  -- Re-raise to trigger transaction rollback
  RAISE;
END;
$function$;
