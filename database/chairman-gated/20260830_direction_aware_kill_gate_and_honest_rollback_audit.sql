-- SD-LEO-INFRA-DIRECTION-BLIND-KILL-001 -- Direction-blind kill-gate check in advance_venture_stage:
-- a rollback out of a gate stage is not a gate crossing
--
-- STAGED, NOT APPLIED. CREATE OR REPLACE on SECURITY-DEFINER RPCs governing venture-stage
-- advancement is TIER-2 under the tiered auto-apply policy. The builder stages; only the
-- chairman applies, via the 3-factor ceremony (--prod-deploy + single-use token + an
-- @approved-by header matching git config user.email).
--
-- @approved-by: codestreetlabs@gmail.com
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- WHY THIS EXISTS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2026-08-29 ~23:2xZ: the sanctioned rollback of AltifyAI (24 -> 23, Solomon-endorsed, returning
-- the venture to the dedicated UAT stage after a vacuous-pass advance, ffcce40a) was refused with
-- gate_not_approved. Both advance_venture_stage() and fn_advance_venture_stage() require an
-- approved chairman_decisions row at p_from_stage whenever venture_stages.gate_type at that
-- stage is 'kill' or 'promotion' -- confirmed live via pg_get_functiondef (this SD's LEAD-phase
-- Explore pass; a full pre-fix snapshot of both functions is committed at
-- docs/audits/pre-fix-snapshots/advance-venture-stage-family-20260830-pre-fix.sql for audit
-- reference). Neither check tests DIRECTION: the same predicate that correctly demands approval
-- before an ADVANCE past a kill gate also demands it before a RETREAT out of one. Satisfying
-- that predicate to enable the rollback would require fabricating an approved-proceed row at the
-- S24 kill gate -- a false governance record asserting the chairman passed launch-readiness,
-- the exact crime class of the same evening's fn_chairman_decide incident
-- (SD-LEO-INFRA-REJECT-PATH-VENTURE-001). Adam refused that workaround; the venture was parked
-- at 24 pending this root fix.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- THE FIX -- direction-aware, honest, two-sided
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- A kill/promotion gate governs CROSSING the gate forward (p_to_stage > p_from_stage). Both
-- functions now split on direction:
--   FORWARD (p_to_stage > p_from_stage): the existing approved-decision requirement is UNCHANGED
--     -- the gate's teeth are not weakened.
--   ROLLBACK (p_to_stage < p_from_stage): no approval is required OR fabricated. Instead, the
--     caller must supply non-empty rollback provenance (a cited ruling/defect basis) --
--     advance_venture_stage gains a new optional trailing parameter p_rollback_provenance text
--     DEFAULT NULL (backward-compatible; existing callers unaffected); fn_advance_venture_stage
--     reuses its EXISTING p_handoff_data jsonb parameter (p_handoff_data->>'rollback_provenance')
--     -- no signature change needed there. Missing/empty provenance refuses with
--     rollback_provenance_required.
--
-- HONEST AUDIT TRAIL: both functions' venture_stage_transitions INSERT now derives
-- transition_type from ACTUAL direction server-side (rollback when p_to_stage < p_from_stage),
-- rather than trusting a caller-supplied string. fn_advance_venture_stage previously hardcoded
-- the literal 'normal' unconditionally (confirmed live, docs/audits/pre-fix-snapshots/...:431) --
-- an audit-honesty gap independent of the gate-check fix, closed here too.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- OUT OF SCOPE, DOCUMENTED NOT DROPPED
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- fn_advance_venture_stage's SEPARATE review_mode='review' gate (pre-fix line 256-273) is a
-- structurally similar but textually distinct direction-blind check -- confirmed via the same
-- Explore pass, left UNCHANGED here per this SD's own scope, which names only the
-- gate_type IN ('kill','promotion') check. A future SD should audit whether the same rollback-
-- provenance treatment applies there.
--
-- The 24->25 product_review special-case block is ALREADY direction-safe (hardcodes the exact
-- forward pair p_from_stage=24 AND p_to_stage=25) -- a 24->23 rollback never reaches it, no
-- change needed.
--
-- Executing the pending AltifyAI 24->23 rollback itself is a POST-CHAIRMAN-APPLY production
-- action (this file must be applied first) -- explicitly out of scope for this worker session,
-- documented as a deferred follow-up in this SD's retrospective.
--
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- TWO-SIDED CONTRACT THIS FIX MUST SATISFY (Solomon's amended ruling, verbatim intent)
-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- Advances across a kill/promotion gate demand the chairman approved-proceed decision; retreats
-- demand rollback provenance -- neither requirement may satisfy the other. See
-- tests/unit/direction-aware-kill-gate-migration-shape.test.js for both sides, proven against
-- this file's own SQL text (chairman-gated, cannot be self-applied by a worker session).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- advance_venture_stage -- byte-for-byte the live body EXCEPT: new trailing
-- p_rollback_provenance parameter; the gate_type IN (kill,promotion) block splits on direction;
-- transition_type is now server-derived from direction rather than echoed from p_transition_type.
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text, p_rollback_provenance text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_gate_type TEXT;
  v_gate_decision RECORD;
  v_gate_decision_id UUID := NULL;
  v_idempotency UUID;
  v_precondition JSONB;
  v_is_forward_cross BOOLEAN;
  v_is_rollback BOOLEAN;
  v_effective_transition_type TEXT;
BEGIN
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
  END IF;

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

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_mismatch',
      'current_stage', v_current_stage,
      'from_stage', p_from_stage
    );
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 27 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_to_stage',
      'to_stage', p_to_stage
    );
  END IF;

  SELECT gate_type INTO v_gate_type
    FROM venture_stages
    WHERE stage_number = p_from_stage
    FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'stage_gate_lookup_failed',
      'from_stage', p_from_stage,
      'message', format('No venture_stages catalog row for stage %s -- cannot determine gate requirements', p_from_stage)
    );
  END IF;
  v_gate_type := COALESCE(v_gate_type, 'none');

  -- SD-LEO-INFRA-DIRECTION-BLIND-KILL-001: direction-aware split. A kill/promotion gate governs
  -- CROSSING forward; a rollback departs it without crossing and must never be asked to satisfy
  -- (or fabricate) a forward-pass decision.
  v_is_forward_cross := p_to_stage > p_from_stage;
  v_is_rollback := p_to_stage < p_from_stage;

  IF v_gate_type IN ('kill', 'promotion') THEN
    IF v_is_forward_cross THEN
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
          'gate_type', v_gate_type,
          'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
        );
      END IF;

      v_gate_decision_id := v_gate_decision.id;
    ELSIF v_is_rollback THEN
      IF p_rollback_provenance IS NULL OR length(trim(p_rollback_provenance)) = 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'rollback_provenance_required',
          'gate_stage', p_from_stage,
          'gate_type', v_gate_type,
          'message', format('Rollback out of gate stage %s requires cited provenance (a ruling/defect basis) -- it may not fabricate or require a forward-pass decision', p_from_stage)
        );
      END IF;
    END IF;
  END IF;

  v_precondition := public.fn_stage_artifact_precondition(p_venture_id, p_from_stage);
  IF (v_precondition->>'blocked')::boolean THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'artifact_precondition_unmet',
      'missing_artifacts', v_precondition->'missing_artifacts',
      'deviated_artifacts', v_precondition->'deviated_artifacts',
      'source', v_precondition->>'source',
      'venture_id', p_venture_id,
      'from_stage', p_from_stage
    );
  END IF;

  UPDATE venture_stage_work
    SET stage_status = 'completed',
        completed_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_from_stage;

  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage,
        stage_write_token = 'advance_venture_stage',
        updated_at = NOW()
    WHERE id = p_venture_id;

  UPDATE venture_stage_work
    SET stage_status = 'in_progress',
        started_at = NOW()
    WHERE venture_id = p_venture_id
      AND lifecycle_stage = p_to_stage;

  -- SD-LEO-INFRA-DIRECTION-BLIND-KILL-001: transition_type is now derived from ACTUAL direction,
  -- never trusted verbatim from the caller -- a rollback is honestly labeled 'rollback' in its
  -- own audit trail regardless of what p_transition_type was passed.
  v_effective_transition_type := CASE WHEN v_is_rollback THEN 'rollback' ELSE COALESCE(NULLIF(p_transition_type, ''), 'normal') END;

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_from_stage, 'STAGE_COMPLETE',
    jsonb_build_object('advanced_to', p_to_stage, 'transition_type', v_effective_transition_type),
    NOW()
  );

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_to_stage, 'STAGE_ENTRY',
    jsonb_build_object('advanced_from', p_from_stage, 'transition_type', v_effective_transition_type),
    NOW()
  );

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
    p_venture_id, p_from_stage, p_to_stage, v_effective_transition_type,
    'system:advance', jsonb_build_object(
      'gate_decision_id', v_gate_decision_id,
      'venture_name', v_venture_name,
      'rollback_provenance', p_rollback_provenance
    ), v_idempotency
  )
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true,
    'venture_id', p_venture_id,
    'venture_name', v_venture_name,
    'from_stage', p_from_stage,
    'to_stage', p_to_stage,
    'transition_type', v_effective_transition_type,
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

