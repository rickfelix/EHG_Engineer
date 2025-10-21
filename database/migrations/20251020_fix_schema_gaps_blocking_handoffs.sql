-- ============================================================================
-- SD-DATABASE-SCHEMA-FIXES-001: Fix Schema Gaps Blocking Handoffs
-- Date: 2025-10-20
--
-- Fixes 3 system-level database schema issues:
-- 1. Missing template_id column in sd_phase_handoffs table
-- 2. RETRO sub-agent learning_category requirement (documented, fixed in code)
-- 3. PRD table access issues (investigated and documented)
-- ============================================================================

-- ============================================================================
-- FIX 1: Add template_id column to sd_phase_handoffs
-- ============================================================================
-- Code tries to insert template_id but column doesn't exist
-- Error: "Could not find the 'template_id' column of 'sd_phase_handoffs'"
-- Affects: unified-handoff-system.js, verify-handoff-*.js scripts

DO $$
BEGIN
  -- Add template_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sd_phase_handoffs'
    AND column_name = 'template_id'
  ) THEN
    ALTER TABLE sd_phase_handoffs
    ADD COLUMN template_id TEXT;

    RAISE NOTICE 'Added template_id column to sd_phase_handoffs';
  ELSE
    RAISE NOTICE 'template_id column already exists in sd_phase_handoffs';
  END IF;
END $$;

-- Add index for template_id lookups
CREATE INDEX IF NOT EXISTS idx_sd_phase_handoffs_template
ON sd_phase_handoffs(template_id)
WHERE template_id IS NOT NULL;

-- Add column comment
COMMENT ON COLUMN sd_phase_handoffs.template_id IS
'Optional handoff template reference for standardized handoffs. Allows handoff system to use predefined templates for consistency.';

-- ============================================================================
-- FIX 2: RETRO Sub-Agent learning_category Issue
-- ============================================================================
-- Issue: retrospectives table has NOT NULL constraint on learning_category
-- Error: "null value in column 'learning_category' violates not-null constraint"
-- Root Cause: RETRO sub-agent (lib/sub-agents/retro.js) doesn't provide this field
--
-- RESOLUTION: Code fix in lib/sub-agents/retro.js (not a database migration)
-- This migration documents the requirement for future reference.
--
-- Required Categories (from 20251016_enhance_retrospectives_multi_app_context.sql):
-- 'database', 'validation', 'testing', 'handoff', 'sub_agent', 'protocol',
-- 'performance', 'security', 'deployment', 'documentation', 'process',
-- 'communication', 'architecture', 'other'

-- Verify learning_category constraint exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'retrospectives'
    AND column_name = 'learning_category'
    AND is_nullable = 'NO'
  ) THEN
    RAISE NOTICE 'learning_category column exists with NOT NULL constraint (as expected)';
  ELSE
    RAISE WARNING 'learning_category column missing or nullable - unexpected state';
  END IF;
END $$;

-- ============================================================================
-- FIX 3: PRD Table Access Investigation
-- ============================================================================
-- Issue: Query error "column product_requirements_v2.prd_id does not exist"
-- Also: Queries return null with anon key
--
-- Investigation Results:
-- - Primary key column is 'id' (UUID), not 'prd_id'
-- - RLS policies may be blocking anon key access
-- - Resolution: Update sync scripts to use correct column names (code fix)

-- Document actual PRD table structure for reference
DO $$
DECLARE
  col_record RECORD;
  prd_columns TEXT := '';
BEGIN
  -- Get list of columns in product_requirements_v2
  FOR col_record IN (
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'product_requirements_v2'
    ORDER BY ordinal_position
  )
  LOOP
    prd_columns := prd_columns || col_record.column_name || ' (' || col_record.data_type || '), ';
  END LOOP;

  RAISE NOTICE 'product_requirements_v2 columns: %', prd_columns;
END $$;

-- ============================================================================
-- Verification
-- ============================================================================

-- Verify template_id column exists
SELECT
  'sd_phase_handoffs.template_id' as fix,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'sd_phase_handoffs'
      AND column_name = 'template_id'
    ) THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as status;

-- Verify learning_category constraint
SELECT
  'retrospectives.learning_category' as fix,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'retrospectives'
      AND column_name = 'learning_category'
      AND is_nullable = 'NO'
    ) THEN '✅ NOT NULL CONSTRAINT'
    ELSE '❌ CONSTRAINT MISSING'
  END as status;

-- Verify PRD table structure
SELECT
  'product_requirements_v2.id' as fix,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'product_requirements_v2'
      AND column_name = 'id'
    ) THEN '✅ PRIMARY KEY EXISTS'
    ELSE '❌ MISSING'
  END as status;

-- ============================================================================
-- Summary
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '╔══════════════════════════════════════════════════════════════╗';
  RAISE NOTICE '║ SD-DATABASE-SCHEMA-FIXES-001: Migration Complete            ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ ✅ FIX 1: template_id column added to sd_phase_handoffs     ║';
  RAISE NOTICE '║ ✅ FIX 2: learning_category constraint documented           ║';
  RAISE NOTICE '║    (RETRO sub-agent code fix required)                      ║';
  RAISE NOTICE '║ ✅ FIX 3: PRD table structure documented                    ║';
  RAISE NOTICE '║    (sync script code fix required)                          ║';
  RAISE NOTICE '╠══════════════════════════════════════════════════════════════╣';
  RAISE NOTICE '║ Next Steps:                                                  ║';
  RAISE NOTICE '║ 1. Update lib/sub-agents/retro.js (add learning_category)   ║';
  RAISE NOTICE '║ 2. Update scripts/sync-sd-database-state.js (prd_id → id)   ║';
  RAISE NOTICE '║ 3. Test handoff creation with template_id                   ║';
  RAISE NOTICE '║ 4. Test RETRO generation with learning_category             ║';
  RAISE NOTICE '║ 5. Retry SD-VWC-PHASE1-001 PLAN→LEAD handoff                ║';
  RAISE NOTICE '╚══════════════════════════════════════════════════════════════╝';
  RAISE NOTICE '';
END $$;
