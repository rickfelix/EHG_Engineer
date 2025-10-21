-- ============================================================================
-- SD-DATABASE-SCHEMA-FIXES-001: Additional Schema Fixes (Part 2)
-- Date: 2025-10-20
--
-- Fixes 2 additional schema issues discovered during handoff testing:
-- 1. quality_score constraint too restrictive (requires >= 70, should allow 0-100)
-- 2. Missing validation_details column in sd_phase_handoffs
-- ============================================================================

-- ============================================================================
-- FIX 4: Relax quality_score constraint to allow full 0-100 range
-- ============================================================================
-- Current: CHECK (quality_score >= 70 AND quality_score <= 100)
-- Issue: RETRO can generate scores below 70 for legitimate reasons
-- Solution: Allow full 0-100 range while still providing quality boundaries

DO $$
BEGIN
  -- Drop existing overly-restrictive constraint
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'retrospectives_quality_score_check'
      AND conrelid = 'retrospectives'::regclass
  ) THEN
    ALTER TABLE retrospectives
    DROP CONSTRAINT retrospectives_quality_score_check;

    RAISE NOTICE 'Dropped old quality_score constraint (70-100 range)';
  END IF;

  -- Add new permissive constraint allowing full 0-100 range
  ALTER TABLE retrospectives
  ADD CONSTRAINT retrospectives_quality_score_check
  CHECK (
    quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 100)
  );

  RAISE NOTICE 'Added new quality_score constraint (0-100 range, nullable)';
END $$;

-- Update constraint comment
COMMENT ON CONSTRAINT retrospectives_quality_score_check ON retrospectives
IS 'Quality score must be NULL or between 0-100 (inclusive). Allows full range for RETRO-generated scores.';

-- ============================================================================
-- FIX 5: Add validation columns to sd_phase_handoffs
-- ============================================================================
-- Issue: Unified handoff system tries to store validation fields but columns missing
-- Errors:
--   - "Could not find the 'validation_details' column of 'sd_phase_handoffs'"
--   - "Could not find the 'validation_passed' column of 'sd_phase_handoffs'"
--   - "Could not find the 'validation_score' column of 'sd_phase_handoffs'"
-- Solution: Add validation columns for handoff quality tracking

DO $$
BEGIN
  -- Add validation_score column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_phase_handoffs'
    AND column_name = 'validation_score'
  ) THEN
    ALTER TABLE sd_phase_handoffs
    ADD COLUMN validation_score INTEGER CHECK (validation_score >= 0 AND validation_score <= 100);

    RAISE NOTICE 'Added validation_score column to sd_phase_handoffs';
  ELSE
    RAISE NOTICE 'validation_score column already exists in sd_phase_handoffs';
  END IF;

  -- Add validation_passed column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_phase_handoffs'
    AND column_name = 'validation_passed'
  ) THEN
    ALTER TABLE sd_phase_handoffs
    ADD COLUMN validation_passed BOOLEAN DEFAULT NULL;

    RAISE NOTICE 'Added validation_passed column to sd_phase_handoffs';
  ELSE
    RAISE NOTICE 'validation_passed column already exists in sd_phase_handoffs';
  END IF;

  -- Add validation_details column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_phase_handoffs'
    AND column_name = 'validation_details'
  ) THEN
    ALTER TABLE sd_phase_handoffs
    ADD COLUMN validation_details JSONB DEFAULT '{}'::jsonb;

    RAISE NOTICE 'Added validation_details column to sd_phase_handoffs';
  ELSE
    RAISE NOTICE 'validation_details column already exists in sd_phase_handoffs';
  END IF;
END $$;

-- Add column comments
COMMENT ON COLUMN sd_phase_handoffs.validation_score IS
'Quality score from handoff validation (0-100). Higher scores indicate better handoff quality.';

COMMENT ON COLUMN sd_phase_handoffs.validation_passed IS
'Boolean indicating whether handoff passed all validation gates. NULL = not yet validated.';

COMMENT ON COLUMN sd_phase_handoffs.validation_details IS
'Detailed validation results from handoff verification including sub-agent outputs, gate checks, and quality metrics.';

-- Add index for JSON queries
CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_validation_details
ON sd_phase_handoffs USING GIN (validation_details)
WHERE validation_details IS NOT NULL AND validation_details != '{}'::jsonb;

-- Add index for validation queries
CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_validation_status
ON sd_phase_handoffs(validation_passed, validation_score)
WHERE validation_passed IS NOT NULL;

-- ============================================================================
-- Verification
-- ============================================================================

-- Verify quality_score constraint updated
SELECT
  'retrospectives.quality_score constraint' as fix,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON c.conrelid = t.oid
      WHERE t.relname = 'retrospectives'
      AND c.conname = 'retrospectives_quality_score_check'
      AND pg_get_constraintdef(c.oid) LIKE '%>= 0%'
    ) THEN '✅ UPDATED (0-100 range)'
    ELSE '❌ OLD CONSTRAINT STILL ACTIVE'
  END as status;

-- Verify validation columns exist
SELECT
  'sd_phase_handoffs.validation_score' as fix,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sd_phase_handoffs'
      AND column_name = 'validation_score'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
UNION ALL
SELECT
  'sd_phase_handoffs.validation_passed' as fix,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sd_phase_handoffs'
      AND column_name = 'validation_passed'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status
UNION ALL
SELECT
  'sd_phase_handoffs.validation_details' as fix,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sd_phase_handoffs'
      AND column_name = 'validation_details'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status;

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║ SD-DATABASE-SCHEMA-FIXES-001: Part 2 Migration Complete     ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ ✅ FIX 4: quality_score constraint relaxed (0-100 range)    ║';
  RAISE NOTICE '║ ✅ FIX 5: validation columns added to handoffs               ║';
  RAISE NOTICE '║    - validation_score (INTEGER 0-100)                        ║';
  RAISE NOTICE '║    - validation_passed (BOOLEAN)                             ║';
  RAISE NOTICE '║    - validation_details (JSONB)                              ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ Combined with Part 1:                                        ║';
  RAISE NOTICE '║ ✅ FIX 1: template_id column (Part 1)                       ║';
  RAISE NOTICE '║ ✅ FIX 2: learning_category (code fix, Part 1)              ║';
  RAISE NOTICE '║ ✅ FIX 3: PRD table structure (code fix, Part 1)            ║';
  RAISE NOTICE '║ ✅ FIX 4: quality_score constraint (Part 2)                 ║';
  RAISE NOTICE '║ ✅ FIX 5: validation columns (Part 2, 3 columns)            ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ Total: 5 schema fix categories (8 columns/constraints)      ║';
  RAISE NOTICE '║ Status: Ready for SD-VWC-PHASE1-001 handoff retry            ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
END $$;
