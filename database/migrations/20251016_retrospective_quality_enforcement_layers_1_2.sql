-- Migration: 4-Layer Quality Enforcement (Layers 1 & 2)
-- SD-RETRO-ENHANCE-001 Checkpoint 3: US-006
-- Created: 2025-10-16
--
-- Purpose: Implement database-level quality enforcement for retrospectives
-- Layer 1: Database constraints (prevent invalid data at DB level)
-- Layer 2: Enhanced trigger functions (business rule enforcement)
--
-- Dependencies: Checkpoints 1 & 2 must be deployed first

BEGIN;

-- ============================================================================
-- LAYER 1: Database Constraints
-- ============================================================================

-- Constraint 1: PUBLISHED retrospectives MUST have embeddings
ALTER TABLE retrospectives
ADD CONSTRAINT check_published_has_embedding
CHECK (
  status != 'PUBLISHED'
  OR (status = 'PUBLISHED' AND content_embedding IS NOT NULL)
);

COMMENT ON CONSTRAINT check_published_has_embedding ON retrospectives IS 'Layer 1: PUBLISHED retrospectives must have embeddings for semantic search';

-- Constraint 2: severity_level MUST be valid
-- Note: This constraint might already exist, adding IF NOT EXISTS logic
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'check_valid_severity_level'
  ) THEN
    ALTER TABLE retrospectives
    ADD CONSTRAINT check_valid_severity_level
    CHECK (
      severity_level IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')
    );
  END IF;
END $$;

COMMENT ON CONSTRAINT check_valid_severity_level ON retrospectives IS 'Layer 1: severity_level must be one of: CRITICAL, HIGH, MEDIUM, LOW';

-- Constraint 3: time_to_resolve MUST be reasonable (1 minute to 30 days)
ALTER TABLE retrospectives
ADD CONSTRAINT check_reasonable_time_to_resolve
CHECK (
  time_to_resolve IS NULL
  OR (time_to_resolve >= INTERVAL '1 minute' AND time_to_resolve <= INTERVAL '30 days')
);

COMMENT ON CONSTRAINT check_reasonable_time_to_resolve ON retrospectives IS 'Layer 1: time_to_resolve must be between 1 minute and 30 days';

-- Constraint 4: quality_score MUST be 0-100
ALTER TABLE retrospectives
ADD CONSTRAINT check_quality_score_range
CHECK (
  quality_score IS NULL
  OR (quality_score >= 0 AND quality_score <= 100)
);

COMMENT ON CONSTRAINT check_quality_score_range ON retrospectives IS 'Layer 1: quality_score must be between 0-100';

-- Constraint 5: key_learnings MUST exist for PUBLISHED retrospectives
ALTER TABLE retrospectives
ADD CONSTRAINT check_published_has_key_learnings
CHECK (
  status != 'PUBLISHED'
  OR (status = 'PUBLISHED' AND key_learnings IS NOT NULL AND LENGTH(TRIM(key_learnings)) > 0)
);

COMMENT ON CONSTRAINT check_published_has_key_learnings ON retrospectives IS 'Layer 1: PUBLISHED retrospectives must have non-empty key_learnings';

-- ============================================================================
-- LAYER 2: Enhanced Trigger Functions
-- ============================================================================

-- Drop existing trigger to recreate with enhancements
DROP TRIGGER IF EXISTS trigger_auto_populate_retrospective_fields ON retrospectives;

