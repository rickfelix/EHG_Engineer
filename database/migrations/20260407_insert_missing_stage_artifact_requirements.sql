-- Migration: Insert 3 missing rows into stage_artifact_requirements
-- These rows were omitted during the original seed and cause Stage 2, 19, 20
-- to fail for all new ventures because the artifact gate finds no requirements.
--
-- Source of truth: lifecycle_stage_config.required_artifacts
--   Stage 2  "AI Review"       -> ["truth_ai_critique"]
--   Stage 19 "Sprint Planning" -> ["blueprint_sprint_plan"]
--   Stage 20 "Build Execution" -> ["build_mvp_build"]

INSERT INTO stage_artifact_requirements (stage_number, artifact_type, required_status, is_blocking)
VALUES
  (2,  'truth_ai_critique',      'completed', true),
  (19, 'blueprint_sprint_plan',  'completed', true),
  (20, 'build_mvp_build',        'completed', true)
ON CONFLICT (stage_number, artifact_type) DO NOTHING;

-- Rollback:
-- DELETE FROM stage_artifact_requirements
-- WHERE (stage_number, artifact_type) IN (
--   (2,  'truth_ai_critique'),
--   (19, 'blueprint_sprint_plan'),
--   (20, 'build_mvp_build')
-- );