-- secdef-execute-revoke-lint: documents the already-correct live grant state (confirmed via
-- has_function_privilege() before writing this fix, matching reject_chairman_decision's
-- established pattern) -- anon has never been able to execute this function; authenticated and
-- service_role retain their existing live access.
REVOKE EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- fn_advance_venture_stage -- byte-for-byte the live body EXCEPT: the gate_type IN
-- (kill,promotion) block splits on direction (reusing the EXISTING p_handoff_data parameter for
-- rollback provenance, no signature change); transition_type is now derived from direction
-- rather than the pre-fix hardcoded literal 'normal'. The review_mode='review' gate and the
-- 24->25 product_review block are UNCHANGED (see header: out of scope / already direction-safe).
-- ─────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_handoff_data jsonb DEFAULT '{}'::jsonb, p_idempotency_key uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  v_gate_result JSONB;
  v_user_id UUID;
  v_idem_key UUID;
  v_missing_artifacts JSONB;
  v_gate_type TEXT;
  v_review_mode TEXT;
  v_canonical_array text[];
  v_required_artifacts text[];
  v_s22_flag_enabled boolean;
  v_legacy_skipped boolean;
  v_artifact_source text;
  v_hc_flag_enabled boolean;
  v_is_high_consequence boolean;
  v_cutover_flag_enabled boolean;
  v_is_forward_cross boolean;
  v_is_rollback boolean;
  v_rollback_provenance text;
  v_effective_transition_type text;
