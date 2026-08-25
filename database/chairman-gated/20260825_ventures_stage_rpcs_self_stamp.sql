-- SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 — STEP 2 of 4: DB-resident writer self-stamping
-- (advance_venture_stage, advance_venture_to_stage, rescan_stage_20).
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: codestreetlabs@gmail.com
--   (Chairman verbal, in-terminal stage sitting 2026-08-25: 'approve all four, applied in order
--    with a readback after each.' Scribed by Adam per CLAUDE_ADAM.md §3c.)
-- @approval-record: chairman verbal at the 2026-08-25 in-terminal stage sitting (all four, in order).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- PREREQUISITE: 20260825_ventures_stage_write_token_column.sql (step 1) must already be applied.
-- Every UPDATE ... ventures ... below sets stage_write_token; on a PostgREST-mediated caller this
-- would PGRST204 pre-column, but these are DB-side UPDATEs inside plpgsql, so the failure mode here
-- is a plain "column does not exist" at CREATE OR REPLACE time -- the $precondition$ block below
-- turns that into an explicit, named refusal instead.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- advance_venture_stage ALSO closes FR-3 (the live promotion-gate array bypass) IN THIS SAME FILE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- The LIVE function body (re-verified via pg_get_functiondef on 2026-08-25, matching the BASIS note
-- in database/migrations/20260722_stage_advancement_advance_venture_stage_gate_type_ssot.sql byte
-- for byte) still hardcodes v_kill_gates/v_promotion_gates/v_all_gates as literal arrays, omitting
-- chairman promotion gates 10, 16, 19, 25 -- the census's forensically-proven-exploited gap (6 of 45
-- historical advances ungated). That SSOT-based fix has existed as a staged, self-verifying,
-- unapplied migration file since 2026-07-22 and still applies cleanly against current live state
-- (confirmed by the same live-body re-check). Concentrating all ventures.current_lifecycle_stage
-- traffic into this RPC via the new choke (step 3) WITHOUT closing this gap would make the bypass
-- WORSE, not better -- so this migration takes over 20260722's fix verbatim (DELTA 1-3 exactly as
-- that file documents: hardcoded arrays deleted, gate membership read fresh per call from
-- venture_stages.gate_type SSOT, response gate_type label corrected) and adds ONLY the
-- stage_write_token stamp on top. That earlier file remains staged for its own historical record but
-- is SUPERSEDED for apply purposes by this one -- applying both would be a harmless re-CREATE-OR-
-- REPLACE (this file's body is a strict superset), but only this file needs to be run.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHY EACH FUNCTION SELF-STAMPS ITS OWN LITERAL IDENTITY, NOT A SHARED CONSTANT
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Mirrors SD-LEO-INFRA-STRATEGIC-DIRECTIVES-CANONICAL-001's convention: each writer's stamp is a
-- truthful, distinct claim of authorship (registry identities 'advance_venture_stage',
-- 'advance_venture_to_stage', 'rescan_stage_20'), never a shared/blanket value. The choke migration's
-- registry (step 3) allowlists exactly these three identities for this surface.
--
-- APPLY (chairman ceremony; two separate invocations):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260825_ventures_stage_rpcs_self_stamp.sql" \
--     --prod-deploy --allow-any-path
--
-- NOTE: no BEGIN;/COMMIT; here -- scripts/apply-migration.js wraps the file in its own transaction.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

DO $precondition$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'ventures'
       AND column_name = 'stage_write_token'
  ) THEN
    RAISE EXCEPTION
      'ventures stage-writer self-stamp: ventures.stage_write_token does not exist. Apply '
      'database/chairman-gated/20260825_ventures_stage_write_token_column.sql FIRST (step 1 of 4), '
      'then re-run this ceremony.';
  END IF;
END
$precondition$;


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- advance_venture_stage — gate-array SSOT fix (FR-3) + self-stamp (FR-1/FR-2)
-- ───────────────────────────────────────────────────────────────────────────────────────────────
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
  -- hardcoded v_kill_gates/v_promotion_gates/v_all_gates arrays that omitted gates 10/16/19/25.
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

