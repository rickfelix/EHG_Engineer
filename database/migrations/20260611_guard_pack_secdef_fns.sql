-- Migration: per-venture-access guards on 8 mutating SECURITY DEFINER functions
-- SD: SD-MAN-FIX-SECURITY-GUARD-PACK-001 (remediates F-3 of
--     docs/security/security-posture-review-2026-06-10.md)
-- @approved-by: codestreetlabs@gmail.com
--
-- WHY: All 8 functions are SECURITY DEFINER, EXECUTE-granted to `authenticated`
-- (proacl captured 2026-06-11: postgres/service_role/authenticated), and had NO
-- internal authorization check — any logged-in user could advance any venture's
-- stage, bootstrap workflows, trip/reset EVA circuit breakers, or create
-- conversations as another user.
--
-- CONSTITUTIONAL CONSTRAINT: guards are PER-VENTURE-ACCESS
-- (fn_user_has_venture_access OR fn_is_chairman OR fn_is_service_role) — NOT
-- chairman-only. The live venture UI (../ehg/src: ventureWorkflowBootstrap.ts,
-- advanceStage.ts, evaCircuitBreaker.ts, useEVAChatConversation.ts,
-- ReplitStatusPanel.tsx, Stage20BuildExecution.tsx, LeoBridgeBuildPanel.tsx,
-- BuildMethodSelector.tsx) calls all 8 with authenticated JWTs; chairman-only
-- would break it.
--
-- Helpers fn_is_service_role(), fn_is_chairman(), fn_user_has_venture_access(uuid)
-- exist live (verified 2026-06-11) and are REFERENCED, never redefined.
--
-- Each body below is byte-identical to the live definition captured in
-- .claude/pre-guard-functiondefs.sql apart from the inserted guard block (and,
-- for the eva_* TEXT-id functions, one added DECLARE variable). SECURITY
-- DEFINER, SET search_path, RETURNS, and language are preserved. CREATE OR
-- REPLACE retains the existing EXECUTE ACL; explicit grants are restated at the
-- bottom for determinism. Reversible: 20260611_guard_pack_secdef_fns_DOWN.sql
-- restores the captured bodies verbatim.
--
-- BEHAVIOR NOTES:
-- * advance_venture_stage has an EXCEPTION WHEN OTHERS handler that converts
--   the guard's RAISE into its standard jsonb failure shape
--   ({success:false, error:'access denied: ...'}). Denial still occurs before
--   any work (guard is the first statement); callers see the denial in .error.
-- * eva_circuit_allows_request / record_eva_failure / record_eva_success take
--   TEXT venture ids. The uuid cast is attempted only for NON-privileged
--   callers, so service_role/chairman callers with legacy non-uuid ids keep
--   working; a non-privileged caller with a non-uuid id is denied.
-- * pg-direct admin sessions (postgres via the pooler, NO JWT claims): with no
--   request.jwt.claims GUC, fn_is_service_role() returns NULL, the OR chain
--   evaluates NULL, and IF NOT (NULL) does not fire — i.e. pg-direct postgres
--   callers PASS THROUGH (probed live 2026-06-11). This is the desired
--   behavior (ops/DR scripts keep working) and is invisible to the threat
--   model: every PostgREST caller carries JWT claims, so anon/authenticated
--   always evaluate to a definite true/false.

-- ============================================================================
-- 1. advance_venture_stage(uuid, integer, integer, text)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  -- 26-stage gate arrays (SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001)
  v_kill_gates INTEGER[] := ARRAY[3, 5, 13, 24];
  v_promotion_gates INTEGER[] := ARRAY[17, 18, 23];
  v_all_gates INTEGER[] := ARRAY[3, 5, 13, 17, 18, 23, 24];
  v_gate_decision RECORD;
  v_gate_decision_id UUID := NULL;  -- DELTA 1: NULL for non-gate stages; real id assigned in gate block
  v_idempotency UUID;
