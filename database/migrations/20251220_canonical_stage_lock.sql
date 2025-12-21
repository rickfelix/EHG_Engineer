-- ============================================================================
-- Migration: Canonical Stage Lock
-- ============================================================================
-- Date: 2025-12-20
-- SD: SD-UNIFIED-PATH-2.1.1
-- Purpose: Document and enforce current_lifecycle_stage as the ONLY canonical
--          stage column in the ventures table
--
-- Background:
--   The Microscope Audit identified "Split-Brain Data" with three competing
--   stage columns: current_lifecycle_stage, current_workflow_stage, current_stage
--
--   This migration:
--   1. Documents the canonical column via COMMENT
--   2. Creates a view for stage column compatibility
--   3. Adds index for stage-based queries
--   4. Provides deprecation warning for wrong column usage
--
-- CANONICAL COLUMN: ventures.current_lifecycle_stage
-- DEPRECATED: current_workflow_stage, current_stage (aliases only)
--
-- Execution: psql or Supabase dashboard
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) Document the canonical stage column
-- ============================================================================

COMMENT ON COLUMN public.ventures.current_lifecycle_stage IS
  'CANONICAL STAGE COLUMN (SD-UNIFIED-PATH-2.1.1): The only authoritative source '
  'for venture stage position. Valid values: 1-25 (25-stage lifecycle). '
  'DEPRECATED ALIASES: current_workflow_stage, current_stage - use this column only. '
  'Updated by fn_advance_venture_stage() for audit trail compliance.';

-- ============================================================================
-- 2) Create a view for column compatibility (read-only aliases)
-- ============================================================================
-- This allows legacy queries using deprecated names to still work
-- while directing developers to use the canonical column

CREATE OR REPLACE VIEW public.v_ventures_stage_compat AS
SELECT
  id,
  name,
  status,
  current_lifecycle_stage,
  -- Aliases for compatibility (DEPRECATED)
  current_lifecycle_stage as current_workflow_stage,
  current_lifecycle_stage as current_stage,
  -- Computed fields
  CASE
    WHEN current_lifecycle_stage BETWEEN 1 AND 5 THEN 'ideation'
    WHEN current_lifecycle_stage BETWEEN 6 AND 10 THEN 'validation'
    WHEN current_lifecycle_stage BETWEEN 11 AND 15 THEN 'development'
    WHEN current_lifecycle_stage BETWEEN 16 AND 20 THEN 'scaling'
    WHEN current_lifecycle_stage BETWEEN 21 AND 25 THEN 'exit'
    ELSE 'unknown'
  END as lifecycle_phase,
  created_at,
  updated_at
FROM public.ventures;

COMMENT ON VIEW public.v_ventures_stage_compat IS
  'Compatibility view providing deprecated column aliases. '
  'current_workflow_stage and current_stage are DEPRECATED - migrate to current_lifecycle_stage. '
  'Created by SD-UNIFIED-PATH-2.1.1 for backward compatibility during transition.';

-- ============================================================================
-- 3) Ensure index exists for stage-based queries
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_ventures_current_lifecycle_stage
  ON public.ventures(current_lifecycle_stage);

CREATE INDEX IF NOT EXISTS idx_ventures_stage_status
  ON public.ventures(current_lifecycle_stage, status)
  WHERE status = 'active';

-- ============================================================================
-- 4) Create validation function to enforce canonical column usage
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_validate_stage_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Ensure current_lifecycle_stage is set and valid
  IF NEW.current_lifecycle_stage IS NULL THEN
    NEW.current_lifecycle_stage := 1;
  END IF;

  -- Validate stage range (1-25 for 25-stage lifecycle)
  IF NEW.current_lifecycle_stage < 1 OR NEW.current_lifecycle_stage > 25 THEN
    RAISE EXCEPTION 'current_lifecycle_stage must be between 1 and 25, got %',
      NEW.current_lifecycle_stage;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fn_validate_stage_column IS
  'Validates current_lifecycle_stage is within valid range (1-25). '
  'Created by SD-UNIFIED-PATH-2.1.1 for data integrity.';

-- Create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_stage_column'
  ) THEN
    CREATE TRIGGER trg_validate_stage_column
      BEFORE INSERT OR UPDATE ON public.ventures
      FOR EACH ROW
      EXECUTE FUNCTION fn_validate_stage_column();
  END IF;
END $$;

-- ============================================================================
-- 5) Add deprecation warning function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_stage_column_deprecated(
  p_deprecated_column TEXT,
  p_calling_context TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE WARNING
    'DEPRECATED: Column "%" is deprecated. Use current_lifecycle_stage instead. Context: %',
    p_deprecated_column,
    COALESCE(p_calling_context, 'unknown');
END;
$$;

COMMENT ON FUNCTION public.fn_stage_column_deprecated IS
  'Logs deprecation warning when legacy column names are used. '
  'Call this in migrations or application code transitioning from deprecated columns. '
  'Created by SD-UNIFIED-PATH-2.1.1.';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- After running, verify with:
--
-- 1. Check canonical column comment:
-- SELECT obj_description(('public.ventures'::regclass)::oid, 'pg_class');
-- SELECT col_description(('public.ventures'::regclass)::oid, (
--   SELECT attnum FROM pg_attribute
--   WHERE attrelid = 'public.ventures'::regclass
--   AND attname = 'current_lifecycle_stage'
-- ));
--
-- 2. Check compatibility view:
-- SELECT * FROM v_ventures_stage_compat LIMIT 5;
--
-- 3. Verify indexes:
-- SELECT indexname FROM pg_indexes WHERE tablename = 'ventures';
--
-- 4. Test validation trigger:
-- INSERT INTO ventures (id, name, current_lifecycle_stage)
-- VALUES (gen_random_uuid(), 'Test', 50); -- Should fail
--
-- 5. Call deprecation warning:
-- SELECT fn_stage_column_deprecated('current_stage', 'test migration');
