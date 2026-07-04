-- =============================================================================
-- Migration: chairman product-review gate — fixture-venture BYPASS for the
--            scoped 23->24 precondition on fn_advance_venture_stage (DB-RPC side)
-- SD: SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001
-- Date: 2026-07-04
--
-- Gap being closed:
--   The prior migration
--   (20260704_chairman_product_review_gate_scoped_precondition.sql) added a
--   scoped precondition to fn_advance_venture_stage: advancing EXACTLY
--   p_from_stage=23 -> p_to_stage=24 requires an approved chairman_decisions
--   row typed decision_type='product_review' at lifecycle_stage=23.
--
--   That precondition can NEVER be satisfied by a fixture/demo venture. The
--   only writer of product_review chairman decisions, requestProductReview()
--   (lib/eva/...), deliberately REFUSES to mint a chairman decision for
--   fixture/demo ventures — established precedent from QF-20260703-236
--   ("test/CI fixture ventures must never mint a chairman decision"; two real
--   leak specimens, one of which reached the chairman's real email). Because
--   clone-runs are a common source of fixture/test ventures and clone-run
--   launches call THIS function directly (as does the manual-advance /
--   CEO-agent path via lib/eva/artifact-persistence-service.js::advanceStage()),
--   a fixture venture reaching 23->24 would block on 'product_review_required'
--   FOREVER, with no legitimate way to ever clear it.
--
--   The JS-side equivalent choke point,
--   lib/eva/stage-execution-worker.js::_advanceStage(), was ALREADY fixed to
--   check fixture status BEFORE evaluating the product_review gate and to treat
--   a fixture venture as automatically-satisfied. This RPC is an INDEPENDENT
--   choke point with the SAME gap; this migration applies the SAME fix here so
--   the two defense-in-depth paths stay behaviorally aligned.
--
-- Fix (scoped, additive, mirrors the JS-side fixture definition EXACTLY):
--   Inside the pre-existing "IF p_from_stage = 23 AND p_to_stage = 24" block,
--   BEFORE enforcing the product_review precondition, short-circuit when the
--   venture is a fixture. Fixture definition is a byte-faithful port of
--   lib/eva/chairman-decision-watcher.js::isFixtureVenture:
--     const FIXTURE_VENTURE_NAME_RE = /^(parity-test-|test-stub)/i;
--     isFixtureVenture(v) => v.is_demo === true
--                         || (typeof v.name === 'string'
--                             && FIXTURE_VENTURE_NAME_RE.test(v.name));
--   SQL equivalent, evaluated against public.ventures for p_venture_id:
--     is_demo = true OR name ~* '^(parity-test-|test-stub)'
--   ( '~*' is case-insensitive POSIX regex == the JS /i flag; the '^' anchor ==
--     JS .test() on an anchored pattern == "starts with"; is_demo = true is a
--     strict TRUE test that leaves NULL is_demo as non-fixture, matching the JS
--     '=== true'. NULL name yields a NULL predicate == non-fixture, matching the
--     JS 'typeof name === "string"' guard. Semantically identical in every
--     is_demo/name null-combination. )
--
--   When the venture IS a fixture, the product_review precondition is skipped
--   entirely (treated as satisfied) for THIS transition only. When it is NOT a
--   fixture, behavior is byte-for-byte identical to the prior migration.
--
-- Explicitly OUT of scope / intentionally unchanged (same discipline as the
-- scoped-precondition migration this builds on):
--   - The earlier decision-type-AGNOSTIC kill/promotion gate (v_gate_type IN
--     ('kill','promotion')) is NOT given a fixture bypass. Stage 23 is
--     gate_type='kill', so a fixture venture must still carry SOME approved
--     chairman_decisions row at lifecycle_stage=23 to clear that separate gate
--     — that gate is satisfiable by non-product_review decision types and does
--     not "block forever", so it is deliberately left intact.
--   - No other (from,to) pair, no other stage's logic, the artifact
--     precondition, the compliance gate, grants, ownership, or search_path
--     pinning are touched. proconfig remains NULL (unpinned) exactly as the
--     current live function; adding a pin would be an unrelated change.
--
-- Current live source-of-truth: verified via pg_get_functiondef immediately
--   before authoring this migration. The body below is the CURRENT live body
--   (== the scoped-precondition migration's body) reproduced verbatim, with
--   exactly one change: the fixture short-circuit added inside the (23,24)
--   block (delimited by "FIXTURE BYPASS" markers).
--
-- Idempotent: CREATE OR REPLACE. Pre/post DO-block invariant checks below
--   RAISE EXCEPTION (aborting the transaction) if the live signature is not
--   what this migration expects, or if the fixture bypass fails to land.
--
-- Rollback (manual): re-apply
--   20260704_chairman_product_review_gate_scoped_precondition.sql, which
--   restores the block without the fixture short-circuit. No signature change,
--   so no caller updates either way.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Pre-check: refuse to proceed unless the live function is the exact
-- 5-parameter signature this migration was authored against, AND already
-- carries the scoped product_review precondition this migration extends
-- (guards against applying the bypass onto an unexpected/older body).
-- ---------------------------------------------------------------------------
DO $precheck$
DECLARE
  v_oid oid;
  v_src text;
BEGIN
  v_oid := to_regprocedure('public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'PRECHECK FAILED: public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid) not found -- refusing to apply fixture-bypass migration against an unexpected signature/state';
  END IF;

  SELECT pg_get_functiondef(v_oid) INTO v_src;
  IF v_src NOT LIKE '%product_review_required%'
     OR v_src NOT LIKE '%p_from_stage = 23 AND p_to_stage = 24%' THEN
    RAISE EXCEPTION 'PRECHECK FAILED: live function is missing the scoped 23->24 product_review precondition this fixture-bypass migration extends -- apply 20260704_chairman_product_review_gate_scoped_precondition.sql first';
  END IF;
END;
$precheck$;

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
  v_legacy_array text[];
  v_required_artifacts text[];
  v_s22_flag_enabled boolean;
  v_legacy_skipped boolean;
  v_artifact_source text;
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

  SELECT COALESCE(sc.gate_type, 'none'), COALESCE(sc.review_mode, 'review')
  INTO v_gate_type, v_review_mode
  FROM venture_stages sc
  WHERE sc.stage_number = p_from_stage
  FOR SHARE;

  IF NOT FOUND THEN
    v_gate_type := 'none';
    v_review_mode := 'review';
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

  -- === BEGIN NEW BLOCK (SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001) ===========
  -- Scoped, additive precondition: stage 23 -> 24 (Launch Readiness -> Go
  -- Live & Announce) ALSO requires an approved chairman_decisions row typed
  -- SPECIFICALLY decision_type='product_review' at lifecycle_stage=23, in
  -- addition to whatever the decision-type-agnostic kill/promotion check
  -- above already required. This is deliberately decision_type-SPECIFIC
  -- (unlike the check above) because lifecycle_stage=23 already accumulates
  -- other decision_type values (e.g. gate_approval, launch_gate, stage_gate)
  -- from the auto-evaluated Launch-Readiness kill-gate itself -- none of
  -- which may substitute for a hands-on chairman product review.
  --
  -- Strictly scoped to p_from_stage=23 AND p_to_stage=24: every other
  -- (from,to) pair -- including every other transition through stage 23,
  -- and every transition through any other stage -- is completely
  -- unaffected and returns/continues exactly as before this migration.
  --
  -- Mirrors the independent, already-shipped backstop in
  -- lib/eva/stage-execution-worker.js::_advanceStage() (the default
  -- daemon-walk path's own single side-effecting advance choke point,
  -- itself modeled on the stage-19 backstop from
  -- SD-LEO-INFRA-HARDEN-S19-S20-001). That backstop guards the daemon-walk
  -- path; this block is the DB-RPC-side equivalent guarding the
  -- manual-advance / CEO-agent path (lib/eva/artifact-persistence-service.js
  -- :635 advanceStage()) and clone-run launches, which both call THIS
  -- function directly. Independent checks by design (defense-in-depth
  -- across two independent choke points, not a shared code path).
  IF p_from_stage = 23 AND p_to_stage = 24 THEN
    -- === BEGIN FIXTURE BYPASS (SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001) =====
    -- A fixture/demo venture can NEVER earn an approved product_review chairman
    -- decision: requestProductReview() deliberately refuses to mint chairman
    -- decisions for fixtures (QF-20260703-236 -- test/CI fixtures must never
    -- leak a chairman decision, incl. one that reached the chairman's real
    -- email). Clone-runs, a common source of fixture ventures, drive THIS
    -- function -- so without this bypass a fixture would block at 23->24
    -- FOREVER. Check fixture status BEFORE enforcing the precondition; a
    -- fixture is treated as auto-satisfied for THIS precondition ONLY. Fixture
    -- definition is a byte-faithful port of
    -- lib/eva/chairman-decision-watcher.js::isFixtureVenture
    -- (is_demo === true OR name matches /^(parity-test-|test-stub)/i). The
    -- separate decision-type-agnostic kill/promotion gate above is NOT
    -- bypassed. Mirrors the already-shipped JS-side fixture pre-check in
    -- lib/eva/stage-execution-worker.js::_advanceStage().
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
    -- === END FIXTURE BYPASS ==================================================
  END IF;
  -- === END NEW BLOCK =========================================================

  SELECT is_enabled INTO v_s22_flag_enabled
  FROM leo_feature_flags WHERE flag_key = 'LEO_S22_GATES_ENABLED';
  v_s22_flag_enabled := COALESCE(v_s22_flag_enabled, false);

  SELECT COALESCE((metadata->>'s22_legacy_skipped')::boolean, false)
  INTO v_legacy_skipped
  FROM ventures WHERE id = p_venture_id;

  -- SD-LEO-INFRA-DATADISTILL-HONEST-LAUNCH-001 defect #8 fix: required_artifacts
  -- is text[]; read it directly (was: SELECT INTO a jsonb var -> cast exception).
  SELECT required_artifacts INTO v_canonical_array
  FROM venture_stages
  WHERE stage_number = p_from_stage;
  v_canonical_array := COALESCE(v_canonical_array, ARRAY[]::text[]);

  SELECT array_agg(artifact_type) INTO v_legacy_array
  FROM stage_artifact_requirements
  WHERE stage_number = p_from_stage AND is_blocking = true;
  v_legacy_array := COALESCE(v_legacy_array, ARRAY[]::text[]);

  IF v_legacy_skipped AND p_from_stage = 22 THEN
    v_required_artifacts := ARRAY[]::text[];
    v_artifact_source := 'bypass_s22_legacy_skipped';
  ELSIF v_s22_flag_enabled THEN
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical';
  ELSIF array_length(v_canonical_array, 1) IS NOT NULL THEN
    v_required_artifacts := v_canonical_array;
    v_artifact_source := 'canonical_with_fallback_available';
  ELSE
    v_required_artifacts := v_legacy_array;
    v_artifact_source := 'legacy_fallback';
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
venture_stages table (SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C — was stage_config /
lifecycle_stage_config; behavior-preserving, values identical).
Falls back to legacy stage_artifact_requirements when canonical empty AND
LEO_S22_GATES_ENABLED feature flag is OFF (during rollout).
Per-venture bypass via ventures.metadata.s22_legacy_skipped (S22 only).
Stage 23->24 additionally requires an approved chairman_decisions row with
decision_type=''product_review'' at lifecycle_stage=23, on top of the existing
decision-type-agnostic kill-gate check (SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001).
Fixture/demo ventures (is_demo=true OR name ~* ''^(parity-test-|test-stub)'')
bypass ONLY that product_review precondition, since requestProductReview() never
mints a chairman decision for fixtures (QF-20260703-236); mirrors the JS-side
fixture pre-check in stage-execution-worker.js::_advanceStage
(SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001).
SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-2); read-source repoint by
SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C; product-review gate + fixture bypass by
SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001.';

-- ---------------------------------------------------------------------------
-- Post-check: verify the fixture bypass actually landed inside the scoped
-- 23->24 product_review block, the earlier decision-type-agnostic kill gate
-- is still present (NOT bypassed), and the signature/return type/grants are
-- unchanged by CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
DO $postcheck$
DECLARE
  v_oid oid;
  v_src text;
  v_rettype text;
  v_grantee_count int;
BEGIN
  v_oid := to_regprocedure('public.fn_advance_venture_stage(uuid, integer, integer, jsonb, uuid)');
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'VERIFY FAILED: fn_advance_venture_stage(uuid,integer,integer,jsonb,uuid) missing after CREATE OR REPLACE';
  END IF;

  SELECT pg_get_functiondef(v_oid) INTO v_src;

  -- product_review precondition still present and still scoped to 23->24
  IF v_src NOT LIKE '%product_review_required%'
     OR v_src NOT LIKE '%decision_type = ''product_review''%'
     OR v_src NOT LIKE '%p_from_stage = 23 AND p_to_stage = 24%' THEN
    RAISE EXCEPTION 'VERIFY FAILED: scoped 23->24 product_review precondition not intact after fixture-bypass CREATE OR REPLACE';
  END IF;

  -- fixture bypass landed (name-pattern + is_demo test present)
  IF v_src NOT LIKE '%is_demo = true OR name ~* ''^(parity-test-|test-stub)''%' THEN
    RAISE EXCEPTION 'VERIFY FAILED: fixture-venture bypass (is_demo / parity-test-/test-stub name match) not found in live function source';
  END IF;

  -- the SEPARATE decision-type-agnostic kill/promotion gate must still exist
  -- (proof the fixture bypass did NOT accidentally weaken it)
  IF v_src NOT LIKE '%v_gate_type IN (''kill'', ''promotion'')%'
     OR v_src NOT LIKE '%gate_blocked%' THEN
    RAISE EXCEPTION 'VERIFY FAILED: decision-type-agnostic kill/promotion gate missing -- fixture bypass must not touch it';
  END IF;

  SELECT pg_get_function_result(v_oid) INTO v_rettype;
  IF v_rettype IS DISTINCT FROM 'jsonb' THEN
    RAISE EXCEPTION 'VERIFY FAILED: return type changed (expected jsonb, got %)', v_rettype;
  END IF;

  SELECT count(*) INTO v_grantee_count
  FROM information_schema.role_routine_grants
  WHERE routine_name = 'fn_advance_venture_stage'
    AND grantee IN ('service_role', 'postgres');
  IF v_grantee_count < 2 THEN
    RAISE EXCEPTION 'VERIFY FAILED: expected EXECUTE grants for service_role and postgres to survive CREATE OR REPLACE, found %', v_grantee_count;
  END IF;

  RAISE NOTICE 'VERIFY OK: fixture-venture bypass present inside scoped 23->24 product_review precondition; decision-type-agnostic kill gate intact; signature/return type/grants unchanged.';
END;
$postcheck$;

COMMIT;