BEGIN
  -- SD-MAN-FIX-SECURITY-GUARD-PACK-001: per-venture access guard (F-3).
  -- NOTE: the EXCEPTION WHEN OTHERS handler below converts this RAISE into the
  -- function's standard {success:false, error:...} jsonb shape.
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

  -- Validate venture exists and lock row
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

  -- Validate from_stage matches current
  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_mismatch',
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  -- Validate to_stage range (26-stage lifecycle)
  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_to_stage',
      'to_stage', p_to_stage
    );
  END IF;

  -- Gate enforcement: if from_stage is a gate, require approved decision
  IF p_from_stage = ANY(v_all_gates) THEN
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
        'gate_type', CASE
          WHEN p_from_stage = ANY(v_kill_gates) THEN 'kill'
          WHEN p_from_stage = ANY(v_promotion_gates) THEN 'promotion'
          ELSE 'unknown'
        END,
        'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
      );
    END IF;

    v_gate_decision_id := v_gate_decision.id;  -- DELTA 2: capture real id only on the gate path (guarded above)
  END IF;

  -- Mark current stage as completed
  UPDATE venture_stage_work
    SET stage_status = 'completed',
        completed_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_from_stage;

  -- Advance ventures.current_lifecycle_stage
  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
        updated_at = NOW()
    WHERE id = p_venture_id;

  -- Mark next stage as in_progress
  UPDATE venture_stage_work
    SET stage_status = 'in_progress',
        started_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_to_stage;

  -- Emit STAGE_COMPLETE event for from_stage
  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_from_stage, 'STAGE_COMPLETE',
    jsonb_build_object('advanced_to', p_to_stage, 'transition_type', p_transition_type),
    NOW()
  );

  -- Emit STAGE_ENTRY event for to_stage
  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_to_stage, 'STAGE_ENTRY',
    jsonb_build_object('advanced_from', p_from_stage, 'transition_type', p_transition_type),
    NOW()
  );

  -- Record transition (correct column names: approved_by, handoff_data, idempotency_key)
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
      'gate_decision_id', v_gate_decision_id,  -- DELTA 3: was v_gate_decision.id (unconditional read)
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

-- ============================================================================
-- 2. advance_venture_to_stage(uuid, integer, text, text)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.advance_venture_to_stage(p_venture_id uuid, p_target_stage integer, p_build_method text DEFAULT 'claude_code'::text, p_repo_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
    DECLARE
      v_current_stage INTEGER;
      v_result JSONB;
    BEGIN
      -- SD-MAN-FIX-SECURITY-GUARD-PACK-001: per-venture access guard (F-3).
      IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
              OR public.fn_user_has_venture_access(p_venture_id)) THEN
        RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
      END IF;

      -- Get current stage
      SELECT current_lifecycle_stage INTO v_current_stage
      FROM ventures
      WHERE id = p_venture_id;

      IF v_current_stage IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Venture not found');
      END IF;

      -- Only allow advancing by 1 stage at a time
      IF p_target_stage != v_current_stage + 1 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Can only advance by 1 stage. Current: %s, Requested: %s', v_current_stage, p_target_stage)
        );
      END IF;

      -- Advance the venture
      UPDATE ventures
      SET current_lifecycle_stage = p_target_stage
      WHERE id = p_venture_id;

      -- If build_method is replit_agent, set up Stage 20 tracking
      IF p_build_method = 'replit_agent' AND p_target_stage = 20 THEN
        INSERT INTO venture_stage_work (venture_id, lifecycle_stage, stage_status, work_type, advisory_data)
        VALUES (
          p_venture_id,
          20,
          'in_progress',
          'sd_required',
          jsonb_build_object(
            'build_method', 'replit_agent',
            'awaiting_replit_sync', true,
            'replit_sync', jsonb_build_object('repo_url', COALESCE(p_repo_url, ''), 'awaiting_sync', true)
          )
        )
        ON CONFLICT (venture_id, lifecycle_stage)
        DO UPDATE SET
          advisory_data = jsonb_build_object(
            'build_method', 'replit_agent',
            'awaiting_replit_sync', true,
            'replit_sync', jsonb_build_object('repo_url', COALESCE(p_repo_url, ''), 'awaiting_sync', true)
          ),
          stage_status = 'in_progress';
      END IF;

      v_result := jsonb_build_object(
        'success', true,
        'previous_stage', v_current_stage,
        'current_stage', p_target_stage,
        'build_method', p_build_method
      );

      RETURN v_result;
    END;
    $function$;

