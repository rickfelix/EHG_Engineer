-- Migration: Atomic Handoff Transitions
-- SD: SD-LEO-INFRA-HARDENING-001
-- Purpose: Create RPC function for atomic EXEC-TO-PLAN state transitions
--
-- Problem: exec-to-plan/index.js lines 162-169 has 3 independent awaits.
-- If step 2 fails, step 1 is already committed (non-atomic).
--
-- Solution: PostgreSQL RPC with explicit transaction + advisory lock

-- ============================================================================
-- 1. AUDIT TABLE: Captures pre/post state for error recovery
-- ============================================================================

CREATE TABLE IF NOT EXISTS sd_transition_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sd_id UUID NOT NULL REFERENCES strategic_directives_v2(uuid_id),
  transition_type VARCHAR(50) NOT NULL,
  session_id TEXT,
  request_id TEXT NOT NULL, -- For idempotency
  pre_state JSONB NOT NULL,
  post_state JSONB,
  status VARCHAR(20) DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'rolled_back', 'failed')),
  error_details JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(request_id) -- Idempotency key
);

CREATE INDEX IF NOT EXISTS idx_sd_transition_audit_sd_id ON sd_transition_audit(sd_id);
CREATE INDEX IF NOT EXISTS idx_sd_transition_audit_status ON sd_transition_audit(status);
CREATE INDEX IF NOT EXISTS idx_sd_transition_audit_request_id ON sd_transition_audit(request_id);

COMMENT ON TABLE sd_transition_audit IS 'Captures pre/post state for all SD phase transitions, enabling rollback and debugging';

-- ============================================================================
-- 2. VERSION COLUMN: For optimistic locking
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'strategic_directives_v2'
    AND column_name = 'transition_version'
  ) THEN
    ALTER TABLE strategic_directives_v2
    ADD COLUMN transition_version INTEGER DEFAULT 1;

    COMMENT ON COLUMN strategic_directives_v2.transition_version IS 'Optimistic locking version for concurrent transition safety';
  END IF;
END $$;

-- ============================================================================
-- 3. ATOMIC EXEC-TO-PLAN TRANSITION RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_atomic_exec_to_plan_transition(
  p_sd_id TEXT,
  p_prd_id TEXT,
  p_session_id TEXT,
  p_request_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
  UPDATE user_stories
  SET
    status = CASE WHEN status = 'in_progress' THEN 'completed' ELSE status END,
    implementation_status = 'validated',
    updated_at = NOW()
  WHERE sd_id = v_sd_uuid
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
  UPDATE strategic_directives_v2
  SET
    current_phase = 'EXEC_COMPLETE',
    status = 'verification',
    transition_version = COALESCE(transition_version, 1) + 1,
    updated_at = NOW()
  WHERE uuid_id = v_sd_uuid;

  -- === ATOMIC TRANSITIONS END ===

  -- Capture post-state
  v_post_state := jsonb_build_object(
    'sd_phase', 'EXEC_COMPLETE',
    'sd_status', 'verification',
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
$$;

COMMENT ON FUNCTION fn_atomic_exec_to_plan_transition IS 'Atomic EXEC-TO-PLAN state transition with advisory locking, idempotency, and audit logging';

-- ============================================================================
-- 4. GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION fn_atomic_exec_to_plan_transition TO authenticated;
GRANT EXECUTE ON FUNCTION fn_atomic_exec_to_plan_transition TO service_role;

-- ============================================================================
-- 5. VERIFICATION
-- ============================================================================

DO $$
BEGIN
  -- Verify function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'fn_atomic_exec_to_plan_transition'
  ) THEN
    RAISE EXCEPTION 'Migration failed: fn_atomic_exec_to_plan_transition not created';
  END IF;

  -- Verify audit table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'sd_transition_audit'
  ) THEN
    RAISE EXCEPTION 'Migration failed: sd_transition_audit table not created';
  END IF;

  RAISE NOTICE 'Migration successful: Atomic handoff transitions ready';
END $$;
