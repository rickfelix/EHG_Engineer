-- SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B — DOWN mirror for
-- 20260825_dedicated_venture_uat_stage_insert_and_renumber.sql.
--
-- @approved-by: PENDING
-- @approval-record: PENDING — chairman ratification not yet scheduled. DO NOT APPLY.
--
-- STAGED, NOT APPLIED.
--
-- REVISION NOTE (round 2, same EXEC pass as the UP file): rewritten alongside the UP file's
-- adversarial-review fixes. Reverts, in dependency order: both RPCs' p_to_stage bound and
-- fn_validate_stage_column's bound to 26 FIRST (safe, no registry dependency); then the guarded
-- reversal of ventures/chairman_decisions/venture_stage_work/venture_stages (using the
-- STILL-present 'dedicated-venture-uat-stage' registry identity for the ventures stage_write_token
-- stamp, and disabling the same two advance-only triggers the UP file disables, for the same
-- reason -- a decrement is not a real regression event either); then the writer-registry
-- reversion (drop the entry) LAST, since removing it before the ventures shift would make that
-- shift's own stage_write_token stamp fail the SAME choke trigger the UP file discovered.
-- RPC bodies below are byte-identical to the ORIGINAL pg_get_functiondef() capture (2026-08-25,
-- BEFORE this SD's p_to_stage edit) -- round 1 had reflowed some jsonb_build_object() calls onto
-- single lines, which is functionally equivalent but breaks this SD's own drift-check sha256
-- baseline on a post-DOWN re-apply attempt (found by adversarial TESTING review).
--
-- Idempotent (TS-10): re-running after an already-reverted state finds zero rows to touch at
-- every step, so every step below is naturally a no-op on a second run.
--
-- NOTE: no BEGIN;/COMMIT; here -- scripts/apply-migration.js wraps the file in its own
-- transaction, matching the UP file and every other file in this directory.

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- -1. LOCK, FIRST STATEMENT IN THE FILE (SECURITY finding H-2, mirrored from the UP file): makes
--    the preflight guarantees below hold to COMMIT rather than expiring the instant the check runs.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
LOCK TABLE public.ventures, public.venture_stages, public.chairman_decisions, public.venture_stage_work
  IN ACCESS EXCLUSIVE MODE;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 0. PREFLIGHT -- quiescence, scoped to the FULL post-apply footprint (23-27: the new UAT stage
--    now occupies 23, and the shifted rows occupy 24-27). Round 1's DOWN preflight checked only
--    24-27, missing stage 23 -- a venture mid-transition through the brand-new UAT stage would
--    have its catalog row deleted out from under it (found by adversarial TESTING review).
--    Also mirrors the UP file's advisory_checkpoints FK-hazard check (found missing here by
--    adversarial ship-gate review): advisory_checkpoints.stage_number FKs into
--    venture_stages(stage_number) with no ON UPDATE CASCADE, so a row anywhere in the post-apply
--    23-27 footprint -- including stage 23, which this file's section 3 DELETEs outright -- would
--    otherwise surface as a raw, unnamed FK-violation error deep inside the $revert$ block instead
--    of this named, actionable one. Fails safe either way (whole transaction rolls back), but the
--    named check gives the chairman a diagnosable reason instead of a bare constraint-violation.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $preflight_down$
DECLARE
  v_in_flight INTEGER;
  v_advisory_in_range INTEGER;
BEGIN
  SELECT count(*) INTO v_in_flight
  FROM public.venture_stage_work
  WHERE lifecycle_stage BETWEEN 23 AND 27
    AND stage_status = 'in_progress';
  IF v_in_flight <> 0 THEN
    RAISE EXCEPTION 'DOWN PREFLIGHT FAILED: % venture(s) currently mid-transition (venture_stage_work.stage_status=in_progress) through stage 23-27; refusing to revert underneath live ventures.', v_in_flight;
  END IF;

  SELECT count(*) INTO v_advisory_in_range
  FROM public.advisory_checkpoints
  WHERE stage_number BETWEEN 23 AND 27;
  IF v_advisory_in_range <> 0 THEN
    RAISE EXCEPTION 'DOWN PREFLIGHT FAILED: % advisory_checkpoints row(s) reference stage_number 23-27 (no ON UPDATE CASCADE on that FK); resolve before reverting.', v_advisory_in_range;
  END IF;