-- ============================================================================
-- 3. bootstrap_venture_workflow(uuid)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.bootstrap_venture_workflow(p_venture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_venture RECORD;
  v_tier_max INTEGER;
  v_stage INTEGER;
  v_work_type TEXT;
  v_rows_created INTEGER := 0;
  v_current INTEGER;
  v_gate_stages INTEGER[] := ARRAY[3, 5, 10, 13, 17, 18, 23, 24, 25];
BEGIN
  -- SD-MAN-FIX-SECURITY-GUARD-PACK-001: per-venture access guard (F-3).
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

  SELECT id, name, tier, current_lifecycle_stage
    INTO v_venture
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

  v_current := COALESCE(v_venture.current_lifecycle_stage, 1);

  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 26
  END;

  FOR v_stage IN 1..v_tier_max LOOP
    IF v_stage = ANY(v_gate_stages) THEN
      v_work_type := 'decision_gate';
    ELSIF v_stage = 2 THEN
      v_work_type := 'automated_check';
    ELSE
      v_work_type := 'artifact_only';
    END IF;

    INSERT INTO venture_stage_work (
      venture_id,
      lifecycle_stage,
      stage_status,
      work_type
    ) VALUES (
      p_venture_id,
      v_stage,
      CASE WHEN v_stage < v_current THEN 'completed'
           WHEN v_stage = v_current THEN 'in_progress'
           ELSE 'not_started'
      END,
      v_work_type
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;

    v_rows_created := v_rows_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture.name,
    'stages_created', v_rows_created,
    'tier', v_venture.tier,
    'tier_max', v_tier_max
  );
END;
$function$;

-- ============================================================================
-- 4. create_eva_conversation(uuid, text, jsonb)
--    Guard: caller must BE the target user (p_user_id = auth.uid()), or be
--    service_role / chairman. Prevents creating conversations as another user.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_eva_conversation(p_user_id uuid, p_title text DEFAULT 'New Conversation'::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id UUID;
BEGIN
  -- SD-MAN-FIX-SECURITY-GUARD-PACK-001: caller-identity guard (F-3).
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman() OR p_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'access denied: caller must match p_user_id (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

  INSERT INTO eva_chat_conversations (user_id, title, metadata)
  VALUES (p_user_id, p_title, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$function$;

-- ============================================================================
-- 5. eva_circuit_allows_request(text)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.eva_circuit_allows_request(p_venture_id text)
 RETURNS TABLE(allowed boolean, state text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_circuit eva_circuit_breaker;
    v_time_since_trip INTERVAL;
    v_guard_vid UUID;  -- SD-MAN-FIX-SECURITY-GUARD-PACK-001
BEGIN
    -- SD-MAN-FIX-SECURITY-GUARD-PACK-001: per-venture access guard (F-3).
    -- TEXT venture id: cast attempted only for non-privileged callers so
    -- service_role/chairman callers with legacy non-uuid ids keep working.
    IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()) THEN
        BEGIN
            v_guard_vid := p_venture_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'access denied: invalid venture id (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
        END;
        IF NOT public.fn_user_has_venture_access(v_guard_vid) THEN
            RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
        END IF;
    END IF;

    -- Get circuit
    SELECT * INTO v_circuit
    FROM eva_circuit_breaker
    WHERE venture_id = p_venture_id;

    -- No circuit means no failures, allow request
    IF NOT FOUND THEN
        RETURN QUERY SELECT true, 'closed'::TEXT, 'No circuit breaker exists (healthy)'::TEXT;
        RETURN;
    END IF;

    -- Closed state allows requests
    IF v_circuit.state = 'closed' THEN
        RETURN QUERY SELECT true, 'closed'::TEXT, 'Circuit is closed (healthy)'::TEXT;
        RETURN;
    END IF;

    -- Half-open allows single test request
    IF v_circuit.state = 'half_open' THEN
        RETURN QUERY SELECT true, 'half_open'::TEXT, 'Circuit is half-open (recovery test allowed)'::TEXT;
        RETURN;
    END IF;

    -- Open state - check if recovery window has passed
    IF v_circuit.state = 'open' THEN
        v_time_since_trip := NOW() - v_circuit.tripped_at;

        IF v_time_since_trip >= (v_circuit.recovery_timeout_ms || ' milliseconds')::INTERVAL THEN
            -- Transition to half-open
            UPDATE eva_circuit_breaker SET
                state = 'half_open',
                updated_at = NOW()
            WHERE id = v_circuit.id;

            INSERT INTO eva_circuit_state_transitions
                (circuit_id, venture_id, from_state, to_state, trigger_reason)
            VALUES
                (v_circuit.id, p_venture_id, 'open', 'half_open', 'recovery_timeout');

            RETURN QUERY SELECT true, 'half_open'::TEXT, 'Recovery timeout passed, testing recovery'::TEXT;
            RETURN;
        END IF;

        -- Still in open state, block request
        RETURN QUERY SELECT false, 'open'::TEXT,
            format('Circuit is open. Recovery in %s',
                   ((v_circuit.recovery_timeout_ms || ' milliseconds')::INTERVAL - v_time_since_trip)::TEXT);
        RETURN;
    END IF;

    -- Fallback (should not reach)
    RETURN QUERY SELECT false, v_circuit.state, 'Unknown circuit state'::TEXT;
END;
$function$;

-- ============================================================================
-- 6. record_eva_failure(text, text, jsonb)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_eva_failure(p_venture_id text, p_error_message text, p_error_context jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(state text, tripped boolean, failure_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_circuit eva_circuit_breaker;
    v_new_failure_count INTEGER;
    v_new_state TEXT;
    v_tripped BOOLEAN := false;
    v_recent_failures JSONB;
    v_guard_vid UUID;  -- SD-MAN-FIX-SECURITY-GUARD-PACK-001
BEGIN
    -- SD-MAN-FIX-SECURITY-GUARD-PACK-001: per-venture access guard (F-3).
    IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()) THEN
        BEGIN
            v_guard_vid := p_venture_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'access denied: invalid venture id (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
        END;
        IF NOT public.fn_user_has_venture_access(v_guard_vid) THEN
            RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
        END IF;
    END IF;

    -- Get or create circuit
    v_circuit := get_or_create_eva_circuit(p_venture_id);
    v_new_failure_count := v_circuit.failure_count + 1;
    v_new_state := v_circuit.state;

    -- Add to recent failures (keep last 10)
    v_recent_failures := COALESCE(v_circuit.recent_failures, '[]'::jsonb);
    v_recent_failures := jsonb_build_array(
        jsonb_build_object(
            'timestamp', NOW(),
            'message', p_error_message,
            'context', p_error_context
        )
    ) || v_recent_failures;
    IF jsonb_array_length(v_recent_failures) > 10 THEN
        v_recent_failures := (
            SELECT jsonb_agg(elem)
            FROM (SELECT elem FROM jsonb_array_elements(v_recent_failures) elem LIMIT 10) t
        );
    END IF;

    -- Handle state transitions
    IF v_circuit.state = 'half_open' THEN
        -- Recovery test failed, go back to open
        v_new_state := 'open';
        v_tripped := true;

        INSERT INTO eva_circuit_state_transitions
            (circuit_id, venture_id, from_state, to_state, trigger_reason, failure_details)
        VALUES
            (v_circuit.id, p_venture_id, 'half_open', 'open', 'recovery_failure',
             jsonb_build_object('error', p_error_message, 'context', p_error_context));

    ELSIF v_circuit.state = 'closed' AND v_new_failure_count >= v_circuit.failure_threshold THEN
        -- Threshold exceeded, trip circuit
        v_new_state := 'open';
        v_tripped := true;

        INSERT INTO eva_circuit_state_transitions
            (circuit_id, venture_id, from_state, to_state, trigger_reason, failure_details)
        VALUES
            (v_circuit.id, p_venture_id, 'closed', 'open', 'failure_threshold',
             jsonb_build_object('error', p_error_message, 'failure_count', v_new_failure_count));

        -- Create system alert for Chairman
        INSERT INTO system_alerts
            (alert_type, severity, title, message, source_service, source_entity_id, metadata)
        VALUES (
            'circuit_breaker',
            'critical',
            'EVA Circuit Breaker Tripped',
            format('EVA circuit breaker tripped for venture %s after %s consecutive failures. Manual intervention required.',
                   p_venture_id, v_new_failure_count),
            'eva_circuit_breaker',
            p_venture_id,
            jsonb_build_object(
                'venture_id', p_venture_id,
                'failure_count', v_new_failure_count,
                'last_error', p_error_message,
                'recent_failures', v_recent_failures
            )
        );
    END IF;

    -- Update circuit state
    UPDATE eva_circuit_breaker SET
        state = v_new_state,
        failure_count = v_new_failure_count,
        last_failure_at = NOW(),
        tripped_at = CASE WHEN v_tripped THEN NOW() ELSE tripped_at END,
        recent_failures = v_recent_failures,
        updated_at = NOW()
    WHERE id = v_circuit.id;

    RETURN QUERY SELECT v_new_state, v_tripped, v_new_failure_count;
END;
$function$;

-- ============================================================================
-- 7. record_eva_success(text)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.record_eva_success(p_venture_id text)
 RETURNS TABLE(state text, recovered boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_circuit eva_circuit_breaker;
    v_new_state TEXT;
    v_recovered BOOLEAN := false;
    v_guard_vid UUID;  -- SD-MAN-FIX-SECURITY-GUARD-PACK-001
BEGIN
    -- SD-MAN-FIX-SECURITY-GUARD-PACK-001: per-venture access guard (F-3).
    IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()) THEN
        BEGIN
            v_guard_vid := p_venture_id::uuid;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'access denied: invalid venture id (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
        END;
        IF NOT public.fn_user_has_venture_access(v_guard_vid) THEN
            RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
        END IF;
    END IF;

    -- Get circuit (don't create if doesn't exist - no failures recorded yet)
    SELECT * INTO v_circuit
    FROM eva_circuit_breaker
    WHERE venture_id = p_venture_id;

    IF NOT FOUND THEN
        -- No circuit means no failures, just return healthy state
        RETURN QUERY SELECT 'closed'::TEXT, false;
        RETURN;
    END IF;

    v_new_state := v_circuit.state;

    -- Handle recovery from half_open
    IF v_circuit.state = 'half_open' THEN
        v_new_state := 'closed';
        v_recovered := true;

        INSERT INTO eva_circuit_state_transitions
            (circuit_id, venture_id, from_state, to_state, trigger_reason)
        VALUES
            (v_circuit.id, p_venture_id, 'half_open', 'closed', 'recovery_success');

        -- Resolve any open circuit breaker alerts
        UPDATE system_alerts SET
            resolved_at = NOW(),
            resolved_by = 'SYSTEM_AUTO_RECOVERY'
        WHERE alert_type = 'circuit_breaker'
          AND source_entity_id = p_venture_id
          AND resolved_at IS NULL;
    END IF;

    -- Reset failure count on success
    UPDATE eva_circuit_breaker SET
        state = v_new_state,
        failure_count = 0,
        last_success_at = NOW(),
        recent_failures = '[]'::jsonb,
        updated_at = NOW()
    WHERE id = v_circuit.id;

    RETURN QUERY SELECT v_new_state, v_recovered;
END;
$function$;

-- ============================================================================
-- 8. rescan_stage_20(uuid)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.rescan_stage_20(p_venture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_total INTEGER;
  v_terminal INTEGER;
  v_pending INTEGER;
  v_all_terminal BOOLEAN;
  v_stage_status TEXT;
  v_advisory JSONB;
  v_current_stage INTEGER;
  v_deployment_url TEXT;
  v_artifact_verified BOOLEAN;
BEGIN
  -- SD-MAN-FIX-SECURITY-GUARD-PACK-001: per-venture access guard (F-3).
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status IN ('completed', 'cancelled')),
    COUNT(*) FILTER (WHERE status NOT IN ('completed', 'cancelled'))
  INTO v_total, v_terminal, v_pending
  FROM strategic_directives_v2
  WHERE venture_id = p_venture_id;
  IF v_total = 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'No SDs found for venture',
      'total', 0, 'terminal', 0, 'pending_count', 0
    );
  END IF;
  v_all_terminal := v_pending = 0;
  SELECT deployment_url INTO v_deployment_url
  FROM ventures WHERE id = p_venture_id;
  v_artifact_verified := v_deployment_url IS NOT NULL AND v_deployment_url <> '';
  v_stage_status := CASE
    WHEN v_all_terminal AND v_artifact_verified THEN 'completed'
    WHEN v_all_terminal AND NOT v_artifact_verified THEN 'artifact_missing'
    ELSE 'in_progress'
  END;
  SELECT jsonb_build_object(
    'total_sds', v_total,
    'terminal_sds', v_terminal,
    'non_terminal_sds', v_pending,
    'build_pending', NOT v_all_terminal,
    'artifact_verified', v_artifact_verified,
    'deployment_url', v_deployment_url,
    'stakeholder_review', jsonb_build_object(
      'has_artifact', v_artifact_verified,
      'artifact_type', CASE WHEN v_artifact_verified THEN 'deployment' ELSE NULL END,
      'artifact_url', v_deployment_url
    ),
    'checked_at', NOW()::TEXT,
    'rescan_source', 'rpc:rescan_stage_20',
    'sd_statuses', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'sd_key', sd_key,
        'title', title,
        'status', status,
        'current_phase', current_phase,
        'sd_type', sd_type
      ) ORDER BY sd_key)
      FROM strategic_directives_v2
      WHERE venture_id = p_venture_id
    ), '[]'::jsonb)
  ) INTO v_advisory;
  UPDATE venture_stage_work
  SET advisory_data = v_advisory,
      stage_status = v_stage_status,
      completed_at = CASE WHEN v_all_terminal AND v_artifact_verified THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = 20;
  IF v_all_terminal AND v_artifact_verified THEN
    SELECT current_lifecycle_stage INTO v_current_stage
    FROM ventures WHERE id = p_venture_id;
    IF v_current_stage IS NOT NULL AND v_current_stage <= 20 THEN
      UPDATE ventures
      SET current_lifecycle_stage = 21,
          orchestrator_state = 'idle'
      WHERE id = p_venture_id;
      UPDATE chairman_decisions
      SET status = 'approved', decision = 'proceed', updated_at = NOW()
      WHERE venture_id = p_venture_id
        AND lifecycle_stage = 20
        AND status = 'pending';
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'success', true,
    'total', v_total,
    'terminal', v_terminal,
    'pending_count', v_pending,
    'stage_status', v_stage_status,
    'build_pending', NOT v_all_terminal,
    'artifact_verified', v_artifact_verified,
    'deployment_url', v_deployment_url,
    'advanced_to', CASE WHEN v_all_terminal AND v_artifact_verified AND v_current_stage <= 20 THEN 21 ELSE NULL END,
    -- SD-LEO-INFRA-STAGE-RESCAN-STAGE-001: human-readable cause for advance/non-advance
    'reason', CASE
      WHEN v_all_terminal AND v_artifact_verified AND v_current_stage IS NOT NULL AND v_current_stage <= 20
        THEN 'Stage 20 complete - advanced to stage 21'
      WHEN v_all_terminal AND v_artifact_verified
        THEN 'Stage 20 complete'
      WHEN v_all_terminal AND NOT v_artifact_verified
        THEN 'Deployment URL not registered - register your live deployment to advance past Stage 20'
      ELSE v_pending::text || ' SD(s) still in progress - complete all venture SDs to advance Stage 20'
    END
  );
END;
$function$;

-- ============================================================================
-- EXECUTE grants — restate the captured ACL for determinism.
-- Captured proacl (all 8): {postgres=X/postgres,service_role=X/postgres,
-- authenticated=X/postgres} — i.e. PUBLIC/anon already revoked; authenticated
-- retained (the venture UI depends on it; the internal guard is the fix).
-- CREATE OR REPLACE preserves the ACL, so these are belt-and-suspenders.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.advance_venture_to_stage(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bootstrap_venture_workflow(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_eva_conversation(uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.eva_circuit_allows_request(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_eva_failure(text, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_eva_success(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rescan_stage_20(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.advance_venture_to_stage(uuid, integer, text, text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_venture_workflow(uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.create_eva_conversation(uuid, text, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.eva_circuit_allows_request(text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.record_eva_failure(text, text, jsonb) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.record_eva_success(text) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.rescan_stage_20(uuid) TO service_role, authenticated;