-- Enhanced trigger function with comprehensive validation
CREATE OR REPLACE FUNCTION auto_populate_retrospective_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- ========================================================================
  -- Auto-Population Logic
  -- ========================================================================

  -- Auto-populate applies_to_all_apps for PROCESS_IMPROVEMENT category
  IF NEW.learning_category = 'PROCESS_IMPROVEMENT' THEN
    NEW.applies_to_all_apps := TRUE;
  ELSE
    NEW.applies_to_all_apps := FALSE;
  END IF;

  -- ========================================================================
  -- Business Rule Validation
  -- ========================================================================

  -- Validation 1: APPLICATION_ISSUE must have at least one affected_component
  IF NEW.learning_category = 'APPLICATION_ISSUE' AND
     (NEW.affected_components IS NULL OR array_length(NEW.affected_components, 1) IS NULL) THEN
    RAISE EXCEPTION 'APPLICATION_ISSUE retrospectives must have at least one affected_component'
      USING HINT = 'Add affected components like ["Authentication", "Database", "API"]';
  END IF;

  -- Validation 2: CRITICAL/HIGH severity must have at least one tag
  IF NEW.severity_level IN ('CRITICAL', 'HIGH') AND
     (NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL) THEN
    RAISE EXCEPTION 'CRITICAL and HIGH severity retrospectives must have at least one tag'
      USING HINT = 'Add tags like ["urgent", "security", "performance"]';
  END IF;

  -- Validation 3: PUBLISHED retrospectives must have action_items
  IF NEW.status = 'PUBLISHED' AND
     (NEW.action_items IS NULL OR LENGTH(TRIM(NEW.action_items)) = 0) THEN
    RAISE EXCEPTION 'PUBLISHED retrospectives must have non-empty action_items'
      USING HINT = 'Add concrete action items to prevent future issues';
  END IF;

  -- Validation 4: PUBLISHED retrospectives must have quality_score >= 70
  IF NEW.status = 'PUBLISHED' AND
     (NEW.quality_score IS NULL OR NEW.quality_score < 70) THEN
    RAISE EXCEPTION 'PUBLISHED retrospectives must have quality_score >= 70 (current: %)', COALESCE(NEW.quality_score, 0)
      USING HINT = 'Improve retrospective completeness to reach 70+ score';
  END IF;

  -- Validation 5: CODE_TRACEABILITY validation - related_files should have valid file extensions
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

COMMENT ON FUNCTION auto_populate_retrospective_fields() IS 'SD-RETRO-ENHANCE-001 Layer 2: Enhanced trigger with quality enforcement and validation';

-- Recreate trigger with enhanced function
CREATE TRIGGER trigger_auto_populate_retrospective_fields
BEFORE INSERT OR UPDATE ON retrospectives
FOR EACH ROW
EXECUTE FUNCTION auto_populate_retrospective_fields();

-- ============================================================================
-- Additional Quality Functions
-- ============================================================================

-- Function to validate retrospective quality (used by Layer 3)
CREATE OR REPLACE FUNCTION validate_retrospective_quality(retrospective_id uuid)
RETURNS TABLE (
  is_valid boolean,
  validation_errors text[],
  validation_warnings text[],
  quality_score integer
)
LANGUAGE plpgsql
AS $$
DECLARE
  retro RECORD;
  errors TEXT[] := ARRAY[]::TEXT[];
  warnings TEXT[] := ARRAY[]::TEXT[];
  score INTEGER := 100;
BEGIN
  -- Fetch retrospective
  SELECT * INTO retro FROM retrospectives WHERE id = retrospective_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, ARRAY['Retrospective not found']::TEXT[], ARRAY[]::TEXT[], 0;
    RETURN;
  END IF;

  -- Required fields check
  IF retro.title IS NULL OR LENGTH(TRIM(retro.title)) = 0 THEN
    errors := array_append(errors, 'Title is required');
    score := score - 20;
  END IF;

  IF retro.key_learnings IS NULL OR LENGTH(TRIM(retro.key_learnings)) = 0 THEN
    errors := array_append(errors, 'Key learnings are required');
    score := score - 30;
  END IF;

  IF retro.action_items IS NULL OR LENGTH(TRIM(retro.action_items)) = 0 THEN
    errors := array_append(errors, 'Action items are required');
    score := score - 20;
  END IF;

  -- Target application check
  IF retro.target_application IS NULL THEN
    errors := array_append(errors, 'Target application is required');
    score := score - 10;
  END IF;

  -- Learning category check
  IF retro.learning_category IS NULL THEN
    errors := array_append(errors, 'Learning category is required');
    score := score - 10;
  END IF;

  -- Code traceability warnings
  IF retro.learning_category = 'APPLICATION_ISSUE' AND
     (retro.affected_components IS NULL OR array_length(retro.affected_components, 1) IS NULL) THEN
    warnings := array_append(warnings, 'APPLICATION_ISSUE should have affected_components');
    score := score - 5;
  END IF;

  IF retro.severity_level IN ('CRITICAL', 'HIGH') AND
     (retro.tags IS NULL OR array_length(retro.tags, 1) IS NULL) THEN
    warnings := array_append(warnings, 'CRITICAL/HIGH severity should have tags');
    score := score - 5;
  END IF;

  -- Embedding check for PUBLISHED
  IF retro.status = 'PUBLISHED' AND retro.content_embedding IS NULL THEN
    errors := array_append(errors, 'PUBLISHED retrospectives must have embeddings');
    score := score - 10;
  END IF;

  -- Return validation results
  RETURN QUERY SELECT
    (array_length(errors, 1) IS NULL),  -- is_valid: true if no errors
    errors,
    warnings,
    GREATEST(0, score);  -- quality_score: never below 0
