-- ============================================================================
-- Update all CHECK constraints from max 25 to max 26 for 26-stage lifecycle
-- ============================================================================
-- SD: SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001
--
-- 10 constraints updated across 7 tables:
--   ventures, eva_ventures, compliance_events, compliance_violations,
--   eva_artifact_dependencies (2), eva_stage_gate_results,
--   stage_of_death_predictions (2), venture_dependencies
-- ============================================================================

-- 1. ventures
ALTER TABLE ventures DROP CONSTRAINT IF EXISTS ventures_current_lifecycle_stage_check;
ALTER TABLE ventures ADD CONSTRAINT ventures_current_lifecycle_stage_check
  CHECK (current_lifecycle_stage BETWEEN 1 AND 26);

-- 2. eva_ventures
ALTER TABLE eva_ventures DROP CONSTRAINT IF EXISTS chk_lifecycle_stage;
ALTER TABLE eva_ventures ADD CONSTRAINT chk_lifecycle_stage
  CHECK (current_lifecycle_stage BETWEEN 1 AND 26);

-- 3. compliance_events
ALTER TABLE compliance_events DROP CONSTRAINT IF EXISTS compliance_events_stage_number_check;
ALTER TABLE compliance_events ADD CONSTRAINT compliance_events_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 26);

-- 4. compliance_violations
ALTER TABLE compliance_violations DROP CONSTRAINT IF EXISTS compliance_violations_stage_number_check;
ALTER TABLE compliance_violations ADD CONSTRAINT compliance_violations_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 26);

-- 5. eva_artifact_dependencies (source + target)
ALTER TABLE eva_artifact_dependencies DROP CONSTRAINT IF EXISTS eva_artifact_dependencies_source_stage_check;
ALTER TABLE eva_artifact_dependencies ADD CONSTRAINT eva_artifact_dependencies_source_stage_check
  CHECK (source_stage BETWEEN 1 AND 26);

ALTER TABLE eva_artifact_dependencies DROP CONSTRAINT IF EXISTS eva_artifact_dependencies_target_stage_check;
ALTER TABLE eva_artifact_dependencies ADD CONSTRAINT eva_artifact_dependencies_target_stage_check
  CHECK (target_stage BETWEEN 1 AND 26);

-- 6. eva_stage_gate_results
ALTER TABLE eva_stage_gate_results DROP CONSTRAINT IF EXISTS eva_stage_gate_results_stage_number_check;
ALTER TABLE eva_stage_gate_results ADD CONSTRAINT eva_stage_gate_results_stage_number_check
  CHECK (stage_number BETWEEN 1 AND 26);

-- 7. stage_of_death_predictions (predicted + actual)
ALTER TABLE stage_of_death_predictions DROP CONSTRAINT IF EXISTS stage_of_death_predictions_predicted_death_stage_check;
ALTER TABLE stage_of_death_predictions ADD CONSTRAINT stage_of_death_predictions_predicted_death_stage_check
  CHECK (predicted_death_stage BETWEEN 1 AND 26);

ALTER TABLE stage_of_death_predictions DROP CONSTRAINT IF EXISTS stage_of_death_predictions_actual_death_stage_check;
ALTER TABLE stage_of_death_predictions ADD CONSTRAINT stage_of_death_predictions_actual_death_stage_check
  CHECK (actual_death_stage IS NULL OR actual_death_stage BETWEEN 1 AND 26);

-- 8. venture_dependencies
ALTER TABLE venture_dependencies DROP CONSTRAINT IF EXISTS venture_dependencies_required_stage_check;
ALTER TABLE venture_dependencies ADD CONSTRAINT venture_dependencies_required_stage_check
  CHECK (required_stage BETWEEN 1 AND 26);