COMMENT ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) IS
'Canonical writer for ventures.current_lifecycle_stage forward advances. Gate membership read
per-stage from venture_stages.gate_type SSOT (closes the 10/16/19/25 promotion-gate omission,
SD-LEO-INFRA-STAGE-WRITER-CHOKE-001 FR-3, superseding 20260722_stage_advancement_advance_venture_
stage_gate_type_ssot.sql). Self-stamps stage_write_token=''advance_venture_stage'' for the
canonical-writer choke (FR-1/FR-2).';


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- advance_venture_to_stage — self-stamp only (no gate-array bug in this function)
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.advance_venture_to_stage(p_venture_id uuid, p_target_stage integer, p_build_method text DEFAULT 'claude_code'::text, p_repo_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
    DECLARE
      v_current_stage INTEGER;
      v_result JSONB;
      v_precondition JSONB;
    BEGIN
      IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
              OR public.fn_user_has_venture_access(p_venture_id)) THEN
        RAISE EXCEPTION 'access denied: venture access required (SD-MAN-FIX-SECURITY-GUARD-PACK-001)';
      END IF;

      SELECT current_lifecycle_stage INTO v_current_stage
      FROM ventures
      WHERE id = p_venture_id
      FOR UPDATE;

      IF v_current_stage IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Venture not found');
      END IF;

      IF p_target_stage != v_current_stage + 1 THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', format('Can only advance by 1 stage. Current: %s, Requested: %s', v_current_stage, p_target_stage)
        );
      END IF;

      v_precondition := public.fn_stage_artifact_precondition(p_venture_id, v_current_stage);
      IF (v_precondition->>'blocked')::boolean THEN
        RETURN jsonb_build_object(
          'success', false,
          'error', 'artifact_precondition_unmet',
          'missing_artifacts', v_precondition->'missing_artifacts',
          'deviated_artifacts', v_precondition->'deviated_artifacts',
          'source', v_precondition->>'source',
          'venture_id', p_venture_id,
          'from_stage', v_current_stage
        );
      END IF;

      UPDATE ventures
      SET current_lifecycle_stage = p_target_stage,
          stage_write_token = 'advance_venture_to_stage'
      WHERE id = p_venture_id;

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

