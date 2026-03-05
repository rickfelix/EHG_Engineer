-- Fix Phase 5/6 boundaries and rename Phase 6
-- Phase 5 expanded: [17-20] → [17-22]
-- Phase 6 renamed: "LAUNCH & LEARN" → "THE LAUNCH", condensed: [21-25] → [23-25]

-- 1. Fix lifecycle_phases table
UPDATE lifecycle_phases
SET stages = ARRAY[17,18,19,20,21,22]
WHERE phase_number = 5;

UPDATE lifecycle_phases
SET phase_name = 'THE LAUNCH',
    description = 'Launch preparation, execution, and go-live',
    stages = ARRAY[23,24,25]
WHERE phase_number = 6;

-- 2. Fix lifecycle_stage_config table (stages 21-22 → Phase 5)
UPDATE lifecycle_stage_config
SET phase_number = 5, phase_name = 'THE BUILD LOOP'
WHERE stage_number IN (21, 22);

UPDATE lifecycle_stage_config
SET phase_name = 'THE LAUNCH'
WHERE stage_number IN (23, 24, 25);

-- 3. Update venture_token_ledger CHECK constraint
ALTER TABLE venture_token_ledger
  DROP CONSTRAINT IF EXISTS venture_token_ledger_phase_check;
ALTER TABLE venture_token_ledger
  ADD CONSTRAINT venture_token_ledger_phase_check
  CHECK (phase IN ('THE_TRUTH', 'THE_ENGINE', 'THE_IDENTITY', 'THE_BLUEPRINT', 'THE_BUILD_LOOP', 'THE_LAUNCH'));

-- 4. Migrate existing data
UPDATE venture_token_ledger SET phase = 'THE_LAUNCH' WHERE phase = 'LAUNCH_LEARN';