END
$preflight_down$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. PRE-REVERT SNAPSHOTS (per-row, same reasoning as the UP file's verify block: 24-26 are
--    simultaneously valid pre-revert AND post-revert values, so a bare range count cannot
--    distinguish "reverted" from "never touched"). GUARDED (only captures on a first DOWN
--    attempt), mirroring the UP file's identical round-2 fix -- an unconditional capture made a
--    second (idempotent, no-op) DOWN run assert "did not revert by exactly -1" against rows that
--    were already reverted and therefore correctly untouched.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE IF NOT EXISTS _uat001b_down_vs_pre_snapshot (
  stage_number integer, stage_key text, gate_type text, is_irreversible boolean, depends_on integer[]
) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _uat001b_down_ventures_pre_snapshot (id uuid, pre_stage integer) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _uat001b_down_cd_pre_snapshot (id uuid, pre_stage integer) ON COMMIT DROP;
CREATE TEMP TABLE IF NOT EXISTS _uat001b_down_vsw_pre_snapshot (id uuid, pre_stage integer) ON COMMIT DROP;

DO $capture_down_snapshot$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    RETURN; -- already reverted: leave all 4 snapshots empty, verify block's joins vacuously pass
  END IF;

  INSERT INTO _uat001b_down_vs_pre_snapshot
  SELECT stage_number, stage_key, gate_type, is_irreversible, depends_on
  FROM public.venture_stages WHERE stage_number BETWEEN 24 AND 27;

  INSERT INTO _uat001b_down_ventures_pre_snapshot
  SELECT id, current_lifecycle_stage FROM public.ventures WHERE current_lifecycle_stage BETWEEN 24 AND 27;

  INSERT INTO _uat001b_down_cd_pre_snapshot
  SELECT id, lifecycle_stage FROM public.chairman_decisions WHERE lifecycle_stage BETWEEN 24 AND 27;

  INSERT INTO _uat001b_down_vsw_pre_snapshot
  SELECT id, lifecycle_stage FROM public.venture_stage_work WHERE lifecycle_stage BETWEEN 24 AND 27;
END
$capture_down_snapshot$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. Revert both RPCs' upper bound to > 26, and fn_validate_stage_column()'s bound to 26. Full
--    bodies below are BYTE-IDENTICAL to the ORIGINAL pg_get_functiondef() capture (2026-08-25,
--    pre-this-SD). Safe to run before the registry/data reversal below -- no dependency.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_validate_stage_column()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  IF NEW.current_lifecycle_stage IS NULL THEN
    NEW.current_lifecycle_stage := 1;
  END IF;

  -- Validate stage range (1-26 for 26-stage lifecycle)
  IF NEW.current_lifecycle_stage < 1 OR NEW.current_lifecycle_stage > 26 THEN
    RAISE EXCEPTION 'current_lifecycle_stage must be between 1 and 26, got %',
      NEW.current_lifecycle_stage;
  END IF;

  RETURN NEW;
