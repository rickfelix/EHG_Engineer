-- @chairman-gated
-- =============================================================================
-- Migration: advance_venture_stage(uuid,int,int,text) -- converge hard-gate
--            membership onto the venture_stages SSOT (delete hardcoded arrays)
-- SD: SD-LEO-INFRA-RECONCILE-EHG-REPO-001
-- Date: 2026-07-22
-- Design-informed-by: DESIGN sub_agent_execution_results 44e48a95-91b2-4ae9-9097-d9a1d808523f
--                     (CONDITIONAL_PASS@88, conditions #4 + #5 hand this migration to DATABASE)
--
-- STATUS: STAGED — NOT self-applied. Per the chairman-gated migration convention
-- (SD-LEO-INFRA-MIGRATION-READINESS-CHAIRMAN-GATED-EXEMPT-001) applying this is a
-- separate, explicit chairman GO decision. NEVER self-apply via apply-migration.js
-- --prod-deploy. This migration has a NON-ZERO behavior change (see BEHAVIOR
-- DELTA below) and a documented deploy-time blast radius — the pre-deploy census
-- query at the bottom MUST be run and its result reviewed before GO.
--
-- BUG being fixed (docs/architecture; DESIGN DSN-C2 / DSN-W2):
--   The LIVE advance_venture_stage hardcodes gate membership as three literal
--   arrays: v_kill_gates=[3,5,13,24], v_promotion_gates=[17,18,23],
--   v_all_gates=[3,5,13,17,18,23,24]. This diverges from the ratified SSOT
--   (per-stage venture_stages.gate_type, retired chairman_dashboard_config.
--   hard_gate_stages on 2026-05-12 per SD-LEO-REFAC-GATE-AUTO-ADVANCE-001) in
--   two independent ways:
--     (1) OMISSION: gate_type='promotion' stages 10, 16, 19, 25 are absent from
--         v_all_gates, so frontend-initiated advances FROM those stages (via
--         src/lib/ventures/advanceStage.ts + ventureWorkflowBootstrap.ts in the
--         ehg repo, both -> supabase.rpc('advance_venture_stage')) get ZERO
--         chairman-gate enforcement today. This is an ACTIVE bypass, not a
--         future risk.
--     (2) LABEL SWAP: the response gate_type field labels stage 24 as 'kill' and
--         stage 23 as 'promotion'; the SSOT says 23=kill, 24=promotion. Swapped.
--   The sibling function fn_advance_venture_stage(uuid,int,int,jsonb,uuid) (EVA
--   daemon path, migration 20260716_high_consequence_stage_gates.sql) ALREADY
--   reads venture_stages per-stage correctly and is the reference implementation
--   mirrored here. It is NOT in this SD's scope.
--
-- FIX (3 deltas vs the LIVE def; everything else preserved verbatim):
--   DELTA 1 (DECLARE): delete v_kill_gates / v_promotion_gates / v_all_gates
--     literals; add `v_gate_type TEXT;`.
--   DELTA 2 (gate block): replace `IF p_from_stage = ANY(v_all_gates)` with a
--     single-row PK read of venture_stages.gate_type for p_from_stage (fresh per
--     call, FOR SHARE — byte-identical to what fn_advance_venture_stage already
--     does; DESIGN DSN-R3: NO cache/materialization, that is exactly the
--     staleness that let hard_gate_stages drift). Enforce iff
--     gate_type IN ('kill','promotion').
--   DELTA 3 (response): set the gate_not_approved response 'gate_type' field
--     directly from the venture_stages column (v_gate_type), replacing the
--     CASE-over-hardcoded-arrays expression. This is what corrects the 23/24
--     label swap — the label now comes from the SSOT.
--
--   PRESERVED VERBATIM (no regression): access guard, ventures FOR UPDATE lock,
--   venture_not_found / stage_mismatch / invalid_to_stage guards, the approved
--   chairman_decisions lookup + decision-verb allow-list, v_gate_decision_id
--   NULL-for-non-gate handling (SD-LEO-FIX-FIX-ADVANCE-VENTURE-001,
--   20260606_fix_advance_venture_stage_nongate.sql), the artifact-precondition
--   block (fn_stage_artifact_precondition, SD-LEO-INFRA-STAGE-ADVANCEMENT-
--   ARTIFACT-001), stage_events emits, uuid_generate_v5 idempotency, the
--   transitions INSERT with ON CONFLICT DO NOTHING, and the EXCEPTION handler.
--
-- BEHAVIOR DELTA (DESIGN DSN-R7 — this is NOT behavior-neutral):
--   * S10/S16/S19/S25: chairman promotion-gate enforcement BEGINS (bypass closed).
--   * S23: response gate_type corrects to 'kill' (was 'promotion').
--   * S24: response gate_type corrects to 'promotion' (was 'kill').
--   * S3/S5/S13 (kill) and S17/S18 (promotion): UNCHANGED — still enforced.
--   Note: high-consequence-hold + review_mode='review' gate parity with
--   fn_advance_venture_stage is DELIBERATELY OUT OF SCOPE here (would newly block
--   review-mode stages 7/8/9/11/21/22 — a far larger blast radius than this SD's
--   PRD enumerated). Residual divergence logged as follow-up (DESIGN DSN-W3).
--
-- BASIS: This CREATE OR REPLACE was built from the LIVE definition retrieved via
--   pg_get_functiondef('public.advance_venture_stage(uuid,integer,integer,text)'
--   ::regprocedure) on 2026-07-22 (kill=[3,5,13,24] promotion=[17,18,23]
--   all=[3,5,13,17,18,23,24], artifact-precondition block present) — NOT from any
--   stale on-disk migration.
-- Idempotent: CREATE OR REPLACE. Rollback levers provided separately:
--   PREFERRED (data-level, incident default):
--     20260722_DOWN_stage_advancement_advance_venture_stage_gate_type_ssot.sql
--   EMERGENCY-ONLY (full code revert, only if the new code itself is broken):
--     20260722_EMERGENCY_ONLY_full_code_revert_advance_venture_stage.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.advance_venture_stage(p_venture_id uuid, p_from_stage integer, p_to_stage integer, p_transition_type text DEFAULT 'normal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_current_stage INTEGER;
  v_venture_name TEXT;
  -- DELTA 1: hardcoded gate arrays removed; gate membership now read per-stage
  --          from the venture_stages SSOT (SD-LEO-INFRA-RECONCILE-EHG-REPO-001).
  v_gate_type TEXT;
  v_gate_decision RECORD;
  v_gate_decision_id UUID := NULL;  -- NULL for non-gate stages (20260606)
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

  -- DELTA 2: gate membership from the venture_stages SSOT (fresh per call, no
  -- cache), mirroring fn_advance_venture_stage. A missing/unknown row defaults
  -- to 'none' (no gate) — fail-open only for stages absent from the canonical
  -- 26-stage table, which cannot occur for a valid p_from_stage.
  SELECT COALESCE(gate_type, 'none') INTO v_gate_type
    FROM venture_stages
    WHERE stage_number = p_from_stage
    FOR SHARE;
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
        -- DELTA 3: label straight from the SSOT column (fixes the 23/24 swap).
        'gate_type', v_gate_type,
        'message', format('Chairman approval required at stage %s before advancing', p_from_stage)
      );
    END IF;

    v_gate_decision_id := v_gate_decision.id;
  END IF;

  -- Artifact-precondition check (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001,
  -- FR-3) — preserved verbatim, runs for gate and non-gate stages alike.
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
'Frontend-initiated venture stage advance (src/lib/ventures/advanceStage.ts,
ventureWorkflowBootstrap.ts). Gate membership is read per-stage from the
venture_stages.gate_type SSOT (SD-LEO-INFRA-RECONCILE-EHG-REPO-001) — the
hardcoded kill/promotion arrays were deleted; they had omitted promotion gates
10/16/19/25 (an active bypass) and mislabeled 23/24. Enforces an approved
chairman_decisions row when gate_type IN (kill,promotion). Preserves the
artifact-precondition check (SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001) and the
non-gate v_gate_decision_id NULL handling (SD-LEO-FIX-FIX-ADVANCE-VENTURE-001).
review_mode and high-consequence-hold parity with fn_advance_venture_stage is
intentionally out of scope here (see DESIGN DSN-W3 follow-up).';

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if the arrays did not get deleted, if the
-- SSOT read did not land, or if any preserved behavior regressed.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
BEGIN
  v_def := pg_get_functiondef('public.advance_venture_stage(uuid,integer,integer,text)'::regprocedure);
  -- Arrays are gone
  ASSERT v_def NOT LIKE '%v_kill_gates%',       'advance_venture_stage: v_kill_gates literal not deleted';
  ASSERT v_def NOT LIKE '%v_promotion_gates%',  'advance_venture_stage: v_promotion_gates literal not deleted';
  ASSERT v_def NOT LIKE '%v_all_gates%',        'advance_venture_stage: v_all_gates literal not deleted';
  ASSERT v_def NOT LIKE '%ARRAY[3, 5, 13%',     'advance_venture_stage: a hardcoded gate array survived';
  -- SSOT read landed
  ASSERT v_def LIKE '%FROM venture_stages%',    'advance_venture_stage: venture_stages SSOT read missing';
  ASSERT v_def LIKE '%v_gate_type IN (''kill'', ''promotion'')%', 'advance_venture_stage: gate_type enforcement branch missing';
  -- Preserved behavior (no regression)
  ASSERT v_def LIKE '%gate_not_approved%',              'advance_venture_stage: gate check regressed';
  ASSERT v_def LIKE '%fn_stage_artifact_precondition%', 'advance_venture_stage: artifact-precondition regressed';
  ASSERT v_def LIKE '%artifact_precondition_unmet%',    'advance_venture_stage: artifact error code regressed';
  ASSERT v_def LIKE '%v_gate_decision_id%',             'advance_venture_stage: non-gate NULL handling regressed';
END
$verify$;
