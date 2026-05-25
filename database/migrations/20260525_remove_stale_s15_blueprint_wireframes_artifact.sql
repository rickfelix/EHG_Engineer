-- SD-FDBK-FIX-FIX-STALE-HARNESS-001 (part a)
-- Remove the stale pre-Stitch 'blueprint_wireframes' artifact from Stage 15 (Design Studio)
-- lifecycle_stage_config.required_artifacts.
--
-- The Google-Stitch replacement (SD-LEO-ORCH-REPLACE-GOOGLE-STITCH-001) now emits
-- 'wireframe_screens' (already present in the array), so 'blueprint_wireframes' is dead
-- and was causing scripts/monitor-venture-run.cjs (loadExpectedArtifactsByStage reads this
-- DB-authoritative column) to false-flag "S15 missing_artifact: blueprint_wireframes" on
-- every venture run (observed live on venture 0e6449d9, 2026-05-24).
--
-- Surgical + idempotent: array_remove is a no-op if the element is already gone; the
-- ANY() guard keeps the UPDATE from touching rows that don't need it. 'wireframe_screens'
-- is retained.
UPDATE lifecycle_stage_config
SET required_artifacts = array_remove(required_artifacts, 'blueprint_wireframes'),
    updated_at = NOW()
WHERE stage_number = 15
  AND 'blueprint_wireframes' = ANY(required_artifacts);
