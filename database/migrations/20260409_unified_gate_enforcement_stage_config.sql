-- ============================================================================
-- SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001
-- Unified Gate Enforcement: stage_config as Single Source of Truth
-- ============================================================================
-- Replaces hardcoded gate arrays in fn_advance_venture_stage with dynamic
-- reads from stage_config. Adds fail-closed NULL handling, RLS policies,
-- and append-only audit table for stage_config mutations.
--
-- Board approval: 6/6 seats. RCA: review-mode stages (7,8,9,11) skipped
-- due to race condition in processStage advance-then-revert pattern.
-- ============================================================================

-- ============================================================================
-- PART 1: stage_config_audit table + immutability trigger
-- ============================================================================

CREATE TABLE IF NOT EXISTS stage_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_number INTEGER NOT NULL,
  changed_column TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT NOT NULL DEFAULT current_user,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE stage_config_audit IS 'Append-only audit trail for stage_config mutations. SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001';

-- Immutability trigger: prevent UPDATE/DELETE on audit table
CREATE OR REPLACE FUNCTION fn_stage_config_audit_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RAISE EXCEPTION 'stage_config_audit is append-only. UPDATE and DELETE are prohibited.';
END;
$fn$;

DROP TRIGGER IF EXISTS trg_stage_config_audit_immutable ON stage_config_audit;
CREATE TRIGGER trg_stage_config_audit_immutable
  BEFORE UPDATE OR DELETE ON stage_config_audit
  FOR EACH ROW
  EXECUTE FUNCTION fn_stage_config_audit_immutable();

-- Audit trigger on stage_config: log changes
CREATE OR REPLACE FUNCTION fn_stage_config_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF OLD.review_mode IS DISTINCT FROM NEW.review_mode THEN
    INSERT INTO stage_config_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'review_mode', OLD.review_mode, NEW.review_mode);
  END IF;
  IF OLD.gate_type IS DISTINCT FROM NEW.gate_type THEN
    INSERT INTO stage_config_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'gate_type', OLD.gate_type, NEW.gate_type);
  END IF;
  IF OLD.stage_name IS DISTINCT FROM NEW.stage_name THEN
    INSERT INTO stage_config_audit (stage_number, changed_column, old_value, new_value)
    VALUES (NEW.stage_number, 'stage_name', OLD.stage_name, NEW.stage_name);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_stage_config_audit ON stage_config;
CREATE TRIGGER trg_stage_config_audit
  AFTER UPDATE ON stage_config
  FOR EACH ROW
  EXECUTE FUNCTION fn_stage_config_audit_trigger();

-- ============================================================================
-- PART 2: RLS on stage_config
-- ============================================================================

ALTER TABLE stage_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read stage_config
DROP POLICY IF EXISTS select_stage_config ON stage_config;
CREATE POLICY select_stage_config ON stage_config
  FOR SELECT TO authenticated
  USING (true);

-- Only service_role can write (RLS is bypassed for service_role by default,
-- but we explicitly deny non-service writes)
DROP POLICY IF EXISTS deny_write_stage_config ON stage_config;
CREATE POLICY deny_write_stage_config ON stage_config
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (false);

-- RLS on audit table: read-only for authenticated
ALTER TABLE stage_config_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS select_stage_config_audit ON stage_config_audit;
CREATE POLICY select_stage_config_audit ON stage_config_audit
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS deny_write_stage_config_audit ON stage_config_audit;
CREATE POLICY deny_write_stage_config_audit ON stage_config_audit
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (false);

-- ============================================================================
-- PART 3: Replace fn_advance_venture_stage (4-param) with stage_config reads
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER,
  p_handoff_data JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_result JSONB;
  v_missing_artifacts JSONB;
  v_gate_type TEXT;
  v_review_mode TEXT;
