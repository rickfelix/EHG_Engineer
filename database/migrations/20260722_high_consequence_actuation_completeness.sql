-- =============================================================================
-- Migration: High-consequence actuation completeness
-- SD: SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A
-- Date: 2026-07-22
--
-- Context: SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 shipped the blocking MECHANISM
-- (venture_stages.is_high_consequence, chairman_decisions.blocking, both
-- chokepoints -- see 20260716_high_consequence_stage_gates.sql). This migration
-- performs the actual cutover for stages 3/19/24, WITHOUT retroactively halting
-- ventures already sitting at those stages the moment this migration lands.
--
-- CORRECTED PREMISE (RCA + Solomon oracle verdict, 2026-07-22, correlation
-- cd32c63c): the original assumption below -- that every stage's
-- is_high_consequence started FALSE, so the flag-gated mechanism was inert --
-- is FALSE for stage 24. venture_stages.is_high_consequence for stage 24 was
-- set TRUE on 2026-07-21T16:15Z via a path outside every tracked migration
-- (most likely a chairman console action), and fn_advance_venture_stage has
-- enforced it UNCONDITIONALLY (gated only by the pre-existing fleet-wide
-- LEO_HIGH_CONSEQUENCE_GATES_ENABLED kill-switch, default ON) since
-- 20260716_high_consequence_stage_gates.sql shipped -- i.e. stage 24 is
-- ALREADY actively blocking today. Verified independently by both the
-- database-agent sub-agent and the Solomon oracle by querying live
-- venture_stages directly (exactly one stage, 24, has is_high_consequence=true;
-- 3 and 19 do not).
--
-- Authoritative store confirmed (EXEC investigation): ventures.current_lifecycle_stage
-- is what BOTH chokepoints (fn_advance_venture_stage below, and
-- lib/eva/stage-execution-worker.js) read/write. workflow_executions.current_stage is
-- a separate, non-authoritative observability/legacy pointer (StageAdvanceWorker) --
-- NOT what the blocking-gate check consults.
--
-- FR-1: is_high_consequence=true for stages 3/19/24 is set unconditionally below,
-- and its EFFECT is gated behind a NEW flag, HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED,
-- because the column itself has no per-row flag-gating. Both READ paths -- this RPC
-- (SQL) and lib/eva/stage-governance.js (JS, consumed by the daemon's two JS-side
-- chokepoints) -- gate is_high_consequence enforcement on this flag. The flag is
-- SEEDED ON (is_enabled=true, lifecycle_state='enabled') rather than the originally
-- planned default-OFF: a code-swap migration must be behavior-preserving, and since
-- stage 24 is the only is_high_consequence=true stage today, ON enforces ONLY stage
-- 24 -- IDENTICAL to current live behavior (zero net-new enforcement; stages 3/19
-- remain unenforced regardless of the flag, since their is_high_consequence stays
-- false until a SEPARATE, deliberate, chairman-gated flip -- not part of this SD).
-- Starting OFF would have been a silent regression: an unannounced disarm of an
-- already-live, chairman-reserved gate (S24 pre-launch kill / product review). This
-- is layered UNDER the pre-existing LEO_HIGH_CONSEQUENCE_GATES_ENABLED kill-switch
-- (default ON) -- that flag remains the fleet-wide emergency kill-switch for the
-- whole mechanism; HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED remains the reversible
-- lever for this SD's cutover (flip to is_enabled=false/lifecycle_state='disabled'
-- to roll back, TR-1) -- reversibility is fully preserved, only the SEEDED starting
-- value changed from OFF to ON to match already-enforced reality.
--
-- FR-3: venture_stages.is_irreversible is a NEW, independent signal (decoupled from
-- is_high_consequence) -- Stage 24 (Go-Live) is marked irreversible below. Consumed
-- by the new emergency-unblock function (lib/eva/artifact-persistence-service.js
-- emergencyUnblockGate) to refuse ever auto-advancing an irreversible gate.
--
-- Grandfathering (retroactive-halt guard): venture_stage_cutover_grandfather snapshots
-- every (venture_id, current_lifecycle_stage) pair currently sitting at stage 3/19/24
-- at the moment this migration applies. lib/eva/chairman-decision-watcher.js's
-- createOrReusePendingDecision consults this table before minting a BLOCKING decision
-- and skips blocking (logs instead) for an exempted pair. The row is consumed (deleted)
-- by fn_advance_venture_stage / stage-execution-worker.js's _advanceStage at the moment
-- the venture actually LEAVES that stage (not on every poll-tick mint-check -- a stage
-- visit is re-evaluated on every daemon tick while the venture sits there, so deleting
-- on first check would un-grandfather the SAME visit on the very next tick). Normal
-- advancement is strictly forward -- see the "must be from_stage + 1" comments in prior
-- fn_advance_venture_stage migrations and gate_boundary_config's
-- CHECK (to_stage > from_stage) -- so a venture cannot re-enter a stage number once it
-- has left it; the single-grace-crossing semantics therefore do not need to survive
-- across a hypothetical future re-entry (not possible in the current model), only across
-- repeated same-visit poll-tick calls, which the delete-on-exit design already covers.
--
-- NO BEGIN/COMMIT here: scripts/apply-migration.js wraps the whole file in one
-- transaction (matching 20260716's convention).
-- =============================================================================

-- ── 1. is_irreversible signal (FR-3) ────────────────────────────────────────
ALTER TABLE venture_stages
  ADD COLUMN IF NOT EXISTS is_irreversible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN venture_stages.is_irreversible IS
'SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A (FR-3): chairman-configurable, decoupled from
is_high_consequence -- a stage can be high-consequence without being irreversible (and vice
versa, though in practice the two compose at Stage 24 / Go-Live). Consumed by
lib/eva/artifact-persistence-service.js::emergencyUnblockGate to refuse ever providing a
single-call path to advance an irreversible gate: that function may re-open/un-stick a
pending decision (liveness-only) but must additionally return requiresManualConfirmation:true
and never itself call any stage-advance RPC when the gate is irreversible. Until Child C''s
WebAuthn step-up console exists, actually advancing an irreversible gate requires a separate,
manual, out-of-band chairman console action.';

UPDATE venture_stages SET is_irreversible = true WHERE stage_number = 24;

-- ── 2. Cutover kill-switch (FR-1, TR-1) ──────────────────────────────────────
-- SEEDED ON (behavior-preserving; see corrected-premise note above): stage 24 is
-- ALREADY is_high_consequence=true live and already actively enforced. Seeding
-- this flag OFF would be a silent regression (disarms an already-live gate);
-- seeding it ON enforces ONLY stage 24 today (3/19 remain is_high_consequence=
-- false, so the flag has zero effect on them until a separate deliberate flip).
-- is_enabled=true REQUIRES lifecycle_state='enabled' to satisfy
-- chk_flag_lifecycle_enabled_consistency (is_enabled = (lifecycle_state='enabled')).
INSERT INTO leo_feature_flags (flag_key, display_name, description, is_enabled, lifecycle_state, gates_what)
VALUES (
  'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED',
  'High-Consequence Stage Cutover (3/19/24)',
  'Cutover gate for SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A. Seeded ON (is_enabled=true) at deploy time because stage 24 is ALREADY venture_stages.is_high_consequence=true in production (set 2026-07-21, outside any tracked migration) and already actively enforced by fn_advance_venture_stage -- seeding OFF would silently disarm that live gate. ON means venture_stages.is_high_consequence=true takes effect for BOTH chokepoints (fn_advance_venture_stage below, and lib/eva/stage-governance.js consumed by the JS daemon chokepoints); today that is ONLY stage 24 (3/19 stay is_high_consequence=false and thus unenforced regardless of this flag, until a SEPARATE deliberate chairman-gated flip of their own column -- not part of this SD). Ventures already sitting at stage 3/19/24 at the moment of cutover are exempted for that single stage-visit via venture_stage_cutover_grandfather (see chairman-decision-watcher.js createOrReusePendingDecision). Layered UNDER the pre-existing LEO_HIGH_CONSEQUENCE_GATES_ENABLED kill-switch (default ON), which remains the fleet-wide emergency disable for the whole mechanism regardless of which stages are classified. To flip OFF (revert to pre-cutover-mechanism behavior -- NOTE this would disarm stage 24''s current live enforcement, so treat as a deliberate emergency action, not a routine rollback): UPDATE leo_feature_flags SET is_enabled=false, lifecycle_state=''disabled'' WHERE flag_key=''HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED''.',
  true,
  'enabled',
  'fn_advance_venture_stage is_high_consequence read gate + lib/eva/stage-governance.js highConsequenceStages derivation'
)
ON CONFLICT (flag_key) DO UPDATE SET is_enabled = true, lifecycle_state = 'enabled';

-- ── 3. Grandfather table + one-time snapshot (retroactive-halt guard) ───────
CREATE TABLE IF NOT EXISTS venture_stage_cutover_grandfather (
  venture_id UUID NOT NULL,
  stage_number INT NOT NULL,
  grandfathered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (venture_id, stage_number)
);

COMMENT ON TABLE venture_stage_cutover_grandfather IS
'SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: ventures already sitting at stage 3/19/24 (per
ventures.current_lifecycle_stage, the authoritative store) at the moment this migration
applied. A matching (venture_id, stage_number) row exempts THAT single stage-visit from
getting a blocking chairman_decisions row minted (createOrReusePendingDecision consults this
table; see lib/eva/chairman-decision-watcher.js). Consumed (deleted) when the venture actually
advances past stage_number (fn_advance_venture_stage / stage-execution-worker.js
_advanceStage), not on every poll-tick check, so the exemption survives the whole stage-visit
but does not linger to exempt a hypothetical future re-entry (not currently possible --
advancement is strictly forward).';

