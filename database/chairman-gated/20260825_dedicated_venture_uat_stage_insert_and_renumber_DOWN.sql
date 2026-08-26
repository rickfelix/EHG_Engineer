-- SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B — DOWN mirror for
-- 20260825_dedicated_venture_uat_stage_insert_and_renumber.sql.
--
-- @approved-by: PENDING
-- @approval-record: PENDING — chairman ratification not yet scheduled. DO NOT APPLY.
--
-- STAGED, NOT APPLIED. Reverts: RPC bounds to > 26, the writer registry to its pre-this-SD
-- content, deletes the dedicated-venture-UAT row, and shifts stage_number 24-27 back to 23-26
-- (depends_on -1 in the same statement, mirroring the UP's +1). Idempotent (TS-10): re-running
-- after an already-reverted state finds zero rows at 24-27 and a missing dedicated_venture_uat
-- row, so every step below is naturally a no-op on a second run.
--
-- NOTE: no BEGIN;/COMMIT; here -- scripts/apply-migration.js wraps the file in its own
-- transaction, matching the UP file and every other file in this directory.

DO $preflight_down$
DECLARE
  v_in_flight INTEGER;
BEGIN
  SELECT count(*) INTO v_in_flight
  FROM public.venture_stage_transitions
  WHERE completed_at IS NULL
    AND (from_stage BETWEEN 24 AND 27 OR to_stage BETWEEN 24 AND 27);
  IF v_in_flight <> 0 THEN
    RAISE EXCEPTION 'DOWN PREFLIGHT FAILED: % venture(s) currently mid-transition through stage 24-27; refusing to revert underneath live ventures.', v_in_flight;
  END IF;
END
$preflight_down$;

-- Revert the writer registry to its pre-this-SD content (drop the dedicated-venture-uat-stage row).
CREATE OR REPLACE FUNCTION public.ventures_canonical_writer_policy(p_writer_identity text DEFAULT NULL::text)
 RETURNS TABLE(writer_identity text, capability_flags jsonb, notes text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH registry(writer_identity, capability_flags, notes) AS (
    VALUES
      ('advance_venture_stage'::text,
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC. Frontend-initiated + EVA-initiated forward advance. Also closes the promotion-gate array gap (FR-3) via the venture_stages SSOT read.'::text),
      ('advance_venture_to_stage',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC. Single-stage-advance path used by orchestrator bootstrap flows.'),
      ('rescan_stage_20',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC. Stage 20->21 auto-advance on terminal-SD + deployment-artifact verification.'),
      ('fn_advance_venture_stage',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'SECURITY DEFINER RPC, the EVA-daemon-path advance. Discovered mid-EXEC (not in the original writer census): lib/eva/artifact-persistence-service.js''s advanceStage() -- documented there as the primary general-advance call path -- calls this function, not advance_venture_stage.'),
      ('stage-execution-worker.js',
       '{"surface":"eva_daemon","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'lib/eva/stage-execution-worker.js. ONE identity covering all 3 write call sites (forward advance in _advanceStage, and the two chairman-gate/high-consequence revert-to-review-stage sites) -- all are the same daemon-walk authority, not distinct writers.'),
      ('venture-ceo-handlers.js',
       '{"surface":"eva_agent","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'lib/agents/venture-ceo/handlers.js _updateVentureProgress (line ~665). Ad-hoc CEO-runtime forward advance, gated by checkStageArtifactPrecondition (SD-LEO-INFRA-MINUS-GATE-SSOT-001 FR-5) before this SD; now also stamped.'),
      ('saga-coordinator.js',
       '{"surface":"eva_compensation","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'lib/eva/saga-coordinator.js createStageCompensation(). Revert-only (backward) compensation write for a failed saga step -- registered distinctly, not folded into stage-execution-worker.js, since it is a genuinely different call path with its own authority to revert.'),
      ('eva-run.js',
       '{"surface":"operator_tool","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'scripts/eva-run.js --stage flag. Operator-invoked manual stage override before an orchestration run.'),
      ('run-canary-probe.mjs',
       '{"surface":"operator_tool","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'scripts/canary/run-canary-probe.mjs deterministic full-pass reset (stage -> 1) on the fenced canary venture fixture.'),
      ('reconciliation-packet-apply.mjs',
       '{"surface":"operator_tool","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'scripts/reconciliation-packet-apply.mjs (SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 FR-4). Applies a frozen-then-ratified stage value via advance_venture_stage/advance_venture_to_stage -- itself calls a registered RPC rather than writing raw, so this identity is a passthrough label for audit legibility, never used to bypass the RPCs'' own checks.'),
      ('ehg:promote.ts',
       '{"surface":"api_route","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/pages/api/v2/ventures/[id]/promote.ts, Stage 0->1 promotion. Routed through supabase.rpc(''advance_venture_stage'') (matching src/lib/ventures/advanceStage.ts''s existing pattern) rather than a raw client-authenticated .update() -- the identity here is advance_venture_stage''s own stamp; this registry row exists for the writer-inventory census, not as a separate stamping caller. Landed via SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 (rickfelix/ehg#797), independently of this SD -- verified live on origin/main 2026-08-25.'),
      ('stage24-go-live-route.ts',
       '{"surface":"api_route","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo app/api/stage24/[ventureId]/go-live/route.ts performLaunch(), Stage 23->24 launch. Uses the SERVICE ROLE (bypasses RLS entirely) for a compound write (launched_at + current_lifecycle_stage=24 + deployment_url + an idempotency guard on launched_at IS NULL) -- the highest-severity of the found gaps, since a service_role write has no RLS fallback to fail safely into and would 500 on every launch the instant this choke arms unregistered.'),
      ('chairman-decide.ts',
       '{"surface":"api_route","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/pages/api/v2/chairman/decide.ts, "proceed" decision branch. Routed through supabase.rpc(''advance_venture_stage'') by SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 -- no longer a raw write.'),
      ('evaRollback.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/services/evaRollback.ts, rollback-to-previous-stage. Routed through supabase.rpc(''advance_venture_stage'', p_transition_type=''rollback'') by SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 -- no longer a raw write.'),
      ('evaStateMachines.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/services/evaStateMachines.ts, state-machine stage-advance. Routed through supabase.rpc(''advance_venture_stage'', p_transition_type=''automatic'') by SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 -- no longer a raw write.'),
      ('recursionEngine.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/services/recursionEngine.ts updateWorkflowState(). Routed through supabase.rpc(''advance_venture_stage'', p_transition_type=''rollback'') by SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 -- no longer a raw write.'),
      ('scaffoldStage1',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'ehg repo src/services/ventures.ts scaffoldStage1(), venture-initialization write (stage=1). Anon-key browser client, only imported from .tsx components/hooks. RLS-blocked today (see class note above).'),
      ('useVentureData.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'ehg repo src/hooks/useVentureData.ts useUpdateVenture(), conditional stage write inside a general venture-edit mutation. React Query hook, browser-only by construction. RLS-blocked today (see class note above) -- in fact the WHOLE mutation is blocked, not just the stage field, a separate pre-existing bug unrelated to this SD.'),
      ('initialize_venture_stages',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'Live DB function (database/migrations/20260530_childF_repoint_readers_to_venture_stages.sql:270, GRANT EXECUTE TO authenticated per 20251206_factory_architecture.sql:606), sets current_lifecycle_stage=1. No JS/TS caller found in either repo as of 2026-08-25 (grepped both repos; only hits are the ehg repo''s auto-generated types.ts and an archived one-time migration script) -- registered for completeness since it remains directly RPC-invokable by any authenticated caller with EXECUTE, independent of whether anything currently calls it.')
  )
  SELECT r.writer_identity, r.capability_flags, r.notes
  FROM registry r
  WHERE p_writer_identity IS NULL OR r.writer_identity = p_writer_identity
$function$;

GRANT EXECUTE ON FUNCTION public.ventures_canonical_writer_policy(text) TO service_role;

-- Revert both RPCs' upper bound to > 26 (only that one line differs from the UP file's bodies).
CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text)
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
    RETURN jsonb_build_object('success', false, 'error', 'venture_not_found', 'venture_id', p_venture_id);
  END IF;

  IF v_current_stage != p_from_stage THEN
    RETURN jsonb_build_object('success', false, 'error', 'stage_mismatch', 'current_stage', v_current_stage, 'from_stage', p_from_stage);
  END IF;

  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_to_stage', 'to_stage', p_to_stage);
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

  IF v_gate_type IN ('kill', 'promotion') THEN
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
        'success', false, 'error', 'gate_not_approved', 'gate_stage', p_from_stage, 'gate_type', v_gate_type,
        'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
      );
    END IF;

    v_gate_decision_id := v_gate_decision.id;
  END IF;

  v_precondition := public.fn_stage_artifact_precondition(p_venture_id, p_from_stage);
  IF (v_precondition->>'blocked')::boolean THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'artifact_precondition_unmet',
      'missing_artifacts', v_precondition->'missing_artifacts',
      'deviated_artifacts', v_precondition->'deviated_artifacts',
      'source', v_precondition->>'source', 'venture_id', p_venture_id, 'from_stage', p_from_stage
    );
  END IF;

  UPDATE venture_stage_work SET stage_status = 'completed', completed_at = NOW()
    WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage;

  UPDATE ventures
    SET current_lifecycle_stage = p_to_stage, stage_write_token = 'advance_venture_stage', updated_at = NOW()
    WHERE id = p_venture_id;

  UPDATE venture_stage_work SET stage_status = 'in_progress', started_at = NOW()
    WHERE venture_id = p_venture_id AND lifecycle_stage = p_to_stage;

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (gen_random_uuid(), p_venture_id, p_from_stage, 'STAGE_COMPLETE',
    jsonb_build_object('advanced_to', p_to_stage, 'transition_type', p_transition_type), NOW());

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (gen_random_uuid(), p_venture_id, p_to_stage, 'STAGE_ENTRY',
    jsonb_build_object('advanced_from', p_from_stage, 'transition_type', p_transition_type), NOW());

  v_idempotency := uuid_generate_v5(
    '00000000-0000-0000-0000-000000000000'::uuid,
    p_venture_id::text || ':' || p_from_stage::text || ':' || p_to_stage::text
      || ':' || COALESCE(
        (SELECT COUNT(*)::text FROM venture_stage_transitions
         WHERE venture_id = p_venture_id AND from_stage = p_from_stage AND to_stage = p_to_stage),
        '0')
  );

  INSERT INTO venture_stage_transitions (venture_id, from_stage, to_stage, transition_type, approved_by, handoff_data, idempotency_key)
  VALUES (p_venture_id, p_from_stage, p_to_stage, p_transition_type, 'system:advance',
    jsonb_build_object('gate_decision_id', v_gate_decision_id, 'venture_name', v_venture_name), v_idempotency)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'venture_id', p_venture_id, 'venture_name', v_venture_name,
    'from_stage', p_from_stage, 'to_stage', p_to_stage, 'transition_type', p_transition_type,
    'gate_created', false, 'idempotency_key', v_idempotency
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id, 'from_stage', p_from_stage, 'to_stage', p_to_stage);
END;
$function$;

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

  IF p_to_stage < 1 OR p_to_stage > 26 THEN
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

  IF v_review_mode = 'review' THEN
    IF NOT EXISTS (
      SELECT 1 FROM chairman_decisions
      WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage AND status = 'approved'
    ) THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'review_gate_blocked',
        'message', format('Stage %s requires chairman review approval', p_from_stage),
        'venture_id', p_venture_id, 'stage', p_from_stage, 'gate_type', v_gate_type, 'review_mode', v_review_mode
      );
    END IF;
  END IF;

  IF v_gate_type IN ('kill', 'promotion') THEN
    IF NOT EXISTS (
      SELECT 1 FROM chairman_decisions
      WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage AND status = 'approved'
    ) THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'gate_blocked',
        'message', format('Stage %s has %s gate requiring approval', p_from_stage, v_gate_type),
        'venture_id', p_venture_id, 'stage', p_from_stage, 'gate_type', v_gate_type, 'review_mode', v_review_mode
      );
    END IF;
  END IF;

  IF p_from_stage = 23 AND p_to_stage = 24 THEN
    IF NOT EXISTS (
      SELECT 1 FROM ventures
      WHERE id = p_venture_id AND (is_demo = true OR name ~* '^(parity-test-|test-stub)')
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM chairman_decisions
        WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage
          AND decision_type = 'product_review' AND status = 'approved'
      ) THEN
        RETURN jsonb_build_object(
          'success', false, 'error', 'product_review_required',
          'message', 'Stage 23 to 24 transition requires an approved chairman product_review decision',
          'venture_id', p_venture_id, 'stage', p_from_stage, 'to_stage', p_to_stage
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
          WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage AND status = 'pending' AND blocking = true
        ) THEN
          RETURN jsonb_build_object(
            'success', false, 'error', 'high_consequence_gate_blocked',
            'message', format('Stage %s has a pending high-consequence chairman decision', p_from_stage),
            'venture_id', p_venture_id, 'stage', p_from_stage
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
  FROM venture_stages WHERE stage_number = p_from_stage;
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
      WHERE va.venture_id = p_venture_id AND va.artifact_type = a AND va.is_current = true
    );

    IF v_missing_artifacts IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false, 'error', 'artifact_precondition_unmet', 'missing', v_missing_artifacts,
        'venture_id', p_venture_id, 'stage', p_from_stage, 'source', v_artifact_source, 'flag_enabled', v_s22_flag_enabled
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

  INSERT INTO venture_stage_transitions (venture_id, from_stage, to_stage, transition_type, approved_by, handoff_data, idempotency_key)
  VALUES (p_venture_id, p_from_stage, p_to_stage, 'normal', COALESCE(p_handoff_data->>'ceo_agent_id', 'system'), p_handoff_data, v_idem_key)
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'venture_id', p_venture_id, 'venture_name', v_venture_name,
    'from_stage', p_from_stage, 'to_stage', p_to_stage, 'transitioned_at', NOW(),
    'idempotency_key', v_idem_key, 'artifact_source', v_artifact_source, 'flag_enabled', v_s22_flag_enabled
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id);
END;
$function$;

-- Drop the historical shim views/function -- they exist only to serve this SD's renumber.
DROP VIEW IF EXISTS public.eva_stage_gate_attempts_current_scheme;
DROP VIEW IF EXISTS public.venture_stage_transitions_current_scheme;
DROP FUNCTION IF EXISTS public.translate_historical_stage_number(integer, timestamptz);

-- Delete the dedicated-venture-UAT row (idempotent: WHERE finds 0 rows on a second run).
DELETE FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat';

-- Shift stage_number 24-27 back to 23-26, depends_on -1 in the same statement (idempotent:
-- matches zero rows once already reverted).
WITH src AS (
  SELECT stage_number, depends_on
  FROM public.venture_stages
  WHERE stage_number BETWEEN 24 AND 27
)
UPDATE public.venture_stages AS vs
SET
  stage_number = src.stage_number - 1,
  depends_on   = ARRAY(SELECT unnest(src.depends_on) - 1),
  updated_at   = now()
FROM src
WHERE vs.stage_number = src.stage_number
  AND vs.stage_number BETWEEN 24 AND 27;

DO $verify_down$
DECLARE
  v_go_live_row public.venture_stages%ROWTYPE;
BEGIN
  IF EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: dedicated_venture_uat row still present after DELETE.';
  END IF;

  SELECT * INTO v_go_live_row FROM public.venture_stages WHERE stage_key = 'go_live';
  IF v_go_live_row.stage_number <> 24 OR v_go_live_row.is_irreversible IS NOT TRUE THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: go_live row not restored to stage_number=24 with is_irreversible=true (found stage_number=%, is_irreversible=%).', v_go_live_row.stage_number, v_go_live_row.is_irreversible;
  END IF;

  RAISE NOTICE 'DEDICATED-VENTURE-UAT-001-B RENUMBER REVERTED: go_live restored to stage 24, UAT row removed, RPC bound=26, writer registry restored.';
END
$verify_down$;
