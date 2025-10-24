-- ============================================================================
-- ADD sd_type COLUMN TO strategic_directives_v2
-- ============================================================================
-- Purpose: Enable type-aware validation for infrastructure SDs
-- SD: SD-INFRA-VALIDATION
-- Date: 2025-10-22
-- ============================================================================
-- MIGRATION: Add sd_type column with CHECK constraint
-- DEFAULT: 'feature' for backward compatibility
-- ALLOWED: feature, infrastructure, database, security, documentation
-- ============================================================================

-- Add sd_type column with default value
ALTER TABLE strategic_directives_v2
ADD COLUMN IF NOT EXISTS sd_type VARCHAR(50) NOT NULL DEFAULT 'feature';

-- Add CHECK constraint to validate sd_type values
ALTER TABLE strategic_directives_v2
DROP CONSTRAINT IF EXISTS sd_type_check;

ALTER TABLE strategic_directives_v2
ADD CONSTRAINT sd_type_check
CHECK (sd_type IN ('feature', 'infrastructure', 'database', 'security', 'documentation'));

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_strategic_directives_v2_sd_type
ON strategic_directives_v2(sd_type);

-- Add comment for documentation
COMMENT ON COLUMN strategic_directives_v2.sd_type IS 'SD type classification: feature (UI/UX), infrastructure (CI/CD, tooling), database (schema), security (auth/RLS), documentation';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Verify column exists:
-- SELECT column_name, data_type, column_default FROM information_schema.columns
-- WHERE table_name = 'strategic_directives_v2' AND column_name = 'sd_type';
--
-- Verify constraint:
-- SELECT constraint_name, check_clause FROM information_schema.check_constraints
-- WHERE constraint_name = 'sd_type_check';
--
-- Verify all existing SDs have default value:
-- SELECT id, sd_type FROM strategic_directives_v2 WHERE sd_type IS NULL;
-- (Should return 0 rows)
-- ============================================================================