END;
$function$;

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

  IF p_to_stage < 1 OR p_to_stage > 26 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'invalid_to_stage',
      'to_stage', p_to_stage
    );
  END IF;

  -- FR-3: gate membership read fresh per call from the venture_stages SSOT (no cache), replacing the
  -- hardcoded kill/promotion/all-gates literal arrays that omitted gates 10/16/19/25 (names elided
  -- here on purpose: the verify block greps the live body for those identifiers' absence, and a comment
  -- naming them verbatim is indistinguishable from code using them — MECH-AMEND reword, 2026-08-25 sitting).
  --
  -- SECURITY (adversarial SECURITY review S-H3): a missing venture_stages row for p_from_stage must
  -- NOT silently disable the gate check. SELECT INTO leaves v_gate_type NULL when zero rows match,
  -- and COALESCE(gate_type, 'none') only handles a NULL *column value on a found row* -- it cannot
  -- distinguish "found a row with gate_type=NULL" from "no row at all" without FOUND, and the original
  -- code coalesced both to 'none', failing OPEN on a catalog gap (contradicting choke.sql's own
  -- FAIL-CLOSED-on-could-not-check principle). Fail closed instead: no SSOT row is a data-integrity
  -- problem, not evidence no gate applies.
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
        'success', false,
        'error', 'gate_not_approved',
        'gate_stage', p_from_stage,
        'gate_type', v_gate_type,
        'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
      );
    END IF;

    v_gate_decision_id := v_gate_decision.id;
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

  -- FR-1/FR-2 self-stamp: stage_write_token identifies this RPC as the writer, in the SAME
  -- statement as the protected-column change, matching the registry identity 'advance_venture_stage'.
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

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_from_stage, 'STAGE_COMPLETE',
    jsonb_build_object('advanced_to', p_to_stage, 'transition_type', p_transition_type),
    NOW()
  );

  INSERT INTO stage_events (id, venture_id, stage_number, event_type, event_data, created_at)
  VALUES (
    gen_random_uuid(), p_venture_id, p_to_stage, 'STAGE_ENTRY',
    jsonb_build_object('advanced_from', p_from_stage, 'transition_type', p_transition_type),
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
    p_venture_id, p_from_stage, p_to_stage, p_transition_type,
    'system:advance', jsonb_build_object(
      'gate_decision_id', v_gate_decision_id,
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

-- secdef-execute-revoke-lint (CI): mirrors the UP file's identical REVOKE/GRANT -- a NO-OP
-- against live production grants (authenticated + service_role only, verified via pg_proc.proacl),
-- re-asserted explicitly because this function is genuinely called client-side (ehg repo's
-- chairman decide/promote API routes) so the blanket PUBLIC/anon revoke used for
-- translate_historical_stage_number() below does not apply here.
REVOKE EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) TO authenticated, service_role;

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

  IF p_from_stage = 23 AND p_to_stage = 24 THEN
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
          'message', 'Stage 23 to 24 transition requires an approved chairman product_review decision',
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

  -- FR-1/FR-2 self-stamp: stage_write_token identifies this RPC as the writer.
  UPDATE ventures SET current_lifecycle_stage = p_to_stage, stage_write_token = 'fn_advance_venture_stage', updated_at = NOW() WHERE id = p_venture_id;

  UPDATE venture_stage_work SET stage_status = 'completed', completed_at = NOW()
  WHERE venture_id = p_venture_id AND lifecycle_stage = p_from_stage;

  v_idem_key := COALESCE(p_idempotency_key, gen_random_uuid());

  INSERT INTO venture_stage_transitions (
    venture_id, from_stage, to_stage, transition_type,
    approved_by, handoff_data, idempotency_key
  ) VALUES (
    p_venture_id, p_from_stage, p_to_stage, 'normal',
    COALESCE(p_handoff_data->>'ceo_agent_id', 'system'), p_handoff_data, v_idem_key
  ) ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'venture_id', p_venture_id, 'venture_name', v_venture_name,
    'from_stage', p_from_stage, 'to_stage', p_to_stage,
    'transitioned_at', NOW(),
    'idempotency_key', v_idem_key,
    'artifact_source', v_artifact_source,
    'flag_enabled', v_s22_flag_enabled
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM, 'venture_id', p_venture_id);
END;
$function$;

