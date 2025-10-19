-- Migration: Enhance Retrospectives - Multi-Application Context & Code Traceability
-- SD-RETRO-ENHANCE-001 Checkpoint 1: Database Schema
-- User Stories: US-001, US-002, US-003
-- Created: 2025-10-16
--
-- Purpose: Add 9 new columns to retrospectives table for:
-- 1. Multi-application context (target_application, learning_category, applies_to_all_apps)
-- 2. Code traceability (related_files, related_commits, related_prs, affected_components, tags)

BEGIN;

-- ============================================================================
-- CRITICAL: Disable quality validation trigger during migration
-- The trigger recalculates quality_score on UPDATE, which might violate constraints
-- ============================================================================
ALTER TABLE retrospectives DISABLE TRIGGER validate_retrospective_quality_trigger;

-- ============================================================================
-- US-001: Multi-Application Context - Target Application Field
-- ============================================================================

-- Add target_application column
ALTER TABLE retrospectives
ADD COLUMN target_application TEXT;

-- Add constraint for valid values (EHG_engineer, EHG, or venture_*)
ALTER TABLE retrospectives
ADD CONSTRAINT check_target_application
CHECK (
  target_application = 'EHG_engineer'
  OR target_application = 'EHG'
  OR target_application LIKE 'venture_%'
);

-- Set default value for existing records (all current retrospectives are from EHG_Engineer)
UPDATE retrospectives
SET target_application = 'EHG_engineer'
WHERE target_application IS NULL;

-- Make column NOT NULL after backfilling
ALTER TABLE retrospectives
ALTER COLUMN target_application SET NOT NULL;

-- Add index for filtering performance
CREATE INDEX idx_retrospectives_target_application
ON retrospectives(target_application);

COMMENT ON COLUMN retrospectives.target_application IS 'Target application context: EHG_engineer (management dashboard), EHG (customer app), or venture_* (venture-specific apps)';

-- ============================================================================
-- US-002: Multi-Application Context - Learning Category Field
-- ============================================================================

-- Add learning_category column
ALTER TABLE retrospectives
ADD COLUMN learning_category TEXT;

-- Add constraint for 9 valid categories
ALTER TABLE retrospectives
ADD CONSTRAINT check_learning_category
CHECK (
  learning_category IN (
    'APPLICATION_ISSUE',
    'PROCESS_IMPROVEMENT',
    'TESTING_STRATEGY',
    'DATABASE_SCHEMA',
    'DEPLOYMENT_ISSUE',
    'PERFORMANCE_OPTIMIZATION',
    'USER_EXPERIENCE',
    'SECURITY_VULNERABILITY',
    'DOCUMENTATION'
  )
);

-- Add applies_to_all_apps column (auto-populated by trigger)
ALTER TABLE retrospectives
ADD COLUMN applies_to_all_apps BOOLEAN DEFAULT FALSE;

-- Set default learning_category for existing records based on content analysis
-- (This is a simple heuristic - the backfill script will refine these)
UPDATE retrospectives
SET learning_category =
  CASE
    WHEN title ILIKE '%process%' OR title ILIKE '%workflow%' THEN 'PROCESS_IMPROVEMENT'
    WHEN title ILIKE '%test%' OR title ILIKE '%qa%' THEN 'TESTING_STRATEGY'
    WHEN title ILIKE '%database%' OR title ILIKE '%schema%' OR title ILIKE '%migration%' THEN 'DATABASE_SCHEMA'
    WHEN title ILIKE '%deploy%' OR title ILIKE '%ci/cd%' THEN 'DEPLOYMENT_ISSUE'
    WHEN title ILIKE '%performance%' OR title ILIKE '%slow%' THEN 'PERFORMANCE_OPTIMIZATION'
    WHEN title ILIKE '%security%' OR title ILIKE '%auth%' THEN 'SECURITY_VULNERABILITY'
    WHEN title ILIKE '%docs%' OR title ILIKE '%documentation%' THEN 'DOCUMENTATION'
    WHEN title ILIKE '%ui%' OR title ILIKE '%ux%' OR title ILIKE '%user%' THEN 'USER_EXPERIENCE'
    ELSE 'APPLICATION_ISSUE'
  END
WHERE learning_category IS NULL;

-- Make column NOT NULL after backfilling
ALTER TABLE retrospectives
ALTER COLUMN learning_category SET NOT NULL;

-- Add index for category filtering
CREATE INDEX idx_retrospectives_learning_category
ON retrospectives(learning_category);

-- Add index for cross-application queries
CREATE INDEX idx_retrospectives_applies_to_all
ON retrospectives(applies_to_all_apps)
WHERE applies_to_all_apps = TRUE;

COMMENT ON COLUMN retrospectives.learning_category IS 'Type of learning: APPLICATION_ISSUE, PROCESS_IMPROVEMENT, TESTING_STRATEGY, DATABASE_SCHEMA, DEPLOYMENT_ISSUE, PERFORMANCE_OPTIMIZATION, USER_EXPERIENCE, SECURITY_VULNERABILITY, DOCUMENTATION';
COMMENT ON COLUMN retrospectives.applies_to_all_apps IS 'Auto-populated: TRUE for PROCESS_IMPROVEMENT category, FALSE otherwise';

-- ============================================================================
-- US-003: Code Traceability - Link Retrospectives to Source Code
-- ============================================================================

-- Add code traceability array columns
ALTER TABLE retrospectives
ADD COLUMN related_files TEXT[] DEFAULT '{}',
ADD COLUMN related_commits TEXT[] DEFAULT '{}',
ADD COLUMN related_prs TEXT[] DEFAULT '{}',
ADD COLUMN affected_components TEXT[] DEFAULT '{}',
ADD COLUMN tags TEXT[] DEFAULT '{}';

