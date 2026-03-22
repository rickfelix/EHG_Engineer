-- Migration: Stage Renumbering + Blueprint Review Gate (Stage 17)
-- SD: SD-LEO-INFRA-STAGE-BLUEPRINT-REVIEW-001
--
-- Shifts existing stages 17-25 to 18-26 and inserts new stage 17 (Blueprint Review).
-- Processes in DESCENDING order to avoid unique constraint violations.
-- Idempotent: safe to run multiple times.
--
-- Tables affected:
--   - lifecycle_stage_config (stage definitions)
--   - venture_artifacts (venture data)
--   - venture_stage_transitions (transition history)
--   - stage_proving_journal (proving companion journal)

BEGIN;

-- ============================================================================
-- STEP 1: Shift lifecycle_stage_config (stage 25 → 26, 24 → 25, ..., 17 → 18)
-- ============================================================================
-- Only shift if stage 26 doesn't already exist (idempotent check)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lifecycle_stage_config WHERE stage_number = 26) THEN
    -- Process in descending order to avoid unique constraint on stage_number
    UPDATE lifecycle_stage_config SET stage_number = 26 WHERE stage_number = 25;
    UPDATE lifecycle_stage_config SET stage_number = 25 WHERE stage_number = 24;
    UPDATE lifecycle_stage_config SET stage_number = 24 WHERE stage_number = 23;
    UPDATE lifecycle_stage_config SET stage_number = 23 WHERE stage_number = 22;
    UPDATE lifecycle_stage_config SET stage_number = 22 WHERE stage_number = 21;
    UPDATE lifecycle_stage_config SET stage_number = 21 WHERE stage_number = 20;
    UPDATE lifecycle_stage_config SET stage_number = 20 WHERE stage_number = 19;
    UPDATE lifecycle_stage_config SET stage_number = 19 WHERE stage_number = 18;
    UPDATE lifecycle_stage_config SET stage_number = 18 WHERE stage_number = 17;

    -- Insert new stage 17: Blueprint Review Gate
    INSERT INTO lifecycle_stage_config (
      stage_number, stage_name, phase_number, phase_name,
      work_type, sd_required, advisory_enabled,
      required_artifacts, metadata
    ) VALUES (
      17,
      'Blueprint Review',
      4,
      'THE_BLUEPRINT',
      'decision_gate',
      false,
      false,
      ARRAY['blueprint_review_summary']::text[],
      jsonb_build_object(
        'gate_type', 'promotion',
        'threshold', 70,
        'description', 'Aggregates all artifacts from stages 1-16, computes quality scores, identifies gaps, and produces gate recommendation before BUILD phase.'
      )
    );

    RAISE NOTICE 'Stage renumbering complete: stages 17-25 shifted to 18-26, new stage 17 inserted';
  ELSE
    RAISE NOTICE 'Stage renumbering already applied (stage 26 exists), skipping';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Shift venture_artifacts.lifecycle_stage (descending order)
-- ============================================================================
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Only shift if there are records at stage 17-25 that haven't been shifted
  -- (idempotent: if stage 26 records already exist, assume shift is done)
  IF NOT EXISTS (
    SELECT 1 FROM venture_artifacts WHERE lifecycle_stage = 26 LIMIT 1
  ) AND EXISTS (
    SELECT 1 FROM venture_artifacts WHERE lifecycle_stage = 25 LIMIT 1
  ) THEN
    UPDATE venture_artifacts SET lifecycle_stage = lifecycle_stage + 1
    WHERE lifecycle_stage >= 17 AND lifecycle_stage <= 25;
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RAISE NOTICE 'Shifted % venture_artifacts records (stages 17-25 → 18-26)', affected_count;
  ELSE
    RAISE NOTICE 'venture_artifacts shift already applied or no records to shift';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Shift venture_stage_transitions.stage_number (descending order)
-- ============================================================================
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM venture_stage_transitions WHERE stage_number = 26 LIMIT 1
  ) AND EXISTS (
    SELECT 1 FROM venture_stage_transitions WHERE stage_number = 25 LIMIT 1
  ) THEN
    UPDATE venture_stage_transitions SET stage_number = stage_number + 1
    WHERE stage_number >= 17 AND stage_number <= 25;
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RAISE NOTICE 'Shifted % venture_stage_transitions records', affected_count;
  ELSE
    RAISE NOTICE 'venture_stage_transitions shift already applied or no records to shift';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Shift stage_proving_journal.stage_number (descending order)
-- ============================================================================
DO $$
DECLARE
  affected_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stage_proving_journal WHERE stage_number = 26 LIMIT 1
  ) AND EXISTS (
    SELECT 1 FROM stage_proving_journal WHERE stage_number = 25 LIMIT 1
  ) THEN
    UPDATE stage_proving_journal SET stage_number = stage_number + 1
    WHERE stage_number >= 17 AND stage_number <= 25;
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RAISE NOTICE 'Shifted % stage_proving_journal records', affected_count;
  ELSE
    RAISE NOTICE 'stage_proving_journal shift already applied or no records to shift';
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Update check constraints for max stage number (25 → 26)
-- ============================================================================
DO $$
BEGIN
  -- Update stage_proving_journal check constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'stage_proving_journal_stage_number_check'
  ) THEN
    ALTER TABLE stage_proving_journal DROP CONSTRAINT stage_proving_journal_stage_number_check;
    ALTER TABLE stage_proving_journal ADD CONSTRAINT stage_proving_journal_stage_number_check
      CHECK (stage_number >= 1 AND stage_number <= 26);
    RAISE NOTICE 'Updated stage_proving_journal check constraint to max 26';
  END IF;
END $$;

COMMIT;
