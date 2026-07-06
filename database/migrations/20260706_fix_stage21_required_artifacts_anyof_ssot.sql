-- @approved-by: codestreetlabs@gmail.com
--
-- 20260706_fix_stage21_required_artifacts_anyof_ssot.sql
-- SD-LEO-INFRA-ACTIVATE-DORMANT-EXIT-001 (adversarial-review fix)
--
-- QF-20260703-439 (commit 672ec31da5) fixed stage 21's requiredArtifacts shape from a flat
-- AND list to { anyOf: [distribution_channel_config, distribution_ad_copy] } DIRECTLY in the
-- GENERATED file lib/proving-companion/stage-config.js, but venture_stages.required_artifacts
-- is a `text[]` column -- it cannot hold a nested object, so that fix could never be persisted
-- to the SSOT the file is generated FROM. This SD's own migration
-- (20260706_activate_dormant_exit_gates_observe_only.sql) triggered a full regeneration of
-- stage-config.js, which SILENTLY REVERTED the fix, reintroducing the exact false-escalation
-- bug QF-20260703-439 fixed for chairman-ratified organic-only ventures (e.g. MarketLens,
-- decision 08547ee8, which legitimately never produces the paid-ads-only
-- distribution_ad_copy artifact). Caught by tests/unit/proving-companion/artifact-integrity-anyof.test.js
-- going red on PR #5701's regeneration commit (adversarial review).
--
-- Fix: write the anyOf shape into venture_stages.metadata.required_artifacts_override (a
-- flexible jsonb column, unlike required_artifacts) for stage 21 only. The companion generator
-- change (scripts/generate-stage-config.cjs::getRequiredArtifacts) reads this override first,
-- falling back to the existing required_artifacts column for every other stage -- mirroring
-- the same metadata-override pattern already used by getArchPhases() in that file. This does
-- NOT touch the required_artifacts column value itself, so none of the ~30 other consumers of
-- venture_stages.required_artifacts (stage-artifact-precondition.js, reality-gates.js,
-- eva-orchestrator.js, etc.) are affected -- only the generated stage-config.js output changes.
--
-- Additive/idempotent: only adds a new metadata key for stage 21; the WHERE guard makes a
-- re-run a no-op.
--
-- Rollback: UPDATE venture_stages SET metadata = metadata - 'required_artifacts_override'
--   WHERE stage_number = 21;
-- (NOT recommended -- this restores the false-escalation bug QF-20260703-439 fixed.)

BEGIN;

UPDATE venture_stages
SET metadata = jsonb_set(
      metadata,
      '{required_artifacts_override}',
      '[{"anyOf": ["distribution_channel_config", "distribution_ad_copy"]}]'::jsonb
    ),
    updated_at = now()
WHERE stage_number = 21
  AND (metadata->'required_artifacts_override') IS NULL;

COMMIT;
