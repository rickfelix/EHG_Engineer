-- SD-STAGE-ZERO-EXPERIMENTATION-FRAMEWORK-ORCH-001-A: Phase 1 Telemetry View
-- Creates materialized view joining gate outcomes with death predictions
-- for experiment analysis.

-- Drop existing view if exists (idempotent)
DROP MATERIALIZED VIEW IF EXISTS stage_zero_experiment_telemetry;

CREATE MATERIALIZED VIEW stage_zero_experiment_telemetry AS
SELECT
  epo.id AS outcome_id,
  epo.venture_id,
  epo.profile_id,
  epo.gate_boundary,
  epo.signal_type AS actual_outcome,
  epo.outcome AS outcome_details,
  epo.evaluated_at,
  sod.predicted_death_stage,
  sod.predicted_probability,
  sod.confidence_score,
  sod.archetype_key,
  sod.actual_death_stage,
  -- Score delta: difference between predicted and actual death stage (NULL if no actual)
  CASE
    WHEN sod.actual_death_stage IS NOT NULL AND sod.predicted_death_stage IS NOT NULL
    THEN sod.actual_death_stage - sod.predicted_death_stage
    ELSE NULL
  END AS score_delta
FROM evaluation_profile_outcomes epo
LEFT JOIN stage_of_death_predictions sod
  ON epo.venture_id = sod.venture_id
  AND epo.profile_id = sod.profile_id
ORDER BY epo.evaluated_at DESC;

-- UNIQUE index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_szet_outcome_id
  ON stage_zero_experiment_telemetry (outcome_id);

-- Additional indexes for query performance
CREATE INDEX IF NOT EXISTS idx_szet_venture_id
  ON stage_zero_experiment_telemetry (venture_id);

CREATE INDEX IF NOT EXISTS idx_szet_gate_boundary
  ON stage_zero_experiment_telemetry (gate_boundary);