-- Create GIN indexes for efficient array operations
CREATE INDEX idx_retrospectives_related_files_gin
ON retrospectives USING GIN (related_files);

CREATE INDEX idx_retrospectives_related_commits_gin
ON retrospectives USING GIN (related_commits);

CREATE INDEX idx_retrospectives_related_prs_gin
ON retrospectives USING GIN (related_prs);

CREATE INDEX idx_retrospectives_affected_components_gin
ON retrospectives USING GIN (affected_components);

CREATE INDEX idx_retrospectives_tags_gin
ON retrospectives USING GIN (tags);

COMMENT ON COLUMN retrospectives.related_files IS 'Array of file paths related to this retrospective (e.g., ["src/components/Auth.tsx", "scripts/migrate.js"])';
COMMENT ON COLUMN retrospectives.related_commits IS 'Array of git commit SHAs related to this retrospective (e.g., ["abc123f", "def456g"])';
COMMENT ON COLUMN retrospectives.related_prs IS 'Array of PR URLs or numbers related to this retrospective (e.g., ["#123", "https://github.com/org/repo/pull/456"])';
COMMENT ON COLUMN retrospectives.affected_components IS 'Array of component names affected by this retrospective (e.g., ["Authentication", "Database", "API"])';
COMMENT ON COLUMN retrospectives.tags IS 'Array of categorization tags (e.g., ["supabase", "react", "performance", "critical"])';

-- ============================================================================
-- Create trigger function for auto-population and validation
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_populate_retrospective_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-populate applies_to_all_apps for PROCESS_IMPROVEMENT category
  IF NEW.learning_category = 'PROCESS_IMPROVEMENT' THEN
    NEW.applies_to_all_apps := TRUE;
  ELSE
    NEW.applies_to_all_apps := FALSE;
  END IF;

  -- Validation: APPLICATION_ISSUE must have at least one affected_component
  IF NEW.learning_category = 'APPLICATION_ISSUE' AND
     (NEW.affected_components IS NULL OR array_length(NEW.affected_components, 1) IS NULL) THEN
    RAISE EXCEPTION 'APPLICATION_ISSUE retrospectives must have at least one affected_component'
      USING HINT = 'Add affected components like ["Authentication", "Database", "API"]';
  END IF;

  -- Validation: CRITICAL/HIGH severity must have at least one tag
  IF NEW.severity_level IN ('CRITICAL', 'HIGH') AND
     (NEW.tags IS NULL OR array_length(NEW.tags, 1) IS NULL) THEN
    RAISE EXCEPTION 'CRITICAL and HIGH severity retrospectives must have at least one tag'
      USING HINT = 'Add tags like ["urgent", "security", "performance"]';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_auto_populate_retrospective_fields ON retrospectives;

CREATE TRIGGER trigger_auto_populate_retrospective_fields
BEFORE INSERT OR UPDATE ON retrospectives
FOR EACH ROW
EXECUTE FUNCTION auto_populate_retrospective_fields();

COMMENT ON FUNCTION auto_populate_retrospective_fields() IS 'SD-RETRO-ENHANCE-001: Auto-populate applies_to_all_apps and validate code traceability requirements';

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify all columns were added
DO $$
DECLARE
  missing_columns TEXT[];
  required_columns TEXT[] := ARRAY[
    'target_application',
    'learning_category',
    'applies_to_all_apps',
    'related_files',
    'related_commits',
    'related_prs',
    'affected_components',
    'tags'
  ];
  col TEXT;
BEGIN
  FOREACH col IN ARRAY required_columns LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'retrospectives'
        AND column_name = col
    ) THEN
      missing_columns := array_append(missing_columns, col);
    END IF;
  END LOOP;

  IF array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: missing columns %', missing_columns;
  END IF;

  RAISE NOTICE 'Migration verification passed: All 8 columns added successfully';
END $$;

-- ============================================================================
-- Re-enable quality validation trigger after migration
-- ============================================================================
ALTER TABLE retrospectives ENABLE TRIGGER validate_retrospective_quality_trigger;

COMMIT;

-- ============================================================================
-- Post-Migration Notes
-- ============================================================================

-- Next Steps:
-- 1. Update generate-comprehensive-retrospective.js to populate new fields
-- 2. Run backfill script for 97 existing retrospectives (US-007)
-- 3. Test constraint enforcement with invalid values
-- 4. Verify trigger auto-population logic

-- Rollback Instructions:
-- DROP TRIGGER IF EXISTS trigger_auto_populate_retrospective_fields ON retrospectives;
-- DROP FUNCTION IF EXISTS auto_populate_retrospective_fields();
-- DROP INDEX IF EXISTS idx_retrospectives_tags_gin;
-- DROP INDEX IF EXISTS idx_retrospectives_affected_components_gin;
-- DROP INDEX IF EXISTS idx_retrospectives_related_prs_gin;
-- DROP INDEX IF EXISTS idx_retrospectives_related_commits_gin;
-- DROP INDEX IF EXISTS idx_retrospectives_related_files_gin;
-- DROP INDEX IF EXISTS idx_retrospectives_applies_to_all;
-- DROP INDEX IF EXISTS idx_retrospectives_learning_category;
-- DROP INDEX IF EXISTS idx_retrospectives_target_application;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS tags;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS affected_components;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS related_prs;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS related_commits;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS related_files;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS applies_to_all_apps;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS learning_category;
-- ALTER TABLE retrospectives DROP COLUMN IF EXISTS target_application;