-- SECURITY (SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A EXEC-TO-PLAN SECURITY review, MUST-FIX #1):
-- This table is the ONLY control preventing a FORGED grandfather exemption from suppressing a
-- high-consequence blocking-decision mint. It was created without RLS while anon/authenticated
-- hold DML grants (unlike its siblings chairman_decisions/ventures/venture_stages, all RLS-on).
-- Enable RLS (default-deny) and REVOKE public DML so only the service role / SECURITY DEFINER
-- RPC context (fn_advance_venture_stage, the daemon, the migration owner — all of which bypass
-- RLS) can read/write it. anon + authenticated can never pre-seed a (venture, stage) exemption.
ALTER TABLE venture_stage_cutover_grandfather ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON venture_stage_cutover_grandfather FROM anon, authenticated;
DROP POLICY IF EXISTS venture_stage_cutover_grandfather_service_only ON venture_stage_cutover_grandfather;
CREATE POLICY venture_stage_cutover_grandfather_service_only
  ON venture_stage_cutover_grandfather
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO venture_stage_cutover_grandfather (venture_id, stage_number)
SELECT id, current_lifecycle_stage
FROM ventures
WHERE current_lifecycle_stage IN (3, 19, 24)
ON CONFLICT (venture_id, stage_number) DO NOTHING;

-- ── 4. The actual cutover (FR-1) ─────────────────────────────────────────────
-- Unconditional column write; effect is gated by HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED
-- at READ time in both fn_advance_venture_stage (below) and lib/eva/stage-governance.js.
UPDATE venture_stages SET is_high_consequence = true WHERE stage_number IN (3, 19, 24);

-- ── 5. fn_advance_venture_stage: layer the cutover-flag gate + grandfather consumption ──
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
  --
  -- === BEGIN CHANGE (SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A, FR-1) ========
  -- Cutover gate layered UNDER the check above: venture_stages.is_high_consequence
  -- has no per-row flag-gating, so until HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED is
  -- deliberately flipped ON (default OFF), v_is_high_consequence is treated as FALSE
  -- for every stage regardless of the column -- this is what makes the 3/19/24 flip
  -- above (step 4) reversible via a single flag flip (TR-1) and keeps current
  -- production behavior unchanged until the cutover is deliberately enabled.
  IF v_is_high_consequence THEN
    SELECT is_enabled INTO v_cutover_flag_enabled
    FROM leo_feature_flags WHERE flag_key = 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED';
    v_cutover_flag_enabled := COALESCE(v_cutover_flag_enabled, false); -- default OFF when row absent

    IF v_cutover_flag_enabled THEN
      -- === END CHANGE (SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A, FR-1) ========
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

  -- SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: consume any grandfather exemption for the
  -- stage being exited. No-op for the overwhelming majority of advances (the table only
  -- ever has rows for ventures that were already sitting at stage 3/19/24 at cutover
  -- time). Deletion happens HERE (only reached once every prior gate has passed and the
  -- venture is about to actually leave p_from_stage), not inside the decision-minting
  -- helper, so repeated poll-tick mint-checks during the SAME stage-visit keep finding
  -- the exemption -- it disappears only once the venture truly leaves the stage.
  DELETE FROM venture_stage_cutover_grandfather
  WHERE venture_id = p_venture_id AND stage_number = p_from_stage;

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
SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A: layered cutover gate --
is_high_consequence is treated as FALSE for every stage unless
leo_feature_flags.HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED is ON (default OFF),
independent of and underneath LEO_HIGH_CONSEQUENCE_GATES_ENABLED. On a
successful advance, consumes (deletes) any venture_stage_cutover_grandfather
row for (p_venture_id, p_from_stage) -- the retroactive-halt exemption for
ventures that were already sitting at stage 3/19/24 when the cutover migration
applied.
SD: SD-LEO-FEAT-STAGE-DISTRIBUTION-SETUP-001 (FR-2); read-source repoint by
SD-LEO-INFRA-UNIFY-VENTURE-STAGE-001-C; product-review gate + fixture bypass by
SD-LEO-INFRA-CHAIRMAN-PRODUCT-REVIEW-001; legacy-table retirement by
SD-LEO-INFRA-STAGE-ADVANCEMENT-ARTIFACT-001 (FR-4); high-consequence blocking
gate by SD-LEO-FEAT-MAKE-HIGH-CONSEQUENCE-001 (FR-3); cutover gate + grandfather
consumption by SD-LEO-FEAT-HIGH-CONSEQUENCE-STAGE-001-A (FR-1).';

-- ---------------------------------------------------------------------------
-- Self-verification: fail the deploy if any existing gate logic regressed, or
-- if the new cutover mechanism was not added correctly.
-- ---------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
  v_col_exists boolean;
  v_table_exists boolean;
  v_flag_row RECORD;
  v_irreversible_count integer;
  v_hc_count integer;
BEGIN
  v_def := pg_get_functiondef('public.fn_advance_venture_stage(uuid,integer,integer,jsonb,uuid)'::regprocedure);
  ASSERT v_def NOT LIKE '%legacy_fallback%', 'fn_advance_venture_stage: legacy_fallback branch was not removed';
  ASSERT v_def NOT LIKE '%stage_artifact_requirements%', 'fn_advance_venture_stage: legacy table read was not removed';
  ASSERT v_def LIKE '%product_review_required%', 'fn_advance_venture_stage: product-review gate regressed';
  ASSERT v_def LIKE '%gate_blocked%', 'fn_advance_venture_stage: kill/promotion gate regressed';
  ASSERT v_def LIKE '%artifact_precondition_unmet%', 'fn_advance_venture_stage: artifact precondition regressed';
  ASSERT v_def LIKE '%high_consequence_gate_blocked%', 'fn_advance_venture_stage: high-consequence blocking gate missing';
  ASSERT v_def LIKE '%LEO_HIGH_CONSEQUENCE_GATES_ENABLED%', 'fn_advance_venture_stage: high-consequence kill-switch missing';
  ASSERT v_def LIKE '%HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED%', 'fn_advance_venture_stage: cutover-flag gate missing';
  ASSERT v_def LIKE '%venture_stage_cutover_grandfather%', 'fn_advance_venture_stage: grandfather consumption missing';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'venture_stages' AND column_name = 'is_irreversible'
  ) INTO v_col_exists;
  ASSERT v_col_exists, 'venture_stages.is_irreversible column missing';

  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'venture_stage_cutover_grandfather'
  ) INTO v_table_exists;
  ASSERT v_table_exists, 'venture_stage_cutover_grandfather table missing';

  SELECT is_enabled, lifecycle_state INTO v_flag_row
  FROM leo_feature_flags WHERE flag_key = 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED';
  ASSERT FOUND, 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED flag row missing';
  ASSERT v_flag_row.is_enabled = true, 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED must be seeded ON (behavior-preserving for already-live stage-24 enforcement)';
  ASSERT v_flag_row.lifecycle_state = 'enabled', 'HIGH_CONSEQUENCE_STAGE_CUTOVER_ENABLED lifecycle_state must be enabled to match is_enabled=true';

  SELECT count(*) INTO v_hc_count FROM venture_stages WHERE stage_number IN (3, 19, 24) AND is_high_consequence = true;
  ASSERT v_hc_count = 3, format('Expected stages 3/19/24 to have is_high_consequence=true, found %s of 3', v_hc_count);

  SELECT count(*) INTO v_irreversible_count FROM venture_stages WHERE stage_number = 24 AND is_irreversible = true;
  ASSERT v_irreversible_count = 1, 'Stage 24 must be marked is_irreversible=true';
END
$verify$;