-- secdef-execute-revoke-lint (CI): see the identical note above advance_venture_stage()'s
-- REVOKE/GRANT in this same file.
REVOKE EXECUTE ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. Drop the historical shim views/function -- safe to run any time, no dependency on the
--    registry or data reversal below.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.stage_events_current_scheme;
DROP VIEW IF EXISTS public.eva_stage_gate_attempts_current_scheme;
DROP VIEW IF EXISTS public.venture_stage_transitions_current_scheme;
DROP FUNCTION IF EXISTS public.translate_historical_stage_number(integer, timestamptz);

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 4. GUARDED REVERSAL BLOCK -- mirrors the UP file's guard so a second DOWN run is a true no-op
--    (TS-10). Uses the STILL-present 'dedicated-venture-uat-stage' registry identity for the
--    ventures stage_write_token stamp -- the registry entry is removed in step 5, AFTER this
--    block, for the same reason the UP file registers it BEFORE its own ventures write.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $revert$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    RAISE NOTICE 'DEDICATED-VENTURE-UAT-001-B DOWN: already reverted (no dedicated_venture_uat row) -- skipping.';
    RETURN;
  END IF;

  -- chairman_decisions.lifecycle_stage: two-phase negative-intermediate shift back (-1), mirroring
  -- the UP file's own uq_chairman_decision_attempt collision-avoidance technique.
  UPDATE public.chairman_decisions
  SET lifecycle_stage = -lifecycle_stage, updated_at = now()
  WHERE lifecycle_stage BETWEEN 24 AND 27;

  UPDATE public.chairman_decisions
  SET lifecycle_stage = (-lifecycle_stage) - 1, updated_at = now()
  WHERE lifecycle_stage BETWEEN -27 AND -24;

  -- venture_stage_work.lifecycle_stage: same technique.
  UPDATE public.venture_stage_work
  SET lifecycle_stage = -lifecycle_stage, updated_at = now()
  WHERE lifecycle_stage BETWEEN 24 AND 27;

  UPDATE public.venture_stage_work
  SET lifecycle_stage = (-lifecycle_stage) - 1, updated_at = now()
  WHERE lifecycle_stage BETWEEN -27 AND -24;

  -- ventures.current_lifecycle_stage: disable the same two advance-only triggers the UP file
  -- disables (a decrement is not a real regression event either -- the artifact gate and
  -- stage-work-sync triggers are gated on NEW > OLD, so they would not fire on a pure -1 anyway,
  -- but disabled here for symmetry and defense-in-depth against a future change to their guard
  -- condition).
  ALTER TABLE public.ventures DISABLE TRIGGER enforce_stage_advancement_artifact_gate;
  ALTER TABLE public.ventures DISABLE TRIGGER trg_sync_stage_work_on_advance;

  UPDATE public.ventures
  SET current_lifecycle_stage = current_lifecycle_stage - 1,
      stage_write_token = 'dedicated-venture-uat-stage',
      updated_at = now()
  WHERE current_lifecycle_stage BETWEEN 24 AND 27;

  ALTER TABLE public.ventures ENABLE TRIGGER enforce_stage_advancement_artifact_gate;
  ALTER TABLE public.ventures ENABLE TRIGGER trg_sync_stage_work_on_advance;

  -- FR-6 RULING-A STAMP REMOVAL (mirrors the UP file's 2026-08-28 section 4b amendment): the two
  -- ruled ventures just rode the -1 revert back to their pre-ceremony stages, so the
  -- renumber_map_applied provenance stamp the UP file wrote no longer describes live state —
  -- strip it. The ruling itself (decision 9e5aac51) remains on record in chairman_decisions and
  -- on SD-LEO-INFRA-STAGE-KEYED-DATA-001.metadata; only the applied-state marker is removed.
  UPDATE public.ventures
  SET metadata = metadata - 'renumber_map_applied',
      updated_at = now()
  WHERE id IN ('ecbba50e-3c98-4493-9e77-1719cf6b6f00'::uuid, '510177ba-435f-4dd7-bfa5-6154cc8cf54b'::uuid)
    AND metadata ? 'renumber_map_applied';

  -- Mirrors the UP file's 2026-08-28 section 2b (eva_ventures CHECK widen to 27, the ruling-A
  -- prerequisite): narrow both stage CHECKs back to the pre-ceremony 26 — but ONLY when no
  -- eva_ventures row still sits above 26 (the -1 revert above has already pulled DataDistill's
  -- mirror back to 26; any other >26 row means state this DOWN does not understand, and a
  -- constraint that would immediately fail validation must not be attempted).
  IF NOT EXISTS (SELECT 1 FROM public.eva_ventures WHERE current_lifecycle_stage > 26) THEN
    ALTER TABLE public.eva_ventures DROP CONSTRAINT IF EXISTS chk_lifecycle_stage;
    ALTER TABLE public.eva_ventures ADD CONSTRAINT chk_lifecycle_stage CHECK (((current_lifecycle_stage >= 1) AND (current_lifecycle_stage <= 26)));
    ALTER TABLE public.eva_ventures DROP CONSTRAINT IF EXISTS eva_ventures_current_lifecycle_stage_check;
    ALTER TABLE public.eva_ventures ADD CONSTRAINT eva_ventures_current_lifecycle_stage_check CHECK (((current_lifecycle_stage >= 1) AND (current_lifecycle_stage <= 26)));
  END IF;

  -- ventures CHECK bound back to 26.
  ALTER TABLE public.ventures DROP CONSTRAINT IF EXISTS ventures_current_lifecycle_stage_check;
  ALTER TABLE public.ventures ADD CONSTRAINT ventures_current_lifecycle_stage_check
    CHECK (current_lifecycle_stage >= 1 AND current_lifecycle_stage <= 26);

  -- Delete the dedicated-venture-UAT row.
  DELETE FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat';

  -- venture_stages: two-phase negative-intermediate shift back (-1), depends_on -1 in the same
  -- statement, mirroring the UP file's technique in reverse.
  UPDATE public.venture_stages
  SET stage_number = -stage_number, updated_at = now()
  WHERE stage_number BETWEEN 24 AND 27;

  UPDATE public.venture_stages
  SET stage_number = (-stage_number) - 1,
      depends_on   = ARRAY(SELECT unnest(depends_on) - 1),
      updated_at   = now()
  WHERE stage_number BETWEEN -27 AND -24;
