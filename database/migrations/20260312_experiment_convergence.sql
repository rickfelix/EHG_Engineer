-- Migration: Experiment Convergence Criteria + Auto-Trigger
-- SD: SD-CLOSE-EXPERIMENT-FEEDBACK-LOOP-ORCH-001-A
-- Created: 2026-03-12
-- Purpose: Add convergence criteria columns to experiments table,
--          create DB trigger on experiment_outcomes for auto-advancement,
--          and add check_experiment_convergence RPC function.

-- ============================================================
-- 1. ALTER experiments: add convergence criteria columns
-- ============================================================

ALTER TABLE experiments
  ADD COLUMN IF NOT EXISTS min_observations_per_variant INTEGER DEFAULT 20,
  ADD COLUMN IF NOT EXISTS convergence_threshold NUMERIC DEFAULT 0.85,
  ADD COLUMN IF NOT EXISTS maturity_hours INTEGER DEFAULT 48,
  ADD COLUMN IF NOT EXISTS survival_metric TEXT DEFAULT 'binary_per_gate';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'experiments_survival_metric_check'
      AND conrelid = 'experiments'::regclass
  ) THEN
    ALTER TABLE experiments
      ADD CONSTRAINT experiments_survival_metric_check
      CHECK (survival_metric IN ('binary_per_gate', 'composite', 'weighted'));
  END IF;
END $$;

COMMENT ON COLUMN experiments.min_observations_per_variant IS 'Minimum gate outcomes per variant before declaring a winner';
COMMENT ON COLUMN experiments.convergence_threshold IS 'P(variant > control) threshold for stopping (default 0.85)';
COMMENT ON COLUMN experiments.maturity_hours IS 'Minimum hours after experiment creation before stopping allowed';
COMMENT ON COLUMN experiments.survival_metric IS 'How survival is measured: binary_per_gate (pass/fail), composite (2-of-3), weighted (stage-weighted)';

-- ============================================================
-- 2. Trigger: auto-notify on gate survival outcome insert
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_experiment_advancement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.outcome_type = 'gate_survival' THEN
    -- Refresh telemetry view (CONCURRENTLY to avoid locks)
    BEGIN
      REFRESH MATERIALIZED VIEW CONCURRENTLY stage_zero_experiment_telemetry;
    EXCEPTION WHEN OTHERS THEN
      -- Non-blocking: if refresh fails, notification still fires
      RAISE WARNING 'Telemetry view refresh failed: %', SQLERRM;
    END;

    -- Notify application layer for experiment advancement check
    PERFORM pg_notify('experiment_gate_outcome', json_build_object(
      'assignment_id', NEW.assignment_id,
      'experiment_id', NEW.experiment_id,
      'kill_gate_stage', NEW.kill_gate_stage,
      'gate_passed', NEW.gate_passed
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_experiment_advancement ON experiment_outcomes;

CREATE TRIGGER trg_experiment_advancement
  AFTER INSERT ON experiment_outcomes
  FOR EACH ROW
  EXECUTE FUNCTION trigger_experiment_advancement();

COMMENT ON FUNCTION trigger_experiment_advancement IS
  'Auto-fires pg_notify on gate_survival outcome insert to trigger experiment advancement checks';

-- ============================================================
-- 3. RPC: check_experiment_convergence
-- ============================================================

CREATE OR REPLACE FUNCTION check_experiment_convergence(
  p_experiment_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_experiment RECORD;
  v_min_count INTEGER;
  v_variant_counts JSONB;
BEGIN
  SELECT * INTO v_experiment FROM experiments WHERE id = p_experiment_id;
  IF v_experiment IS NULL THEN
    RETURN jsonb_build_object('converged', false, 'reason', 'experiment_not_found');
  END IF;

  -- Count observations per variant
  SELECT jsonb_object_agg(variant_key, cnt) INTO v_variant_counts
  FROM (
    SELECT ea.variant_key, COUNT(DISTINCT eo.id) AS cnt
    FROM experiment_assignments ea
    JOIN experiment_outcomes eo ON eo.assignment_id = ea.id AND eo.outcome_type = 'gate_survival'
    WHERE ea.experiment_id = p_experiment_id
    GROUP BY ea.variant_key
  ) sub;

  IF v_variant_counts IS NULL THEN
    RETURN jsonb_build_object(
      'converged', false,
      'reason', 'no_observations',
      'min_observations', 0,
      'required', v_experiment.min_observations_per_variant
    );
  END IF;

  -- Check minimum observations per variant
  SELECT MIN(value::int) INTO v_min_count FROM jsonb_each_text(v_variant_counts);

  RETURN jsonb_build_object(
    'converged', v_min_count >= v_experiment.min_observations_per_variant,
    'min_observations', v_min_count,
    'required', v_experiment.min_observations_per_variant,
    'variant_counts', v_variant_counts,
    'maturity_met', EXTRACT(EPOCH FROM (NOW() - v_experiment.created_at)) / 3600 >= v_experiment.maturity_hours,
    'hours_elapsed', ROUND((EXTRACT(EPOCH FROM (NOW() - v_experiment.created_at)) / 3600)::NUMERIC, 1),
    'maturity_hours_required', v_experiment.maturity_hours
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION check_experiment_convergence IS
  'Check if an experiment has met its convergence criteria (min observations + maturity time)';

-- ============================================================
-- Rollback SQL (if needed):
-- ============================================================
-- DROP FUNCTION IF EXISTS check_experiment_convergence;
-- DROP TRIGGER IF EXISTS trg_experiment_advancement ON experiment_outcomes;
-- DROP FUNCTION IF EXISTS trigger_experiment_advancement;
-- ALTER TABLE experiments DROP CONSTRAINT IF EXISTS experiments_survival_metric_check;
-- ALTER TABLE experiments DROP COLUMN IF EXISTS survival_metric;
-- ALTER TABLE experiments DROP COLUMN IF EXISTS maturity_hours;
-- ALTER TABLE experiments DROP COLUMN IF EXISTS convergence_threshold;
-- ALTER TABLE experiments DROP COLUMN IF EXISTS min_observations_per_variant;