BEGIN
  -- Lock the venture row to prevent concurrent advances (SEC-003 fix)
  SELECT current_lifecycle_stage, name INTO v_current_stage, v_venture_name
  FROM ventures
  WHERE id = p_venture_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Venture not found',
      'venture_id', p_venture_id
    );
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Stage mismatch - current stage does not match from_stage',
      'venture_id', p_venture_id,
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Invalid to_stage - must be between 1 and 26',
      'to_stage', p_to_stage
    );
  END IF;

  -- ======================================================================
  -- UNIFIED GATE ENFORCEMENT (SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001)
  -- Read gate_type and review_mode from stage_config (single source of truth)
  -- Fail-closed: COALESCE missing rows to 'review' (block by default)
  -- FOR SHARE prevents concurrent config modification (SEC-004 TOCTOU fix)
  -- ======================================================================
  SELECT COALESCE(sc.gate_type, 'none'), COALESCE(sc.review_mode, 'review')
  INTO v_gate_type, v_review_mode
  FROM stage_config sc
  WHERE sc.stage_number = p_from_stage
  FOR SHARE;

  -- If no stage_config row exists, fail-closed: treat as review-mode
  IF NOT FOUND THEN
    v_gate_type := 'none';
    v_review_mode := 'review';
  END IF;

  -- Block advancement for review-mode stages without chairman approval
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
        'message', format('Stage %s requires chairman review approval before advancement', p_from_stage),
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'gate_type', v_gate_type,
        'review_mode', v_review_mode
      );
    END IF;
  END IF;

  -- Block advancement for kill/promotion gates without chairman approval
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
        'message', format('Stage %s has %s gate requiring chairman approval', p_from_stage, v_gate_type),
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'gate_type', v_gate_type,
        'review_mode', v_review_mode
      );
    END IF;
  END IF;
  -- ======================================================================

  -- ARTIFACT PRECONDITION GATE
  SELECT jsonb_agg(jsonb_build_object(
    'artifact_type', sar.artifact_type,
    'required_status', sar.required_status
  ))
  FROM stage_artifact_requirements sar
  WHERE sar.stage_number = p_from_stage
    AND sar.is_blocking = true
    AND NOT EXISTS (
      SELECT 1 FROM venture_artifacts va
      WHERE va.venture_id = p_venture_id
        AND va.artifact_type = sar.artifact_type
    )
  INTO v_missing_artifacts;

  IF v_missing_artifacts IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'artifact_precondition_unmet',
      'missing', v_missing_artifacts,
      'venture_id', p_venture_id,
      'stage', p_from_stage
    );
  END IF;

  -- Update ventures table
  UPDATE ventures
  SET current_lifecycle_stage = p_to_stage,
      updated_at = NOW()
  WHERE id = p_venture_id;

  -- Mark the from_stage work as completed
  UPDATE venture_stage_work
  SET stage_status = 'completed',
      health_score = 100,
      completed_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = p_from_stage;

  -- Log the transition
  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, approved_at, handoff_data, created_at
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, 'normal',
    COALESCE(p_handoff_data->>'ceo_agent_id', 'system'),
    NOW(), p_handoff_data, NOW()
  ) ON CONFLICT DO NOTHING;

  v_result := jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transitioned_at', NOW()
  );

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'venture_id', p_venture_id,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage
  );
END;
$fn$;

COMMENT ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) IS
'Advances a venture from one stage to the next with unified gate enforcement.
Reads stage_config for gate_type and review_mode instead of hardcoded arrays.
Fail-closed: missing stage_config rows default to review-mode (blocking).
Added: SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001';

GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB) TO service_role;

-- ============================================================================
-- PART 4: Replace fn_advance_venture_stage (5-param) with stage_config reads
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_advance_venture_stage(
  p_venture_id UUID,
  p_from_stage INTEGER,
  p_to_stage INTEGER,
  p_handoff_data JSONB DEFAULT '{}'::jsonb,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_gate_result JSONB;
  v_user_id UUID;
  v_idem_key UUID;
  v_missing_artifacts JSONB;
  v_gate_type TEXT;
  v_review_mode TEXT;
BEGIN
  -- Lock the venture row to prevent concurrent advances
  SELECT current_lifecycle_stage, name INTO v_current_stage, v_venture_name
  FROM ventures WHERE id = p_venture_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found', 'venture_id', p_venture_id);
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stage mismatch', 'current_stage', v_current_stage, 'from_stage', p_from_stage);
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid to_stage', 'to_stage', p_to_stage);
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM venture_stage_transitions WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'was_duplicate', true, 'venture_id', p_venture_id);
    END IF;
  END IF;

  -- ======================================================================
  -- UNIFIED GATE ENFORCEMENT (SD-LEO-INFRA-UNIFIED-GATE-ENFORCEMENT-001)
  -- ======================================================================
  SELECT COALESCE(sc.gate_type, 'none'), COALESCE(sc.review_mode, 'review')
  INTO v_gate_type, v_review_mode
  FROM stage_config sc
  WHERE sc.stage_number = p_from_stage
  FOR SHARE;

  IF NOT FOUND THEN
    v_gate_type := 'none';
    v_review_mode := 'review';
  END IF;

  -- Block review-mode stages without chairman approval
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

  -- Block kill/promotion gates without chairman approval
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
  -- ======================================================================

  -- ARTIFACT PRECONDITION GATE
  SELECT jsonb_agg(jsonb_build_object(
    'artifact_type', sar.artifact_type,
    'required_status', sar.required_status
  ))
  FROM stage_artifact_requirements sar
  WHERE sar.stage_number = p_from_stage
    AND sar.is_blocking = true
    AND NOT EXISTS (
      SELECT 1 FROM venture_artifacts va
      WHERE va.venture_id = p_venture_id
        AND va.artifact_type = sar.artifact_type
    )
  INTO v_missing_artifacts;

  IF v_missing_artifacts IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'artifact_precondition_unmet',
      'missing', v_missing_artifacts,
      'venture_id', p_venture_id,
      'stage', p_from_stage
    );
  END IF;

  -- Compliance gate at Stage 21
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

  -- Advance current_lifecycle_stage
  UPDATE ventures SET current_lifecycle_stage = p_to_stage, updated_at = NOW() WHERE id = p_venture_id;

  -- Mark current stage work as completed
  UPDATE venture_stage_work SET stage_status = 'completed', completed_at = NOW()
  WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage;

  v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid());

  -- Record transition
  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, 'normal',
    COALESCE(p_handoff_data->>'ceo_agent_id', 'system'), p_handoff_data, v_idem_key
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'venture_id', p_venture_id, 'venture_name', v_venture_name,
    'from_stage', p_from_stage, 'to_stage', p_to_stage, 'transitioned_at', NOW(), 'idempotency_key', v_idem_key
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB, UUID) TO service_role;
