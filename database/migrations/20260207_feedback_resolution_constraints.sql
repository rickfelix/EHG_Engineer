-- Migration: feedback_resolution_constraints
-- SD: SD-FDBK-ENH-ADD-INTELLIGENT-RESOLUTION-001
-- Purpose: Add FK constraints, self-reference prevention, and terminal status enforcement
-- FR-1: FK on quick_fix_id -> quick_fixes(id)
-- FR-2: FK on duplicate_of_id -> feedback(id) + self-reference prevention
-- FR-3: CHECK constraint for terminal status resolution enforcement

BEGIN;

-- ============================================================
-- Step 1: Backfill 3 resolved rows without resolution links
-- These were resolved via ad-hoc fixes and have resolution_notes
-- but no quick_fix_id, resolution_sd_id, or strategic_directive_id.
-- We prefix their resolution_notes with [BACKFILL] marker.
-- ============================================================

UPDATE feedback
SET resolution_notes = '[BACKFILL] ' || COALESCE(resolution_notes, 'Resolved prior to constraint enforcement')
WHERE id IN (
  '64fec1a5-dbab-43bc-bf02-70b191eaae95',
  'da28745c-4496-43f9-aac1-da0d454b8a9e',
  'afb2b39b-abb0-4c0e-b6c0-158c8c50aae1'
)
AND resolution_sd_id IS NULL
AND quick_fix_id IS NULL
AND strategic_directive_id IS NULL;

-- ============================================================
-- Step 2: FK constraint on quick_fix_id -> quick_fixes(id)
-- FR-1: Ensures quick_fix_id references a real quick-fix
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_feedback_quick_fix_id'
    AND table_name = 'feedback'
  ) THEN
    ALTER TABLE feedback
      ADD CONSTRAINT fk_feedback_quick_fix_id
      FOREIGN KEY (quick_fix_id) REFERENCES quick_fixes(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- Step 3: FK constraint on duplicate_of_id -> feedback(id)
-- FR-2: Self-referencing FK for duplicate tracking
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_feedback_duplicate_of_id'
    AND table_name = 'feedback'
  ) THEN
    ALTER TABLE feedback
      ADD CONSTRAINT fk_feedback_duplicate_of_id
      FOREIGN KEY (duplicate_of_id) REFERENCES feedback(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- Step 4: Self-reference prevention on duplicate_of_id
-- FR-2: A feedback item cannot be a duplicate of itself
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_feedback_no_self_duplicate'
    AND table_name = 'feedback'
  ) THEN
    ALTER TABLE feedback
      ADD CONSTRAINT chk_feedback_no_self_duplicate
      CHECK (duplicate_of_id IS NULL OR duplicate_of_id != id);
  END IF;
END $$;

-- ============================================================
-- Step 5: Terminal status resolution enforcement
-- FR-3: Enforces that terminal statuses have proper resolution links
--
-- Rules:
--   resolved  -> must have at least ONE of: resolution_sd_id, quick_fix_id,
--                strategic_directive_id, OR non-empty resolution_notes
--   wont_fix  -> must have non-empty resolution_notes
--   duplicate -> must have duplicate_of_id set
--   invalid   -> no additional requirements
--
-- Non-terminal statuses (new, in_progress, backlog, triaged, snoozed)
-- have no resolution requirements.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_feedback_terminal_resolution'
    AND table_name = 'feedback'
  ) THEN
    ALTER TABLE feedback
      ADD CONSTRAINT chk_feedback_terminal_resolution
      CHECK (
        CASE
          WHEN status = 'resolved' THEN
            resolution_sd_id IS NOT NULL
            OR quick_fix_id IS NOT NULL
            OR strategic_directive_id IS NOT NULL
            OR (resolution_notes IS NOT NULL AND LENGTH(TRIM(resolution_notes)) > 0)
          WHEN status = 'wont_fix' THEN
            resolution_notes IS NOT NULL AND LENGTH(TRIM(resolution_notes)) > 0
          WHEN status = 'duplicate' THEN
            duplicate_of_id IS NOT NULL
          ELSE TRUE
        END
      );
  END IF;
END $$;

-- ============================================================
-- Verification
-- ============================================================

DO $$
DECLARE
  constraint_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO constraint_count
  FROM information_schema.table_constraints
  WHERE table_name = 'feedback'
  AND constraint_name IN (
    'fk_feedback_quick_fix_id',
    'fk_feedback_duplicate_of_id',
    'chk_feedback_no_self_duplicate',
    'chk_feedback_terminal_resolution'
  );

  IF constraint_count < 4 THEN
    RAISE EXCEPTION 'Expected 4 constraints, found %', constraint_count;
  END IF;

  RAISE NOTICE 'All 4 feedback resolution constraints verified successfully';
END $$;

COMMIT;
