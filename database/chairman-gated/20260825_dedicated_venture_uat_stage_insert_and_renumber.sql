-- SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B — insert the dedicated venture-UAT venture_stages
-- row and renumber stage_number 23-26 to 24-27.
-- Target DB: EHG_Engineer consolidated (dedlbzhpgkmetvhbkyzq)
--
-- @approved-by: PENDING
-- @approval-record: PENDING — chairman ratification not yet scheduled. DO NOT APPLY.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- STAGED, NOT APPLIED. CHAIRMAN-GATED. DO NOT RUN THIS FILE.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- This migration touches an irreversible go_live gate (stage_key='go_live', currently
-- stage_number=24, promotion + is_irreversible=true) on live production venture data. Blast
-- radius contract: docs/audits/stage-21-26-census.md (Child A's committed census, 3805 code
-- findings across both repos, negative-control PASS). Run the precondition gate immediately
-- before any apply attempt:
--
--   node scripts/eva/uat-stage-migration-preconditions.mjs
--
-- That script re-verifies (FR-1) the writer-choke + gate-array mechanisms have not drifted
-- since this file was authored, checks stage-quiescence (FR-2), and classifies every venture
-- parked at a shifted stage as demo/real (FR-6) -- it exits non-zero and refuses if any check
-- fails. This SD's own originally-stated hard blocker had already shipped before the SD was
-- even created (proof this class of drift is real, not hypothetical) -- do not skip this step.
--
-- APPLY (chairman ceremony):
--   node scripts/apply-migration.js --issue-token
--   MIGRATION_APPLY_TOKEN=<token from above> node scripts/apply-migration.js \
--     "database/chairman-gated/20260825_dedicated_venture_uat_stage_insert_and_renumber.sql" \
--     --prod-deploy --allow-any-path
--
-- NOTE: no BEGIN;/COMMIT; here -- scripts/apply-migration.js wraps the file in its own
-- transaction (and holds an advisory lock), matching every other file in this directory.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- WHAT THIS FILE DOES (5 objects, one transaction)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- 1. Renumber venture_stages.stage_number 23-26 -> 24-27 (single UPDATE...FROM CTE, TR-2 --
--    the 20260607_swap_stage_21_22_full_content.sql technique, generalized from a 2-row swap
--    to a 4-row shift, avoiding a stage_number/stage_key UNIQUE-constraint collision mid-walk).
--    depends_on is shifted +1 in the SAME statement -- see note below; this was found during
--    EXEC, not stated in any FR, because inserting a new row mid-chain (not just swapping two
--    adjacent slots, which is what the 20260607 precedent did) uniquely requires it.
-- 2. INSERT the new dedicated-venture-UAT row at the now-vacant stage_number=23, carrying the
--    metadata.gates.uat_robustness_required=true marker Child C's lib/eva/uat-robustness-gate.js
--    already ships and is waiting on (that file's own header: "until child B lands that marker
--    on the new stage row, `applies` is always false" -- this is that landing).
-- 3. CREATE OR REPLACE both advance_venture_stage() and fn_advance_venture_stage() with their
--    hardcoded `p_to_stage > 26` bound updated to `> 27` (FR-9, SECURITY finding: otherwise the
--    new top stage is unreachable via 2 of 4 registered writers the instant this applies).
-- 4. CREATE OR REPLACE ventures_canonical_writer_policy() with one new registry row for the
--    dedicated-venture-UAT stage (FR-7).
-- 5. CREATE OR REPLACE the translate-at-read shim (FR-4) reconciled against the REAL 20260322
--    precedent (database/migrations/20260322_stage_renumbering_blueprint_review.sql STEP 3,
--    which already shifted venture_stage_transitions.from_stage/to_stage +1 for values 17-25).
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- DOCUMENTED, NOT FIXED: the p_from_stage=23/p_to_stage=24 "product review" choke-point literal
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Independent re-verification during EXEC (reading fn_advance_venture_stage()'s full live body
-- past the p_to_stage bound this SD already knew to check) found the SAME literal stage pair
-- hardcoded a SECOND time, for an unrelated purpose: `IF p_from_stage = 23 AND p_to_stage = 24
-- THEN` gates entry into stage_key='launch_readiness_gate' (soon to be stage_number=24) behind
-- an approved chairman `product_review` decision (SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001).
-- The IDENTICAL literal, for the SAME purpose, is mirrored in
-- lib/eva/stage-execution-worker.js:2971 (`if (fromStage === 23 && toStage === 24)`, plus a
-- `.eq('lifecycle_stage', 23)` query filter a few lines below) as a daemon-walk backstop, and
-- both call into lib/eva/chairman-product-review.js, whose own stage assumptions were not
-- audited by this SD.
--
-- Per TS-8's own contract ("either updated... or the PRD/migration explicitly documents why the
-- check/filename intentionally stays stale-named, matching the tolerated component_path drift
-- precedent from the 20260607 swap"): this migration LEAVES both literals unchanged. Fixing only
-- the SQL side here while lib/eva/stage-execution-worker.js and chairman-product-review.js stay
-- unaudited would make the two sides of the SAME gate disagree about which transition requires
-- chairman approval -- worse than leaving both consistently stale. This is a real, previously
-- uncaught (by LEAD, PLAN, TESTING, or SECURITY review) finding with its own non-trivial blast
-- radius into live chairman-gate enforcement; it is deliberately triaged OUT of this SD's scope
-- (TR-1's "staged, chairman-gated, one concern at a time" convention) and belongs in its own
-- dedicated, independently-reviewed follow-up SD, not bundled into an already-large renumber.
-- Recorded as a completion-flag finding for SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B.
--
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 0. PRECONDITION -- stage-quiescent freeze (FR-2 AC-1). Mirrors
--    lib/eva/uat-stage-migration/quiescence-check.mjs's pure logic in SQL, since the actual
--    freeze enforcement must live in the DDL itself, not only in the pre-flight Node script.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $preflight$
DECLARE
  v_in_flight INTEGER;
  v_have_2326 INTEGER;
BEGIN
  SELECT count(*) INTO v_in_flight
  FROM public.venture_stage_transitions
  WHERE completed_at IS NULL
    AND (from_stage BETWEEN 23 AND 26 OR to_stage BETWEEN 23 AND 26);
  IF v_in_flight <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % venture(s) currently mid-transition through stage 23-26; refusing to renumber underneath live ventures (FR-2 AC-1).', v_in_flight;
  END IF;

  -- Idempotency short-circuit: if the shift has already run, stage_number 23-26 no longer
  -- holds the 4 rows this migration expects to move (23 now holds the new UAT row instead).
  -- Only enforce the "exactly 4 rows" shape check on a FIRST run.
  IF NOT EXISTS (SELECT 1 FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat') THEN
    SELECT count(*) INTO v_have_2326 FROM public.venture_stages WHERE stage_number BETWEEN 23 AND 26;
    IF v_have_2326 <> 4 THEN
      RAISE EXCEPTION 'PREFLIGHT FAILED: expected exactly 4 rows at stage_number 23-26, found %', v_have_2326;
    END IF;
  END IF;
END
$preflight$;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 1. PRE-APPLY SNAPSHOT -- captured into a transaction-scoped temp table so the post-apply
--    readback (FR-3 AC-1) can assert gate_type/is_irreversible traveled with each row, whether
--    this is the first run or a harmless idempotent re-run.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE IF NOT EXISTS _uat001b_pre_snapshot ON COMMIT DROP AS
SELECT stage_number, stage_key, gate_type, is_irreversible, depends_on
FROM public.venture_stages
WHERE stage_number BETWEEN 23 AND 26;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 2. RENUMBER -- single UPDATE...FROM CTE (TR-2), stage_number 23-26 -> 24-27. depends_on is
--    shifted +1 in the SAME statement: this is a linear chain (every row's depends_on already
--    equals stage_number-1, verified live for stages 20-26), and inserting the new row into the
--    vacated slot means "shift stage_number AND every depends_on reference by +1" re-links the
--    chain correctly with no special-casing -- found during EXEC; not called out by any FR,
--    because the 20260607 precedent only ever swapped two ADJACENT same-numbered slots and never
--    needed to re-link a chain around an inserted row.
--    Idempotent: on a second run this WHERE clause matches zero rows (nothing remains at 23-26
--    once the first run completes), so it is a safe no-op.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
WITH src AS (
  SELECT stage_number, depends_on
  FROM public.venture_stages
  WHERE stage_number BETWEEN 23 AND 26
)
UPDATE public.venture_stages AS vs
SET
  stage_number = src.stage_number + 1,
  depends_on   = ARRAY(SELECT unnest(src.depends_on) + 1),
  updated_at   = now()
FROM src
WHERE vs.stage_number = src.stage_number
  AND vs.stage_number BETWEEN 23 AND 26;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 3. INSERT the new dedicated-venture-UAT stage into the now-vacant stage_number=23.
--    metadata.gates.uat_robustness_required=true is the exact marker Child C's
--    lib/eva/uat-robustness-gate.js already reads (evaluatePromotionGate-adjacent check,
--    `venture_stages.metadata.gates.uat_robustness_required === true`) -- this INSERT is what
--    activates that already-shipped, currently-always-false gate.
--    Idempotent: ON CONFLICT (stage_number) DO NOTHING is safe because after a first run,
--    stage_number=23 is permanently occupied by this row (the shift above never touches it again).
-- ───────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.venture_stages (
  stage_number, stage_key, stage_name, description, app_description,
  phase_number, phase_name, chunk, gate_type, review_mode, work_type,
  depends_on, required_artifacts, metadata, is_high_consequence, is_irreversible
) VALUES (
  23,
  'dedicated_venture_uat',
  'Dedicated Venture UAT',
  'In-stage UAT robustness checkpoint: exercises the venture''s own signed-in and signed-out user journeys against the Solomon-C control pack (per-journey minimum-assertion manifest, live-deployment binding, run-unique evidence hashing) before Launch Readiness. Built by SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-C (lib/eva/uat-robustness-gate.js, lib/eva/uat-journey-runner.js-adjacent machinery); activated by this row.',
  'Automated UAT robustness pass against the venture''s live deployment',
  5,
  'The Build',
  'THE_BUILD',
  'none',
  'auto',
  'automated_check',
  ARRAY[22]::integer[],
  ARRAY[]::text[],
  '{"gates":{"uat_robustness_required":true}}'::jsonb,
  false,
  false
)
ON CONFLICT (stage_number) DO NOTHING;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 4. FR-9 -- update the hardcoded p_to_stage > 26 upper bound to > 27 in BOTH RPCs, in this SAME
--    migration (SECURITY finding: otherwise the new top stage is unreachable via 2 of 4
--    registered writers the instant this applies). Full bodies below are the LIVE definitions
--    (pg_get_functiondef, 2026-08-25) with ONLY that one line changed each -- verified by diff
--    against the committed baseline in lib/eva/uat-stage-migration/drift-check.mjs.
--    CREATE OR REPLACE is naturally idempotent (TS-9).
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

  IF p_to_stage < 1 OR p_to_stage > 27 THEN
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

  -- DOCUMENTED, NOT UPDATED (see this file's header banner): this literal still reads
  -- p_from_stage = 23 AND p_to_stage = 24, the SAME pre-renumber pair it always has. Its
  -- twin in lib/eva/stage-execution-worker.js:2971 is likewise left unchanged, and
  -- chairman-product-review.js's own stage assumptions were not audited by this SD --
  -- fixing one side without the other would desynchronize the SQL and daemon-walk halves
  -- of the SAME gate. Tracked as its own out-of-scope follow-up finding, not silently lost.
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

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 5. FR-7 -- register the new dedicated-venture-UAT stage's writer(s) in
--    ventures_canonical_writer_policy()'s registry. Full VALUES list below is the LIVE registry
--    (pg_get_functiondef, 2026-08-25) with ONE new row appended at the end -- every existing row
--    is reproduced verbatim; CREATE OR REPLACE would otherwise silently drop them.
--    The new stage's transitions are written exclusively through the two already-registered
--    RPCs above (both read gate_type dynamically from venture_stages, per FR-3's live
--    re-verification finding that no code-level gate array exists left to re-anchor) -- this
--    entry is a passthrough label for audit legibility over the writer census, mirroring the
--    existing 'reconciliation-packet-apply.mjs' and 'ehg:promote.ts' passthrough rows below,
--    not a distinct raw write path.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ventures_canonical_writer_policy(p_writer_identity text DEFAULT NULL::text)
 RETURNS TABLE(writer_identity text, capability_flags jsonb, notes text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH registry(writer_identity, capability_flags, notes) AS (
    VALUES
      -- ── DB-RESIDENT RPCs (self-stamping wired in step 2, 20260825_ventures_stage_rpcs_self_stamp.sql)
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

      -- ── EVA STAGE MACHINERY (JS, self-stamping wired in step 2's code deploy) ──────────────────
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

      -- ── ehg REPO (routed through advance_venture_stage in step 2, not a raw write) ─────────────
      ('ehg:promote.ts',
       '{"surface":"api_route","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo src/pages/api/v2/ventures/[id]/promote.ts, Stage 0->1 promotion. Routed through supabase.rpc(''advance_venture_stage'') (matching src/lib/ventures/advanceStage.ts''s existing pattern) rather than a raw client-authenticated .update() -- the identity here is advance_venture_stage''s own stamp; this registry row exists for the writer-inventory census, not as a separate stamping caller. Landed via SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 (rickfelix/ehg#797), independently of this SD -- verified live on origin/main 2026-08-25.'),

      -- ── ehg REPO writer found by a parallel multi-agent census after this SD's initial writer
      -- inventory (PLAN_VERIFICATION, post-handoff) -- missed by the original 19-path count because
      -- scripts/lint/stage-advancement-chokepoint-lint.mjs's RUNTIME_DIRS is EHG_Engineer-relative
      -- and cannot see the ehg repo at all, and the LEAD-phase census only checked promote.ts there.
      ('stage24-go-live-route.ts',
       '{"surface":"api_route","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'ehg repo app/api/stage24/[ventureId]/go-live/route.ts performLaunch(), Stage 23->24 launch. Uses the SERVICE ROLE (bypasses RLS entirely) for a compound write (launched_at + current_lifecycle_stage=24 + deployment_url + an idempotency guard on launched_at IS NULL) -- the highest-severity of the found gaps, since a service_role write has no RLS fallback to fail safely into and would 500 on every launch the instant this choke arms unregistered.'),

      -- ── ehg REPO writers CENSUSED, now PASSTHROUGH callers of the registered RPC (not raw
      -- writers): SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 independently routed all 4 of these
      -- through advance_venture_stage (rickfelix/ehg, merged into origin/main 2026-08-25) while
      -- this SD's own writer-completeness fix branch was open -- discovered when resolving that
      -- branch's merge conflict against origin/main. Same passthrough shape as
      -- reconciliation-packet-apply.mjs above: stamp_wired:true because none of these performs a
      -- raw, bypass-capable write anymore, not because they carry their own stamp.
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

      -- ── ehg REPO writers CENSUSED but genuinely NOT self-stamped: live-verified RLS-BLOCKED
      -- TODAY (public.ventures has exactly two policies -- "Allow service_role to manage ventures"
      -- ALL and "authenticated_read_ventures" SELECT -- no authenticated UPDATE policy exists at
      -- all), so every write below already 0-rows-silently under RLS before it can ever reach this
      -- guard's BEFORE UPDATE trigger. stamp_wired:false is accurate, not a gap: stamping a write
      -- that RLS already filters out has no effect, and these rows exist for census completeness
      -- (this SD's own stated purpose) rather than to authorize a reachable write path. Unlike the
      -- 4 above, SD-LEO-INFRA-VENTURES-CLIENT-WRITE-001 deliberately left these two unchanged (its
      -- own README: "no derivable from-stage / initialization-only writes"). If RLS posture on
      -- ventures ever changes to add an authenticated UPDATE policy, these become real gaps and
      -- must be revisited -- audited 2026-08-25.
      ('scaffoldStage1',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'ehg repo src/services/ventures.ts scaffoldStage1(), venture-initialization write (stage=1). Anon-key browser client, only imported from .tsx components/hooks. RLS-blocked today (see class note above).'),
      ('useVentureData.ts',
       '{"surface":"eva_service_browser","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'ehg repo src/hooks/useVentureData.ts useUpdateVenture(), conditional stage write inside a general venture-edit mutation. React Query hook, browser-only by construction. RLS-blocked today (see class note above) -- in fact the WHOLE mutation is blocked, not just the stage field, a separate pre-existing bug unrelated to this SD.'),
      ('initialize_venture_stages',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":false}'::jsonb,
       'Live DB function (database/migrations/20260530_childF_repoint_readers_to_venture_stages.sql:270, GRANT EXECUTE TO authenticated per 20251206_factory_architecture.sql:606), sets current_lifecycle_stage=1. No JS/TS caller found in either repo as of 2026-08-25 (grepped both repos; only hits are the ehg repo''s auto-generated types.ts and an archived one-time migration script) -- registered for completeness since it remains directly RPC-invokable by any authenticated caller with EXECUTE, independent of whether anything currently calls it.'),

      -- ── NEW: dedicated-venture-UAT stage (SD-LEO-INFRA-DEDICATED-VENTURE-UAT-001-B, FR-7) ──────
      ('dedicated-venture-uat-stage',
       '{"surface":"db_function","protected_columns":["current_lifecycle_stage"],"stamp_wired":true}'::jsonb,
       'The dedicated-venture-UAT venture_stages row this migration inserts (stage_number=23, stage_key=dedicated_venture_uat). Transitions into/out of this stage are performed exclusively through the already-registered advance_venture_stage()/fn_advance_venture_stage() RPCs above (both read gate_type dynamically from venture_stages, per FR-3''s live re-verification finding that no code-level gate array exists left to re-anchor) -- this entry is a passthrough label for writer-census legibility over the new stage, not a distinct raw write path.')
  )
  SELECT r.writer_identity, r.capability_flags, r.notes
  FROM registry r
  WHERE p_writer_identity IS NULL OR r.writer_identity = p_writer_identity
$function$;

GRANT EXECUTE ON FUNCTION public.ventures_canonical_writer_policy(text) TO service_role;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 6. FR-4 -- translate-at-read shim reconciled against the REAL 20260322 precedent
--    (database/migrations/20260322_stage_renumbering_blueprint_review.sql STEP 3, which already
--    shifted venture_stage_transitions.from_stage/to_stage +1 for values 17-25 in place).
--    eva_stage_gate_attempts.stage_number and venture_stage_transitions.from_stage/to_stage are
--    NEVER UPDATEd by this migration (FR-4 AC-3) -- historical rows are read through this shim
--    only. Epoch marker convention (FR-4 AC-1): derive the cutover from
--    schema_migrations_applied's own applied_at record for THIS migration file (the existing
--    apply-migration.js audit log, TR-3-style reuse of established infrastructure) rather than a
--    new epoch column -- a row created strictly before that timestamp was written under the
--    pre-this-SD numbering scheme (which already carries the 20260322 shift, if applicable);
--    a row created at or after was written natively in the post-this-SD scheme and needs no
--    translation.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.translate_historical_stage_number(
  p_stage_number integer,
  p_row_created_at timestamptz
) RETURNS integer
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_cutover_at timestamptz;
BEGIN
  IF p_stage_number IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT applied_at INTO v_cutover_at
  FROM public.schema_migrations_applied
  WHERE migration_path LIKE '%20260825_dedicated_venture_uat_stage_insert_and_renumber.sql'
    AND success = true
  ORDER BY applied_at DESC
  LIMIT 1;

  -- Not yet applied: nothing to translate.
  IF v_cutover_at IS NULL THEN
    RETURN p_stage_number;
  END IF;

  IF p_row_created_at >= v_cutover_at THEN
    RETURN p_stage_number; -- native post-apply value
  END IF;

  -- Pre-apply row: values 23-26 (in the post-20260322, pre-this-SD scheme) map to the current
  -- scheme by +1; every other value was never touched by this SD's shift.
  IF p_stage_number BETWEEN 23 AND 26 THEN
    RETURN p_stage_number + 1;
  END IF;

  RETURN p_stage_number;
END;
$function$;

CREATE OR REPLACE VIEW public.venture_stage_transitions_current_scheme AS
SELECT
  vst.*,
  public.translate_historical_stage_number(vst.from_stage, vst.created_at) AS from_stage_current,
  public.translate_historical_stage_number(vst.to_stage, vst.created_at) AS to_stage_current
FROM public.venture_stage_transitions vst;

CREATE OR REPLACE VIEW public.eva_stage_gate_attempts_current_scheme AS
SELECT
  ega.*,
  public.translate_historical_stage_number(ega.stage_number, ega.created_at) AS stage_number_current
FROM public.eva_stage_gate_attempts ega;

-- ───────────────────────────────────────────────────────────────────────────────────────────────
-- 7. POST-APPLY READBACK (FR-2 AC-3, FR-3 AC-1/AC-2). Any miss aborts the whole transaction.
-- ───────────────────────────────────────────────────────────────────────────────────────────────
DO $verify$
DECLARE
  v_mismatch_count INTEGER;
  v_uat_row public.venture_stages%ROWTYPE;
  v_go_live_row public.venture_stages%ROWTYPE;
  v_irreversible_count INTEGER;
  v_bad_bound_count INTEGER;
  v_registry_count INTEGER;
BEGIN
  -- gate_type/is_irreversible/depends_on-relationship traveled with each shifted row.
  SELECT count(*) INTO v_mismatch_count
  FROM public.venture_stages vs
  JOIN _uat001b_pre_snapshot pre ON pre.stage_key = vs.stage_key
  WHERE vs.gate_type IS DISTINCT FROM pre.gate_type
     OR vs.is_irreversible IS DISTINCT FROM pre.is_irreversible;
  IF v_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % shifted row(s) have a gate_type/is_irreversible value that does not match their pre-apply snapshot (FR-3 AC-1).', v_mismatch_count;
  END IF;

  -- The irreversible go_live gate is present at its new stage_number, and it is the ONLY row
  -- carrying is_irreversible=true (FR-3 AC-2).
  SELECT * INTO v_go_live_row FROM public.venture_stages WHERE stage_key = 'go_live';
  IF v_go_live_row.stage_number IS NULL OR v_go_live_row.is_irreversible IS NOT TRUE THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: go_live row missing or lost is_irreversible=true after renumber.';
  END IF;
  SELECT count(*) INTO v_irreversible_count FROM public.venture_stages WHERE is_irreversible = true;
  IF v_irreversible_count <> 1 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: expected exactly 1 row with is_irreversible=true, found % (FR-3 AC-2).', v_irreversible_count;
  END IF;

  -- The new UAT stage exists, carries the activation marker, and depends on stage 22 (Visual
  -- Assets, unchanged) -- confirming the chain re-link, not just the raw shift.
  SELECT * INTO v_uat_row FROM public.venture_stages WHERE stage_key = 'dedicated_venture_uat';
  IF v_uat_row.stage_number IS NULL THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: dedicated_venture_uat row was not inserted.';
  END IF;
  IF NOT (v_uat_row.metadata #> '{gates,uat_robustness_required}' = 'true'::jsonb) THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: dedicated_venture_uat row missing metadata.gates.uat_robustness_required=true marker.';
  END IF;
  IF v_uat_row.depends_on <> ARRAY[22]::integer[] THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: dedicated_venture_uat.depends_on = % (expected {22}).', v_uat_row.depends_on;
  END IF;

  -- Both RPCs accept the new top stage (27), not 26 (FR-9 AC-2).
  SELECT count(*) INTO v_bad_bound_count
  FROM pg_proc
  WHERE proname IN ('advance_venture_stage', 'fn_advance_venture_stage')
    AND pg_get_functiondef(oid) LIKE '%p_to_stage > 26%';
  IF v_bad_bound_count <> 0 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: % RPC(s) still hardcode p_to_stage > 26 (FR-9 AC-1/AC-2).', v_bad_bound_count;
  END IF;

  -- The writer registry carries the new UAT stage entry (FR-7 AC-1).
  SELECT count(*) INTO v_registry_count
  FROM public.ventures_canonical_writer_policy('dedicated-venture-uat-stage');
  IF v_registry_count <> 1 THEN
    RAISE EXCEPTION 'POST-APPLY FAILED: dedicated-venture-uat-stage writer entry not found in the registry (FR-7 AC-1).';
  END IF;

  RAISE NOTICE 'DEDICATED-VENTURE-UAT-001-B RENUMBER VERIFIED: UAT stage inserted at %, go_live at %, gate-semantics preserved, RPC bound=27, writer registered.', v_uat_row.stage_number, v_go_live_row.stage_number;
END
$verify$;
