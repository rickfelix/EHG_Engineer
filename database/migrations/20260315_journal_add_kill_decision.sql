-- Migration: Add 'kill' to stage_proving_journal chairman_decision check constraint
-- Date: 2026-03-15
-- Reason: The venture lifecycle has kill gates (stages 3, 5, 13, 23) where the chairman
--         can terminate a venture. The journal needs to support recording a 'kill' decision.
-- Applied: 2026-03-15 (executed directly via pg client)

-- Step 1: Drop existing constraint
ALTER TABLE stage_proving_journal
  DROP CONSTRAINT stage_proving_journal_chairman_decision_check;

-- Step 2: Add updated constraint with 'kill' value
ALTER TABLE stage_proving_journal
  ADD CONSTRAINT stage_proving_journal_chairman_decision_check
  CHECK (chairman_decision = ANY (ARRAY['proceed', 'fix_first', 'skip', 'defer', 'kill']));

-- Rollback:
-- ALTER TABLE stage_proving_journal DROP CONSTRAINT stage_proving_journal_chairman_decision_check;
-- ALTER TABLE stage_proving_journal ADD CONSTRAINT stage_proving_journal_chairman_decision_check
--   CHECK (chairman_decision = ANY (ARRAY['proceed', 'fix_first', 'skip', 'defer']));
