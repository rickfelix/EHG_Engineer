-- =============================================================================
-- Migration: High-consequence stage-gate blocking mechanism
-- SD: SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (chairman-delegated, 2026-07-14:
-- "operate autonomously, make high-consequence gates bind")
-- Date: 2026-07-16
--
-- FR-1: chairman-configurable high-consequence stage classification
--       (venture_stages.is_high_consequence).
-- FR-3 (RPC half): additive blocking-HOLD check in fn_advance_venture_stage,
-- scoped by lifecycle_stage = p_from_stage (security-agent finding, evidence
-- 7b374eff-0322-47c8-99fd-61b4556679eb -- an unscoped check would hold a
-- venture at every subsequent stage, not just the gated one), guarded by a
-- fail-safe-ON kill-switch (leo_feature_flags.LEO_HIGH_CONSEQUENCE_GATES_ENABLED)
-- so the check can be disabled fleet-wide without a deploy if a bug is found.
-- Also pins search_path (security-agent TR-7), matching the existing
-- fn_is_chairman/approve_chairman_decision/reject_chairman_decision pattern.
--
-- The other half of FR-3 (the JS daemon _advanceStage 4th backstop) ships in
-- lib/eva/stage-execution-worker.js in the same PR -- both chokepoints must
-- change together: artifact-persistence-service.js::advanceStage() delegates
-- to THIS RPC via supabase.rpc(), so it only inherits the block if the check
-- lives here (risk-agent finding, evidence 77870fa7-8e67-481c-b5c1-14a06f960c64).
-- =============================================================================

ALTER TABLE venture_stages
  ADD COLUMN IF NOT EXISTS is_high_consequence BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN venture_stages.is_high_consequence IS
'Chairman-configurable (FR-1, SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001): when true, chairman stage-gate decisions minted for this stage (createOrReusePendingDecision) are created with chairman_decisions.blocking=true, and BOTH venture-advancement chokepoints (fn_advance_venture_stage, lib/eva/stage-execution-worker.js _advanceStage) hold advancement on a pending blocking=true decision. Independent of gate_type/review_mode -- a stage can be high-consequence regardless of its existing gate classification (e.g. gate_type=''none'' stages like a first live-money/launch stage that has no gate today).';

