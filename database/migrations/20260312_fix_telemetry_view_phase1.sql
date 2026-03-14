-- Migration: Fix Telemetry View for Phase 1 Baseline Data
-- SD: SD-CLOSE-EXPERIMENT-FEEDBACK-LOOP-ORCH-001 (activation)
-- Created: 2026-03-12
-- Purpose: Replace experiment-only telemetry view with UNION view that
--          serves both Phase 1 (baseline from evaluation_profile_outcomes)
--          and Phase 3 (experiment A/B data from experiment_outcomes).

-- ============================================================
-- 1. Drop and recreate materialized view
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS stage_zero_experiment_telemetry;

CREATE MATERIALIZED VIEW stage_zero_experiment_telemetry AS

-- Phase 1: Baseline data from gate signal recording (pre-experiment)
SELECT
  NULL::UUID AS experiment_id,
  epo.venture_id,
  'baseline'::TEXT AS variant_key,
  COALESCE(
    (szr.result->>'venture_score')::NUMERIC,
    (epo.outcome->>'score')::NUMERIC
  ) AS synthesis_score,
  CASE
    WHEN epo.gate_boundary IN ('stage_3', '2->3') THEN 3
    WHEN epo.gate_boundary IN ('stage_5', '5->6') THEN 5
    WHEN epo.gate_boundary IN ('stage_13', '12->13') THEN 13
    WHEN epo.gate_boundary IN ('stage_23', '22->23') THEN 23
  END AS kill_gate_stage,
  (epo.signal_type = 'pass') AS gate_passed,
  (epo.outcome->>'score')::NUMERIC AS gate_score,
  NULL::JSONB AS dimension_scores,
  EXTRACT(EPOCH FROM (epo.evaluated_at - szr.completed_at)) / 3600 AS time_to_gate_hours
FROM evaluation_profile_outcomes epo
JOIN ventures v ON v.id = epo.venture_id
LEFT JOIN stage_zero_requests szr ON szr.venture_id = v.id AND szr.status = 'completed'
WHERE epo.gate_boundary IN ('stage_3', 'stage_5', 'stage_13', 'stage_23', '2->3', '5->6', '12->13', '22->23')

UNION ALL

-- Phase 3: Experiment data from A/B testing
SELECT
  ea.experiment_id,
  ea.venture_id,
  ea.variant_key,
  (eo_synth.scores->>'venture_score')::NUMERIC AS synthesis_score,
  eo_gate.kill_gate_stage,
  eo_gate.gate_passed,
  eo_gate.gate_score,
  NULL::JSONB AS dimension_scores,
  eo_gate.time_to_gate_hours
FROM experiment_assignments ea
INNER JOIN experiment_outcomes eo_gate
  ON ea.experiment_id = eo_gate.experiment_id
  AND ea.id = eo_gate.assignment_id
  AND eo_gate.outcome_type = 'gate_survival'
LEFT JOIN experiment_outcomes eo_synth
  ON ea.experiment_id = eo_synth.experiment_id
  AND ea.id = eo_synth.assignment_id
  AND eo_synth.outcome_type = 'synthesis';

-- ============================================================
-- 2. Unique index for REFRESH MATERIALIZED VIEW CONCURRENTLY
--    Composite key: venture_id + kill_gate_stage + COALESCE(experiment_id)
--    ensures uniqueness across both UNION halves
-- ============================================================

CREATE UNIQUE INDEX idx_szet_venture_gate_experiment
  ON stage_zero_experiment_telemetry (venture_id, kill_gate_stage, COALESCE(experiment_id, '00000000-0000-0000-0000-000000000000'::UUID));

CREATE INDEX IF NOT EXISTS idx_szet_venture
  ON stage_zero_experiment_telemetry (venture_id);

CREATE INDEX IF NOT EXISTS idx_szet_variant
  ON stage_zero_experiment_telemetry (variant_key);

COMMENT ON MATERIALIZED VIEW stage_zero_experiment_telemetry IS
  'Unified telemetry: Phase 1 baseline (evaluation_profile_outcomes) + Phase 3 experiment (experiment_outcomes) for calibration analysis';

-- ============================================================
-- Rollback SQL (if needed):
-- ============================================================
-- DROP MATERIALIZED VIEW IF EXISTS stage_zero_experiment_telemetry;
-- Then re-run 20260311_experiment_feedback_loop.sql to restore original view
