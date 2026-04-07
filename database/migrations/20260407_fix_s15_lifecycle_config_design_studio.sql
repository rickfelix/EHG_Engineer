-- Migration: Fix S15 lifecycle_stage_config for Design Studio rename
-- SD: SD-S15-RESTRUCTURE-EXTENTOFCONDITION-LIFECYCLE-ORCH-001-A
-- Context: PRs #2798/#2799 moved risk register to S14 and rewrote stage-15.js as Design Studio.
--          But lifecycle_stage_config still has stale sd_suffix='STORIES' and
--          required_artifacts=['blueprint_risk_register'] from the old structure.

UPDATE lifecycle_stage_config
SET
  sd_suffix = NULL,
  required_artifacts = ARRAY['blueprint_wireframes']::text[],
  description = 'Design Studio: wireframe generation, visual convergence, and design materialization. Translates technical architecture into visual design artifacts.',
  updated_at = NOW()
WHERE stage_number = 15;
