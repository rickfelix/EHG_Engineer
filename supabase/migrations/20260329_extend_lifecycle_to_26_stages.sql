-- ============================================================================
-- Extend lifecycle stage range from 25 to 26
-- ============================================================================
-- Problem: The pipeline now has 26 stages (0-26) but two DB constraints
-- still cap at 25:
--   1. fn_validate_stage_column trigger on ventures (raises exception at >25)
--   2. CHECK constraint on eva_ventures.current_lifecycle_stage (BETWEEN 1 AND 25)
--   3. fn_bootstrap_venture_stages creates rows for stages 1..25 only
--
-- Stage 26 is Launch Execution (pipeline terminus). Without this fix,
-- advance_venture_stage(25→26) fails with:
--   "current_lifecycle_stage must be between 1 and 25, got 26"
--
-- Created: 2026-03-29
-- ============================================================================

-- Step 1: Update the trigger function to allow stage 26
CREATE OR REPLACE FUNCTION public.fn_validate_stage_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.current_lifecycle_stage IS NULL THEN
    NEW.current_lifecycle_stage := 1;
  END IF;

  -- Validate stage range (1-26 for 26-stage lifecycle)
  IF NEW.current_lifecycle_stage < 1 OR NEW.current_lifecycle_stage > 26 THEN
    RAISE EXCEPTION 'current_lifecycle_stage must be between 1 and 26, got %',
      NEW.current_lifecycle_stage;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_validate_stage_column IS
  'Validates current_lifecycle_stage is within valid range (1-26). '
  'Updated 2026-03-29 to include stage 26 (launch execution / pipeline terminus).';

-- Step 2: Drop and re-add the CHECK constraint on eva_ventures
ALTER TABLE eva_ventures
  DROP CONSTRAINT IF EXISTS eva_ventures_current_lifecycle_stage_check;

ALTER TABLE eva_ventures
  ADD CONSTRAINT eva_ventures_current_lifecycle_stage_check
  CHECK (current_lifecycle_stage BETWEEN 1 AND 26);

-- Step 3: Update bootstrap function to create stage 26 rows
CREATE OR REPLACE FUNCTION fn_bootstrap_venture_stages(p_venture_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_venture RECORD;
  v_stage INTEGER;
  v_work_type TEXT;
  v_tier_max INTEGER;
  v_gate_stages INTEGER[] := ARRAY[3, 5, 13, 16, 17, 22, 23, 24];
BEGIN
  SELECT * INTO v_venture FROM ventures WHERE id = p_venture_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venture % not found', p_venture_id;
  END IF;

  v_tier_max := CASE v_venture.tier
    WHEN 0 THEN 3
    WHEN 1 THEN 10
    WHEN 2 THEN 15
    ELSE 26
  END;

  -- Create venture_stage_work rows for ALL 26 stages
  FOR v_stage IN 1..26 LOOP
    IF v_stage = ANY(v_gate_stages) THEN
      v_work_type := 'decision_gate';
    ELSIF v_stage = 2 THEN
      v_work_type := 'automated_check';
    ELSE
      v_work_type := 'artifact_only';
    END IF;

    INSERT INTO venture_stage_work (
      venture_id,
      lifecycle_stage,
      stage_status,
      work_type,
      started_at
    ) VALUES (
      p_venture_id,
      v_stage,
      CASE WHEN v_stage = 1 THEN 'in_progress' ELSE 'not_started' END,
      v_work_type,
      CASE WHEN v_stage = 1 THEN NOW() ELSE NULL END
    )
    ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;
  END LOOP;
END;
$$;

-- Step 4: Backfill stage 26 row for existing ventures missing it
INSERT INTO venture_stage_work (venture_id, lifecycle_stage, stage_status, work_type)
SELECT DISTINCT vsw.venture_id, 26, 'not_started', 'artifact_only'
FROM venture_stage_work vsw
WHERE NOT EXISTS (
  SELECT 1 FROM venture_stage_work
  WHERE venture_id = vsw.venture_id AND lifecycle_stage = 26
)
ON CONFLICT (venture_id, lifecycle_stage) DO NOTHING;