END
$revert$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 5. Revert the writer registry LAST (drop the dedicated-venture-uat-stage row) -- every
--    pre-existing row is reproduced verbatim; CREATE OR REPLACE would otherwise silently drop them.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 6. POST-REVERT VERIFICATION (TS-7): per-row snapshot comparison, not merely "the go_live row is
--    back at 24" -- proves the full reversal, not just one row.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $verify_down$
DECLARE
  v_go_live_row public.venture_stages%ROWTYPE;
  v_bad_chain_count INTEGER;
  v_ventures_stale_count INTEGER;
  v_cd_stale_count INTEGER;
  v_vsw_stale_count INTEGER;
  v_ventures_check_max INTEGER;
  v_bound_count INTEGER;
  v_registry_count INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: dedicated_venture_uat row still present after DELETE.';
  END IF;

  SELECT * INTO v_go_live_row FROM public.venture_stages WHERE stage_key = 'go_live';
  IF v_go_live_row.stage_number <> 24 OR v_go_live_row.is_irreversible IS NOT TRUE THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: go_live row not restored to stage_number=24 with is_irreversible=true (found stage_number=%, is_irreversible=%).', v_go_live_row.stage_number, v_go_live_row.is_irreversible;
  END IF;

  SELECT count(*) INTO v_bad_chain_count
  FROM public.venture_stages vs
  JOIN _uat001b_down_vs_pre_snapshot pre ON pre.stage_key = vs.stage_key
  WHERE vs.depends_on <> ARRAY[vs.stage_number - 1]::integer[];
  IF v_bad_chain_count <> 0 THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: % reverted row(s) have a depends_on chain that does not point at stage_number-1.', v_bad_chain_count;
  END IF;

  SELECT count(*) INTO v_ventures_stale_count
  FROM public.ventures v
  JOIN _uat001b_down_ventures_pre_snapshot pre ON pre.id = v.id
  WHERE v.current_lifecycle_stage <> pre.pre_stage - 1;
  IF v_ventures_stale_count <> 0 THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: % ventures row(s) did not revert by exactly -1.', v_ventures_stale_count;
  END IF;

  SELECT count(*) INTO v_cd_stale_count
  FROM public.chairman_decisions cd
  JOIN _uat001b_down_cd_pre_snapshot pre ON pre.id = cd.id
  WHERE cd.lifecycle_stage <> pre.pre_stage - 1;
  IF v_cd_stale_count <> 0 THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: % chairman_decisions row(s) did not revert by exactly -1.', v_cd_stale_count;
  END IF;

  SELECT count(*) INTO v_vsw_stale_count
  FROM public.venture_stage_work vsw
  JOIN _uat001b_down_vsw_pre_snapshot pre ON pre.id = vsw.id
  WHERE vsw.lifecycle_stage <> pre.pre_stage - 1;
  IF v_vsw_stale_count <> 0 THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: % venture_stage_work row(s) did not revert by exactly -1.', v_vsw_stale_count;
  END IF;

  SELECT (regexp_match(pg_get_constraintdef(oid), '<= ([0-9]+)'))[1]::integer INTO v_ventures_check_max
  FROM pg_constraint
  WHERE conrelid = 'public.ventures'::regclass AND conname = 'ventures_current_lifecycle_stage_check';
  IF v_ventures_check_max IS DISTINCT FROM 26 THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: ventures_current_lifecycle_stage_check upper bound is %, expected 26.', v_ventures_check_max;
  END IF;

  SELECT count(*) INTO v_bound_count
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('advance_venture_stage', 'fn_advance_venture_stage')
    AND pg_get_functiondef(oid) LIKE '%p_to_stage > 26%';
  IF v_bound_count <> 2 THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: expected 2 RPC(s) reverted to p_to_stage > 26, found %.', v_bound_count;
  END IF;

  SELECT count(*) INTO v_registry_count
  FROM public.ventures_canonical_writer_policy('dedicated-venture-uat-stage');
  IF v_registry_count <> 0 THEN
    RAISE EXCEPTION 'DOWN VERIFY FAILED: dedicated-venture-uat-stage writer entry still present in the registry.';
  END IF;

  RAISE NOTICE 'DEDICATED-VENTURE-UAT-001-B RENUMBER REVERTED: go_live restored to stage 24, chain re-linked, ventures/chairman_decisions/venture_stage_work reverted, ventures CHECK restored to 26, RPC bound=26, writer registry entry removed.';
END
$verify_down$;
