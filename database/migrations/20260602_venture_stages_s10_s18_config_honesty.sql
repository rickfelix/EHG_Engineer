-- =============================================================================
-- Migration: venture_stages S10/S18 config-honesty reconciliation
-- SD: SD-LEO-INFRA-CONFIG-HONESTY-RECONCILE-001
-- Date: 2026-06-02
-- Author: Principal Database Architect (database-agent)
-- =============================================================================
--
-- PROBLEM
-- -------
-- venture_stages stages 10 (Customer & Brand Foundation) and 18 (Marketing Copy
-- Studio) are mis-classified with work_type='sd_required', but NO per-venture SD
-- is ever created for them. Their artifacts (identity_persona_brand /
-- marketing_*) are produced INLINE by the EVA stage-execution-worker. Only S19
-- (BUILD) genuinely creates a per-venture SD tree (via lifecycle-sd-bridge).
--
-- The mis-classification makes the venture-run monitor's SD_REQUIRED_GUARD
-- false-stall every venture at S10/S18 ("Stage N requires an SD; auto-approval
-- refused"). The honest work_type is 'artifact_only' — the value the other 14
-- inline-artifact stages already use: {1,4,6,7,8,9,11,12,14,15,21,22,25,26}.
--
-- WHAT THIS MIGRATION DOES
-- ------------------------
--   * UP:   S10,S18 work_type 'sd_required' -> 'artifact_only'
--           S10,S18 sd_required(bool) true  -> false   (see decision below)
--           + COMMENT ON COLUMN venture_stages.sd_required / .sd_suffix
--   * DOWN: restore S10,S18 work_type='sd_required' and sd_required=true
--
-- gate_type IS NOT TOUCHED for any stage. gate_type is the LIVE
-- can_auto_advance / advance_venture_stage promotion-gate mechanism (shared by
-- S18 AND S19, both gate_type='promotion'); changing it is OUT OF SCOPE and
-- would alter the live advancement flow. We leave it exactly as-is.
--
-- required_artifacts IS NOT TOUCHED. advance_venture_stage enforces an artifact
-- precondition from venture_stages.required_artifacts; S10's
-- 'identity_persona_brand' precondition stays intact, so brand/marketing work
-- still CANNOT be skipped — only the spurious "needs an SD" gating is removed.
--
-- sd_required(bool) DECISION: FLIP TO false for S10,S18
-- -----------------------------------------------------
-- Codebase audit (git grep, EHG_Engineer @ this worktree) found NO behavioral
-- reader of the venture_stages.sd_required BOOLEAN — every runtime branch keys
-- off the work_type STRING instead:
--   * lib/eva/stage-registry/index.js:59  -> copies row.sd_required into the
--       registry output object only; no consumer reads .sd_required off the
--       registry to change behavior (informational exposure only).
--   * get_sd_required_stages() / get_stage_info() (defined in
--       20260529_create_venture_stages_unified.sql, WHERE sd_required=true)
--       -> ZERO rpc callers anywhere in JS/TS (dead/unused functions).
--   * scripts/archive/one-time/generate-stage-docs.cjs -> archived one-time
--       markdown doc generator; informational "SD Required: Yes/No" only.
--   * scripts/backfill-chairman-decisions-missing-rows.mjs -> switches on the
--       work_type STRING (case 'sd_required'), NOT the boolean.
--   * scripts/monitor-venture-run.cjs assertSdRequiredStagesMatchCanonical()
--       -> queries work_type='sd_required', NOT the boolean.
-- The boolean is already LOOSELY coupled (S14/S15 are work_type='artifact_only'
-- yet sd_required=true), confirming it is a vestigial/informational label. Since
-- NO behavioral reader changes, we flip it to false for S10,S18 for true
-- config-honesty.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- UP
-- ---------------------------------------------------------------------------

-- 1) Reclassify S10,S18 to the honest inline-artifact work_type.
UPDATE venture_stages
SET work_type = 'artifact_only'
WHERE stage_number IN (10, 18);

-- 2) Flip the vestigial sd_required boolean to match (no behavioral reader; see
--    DECISION above). S19 (the only genuine SD-generating stage) is untouched.
UPDATE venture_stages
SET sd_required = false
WHERE stage_number IN (10, 18);

-- 3) Document the semantics of the two SD-label columns on venture_stages.
COMMENT ON COLUMN venture_stages.sd_required IS
  'TRUE means a per-venture Strategic Directive is generated for this stage. '
  'This is genuinely true ONLY for S19=BUILD (the lifecycle-sd-bridge build '
  'tree). The column is VESTIGIAL/INFORMATIONAL: no runtime code branches on '
  'this boolean — all behavioral classification keys off work_type instead '
  '(work_type=''sd_required'' is the authoritative signal; the monitor''s '
  'SD_REQUIRED guard and assertSdRequiredStagesMatchCanonical read work_type, '
  'not this boolean). Historically loosely coupled (S14/S15 are '
  'work_type=''artifact_only'' yet were sd_required=true). '
  'SD-LEO-INFRA-CONFIG-HONESTY-RECONCILE-001.';

COMMENT ON COLUMN venture_stages.sd_suffix IS
  'Vestigial naming label (e.g. BRAND/MARKETING/BUILD) intended as an SD-key '
  'suffix. Has NO runtime reader — get_sd_required_stages() exposes it but is '
  'never called from application code. Informational/historical only. '
  'SD-LEO-INFRA-CONFIG-HONESTY-RECONCILE-001.';

-- gate_type intentionally NOT modified (live promotion-gate mechanism, out of scope).
-- required_artifacts intentionally NOT modified (artifact precondition preserved).

-- ===========================================================================
-- DOWN (manual rollback)
-- ===========================================================================
-- Restores the pre-migration mis-classification for S10,S18. (The COMMENT ON
-- statements are documentation-only and may be left in place; included here for
-- completeness if a full revert is desired.)
--
-- BEGIN;
--
-- UPDATE venture_stages
-- SET work_type = 'sd_required'
-- WHERE stage_number IN (10, 18);
--
-- UPDATE venture_stages
-- SET sd_required = true
-- WHERE stage_number IN (10, 18);
--
-- -- (optional) revert column comments to NULL:
-- -- COMMENT ON COLUMN venture_stages.sd_required IS NULL;
-- -- COMMENT ON COLUMN venture_stages.sd_suffix IS NULL;
--
-- COMMIT;
-- ===========================================================================
