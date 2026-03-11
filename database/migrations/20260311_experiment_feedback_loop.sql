-- Migration: Experiment Feedback Loop - Gate Survival Tracking
-- SD: SD-LEO-FEAT-EXPERIMENT-FEEDBACK-LOOP-001
-- Created: 2026-03-11
-- Purpose: Extend experiment_outcomes with kill-gate survival data,
--          create a materialized telemetry view for experiment analysis,
--          and add a convenience function for recording gate outcomes.

-- ============================================================
-- 1. ALTER experiment_outcomes: add gate-survival columns
-- ============================================================

ALTER TABLE experiment_outcomes
  ADD COLUMN IF NOT EXISTS experiment_id UUID REFERENCES experiments(id),
  ADD COLUMN IF NOT EXISTS kill_gate_stage INTEGER,
  ADD COLUMN IF NOT EXISTS gate_passed BOOLEAN,
  ADD COLUMN IF NOT EXISTS gate_score NUMERIC,
  ADD COLUMN IF NOT EXISTS chairman_override BOOLEAN,
  ADD COLUMN IF NOT EXISTS time_to_gate_hours NUMERIC,
  ADD COLUMN IF NOT EXISTS outcome_type TEXT DEFAULT 'synthesis';

-- Add CHECK constraints separately (IF NOT EXISTS not supported for constraints,
-- so we use DO blocks for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'experiment_outcomes_kill_gate_stage_check'
      AND conrelid = 'experiment_outcomes'::regclass
  ) THEN
    ALTER TABLE experiment_outcomes
      ADD CONSTRAINT experiment_outcomes_kill_gate_stage_check
      CHECK (kill_gate_stage IN (3, 5, 13));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'experiment_outcomes_outcome_type_check'
      AND conrelid = 'experiment_outcomes'::regclass
  ) THEN
    ALTER TABLE experiment_outcomes
      ADD CONSTRAINT experiment_outcomes_outcome_type_check
      CHECK (outcome_type IN ('synthesis', 'gate_survival'));
  END IF;
END $$;

COMMENT ON COLUMN experiment_outcomes.experiment_id IS 'Denormalized experiment reference for partial unique index on gate outcomes';
COMMENT ON COLUMN experiment_outcomes.kill_gate_stage IS 'Kill gate stage number (3, 5, or 13) where survival was evaluated';
COMMENT ON COLUMN experiment_outcomes.gate_passed IS 'Whether the venture survived this kill gate';
COMMENT ON COLUMN experiment_outcomes.gate_score IS 'Numeric score at the kill gate (e.g., composite gate score)';
COMMENT ON COLUMN experiment_outcomes.chairman_override IS 'Whether the chairman overrode the gate decision';
COMMENT ON COLUMN experiment_outcomes.time_to_gate_hours IS 'Elapsed hours from experiment assignment to gate evaluation';
COMMENT ON COLUMN experiment_outcomes.outcome_type IS 'Discriminator: synthesis (Stage 0 eval) vs gate_survival (kill gate result)';

-- Backfill experiment_id from assignment for existing rows
UPDATE experiment_outcomes eo
SET experiment_id = ea.experiment_id
FROM experiment_assignments ea
WHERE eo.assignment_id = ea.id
  AND eo.experiment_id IS NULL;

-- ============================================================
-- 2. Partial unique index: one gate_survival outcome per
--    experiment + assignment + kill gate stage
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_outcomes_gate_unique
  ON experiment_outcomes (experiment_id, assignment_id, kill_gate_stage)
  WHERE outcome_type = 'gate_survival';

-- Additional index for outcome_type filtering
CREATE INDEX IF NOT EXISTS idx_experiment_outcomes_outcome_type
  ON experiment_outcomes (outcome_type);

-- ============================================================
-- 3. Materialized view: stage_zero_experiment_telemetry
--    Joins experiment assignments with both synthesis and
--    gate_survival outcomes for unified analysis.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS stage_zero_experiment_telemetry;

CREATE MATERIALIZED VIEW stage_zero_experiment_telemetry AS
SELECT
  ea.experiment_id,
  ea.venture_id,
  ea.variant_key,
  (eo_synth.scores ->> 'venture_score')::NUMERIC AS synthesis_score,
  eo_gate.kill_gate_stage,
  eo_gate.gate_passed,
  eo_gate.gate_score,
  eo_gate.time_to_gate_hours
FROM experiment_assignments ea
INNER JOIN experiment_outcomes eo_gate
  ON ea.experiment_id = eo_gate.experiment_id
  AND ea.id = eo_gate.assignment_id
  AND eo_gate.outcome_type = 'gate_survival'
LEFT JOIN experiment_outcomes eo_synth
  ON ea.experiment_id = eo_synth.experiment_id
  AND ea.id = eo_synth.assignment_id
  AND eo_synth.outcome_type = 'synthesis'
ORDER BY ea.experiment_id, ea.venture_id, eo_gate.kill_gate_stage;

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_szet_experiment_venture_gate
  ON stage_zero_experiment_telemetry (experiment_id, venture_id, kill_gate_stage);

CREATE INDEX IF NOT EXISTS idx_szet_venture
  ON stage_zero_experiment_telemetry (venture_id);

