-- Migration: Add assumptions_vs_reality_report to Stage 25 required artifacts
-- SD: SD-VISION-TRANSITION-001D6
-- Purpose: Stage 25 (Optimization & Scale) should capture Golden Nuggets calibration
--          by comparing initial assumptions against reality after launch
-- Impact: Enables learning loop and epistemic calibration tracking

-- Update Stage 25 to include assumptions_vs_reality_report
UPDATE lifecycle_stage_config
SET
  required_artifacts = ARRAY['optimization_roadmap', 'assumptions_vs_reality_report'],
  description = 'Optimize and scale the venture based on real-world feedback. Calibrate initial assumptions against reality to improve future predictions (Golden Nuggets).',
  updated_at = NOW()
WHERE stage_number = 25;

-- Verify the change
SELECT
  stage_number,
  stage_name,
  required_artifacts,
  description
FROM lifecycle_stage_config
WHERE stage_number = 25;