BEGIN
  SELECT current_lifecycle_stage, name INTO v_current_stage, v_venture_name
  FROM ventures WHERE id = p_venture_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Venture not found', 'venture_id', p_venture_id);
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object('success', false, 'error', 'Stage mismatch', 'current_stage', v_current_stage, 'from_stage', p_from_stage);
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 27 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid to_stage', 'to_stage', p_to_stage);
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM venture_stage_transitions WHERE idempotency_key = p_idempotency_key) THEN
      RETURN jsonb_build_object('success', true, 'was_duplicate', true, 'venture_id', p_venture_id);
    END IF;
  END IF;

  SELECT COALESCE(sc.gate_type, 'none'), COALESCE(sc.review_mode, 'review'), COALESCE(sc.is_high_consequence, false)
  INTO v_gate_type, v_review_mode, v_is_high_consequence
  FROM venture_stages sc
  WHERE sc.stage_number = p_from_stage
  FOR SHARE;

  IF NOT FOUND THEN
    v_gate_type := 'none';
    v_review_mode := 'review';
    v_is_high_consequence := false;
  END IF;

  -- UNCHANGED (out of scope, see this file's header): review_mode gate remains direction-blind.
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

  -- SD-LEO-INFRA-DIRECTION-BLIND-KILL-001: direction-aware split, identical shape to
  -- advance_venture_stage's fix above. Rollback provenance is read from the EXISTING
  -- p_handoff_data parameter -- no new function parameter needed.
  v_is_forward_cross := p_to_stage > p_from_stage;
  v_is_rollback := p_to_stage < p_from_stage;
  v_rollback_provenance := p_handoff_data->>'rollback_provenance';

  IF v_gate_type IN ('kill', 'promotion') THEN
    IF v_is_forward_cross THEN
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
    ELSIF v_is_rollback THEN
      IF v_rollback_provenance IS NULL OR length(trim(v_rollback_provenance)) = 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'rollback_provenance_required',
          'message', format('Rollback out of gate stage %s requires cited provenance (p_handoff_data.rollback_provenance) -- it may not fabricate or require a forward-pass decision', p_from_stage),
          'venture_id', p_venture_id,
          'stage', p_from_stage,
          'gate_type', v_gate_type
        );
      END IF;
    END IF;
  END IF;

  -- UNCHANGED (already direction-safe, see this file's header): hardcodes the exact forward pair.
  IF p_from_stage = 24 AND p_to_stage = 25 THEN
    IF NOT EXISTS (
      SELECT 1 FROM ventures
      WHERE id = p_venture_id
        AND (is_demo = true OR name ~* '^(parity-test-|test-stub)')
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM chairman_decisions
        WHERE venture_id = p_venture_id
          AND lifecycle_stage = p_from_stage
          AND decision_type = 'product_review'
          AND status = 'approved'
      ) THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'product_review_required',
          'message', 'Stage 24 to 25 transition requires an approved chairman product_review decision',
          'venture_id', p_venture_id,
          'stage', p_from_stage,
          'to_stage', p_to_stage
        );
      END IF;
    END IF;
  END IF;

  IF v_is_high_consequence THEN
    SELECT is_enabled INTO v_cutover_flag_enabled
    FROM leo_feature_flags WHERE flag_key = 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED';
    v_cutover_flag_enabled := COALESCE(v_cutover_flag_enabled, false);

    IF v_cutover_flag_enabled THEN
      SELECT is_enabled INTO v_hc_flag_enabled
      FROM leo_feature_flags WHERE flag_key = 'LEO_HIGH_CONSEQUENCE_GATES_ENABLED';
      v_hc_flag_enabled := COALESCE(v_hc_flag_enabled, true);

      IF v_hc_flag_enabled THEN
        IF EXISTS (
          SELECT 1 FROM chairman_decisions
          WHERE venture_id = p_venture_id
            AND lifecycle_stage = p_from_stage
            AND status = 'pending'
            AND blocking = true
        ) THEN
          RETURN jsonb_build_object(
            'success', false,
            'error', 'high_consequence_gate_blocked',
            'message', format('Stage %s has a pending high-consequence chairman decision', p_from_stage),
            'venture_id', p_venture_id,
            'stage', p_from_stage
          );
        END IF;
      END IF;
    END IF;
  END IF;

  SELECT is_enabled INTO v_s22_flag_enabled
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';
  v_s22_flag_enabled := COALESCE(v_s22_flag_enabled, false);

  SELECT COALESCE((metadata->>'s22_legacy_skipped')::boolean, false)
  INTO v_legacy_skipped
  FROM ventures WHERE id = p_venture_id;

  SELECT required_artifacts INTO v_canonical_array
  FROM venture_stages
  WHERE stage_number = p_from_stage;
  v_canonical_array := COALESCE(v_canonical_array, ARRAY[]::text[]);

  IF v_legacy_skipped AND p_from_stage = 22 THEN
    v_required_artifacts := ARRAY[]::text[];
    v_artifact_source := 'bypass_s22_legacy_skipped';
  ELSE
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical';
  END IF;

  IF array_length(v_required_artifacts, 1) IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('artifact_type', a))
    INTO v_missing_artifacts
    FROM unnest(v_required_artifacts) a
    WHERE NOT EXISTS (
      SELECT 1 FROM venture_artifacts va
      WHERE va.venture_id = p_venture_id
        AND va.artifact_type = a
        AND va.is_current = true
    );

    IF v_missing_artifacts IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'artifact_precondition_unmet',
        'missing', v_missing_artifacts,
        'venture_id', p_venture_id,
        'stage', p_from_stage,
        'source', v_artifact_source,
        'flag_enabled', v_s22_flag_enabled
      );
    END IF;
  END IF;

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

  DELETE FROM venture_stage_cutover_grandfather
  WHERE venture_id = p_venture_id AND stage_number = p_from_stage;

  UPDATE ventures SET current_lifecycle_stage = p_to_stage, stage_write_token = 'fn_advance_venture_stage', updated_at = NOW() WHERE id = p_venture_id;

  UPDATE venture_stage_work SET stage_status = 'completed', completed_at = NOW()
  WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage;

  v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid());

  -- SD-LEO-INFRA-DIRECTION-BLIND-KILL-001: transition_type is now derived from ACTUAL direction
  -- server-side -- the pre-fix body hardcoded the literal 'normal' unconditionally here.
  v_effective_transition_type := CASE WHEN v_is_rollback THEN 'rollback' ELSE 'normal' END;

  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, v_effective_transition_type,
    COALESCE(p_handoff_data->>'ceo_agent_id', 'system'), p_handoff_data, v_idem_key
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'venture_id', p_venture_id, 'venture_name', v_venture_name,
    'from_stage', p_from_stage, 'to_stage', p_to_stage,
    'transitioned_at', NOW(),
    'transition_type', v_effective_transition_type,
    'idempotency_key', v_idem_key,
    'artifact_source', v_artifact_source,
    'flag_enabled', v_s22_flag_enabled
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id);
END;
$function$;

-- secdef-execute-revoke-lint: documents the already-correct live grant state (confirmed via
-- has_function_privilege() before writing this fix) -- anon has never been able to execute this
-- function; authenticated and service_role retain their existing live access.
REVOKE EXECUTE ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) TO authenticated, service_role;

COMMIT;