END;
$$;

COMMENT ON FUNCTION validate_retrospective_quality IS 'SD-RETRO-ENHANCE-001: Comprehensive quality validation for retrospectives (used by Layer 3)';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify all 5 constraints exist
DO $$
DECLARE
  missing_constraints TEXT[] := ARRAY[]::TEXT[];
  required_constraints TEXT[] := ARRAY[
    'check_published_has_embedding',
    'check_valid_severity_level',
    'check_reasonable_time_to_resolve',
    'check_quality_score_range',
    'check_published_has_key_learnings'
  ];
  constraint_name TEXT;
BEGIN
  FOREACH constraint_name IN ARRAY required_constraints LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = constraint_name
    ) THEN
      missing_constraints := array_append(missing_constraints, constraint_name);
    END IF;
  END LOOP;

  IF array_length(missing_constraints, 1) > 0 THEN
    RAISE EXCEPTION 'Missing constraints: %', missing_constraints;
  END IF;

  RAISE NOTICE 'All 5 database constraints verified';
END $$;

-- Verify enhanced trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_auto_populate_retrospective_fields'
      AND tgrelid = 'retrospectives'::regclass
  ) THEN
    RAISE EXCEPTION 'Enhanced trigger not created';
  END IF;
  RAISE NOTICE 'Enhanced trigger verified';
END $$;

-- Verify validation function exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'validate_retrospective_quality'
  ) THEN
    RAISE EXCEPTION 'validate_retrospective_quality() function not created';
  END IF;
  RAISE NOTICE 'Validation function verified';
END $$;

COMMIT;

-- ============================================================================
-- Testing Examples
-- ============================================================================

-- Test 1: Try to publish a retrospective without embeddings (should fail)
-- INSERT INTO retrospectives (title, status, target_application, learning_category)
-- VALUES ('Test', 'PUBLISHED', 'EHG_engineer', 'APPLICATION_ISSUE');
-- Expected: ERROR - check_published_has_embedding

-- Test 2: Try APPLICATION_ISSUE without affected_components (should fail)
-- INSERT INTO retrospectives (title, target_application, learning_category, affected_components)
-- VALUES ('Test', 'EHG_engineer', 'APPLICATION_ISSUE', ARRAY[]::TEXT[]);
-- Expected: ERROR - must have at least one affected_component

-- Test 3: Validate a specific retrospective
-- SELECT * FROM validate_retrospective_quality('[UUID]');
-- Expected: Returns is_valid, errors, warnings, quality_score

-- ============================================================================
-- Next Steps
-- ============================================================================

-- 1. Test all 5 constraints with invalid data
-- 2. Test trigger validations
-- 3. Implement Layer 3 (application-level validation in generate-comprehensive-retrospective.js)
-- 4. Implement Layer 4 (CI/CD workflow in .github/workflows/retrospective-quality-gates.yml)
-- 5. Integration test all 4 layers together

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

-- DROP FUNCTION IF EXISTS validate_retrospective_quality(uuid);
-- DROP TRIGGER IF EXISTS trigger_auto_populate_retrospective_fields ON retrospectives;
-- DROP FUNCTION IF EXISTS auto_populate_retrospective_fields();
-- ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS check_published_has_key_learnings;
-- ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS check_quality_score_range;
-- ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS check_reasonable_time_to_resolve;
-- ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS check_valid_severity_level;
-- ALTER TABLE retrospectives DROP CONSTRAINT IF EXISTS check_published_has_embedding;
