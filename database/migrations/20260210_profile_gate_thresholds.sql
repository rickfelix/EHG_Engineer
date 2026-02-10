-- Migration: Profile-Aware Gate Thresholds
-- SD: SD-LEO-ORCH-EVA-STAGE-CONFIGURABLE-001-C
-- Purpose: Add gate_thresholds JSONB column to evaluation_profiles
--          for profile-specific reality gate threshold overrides

-- Add gate_thresholds column
ALTER TABLE evaluation_profiles
  ADD COLUMN IF NOT EXISTS gate_thresholds JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN evaluation_profiles.gate_thresholds IS
  'Profile-specific reality gate threshold overrides. Keyed by boundary (e.g. "5->6"), each containing artifact_type → min_quality_score overrides.';

-- Update seed profiles with profile-appropriate thresholds

-- balanced: no overrides (uses legacy defaults)
UPDATE evaluation_profiles
SET gate_thresholds = '{}'::jsonb
WHERE name = 'balanced' AND version = 1;

-- aggressive_growth: lower early-stage quality bars, higher virality expectations
UPDATE evaluation_profiles
SET gate_thresholds = '{
  "5->6": {
    "problem_statement": 0.5,
    "target_market_analysis": 0.4,
    "value_proposition": 0.5
  },
  "9->10": {
    "customer_interviews": 0.4,
    "competitive_analysis": 0.4,
    "pricing_model": 0.5
  }
}'::jsonb
WHERE name = 'aggressive_growth' AND version = 1;

-- capital_efficient: higher quality bars, stricter build/launch thresholds
UPDATE evaluation_profiles
SET gate_thresholds = '{
  "12->13": {
    "business_model_canvas": 0.8,
    "technical_architecture": 0.7,
    "project_plan": 0.6
  },
  "16->17": {
    "mvp_build": 0.8,
    "test_coverage_report": 0.7,
    "deployment_runbook": 0.6
  }
}'::jsonb
WHERE name = 'capital_efficient' AND version = 1;