CREATE INDEX IF NOT EXISTS idx_szet_variant
  ON stage_zero_experiment_telemetry (variant_key);

COMMENT ON MATERIALIZED VIEW stage_zero_experiment_telemetry IS
  'Unified telemetry joining experiment gate-survival outcomes with synthesis scores for A/B analysis';

-- ============================================================
-- 4. Function: record_experiment_gate_outcome
--    Records a kill-gate survival result for a venture in the
--    active experiment. Returns JSONB with the outcome or null.
-- ============================================================

CREATE OR REPLACE FUNCTION record_experiment_gate_outcome(
  p_venture_id UUID,
  p_kill_gate_stage INTEGER,
  p_gate_passed BOOLEAN,
  p_gate_score NUMERIC DEFAULT NULL,
  p_chairman_override BOOLEAN DEFAULT FALSE,
  p_time_to_gate_hours NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_experiment_id UUID;
  v_assignment_id UUID;
  v_variant_key TEXT;
  v_outcome_id UUID;
BEGIN
  -- Find the active (running) experiment
  SELECT id INTO v_experiment_id
  FROM experiments
  WHERE status = 'running'
  ORDER BY started_at DESC
  LIMIT 1;

  IF v_experiment_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'no_active_experiment'
    );
  END IF;

  -- Find the assignment for this venture in the active experiment
  SELECT id, variant_key
  INTO v_assignment_id, v_variant_key
  FROM experiment_assignments
  WHERE experiment_id = v_experiment_id
    AND venture_id = p_venture_id;

  IF v_assignment_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'reason', 'no_assignment_for_venture',
      'experiment_id', v_experiment_id::TEXT
    );
  END IF;

  -- Insert the gate survival outcome (partial unique index prevents duplicates)
  INSERT INTO experiment_outcomes (
    experiment_id,
    assignment_id,
    variant_key,
    outcome_type,
    kill_gate_stage,
    gate_passed,
    gate_score,
    chairman_override,
    time_to_gate_hours,
    scores,
    metadata
  ) VALUES (
    v_experiment_id,
    v_assignment_id,
    v_variant_key,
    'gate_survival',
    p_kill_gate_stage,
    p_gate_passed,
    p_gate_score,
    p_chairman_override,
    p_time_to_gate_hours,
    jsonb_build_object(
      'gate_score', p_gate_score,
      'gate_passed', p_gate_passed,
      'chairman_override', p_chairman_override
    ),
    jsonb_build_object(
      'kill_gate_stage', p_kill_gate_stage,
      'time_to_gate_hours', p_time_to_gate_hours,
      'recorded_at', now()::TEXT
    )
  )
  ON CONFLICT (experiment_id, assignment_id, kill_gate_stage)
    WHERE outcome_type = 'gate_survival'
  DO UPDATE SET
    gate_passed = EXCLUDED.gate_passed,
    gate_score = EXCLUDED.gate_score,
    chairman_override = EXCLUDED.chairman_override,
    time_to_gate_hours = EXCLUDED.time_to_gate_hours,
    scores = EXCLUDED.scores,
    metadata = EXCLUDED.metadata,
    evaluated_at = now()
  RETURNING id INTO v_outcome_id;

  RETURN jsonb_build_object(
    'success', true,
    'outcome_id', v_outcome_id::TEXT,
    'experiment_id', v_experiment_id::TEXT,
    'assignment_id', v_assignment_id::TEXT,
    'variant_key', v_variant_key,
    'kill_gate_stage', p_kill_gate_stage,
    'gate_passed', p_gate_passed
  );
END;
$$;

COMMENT ON FUNCTION record_experiment_gate_outcome IS
  'Records a kill-gate survival outcome for a venture in the active experiment. SECURITY INVOKER.';

-- ============================================================
-- Rollback SQL (if needed):
-- ============================================================
-- DROP FUNCTION IF EXISTS record_experiment_gate_outcome;
-- DROP MATERIALIZED VIEW IF EXISTS stage_zero_experiment_telemetry;
-- DROP INDEX IF EXISTS idx_experiment_outcomes_gate_unique;
-- DROP INDEX IF EXISTS idx_experiment_outcomes_outcome_type;
-- ALTER TABLE experiment_outcomes DROP CONSTRAINT IF EXISTS experiment_outcomes_outcome_type_check;
-- ALTER TABLE experiment_outcomes DROP CONSTRAINT IF EXISTS experiment_outcomes_kill_gate_stage_check;
-- ALTER TABLE experiment_outcomes DROP COLUMN IF EXISTS outcome_type;
-- ALTER TABLE experiment_outcomes DROP COLUMN IF EXISTS time_to_gate_hours;
-- ALTER TABLE experiment_outcomes DROP COLUMN IF EXISTS chairman_override;
-- ALTER TABLE experiment_outcomes DROP COLUMN IF EXISTS gate_score;
-- ALTER TABLE experiment_outcomes DROP COLUMN IF EXISTS gate_passed;
-- ALTER TABLE experiment_outcomes DROP COLUMN IF EXISTS kill_gate_stage;
-- ALTER TABLE experiment_outcomes DROP COLUMN IF EXISTS experiment_id;