COMMENT ON FUNCTION public.advance_venture_to_stage(uuid, integer, text, text) IS
'Registered canonical writer for ventures.current_lifecycle_stage (single-stage advance path).
Self-stamps stage_write_token=''advance_venture_to_stage'' for SD-LEO-INFRA-STAGE-WRITER-CHOKE-001''s
canonical-writer choke.';


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- fn_advance_venture_stage — self-stamp only. Discovered mid-EXEC (not in the original LEAD/PLAN
-- census): lib/eva/artifact-persistence-service.js's advanceStage() -- documented there as "the
-- primary general-advance call path" -- calls THIS function, not advance_venture_stage. Live-
-- verified 2026-08-25 via pg_get_functiondef: single UPDATE ventures SET current_lifecycle_stage
-- (its own line ~255), already reads gate_type from the venture_stages SSOT (no promotion-gate
-- array bug to fix here, unlike advance_venture_stage before this file's first block).
-- ───────────────────────────────────────────────────────────────────────────────────────────────
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

COMMENT ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) IS
'Canonical writer for ventures.current_lifecycle_stage -- the EVA-daemon-path RPC, called via
lib/eva/artifact-persistence-service.js''s advanceStage() (documented there as the primary
general-advance call path). Self-stamps stage_write_token=''fn_advance_venture_stage'' for
SD-LEO-INFRA-STAGE-WRITER-CHOKE-001''s canonical-writer choke.';


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- rescan_stage_20 — self-stamp only, on its own single conditional current_lifecycle_stage write
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rescan_stage_20(p_venture_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_precondition JSONB;
  v_artifacts_complete BOOLEAN;
BEGIN
  -- SECURITY (SD-LEO-INFRA-STAGE-WRITER-CHOKE-001, adversarial SECURITY review S-C1): this function
  -- previously had NO authorization check at all despite being SECURITY DEFINER (runs as the function
  -- owner, bypassing RLS) and, on the terminal branch below, auto-approving a pending stage-20
  -- chairman_decisions row and advancing current_lifecycle_stage to 21 for an ARBITRARY p_venture_id.
  -- Any caller able to invoke this RPC could self-approve a chairman gate for any venture whose SDs
  -- happened to be terminal. Matched to the same check advance_venture_stage/advance_venture_to_stage
  -- already use, rather than registering this as a "blessed" canonical writer while leaving it
  -- unauthorized -- concentrating trust into an unfixed writer would make the choke's guarantee only
  -- as strong as its weakest registered member.
  IF NOT (public.fn_is_service_role() OR public.fn_is_chairman()
          OR public.fn_user_has_venture_access(p_venture_id)) THEN
    RAISE EXCEPTION 'access denied: venture access required (SD-LEO-INFRA-STAGE-WRITER-CHOKE-001)';
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

  v_precondition := public.fn_stage_artifact_precondition(p_venture_id, 20);
  v_artifacts_complete := NOT (v_precondition->>'blocked')::boolean;

  v_stage_status := CASE
    WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete THEN 'completed'
    WHEN v_all_terminal AND (NOT v_artifact_verified OR NOT v_artifacts_complete) THEN 'artifact_missing'
    ELSE 'in_progress'
  END;
  SELECT jsonb_build_object(
    'total_sds', v_total,
    'terminal_sds', v_terminal,
    'non_terminal_sds', v_pending,
    'build_pending', NOT v_all_terminal,
    'artifact_verified', v_artifact_verified,
    'deployment_url', v_deployment_url,
    'required_artifacts_complete', v_artifacts_complete,
    'missing_artifacts', v_precondition->'missing_artifacts',
    'deviated_artifacts', v_precondition->'deviated_artifacts',
    'artifact_source', v_precondition->>'source',
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
      completed_at = CASE WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete THEN NOW() ELSE completed_at END,
      updated_at = NOW()
  WHERE venture_id = p_venture_id
    AND lifecycle_stage = 20;
  IF v_all_terminal AND v_artifact_verified AND v_artifacts_complete THEN
    SELECT current_lifecycle_stage INTO v_current_stage
    FROM ventures WHERE id = p_venture_id;
    IF v_current_stage IS NOT NULL AND v_current_stage <= 20 THEN
      UPDATE ventures
      SET current_lifecycle_stage = 21,
          orchestrator_state = 'idle',
          stage_write_token = 'rescan_stage_20'
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
    'required_artifacts_complete', v_artifacts_complete,
    'missing_artifacts', v_precondition->'missing_artifacts',
    'advanced_to', CASE WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete AND v_current_stage <= 20 THEN 21 ELSE NULL END,
    'reason', CASE
      WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete AND v_current_stage IS NOT NULL AND v_current_stage <= 20
        THEN 'Stage 20 complete - advanced to stage 21'
      WHEN v_all_terminal AND v_artifact_verified AND v_artifacts_complete
        THEN 'Stage 20 complete'
      WHEN v_all_terminal AND v_artifact_verified AND NOT v_artifacts_complete
        THEN 'Required Stage 20 artifact(s) missing: ' || array_to_string(ARRAY(SELECT jsonb_array_elements_text(v_precondition->'missing_artifacts')), ', ')
      WHEN v_all_terminal AND NOT v_artifact_verified
        THEN 'Deployment URL not registered - register your live deployment to advance past Stage 20'
      ELSE v_pending::text || ' SD(s) still in progress - complete all venture SDs to advance Stage 20'
    END
  );
END;
$function$;

COMMENT ON FUNCTION public.rescan_stage_20(uuid) IS
'Registered canonical writer for ventures.current_lifecycle_stage (Stage 20->21 auto-advance on
terminal-SD + artifact verification). Self-stamps stage_write_token=''rescan_stage_20'' for
SD-LEO-INFRA-STAGE-WRITER-CHOKE-001''s canonical-writer choke.';


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- EXECUTE-grant posture — required by scripts/lint/secdef-execute-revoke-lint.mjs (CI-enforced,
-- REGRESSION review R4): every migration that CREATE OR REPLACEs a SECURITY DEFINER function must
-- explicitly REVOKE ... FROM PUBLIC in the SAME file (PostgreSQL grants EXECUTE to PUBLIC by
-- default on function creation, and anon/authenticated inherit that unless separately addressed).
-- CREATE OR REPLACE does not itself reset an existing grant, so this restates -- rather than
-- changes -- each function's live posture (SECURITY review, live-measured): anon has never had a
-- legitimate reason to call any of these four; authenticated genuinely does (promote.ts and
-- src/lib/ventures/advanceStage.ts call advance_venture_stage via an RLS-bound user-session
-- client, not service-role -- see this file's fn_is_service_role()/fn_is_chairman()/
-- fn_user_has_venture_access() checks, which are what make an authenticated grant safe here).
REVOKE EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_venture_stage(uuid, integer, integer, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.advance_venture_to_stage(uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_venture_to_stage(uuid, integer, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) TO authenticated, service_role;

-- rescan_stage_20 is authenticated-callable on the same basis now that it carries the same
-- authorization check as its siblings (S-C1 fix above) -- previously it had NO check at all, so an
-- authenticated grant would have been a genuine open door; it no longer is.
REVOKE EXECUTE ON FUNCTION public.rescan_stage_20(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rescan_stage_20(uuid) TO authenticated, service_role;


-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- Post-condition verification
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.advance_venture_stage(uuid,integer,integer,text)'::regprocedure);
  ASSERT v_def NOT LIKE '%v_kill_gates%',      'advance_venture_stage: hardcoded gate arrays not removed';
  ASSERT v_def NOT LIKE '%v_promotion_gates%', 'advance_venture_stage: hardcoded gate arrays not removed';
  ASSERT v_def LIKE '%FROM venture_stages%',   'advance_venture_stage: venture_stages SSOT read missing';
  ASSERT v_def LIKE '%stage_write_token = ''advance_venture_stage''%', 'advance_venture_stage: self-stamp missing';
  -- S-H3: a missing venture_stages row must fail closed, not coalesce straight past FOUND.
  ASSERT v_def LIKE '%stage_gate_lookup_failed%', 'advance_venture_stage: fail-closed gate-lookup guard missing';

  v_def := pg_get_functiondef('public.advance_venture_to_stage(uuid,integer,text,text)'::regprocedure);
  ASSERT v_def LIKE '%stage_write_token = ''advance_venture_to_stage''%', 'advance_venture_to_stage: self-stamp missing';

  v_def := pg_get_functiondef('public.fn_advance_venture_stage(uuid,integer,integer,jsonb,uuid)'::regprocedure);
  ASSERT v_def LIKE '%stage_write_token = ''fn_advance_venture_stage''%', 'fn_advance_venture_stage: self-stamp missing';

  v_def := pg_get_functiondef('public.rescan_stage_20(uuid)'::regprocedure);
  ASSERT v_def LIKE '%stage_write_token = ''rescan_stage_20''%', 'rescan_stage_20: self-stamp missing';
  -- S-C1: rescan_stage_20 previously had NO authorization check despite being SECURITY DEFINER and
  -- auto-approving a pending chairman gate on its terminal branch -- must not become a "blessed"
  -- canonical writer while remaining unauthorized.
  ASSERT v_def LIKE '%fn_is_service_role() OR public.fn_is_chairman()%OR public.fn_user_has_venture_access%',
    'rescan_stage_20: authorization check missing';
END
$verify$;

-- EXECUTE-grant posture, live-checked (R4 / secdef-execute-revoke-lint's own runtime counterpart).
DO $verify_grants$
DECLARE
  v_bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT routine_name || ':' || grantee, ', ')
    INTO v_bad
    FROM information_schema.routine_privileges
   WHERE routine_schema = 'public'
     AND routine_name IN ('advance_venture_stage', 'advance_venture_to_stage', 'fn_advance_venture_stage', 'rescan_stage_20')
     AND privilege_type = 'EXECUTE'
     AND grantee IN ('PUBLIC', 'anon');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'stage-writer RPCs: PUBLIC/anon still hold EXECUTE after the REVOKE block above: %', v_bad;
  END IF;

  SELECT string_agg(DISTINCT r.name, ', ')
    INTO v_bad
    FROM (VALUES ('advance_venture_stage'), ('advance_venture_to_stage'), ('fn_advance_venture_stage'), ('rescan_stage_20')) r(name)
   WHERE NOT EXISTS (
     SELECT 1 FROM information_schema.routine_privileges
      WHERE routine_schema = 'public' AND routine_name = r.name
        AND grantee = 'authenticated' AND privilege_type = 'EXECUTE'
   );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'stage-writer RPCs: authenticated LOST EXECUTE (would break promote.ts/advanceStage.ts): %', v_bad;
  END IF;
END
$verify_grants$;
