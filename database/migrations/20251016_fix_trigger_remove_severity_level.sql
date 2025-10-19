-- Migration: Remove severity_level reference from trigger
-- Issue: SD-RETRO-ENHANCE-001 (continued fix)
-- Created: 2025-10-16
--
-- Problem: Trigger function references severity_level column which doesn't exist
-- Error: record "new" has no field "severity_level"
--
-- Root Cause: Previous trigger migration (20251016_fix_retrospective_trigger_for_embeddings.sql)
-- included validation for severity_level, but this column was never added to retrospectives table.
--
-- Solution: Remove severity_level validation entirely (lines 28-33 in current trigger)

BEGIN;

-- Drop and recreate trigger function WITHOUT severity_level reference
DROP TRIGGER IF EXISTS trigger_auto_populate_retrospective_fields ON retrospectives;

CREATE OR REPLACE FUNCTION auto_populate_retrospective_fields()
RETURNS TRIGGER AS $$
DECLARE
  is_status_changing_to_published BOOLEAN := FALSE;
  is_learning_category_changing BOOLEAN := FALSE;
BEGIN
  -- ========================================================================
  -- Detect what's changing (for conditional validation)
  -- ========================================================================

  -- Check if this is an INSERT or if status is changing to PUBLISHED
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'PUBLISHED' AND NEW.status = 'PUBLISHED') THEN
    is_status_changing_to_published := TRUE;
  END IF;

  -- Check if learning_category is being set or changed
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND (OLD.learning_category IS NULL OR OLD.learning_category != NEW.learning_category)) THEN
    is_learning_category_changing := TRUE;
  END IF;

  -- ========================================================================
  -- Auto-Population Logic (always runs)
  -- ========================================================================

  -- Auto-populate applies_to_all_apps for PROCESS_IMPROVEMENT category
  IF NEW.learning_category = 'PROCESS_IMPROVEMENT' THEN
    NEW.applies_to_all_apps := TRUE;
  ELSIF NEW.learning_category IS NOT NULL THEN
    NEW.applies_to_all_apps := FALSE;
  END IF;

  -- ========================================================================
  -- Business Rule Validation (conditional based on operation)
  -- ========================================================================

  -- Validation 1: APPLICATION_ISSUE must have affected_components
  -- ONLY enforce on INSERT or when learning_category is being set/changed to APPLICATION_ISSUE
  IF is_learning_category_changing AND
     NEW.learning_category = 'APPLICATION_ISSUE' AND
     (NEW.affected_components IS NULL OR array_length(NEW.affected_components, 1) IS NULL) THEN
    RAISE EXCEPTION 'APPLICATION_ISSUE retrospectives must have at least one affected_component'
      USING HINT = 'Add affected components like ["Authentication", "Database", "API"]';
  END IF;

  -- NOTE: Validation 2 (severity_level) REMOVED - column does not exist in retrospectives table
  -- Previous migration incorrectly included this validation

  -- Validation 3: PUBLISHED retrospectives must have action_items
  -- ONLY enforce when status is being changed TO published
  IF is_status_changing_to_published AND
     (NEW.action_items IS NULL OR LENGTH(TRIM(NEW.action_items)) = 0) THEN
    RAISE EXCEPTION 'PUBLISHED retrospectives must have non-empty action_items'
      USING HINT = 'Add concrete action items to prevent future issues';
  END IF;

  -- Validation 4: PUBLISHED retrospectives must have quality_score >= 70
  -- ONLY enforce when status is being changed TO published
  IF is_status_changing_to_published AND
     (NEW.quality_score IS NULL OR NEW.quality_score < 70) THEN
    RAISE EXCEPTION 'PUBLISHED retrospectives must have quality_score >= 70 (current: %)', COALESCE(NEW.quality_score, 0)
      USING HINT = 'Improve retrospective completeness to reach 70+ score';
  END IF;

  -- Validation 5: CODE_TRACEABILITY - validate file extensions
  -- This is a WARNING only, so it's safe to run on all operations
  IF NEW.related_files IS NOT NULL AND array_length(NEW.related_files, 1) > 0 THEN
    DECLARE
      invalid_files TEXT[] := ARRAY[]::TEXT[];
      file TEXT;
    BEGIN
      FOREACH file IN ARRAY NEW.related_files LOOP
        -- Check if file has a valid extension (basic validation)
        IF file !~ '\.(js|ts|jsx|tsx|json|sql|md|yml|yaml|css|html|py|sh)$' THEN
          invalid_files := array_append(invalid_files, file);
        END IF;
      END LOOP;

      IF array_length(invalid_files, 1) > 0 THEN
        RAISE WARNING 'Potentially invalid file paths detected: %', invalid_files
          USING HINT = 'File paths should have valid extensions (.js, .ts, .sql, etc.)';
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_populate_retrospective_fields() IS
'SD-RETRO-ENHANCE-001 Layer 2: Enhanced trigger with CONDITIONAL quality enforcement (fixed - severity_level reference removed)';

-- Recreate trigger
CREATE TRIGGER trigger_auto_populate_retrospective_fields
BEFORE INSERT OR UPDATE ON retrospectives
FOR EACH ROW
EXECUTE FUNCTION auto_populate_retrospective_fields();

-- ============================================================================
-- Verification
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_auto_populate_retrospective_fields'
      AND tgrelid = 'retrospectives'::regclass
  ) THEN
    RAISE EXCEPTION 'Fixed trigger not created';
  END IF;
  RAISE NOTICE '✅ Fixed trigger verified (severity_level reference removed)';
END $$;

COMMIT;

-- ============================================================================
-- Testing
-- ============================================================================

-- Test 1: Embedding update should now work (doesn't reference severity_level)
-- UPDATE retrospectives
-- SET content_embedding = '[1,2,3]'::vector
-- WHERE id = '[UUID]';
-- Expected: SUCCESS (no validation errors, no severity_level reference)

-- Test 2: Insert APPLICATION_ISSUE without affected_components should still fail
-- INSERT INTO retrospectives (title, target_application, learning_category, affected_components)
-- VALUES ('Test', 'EHG_engineer', 'APPLICATION_ISSUE', ARRAY[]::TEXT[]);
-- Expected: ERROR - must have at least one affected_component

-- Test 3: Change status to PUBLISHED without quality_score >= 70 should fail
-- UPDATE retrospectives
-- SET status = 'PUBLISHED', quality_score = 50
-- WHERE id = '[UUID]' AND status != 'PUBLISHED';
-- Expected: ERROR - must have quality_score >= 70

-- ============================================================================
-- Rollback
-- ============================================================================

-- DROP TRIGGER IF EXISTS trigger_auto_populate_retrospective_fields ON retrospectives;
-- -- Then re-run: 20251016_fix_retrospective_trigger_for_embeddings.sql (if needed)
