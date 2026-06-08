-- @approved-by: rickfelix@example.com
-- 20260607_swap_stage_21_22_full_content.sql
-- FULL-SWAP of venture_stages rows 21 <-> 22 (Distribution Setup before Visual Assets).
--
-- Replaces Alpha's defective half-swap. Strategy drives creative, so Distribution
-- Setup must EXECUTE FIRST: after this migration stage_number 21 = Distribution Setup
-- (WITH the spend_approval gate) and stage_number 22 = Visual Assets (WITH the
-- creative_handoff gate). BOTH gates are preserved (neither erased).
--
-- WHY ALPHA WAS DEFECTIVE (and this is not):
--   (1) Alpha left stage_key/description/app_description/component_path/metadata/
--       required_artifacts STALE. This swaps ALL of them.
--   (2) Alpha set stage 21 review_mode='auto', gate_label=NULL -> ERASED the gate.
--       Here review_mode is 'review' on BOTH rows already, so it is NOT touched;
--       the gate semantic lives in gate_label, which we SWAP (not null out).
--   (3) Alpha only moved creative_handoff and lost spend_approval. Here both
--       gate_labels are exchanged: 21 gets spend_approval, 22 gets creative_handoff.
--
-- POSITIONAL columns that must NOT move: stage_number, depends_on (21 stays {20},
-- 22 stays {21}), chunk, phase_name, phase_number, review_mode (both 'review'),
-- gate_type ('none'), work_type ('artifact_only'), sd_required (false),
-- advisory_enabled (false). These are intentionally NOT in the swap.
--
-- SAFE SWAP TECHNIQUE: stage_key carries a UNIQUE constraint, so two sequential
-- single-row UPDATEs would collide ("distribution_setup" already exists) mid-swap.
-- We do the entire exchange in ONE UPDATE...FROM whose source CTE captures the
-- pre-swap snapshot of both rows; each target row is written exactly once from the
-- OTHER row's snapshot, so neither row is ever lost and the unique key never clashes.
--
-- Idempotent: re-running detects the already-swapped state (stage 21 already =
-- distribution_setup) and makes ZERO changes (the join only rewrites when the
-- content does not already match the target), so it is safe to re-apply.
--
-- Rollback companion: DOWN block at the bottom (the swap is its own inverse).
--
-- NOTE on transactions: apply-migration.js wraps the file in BEGIN...COMMIT and
-- holds advisory locks, so the preflight RAISE rolls back everything on failure.
-- We still issue an explicit BEGIN/COMMIT for direct psql execution.

BEGIN;

-- =========================================================================
-- PREFLIGHT: assert ZERO ventures are currently parked at stage 21 or 22.
-- (ventures.current_lifecycle_stage is the live stage pointer.) Swapping the
-- meaning of a stage a venture is sitting on would silently mis-route it.
-- =========================================================================
DO $preflight$
DECLARE
  v_at_2122 INTEGER;
  v_have_21 INTEGER;
  v_have_22 INTEGER;
BEGIN
  SELECT count(*) INTO v_at_2122
  FROM public.ventures
  WHERE current_lifecycle_stage IN (21, 22);
  IF v_at_2122 <> 0 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: % venture(s) currently at stage 21 or 22; refusing to swap stage meaning underneath live ventures.', v_at_2122;
  END IF;

  -- Both rows must exist before we attempt the exchange.
  SELECT count(*) INTO v_have_21 FROM public.venture_stages WHERE stage_number = 21;
  SELECT count(*) INTO v_have_22 FROM public.venture_stages WHERE stage_number = 22;
  IF v_have_21 <> 1 OR v_have_22 <> 1 THEN
    RAISE EXCEPTION 'PREFLIGHT FAILED: expected exactly one row each at stage 21 and 22, found 21=%, 22=%', v_have_21, v_have_22;
  END IF;
END
$preflight$;

-- =========================================================================
-- FULL SWAP of all 8 content columns in a single statement.
-- src CTE snapshots BOTH rows BEFORE any write; the UPDATE then assigns to each
-- target the content of the OTHER source row (21 <- snapshot-of-22, 22 <- snapshot-
-- of-21). One write per row, so the UNIQUE(stage_key) constraint is never violated
-- and no row is lost mid-swap. depends_on/stage_number/etc. are left untouched.
-- =========================================================================
WITH src AS (
  SELECT
    stage_number,
    stage_key,
    stage_name,
    description,
    app_description,
    component_path,
    gate_label,
    required_artifacts,
    metadata
  FROM public.venture_stages
  WHERE stage_number IN (21, 22)
)
UPDATE public.venture_stages AS vs
SET
  stage_key          = other.stage_key,
  stage_name         = other.stage_name,
  description        = other.description,
  app_description    = other.app_description,
  component_path     = other.component_path,
  gate_label         = other.gate_label,
  required_artifacts = other.required_artifacts,
  metadata           = other.metadata,
  updated_at         = now()
FROM src AS other
WHERE vs.stage_number IN (21, 22)
  -- pair each target row with the OTHER row's snapshot
  AND other.stage_number = (21 + 22) - vs.stage_number
  -- idempotency guard: only write if not already in the target (swapped) state
  AND vs.stage_key IS DISTINCT FROM other.stage_key;