-- INCIDENT-TIME DISABLE COMMAND (security-agent post-implementation finding F8):
-- leo_feature_flags has a CHECK constraint chk_flag_lifecycle_enabled_consistency
-- (is_enabled = (lifecycle_state = 'enabled')), so a bare
-- `UPDATE leo_feature_flags SET is_enabled=false WHERE flag_key='LEO_HIGH_CONSEQUENCE_GATES_ENABLED'`
-- will FAIL the CHECK constraint. The correct disable command is:
--   UPDATE leo_feature_flags SET is_enabled=false, lifecycle_state='disabled'
--   WHERE flag_key='LEO_HIGH_CONSEQUENCE_GATES_ENABLED';
INSERT INTO leo_feature_flags (flag_key, display_name, description, is_enabled, gates_what)
VALUES (
  'LEO_HIGH_CONSEQUENCE_GATES_ENABLED',
  'High-Consequence Stage-Gate Blocking',
  'Kill-switch for the high-consequence blocking-gate HOLD check added by SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001. Default ON (row absent, or is_enabled=true, means the check is active). To disable the check fleet-wide without a code deploy (e.g. a bug is found in the EXISTS clause -- security-agent finding, evidence 7b374eff -- mitigates the fail-closed blast radius of a mis-scoped check holding every venture), run: UPDATE leo_feature_flags SET is_enabled=false, lifecycle_state=''disabled'' WHERE flag_key=''LEO_HIGH_CONSEQUENCE_GATES_ENABLED'' -- setting is_enabled alone will fail chk_flag_lifecycle_enabled_consistency.',
  true,
  'fn_advance_venture_stage HIGH-CONSEQUENCE HOLD check + stage-execution-worker.js _advanceStage 4th backstop'
)
ON CONFLICT (flag_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_advance_venture_stage(
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
  v_canonical_array text[];
  v_required_artifacts text[];
  v_s22_flag_enabled boolean;
  v_legacy_skipped boolean;
  v_artifact_source text;
  v_hc_flag_enabled boolean;
  v_is_high_consequence boolean;
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

  -- === BEGIN CHANGE (SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001, FR-3) ============
  -- High-consequence blocking gate: HOLD advancement while a pending,
  -- blocking=true chairman_decisions row exists for THIS venture at THIS
  -- stage. Additive to (independent of) the status='approved' checks above --
  -- those key off gate_type/review_mode; this keys off the chairman's explicit
  -- high-consequence classification, so a stage with gate_type='none' can
  -- still be held if the chairman has designated it high-consequence.
  -- Gated on v_is_high_consequence being CURRENTLY true (re-read live above,
  -- same pattern as v_gate_type/v_review_mode -- NOT a creation-time
  -- snapshot), so the check is a guaranteed no-op with zero behavior change
  -- for the ~26 stages never so classified, and reclassifying a stage takes
  -- effect immediately, consistent with how gate_type/review_mode already
  -- behave. Mirrors the equivalent classification-gated short-circuit in
  -- lib/eva/stage-execution-worker.js's _advanceStage() (same PR) -- BOTH
  -- chokepoints must use IDENTICAL semantics (live classification, not the
  -- raw blocking flag alone), or a stray blocking=true row minted before a
  -- stage was un-classified could behave differently depending on which
  -- chokepoint a given advance happens to go through. Scoped by
  -- lifecycle_stage = p_from_stage -- an unscoped check would hold a venture
  -- at every subsequent stage, not just the gated one (security-agent
  -- finding, evidence 7b374eff). Kill-switch:
  -- leo_feature_flags.LEO_HIGH_CONSEQUENCE_GATES_ENABLED, default ON when the
  -- row is absent -- set is_enabled=false to disable fleet-wide without a
  -- deploy if a bug is ever found here.
  IF v_is_high_consequence THEN
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
  -- === END CHANGE ==============================================================

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

  UPDATE ventures SET current_lifecycle_stage = p_to_stage, updated_at = NOW() WHERE id = p_venture_id;

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
$fn$;

COMMENT ON FUNCTION public.fn_advance_venture_stage(UUID, INTEGER, INTEGER, JSONB, UUID) IS
'Advances a venture from one stage to the next with unified gate enforcement.
Reads gate_type/review_mode and canonical required_artifacts from the unified
venture_stages table (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C).
Legacy stage_artifact_requirements fallback RETIRED
(SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001, FR-4) -- canonical is now the
sole source of truth for this function regardless of LEO_S22_GATES_ENABLED.
Per-venture bypass via ventures.metadata.s22_legacy_skipped (S22 only).
Stage 23->24 additionally requires an approved chairman_decisions row with
decision_type=''product_review'' at lifecycle_stage=23, on top of the existing
decision-type-agnostic kill-gate check (SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001).
Fixture/demo ventures (is_demo=true OR name ~* ''^(parity-test-|test-stub)'')
bypass ONLY that product_review precondition (QF-20260703-236).
High-consequence blocking gate (SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001): for a
stage CURRENTLY classified venture_stages.is_high_consequence=true, holds
advancement while a pending chairman_decisions row with blocking=true exists at
lifecycle_stage=p_from_stage, independent of gate_type/review_mode. No-op for
unclassified stages. Kill-switch:
leo_feature_flags.LEO_HIGH_CONSEQUENCE_GATES_ENABLED (default ON). search_path
pinned to public (security hardening, matches fn_is_chairman/approve/reject).
SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-2); read-source repoint by
SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C; product-review gate + fixture bypass by
SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001; legacy-table retirement by
SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-4); high-consequence blocking
gate by SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-3).';

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if any existing gate logic regressed, or
-- if the new high-consequence check was not added correctly.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.fn_advance_venture_stage(uuid,integer,integer,jsonb,uuid)'::regprocedure);
  ASSERT v_def NOT LIKE '%legacy_fallback%', 'fn_advance_venture_stage: legacy_fallback branch was not removed';
  ASSERT v_def NOT LIKE '%stage_artifact_requirements%', 'fn_advance_venture_stage: legacy table read was not removed';
  ASSERT v_def LIKE '%product_review_required%', 'fn_advance_venture_stage: product-review gate regressed';
  ASSERT v_def LIKE '%gate_blocked%', 'fn_advance_venture_stage: kill/promotion gate regressed';
  ASSERT v_def LIKE '%artifact_precondition_unmet%', 'fn_advance_venture_stage: artifact precondition regressed';
  ASSERT v_def LIKE '%high_consequence_gate_blocked%', 'fn_advance_venture_stage: high-consequence blocking gate missing';
  ASSERT v_def LIKE '%LEO_HIGH_CONSEQUENCE_GATES_ENABLED%', 'fn_advance_venture_stage: high-consequence kill-switch missing';
END
$verify$;