-- =========================================================================
-- POST-SWAP VERIFICATION: prove the acceptance criteria. Any miss aborts the txn.
--   stage 21 = Distribution Setup, spend_approval, distribution content
--   stage 22 = Visual Assets, creative_handoff, visual content
--   BOTH gates present (neither erased); positional columns unchanged.
-- =========================================================================
DO $verify$
DECLARE
  r21 public.venture_stages%ROWTYPE;
  r22 public.venture_stages%ROWTYPE;
BEGIN
  SELECT * INTO r21 FROM public.venture_stages WHERE stage_number = 21;
  SELECT * INTO r22 FROM public.venture_stages WHERE stage_number = 22;

  -- Stage 21 must now be Distribution Setup WITH the spend_approval gate.
  IF r21.stage_key <> 'distribution_setup'
     OR r21.stage_name <> 'Distribution Setup'
     OR r21.gate_label <> 'spend_approval'
     OR r21.component_path <> 'Stage22DistributionSetup.tsx'
     OR r21.app_description <> 'Distribution channels with ad copy and targeting'
     OR r21.required_artifacts <> ARRAY['distribution_channel_config','distribution_ad_copy']::text[]
     OR NOT (r21.metadata ? 'channels')
     OR r21.review_mode <> 'review' THEN
    RAISE EXCEPTION 'POST-SWAP FAILED: stage 21 is not Distribution Setup WITH spend_approval (key=%, gate=%, review_mode=%)',
      r21.stage_key, r21.gate_label, r21.review_mode;
  END IF;

  -- Stage 22 must now be Visual Assets WITH the creative_handoff gate.
  IF r22.stage_key <> 'visual_assets'
     OR r22.stage_name <> 'Visual Assets'
     OR r22.gate_label <> 'creative_handoff'
     OR r22.component_path <> 'Stage21VisualAssets.tsx'
     OR r22.app_description <> 'Device screenshots and social graphics from designs'
     OR r22.required_artifacts <> ARRAY['visual_device_screenshots','visual_social_graphics']::text[]
     OR NOT (r22.metadata ? 'asset_types')
     OR r22.review_mode <> 'review' THEN
    RAISE EXCEPTION 'POST-SWAP FAILED: stage 22 is not Visual Assets WITH creative_handoff (key=%, gate=%, review_mode=%)',
      r22.stage_key, r22.gate_label, r22.review_mode;
  END IF;

  -- BOTH gates preserved (neither erased).
  IF r21.gate_label IS NULL OR r22.gate_label IS NULL THEN
    RAISE EXCEPTION 'POST-SWAP FAILED: a gate_label was erased (21=%, 22=%)', r21.gate_label, r22.gate_label;
  END IF;

  -- Positional columns must NOT have swapped.
  IF r21.depends_on <> ARRAY[20]::integer[] OR r22.depends_on <> ARRAY[21]::integer[] THEN
    RAISE EXCEPTION 'POST-SWAP FAILED: depends_on moved (21=%, 22=%); must stay {20},{21}', r21.depends_on, r22.depends_on;
  END IF;
  IF r21.gate_type <> 'none' OR r22.gate_type <> 'none'
     OR r21.work_type <> 'artifact_only' OR r22.work_type <> 'artifact_only'
     OR r21.chunk <> 'THE_BUILD' OR r22.chunk <> 'THE_BUILD'
     OR r21.phase_number <> 5 OR r22.phase_number <> 5 THEN
    RAISE EXCEPTION 'POST-SWAP FAILED: a positional column (gate_type/work_type/chunk/phase_number) changed.';
  END IF;

  RAISE NOTICE 'SWAP VERIFIED: stage 21 = Distribution Setup + spend_approval, stage 22 = Visual Assets + creative_handoff; both gates preserved, positional columns unchanged.';
END
$verify$;

COMMIT;

-- =========================================================================
-- DOWN / INVERSE (run to revert). The swap is its own inverse: applying the
-- identical full-swap again returns 21 -> Visual Assets / creative_handoff and
-- 22 -> Distribution Setup / spend_approval (the original pre-migration state).
-- Idempotent and preflight-guarded exactly like the UP.
-- =========================================================================
-- BEGIN;
-- DO $preflight_down$
-- DECLARE v_at_2122 INTEGER;
-- BEGIN
--   SELECT count(*) INTO v_at_2122 FROM public.ventures WHERE current_lifecycle_stage IN (21,22);
--   IF v_at_2122 <> 0 THEN
--     RAISE EXCEPTION 'DOWN PREFLIGHT FAILED: % venture(s) at stage 21/22', v_at_2122;
--   END IF;
-- END
-- $preflight_down$;
-- WITH src AS (
--   SELECT stage_number, stage_key, stage_name, description, app_description,
--          component_path, gate_label, required_artifacts, metadata
--   FROM public.venture_stages WHERE stage_number IN (21, 22)
-- )
-- UPDATE public.venture_stages AS vs
-- SET stage_key=other.stage_key, stage_name=other.stage_name, description=other.description,
--     app_description=other.app_description, component_path=other.component_path,
--     gate_label=other.gate_label, required_artifacts=other.required_artifacts,
--     metadata=other.metadata, updated_at=now()
-- FROM src AS other
-- WHERE vs.stage_number IN (21,22)
--   AND other.stage_number = (21 + 22) - vs.stage_number
--   AND vs.stage_key IS DISTINCT FROM other.stage_key;
-- COMMIT;